// v1.0.2: In-Charles Subagent Tracker (island compact strip + workspace/panel rich card list).
// Shares one in-memory store across mode switches; never steals focus, never alters chat scroll,
// never displays fake progress percentages or hidden chain-of-thought, and never uses native title.

export type SubagentStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SubagentLog = {
  at: number;
  text: string;
  kind?: string;
};

export type SubagentTask = {
  id: string;
  parentId?: string;
  roomId?: string;
  role?: string;
  title: string;
  status: SubagentStatus;
  provider?: string;
  model?: string;
  lastAction?: string;
  logs: SubagentLog[];
  result?: string;
  error?: string;
  createdAt?: number;
  startedAt?: number;
  finishedAt?: number;
  /** v1.0.4: read back from disk at start-up, i.e. made in an earlier run of Charles */
  restored?: boolean;
};

/** v1.0.4: what the tracker knows about the open chat (from the room snapshot of app/ai/sessions.cjs) */
export type SubagentRoomInfo = {
  /** the chat was made in this run of Charles (e.g. the new chat at start-up) */
  newThisRun?: boolean;
};

export const STATUS_LABELS: Record<SubagentStatus, string> = {
  created: 'Hazırlanıyor',
  queued: 'Sırada',
  running: 'Çalışıyor',
  completed: 'Tamamlandı',
  failed: 'Başarısız',
  cancelled: 'İptal edildi',
};

export const ROLE_LABELS: Record<string, string> = {
  researcher: 'Araştırmacı',
  research: 'Araştırmacı',
  coder: 'Kodlayıcı',
  code: 'Kodlayıcı',
  implementer: 'Kodlayıcı',
  reviewer: 'İnceleyici',
  review: 'İnceleyici',
  verifier: 'Doğrulayıcı',
  planner: 'Planlayıcı',
  plan: 'Planlayıcı',
  tester: 'Test',
  test: 'Test',
  debugger: 'Hata ayıklayıcı',
  assistant: 'Yardımcı',
  worker: 'Alt ajan',
};

const PROVIDER_NAMES: Record<string, string> = {
  codex: 'Codex',
  gpt: 'Codex',
  openai: 'OpenAI',
  claude: 'Claude',
  anthropic: 'Claude',
  gemini: 'Antigravity',
  antigravity: 'Antigravity',
  copilot: 'GitHub Copilot',
  cursor: 'Cursor',
  abacus: 'Abacus AI',
  evren: 'EVREN',
};

