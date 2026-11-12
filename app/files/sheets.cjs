'use strict';
// v0.9.26: tables for the converter without Office: CSV / TSV (separator, encoding, header row,
// value types), JSON with columns, XLSX and ODS read and written by Charles itself, HTML tables.
// What a sheet is reduced to: values only. Formulas (their last result is kept), formatting,
// merged cells, charts and pictures are not carried; a CSV or TSV holds one sheet.
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');

const MAX_CELLS = 5_000_000;
const MAX_UNZIPPED = 512 * 1024 * 1024;

// ── text and encodings ──────────────────────────────────────────────────────────────────────────
const ENCODINGS = ['auto', 'utf-8', 'utf-8-bom', 'utf-16le', 'windows-1254', 'windows-1252', 'iso-8859-9'];
/** Bytes → text. 'auto': a BOM, else UTF-8 when it is valid, else Turkish Windows (1254). */
function decodeText(bytes, encoding = 'auto') {
  const b = Buffer.from(bytes);
  if (encoding === 'auto') {
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString('utf8');
    if (b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le');
    if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.subarray(2)).swap16().toString('utf16le');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch {
      return new TextDecoder('windows-1254').decode(b);
    }
  }
  if (encoding === 'utf-8' || encoding === 'utf-8-bom') return b.toString('utf8').replace(/^﻿/, '');
  if (encoding === 'utf-16le') return b.toString('utf16le').replace(/^﻿/, '');
  return new TextDecoder(encoding).decode(b);
}
/** Text → bytes in the chosen encoding (a CSV opens in Excel with Turkish letters with UTF-8 + BOM). */
function encodeText(text, encoding = 'utf-8-bom') {
  if (encoding === 'utf-8') return Buffer.from(text, 'utf8');
  if (encoding === 'utf-16le') return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  if (['windows-1254', 'windows-1252', 'iso-8859-9'].includes(encoding)) return singleByte(text, encoding);
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
}
const singleTables = new Map();
function singleByte(text, encoding) {
  let table = singleTables.get(encoding);
  if (!table) {
    table = new Map();
    const dec = new TextDecoder(encoding);
    for (let i = 0; i < 256; i++) {
      const ch = dec.decode(Uint8Array.of(i));
      if (ch !== '�' && !table.has(ch)) table.set(ch, i);
    }
    singleTables.set(encoding, table);
  }
  const out = Buffer.alloc(text.length);
  let n = 0;
  for (const ch of text) out[n++] = table.has(ch) ? table.get(ch) : 0x3f; // "?" for what the code page lacks
  return out.subarray(0, n);
}

// ── delimited text ──────────────────────────────────────────────────────────────────────────────
const SEPARATORS = { auto: null, comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
function detectSeparator(text) {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 20);
  let best = ',', score = -1;
  for (const sep of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(sep).length - 1);
    const min = Math.min(...counts);
    const s = min > 0 ? min * 10 + counts.filter((c) => c === counts[0]).length : 0;
    if (s > score) (score = s), (best = sep);
  }
  return best;
}
function parseDelimited(text, sep) {
  const rows = [];
  let row = [], cell = '', quoted = false, cells = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
    if (++cells > MAX_CELLS * 20) throw Error('Dosya çok büyük.');
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row);
  return rows;
}
function writeDelimited(rows, sep) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /["\r\n]/.test(s) || s.includes(sep) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(q).join(sep)).join('\r\n') + '\r\n';
}
/** "1.234,56" / "1,234.56" / "42" / "%12" … → a number, or null when the text is not one. */
function numberOf(s) {
  const t = String(s).trim();
  if (!/^[-+]?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  if (/^0\d/.test(t.replace(/^[-+]/, ''))) return null; // 0532…: an id, a phone number
  let v = t;
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) v = t.replace(/\./g, '').replace(',', '.');
  else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) v = t.replace(/,/g, '');
  else if (/^[-+]?\d+,\d+$/.test(t)) v = t.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** A cell's value under the chosen typing: 'text' keeps everything text; 'auto' finds numbers, dates, true/false. */
function typed(s, types = 'auto') {
  if (types !== 'auto' || typeof s !== 'string') return s;
  const t = s.trim();
  if (t === '') return '';
  const n = numberOf(t);
  if (n !== null) return n;
  if (/^(true|false|doğru|yanlış)$/i.test(t)) return /^(true|doğru)$/i.test(t);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (m && +m[2] <= 12 && +m[1] <= 31) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return s;
}

