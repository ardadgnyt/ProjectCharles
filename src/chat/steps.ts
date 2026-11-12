// v0.9.27: "Düşünme ve işlem adımları" — what Charles did during one answer, as a compact list.
//
// One line while collapsed (the step that is running, or a short summary once it is over), a list of
// short rows when opened, and a row opens further only when it has something to show. The list is
// made of what the AI connection already reports for the user: command lines and their output, file
// names and diffs, search queries, tool names, the plan, and the *summary* of the reasoning when the
// model publishes one. The reasoning itself is never read here.
//
// What this replaces drew every reported item as a box that opens:
//  - an item of a kind it had no name for was titled "İşlem", and since it had no command, tool or
//    result either, the box opened onto nothing (Codex's "contextCompaction" is one: only an id);
//  - a tool's closing event that carries only its id and state (Claude's tool_result) overwrote the
//    row it closed: "Komut  npm test" turned into "Araç" with an empty box, live and in history;
//  - in a reopened chat every turn's steps were added to the first turn's list, because the event
//    that started a new list is not kept in history.
// Here an item that has nothing to show is not drawn, one that has no detail is a plain status line
// (it does not open), a closing event only adds to what is known, and each turn has its own list.

export type StepStatus = 'running' | 'done' | 'failed' | 'cancelled';
export type StepView = {
  type: string;
  status: StepStatus;
  /** short Turkish title (translated by the interface language layer) */
  label: string;
  /** what it is about, in the tool's own words: a command, a path, a query (never translated) */
  preview: string;
  /** the full text behind the row; '' = nothing more to show, so the row does not open */
  detail: string;
};

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const oneLine = (v: string, max = 240) => v.replace(/\s+/g, ' ').trim().slice(0, max);
const LIMIT = 100000;

/** Items that are the conversation itself or the connection's own plumbing: never a step. */
const NOT_A_STEP = new Set(['userMessage', 'agentMessage', 'imageGeneration', 'hookPrompt', 'functionCallOutput']);
/** Kinds with a name of their own; anything else is only drawn when it has content. */
const LABELS: Record<string, string> = {
  commandExecution: 'Komut',
  fileChange: 'Dosya değişikliği',
  mcpToolCall: 'Araç',
  dynamicToolCall: 'Araç',
  webSearch: 'Arama',
  plan: 'Plan',
  reasoning: 'Düşünme özeti',
  contextCompaction: 'Sohbet bağlamı özetlendi',
  enteredReviewMode: 'İnceleme başladı',
  exitedReviewMode: 'İnceleme tamamlandı',
  collabAgentToolCall: 'Yardımcı ajan',
  subAgentActivity: 'Yardımcı ajan',
  imageView: 'Görsel incelendi',
  sleep: 'Bekleme',
};

/**
 * A closing event may carry only { id, type, status }. What was known stays; what the new event
 * really says is added. The kind stays too when the new event names none of its own content.
 */
export function mergeItem(before: any, item: any): any {
  if (!before) return { ...item };
  const next = { ...before };
  for (const [k, v] of Object.entries(item || {})) {
    if (v === undefined || v === null) continue;
    if (k === 'type') continue;
    if (typeof v === 'string' && !v && typeof before[k] === 'string' && before[k]) continue;
    if (Array.isArray(v) && !v.length && Array.isArray(before[k]) && before[k].length) continue;
    next[k] = v;
  }
  const bare = !['command', 'tool', 'query', 'changes', 'summary', 'steps', 'text', 'result', 'review', 'prompt', 'path'].some((k) => item?.[k] !== undefined && item[k] !== null && item[k] !== '');
  next.type = bare && before.type ? before.type : item?.type || before.type;
  return next;
}

function statusOf(item: any, completed: boolean): StepStatus {
  const s = String(item?.status || '');
  if (s === 'failed' || item?.success === false || (typeof item?.exitCode === 'number' && item.exitCode !== 0 && s !== 'inProgress')) return 'failed';
  if (s === 'declined' || s === 'interrupted' || s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'completed' || s === 'success') return 'done';
  // kinds without a state of their own (reasoning, review, compaction) are over when they are reported complete
  return completed ? 'done' : 'running';
}

