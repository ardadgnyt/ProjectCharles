// The speaker button in the panel header (v0.6.0). It used to be a "♪" that looked like the
// Spotify control, so it was easy to switch Charles' sounds off by mistake.
const ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>';

export function paintSoundButton(enabled: boolean) {
  const b = document.getElementById('sound');
  if (!b) return;
  b.innerHTML = enabled ? ON : OFF;
  b.classList.toggle('muted', !enabled);
  b.title = enabled ? 'Sesler açık · kapatmak için tıkla' : 'Sesler kapalı · açmak için tıkla';
  b.setAttribute('aria-label', enabled ? 'Sesleri kapat' : 'Sesleri aç');
}
