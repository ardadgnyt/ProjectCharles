// v0.7.0: extra instructions while the AI is still working (like Claude).
// Type while the answer is running and press Enter or Ctrl+Enter:
//  • GPT (Codex) receives it right away inside the running turn (turn/steer);
//  • Claude, Gemini and Cursor answer in one go, so the message waits in a small queue above
//    the message box and is sent as soon as the current answer is finished.
// Queued messages can be removed with ×, or pulled back into the box with a click.

export type SteerDeps = {
  api: any;
  composer: HTMLElement;
  bar: HTMLElement;
  prompt: HTMLTextAreaElement;
  external: () => boolean;
  shown: (text: string) => void; // adds the user's extra instruction to the chat
  notice: (s: string) => void;
  t: (s: string) => string;
};

export function steerUI(d: SteerDeps) {
  const box = document.createElement('div');
  box.id = 'steer-queue';
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  d.composer.insertBefore(box, d.bar);
  const queue: string[] = [];

  function paint() {
    box.replaceChildren();
    box.hidden = !queue.length;
    queue.forEach((text, i) => {
      const item = document.createElement('div');
      item.className = 'steer-item';
      const tag = document.createElement('span');
      tag.className = 'steer-tag';
      tag.textContent = d.t('Sırada');
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
      item.append(tag, body, remove);
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
    if (d.external()) d.notice(d.t('Ek talimat sıraya alındı; yanıt bitince gönderilecek.'));
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
    paint();
  }
  return { send, take, clear, size: () => queue.length };
}
