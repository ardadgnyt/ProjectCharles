// v0.9.25: pictures that the subscription connections create, and what each connection can do.
//
//   GPT (Codex)  → its own image_generation tool (unchanged, app/core/task-mode.cjs).
//   Antigravity  → agy's own image generator: it saves the picture in its profile
//                  (.gemini/antigravity-cli/brain/<conversation>/…) and links it in the answer;
//                  Charles shows that file in the chat and drops the link.
//   Claude, EVREN → no image generator: the model draws an SVG inside <charles-gorsel> … and
//                  Charles turns it into a PNG (main.cjs, an off-screen page without network).
//
// In every case the chat gets the same imageGeneration items GPT sends, so the same
// "Görsel oluşturuluyor" card and the same image card with İndir / Kopyala appear.
const fs = require('node:fs');
const path = require('node:path');

/** The + menu per connection: attach, image (create), web, research. Keep src/chat/capabilities.ts the same. */
const CAPABILITIES = {
  gpt: ['attach', 'image', 'web', 'research'],
  gemini: ['attach', 'image', 'web', 'research'],
  claude: ['attach', 'image', 'web', 'research'],
  cursor: ['attach'],
  abacus: ['attach'],
  evren: ['attach', 'image'],
};
function providerOf(model) {
  const m = /^(gemini|claude|cursor|abacus|evren):/.exec(String(model || ''));
  return m ? m[1] : 'gpt';
}
function supports(model, task) {
  return (CAPABILITIES[providerOf(model)] || []).includes(task);
}
const TASK_NAMES = { image: 'Görsel oluşturma', web: 'Web’de arama', research: 'Derin araştırma' };
function unsupportedMessage(task) {
  return `${TASK_NAMES[task] || 'Bu seçenek'} bu yapay zekâ bağlantısında çalışmıyor.`;
}

// ── SVG drawings (Claude, EVREN) ───────────────────────────────────────────────────────────────
const SVG_PROVIDERS = ['claude', 'evren'];
const TAG = 'charles-gorsel';
const MAX_SVG = 1500000;
const MAX_DRAWINGS = 4;

function drawInstruction(task = '') {
  return (
    (task === 'image' ? 'Kullanıcı Görsel oluştur seçti: bu mesajda bir görsel üret. ' : '') +
    `Kullanıcı bir resim, çizim, görsel, logo, ikon, afiş ya da illüstrasyon isterse ASCII çizme. Görseli tek bir <${TAG}> … </${TAG}> etiketinin içinde, eksiksiz tek bir SVG olarak çiz: xmlns ve viewBox olsun, düzgün şekiller, renkler ve gölgelerle özenli ve ayrıntılı olsun; katmanları arkadan öne sırala (önce arka plan, sonra yer gölgesi, sonra nesne, en son parlaklıklar); betik, foreignObject, dış bağlantı ve dış görsel kullanma. Charles bu SVG'yi sohbette resim olarak gösterir; SVG kodunu etiketin dışında tekrar yazma, etiketin dışına en fazla bir iki cümle yaz ve görselden SVG ya da kod diye söz etme. Kullanıcı açıkça SVG kodu isterse kodu normal kod bloğunda ver.`
  );
}

/** The text with the drawings taken out, and the drawings (at most MAX_DRAWINGS). */
function extractDrawings(text) {
  const svgs = [];
  const re = new RegExp(`<${TAG}>([\\s\\S]*?)(?:</${TAG}>|$)`, 'gi');
  const cleaned = String(text || '').replace(re, (_, inner) => {
    if (svgs.length < MAX_DRAWINGS) {
      const svg = cleanSvg(inner);
      if (svg) svgs.push(svg);
    }
    return '';
  });
  return { text: cleaned.replace(/\n{3,}/g, '\n\n').trim(), svgs };
}

/**
 * One SVG document, safe to draw: no scripts, no event handlers, no foreignObject, no outside
 * links; the root gets a pixel size (1024 on its long side) from its viewBox. null when it is not one.
 */
