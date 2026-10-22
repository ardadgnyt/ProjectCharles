// v0.8.5: copying formulas. A click on an inline formula or on a block formula's copy button
// copies its LaTeX ($…$ / $$…$$) and, for Word / OneNote, MathML as HTML. Copying a selection
// that contains formulas keeps them as LaTeX instead of losing them or getting raw MathML text.
export type MathCopy = { text: string; html: string };

const mathOf = (el: Element) => el.querySelector('math')?.outerHTML || '';

/** The formula element (inline or display) → what goes to the clipboard. */
export function formulaClip(el: HTMLElement): MathCopy {
  const tex = el.dataset.tex || el.querySelector('annotation[encoding="application/x-tex"]')?.textContent || '';
  const display = el.dataset.display === '1';
  return { text: display ? '$$' + tex + '$$' : '$' + tex + '$', html: mathOf(el) || '' };
}

/**
 * A copied selection (DocumentFragment) → plain text with formulas as LaTeX and HTML with
 * MathML, or null when the selection has no formula (the browser's own copy is fine then).
 */
export function selectionClip(fragment: DocumentFragment): MathCopy | null {
  const formulas = fragment.querySelectorAll<HTMLElement>('.math-inline, .math-display, math');
  if (!formulas.length) return null;
  const textCopy = fragment.cloneNode(true) as DocumentFragment;
  for (const el of textCopy.querySelectorAll<HTMLElement>('.math-copy')) el.remove();
  // formula wrappers first, then bare <math> (a partial selection may cut the wrapper off)
  for (const el of [...textCopy.querySelectorAll<HTMLElement>('.math-inline, .math-display')]) {
    el.replaceWith(document.createTextNode(formulaClip(el).text));
  }
  for (const m of [...textCopy.querySelectorAll('math')]) {
    const tex = m.querySelector('annotation[encoding="application/x-tex"]')?.textContent || m.textContent || '';
    m.replaceWith(document.createTextNode(m.getAttribute('display') === 'block' ? '$$' + tex + '$$' : '$' + tex + '$'));
  }
  const htmlCopy = fragment.cloneNode(true) as DocumentFragment;
  for (const el of htmlCopy.querySelectorAll('.math-copy')) el.remove();
  const box = document.createElement('div');
  box.append(htmlCopy);
  return { text: (textCopy.textContent || '').replace(/\n{3,}/g, '\n\n'), html: box.innerHTML };
}
