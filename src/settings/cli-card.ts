// v0.9.27: Ayarlar → AI Modelleri → GitHub Copilot. It is reached through its own official command
// line tool, which whoever has the account installs (as with Abacus AI). Charles finds the tool,
// helps with the sign-in and checks the connection with one tiny message; the models the account's
// plan has are then listed under GitHub Copilot in the model menu. Nothing says "connected" before
// the tool really answered.
//
// The card is the same as every other account's: Charles ile kur · sign in (✓ connected once signed
// in) · Bağlantıyı kontrol et, and one status line.
type Status = { id: string; installed: boolean; signedIn: boolean };
type Kind = 'copilot';

const CARDS: Record<Kind, { name: string; note: string; opened: string }> = {
  copilot: {
    name: 'GitHub Copilot',
    note: 'GitHub hesabınla GitHub Copilot’un komut satırı aracı üzerinden bağlan. Hesabının Copilot planı neye izin veriyorsa o kullanılır; plan değişirse model listesi kendiliğinden güncellenir.',
    opened: 'Giriş penceresi açıldı. Tarayıcıda GitHub hesabınla izin ver, sonra pencereyi kapat ve Bağlantıyı kontrol et’e bas.',
  },
};

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

export function cliCard(kind: Kind, api: any, notice: (s: string) => void, changed: () => Promise<void>, guide: (id: string) => unknown) {
  void notice;
  const card = CARDS[kind];
  const section = el('section', `setting-section provider-card cli-card ${kind}-card`);
  section.dataset.provider = kind;
  const title = el('h3', '', card.name + ' hesabı');
  const note = el('p', 'hint', card.note);
  const actions = el('div', 'row provider-actions');
  // the same order as the other accounts: Charles ile kur · sign in / ✓ connected · check
  const setup = btn('Charles ile kur', 'primary');
  setup.onclick = () => void guide(kind + '-login');
  const login = btn(card.name + ' ile giriş');
  login.id = 'provider-login-' + kind;
  login.dataset.name = card.name;
  const test = btn('Bağlantıyı kontrol et');
  actions.append(setup, login, test);
  const result = el('p', 'hint');
  result.setAttribute('role', 'status');
  result.textContent = 'Hesap kontrol ediliyor…';
  section.append(title, note, actions, result);
  let busy = false;
  // what the tool last answered when it was not "connected": it stays until the state changes
  let refusal = '';
  let known: Status = { id: kind, installed: false, signedIn: false };

  function update(s: Status) {
    known = s;
    if (s.signedIn) refusal = '';
    if (!busy && !refusal)
      result.textContent = s.signedIn ? 'Bağlı · Modeller kullanıma hazır' : !s.installed ? card.name + ' aracı bu bilgisayarda kurulu değil. Charles ile kur’a bas; adım adım anlatır.' : 'Giriş yapılmadı';
    login.disabled = !s.installed || !!s.signedIn || busy;
    test.disabled = !s.installed || busy;
    login.classList.toggle('connected', !!s.signedIn);
    login.textContent = s.signedIn ? '✓ ' + card.name + ' bağlı' : card.name + ' ile giriş';
  }

  login.onclick = async () => {
    if (busy) return;
    busy = true;
    login.disabled = true;
    refusal = '';
    result.textContent = 'Giriş penceresi açılıyor…';
    try {
      const r = await api.providersLogin(kind);
      if (r?.signedIn) {
        result.textContent = 'Bağlı · Modeller kullanıma hazır';
        await changed();
      } else result.textContent = card.opened;
    } catch (e) {
      result.textContent = (e as Error).message;
      refusal = result.textContent;
    } finally {
      busy = false;
      update(known);
    }
  };
  test.onclick = async () => {
    if (busy) return;
    busy = true;
    test.disabled = true;
    refusal = '';
    result.textContent = 'Kontrol ediliyor…';
    try {
      const r = await api.providersKitTest(kind);
      result.textContent = String(r?.message || (r?.ok ? 'Bağlı · Modeller kullanıma hazır' : card.name + ' yanıt vermedi.'));
      if (!r?.ok) refusal = result.textContent;
    } catch (e) {
      result.textContent = (e as Error).message;
      refusal = result.textContent;
    } finally {
      busy = false;
      // the button is back at once, not after every account was asked again
      update(known);
      await changed().catch(() => {});
      update(known);
    }
  };
  return { section, update };
}
