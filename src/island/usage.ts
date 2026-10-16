import { t } from '../settings/i18n';
// Remaining-quota gauges on the compact island.
//
// The gauges always describe the provider behind the model currently selected in the
// composer (which follows the "main AI" setting when that changes). Every request carries
// that provider explicitly, and a sequence number drops answers that arrive after the
// user has already switched, so a slow Codex read can never overwrite a Gemini/Claude view.
type Provider = 'gpt' | 'gemini' | 'claude' | 'cursor';

const NAMES: Record<Provider, string> = {
  gpt: 'Codex',
  gemini: 'Gemini',
  claude: 'Claude',
  cursor: 'Cursor',
};
// Codex quota is cheap to read from the running app-server; Claude is one HTTPS call.
// Gemini starts the Antigravity CLI, so it is refreshed only on demand.
const PERIODIC: Partial<Record<Provider, number>> = { gpt: 60000, claude: 300000, cursor: 300000 };
const MANUAL_REFRESH: Provider[] = ['gemini', 'claude', 'cursor'];

const COLORS: Record<Provider, string> = {
  gpt: '#f2f2f5',
  gemini: '#a8c7fa',
  claude: '#e8a27c',
  cursor: '#3fd8c8', // v0.7.0: turquoise
};
const REFRESH_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 6.4A5.3 5.3 0 1 0 13 10"/><path d="M13.4 2.8v3.8H9.6"/></svg>';

// "2sa 10dk", "45 dk", "3 gün" — short time until a usage window resets.
export function resetLabel(resetsAt: number | null | undefined, now = Date.now()) {
  if (!resetsAt) return '';
  const minutes = Math.max(0, Math.round((resetsAt * 1000 - now) / 60000));
  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return minutes + ' dk';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'sa ' + (minutes % 60) + 'dk';
  const days = Math.floor(hours / 24);
  return days + 'g ' + (hours % 24) + 'sa';
}

// Kota bekçisi (v0.5.3): called once per provider and usage window when less than 10 % is left.
export type LowQuota = {
  provider: Provider;
  name: string;
  window: 'fiveHour' | 'weekly';
  remaining: number;
  resetsAt: number | null;
};
export const LOW_QUOTA = 10;

// Keys of low windows not warned yet; the key includes the reset time, so the next
// window warns again after a reset.
export function lowWindows(v: any, warned: Set<string>, provider: string) {
  const out: { window: 'fiveHour' | 'weekly'; remaining: number; resetsAt: number | null }[] = [];
  for (const key of ['fiveHour', 'weekly'] as const) {
    const w = v?.[key];
    if (typeof w?.remaining !== 'number' || w.remaining >= LOW_QUOTA) continue;
    const id = provider + '|' + key + '|' + (w.resetsAt || '');
    if (warned.has(id)) continue;
    warned.add(id);
    out.push({ window: key, remaining: w.remaining, resetsAt: w.resetsAt ?? null });
  }
  return out;
}

