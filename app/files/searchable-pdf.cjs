'use strict';
// v0.9.26: a searchable PDF from scans: each page is the picture as it was, and under it, invisible,
// the words OCR read, each at its place and stretched to its width, so text can be searched,
// selected and copied. The font is a TrueType font of the computer, embedded with a Unicode map
// (app/files/text-pdf.cjs reads it), so Turkish letters search and copy correctly.
const zlib = require('node:zlib');
const { readFont } = require('./text-pdf.cjs');
const jpegSize = (b) => require('./convert.cjs').jpegSize(b);

/**
 * pages: [{ jpeg: Buffer, dpi, words: [{ t, x, y, w, h }] }] (word boxes in the picture's pixels)
 * font: TrueType Buffer. → PDF bytes.
 */
function searchablePdf(pages, font, { title = '' } = {}) {
  const face = readFont(font);
  const used = new Map(); // gid → code point
  const gidOf = (ch) => {
    const cp = ch.codePointAt(0);
    const g = face.map.get(cp) || 0;
    if (g && !used.has(g)) used.set(g, cp);
    return g;
  };
  const advance = (text) => {
    let w = 0;
    for (const ch of text) w += face.widths[gidOf(ch)] || 0;
    return w / face.unitsPerEm; // per point of font size
  };
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const stream = (dict, data, deflate = true) => {
    const bytes = deflate ? zlib.deflateSync(data) : data;
    return { dict: `${dict} /Length ${bytes.length}${deflate ? ' /Filter /FlateDecode' : ''} >>`, data: bytes };
  };
  const catalog = add('');
  const tree = add('');
  const fontRef = add(''); // filled after the pages, when the used glyphs are known
  const kids = [];
  for (const p of pages) {
    const size = jpegSize(p.jpeg);
    if (!size) throw Error('Sayfa resmi okunamadı.');
    const dpi = p.dpi || 150;
    const k = 72 / dpi; // pixels → points
    const W = size.width * k, H = size.height * k;
    const image = add(stream(`<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /${size.components === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, p.jpeg, false));
    objects[image - 1].dict = objects[image - 1].dict.replace(' /Filter /FlateDecode', '');
    const ops = [`q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`, 'BT 3 Tr'];
    for (const w of p.words || []) {
      const text = String(w.t || '').trim();
      if (!text) continue;
      const fs = Math.max(1, w.h * k * 0.92);
      const natural = advance(text) * fs;
      const scale = natural > 0 ? Math.max(10, Math.min(1000, ((w.w * k) / natural) * 100)) : 100;
      const x = w.x * k, y = H - (w.y + w.h) * k + w.h * k * 0.18;
      let hex = '';
      for (const ch of text) hex += gidOf(ch).toString(16).padStart(4, '0');
      ops.push(`/F1 ${fs.toFixed(2)} Tf ${scale.toFixed(1)} Tz 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${hex}> Tj`);
    }
    ops.push('ET');
    const content = add(stream('<<', Buffer.from(ops.join('\n'), 'latin1')));
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 ${image} 0 R >> /Font << /F1 ${fontRef} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  // the font: Type0 / CIDFontType2, Identity-H, with a ToUnicode map of the glyphs used
  const per = 1000 / face.unitsPerEm;
  const file = add(stream(`<< /Length1 ${face.buf.length}`, face.buf));
  const name = 'OCRAAA+' + face.name;
  const descriptor = add(`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${face.bbox.map((v) => Math.round(v * per)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(face.ascent * per)} /Descent ${Math.round(face.descent * per)} /CapHeight ${Math.round(face.ascent * per * 0.7)} /StemV 80 /FontFile2 ${file} 0 R >>`);
  const gids = [...used.keys()].sort((a, b) => a - b);
  const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /W [${gids.map((g) => `${g} [${Math.round((face.widths[g] || 0) * per)}]`).join(' ')}] /DW 500 /CIDToGIDMap /Identity >>`);
  const utf16 = (cp) => {
    const s = String.fromCodePoint(cp);
    let h = '';
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0');
    return h;
  };
  const chunks = [];
  for (let i = 0; i < gids.length; i += 100) {
    const part = gids.slice(i, i + 100);
    chunks.push(`${part.length} beginbfchar\n${part.map((g) => `<${g.toString(16).padStart(4, '0')}> <${utf16(used.get(g))}>`).join('\n')}\nendbfchar`);
  }
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\nendcmap\nCMapName currentdict /CMapType 2 def /CMap defineresource pop\nend\nend`;
  const unicode = add(stream('<<', Buffer.from(cmap, 'latin1')));
  objects[fontRef - 1] = `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Producer (Charles) /Title <FEFF${[...String(title)].map((c) => utf16(c.codePointAt(0))).join('')}> >>`);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  // ── write ──
  const parts = [Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = parts[0].length;
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(offset);
    const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
    const body = typeof o === 'string' ? Buffer.from(o + '\nendobj\n', 'latin1') : Buffer.concat([Buffer.from(o.dict + '\nstream\n', 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    parts.push(head, body);
    offset += head.length + body.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

module.exports = { searchablePdf };
