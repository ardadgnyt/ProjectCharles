import MarkdownIt from 'markdown-it';
import { splitQuestions, type AiQuestion } from './ai-questions';

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
// v0.6.5: questions from the AI are shown as a card (src/chat/ai-questions.ts)
const cards = new WeakMap<HTMLElement, HTMLElement>();
let questionHandler: ((element: HTMLElement, questions: AiQuestion[]) => HTMLElement) | null = null;
export function setQuestionHandler(
  fn: (element: HTMLElement, questions: AiQuestion[]) => HTMLElement,
) {
  questionHandler = fn;
}
const pending = new WeakSet<HTMLElement>();
export function updateMarkdown(element: HTMLElement, text: string, replace = false) {
  sources.set(element, (replace ? text : (sources.get(element) || '') + text).slice(-300000));
  if (pending.has(element)) return;
  pending.add(element);
  requestAnimationFrame(() => {
    pending.delete(element);
    if (!element.isConnected) return;
    element.classList.add('markdown');
    const { visible, questions } = splitQuestions(sources.get(element) || '');
    element.innerHTML = markdown.render(visible);
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
    if (questions.length && questionHandler) {
      let card = cards.get(element);
      if (!card || card.dataset.count !== String(questions.length)) {
        card = questionHandler(element, questions);
        card.dataset.count = String(questions.length);
        cards.set(element, card);
      }
      element.append(card);
    }
    element.parentElement?.scrollTo({ top: element.parentElement.scrollHeight });
  });
}

export function messageSource(element: HTMLElement) {
  const source = sources.get(element);
  return source ? splitQuestions(source).visible : element.textContent || '';
}
