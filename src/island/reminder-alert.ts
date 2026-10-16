// v0.7.4: a reminder that is hard to miss. Besides the bubble and the sound, a card opens
// over Charles with the reminder, Slime jumps, the card glows and the chime repeats a few
// times until it is answered. "10 dk ertele" sets the same reminder again.
import { Sound } from '../vendor/core/sound';

type Item = { id: string; title: string; kind?: string; due?: number };
type Deps = { api: any; notice: (s: string) => void; react: () => void };

let current: { close: () => void } | null = null;

export function reminderAlert(item: Item, d: Deps) {
  current?.close();
  const focus = item.kind === 'focus';
  const card = document.createElement('div');
  card.className = 'reminder-alert';
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-live', 'assertive');
  const icon = document.createElement('div');
  icon.className = 'reminder-alert-icon';
  icon.textContent = focus ? '⏱' : '⏰';
  const text = document.createElement('div');
  text.className = 'reminder-alert-text';
  const label = document.createElement('small');
  label.textContent = focus ? 'Odak süresi bitti' : 'Hatırlatma';
  const title = document.createElement('strong');
  title.textContent = item.title;
  title.translate = false;
  const time = document.createElement('span');
  const at = new Date(item.due || Date.now());
  time.textContent = String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
  text.append(label, title, time);
  const actions = document.createElement('div');
  actions.className = 'reminder-alert-actions';
  const snooze = document.createElement('button');
  snooze.type = 'button';
  snooze.textContent = '10 dk ertele';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'primary';
  ok.textContent = 'Tamam';
  actions.append(snooze, ok);
  card.append(icon, text, actions);
  document.body.append(card);

  // attention: Slime reacts and the chime repeats (4 times, 7 s apart) until answered
  let rings = 0;
  const ring = () => {
    rings++;
    d.react();
    card.classList.remove('ring');
    void card.offsetWidth;
    card.classList.add('ring');
  };
  ring();
  const timer = window.setInterval(() => {
    if (rings >= 4) window.clearInterval(timer);
    else {
      Sound.play('approval');
      ring();
    }
  }, 7000);
  const close = () => {
    window.clearInterval(timer);
    card.remove();
    if (current?.close === close) current = null;
  };
  current = { close };
  ok.onclick = close;
  snooze.onclick = async () => {
    close();
    try {
      await d.api.personalEdit('reminder-add', {
        title: item.title,
        due: Date.now() + 10 * 60 * 1000,
        kind: item.kind === 'focus' ? 'reminder' : item.kind,
      });
      d.notice('10 dakika sonra yeniden hatırlatacağım.');
    } catch (e) {
      d.notice((e as Error).message);
    }
  };
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  ok.focus({ preventScroll: true });
}
