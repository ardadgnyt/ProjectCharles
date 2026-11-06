// v0.9.18: Ayarlar → Kısayollar → Bas-konuş. A single key or a key combination.
// v0.9.22: two keys pressed together too (Right + Up). The answer stands in the card: the page's
// notice line is behind the settings window, so a refused key looked as if nothing had happened.
const NAMES: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ' ': 'Space' };
const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'];
// keys that can stand alone or join another, as app/voice/dictation.cjs accepts them
const QUIET = /^(Left|Up|Right|Down|Insert|Home|End|PageUp|PageDown|Pause|ScrollLock|CapsLock|F([1-9]|1[0-9]|2[0-4]))$/;
const RECORD_MS = 25000;
const nameOf = (e: KeyboardEvent) => NAMES[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
export const shownKey = (key: string) => key.replace(/CommandOrControl/g, 'Ctrl').replace(/\+/g, ' + ');

export function pushToTalk(api: any, page: Element, notice: (s: string) => void) {
  const card = document.createElement('section');
  card.className = 'ptt-card';
  const title = document.createElement('h4');
  title.textContent = 'Bas-konuş';
  const about = document.createElement('p');
  about.className = 'hint';
  about.textContent = 'Herhangi bir uygulamada kısayolu basılı tut, konuş, bırak: söylediklerin imlecin olduğu yere yazılır. Hızlı iki basış eller serbest kaydı başlatır, aynı kısayol bitirir; Esc iptal eder.';
  const privacy = document.createElement('p');
  privacy.className = 'hint';
  privacy.textContent = 'Ses bilgisayarından çıkmaz: konuşma yerel Whisper modeliyle yazıya çevrilir, ses kaydı saklanmaz. Açıkken kısayolun bir tuşuna tek başına basarsan tuş normal işlevini çok kısa bir gecikmeyle yapar.';
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  label.append(box, ' Bas-konuşu kullan');
  const input = document.createElement('input');
  input.readOnly = true;
  input.setAttribute('aria-label', 'Bas-konuş kısayolu');
  const record = document.createElement('button');
  record.type = 'button';
  record.textContent = 'Tuşu kaydet';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Varsayılana dön';
  const row = document.createElement('div');
  row.className = 'ptt-row';
  row.append(label, input, record, reset);
  const status = document.createElement('p');
  status.className = 'ptt-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  card.append(title, about, row, status, privacy);
  page.append(card);
  const say = (text: string, kind: 'ok' | 'error' | 'wait' = 'error') => {
    status.textContent = text;
    status.dataset.kind = kind;
    status.hidden = !text;
  };
  let fallback = 'Right+Up';
  let key = '';
  let recording = false;
  let recordTimer: ReturnType<typeof setTimeout>;
  // the first key of what may be a pair, and whether the second one arrived
  let first = '';
  const paint = (v: any) => {
    box.checked = v.enabled;
    key = v.key;
    input.value = shownKey(v.key);
    fallback = v.defaultKey;
    if (!v.available) say('Yerel ses modeli bulunamadı; bas-konuş çalışmaz.');
    if (v.error) say(v.error);
    return v;
  };
  const save = (value: any, done?: string) =>
    api
      .dictationSave(value)
      .then(paint)
      .then((v: any) => {
        if (done && !v.error) say(done, 'ok');
      })
      .catch((e: Error) => {
        say(e.message);
        return api.dictationRead().then(paint);
      });
  void api.dictationRead().then(paint);
  box.onchange = () => save({ enabled: box.checked, key });
  reset.onclick = () => save({ enabled: box.checked, key: fallback }, 'Kısayol kaydedildi.');
  const stop = () => {
    clearTimeout(recordTimer);
    if (!recording) return;
    recording = false;
    first = '';
    record.textContent = 'Tuşu kaydet';
    void api.dictationPause(false);
    if (status.dataset.kind === 'wait') say('');
  };
  const take = (value: string) => {
    stop();
    say('');
    void save({ enabled: box.checked, key: value }, 'Kısayol kaydedildi.');
  };
  record.onclick = () => {
    if (recording) return stop();
    recording = true;
    first = '';
    record.textContent = 'Bir tuşa bas…';
    say('Tek tuşa ya da iki tuşa birlikte bas. Esc ile vazgeç.', 'wait');
    void api.dictationPause(true); // the keys must reach this page while they are being recorded
    record.focus();
    recordTimer = setTimeout(stop, RECORD_MS);
  };
  record.onblur = stop;
  window.addEventListener('blur', stop);
  document.getElementById('settings-panel')?.addEventListener('close', stop);
  record.onkeydown = (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || MODIFIERS.includes(e.key)) return;
    if (e.key === 'Escape') return stop();
    const name = nameOf(e);
    if (first) return take(first + '+' + name);
    if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey)
      return take([e.ctrlKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.metaKey ? 'Super' : '', name].filter(Boolean).join('+'));
    // a key that can be half of a pair waits for the second one, or for its own release
    if (QUIET.test(name)) first = name;
    else take(name);
  };
  record.onkeyup = (e) => {
    if (!recording || !first) return;
    e.preventDefault();
    e.stopPropagation();
    if (nameOf(e) === first) take(first);
  };
}
