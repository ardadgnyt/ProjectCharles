'use strict';
// v0.9.16: PowerPoint presentations (.pptx, .ppt) for the chat and the converter.
//
//   loadDeck(file)      → the deck (app/files/pptx-read.cjs, ppt-read.cjs), with clear errors
//   deckText(deck)      → the slides as text, in order and numbered
//   deckHtml(deck)      → one page per slide, for printing to PDF and for slide pictures
//   deckDocx(deck)      → a readable Word document (headings, text, tables, pictures, notes)
//
// A file's content is data: it is escaped into the page and never run; nothing is fetched.
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { readPptx } = require('./pptx-read.cjs');
const { readPpt } = require('./ppt-read.cjs');

const MAX_BYTES = 500 * 1024 * 1024;
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const SHOWN = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml']);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loadDeck(file) {
  const name = path.basename(file);
  const size = fs.statSync(file).size;
  if (!size) throw Error(name + ': dosya boş.');
  if (size > MAX_BYTES) throw Error(name + ': sunum en fazla 500 MB olabilir.');
  const bytes = fs.readFileSync(file);
  const ole = bytes.subarray(0, 8).equals(OLE);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  let deck;
  try {
    // the content decides, not the extension (a renamed file still opens or fails honestly)
    if (zip) deck = readPptx(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length));
    else if (ole) deck = readPpt(bytes);
    else throw Error('Bu dosya geçerli bir PowerPoint sunumu değil.');
  } catch (e) {
    throw Error(name + ': ' + e.message);
  }
  if (!deck.slides.length) throw Error(name + ': sunumda slayt yok.');
  deck.name = name;
  return deck;
}

const own = (slide) => slide.shapes.filter((s) => s.layer === 'slide');
const paragraphText = (p) => p.runs.map((r) => (r.br ? '\n' : r.text)).join('');
function titleOf(slide) {
  const shape = own(slide).find((s) => s.kind === 'text' && s.role === 'title' && s.paragraphs.some((p) => paragraphText(p).trim()));
  return shape ? shape.paragraphs.map(paragraphText).join(' ').trim() : '';
}
/** Reading order: the title first, then top to bottom, left to right. */
const ordered = (slide) => own(slide).slice().sort((a, b) => (b.role === 'title') - (a.role === 'title') || Math.round(a.y / 12) - Math.round(b.y / 12) || a.x - b.x);
const cellText = (c) => c.paragraphs.map(paragraphText).join(' ').trim();
const chartLine = (c) => c.series.map((s) => `${s.name || 'Seri'}: ` + s.values.map((v, i) => `${c.categories[i] ?? i + 1}=${v ?? '—'}`).join(', '));
/** Pictures, charts and diagrams: what only an image can really show. */
function visualsOf(slide) {
  const list = own(slide).filter((s) => s.kind === 'image' || s.kind === 'chart' || s.kind === 'missing');
  return { pictures: list.filter((s) => s.kind === 'image').length, charts: list.filter((s) => s.kind === 'chart').length, diagrams: own(slide).some((s) => s.diagram) || list.some((s) => s.kind === 'missing'), any: list.length > 0 || own(slide).some((s) => s.diagram) };
}

function deckText(deck) {
  const out = [];
  for (const slide of deck.slides) {
    const title = titleOf(slide);
    out.push(`[Slayt ${slide.number} / ${deck.slides.length}]${slide.hidden ? ' (gizli slayt)' : ''}${title ? ' ' + title : ''}`);
    for (const s of ordered(slide)) {
      if (s.kind === 'text' && s.role !== 'title') {
        for (const p of s.paragraphs) {
          const t = paragraphText(p).trim();
          if (t) out.push('  '.repeat(p.level) + (p.bullet ? p.bullet + ' ' : '') + t);
        }
      } else if (s.kind === 'table') {
        out.push('Tablo:');
        for (const r of s.rows) out.push('| ' + r.cells.map(cellText).join(' | ') + ' |');
      } else if (s.kind === 'chart') {
        out.push(`Grafik (${s.chartType})${s.title ? ': ' + s.title : ''}`);
        out.push(...chartLine(s));
      }
    }
    const v = visualsOf(slide);
    if (v.pictures) out.push(`(${v.pictures} görsel: ${own(slide).filter((s) => s.kind === 'image' && (s.alt || s.name)).map((s) => s.alt || s.name).slice(0, 4).join(', ') || 'açıklama yok'})`);
    if (slide.notes) out.push('Konuşmacı notları: ' + slide.notes);
    out.push('');
  }
  return out.join('\n').trim();
}