export function usageUI(
  api: any,
  onLimit: (v: boolean, celebrate?: boolean) => void,
  onLow: (v: LowQuota) => void = () => {},
) {
  const weather = document.getElementById('weather-idle')!;
  const panel = document.createElement('section');
  panel.id = 'usage-weather';
  weather.before(panel);
  // v0.5: the weather line sits on the right above Spotify (styles: body.compact
  // #weather-idle); the left side is only quota. It stays a direct child of the header.
  // Header: coloured dot, provider name, plan badge, refresh button.
  const title = document.createElement('div');
  title.className = 'usage-title';
  const dot = document.createElement('span');
  dot.className = 'usage-dot';
  const titleText = document.createElement('span');
  titleText.className = 'usage-name';
  const plan = document.createElement('span');
  plan.className = 'usage-extra';
  title.append(dot, titleText, plan);
  panel.append(title);
  const gauges = document.createElement('div');
  gauges.className = 'usage-gauges';
  panel.append(gauges);
  for (const [id, label] of [
    ['fiveHour', '5 saat'],
    ['weekly', 'Haftalık'],
  ]) {
    const g = document.createElement('div');
    g.className = 'usage-gauge';
    g.dataset.window = id;
    g.innerHTML =
      '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="gauge-track" d="M20 3a17 17 0 1 1 0 34a17 17 0 1 1 0-34"/><path class="gauge-fill" pathLength="100" d="M20 3a17 17 0 1 1 0 34a17 17 0 1 1 0-34"/></svg><strong>—</strong><small class="usage-label">' +
      label +
      '</small><small class="usage-reset"></small>';
    gauges.append(g);
  }
  const credit = document.createElement('div');
  credit.id = 'usage-credits';
  panel.append(credit);
  const renew = document.createElement('button');
  renew.id = 'usage-refresh';
  renew.type = 'button';
  renew.innerHTML = REFRESH_ICON;
  renew.hidden = true;
  title.append(renew);
  renew.onclick = () => void refresh(true);

  const selected = document.getElementById('model') as HTMLSelectElement;
  const limits = new Map<Provider, boolean>();
  const lastValue = new Map<Provider, any>();
  const warned = new Set<string>();
  const providerOf = (value: string): Provider =>
    /^(gemini|claude|cursor):/.test(value) ? (value.split(':')[0] as Provider) : 'gpt';
  let provider: Provider = providerOf(selected.value);
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRead = 0;

  function resets(v: any) {
    for (const key of ['fiveHour', 'weekly'])
      panel.querySelector('[data-window="' + key + '"] .usage-reset')!.textContent = resetLabel(
        v?.[key]?.resetsAt,
      );
  }

  function paint(v: any) {
    resets(v);
    const name = NAMES[provider];
    titleText.textContent = name;
    panel.dataset.provider = provider;
    panel.style.setProperty('--provider', COLORS[provider]);
    // Header extra: Codex shows its extra credit balance here (it used to sit cramped at
    // the bottom edge). Other providers show nothing next to the name.
    const extra = provider === 'gpt' && !v?.unavailable ? 'kredi ' + (v?.credits ?? '—') : '';
    plan.textContent = extra;
    plan.hidden = !extra;
    renew.hidden = !MANUAL_REFRESH.includes(provider);
    renew.setAttribute('aria-label', name + ' kotasını yenile');
    renew.title = name + ' kotasını yenile';
    for (const key of ['fiveHour', 'weekly']) {
      const g = panel.querySelector<HTMLElement>('[data-window="' + key + '"]')!;
      // v0.7.0: Cursor names its windows itself (Auto / Aylık)
      g.querySelector('.usage-label')!.textContent = t(
        v?.labels?.[key] || (key === 'fiveHour' ? '5 saat' : 'Haftalık'),
      );
      const remaining = v?.[key]?.remaining;
      g.querySelector('strong')!.textContent =
        typeof remaining === 'number' ? Math.round(remaining) + '%' : '—';
      (g.querySelector('.gauge-fill') as SVGElement).style.strokeDasharray =
        (remaining ?? 0) + ' 100';
      g.style.setProperty('--remaining', (remaining ?? 0) + '%');
      g.classList.toggle('empty', remaining === 0);
      g.classList.toggle('low', typeof remaining === 'number' && remaining > 0 && remaining <= 15);
      g.setAttribute(
        'aria-label',
        (key === 'fiveHour' ? '5 saatlik' : 'Haftalık') +
          ' ' +
          name +
          ' kalan kullanım: ' +
          (typeof remaining === 'number' ? remaining + '%' : 'veri alınamadı'),
      );
    }
    if (v && !v.unavailable)
      for (const w of lowWindows(v, warned, provider)) onLow({ provider, name, ...w });
    gauges.hidden = !!v?.unavailable;
    credit.textContent = v?.unavailable || '';
    credit.hidden = !credit.textContent;
    if (typeof v?.blocked === 'boolean') {
      limits.set(provider, v.blocked);
      onLimit(v.blocked, true);
    }
  }

  function schedule(delay: number | undefined) {
    clearTimeout(timer);
    if (delay) timer = setTimeout(() => void refresh(true), delay);
  }

  // force: bypass the main-process cache (manual ↻, after an answer, periodic timer).
  // switching: a provider change; always asks, but the main process may answer from cache.
  async function refresh(force = false, switching = false) {
    if (!force && !switching && Date.now() - lastRead < 10000) return;
    const id = ++sequence;
    const target = provider;
    lastRead = Date.now();
    renew.disabled = true;
    panel.classList.add('loading');
    let delay = PERIODIC[target];
    try {
      let v = await api.usageRead(force, target);
      if (id !== sequence || target !== provider) return; // the user switched meanwhile
      // A temporary failure keeps the last good numbers on screen instead of blanking them.
      const previous = lastValue.get(target);
      if (v?.unavailable && !v.fiveHour && !v.weekly && previous?.fiveHour) v = previous;
      lastValue.set(target, v);
      paint(v);
      for (const w of [v?.fiveHour, v?.weekly])
        if (w?.remaining === 0 && w.resetsAt && delay) {
          const wait = w.resetsAt * 1000 - Date.now() + 2000;
          if (wait > 0) delay = Math.min(delay, Math.max(5000, wait));
        }
    } catch {
      if (id === sequence && !lastValue.get(target)) paint(null);
    } finally {
      if (id === sequence) {
        renew.disabled = false;
        panel.classList.remove('loading');
        schedule(delay);
      }
    }
  }

  // Switch the gauges to another provider: show what we last knew at once, then refresh.
  function show(next: Provider) {
    if (next === provider && lastRead) return;
    provider = next;
    paint(lastValue.get(next) || null);
    onLimit(limits.get(next) === true, false);
    void refresh(false, true);
  }

  // The gauges follow the model selected in the chat. While the model list is being rebuilt
  // the select can be briefly empty or point at a fallback; only a choice that stays for
  // 600 ms counts, so the panel never flickers to another provider.
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const follow = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!selected.options.length || selected.selectedIndex < 0) return;
      const next = providerOf(selected.value);
      if (next !== provider) show(next);
    }, 600);
  };
  selected.addEventListener('change', follow);
  new MutationObserver(follow).observe(selected, { attributes: true, childList: true });
  setInterval(follow, 3000);

  api.onEvent((e: any) => {
    if (e.type === 'account') {
      lastValue.delete('gpt');
      if (provider === 'gpt') void refresh(true);
    } else if (e.type === 'connected' || e.type === 'usage-changed') {
      if (provider === 'gpt') void refresh();
    } else if (e.type === 'agent' && e.data?.method === 'turn/completed') {
      // A finished answer used quota: re-read the provider that answered.
      if (provider === 'gpt') void refresh(true);
      else if (provider === 'claude' || provider === 'cursor') void refresh(false, true); // main process caches 60 s
    } else if (e.type === 'disconnected' && provider === 'gpt') paint(null);
  });
  // Main AI changed in settings: switch to its quota right away.
  api.onPrimary((v: any) => show(providerOf(v?.model || '')));
  // Keep the "resets in" labels current between quota reads.
  setInterval(() => {
    resets(lastValue.get(provider));
  }, 30000);
  paint(null);
  // Start on the main AI's quota.
  void api
    .primaryRead()
    .then((id: Provider) => {
      if (id in NAMES && id !== provider) show(id);
    })
    .catch(() => {});
  void refresh(true);
}
