// v0.7.0: extra instructions while the AI is still working (like Claude).
// Type while the answer is running and press Enter or Ctrl+Enter:
//  • GPT (Codex) receives it right away inside the running turn (turn/steer);
//  • Claude, Gemini and Cursor answer in one go, so the message waits in a small queue above
//    the message box and is sent as soon as the current answer is finished.
// Queued messages can be removed with ×, or pulled back into the box with a click.
// v0.7.1 SpecialBeta: "Şimdi" on a queued message stops the running answer and sends the
// message right away (a real interruption for Claude, Gemini and Cursor too). A message
// written while the request is still being sent is queued instead of being dropped.
// v0.9.24: the box's files and photos go with it. GPT gets them in the running turn; a queued
// instruction keeps them and they return to the box when it goes out or is pulled back.

export type SteerFile = { id: string; name: string; kind?: string; thumbnail?: string };
type Held = { text: string; files: SteerFile[] };

export type SteerDeps = {
  api: any;
  composer: HTMLElement;
  bar: HTMLElement;
  prompt: HTMLTextAreaElement;
  external: () => boolean;
  shown: (text: string, files: SteerFile[]) => void; // adds the user's extra instruction to the chat
  /** Puts files back in the message box. */
  restore: (files: SteerFile[]) => void;
  /** Files whose text did not fully fit. */
  tooLong?: (names?: string[]) => void;
  notice: (s: string) => void;
  t: (s: string) => string;
  /** Is an answer running right now (for the "Şimdi" button)? */
  running?: () => boolean;
  feed?: HTMLElement;
  /** Stops the running answer. */
  interrupt?: () => Promise<void>;
};

export function steerUI(d: SteerDeps) {
  const box = document.createElement('div');
  box.id = 'steer-queue';
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  if (d.feed) {
    box.className = 'steer-pending';
    d.feed.append(box);
    new MutationObserver(() => {
      if (queue.length && d.feed!.lastElementChild !== box) d.feed!.append(box);
    }).observe(d.feed, { childList: true });
  } else d.composer.insertBefore(box, d.bar);
  const queue: Held[] = [];
  const steerTo = (text: string, files: SteerFile[]) => (files.length ? d.api.steer(text, files.map((f) => f.id)) : d.api.steer(text));
  const together = () => {
    const items = queue.splice(0);
    return { text: items.map((i) => i.text).join('\n\n'), files: items.flatMap((i) => i.files) };
  };
  let interjecting = false;

  function paint() {
    box.replaceChildren();
    box.hidden = !queue.length;
    if (d.feed && queue.length && d.feed.lastElementChild !== box) d.feed.append(box);
    queue.forEach(({ text, files }, i) => {
      const item = document.createElement('div');
      item.className = 'steer-item';
      const tag = document.createElement('span');
      tag.className = 'steer-tag';
      tag.textContent = d.t(d.feed ? 'Ek talimat · sırada' : 'Sırada');
      const body = document.createElement('button');
      body.type = 'button';
      body.className = 'steer-text';
      body.textContent = files.length ? `${text}  📎 ${files.length}` : text;
      body.title = d.t('Düzenlemek için tıkla');
      body.onclick = () => {
        queue.splice(i, 1);
        d.prompt.value = d.prompt.value ? d.prompt.value + '\n' + text : text;
        if (files.length) d.restore(files);
        d.prompt.focus();
        paint();
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'steer-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', d.t('Sıradan çıkar'));
      remove.onclick = () => {
        queue.splice(i, 1);
        paint();
      };
      item.append(tag, body);
      if (d.running?.() && d.interrupt) {
        const now = document.createElement('button');
        now.type = 'button';
        now.className = 'steer-now';
        now.textContent = d.t('Şimdi');
        now.title = d.t('Yanıtı durdur ve bunu hemen gönder');
        now.onclick = () => {
          interjecting = true;
          now.disabled = true;
          void d.interrupt!().catch((e: Error) => {
            interjecting = false;
            now.disabled = false;
            d.notice(e.message);
          });
        };
        item.append(now);
      }
      item.append(remove);
      box.append(item);
    });
  }

  /** Sends text as an extra instruction to the running answer. */
  async function send(text: string, files: SteerFile[] = []) {
    text = text.trim() || (files.length ? d.t('Eklediğim dosyalara da bak.') : '');
    if (!text) return;
    d.prompt.value = '';
    d.prompt.dispatchEvent(new Event('input'));
    if (!d.external()) {
      try {
        const result = await steerTo(text, files);
        d.shown(text, files);
        d.tooLong?.(result?.cut);
        return;
      } catch {
        // the turn may have just ended or the server refused it: keep it for the next turn
      }
    }
    queue.push({ text, files });
    paint();
    d.notice(
      d.t(
        d.external()
          ? 'Ek talimat sıraya alındı; yanıt bitince gönderilecek. Hemen göndermek için “Şimdi”ye bas.'
          : 'Ek talimat şu an iletilemedi; yanıt bitince gönderilecek.',
      ),
    );
  }

  /** Keeps text for after the current request (used while a message is still being sent). */
  function hold(text: string, files: SteerFile[] = []) {
    text = text.trim() || (files.length ? d.t('Eklediğim dosyalara da bak.') : '');
    if (!text) return;
    d.prompt.value = '';
    d.prompt.dispatchEvent(new Event('input'));
    queue.push({ text, files });
    paint();
  }

  /** A turn just started: GPT gets the messages held while sending as real extra instructions. */
  async function started() {
    paint();
    if (d.external() || !queue.length) return;
    const held = together();
    paint();
    try {
      const result = await steerTo(held.text, held.files);
      d.shown(held.text, held.files);
      d.tooLong?.(result?.cut);
    } catch {
      queue.unshift(held);
      paint();
    }
  }

  /** True once after "Şimdi" stopped the answer: the queue should go out right away. */
  function takeInterjection() {
    const was = interjecting;
    interjecting = false;
    return was;
  }

  /** The queued text to send next (all queued messages together), or null. Its files go back in the box. */
  function take(): string | null {
    if (!queue.length) return null;
    const { text, files } = together();
    if (files.length) d.restore(files);
    paint();
    return text;
  }
  function clear() {
    queue.length = 0;
    interjecting = false;
    paint();
  }
  return { send, hold, take, clear, paint, started, takeInterjection, size: () => queue.length };
}
