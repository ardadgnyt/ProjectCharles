// v0.8.0: Ayarlar → Hesap → Abacus AI. Abacus AI is reached through its official command line
// tool (`abacusai`), which whoever has an Abacus AI account installs; Charles finds it, opens a
// console for /login and tests the connection with one tiny message; the account's models are
// then read from the CLI and listed under Abacus AI in the model menu.
const DOCS = 'https://abacus.ai/help/abacusai-desktop/cli-installation';
type Status = { id: string; installed: boolean; signedIn: boolean };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}
function btn(text: string, cls = '') {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

export function abacusCard(api: any, notice: (s: string) => void, changed: () => Promise<void>, guide: (id: string) => unknown) {
  const section = el('section', 'setting-section provider-card abacus-card');
  section.dataset.provider = 'abacus';
  const title = el('h3', '', 'Abacus AI hesabı');
  const note = el(
    'p',
    'hint',
    'Abacus AI hesabın varsa resmi Abacus AI komut satırı aracıyla bağlan. Araç Charles ile gelmez: önce Abacus AI’ın kurulum sayfasındaki adımlarla kur, sonra Abacus AI ile giriş’e bas ve açılan pencerede /login yaz. Nasıl yapılacağını bilmiyorsan Charles ile kur’a bas; Slime adım adım anlatır. Sohbet modunda salt okunur çalışır.',
  );
  const actions = el('div', 'row provider-actions');
  const docs = btn('Kurulum sayfası');
  docs.onclick = () => void api.openLink(DOCS).catch((e: Error) => notice(e.message));
  // same order as the other accounts: Charles ile kur · sign in / ✓ connected · test
  const setup = btn('Charles ile kur', 'primary');
  setup.onclick = () => void guide('abacus-login');
  const login = btn('Abacus AI ile giriş');
  login.id = 'provider-login-abacus';
  login.dataset.name = 'Abacus AI';
  const test = btn('Bağlantıyı test et');
  actions.append(setup, login, test, docs);
  const result = el('p', 'hint');
  result.setAttribute('role', 'status');
  result.textContent = 'Hesap kontrol ediliyor…';

  // v0.9.8: no "Abacus AI · …" naming note any more: the model menu groups models by provider
  section.append(title, note, actions, result);
  let busy = false;

  function update(s: Status) {
    if (!busy)
      result.textContent = s.signedIn
        ? 'Bağlı · Modeller kullanıma hazır'
        : !s.installed
          ? 'Abacus AI bu bilgisayarda bulunamadı. Kurulum sayfasındaki adımlarla kurduktan sonra Bağlantıyı test et’e bas.'
          : 'Kurulu · Giriş yaptıktan sonra Bağlantıyı test et’e bas.';
    login.disabled = !s.installed || !!s.signedIn;
    test.disabled = !s.installed || busy;
    login.classList.toggle('connected', !!s.signedIn);
    login.textContent = s.signedIn ? '✓ Abacus AI bağlı' : 'Abacus AI ile giriş';
  }
  login.onclick = async () => {
    login.disabled = true;
    result.textContent = 'Giriş penceresi açılıyor…';
    try {
      const r = await api.providersLogin('abacus');
      result.textContent = r.signedIn
        ? 'Bağlı · Modeller kullanıma hazır'
        : 'Giriş penceresi açıldı. /login yazıp hesabınla giriş yap, sonra /exit yaz ve burada Bağlantıyı test et’e bas.';
    } catch (e) {
      result.textContent = (e as Error).message;
    } finally {
      login.disabled = false;
    }
  };
  test.onclick = async () => {
    busy = true;
    test.disabled = true;
    result.textContent = 'Abacus AI’a kısa bir deneme mesajı gönderiliyor…';
    try {
      const r = await api.providersAbacusTest();
      result.textContent = r.message;
      busy = false;
      await changed();
    } catch (e) {
      result.textContent = (e as Error).message;
    } finally {
      busy = false;
      test.disabled = false;
    }
  };
  return { section, update };
}