// ── drawing ──
const CLIP = {
  triangle: '50% 0,100% 100%,0 100%', rtTriangle: '0 0,100% 100%,0 100%', diamond: '50% 0,100% 50%,50% 100%,0 50%', parallelogram: '25% 0,100% 0,75% 100%,0 100%',
  trapezoid: '25% 0,75% 0,100% 100%,0 100%', pentagon: '50% 0,100% 38%,82% 100%,18% 100%,0 38%', hexagon: '25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%',
  rightArrow: '0 25%,60% 25%,60% 0,100% 50%,60% 100%,60% 75%,0 75%', leftArrow: '100% 25%,40% 25%,40% 0,0 50%,40% 100%,40% 75%,100% 75%',
  upArrow: '25% 100%,25% 40%,0 40%,50% 0,100% 40%,75% 40%,75% 100%', downArrow: '25% 0,75% 0,75% 60%,100% 60%,50% 100%,0 60%,25% 60%',
  chevron: '0 0,75% 0,100% 50%,75% 100%,0 100%,25% 50%', homePlate: '0 0,80% 0,100% 50%,80% 100%,0 100%',
};
const pt = (v) => `${+v.toFixed(2)}pt`;
function boxStyle(s) {
  const parts = [`left:${pt(s.x)}`, `top:${pt(s.y)}`, `width:${pt(s.w)}`, `height:${pt(s.h)}`];
  const turn = [];
  if (s.rot) turn.push(`rotate(${s.rot}deg)`);
  if (s.flipH) turn.push('scaleX(-1)');
  if (s.flipV) turn.push('scaleY(-1)');
  if (turn.length) parts.push('transform:' + turn.join(' '));
  return parts.join(';');
}
function dataUrl(image) {
  return `data:${image.mime};base64,${image.data.toString('base64')}`;
}
function runHtml(r) {
  if (r.br) return '<br>';
  const css = [`font-size:${pt(r.size)}`, `color:${r.color}`];
  if (r.font) css.push(`font-family:${JSON.stringify(r.font).replace(/"/g, "'")},'Segoe UI',Arial,sans-serif`);
  if (r.bold) css.push('font-weight:700');
  if (r.italic) css.push('font-style:italic');
  if (r.underline) css.push('text-decoration:underline');
  return `<span style="${esc(css.join(';'))}">${esc(r.text).replace(/\n/g, '<br>')}</span>`;
}
function paragraphHtml(p) {
  const align = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }[p.align] || 'left';
  const css = [`text-align:${align}`, `margin-left:${pt(p.marL || 0)}`, `text-indent:${pt(p.indent || 0)}`];
  if (p.before) css.push(`margin-top:${pt(p.before)}`);
  const first = p.runs[0];
  const bullet = p.bullet ? `<span style="font-size:${pt(first?.size || 18)};color:${first?.color || '#000'}">${esc(p.bullet)}&nbsp;</span>` : '';
  if (!p.runs.length || !p.runs.some((r) => r.text || r.br)) css.push(`height:${pt((p.height || 18) * 1.2)}`);
  return `<p style="${css.join(';')}">${bullet}${p.runs.map(runHtml).join('')}</p>`;
}
function chartSvg(c, width, height) {
  const palette = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
  const label = (x, y, text, size = 11, anchor = 'middle') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="#444" font-family="Segoe UI,Arial">${esc(text)}</text>`;
  const top = c.title ? 30 : 10, bottom = 34, left = 44, right = 12;
  const plotW = Math.max(20, width - left - right), plotH = Math.max(20, height - top - bottom);
  const parts = c.title ? [label(width / 2, 20, c.title, 14)] : [];
  const values = c.series.flatMap((s) => s.values.filter((v) => v !== null));
  if (['pie', 'doughnut'].includes(c.chartType)) {
    const list = (c.series[0]?.values || []).map((v) => Math.max(0, v || 0));
    const sum = list.reduce((a, b) => a + b, 0) || 1;
    const r = Math.min(plotW, plotH) / 2 - 8, cx = width / 2, cy = top + plotH / 2;
    let angle = -Math.PI / 2;
    list.forEach((v, i) => {
      const next = angle + (v / sum) * 2 * Math.PI;
      const big = next - angle > Math.PI ? 1 : 0;
      parts.push(`<path d="M${cx},${cy}L${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}A${r},${r} 0 ${big} 1 ${cx + r * Math.cos(next)},${cy + r * Math.sin(next)}Z" fill="${palette[i % 6]}"/>`);
      const mid = (angle + next) / 2;
      parts.push(label(cx + (r + 2) * 0.62 * Math.cos(mid), cy + (r + 2) * 0.62 * Math.sin(mid), `${c.categories[i] ?? ''}`, 10));
      angle = next;
    });
  } else {
    const max = Math.max(0, ...values), min = Math.min(0, ...values);
    const span = max - min || 1;
    const yOf = (v) => top + plotH - ((v - min) / span) * plotH;
    for (let i = 0; i <= 4; i++) {
      const v = min + (span * i) / 4;
      parts.push(`<line x1="${left}" x2="${left + plotW}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="#ddd"/>`, label(left - 5, yOf(v) + 4, String(+v.toFixed(2)), 9, 'end'));
    }
    const count = Math.max(c.categories.length, ...c.series.map((s) => s.values.length), 1);
    const step = plotW / count;
    c.series.forEach((s, si) => {
      if (['line', 'area', 'scatter'].includes(c.chartType)) {
        const pts = s.values.map((v, i) => (v === null ? null : `${left + step * (i + 0.5)},${yOf(v)}`)).filter(Boolean);
        parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${palette[si % 6]}" stroke-width="2"/>`);
      } else {
        const w = (step * 0.75) / c.series.length;
        s.values.forEach((v, i) => {
          if (v === null) return;
          const y = yOf(Math.max(v, 0)), zero = yOf(0);
          parts.push(`<rect x="${left + step * i + step * 0.125 + w * si}" y="${y}" width="${w}" height="${Math.abs(yOf(v) - zero)}" fill="${palette[si % 6]}"/>`);
        });
      }
    });
    c.categories.forEach((name, i) => parts.push(label(left + step * (i + 0.5), top + plotH + 14, String(name).slice(0, 18), 9.5)));
    c.series.forEach((s, i) => parts.push(`<rect x="${left + i * 90}" y="${height - 12}" width="9" height="9" fill="${palette[i % 6]}"/>`, label(left + i * 90 + 13, height - 4, String(s.name).slice(0, 12), 9.5, 'start')));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">${parts.join('')}</svg>`;
}
function shapeHtml(s) {
  if (s.kind === 'image') {
    if (!s.image || !SHOWN.has(s.image.mime)) {
      s.notDrawn = true;
      return `<div class="sh missing" style="${boxStyle(s)}"></div>`;
    }
    const { l, t, r, b } = s.crop;
    const w = 100 / (1 - (l + r) / 100 || 1), h = 100 / (1 - (t + b) / 100 || 1);
    return `<div class="sh crop" style="${boxStyle(s)}"><img src="${dataUrl(s.image)}" alt="" style="width:${w}%;height:${h}%;left:${(-l * w) / 100}%;top:${(-t * h) / 100}%"></div>`;
  }
  if (s.kind === 'line') {
    const flat = s.h < 1 ? `height:0;border-top:${pt(s.line.width)} solid ${s.line.color}` : s.w < 1 ? `width:0;border-left:${pt(s.line.width)} solid ${s.line.color}` : '';
    if (flat) return `<div class="sh" style="${boxStyle(s)};${flat}"></div>`;
    return `<svg class="sh" style="${boxStyle(s)}" viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="none"><line x1="0" y1="0" x2="${s.w}" y2="${s.h}" stroke="${s.line.color}" stroke-width="${s.line.width}"/></svg>`;
  }
  if (s.kind === 'chart') return `<div class="sh" style="${boxStyle(s)}">${chartSvg(s, Math.max(60, s.w), Math.max(40, s.h))}</div>`;
  if (s.kind === 'table') {
    const cols = s.widths.map((w) => `<col style="width:${pt(w)}">`).join('');
    const rows = s.rows.map((r) => `<tr style="height:${pt(r.height)}">${r.cells.map((c) => `<td colspan="${c.span}" rowspan="${c.rowSpan}"${c.fill ? ` style="background:${esc(c.fill)}"` : ''}>${c.paragraphs.map(paragraphHtml).join('')}</td>`).join('')}</tr>`).join('');
    return `<table class="sh" style="${boxStyle({ ...s, h: 0 }).replace(/height:[^;]+;?/, '')}"><colgroup>${cols}</colgroup>${rows}</table>`;
  }
  if (s.kind === 'missing') return `<div class="sh missing" style="${boxStyle(s)}"></div>`;
  const css = [boxStyle(s)];
  if (s.fill) css.push(/gradient/.test(s.fill) ? `background-image:${s.fill}` : `background:${s.fill}`);
  if (s.line) css.push(`outline:${pt(s.line.width)} solid ${s.line.color};outline-offset:-${pt(s.line.width)}`);
  if (s.geom === 'ellipse') css.push('border-radius:50%');
  else if (s.geom === 'roundRect') css.push(`border-radius:${pt(Math.min(s.w, s.h) * 0.16)}`);
  else if (CLIP[s.geom]) css.push(`clip-path:polygon(${CLIP[s.geom]})`);
  const [t, r, b, l] = s.body.insets;
  css.push(`padding:${pt(t)} ${pt(r)} ${pt(b)} ${pt(l)}`, `justify-content:${{ ctr: 'center', b: 'flex-end' }[s.body.anchor] || 'flex-start'}`);
  if (/vert/.test(s.body.vertical) && s.body.vertical !== 'horz') css.push(`writing-mode:vertical-rl${s.body.vertical === 'vert270' ? ';transform:rotate(180deg)' : ''}`);
  return `<div class="sh tx" style="${esc(css.join(';')).replace(/&quot;/g, "'")}">${s.paragraphs.map(paragraphHtml).join('')}</div>`;
}
function slideHtml(slide, deck, scale) {
  const bg = slide.background || {};
  const css = [`width:${pt(deck.width)}`, `height:${pt(deck.height)}`, `zoom:${scale}`];
  if (bg.image && SHOWN.has(bg.image.mime)) css.push(`background:url(${dataUrl(bg.image)}) center/cover`);
  else css.push(/gradient/.test(bg.fill || '') ? `background-image:${bg.fill}` : `background:${bg.fill || '#fff'}`);
  return `<section style="${css.join(';')}">${slide.shapes.map(shapeHtml).join('')}</section>`;
}
/** All slides, one per page. `scale` draws them larger for pictures. */
function deckHtml(deck, { scale = 1, only = null } = {}) {
  const slides = only ? deck.slides.filter((s) => only.includes(s.number)) : deck.slides;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(deck.name || 'Sunum')}</title><style>
