'use strict';
// v0.8.11: a text PDF written directly (TXT, Markdown, Word, HTML → PDF). The v0.8.10 converter
// printed a hidden page, which could come out empty; this writes the text itself with a
// TrueType font of the computer (Segoe UI or Arial on Windows) embedded, so every character
// (ç, ğ, ı, ö, ş, ü, …) shows and the text can be selected and searched.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

/** Reads what the PDF needs from a TrueType font: glyph ids, widths, metrics. */
function readFont(buf) {
  const u16 = (o) => buf.readUInt16BE(o);
  const i16 = (o) => buf.readInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);
  const version = u32(0);
  if (version !== 0x00010000 && version !== 0x74727565) throw Error('Yazı tipi TrueType değil.');
  const tables = {};
  const count = u16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    tables[buf.toString('latin1', at, at + 4)] = { offset: u32(at + 8), length: u32(at + 12) };
  }
  for (const t of ['head', 'hhea', 'hmtx', 'cmap', 'maxp']) if (!tables[t]) throw Error('Yazı tipi eksik: ' + t);
  const head = tables.head.offset;
  const unitsPerEm = u16(head + 18);
  const bbox = [i16(head + 36), i16(head + 38), i16(head + 40), i16(head + 42)];
  const hhea = tables.hhea.offset;
  const ascent = i16(hhea + 4), descent = i16(hhea + 6);
  const metrics = u16(hhea + 34);
  const glyphs = u16(tables.maxp.offset + 4);
  const widths = new Uint16Array(glyphs);
  for (let g = 0; g < glyphs; g++) widths[g] = u16(tables.hmtx.offset + Math.min(g, metrics - 1) * 4);
  // cmap: Windows Unicode, full repertoire (format 12) or BMP (format 4)
  const cmap = tables.cmap.offset;
  let sub4 = null, sub12 = null;
  for (let i = 0; i < u16(cmap + 2); i++) {
    const at = cmap + 4 + i * 8;
    const platform = u16(at), encoding = u16(at + 2), offset = cmap + u32(at + 4);
    const format = u16(offset);
    if (platform === 3 && encoding === 10 && format === 12) sub12 = offset;
    if ((platform === 3 && encoding === 1) || platform === 0) if (format === 4 && !sub4) sub4 = offset;
  }
  const map = new Map();
  if (sub12) {
    const n = u32(sub12 + 12);
    for (let i = 0; i < n; i++) {
      const at = sub12 + 16 + i * 12;
      const start = u32(at), end = u32(at + 4), gid = u32(at + 8);
      for (let c = start; c <= end && c - start < 70000; c++) map.set(c, gid + (c - start));
    }
  } else if (sub4) {
    const segs = u16(sub4 + 6) / 2;
    const ends = sub4 + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = u16(ends + s * 2), start = u16(starts + s * 2), delta = i16(deltas + s * 2), range = u16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (range === 0) gid = (c + delta) & 0xffff;
        else {
          const at = ranges + s * 2 + range + (c - start) * 2;
          gid = at + 1 < buf.length ? u16(at) : 0;
          if (gid) gid = (gid + delta) & 0xffff;
        }
        if (gid) map.set(c, gid);
      }
    }
  } else throw Error('Yazı tipinde Unicode tablosu yok.');
  const name = (tables.name && readName(buf, tables.name.offset)) || 'CharlesFont';
  return { buf, unitsPerEm, bbox, ascent, descent, widths, map, name };
}
function readName(buf, at) {
  try {
    const count = buf.readUInt16BE(at + 2), strings = at + buf.readUInt16BE(at + 4);
    for (let i = 0; i < count; i++) {
      const r = at + 6 + i * 12;
      if (buf.readUInt16BE(r + 6) !== 6) continue; // PostScript name
      const len = buf.readUInt16BE(r + 8), off = strings + buf.readUInt16BE(r + 10);
      const platform = buf.readUInt16BE(r);
      const raw = buf.subarray(off, off + len);
      const text = platform === 3 ? raw.swap16 && Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
      const clean = String(text || '').replace(/[^A-Za-z0-9-]/g, '');
      if (clean) return clean.slice(0, 60);
    }
  } catch {}
  return '';
}