function cleanSvg(raw) {
  let s = String(raw || '')
    .replace(/^\s*```(?:svg|xml)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const start = s.search(/<svg[\s>]/i);
  const end = s.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < start || s.length > MAX_SVG) return null;
  s = s.slice(start, end + 6);
  s = s
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("|')\s*(?!#|data:image\/(?:png|jpeg|gif|webp);)[^"']*\1/gi, '');
  const open = /<svg\b[^>]*>/i.exec(s);
  if (!open) return null;
  let tag = open[0];
  if (!/\sxmlns\s*=/.test(tag)) tag = tag.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const box = /\sviewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)\s*["']/i.exec(tag);
  let w = Number(/\swidth\s*=\s*["']?\s*([\d.]+)/i.exec(tag)?.[1]) || 0;
  let h = Number(/\sheight\s*=\s*["']?\s*([\d.]+)/i.exec(tag)?.[1]) || 0;
  if (box) {
    w = Number(box[3]);
    h = Number(box[4]);
  }
  if (!(w > 0 && h > 0)) {
    w = 1024;
    h = 1024;
  }
  if (!box) tag = tag.replace(/^<svg/i, `<svg viewBox="0 0 ${w} ${h}"`);
  const scale = 1024 / Math.max(w, h);
  const pw = Math.max(16, Math.round(w * scale));
  const ph = Math.max(16, Math.round(h * scale));
  tag = tag.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/^<svg/i, `<svg width="${pw}" height="${ph}"`);
  return s.slice(0, open.index) + tag + s.slice(open.index + open[0].length);
}

/**
 * Hides <charles-gorsel> … from text that arrives in pieces (EVREN streams): `push` returns what
 * may be shown now, `onStart` runs once when a drawing begins.
 */
function drawingFilter(onStart) {
  let pending = '';
  let inside = false;
  let started = false;
  const open = `<${TAG}>`;
  const close = `</${TAG}>`;
  return {
    push(piece) {
      pending += piece;
      let out = '';
      for (;;) {
        if (!inside) {
          const at = pending.indexOf(open);
          if (at < 0) {
            // keep back what could still become the opening tag
            let keep = 0;
            for (let n = Math.min(open.length - 1, pending.length); n > 0; n--)
              if (open.startsWith(pending.slice(-n))) {
                keep = n;
                break;
              }
            out += pending.slice(0, pending.length - keep);
            pending = pending.slice(pending.length - keep);
            return out;
          }
          out += pending.slice(0, at);
          pending = pending.slice(at + open.length);
          inside = true;
          if (!started) {
            started = true;
            onStart?.();
          }
        } else {
          const at = pending.indexOf(close);
          if (at < 0) {
            pending = pending.slice(Math.max(0, pending.length - close.length));
            return out;
          }
          pending = pending.slice(at + close.length);
          inside = false;
        }
      }
    },
    flush() {
      const rest = inside ? '' : pending;
      pending = '';
      return rest;
    },
    get started() {
      return started;
    },
  };
}

// ── Antigravity's own pictures ─────────────────────────────────────────────────────────────────
const PICTURE = /\.(png|jpe?g|webp)$/i;
const MAX_PICTURE = 25 * 1024 * 1024;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Inside `root` (both resolved, case-insensitive on Windows)? */
function within(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function fileFromUrl(url) {
  try {
    return decodeURIComponent(String(url).replace(/^file:\/\/\/?/i, '')).replace(/\//g, path.sep);
  } catch {
    return null;
  }
}

/**
 * The pictures agy made for this answer, newest last: the files its answer links inside its brain
 * folder, and new picture files in brain/<conversation>. Returns { text, files } with the links to
 * those files taken out of the text (a line that only carried such a link goes too).
 */
function agyPictures({ text, brain, conversationId, since = 0 }) {
  const files = [];
  const add = (f) => {
    if (!f || !PICTURE.test(f) || !within(brain, f) || files.some((x) => x.toLowerCase() === f.toLowerCase())) return;
    try {
      const st = fs.statSync(f);
      if (st.isFile() && st.size > 0 && st.size <= MAX_PICTURE) files.push(f);
    } catch {}
  };
  const link = /!?\[([^\]]*)\]\((file:\/\/\/[^)\s]+)\)/gi;
  const linked = [];
  for (const m of String(text || '').matchAll(link)) {
    const f = fileFromUrl(m[2]);
    if (f && within(brain, f)) {
      linked.push(m[0]);
      add(f);
    }
  }
  if (conversationId && /^[A-Za-z0-9-]{8,80}$/.test(conversationId)) {
    const dir = path.join(brain, conversationId);
    try {
      for (const name of fs.readdirSync(dir)) {
        const f = path.join(dir, name);
        try {
          if (PICTURE.test(name) && fs.statSync(f).mtimeMs >= since - 2000) add(f);
        } catch {}
      }
    } catch {}
  }
  let cleaned = String(text || '');
  for (const l of linked) cleaned = cleaned.split(l).join('\u0000');
  cleaned = cleaned
    .split('\n')
    .filter((line) => !(line.includes('\u0000') && !line.replace(/\u0000/g, '').replace(/[\s:*_`\-–—>]|dosya konumu|file location|konum/gi, '').trim()))
    .join('\n')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: cleaned, files: files.slice(0, MAX_DRAWINGS) };
}

/** data:image/…;base64,… for a picture file. */
function pictureData(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return `data:${MIME[ext] || 'image/png'};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** Does this agy stream line start its image generator? */
function agyDrawingStarts(event) {
  const u = event?.step_update;
  if (!u) return false;
  const info = u.tool_info || {};
  if (u.tool_name === 'invoke_subagent' && /image/i.test(String(info.parameters?.TypeName || info.parameters?.Role || ''))) return true;
  if (Array.isArray(u.subagent_info?.subagents) && u.subagent_info.subagents.some((s) => /image/i.test(String(s.type_name || '')))) return true;
  return /^generate_image$/i.test(String(u.tool_name || ''));
}

module.exports = {
  CAPABILITIES,
  providerOf,
  supports,
  unsupportedMessage,
  SVG_PROVIDERS,
  drawInstruction,
  extractDrawings,
  cleanSvg,
  drawingFilter,
  agyPictures,
  agyDrawingStarts,
  pictureData,
  within,
};
