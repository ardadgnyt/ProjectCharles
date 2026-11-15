import { attachmentCard, attachmentNames } from '../chat/attachment-card';
import { paintSoundButton } from '../ui/sound-button';
import { historyFolders } from '../chat/history-folders';
import { setRoomActions } from '../workspace/bridge';
import { Sound } from '../vendor/core/sound';
import { BotEngine } from '../vendor/slime/engine';
const $ = (id: string) => document.getElementById(id)!;
const input = (id: string) => $(id) as HTMLInputElement;
// v1.0.0: the developer services draft (a "GitHub connection · coming soon" card, and the token
// services behind it) was removed from Settings and from the main process.
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
  // v1.0.0 (CH-532): focus goes back to what opened Settings. The browser's own return lost it: the
  // dialog opens after the island has expanded, when the button may no longer hold the focus.
  let opener: HTMLElement | null = null;
  function showSettings(from: Element | null = document.activeElement) {
    closeRooms();
    if (settings.open) return;
    opener = from instanceof HTMLElement && from !== document.body ? from : null;
    settings.showModal();
  }
  settings.addEventListener('close', () => {
    const back = opener;
    opener = null;
    // at this point the focus may still sit on a control of the closed dialog
    const at = document.activeElement;
    if (back?.isConnected && (!at || at === document.body || settings.contains(at))) back.focus();
  });
  $('settings-toggle').onclick = () => {
    const from = document.activeElement;
    return attempt(async () => {
      await api.expand(true);
      showSettings(from);
    });
  };
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
  const hideName = attachmentNames($('attachments'));
  // v0.9.24: files in one message; nothing limits their size
  const MAX_FILES = 1000;
  function attachments() {
    hideName();
    document.dispatchEvent(new Event('charles-attachments'));
    $('drop-actions').hidden = !files.length;
    $('attachments').replaceChildren(
      ...files.map((file) =>
        attachmentCard(api, file, () => {
          files = files.filter((f) => f.id !== file.id);
          attachments();
        }),
      ),
    );
  }
  // the cards stand in one line: the wheel moves along it
  $('attachments').addEventListener(
    'wheel',
    (e) => {
      const box = e.currentTarget as HTMLElement;
      if (box.scrollWidth <= box.clientWidth || !e.deltaY) return;
      box.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    { passive: false },
  );
  async function addFiles(next: any[]) {
    if (files.length + next.length > MAX_FILES) throw Error('Bir mesajda en fazla 1000 ek olabilir.');
    const prepared = [];
    for (const file of next) {
      if (file.kind === 'gif') {
        // v0.9.25: binary from the main process (a big GIF as base64 text ran the page out of memory)
        const bytes: Uint8Array = file.gif || Uint8Array.from(atob(file.thumbnail.split(',')[1]), (c) => c.charCodeAt(0));
        delete file.gif;
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/gif' })).catch(() => {
          throw Error(`${file.name}: GIF açılamadı; dosya bozuk olabilir.`);
        });
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
          if (file.thumbnail) converted.thumbnail = file.thumbnail;
          prepared.push(converted);
        } finally {
          bitmap.close();
        }
      } else prepared.push(file);
    }
    if (files.length + prepared.length > MAX_FILES) throw Error('Bir mesajda en fazla 1000 ek olabilir.');
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
        notice('Alan eklendi. Ne sormak istersin?');
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
    if (files.length + images.length > MAX_FILES) {
      notice('Bir mesajda en fazla 1000 ek olabilir.');
      return;
    }
    pastePending = true;
    void attempt(async () => {
      try {
        for (const image of images) {
          await addFiles([await api.pasteImage(new Uint8Array(await image.arrayBuffer()))]);
        }
      } finally {
        pastePending = false;
      }
    });
  });
  let dragDepth = 0;
  // v0.7.8: only files or text dragged in from outside Charles light up the drop area.
  // Dragging selected text, a card or a device inside the window used to switch it on too,
  // and when such a drag ended inside the page the cream frame stayed.
  let internalDrag = false;
  const endDrop = () => {
    dragDepth = 0;
    if (!document.body.classList.contains('dropping')) return;
    document.body.classList.remove('dropping');
    bot.resetMorph();
  };
  document.addEventListener('dragstart', () => (internalDrag = true), true);
  document.addEventListener(
    'dragend',
    () => {
      internalDrag = false;
      endDrop();
    },
    true,
  );
  document.addEventListener('drop', () => window.setTimeout(endDrop, 0), true);
  // the mouse moving normally again means no drag is going on any more
  document.addEventListener('pointermove', (e) => {
    if (e.buttons === 0 && document.body.classList.contains('dropping')) endDrop();
  });
  window.addEventListener('blur', () => window.setTimeout(() => !document.hasFocus() && dragDepth === 0 && endDrop(), 0));
  const external = (e: DragEvent) => !internalDrag && !!e.dataTransfer?.types.some((t) => t === 'Files' || t === 'text/plain');
  document.addEventListener('dragenter', (e) => {
    if (!external(e)) return;
    e.preventDefault();
    dragDepth++;
    document.body.classList.add('dropping');
    bot.animateMorph(1);
  });
  document.addEventListener('dragover', (e) => {
    if (external(e)) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    }
  });
  document.addEventListener('dragleave', () => {
    if (!document.body.classList.contains('dropping')) return;
    if (--dragDepth <= 0) endDrop();
  });
  api.onFileDrop((result: any) => {
    endDrop();
    void attempt(async () => {
      if (result.error) throw Error(result.error);
      await api.expand(true);
      await addFiles(result.items);
      $('prompt').focus();
    });
  });
  const openRoom = async (id: string) => {
    files = [];
    attachments();
    closeRooms();
    await switchRoom(await api.sessionSelect(id));
  };
  // v0.7.1 SpecialBeta: the workspace window opens and starts chats the same way.
  setRoomActions({
    open: openRoom,
    create: async () => {
      files = [];
      attachments();
      closeRooms();
      await switchRoom(await api.sessionNew());
    },
  });
  const renderHistory = historyFolders(
    api,
    openRoom,
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
    document.dispatchEvent(new CustomEvent('charles-rooms', { detail: rooms }));
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
    Sound.setEnabled(value.sound);
    Sound.setVolume(value.volume);
    paintSoundButton(value.sound);
  }
  function init(value: any, displays: any[], rooms: any[]) {
    for (const d of displays) ($('pref-screen') as HTMLSelectElement).add(new Option(d.name, d.id));
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
  api.onExtras(paint);
  api.onSettings(() => showSettings());
  api.onHidden((v: boolean) => {
    document.body.classList.toggle('hidden-island', !!v);
    if (v) Sound.idle();
  });
  api.onPeek(() => {
    bot.greet();
    Sound.play('peek');
  });
  return {
    hasDocument: () => files.some((f) => ['pdf', 'docx', 'presentation'].includes(f.kind)),
    init,
    sessions,
    closeSettings,
    ids: () => files.map((f) => f.id),
    addFiles,
    remove: (id: string) => {
      files = files.filter((f) => f.id !== id);
      attachments();
    },
    // v0.9.24: an extra instruction takes the box's files with it; a queued one brings them back
    take: (except: string[] = []) => {
      const taken = files.filter((f) => !except.includes(f.id));
      files = files.filter((f) => except.includes(f.id));
      attachments();
      return taken;
    },
    putBack: (back: any[]) => {
      files.push(...back.filter((f) => !files.some((x) => x.id === f.id)));
      attachments();
    },
    // v0.9.15: `id`: a just-sent picture opens its original (the chip's thumbnail is only 112 px)
    // v0.9.24: a thousand cards leave at once, not one drawing at a time
    removeMany: (ids: string[]) => {
      files = files.filter((f) => !ids.includes(f.id));
      attachments();
    },
    previews: () => files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, thumbnail: f.thumbnail })),
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
