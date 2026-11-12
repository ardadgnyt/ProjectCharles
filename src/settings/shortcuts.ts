import { weeklySummaryUI } from './weekly-summary';
import { pushToTalk } from './push-to-talk';
import { keyName, MODIFIER_KEYS } from './key-names';
import { keyChips, statusLine } from './shortcut-view';
// v0.9.26: a recorded shortcut is applied at once (no separate Save button), and each row says in
// itself what happened: the page's notice line sits behind the Settings window, so a refused key
// and a saved one both looked like nothing. Keys are read by their place on the keyboard.
// v0.9.27: "saved" leaves by itself, a new action clears the old answer, and the keys are shown
// as labels that wrap instead of a text field that cut the third key off (shortcut-view.ts).
const REASONS: Record<string, string> = {
  invalid: 'Bu tuş kısayol olamaz. Harf, rakam, F, ok veya gezinme tuşu seç.',
  modifier: 'Ctrl, Alt veya Windows tuşuyla birlikte bir tuşa bas.',
  duplicate: 'Bu kısayol zaten şurada kullanılıyor:',
  reserved: 'Bu kısayolu Bas-konuş kullanıyor. Başka bir tuş seç.',
  'in-use': 'Başka bir uygulama bu kısayolu kullanıyor veya Windows izin vermiyor. Önceki kısayol çalışmaya devam ediyor.',
};
export function shortcutsUI(api: any, notice: (s: string) => void) {
  const $ = (id: string) => document.getElementById(id)!;
  const page = document.querySelector('.settings-page[data-category=shortcuts]')!;
  const labels: Record<string, string> = {
    chat: 'Sohbeti aç',
    alert: 'Uyarıya atla',
    terminal: 'Son terminal işlemi',
    next: 'Sonraki sohbet',
    previous: 'Önceki sohbet',
    voice: 'Sesli görüşme',
    dictate: 'Dikte et',
    pet: 'Slime’ı masaüstüne gönder',
    wardrobe: 'Gardırop',
    capture: 'Ekrandan alan seç',
  };
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'Tuşları kaydet’e tıkla, ardından kısayol tuşlarına birlikte bas. Yeni kısayol hemen çalışır; Esc ile vazgeç.';
  page.append(note);
  const inputs: Record<string, ReturnType<typeof keyChips>> = {};
  const statuses: Record<string, ReturnType<typeof statusLine>> = {};
  const buttons: Record<string, HTMLButtonElement> = {};
  let recording: string | null = null,
    recordTimer: ReturnType<typeof setTimeout>;
  /** The row's own answer line; `parts` are separate so each one is translated by itself. */
  const say = (id: string, kind: 'ok' | 'error' | 'wait' | '', ...parts: string[]) => statuses[id].say(kind, ...parts);
  /** A new action anywhere on the page: answers that only said "done" are over. */
  const fresh = (except = '') => {
    for (const [id, s] of Object.entries(statuses)) if (id !== except && s.kind() === 'ok') s.clear();
    if (resetStatus.kind() === 'ok') resetStatus.clear();
  };
  const end = () => {
    clearTimeout(recordTimer);
    if (!recording) return;
    const id = recording;
    recording = null;
    buttons[id].textContent = 'Tuşları kaydet';
    if (statuses[id].kind() === 'wait') say(id, '');
    void api.shortcutsRecord(false);
  };
  window.addEventListener('blur', end);
  document.getElementById('settings-panel')!.addEventListener('close', end);
  let values: Record<string, string> = {};
  const paint = (v: any) => {
    values = v.values;
    defaults = v.defaults;
    for (const [id, key] of Object.entries(v.values as Record<string, string>)) {
      if (!inputs[id]) continue;
      // Show "Ctrl" instead of Electron's long "CommandOrControl"
      inputs[id].set(String(key));
      inputs[id].invalid(!!v.errors[id]);
      inputs[id].el.closest('.shortcut-row')?.classList.toggle('shortcut-conflict', !!v.errors[id]);
      if (v.errors[id] && statuses[id].kind() !== 'ok') say(id, 'error', REASONS['in-use']);
    }
    note.textContent = Object.keys(v.errors).length
      ? 'Bazı kısayolları başka bir uygulama kullanıyor veya Windows izin vermiyor. İlgili satırdan farklı bir tuş birleşimi kaydet.'
      : 'Kısayollar herhangi bir uygulamadayken çalışır.';
  };
  const apply = async (id: string, key: string, done: string) => {
    try {
      const r = await api.shortcutsApply(id, key);
      if (r?.ok) {
        paint(r);
        say(id, 'ok', done);
      } else if (r?.reason === 'duplicate') say(id, 'error', REASONS.duplicate, labels[r.with] || String(r.with || ''));
      else say(id, 'error', REASONS[r?.reason] || REASONS.invalid);
    } catch (e) {
      say(id, 'error', (e as Error).message);
    } finally {
      // whatever the answer, recording is over; the shortcuts that work are back
      if (recording === id) end();
    }
  };
  for (const [id, label] of Object.entries(labels)) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const title = document.createElement('span');
    title.className = 'shortcut-title';
    title.id = 'shortcut-title-' + id;
    title.textContent = label;
    row.append(title);
    const input = keyChips(title.id);
    const record = document.createElement('button');
    record.type = 'button';
    record.textContent = 'Tuşları kaydet';
    record.dataset.shortcut = id;
    record.onclick = async () => {
      if (recording === id) return end();
      end();
      fresh();
      try {
        await api.shortcutsRecord(true);
        recording = id;
        record.textContent = 'Tuşlara bas…';
        say(id, 'wait', 'Ctrl, Alt veya Windows tuşuyla birlikte bir tuşa bas. Esc ile vazgeç.');
        record.focus();
        recordTimer = setTimeout(end, 25000);
      } catch (e) {
        say(id, 'error', (e as Error).message);
      }
    };
    record.onkeydown = (e) => {
      if (recording !== id) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || MODIFIER_KEYS.includes(e.key)) return;
      if (e.key === 'Escape') {
        end();
        return;
      }
      const name = keyName(e);
      if (!name) return say(id, 'error', REASONS.invalid);
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return say(id, 'error', REASONS.modifier);
      const key = [e.ctrlKey ? 'CommandOrControl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.metaKey ? 'Super' : '', name]
        .filter(Boolean)
        .join('+');
      input.set(key);
      say(id, 'wait', 'Kaydediliyor…');
      void apply(id, key, 'Kaydedildi.').then(() => {
        input.set(values[id] || '');
      });
    };
    record.onblur = () => {
      if (recording === id) end();
    };
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Kaldır';
    clear.onclick = () => {
      end();
      fresh();
      void apply(id, '', 'Kısayol kapatıldı.');
    };
    const status = document.createElement('small');
    status.className = 'shortcut-status';
    row.append(input.el, record, clear, status);
    page.append(row);
    inputs[id] = input;
    statuses[id] = statusLine(status);
    buttons[id] = record;
  }
  let defaults: any;
  void api.shortcutsRead().then(paint);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Varsayılana dön';
  const resetLine = document.createElement('small');
  resetLine.className = 'shortcut-status shortcut-status-page';
  const resetStatus = statusLine(resetLine);
  reset.onclick = () => {
    end();
    fresh();
    void api
      .shortcutsSave(defaults)
      .then((v: any) => {
        paint(v);
        for (const id of Object.keys(labels)) say(id, '');
        resetStatus.say('ok', 'Varsayılan kısayollar geri geldi.');
      })
      .catch((e: Error) => resetStatus.say('error', e.message));
  };
  page.append(reset, resetLine);
  api.onShortcut(async (id: string) => {
    if (id === 'weekly') {
      $('settings-toggle').click();
      document.querySelector<HTMLButtonElement>('[data-category=weekly]')!.click();
    } else if (id === 'voice') $('voice-call').click();
    else if (id === 'dictate') $('voice-mic').click();
    else if (id === 'wardrobe') {
      $('settings-toggle').click();
      document.querySelector<HTMLButtonElement>('[data-category=look]')!.click();
      document.querySelector('#wardrobe')?.scrollIntoView({ block: 'center' });
    } else if (id === 'next' || id === 'previous') {
      const s = $('sessions') as HTMLSelectElement;
      if (s.options.length) {
        s.selectedIndex =
          (s.selectedIndex + (id === 'next' ? 1 : -1) + s.options.length) % s.options.length;
        s.dispatchEvent(new Event('change'));
      }
    } else if (id === 'terminal') {
      const items = document.querySelectorAll<HTMLElement>('#feed .step[data-type=commandExecution]');
      const last = items[items.length - 1];
      if (last) {
        (last.closest('.steps') as HTMLDetailsElement).open = true;
        // a command with no output is a plain line: there is nothing to open
        if (last instanceof HTMLDetailsElement) last.open = true;
        last.scrollIntoView({ block: 'center' });
      } else notice('Bu sohbette terminal işlemi yok.');
    } else if (id === 'alert') {
      const target = document.querySelector<HTMLElement>('#requests:not(:empty),.message.error');
      if (target) target.scrollIntoView({ block: 'center' });
      else $('sessions-toggle').click();
    } else $('prompt').focus();
  });
  pushToTalk(api, page, notice);
  const weekly = document.querySelector('.settings-page[data-category=weekly]')!;
  const { load: loadSummary } = weeklySummaryUI(weekly, api, notice);
  void loadSummary();
  document
    .querySelector<HTMLButtonElement>('button[data-category=weekly]')!
    .addEventListener('click', () => void loadSummary());
  setInterval(() => {
    if (!(weekly as HTMLElement).hidden && ($('settings-panel') as HTMLDialogElement).open) void loadSummary();
  }, 15000);
  api.onWeekly(() => {
    void loadSummary();
    notice('Haftalık özetin hazır. Ayarlar → Haftalık özet.');
  });
}
