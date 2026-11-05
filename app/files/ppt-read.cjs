'use strict';
// v0.9.16: reads a PowerPoint 97-2003 .ppt (OLE compound file, [MS-PPT] records) into the same deck
// model as app/files/pptx-read.cjs. Nothing in the file runs; macros are never touched.
const zlib = require('node:zlib');

const END = 0xfffffffe, FREE = 0xffffffff;
const MASTER_UNIT = 72 / 576; // points per master unit

/** Streams of a compound file: { name: Buffer }. */
function readCompound(buf) {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xe011cfd0 || buf.readUInt32LE(4) !== 0xe11ab1a1) throw Error('not compound');
  const sectorSize = 1 << buf.readUInt16LE(30);
  const miniSize = 1 << buf.readUInt16LE(32);
  const miniCutoff = buf.readUInt32LE(56);
  const sector = (n) => buf.subarray((n + 1) * sectorSize, (n + 2) * sectorSize);
  // the sector allocation table
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const s = buf.readUInt32LE(76 + i * 4);
    if (s < END) difat.push(s);
  }
  let next = buf.readUInt32LE(68);
  for (let guard = 0; next < END && guard < 100000; guard++) {
    const page = sector(next);
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const s = page.readUInt32LE(i * 4);
      if (s < END) difat.push(s);
    }
    next = page.readUInt32LE(sectorSize - 4);
  }
  const fatParts = difat.map(sector);
  const fat = (n) => {
    const per = sectorSize / 4;
    const part = fatParts[Math.floor(n / per)];
    return part ? part.readUInt32LE((n % per) * 4) : END;
  };
  const chain = (first) => {
    const parts = [];
    for (let s = first, guard = 0; s < END && s !== FREE && guard < 4000000; s = fat(s), guard++) parts.push(sector(s));
    return Buffer.concat(parts);
  };
  const dir = chain(buf.readUInt32LE(48));
  const miniFatRaw = chain(buf.readUInt32LE(60));
  const entries = [];
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const nameLen = dir.readUInt16LE(at + 64);
    const type = dir[at + 66];
    if (!type || nameLen < 2) continue;
    entries.push({
      name: dir.toString('utf16le', at, at + nameLen - 2), type,
      start: dir.readUInt32LE(at + 116),
      size: sectorSize === 512 ? dir.readUInt32LE(at + 120) : Number(dir.readBigUInt64LE(at + 120)),
    });
  }
  const root = entries.find((e) => e.type === 5);
  const mini = root ? chain(root.start) : Buffer.alloc(0);
  const miniChain = (first, size) => {
    const out = Buffer.alloc(size);
    let written = 0;
    for (let s = first; s < END && s * 4 + 4 <= miniFatRaw.length && written < size; s = miniFatRaw.readUInt32LE(s * 4)) {
      written += mini.copy(out, written, s * miniSize, Math.min((s + 1) * miniSize, mini.length));
    }
    return out;
  };
  const streams = {};
  for (const e of entries) {
    if (e.type !== 2) continue;
    streams[e.name] = e.size < miniCutoff ? miniChain(e.start, e.size) : chain(e.start).subarray(0, e.size);
  }
  return streams;
}

