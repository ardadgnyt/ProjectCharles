import { pluginGuideUI } from './plugin-guide';
import { abacusCard } from './abacus-card';
export function providersUI(api: any, refresh: () => Promise<void>, notice: (s: string) => void) {
  const page = document.querySelector('.settings-page[data-category=account]')!;
  // v0.5.1: no separate "main AI" setting. The model chosen in the chat decides; the main
  // process remembers its provider for background jobs (see 'default-model' in main.cjs).
  // Default model: what Charles starts with and what every new chat uses.
  const primary = document.createElement('section');
  primary.className = 'setting-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Varsayılan model';
  const about = document.createElement('p');
  about.className = 'hint';
  about.textContent =
    'Charles açıldığında ve yeni sohbetlerde bu model seçili gelir. Sohbet sırasında mesaj kutusundan başka model seçebilirsin; bu ayar değişmez.';
  const choice = document.createElement('select');
  choice.setAttribute('aria-label', 'Varsayılan model');
  primary.append(heading, about, choice);
  page.prepend(primary);
  async function fillDefaults() {
    const [list, saved] = await Promise.all([api.models(), api.startupModel()]);
    choice.replaceChildren(new Option('Son kullandığım model', '__last__'));
    const gpt = list.filter((m: any) => !/^(gemini|claude|cursor|abacus):/.test(m.id));
    if (gpt.length)
      choice.add(
        new Option(
          'GPT · Otomatik (' + (gpt.find((m: any) => m.isDefault)?.name || 'GPT') + ')',
          '',
        ),
      );
    for (const m of list) choice.add(new Option(m.name, m.id));
    const value = saved === null || saved === undefined ? '__last__' : saved;
    if (![...choice.options].some((o) => o.value === value))
      choice.add(new Option(value + ' (bağlı değil)', value));
    choice.value = value;
  }
  choice.onchange = async () => {
    try {
      const value = choice.value === '__last__' ? null : choice.value;
      await api.startupModel(value);
      document.dispatchEvent(new CustomEvent('charles-startup-model', { detail: value }));
      notice(
        value === null
          ? 'Charles son kullandığın modelle açılacak.'
          : 'Charles açılışta ve yeni sohbetlerde ' +
              choice.selectedOptions[0].textContent +
              ' ile başlayacak.',
      );
    } catch (e) {
      notice((e as Error).message);
    }
  };
  void fillDefaults().catch(() => {});
  document.addEventListener('charles-account', () => void fillDefaults().catch(() => {}));
  document
    .querySelector('#settings-categories [data-category=account]')
    ?.addEventListener('click', () => void fillDefaults().catch(() => {}));
  const results = new Map<string, HTMLElement>(),
    buttons = new Map<string, HTMLButtonElement>();
  const gpt = document.createElement('section');
  gpt.className = 'setting-section provider-card';
  gpt.dataset.provider = 'gpt';
  const original = document.getElementById('connect')!.parentElement!;
  const oldHeading = original.previousElementSibling;
  if (oldHeading?.tagName === 'H3') oldHeading.remove();
  gpt.innerHTML =
    '<h3>GPT hesabı</h3><p class="hint">ChatGPT hesabınla Codex üzerinden bağlan. Giriş tamamlandığında GPT modelleri mesaj kutusundaki model listesine eklenir.</p>';
  const gptResult = document.createElement('p');
  gptResult.className = 'hint';
  gptResult.setAttribute('role', 'status');
  gptResult.textContent = 'Giriş bekleniyor';
  original.classList.add('provider-actions');
  const guide = pluginGuideUI(api, notice, async () => {
    await sync();
    await refresh();
    document.getElementById('gpt-check')?.click();
  });
  const gptSetup = document.createElement('button');
  gptSetup.type = 'button';
  gptSetup.className = 'primary';
  gptSetup.textContent = 'Charles ile kur';
  gptSetup.onclick = () => void guide('gpt-login');
  original.prepend(gptSetup);
  // v0.7.0: GPT gets the same "check connection" button as the other accounts
  const gptCheck = document.createElement('button');
  gptCheck.id = 'gpt-check';
  gptCheck.type = 'button';
  gptCheck.textContent = 'Bağlantıyı kontrol et';
  original.append(gptCheck);
  gpt.append(original, gptResult);
  primary.after(gpt);
  document.getElementById('mode-hint')!.hidden = true;
  let cardTail: HTMLElement = gpt;
  document.addEventListener('charles-account', (e: any) => {
    gptResult.textContent = e.detail.signedIn
      ? 'Bağlı · ' + (e.detail.plan || 'ChatGPT')
      : 'Giriş yapılmadı';
  });
  let pendingUntil = 0,
    busy = false,
    last = '';
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
        const result = results.get(s.id),
          button = buttons.get(s.id);
        if (result)
          result.textContent = s.signedIn
            ? 'Bağlı · Modeller kullanıma hazır'
            : !s.installed
              ? 'Giriş aracı eksik; paketin tamamını çıkar.'
              : 'Giriş yapılmadı';
        // v0.7.0: like GPT, a connected account's sign-in button turns into a "connected" state
        if (button) {
          const name = button.dataset.name || '';
          button.disabled = !s.installed || !!s.signedIn;
          button.classList.toggle('connected', !!s.signedIn);
          button.textContent = s.signedIn ? '✓ ' + name + ' bağlı' : name + ' ile giriş';
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
    ['gemini', 'Gemini'],
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
        ? 'Cursor hesabınla resmi Cursor Agent üzerinden bağlan. Bağlantı sohbet modunda çalışır.'
        : id === 'gemini'
          ? 'Google hesabınla Antigravity üzerinden bağlan. Nasıl yapılacağını bilmiyorsan Charles ile kur’a bas; Slime adım adım anlatır. Sesli görüşme (Gemini Live) için ayrı bir API anahtarı gerekir; aşağıdaki Gemini Live bölümüne bak.'
          : 'Claude hesabınla Claude Code üzerinden bağlan. Claude Code erişimi olan bir abonelik (Pro veya Max) gerekir; ücretsiz web hesabı bu erişimi sağlamaz.';
    const result = document.createElement('p');
    result.className = 'hint';
    result.setAttribute('role', 'status');
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
    check.onclick = () => void sync();
    login.onclick = async () => {
      login.disabled = true;
      result.textContent = 'Giriş penceresi açılıyor…';
      try {
        const loginResult = await api.providersLogin(id);
        if (loginResult.signedIn) {
          result.textContent = 'Bağlı · Modeller kullanıma hazır';
          await sync();
          await refresh();
        } else {
          pendingUntil = Date.now() + 10 * 60 * 1000;
          result.textContent =
            'Giriş penceresi açıldı. Hesabın ve model adı görünüyorsa giriş tamamdır; pencereyi kapatıp Charles’a dönebilirsin.';
        }
      } catch (e) {
        result.textContent = (e as Error).message;
      } finally {
        login.disabled = false;
      }
    };
    actions.append(login);
    // v0.6.5 Gemini, v0.7.1 all accounts: step-by-step sign-in next to Slime. Every card has
    // the same order: Charles ile kur · sign in / ✓ connected · check connection.
    const setup = document.createElement('button');
    setup.type = 'button';
    setup.className = 'primary';
    setup.textContent = 'Charles ile kur';
    setup.onclick = () => void guide(id + '-login');
    login.classList.remove('primary');
    actions.prepend(setup);
    actions.append(check);
    section.append(title, note, actions, result);
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
