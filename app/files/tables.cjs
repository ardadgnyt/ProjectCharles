'use strict';
// v0.9.26: a table from words and where they stand (a PDF's text, or what OCR read in a picture).
// Rows come from the words' heights, columns from the gaps that line up from row to row. It is a
// guess, not a reader of ruled lines: the converter shows the cells for checking before saving.
//
//   tableFromWords([{ t|s, x, y, w, h }]) → rows of strings

function median(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Words → rows (top to bottom) of words (left to right). */
function rowsOf(words) {
  const ws = words.map((w) => ({ text: String(w.t ?? w.s ?? ''), x: +w.x, y: +w.y, w: +w.w, h: +w.h })).filter((w) => w.text.trim() && w.w > 0 && w.h > 0);
  ws.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows = [];
  for (const w of ws) {
    const mid = w.y + w.h / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.mid - mid) <= Math.max(row.h, w.h) * 0.55) {
      row.words.push(w);
      row.mid = (row.mid * (row.words.length - 1) + mid) / row.words.length;
      row.h = Math.max(row.h, w.h);
    } else rows.push({ mid, h: w.h, words: [w] });
  }
  for (const r of rows) r.words.sort((a, b) => a.x - b.x);
  return rows;
}

/** One row's words → cells: a gap wider than about two letters starts a new cell. */
function cellsOf(row, letter) {
  const cells = [];
  for (const w of row.words) {
    const last = cells[cells.length - 1];
    if (last && w.x - last.right < letter * 1.6) {
      last.text += ' ' + w.text;
      last.right = Math.max(last.right, w.x + w.w);
    } else cells.push({ text: w.text, left: w.x, right: w.x + w.w });
  }
  return cells;
}

/**
 * Words → table rows. Columns are the places where cells of many rows start or end together; a
 * cell goes to the column its middle falls in. Rows that are one long line (a title, a note) stay
 * one cell in the first column.
 */
function tableFromWords(words) {
  const rows = rowsOf(words);
  if (!rows.length) return [];
  const letter = Math.max(2, median(rows.flatMap((r) => r.words.map((w) => w.w / Math.max(1, w.text.length)))));
  const cellRows = rows.map((r) => cellsOf(r, letter));
  // column boundaries: the gaps between cells, gathered over the rows that have several cells
  const multi = cellRows.filter((c) => c.length >= 2);
  if (!multi.length) return cellRows.map((c) => [c.map((x) => x.text).join(' ')]);
  const width = Math.max(...cellRows.flat().map((c) => c.right));
  const starts = [];
  for (const cells of multi) for (const c of cells) starts.push(c.left);
  starts.sort((a, b) => a - b);
  // cluster starts that lie within a few letters of each other
  const columns = [];
  for (const s of starts) {
    const last = columns[columns.length - 1];
    if (last && s - last.max <= letter * 3) {
      last.max = s;
      last.n++;
    } else columns.push({ min: s, max: s, n: 1 });
  }
  // a column needs a share of the rows behind it, or it was one stray word
  const enough = Math.max(2, Math.ceil(multi.length * 0.25));
  let cols = columns.filter((c) => c.n >= enough).map((c) => c.min);
  if (!cols.length) cols = [columns[0].min];
  if (cols[0] > Math.min(...multi.map((m) => m[0].left)) + letter) cols.unshift(Math.min(...multi.map((m) => m[0].left)));
  const edges = cols.map((c, i) => (i + 1 < cols.length ? (c + cols[i + 1]) / 2 : width + 1));
  void edges;
  const out = [];
  for (const cells of cellRows) {
    const row = Array(cols.length).fill('');
    if (cells.length === 1 && cells[0].right - cells[0].left > (width - cols[0]) * 0.6) {
      row[0] = cells[0].text;
      out.push(row);
      continue;
    }
    for (const c of cells) {
      // the column whose start is the nearest one at or before the cell's start
      let k = 0;
      for (let i = 0; i < cols.length; i++) if (c.left >= cols[i] - letter * 1.5) k = i;
      row[k] = row[k] ? row[k] + ' ' + c.text : c.text;
    }
    out.push(row);
  }
  // columns nobody uses go
  const used = cols.map((_, i) => out.some((r) => r[i]));
  return out.map((r) => r.filter((_, i) => used[i]));
}

module.exports = { tableFromWords, rowsOf };
