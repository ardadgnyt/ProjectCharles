'use strict';
// v0.9.26: FFmpeg for the converter's sound, video and animation choices: bit rate, sample rate,
// mono/stereo; resolution, frame rate, quality and the sound of a video; a part of a video as GIF or
// animated WebP; chosen frames as pictures; animations from several pictures. The arguments are a
// fixed list built here; file names never pass through a shell.

const QUALITY = {
  high: { crf: 18, vp9: 28, webp: 90, gifFps: 15 },
  balanced: { crf: 23, vp9: 33, webp: 80, gifFps: 12 },
  small: { crf: 28, vp9: 38, webp: 65, gifFps: 10 },
};
const BITRATES = ['auto', '96k', '128k', '160k', '192k', '256k', '320k'];
const RATES = ['auto', '22050', '32000', '44100', '48000'];
const AUDIO_TARGETS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus'];
const VIDEO_TARGETS = ['mp4', 'mkv', 'mov', 'avi', 'webm'];
const LOSSY = new Set(['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'amr']);

/** "1:23.5", "83", "00:01:23" â†’ seconds, or null. */
function timeOf(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const parts = s.split(':').map((p) => p.replace(',', '.'));
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) throw Error(`Zaman okunamadÄ±: â€œ${s.slice(0, 20)}â€. Ã–rnek: 1:05 ya da 65`);
  return parts.reduce((a, p) => a * 60 + Number(p), 0);
}

function audioCodec(target, { bitrate = 'auto', quality = 'balanced' } = {}) {
  const auto = { high: { mp3: '320k', aac: '256k', opus: '160k', ogg: 8 }, balanced: { mp3: '192k', aac: '192k', opus: '128k', ogg: 6 }, small: { mp3: '128k', aac: '128k', opus: '96k', ogg: 4 } }[quality] || {};
  const br = BITRATES.includes(bitrate) && bitrate !== 'auto' ? bitrate : null;
  if (target === 'mp3') return ['-c:a', 'libmp3lame', '-b:a', br || auto.mp3];
  if (target === 'm4a' || target === 'aac') return ['-c:a', 'aac', '-b:a', br || auto.aac, ...(target === 'aac' ? ['-f', 'adts'] : ['-movflags', '+faststart'])];
  if (target === 'wav') return ['-c:a', 'pcm_s16le'];
  if (target === 'flac') return ['-c:a', 'flac'];
  if (target === 'ogg') return br ? ['-c:a', 'libvorbis', '-b:a', br] : ['-c:a', 'libvorbis', '-q:a', String(auto.ogg)];
  if (target === 'opus') return ['-c:a', 'libopus', '-b:a', br || auto.opus];
  throw Error('Bu ses biÃ§imine dÃ¶nÃ¼ÅŸtÃ¼rÃ¼lemiyor.');
}
function audioShape({ sampleRate = 'auto', channels = 'auto' } = {}, target = '') {
  const out = [];
  // Opus works at 48 kHz; other rates are resampled by the encoder itself
  if (RATES.includes(String(sampleRate)) && sampleRate !== 'auto' && target !== 'opus') out.push('-ar', String(sampleRate));
  if (channels === '1' || channels === '2') out.push('-ac', channels);
  return out;
}

/** Sound â†’ sound, or the sound of a video taken out. */
function audioArgs(input, output, target, o = {}) {
  return ['-hide_banner', '-nostdin', '-y', '-i', input, '-vn', '-map', '0:a:0', '-map_metadata', '0', ...audioCodec(target, o), ...audioShape(o, target), output];
}

/** Video â†’ video with resolution (height), frame rate, quality and sound choices. */
function videoArgs(input, output, target, { height = 0, fps = 'auto', quality = 'balanced', audio = 'keep', bitrate = 'auto' } = {}) {
  const q = QUALITY[quality] || QUALITY.balanced;
  const filters = [];
  const h = Math.max(0, Math.min(4320, +height || 0));
  if (h) filters.push(`scale=-2:'min(${h},ih)'`);
  if (['24', '25', '30', '50', '60'].includes(String(fps))) filters.push(`fps=${fps}`);
  filters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
  const a = ['-hide_banner', '-nostdin', '-y', '-i', input, '-map', '0:v:0', ...(audio === 'none' ? [] : ['-map', '0:a?'])];
  const sound = (codec) => (audio === 'none' ? ['-an'] : audio === 'copy' && target !== 'avi' ? ['-c:a', 'copy'] : codec);
  const br = BITRATES.includes(bitrate) && bitrate !== 'auto' ? bitrate : null;
  if (target === 'webm') return [...a, '-vf', filters.join(','), '-c:v', 'libvpx-vp9', '-crf', String(q.vp9), '-b:v', '0', '-row-mt', '1', ...sound(['-c:a', 'libopus', '-b:a', br || '128k']), output];
  if (target === 'avi') return [...a, '-vf', filters.join(','), '-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', String(quality === 'high' ? 2 : quality === 'small' ? 7 : 4), ...sound(['-c:a', 'libmp3lame', '-b:a', br || '192k']), output];
  return [...a, '-vf', [...filters, 'format=yuv420p'].join(','), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(q.crf), ...sound(['-c:a', 'aac', '-b:a', br || '192k']), ...(target === 'mp4' || target === 'mov' ? ['-movflags', '+faststart'] : []), output];
}

/** A part of a video (or a whole GIF) as an animated GIF or WebP. */
function clipArgs(input, output, target, { start = '', end = '', width = 480, fps = 12, quality = 'balanced' } = {}) {
  const s = timeOf(start), e = timeOf(end);
  if (s !== null && e !== null && e <= s) throw Error('BitiÅŸ zamanÄ± baÅŸlangÄ±Ã§tan sonra olmalÄ±.');
  const cut = [...(s !== null ? ['-ss', String(s)] : []), ...(e !== null ? ['-to', String(e)] : [])];
  const w = Math.max(64, Math.min(1920, +width || 480));
  const f = Math.max(1, Math.min(50, +fps || 12));
  const head = ['-hide_banner', '-nostdin', '-y', ...cut, '-i', input];
  if (target === 'gif') return [...head, '-vf', `fps=${f},scale='min(${w},iw)':-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', output];
  if (target === 'webp') return [...head, '-vf', `fps=${f},scale='min(${w},iw)':-2:flags=lanczos`, '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String((QUALITY[quality] || QUALITY.balanced).webp), '-loop', '0', '-an', output];
  throw Error('Bu biÃ§ime dÃ¶nÃ¼ÅŸtÃ¼rÃ¼lemiyor.');
}

/** An animated GIF â†’ animated WebP (animation kept) or MP4 (a silent clip). */
function animArgs(input, output, target, { quality = 'balanced' } = {}) {
  const q = QUALITY[quality] || QUALITY.balanced;
  if (target === 'webp') return ['-hide_banner', '-nostdin', '-y', '-i', input, '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String(q.webp), '-loop', '0', output];
  return ['-hide_banner', '-nostdin', '-y', '-i', input, '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', String(q.crf), '-movflags', '+faststart', '-an', output];
}

/** "1, 5-8" â†’ frame numbers (1-based). */
function frameList(text, max = 100000) {
  const out = new Set();
  for (const part of String(text || '').split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d{1,6})(?:\s*-\s*(\d{1,6}))?$/.exec(part);
    if (!m) throw Error(`Kare numarasÄ± okunamadÄ±: â€œ${part.slice(0, 20)}â€. Ã–rnek: 1, 5-8`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a) throw Error('Kare aralÄ±ÄŸÄ± geÃ§ersiz.');
    for (let n = a; n <= b && out.size <= max; n++) out.add(n);
  }
  if (!out.size) throw Error('HiÃ§ kare seÃ§ilmedi.');
  return [...out].sort((x, y) => x - y);
}
/** Chosen frames of a GIF (by number) as pictures named in `pattern` (â€¦_%03d.png). */
function gifFramesArgs(input, pattern, frames) {
  const sel = frames.map((n) => `eq(n\\,${n - 1})`).join('+');
  return ['-hide_banner', '-nostdin', '-y', '-i', input, '-vf', `select='${sel}'`, '-fps_mode', 'passthrough', '-start_number', '1', pattern];
}
/** One frame of a video at a time (seconds). */
function videoFrameArgs(input, output, at) {
  return ['-hide_banner', '-nostdin', '-y', '-ss', String(at), '-i', input, '-frames:v', '1', ...(output.endsWith('.jpg') ? ['-q:v', '2'] : []), output];
}
/** Frames of a video every `every` seconds into `pattern`. */
function intervalFramesArgs(input, pattern, every, jpg) {
  return ['-hide_banner', '-nostdin', '-y', '-i', input, '-vf', `fps=1/${every}`, ...(jpg ? ['-q:v', '2'] : []), pattern];
}

/**
 * Several pictures (in the given order) â†’ an animated GIF or WebP. Each one shows `delay` ms; all
 * are fitted into the first one's size on a see-through (WebP) or white (GIF) background.
 * Returns [concat list text, ffmpeg args].
 */
function slideshowArgs(files, listFile, output, target, { delay = 500, width = 0, loop = true, quality = 'balanced', fit = null } = {}) {
  const d = Math.max(20, Math.min(60000, +delay || 500)) / 1000;
  const q = (p) => "'" + p.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'";
  // the concat list names each file and how long it stays; the last one is named twice so it shows
  const list = 'ffconcat version 1.0\n' + files.map((f) => `file ${q(f)}\nduration ${d}`).join('\n') + `\nfile ${q(files[files.length - 1])}\n`;
  // pictures of other sizes are fitted into the frame of the first one
  let [W, H] = fit || [0, 0];
  const w = +width || 0;
  if (W && H && w && W > w) (H = Math.round((H * w) / W)), (W = w);
  W += W % 2;
  H += H % 2;
  const size = W && H ? `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${target === 'gif' ? 'white' : '0x00000000'},format=${target === 'gif' ? 'rgb24' : 'rgba'},` : '';
  const head = ['-hide_banner', '-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', listFile];
  if (target === 'gif') return [list, [...head, '-vf', `${size}split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', loop ? '0' : '-1', output]];
  return [list, [...head, ...(size ? ['-vf', size.replace(/,$/, '')] : []), '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String((QUALITY[quality] || QUALITY.balanced).webp), '-loop', loop ? '0' : '1', output]];
}

module.exports = {
  AUDIO_TARGETS, VIDEO_TARGETS, BITRATES, RATES, LOSSY, timeOf, audioArgs, videoArgs, clipArgs, animArgs, frameList, gifFramesArgs, videoFrameArgs, intervalFramesArgs, slideshowArgs,
};
