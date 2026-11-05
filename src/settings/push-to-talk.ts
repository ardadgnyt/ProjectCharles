// v0.9.18: Ayarlar → Kısayollar → Bas-konuş. A single key or a key combination.
const NAMES: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ' ': 'Space' };

export function pushToTalk(api: any, page: Element, notice: (s: string) => void) {
  const card = document.createElement('section');
  card.className = 'ptt-card';
  const title = document.createElement('h4');
  title.textContent = 'Bas-konuş';
  const about = document.createElement('p');
  about.className = 'hint';
  about.textContent = 'Herhangi bir uygulamada tuşu basılı tut, konuş, bırak: söylediklerin imlecin olduğu yere yazılır. Hızlı iki basış eller serbest kaydı başlatır, aynı tuş bitirir; Esc iptal eder.';
  const privacy = document.createElement('p');
  privacy.className = 'hint';
  privacy.textContent = 'Ses bilgisayarından çıkmaz: konuşma yerel Whisper modeliyle yazıya çevrilir, ses kaydı saklanmaz. Açıkken kısa bir tek basış yaklaşık 0,2 saniye gecikmeyle normal işlevini yapar.';
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
  card.append(title, about, row, privacy);
  page.append(card);
  let fallback = 'Right';
  let recording = false;
  const paint = (v: any) => {
    box.checked = v.enabled;
    input.value = v.key.replace(/CommandOrControl/g, 'Ctrl');
    fallback = v.defaultKey;
    if (!v.available) notice('Yerel ses modeli bulunamadı; bas-konuş çalışmaz.');
    if (v.error) notice(v.error);
  };
  const save = (value: any) =>
    api
      .dictationSave(value)
      .then(paint)
      .catch((e: Error) => {
        notice(e.message);
        void api.dictationRead().then(paint);
      });
  void api.dictationRead().then(paint);
  box.onchange = () => save({ enabled: box.checked, key: input.value });
  reset.onclick = () => save({ enabled: box.checked, key: fallback });
  const stop = () => {
    if (!recording) return;
    recording = false;
    record.textContent = 'Tuşu kaydet';
    void api.dictationPause(false);
  };
  record.onclick = () => {
    recording = true;
    record.textContent = 'Bir tuşa bas…';
    void api.dictationPause(true); // the key must reach this page while it is being recorded
    record.focus();
  };
  record.onblur = stop;
  record.onkeydown = (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stop();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    const key = NAMES[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const value = [e.ctrlKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.metaKey ? 'Super' : '', key].filter(Boolean).join('+');
    stop();
    void save({ enabled: box.checked, key: value });
  };
}
