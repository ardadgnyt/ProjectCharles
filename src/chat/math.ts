import { katexNow, loadKatex } from './katex-source';

// v1.0.0 (perf2 P9.3): in the page KaTeX is loaded on the first formula. Until it is there a formula
// is a placeholder (its source, like a formula still being typed); answers wait for it instead
// (markdown.ts, mathReady), other texts get their placeholders replaced when it arrives.
let unavailable = false;
let renderFormula: ((source: string, displayMode: boolean) => string) | null = null;
function fillWaiting() {
  if (!renderFormula) return;
  for (const el of [...document.querySelectorAll<HTMLElement>('.math-wait')]) {
    const tpl = document.createElement('template');
    tpl.innerHTML = renderFormula(el.dataset.src || '', el.dataset.display === '1');
    el.replaceWith(tpl.content);
  }
}
/** Resolves when formulas can be drawn (KaTeX loaded, or it failed and they stay as source). */
export function mathReady(): Promise<void> {
  if (katexNow() || unavailable) return Promise.resolve();
  return loadKatex().then(
    () => {},
    () => void (unavailable = true),
  );
}
const COPY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';

// Native MathML needs neither remote resources nor inline styles under our CSP.
export function mathPlugin(md: any) {
  const render = (source: string, displayMode: boolean) => {
    const tex = md.utils.escapeHtml(source.trim());
    const katex = katexNow();
    if (!katex) {
      if (unavailable) return '<code class="math-pending">' + md.utils.escapeHtml(source) + '</code>';
      void mathReady().then(() => {
        fillWaiting();
        requestAnimationFrame(fillWaiting);
      });
      return (
        '<span class="math-wait" data-src="' + md.utils.escapeHtml(source) + '" data-display="' + (displayMode ? '1' : '0') +
        '"><code class="math-pending">' + md.utils.escapeHtml(source) + '</code></span>'
      );
    }
    let html: string;
    try {
      html = katex.renderToString(source, {
        displayMode,
        output: 'mathml',
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        maxExpand: 500,
        maxSize: 20,
      });
    } catch {
      return '<code class="math-pending">' + md.utils.escapeHtml(source) + '</code>';
    }
    return displayMode
      ? '<span class="math-display" data-tex="' +
          tex +
          '" data-display="1"><button type="button" class="math-copy" data-answer-action="math" data-tip="Formülü kopyala" aria-label="Formülü kopyala">' +
          COPY_ICON +
          '</button>' +
          html +
          '</span>'
      : '<span class="math-inline" data-answer-action="math" data-tex="' +
          tex +
          // (data-tip, not title: answers are merged in again on every streamed frame, markdown.ts)
          '" data-tip="Formülü kopyalamak için tıkla" aria-description="Formülü kopyalamak için tıkla">' +
          html +
          '</span>';
  };
  renderFormula = render;
  md.inline.ruler.before('escape', 'charles_math', (state: any, silent: boolean) => {
    const p = state.pos, rest = state.src.slice(p);
    const open = rest.startsWith('\\(') ? '\\(' : rest.startsWith('\\[') ? '\\[' : rest.startsWith('$$') ? '$$' : rest[0] === '$' ? '$' : '';
    if (!open) return false;
    const close = open === '\\(' ? '\\)' : open === '\\[' ? '\\]' : open;
    const start = p + open.length;
    if (open === '$' && /\s/.test(state.src[start] || ' ')) return false;
    let end = state.src.indexOf(close, start);
    while (end >= 0 && state.src[end - 1] === '\\') end = state.src.indexOf(close, end + close.length);
    if (end <= start) return false;
    if (open === '$' && (/\s/.test(state.src[end - 1]) || /\d/.test(state.src[end + 1] || ''))) return false;
    if (!silent) {
      const token = state.push('charles_math', '', 0);
      token.content = state.src.slice(start, end);
      token.meta = { display: open === '$$' || open === '\\[' };
    }
    state.pos = end + close.length;
    return true;
  });
  md.renderer.rules.charles_math = (tokens: any[], i: number) => render(tokens[i].content, tokens[i].meta.display);
  md.block.ruler.before('fence', 'charles_math_block', (state: any, startLine: number, endLine: number, silent: boolean) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const first = state.src.slice(start, state.eMarks[startLine]);
    const open = first.startsWith('$$') ? '$$' : first.startsWith('\\[') ? '\\[' : '';
    if (!open || state.sCount[startLine] - state.blkIndent >= 4) return false;
    const close = open === '$$' ? '$$' : '\\]';
    let content = first.slice(open.length), line = startLine;
    while (!content.includes(close) && line + 1 < endLine) {
      line++;
      content += '\n' + state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    }
    const at = content.indexOf(close);
    if (at < 0 || content.slice(at + close.length).trim()) return false;
    if (silent) return true;
    const token = state.push('charles_math_block', 'div', 0);
    token.block = true;
    token.content = content.slice(0, at);
    token.map = [startLine, line + 1];
    state.line = line + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.charles_math_block = (tokens: any[], i: number) => '<div class="math-block">' + render(tokens[i].content, true) + '</div>\n';
}
