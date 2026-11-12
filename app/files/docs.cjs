'use strict';
// v0.9.26: documents without Office, on the converter's simple model of a document (blocks:
// { text, heading?: 1–3, bullet?: true }): OpenDocument Text (.odt) and RTF read and written, EPUB
// read and written (chapters follow the headings, their order is kept). Layout, pictures, tables
// and fonts are not carried by this model; with Word installed the converter uses Word instead
// (app/files/office-com.cjs) for Word's own formats.
const path = require('node:path');
const { zipSync, strToU8, strFromU8 } = require('fflate');
const { esc, unesc, odfPackage, unzipChecked } = require('./sheets.cjs');

// ── ODT ─────────────────────────────────────────────────────────────────────────────────────────
function writeOdt(blocks, title = '') {
  const body = blocks
    .map((b) => {
      const lines = String(b.text || '').split('\n').map(esc).join('<text:line-break/>');
      if (b.heading) return `<text:h text:style-name="H${b.heading}" text:outline-level="${b.heading}">${lines}</text:h>`;
      if (b.bullet) return `<text:list><text:list-item><text:p>${lines}</text:p></text:list-item></text:list>`;
      return `<text:p text:style-name="Body">${lines}</text:p>`;
    })
    .join('')
    .replace(/<\/text:list><text:list>/g, '');
  const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"';
  const styles = [1, 2, 3].map((n) => `<style:style style:name="H${n}" style:family="paragraph" style:default-outline-level="${n}"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.15cm"/><style:text-properties fo:font-size="${[0, 18, 15, 13][n]}pt" fo:font-weight="bold"/></style:style>`).join('');
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}><office:automatic-styles>${styles}<style:style style:name="Body" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm"/><style:text-properties fo:font-size="11pt"/></style:style></office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2"><office:meta><dc:title>${esc(title)}</dc:title></office:meta></office:document-meta>`;
  return odfPackage('application/vnd.oasis.opendocument.text', content, { 'meta.xml': meta });
}
function readOdt(bytes) {
  const z = unzipChecked(bytes);
  if (!z['content.xml']) throw Error('ODT dosyası okunamadı.');
  const xml = strFromU8(z['content.xml']).replace(/<office:annotation[\s\S]*?<\/office:annotation>/g, '');
  const inner = (s) =>
    unesc(
      s
        .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => ' '.repeat(Math.min(+n || 1, 50)))
        .replace(/<text:(line-break|tab)\s*\/>/g, (_, k) => (k === 'tab' ? '\t' : '\n'))
        .replace(/<[^>]+>/g, ''),
    );
  const blocks = [];
  // a list item's paragraphs become one bullet (an inner list joins its text)
  const flat = xml.replace(/<text:list-item\b[^>]*>([\s\S]*?)<\/text:list-item>/g, (_, body) => `<text:p charles-bullet="1">${body.replace(/<\/text:p>\s*<text:p\b[^>]*>/g, '<text:line-break/>').replace(/<\/?text:(p|list|list-item)\b[^>]*>/g, '')}</text:p>`);
  for (const m of flat.matchAll(/<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/g)) {
    const t = inner(m[3]).trim();
    if (!t) continue;
    if (/charles-bullet/.test(m[2])) blocks.push({ text: t, bullet: true });
    else if (m[1] === 'h') blocks.push({ text: t, heading: Math.min(3, +(/text:outline-level="(\d)"/.exec(m[2])?.[1] || 1)) });
    else blocks.push({ text: t });
  }
  if (!blocks.length) throw Error('Belgede metin yok.');
  return blocks;
}

// ── RTF ─────────────────────────────────────────────────────────────────────────────────────────
function rtfText(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (ch === '\n') out += '\\line ';
    else if (ch === '\t') out += '\\tab ';
    else if (c < 128) out += ch;
    else if (c < 0x10000) out += `\\u${c > 32767 ? c - 65536 : c}?`;
    else {
      const pair = String.fromCodePoint(c);
      for (let i = 0; i < 2; i++) {
        const u = pair.charCodeAt(i);
        out += `\\u${u > 32767 ? u - 65536 : u}?`;
      }
    }
  }
  return out;
}
function writeRtf(blocks) {
  const sizes = { 1: 36, 2: 30, 3: 26 };
  const paras = blocks.map((b) => {
    if (b.heading) return `{\\pard\\sb240\\sa120\\keepn\\b\\fs${sizes[b.heading]} ${rtfText(b.text)}\\par}`;
    if (b.bullet) return `{\\pard\\fi-240\\li480\\sa80\\fs22 \\u8226?\\tab ${rtfText(b.text)}\\par}`;
    return `{\\pard\\sa160\\fs22 ${rtfText(b.text)}\\par}`;
  });
  return Buffer.from(`{\\rtf1\\ansi\\ansicpg1254\\deff0\\uc1{\\fonttbl{\\f0\\fswiss\\fcharset162 Calibri;}}\\viewkind4\\f0\\fs22\n${paras.join('\n')}\n}`, 'latin1');
}
const SKIP_DEST = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'footnote', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'fldinst', 'shppict', 'nonshppict', 'bkmkstart', 'bkmkend', 'field']);
/** RTF bytes → blocks: the text, its paragraphs, and headings guessed from bold and large type. */
function readRtf(bytes) {
  const src = Buffer.from(bytes).toString('latin1');
  if (!src.startsWith('{\\rtf')) throw Error('RTF dosyası okunamadı.');
  const cp = +(/\\ansicpg(\d+)/.exec(src)?.[1] || 1252);
  let dec;
  try {
    dec = new TextDecoder('windows-' + cp);
  } catch {
    dec = new TextDecoder('windows-1252');
  }
  const stack = [];
  let state = { skip: false, uc: 1, bold: false, size: 24 };
  let pending = []; // bytes of \'hh in a row
  let skipChars = 0;
  const paras = [];
  let cur = { text: '', bold: true, size: 0 };
  const flush = () => {
    if (pending.length) {
      cur.text += dec.decode(Uint8Array.from(pending));
      pending = [];
    }
  };
  const emit = (s) => {
    if (state.skip) return;
    flush();
    if (s.trim()) {
      cur.bold = cur.bold && state.bold;
      cur.size = Math.max(cur.size, state.size);
    }
    cur.text += s;
  };
  const endPara = () => {
    flush();
    paras.push(cur);
    cur = { text: '', bold: true, size: 0 };
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      flush();
      stack.push({ ...state });
      if (src.startsWith('{\\*', i)) state = { ...state, skip: true };
      continue;
    }
    if (c === '}') {
      flush();
      state = stack.pop() || state;
      continue;
    }
    if (c === '\\') {
      const n = src[i + 1];
      if (n === '\\' || n === '{' || n === '}') {
        if (skipChars > 0) skipChars--;
        else emit(n);
        i++;
        continue;
      }
      if (n === "'") {
        const b = parseInt(src.substr(i + 2, 2), 16);
        i += 3;
        if (skipChars > 0) {
          skipChars--;
          continue;
        }
        if (!state.skip && !Number.isNaN(b)) pending.push(b);
        continue;
      }
      const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(src.slice(i, i + 40));
      if (!m) {
        i++;
        continue;
      }
      i += m[0].length - 1;
      const word = m[1], arg = m[2] !== undefined ? +m[2] : null;
      if (SKIP_DEST.has(word)) state.skip = true;
      else if (word === 'par' || word === 'sect' || word === 'page') endPara();
      else if (word === 'line') emit('\n');
      else if (word === 'tab') emit('\t');
      else if (word === 'cell') emit('\t');
      else if (word === 'row') endPara();
      else if (word === 'b') state.bold = arg !== 0;
      else if (word === 'plain') (state.bold = false), (state.size = 24);
      else if (word === 'fs' && arg) state.size = arg;
      else if (word === 'uc') state.uc = arg ?? 1;
      else if (word === 'u' && arg !== null) {
        emit(String.fromCharCode(arg < 0 ? arg + 65536 : arg));
        skipChars = state.uc;
      } else if (word === 'bullet') emit('•');
      else if (word === 'emdash') emit('—');
      else if (word === 'endash') emit('–');
      else if (word === 'lquote') emit('‘');
      else if (word === 'rquote') emit('’');
      else if (word === 'ldblquote') emit('“');
      else if (word === 'rdblquote') emit('”');
      continue;
    }
    if (c === '\r' || c === '\n') continue;
    if (skipChars > 0) {
      skipChars--;
      continue;
    }
    emit(c);
  }
  endPara();
  const blocks = [];
  for (const p of paras) {
    const t = p.text.replace(/\u0000/g, '').trim();
    if (!t) continue;
    if (/^[•·\-–]\s*\t?/.test(t)) blocks.push({ text: t.replace(/^[•·\-–]\s*\t?/, ''), bullet: true });
    else if (p.bold && p.size >= 30 && t.length < 160) blocks.push({ text: t, heading: p.size >= 36 ? 1 : 2 });
    else if (p.bold && p.size >= 26 && t.length < 160) blocks.push({ text: t, heading: 3 });
    else blocks.push({ text: t });
  }
  if (!blocks.length) throw Error('Belgede metin yok.');
  return blocks;
}

// ── EPUB ────────────────────────────────────────────────────────────────────────────────────────
/** EPUB bytes → { title, chapters: [{ title, html }] } in reading order (the spine). */
function readEpub(bytes) {
  const z = unzipChecked(bytes);
  const get = (p) => (z[p] ? strFromU8(z[p]) : null);
  const container = get('META-INF/container.xml');
  const opfPath = container && /full-path="([^"]+)"/.exec(container)?.[1];
  const opf = opfPath && get(opfPath);
  if (!opf) throw Error('EPUB okunamadı: içindekiler dosyası yok.');
  if (z['META-INF/encryption.xml'] && /EncryptedData/.test(get('META-INF/encryption.xml'))) throw Error('Bu EPUB korumalı (DRM); dönüştürülemiyor.');
  const base = path.posix.dirname(opfPath);
  const title = unesc((/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf) || [])[1] || '').trim();
  const items = new Map();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = /\sid="([^"]+)"/.exec(m[0])?.[1];
    const href = /\shref="([^"]+)"/.exec(m[0])?.[1];
    if (id && href) items.set(id, decodeURIComponent(href));
  }
  const chapters = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"[^>]*>/g)) {
    const href = items.get(m[1]);
    if (!href) continue;
    const p = path.posix.normalize(base === '.' ? href : base + '/' + href);
    const html = get(p);
    if (!html) continue;
    const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html) || [])[1] || html;
    const t = unesc(((/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(body) || /<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '').replace(/<[^>]+>/g, '').trim());
    chapters.push({ title: t, html: body });
  }
  if (!chapters.length) throw Error('EPUB’de okunacak bölüm yok.');
  return { title, chapters };
}
/** blocks → EPUB 3 (with an EPUB 2 table of contents for older readers). Chapters start at each top heading. */
function writeEpub(blocks, { title = 'Belge', lang = 'tr' } = {}) {
  const top = blocks.some((b) => b.heading === 1) ? 1 : blocks.some((b) => b.heading === 2) ? 2 : 0;
  const chapters = [];
  for (const b of blocks) {
    if ((top && b.heading === top) || !chapters.length) chapters.push({ title: b.heading === top && top ? b.text : title, blocks: [] });
    chapters[chapters.length - 1].blocks.push(b);
  }
  const xhtml = (ch) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>${esc(ch.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><section epub:type="chapter">` +
    ch.blocks
      .map((b) => (b.heading ? `<h${b.heading}>${esc(b.text)}</h${b.heading}>` : b.bullet ? `<ul><li>${esc(b.text)}</li></ul>` : `<p>${esc(b.text).replace(/\n/g, '<br/>')}</p>`))
      .join('\n')
      .replace(/<\/ul>\n<ul>/g, '\n') +
    '</section></body></html>';
  const id = 'urn:uuid:' + require('node:crypto').randomUUID();
  const files = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/style.css': strToU8('body{font-family:serif;line-height:1.5;margin:0 5%}h1,h2,h3{font-family:sans-serif;line-height:1.25}'),
  };
  chapters.forEach((ch, i) => (files[`OEBPS/ch${String(i + 1).padStart(3, '0')}.xhtml`] = strToU8(xhtml(ch))));
  const names = chapters.map((_, i) => `ch${String(i + 1).padStart(3, '0')}.xhtml`);
  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>${esc(title)}</title></head><body><nav epub:type="toc" id="toc"><h1>${esc(title)}</h1><ol>${chapters.map((ch, i) => `<li><a href="${names[i]}">${esc(ch.title)}</a></li>`).join('')}</ol></nav></body></html>`);
  files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${esc(title)}</text></docTitle><navMap>${chapters.map((ch, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(ch.title)}</text></navLabel><content src="${names[i]}"/></navPoint>`).join('')}</navMap></ncx>`);
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files['OEBPS/content.opf'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>${names.map((n, i) => `<item id="c${i + 1}" href="${n}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine toc="ncx">${names.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`,
  );
  return Buffer.from(zipSync(files, { level: 6 }));
}

module.exports = { writeOdt, readOdt, writeRtf, readRtf, readEpub, writeEpub };