// ── records ──
const RT = {
  Document: 0x03e8, DocumentAtom: 0x03e9, Slide: 0x03ee, SlideAtom: 0x03ef, Notes: 0x03f0, NotesAtom: 0x03f1, SlidePersistAtom: 0x03f3,
  MainMaster: 0x03f8, Drawing: 0x040c, DrawingGroup: 0x040b, SSSlideInfoAtom: 0x03f9, OEPlaceholderAtom: 0x0bc3, OutlineTextRefAtom: 0x0f9e, TextHeaderAtom: 0x0f9f,
  TextCharsAtom: 0x0fa0, StyleTextPropAtom: 0x0fa1, TextBytesAtom: 0x0fa8, SlideListWithText: 0x0ff0, UserEditAtom: 0x0ff5, PersistDirectoryAtom: 0x1772,
  DgContainer: 0xf002, SpgrContainer: 0xf003, SpContainer: 0xf004, BStoreContainer: 0xf001, DggContainer: 0xf000, FBSE: 0xf007, FSPGR: 0xf009, FSP: 0xf00a, FOPT: 0xf00b,
  ClientTextbox: 0xf00d, ChildAnchor: 0xf00f, ClientAnchor: 0xf010, ClientData: 0xf011,
};
function header(b, at) {
  const v = b.readUInt16LE(at);
  return { ver: v & 0xf, instance: v >> 4, type: b.readUInt16LE(at + 2), length: b.readUInt32LE(at + 4), at, body: at + 8 };
}
/** The records directly inside a byte range. */
function records(b, from, to) {
  const out = [];
  for (let at = from; at + 8 <= to; ) {
    const h = header(b, at);
    if (h.body + h.length > to) break;
    out.push(h);
    at = h.body + h.length;
  }
  return out;
}
const inside = (b, h) => records(b, h.body, h.body + h.length);
const child = (b, h, type) => inside(b, h).find((r) => r.type === type);

function persistMap(doc, firstEdit) {
  const map = new Map();
  let edit = firstEdit, documentRef = 0, lastSlide = 0, encrypted = false;
  const seen = new Set();
  while (edit > 0 && edit + 8 < doc.length && !seen.has(edit)) {
    seen.add(edit);
    const h = header(doc, edit);
    if (h.type !== RT.UserEditAtom) break;
    if (!documentRef) {
      documentRef = doc.readUInt32LE(h.body + 16);
      lastSlide = doc.readUInt32LE(h.body);
      if (h.length >= 32 && doc.readUInt32LE(h.body + 28)) encrypted = true;
    }
    const dir = header(doc, doc.readUInt32LE(h.body + 12));
    for (let at = dir.body; at + 4 <= dir.body + dir.length; ) {
      const v = doc.readUInt32LE(at);
      at += 4;
      const id = v & 0xfffff, count = v >>> 20;
      for (let i = 0; i < count && at + 4 <= dir.body + dir.length; i++, at += 4) if (!map.has(id + i)) map.set(id + i, doc.readUInt32LE(at));
    }
    edit = doc.readUInt32LE(h.body + 8);
  }
  return { map, documentRef, lastSlide, encrypted };
}