/** CSV / TSV bytes → { rows } with the options of the converter. */
function readDelimited(bytes, { separator = 'auto', encoding = 'auto', types = 'auto', tsv = false } = {}) {
  const text = decodeText(bytes, encoding);
  const sep = tsv && separator === 'auto' ? '\t' : SEPARATORS[separator] || detectSeparator(text);
  const rows = parseDelimited(text, sep).map((r) => r.map((c) => typed(c, types)));
  return { rows, separator: sep };
}

// ── JSON with columns ───────────────────────────────────────────────────────────────────────────
function tableFromJson(value) {
  let v = value;
  if (v && !Array.isArray(v) && typeof v === 'object') {
    const arr = Object.values(v).find(Array.isArray);
    v = arr || [v];
  }
  if (!Array.isArray(v) || !v.length) throw Error('JSON’da sütunlu veri yok: bir nesne dizisi ya da satır dizisi olmalı.');
  if (v.every(Array.isArray)) return v.map((r) => r.map(cellOf));
  if (!v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) throw Error('JSON’da sütunlu veri yok: bir nesne dizisi ya da satır dizisi olmalı.');
  const keys = [];
  for (const o of v) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
  return [keys, ...v.map((o) => keys.map((k) => cellOf(o[k])))];
}
const cellOf = (x) => (x === null || x === undefined ? '' : typeof x === 'object' ? JSON.stringify(x) : x);
function jsonFromTable(rows, header = true) {
  if (!header) return rows.map((r) => r.map(plain));
  const [head = [], ...body] = rows;
  const keys = head.map((h, i) => String(h || 'Sütun ' + (i + 1)));
  // object keys must be unique and every value needs a key: anything else would drop data silently
  if (new Set(keys).size !== keys.length) throw Error('CSV başlıkları tekrarlanıyor. Her kolona farklı bir ad verin.');
  return body.map((r, index) => {
    if (r.filter((v, i) => i >= keys.length && v !== '' && v != null).length) throw Error(`Satır ${index + 2}: başlıklardan fazla kolon var; veri kaybını önlemek için dönüşüm durduruldu.`);
    return Object.fromEntries(keys.map((k, i) => [k, plain(r[i] ?? '')]));
  });
}
const plain = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