const VALID_STATUSES = new Set<SubagentStatus>([
  'created',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const HIDDEN_LOG_KINDS = new Set([
  'thought',
  'thinking',
  'reasoning',
  'chain_of_thought',
  'cot',
  'internal',
]);

export function isActiveStatus(status?: string): boolean {
  return status === 'created' || status === 'queued' || status === 'running';
}

export function statusLabel(status?: string): string {
  return STATUS_LABELS[(status as SubagentStatus) || 'created'] || STATUS_LABELS.created;
}

export function roleLabel(role?: string): string {
  const raw = String(role || '').trim();
  if (!raw) return 'Alt ajan';
  const mapped = ROLE_LABELS[raw.toLowerCase()];
  return mapped || raw;
}

export function formatProviderModel(provider?: string, model?: string): string {
  const rawProv = String(provider || '').trim();
  let rawModel = String(model || '').trim();
  let provKey = rawProv.toLowerCase();
  if (!provKey && rawModel.includes(':')) {
    provKey = rawModel.split(':')[0].toLowerCase();
  }
  if (rawModel.includes(':')) {
    rawModel = rawModel.slice(rawModel.indexOf(':') + 1);
  }
  const provDisplay = PROVIDER_NAMES[provKey] || rawProv;
  if (provDisplay && rawModel && provDisplay.toLowerCase() !== rawModel.toLowerCase()) {
    return `${provDisplay} · ${rawModel}`;
  }
  return provDisplay || rawModel || '';
}

export function filterVisibleLogs(logs?: SubagentLog[]): SubagentLog[] {
  if (!Array.isArray(logs)) return [];
  const out: SubagentLog[] = [];
  for (const item of logs) {
    if (!item || typeof item !== 'object') continue;
    const kind = String(item.kind || '').toLowerCase();
    if (HIDDEN_LOG_KINDS.has(kind)) continue;
    const text = String(item.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push({
      at: Number.isFinite(Number(item.at)) ? Number(item.at) : 0,
      text,
      kind: kind || 'info',
    });
  }
  return out.slice(-40);
}

export function normalizeTask(raw: any): SubagentTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  const rawStatus = String(raw.status || 'created').toLowerCase() as SubagentStatus;
  const status: SubagentStatus = VALID_STATUSES.has(rawStatus) ? rawStatus : 'created';
  const logs = filterVisibleLogs(raw.logs);
  const lastLogText = logs.length ? logs[logs.length - 1].text : '';
  const lastAction = String(raw.lastAction ?? '').replace(/\s+/g, ' ').trim() || lastLogText;
  return {
    id,
    parentId: raw.parentId ? String(raw.parentId) : undefined,
    roomId: raw.roomId ? String(raw.roomId) : raw.sessionId ? String(raw.sessionId) : undefined,
    role: raw.role ? String(raw.role) : undefined,
    title: String(raw.title || raw.task || raw.prompt || 'Alt görev').replace(/\s+/g, ' ').trim(),
    status,
    provider: raw.provider ? String(raw.provider) : undefined,
    model: raw.model ? String(raw.model) : undefined,
    lastAction,
    logs,
    result: raw.result !== undefined && raw.result !== null ? String(raw.result).trim() : '',
    error: raw.error !== undefined && raw.error !== null ? String(raw.error).trim() : '',
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : undefined,
    startedAt: Number.isFinite(Number(raw.startedAt)) ? Number(raw.startedAt) : undefined,
    finishedAt: Number.isFinite(Number(raw.finishedAt)) ? Number(raw.finishedAt) : undefined,
    restored: raw.restored === true,
  };
}

function formatClock(ts?: number): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return '';
  try {
    return new Date(ts).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const CHEVRON_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6"/></svg>';
const AGENT_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M4 18a5 5 0 0 1 10 0"/><circle cx="17.5" cy="9.5" r="2.2"/><path d="M15 18a4 4 0 0 1 6 0"/></svg>';
const STOP_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';

export function createSubagentsView(api?: any) {
  let store: SubagentTask[] = [];
  let currentRoomId = '';
  // v1.0.4: the open chat was made in this run, so no task read back from disk can be its own
  let currentRoomNew = false;
  // v1.0.4: counts complete task lists pushed by the main process ('subagents-updated')
  let liveSeq = 0;
  let listCollapsed = true;
  const expandedTasks = new Set<string>();
  const cancellingTasks = new Set<string>();

  let islandHost: HTMLElement | null = null;
  let panelHost: HTMLElement | null = null;
  let globalsBound = false;

  function activeHost(): HTMLElement | null {
    const inWorkspace =
      typeof document !== 'undefined' &&
      document.body?.classList.contains('workspace');
    return inWorkspace ? panelHost : islandHost;
  }

  function ensureIslandTopPlacement(host: HTMLElement | null) {
    if (!host) return;
    const slot = host.parentElement;
    if (!slot || slot.id !== 'subagents-island') return;
    const content = slot.parentElement;
    if (!content || !content.classList.contains('content')) return;
    const conv = content.querySelector<HTMLElement>(':scope > .conversation');
    if (conv && slot.nextElementSibling !== conv) {
      content.insertBefore(slot, conv);
    }
  }

  function bindGlobalDismiss() {
    if (globalsBound || typeof document === 'undefined') return;
    globalsBound = true;

    document.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (listCollapsed) return;
        const tNode = e.target as Node | null;
        if (!tNode) return;
        if (
          (islandHost && islandHost.contains(tNode)) ||
          (panelHost && panelHost.contains(tNode))
        ) {
          return;
        }
        listCollapsed = true;
        renderAll();
      },
      true,
    );

    document.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || listCollapsed) return;
        if (document.querySelector('dialog[open]')) return;
        const host = activeHost();
        if (!host || host.hidden) return;
        e.preventDefault();
        e.stopPropagation();
        listCollapsed = true;
        renderAll();
        host.querySelector<HTMLButtonElement>('.sa-head-toggle')?.focus();
      },
      true,
    );
  }

  function visibleTasks(): SubagentTask[] {
    if (!currentRoomId) {
      // Before boot binds the active room, never leak room-scoped tasks from previous chats.
      return store.filter((t) => !(t.roomId || t.parentId));
    }
    return store.filter((t) => {
      // v1.0.4: a chat id that was used before (v1.0.3 and older could hand one out twice)
      // never brings an earlier run's subagents into a chat made in this run
      if (currentRoomNew && t.restored) return false;
      const scope = t.roomId || t.parentId || '';
      return scope === currentRoomId;
    });
  }

  function summaryText(tasks: SubagentTask[]): { text: string; tone: 'active' | 'error' | 'done' } {
    let active = 0;
    let failed = 0;
    let completed = 0;
    for (const t of tasks) {
      if (isActiveStatus(t.status)) active++;
      else if (t.status === 'failed') failed++;
      else if (t.status === 'completed') completed++;
    }
    if (active > 0) {
      return { text: `${active} çalışıyor`, tone: 'active' };
    }
    if (failed > 0) {
      return { text: `${failed} başarısız`, tone: 'error' };
    }
    if (completed > 0) {
      return { text: `${completed} tamamlandı`, tone: 'done' };
    }
    return { text: `${tasks.length} alt ajan`, tone: 'done' };
  }

  async function requestCancel(taskId: string) {
    if (!taskId || cancellingTasks.has(taskId)) return;
    cancellingTasks.add(taskId);
    renderAll();
    try {
      if (typeof api?.subagentsCancel === 'function') {
        await api.subagentsCancel(taskId);
      } else if (typeof api?.subagentCancel === 'function') {
        await api.subagentCancel(taskId);
      } else if (typeof api?.cancelSubagent === 'function') {
        await api.cancelSubagent(taskId);
      } else if (typeof api?.subagents === 'function') {
        await api.subagents('cancel', { id: taskId });
      }
    } catch {
      cancellingTasks.delete(taskId);
      renderAll();
    }
  }

  function clearFinished() {
    // v1.0.4: only what this chat shows goes; other chats' history stays
    const shown = new Set(visibleTasks().map((t) => t.id));
    store = store.filter((t) => !shown.has(t.id) || isActiveStatus(t.status));
    renderAll();
    // without a chat, main would clear the finished tasks of every chat (parentId null)
    if (!currentRoomId) return;
    try {
      void api?.subagentsClear?.(currentRoomId)?.catch?.(() => {});
    } catch {}
  }

  function syncCard(card: HTMLElement, task: SubagentTask, _mode: 'island' | 'panel') {
    const active = isActiveStatus(task.status);
    const expanded = expandedTasks.has(task.id);
    const cancelling = cancellingTasks.has(task.id);

    card.dataset.taskId = task.id;
    card.dataset.status = task.status;
    card.classList.toggle('is-active', active);
    card.classList.toggle('is-expanded', expanded);

    const roleEl = card.querySelector<HTMLElement>('.sa-role')!;
    roleEl.textContent = roleLabel(task.role);

    const titleEl = card.querySelector<HTMLElement>('.sa-title')!;
    titleEl.textContent = task.title;
    titleEl.setAttribute('data-tip', task.title);

    const modelEl = card.querySelector<HTMLElement>('.sa-model-pill')!;
    const modelText = formatProviderModel(task.provider, task.model);
    modelEl.textContent = modelText;
    modelEl.hidden = !modelText;
    if (modelText) modelEl.setAttribute('data-tip', modelText);
    else modelEl.removeAttribute('data-tip');

    const badgeEl = card.querySelector<HTMLElement>('.sa-badge')!;
    badgeEl.dataset.status = task.status;
    badgeEl.textContent = statusLabel(task.status);

    const cancelBtn = card.querySelector<HTMLButtonElement>('.sa-cancel')!;
    cancelBtn.hidden = !active;
    cancelBtn.disabled = cancelling;
    const cancelText = cancelling ? 'İptal ediliyor…' : 'İptal et';
    cancelBtn.setAttribute('aria-label', `${task.title} · ${cancelText}`);
    cancelBtn.setAttribute('data-tip', cancelText);
    const cancelSpan = cancelBtn.querySelector<HTMLElement>('.sa-cancel-label');
    if (cancelSpan) cancelSpan.textContent = cancelText;

    const expandBtn = card.querySelector<HTMLButtonElement>('.sa-expand-btn')!;
    expandBtn.setAttribute('aria-expanded', String(expanded));
    const expandTip = expanded ? 'Ayrıntıları gizle' : 'Ayrıntıları göster';
    expandBtn.setAttribute('aria-label', expandTip);
    expandBtn.setAttribute('data-tip', expandTip);

    const actionEl = card.querySelector<HTMLElement>('.sa-last-action')!;
    const actionText =
      task.status === 'failed' && task.error
        ? task.error
        : task.lastAction ||
          (task.status === 'completed' && task.result
            ? task.result
            : statusLabel(task.status));
    actionEl.textContent = actionText;
    actionEl.hidden = !actionText;
    actionEl.classList.toggle('is-error', task.status === 'failed' && Boolean(task.error));

    const drawer = card.querySelector<HTMLElement>('.sa-drawer')!;
    drawer.hidden = !expanded;
    if (expanded) {
      const drawerModel = drawer.querySelector<HTMLElement>('.sa-drawer-model')!;
      drawerModel.textContent = modelText;
      drawerModel.hidden = !modelText;

      const logsBox = drawer.querySelector<HTMLElement>('.sa-logs')!;
      const prevScroll = logsBox.scrollTop;
      const wasAtBottom =
        logsBox.scrollHeight - logsBox.scrollTop - logsBox.clientHeight <= 16;
      const logs = task.logs || [];
      logsBox.hidden = !logs.length;
      if (logs.length) {
        logsBox.replaceChildren(
          ...logs.map((entry) => {
            const row = makeEl('div', 'sa-log-row');
            if (entry.kind) row.dataset.kind = entry.kind;
            const timeText = formatClock(entry.at);
            if (timeText) {
              const tEl = makeEl('small', 'sa-log-time', timeText);
              tEl.setAttribute('translate', 'no');
              row.append(tEl);
            }
            const msg = makeEl('span', 'sa-log-text', entry.text);
            msg.setAttribute('translate', 'no');
            row.append(msg);
            return row;
          }),
        );
        if (wasAtBottom) logsBox.scrollTop = logsBox.scrollHeight;
        else logsBox.scrollTop = prevScroll;
      } else {
        logsBox.replaceChildren();
      }

      const resBox = drawer.querySelector<HTMLElement>('.sa-result')!;
      resBox.hidden = !task.result;
      const resText = resBox.querySelector<HTMLElement>('.sa-result-text')!;
      resText.textContent = task.result || '';

      const errBox = drawer.querySelector<HTMLElement>('.sa-error')!;
      errBox.hidden = !task.error;
      const errText = errBox.querySelector<HTMLElement>('.sa-error-text')!;
      errText.textContent = task.error || '';

      const emptyNote = drawer.querySelector<HTMLElement>('.sa-drawer-empty')!;
      emptyNote.hidden = Boolean(logs.length || task.result || task.error);
    }
  }

  function createCard(task: SubagentTask, mode: 'island' | 'panel'): HTMLElement {
    const card = makeEl('article', `sa-card sa-card-${mode}`);
    card.dataset.taskId = task.id;

    const top = makeEl('div', 'sa-card-top');
    const statusIcon = makeEl('span', 'sa-status-icon');
    statusIcon.setAttribute('aria-hidden', 'true');

    const roleEl = makeEl('span', 'sa-role');
    const titleEl = makeEl('strong', 'sa-title');
    titleEl.setAttribute('translate', 'no');

    const modelEl = makeEl('span', 'sa-model-pill');
    modelEl.setAttribute('translate', 'no');

    const badgeEl = makeEl('span', 'sa-badge');

    const cancelBtn = makeEl('button', 'sa-cancel');
    cancelBtn.type = 'button';
    const cancelIcon = makeEl('span', 'sa-cancel-icon');
    cancelIcon.innerHTML = STOP_SVG;
    cancelBtn.append(cancelIcon);
    if (mode === 'panel') {
      cancelBtn.append(makeEl('span', 'sa-cancel-label', 'İptal et'));
    }
    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      const id = card.dataset.taskId || '';
      void requestCancel(id);
    };

    const expandBtn = makeEl('button', 'sa-expand-btn');
    expandBtn.type = 'button';
    expandBtn.innerHTML = CHEVRON_SVG;
    const toggleExpand = () => {
      const id = card.dataset.taskId || '';
      if (!id) return;
      if (expandedTasks.has(id)) expandedTasks.delete(id);
      else expandedTasks.add(id);
      renderAll();
    };
    expandBtn.onclick = (e) => {
      e.stopPropagation();
      toggleExpand();
    };

    top.append(statusIcon, roleEl, titleEl, modelEl, badgeEl, cancelBtn, expandBtn);
    top.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      toggleExpand();
    };

    const actionEl = makeEl('div', 'sa-last-action');
    actionEl.setAttribute('translate', 'no');

    const drawer = makeEl('div', 'sa-drawer');
    drawer.hidden = true;
    const drawerModel = makeEl('div', 'sa-drawer-model');
    drawerModel.setAttribute('translate', 'no');
    const logsBox = makeEl('div', 'sa-logs');
    const resBox = makeEl('div', 'sa-result');
    resBox.append(
      makeEl('small', 'sa-section-label', 'Sonuç'),
      makeEl('pre', 'sa-result-text'),
    );
    const errBox = makeEl('div', 'sa-error');
    errBox.append(
      makeEl('small', 'sa-section-label', 'Hata'),
      makeEl('pre', 'sa-error-text'),
    );
    const emptyNote = makeEl('small', 'sa-drawer-empty', 'Henüz işlem kaydı yok.');
    drawer.append(drawerModel, logsBox, resBox, errBox, emptyNote);

    card.append(top, actionEl, drawer);
    syncCard(card, task, mode);
    return card;
  }

  function ensureShell(mode: 'island' | 'panel'): HTMLElement {
    bindGlobalDismiss();
    const root = makeEl('section', `sa-view sa-${mode} is-collapsed`);
    root.setAttribute('aria-label', 'Alt ajanlar');
    root.hidden = true;

    const head = makeEl('div', `sa-head sa-${mode}-head`);
    const toggleBtn = makeEl('button', 'sa-head-toggle');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', 'false');

    const dot = makeEl('i', 'sa-dot');
    dot.setAttribute('aria-hidden', 'true');
    const iconSpan = makeEl('span', 'sa-head-icon');
    iconSpan.innerHTML = AGENT_SVG;
    const title = makeEl('strong', 'sa-head-title', 'Alt ajanlar');
    const count = makeEl('span', 'sa-count');
    const chev = makeEl('span', 'sa-head-chev');
    chev.innerHTML = CHEVRON_SVG;

    toggleBtn.append(dot, iconSpan, title, count, chev);
    toggleBtn.onclick = () => {
      listCollapsed = !listCollapsed;
      renderAll();
    };

    const clearBtn = makeEl('button', 'sa-clear-btn', 'Bitenleri temizle');
    clearBtn.type = 'button';
    clearBtn.hidden = true;
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      clearFinished();
    };

    head.append(toggleBtn, clearBtn);
    const list = makeEl('div', `sa-list sa-${mode}-list`);
    list.hidden = true;
    root.append(head, list);
    return root;
  }

  function renderHost(host: HTMLElement | null, mode: 'island' | 'panel') {
    if (!host) return;
    if (mode === 'island') ensureIslandTopPlacement(host);
    const tasks = visibleTasks();
    if (!tasks.length) {
      host.hidden = true;
      // v1.0.4: no hidden cards of another chat stay behind in the page
      host.querySelector<HTMLElement>('.sa-list')?.replaceChildren();
      return;
    }
    host.hidden = false;
    const collapsed = listCollapsed;
    host.classList.toggle('is-collapsed', collapsed);

    const sum = summaryText(tasks);
    host.dataset.tone = sum.tone;

    const toggleBtn = host.querySelector<HTMLButtonElement>('.sa-head-toggle')!;
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    const toggleTip = collapsed
      ? 'Alt ajan ayrıntılarını göster'
      : 'Alt ajan ayrıntılarını gizle';
    toggleBtn.setAttribute('data-tip', toggleTip);

    const countEl = host.querySelector<HTMLElement>('.sa-count')!;
    countEl.textContent = sum.text;
    countEl.dataset.tone = sum.tone;

    const hasFinished = tasks.some((t) => !isActiveStatus(t.status));
    const clearBtn = host.querySelector<HTMLButtonElement>('.sa-clear-btn')!;
    clearBtn.hidden = !hasFinished;

    const list = host.querySelector<HTMLElement>('.sa-list')!;
    list.hidden = collapsed;

    const existing = new Map<string, HTMLElement>();
    for (const child of Array.from(list.children) as HTMLElement[]) {
      const id = child.dataset.taskId;
      if (id) existing.set(id, child);
    }

    const nextNodes: HTMLElement[] = [];
    for (const task of tasks) {
      let card = existing.get(task.id);
      if (card) {
        syncCard(card, task, mode);
        existing.delete(task.id);
      } else {
        card = createCard(task, mode);
      }
      nextNodes.push(card);
    }

    for (const stale of existing.values()) stale.remove();
    nextNodes.forEach((node, idx) => {
      if (list.children[idx] !== node) {
        list.insertBefore(node, list.children[idx] || null);
      }
    });
  }

  function renderAll() {
    renderHost(islandHost, 'island');
    renderHost(panelHost, 'panel');
  }

  function update(input: any) {
    if (Array.isArray(input)) {
      const normalized = input.map(normalizeTask).filter((t): t is SubagentTask => Boolean(t));
      store = normalized;
    } else if (input && typeof input === 'object' && Array.isArray(input.tasks)) {
      const normalized = input.tasks
        .map(normalizeTask)
        .filter((t): t is SubagentTask => Boolean(t));
      if (typeof input.roomId === 'string' && input.roomId) {
        // one chat's list: only that chat's tasks are replaced, and only with its own tasks
        const room = input.roomId;
        const others = store.filter((t) => (t.roomId || t.parentId || '') !== room);
        store = [...others, ...normalized.filter((t) => (t.roomId || t.parentId || '') === room)];
      } else {
        store = normalized;
      }
    } else if (input && typeof input === 'object') {
      if (input.type === 'removed' && typeof input.id === 'string') {
        store = store.filter((t) => t.id !== input.id);
      } else {
        const single = normalizeTask(input.task || input);
        if (single) {
          const idx = store.findIndex((t) => t.id === single.id);
          if (idx >= 0) store[idx] = single;
          else store.push(single);
        }
      }
    }
    const known = new Set<string>();
    for (const t of store) {
      known.add(t.id);
      if (!isActiveStatus(t.status)) cancellingTasks.delete(t.id);
    }
    // v1.0.4: no state is kept for tasks that are gone (cleared, or dropped from the store)
    for (const id of [...expandedTasks]) if (!known.has(id)) expandedTasks.delete(id);
    for (const id of [...cancellingTasks]) if (!known.has(id)) cancellingTasks.delete(id);
    renderAll();
  }

  /** a complete list from the main process ('subagents-updated') */
  function live(payload: any) {
    if (payload && typeof payload === 'object' && Array.isArray(payload.tasks) && !payload.roomId) liveSeq++;
    update(payload);
  }

  function mountIsland(container?: HTMLElement | null): HTMLElement {
    if (!islandHost) islandHost = ensureShell('island');
    if (container && islandHost.parentElement !== container) {
      container.append(islandHost);
    }
    ensureIslandTopPlacement(islandHost);
    renderHost(islandHost, 'island');
    return islandHost;
  }

  function mountPanel(container?: HTMLElement | null): HTMLElement {
    if (!panelHost) panelHost = ensureShell('panel');
    if (container && panelHost.parentElement !== container) {
      container.append(panelHost);
    }
    renderHost(panelHost, 'panel');
    return panelHost;
  }

  let roomSeq = 0;
  function setRoom(roomId?: string | null, info?: SubagentRoomInfo | null) {
    const seq = ++roomSeq;
    currentRoomId = String(roomId || '').trim();
    currentRoomNew = Boolean(info?.newThisRun);
    listCollapsed = true;
    renderAll();
    if (currentRoomId && typeof api?.subagentsList === 'function') {
      const room = currentRoomId;
      const asked = liveSeq;
      void Promise.resolve(api.subagentsList(room))
        .then((res) => {
          // v1.0.4: a reply for a chat that is no longer open, or one older than a complete list
          // that came in meanwhile, changes nothing. It only ever replaces this chat's own tasks
          // (it used to replace the whole store, other chats' tasks included).
          if (seq !== roomSeq || asked !== liveSeq) return;
          const tasks = Array.isArray(res) ? res : Array.isArray(res?.tasks) ? res.tasks : null;
          if (tasks) update({ roomId: room, tasks });
        })
        .catch(() => {});
    }
  }

  function getTasks(): SubagentTask[] {
    return visibleTasks().map((t) => ({
      ...t,
      logs: [...(t.logs || [])],
    }));
  }

  // one subscription for the life of the view (room switches and remounts add none)
  if (typeof api?.onSubagents === 'function') {
    api.onSubagents((payload: any) => live(payload));
  } else if (typeof api?.onSubagentUpdate === 'function') {
    api.onSubagentUpdate((payload: any) => live(payload));
  }

  return {
    mountIsland,
    mountPanel,
    update,
    setRoom,
    getTasks,
  };
}
