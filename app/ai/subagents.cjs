'use strict';
// In-Charles Subagent Execution Engine.
//
// Coordinates bounded, observable background subagents across Charles's existing AI providers
// (gpt, gemini, claude, cursor, abacus, evren, copilot).
//
// Security & resource invariants:
//   - MAX_CONCURRENT = 3, MAX_DEPTH = 1 (no recursive spawning), MAX_RETRIES = 1, MAX_TASKS_PER_RUN = 6.
//   - Inherits and never escalates parent workspace/access boundaries; shell/command execution is
//     never granted to subagents; untrusted input forces chat-only read-free mode.
//   - Strips credentials/tokens/personal secrets from subagent context and fences subagent outputs
//     via app/core/untrusted.cjs so subagent output is never treated as user permission.
//   - Persists snapshots to subagents.json via app/core/store.cjs; on startup, any non-terminal
//     task (created/queued/running) is immediately reconciled to 'cancelled'.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { readStore, writeStore } = require('../core/store.cjs');
const { defuse, fence, SECURITY_RULE } = require('../core/untrusted.cjs');
const { Agent } = require('./agent.cjs');

const MAX_CONCURRENT = 3;
const MAX_DEPTH = 1;
const MAX_RETRIES = 1;
const MAX_TASKS_PER_RUN = 6;
const MAX_STORED_TASKS = 120;
const MAX_LOGS_PER_TASK = 50;
const DEFAULT_TIMEOUT_MS = 180000;
const RESTART_CANCEL_REASON = 'Uygulama yeniden başlatıldığı için durduruldu';
const SHUTDOWN_CANCEL_REASON = 'Uygulama kapatıldığı için durduruldu';

const VALID_PROVIDERS = ['gpt', 'gemini', 'claude', 'cursor', 'abacus', 'evren', 'copilot'];
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const SUBSCRIPTION_PREFIX = /^(gemini|claude|cursor|abacus|evren|copilot):/;

function providerFromModel(model, fallback = 'gpt') {
  const s = String(model || '').trim();
  const m = /^([a-z][a-z0-9_-]*):/i.exec(s);
  if (m && VALID_PROVIDERS.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  if (VALID_PROVIDERS.includes(s.toLowerCase())) return s.toLowerCase();
  return VALID_PROVIDERS.includes(fallback) ? fallback : 'gpt';
}

function normalizeModelForProvider(provider, model) {
  const p = VALID_PROVIDERS.includes(provider) ? provider : 'gpt';
  const m = String(model || '').trim();
  if (!m) {
    return p === 'gpt' ? null : `${p}:auto`;
  }
  if (p === 'gpt') {
    return SUBSCRIPTION_PREFIX.test(m) ? null : m === 'gpt' || m === 'auto' ? null : m;
  }
  if (m.startsWith(p + ':')) return m;
  if (!m.includes(':')) return `${p}:${m}`;
  return `${p}:auto`;
}

/** Strips accidental bearer tokens, API keys, or credential blocks from subagent prompts. */
function stripSensitiveContext(text) {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|ghp|gho|ghu|ghs|ghr|AIza)[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]')
    .replace(/(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]{8,}["']?/gi, '[REDACTED_CREDENTIAL]');
}

function cloneTask(task) {
  return {
    id: task.id,
    parentId: task.parentId,
    role: task.role,
    title: task.title,
    status: task.status,
    provider: task.provider,
    model: task.model,
    lastAction: task.lastAction,
    logs: Array.isArray(task.logs) ? task.logs.map((l) => ({ at: l.at, text: l.text, kind: l.kind })) : [],
    result: task.result ?? null,
    error: task.error ?? null,
    createdAt: task.createdAt,
    startedAt: task.startedAt ?? null,
    finishedAt: task.finishedAt ?? null,
    // v1.0.4: read back from subagents.json at start-up (made in an earlier run of Charles).
    // A chat created in this run can never own such a task (see src/chat/subagents-view.ts).
    restored: task.restored === true,
  };
}

// v1.0.4: the largest chat id taken from a file (Sessions uses the same bound)
const MAX_ROOM_ID = 1e9;

function validateStoreShape(data) {
  return Boolean(data && typeof data === 'object' && Array.isArray(data.tasks));
}

/**
 * v1.0.4: the highest numeric chat id any stored subagent task belongs to (0 when none).
 * Chat ids are a counter (app/ai/sessions.cjs); a chat that was never written to the history
 * (closed while its subagents ran, deleted, or lost at a shutdown) used to give its id to the
 * next new chat, which then showed that chat's subagents. Sessions starts counting above this.
 * Read-only: never repairs or rewrites the file (SubagentManager.load() does that).
 */
function highestTaskRoomId(userData) {
  if (!userData) return 0;
  let max = 0;
  // .tmp / .tmp-a: what a crash between store.cjs' renames can leave behind (readStore reads them too)
  for (const name of ['subagents.json', 'subagents.json.bak', 'subagents.json.tmp', 'subagents.json.tmp-a']) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(userData, name), 'utf8').replace(/^﻿/, ''));
      if (!validateStoreShape(data)) continue;
      for (const raw of data.tasks) {
        const n = Number(raw?.parentId);
        // a number no counter of Charles reaches (a damaged or edited file) is ignored, so the
        // counter can never run out of room to grow
        if (Number.isSafeInteger(n) && n <= MAX_ROOM_ID && n > max) max = n;
      }
    } catch {}
  }
  return max;
}

function describeAgentItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'webSearch') {
    return item.query ? `Web araması: ${String(item.query).slice(0, 80)}` : 'Web araması yapılıyor';
  }
  if (item.type === 'fileChange') {
    const first = item.changes?.[0]?.path;
    return first ? `Dosya inceleniyor: ${path.basename(String(first))}` : 'Dosya değişikliği inceleniyor';
  }
  if (item.type === 'commandExecution') {
    return item.command ? `Komut: ${String(item.command).slice(0, 80)}` : 'İşlem yürütülüyor';
  }
  if (item.type === 'mcpToolCall') {
    const cmd = String(item.command || item.tool || '').trim();
    if (item.tool === 'read_file' || item.tool === 'read_document') {
      return cmd ? `Okunuyor: ${cmd.slice(0, 80)}` : 'Belge okunuyor';
    }
    return cmd ? `Araç: ${cmd.slice(0, 80)}` : 'Araç çalıştırılıyor';
  }
  return null;
}

/**
 * Parses a structured subagent plan from text (JSON array/object, <alt_ajanlar>/<subagents> block,
 * or bulleted "Role: Task" lines). Returns up to MAX_TASKS_PER_RUN validated task specs.
 */
function parseSubagentPlan(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const raw = text.trim();

  const normalizeList = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const role = String(entry.role || entry.agent || entry.name || 'Alt Ajan').trim().slice(0, 60) || 'Alt Ajan';
      const title = String(entry.title || entry.task || entry.goal || entry.description || '').trim().slice(0, 160);
      const prompt = String(entry.prompt || entry.instructions || entry.detail || title).trim().slice(0, 12000);
      if (!title && !prompt) continue;
      const item = {
        role,
        title: title || prompt.slice(0, 120),
        prompt: prompt || title,
      };
      if (typeof entry.model === 'string' && entry.model.trim()) item.model = entry.model.trim();
      if (typeof entry.provider === 'string' && VALID_PROVIDERS.includes(entry.provider.trim().toLowerCase())) {
        item.provider = entry.provider.trim().toLowerCase();
      }
      out.push(item);
      if (out.length >= MAX_TASKS_PER_RUN) break;
    }
    return out;
  };

  // 1. Direct JSON or fenced JSON block
  const tagMatch = /<(?:alt_ajanlar|subagents)>([\s\S]*?)<\/(?:alt_ajanlar|subagents)>/i.exec(raw);
  const candidate = tagMatch ? tagMatch[1].trim() : raw;
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(candidate);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : candidate;

  if (jsonText.startsWith('[') || jsonText.startsWith('{')) {
    try {
      const parsed = JSON.parse(jsonText);
      const list = Array.isArray(parsed) ? parsed : parsed?.tasks || parsed?.subagents;
      const norm = normalizeList(list);
      if (norm.length) return norm;
    } catch {}
  }

  // 2. Bulleted or numbered role-task lines:
  //    - [Araştırmacı] Başlık: Detay
  //    - **Kod İnceleyici**: Başlık
  const lines = candidate.split(/\r?\n/);
  const bulletTasks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bracketed = /^(?:[-*•]|\d+[.)])\s*\[([^\]]{2,50})\]\s*(.+)$/.exec(trimmed);
    if (bracketed) {
      const role = bracketed[1].trim();
      const rest = bracketed[2].trim();
      const [head, ...tail] = rest.split(/\s*[:—–-]\s*/);
      const title = (head || rest).trim().slice(0, 160);
      const prompt = tail.length ? `${title}: ${tail.join(' - ').trim()}` : rest;
      if (title) bulletTasks.push({ role, title, prompt });
      if (bulletTasks.length >= MAX_TASKS_PER_RUN) break;
      continue;
    }
    const bolded = /^(?:[-*•]|\d+[.)])\s*\*\*([^*]{2,50})\*\*\s*[:—–-]\s*(.+)$/.exec(trimmed);
    if (bolded) {
      const role = bolded[1].trim();
      const rest = bolded[2].trim();
      const title = rest.slice(0, 160);
      if (title) bulletTasks.push({ role, title, prompt: rest });
      if (bulletTasks.length >= MAX_TASKS_PER_RUN) break;
    }
  }
  return bulletTasks;
}