/** Fonts to embed: Windows' Segoe UI or Arial (bold too); on other systems a common sans. */
function systemFonts(env = process.env, exists = fs.existsSync) {
  const win = path.join(env.WINDIR || env.SystemRoot || 'C:\\Windows', 'Fonts');
  const pairs = [
    [path.join(win, 'segoeui.ttf'), path.join(win, 'segoeuib.ttf')],
    [path.join(win, 'arial.ttf'), path.join(win, 'arialbd.ttf')],
    [path.join(win, 'calibri.ttf'), path.join(win, 'calibrib.ttf')],
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
    ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'],
    ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
  ];
  for (const [regular, bold] of pairs) if (exists(regular)) return { regular, bold: exists(bold) ? bold : regular };
  return null;
}

const PAGE = { width: 595.28, height: 841.89, margin: 56 };
const STYLE = {
  body: { size: 11, lead: 1.45, bold: false, before: 0, after: 7 },
  1: { size: 19, lead: 1.25, bold: true, before: 10, after: 8 },
  2: { size: 15.5, lead: 1.25, bold: true, before: 9, after: 6 },
  3: { size: 13, lead: 1.3, bold: true, before: 7, after: 5 },
};

/**
 * blocks: [{ text, heading?: 1–3, bullet?: true }] → PDF bytes.
 * fonts: { regular: Buffer, bold: Buffer } (TrueType).
 */