function readPictures(doc, docRec, stream) {
  const out = [];
  const group = child(doc, docRec, RT.DrawingGroup);
  const dgg = group && child(doc, group, RT.DggContainer);
  const store = dgg && child(doc, dgg, RT.BStoreContainer);
  if (!store || !stream) return out;
  for (const e of inside(doc, store)) {
    if (e.type !== RT.FBSE) {
      out.push(null);
      continue;
    }
    const offset = doc.readUInt32LE(e.body + 28);
    const size = doc.readUInt32LE(e.body + 20);
    try {
      out.push(size && offset !== 0xffffffff ? blip(stream, offset) : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}
function blip(s, at) {
  const h = header(s, at);
  const end = h.body + h.length;
  const uids = (one, two) => (h.instance === two ? 2 : 1);
  if (h.type === 0xf01e) return { mime: 'image/png', ext: 'png', data: s.subarray(h.body + 16 * uids(0x6e0, 0x6e1) + 1, end) };
  if (h.type === 0xf01d || h.type === 0xf02a) return { mime: 'image/jpeg', ext: 'jpg', data: s.subarray(h.body + 16 * ([0x46b, 0x6e3].includes(h.instance) ? 2 : 1) + 1, end) };
  if (h.type === 0xf01f) {
    const raw = s.subarray(h.body + 16 * uids(0x7a8, 0x7a9) + 1, end);
    const head = Buffer.alloc(14);
    head.write('BM', 0, 'latin1');
    head.writeUInt32LE(raw.length + 14, 2);
    const colors = raw.readUInt32LE(32), bits = raw.readUInt16LE(14);
    head.writeUInt32LE(14 + raw.readUInt32LE(0) + (colors || (bits <= 8 ? 1 << bits : 0)) * 4, 10);
    return { mime: 'image/bmp', ext: 'bmp', data: Buffer.concat([head, raw]) };
  }
  if (h.type === 0xf01a || h.type === 0xf01b) {
    const two = h.type === 0xf01a ? h.instance === 0x3d5 : h.instance === 0x217;
    const start = h.body + 16 * (two ? 2 : 1) + 34;
    const packed = s.subarray(start, end);
    const ext = h.type === 0xf01a ? 'emf' : 'wmf';
    return { mime: 'image/x-' + ext, ext, data: s[start - 2] === 0 ? zlib.inflateSync(packed) : packed };
  }
  return null;
}

/** Character and paragraph looks: [{ length, bold, italic, underline, size, color }]. */
function styleRuns(b, h, textLength) {
  const end = h.body + h.length;
  let at = h.body;
  const paragraphs = [];
  let left = textLength + 1;
  // paragraph runs come first; their size depends on which fields they carry
  while (left > 0 && at + 10 <= end) {
    const count = b.readUInt32LE(at);
    at += 4;
    const indent = b.readUInt16LE(at);
    at += 2;
    const mask = b.readUInt32LE(at);
    at += 4;
    const p = { length: count, indent };
    if (mask & 0xf) {
      p.bulletFlags = b.readUInt16LE(at);
      at += 2;
    }
    if (mask & 0x80) { p.bulletChar = b.readUInt16LE(at); at += 2; }
    if (mask & 0x10) at += 2;
    if (mask & 0x40) at += 2;
    if (mask & 0x20) at += 4;
    if (mask & 0x800) { p.align = b.readUInt16LE(at); at += 2; }
    for (const bit of [0x1000, 0x2000, 0x4000, 0x100, 0x400, 0x8000, 0x10000, 0x20000, 0x40000]) if (mask & bit) at += 2;
    if (mask & 0x80000) at += 2;
    if (mask & 0x100000) at += 2;
    paragraphs.push(p);
    left -= count;
  }
  const chars = [];
  left = textLength + 1;
  while (left > 0 && at + 8 <= end) {
    const count = b.readUInt32LE(at);
    at += 4;
    const mask = b.readUInt32LE(at);
    at += 4;
    const c = { length: count };
    if (mask & 0xffff) {
      const f = b.readUInt16LE(at);
      at += 2;
      if (mask & 1) c.bold = !!(f & 1);
      if (mask & 2) c.italic = !!(f & 2);
      if (mask & 4) c.underline = !!(f & 4);
    }
    if (mask & 0x10000) at += 2;
    if (mask & 0x200000) at += 2;
    if (mask & 0x400000) at += 2;
    if (mask & 0x800000) at += 2;
    if (mask & 0x20000) { c.size = b.readUInt16LE(at); at += 2; }
    if (mask & 0x40000) {
      const v = b.readUInt32LE(at);
      at += 4;
      // the top byte 0xFE marks an RGB colour, anything else a colour scheme index
      if (v >>> 24 === 0xfe) c.color = '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    if (mask & 0x80000) at += 2;
    chars.push(c);
    left -= count;
  }
  return { paragraphs, chars };
}

const TITLE_TEXT = new Set([0, 6]);
const DEFAULT_SIZE = (textType) => (TITLE_TEXT.has(textType) ? 40 : textType === 1 || textType === 5 ? 26 : 18);

function makeParagraphs(raw, textType, style) {
  const out = [];
  const text = raw.replace(/\u000b/g, '\n');
  const parts = text.split('\r');
  let offset = 0;
  const chars = style?.chars || [];
  const paras = style?.paragraphs || [];
  let para = 0, paraEnd = paras[0]?.length ?? Infinity;
  const look = (at) => {
    let n = 0;
    for (const c of chars) {
      n += c.length;
      if (at < n) return c;
    }
    return {};
  };
  for (const part of parts) {
    const runs = [];
    let i = 0;
    while (i < part.length) {
      const c = look(offset + i);
      let j = i + 1;
      while (j < part.length && look(offset + j) === c) j++;
      runs.push({
        text: part.slice(i, j), size: c.size || DEFAULT_SIZE(textType), color: c.color || (TITLE_TEXT.has(textType) ? '#222222' : '#333333'),
        font: 'Arial', bold: !!c.bold, italic: !!c.italic, underline: !!c.underline,
      });
      i = j;
    }
    while (offset >= paraEnd && para + 1 < paras.length) paraEnd += paras[++para].length;
    const p = paras[para] || {};
    const bullets = p.bulletFlags !== undefined ? !!(p.bulletFlags & 1) : textType === 1;
    out.push({
      level: p.indent || 0, runs, bullet: bullets && part.trim() ? '•' : '', align: ['l', 'ctr', 'r', 'just'][p.align] || (TITLE_TEXT.has(textType) ? 'ctr' : 'l'),
      marL: bullets ? 22 * ((p.indent || 0) + 1) : 18 * (p.indent || 0), indent: bullets ? -18 : 0, height: part ? 0 : DEFAULT_SIZE(textType),
    });
    offset += part.length + 1;
  }
  return out;
}

function textIn(doc, list) {
  let type = 4, chars = null, style = null;
  for (const r of list) {
    if (r.type === RT.TextHeaderAtom) type = doc.readUInt32LE(r.body);
    else if (r.type === RT.TextCharsAtom) chars = doc.toString('utf16le', r.body, r.body + r.length);
    else if (r.type === RT.TextBytesAtom) chars = doc.toString('latin1', r.body, r.body + r.length);
    else if (r.type === RT.StyleTextPropAtom) style = r;
  }
  return chars === null ? null : { type, chars, style };
}

function propsOf(doc, h) {
  const out = {};
  for (let i = 0, at = h.body; i < h.instance && at + 6 <= h.body + h.length; i++, at += 6) out[doc.readUInt16LE(at) & 0x3fff] = doc.readUInt32LE(at + 2);
  return out;
}
const colorRef = (v) => (v === undefined || v >>> 24 >= 0x08 ? null : '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join(''));

/** Shapes of a drawing. `outline`: the slide's texts from SlideListWithText. */
function drawingShapes(ctx, drawing, outline, slot) {
  const { doc } = ctx;
  const dg = drawing && child(doc, drawing, RT.DgContainer);
  const top = dg && child(doc, dg, RT.SpgrContainer);
  const out = [];
  if (!top) return out;
  const walk = (group, map, into) => {
    let current = map;
    for (const item of inside(doc, group)) {
      if (item.type === RT.SpgrContainer) {
        const first = inside(doc, item).find((r) => r.type === RT.SpContainer);
        const head = first && inside(doc, first);
        const anchorNode = head?.find((r) => r.type === RT.ClientAnchor || r.type === RT.ChildAnchor);
        const fsp = head?.find((r) => r.type === RT.FSPGR);
        const tertiary = head?.find((r) => r.type === 0xf122);
        // the table flag sits in the group's tertiary properties
        const isTable = !!tertiary && !!propsOf(doc, tertiary)[0x039f];
        let next = current;
        if (anchorNode && fsp) {
          const box = readAnchor(doc, anchorNode, current);
          const l = doc.readInt32LE(fsp.body), t = doc.readInt32LE(fsp.body + 4), r = doc.readInt32LE(fsp.body + 8), b = doc.readInt32LE(fsp.body + 12);
          const sx = box.w / ((r - l) * MASTER_UNIT || 1), sy = box.h / ((b - t) * MASTER_UNIT || 1);
          next = { x: box.x - l * MASTER_UNIT * sx, y: box.y - t * MASTER_UNIT * sy, sx: MASTER_UNIT * sx, sy: MASTER_UNIT * sy };
        }
        const cells = [];
        walk(item, next, cells);
        if (isTable && cells.some((c) => c.kind === 'text')) into.push(tableFrom(cells));
        else into.push(...cells);
        continue;
      }
      if (item.type !== RT.SpContainer) continue;
      const parts = inside(doc, item);
      const fsp = parts.find((r) => r.type === RT.FSP);
      if (!fsp) continue;
      const flags = doc.readUInt32LE(fsp.body + 4);
      if (flags & 0xd) continue; // the group's own record, the patriarch, a deleted shape
      const anchorNode = parts.find((r) => r.type === RT.ClientAnchor || r.type === RT.ChildAnchor);
      const opt = parts.find((r) => r.type === RT.FOPT);
      const props = opt ? propsOf(doc, opt) : {};
      const data = parts.find((r) => r.type === RT.ClientData);
      const ph = data && child(doc, data, RT.OEPlaceholderAtom);
      const placeholder = ph ? doc[ph.body + 4] : 0;
      const tb = parts.find((r) => r.type === RT.ClientTextbox);
      let text = null;
      if (tb) {
        const list = inside(doc, tb);
        text = textIn(doc, list);
        const ref = list.find((r) => r.type === RT.OutlineTextRefAtom);
        if (ref && outline) {
          const line = outline[doc.readUInt32LE(ref.body)];
          if (line) text = { ...line, style: line.style };
        }
      }
      let box = anchorNode ? readAnchor(doc, anchorNode, current) : null;
      if (!box && ctx.master && text) box = ctx.master[TITLE_TEXT.has(text.type) ? 'title' : 'body'];
      if (!box) continue;
      if (slot) {
        // the master's own placeholder boxes are where the slides' text goes
        if (placeholder) {
          if (text && TITLE_TEXT.has(text.type)) slot.title = box;
          else if (text) slot.body ||= box;
          continue;
        }
      }
      const pib = props[0x0104];
      if (pib && ctx.pictures[pib - 1] !== undefined) {
        into.push({ kind: 'image', ...box, rot: 0, image: ctx.pictures[pib - 1], crop: { l: 0, t: 0, r: 0, b: 0 }, name: '', alt: '' });
      }
      const fillOn = (props[0x01bf] ?? 0x10) & 0x10;
      const lineOn = (props[0x01ff] ?? 0) & 0x8;
      const fill = fillOn && props[0x0181] !== undefined ? colorRef(props[0x0181]) : null;
      const color = lineOn ? colorRef(props[0x01c0]) : null;
      const shapeType = (doc.readUInt16LE(fsp.at) >> 4) & 0xfff;
      if (shapeType === 20) {
        into.push({ kind: 'line', ...box, rot: 0, line: { color: color || '#000000', width: 0.75 } });
        continue;
      }
      if (text || fill || color) {
        const textType = text?.type ?? 4;
        const style = text?.style ? styleRuns(doc, text.style, text.chars.length) : null;
        into.push({
          kind: 'text', ...box, rot: 0, fill, line: color ? { color, width: 0.75 } : null, geom: shapeType === 3 ? 'ellipse' : shapeType === 2 ? 'roundRect' : 'rect',
          role: TITLE_TEXT.has(textType) ? 'title' : placeholder ? 'body' : 'other', placeholder: placeholder ? 'ph' + placeholder : '',
          paragraphs: text ? makeParagraphs(text.chars, textType, style).map((p) => (!placeholder && fill ? { ...p, align: 'ctr' } : p)) : [],
          body: { anchor: TITLE_TEXT.has(textType) || (!placeholder && fill) ? 'ctr' : 't', insets: [3.6, 7.2, 3.6, 7.2], vertical: 'horz', wrap: true }, name: '',
        });
      }
    }
  };
  walk(top, { x: 0, y: 0, sx: MASTER_UNIT, sy: MASTER_UNIT }, out);
  return out;
}
function readAnchor(doc, h, map) {
  let top, left, right, bottom;
  if (h.type === RT.ChildAnchor) {
    left = doc.readInt32LE(h.body);
    top = doc.readInt32LE(h.body + 4);
    right = doc.readInt32LE(h.body + 8);
    bottom = doc.readInt32LE(h.body + 12);
  } else if (h.length >= 16) {
    top = doc.readInt32LE(h.body);
    left = doc.readInt32LE(h.body + 4);
    right = doc.readInt32LE(h.body + 8);
    bottom = doc.readInt32LE(h.body + 12);
  } else {
    top = doc.readInt16LE(h.body);
    left = doc.readInt16LE(h.body + 2);
    right = doc.readInt16LE(h.body + 4);
    bottom = doc.readInt16LE(h.body + 6);
  }
  return { x: map.x + left * map.sx, y: map.y + top * map.sy, w: (right - left) * map.sx, h: (bottom - top) * map.sy };
}
function tableFrom(cells) {
  const texts = cells.filter((c) => c.kind === 'text').sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const c of texts) {
    const row = rows.find((r) => Math.abs(r.y - c.y) < 2);
    if (row) row.cells.push(c);
    else rows.push({ y: c.y, height: c.h, cells: [c] });
  }
  const x = Math.min(...texts.map((c) => c.x)), y = Math.min(...texts.map((c) => c.y));
  const right = Math.max(...texts.map((c) => c.x + c.w)), bottom = Math.max(...texts.map((c) => c.y + c.h));
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  const widest = rows.reduce((m, r) => (r.cells.length > m.cells.length ? r : m), rows[0]);
  return {
    kind: 'table', x, y, w: right - x, h: bottom - y, widths: widest.cells.map((c) => c.w), name: '',
    rows: rows.map((r) => ({ height: r.height, cells: r.cells.map((c) => ({ span: 1, rowSpan: 1, fill: c.fill, paragraphs: c.paragraphs })) })),
  };
}

function outlineTexts(doc, list) {
  // SlideListWithText: per SlidePersistAtom, the texts that follow it
  const out = new Map();
  let current = null;
  let pending = [];
  const flush = () => {
    if (pending.length && current) {
      const t = textIn(doc, pending);
      if (t) current.push(t);
    }
    pending = [];
  };
  for (const r of inside(doc, list)) {
    if (r.type === RT.SlidePersistAtom) {
      flush();
      current = [];
      out.set(doc.readUInt32LE(r.body), current);
    } else if (r.type === RT.TextHeaderAtom) {
      flush();
      pending = [r];
    } else if (r.type === RT.TextCharsAtom || r.type === RT.TextBytesAtom || r.type === RT.StyleTextPropAtom) pending.push(r);
  }
  flush();
  return out;
}

function readPpt(bytes) {
  let streams;
  try {
    streams = readCompound(bytes);
  } catch {
    throw Error('Sunum dosyası bozuk veya eksik.');
  }
  if (streams.EncryptedPackage || streams.EncryptionInfo) throw Object.assign(Error('Bu sunum parola korumalı. Önce parolasını kaldırıp yeniden dene.'), { encrypted: true });
  const doc = streams['PowerPoint Document'], cu = streams['Current User'];
  if (!doc || !cu) throw Error('Bu dosya geçerli bir PowerPoint sunumu değil.');
  if (cu.readUInt32LE(12) === 0xf3d1c4df) throw Object.assign(Error('Bu sunum parola korumalı. Önce parolasını kaldırıp yeniden dene.'), { encrypted: true });
  const { map, documentRef, encrypted } = persistMap(doc, cu.readUInt32LE(16));
  if (encrypted) throw Object.assign(Error('Bu sunum parola korumalı. Önce parolasını kaldırıp yeniden dene.'), { encrypted: true });
  const docRec = header(doc, map.get(documentRef));
  if (docRec.type !== RT.Document) throw Error('Sunum dosyası bozuk veya eksik.');
  const atom = child(doc, docRec, RT.DocumentAtom);
  const deck = { format: 'ppt', width: doc.readInt32LE(atom.body) * MASTER_UNIT, height: doc.readInt32LE(atom.body + 4) * MASTER_UNIT, slides: [] };
  const lists = inside(doc, docRec).filter((r) => r.type === RT.SlideListWithText);
  const slideList = lists.find((l) => l.instance === 0);
  const masterList = lists.find((l) => l.instance === 1);
  const pictures = readPictures(doc, docRec, streams.Pictures);
  const ctx = { doc, pictures, master: null };
  const masters = new Map();
  const masterOf = (ref) => {
    if (masters.has(ref)) return masters.get(ref);
    let found = null;
    for (const r of masterList ? inside(doc, masterList) : []) {
      if (r.type !== RT.SlidePersistAtom || doc.readUInt32LE(r.body + 12) !== ref) continue;
      const rec = header(doc, map.get(doc.readUInt32LE(r.body)));
      const slot = { title: { x: 36, y: 20, w: deck.width - 72, h: 90 }, body: { x: 36, y: 120, w: deck.width - 72, h: deck.height - 160 } };
      const shapes = drawingShapes({ ...ctx, master: null }, child(doc, rec, RT.Drawing), null, slot);
      found = { slot, shapes };
    }
    masters.set(ref, found);
    return found;
  };
  const notesById = new Map();
  for (const [offsetId, offset] of map) {
    if (offset + 8 > doc.length) continue;
    const h = header(doc, offset);
    if (h.type !== RT.Notes) continue;
    const atomN = child(doc, h, RT.NotesAtom);
    const shapes = drawingShapes({ ...ctx, master: { title: { x: 0, y: 0, w: 1, h: 1 }, body: { x: 0, y: 0, w: 1, h: 1 } } }, child(doc, h, RT.Drawing), null);
    const text = shapes.filter((s) => s.kind === 'text' && s.placeholder === 'ph12').flatMap((s) => s.paragraphs).map((p) => p.runs.map((r) => r.text).join('')).join('\n').trim();
    if (atomN) notesById.set(doc.readInt32LE(atomN.body), text);
    void offsetId;
  }
  const outlines = slideList ? outlineTexts(doc, slideList) : new Map();
  let number = 0;
  for (const r of slideList ? inside(doc, slideList) : []) {
    if (r.type !== RT.SlidePersistAtom) continue;
    number++;
    const persist = doc.readUInt32LE(r.body);
    const slideId = doc.readInt32LE(r.body + 12);
    const rec = header(doc, map.get(persist));
    if (rec.type !== RT.Slide) continue;
    const sa = child(doc, rec, RT.SlideAtom);
    const master = sa ? masterOf(doc.readInt32LE(sa.body + 12)) : null;
    const info = child(doc, rec, RT.SSSlideInfoAtom);
    const shapes = drawingShapes({ ...ctx, master: master?.slot || null }, child(doc, rec, RT.Drawing), outlines.get(persist) || null);
    deck.slides.push({
      number, hidden: !!info && !!(doc.readUInt16LE(info.body + 16) & 0x4), background: { fill: '#ffffff' },
      shapes: [...(master?.shapes || []).map((s) => ({ ...s, layer: 'master' })), ...shapes.map((s) => ({ ...s, layer: 'slide' }))],
      notes: notesById.get(slideId) || '',
    });
  }
  return deck;
}

module.exports = { readPpt, readCompound };
