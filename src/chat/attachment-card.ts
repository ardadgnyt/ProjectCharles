// v0.9.22: an attachment inside the message box: its preview, and its name under it (never on it).
// v1.0.2: audio attachment cards (composer strip + sent message history).
import { lightbox } from './image-card';

export type AttachmentFile = {
  id: string;
  name: string;
  kind?: string;
  thumbnail?: string;
  size?: number;
  duration?: number;
  previewUrl?: string;
  dataUrl?: string;
  processing?: boolean;
  transcribing?: boolean;
  transcript?: string;
  transcribed?: boolean;
  error?: string;
};

const NAME_MAX = 34;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|ogg|opus|flac|webm|wma)$/i;

/** A name that fits two lines stays whole; a longer one keeps its start and its extension. */
export function shortName(name: string, max = NAME_MAX) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : '';
  const end = ext ? 6 + ext.length : 8;
  return name.slice(0, max - end - 1).trimEnd() + '…' + name.slice(name.length - end);
}

/** The short word on a file's card: PDF, DOCX, … */
export function fileBadge(name: string) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
  return /^[A-Z0-9]{1,5}$/.test(ext) ? ext : 'DOSYA';
}

/** Whether a file descriptor represents an audio attachment. */
export function isAudioFile(file: { name?: string; kind?: string } | null | undefined): boolean {
  if (!file) return false;
  if (file.kind === 'audio') return true;
  if (file.kind && file.kind !== 'file') return false;
  return AUDIO_EXT_RE.test(String(file.name || ''));
}

/** Formats an audio duration in seconds as M:SS or H:MM:SS. */
export function formatAudioDuration(seconds?: number): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0 || seconds === undefined || seconds === null) return '';
  const total = Math.max(0, Math.round(n));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Formats a byte size in Turkish human-readable form (B, KB, MB). */