/** Formats completed/settled subagent tasks into a fenced synthesis block for the main chat. */
function formatSubagentSummary(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return '';
  const blocks = tasks.map((t) => {
    const statusLabel =
      t.status === 'completed'
        ? 'Tamamlandı'
        : t.status === 'cancelled'
          ? 'Durduruldu'
          : t.status === 'failed'
            ? 'Başarısız'
            : t.status;
    const body =
      t.status === 'completed'
        ? defuse(String(t.result || '').trim(), 12000)
        : `Hata: ${defuse(String(t.error || 'Görev tamamlanamadı.'), 500)}`;
    return `[${t.role}] ${t.title} (${statusLabel})\n${body}`;
  });
  return fence('alt_ajan_sonuclari', blocks.join('\n\n---\n\n'), { max: 70000 });
}

class SubagentManager extends EventEmitter {
  constructor({
    root = path.resolve(__dirname, '..', '..'),
    userData = null,
    providers = null,
    makeAgent = (r) => new Agent(r),
    runner = null,
    now = Date.now,
    onUpdate = null,
  } = {}) {
    super();
    this.root = root;
    this.userData = userData;
    this.file = userData ? path.join(userData, 'subagents.json') : null;
    this.providers = providers;
    this.makeAgent = makeAgent;
    this.runner = runner;
    this.now = now;
    this.onUpdate = onUpdate;
    this.tasks = new Map();
    this.queue = [];
    this.active = new Map(); // taskId -> { cancel: fn, agent, timer }
    this.shuttingDown = false;
    this.load();
  }

  load() {
    if (!this.file) return;
    const { value } = readStore(this.file, validateStoreShape);
    if (!value || !Array.isArray(value.tasks)) return;
    let reconciled = false;
    const ts = this.now();
    for (const raw of value.tasks.slice(-MAX_STORED_TASKS)) {
      if (!raw || typeof raw.id !== 'string') continue;
      const task = {
        id: String(raw.id),
        parentId: String(raw.parentId || 'default'),
        role: String(raw.role || 'Alt Ajan').slice(0, 60),
        title: String(raw.title || 'Görev').slice(0, 160),
        status: String(raw.status || 'cancelled'),
        provider: VALID_PROVIDERS.includes(raw.provider) ? raw.provider : 'gpt',
        model: String(raw.model || 'gpt'),
        lastAction: String(raw.lastAction || ''),
        logs: Array.isArray(raw.logs)
          ? raw.logs.slice(-MAX_LOGS_PER_TASK).map((l) => ({
              at: Number(l?.at) || ts,
              text: String(l?.text || '').slice(0, 300),
              kind: String(l?.kind || 'info'),
            }))
          : [],
        result: typeof raw.result === 'string' ? raw.result : null,
        error: typeof raw.error === 'string' ? raw.error : null,
        createdAt: Number(raw.createdAt) || ts,
        startedAt: raw.startedAt ? Number(raw.startedAt) : null,
        finishedAt: raw.finishedAt ? Number(raw.finishedAt) : null,
        restored: true,
      };
      // Nothing is resumed: a task read back from disk is not running in this process, so one
      // that was still created/queued/running (quit, crash, power loss) becomes 'cancelled'.
      if (!TERMINAL_STATUSES.has(task.status)) {
        task.status = 'cancelled';
        task.error = RESTART_CANCEL_REASON;
        task.lastAction = RESTART_CANCEL_REASON;
        task.finishedAt = ts;
        task.logs.push({ at: ts, text: RESTART_CANCEL_REASON, kind: 'warn' });
        reconciled = true;
      }
      this.tasks.set(task.id, task);
    }
    if (reconciled) this.save();
  }

