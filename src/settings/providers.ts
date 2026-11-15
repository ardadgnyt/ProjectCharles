import { pluginGuideUI } from './plugin-guide';
import { abacusCard } from './abacus-card';
import { evrenCard } from './evren-card';
import { cliCard } from './cli-card';
import { READY, showConnected, stateLine, type StateLine } from './connected-state';
import { defaultModelUI } from './default-model';
export function providersUI(api: any, refresh: () => Promise<void>, notice: (s: string) => void) {
  const page = document.querySelector('.settings-page[data-category=account]')!;
  // v0.5.1: no separate "main AI" setting. The model chosen in the chat decides; the main
  // process remembers its provider for background jobs (see 'default-model' in main.cjs).
  // Default model: what Charles starts with and what every new chat uses.
  // v1.0.0: its own list (default-model.ts) instead of a native select; nothing reads its value.
  const primary = defaultModelUI(api, notice);
  page.prepend(primary);
  const results = new Map<string, StateLine>(),
    buttons = new Map<string, HTMLButtonElement>();
  const gpt = document.createElement('section');
  gpt.className = 'setting-section provider-card';
  gpt.dataset.provider = 'gpt';
  const original = document.getElementById('connect')!.parentElement!;
  const oldHeading = original.previousElementSibling;
  if (oldHeading?.tagName === 'H3') oldHeading.remove();
  gpt.innerHTML =
    '<h3>GPT hesabı</h3><p class="hint">ChatGPT hesabınla Codex üzerinden bağlan.</p>';
  const gptResult = stateLine();
  gptResult.textContent = 'Giriş bekleniyor';
  original.classList.add('provider-actions');
  const guide = pluginGuideUI(api, notice, async () => {
    await sync();
    await refresh();
    document.getElementById('gpt-check')?.click();
  });
  const gptSetup = document.createElement('button');
  gptSetup.type = 'button';
  gptSetup.textContent = 'Charles ile kur';
  gptSetup.onclick = () => void guide('gpt-login');
  original.prepend(gptSetup);
  // v0.7.0: GPT gets the same "check connection" button as the other accounts
  const gptCheck = document.createElement('button');
  gptCheck.id = 'gpt-check';
  gptCheck.type = 'button';
  gptCheck.textContent = 'Bağlantıyı kontrol et';
  original.append(gptCheck);
  gpt.append(original, gptResult.el);
  primary.after(gpt);
  document.getElementById('mode-hint')!.hidden = true;
  let cardTail: HTMLElement = gpt;
  document.addEventListener('charles-account', (e: any) => {
    // v1.0.0: "Bağlı · <plan> · Modeller kullanıma hazır." on the one status line
    gptResult.connected = !!e.detail.signedIn;
    gptResult.textContent = e.detail.signedIn
      ? (e.detail.plan ? e.detail.plan + ' · ' : '') + READY
      : 'Giriş yapılmadı';
  });
  let pendingUntil = 0,
    busy = false,
    last = '';
  const refusals = new Set<string>();
  async function sync() {
    if (busy) return;
    busy = true;
    try {
      const rows = await api.providersStatus();
      for (const s of rows) {
        if (s.id === 'abacus') {
          abacus.update(s);
          continue;
        }
        if (s.id === 'evren') {
          evren.update(s);
          continue;
        }
        if (kits[s.id]) {
          kits[s.id].update(s);
          continue;
        }
        const result = results.get(s.id),
          button = buttons.get(s.id);
        // a sign-in error stays on the line until the next deliberate action or a connection
        // (the regular re-read replaced it within seconds; same as cli-card.ts `refusal`)
        if (s.signedIn) refusals.delete(s.id);
        if (result) result.connected = !!s.signedIn;
        if (result && !refusals.has(s.id))
          result.textContent = s.signedIn
            ? READY
            : !s.installed
              ? 'Giriş aracı eksik; paketin tamamını çıkar.'
              : 'Giriş yapılmadı';
        // v1.0.0: connected = the sign-in button steps aside, the line says "Bağlı"
        if (button) {
          button.disabled = !s.installed || !!s.signedIn;
          showConnected(button, !!s.signedIn, (button.dataset.name || '') + ' ile giriş');
        }
      }
      const signature = JSON.stringify(rows);
      if (signature !== last) {
        last = signature;
        await refresh();
      }
    } catch {
      /* Keep the last visible state on IPC shutdown. */
    } finally {
      busy = false;
    }
  }
  for (const [id, name] of [
    ['gemini', 'Antigravity'],
    ['claude', 'Claude'],
    ['cursor', 'Cursor'],
  ]) {
    const section = document.createElement('section');
    section.className = 'setting-section provider-card';
    section.dataset.provider = id;
    const title = document.createElement('h3');
    title.textContent = name + ' hesabı';
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent =
      id === 'cursor'
        ? 'Cursor hesabınla resmi Cursor Agent üzerinden bağlan. Yalnızca sohbet modunda çalışır.'
        : id === 'gemini'
          ? 'Google hesabınla Antigravity üzerinden bağlan.'
          : 'Claude hesabınla Claude Code üzerinden bağlan. Pro veya Max aboneliği gerekir; ücretsiz hesap yetmez.';
    const result = stateLine();
    result.textContent = 'Hesap kontrol ediliyor…';
    results.set(id, result);
    const actions = document.createElement('div');
    actions.className = 'row provider-actions';
    const login = document.createElement('button');
    login.id = 'provider-login-' + id;
    login.textContent = name + ' ile giriş';
    login.dataset.name = name;
    login.type = 'button';
    login.className = 'primary';
    buttons.set(id, login);
    const check = document.createElement('button');
    check.textContent = 'Bağlantıyı kontrol et';
    check.type = 'button';
    check.onclick = () => {
      refusals.delete(id);
      void sync();
    };
    login.onclick = async () => {
      login.disabled = true;
      refusals.delete(id);
      result.textContent = 'Giriş penceresi açılıyor…';
      try {
        const loginResult = await api.providersLogin(id);
        if (loginResult.signedIn) {
          result.textContent = READY;
          await sync();
          await refresh();
        } else {
          pendingUntil = Date.now() + 10 * 60 * 1000;
          result.textContent =
            'Giriş penceresi açıldı. Hesabın ve model adı görünüyorsa giriş tamamdır; pencereyi kapatıp Charles’a dönebilirsin.';
        }
      } catch (e) {
        refusals.add(id);
        result.connected = false;
        result.textContent = (e as Error).message;
      } finally {
        login.disabled = false;
      }
    };
    actions.append(login);
    // v0.6.5 Gemini, v0.7.1 all accounts: step-by-step sign-in next to Slime. Every card has
    // the same order: Charles ile kur · sign in (only while not connected) · check connection.
    // v1.0.0: "Charles ile kur" is a neutral button; the cream one is the sign-in (one per card).
    const setup = document.createElement('button');
    setup.type = 'button';
    setup.textContent = 'Charles ile kur';
    setup.onclick = () => void guide(id + '-login');
    actions.prepend(setup);
    actions.append(check);
    section.append(title, note, actions, result.el);
    cardTail.after(section);
    cardTail = section;
  }
  // v0.8.0: Abacus AI, for people who have an Abacus AI account and its command line tool
  const abacus = abacusCard(
    api,
    notice,
    async () => {
      last = '';
      await sync();
    },
    (gid) => guide(gid),
  );
  cardTail.after(abacus.section);
  cardTail = abacus.section;
  // v0.9.6: EVREN - no sign-in window; a pasted API key that is checked against EVREN at once.
  const evren = evrenCard(
    api,
    notice,
    async () => {
      last = '';
      await sync();
    },
    (gid) => guide(gid),
  );
  cardTail.after(evren.section);
  cardTail = evren.section;
  // v0.9.27: GitHub Copilot, through its own command line tool
  const kits: Record<string, ReturnType<typeof cliCard>> = {};
  for (const kind of ['copilot'] as const) {
    kits[kind] = cliCard(
      kind,
      api,
      notice,
      async () => {
        last = '';
        await sync();
      },
      (gid) => guide(gid),
    );
    cardTail.after(kits[kind].section);
    cardTail = kits[kind].section;
  }
  window.addEventListener('focus', () => void sync());
  document.getElementById('model-button')!.addEventListener('click', () => void sync());
  window.setInterval(() => {
    if (
      Date.now() < pendingUntil ||
      (!(page as HTMLElement).hidden && document.getElementById('settings-panel')!.getClientRects().length)
    )
      void sync();
  }, 15000);
  void sync();
}
