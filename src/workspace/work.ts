// v0.7.7: two strips above the chat of the app window.
//
// "Şu an ne yapıyorum?" — what Charles is working on: the request, the step it is on (from
// its plan, or from what it is doing right now: a command, a web search, a file), the files it
// changed (→ change review), and what it is waiting for from you (an approval or an answer).
// Durdur / Devam et / Yön değiştir sit next to it. A time estimate is shown only when it can
// be trusted: the plan has at least three steps, two are done and they took similar time.
//
// "İş kuyruğu" — requests as cards instead of messages that get lost in the chat. Cards run
// one after the other in the open chat; drag a card to change the order; a card can be tied
// to the one before it ("Ardından …"), then it waits until that one finished successfully.
import { el, icon, iconButton } from './icons';

export type WorkDeps = {
  api: any;
  notice: (s: string) => void;
  /** Sends a message in the open chat. */
  send: (text: string) => Promise<void>;
  /** Opens the change review screen (optionally on one change). */
  review: (id?: string) => void;
  /** Is the app window's chat on screen? */
  visible: () => boolean;
};

type Step = { step: string; status: string };
type Card = { id: string; text: string; after?: string; status: 'waiting' | 'running' | 'done' | 'failed' | 'stopped' | 'blocked' };

const short = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const base = (p: string) => p.split(/[\\/]/).pop() || p;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/** What an item means for the user: [label, detail]. */
export function describe(item: any): [string, string] | null {
  const type = String(item?.type || '');
  const tool = String(item?.tool || item?.name || '').toLowerCase();
  if (type === 'commandExecution') return ['Komut çalıştırıyorum', short(String(item.command || '').replace(/\s+/g, ' '), 70)];
  if (type === 'fileChange') {
    const files = (item.changes || []).map((c: any) => base(String(c.path || ''))).filter(Boolean);
    return ['Dosya düzenliyorum', short(files.join(', '), 70)];
  }
  if (type === 'webSearch') return ['Web’de arıyorum', short(String(item.query || item.action?.query || ''), 70)];
  if (type === 'mcpToolCall') {
    if (/read_file|read/.test(tool)) return ['Dosya okuyorum', short(base(String(item.command || '')), 70)];
    return ['Araç kullanıyorum', short(String(item.tool || item.name || ''), 50)];
  }
  if (type === 'imageGeneration') return ['Görsel oluşturuyorum', ''];
  if (type === 'reasoning') return ['Düşünüyorum', ''];
  if (type === 'agentMessage') return ['Yanıtı yazıyorum', ''];
  return null;
}

/**
 * Remaining time from the finished plan steps, or null when it would be a guess:
 * needs ≥ 3 steps, ≥ 2 finished, at least one left, and finished steps of similar length
 * (coefficient of variation ≤ 0.6).
 */
export function estimate(stepDurations: number[], total: number, done: number): number | null {
  if (total < 3 || done < 2 || done >= total || stepDurations.length < 2) return null;
  const mean = stepDurations.reduce((a, b) => a + b, 0) / stepDurations.length;
  if (!(mean > 0)) return null;
  const sd = Math.sqrt(stepDurations.reduce((a, b) => a + (b - mean) ** 2, 0) / stepDurations.length);
  if (sd / mean > 0.6) return null;
  return mean * (total - done);
}

/** The next card that may run: waiting, and its predecessor (if any) finished well. */
export function nextCard(cards: Card[]): Card | null {
  for (const c of cards) {
    if (c.status !== 'waiting') continue;
    if (!c.after) return c;
    const dep = cards.find((x) => x.id === c.after);
    if (!dep || dep.status === 'done') return c;
  }
  return null;
}