  save() {
    if (!this.file) return;
    try {
      // `restored` describes this run only (load() sets it again), so it is not written
      const all = [...this.tasks.values()].slice(-MAX_STORED_TASKS).map((t) => {
        const { restored, ...stored } = cloneTask(t);
        return stored;
      });
      writeStore(this.file, { version: 1, tasks: all });
    } catch {}
  }

  appendLog(task, text, kind = 'info') {
    const clean = String(text || '').trim().slice(0, 300);
    if (!clean) return;
    const at = this.now();
    task.lastAction = clean;
    task.logs.push({ at, text: clean, kind });
    if (task.logs.length > MAX_LOGS_PER_TASK) {
      task.logs.splice(0, task.logs.length - MAX_LOGS_PER_TASK);
    }
  }

  notify(changedTask = null) {
    this.save();
    const snapshot = this.list();
    const copy = changedTask ? cloneTask(changedTask) : null;
    try {
      this.onUpdate?.(snapshot, copy);
    } catch {}
    this.emit('update', snapshot, copy);
  }

  list(parentId = null) {
    const out = [];
    for (const task of this.tasks.values()) {
      if (parentId && task.parentId !== String(parentId)) continue;
      out.push(cloneTask(task));
    }
    return out;
  }

  get(taskId) {
    const t = this.tasks.get(String(taskId || ''));
    return t ? cloneTask(t) : null;
  }

  // v1.0.4: { keepRestored } leaves tasks from an earlier run alone (the open chat was made in this
  // run, so the tracker never showed them and "Clear finished" must not remove them either)
  clearFinished(parentId = null, { keepRestored = false } = {}) {
    let removed = 0;
    for (const [id, task] of this.tasks.entries()) {
      if (parentId && task.parentId !== String(parentId)) continue;
      if (keepRestored && task.restored) continue;
      if (TERMINAL_STATUSES.has(task.status)) {
        this.tasks.delete(id);
        removed++;
      }
    }
    if (removed) this.notify(null);
    return this.list(parentId);
  }

  buildSubagentPrompt(task, spec, { mode, access }) {
    const cleanPrompt = stripSensitiveContext(spec.prompt || task.title);
    const contextText = spec.context ? `\nBağlam:\n${ fence('baglam_verisi', stripSensitiveContext(spec.context), { max: 30000 }) }\n` : '';
    const boundary =
      `Sen Charles içinde çalışan odaklanmış bir alt ajansın.\n` +
      `Rolün: ${task.role}\n` +
      `Görevin: ${task.title}\n` +
      `Çalışma modu: ${mode === 'project' ? 'Proje (' + (access === 'ask' ? 'yalnızca okuma/planlama' : 'dosya inceleme') + ')' : 'Sohbet (araçsız)'}\n` +
      `Kurallar:\n` +
      `- Yalnızca sana verilen bu alt görevi tamamla ve bulgularını Türkçe, net ve öz olarak raporla.\n` +
      `- Yeni alt ajan başlatma, yetki yükseltme talep etme, kabuk/terminal komutu çalıştırma.\n` +
      `-${SECURITY_RULE}\n`;
    return `${boundary}${contextText}\nAlt Görev Talimatı:\n${cleanPrompt}`;
  }

