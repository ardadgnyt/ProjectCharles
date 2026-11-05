'use strict';
// v0.9.16: reads a PowerPoint .pptx into the deck model of app/files/slides.cjs.
//
//   deck  = { format, width, height (points), slides: [slide] }
//   slide = { number, hidden, background, shapes, notes }
//   shape = { kind: 'text' | 'image' | 'table' | 'chart' | 'line', x, y, w, h (points), ... }
//
// Only what the package itself holds is read: pictures linked from the web are not fetched, and
// nothing in the file runs.
const path = require('node:path');
const { unzipSync, strFromU8 } = require('fflate');

const MAX_UNPACKED = 700 * 1024 * 1024;
const MAX_ENTRIES = 30000;
const PT = 12700; // EMU per point

// ── a small XML reader (names without their prefix; attributes as written) ──
function decode(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|amp|quot|apos));/gi, (m, d, x, n) => {
    if (n) return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[n.toLowerCase()];
    const code = d ? +d : parseInt(x, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}
function parseXml(text) {
  const root = { n: '#root', a: {}, c: [] };
  const stack = [root];
  const tag = /<(\/?)([^\s/>!?]+)((?:\s+[^\s=>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>/g;
  let at = 0;
  for (let m; (m = tag.exec(text)); ) {
    if (m.index > at) {
      const value = decode(text.slice(at, m.index));
      if (value) stack.at(-1).c.push(value);
    }
    at = tag.lastIndex;
    if (m[5] !== undefined) stack.at(-1).c.push(m[5]);
    if (!m[2]) continue;
    const name = m[2].slice(m[2].indexOf(':') + 1);
    if (m[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = { n: name, a: {}, c: [] };
    for (const a of m[3].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) node.a[a[1]] = decode(a[2] ?? a[3] ?? '');
    stack.at(-1).c.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}
const kids = (n, name) => (n ? n.c.filter((c) => typeof c === 'object' && (!name || c.n === name)) : []);
const kid = (n, ...names) => {
  let cur = n;
  for (const name of names) cur = cur && cur.c.find((c) => typeof c === 'object' && c.n === name);
  return cur || null;
};
function deep(n, name, out = []) {
  if (!n) return out;
  for (const c of n.c) if (typeof c === 'object') {
    if (c.n === name) out.push(c);
    deep(c, name, out);
  }
  return out;
}
const textOf = (n) => (n ? n.c.map((c) => (typeof c === 'string' ? c : textOf(c))).join('') : '');
const num = (v, d = 0) => (v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);

// ── colours ──
function hexToHsl(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = d / (l > 0.5 ? 2 - max - min : max + min);
  const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const f = (p, q, t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const v = s ? [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)] : [l, l, l];
  return v.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
}
function colorOf(node, ctx) {
  if (!node) return null;
  let hex = null;
  if (node.n === 'srgbClr') hex = node.a.val;
  else if (node.n === 'sysClr') hex = node.a.lastClr || '000000';
  else if (node.n === 'prstClr') hex = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080' }[node.a.val] || '000000';
  else if (node.n === 'schemeClr') {
    const key = node.a.val === 'phClr' ? ctx.phClr : ctx.clrMap[node.a.val] || node.a.val;
    hex = ctx.theme[key];
  }
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  let [h, s, l] = hexToHsl(hex);
  let alpha = 1;
  for (const m of kids(node)) {
    const v = num(m.a.val) / 100000;
    if (m.n === 'lumMod') l *= v;
    else if (m.n === 'lumOff') l += v;
    else if (m.n === 'shade') l *= v;
    else if (m.n === 'tint') l += (1 - l) * (1 - v);
    else if (m.n === 'alpha') alpha = v;
  }
  const out = hslToHex(h, s, Math.min(1, Math.max(0, l)));
  return alpha < 1 ? `rgba(${parseInt(out.slice(0, 2), 16)},${parseInt(out.slice(2, 4), 16)},${parseInt(out.slice(4, 6), 16)},${+alpha.toFixed(3)})` : '#' + out;
}
const COLOR_NODES = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'];
const colorIn = (n, ctx) => colorOf(n && n.c.find((c) => typeof c === 'object' && COLOR_NODES.includes(c.n)), ctx);
function fillOf(pr, ctx) {
  if (!pr) return undefined;
  if (kid(pr, 'noFill')) return null;
  const solid = kid(pr, 'solidFill');
  if (solid) return colorIn(solid, ctx);
  const grad = kid(pr, 'gradFill');
  if (grad) {
    const stops = deep(grad, 'gs').sort((a, b) => num(a.a.pos) - num(b.a.pos)).map((g) => `${colorIn(g, ctx)} ${num(g.a.pos) / 1000}%`);
    const angle = num(kid(grad, 'lin')?.a.ang) / 60000;
    if (stops.length > 1) return `linear-gradient(${angle + 90}deg,${stops.join(',')})`;
  }
  return undefined;
}

// ── the package ──
function joinPart(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  return path.posix.normalize(path.posix.join(path.posix.dirname(base), target));
}
class Package {
  constructor(bytes) {
    let total = 0, count = 0;
    try {
      this.files = unzipSync(bytes, {
        filter: (f) => {
          total += f.originalSize;
          if (++count > MAX_ENTRIES || total > MAX_UNPACKED) throw Object.assign(Error('too big'), { tooBig: true });
          return true;
        },
      });
    } catch (e) {
      throw Error(e.tooBig ? 'Sunumun açılmış hali çok büyük.' : 'Sunum dosyası bozuk veya eksik.');
    }
    this.xmlCache = new Map();
  }
  xml(name) {
    if (!this.files[name]) return null;
    if (!this.xmlCache.has(name)) this.xmlCache.set(name, parseXml(strFromU8(this.files[name])));
    return this.xmlCache.get(name);
  }
  rels(part) {
    const file = path.posix.join(path.posix.dirname(part), '_rels', path.posix.basename(part) + '.rels');
    const out = new Map();
    for (const r of kids(kid(this.xml(file), 'Relationships'), 'Relationship'))
      out.set(r.a.Id, { type: String(r.a.Type).split('/').pop(), external: r.a.TargetMode === 'External', part: r.a.TargetMode === 'External' ? null : joinPart(part, String(r.a.Target)) });
    return out;
  }
  relOfType(part, type) {
    for (const r of this.rels(part).values()) if (r.type === type) return r.part;
    return null;
  }
}

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', emf: 'image/x-emf', wmf: 'image/x-wmf', tif: 'image/tiff', tiff: 'image/tiff' };

function readStyleLevels(list) {
  const out = {};
  for (const l of kids(list)) {
    const m = /^lvl(\d)pPr$/.exec(l.n);
    if (m) out[+m[1] - 1] = l;
    else if (l.n === 'defPPr') out.def = l;
  }
  return out;
}

class Reader {
  constructor(pkg) {
    this.pkg = pkg;
    this.images = new Map();
  }
  image(part) {
    if (!part || !this.pkg.files[part]) return null;
    if (!this.images.has(part)) {
      const ext = path.posix.extname(part).slice(1).toLowerCase();
      this.images.set(part, { mime: IMAGE_TYPES[ext] || 'application/octet-stream', ext, data: Buffer.from(this.pkg.files[part]) });
    }
    return this.images.get(part);
  }
  masterOf(layoutPart) {
    const part = this.pkg.relOfType(layoutPart, 'slideMaster');
    const xml = kid(this.pkg.xml(part), 'sldMaster');
    const themePart = this.pkg.relOfType(part, 'theme');
    const theme = {};
    const scheme = deep(this.pkg.xml(themePart), 'clrScheme')[0];
    for (const c of kids(scheme)) {
      const v = kids(c)[0];
      if (v) theme[c.n] = v.a.lastClr || v.a.val;
    }
    const map = kid(xml, 'clrMap')?.a || {};
    const clrMap = { bg1: map.bg1 || 'lt1', tx1: map.tx1 || 'dk1', bg2: map.bg2 || 'lt2', tx2: map.tx2 || 'dk2' };
    for (const k of ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) clrMap[k] = map[k] || k;
    const fonts = deep(this.pkg.xml(themePart), 'fontScheme')[0];
    const font = (k) => kid(fonts, k, 'latin')?.a.typeface;
    const styles = kid(xml, 'txStyles');
    return {
      part, xml, theme, clrMap,
      major: font('majorFont'), minor: font('minorFont'),
      title: readStyleLevels(kid(styles, 'titleStyle')),
      body: readStyleLevels(kid(styles, 'bodyStyle')),
      other: readStyleLevels(kid(styles, 'otherStyle')),
      theming: this.pkg.xml(themePart),
    };
  }
  background(xml, part, ctx) {
    const bg = kid(xml, 'cSld', 'bg');
    if (!bg) return null;
    const pr = kid(bg, 'bgPr');
    if (pr) {
      const blip = deep(pr, 'blip')[0];
      if (blip) {
        const rel = this.pkg.rels(part).get(blip.a['r:embed']);
        const image = rel && this.image(rel.part);
        if (image) return { image };
      }
      const fill = fillOf(pr, ctx);
      return fill ? { fill } : null;
    }
    const ref = kid(bg, 'bgRef');
    return ref ? { fill: colorIn(ref, ctx) } : null;
  }
  placeholders(xml) {
    const out = [];
    const walk = (tree) => {
      for (const n of kids(tree)) {
        if (n.n === 'grpSp') walk(n);
        const ph = n.n === 'sp' ? kid(n, 'nvSpPr', 'nvPr', 'ph') : null;
        if (ph) out.push({ type: ph.a.type || 'body', idx: ph.a.idx, node: n });
      }
    };
    walk(kid(xml, 'cSld', 'spTree'));
    return out;
  }
}

/** Everything a shape can inherit: the slide layout's and the master's matching placeholder. */
function inherited(ph, scope) {
  const out = [];
  if (!ph) return out;
  const type = ph.a.type || 'body';
  const isTitle = (t) => t === 'title' || t === 'ctrTitle';
  const sameKind = (t) => t === type || (isTitle(t) && isTitle(type)) || (t === 'body' && ['subTitle', 'obj', 'body'].includes(type));
  const lay = scope.layoutPh.find((p) => ph.a.idx !== undefined && p.idx === ph.a.idx) || scope.layoutPh.find((p) => sameKind(p.type));
  if (lay) out.push(lay.node);
  const mas = scope.masterPh.find((p) => sameKind(p.type));
  if (mas) out.push(mas.node);
  return out;
}

function transform(x, y, w, h, t) {
  return { x: t.x + x * t.sx, y: t.y + y * t.sy, w: w * t.sx, h: h * t.sy };
}
const xfrmOf = (node) => {
  const pr = kid(node, 'spPr') || kid(node, 'xfrm') ? kid(node, 'spPr') : null;
  const x = kid(pr, 'xfrm') || kid(node, 'xfrm');
  if (!x || !kid(x, 'off') || !kid(x, 'ext')) return null;
  return {
    x: num(kid(x, 'off').a.x) / PT, y: num(kid(x, 'off').a.y) / PT, w: num(kid(x, 'ext').a.cx) / PT, h: num(kid(x, 'ext').a.cy) / PT,
    rot: num(x.a.rot) / 60000, flipH: x.a.flipH === '1', flipV: x.a.flipV === '1',
  };
};

function paragraphs(tx, chain, scope, role, ctx, major) {
  const scale = num(deep(kid(tx, 'bodyPr'), 'normAutofit')[0]?.a.fontScale, 100000) / 100000;
  const base = role === 'title' ? scope.master.title : role === 'body' ? scope.master.body : scope.master.other;
  const lists = [kid(tx, 'lstStyle'), ...chain.map((n) => kid(n, 'txBody', 'lstStyle'))].filter(Boolean).map(readStyleLevels);
  lists.push(base);
  const out = [];
  let autonum = 0, lastLevel = -1;
  for (const p of kids(tx, 'p')) {
    const pPr = kid(p, 'pPr');
    const level = num(pPr?.a.lvl);
    const look = [pPr, ...lists.flatMap((l) => [l[level], l.def])].filter(Boolean);
    const first = (fn) => {
      for (const l of look) {
        const v = fn(l);
        if (v !== undefined && v !== null) return v;
      }
      return undefined;
    };
    const defaults = look.map((l) => kid(l, 'defRPr')).filter(Boolean);
    const rStyle = (fn) => {
      for (const d of defaults) {
        const v = fn(d);
        if (v !== undefined && v !== null) return v;
      }
      return undefined;
    };
    const run = (rPr, text) => {
      const sz = num(rPr?.a.sz, rStyle((d) => d.a.sz) ?? (role === 'title' ? 4400 : 1800)) / 100;
      const color = (rPr && colorIn(kid(rPr, 'solidFill'), ctx)) || rStyle((d) => colorIn(kid(d, 'solidFill'), ctx)) || ctx.fontColor || '#' + ctx.theme[ctx.clrMap.tx1];
      const face = kid(rPr, 'latin')?.a.typeface || rStyle((d) => kid(d, 'latin')?.a.typeface);
      const font = !face || face === '+mn-lt' ? scope.master.minor : face === '+mj-lt' ? scope.master.major : face;
      const flag = (k) => (rPr?.a[k] !== undefined ? rPr.a[k] === '1' : rStyle((d) => (d.a[k] === undefined ? undefined : d.a[k] === '1')) || false);
      const u = rPr?.a.u ?? rStyle((d) => d.a.u);
      return { text, size: +(sz * scale).toFixed(1), color, font, bold: flag('b'), italic: flag('i'), underline: !!u && u !== 'none' };
    };
    const runs = [];
    for (const c of kids(p)) {
      if (c.n === 'r' || c.n === 'fld') runs.push(run(kid(c, 'rPr'), textOf(kid(c, 't'))));
      else if (c.n === 'br') runs.push({ ...run(kid(c, 'rPr'), ''), br: true });
    }
    const endSize = kid(p, 'endParaRPr');
    const blank = !runs.some((r) => r.text);
    const none = first((l) => (kid(l, 'buNone') ? true : undefined));
    const char = first((l) => kid(l, 'buChar')?.a.char);
    const auto = first((l) => kid(l, 'buAutoNum')?.a.type);
    if (level !== lastLevel) autonum = 0;
    lastLevel = level;
    let bullet = '';
    if (!blank && !none) {
      if (auto) bullet = ++autonum + '.';
      else if (char) bullet = /[A-Za-z§]/.test(char) ? '•' : char;
    }
    const marL = num(first((l) => l.a?.marL)) / PT, indent = num(first((l) => l.a?.indent)) / PT;
    const spcBef = kid(pPr, 'spcBef', 'spcPts');
    out.push({
      level, runs, bullet, align: first((l) => l.a?.algn) || 'l', marL, indent,
      before: spcBef ? num(spcBef.a.val) / 100 : undefined,
      height: blank ? num(endSize?.a.sz, rStyle((d) => d.a.sz) ?? 1800) / 100 : 0,
    });
  }
  return out;
}

function bodyOf(tx, chain) {
  const bp = [kid(tx, 'bodyPr'), ...chain.map((n) => kid(n, 'txBody', 'bodyPr'))].filter(Boolean);
  const pick = (k, d) => {
    for (const b of bp) if (b.a[k] !== undefined) return b.a[k];
    return d;
  };
  return {
    anchor: pick('anchor', 't'),
    insets: [num(pick('tIns', 45720)), num(pick('rIns', 91440)), num(pick('bIns', 45720)), num(pick('lIns', 91440))].map((v) => v / PT),
    vertical: pick('vert', 'horz'),
    wrap: pick('wrap', 'square') !== 'none',
  };
}

function readChart(pkg, part) {
  const xml = pkg.xml(part);
  const chart = deep(xml, 'chart').find((n) => kid(n, 'plotArea'));
  const plot = kid(chart, 'plotArea');
  if (!plot) return null;
  const kindNode = kids(plot).find((n) => /Chart$/.test(n.n));
  if (!kindNode) return null;
  const points = (n) => deep(n, 'pt').sort((a, b) => num(a.a.idx) - num(b.a.idx)).map((p) => textOf(kid(p, 'v')));
  const series = kids(kindNode, 'ser').map((s) => ({
    name: points(kid(s, 'tx'))[0] || '',
    categories: points(kid(s, 'cat')),
    values: points(kid(s, 'val')).map((v) => (Number.isFinite(+v) ? +v : null)),
  }));
  return {
    chartType: kindNode.n.replace(/3D/, '').replace(/Chart$/, ''),
    horizontal: kid(kindNode, 'barDir')?.a.val === 'bar',
    title: deep(kid(chart, 'title'), 't').map(textOf).join(' '),
    categories: series[0]?.categories || [],
    series: series.map(({ name, values }) => ({ name, values })),
  };
}

function readShapes(tree, part, scope, ctx, reader, t, out, layer) {
  const pkg = reader.pkg;
  const rels = pkg.rels(part);
  for (let node of kids(tree)) {
    if (node.n === 'AlternateContent') {
      // the fallback is what every reader can show (a picture, usually)
      const pickFrom = kid(node, 'Fallback') || kid(node, 'Choice');
      readShapes(pickFrom, part, scope, ctx, reader, t, out, layer);
      continue;
    }
    if (node.n === 'grpSp') {
      const pr = kid(node, 'grpSpPr');
      const x = kid(pr, 'xfrm');
      if (!x || !kid(x, 'off') || !kid(x, 'ext') || !kid(x, 'chOff') || !kid(x, 'chExt')) {
        readShapes(node, part, scope, ctx, reader, t, out, layer);
        continue;
      }
      const off = kid(x, 'off').a, ext = kid(x, 'ext').a, ch = kid(x, 'chOff').a, ce = kid(x, 'chExt').a;
      const sx = num(ext.cx) / (num(ce.cx) || 1), sy = num(ext.cy) / (num(ce.cy) || 1);
      readShapes(node, part, scope, ctx, reader, {
        x: t.x + (num(off.x) / PT) * t.sx - (num(ch.x) / PT) * sx * t.sx,
        y: t.y + (num(off.y) / PT) * t.sy - (num(ch.y) / PT) * sy * t.sy,
        sx: sx * t.sx, sy: sy * t.sy,
      }, out, layer);
      continue;
    }
    if (node.n === 'pic') {
      const cNv = kid(node, 'nvPicPr', 'cNvPr');
      const ph = kid(node, 'nvPicPr', 'nvPr', 'ph');
      const box = xfrmOf(node) || inherited(ph, scope).map(xfrmOf).find(Boolean);
      if (!box) continue;
      const blipFill = kid(node, 'blipFill');
      const blip = kid(blipFill, 'blip');
      const rel = blip && rels.get(blip.a['r:embed']);
      const crop = kid(blipFill, 'srcRect')?.a || {};
      out.push({
        kind: 'image', layer, ...transform(box.x, box.y, box.w, box.h, t), rot: box.rot, flipH: box.flipH, flipV: box.flipV,
        image: rel && reader.image(rel.part), linked: !!rel?.external, name: cNv?.a.name || '', alt: cNv?.a.descr || '',
        crop: { l: num(crop.l) / 1000, t: num(crop.t) / 1000, r: num(crop.r) / 1000, b: num(crop.b) / 1000 },
      });
      continue;
    }
    if (node.n === 'graphicFrame') {
      const box = xfrmOf(node);
      if (!box) continue;
      const data = kid(node, 'graphic', 'graphicData');
      const at = transform(box.x, box.y, box.w, box.h, t);
      const table = kid(data, 'tbl');
      if (table) {
        const widths = kids(kid(table, 'tblGrid'), 'gridCol').map((c) => num(c.a.w) / PT);
        const rows = kids(table, 'tr').map((tr) => ({
          height: num(tr.a.h) / PT,
          cells: kids(tr, 'tc').filter((c) => c.a.hMerge !== '1' && c.a.vMerge !== '1').map((tc) => {
            const tx = kid(tc, 'txBody');
            const pr = kid(tc, 'tcPr');
            return { span: num(tc.a.gridSpan, 1), rowSpan: num(tc.a.rowSpan, 1), fill: fillOf(pr, ctx), paragraphs: tx ? paragraphs(tx, [], scope, 'other', ctx) : [] };
          }),
        }));
        out.push({ kind: 'table', layer, ...at, widths, rows, name: kid(node, 'nvGraphicFramePr', 'cNvPr')?.a.name || '' });
        continue;
      }
      const chartRef = kid(data, 'chart');
      if (chartRef) {
        const rel = rels.get(chartRef.a['r:id']);
        const chart = rel?.part && pkg.files[rel.part] ? readChart(pkg, rel.part) : null;
        if (chart) out.push({ kind: 'chart', layer, ...at, ...chart });
        continue;
      }
      const dgm = kid(data, 'relIds');
      if (dgm) {
        // SmartArt: PowerPoint stores the finished drawing next to the diagram's data
        const drawing = pkg.relOfType(part, 'diagramDrawing');
        const tree2 = drawing && deep(pkg.xml(drawing), 'spTree')[0];
        if (tree2) {
          const before = out.length;
          readShapes(tree2, drawing, scope, ctx, reader, { x: at.x, y: at.y, sx: t.sx, sy: t.sy }, out, layer);
          for (const s of out.slice(before)) s.diagram = true;
        } else out.push({ kind: 'missing', layer, ...at, what: 'SmartArt' });
      }
      continue;
    }
    if (node.n !== 'sp' && node.n !== 'cxnSp') continue;
    const nv = kid(node, 'nvSpPr') || kid(node, 'nvCxnSpPr');
    const ph = kid(nv, 'nvPr', 'ph');
    if (layer !== 'slide' && ph) continue; // layout / master placeholders are prompts, not content
    const chain = inherited(ph, scope);
    const box = xfrmOf(node) || chain.map(xfrmOf).find(Boolean);
    if (!box) continue;
    const pr = kid(node, 'spPr');
    const style = kid(node, 'style');
    const local = { ...ctx };
    const fontRef = kid(style, 'fontRef');
    if (fontRef) local.fontColor = colorIn(fontRef, ctx) || undefined;
    let fill = fillOf(pr, ctx);
    if (fill === undefined) for (const n of chain) if (fill === undefined) fill = fillOf(kid(n, 'spPr'), ctx);
    const fillRef = kid(style, 'fillRef');
    if (fill === undefined && fillRef && num(fillRef.a.idx) > 0) fill = colorIn(fillRef, ctx);
    const ln = kid(pr, 'ln');
    const lnRef = kid(style, 'lnRef');
    const hasLine = ln ? !kid(ln, 'noFill') : !!lnRef && num(lnRef.a.idx) > 0;
    const line = hasLine ? { color: colorIn(kid(ln, 'solidFill'), ctx) || colorIn(lnRef, ctx) || '#000000', width: Math.max(0.5, num(ln?.a.w, 9525) / PT) } : null;
    const geom = kid(pr, 'prstGeom')?.a.prst || (node.n === 'cxnSp' ? 'line' : 'rect');
    const at = { ...transform(box.x, box.y, box.w, box.h, t), rot: box.rot, flipH: box.flipH, flipV: box.flipV };
    if (node.n === 'cxnSp' || geom === 'line' || geom.startsWith('straightConnector')) {
      out.push({ kind: 'line', layer, ...at, line: line || { color: '#000000', width: 0.75 } });
      continue;
    }
    const tx = kid(node, 'txBody');
    const type = ph?.a.type || '';
    const role = type === 'title' || type === 'ctrTitle' ? 'title' : ph ? 'body' : 'other';
    const para = tx ? paragraphs(tx, chain, scope, role, local) : [];
    const blip = deep(kid(pr, 'blipFill'), 'blip')[0];
    if (blip) {
      const rel = rels.get(blip.a['r:embed']);
      out.push({ kind: 'image', layer, ...at, image: rel && reader.image(rel.part), crop: { l: 0, t: 0, r: 0, b: 0 }, name: kid(nv, 'cNvPr')?.a.name || '', alt: kid(nv, 'cNvPr')?.a.descr || '' });
    }
    if (ph && ['dt', 'ftr', 'sldNum'].includes(type) && !para.some((p) => p.runs.length)) continue;
    out.push({ kind: 'text', layer, ...at, fill: fill || null, line, geom, role, placeholder: type, paragraphs: para, body: tx ? bodyOf(tx, chain) : bodyOf(null, []), name: kid(nv, 'cNvPr')?.a.name || '' });
  }
}

function notesOf(pkg, slidePart) {
  const part = pkg.relOfType(slidePart, 'notesSlide');
  const xml = kid(pkg.xml(part), 'notes');
  if (!xml) return '';
  const lines = [];
  for (const sp of deep(xml, 'sp')) {
    const type = kid(sp, 'nvSpPr', 'nvPr', 'ph')?.a.type;
    if (type !== 'body') continue;
    for (const p of deep(sp, 'p')) lines.push(deep(p, 't').map(textOf).join(''));
  }
  return lines.join('\n').trim();
}

function readPptx(bytes) {
  const pkg = new Package(bytes);
  const main = 'ppt/presentation.xml';
  const presentation = kid(pkg.xml(main), 'presentation');
  if (!presentation) throw Error('Bu dosya geçerli bir PowerPoint sunumu değil.');
  const size = kid(presentation, 'sldSz')?.a || {};
  const deck = { format: 'pptx', width: num(size.cx, 9144000) / PT, height: num(size.cy, 6858000) / PT, slides: [] };
  const rels = pkg.rels(main);
  const reader = new Reader(pkg);
  const masters = new Map();
  let number = 0;
  for (const id of kids(kid(presentation, 'sldIdLst'), 'sldId')) {
    const rel = rels.get(id.a['r:id']);
    const xml = rel?.part && kid(pkg.xml(rel.part), 'sld');
    number++;
    if (!xml) continue;
    const layoutPart = pkg.relOfType(rel.part, 'slideLayout');
    const layout = kid(pkg.xml(layoutPart), 'sldLayout');
    if (!masters.has(layoutPart)) masters.set(layoutPart, reader.masterOf(layoutPart));
    const master = masters.get(layoutPart);
    const ctx = { theme: master.theme, clrMap: master.clrMap, phClr: 'accent1' };
    const scope = { master, layoutPh: reader.placeholders(layout), masterPh: reader.placeholders(master.xml) };
    const shapes = [];
    const identity = { x: 0, y: 0, sx: 1, sy: 1 };
    if (layout?.a.showMasterSp !== '0') readShapes(kid(master.xml, 'cSld', 'spTree'), master.part, scope, ctx, reader, identity, shapes, 'master');
    readShapes(kid(layout, 'cSld', 'spTree'), layoutPart, scope, ctx, reader, identity, shapes, 'layout');
    readShapes(kid(xml, 'cSld', 'spTree'), rel.part, scope, ctx, reader, identity, shapes, 'slide');
    const background = reader.background(xml, rel.part, ctx) || reader.background(layout, layoutPart, ctx) || reader.background(master.xml, master.part, ctx);
    deck.slides.push({ number, hidden: xml.a.show === '0', background, shapes, notes: notesOf(pkg, rel.part) });
  }
  return deck;
}

module.exports = { readPptx, parseXml, kid, kids, deep, textOf };