// ── XLSX ────────────────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const unesc = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function colIndex(name) {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const serial = (d) => (d.getTime() - EXCEL_EPOCH) / 86400000;
function safeSheetName(name, used) {
  let s = String(name || 'Sayfa').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sayfa';
  let n = 2;
  while (used.has(s.toLowerCase())) s = (String(name).slice(0, 27) + ' (' + n++ + ')').slice(0, 31);
  used.add(s.toLowerCase());
  return s;
}
/** sheets: [{ name, rows }] → XLSX bytes. header: the first row is bold. */
function writeXlsx(sheets, { header = true } = {}) {
  const used = new Set();
  const files = {};
  const names = sheets.map((s) => safeSheetName(s.name, used));
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '</Types>',
  );
  files['_rels/.rels'] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  files['xl/workbook.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  // 0 plain, 1 bold (header), 2 date
  files['xl/styles.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
  );
  sheets.forEach((s, i) => {
    const rows = s.rows.map((r, ri) => {
      const cells = r.map((v, ci) => {
        const ref = colName(ci) + (ri + 1);
        const bold = header && ri === 0 ? ' s="1"' : '';
        if (v === '' || v === null || v === undefined) return '';
        if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${bold}><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"${bold}><v>${v ? 1 : 0}</v></c>`;
        if (v instanceof Date && !Number.isNaN(v.getTime())) return `<c r="${ref}" s="2"><v>${serial(v)}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${bold}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      });
      return `<row r="${ri + 1}">${cells.join('')}</row>`;
    });
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`);
  });
  return Buffer.from(zipSync(files, { level: 6 }));
}

function unzipChecked(bytes) {
  let total = 0;
  return unzipSync(new Uint8Array(bytes), {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_UNZIPPED) throw Error('Dosya açıldığında çok büyük.');
      return true;
    },
  });
}
const attr = (tag, name) => {
  const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
  return m ? unesc(m[1]) : null;
};
/** XLSX bytes → [{ name, rows }] (values; a formula gives its last result). */
function readXlsx(bytes) {
  const z = unzipChecked(bytes);
  const text = (p) => (z[p] ? strFromU8(z[p]) : '');
  const shared = [];
  for (const si of text('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || [])
    shared.push(unesc((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  // which number formats are dates
  const styles = text('xl/styles.xml');
  const custom = new Map();
  for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(+m[1], unesc(m[2]));
  const xfs = ((/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles) || [])[1] || '').match(/<xf\b[^>]*>/g) || [];
  const dateStyle = xfs.map((xf) => {
    const id = +attr(xf, 'numFmtId') || 0;
    return (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom.has(id) && /[dmy]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')));
  });
  const rels = new Map();
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) rels.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  const out = [];
  let cells = 0;
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const target = rels.get(attr(m[0], 'r:id')) || '';
    const p = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const xml = text(p);
    const rows = [];
    for (const r of xml.match(/<row\b[\s\S]*?(?:<\/row>|\/>)/g) || []) {
      const ri = (+attr(r, 'r') || rows.length + 1) - 1;
      const row = [];
      for (const c of r.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        if (++cells > MAX_CELLS) throw Error('Tablo çok büyük.');
        const open = /<c\b[^>]*>/.exec(c)[0];
        const ref = attr(open, 'r') || '';
        const ci = ref ? colIndex(ref.replace(/\d+/g, '')) : row.length;
        const t = attr(open, 't');
        const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
        let value = '';
        if (t === 's') value = shared[+v] ?? '';
        else if (t === 'inlineStr') value = unesc((c.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join(''));
        else if (t === 'b') value = v === '1';
        else if (t === 'str' || t === 'e') value = unesc(v ?? '');
        else if (v !== undefined) {
          const n = Number(v);
          value = dateStyle[+attr(open, 's') || 0] && Number.isFinite(n) ? new Date(EXCEL_EPOCH + Math.round(n * 86400000)) : n;
        }
        row[ci] = value;
      }
      rows[ri] = Array.from(row, (x) => (x === undefined ? '' : x));
    }
    out.push({ name: unesc(attr(m[0], 'name') || 'Sayfa'), rows: Array.from(rows, (x) => x || []) });
  }
  if (!out.length) throw Error('Çalışma kitabında sayfa yok.');
  return out;
}

// ── ODS ─────────────────────────────────────────────────────────────────────────────────────────
function writeOds(sheets, { header = true } = {}) {
  const used = new Set();
  const tables = sheets
    .map((s) => {
      const name = safeSheetName(s.name, used);
      const rows = s.rows.map((r, ri) =>
        '<table:table-row>' +
        r
          .map((v) => {
            const st = header && ri === 0 ? ' table:style-name="ceHead"' : '';
            if (v === '' || v === null || v === undefined) return '<table:table-cell/>';
            if (typeof v === 'number' && Number.isFinite(v)) return `<table:table-cell office:value-type="float" office:value="${v}"${st}><text:p>${v}</text:p></table:table-cell>`;
            if (typeof v === 'boolean') return `<table:table-cell office:value-type="boolean" office:boolean-value="${v}"${st}><text:p>${v ? 'TRUE' : 'FALSE'}</text:p></table:table-cell>`;
            if (v instanceof Date && !Number.isNaN(v.getTime())) {
              const d = v.toISOString().slice(0, 10);
              return `<table:table-cell office:value-type="date" office:date-value="${d}"${st}><text:p>${d}</text:p></table:table-cell>`;
            }
            return `<table:table-cell office:value-type="string"${st}><text:p>${esc(v)}</text:p></table:table-cell>`;
          })
          .join('') +
        '</table:table-row>',
      );
      return `<table:table table:name="${esc(name)}">${rows.join('')}</table:table>`;
    })
    .join('');
  const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"';
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}><office:automatic-styles><style:style style:name="ceHead" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles><office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body></office:document-content>`;
  return odfPackage('application/vnd.oasis.opendocument.spreadsheet', content);
}
/** An ODF zip: "mimetype" first and stored, as the format requires. */
function odfPackage(mime, content, extra = {}) {
  const files = {
    mimetype: [strToU8(mime), { level: 0 }],
    'content.xml': strToU8(content),
    'META-INF/manifest.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>${Object.keys(extra)
        .map((p) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="text/xml"/>`)
        .join('')}</manifest:manifest>`,
    ),
  };
  for (const [p, v] of Object.entries(extra)) files[p] = strToU8(v);
  return Buffer.from(zipSync(files, { level: 6 }));
}
function readOds(bytes) {
  const z = unzipChecked(bytes);
  if (!z['content.xml']) throw Error('ODS dosyası okunamadı.');
  const xml = strFromU8(z['content.xml']);
  const out = [];
  let cells = 0;
  for (const t of xml.match(/<table:table\b[\s\S]*?<\/table:table>/g) || []) {
    const rows = [];
    for (const r of t.match(/<table:table-row\b[\s\S]*?(?:<\/table:table-row>|\/>)/g) || []) {
      const repeatRow = Math.min(+attr(r, 'table:number-rows-repeated') || 1, 1000);
      const row = [];
      for (const c of r.match(/<table:(?:covered-)?table-cell\b[^>]*?(?:\/>|>[\s\S]*?<\/table:(?:covered-)?table-cell>)/g) || []) {
        const open = /<table:(?:covered-)?table-cell\b[^>]*>/.exec(c)[0];
        const repeat = Math.min(+attr(open, 'table:number-columns-repeated') || 1, 1024);
        const type = attr(open, 'office:value-type');
        let v = '';
        if (type === 'float' || type === 'percentage' || type === 'currency') v = Number(attr(open, 'office:value'));
        else if (type === 'boolean') v = attr(open, 'office:boolean-value') === 'true';
        else if (type === 'date') v = new Date(attr(open, 'office:date-value'));
        else v = unesc((c.match(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g) || []).map((p) => p.replace(/<text:s[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')).join('\n'));
        for (let k = 0; k < repeat; k++) row.push(v);
        if ((cells += repeat) > MAX_CELLS) throw Error('Tablo çok büyük.');
      }
      while (row.length && row[row.length - 1] === '') row.pop();
      for (let k = 0; k < repeatRow; k++) rows.push(row);
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    out.push({ name: unesc(attr(/<table:table\b[^>]*>/.exec(t)[0], 'table:name') || 'Sayfa'), rows });
  }
  if (!out.length) throw Error('Çalışma kitabında sayfa yok.');
  return out;
}

// ── ranges, HTML ────────────────────────────────────────────────────────────────────────────────
/** "B2:D10" → the part of `rows` inside it; '' → everything. Throws for a wrong range. */
function sliceRange(rows, range) {
  const s = String(range || '').trim().toUpperCase();
  if (!s) return rows;
  const m = /^([A-Z]{1,3})(\d{1,7})(?::([A-Z]{1,3})(\d{1,7}))?$/.exec(s);
  if (!m) throw Error('Hücre aralığı okunamadı. Örnek: A1:D20');
  const c1 = colIndex(m[1]), r1 = +m[2] - 1, c2 = m[3] ? colIndex(m[3]) : c1, r2 = m[4] ? +m[4] - 1 : r1;
  if (c2 < c1 || r2 < r1) throw Error('Hücre aralığı ters yazılmış.');
  return rows.slice(r1, r2 + 1).map((r) => Array.from({ length: c2 - c1 + 1 }, (_, i) => r?.[c1 + i] ?? ''));
}
function htmlTable(rows, { header = true } = {}) {
  const cell = (v, tag) => `<${tag}${typeof v === 'number' ? ' class="n"' : ''}>${esc(v instanceof Date ? v.toISOString().slice(0, 10) : v ?? '').replace(/\n/g, '<br>')}</${tag}>`;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const full = (r) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  const [head, ...body] = rows;
  return (
    '<table>' +
    (header && head ? `<thead><tr>${full(head).map((v) => cell(v, 'th')).join('')}</tr></thead>` : '') +
    `<tbody>${(header ? body : rows).map((r) => `<tr>${full(r).map((v) => cell(v, 'td')).join('')}</tr>`).join('')}</tbody></table>`
  );
}
function htmlPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:13px/1.45 "Segoe UI",Arial,sans-serif;margin:16px;color:#111;background:#fff}h1{font-size:18px}table{border-collapse:collapse;margin:0 0 18px}th,td{border:1px solid #c8c8c8;padding:4px 8px;vertical-align:top;text-align:left}th{background:#f1f1f1}td.n{text-align:right;font-variant-numeric:tabular-nums}</style></head><body>${body}</body></html>`;
}
/** <table> elements of an HTML page → [{ name, rows }] (for an HTML file given as a table). */
function tablesFromHtml(html) {
  const out = [];
  for (const t of String(html).match(/<table\b[\s\S]*?<\/table>/gi) || []) {
    const rows = (t.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).map((r) => (r.match(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map((c) => unesc(c.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim())));
    out.push({ name: 'Tablo ' + (out.length + 1), rows });
  }
  return out;
}

module.exports = {
  ENCODINGS, SEPARATORS, decodeText, encodeText, detectSeparator, parseDelimited, writeDelimited, readDelimited, numberOf, typed,
  tableFromJson, jsonFromTable, writeXlsx, readXlsx, writeOds, readOds, odfPackage, sliceRange, htmlTable, htmlPage, tablesFromHtml,
  colName, colIndex, esc, unesc, unzipChecked,
};