  /**
   * Enqueues and runs a batch of subagent tasks (up to MAX_TASKS_PER_RUN = 6), executing at most
   * MAX_CONCURRENT = 3 at a time. Returns a Promise resolving to the settled task snapshots,
   * with `.tasks` (initial snapshots) and `.taskIds` attached immediately on the returned Promise.
   */
  run({
    parentId = 'default',
    tasks = [],
    provider = null,
    model = null,
    workspaceDir = null,
    mode = 'chat',
    access = 'ask',
    untrusted = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 0,
    depth = 0,
  } = {}) {
    if (this.shuttingDown) {
      throw Error('Uygulama kapatılıyor; yeni alt ajan başlatılamaz.');
    }
    if (Number(depth) >= MAX_DEPTH) {
      throw Error('Alt ajanlar kendi alt ajanlarını başlatamaz (maksimum derinlik sınırı: 1).');
    }
    if (!Array.isArray(tasks) || !tasks.length) {
      throw Error('Çalıştırılacak alt ajan görevi belirtilmedi.');
    }
    if (tasks.length > MAX_TASKS_PER_RUN) {
      throw Error(`Bir çalıştırmada en fazla ${MAX_TASKS_PER_RUN} alt ajan başlatılabilir.`);
    }

    // Enforce inherited permission boundaries: never escalate permissions.
    const safeMode = !untrusted && mode === 'project' && workspaceDir ? 'project' : 'chat';
    const safeAccess =
      !untrusted && safeMode === 'project' && (access === 'auto' || access === 'full')
        ? access
        : 'ask';
    const safeCwd = safeMode === 'project' && workspaceDir ? workspaceDir : this.root;
    const allowedRetries = Math.max(0, Math.min(MAX_RETRIES, Number(retries) || 0));

    const createdIds = [];
    const batchWaiters = [];

    for (const spec of tasks) {
      if (!spec || typeof spec !== 'object') continue;
      const role = String(spec.role || 'Alt Ajan').trim().slice(0, 60) || 'Alt Ajan';
      const title = String(spec.title || spec.prompt || 'Görev').trim().slice(0, 160) || 'Görev';
      const taskProvider = providerFromModel(spec.model || model, spec.provider || provider || 'gpt');
      const taskModel = normalizeModelForProvider(taskProvider, spec.model || model);
      const ts = this.now();
      const id = randomUUID();

      const task = {
        id,
        parentId: String(parentId || 'default'),
        role,
        title,
        status: 'created',
        provider: taskProvider,
        model: taskModel || 'gpt',
        lastAction: 'Görev oluşturuldu',
        logs: [{ at: ts, text: 'Görev oluşturuldu', kind: 'info' }],
        result: null,
        error: null,
        createdAt: ts,
        startedAt: null,
        finishedAt: null,
      };
      this.tasks.set(id, task);
      createdIds.push(id);
      this.notify(task);

      // Transition to queued
      task.status = 'queued';
      this.appendLog(task, 'Sırada bekliyor…', 'info');
      let resolveTask;
      const taskPromise = new Promise((r) => {
        resolveTask = r;
      });
      batchWaiters.push(taskPromise);

      this.queue.push({
        task,
        spec,
        mode: safeMode,
        access: safeAccess,
        cwd: safeCwd,
        timeoutMs: Math.max(1000, Number(spec.timeoutMs || timeoutMs) || DEFAULT_TIMEOUT_MS),
        retriesLeft: allowedRetries,
        resolve: resolveTask,
      });
      this.notify(task);
    }

    while (this.tasks.size > MAX_STORED_TASKS) {
      const oldest = [...this.tasks.values()].find((t) => TERMINAL_STATUSES.has(t.status));
      if (!oldest) break;
      this.tasks.delete(oldest.id);
    }

    this.pump();

    const allDone = Promise.all(batchWaiters).then((settled) => {
      const list = settled.map(cloneTask);
      Object.defineProperty(list, 'tasks', { value: list, enumerable: false });
      Object.defineProperty(list, 'summary', { value: formatSubagentSummary(list), enumerable: false });
      return list;
    });
    allDone.tasks = createdIds.map((id) => this.get(id)).filter(Boolean);
    allDone.taskIds = createdIds;
    return allDone;
  }