/** Text out of an MCP-style result ({ content: [{ type: 'text', text }] }), a string, or JSON. */
function resultText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const content = (result as any).content ?? (result as any).contentItems;
  if (Array.isArray(content)) {
    const parts = content.map((c: any) => text(c?.text)).filter(Boolean);
    if (parts.length) return parts.join('\n');
    if (!content.length) return '';
  }
  try {
    const json = JSON.stringify(result, null, 2);
    return json === '{}' || json === '[]' ? '' : json;
  } catch {
    return '';
  }
}
function argumentsText(args: unknown): string {
  if (typeof args === 'string') return args.trim();
  if (!args || typeof args !== 'object' || !Object.keys(args as object).length) return '';
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return '';
  }
}

/** How one item is shown, or null when there is nothing a person could read in it. */
export function describe(item: any, completed = false): StepView | null {
  const type = String(item?.type || '');
  if (!type || NOT_A_STEP.has(type)) return null;
  const status = statusOf(item, completed);
  const error = text(item?.error?.message) || text(item?.error);
  let label = LABELS[type] || '';
  let preview = '';
  let detail = '';
  if (type === 'reasoning') {
    // the published summary only; `content` (the reasoning itself) is never shown
    const parts = (Array.isArray(item.summary) ? item.summary : []).map((s: any) => (typeof s === 'string' ? s : text(s?.text))).filter((s: string) => s.trim());
    if (!parts.length) return null;
    detail = parts.join('\n\n');
    preview = oneLine(parts[0].replace(/[*_`#]+/g, ''), 120);
  } else if (type === 'commandExecution') {
    const command = text(item.command);
    const output = text(item.aggregatedOutput);
    preview = oneLine(command);
    const more = output.trim() || command.includes('\n') || command.trim().length > preview.length;
    const code = typeof item.exitCode === 'number' && item.exitCode !== 0 ? 'Çıkış kodu: ' + item.exitCode : '';
    if (more || error || (code && status === 'failed'))
      detail = [command, text(item.cwd) && 'Klasör: ' + item.cwd, output, code, error].filter(Boolean).join('\n\n');
  } else if (type === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const paths = changes.map((c: any) => text(c?.path)).filter(Boolean);
    preview = oneLine(paths.join(', '));
    if (changes.some((c: any) => text(c?.diff).trim()) || paths.length > 1 || error)
      detail = [changes.map((c: any) => [text(c?.path), text(c?.diff)].filter(Boolean).join('\n')).join('\n\n'), error].filter(Boolean).join('\n\n');
  } else if (type === 'mcpToolCall' || type === 'dynamicToolCall') {
    const tool = text(item.tool);
    const about = text(item.command);
    if (tool === 'read_file') label = 'Dosya okuma';
    else if (tool === 'project') label = 'Proje';
    preview = oneLine(about && about !== tool ? (label === 'Araç' && tool ? tool + ' · ' + about : about) : [text(item.server || item.namespace), tool].filter(Boolean).join(' · '));
    detail = [argumentsText(item.arguments), resultText(item.result ?? item.contentItems), error].filter(Boolean).join('\n\n');
    // a closing event kept without its opening one (older history): a tool with no name and
    // nothing to show says nothing, unless it failed
    if (!preview && !detail && status === 'done') return null;
  } else if (type === 'webSearch') {
    const action = item.action && typeof item.action === 'object' ? item.action : {};
    const queries = Array.isArray(action.queries) ? action.queries.map(text).filter(Boolean) : [];
    const query = text(item.query) || text(action.query) || queries[0] || text(action.url) || text(action.pattern);
    preview = oneLine(query);
    const lines = [...new Set([query, ...queries, text(action.url)].filter(Boolean))];
    if (lines.length > 1 || query.trim().length > preview.length || error) detail = [lines.join('\n'), error].filter(Boolean).join('\n\n');
  } else if (type === 'plan') {
    detail = text(item.steps) || text(item.text);
    if (!detail.trim()) return null;
    const rows = detail.split('\n').filter((r) => r.trim());
    preview = oneLine(rows.find((r) => !/^\s*✓/.test(r)) || rows[rows.length - 1] || '', 120).replace(/^[·✓]\s*/, '');
  } else if (type === 'enteredReviewMode' || type === 'exitedReviewMode') {
    const review = text(item.review);
    preview = oneLine(review, 120);
    if (review.trim().length > preview.length || review.includes('\n')) detail = review;
  } else if (type === 'collabAgentToolCall') {
    preview = oneLine(text(item.tool));
    detail = [text(item.prompt), error].filter(Boolean).join('\n\n');
  } else if (type === 'subAgentActivity') {
    preview = oneLine(text(item.agentPath) || text(item.kind));
  } else if (type === 'imageView') {
    preview = oneLine(text(item.path).split(/[\\/]/).pop() || '');
  } else if (!label) {
    // a kind this version has no name for: shown only when it says something
    const about = text(item.command) || text(item.tool) || text(item.query) || text(item.title) || text(item.name);
    const body = [text(item.text), resultText(item.result), error].filter(Boolean).join('\n\n');
    if (!about.trim() && !body.trim()) return null;
    label = 'İşlem';
    preview = oneLine(about || body, about ? 240 : 120);
    detail = body.trim() && body.trim() !== preview ? body : '';
  }
  // an error with nowhere else to go is the row's own text, so a failed step never looks empty
  if (error && !detail) {
    if (preview) detail = error;
    else preview = oneLine(error);
  }
  return { type, status, label, preview, detail: detail.slice(-LIMIT) };
}

const STATE_TEXT: Record<StepStatus, string> = { running: 'Çalışıyor', done: 'Tamamlandı', failed: 'Hata', cancelled: 'Durduruldu' };

type Row = { item: any; view: StepView; el: HTMLElement; pre: HTMLElement | null; completed: boolean; group: Group };
type Group = { el: HTMLDetailsElement; body: HTMLElement; title: HTMLElement; preview: HTMLElement; count: HTMLElement; state: HTMLElement; rows: Row[]; notes: number; over: StepStatus | null; listed: boolean };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, content = '') => {
  const n = document.createElement(tag);
  n.className = cls;
  if (content) n.textContent = content;
  return n;
};
const setText = (n: HTMLElement, value: string) => {
  if (n.textContent !== value) n.textContent = value;
};

/**
 * The lists of one chat. `append` puts a new list at the end of the chat; `liveText` writes a row's
 * output so that a selection in it survives; `changed` is called after anything grew.
 */
export function stepLists(deps: { append: (node: HTMLElement) => void; liveText: (box: HTMLElement, text: string) => void; changed: (pre?: HTMLElement | null) => void }) {
  let group: Group | null = null;
  const rows = new Map<string, Row>();
  let serial = 0;

  function open(): Group {
    if (group && group.el.isConnected) return group;
    const box = document.createElement('details');
    box.className = 'steps';
    const head = document.createElement('summary');
    head.className = 'steps-head';
    const icon = el('span', 'step-icon');
    icon.setAttribute('aria-hidden', 'true');
    const title = el('span', 'steps-title');
    const preview = el('span', 'steps-preview');
    preview.setAttribute('translate', 'no');
    const count = el('span', 'steps-count');
    const state = el('span', 'steps-state');
    const chevron = el('span', 'steps-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    head.append(icon, title, preview, count, state, chevron);
    const body = el('div', 'steps-body');
    box.append(head, body);
    deps.append(box);
    group = { el: box, body, title, preview, count, state, rows: [], notes: 0, over: null, listed: false };
    return group;
  }

  /** The collapsed line: the step that runs now, or what the whole list came to. */
  function paintHead(g: Group) {
    const n = g.rows.length;
    const running = [...g.rows].reverse().find((r) => r.view.status === 'running');
    const failed = g.rows.filter((r) => r.view.status === 'failed').length;
    const stopped = g.rows.some((r) => r.view.status === 'cancelled');
    const status: StepStatus = running && !g.over ? 'running' : failed ? 'failed' : stopped || g.over === 'cancelled' ? 'cancelled' : 'done';
    g.el.dataset.status = status;
    // one step: the list is that step itself, with no header line above it
    g.el.classList.toggle('single', n === 1 && !g.notes);
    g.el.classList.toggle('notes-only', n === 0);
    if (n <= 1) g.el.open = true;
    else if (!g.listed) {
      // the second step: from here on it is a list, closed until somebody opens it
      g.listed = true;
      g.el.open = false;
    }
    const thinking = g.rows.some((r) => r.view.type === 'reasoning');
    const doing = g.rows.some((r) => r.view.type !== 'reasoning');
    const shown = status === 'running' && running ? running : null;
    setText(g.title, shown ? shown.view.label : thinking && doing ? 'Düşünme ve işlem adımları' : thinking ? 'Düşünme özeti' : 'İşlem adımları');
    setText(g.preview, shown ? shown.view.preview : '');
    g.preview.hidden = !shown || !shown.view.preview;
    setText(g.count, n > 1 ? n + ' adım' : '');
    g.count.hidden = n < 2;
    setText(g.state, status === 'running' ? '' : status === 'failed' ? 'Hata' : status === 'cancelled' ? 'Durduruldu' : '');
    g.state.hidden = status === 'running' || status === 'done';
    g.el.setAttribute('aria-busy', String(status === 'running'));
  }

  function build(view: StepView): { node: HTMLElement; pre: HTMLElement | null } {
    const line = [el('span', 'step-icon'), el('span', 'step-label'), el('span', 'step-preview'), el('span', 'step-state')];
    line[0].setAttribute('aria-hidden', 'true');
    line[2].setAttribute('translate', 'no');
    if (!view.detail) {
      // nothing behind it: a status line, not something that opens onto an empty box
      const node = el('div', 'step plain');
      const row = el('div', 'step-line');
      row.append(...line);
      node.append(row);
      return { node, pre: null };
    }
    const node = document.createElement('details');
    node.className = 'step';
    const head = document.createElement('summary');
    head.className = 'step-line';
    const chevron = el('span', 'step-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    head.append(...line, chevron);
    const pre = document.createElement('pre');
    pre.className = 'step-detail';
    pre.tabIndex = 0;
    node.append(head, pre);
    return { node, pre };
  }

  function paint(r: Row) {
    const v = r.view;
    // a row that got its first detail becomes one that opens (and the other way never happens)
    if (!!v.detail !== !!r.pre) {
      const wasOpen = r.el instanceof HTMLDetailsElement && r.el.open;
      const made = build(v);
      r.el.replaceWith(made.node);
      r.el = made.node;
      r.pre = made.pre;
      if (wasOpen && made.node instanceof HTMLDetailsElement) made.node.open = true;
    }
    r.el.dataset.type = v.type;
    r.el.dataset.status = v.status;
    const q = (c: string) => r.el.querySelector<HTMLElement>(':scope > .step-line > .' + c)!;
    setText(q('step-label'), v.label);
    setText(q('step-preview'), v.preview);
    setText(q('step-state'), STATE_TEXT[v.status]);
    if (r.pre) deps.liveText(r.pre, v.detail);
  }

  /** One reported item, at its start or its end. Returns false when it is not drawn. */
  function update(item: any, completed = false): boolean {
    const id = String(item?.id ?? '');
    const key = id || 'x' + ++serial;
    const known = rows.get(key);
    const merged = mergeItem(known?.item, item);
    const done = completed || !!known?.completed;
    const view = describe(merged, done);
    if (!view) return false;
    // a list that is over stays as it was reported; only a row of its own may still close
    if (known) {
      known.item = merged;
      known.view = known.group.over && view.status === 'running' ? { ...view, status: known.view.status } : view;
      known.completed = done;
      paint(known);
      paintHead(known.group);
      deps.changed(known.pre);
      return true;
    }
    const g = open();
    const made = build(view);
    g.body.append(made.node);
    const r: Row = { item: merged, view, el: made.node, pre: made.pre, completed: done, group: g };
    g.rows.push(r);
    rows.set(key, r);
    paint(r);
    paintHead(g);
    deps.changed(r.pre);
    return true;
  }

  /** More output for a running command. */
  function output(id: string, delta: string) {
    const r = rows.get(String(id));
    if (!r || !delta) return;
    update({ id, type: r.item.type, aggregatedOutput: (text(r.item.aggregatedOutput) + delta).slice(-LIMIT) });
  }

  /** A note Charles wrote between steps: it stands in the list, at the place it was written. */
  function note(node: HTMLElement) {
    const g = open();
    g.notes++;
    g.body.append(node);
    paintHead(g);
  }

  /**
   * The turn is over. A step that never reported its end is not left "running" for good: it was
   * stopped with the turn, or it finished with it.
   */
  function finish(turn: 'completed' | 'interrupted' | 'failed' | string) {
    const g = group;
    group = null;
    if (!g || !g.el.isConnected) return;
    const to: StepStatus = turn === 'completed' ? 'done' : 'cancelled';
    for (const r of g.rows)
      if (r.view.status === 'running') {
        r.view = { ...r.view, status: to };
        r.completed = true;
        paint(r);
      }
    g.over = to;
    paintHead(g);
  }

  /** The next step starts a list of its own (a new turn, a message in between). */
  function next() {
    group = null;
  }
  function clear() {
    group = null;
    rows.clear();
  }
  /** For code that fills the chat out of order (older messages drawn above): keep and put back. */
  const hold = () => group;
  const restore = (g: Group | null) => (group = g);
  return { update, output, note, finish, next, clear, hold, restore, has: (id: string) => rows.has(String(id)) };
}
