import MarkdownIt from 'markdown-it';
import { mathPlugin } from './math';
import { splitQuestions, type AiQuestion } from './ai-questions';
import { highlightInto, LANGUAGE_NAMES } from './highlight';
import { t } from '../settings/i18n';
import { stickToBottom } from './follow';

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
markdown.use(mathPlugin);
export const renderMarkdown = (text: string) => markdown.render(text);
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
const codeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"/></svg>';
const panelIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M14 5v14"/></svg>';
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
    // v0.7.2: code and text to copy sit in a box with a header (language, open in the side
    // panel, copy) like ChatGPT, Claude and Gemini
    for (const pre of element.querySelectorAll('pre')) {
      const code = pre.querySelector('code');
      const lang = (/language-([\w+#-]+)/.exec(code?.className || '')?.[1] || '').toLowerCase();
      const box = document.createElement('div');
      box.className = 'code-block';
      box.dataset.language = lang;
      const head = document.createElement('div');
      head.className = 'code-head';
      const label = document.createElement('span');
      label.className = 'code-lang';
      label.innerHTML = codeIcon;
      label.append(document.createTextNode(t(LANGUAGE_NAMES[lang] || (lang ? lang.toUpperCase() : 'Metin'))));
      const tools = document.createElement('span');
      tools.className = 'code-tools';
      const panel = document.createElement('button');
      panel.type = 'button';
      panel.className = 'code-panel';
      panel.title = t('Yan panelde aç');
      panel.setAttribute('aria-label', t('Yan panelde aç'));
      panel.innerHTML = panelIcon;
      panel.dataset.answerAction = 'code-panel';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'code-copy';
      b.title = t('Kopyala');
      b.setAttribute('aria-label', t('Kopyala'));
      b.innerHTML = copyIcon;
      b.dataset.answerAction = 'code';
      tools.append(panel, b);
      head.append(label, tools);
      pre.before(box);
      box.append(head, pre);
      if (code && lang) highlightInto(code, code.textContent || '', lang);
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
    stickToBottom(element.parentElement);
  });
}

export function messageSource(element: HTMLElement) {
  const source = sources.get(element);
  return source ? splitQuestions(source).visible : element.textContent || '';
}
