// v0.9.6: Ayarlar → AI Modelleri → EVREN. An OpenAI-compatible HTTP API, so there is no
// sign-in window: the user pastes their EVREN API key and presses "Bağlantıyı test et".
// The key is stored encrypted in %APPDATA%\Charles (evren.enc.json, Windows safeStorage) -
// never in the project folder or the release package. EVREN may also ask for its usage terms
// to be accepted once; the folded "Kullanım şartları" block reads and accepts them.
type Status = { id: string; signedIn: boolean; configured?: boolean };

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

export function evrenCard(
  api: any,
  notice: (s: string) => void,
  changed: () => Promise<void>,
  guide: (id: string) => unknown = () => {},
) {
  const section = el('section', 'setting-section provider-card evren-card');
  section.dataset.provider = 'evren';
  const title = el('h3', '', 'EVREN hesabı');
  const note = el(
    'p',
    'hint',
    'EVREN API anahtarınla bağlan. Nasıl yapılacağını bilmiyorsan Charles ile kur’a bas; Slime adım adım anlatır. Anahtar Windows güvenli şifrelemesiyle %APPDATA%\\Charles klasöründe saklanır; proje klasöründe ve sürüm paketinde tutulmaz.',
  );
  // v0.9.8: the same order as the other accounts: Charles ile kur · state · test · page
  const actions = el('div', 'row provider-actions');
  const setup = btn('Charles ile kur', 'primary');
  setup.onclick = () => void guide('evren-login');
  const state = btn('Anahtar eklenmedi', 'evren-state');
  state.disabled = true;
  const test = btn('Bağlantıyı test et');
  const login = btn('EVREN sayfası');
  login.onclick = () => void api.openLink('https://evren.ssyz.org.tr/').catch((e: Error) => (result.textContent = e.message));
  actions.append(setup, state, test, login);
  const result = el('p', 'hint');
  result.setAttribute('role', 'status');
  result.textContent = 'Hesap kontrol ediliyor…';
  // the key itself, folded like Gemini Live's "Anahtar ayarları"
  const keyBox = document.createElement('details');
  keyBox.className = 'evren-key';
  const keySummary = document.createElement('summary');
  keySummary.textContent = 'Anahtar ayarları';
  const key = document.createElement('input');
  key.type = 'password';
  key.autocomplete = 'off';
  key.placeholder = 'EVREN API anahtarı';
  key.setAttribute('aria-label', 'EVREN API anahtarı');
  const save = btn('Anahtarı kaydet');
  const clear = btn('Anahtarı sil');
  const keyRow = el('div', 'button-row');
  keyRow.append(save, clear);
  keyBox.append(keySummary, key, keyRow);
  const terms = document.createElement('details');
  terms.className = 'evren-terms';
  const summary = document.createElement('summary');
  summary.textContent = 'Kullanım şartları';
  const termsHint = el('p', 'hint', 'EVREN kullanım şartlarını okuyup kabul etmeni isteyebilir.');
  const termsBody = el('p', 'hint');
  const accept = btn('Şartları kabul et', 'primary');
  const termsActions = el('div', 'button-row');
  termsActions.append(accept);
  terms.append(summary, termsHint, termsBody, termsActions);
  terms.hidden = true;
  section.append(title, note, actions, result, keyBox, terms);
  let busy = false;
  let accepted: boolean | null = null;

  function update(s: Status) {
    const has = !!s.configured || !!s.signedIn;
    if (!busy)
      result.textContent = s.signedIn
        ? 'Bağlı · Modeller kullanıma hazır'
        : has
          ? 'Anahtar kaydedildi. Bağlantıyı test et\'e bas.'
          : 'Anahtar eklenmedi';
    test.disabled = !has || busy;
    clear.hidden = !has;
    key.placeholder = has ? 'Kayıtlı anahtarı değiştirmek için yenisini gir' : 'EVREN API anahtarı';
    terms.hidden = !has;
    section.classList.toggle('connected', !!s.signedIn);
    state.classList.toggle('connected', !!s.signedIn);
    state.textContent = s.signedIn ? '✓ EVREN bağlı' : has ? 'Anahtar kayıtlı' : 'Anahtar eklenmedi';
    if (has && accepted === null && !terms.open) void loadTerms();
  }

  async function loadTerms() {
    try {
      const value = await api.evrenTerms();
      accepted = !!value.accepted;
      accept.hidden = !!value.accepted;
      termsBody.textContent = value.accepted
        ? 'Şartlar kabul edildi.'
        : String(value.text || '').slice(0, 4000);
    } catch (e) {
      accepted = null;
      termsBody.textContent = (e as Error).message;
    }
  }
  terms.addEventListener('toggle', () => {
    if (terms.open) void loadTerms();
  });
  accept.onclick = async () => {
    accept.disabled = true;
    try {
      await api.evrenTermsAccept();
      accepted = true;
      accept.hidden = true;
      termsBody.textContent = 'Şartlar kabul edildi.';
    } catch (e) {
      termsBody.textContent = (e as Error).message;
    } finally {
      accept.disabled = false;
    }
  };
  save.onclick = async () => {
    const value = key.value.trim();
    if (!value) {
      result.textContent = 'Önce anahtarını gir.';
      return;
    }
    save.disabled = true;
    try {
      const s = await api.evrenKeySave(value);
      key.value = '';
      accepted = null;
      result.textContent = 'Anahtar kaydedildi. Bağlantıyı test et\'e bas.';
      update({ id: 'evren', signedIn: false, configured: !!s?.configured });
      await changed();
    } catch (e) {
      result.textContent = (e as Error).message;
    } finally {
      save.disabled = false;
    }
  };
  clear.onclick = async () => {
    clear.disabled = true;
    try {
      await api.evrenKeyClear();
      accepted = null;
      terms.hidden = true;
      result.textContent = 'Anahtar silindi.';
      update({ id: 'evren', signedIn: false, configured: false });
      await changed();
    } catch (e) {
      result.textContent = (e as Error).message;
    } finally {
      clear.disabled = false;
    }
  };
  test.onclick = async () => {
    busy = true;
    test.disabled = true;
    result.textContent = 'EVREN bağlantısı test ediliyor';
    try {
      const r = await api.providersEvrenTest();
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