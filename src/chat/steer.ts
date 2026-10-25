// v0.7.0: extra instructions while the AI is still working (like Claude).
// Type while the answer is running and press Enter or Ctrl+Enter:
//  • GPT (Codex) receives it right away inside the running turn (turn/steer);
//  • Claude, Gemini and Cursor answer in one go, so the message waits in a small queue above
//    the message box and is sent as soon as the current answer is finished.
// Queued messages can be removed with ×, or pulled back into the box with a click.
// v0.7.1 SpecialBeta: "Şimdi" on a queued message stops the running answer and sends the
// message right away (a real interruption for Claude, Gemini and Cursor too). A message
// written while the request is still being sent is queued instead of being dropped.

export type SteerDeps = {
  api: any;
  composer: HTMLElement;
  bar: HTMLElement;
  prompt: HTMLTextAreaElement;
  external: () => boolean;
  shown: (text: string) => void; // adds the user's extra instruction to the chat
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
  const queue: string[] = [];
  let interjecting = false;

  function paint() {
    box.replaceChildren();
    box.hidden = !queue.length;
    if (d.feed && queue.length && d.feed.lastElementChild !== box) d.feed.append(box);
    queue.forEach((text, i) => {
      const item = document.createElement('div');
      item.className = 'steer-item';
      const tag = document.createElement('span');
      tag.className = 'steer-tag';
      tag.textContent = d.t(d.feed ? 'Ek talimat · sırada' : 'Sırada');
      const body = document.createElement('button');
      body.type = 'button';
      body.className = 'steer-text';
      body.textContent = text;
      body.title = d.t('Düzenlemek için tıkla');
      body.onclick = () => {
        queue.splice(i, 1);
        d.prompt.value = d.prompt.value ? d.prompt.value + '\n' + text : text;
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
  async function send(text: string) {
    text = text.trim();
    if (!text) return;
    d.prompt.value = '';
    d.prompt.dispatchEvent(new Event('input'));
    if (!d.external()) {
      try {
        await d.api.steer(text);
        d.shown(text);
        return;
      } catch {
        // the turn may have just ended or the server refused it: keep it for the next turn
      }
    }
    queue.push(text);
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
  function hold(text: string) {
    text = text.trim();
    if (!text) return;
    d.prompt.value = '';
    d.prompt.dispatchEvent(new Event('input'));
    queue.push(text);
    paint();
  }

  /** A turn just started: GPT gets the messages held while sending as real extra instructions. */
  async function started() {
    paint();
    if (d.external() || !queue.length) return;
    const text = queue.splice(0).join('\n\n');
    paint();
    try {
      await d.api.steer(text);
      d.shown(text);
    } catch {
      queue.unshift(text);
      paint();
    }
  }

  /** True once after "Şimdi" stopped the answer: the queue should go out right away. */
  function takeInterjection() {
    const was = interjecting;
    interjecting = false;
    return was;
  }

  /** The queued text to send next (all queued messages together), or null. */
  function take(): string | null {
    if (!queue.length) return null;
    const text = queue.splice(0).join('\n\n');
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
