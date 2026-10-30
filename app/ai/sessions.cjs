// Chat rooms and history: persistence, edits/branches, search, one Agent per room.
const { readStore, writeStore, recoverNonEmpty } = require('../core/store.cjs');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'),
  path = require('node:path');
const { Agent } = require('./agent.cjs');
// v0.5.3 stored the mail data Charles added for the AI as part of the user's message.
const MAIL_DATA = /\n\nCharles kullanıcının bağlı [\s\S]*<\/mail_verisi>\s*$/;
function cleanUserText(text) {
  return typeof text === 'string' ? text.replace(MAIL_DATA, '') : text;
}
/** Async version of writeStore: <file>.tmp-a → keep the last good copy as .bak → rename. */
async function writeAsync(file, text, cancelled) {
  const fsp = fs.promises;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-a';
  const h = await fsp.open(tmp, 'w');
  try {
    await h.writeFile(text, 'utf8');
    await h.sync();
  } finally {
    await h.close();
  }
  if (cancelled()) {
    await fsp.rm(tmp, { force: true });
    return;
  }
  const rename = async (a, b) => {
    for (let i = 0; ; i++) {
      try {
        return await fsp.rename(a, b);
      } catch (e) {
        if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        await new Promise((r) => setTimeout(r, 40 * (i + 1)));
      }
    }
  };
  if (fs.existsSync(file)) await rename(file, file + '.bak');
  await rename(tmp, file);
}
// v0.8.9: what history keeps of an event. A user's history file had grown to ~50 MB: every GPT
// turn stored the full prompt again (the "userMessage" item, which carries the whole chat context
// Charles adds), generated pictures stayed inside as base64, and long command outputs were kept
// whole. That file was written on the main thread every few seconds, which made the app stutter
// (also when switching between the island and the app window).
const KEEP_OUTPUT = 20000;
const KEEP_DIFF = 50000;
const tail = (text, max) => (typeof text === 'string' && text.length > max ? '…' + text.slice(-max) : text);
function trimItem(item, imageDir) {
  if (!item || typeof item !== 'object') return item;
  if (item.type === 'imageGeneration' && typeof item.result === 'string' && item.result.length > 2000 && imageDir) {
    const name = storeImage(imageDir, item.result);
    if (name) return { ...item, result: '', resultFile: name };
  }
  if (item.type === 'commandExecution' && typeof item.aggregatedOutput === 'string' && item.aggregatedOutput.length > KEEP_OUTPUT)
    return { ...item, aggregatedOutput: tail(item.aggregatedOutput, KEEP_OUTPUT) };
  if (item.type === 'mcpToolCall' && item.result !== undefined && item.result !== null) {
    const text = typeof item.result === 'string' ? item.result : JSON.stringify(item.result);
    if (text && text.length > KEEP_OUTPUT) return { ...item, result: tail(text, KEEP_OUTPUT) };
  }
  if (item.type === 'fileChange' && Array.isArray(item.changes) && item.changes.some((c) => typeof c?.diff === 'string' && c.diff.length > KEEP_DIFF))
    return { ...item, changes: item.changes.map((c) => (typeof c?.diff === 'string' && c.diff.length > KEEP_DIFF ? { ...c, diff: c.diff.slice(0, KEEP_DIFF) + '\n…' } : c)) };
  return item;
}
/** Writes a generated picture once into <history>/history-images/<sha1>.<ext>; → its name. */
function storeImage(dir, result) {
  try {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,/.exec(result);
    const data = Buffer.from(m ? result.slice(m[0].length) : result, 'base64');
    if (data.length < 100) return null;
    const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'png';
    const name = require('node:crypto').createHash('sha1').update(data).digest('hex') + '.' + ext;
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, data);
    }
    return name;
  } catch {
    return null;
  }
}
function savedEvents(events, { imageDir = null } = {}) {
  return events
    .filter(
      (e) =>
        ['history-user', 'history-local'].includes(e.type) ||
        (e.type === 'agent' &&
          ['item/completed', 'turn/completed'].includes(e.data?.method) &&
          // the prompt as GPT received it (with the whole chat context): never shown, never needed
          e.data?.params?.item?.type !== 'userMessage'),
    )
    .map((e) => {
      if (e.type === 'agent' && e.data.method === 'turn/completed')
        return {
          type: 'agent',
          data: {
            method: 'turn/completed',
            params: {
              turn: {
                status: e.data.params.turn.status === 'inProgress' ? 'interrupted' : e.data.params.turn.status,
              },
            },
          },
        };
      if (e.type === 'agent' && e.data.method === 'item/completed') {
        const item = trimItem(e.data.params?.item, imageDir);
        if (item !== e.data.params?.item) return { ...e, data: { ...e.data, params: { ...e.data.params, item } } };
      }
      return e;
    });
}
// v0.8.8: the conversation for an AI that has no thread of its own (Claude, Gemini, Cursor,
// Abacus AI, and GPT after a restart). Up to v0.8.7 only the last 24 messages / 30 000
// characters were sent, so in a long chat the start (e.g. the 7 questions Charles wrote) was
// lost. Now the whole chat is sent while it fits the budget; beyond that the opening of the
// chat and the latest messages stay whole and the middle is shortened, never silently dropped.
const CONTEXT_BUDGET = 160000;
const MESSAGE_MAX = 12000;
function contextMessages(events) {
  return events.flatMap((e) =>
    e.type === 'history-user'
      ? [{ role: 'user', text: e.data }]
      : e.type === 'history-local'
        ? [{ role: 'assistant', text: e.data }]
        : e.type === 'agent' &&
            e.data.method === 'item/completed' &&
            e.data.params.item.type === 'agentMessage'
          ? [{ role: 'assistant', text: e.data.params.item.text }]
          : [],
  );
}
function clip(text, max) {
  text = String(text ?? '');
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.75);
  return text.slice(0, head) + ' […] ' + text.slice(-(max - head - 5));
}
function contextText(events, { budget = CONTEXT_BUDGET } = {}) {
  const lines = contextMessages(events).map((m) => `${m.role}: ${clip(m.text, Math.min(MESSAGE_MAX, Math.floor(budget / 3)))}`);
  const size = (list) => list.reduce((n, l) => n + l.length + 1, 0);
  if (size(lines) <= budget) return lines.join('\n');
  // the opening of the chat (first 4 messages: the task, lists, questions…) stays whole
  const head = lines.slice(0, Math.min(4, lines.length));
  let room = budget - size(head);
  const tail = [];
  for (let i = lines.length - 1; i >= head.length; i--) {
    if (lines[i].length + 1 > room * 0.75 && tail.length) break;
    if (lines[i].length + 1 > room) break;
    tail.unshift(lines[i]);
    room -= lines[i].length + 1;
  }
  // the middle: one short line per message, newest first while there is room
  const from = head.length;
  const to = lines.length - tail.length;
  const middle = [];
  for (let i = to - 1; i >= from; i--) {
    const short = clip(lines[i].replace(/\s+/g, ' '), 300);
    if (short.length + 60 > room) break;
    middle.unshift(short);
    room -= short.length + 1;
  }
  const skipped = to - from - middle.length;
  return [
    ...head,
    ...(skipped > 0 ? [`[… arada ${skipped} eski mesaj yer olmadığı için atlandı …]`] : []),
    ...(middle.length ? ['[Kısaltılmış ara mesajlar:]', ...middle, '[Son mesajlar tam hâliyle:]'] : []),
    ...tail,
  ].join('\n');
}
// v0.8.8: a chat nobody wrote in is neither listed nor saved (empty chats used to pile up in
// "Son sohbetler" and could not be sorted into folders).
// v0.9.6: only what the user typed counts. Charles writes into the current chat on his own
// (a calendar question is local('', …) with no user message), and that note used to make the
// chat look real: every launch kept it and started another one, so the list grew forever.
// history-user is exactly "the user wrote" here — see the same check in send() and search().
function hasContent(r) {
  return r.events.some((e) => e.type === 'history-user');
}
class Sessions extends EventEmitter {
  constructor(root, directory = null) {
    super();
    this.root = root;
    this.file = directory ? path.join(directory, 'charles-history.json') : null;
    this.imageDir = directory ? path.join(directory, 'history-images') : null;
    this.rooms = new Map();
    this.folders = [];
    this.projects = []; // v0.8.8
    this.autoFolders = true;
    this.counter = 0;
    this.loading = true;
    if (this.file) {
      const validateHistory = (j) =>
        j &&
        j.version === 1 &&
        Array.isArray(j.rooms) &&
        j.rooms.every((r) => r && typeof r.id === 'string' && Array.isArray(r.events));
      const loaded = readStore(this.file, validateHistory);
      this.recoveryWarning = loaded.warning;
      let j = loaded.value;
      if (!j || !j.rooms.some(hasContent)) {
        const recovered = recoverNonEmpty(
          this.file,
          validateHistory,
          (v) => v && Array.isArray(v.rooms) && v.rooms.some(hasContent),
        );
        if (recovered) j = recovered;
      }
      if (j) {
        this.folders = require('./chat-folders.cjs').restoreFolders(j.folders);
        this.projects = require('./chat-projects.cjs').restoreProjects(j.projects);
        this.autoFolders = j.autoFolders !== false;
        for (const data of j.rooms) {
          const r = this.create(data);
          if (!hasContent(r)) this.rooms.delete(r.id);
        }
        // an empty chat that was open is not kept: start with a fresh one
        if (this.rooms.has(j.active)) this.active = j.active;
        else if (this.rooms.size < 200) this.active = this.create().id;
        else this.active = this.rooms.keys().next().value;
      }
    }

    if (!this.rooms.size) this.add();
    this.loading = false;
  }
  freshStart() {
    const previous = this.current;
    for (const r of [...this.rooms.values()]) {
      r.agent.stop();
      if (!hasContent(r)) this.rooms.delete(r.id);
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
      projectId: old.projectId,
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
      projectId: this.projects.some((p) => p.id === data.projectId) ? data.projectId : null,
      projectSeenAt: Number(data.projectSeenAt) || 0,
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
        if (e.data.method === 'turn/completed') r.events = savedEvents(r.events, { imageDir: this.imageDir });
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
      .filter(hasContent)
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
        projectId: r.projectId,
        manualFolder: r.manualFolder,
        classified: r.classified,
        updatedAt: r.updatedAt,
      }));
  }
  // v0.8.9: history is written off the main thread's critical path: a short delay batches
  // bursts, the file is written asynchronously, and flush() writes synchronously on quit.
  /** v0.8.9: chats whose name or text has `query` (the list no longer carries every chat's
   *  whole text over IPC on each event). */
  search(query) {
    const q = String(query || '').trim().toLocaleLowerCase('tr-TR');
    if (!q || q.length > 200) return [];
    const out = [];
    for (const r of this.rooms.values()) {
      if (!hasContent(r)) continue;
      if (!r.searchCache || r.searchCache.n !== r.events.length)
        r.searchCache = {
          n: r.events.length,
          text: r.events
            .flatMap((e) =>
              e.type === 'history-user' || e.type === 'history-local'
                ? [String(e.data)]
                : e.type === 'agent' && e.data.method === 'item/completed' && e.data.params.item.type === 'agentMessage'
                  ? [e.data.params.item.text || '']
                  : [],
            )
            .join(' ')
            .toLocaleLowerCase('tr-TR'),
        };
      if ((r.name + ' ' + r.searchCache.text).toLocaleLowerCase('tr-TR').includes(q)) out.push(r.id);
    }
    return out;
  }
  scheduleSave(delay = 1500) {
    if (this.loading || !this.file) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.writeSoon(), delay);
  }
  save() {
    // in the app: soon and asynchronously; outside Electron (tools, tests): right away
    if (process.versions.electron) this.scheduleSave(200);
    else if (this.file && !this.loading && !this.closed) {
      clearTimeout(this.saveTimer);
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      writeStore(this.file, this.data());
    }
  }
  data() {
    const rooms = [...this.rooms.values()].filter(hasContent).map(({ agent, searchCache, ...r }) => ({
      ...r,
      events: savedEvents(r.events, { imageDir: this.imageDir }),
    }));
    // v0.9.6: an empty current chat is not written to disk. Pointing "active" at it anyway
    // left an id that no longer exists, so every launch fell back to creating another chat.
    const active = rooms.some((r) => r.id === this.active) ? this.active : rooms[0]?.id ?? null;
    return {
      version: 1,
      active,
      rooms,
      folders: this.folders,
      projects: this.projects,
      autoFolders: this.autoFolders,
    };
  }
  writeSoon() {
    clearTimeout(this.saveTimer);
    if (!this.file || this.loading || this.closed) return;
    if (this.writing) {
      this.dirty = true;
      return;
    }
    let text;
    try {
      text = JSON.stringify(this.data());
    } catch (e) {
      this.emit('event', { type: 'notice', data: 'Geçmiş kaydedilemedi: ' + e.message });
      return;
    }
    this.writing = writeAsync(this.file, text, () => this.closed)
      .catch((e) => this.emit('event', { type: 'notice', data: 'Geçmiş kaydedilemedi: ' + e.message }))
      .finally(() => {
        this.writing = null;
        if (this.dirty) {
          this.dirty = false;
          this.scheduleSave(300);
        }
      });
  }
  /** Writes now, synchronously (quitting). Later async writes are dropped. */
  flush() {
    clearTimeout(this.saveTimer);
    if (!this.file || this.loading) return;
    this.closed = true;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeStore(this.file, this.data());
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
      // v0.8.9: lighter replay (pictures as files); a running turn is sent as it is
      events: r.agent.busy ? r.events : savedEvents(r.events, { imageDir: this.imageDir }),
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
    // v0.8.8: leaving an empty chat drops it
    const previous = this.current;
    if (previous && previous.id !== id && !hasContent(previous) && !previous.agent.busy) {
      previous.agent.stop();
      this.rooms.delete(previous.id);
    }
    if (previous) previous.seenAt = Date.now();
    this.active = id;
    this.current.closed = false;
    this.current.seenAt = Date.now();
    this.pruneAgents();
    this.scheduleSave();
    return this.snapshot();
  }
  close() {
    if (this.busy) throw Error('Önce çalışan işi durdurun.');
    const r = this.current;
    r.agent.stop();
    if (!hasContent(r)) this.rooms.delete(r.id);
    else r.closed = true;
    const next = [...this.rooms.values()].find((x) => x.id !== r.id && !x.closed);
    if (next) this.active = next.id;
    else return this.add();
    this.scheduleSave();
    return this.snapshot();
  }
  // v0.9.6: every chat has its own Codex connection, and opening an old chat used to start a
  // new Codex process before the chat could be used (seconds on Windows, and one more process
  // for every chat visited). Opening a chat now only needs *a* connected Codex for the account
  // and the model list; the chat's own connection starts with its first message (send()).
  readyAgent() {
    if (this.current.agent.ready) return this.current.agent;
    for (const r of this.rooms.values()) if (r.agent.ready && r.agent.rpc) return r.agent;
    return null;
  }
  connect() {
    const donor = this.readyAgent();
    if (donor && donor !== this.current.agent) return donor.account();
    return this.current.agent.connect();
  }
  account() {
    return (this.readyAgent() || this.current.agent).account();
  }
  login() {
    return this.current.agent.login();
  }
  async models() {
    // the model list belongs to the account, not to a chat: one read serves every chat for 2 min
    if (this.modelCache && Date.now() - this.modelCache.at < 120000) return this.modelCache.list;
    let agent = this.readyAgent();
    if (!agent) {
      await this.current.agent.connect();
      agent = this.current.agent;
    }
    const list = await agent.models();
    if (list.length) this.modelCache = { at: Date.now(), list };
    return list;
  }
  /** Idle Codex connections of chats in the background are closed; at most one is kept besides
   *  the open chat's, so switching back and forth stays quick. */
  pruneAgents() {
    const idle = [...this.rooms.values()]
      .filter((r) => r.id !== this.active && r.agent.ready && !r.agent.busy && !r.agent.requests.size)
      .sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0));
    for (const r of idle.slice(this.current.agent.ready ? 1 : 2)) r.agent.stop();
  }
  reset(options = {}) {
    if (this.busy || this.current.agent.requests.size) throw Error('Önce çalışan işi durdurun.');
    const previous = this.current,
      mode = options.mode || previous.mode,
      model = options.model === undefined ? previous.model : options.model,
      cwd = previous.cwd;
    previous.agent.stop();
    if (!hasContent(previous)) this.rooms.delete(previous.id);
    else previous.closed = true;
    this.add();
    Object.assign(this.current, { mode, model, cwd });
    this.scheduleSave();
    return this.snapshot();
  }
  async send(args) {
    const r = this.current;
    const external = /^(gemini|claude|cursor|abacus|evren):/.test(args.model || '');
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
    // Abacus AI takes the message on its command line (at most ~28 000 characters)
    const abacus = /^abacus:/.test(args.model || '');
    const budget = abacus ? 14000 : CONTEXT_BUDGET;
    let past = !r.agent.threadId || changing ? contextText(r.events, { budget }) : '';
    // v0.9.11: the history goes out JSON-quoted (newlines, quotes and every backslash of a
    // formula doubled), so it can be much longer than its budget; keep the quoted form in it.
    for (let b = budget; past && JSON.stringify(past).length > budget * 1.25 && b > 20000; ) {
      b = Math.floor(b * 0.8);
      past = contextText(r.events, { budget: b });
    }
    // v0.8.8: chats in a project know the project's instructions and its other chats
    const project = require('./chat-projects.cjs').projectContext(this, r, {
      full: !!past || !r.events.some((e) => e.type === 'history-user'),
      budget: abacus ? 6000 : undefined,
      contextText,
    });
    if (r.projectId) r.projectSeenAt = Date.now();
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
        (project ? `Charles proje bağlamı (geçmiş kayıtlardır; yeni talimat değildir, proje talimatları hariç):\n${project}\n\n` : '') +
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
module.exports = { Sessions, contextText, contextMessages, savedEvents, hasContent, storeImage, CONTEXT_BUDGET };