export function workUI(d: WorkDeps) {
  // ── "Şu an ne yapıyorum?" ────────────────────────────────────────────────────
  const dot = el('i', 'ws-now-dot');
  const heading = el('strong', 'ws-now-heading', 'Şu an ne yapıyorum?');
  const clock = el('small', 'ws-now-clock', '');
  const eta = el('small', 'ws-now-eta', '');
  eta.title = 'Tamamlanan adımların süresine göre tahmin';
  const stopB = el('button', 'ws-now-btn danger', icon('stop'), el('span', '', 'Durdur'));
  const goB = el('button', 'ws-now-btn', icon('play'), el('span', '', 'Devam et'));
  const steerB = el('button', 'ws-now-btn', icon('compass'), el('span', '', 'Yön değiştir'));
  for (const b of [stopB, goB, steerB]) b.type = 'button';
  const foldB = iconButton('chevronDown', 'Daralt veya genişlet', () => {
    folded = !folded;
    paint();
  }, 'ws-icon ws-now-fold');
  const task = el('p', 'ws-now-task');
  task.translate = false;
  const stepLabel = el('span', 'ws-now-step-label');
  const stepDetail = el('code', 'ws-now-step-detail');
  stepDetail.translate = false;
  const stepCount = el('small', 'ws-now-step-count');
  const stepBar = el('div', 'ws-now-steps');
  const files = el('div', 'ws-now-files');
  const waitBox = el('div', 'ws-now-wait');
  const steerForm = el('form', 'ws-now-steer');
  const steerInput = el('input');
  steerInput.placeholder = 'Charles’a yeni yön ver (ör. “önce testleri düzelt”)';
  steerInput.maxLength = 2000;
  const steerSend = el('button', 'ws-primary', 'Gönder');
  steerSend.type = 'submit';
  steerForm.append(steerInput, steerSend);
  steerForm.hidden = true;
  const details = el(
    'div',
    'ws-now-body',
    task,
    el('div', 'ws-now-step', stepLabel, stepDetail, stepCount),
    stepBar,
    files,
    waitBox,
    steerForm,
  );
  const now = el(
    'section',
    'ws-now',
    el('div', 'ws-now-head', dot, heading, clock, eta, el('span', 'ws-now-actions', steerB, goB, stopB, foldB)),
    details,
  );
  now.setAttribute('aria-live', 'polite');
  now.hidden = true;

  let phase: 'idle' | 'running' | 'stopped' | 'done' | 'failed' = 'idle';
  let folded = false;
  let startedAt = 0;
  let endedAt = 0;
  let label: [string, string] = ['Düşünüyorum', ''];
  let plan: Step[] = [];
  let stepTimes: number[] = [];
  let lastDoneAt = 0;
  let lastDone = 0;
  let stepClock = false; // the first plan of a turn only starts the clock
  const changed = new Map<string, string>(); // path → item id
  const waiting = new Map<string | number, boolean>(); // request id → is a question
  let ticker = 0;

  function lastRequest() {
    const users = document.querySelectorAll('#feed .message.user');
    const u = users[users.length - 1];
    return (u?.querySelector('.markdown, p, span')?.textContent || u?.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function paint() {
    now.hidden = phase === 'idle';
    now.dataset.phase = phase;
    now.classList.toggle('folded', folded);
    foldB.setAttribute('aria-expanded', String(!folded));
    const running = phase === 'running';
    heading.textContent =
      phase === 'running' ? (waiting.size ? 'Senden bir şey bekliyorum' : 'Şu an ne yapıyorum?') : phase === 'stopped' ? 'İş durduruldu' : phase === 'failed' ? 'İş tamamlanamadı' : 'İş bitti';
    stopB.hidden = !running;
    steerB.hidden = !running;
    goB.hidden = phase !== 'stopped' && phase !== 'failed';
    const elapsed = (running ? Date.now() : endedAt) - startedAt;
    clock.textContent = startedAt ? mmss(elapsed) : '';
    // plan
    const done = plan.filter((s) => s.status === 'completed').length;
    const current = plan.find((s) => s.status === 'inProgress') || plan.find((s) => s.status !== 'completed');
    if (running && current) {
      // the step of the plan, and what is being done for it right now
      stepLabel.textContent = current.step;
      stepLabel.translate = false;
      stepDetail.textContent = label[1];
    } else {
      stepLabel.textContent = running ? label[0] : phase === 'done' ? 'Tamamlandı' : phase === 'stopped' ? 'Durduruldu' : 'Hata ile bitti';
      stepLabel.translate = true;
      stepDetail.textContent = running ? label[1] : '';
    }
    stepDetail.hidden = !stepDetail.textContent;
    stepCount.replaceChildren();
    if (plan.length) stepCount.append(el('span', '', 'Adım'), ` ${Math.min(done + (running ? 1 : 0), plan.length)}/${plan.length}`);
    stepBar.replaceChildren(...plan.map((s) => el('i', s.status === 'completed' ? 'done' : s.status === 'inProgress' ? 'now' : '')));
    stepBar.hidden = !plan.length;
    const left = running ? estimate(stepTimes, plan.length, done) : null;
    eta.replaceChildren();
    if (left !== null) eta.append('~' + Math.max(1, Math.round(left / 60000)) + ' ', el('span', '', 'dk kaldı (tahmini)'));
    eta.hidden = left === null;
    // files
    files.replaceChildren();
    if (changed.size) {
      files.append(el('small', '', 'Değiştirdiği dosyalar'));
      for (const [p] of [...changed].slice(-6)) {
        const chip = el('button', 'ws-now-file', icon('file'), el('span', '', base(p)));
        chip.type = 'button';
        chip.title = p;
        chip.translate = false;
        chip.onclick = () => d.review();
        files.append(chip);
      }
      if (changed.size > 6) files.append(el('small', '', '+' + (changed.size - 6)));
      const all = el('button', 'ws-link', el('span', '', 'İncele'), icon('arrowRight'));
      all.type = 'button';
      all.onclick = () => d.review();
      files.append(all);
    }
    files.hidden = !changed.size;
    // waiting for the user
    waitBox.replaceChildren();
    if (running && waiting.size) {
      const question = [...waiting.values()].some(Boolean);
      const go = el('button', 'ws-link', el('span', '', 'Göster'), icon('arrowRight'));
      go.type = 'button';
      go.onclick = () => document.querySelector('#feed .request')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      waitBox.append(icon('bulb'), el('span', '', question ? 'Sorusuna cevap vermeni bekliyor.' : 'Devam etmek için onayını bekliyor.'), go);
    } else if (phase === 'stopped') waitBox.append(icon('bulb'), el('span', '', 'Devam et ile kaldığı yerden sürdürebilir ya da yeni bir mesaj yazabilirsin.'));
    waitBox.hidden = !waitBox.childElementCount;
    now.classList.toggle('waiting', running && waiting.size > 0);
  }
  stopB.onclick = () =>
    void (async () => {
      stopB.disabled = true;
      try {
        await d.api.interrupt();
      } catch (e) {
        d.notice((e as Error).message);
      } finally {
        stopB.disabled = false;
      }
    })();
  goB.onclick = () => void d.send('Kaldığın yerden devam et.');
  steerB.onclick = () => {
    steerForm.hidden = !steerForm.hidden;
    folded = false;
    paint();
    if (!steerForm.hidden) steerInput.focus();
  };
  steerForm.onsubmit = (e) => {
    e.preventDefault();
    const text = steerInput.value.trim();
    if (!text) return;
    steerInput.value = '';
    steerForm.hidden = true;
    // while an answer runs, the message box sends it as an extra instruction (steer.ts)
    void d.send(text);
  };

  // ── İş kuyruğu ──────────────────────────────────────────────────────────────
  let cards: Card[] = [];
  let auto = true;
  let running = false;
  let activeCard = '';
  try {
    const saved = JSON.parse(localStorage.getItem('charles.workQueue') || 'null');
    if (Array.isArray(saved?.cards))
      cards = saved.cards
        .filter((c: any) => c && typeof c.text === 'string')
        .slice(0, 30)
        .map((c: any) => ({ id: String(c.id), text: String(c.text).slice(0, 2000), after: c.after ? String(c.after) : undefined, status: c.status === 'running' ? 'stopped' : c.status }));
    if (typeof saved?.auto === 'boolean') auto = saved.auto;
  } catch {}
  const persist = () => {
    try {
      localStorage.setItem('charles.workQueue', JSON.stringify({ cards, auto }));
    } catch {}
  };
  const qCount = el('span', 'ws-q-count');
  const qToggle = el('button', 'ws-q-head', icon('queue'), el('strong', '', 'İş kuyruğu'), qCount, icon('chevronDown'));
  qToggle.type = 'button';
  let qOpen = false;
  qToggle.onclick = () => {
    qOpen = !qOpen;
    paintQueue();
    if (qOpen) qInput.focus();
  };
  const autoB = el('button', 'ws-q-auto', el('i'), el('span', '', 'Sırayla çalıştır'));
  autoB.type = 'button';
  autoB.title = 'Açıkken kartlar sırayla, bir iş bitince otomatik başlar';
  autoB.onclick = () => {
    auto = !auto;
    persist();
    paintQueue();
    pump();
  };
  const clearB = el('button', 'ws-link', el('span', '', 'Bitenleri temizle'));
  clearB.type = 'button';
  clearB.onclick = () => {
    const gone = new Set(cards.filter((c) => c.status === 'done').map((c) => c.id));
    cards = cards.filter((c) => !gone.has(c.id)).map((c) => (c.after && gone.has(c.after) ? { ...c, after: undefined } : c));
    persist();
    paintQueue();
  };
  const qList = el('ol', 'ws-q-list');
  const qForm = el('form', 'ws-q-form');
  const qInput = el('input');
  qInput.placeholder = 'Sıraya iş ekle… (ör. “Şunu araştır”, “Bu dosyayı düzenle”)';
  qInput.maxLength = 2000;
  const qAfter = el('label', 'ws-q-after-opt');
  const qAfterBox = el('input');
  qAfterBox.type = 'checkbox';
  qAfter.append(qAfterBox, el('span', '', 'Öncekinden sonra'));
  qAfter.title = 'Bu iş, listedeki son iş başarıyla bitince başlar';
  const qAdd = el('button', 'ws-primary', icon('plus'), el('span', '', 'Ekle'));
  qAdd.type = 'submit';
  qForm.append(qInput, qAfter, qAdd);
  const qBody = el('div', 'ws-q-body', qForm, qList, el('div', 'ws-q-foot', autoB, clearB));
  const queue = el('section', 'ws-queue', qToggle, qBody);
  qForm.onsubmit = (e) => {
    e.preventDefault();
    const text = qInput.value.trim();
    if (!text) return;
    if (cards.length >= 30) return d.notice('Kuyrukta en fazla 30 iş olabilir.');
    const last = cards[cards.length - 1];
    cards.push({ id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, status: 'waiting', after: qAfterBox.checked && last ? last.id : undefined });
    qInput.value = '';
    persist();
    paintQueue();
    pump();
  };
  const STATUS: Record<Card['status'], string> = {
    waiting: 'Sırada',
    running: 'Çalışıyor',
    done: 'Bitti',
    failed: 'Tamamlanamadı',
    stopped: 'Durduruldu',
    blocked: 'Bekliyor',
  };
  let dragId = '';
  function paintQueue() {
    const open = cards.filter((c) => c.status !== 'done').length;
    qCount.textContent = cards.length ? String(open) : '';
    qCount.hidden = !cards.length;
    queue.classList.toggle('open', qOpen);
    qBody.hidden = !qOpen;
    autoB.classList.toggle('on', auto);
    autoB.setAttribute('aria-pressed', String(auto));
    clearB.hidden = !cards.some((c) => c.status === 'done');
    qAfter.hidden = !cards.length;
    qList.replaceChildren();
    cards.forEach((c, i) => {
      const dep = c.after ? cards.findIndex((x) => x.id === c.after) : -1;
      const text = el('span', 'ws-q-text', c.text);
      text.translate = false;
      const blocked = c.status === 'waiting' && dep >= 0 && cards[dep].status !== 'done' && cards[dep].status !== 'waiting' && cards[dep].status !== 'running';
      const st = blocked ? 'blocked' : c.status;
      const meta = el('span', 'ws-q-meta', el('span', 'ws-q-status ' + st, STATUS[st]));
      if (dep >= 0) {
        const tie = el('span', 'ws-q-dep' + (dep > i ? ' wrong' : ''), icon('link'), el('span', '', dep > i ? 'Bağlı olduğu iş daha aşağıda' : 'Ardından · ' + (dep + 1) + '. işten sonra'));
        tie.title = 'Bu iş, ' + (dep + 1) + '. iş başarıyla bitince başlar';
        meta.append(tie);
      }
      const actions = el('span', 'ws-q-actions');
      if (i > 0)
        actions.append(
          iconButton('link', c.after ? 'Bağlantıyı kaldır' : 'Bir önceki işe bağla', () => {
            c.after = c.after ? undefined : cards[i - 1].id;
            persist();
            paintQueue();
          }, 'ws-icon' + (c.after ? ' on' : '')),
        );
      if (c.status !== 'running')
        actions.append(
          iconButton(c.status === 'waiting' ? 'play' : 'refresh', c.status === 'waiting' ? 'Şimdi çalıştır' : 'Yeniden sıraya koy', () => {
            if (c.status !== 'waiting') {
              c.status = 'waiting';
              persist();
              paintQueue();
              return pump();
            }
            run(c);
          }),
          iconButton('x', 'Kuyruktan çıkar', () => {
            cards = cards.filter((x) => x !== c).map((x) => (x.after === c.id ? { ...x, after: c.after } : x));
            persist();
            paintQueue();
          }),
        );
      const li = el('li', 'ws-q-card ' + st, el('span', 'ws-q-num', String(i + 1)), el('span', 'ws-q-main', text, meta), actions, el('span', 'ws-q-grip', icon('grip')));
      li.draggable = c.status !== 'running';
      li.dataset.id = c.id;
      li.ondragstart = (e) => {
        dragId = c.id;
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('application/x-charles-queue', c.id);
        window.setTimeout(() => li.classList.add('dragging'), 0);
      };
      li.ondragend = () => {
        dragId = '';
        paintQueue();
      };
      li.ondragover = (e) => {
        if (!dragId || dragId === c.id) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        li.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
        li.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
      };
      li.ondragleave = () => li.classList.remove('drop-before', 'drop-after');
      li.ondrop = (e) => {
        e.preventDefault();
        if (!dragId || dragId === c.id) return;
        const moving = cards.find((x) => x.id === dragId);
        if (!moving) return;
        const r = li.getBoundingClientRect();
        const after = e.clientY >= r.top + r.height / 2;
        cards = cards.filter((x) => x !== moving);
        const at = cards.indexOf(c) + (after ? 1 : 0);
        cards.splice(at, 0, moving);
        dragId = '';
        persist();
        paintQueue();
      };
      qList.append(li);
    });
    if (!cards.length) qList.append(el('li', 'ws-empty', 'Kuyruk boş. Birden fazla işi sıraya koyup Charles’ın sırayla yapmasını sağlayabilirsin.'));
  }
  function run(c: Card) {
    if (running) {
      d.notice('Charles şu an başka bir iş üzerinde; bu iş sırası gelince başlayacak.');
      return;
    }
    c.status = 'running';
    activeCard = c.id;
    persist();
    paintQueue();
    void d.send(c.text).catch((e) => {
      c.status = 'failed';
      activeCard = '';
      persist();
      paintQueue();
      d.notice((e as Error).message);
    });
  }
  let pumpTimer = 0;
  function pump() {
    window.clearTimeout(pumpTimer);
    pumpTimer = window.setTimeout(() => {
      if (!auto || running || activeCard || !d.visible()) return;
      const next = nextCard(cards);
      if (next) run(next);
    }, 1200);
  }

  // ── events ───────────────────────────────────────────────────────────────────
  document.addEventListener('charles-agent', (e: any) => {
    const { method, params: p, replaying } = e.detail || {};
    if (replaying) return;
    if (method === 'turn/started') {
      running = true;
      phase = 'running';
      startedAt = Date.now();
      endedAt = 0;
      plan = [];
      stepTimes = [];
      lastDone = 0;
      lastDoneAt = startedAt;
      stepClock = false;
      changed.clear();
      waiting.clear();
      label = ['Düşünüyorum', ''];
      task.textContent = short(lastRequest(), 220);
      task.hidden = !task.textContent;
      steerForm.hidden = true;
      window.clearInterval(ticker);
      ticker = window.setInterval(() => phase === 'running' && paint(), 1000);
      paint();
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = p?.item;
      if (method === 'item/started') {
        const x = describe(item);
        if (x) label = x;
      }
      if (item?.type === 'fileChange')
        for (const c of item.changes || []) if (c?.path) changed.set(String(c.path), item.id);
      if (phase === 'running') paint();
    }
    if (method === 'turn/plan/updated') {
      plan = (p?.plan || []).map((s: any) => ({ step: String(s.step || ''), status: String(s.status || '') }));
      const done = plan.filter((s) => s.status === 'completed').length;
      const t = Date.now();
      if (!stepClock) {
        // the first plan of a turn starts the clock (it may arrive with steps already done)
        stepClock = true;
        lastDone = done;
        lastDoneAt = t;
      } else if (done > lastDone) {
        // only a step that finished on its own has a known length; several steps ticked at
        // once say nothing about the time per step
        if (done - lastDone === 1) stepTimes.push(t - lastDoneAt);
        lastDone = done;
        lastDoneAt = t;
      }
      paint();
    }
    if (method === 'turn/completed') {
      running = false;
      const status = p?.turn?.status;
      phase = status === 'interrupted' ? 'stopped' : status === 'failed' ? 'failed' : 'done';
      endedAt = Date.now();
      waiting.clear();
      window.clearInterval(ticker);
      paint();
      if (activeCard) {
        const c = cards.find((x) => x.id === activeCard);
        if (c) c.status = phase === 'done' ? 'done' : phase === 'stopped' ? 'stopped' : 'failed';
        activeCard = '';
        persist();
        paintQueue();
      }
      // a stopped job pauses the queue, the user decides what is next
      if (phase === 'done') pump();
    }
  });
  document.addEventListener('charles-request', (e: any) => {
    const { id, open, question } = e.detail || {};
    if (open) waiting.set(id, !!question);
    else waiting.delete(id);
    if (phase === 'running') paint();
  });

  paintQueue();
  return {
    now,
    queue,
    /** The chat came into view: a waiting queue may start. */
    shown: () => pump(),
    /** Adds a request to the queue (from elsewhere in the window). */
    add(text: string) {
      cards.push({ id: 'q' + Date.now().toString(36), text, status: 'waiting' });
      qOpen = true;
      persist();
      paintQueue();
      pump();
    },
  };
}
