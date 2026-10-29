// v0.9.10: tidies a model's answer before it is rendered as Markdown.
//
// 1. Codex marks the files it used as `:codex-file-citation{path="…" purpose="source"}`. These
//    were printed as raw text; now each becomes a small "📄 file" chip.
// 2. A `|` inside a formula in a table row (`$|Z_n|$`) split the cell, the row had more cells than
//    the header line and the whole table was shown as plain text with pipes. Inside formulas in
//    table rows the bar is written as `\vert`, which KaTeX draws the same way.

const CITE = /:codex-file-citation\{([^{}\n]{0,2000})\}/g;
export const CITE_MARK = '⁣CITE';

export type Citation = { path: string; name: string };

function attr(body: string, key: string) {
  const m = new RegExp(key + '\\s*=\\s*"([^"]*)"').exec(body);
  return m ? m[1] : '';
}

/** Returns the text with citations replaced by markers, and the citations themselves. */
export function prepareAnswer(text: string): { text: string; citations: Citation[] } {
  const citations: Citation[] = [];
  let out = String(text || '').replace(CITE, (_m, body: string) => {
    const path = attr(body, 'path');
    if (!path) return '';
    const name = path.split(/[\\/]/).pop() || path;
    citations.push({ path, name });
    return CITE_MARK + (citations.length - 1) + '⁣';
  });
  out = out
    .split('\n')
    .map((line) => (/^\s*\|/.test(line) && line.includes('$') ? protectTableMath(line) : line))
    .join('\n');
  return { text: out, citations };
}

/** `| a | $|Z_n|$ |` → `| a | $\vert Z_n\vert $ |` (only inside $…$ / $$…$$ / \(…\)). */
export function protectTableMath(line: string) {
  return line.replace(/\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\([^\n]*?\\\)/g, (math) =>
    math.replace(/\\\|/g, '\\Vert ').replace(/(?<!\\)\|/g, '\\vert '),
  );
}

const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$/i;

/** Puts the chips where the markers are (after Markdown rendering). */
export function placeCitations(root: HTMLElement, citations: Citation[]) {
  if (!citations.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) if ((walker.currentNode as Text).data.includes(CITE_MARK)) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const parts = node.data.split(/⁣CITE(\d+)⁣/);
    const frag = document.createDocumentFragment();
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        if (part) frag.append(part);
        return;
      }
      const c = citations[Number(part)];
      if (!c) return;
      const chip = document.createElement('span');
      chip.className = 'file-cite';
      chip.title = c.path;
      const ext = (/\.([a-z0-9]{1,8})$/i.exec(c.name)?.[1] || '').toUpperCase();
      // Charles keeps attachments as <id>.pdf in its inbox: show the original name when known
      const id = UUID_FILE.test(c.name) ? c.name.replace(/\.[^.]+$/, '') : '';
      chip.textContent = '📄 ' + (id ? 'Ekteki belge' + (ext ? ' · ' + ext : '') : c.name);
      if (id) {
        chip.dataset.attachment = id;
        void (window as any).charles?.attachmentName?.(id)
          .then((name: string) => {
            if (name) chip.textContent = '📄 ' + name;
          })
          .catch(() => {});
      }
      frag.append(chip);
    });
    node.replaceWith(frag);
  }
  // a paragraph that held only the chip(s) becomes a quiet row
  for (const p of root.querySelectorAll('p'))
    if (p.querySelector('.file-cite') && !p.textContent?.replace(/📄[^\n]*/g, '').trim()) p.classList.add('cite-row');
}
