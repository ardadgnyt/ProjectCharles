// v0.9.6: Ayarlar → AI Modelleri → EVREN. An OpenAI-compatible HTTP API, so there is no
// sign-in window: the user pastes their EVREN API key. The key is stored encrypted in
// %APPDATA%\Charles (evren.enc.json, Windows safeStorage) - never in the project folder or the
// release package.
// v0.9.27: Charles has no terms step of its own. Saving a key checks it against EVREN at once and
// the account is connected by that answer alone. Only when EVREN itself refuses the account for
// its usage terms (403 terms_not_accepted) does the card show EVREN's text and send the real
// acceptance, with the version of the text that was read.
type Status = { id: string; signedIn: boolean; configured?: boolean };
type TestResult = { ok?: boolean; message?: string; terms?: boolean };

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
  const save = btn('Kaydet ve bağlan', 'primary');
  const clear = btn('Anahtarı sil');
  const keyRow = el('div', 'button-row');
  keyRow.append(save, clear);
  keyBox.append(keySummary, key, keyRow);
  // EVREN's own requirement: on screen only after EVREN refused the account for it
  const gate = el('div', 'evren-gate');
  gate.hidden = true;
  const gateText = el('p', 'hint evren-gate-text');
  gateText.setAttribute('translate', 'no');
  gateText.tabIndex = 0;
  gateText.hidden = true;
  const read = btn('EVREN şartlarını göster');
  const accept = btn('Kabul et ve bağlan', 'primary');
  accept.hidden = true;
  const gateRow = el('div', 'button-row');
  gateRow.append(read, accept);
  gate.append(gateText, gateRow);
  section.append(title, note, actions, result, keyBox, gate);
  let busy = false;
  let version: number | null = null;
  // what EVREN last answered when it was not "connected": it stays on the card until the state
  // changes, so the page's regular status check cannot replace the reason with a general line
  let refusal = '';

  function update(s: Status) {
    const has = !!s.configured || !!s.signedIn;
    if (s.signedIn || !has) refusal = '';
    if (!busy && gate.hidden && !refusal)
      result.textContent = s.signedIn
        ? 'Bağlı · Modeller kullanıma hazır'
        : has
          ? 'Anahtar kayıtlı ama bağlantı doğrulanmadı. Bağlantıyı test et’e bas.'
          : 'Anahtar eklenmedi';
    test.disabled = !has || busy;
    clear.hidden = !has;
    key.placeholder = has ? 'Kayıtlı anahtarı değiştirmek için yenisini gir' : 'EVREN API anahtarı';
    if (!has || s.signedIn) closeGate();
    section.classList.toggle('connected', !!s.signedIn);
    state.classList.toggle('connected', !!s.signedIn);
    state.textContent = s.signedIn ? '✓ EVREN bağlı' : has ? 'Anahtar kayıtlı' : 'Anahtar eklenmedi';
  }

  function closeGate() {
    gate.hidden = true;
    gateText.hidden = true;
    gateText.textContent = '';
    accept.hidden = true;
    version = null;
  }

  /** What a real answer from EVREN says: the line, and EVREN's gate only when EVREN raised it. */
  function show(r: TestResult) {
    result.textContent = String(r?.message || (r?.ok ? 'Bağlı · Modeller kullanıma hazır' : 'EVREN bağlantısı kurulamadı.'));
    refusal = r?.ok ? '' : result.textContent;
    if (r?.terms) gate.hidden = false;
    else closeGate();
  }

  async function run(work: () => Promise<TestResult>, waiting: string) {
    if (busy) return;
    busy = true;
    for (const b of [test, save, clear, read, accept]) b.disabled = true;
    result.textContent = waiting;
    try {
      show(await work());
    } catch (e) {
      result.textContent = (e as Error).message;
      refusal = result.textContent;
    } finally {
      busy = false;
      for (const b of [test, save, clear, read, accept]) b.disabled = false;
      await changed().catch(() => {});
    }
  }

  save.onclick = () => {
    const value = key.value.trim();
    if (!value) {
      result.textContent = 'Önce anahtarını gir.';
      return;
    }
    // the box is emptied before anything else, so the key never stays on screen
    key.value = '';
    closeGate();
    refusal = '';
    void run(() => api.evrenConnect(value), 'Anahtar kaydedildi, EVREN bağlantısı doğrulanıyor…');
  };
  key.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save.click();
  });
  test.onclick = () => void run(() => api.providersEvrenTest(), 'EVREN bağlantısı test ediliyor');
  clear.onclick = async () => {
    if (busy) return;
    clear.disabled = true;
    try {
      await api.evrenKeyClear();
      closeGate();
      result.textContent = 'Anahtar silindi.';
      update({ id: 'evren', signedIn: false, configured: false });
      await changed();
    } catch (e) {
      result.textContent = (e as Error).message;
    } finally {
      clear.disabled = false;
    }
  };
  read.onclick = async () => {
    if (busy) return;
    read.disabled = true;
    try {
      const value = await api.evrenTerms();
      if (value?.accepted) {
        // accepted elsewhere meanwhile: nothing to accept, just connect
        closeGate();
        void run(() => api.providersEvrenTest(), 'EVREN bağlantısı test ediliyor');
        return;
      }
      version = Number.isInteger(value?.version) ? value.version : null;
      gateText.textContent = String(value?.text || '').slice(0, 20000);
      gateText.hidden = !gateText.textContent;
      accept.hidden = version === null || !gateText.textContent;
      if (accept.hidden) result.textContent = 'EVREN kullanım şartlarının metni okunamadı. EVREN sayfasından kontrol et.';
    } catch (e) {
      result.textContent = (e as Error).message;
    } finally {
      read.disabled = false;
    }
  };
  accept.onclick = () => {
    const v = version;
    if (v === null) return;
    void run(() => api.evrenTermsAccept(v), 'EVREN’e kabul gönderiliyor…');
  };
  return { section, update };
}
