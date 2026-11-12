// v0.9.27: Ayarlar → AI Modelleri → Kimi, GitHub Copilot, OpenCode. Each is reached through its own
// official command line tool, which whoever has the account installs (as with Abacus AI). Charles
// finds the tool, helps with the sign-in and checks the connection with one tiny message; the models
// the account offers are then listed under that AI in the model menu. Nothing says "connected"
// before the tool really answered.
//
// The card is the same as every other account's: Charles ile kur · sign in (✓ connected once signed
// in) · Bağlantıyı kontrol et, and one status line. Kimi signs in without a console window: its
// tool gives a code, shown under the status line until the account confirmed it.
type Status = { id: string; installed: boolean; signedIn: boolean };
type Kind = 'kimi' | 'copilot' | 'opencode';

const CARDS: Record<Kind, { name: string; note: string; opened: string }> = {
  kimi: {
    name: 'Kimi',
    note: 'Kimi hesabınla Kimi Code üzerinden bağlan. Hesabının planı neye izin veriyorsa o kullanılır; modeller, akıl yürütme düzeyi ve kalan kullanım hesabından okunur.',
    opened: '',
  },
  copilot: {
    name: 'GitHub Copilot',
    note: 'GitHub hesabınla GitHub Copilot’un komut satırı aracı üzerinden bağlan. Hesabının Copilot planı neye izin veriyorsa o kullanılır.',
    opened: 'Giriş penceresi açıldı. Tarayıcıda GitHub hesabınla izin ver, sonra pencereyi kapat ve Bağlantıyı kontrol et’e bas.',
  },
  opencode: {
    name: 'OpenCode',
    note: 'OpenCode üzerinden bağlan. Giriş penceresinde bir sağlayıcı seçersin (ücretsiz modeller için OpenCode Zen); hangi modeller varsa onlar listelenir.',
    opened: 'Giriş penceresi açıldı. Bir sağlayıcı seçip girişi tamamla, sonra pencereyi kapat ve Bağlantıyı kontrol et’e bas.',
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
  // Kimi's sign-in: the code its tool gave
  const code = el('div', 'cli-code');
  code.hidden = true;
  const codeHint = el('p', 'hint', 'Tarayıcıda açılan Kimi sayfasında hesabınla giriş yap ve bu kodu onayla:');
  const codeValue = el('strong', 'cli-code-value');
  codeValue.setAttribute('translate', 'no');
  const open = btn('Sayfayı yeniden aç');
  code.append(codeHint, codeValue, open);
  section.append(title, note, actions, result, code);
  let busy = false;
  let poll = 0;
  let link = '';
  // what the tool last answered when it was not "connected": it stays until the state changes
  let refusal = '';
  let known: Status = { id: kind, installed: false, signedIn: false };

  function update(s: Status) {
    known = s;
    if (s.signedIn) refusal = '';
    if (!busy && !poll && !refusal)
      result.textContent = s.signedIn ? 'Bağlı · Modeller kullanıma hazır' : !s.installed ? card.name + ' aracı bu bilgisayarda kurulu değil. Charles ile kur’a bas; adım adım anlatır.' : 'Giriş yapılmadı';
    login.disabled = !s.installed || !!s.signedIn || busy;
    test.disabled = !s.installed || busy;
    login.classList.toggle('connected', !!s.signedIn);
    login.textContent = s.signedIn ? '✓ ' + card.name + ' bağlı' : card.name + ' ile giriş';
    if (s.signedIn) stopPolling();
  }
  function stopPolling() {
    window.clearInterval(poll);
    poll = 0;
    code.hidden = true;
  }
  open.onclick = () => link && void api.openLink(link).catch((e: Error) => (result.textContent = e.message));

  login.onclick = async () => {
    if (busy) return;
    busy = true;
    login.disabled = true;
    refusal = '';
    result.textContent = kind === 'kimi' ? 'Kimi girişi başlatılıyor…' : 'Giriş penceresi açılıyor…';
    try {
      const r = await api.providersLogin(kind);
      if (r?.signedIn) {
        result.textContent = 'Bağlı · Modeller kullanıma hazır';
        await changed();
      } else if (kind === 'kimi' && r?.url && r?.code) {
        link = String(r.url);
        codeValue.textContent = String(r.code);
        code.hidden = false;
        result.textContent = 'Kimi onayı bekleniyor…';
        // the tool waits for the approval; the card asks how it stands until it ends
        let asked = 0;
        window.clearInterval(poll);
        poll = window.setInterval(async () => {
          const s = await api.kimiLoginState().catch(() => null);
          if (!s || (s.pending && ++asked < 300)) return;
          stopPolling();
          result.textContent = s.signedIn ? 'Bağlı · Modeller kullanıma hazır' : s.message || 'Kimi girişi tamamlanmadı. Yeniden dene.';
          if (!s.signedIn) refusal = result.textContent;
          await changed().catch(() => {});
        }, 2000);
      } else if (kind === 'kimi') {
        result.textContent = String(r?.message || 'Kimi girişi başlatılamadı. Yeniden dene.');
        refusal = result.textContent;
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
      await changed().catch(() => {});
      update(known);
    }
  };
  return { section, update };
}
