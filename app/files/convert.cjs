'use strict';
// v0.8.10: Dönüştürücü — converts files dropped on the island's converter card.
//
// Drop files, see only the formats that fit them, the result is saved next to the original.
// Nothing is uploaded. Engines:
//   · FFmpeg (already shipped with Charles in tools/download) — pictures, sound and video,
//   · Electron (nativeImage, a hidden page) — PNG/JPEG without FFmpeg, SVG, PDF printing,
//   · plain JavaScript — PDF from pictures, Word (.docx) writing, text/data/subtitle formats,
//     ZIP packing and safe extraction.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'ico', 'avif', 'tga', 'svg', 'heic', 'heif'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'amr'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpeg', 'mpg', 'ts', 'm2ts', '3gp', 'ogv', 'm4v'],
  document: ['pdf', 'docx', 'md', 'markdown', 'txt', 'html', 'htm'],
  data: ['csv', 'tsv', 'json'],
  subtitle: ['srt', 'vtt'],
  archive: ['zip'],
};
const KIND_NAMES = { image: 'Görsel', audio: 'Ses', video: 'Video', document: 'Belge', data: 'Veri', subtitle: 'Altyazı', archive: 'Arşiv', other: 'Dosya' };
const LABELS = {
  png: 'PNG', jpg: 'JPG', webp: 'WEBP', bmp: 'BMP', tiff: 'TIFF', ico: 'ICO', gif: 'GIF', avif: 'AVIF', pdf: 'PDF',
  mp3: 'MP3', m4a: 'M4A', wav: 'WAV', flac: 'FLAC', ogg: 'OGG', opus: 'OPUS',
  mp4: 'MP4', webm: 'WEBM', mov: 'MOV', mkv: 'MKV',
  txt: 'TXT', docx: 'DOCX', html: 'HTML', md: 'MD',
  csv: 'CSV', tsv: 'TSV', json: 'JSON', srt: 'SRT', vtt: 'VTT',
  zip: 'ZIP', extract: 'Klasöre çıkar',
};
// the group a target is shown under in the format list
const TARGET_GROUP = {
  png: 'image', jpg: 'image', webp: 'image', bmp: 'image', tiff: 'image', ico: 'image', gif: 'image', avif: 'image',
  pdf: 'document', txt: 'document', docx: 'document', html: 'document', md: 'document',
  mp3: 'audio', m4a: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', opus: 'audio',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video',
  csv: 'data', tsv: 'data', json: 'data', srt: 'subtitle', vtt: 'subtitle', zip: 'archive', extract: 'archive',
};
// FFmpeg encoders a target needs (checked once against `ffmpeg -encoders`)
const NEEDS = {
  jpg: ['mjpeg'], png: ['png'], webp: ['libwebp'], bmp: ['bmp'], tiff: ['tiff'], gif: ['gif'], avif: ['libaom-av1'],
  mp3: ['libmp3lame'], m4a: ['aac'], wav: ['pcm_s16le'], flac: ['flac'], ogg: ['libvorbis'], opus: ['libopus'],
  mp4: ['libx264', 'aac'], webm: ['libvpx-vp9', 'libopus'], mov: ['libx264', 'aac'], mkv: ['libx264', 'aac'],
};
const MAX_FILES = 50;
const MAX_TEXT = 64 * 1024 * 1024;

const extOf = (file) => path.extname(file).slice(1).toLowerCase();
function kindOf(file) {
  const ext = extOf(file);
  for (const [kind, list] of Object.entries(KINDS)) if (list.includes(ext)) return kind;
  return 'other';
}
const same = (ext, target) => ext === target || (target === 'jpg' && ['jpeg', 'jfif'].includes(ext)) || (target === 'tiff' && ext === 'tif') || (target === 'html' && ext === 'htm') || (target === 'md' && ext === 'markdown');

/** Formats one file can become, before checking what the engines can do. */
function targetsFor(file) {
  const ext = extOf(file);
  const kind = kindOf(file);
  let list = [];
  if (kind === 'image') {
    list = ext === 'svg' ? ['png', 'jpg', 'webp', 'pdf'] : ['png', 'jpg', 'webp', 'avif', 'bmp', 'tiff', 'ico', 'pdf'];
    if (ext === 'gif') list.push('mp4', 'webm');
    else if (ext !== 'svg') list.push('gif');
  } else if (kind === 'audio') list = ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'];
  else if (kind === 'video') list = ['mp4', 'webm', 'mov', 'mkv', 'gif', 'mp3', 'm4a', 'wav'];
  else if (ext === 'pdf') list = ['docx', 'txt'];
  else if (ext === 'docx') list = ['pdf', 'txt', 'html', 'md'];
  else if (ext === 'md' || ext === 'markdown') list = ['pdf', 'docx', 'html', 'txt'];
  else if (ext === 'txt') list = ['pdf', 'docx', 'html', 'md'];
  else if (ext === 'html' || ext === 'htm') list = ['pdf', 'txt', 'md'];
  else if (ext === 'csv') list = ['json', 'tsv'];
  else if (ext === 'tsv') list = ['csv', 'json'];
  else if (ext === 'json') list = ['csv', 'tsv'];
  else if (ext === 'srt') list = ['vtt'];
  else if (ext === 'vtt') list = ['srt'];
  else if (ext === 'zip') list = ['extract'];
  list = list.filter((t) => !same(ext, t));
  if (ext !== 'zip') list.push('zip');
  return list;
}

