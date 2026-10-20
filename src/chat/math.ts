import katex from 'katex';

// Native MathML needs neither remote resources nor inline styles under our CSP.
export function mathPlugin(md: any) {
  const render = (source: string, displayMode: boolean) => {
    try {
      return katex.renderToString(source, { displayMode, output: 'mathml',
        throwOnError: true, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 });
    } catch { return '<code class="math-pending">' + md.utils.escapeHtml(source) + '</code>'; }
  };
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