@page{size:${pt(deck.width)} ${pt(deck.height)};margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
section{position:relative;overflow:hidden;break-after:page;break-inside:avoid;font-family:'Segoe UI',Arial,sans-serif}
section:last-child{break-after:auto}
.sh{position:absolute;margin:0}.tx{display:flex;flex-direction:column;overflow:visible}
.tx p,td p{margin:0;line-height:1.16;overflow-wrap:anywhere}.crop{overflow:hidden}.crop img{position:absolute;max-width:none}
table.sh{border-collapse:collapse;table-layout:fixed}td{border:.75pt solid #999;padding:3pt 5pt;vertical-align:top}
.missing{border:1pt dashed #b0b0b0;background:#f3f3f3}
</style></head><body>${slides.map((s) => slideHtml(s, deck, scale)).join('')}</body></html>`;
}
/** Pictures the built-in drawing could not show (EMF, WMF, TIFF). Call after deckHtml. */
const undrawn = (deck) => deck.slides.filter((s) => s.shapes.some((x) => x.notDrawn || x.kind === 'missing')).map((s) => s.number);

// ── Word ──
const xml = (s) => esc(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const MEDIA_TYPE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', emf: 'image/x-emf', wmf: 'image/x-wmf', tif: 'image/tiff', tiff: 'image/tiff' };
function deckDocx(deck, { charts = new Map() } = {}) {
  const media = [];
  const mediaIds = new Map();
  const addMedia = (ext, data) => {
    const key = data;
    if (!mediaIds.has(key)) {
      media.push({ name: `image${media.length + 1}.${ext}`, data });
      mediaIds.set(key, { rid: 'rId' + (media.length + 10), id: media.length });
    }
    return mediaIds.get(key);
  };
  const run = (r) => {
    if (r.br) return '<w:r><w:br/></w:r>';
    const pr = (r.bold ? '<w:b/>' : '') + (r.italic ? '<w:i/>' : '') + (r.underline ? '<w:u w:val="single"/>' : '');
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(r.text)}</w:t></w:r>`;
  };
  const para = (runs, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
  const text = (t, pPr) => para(`<w:r><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`, pPr);
  const drawing = (ref, w, h, alt) => {
    const max = 5.9 * 914400;
    let cx = Math.round(w * 12700), cy = Math.round(h * 12700);
    if (cx > max) { cy = Math.round((cy * max) / cx); cx = max; }
    return para(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${ref.id + 100}" name="Görsel ${ref.id}" descr="${xml(alt || '')}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${ref.id + 100}" name="image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${ref.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`);
  };
  const body = [];
  for (const slide of deck.slides) {
    const title = titleOf(slide) || `Slayt ${slide.number}`;
    body.push(text(`Slayt ${slide.number}: ${title}`, `<w:pStyle w:val="Heading1"/>${slide.number > 1 ? '<w:pageBreakBefore/>' : ''}`));
    if (slide.hidden) body.push(text('(Gizli slayt)', ''));
    for (const s of ordered(slide)) {
      if (s.kind === 'text' && s.role !== 'title') {
        for (const p of s.paragraphs) {
          if (!paragraphText(p).trim()) continue;
          const pr = p.bullet ? `<w:pStyle w:val="ListParagraph"/><w:ind w:left="${360 + 360 * p.level}" w:hanging="240"/>` : '';
          body.push(para((p.bullet ? `<w:r><w:t xml:space="preserve">${xml(p.bullet)} </w:t></w:r>` : '') + p.runs.map(run).join(''), pr));
        }
      } else if (s.kind === 'table') {
        const count = Math.max(...s.rows.map((r) => r.cells.reduce((n, c) => n + c.span, 0)));
        const width = Math.floor(9000 / count);
        const rows = s.rows.map((r) => `<w:tr>${r.cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${width * c.span}" w:type="dxa"/>${c.span > 1 ? `<w:gridSpan w:val="${c.span}"/>` : ''}</w:tcPr>${c.paragraphs.map((p) => para(p.runs.map(run).join(''))).join('') || '<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('');
        const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('');
        body.push(`<w:tbl><w:tblPr><w:tblW w:w="${width * count}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr><w:tblGrid>${Array(count).fill(`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`, '<w:p/>');
      } else if (s.kind === 'image' && s.image && MEDIA_TYPE[s.image.ext]) {
        body.push(drawing(addMedia(s.image.ext === 'jpeg' ? 'jpg' : s.image.ext, s.image.data), s.w, s.h, s.alt || s.name));
      } else if (s.kind === 'image') {
        body.push(text(`[Bu görsel Word'e aktarılamadı: ${s.name || 'görsel'}]`, ''));
      } else if (s.kind === 'chart') {
        if (s.title) body.push(text('Grafik: ' + s.title, ''));
        const png = charts.get(s);
        if (png) body.push(drawing(addMedia('png', png), s.w, s.h, s.title || 'Grafik'));
        for (const line of chartLine(s)) body.push(text(line, ''));
      }
    }
    if (slide.notes) {
      body.push(text('Konuşmacı notları', '<w:pStyle w:val="Heading2"/>'));
      for (const line of slide.notes.split('\n')) if (line.trim()) body.push(text(line, ''));
    }
  }
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const document = `${head}<w:document ${NS}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const heading = (n, size) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `${head}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${heading(1, 32)}${heading(2, 24)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
  const defaults = [...new Set(media.map((m) => m.name.split('.').pop()))].map((e) => `<Default Extension="${e}" ContentType="${MEDIA_TYPE[e]}"/>`).join('');
  const rels = media.map((m, i) => `<Relationship Id="rId${i + 11}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('');
  const files = {
    '[Content_Types].xml': strToU8(`${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels}</Relationships>`),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
  };
  for (const m of media) files['word/media/' + m.name] = [new Uint8Array(m.data), { level: 0 }];
  return Buffer.from(zipSync(files));
}

function deckMarkdown(deck) {
  const out = [];
  for (const slide of deck.slides) {
    out.push(`## Slayt ${slide.number}${titleOf(slide) ? ': ' + titleOf(slide) : ''}`, '');
    for (const s of ordered(slide)) {
      if (s.kind === 'text' && s.role !== 'title') for (const p of s.paragraphs) {
        const t = paragraphText(p).trim();
        if (t) out.push('  '.repeat(p.level) + (p.bullet ? '- ' : '') + t, ...(p.bullet ? [] : ['']));
      } else if (s.kind === 'table') {
        const rows = s.rows.map((r) => '| ' + r.cells.map((c) => cellText(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
        out.push('', rows[0], '|' + ' --- |'.repeat(s.rows[0].cells.length), ...rows.slice(1), '');
      } else if (s.kind === 'chart') out.push('', `Grafik${s.title ? ': ' + s.title : ''}`, ...chartLine(s).map((l) => '- ' + l), '');
    }
    if (slide.notes) out.push('', '> Konuşmacı notları: ' + slide.notes.replace(/\n/g, ' '), '');
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = { loadDeck, deckText, deckHtml, deckDocx, deckMarkdown, undrawn, visualsOf, titleOf, chartSvg, MAX_BYTES };
