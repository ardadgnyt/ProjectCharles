// Codex app-server process: start, JSON-RPC session, threads, turns and quota reads.
const { EventEmitter } = require('node:events');
// Codex takes up to 1 048 576 characters of input text per turn; Charles stays below it.
const MAX_TURN_TEXT = 900000;
const fs = require('node:fs');
const path = require('node:path');
const { Rpc } = require('./rpc.cjs');
const {
  APPROVALS,
  QUESTIONS,
  approvalReply,
  questionReply,
  gptEffort,
  gptEffortLabel,
  threadParams,
} = require('../core/policy.cjs');

function launchSpec(root) {
  // Optional explicit executable override, never interpreted as a shell command.
  if (process.env.CHARLES_CODEX_EXE) {
    const p = process.env.CHARLES_CODEX_EXE;
    if (
      !path.isAbsolute(p) ||
      !fs.existsSync(p) ||
      (process.platform === 'win32' && !p.toLowerCase().endsWith('.exe'))
    )
      throw new Error('CHARLES_CODEX_EXE mevcut bir codex.exe tam yolu olmalı.');
    return { command: p, args: ['app-server'] };
  }
  if (process.platform === 'win32' && ['x64', 'arm64'].includes(process.arch)) {
    const triple = process.arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
    const bin = path.join(
      root,
      'node_modules',
      '@openai',
      `codex-win32-${process.arch}`,
      'vendor',
      triple,
      'bin',
      'codex.exe',
    );
    if (fs.existsSync(bin)) return { command: bin, args: ['app-server'] };
  }
  const script = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (!fs.existsSync(script)) throw new Error('Codex bulunamadı. Önce npm ci çalıştırın.');
  return { command: process.execPath, args: [script, 'app-server'] };
}
class Agent extends EventEmitter {
  constructor(root, launch = launchSpec) {
    super();
    this.root = root;
    this.launch = launch;
    this.rpc = null;
    this.ready = false;
    this.connecting = false;
    this.busy = false;
    this.threadId = null;
    this.turnId = null;
    this.cwd = null;
    this.model = null;
    this.requests = new Map();
    this.items = new Map();
    this.loginId = null;
  }
  publish(type, data) {
    this.emit('event', { type, data });
  }
  async connect() {
    if (this.ready) return this.account();
    if (this.connectPromise) return this.connectPromise;
    this.connecting = true;
    this.connectPromise = (async () => {
      try {
        const spec = this.launch(this.root);
        const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
        // Personal client: use the managed ChatGPT login, not an inherited API key.
        delete env.OPENAI_API_KEY;
        delete env.CODEX_API_KEY;
        this.rpc = new Rpc(spec.command, spec.args, { cwd: this.root, env });
        this.rpc.on('notification', (msg) => this.notification(msg));
        this.rpc.on('request', (msg) => this.serverRequest(msg));
        this.rpc.on('closed', (reason) => {
          this.ready = false;
          this.busy = false;
          this.threadId = null;
          this.turnId = null;
          this.requests.clear();
          this.publish('disconnected', reason);
        });
        await this.rpc.request('initialize', {
          clientInfo: {
            name: 'charles_personal',
            title: 'Charles Personal',
            version: '2.2.4',
          },
        });
        this.rpc.send({ method: 'initialized', params: {} });
        this.ready = true;
        const account = await this.account();
        this.publish('connected', {});
        return account;
      } catch (e) {
        this.rpc?.stop();
        throw e;
      } finally {
        this.connecting = false;
        this.connectPromise = null;
      }
    })();
    return this.connectPromise;
  }
  requireReady() {
    if (!this.ready) throw new Error('Önce Codex’e bağlanın.');
  }
  async usage() {
    this.requireReady();
    return require('../usage/codex-usage.cjs').usageSnapshot(
      await this.rpc.request('account/rateLimits/read', undefined, 15000),
    );
  }
  async account() {
    this.requireReady();
    const r = await this.rpc.request('account/read', { refreshToken: false });
    // No auth tokens or account identifiers are sent to the renderer.
    const result = {
      signedIn: r.account?.type === 'chatgpt',
      plan: r.account?.planType || '',
      type: r.account?.type || null,
    };
    this.signedIn = result.signedIn;
    this.publish('account', result);
    return result;
  }
  async login() {
    this.requireReady();
    if (this.busy) throw new Error('Önce çalışan işi durdurun.');
    if (this.loginId) await this.rpc.request('account/login/cancel', { loginId: this.loginId });
    const r = await this.rpc.request('account/login/start', {
      type: 'chatgpt',
    });
    this.loginId = r.loginId;
    return { url: r.authUrl };
  }
  async models() {
    this.requireReady();
    if (!this.signedIn) return [];
    const models = [];
    let cursor;
    do {
      const r = await this.rpc.request('model/list', {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      models.push(...r.data);
      cursor = r.nextCursor;
    } while (cursor && models.length < 500);
    // v0.9.6: each model offers exactly the levels Codex lists for it
    // (supportedReasoningEfforts); the id never changes between levels — the level travels with
    // the turn as `effort`. A model that lists none is locked on "Otomatik".
    this.effortsByModel = new Map();
    return models
      .map((m) => {
        const values = [
          ...new Set(
            (Array.isArray(m.supportedReasoningEfforts) ? m.supportedReasoningEfforts : [])
              .map((o) => (typeof o === 'string' ? o : o?.reasoningEffort))
              .filter((v) => typeof v === 'string' && gptEffort(v) === v),
          ),
        ];
        this.effortsByModel.set(m.model, values);
        return {
          id: m.model,
          name: m.displayName || m.model,
          isDefault: m.isDefault,
          ...(values.length
            ? { effort: '', efforts: values.map((value) => ({ value, label: gptEffortLabel(value), id: m.model })) }
            : {}),
        };
      });
  }
  reset() {
    if (this.busy || this.requests.size)
      throw new Error('Yeni konuşmadan önce çalışan işi durdurun.');
    this.threadId = null;
    this.turnId = null;
    this.items.clear();
  }
  async send({
    cwd,
    model,
    prompt,
    mode = 'project',
    attachments = [],
    access = 'ask',
    task = '',
    effort = '',
  }) {
    this.requireReady();
    const selectedTask = require('../core/task-mode.cjs').taskMode(task);
    if (this.busy) throw new Error('Bir iş zaten çalışıyor.');
    if (!['chat', 'project'].includes(mode)) throw new Error('Geçersiz çalışma modu.');
    // v0.9.11: the limit is for the whole turn Charles builds (the chat so far, the project, the
    // memory and the new message), not for what the user typed (main.cjs checks that). At 100 000
    // characters a long chat — its history JSON-quoted, formulas' backslashes doubled — could no
    // longer be sent after a restart: every message failed with "Bir adım gerekiyor".
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('İstek boş.');
    if (prompt.length > MAX_TURN_TEXT)
      throw new Error('Bu mesaj sohbet geçmişiyle birlikte çok uzun. Yeni bir sohbet açıp devam et.');
    if (model !== null && model !== undefined && typeof model !== 'string')
      throw new Error('Geçersiz model.');
    // v0.9.6: the level the panel chose ('' = Otomatik, the account's own default). It is
    // checked against the model's own list (model/list) before it can reach Codex.
    let level = gptEffort(effort);
    if (level === null) throw new Error('Bu model için geçerli bir efor seçimi değil.');
    if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory())
      throw new Error('Geçerli bir proje klasörü seçin.');
    this.busy = true;
    try {
      const a = await this.account();
      this.hasAttachments = attachments.length > 0;
      if (!a.signedIn)
        throw new Error(
          'ChatGPT hesabıyla giriş gerekli. API anahtarı modu bu uygulamada kullanılmaz.',
        );
      if (!model) model = (await this.models()).find((m) => m.isDefault)?.id || null;
      if (level) {
        if (!this.effortsByModel?.has(model)) await this.models().catch(() => []);
        if (!(this.effortsByModel?.get(model) || []).includes(level))
          throw new Error('Bu model için geçerli bir efor seçimi değil.');
      }
      if (
        !this.threadId ||
        this.cwd !== cwd ||
        this.mode !== mode ||
        this.access !== access ||
        this.task !== task
      ) {
        const r = await this.rpc.request(
          'thread/start',
          {
            ...threadParams(cwd, model, mode, access),
            ...(selectedTask.config ? { config: selectedTask.config } : {}),
          },
          60000,
        );
        this.threadId = r.thread.id;
        this.cwd = cwd;
        this.model = model;
        this.mode = mode;
        this.access = access;
        this.task = task;
        this.items.clear();
        this.publish('thread', { id: this.threadId, cwd });
      }
      this.model = model;
      const r = await this.rpc.request(
        'turn/start',
        {
          threadId: this.threadId,
          ...(model ? { model } : {}),
          // v0.9.6: Codex takes the level per turn (TurnStartParams.effort); "Otomatik" sends
          // none and the model's own default applies.
          ...(level ? { effort: level } : {}),
          input: [
            {
              type: 'text',
              text: (selectedTask.instruction ? selectedTask.instruction + '\n\n' : '') + prompt,
              text_elements: [],
            },
            ...attachments,
          ],
        },
        60000,
      );
      // A very short turn may have completed before this response arrives.
      if (this.busy) this.turnId = r.turn.id;
      return { threadId: this.threadId, turnId: r.turn.id };
    } catch (e) {
      this.busy = false;
      throw e;
    }
  }
  // v0.7.0: add an instruction to the running turn (Codex app-server turn/steer).
  async steer(text) {
    this.requireReady();
    // v0.7.1 SpecialBeta: right after sending, turn/start may not have answered yet; wait a
    // moment for the turn id instead of refusing (the message used to fall back to the queue).
    for (let i = 0; this.busy && !this.turnId && i < 40; i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (!this.busy || !this.turnId || !this.threadId) throw Error('Şu an çalışan bir iş yok.');
    const input = [{ type: 'text', text, text_elements: [] }];
    const send = () =>
      this.rpc.request(
        'turn/steer',
        { threadId: this.threadId, expectedTurnId: this.turnId, input },
        15000,
      );
    let r;
    try {
      r = await send();
    } catch (e) {
      // The turn id can change between our last event and the request (a new turn started);
      // try once more with the newest id before giving up.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!this.busy || !this.turnId) throw e;
      r = await send();
    }
    return { turnId: r?.turnId || this.turnId };
  }
  async interrupt() {
    this.requireReady();
    if (!this.turnId) {
      if (this.busy) {
        this.rpc.stop();
        return;
      }
      return;
    }
    await this.rpc.request('turn/interrupt', {
      threadId: this.threadId,
      turnId: this.turnId,
    });
  }
  notification(msg) {
    const p = msg.params || {};
    if (p.threadId && p.threadId !== this.threadId) return;
    if (msg.method === 'account/login/completed') {
      this.loginId = null;
      this.publish('login', { success: p.success, error: p.error });
      if (p.success) this.account().catch((e) => this.publish('error', e.message));
      return;
    }
    if (msg.method === 'account/rateLimits/updated') {
      this.publish('usage-changed', {});
      return;
    }
    if (msg.method === 'account/updated') {
      this.account().catch((e) => this.publish('error', e.message));
      return;
    }
    if (msg.method === 'serverRequest/resolved') {
      this.requests.delete(p.requestId);
      this.publish('resolved', { id: p.requestId });
      return;
    }
    if (msg.method === 'turn/started') {
      this.busy = true;
      this.turnId = p.turn.id;
    }
    if (msg.method === 'item/started' || msg.method === 'item/completed')
      this.items.set(p.item.id, p.item);
    if (msg.method === 'turn/completed') {
      this.busy = false;
      this.turnId = null;
      for (const id of this.requests.keys()) this.publish('resolved', { id });
      this.requests.clear();
    }
    const allowed = new Set([
      'turn/started',
      'turn/completed',
      'item/started',
      'item/completed',
      'item/agentMessage/delta',
      'item/commandExecution/outputDelta',
      'turn/diff/updated',
      'turn/plan/updated',
      'error',
    ]);
    if (allowed.has(msg.method)) this.publish('agent', { method: msg.method, params: p });
  }
  serverRequest(msg) {
    if (
      this.access !== 'full' &&
      this.mode === 'chat' &&
      APPROVALS.has(msg.method) &&
      !(this.hasAttachments && msg.method === 'item/commandExecution/requestApproval')
    ) {
      this.rpc.send({ id: msg.id, result: { decision: 'decline' } });
      this.publish('notice', 'Dosya ve komut işlemleri için Proje moduna geçebilirsin.');
      return;
    }
    if (msg.params?.threadId && msg.params.threadId !== this.threadId) {
      this.rpc.send({
        id: msg.id,
        error: { code: -32602, message: 'Thread mismatch' },
      });
      return;
    }
    if (APPROVALS.has(msg.method) || QUESTIONS.has(msg.method)) {
      this.requests.set(msg.id, msg);
      this.publish('request', {
        ...msg,
        item: this.items.get(msg.params.itemId) || null,
      });
      return;
    }
    // Unknown or broader permission requests are never implicitly approved.
    if (msg.method === 'item/permissions/requestApproval')
      this.rpc.send({ id: msg.id, result: { permissions: {}, scope: 'turn' } });
    else if (msg.method === 'mcpServer/elicitation/request')
      this.rpc.send({
        id: msg.id,
        result: { action: 'decline', content: null },
      });
    else
      this.rpc.send({
        id: msg.id,
        error: {
          code: -32601,
          message: 'Unsupported server request in personal client',
        },
      });
    this.publish('notice', `Bu istek türü desteklenmediği için izin verilmedi: ${msg.method}`);
  }
  reply({ id, decision, answers }) {
    this.requireReady();
    const request = this.requests.get(id);
    if (!request) throw new Error('Bu istek artık beklemiyor.');
    const result = QUESTIONS.has(request.method)
      ? questionReply(request, answers)
      : approvalReply(request, decision);
    this.rpc.send({ id, result });
    this.requests.delete(id);
    this.publish('resolved', { id });
  }
  stop() {
    this.rpc?.stop();
  }
}
module.exports = { Agent, launchSpec };
