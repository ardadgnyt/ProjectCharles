import { paintSoundButton } from '../ui/sound-button';
import { historyFolders } from '../chat/history-folders';
import { animationLoop } from '../island/animation-loop';
import { Sound } from '../vendor/core/sound';
import { BotEngine, hexToRGB } from '../vendor/slime/engine';
const $ = (id: string) => document.getElementById(id)!;
const input = (id: string) => $(id) as HTMLInputElement;
// v0.7.0: only GitHub is listed, as a "coming in a later version" card. Vercel, Stripe,
// Resend, Notion, Cal.com and n8n were removed from Settings.
const labels: Record<string, string> = {
  github: 'GitHub',
};
const COMING_SOON = true;
const colors = ['#76cfb3', '#d7b6f9', '#9ab8ff', '#ffb3b3', '#e1cf9b', '#a3d9f2', '#efad88'];
export function extraUI(
  api: any,
  bot: BotEngine,
  notice: (s: string) => void,
  attempt: (fn: () => Promise<any>) => any,
  switchRoom: (r: any) => Promise<void>,
) {
  const roomsPanel = $('sessions-panel') as HTMLDialogElement;
  function closeRooms() {
    if (roomsPanel.open) roomsPanel.close();
  }
  $('sessions-toggle').onclick = () => {
    closeSettings();
    roomsPanel.showModal();
  };
  $('sessions-close').onclick = closeRooms;
  roomsPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      closeRooms();
    }
  });
  const settings = $('settings-panel') as HTMLDialogElement;
  function closeSettings() {
    if (settings.open) settings.close();
    closeRooms();
  }
  function showSettings() {
    closeRooms();
    if (!settings.open) settings.showModal();
  }
  $('settings-toggle').onclick = () =>
    attempt(async () => {
      await api.expand(true);
      showSettings();
    });
  $('settings-close').onclick = closeSettings;
  settings.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      closeSettings();
    }
  });
  settings.addEventListener('click', (e) => {
    if (e.target === settings) {
      const b = settings.getBoundingClientRect();
      if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
        closeSettings();
    }
  });
  api.onExpanded((expanded: boolean) => {
    if (!expanded) closeSettings();
  });
  let files: any[] = [],
    current: any = null,
    sessionSignature = '';
  const miniBots: { engine: BotEngine; canvas: HTMLCanvasElement }[] = [];
  let frameTime = performance.now();
  const frame = (now: number) => {
    for (const m of miniBots) {
      if (!m.canvas.getClientRects().length) continue;
      m.engine.update(Math.min(0.05, (now - frameTime) / 1000));
      const ctx = m.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 64);
      m.engine.draw(ctx, 64, 64);
    }
    frameTime = now;
  };
  const previews = animationLoop(
    frame,
    () => settings.open && document.visibilityState === 'visible',
    () => 20,
  );
  new MutationObserver(() => previews.start()).observe(settings, {
    attributes: true,
    attributeFilter: ['open'],
  });
  function attachments() {
    $('drop-actions').hidden = !files.length;
    $('attachments').replaceChildren();
    for (const file of files) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'attachment-chip';
      b.title = 'Eki kaldır: ' + file.name;
      b.setAttribute('aria-label', b.title);
      if (file.thumbnail) {
        const img = document.createElement('img');
        img.src = file.thumbnail;
        img.alt = file.name;
        img.className = 'attachment-thumbnail';
        b.append(img);
      }
      const name = document.createElement('span');
      name.textContent = file.name;
      const remove = document.createElement('span');
      remove.textContent = '×';
      remove.className = 'attachment-remove';
      b.append(name, remove);
      b.onclick = () => {
        files = files.filter((f) => f.id !== file.id);
        attachments();
      };
      $('attachments').append(b);
    }
  }
  async function addFiles(next: any[]) {
    if (files.length + next.length > 5) throw Error('Bir mesajda en fazla beş ek olabilir.');
    const prepared = [];
    for (const file of next) {
      if (file.kind === 'gif') {
        const raw = atob(file.thumbnail.split(',')[1]);
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(raw, (c) => c.charCodeAt(0))], { type: 'image/gif' }),
        );
        try {
          const ratio = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
          canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(Error('GIF okunamadı.'))), 'image/png'),
          );
          const converted = await api.pasteImage(
            new Uint8Array(await blob.arrayBuffer()),
            file.name,
          );
          converted.thumbnail = file.thumbnail;
          prepared.push(converted);
        } finally {
          bitmap.close();
        }
      } else prepared.push(file);
    }
    if (files.length + prepared.length > 5) throw Error('Bir mesajda en fazla beş ek olabilir.');
    files.push(...prepared);
    attachments();
    bot.gulp();
    Sound.play('attach');
    if (next.some((f) => f.kind === 'gif'))
      notice('GIF eklendi. Önizleme hareketlidir; Charles ilk kareyi inceleyecek.');
  }
  api.onCapture(
    (item: any) =>
      void attempt(async () => {
        await addFiles([item]);
        notice('Alan eklendi 📸 Ne sormak istersin?');
        $('prompt').focus();
      }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-file-prompt]').forEach(
    (b) =>
      (b.onclick = () => {
        input('prompt').value = b.dataset.filePrompt!;
        $('prompt').focus();
      }),
  );
  $('attach-file').onclick = () => attempt(async () => addFiles(await api.chooseFiles()));
  let pastePending = false;
  $('prompt').addEventListener('paste', (e) => {
    const images = Array.from(e.clipboardData?.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => !!f);
    if (!images.length) return;
    e.preventDefault();
    if (pastePending) return;
    if (files.length + images.length > 5) {
      notice('Bir mesajda en fazla beş ek olabilir.');
      return;
    }
    pastePending = true;
    void attempt(async () => {
      try {
        for (const image of images) {
          if (image.size > 20 * 1024 * 1024) throw Error('Resim en fazla 20 MB olabilir.');
          await addFiles([await api.pasteImage(new Uint8Array(await image.arrayBuffer()))]);
        }
      } finally {
        pastePending = false;
      }
    });
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.some((t) => t === 'Files' || t === 'text/plain')) return;
    e.preventDefault();
    dragDepth++;
    document.body.classList.add('dropping');
    bot.animateMorph(1);
  });
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.some((t) => t === 'Files' || t === 'text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  document.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      document.body.classList.remove('dropping');
      bot.resetMorph();
    }
  });
  api.onFileDrop((result: any) => {
    dragDepth = 0;
    document.body.classList.remove('dropping');
    bot.resetMorph();
    void attempt(async () => {
      if (result.error) throw Error(result.error);
      await api.expand(true);
      await addFiles(result.items);
      $('prompt').focus();
    });
  });
  const renderHistory = historyFolders(
    api,
    async (id) => {
      files = [];
      attachments();
      closeRooms();
      await switchRoom(await api.sessionSelect(id));
    },
    async (result) => {
      closeRooms();
      await switchRoom(result);
    },
    notice,
  );
  function sessions(rooms: any[]) {
    $('session-alert').hidden = !rooms.some((r) => r.pending);
    const signature = JSON.stringify(rooms);
    if (signature === sessionSignature) return;
    sessionSignature = signature;
    const s = $('sessions') as HTMLSelectElement;
    s.replaceChildren();
    for (const r of rooms) s.add(new Option(r.name, r.id, false, r.active));
    renderHistory();
  }
  $('sessions').onchange = () =>
    attempt(async () => {
      files = [];
      attachments();
      closeRooms();
      await switchRoom(await api.sessionSelect(($('sessions') as HTMLSelectElement).value));
    });
  $('add-session').onclick = () =>
    attempt(async () => {
      files = [];
      attachments();
      closeRooms();
      await switchRoom(await api.sessionNew());
    });
  $('close-session').onclick = () =>
    attempt(async () => {
      files = [];
      attachments();
      closeRooms();
      await switchRoom(await api.sessionClose());
    });
  $('open-project').onclick = () => attempt(() => api.openProject());
  function paint(value: any) {
    current = value;
    input('pref-sound').checked = value.sound;
    input('pref-volume').value = String(value.volume);
    input('pref-hide').checked = value.autoHide;
    input('pref-close').checked = value.autoClose;
    input('pref-close-seconds').value = String(value.closeSeconds);
    input('pref-seconds').value = String(value.hideSeconds);
    input('pref-screen').value = value.screen;
    input('pause-services').checked = value.paused;
    Sound.setEnabled(value.sound);
    Sound.setVolume(value.volume);
    paintSoundButton(value.sound);
    $('service-pills').replaceChildren();
    miniBots.length = 0;
    for (const [i, s] of value.services.entries()) {
      const status = $(`service-state-${s.id}`);
      if (status)
        status.textContent = s.configured
          ? s.result?.error || s.result?.rows?.join('\n') || 'Bağlı · Yenile ile verileri al'
          : 'Bağlantı kurulmadı';
      if (!s.configured || COMING_SOON || !(s.id in labels)) continue;
      const b = document.createElement('button');
      b.className = 'service-pill';
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const engine = new BotEngine();
      engine.isMini = true;
      engine.bodyColor = hexToRGB(colors[i]);
      engine.setState(s.result?.error ? 'error' : 'idle');
      miniBots.push({ canvas: c, engine });
      b.append(c, document.createTextNode(labels[s.id]));
      b.title = s.result?.error || s.result?.rows?.join('\n') || 'Veri bekleniyor';
      b.onclick = () => {
        showSettings();
        ($(`service-${s.id}`) as HTMLDetailsElement).open = true;
        $(`service-${s.id}`).scrollIntoView({ block: 'nearest' });
      };
      $('service-pills').append(b);
    }
  }
  function init(value: any, displays: any[], rooms: any[]) {
    for (const d of displays) ($('pref-screen') as HTMLSelectElement).add(new Option(d.name, d.id));
    $('service-settings').replaceChildren();
    if (COMING_SOON) {
      const card = document.createElement('div');
      card.className = 'coming-soon';
      card.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>';
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = 'GitHub bağlantısı';
      const note = document.createElement('span');
      note.textContent = 'İleriki sürümlerde gelecek';
      text.append(name, note);
      const badge = document.createElement('span');
      badge.className = 'soon-badge';
      badge.textContent = 'Yakında';
      card.append(text, badge);
      card.setAttribute('aria-disabled', 'true');
      $('service-settings').append(card);
    }
    for (const id of COMING_SOON ? [] : Object.keys(labels)) {
      const d = document.createElement('details');
      d.id = `service-${id}`;
      const title = document.createElement('summary');
      title.textContent = labels[id];
      d.append(title);
      const token = document.createElement('input');
      token.type = 'password';
      token.autocomplete = 'off';
      token.placeholder = 'API anahtarı / token';
      token.setAttribute('aria-label', `${labels[id]} anahtarı`);
      d.append(token);
      const url = document.createElement('input');
      if (id === 'n8n') {
        url.placeholder = 'https://n8n.adresin.com';
        url.setAttribute('aria-label', 'n8n adresi');
        d.append(url);
      }
      const actions = document.createElement('div');
      actions.className = 'row';
      for (const [label, action] of [
        ['Kaydet', 'save'],
        ['Yenile', 'refresh'],
        ['Bağlantıyı kaldır', 'remove'],
      ]) {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () =>
          attempt(async () => {
            if (action === 'refresh') {
              await api.serviceRefresh(id);
            } else {
              if (action === 'save' && !token.value.trim()) throw Error('Anahtar girin.');
              paint(
                await api.serviceSave({
                  id,
                  token: action === 'remove' ? '' : token.value.trim(),
                  url: url.value.trim(),
                }),
              );
              token.value = '';
            }
          });
        actions.append(b);
      }
      const status = document.createElement('pre');
      status.id = `service-state-${id}`;
      d.append(actions, status);
      $('service-settings').append(d);
    }
    paint(value);
    sessions(rooms);
  }
  // v0.6.0: hear the new volume right away.
  input('pref-volume').addEventListener('change', () => {
    Sound.setVolume(Number(input('pref-volume').value));
    if (Sound.enabled) Sound.play('blip');
  });
  $('save-prefs').onclick = () =>
    attempt(async () => {
      paint(
        await api.settings({
          sound: input('pref-sound').checked,
          volume: Number(input('pref-volume').value),
          autoHide: input('pref-hide').checked,
          autoClose: input('pref-close').checked,
          closeSeconds: Number(input('pref-close-seconds').value),
          hideSeconds: Number(input('pref-seconds').value),
          screen: input('pref-screen').value,
        }),
      );
      notice('Ayarlar kaydedildi.');
    });
  // v0.5.1: panel behaviour and sound settings apply as soon as they change (the separate
  // save button made the "Sesler" switch look broken).
  let autoSave: ReturnType<typeof setTimeout> | undefined;
  const saveSoon = () => {
    clearTimeout(autoSave);
    autoSave = setTimeout(
      () =>
        void attempt(async () =>
          paint(
            await api.settings({
              sound: input('pref-sound').checked,
              volume: Number(input('pref-volume').value),
              autoHide: input('pref-hide').checked,
              autoClose: input('pref-close').checked,
              closeSeconds: Number(input('pref-close-seconds').value),
              hideSeconds: Number(input('pref-seconds').value),
              screen: input('pref-screen').value,
            }),
          ),
        ),
      250,
    );
  };
  for (const id of [
    'pref-sound',
    'pref-volume',
    'pref-hide',
    'pref-close',
    'pref-close-seconds',
    'pref-seconds',
    'pref-screen',
  ])
    input(id).addEventListener('change', saveSoon);
  $('save-prefs').hidden = true;
  $('pause-services').onchange = () =>
    attempt(async () => paint(await api.pauseServices(input('pause-services').checked)));
  api.onExtras(paint);
  api.onSettings(showSettings);
  api.onHidden((v: boolean) => {
    document.body.classList.toggle('hidden-island', !!v);
    if (v) Sound.idle();
  });
  api.onPeek(() => {
    bot.greet();
    Sound.play('peek');
  });
  return {
    hasDocument: () => files.some((f) => ['pdf', 'docx'].includes(f.kind)),
    init,
    sessions,
    closeSettings,
    ids: () => files.map((f) => f.id),
    addFiles,
    previews: () => files.map((f) => ({ name: f.name, kind: f.kind, thumbnail: f.thumbnail })),
    clear: () => {
      files = [];
      attachments();
    },
    saveSound: () => {
      if (current)
        void attempt(async () => paint(await api.settings({ ...current, sound: Sound.enabled })));
    },
  };
}
