// v1.0.0: the one way a settings card shows a connected account (design pass T24). The button row
// holds only actions: the sign-in button is hidden while the account is connected and is the card's
// cream primary while it is not. The state is ONE plain line under the buttons: a small green dot
// and "Bağlı", then " · " and what the last check said when there is something
// ("Bağlı · Modeller kullanıma hazır."). Not connected, checking and error states are that line's
// text alone. The line keeps role="status", so every change is announced.

/** Models are ready: the status line of a connected AI account card. */
export const READY = 'Modeller kullanıma hazır.';

/** A card's sign-in button: hidden while `on`, the primary action with its `idle` text while not. */
export function showConnected(button: HTMLElement, on: boolean, idle: string) {
  button.hidden = on;
  button.classList.toggle('primary', !on);
  // the text never changes any more (it was "<Ad> bağlı" while connected); written once if empty
  if (idle && !button.textContent) button.textContent = idle;
}

export type StateLine = {
  /** The line element (a `p.hint` with role="status"). */
  readonly el: HTMLElement;
  /** What the last check said; '' for nothing. Writing it keeps the dot and "Bağlı". */
  textContent: string;
  /** Connected: the dot and "Bağlı" in front of the text. */
  connected: boolean;
};

/** Turns `line` into a card's single status line (see the top of this file). */
export function stateLine(line: HTMLElement = document.createElement('p')): StateLine {
  line.classList.add('hint', 'card-state');
  line.setAttribute('role', 'status');
  const dot = document.createElement('i');
  dot.className = 'state-dot';
  dot.setAttribute('aria-hidden', 'true');
  const word = document.createElement('span');
  word.className = 'state-on';
  word.textContent = 'Bağlı';
  const sep = document.createElement('span');
  sep.className = 'state-sep';
  sep.textContent = ' · ';
  const text = document.createElement('span');
  text.className = 'state-text';
  text.textContent = line.textContent || '';
  line.replaceChildren(text);
  let on = false;
  // the dot, "Bağlı" and " · " are in the line only while connected (its text stays the line's
  // whole text for anything that reads it)
  const paint = () => {
    line.classList.toggle('connected', on);
    const head = on ? (text.textContent ? [dot, word, sep] : [dot, word]) : [];
    if (line.childNodes.length !== head.length + 1 || (on && line.firstChild !== dot)) line.replaceChildren(...head, text);
  };
  paint();
  return {
    el: line,
    get textContent() {
      return text.textContent || '';
    },
    set textContent(value: string) {
      text.textContent = value;
      paint();
    },
    get connected() {
      return on;
    },
    set connected(value: boolean) {
      on = value;
      paint();
    },
  };
}