function textPdf(blocks, fonts, { title = '' } = {}) {
  const faces = { regular: readFont(fonts.regular), bold: readFont(fonts.bold || fonts.regular) };
  const used = { regular: new Map(), bold: new Map() }; // gid → code point
  const glyph = (face, ch) => {
    const cp = ch.codePointAt(0);
    const gid = faces[face].map.get(cp) || 0;
    if (gid && !used[face].has(gid)) used[face].set(gid, cp);
    return gid;
  };
  const width = (face, text, size) => {
    let w = 0;
    for (const ch of text) w += faces[face].widths[glyph(face, ch)] || 0;
    return (w / faces[face].unitsPerEm) * size;
  };
  const maxWidth = PAGE.width - PAGE.margin * 2;
  const pages = [];
  let ops = [], y = PAGE.height - PAGE.margin;
  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = PAGE.height - PAGE.margin;
  };
  const hex = (face, text) => {
    let out = '';
    for (const ch of text) out += glyph(face, ch).toString(16).padStart(4, '0');
    return out;
  };
  const wrap = (face, text, size, limit) => {
    const lines = [];
    for (const para of text.replace(/\t/g, '    ').split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        if (!word) continue;
        const next = line + word;
        if (width(face, next, size) <= limit || !line.trim()) {
          if (width(face, next, size) <= limit) {
            line = next;
            continue;
          }
          // a word longer than a line is broken by characters
          for (const ch of word) {
            if (width(face, line + ch, size) > limit && line) {
              lines.push(line);
              line = '';
            }
            line += ch;
          }
          continue;
        }
        lines.push(line.replace(/\s+$/, ''));
        line = word.trim() ? word : '';
      }
      lines.push(line.replace(/\s+$/, ''));
    }
    return lines;
  };
  let first = true;
  for (const b of blocks) {
    const style = STYLE[b.heading] || STYLE.body;
    const face = style.bold ? 'bold' : 'regular';
    const indent = b.bullet ? 16 : 0;
    const lead = style.size * style.lead;
    if (!first) y -= style.before;
    first = false;
    const lines = wrap(face, String(b.text || ''), style.size, maxWidth - indent);
    lines.forEach((line, i) => {
      if (y - lead < PAGE.margin) newPage();
      y -= lead;
      const baseline = (y + (lead - style.size) / 2 + style.size * 0.22).toFixed(2);
      if (b.bullet && i === 0) ops.push(`BT /F${face === 'bold' ? 2 : 1} ${style.size} Tf ${PAGE.margin.toFixed(2)} ${baseline} Td <${hex(face, '•')}> Tj ET`);
      if (line) ops.push(`BT /F${face === 'bold' ? 2 : 1} ${style.size} Tf ${(PAGE.margin + indent).toFixed(2)} ${baseline} Td <${hex(face, line)}> Tj ET`);
    });
    y -= style.after;
  }
  pages.push(ops);

  // ── objects ──
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const stream = (dict, data, compress = true) => {
    const bytes = compress ? zlib.deflateSync(data) : data;
    return { dict: `${dict} /Length ${bytes.length}${compress ? ' /Filter /FlateDecode' : ''}`, data: bytes };
  };
  const font = (key) => {
    const f = faces[key];
    const k = 1000 / f.unitsPerEm;
    const file = add(stream(`<< /Length1 ${f.buf.length}`, f.buf));
    objects[file - 1].dict += ' >>';
    const name = (key === 'bold' ? 'B' : 'R') + 'AAAAA+' + f.name;
    const descriptor = add(`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${f.bbox.map((v) => Math.round(v * k)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(f.ascent * k)} /Descent ${Math.round(f.descent * k)} /CapHeight ${Math.round(f.ascent * k * 0.7)} /StemV 80 /FontFile2 ${file} 0 R >>`);
    const gids = [...used[key].keys()].sort((a, b) => a - b);
    const w = gids.map((g) => `${g} [${Math.round((f.widths[g] || 0) * k)}]`).join(' ');
    const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /W [${w}] /DW 500 /CIDToGIDMap /Identity >>`);
    const utf16 = (cp) => {
      const s = String.fromCodePoint(cp);
      let h = '';
      for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0');
      return h;
    };
    const chunks = [];
    for (let i = 0; i < gids.length; i += 100) {
      const part = gids.slice(i, i + 100);
      chunks.push(`${part.length} beginbfchar\n${part.map((g) => `<${g.toString(16).padStart(4, '0')}> <${utf16(used[key].get(g))}>`).join('\n')}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\nendcmap\nCMapName currentdict /CMapType 2 def /CMap defineresource pop\nend\nend`;
    const unicode = add(stream('<<', Buffer.from(cmap, 'latin1')));
    objects[unicode - 1].dict += ' >>';
    return add(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R >>`);
  };
  const f1 = font('regular');
  const f2 = faces.bold === faces.regular ? f1 : used.bold.size ? font('bold') : f1;
  const kids = [];
  const pagesId = objects.length + 1;
  add(''); // the page tree, filled below
  for (const list of pages) {
    const content = add(stream('<<', Buffer.from(list.join('\n'), 'latin1')));
    objects[content - 1].dict += ' >>';
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const pdfString = (s) => '<FEFF' + [...String(s)].map((ch) => {
    const u = String.fromCodePoint(ch.codePointAt(0));
    let h = '';
    for (let i = 0; i < u.length; i++) h += u.charCodeAt(i).toString(16).padStart(4, '0');
    return h;
  }).join('') + '>';
  const info = add(`<< /Title ${pdfString(title.slice(0, 200))} /Producer (Charles) >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const parts = [Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let length = parts[0].length;
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(length);
    const head = Buffer.from(`${i + 1} 0 obj\n${typeof o === 'string' ? o : o.dict}\n`, 'latin1');
    const piece = typeof o === 'string' ? [head, Buffer.from('endobj\n')] : [head, Buffer.from('stream\n'), o.data, Buffer.from('\nendstream\nendobj\n')];
    for (const p of piece) {
      parts.push(p);
      length += p.length;
    }
  });
  const xref = length;
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) tail += String(o).padStart(10, '0') + ' 00000 n \n';
  tail += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  parts.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(parts);
}

module.exports = { textPdf, readFont, systemFonts };
