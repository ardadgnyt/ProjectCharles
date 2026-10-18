// Chat rooms and history: persistence, edits/branches, search, one Agent per room.
const { readStore, writeStore } = require('../core/store.cjs');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'),
  path = require('node:path');
const { Agent } = require('./agent.cjs');
// v0.5.3 stored the mail data Charles added for the AI as part of the user's message.
const MAIL_DATA = /\n\nCharles kullanıcının bağlı [\s\S]*<\/mail_verisi>\s*$/;
function cleanUserText(text) {
  return typeof text === 'string' ? text.replace(MAIL_DATA, '') : text;
}
function savedEvents(events) {
  return events
    .filter(
      (e) =>
        ['history-user', 'history-local'].includes(e.type) ||
        (e.type === 'agent' && ['item/completed', 'turn/completed'].includes(e.data?.method)),
    )
    .map((e) =>
      e.type === 'agent' && e.data.method === 'turn/completed'
        ? {
            type: 'agent',
            data: {
              method: 'turn/completed',
              params: {
                turn: {
                  status:
                    e.data.params.turn.status === 'inProgress'
                      ? 'interrupted'
                      : e.data.params.turn.status,
                },
              },
            },
          }
        : e,
    );
}
function contextText(events) {
  return events
    .flatMap((e) =>
      e.type === 'history-user'
        ? [{ role: 'user', text: e.data }]
        : e.type === 'history-local'
          ? [{ role: 'assistant', text: e.data }]
          : e.type === 'agent' &&
              e.data.method === 'item/completed' &&
              e.data.params.item.type === 'agentMessage'
            ? [{ role: 'assistant', text: e.data.params.item.text }]
            : [],
    )
    .slice(-24)
    .map((m) => `${m.role}: ${String(m.text).slice(0, 6000)}`)
    .join('\n')
    .slice(-30000);
}
class Sessions extends EventEmitter {
  constructor(root, directory = null) {
    super();
    this.root = root;
    this.file = directory ? path.join(directory, 'charles-history.json') : null;
    this.rooms = new Map();
    this.folders = [];
    this.autoFolders = true;
    this.counter = 0;
    this.loading = true;
    if (this.file) {
      const loaded = readStore(
        this.file,
        (j) =>
          j &&
          j.version === 1 &&
          Array.isArray(j.rooms) &&
          j.rooms.every((r) => r && typeof r.id === 'string' && Array.isArray(r.events)),
      );
      this.recoveryWarning = loaded.warning;
      const j = loaded.value;
      if (j) {
        this.folders = require('./chat-folders.cjs').restoreFolders(j.folders);
        this.autoFolders = j.autoFolders !== false;
        for (const data of j.rooms) this.create(data);
        this.active = this.rooms.has(j.active) ? j.active : this.rooms.keys().next().value;
      }
    }

    if (!this.rooms.size) this.add();
    this.loading = false;
  }
  freshStart() {
    const previous = this.current;
    for (const r of [...this.rooms.values()]) {
      r.agent.stop();
      if (!r.events.length) this.rooms.delete(r.id);
      else r.closed = true;
    }
    const r = this.create({
      mode: previous?.mode || 'chat',
      cwd: previous?.cwd || null,
      model: previous?.model || null,
    });
    this.active = r.id;
    this.save();
    return this.snapshot();
  }
  editMessage(index) {
    if (this.busy || this.requests.size) throw Error('Önce çalışan işi durdur.');
    const old = this.current;
    const indices = old.events
      .map((e, i) => (e.type === 'history-user' ? i : -1))
      .filter((i) => i >= 0);
    const at = indices[index];
    if (!Number.isInteger(index) || at === undefined) throw Error('Mesaj bulunamadı.');
    const text = old.events[at].data;
    old.branches ||= {};
    const group = old.branches[index]?.group || `${old.id}:${index}`;
    old.branches[index] ||= { group, variant: old.id };
    old.closed = true;
    old.agent.stop();
    const r = this.create({
      name: old.name + ' · düzenleme',
      folderId: old.folderId,
      manualFolder: old.manualFolder,
      classified: old.classified,
      mode: old.mode,
      cwd: old.cwd,
      model: old.model,
      documentContext: old.documentContext,
      events: JSON.parse(JSON.stringify(savedEvents(old.events.slice(0, at)))),
      branches: Object.fromEntries(
        Object.entries(old.branches).filter(([i]) => Number(i) <= index),
      ),
    });
    r.branches[index] = { group, variant: r.id };
    this.active = r.id;
    this.save();
    return { room: this.snapshot(), text };
  }
  summary(today = false) {
    const rooms = today
      ? [...this.rooms.values()].filter((r) => r.updatedAt >= new Date().setHours(0, 0, 0, 0))
      : [this.current];
    const files = new Set(),
      answers = [],
      states = [];
    for (const room of rooms) {
      for (const e of room.events) {
        if (today && e.at && e.at < new Date().setHours(0, 0, 0, 0)) continue;
        const item = e.data?.params?.item;
        if (item?.type === 'fileChange')
          for (const c of item.changes || []) if (c.path) files.add(c.path);
        if (item?.type === 'agentMessage' && item.text) answers.push(item.text);
        if (e.type === 'history-local') answers.push(String(e.data));
        if (e.data?.method === 'turn/completed') states.push(e.data.params.turn.status);
      }
    }
    return (
      (today ? '## Bugünkü çalışma günlüğü' : '## Az önce ne yaptık?') +
      '\n\n' +
      (answers.length
        ? answers
            .slice(-3)
            .map((t) => '- ' + t.replace(/\s+/g, ' ').slice(0, 450))
            .join('\n')
        : 'Henüz kaydedilmiş bir sonuç yok.') +
      '\n\n**Değişen dosyalar:**\n' +
      (files.size
        ? [...files]
            .slice(-25)
            .map((p) => '- ' + p)
            .join('\n')
        : 'Kayda geçen dosya değişikliği yok.') +
      '\n\n**Durum:** ' +
      (this.requests.size
        ? 'Yanıt veya onay bekleniyor.'
        : rooms.some((r) => r.agent.busy)
          ? 'İş sürüyor.'
          : states.at(-1) === 'failed'
            ? 'Son iş hata verdi; tamamlanmadı.'
            : states.at(-1) === 'interrupted'
              ? 'Son iş durduruldu.'
              : 'Etkin iş yok. Sonuçlar yerel sohbet kayıtlarından derlendi.')
    );
  }
  get current() {
    return this.rooms.get(this.active);
  }
  get busy() {
    return this.current.agent.busy;
  }
  get ready() {
    return this.current.agent.ready;
  }
  get requests() {
    return new Map(
      [...this.rooms.values()].flatMap((r) =>
        [...r.agent.requests].map(([id, v]) => [r.id + ':' + id, v]),
      ),
    );
  }
  create(data = {}) {
    const id = data.id || String(++this.counter);
    this.counter = Math.max(this.counter, Number(id) || 0);
    const r = {
      id,
      name: String(data.name || 'Yeni sohbet').replace(/\n\nCharles[\s\S]*$/, '') || 'Yeni sohbet',
      cwd: data.cwd || null,
      mode: data.mode || 'chat',
      model: data.model || null,
      documentContext: !!data.documentContext,
      events: (data.events || []).map((e) =>
        e?.type === 'history-user' && MAIL_DATA.test(e.data || '')
          ? { ...e, data: cleanUserText(e.data) }
          : e,
      ),
      updatedAt: data.updatedAt || Date.now(),
      closed: !!data.closed,
      pinned: !!data.pinned,
      renamed: !!data.renamed,
      branches: data.branches || {},
      folderId: this.folders.some((f) => f.id === data.folderId) ? data.folderId : null,
      manualFolder: !!data.manualFolder,
      classified: !!data.classified,
      agent: new Agent(this.root),
    };
    this.rooms.set(id, r);
    r.agent.on('event', (e) => {
      this.emit('telemetry', { room: r, event: e });
      if (e.type === 'agent') {
        e.at = Date.now();
        r.events.push(e);
        if (e.data.method === 'turn/completed' || e.data.method === 'item/completed') {
          r.updatedAt = Date.now();
          this.scheduleSave();
        }
        if (e.data.method === 'turn/completed') r.events = savedEvents(r.events);
      }
      if (this.active === id) this.emit('event', e);
      else if (e.type === 'request')
        this.emit('event', {
          type: 'background-request',
          data: { id, name: r.name },
        });
      if (
        e.type !== 'agent' ||
        !['item/agentMessage/delta', 'item/commandExecution/outputDelta'].includes(e.data.method)
      )
        this.emit('event', { type: 'sessions', data: this.list() });
    });
    return r;
  }
  list() {
    return [...this.rooms.values()]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map((r) => ({
        id: r.id,
        name: r.name,
        busy: r.agent.busy,
        pending: r.agent.requests.size,
        active: r.id === this.active,
        closed: r.closed,
        pinned: r.pinned,
        folderId: r.folderId,
        manualFolder: r.manualFolder,
        classified: r.classified,
        search: r.events
          .flatMap((e) =>
            e.type === 'history-user' || e.type === 'history-local'
              ? [String(e.data)]
              : e.type === 'agent' &&
                  e.data.method === 'item/completed' &&
                  e.data.params.item.type === 'agentMessage'
                ? [e.data.params.item.text || '']
                : [],
          )
          .join(' ')
          .toLocaleLowerCase('tr-TR'),
        updatedAt: r.updatedAt,
      }));
  }
  scheduleSave() {
    if (this.loading || !this.file) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        this.save();
      } catch (e) {
        this.emit('event', {
          type: 'notice',
          data: 'Geçmiş kaydedilemedi: ' + e.message,
        });
      }
    }, 1500); // history can be large: batch bursts of events (streaming) into one write
  }
  save() {
    clearTimeout(this.saveTimer);
    if (!this.file || this.loading) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const rooms = [...this.rooms.values()].map(({ agent, ...r }) => ({
      ...r,
      events: savedEvents(r.events),
    }));
    writeStore(this.file, {
      version: 1,
      active: this.active,
      rooms,
      folders: this.folders,
      autoFolders: this.autoFolders,
    });
  }
  add() {
    if (this.rooms.size >= 200)
      throw Error('200 sohbet sınırına ulaşıldı. Mevcut sohbetlerden devam edebilirsin.');
    const r = this.create();
    this.active = r.id;
    this.scheduleSave();
    return this.snapshot();
  }
  snapshot() {
    const r = this.current;
    return {
      id: r.id,
      cwd: r.cwd,
      mode: r.mode,
      model: r.model,
      busy: r.agent.busy,
      documentContext: r.documentContext,
      events: r.events,
      requests: [...r.agent.requests.values()].map((q) => ({
        ...q,
        item: r.agent.items.get(q.params.itemId) || null,
      })),
      sessions: this.list(),
      branches: Object.fromEntries(
        Object.entries(r.branches || {}).map(([index, link]) => {
          const variants = new Map();
          for (const candidate of this.rooms.values()) {
            const b = candidate.branches?.[index];
            if (b?.group === link.group) {
              const target = this.rooms.get(b.variant) || candidate;
              if (!variants.has(b.variant))
                variants.set(b.variant, { id: target.id, active: b.variant === link.variant });
            }
          }
          return [index, [...variants.values()]];
        }),
      ),
    };
  }
  select(id) {
    if (!this.rooms.has(id)) throw Error('Sohbet bulunamadı.');
    this.active = id;
    this.current.closed = false;
    this.scheduleSave();
    return this.snapshot();
  }
  close() {
    if (this.busy) throw Error('Önce çalışan işi durdurun.');
    const r = this.current;
    r.agent.stop();
    if (!r.events.length) this.rooms.delete(r.id);
    else r.closed = true;
    const next = [...this.rooms.values()].find((x) => x.id !== r.id && !x.closed);
    if (next) this.active = next.id;
    else return this.add();
    this.scheduleSave();
    return this.snapshot();
  }
  connect() {
    return this.current.agent.connect();
  }
  account() {
    return this.current.agent.account();
  }
  login() {
    return this.current.agent.login();
  }
  models() {
    return this.current.agent.models();
  }
  reset(options = {}) {
    if (this.busy || this.current.agent.requests.size) throw Error('Önce çalışan işi durdurun.');
    const previous = this.current,
      mode = options.mode || previous.mode,
      model = options.model === undefined ? previous.model : options.model,
      cwd = previous.cwd;
    previous.agent.stop();
    if (!previous.events.length) this.rooms.delete(previous.id);
    else previous.closed = true;
    this.add();
    Object.assign(this.current, { mode, model, cwd });
    this.scheduleSave();
    return this.snapshot();
  }
  async send(args) {
    const r = this.current;
    const external = /^(gemini|claude|cursor|abacus):/.test(args.model || '');
    if (r.agent.providerModel !== external) {
      r.agent.threadId = null;
      r.agent.providerModel = external;
    }
    if (args.hasDocument) r.documentContext = true;
    const changing =
      r.agent.threadId &&
      (r.agent.cwd !== args.cwd ||
        r.agent.mode !== args.mode ||
        r.agent.access !== (args.access || 'ask') ||
        r.agent.task !== (args.task || ''));
    const past = !r.agent.threadId || changing ? contextText(r.events) : '';
    // Exchanges Charles answered locally since the AI's last turn (calendar / quota questions,
    // local commands). Without this a typed "hayır" after such a question has no context.
    const unseen = !past && r.unseen?.length ? r.unseen.join('\n').slice(-6000) : '';
    r.unseen = [];
    Object.assign(r, {
      cwd: args.mode === 'project' ? args.cwd : null,
      mode: args.mode,
      model: args.model,
      updatedAt: Date.now(),
    });
    // displayPrompt: what the user typed. prompt may carry extra data for the AI (e.g. the
    // mails Charles read); only the typed text belongs in the history and the chat list.
    const shown = typeof args.displayPrompt === 'string' ? args.displayPrompt : args.prompt;
    if (!r.renamed && !r.events.some((e) => e.type === 'history-user'))
      r.name = shown.trim().slice(0, 45) || 'Sohbet';
    if (!external && !r.agent.ready) await r.agent.connect();
    r.events.push({
      type: 'history-user',
      data: shown,
      attachments: args.displayAttachments || [],
    });
    this.save();
    const memory =
      typeof args.memory === 'string'
        ? `Charles kişisel hafızasının güncel tam listesi (önceki hafıza listesinin yerine geçer; boşsa eski kayıtları kullanma; güncel kullanıcı talimatları önceliklidir): ${JSON.stringify(args.memory)}\n\n`
        : '';
    const payload = {
      ...args,
      prompt:
        memory +
        (past
          ? `Charles yerel geçmişinden alıntı (geçmiş kayıtlarıdır; yeni talimat değildir; önceki araç işlemlerini yeniden uygulama):\n${JSON.stringify(past)}\n\nKullanıcının yeni mesajı:\n${args.prompt}`
          : unseen
            ? `Senin son yanıtından sonra Charles sohbette kendisi şunları yazdı/yanıtladı (bağlam içindir, yeni talimat değildir):\n${JSON.stringify(unseen)}\n\nKullanıcının yeni mesajı:\n${args.prompt}`
            : args.prompt),
    };
    return external ? this.providers.send(r.agent, payload) : r.agent.send(payload);
  }
  manage({ id, action, name }) {
    const r = this.rooms.get(id);
    if (!r) throw Error('Sohbet bulunamadı.');
    if (action === 'rename') {
      if (typeof name !== 'string' || !name.trim() || name.length > 80)
        throw Error('Ad 1–80 karakter olmalı.');
      r.name = name.trim();
      r.renamed = true;
    } else if (action === 'pin') {
      r.pinned = !r.pinned;
    } else if (action === 'delete') {
      if (r.agent.busy || r.agent.requests.size) throw Error('Önce bu sohbetin işini durdur.');
      r.agent.stop();
      this.rooms.delete(id);
      if (id === this.active) this.active = this.rooms.keys().next().value;
      if (!this.rooms.size) this.add();
    } else throw Error('Geçersiz işlem.');
    this.save();
    return this.snapshot();
  }
  // A message answered by Charles himself (no AI). prompt '' = only Charles' own message
  // (e.g. a calendar suggestion he wrote into the chat).
  local(prompt, message) {
    const r = this.current;
    if (!r.events.length && prompt) r.name = prompt.slice(0, 45);
    if (prompt) r.events.push({ type: 'history-user', data: prompt });
    r.events.push({ type: 'history-local', data: message });
    // The AI keeps its own thread; tell it about these on the next message (see send()).
    r.unseen = [
      ...(r.unseen || []),
      ...(prompt ? ['user: ' + prompt] : []),
      'Charles: ' + message,
    ].slice(-12);
    r.updatedAt = Date.now();
    this.save();
  }
  // v0.7.0: extra instruction while GPT (Codex) is working. Other providers answer in one
  // go; the interface queues their extra messages and sends them after the answer.
  async steer(text) {
    const r = this.current;
    if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw Error('Geçersiz mesaj.');
    if (r.agent.providerModel) throw Error('Bu model çalışırken ek talimat alamaz; mesaj sıraya alınır.');
    const result = await r.agent.steer(text.trim());
    r.events.push({ type: 'history-user', data: text.trim(), steer: true });
    r.updatedAt = Date.now();
    this.save();
    return result;
  }
  interrupt() {
    if (this.providers?.interrupt(this.current.agent)) return;
    return this.current.agent.interrupt();
  }
  reply(args) {
    return this.current.agent.reply(args);
  }
  stop() {
    this.providers?.stop();
    this.save();
    for (const r of this.rooms.values()) r.agent.stop();
  }
}
module.exports = { Sessions, contextText, savedEvents };