/** The formats every one of the files can become (what the format list shows). */
function commonTargets(files, available = () => true) {
  if (!files.length) return [];
  let common = null;
  for (const f of files) {
    const t = targetsFor(f).filter(available);
    common = common ? common.filter((x) => t.includes(x)) : t;
  }
  return (common || []).map((id) => ({ id, label: LABELS[id] || id.toUpperCase(), group: TARGET_GROUP[id] || 'other' }));
}

/** name.ext → name.ext, name (2).ext, … in the same folder; never an existing file. */
function uniquePath(dir, base, ext) {
  let n = 1;
  for (;;) {
    const name = n === 1 ? `${base}${ext ? '.' + ext : ''}` : `${base} (${n})${ext ? '.' + ext : ''}`;
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) return full;
    n++;
  }
}

// ── text, data and subtitles ─────────────────────────────────────────────────
function parseDelimited(text, sep) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}
function writeDelimited(rows, sep) {
  const esc = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /["\n\r]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(esc).join(sep)).join('\r\n') + '\r\n';
}
function tableToObjects(rows) {
  const [head = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h || `sütun${i + 1}`, r[i] ?? ''])));
}
function objectsToTable(value) {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (Object.values(value).find(Array.isArray) || [value]) : [{ değer: value }];
  const rows = list.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : { değer: x }));
  const head = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!head.includes(k)) head.push(k);
  return [head, ...rows.map((r) => head.map((h) => r[h]))];
}
function srtToVtt(text) {
  return 'WEBVTT\n\n' + text.replace(/^\uFEFF/, '').replace(/\r/g, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2').trim() + '\n';
}
function vttToSrt(text) {
  const blocks = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/).filter((b) => /-->/.test(b));
  return blocks.map((b, i) => {
    const lines = b.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    const time = lines[at].replace(/(^|\s)(\d\d:\d\d)\.(\d\d\d)/g, '$100:$2,$3').replace(/(\d\d:\d\d:\d\d)\.(\d\d\d)/g, '$1,$2').replace(/\s+(align|position|line|size|vertical|region):\S+/g, '');
    return `${i + 1}\n${time}\n${lines.slice(at + 1).join('\n')}`;
  }).join('\n\n') + '\n';
}
const escapeHTML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function htmlToText(html) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function htmlToMarkdown(html) {
  return htmlToText(
    html
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => '\n' + '#'.repeat(+n) + ' ' + t + '\n')
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ''),
  ).replace(/^• /gm, '- ');
}
function textToHTML(text, title) {
  const body = text.split(/\n{2,}/).map((p) => `<p>${escapeHTML(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  return page(title, body);
}
function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>
body{font:11pt/1.55 "Segoe UI",Arial,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px}
h1,h2,h3{line-height:1.25;margin:1.2em 0 .5em}pre,code{font-family:Consolas,monospace;background:#f4f4f4}
pre{padding:10px;white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}
img{max-width:100%}blockquote{border-left:3px solid #ccc;margin:0;padding-left:12px;color:#444}
</style></head><body>${body}</body></html>`;
}
function markdownToHTML(md, title) {
  const MarkdownIt = require('markdown-it');
  return page(title, new MarkdownIt({ html: false, linkify: true }).render(md));
}
function markdownToText(md) {
  return md.replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\W)\*([^*\n]+)\*/g, '$1$2').replace(/`([^`]+)`/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
}

// ── Word (.docx) writing: headings, lists and paragraphs ─────────────────────
const xmlText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function docxFromBlocks(blocks) {
  const { zipSync, strToU8 } = require('fflate');
  const para = (b) => {
    const style = b.heading ? `<w:pPr><w:pStyle w:val="Heading${b.heading}"/></w:pPr>` : b.bullet ? '<w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="360" w:hanging="240"/></w:pPr>' : '';
    const text = (b.bullet ? '• ' : '') + b.text;
    const runs = text.split('\n').map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + `<w:r><w:t xml:space="preserve">${xmlText(line)}</w:t></w:r>`).join('');
    return `<w:p>${style}${runs}</w:p>`;
  };
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks.map(para).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const heading = (n, size) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${heading(1, 36)}${heading(2, 30)}${heading(3, 26)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
  }));
}
function blocksFromMarkdown(md) {
  const out = [];
  for (const raw of md.replace(/\r/g, '').split(/\n{2,}/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const lines = chunk.split('\n');
    if (lines.every((l) => /^\s*([-*+]|\d+\.)\s+/.test(l))) {
      for (const l of lines) out.push({ bullet: true, text: markdownToText(l.replace(/^\s*([-*+]|\d+\.)\s+/, '')) });
      continue;
    }
    const h = chunk.match(/^(#{1,3})\s+(.*)$/);
    if (h && lines.length === 1) out.push({ heading: h[1].length, text: markdownToText(h[2]) });
    else if (chunk.trim()) out.push({ text: markdownToText(chunk) });
  }
  return out;
}
/**
 * PDF text → paragraphs. A line continues into the next one when it is long, does not end a
 * sentence and the next line starts in lower case; otherwise a new paragraph starts.
 */
function pdfBlocks(text) {
  const lines = String(text || '').replace(/\r/g, '').replace(/\f/g, '\n').split('\n').map((l) => l.trim());
  const blocks = [];
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      if (cur) blocks.push(cur);
      cur = '';
      continue;
    }
    cur = cur ? (cur.endsWith('-') ? cur.slice(0, -1) + line : cur + ' ' + line) : line;
    const next = lines[i + 1] || '';
    const continues = line.length > 50 && !/[.!?:;]["”’)]?$/.test(line) && /^[a-zçğıöşü0-9(]/.test(next);
    if (!continues) {
      blocks.push(cur);
      cur = '';
    }
  }
  if (cur) blocks.push(cur);
  if (!blocks.length) throw Error('PDF içinde okunabilir metin yok.');
  return blocks.map((t) => ({ text: t }));
}
const blocksFromText = (text) => text.replace(/\r/g, '').split(/\n{2,}/).filter((p) => p.trim()).map((p) => ({ text: p }));
function docxToBlocks(bytes) {
  const { unzipSync, strFromU8 } = require('fflate');
  const zip = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' && f.originalSize <= 20 * 1024 * 1024 });
  const xml = zip['word/document.xml'];
  if (!xml) throw Error('Word belgesi okunamadı.');
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(1114111, +n))).replace(/&amp;/g, '&');
  return strFromU8(xml).split(/<\/w:p>/).map((p) => {
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(br|tab)\b[^>]*\/>/g)].map((m) => (m[2] === 'br' ? '\n' : m[2] === 'tab' ? '\t' : decode(m[1]))).join('');
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] || '';
    const heading = +(style.match(/^(?:Heading|Balk|Başlık)(\d)$/i)?.[1] || 0) || (/^Title$/i.test(style) ? 1 : 0);
    const bullet = /<w:numPr>/.test(p) || /List/i.test(style);
    return { text, heading: Math.min(heading, 3) || undefined, bullet: bullet || undefined };
  }).filter((b) => b.text.trim());
}
const blocksToHTML = (blocks, title) => page(title, blocks.map((b) => (b.heading ? `<h${b.heading}>${escapeHTML(b.text)}</h${b.heading}>` : b.bullet ? `<ul><li>${escapeHTML(b.text)}</li></ul>` : `<p>${escapeHTML(b.text).replace(/\n/g, '<br>')}</p>`)).join('\n').replace(/<\/ul>\n<ul>/g, '\n'));
const blocksToMarkdown = (blocks) => blocks.map((b) => (b.heading ? '#'.repeat(b.heading) + ' ' + b.text : b.bullet ? '- ' + b.text : b.text)).join('\n\n').replace(/^(- .*)\n\n(?=- )/gm, '$1\n') + '\n';
const blocksToText = (blocks) => blocks.map((b) => (b.bullet ? '• ' : '') + b.text).join('\n\n') + '\n';

// ── PDF from JPEG pictures ───────────────────────────────────────────────────
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw Error('JPEG değil.');
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf))
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    i += 2 + len;
  }
  throw Error('JPEG boyutu okunamadı.');
}
/** A PDF with one page per picture; each page is the picture's size at 96 dpi. */
function pdfFromJpegs(jpegs) {
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); parts.push(buf); length += buf.length; };
  const object = (n, body, stream) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
    push('endobj\n');
  };
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const pages = jpegs.map((_, i) => 3 + i * 3);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pages.map((n) => n + ' 0 R').join(' ')}] /Count ${pages.length} >>`);
  jpegs.forEach((jpg, i) => {
    const { width, height, components } = jpegSize(jpg);
    const w = +(width * 0.75).toFixed(2), h = +(height * 0.75).toFixed(2);
    const n = 3 + i * 3;
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    object(n + 1, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${components === 1 ? '/DeviceGray' : components === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
    object(n + 2, `<< /Length ${content.length} >>`, Buffer.from(content, 'latin1'));
  });
  const xref = length;
  const count = 3 + jpegs.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(String(offsets[n]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

/** An .ico with PNG images (Windows Vista and newer read these). */
function icoFromPngs(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    header[at] = size >= 256 ? 0 : size;
    header[at + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

// ── ZIP ──────────────────────────────────────────────────────────────────────
function zipFiles(files) {
  const { zipSync } = require('fflate');
  const entries = {};
  const used = new Set();
  for (const f of files) {
    let name = path.basename(f);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = path.basename(f, path.extname(f)) + ` (${n})` + path.extname(f);
    used.add(name.toLowerCase());
    const stat = fs.statSync(f);
    if (stat.isDirectory()) throw Error(path.basename(f) + ': klasörler henüz paketlenmiyor.');
    entries[name] = [new Uint8Array(fs.readFileSync(f)), { level: /\.(zip|7z|rar|png|jpe?g|webp|gif|mp[34]|m4a|webm|mkv|mov|avi|docx|xlsx|pptx|pdf)$/i.test(name) ? 0 : 6, mtime: stat.mtime }];
  }
  return Buffer.from(zipSync(entries));
}
/** Extracts into a new folder; entries may not leave it (no absolute paths, no ".."). */
// v0.9.1: an archive is unpacked in memory, so at most 1 GB (it was 4 GB)
function unzipTo(file, folder, { maxBytes = 1024 * 1024 * 1024, maxFiles = 20000 } = {}) {
  const { unzipSync } = require('fflate');
  let total = 0, count = 0;
  const raw = fs.readFileSync(file);
  const data = unzipSync(new Uint8Array(raw.buffer, raw.byteOffset, raw.length), {
    filter: (f) => {
      count++;
      total += f.originalSize;
      if (count > maxFiles || total > maxBytes) throw Error('Arşiv çok büyük veya çok fazla dosya içeriyor.');
      return true;
    },
  });
  // v0.9.1: a damaged archive (or one whose sizes are wrong) is not unpacked as if it were whole
  const { crc32, zipChecksums } = require('../core/zip-check.cjs');
  const sums = zipChecksums(raw);
  if (sums) for (const [name, bytes] of Object.entries(data)) if (sums.has(name) && crc32(bytes) !== sums.get(name)) throw Error('Arşiv bozuk: ' + name + ' doğrulanamadı.');
  const root = path.resolve(folder);
  fs.mkdirSync(root, { recursive: true });
  let written = 0;
  for (const [name, bytes] of Object.entries(data)) {
    const clean = name.replace(/\\/g, '/');
    if (!clean || clean.startsWith('/') || /^[a-z]:/i.test(clean) || clean.split('/').includes('..')) continue;
    // v0.9.1: names Windows cannot hold as files (a ":" would write a hidden stream, CON / NUL…
    // are devices, a trailing dot or space is dropped) are skipped
    const parts = clean.split('/').filter(Boolean);
    if (parts.some((p) => /[<>:"|?*\u0000-\u001f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))) continue;
    const target = path.resolve(root, clean);
    if (target !== root && !target.startsWith(root + path.sep)) continue;
    if (clean.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    written++;
  }
  return written;
}

// ── FFmpeg ───────────────────────────────────────────────────────────────────
const QUALITY = {
  high: { jpg: 2, webp: 92, avifCrf: 24, crf: 18, vp9: 28, mp3: '320k', aac: '256k', opus: '160k', ogg: 8, gifFps: 15, gifWidth: 640 },
  balanced: { jpg: 4, webp: 80, avifCrf: 32, crf: 23, vp9: 33, mp3: '192k', aac: '192k', opus: '128k', ogg: 6, gifFps: 12, gifWidth: 480 },
  small: { jpg: 7, webp: 65, avifCrf: 40, crf: 28, vp9: 38, mp3: '128k', aac: '128k', opus: '96k', ogg: 4, gifFps: 10, gifWidth: 360 },
};
function ffmpegArgs(input, output, target, { quality = 'balanced', size = 0 } = {}) {
  const q = QUALITY[quality] || QUALITY.balanced;
  const kind = kindOf(input);
  const a = ['-hide_banner', '-nostdin', '-y', '-i', input];
  const n = Math.max(0, Math.min(8192, Math.round(+size || 0)));
  const imageScale = n ? [`scale=w='min(${n},iw)':h='min(${n},ih)':force_original_aspect_ratio=decrease`] : [];
  const videoScale = n ? [`scale=-2:'min(${n},ih)'`] : [];
  const vf = (filters) => (filters.length ? ['-vf', filters.join(',')] : []);
  if (kind === 'image' && TARGET_GROUP[target] === 'image') {
    const still = ['-frames:v', '1'];
    if (target === 'jpg') return [...a, ...vf([...imageScale, 'format=yuvj444p']), ...still, '-q:v', String(q.jpg), output];
    if (target === 'webp') return [...a, ...vf(imageScale), ...still, '-c:v', 'libwebp', '-quality', String(q.webp), output];
    if (target === 'avif') return [...a, ...vf([...imageScale, 'pad=ceil(iw/2)*2:ceil(ih/2)*2', 'format=yuv420p']), ...still, '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', String(q.avifCrf), '-cpu-used', '6', output];
    if (target === 'gif') return [...a, ...vf(imageScale), ...still, output];
    if (target === 'bmp') return [...a, ...vf([...imageScale, 'format=bgr24']), ...still, output];
    return [...a, ...vf(imageScale), ...still, output];
  }
  if (target === 'gif') {
    const w = n || q.gifWidth;
    return [...a, '-vf', `fps=${q.gifFps},scale='min(${w},iw)':-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', output];
  }
  const audioOnly = TARGET_GROUP[target] === 'audio';
  if (audioOnly) {
    const base = [...a, '-vn', '-map_metadata', '0'];
    if (target === 'mp3') return [...base, '-c:a', 'libmp3lame', '-b:a', q.mp3, output];
    if (target === 'm4a') return [...base, '-c:a', 'aac', '-b:a', q.aac, '-movflags', '+faststart', output];
    if (target === 'wav') return [...base, '-c:a', 'pcm_s16le', output];
    if (target === 'flac') return [...base, '-c:a', 'flac', output];
    if (target === 'ogg') return [...base, '-c:a', 'libvorbis', '-q:a', String(q.ogg), output];
    if (target === 'opus') return [...base, '-c:a', 'libopus', '-b:a', q.opus, output];
  }
  // video (a GIF becomes a silent clip)
  const even = 'pad=ceil(iw/2)*2:ceil(ih/2)*2';
  if (target === 'webm') return [...a, ...vf([...videoScale, even]), '-c:v', 'libvpx-vp9', '-crf', String(q.vp9), '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', q.opus, output];
  return [...a, ...vf([...videoScale, even, 'format=yuv420p']), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(q.crf), '-c:a', 'aac', '-b:a', q.aac, ...(target === 'mp4' || target === 'mov' ? ['-movflags', '+faststart'] : []), output];
}
const seconds = (h, m, s) => +h * 3600 + +m * 60 + +s;
function runFFmpeg(ffmpeg, args, { signal, onProgress, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let duration = 0, tail = '';
    const abort = () => { try { child.kill(); } catch {} };
    signal?.addEventListener('abort', abort, { once: true });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      tail = (tail + text).slice(-6000);
      const d = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (d) duration = seconds(d[1], d[2], d[3]);
      const t = [...text.matchAll(/time=\s*(\d+):(\d+):([\d.]+)/g)].pop();
      if (t && duration > 0) onProgress?.(Math.max(0, Math.min(0.99, seconds(t[1], t[2], t[3]) / duration)));
    });
    child.on('error', (e) => reject(Error('FFmpeg başlatılamadı: ' + e.message)));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(Object.assign(Error('İptal edildi.'), { cancelled: true }));
      if (code === 0) return resolve();
      if (/does not contain any stream|Output file #0 does not contain|matches no streams/i.test(tail)) return reject(Error('Bu dosyada istenen türde bir akış yok (ör. videoda ses yok).'));
      if (/Invalid data found when processing input|could not find codec parameters/i.test(tail)) return reject(Error('Dosya okunamadı; biçim desteklenmiyor veya dosya bozuk.'));
      const line = tail.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(frame|size|video:|\[out)/.test(l)).slice(-2).join(' · ');
      reject(Error('Dönüştürülemedi' + (line ? ': ' + line.slice(0, 240) : '.')));
    });
  });
}
function ffmpegEncoders(ffmpeg, spawnFn = spawn) {
  return new Promise((resolve) => {
    if (!ffmpeg) return resolve(new Set());
    let out = '';
    let child;
    try {
      child = spawnFn(ffmpeg, ['-hide_banner', '-encoders'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return resolve(new Set());
    }
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 8000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (t) => (out += t));
    child.on('error', () => { clearTimeout(timer); resolve(new Set()); });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(new Set([...out.matchAll(/^\s*[VAS][\w.]{5}\s+(\S+)/gm)].map((m) => m[1])));
    });
  });
}

/**
 * The converter. deps:
 *   ffmpeg()        → path of ffmpeg.exe or null
 *   nativeImage     → Electron's nativeImage (PNG/JPEG without FFmpeg, ICO sizes)
 *   fonts()         → { regular, bold } TrueType Buffers for text PDFs (app/files/text-pdf.cjs)
 *   rasterSVG(svg, maxSize) → PNG Buffer
 *   pdfText(file)   → text of a PDF
 */
class Converter {
  constructor(deps = {}) {
    this.deps = deps;
    this.batches = new Map();
    this.encoders = null;
    this.seq = 0;
  }
  async capabilities() {
    if (!this.encoders) this.encoders = await ffmpegEncoders(this.deps.ffmpeg?.(), this.deps.spawn);
    return this.encoders;
  }
  available(file, target, encoders) {
    const ext = extOf(file);
    const kind = kindOf(file);
    const ff = !!this.deps.ffmpeg?.() && encoders.size > 0;
    const enc = (t) => (NEEDS[t] || []).every((e) => encoders.has(e));
    if (kind === 'image') {
      if (ext === 'svg') return !!this.deps.rasterSVG && (['png', 'jpg', 'pdf'].includes(target) || (target === 'webp' && ff && enc('webp')));
      const native = ['png', 'jpg', 'jpeg'].includes(ext) && !!this.deps.nativeImage;
      if (target === 'pdf' || target === 'ico') return native || (ff && enc('png') && (target !== 'pdf' || enc('jpg')));
      if (target === 'zip') return true;
      if (['png', 'jpg'].includes(target) && native) return true;
      return ff && enc(target);
    }
    if (kind === 'audio' || kind === 'video') return target === 'zip' || (ff && enc(target));
    if (target === 'pdf') return !!this.fontFiles();
    return true;
  }
  /** Files picked or dropped by the user → a batch the interface can show. */
  async add(paths) {
    if (!Array.isArray(paths) || !paths.length) throw Error('Dosya seçilmedi.');
    if (paths.length > MAX_FILES) throw Error(`En fazla ${MAX_FILES} dosya birlikte dönüştürülebilir.`);
    const files = [];
    for (const p of paths) {
      if (typeof p !== 'string' || !path.isAbsolute(p)) throw Error('Geçersiz dosya yolu.');
      let stat;
      try { stat = fs.statSync(p); } catch { throw Error(path.basename(p) + ' bulunamadı.'); }
      if (!stat.isFile()) throw Error(path.basename(p) + ': yalnızca dosyalar dönüştürülebilir.');
      files.push({ path: p, name: path.basename(p), ext: extOf(p), size: stat.size, kind: kindOf(p) });
    }
    const encoders = await this.capabilities();
    const targets = commonTargets(paths, () => true).filter((t) => paths.every((p) => this.available(p, t.id, encoders)));
    const kinds = [...new Set(files.map((f) => f.kind))];
    const id = 'c' + ++this.seq + '-' + Date.now().toString(36);
    const batch = { id, files, targets, kind: kinds.length === 1 ? kinds[0] : 'mixed', outputs: [], controller: null };
    this.batches.set(id, batch);
    for (const key of [...this.batches.keys()].slice(0, -8)) this.batches.delete(key);
    return this.view(batch, encoders);
  }
  view(batch, encoders = this.encoders || new Set()) {
    return {
      id: batch.id,
      kind: batch.kind,
      kindName: KIND_NAMES[batch.kind] || 'Karışık',
      files: batch.files.map(({ name, ext, size, kind }) => ({ name, ext, size, kind })),
      targets: batch.targets,
      ffmpeg: !!this.deps.ffmpeg?.() && encoders.size > 0,
    };
  }
  cancel(id) {
    this.batches.get(id)?.controller?.abort();
    return true;
  }
  /** Runs the batch; onProgress({ index, progress, done, output, error }). */
  async run(id, target, options = {}, onProgress = () => {}) {
    const batch = this.batches.get(id);
    if (!batch) throw Error('Dosyaları yeniden bırak.');
    if (!batch.targets.some((t) => t.id === target)) throw Error('Bu biçime dönüştürülemiyor.');
    if (batch.controller) throw Error('Dönüştürme zaten sürüyor.');
    const opts = {
      quality: ['high', 'balanced', 'small'].includes(options.quality) ? options.quality : 'balanced',
      size: Math.max(0, Math.min(8192, Math.round(+options.size || 0))),
      merge: !!options.merge,
    };
    const controller = new AbortController();
    batch.controller = controller;
    batch.outputs = [];
    const results = [];
    try {
      if (target === 'zip') {
        onProgress({ index: 0, progress: 0.1 });
        const first = batch.files[0];
        const base = batch.files.length === 1 ? path.basename(first.name, path.extname(first.name)) : path.basename(path.dirname(first.path)) || 'Dosyalar';
        const out = uniquePath(path.dirname(first.path), base, 'zip');
        fs.writeFileSync(out, zipFiles(batch.files.map((f) => f.path)));
        batch.outputs.push(out);
        batch.files.forEach((_, index) => onProgress({ index, progress: 1, done: true, output: path.basename(out) }));
        return { outputs: [path.basename(out)], failed: 0 };
      }
      if (target === 'pdf' && opts.merge && batch.kind === 'image' && batch.files.length > 1) {
        const jpegs = [];
        for (const [index, f] of batch.files.entries()) {
          if (controller.signal.aborted) throw Object.assign(Error('İptal edildi.'), { cancelled: true });
          onProgress({ index, progress: 0.3 });
          jpegs.push(await this.jpegOf(f.path, opts, controller.signal));
          onProgress({ index, progress: 0.9 });
        }
        const first = batch.files[0];
        const out = uniquePath(path.dirname(first.path), path.basename(first.name, path.extname(first.name)) + ` (+${batch.files.length - 1})`, 'pdf');
        fs.writeFileSync(out, pdfFromJpegs(jpegs));
        batch.outputs.push(out);
        batch.files.forEach((_, index) => onProgress({ index, progress: 1, done: true, output: path.basename(out) }));
        return { outputs: [path.basename(out)], failed: 0 };
      }
      let failed = 0;
      for (const [index, f] of batch.files.entries()) {
        if (controller.signal.aborted) throw Object.assign(Error('İptal edildi.'), { cancelled: true });
        onProgress({ index, progress: 0 });
        try {
          const out = await this.one(f, target, opts, controller.signal, (p) => onProgress({ index, progress: p }));
          batch.outputs.push(out);
          results.push(path.basename(out));
          onProgress({ index, progress: 1, done: true, output: path.basename(out) });
        } catch (e) {
          if (e.cancelled) throw e;
          failed++;
          onProgress({ index, progress: 1, done: true, error: e.message });
        }
      }
      return { outputs: results, failed };
    } finally {
      batch.controller = null;
    }
  }
  /** The folder of the converted files (opened with the first result selected). */
  output(id) {
    const batch = this.batches.get(id);
    return batch?.outputs.find((o) => fs.existsSync(o)) || null;
  }
  async jpegOf(file, opts, signal) {
    const ext = extOf(file);
    if (['jpg', 'jpeg', 'jfif'].includes(ext) && !opts.size) return fs.readFileSync(file);
    const ni = this.deps.nativeImage;
    if (ni && ['png', 'jpg', 'jpeg', 'jfif'].includes(ext)) {
      let img = ni.createFromPath(file);
      if (!img.isEmpty()) {
        img = this.fit(img, opts.size);
        return img.toJPEG(opts.quality === 'high' ? 95 : opts.quality === 'small' ? 70 : 88);
      }
    }
    if (ext === 'svg') {
      const png = await this.deps.rasterSVG(fs.readFileSync(file, 'utf8'), opts.size || 2048);
      return ni.createFromBuffer(png).toJPEG(90);
    }
    const tmp = path.join(os.tmpdir(), `charles-convert-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
    try {
      await runFFmpeg(this.deps.ffmpeg(), ffmpegArgs(file, tmp, 'jpg', opts), { signal, spawnFn: this.deps.spawn });
      return fs.readFileSync(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  async pngOf(file, opts, signal) {
    const ext = extOf(file);
    const ni = this.deps.nativeImage;
    if (ni && ['png', 'jpg', 'jpeg', 'jfif'].includes(ext)) {
      const img = ni.createFromPath(file);
      if (!img.isEmpty()) return this.fit(img, opts.size).toPNG();
    }
    if (ext === 'svg') return this.deps.rasterSVG(fs.readFileSync(file, 'utf8'), opts.size || 2048);
    const tmp = path.join(os.tmpdir(), `charles-convert-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    try {
      await runFFmpeg(this.deps.ffmpeg(), ffmpegArgs(file, tmp, 'png', opts), { signal, spawnFn: this.deps.spawn });
      return fs.readFileSync(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  /** v0.8.11: TrueType fonts of the computer for text PDFs (read once). */
  fontFiles() {
    if (this.fonts !== undefined) return this.fonts;
    try {
      const found = this.deps.fonts ? this.deps.fonts() : require('./text-pdf.cjs').systemFonts();
      this.fonts = found ? { regular: fs.readFileSync(found.regular), bold: fs.readFileSync(found.bold || found.regular) } : null;
    } catch {
      this.fonts = null;
    }
    return this.fonts;
  }
  pdf(blocks, title) {
    const fonts = this.fontFiles();
    if (!fonts) throw Error('PDF için yazı tipi bulunamadı.');
    if (!blocks.length) throw Error('Dosyada metin yok.');
    return require('./text-pdf.cjs').textPdf(blocks, fonts, { title });
  }
  fit(img, size) {
    if (!size) return img;
    const { width, height } = img.getSize();
    if (Math.max(width, height) <= size) return img;
    return width >= height ? img.resize({ width: size, quality: 'best' }) : img.resize({ height: size, quality: 'best' });
  }
  async one(f, target, opts, signal, progress) {
    const dir = path.dirname(f.path);
    const base = path.basename(f.name, path.extname(f.name));
    const ext = f.ext;
    if (target === 'extract') {
      const out = uniquePath(dir, base, '');
      progress(0.2);
      const n = unzipTo(f.path, out);
      if (!n) throw Error('Arşivde çıkarılacak dosya yok.');
      return out;
    }
    const out = uniquePath(dir, base, target);
    const write = (data) => { fs.writeFileSync(out, data); return out; };
    const readText = () => {
      if (f.size > MAX_TEXT) throw Error('Dosya çok büyük.');
      return fs.readFileSync(f.path, 'utf8');
    };
    // pictures
    if (f.kind === 'image') {
      if (target === 'pdf') { progress(0.3); return write(pdfFromJpegs([await this.jpegOf(f.path, opts, signal)])); }
      if (target === 'ico') {
        progress(0.3);
        const png = await this.pngOf(f.path, { ...opts, size: 256 }, signal);
        const ni = this.deps.nativeImage;
        const img = ni.createFromBuffer(png);
        const { width, height } = img.getSize();
        const sizes = [16, 24, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(width, height) || s === 16);
        return write(icoFromPngs(sizes.map((s) => {
          const square = img.resize(width >= height ? { width: s, quality: 'best' } : { height: s, quality: 'best' });
          return { size: s, data: square.toPNG() };
        })));
      }
      if (ext === 'svg') {
        const png = await this.deps.rasterSVG(readText(), opts.size || 2048);
        if (target === 'png') return write(png);
        if (target === 'jpg') return write(this.deps.nativeImage.createFromBuffer(png).toJPEG(opts.quality === 'small' ? 70 : 90));
        const tmp = uniquePath(os.tmpdir(), 'charles-svg-' + process.pid, 'png');
        try {
          fs.writeFileSync(tmp, png);
          await runFFmpeg(this.deps.ffmpeg(), ffmpegArgs(tmp, out, target, { ...opts, size: 0 }), { signal, spawnFn: this.deps.spawn });
          return out;
        } finally { fs.rmSync(tmp, { force: true }); }
      }
      const native = this.deps.nativeImage && ['png', 'jpg', 'jpeg', 'jfif'].includes(ext);
      const hasFF = !!this.deps.ffmpeg?.() && (this.encoders?.size || 0) > 0;
      if (native && (!hasFF || target === 'png' || target === 'jpg') && ['png', 'jpg'].includes(target)) {
        const img = this.fit(this.deps.nativeImage.createFromPath(f.path), opts.size);
        if (img.isEmpty()) throw Error('Görsel okunamadı.');
        return write(target === 'png' ? img.toPNG() : img.toJPEG(opts.quality === 'high' ? 95 : opts.quality === 'small' ? 70 : 88));
      }
    }
    if (f.kind === 'image' || f.kind === 'audio' || f.kind === 'video') {
      const ffmpeg = this.deps.ffmpeg?.();
      if (!ffmpeg) throw Error('FFmpeg bulunamadı. Charles kurulumundaki tools\\download klasörünü kontrol et.');
      try {
        await runFFmpeg(ffmpeg, ffmpegArgs(f.path, out, target, opts), { signal, onProgress: progress, spawnFn: this.deps.spawn });
      } catch (e) {
        fs.rmSync(out, { force: true });
        throw e;
      }
      return out;
    }
    // documents, data, subtitles
    const title = base;
    if (ext === 'pdf' && target === 'txt') return write(await this.deps.pdfText(f.path));
    // v0.8.11: PDF → Word (the text, paragraph by paragraph; the page layout is not kept)
    if (ext === 'pdf' && target === 'docx') return write(docxFromBlocks(pdfBlocks(await this.deps.pdfText(f.path))));
    if (ext === 'docx') {
      const blocks = docxToBlocks(fs.readFileSync(f.path));
      if (target === 'txt') return write(blocksToText(blocks));
      if (target === 'md') return write(blocksToMarkdown(blocks));
      if (target === 'html') return write(blocksToHTML(blocks, title));
      if (target === 'pdf') return write(this.pdf(blocks, title));
    }
    if (ext === 'md' || ext === 'markdown') {
      const md = readText();
      if (target === 'html') return write(markdownToHTML(md, title));
      if (target === 'pdf') return write(this.pdf(blocksFromMarkdown(md), title));
      if (target === 'docx') return write(docxFromBlocks(blocksFromMarkdown(md)));
      if (target === 'txt') return write(markdownToText(md));
    }
    if (ext === 'txt') {
      const text = readText();
      if (target === 'html') return write(textToHTML(text, title));
      if (target === 'pdf') return write(this.pdf(blocksFromText(text), title));
      if (target === 'docx') return write(docxFromBlocks(blocksFromText(text)));
      if (target === 'md') return write(text);
    }
    if (ext === 'html' || ext === 'htm') {
      const html = readText();
      if (target === 'txt') return write(htmlToText(html));
      if (target === 'md') return write(htmlToMarkdown(html));
      // scripts never run in the printing page
      if (target === 'pdf') return write(this.pdf(blocksFromMarkdown(htmlToMarkdown(html)), title));
    }
    if (f.kind === 'data') {
      const text = readText();
      let rows;
      if (ext === 'json') {
        let value;
        try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw Error('JSON okunamadı.'); }
        rows = objectsToTable(value);
      } else rows = parseDelimited(text, ext === 'tsv' ? '\t' : detectSeparator(text));
      if (target === 'json') return write(JSON.stringify(tableToObjects(rows), null, 2) + '\n');
      if (target === 'csv') return write('\uFEFF' + writeDelimited(rows, ','));
      if (target === 'tsv') return write(writeDelimited(rows, '\t'));
    }
    if (ext === 'srt' && target === 'vtt') return write(srtToVtt(readText()));
    if (ext === 'vtt' && target === 'srt') return write(vttToSrt(readText()));
    throw Error('Bu biçime dönüştürülemiyor.');
  }
}
function detectSeparator(text) {
  const line = text.split(/\r?\n/, 1)[0] || '';
  const count = (c) => line.split(c).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

module.exports = {
  Converter, KINDS, kindOf, targetsFor, commonTargets, uniquePath, ffmpegArgs, runFFmpeg, ffmpegEncoders,
  parseDelimited, writeDelimited, tableToObjects, objectsToTable, srtToVtt, vttToSrt, htmlToText, htmlToMarkdown,
  docxFromBlocks, docxToBlocks, blocksFromMarkdown, blocksFromText, pdfBlocks, pdfFromJpegs, jpegSize, icoFromPngs, zipFiles, unzipTo,
};
