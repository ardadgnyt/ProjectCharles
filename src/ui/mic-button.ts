// v0.6.5: the microphone button in the panel header, next to the speaker.
// Hey Charles keeps the microphone open to hear the wake word. This switch closes every way
// Charles can use the microphone (Hey Charles, dictation, Gemini Live, wake training) until it
// is switched back on. The main process enforces it as well (app/main.cjs, 'mic-privacy').
const ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V20.5M9 20.5h6"/></svg>';
const OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 9.5V6.5a3 3 0 0 0-5.6-1.5M9 9v2.5a3 3 0 0 0 4.7 2.5"/><path d="M6 11.5a6 6 0 0 0 9.6 4.8M18 11.5a6 6 0 0 1-.4 2.1M12 17.5V20.5M9 20.5h6M4.5 4.5l15 15"/></svg>';

export const MIC_OFF_MESSAGE = 'Mikrofon kapalı. Üstteki mikrofon simgesinden açabilirsin.';

let off = false;
const streams = new Set<MediaStream>();

export function micOff() {
  return off;
}

function paint() {
  document.body.dataset.micOff = String(off);
  const b = document.getElementById('mic-privacy');
  if (!b) return;
  b.innerHTML = off ? OFF : ON;
  b.classList.toggle('muted', off);
  b.setAttribute('aria-pressed', String(off));
  b.title = off
    ? 'Mikrofon kapalı · açmak için tıkla'
    : 'Mikrofon açık · Hey Charles dinleyebilir · kapatmak için tıkla';
  b.setAttribute('aria-label', off ? 'Mikrofonu aç' : 'Mikrofonu kapat');
}

function closeAll() {
  for (const s of streams) s.getTracks().forEach((t) => t.stop());
  streams.clear();
  document.dispatchEvent(new Event('mic-privacy-off'));
}

// Every microphone request in the interface goes through here, so a stream opened just
// before the switch was pressed is closed too.
function guard() {
  const md = navigator.mediaDevices as MediaDevices | undefined;
  if (!md?.getUserMedia) return;
  const original = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    if (off && constraints?.audio) throw Error(MIC_OFF_MESSAGE);
    const s = await original(constraints);
    if (off && constraints?.audio) {
      s.getTracks().forEach((t) => t.stop());
      throw Error(MIC_OFF_MESSAGE);
    }
    for (const old of streams)
      if (old.getTracks().every((t) => t.readyState === 'ended')) streams.delete(old);
    streams.add(s);
    return s;
  };
}

export function micPrivacyUI(api: any, notice: (s: string) => void) {
  guard();
  paint();
  const button = document.getElementById('mic-privacy');
  void api
    .micPrivacy()
    .then((v: boolean) => {
      off = !!v;
      if (off) closeAll();
      paint();
    })
    .catch(() => {});
  button?.addEventListener('click', async () => {
    const next = !off;
    try {
      off = !!(await api.micPrivacy(next));
    } catch (e) {
      notice((e as Error).message);
      return;
    }
    if (off) closeAll();
    paint();
    notice(
      off
        ? 'Mikrofon kapatıldı. Hey Charles, dikte ve sesli görüşme sen açana kadar dinlemez.'
        : 'Mikrofon açıldı.',
    );
  });
}