  pump() {
    if (this.shuttingDown) return;
    while (this.active.size < MAX_CONCURRENT && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job || job.task.status !== 'queued') {
        job?.resolve?.(job.task);
        continue;
      }
      void this.executeJob(job);
    }
  }

  async executeJob(job) {
    const { task, spec, mode, access, cwd, timeoutMs } = job;
    if (task.status !== 'queued') {
      job.resolve(task);
      return;
    }
    task.status = 'running';
    task.startedAt = this.now();
    this.appendLog(task, 'Çalışmaya başladı', 'info');
    this.notify(task);

    const runAttempt = async (attempt) => {
      if (attempt > 0) {
        this.appendLog(task, `Geçici hata sonrası yeniden deneniyor (${attempt}/${MAX_RETRIES})…`, 'warn');
        this.notify(task);
      }

      const controller = new AbortController();
      let activeAgent = null;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        if (activeAgent) {
          try {
            this.providers?.interrupt?.(activeAgent);
          } catch {}
          try {
            activeAgent.stop?.();
          } catch {}
        }
      }, timeoutMs);
      timer.unref?.();

      const handle = {
        controller,
        timer,
        get agent() {
          return activeAgent;
        },
        cancel: () => {
          controller.abort();
          if (activeAgent) {
            try {
              this.providers?.interrupt?.(activeAgent);
            } catch {}
            try {
              activeAgent.stop?.();
            } catch {}
          }
        },
      };
      this.active.set(task.id, handle);

      try {
        const prompt = this.buildSubagentPrompt(task, spec, { mode, access });
        const stepLogger = (actionText, kind = 'step') => {
          if (task.status !== 'running' || controller.signal.aborted) return;
          this.appendLog(task, actionText, kind);
          this.notify(task);
        };

        let answer;
        if (typeof this.runner === 'function') {
          answer = await this.runner({
            task: cloneTask(task),
            prompt,
            rawPrompt: spec.prompt || task.title,
            provider: task.provider,
            model: task.model === 'gpt' ? null : task.model,
            cwd,
            mode,
            access,
            signal: controller.signal,
            onAction: stepLogger,
          });
        } else {
          answer = await this.executeWithProvider({
            task,
            prompt,
            cwd,
            mode,
            access,
            signal: controller.signal,
            setAgent: (a) => {
              activeAgent = a;
            },
            onAction: stepLogger,
          });
        }

        if (controller.signal.aborted || task.status === 'cancelled') {
          if (timedOut) throw Error('Alt ajan yanıtı zaman aşımına uğradı.');
          throw Object.assign(Error(task.error || 'Kullanıcı tarafından durduruldu'), { cancelled: true });
        }

        const cleanAnswer = defuse(String(answer || '').trim(), 40000);
        if (!cleanAnswer) {
          throw Error('Alt ajan boş yanıt döndürdü.');
        }
        return cleanAnswer;
      } finally {
        clearTimeout(timer);
        if (activeAgent) {
          try {
            activeAgent.stop?.();
          } catch {}
        }
      }
    };

    let attempt = 0;
    while (true) {
      try {
        const output = await runAttempt(attempt);
        if (task.status === 'cancelled') break;
        task.status = 'completed';
        task.result = output;
        task.error = null;
        task.finishedAt = this.now();
        this.appendLog(task, 'Tamamlandı', 'result');
        break;
      } catch (e) {
        if (task.status === 'cancelled' || e?.cancelled) {
          if (task.status !== 'cancelled') {
            task.status = 'cancelled';
            task.error = e?.message || 'Kullanıcı tarafından durduruldu';
            task.finishedAt = this.now();
            this.appendLog(task, task.error, 'warn');
          }
          break;
        }
        if (attempt < job.retriesLeft) {
          attempt++;
          continue;
        }
        task.status = 'failed';
        task.error = String(e?.message || e || 'Alt ajan görevi başarısız oldu.').slice(0, 400);
        task.finishedAt = this.now();
        this.appendLog(task, `Hata: ${task.error}`, 'error');
        break;
      }
    }

    this.active.delete(task.id);
    this.notify(task);
    job.resolve(task);
    this.pump();
  }

  async executeWithProvider({ task, prompt, cwd, mode, access, signal, setAgent, onAction }) {
    const agent = this.makeAgent(this.root);
    setAgent(agent);
    let answer = '';
    let settled = false;

    const done = new Promise((resolve, reject) => {
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const succeed = (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      signal?.addEventListener?.(
        'abort',
        () => {
          try {
            this.providers?.interrupt?.(agent);
          } catch {}
          try {
            agent.stop?.();
          } catch {}
          fail(Object.assign(Error('Kullanıcı tarafından durduruldu'), { cancelled: true }));
        },
        { once: true },
      );

      agent.on('event', (e) => {
        if (e.type === 'error' || e.type === 'disconnected') {
          return fail(Error(typeof e.data === 'string' && e.data ? e.data : 'AI bağlantısı kurulamadı.'));
        }
        if (e.type === 'request') {
          // Never implicitly approve privilege escalations or external requests inside a subagent
          try {
            agent.reply?.({ id: e.data?.id, decision: 'decline' });
          } catch {}
          return;
        }
        if (e.type !== 'agent') return;
        const { method, params } = e.data || {};
        if (method === 'item/started' && params?.item) {
          const desc = describeAgentItem(params.item);
          if (desc) onAction(desc, 'step');
        } else if (method === 'item/agentMessage/delta' && params?.delta) {
          if (!answer) onAction('Yanıt yazılıyor…', 'step');
          answer += String(params.delta);
        } else if (method === 'item/completed' && params?.item?.type === 'agentMessage') {
          answer = params.item.text || answer;
        } else if (method === 'turn/completed') {
          if (params?.turn?.status === 'completed') {
            succeed(answer);
          } else if (params?.turn?.status === 'interrupted') {
            fail(Object.assign(Error('Durduruldu'), { cancelled: true }));
          } else {
            fail(Error(params?.turn?.error?.message || 'Alt ajan yanıtı tamamlanamadı.'));
          }
        }
      });
    });
    done.catch(() => {});

    const modelArg = task.model === 'gpt' ? null : task.model;
    const sendArgs = {
      cwd,
      mode,
      access,
      model: modelArg,
      prompt,
      stream: false,
      background: true,
    };

    if (SUBSCRIPTION_PREFIX.test(modelArg || '')) {
      if (!this.providers) throw Error('Sağlayıcı yöneticisi hazır değil.');
      onAction(`${task.provider} bağlantısıyla çalıştırılıyor…`, 'step');
      await this.providers.send(agent, sendArgs);
    } else {
      onAction('Codex bağlantısıyla çalıştırılıyor…', 'step');
      await agent.connect();
      await agent.send(sendArgs);
    }
    return done;
  }

  /** Cancels a single queued or running subagent task without affecting sibling tasks. */
  cancel(taskId, reason = 'Kullanıcı tarafından durduruldu') {
    const id = String(taskId || '');
    const task = this.tasks.get(id);
    if (!task || TERMINAL_STATUSES.has(task.status)) return false;

    const ts = this.now();
    task.status = 'cancelled';
    task.error = reason;
    task.finishedAt = ts;
    this.appendLog(task, reason, 'warn');

    const queuedIdx = this.queue.findIndex((j) => j.task.id === id);
    if (queuedIdx >= 0) {
      const [job] = this.queue.splice(queuedIdx, 1);
      job?.resolve?.(task);
    }

    const active = this.active.get(id);
    if (active) {
      this.active.delete(id);
      try {
        active.cancel();
      } catch {}
    }

    this.notify(task);
    this.pump();
    return true;
  }

  /** Cancels all non-terminal subagent tasks belonging to `parentId`. */
  cancelParent(parentId, reason = 'Ana görev durduruldu') {
    const pid = String(parentId || '');
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.parentId === pid && !TERMINAL_STATUSES.has(task.status)) {
        if (this.cancel(task.id, reason)) count++;
      }
    }
    return count;
  }

  /** Cleanly terminates all active subagent processes/timers and persists final state on app exit. */
  shutdown() {
    this.shuttingDown = true;
    const ts = this.now();
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (job && !TERMINAL_STATUSES.has(job.task.status)) {
        job.task.status = 'cancelled';
        job.task.error = SHUTDOWN_CANCEL_REASON;
        job.task.finishedAt = ts;
        this.appendLog(job.task, SHUTDOWN_CANCEL_REASON, 'warn');
        job.resolve?.(job.task);
      }
    }
    for (const [id, active] of this.active.entries()) {
      const task = this.tasks.get(id);
      if (task && !TERMINAL_STATUSES.has(task.status)) {
        task.status = 'cancelled';
        task.error = SHUTDOWN_CANCEL_REASON;
        task.finishedAt = ts;
        this.appendLog(task, SHUTDOWN_CANCEL_REASON, 'warn');
      }
      try {
        active.cancel();
      } catch {}
    }
    this.active.clear();
    this.save();
  }
}

