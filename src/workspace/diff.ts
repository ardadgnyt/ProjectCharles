// v0.7.7: line, paragraph and word differences for the change review screen (review.ts).
// A plain Myers diff (the algorithm behind `git diff`) with a limit, so a huge file never
// freezes the window: past the limit the middle part is shown as replaced.

export type Op = { t: '=' | '-' | '+'; a: string };

/** Shortest edit script between two lists of strings. */
export function diffList(a: string[], b: string[], maxD = 1200): Op[] {
  // common start and end are cut first: most edits touch a small part of a file
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const head: Op[] = a.slice(0, s).map((x) => ({ t: '=', a: x }));
  const tail: Op[] = a.slice(a.length - e).map((x) => ({ t: '=', a: x }));
  const A = a.slice(s, a.length - e);
  const B = b.slice(s, b.length - e);
  return [...head, ...myers(A, B, maxD), ...tail];
}

function myers(a: string[], b: string[], maxD: number): Op[] {
  const n = a.length,
    m = b.length;
  if (!n) return b.map((x) => ({ t: '+', a: x }));
  if (!m) return a.map((x) => ({ t: '-', a: x }));
  const max = Math.min(n + m, maxD);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) break;
  }
  // too different: everything removed, then everything added
  if (found < 0) return [...a.map((x) => ({ t: '-' as const, a: x })), ...b.map((x) => ({ t: '+' as const, a: x }))];
  const out: Op[] = [];
  let x = n,
    y = m;
  for (let d = found; d > 0; d--) {
    const vv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]) ? k + 1 : k - 1;
    const px = vv[off + prevK];
    const py = px - prevK;
    while (x > px && y > py) {
      out.push({ t: '=', a: a[--x] });
      y--;
    }
    if (x === px) out.push({ t: '+', a: b[--y] });
    else out.push({ t: '-', a: a[--x] });
  }
  while (x > 0 && y > 0) {
    out.push({ t: '=', a: a[--x] });
    y--;
  }
  return out.reverse();
}

export type Row = { t: '=' | '-' | '+' | 'skip'; a: string; old?: number; new?: number; count?: number };

/** Line diff with line numbers; long unchanged runs are folded ("… 24 satır aynı"). */
export function lineRows(before: string, after: string, context = 3): Row[] {
  const split = (s: string) => (s === '' ? [] : s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));
  const ops = diffList(split(before), split(after));
  const rows: Row[] = [];
  let o = 1,
    n = 1;
  for (const op of ops) {
    if (op.t === '=') rows.push({ t: '=', a: op.a, old: o++, new: n++ });
    else if (op.t === '-') rows.push({ t: '-', a: op.a, old: o++ });
    else rows.push({ t: '+', a: op.a, new: n++ });
  }
  return fold(rows, context);
}

function fold(rows: Row[], context: number): Row[] {
  const keep = rows.map((r) => r.t !== '=');
  const near = keep.map((_, i) => {
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) if (keep[j]) return true;
    return false;
  });
  const out: Row[] = [];
  for (let i = 0; i < rows.length; ) {
    if (near[i]) {
      out.push(rows[i++]);
      continue;
    }
    let j = i;
    while (j < rows.length && !near[j]) j++;
    if (j - i <= 2) out.push(...rows.slice(i, j));
    else out.push({ t: 'skip', a: '', count: j - i });
    i = j;
  }
  return out;
}

/** Rows of a unified diff text (when only the diff is known). */
export function unifiedRows(diff: string): Row[] {
  const rows: Row[] = [];
  let o = 0,
    n = 0;
  for (const line of diff.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (h) {
      if (rows.length) rows.push({ t: 'skip', a: '', count: 0 });
      o = +h[1];
      n = +h[2];
      continue;
    }
    if (/^(---|\+\+\+|diff |index )/.test(line)) continue;
    if (line.startsWith('+')) rows.push({ t: '+', a: line.slice(1), new: n++ });
    else if (line.startsWith('-')) rows.push({ t: '-', a: line.slice(1), old: o++ });
    else if (line.startsWith(' ')) rows.push({ t: '=', a: line.slice(1), old: o++, new: n++ });
  }
  return rows;
}

export type Para = { t: '=' | 'changed' | '-' | '+'; before?: string; after?: string; words?: Op[] };

/** Paragraph level changes for text documents; changed paragraphs get a word diff. */
export function paragraphChanges(before: string, after: string): Para[] {
  const split = (s: string) =>
    s
      .replace(/\r\n/g, '\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  const ops = diffList(split(before), split(after));
  const out: Para[] = [];
  for (let i = 0; i < ops.length; ) {
    if (ops[i].t === '=') {
      out.push({ t: '=', before: ops[i].a, after: ops[i].a });
      i++;
      continue;
    }
    // a block of removed and added paragraphs: pair them in order while they still look
    // alike (an edited paragraph), the rest are really removed or added
    const del: string[] = [];
    const add: string[] = [];
    while (i < ops.length && ops[i].t !== '=') (ops[i].t === '-' ? del : add).push(ops[i++].a);
    let a = 0,
      b = 0;
    while (a < del.length || b < add.length) {
      if (a < del.length && b < add.length && similar(del[a], add[b])) {
        out.push({ t: 'changed', before: del[a], after: add[b], words: wordDiff(del[a], add[b]) });
        a++;
        b++;
      } else if (a < del.length && (b >= add.length || del.length - a >= add.length - b)) out.push({ t: '-', before: del[a++] });
      else out.push({ t: '+', after: add[b++] });
    }
  }
  return out;
}

/** Two paragraphs share at least a third of their words. */
export function similar(a: string, b: string) {
  const wa = new Set(a.toLocaleLowerCase().split(/\s+/).filter(Boolean));
  const wb = b.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!wa.size || !wb.length) return false;
  const common = wb.filter((w) => wa.has(w)).length;
  return common / Math.max(wa.size, wb.length) >= 0.34;
}

export function wordDiff(a: string, b: string): Op[] {
  const words = (s: string) => s.match(/\s+|[^\s]+/g) || [];
  return diffList(words(a), words(b), 1500);
}

/** How many lines were added and removed. */
export function stats(rows: Row[]) {
  let add = 0,
    del = 0;
  for (const r of rows) {
    if (r.t === '+') add++;
    if (r.t === '-') del++;
  }
  return { add, del };
}