export function formatFileSize(bytes?: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const quiet = (badge: HTMLElement, word: string) => {
  badge.textContent = word;
  if (word !== 'DOSYA' && word !== 'SES') badge.setAttribute('translate', 'no');
};

const FILE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/></svg>';
const AUDIO_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/></svg>';
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5v11l9-5.5-9-5.5Z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6.5v11M15.5 6.5v11"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';

let activeAudio: { el: HTMLAudioElement; reset: () => void } | null = null;
function stopActiveAudio() {
  if (!activeAudio) return;
  try {
    activeAudio.el.pause();
  } catch {}
  activeAudio.reset();
  activeAudio = null;
}

/**
 * The whole name, above the card, while the pointer or the keyboard is on it. Charles turns native
 * tooltips off (ui/no-native-tooltips.ts) and the line of cards clips anything that leaves it, so
 * this stands in the message box itself.
 */
export function attachmentNames(box: HTMLElement) {
  const tip = document.createElement('div');
  tip.className = 'attachment-tip';
  tip.setAttribute('translate', 'no');
  tip.hidden = true;
  box.parentElement!.append(tip);
  const show = (e: Event) => {
    const card = (e.target as Element).closest<HTMLElement>('.attachment-card');
    if (!card) return;
    const frame = box.parentElement!.getBoundingClientRect();
    tip.textContent = card.dataset.name || '';
    tip.hidden = false;
    const left = card.getBoundingClientRect().left - frame.left;
    tip.style.left = Math.max(0, Math.min(left, frame.width - tip.offsetWidth)) + 'px';
  };
  const hide = () => (tip.hidden = true);
  box.addEventListener('pointerover', show);
  box.addEventListener('focusin', show);
  box.addEventListener('pointerleave', hide);
  box.addEventListener('focusout', hide);
  return hide;
}

/** A sent file in the chat: icon, name and type. A sent picture is only the picture. */
export function sentFile(file: {
  name: string;
  kind?: string;
  size?: number;
  duration?: number;
  transcript?: string;
  transcribed?: boolean;
}) {
  const audio = isAudioFile(file);
  const card = document.createElement('div');
  card.className = 'sent-file' + (audio ? ' sent-file-audio' : '');
  card.setAttribute('aria-label', file.name);
  card.setAttribute('data-tip', file.name);
  card.dataset.kind = audio ? 'audio' : file.kind || '';
  const glyph = document.createElement('span');
  glyph.className = 'sent-file-icon';
  glyph.innerHTML = audio ? AUDIO_ICON : FILE_ICON; // a constant, no part of the file's name
  const text = document.createElement('span');
  text.className = 'sent-file-text';
  const name = document.createElement('strong');
  name.textContent = file.name;
  name.setAttribute('translate', 'no');
  const type = document.createElement('small');
  if (audio) {
    const rawBadge = fileBadge(file.name);
    const badgeWord = rawBadge === 'DOSYA' ? 'SES' : rawBadge;
    const dur = formatAudioDuration(file.duration);
    const sz = formatFileSize(file.size);
    const parts = [badgeWord, dur, sz].filter(Boolean);
    type.textContent = parts.join(' · ');
    if (badgeWord !== 'SES') type.setAttribute('translate', 'no');
    const metaRow = document.createElement('span');
    metaRow.className = 'sent-file-meta';
    metaRow.append(type);
    if (file.transcribed !== false) {
      const trBadge = document.createElement('span');
      trBadge.className = 'sent-audio-badge';
      trBadge.textContent = 'Metne çevrildi';
      metaRow.append(trBadge);
    }
    text.append(name, metaRow);
  } else {
    quiet(type, fileBadge(file.name));
    text.append(name, type);
  }
  card.append(glyph, text);
  return card;
}

export function attachmentCard(api: any, file: AttachmentFile, remove: () => void) {
  const audio = !file.thumbnail && isAudioFile(file);
  const busy = Boolean(file.processing || file.transcribing);
  const hasError = Boolean(file.error);
  const card = document.createElement('div');
  card.className =
    'attachment-card' +
    (audio ? ' attachment-card-audio' : '') +
    (busy ? ' is-processing' : '') +
    (hasError ? ' is-error' : '');
  card.dataset.name = file.name;
  card.dataset.kind = audio ? 'audio' : file.kind || '';
  card.setAttribute('data-tip', hasError ? `${file.name} · ${file.error}` : file.name);
  if (hasError && file.error) card.setAttribute('aria-description', file.error);

  let preview: HTMLElement;
  let stopCardAudio = () => {};

  if (file.thumbnail) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'attachment-preview';
    open.setAttribute('aria-label', file.name + ' · büyüt');
    const img = document.createElement('img');
    img.src = file.thumbnail;
    img.alt = '';
    open.append(img);
    open.onclick = () => {
      const whole = !file.thumbnail!.startsWith('data:image/gif') && file.id;
      if (!whole) return lightbox(file.thumbnail!, file.name);
      void api
        .attachmentImage(file.id)
        .then((src: string) => lightbox(src, file.name))
        .catch(() => lightbox(file.thumbnail!, file.name));
    };
    preview = open;
  } else if (audio) {
    preview = document.createElement('div');
    preview.className = 'attachment-preview attachment-file attachment-audio';
    preview.dataset.kind = 'audio';
    preview.setAttribute('role', 'group');
    preview.setAttribute('aria-label', file.name);

    const top = document.createElement('div');
    top.className = 'attachment-audio-top';
    const iconWrap = document.createElement('span');
    iconWrap.className = 'attachment-audio-icon';
    iconWrap.innerHTML = AUDIO_ICON;
    top.append(iconWrap);

    const canPreview =
      !busy &&
      !hasError &&
      Boolean(file.previewUrl || file.dataUrl || typeof api?.audioPreview === 'function');
    if (canPreview) {
      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'attachment-audio-play';
      playBtn.innerHTML = PLAY_ICON;
      const setPlayState = (playing: boolean) => {
        const label = playing ? 'Sesi duraklat' : 'Sesi dinle';
        playBtn.setAttribute('aria-pressed', String(playing));
        playBtn.setAttribute('aria-label', label);
        playBtn.setAttribute('data-tip', label);
        playBtn.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
        card.classList.toggle('is-playing', playing);
      };
      setPlayState(false);

      let player: HTMLAudioElement | null = null;
      stopCardAudio = () => {
        if (player) {
          try {
            player.pause();
            player.currentTime = 0;
          } catch {}
        }
        if (activeAudio?.el === player) activeAudio = null;
        setPlayState(false);
      };

      playBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          if (player && !player.paused) {
            stopCardAudio();
            return;
          }
          stopActiveAudio();
          if (!player) {
            const src =
              file.previewUrl ||
              file.dataUrl ||
              (typeof api?.audioPreview === 'function' ? await api.audioPreview(file.id) : '');
            if (!src || typeof Audio === 'undefined') {
              playBtn.hidden = true;
              return;
            }
            player = new Audio(String(src));
            player.onended = () => stopCardAudio();
            player.onerror = () => {
              stopCardAudio();
              playBtn.hidden = true;
            };
          }
          activeAudio = { el: player, reset: () => setPlayState(false) };
          setPlayState(true);
          await player.play();
        } catch {
          stopCardAudio();
          playBtn.hidden = true;
        }
      };
      top.append(playBtn);
    }

    const meta = document.createElement('div');
    meta.className = 'attachment-audio-meta';
    const badge = document.createElement('span');
    badge.className = 'attachment-badge';
    const rawBadge = fileBadge(file.name);
    quiet(badge, rawBadge === 'DOSYA' ? 'SES' : rawBadge);
    meta.append(badge);

    const durText = formatAudioDuration(file.duration);
    if (durText) {
      const dur = document.createElement('span');
      dur.className = 'attachment-duration';
      dur.textContent = durText;
      dur.setAttribute('translate', 'no');
      meta.append(dur);
    }

    const sizeText = formatFileSize(file.size);
    if (sizeText) {
      const sz = document.createElement('span');
      sz.className = 'attachment-size';
      sz.textContent = sizeText;
      sz.setAttribute('translate', 'no');
      meta.append(sz);
    }

    preview.append(top, meta);

    if (hasError) {
      const err = document.createElement('span');
      err.className = 'attachment-audio-state is-error';
      err.setAttribute('role', 'status');
      err.textContent = 'Ses okunamadı';
      if (file.error) err.setAttribute('data-tip', file.error);
      preview.append(err);
    } else if (busy) {
      const proc = document.createElement('span');
      proc.className = 'attachment-audio-state is-processing';
      proc.setAttribute('role', 'status');
      const spin = document.createElement('i');
      spin.className = 'attachment-spinner';
      spin.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = 'Ses işleniyor…';
      proc.append(spin, label);
      preview.append(proc);
    }
  } else {
    preview = document.createElement('div');
    preview.className = 'attachment-preview attachment-file';
    preview.dataset.kind = file.kind || '';
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', file.name);
    preview.innerHTML = FILE_ICON; // a constant, no part of the file's name
    const badge = document.createElement('span');
    badge.className = 'attachment-badge';
    quiet(badge, fileBadge(file.name));
    preview.append(badge);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'attachment-remove';
  close.innerHTML = CLOSE_ICON; // a constant, no part of the file's name
  const removeLabel = 'Eki kaldır: ' + file.name;
  close.setAttribute('aria-label', removeLabel);
  close.setAttribute('data-tip', removeLabel);
  close.onclick = () => {
    stopCardAudio();
    remove();
  };
  const name = document.createElement('span');
  name.className = 'attachment-name';
  name.textContent = shortName(file.name);
  name.setAttribute('translate', 'no');
  card.append(preview, close, name);
  return card;
}
