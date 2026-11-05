import { weeklySummaryUI } from './weekly-summary';
import { pushToTalk } from './push-to-talk';
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
  note.textContent =
    'Kaydet düğmesine tıkla, ardından kısayol tuşlarına birlikte bas. Esc ile vazgeç.';
  page.append(note);
  const inputs: Record<string, HTMLInputElement> = {};
  let recording: HTMLButtonElement | null = null,
    recordTimer: ReturnType<typeof setTimeout>;
  const end = () => {
    clearTimeout(recordTimer);
    if (recording) {
      recording.textContent = 'Tuşları kaydet';
      recording = null;
      void api.shortcutsRecord(false);
    }
  };
  window.addEventListener('blur', end);
  document.getElementById('settings-panel')!.addEventListener('close', end);
  for (const [id, label] of Object.entries(labels)) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const title = document.createElement('span');
    title.textContent = label;
    row.append(title);
    const input = document.createElement('input');
    input.readOnly = true;
    input.setAttribute('aria-label', label);
    input.placeholder = 'Atanmadı';
    const record = document.createElement('button');
    record.textContent = 'Tuşları kaydet';
    record.dataset.shortcut = id;
    record.onclick = async () => {
      end();
      try {
        await api.shortcutsRecord(true);
        recording = record;
        record.textContent = 'Tuşlara bas…';
        record.focus();
        recordTimer = setTimeout(end, 25000);
      } catch (e) {
        notice((e as Error).message);
      }
    };
    record.onkeydown = (e) => {
      if (recording !== record) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        end();
        return;
      }
      const key =
        (
          {
            ArrowLeft: 'Left',
            ArrowRight: 'Right',
            ArrowUp: 'Up',
            ArrowDown: 'Down',
            ' ': 'Space',
          } as any
        )[e.key] || e.key.toUpperCase();
      if (!/^[A-Z0-9]$|^F(?:[1-9]|1[0-9]|2[0-4])$|^(Left|Right|Up|Down|Space|Enter)$/.test(key))
        return;
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        notice('Ctrl, Alt veya Windows tuşuyla birlikte bir tuşa bas.');
        return;
      }
      input.value = [
        e.ctrlKey ? 'CommandOrControl' : '',
        e.altKey ? 'Alt' : '',
        e.shiftKey ? 'Shift' : '',
        e.metaKey ? 'Super' : '',
        key,
      ]
        .filter(Boolean)
        .join('+');
      end();
      notice('Kısayol yakalandı. Kısayolları kaydet düğmesiyle uygula.');
    };
    const clear = document.createElement('button');
    clear.textContent = 'Kaldır';
    clear.onclick = () => {
      end();
      input.value = '';
    };
    row.append(input, record, clear);
    page.append(row);
    inputs[id] = input;
  }
  let defaults: any;
  const paint = (v: any) => {
    defaults = v.defaults;
    for (const [id, key] of Object.entries(v.values)) {
      // Show "Ctrl" instead of Electron's long "CommandOrControl" (mapped back on save).
      inputs[id].value = String(key).replace(/CommandOrControl/g, 'Ctrl');
      inputs[id].setAttribute('aria-invalid', String(!!v.errors[id]));
      inputs[id].closest('.shortcut-row')?.classList.toggle('shortcut-conflict', !!v.errors[id]);
    }
    note.textContent = Object.keys(v.errors).length
      ? 'Başka bir uygulama kullanıyor veya Windows izin vermiyor: ' +
        Object.keys(v.errors)
          .map((id) => labels[id] || id)
          .join(', ') +
        '. İlgili satırdan farklı bir tuş birleşimi kaydet.'
      : 'Kısayollar herhangi bir uygulamadayken çalışır.';
  };
  void api.shortcutsRead().then(paint);
  const save = document.createElement('button');
  save.textContent = 'Kısayolları kaydet';
  save.onclick = () =>
    void api
      .shortcutsSave(
        Object.fromEntries(
          Object.entries(inputs).map(([id, i]) => [
            id,
            i.value.replace(/(^|\+)Ctrl(?=\+|$)/g, '$1CommandOrControl'),
          ]),
        ),
      )
      .then(paint)
      .catch((e: Error) => notice(e.message));
  const reset = document.createElement('button');
  reset.textContent = 'Varsayılana dön';
  reset.onclick = () =>
    void api
      .shortcutsSave(defaults)
      .then(paint)
      .catch((e: Error) => notice(e.message));
  page.append(save, reset);
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
      const items = document.querySelectorAll<HTMLDetailsElement>(
        '.activity[data-type=commandExecution]',
      );
      const last = items[items.length - 1];
      if (last) {
        (last.closest('.activity-group') as HTMLDetailsElement).open = true;
        last.open = true;
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
