import MarkdownIt from 'markdown-it';
import { mathPlugin, mathReady } from './math';
import { splitQuestions, type AiQuestion } from './ai-questions';
import { highlightInto, LANGUAGE_NAMES } from './highlight';
import { t } from '../settings/i18n';
import { stickToBottom } from './follow';
import { prepareAnswer, placeCitations } from './answer-text';
import { morphChildren } from './morph';

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
markdown.use(mathPlugin);
export const renderMarkdown = (text: string) =>
  markdown.render(prepareAnswer(text).text.replace(/\u2063CITE\d+\u2063/g, ''));
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
const renderedAt = new WeakMap<HTMLElement, number>();
// answers still being written: their code boxes follow the text (a finished one opens at its top)
const growing = new WeakSet<HTMLElement>();
export function updateMarkdown(element: HTMLElement, text: string, replace = false) {
  sources.set(element, (replace ? text : (sources.get(element) || '') + text).slice(-300000));
  if (replace) growing.delete(element);
  else growing.add(element);
  if (pending.has(element)) return;
  pending.add(element);
  // v0.9.10: a long answer was rebuilt (Markdown, formulas, code colouring) on every frame while
  // it streamed in, which made the panel and Slime stutter. Long answers are redrawn a few times
  // a second instead; short ones still every frame.
  const length = (sources.get(element) || '').length;
  const gap = length > 4000 ? Math.min(400, 60 + length / 100) : 0;
  const wait = Math.max(0, (renderedAt.get(element) || 0) + gap - performance.now());
  const frame = (cb: FrameRequestCallback) =>
    wait > 0 ? window.setTimeout(() => requestAnimationFrame(cb), wait) : requestAnimationFrame(cb);
  frame(() => {
    renderedAt.set(element, performance.now());
    pending.delete(element);
    if (!element.isConnected) return;
    element.classList.add('markdown');
    const { visible, questions } = splitQuestions(sources.get(element) || '');
    // v0.9.10: file citations become chips; formulas with "|" no longer break tables
    const prepared = prepareAnswer(visible);
    // v0.9.16: built apart and then merged into the message (src/chat/morph.ts)
    const draft = document.createElement('div');
    draft.innerHTML = markdown.render(prepared.text);
    // v1.0.0 (perf2): the first formula waits for KaTeX (a local file) instead of showing its source
    if (draft.querySelector('.math-wait')) {
      pending.add(element);
      void mathReady().then(() => {
        pending.delete(element);
        const grow = growing.has(element);
        updateMarkdown(element, sources.get(element) || '', true);
        if (grow) growing.add(element);
      });
      return;
    }
    placeCitations(draft, prepared.citations);
    const actions = document.createElement('div');
    actions.className = 'answer-tools';
    for (const [label, type] of [
      ['Kopyala', 'copy'],
      ['Seslendir', 'speak'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      // v1.0.0: the tooltip is data-tip (ui/tooltip.ts), never a `title`: the draft is merged into
      // the message on every streamed frame (morph.ts), which put a removed title back each time
      // until no-native-tooltips.ts gave up and left the native one in place
      b.dataset.tip = t(label);
      b.setAttribute('aria-label', t(label));
      b.innerHTML = type === 'copy' ? copyIcon : speakIcon;
      b.dataset.answerAction = type;
      actions.append(b);
    }
    draft.append(actions);
    // v0.7.2: code and text to copy sit in a box with a header (language, open in the side
    // panel, copy) like ChatGPT, Claude and Gemini
    for (const pre of draft.querySelectorAll('pre')) {
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
      panel.dataset.tip = t('Yan panelde aç');
      panel.setAttribute('aria-label', t('Yan panelde aç'));
      panel.innerHTML = panelIcon;
      panel.dataset.answerAction = 'code-panel';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'code-copy';
      b.dataset.tip = t('Kopyala');
      b.setAttribute('aria-label', t('Kopyala'));
      b.innerHTML = copyIcon;
      b.dataset.answerAction = 'code';
      tools.append(panel, b);
      head.append(label, tools);
      pre.before(box);
      box.append(head, pre);
      if (code && lang) highlightInto(code, code.textContent || '', lang);
    }
    morphChildren(element, draft);
    if (growing.has(element)) for (const pre of element.querySelectorAll<HTMLElement>('.code-block pre')) stickToBottom(pre);
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

// v1.0.0 (perf2): a code box's header is written with t() inside a message, which the page's
// translator leaves alone: it is written again in the new language
if (typeof document !== 'undefined') document.addEventListener('charles-language', () => {
  for (const box of document.querySelectorAll<HTMLElement>('.code-block')) {
    const lang = box.dataset.language || '';
    const label = box.querySelector('.code-lang');
    const text = [...(label?.childNodes || [])].find((n) => n.nodeType === Node.TEXT_NODE);
    if (text) text.textContent = t(LANGUAGE_NAMES[lang] || (lang ? lang.toUpperCase() : 'Metin'));
    for (const [selector, word] of [['.code-panel', 'Yan panelde aç'], ['.code-copy', 'Kopyala']]) {
      const b = box.querySelector(selector);
      if (!b) continue;
      b.setAttribute('aria-label', t(word));
      b.setAttribute('data-tip', t(word));
    }
  }
  // the answer's own Kopyala / Seslendir row
  for (const b of document.querySelectorAll<HTMLElement>('.answer-tools button[data-answer-action]')) {
    const word = b.dataset.answerAction === 'copy' ? 'Kopyala' : b.dataset.answerAction === 'speak' ? 'Seslendir' : '';
    if (!word) continue;
    b.setAttribute('aria-label', t(word));
    b.setAttribute('data-tip', t(word));
  }
});

export function messageSource(element: HTMLElement) {
  const source = sources.get(element);
  return source ? splitQuestions(source).visible : element.textContent || '';
}