function runSubagents(options = {}) {
  const { manager = null, ...rest } = options;
  const instance =
    manager instanceof SubagentManager
      ? manager
      : new SubagentManager({
          root: rest.root,
          userData: rest.userData,
          providers: rest.providers,
          makeAgent: rest.makeAgent,
          runner: rest.runner,
          now: rest.now,
          onUpdate: rest.onUpdate,
        });
  return instance.run(rest);
}

function shouldUseSubagents(prompt) {
  const raw = String(prompt || '').trim();
  if (raw.length < 14) return false;
  const s = raw.toLocaleLowerCase('tr');
  // Must explicitly mention alt ajan / subagent
  if (!/(?:\balt\s*ajan(?:lar[aı]?|larla|la|ı|a)?\b|\bsub-?agents?\b)/i.test(s)) return false;
  // Explicit opt-out / negation wins immediately (guards Turkish infinitives like kullanmak/başlatmak)
  if (
    /alt\s*ajan(?:lar[aı]?|la)?\s*(?:kullanma(?!k)|kullanm[ıa]y|açma(?!k)|açm[ıa]y|başlatma(?!k)|başlatm[ıa]y|çalıştırma(?!k)|çalıştırm[ıa]y|atama(?!k)|atam[ıa]y|olmadan|gerek(?:mez|miyor|siz)?|istemi)/i.test(s) ||
    /(?:kullanmadan|olmadan)\s+alt\s*ajan/i.test(s) ||
    /\b(?:don'?t|do\s+not|never|no|without|avoid|skip)\s+(?:use\s+|using\s+|spawn\s+|spawning\s+|run\s+|running\s+)?sub-?agents?\b/i.test(s)
  ) {
    return false;
  }
  // Meta-questions / informational requests / UI bug mentions about subagents themselves
  if (
    /alt\s*ajan(?:lar[aı]?)?\s+(?:nedir|ne\s+işe|nasıl\s+çalış|neden|niye|niçin|özelliği|paneli|çubuğu|sekmesi|görünümü|kart|taşma|bozuk|hakkında|ile\s+ilgili)/i.test(s) ||
    /^\s*(?:what|how|why|do|does|did|can|could|are|is)\s+(?:are\s+|is\s+|do\s+|does\s+|did\s+)?sub-?agents?\b/i.test(s) ||
    /\b(?:about|explain|describe)\s+sub-?agents?\b/i.test(s) ||
    /\bsub-?agent\s+(?:panel|tracker|bar|ui|feature|bug)\b/i.test(s)
  ) {
    return false;
  }
  // Explicit delegation / parallel execution verbs paired with subagent mention
  const trDelegation =
    /(?:alt\s*ajan(?:lar[aı]?|larla|la|ı|a)?\s*(?:ata|kullan|çalıştır|başlat|görevlendir|oluştur|kur|ekibi|ile\s+\S+|olarak\s+\S+))|(?:(?:paralel|ayrı|bağımsız|eş\s*zamanlı|görev(?:ler)?i\s+böl|iş\s+bölümü)[\s\S]{0,80}alt\s*ajan)|(?:alt\s*ajan(?:lar[aı]?|larla|la|ı|a)?[\s\S]{0,80}(?:böl|dağıt|paralel|araştır|incele|analiz\s+et|kontrol\s+et|test\s+et|çöz|hazırla|yap|yaz))/i;
  const enDelegation =
    /(?:\b(?:use|using|assign|delegate|spawn|launch|run|dispatch|split|divide|coordinate)\b[\s\S]{0,40}\bsub-?agents?\b)|(?:\b(?:with|via|by)\s+(?:\d+\s+|multiple\s+|parallel\s+)?sub-?agents?\b)|(?:\bsub-?agents?\s+(?:to\s+)?(?:research|review|analyze|check|test|investigate|compare|audit|implement|build|write|handle|solve)\b)/i;
  return trDelegation.test(s) || enDelegation.test(s);
}

module.exports = {
  MAX_ROOM_ID,
  SubagentManager,
  runSubagents,
  parseSubagentPlan,
  formatSubagentSummary,
  shouldUseSubagents,
  stripSensitiveContext,
  highestTaskRoomId,
  MAX_CONCURRENT,
  MAX_DEPTH,
  MAX_RETRIES,
  MAX_TASKS_PER_RUN,
  RESTART_CANCEL_REASON,
};
