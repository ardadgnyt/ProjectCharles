import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
markdown.validateLink = (href: string) => {
  try {
    const u = new URL(href);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
};
// Display alt text without fetching remote content from a model response.
markdown.renderer.rules.image = (tokens: any[], index: number) =>
  markdown.utils.escapeHtml(tokens[index].content || '[Görsel]');
const copyIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>';
const speakIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>';
const sources = new WeakMap<HTMLElement, string>();
const pending = new WeakSet<HTMLElement>();
export function updateMarkdown(element: HTMLElement, text: string, replace = false) {
  sources.set(element, (replace ? text : (sources.get(element) || '') + text).slice(-300000));
  if (pending.has(element)) return;
  pending.add(element);
  requestAnimationFrame(() => {
    pending.delete(element);
    if (!element.isConnected) return;
    element.classList.add('markdown');
    element.innerHTML = markdown.render(sources.get(element) || '');
    const actions = document.createElement('div');
    actions.className = 'answer-tools';
    for (const [label, type] of [
      ['Kopyala', 'copy'],
      ['Seslendir', 'speak'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = type === 'copy' ? copyIcon : speakIcon;
      b.dataset.answerAction = type;
      actions.append(b);
    }
    element.append(actions);
    for (const pre of element.querySelectorAll('pre')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'code-copy';
      b.title = 'Kodu kopyala';
      b.setAttribute('aria-label', 'Kodu kopyala');
      b.innerHTML = copyIcon;
      b.dataset.answerAction = 'code';
      pre.append(b);
    }
    element.parentElement?.scrollTo({ top: element.parentElement.scrollHeight });
  });
}

export function messageSource(element: HTMLElement) {
  return sources.get(element) || element.textContent || '';
}
