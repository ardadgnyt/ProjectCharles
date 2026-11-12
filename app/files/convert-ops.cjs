'use strict';
// v0.9.26: the converter's full list of formats and operations, apart from the ones convert.cjs has
// always done itself. For each kind of file: what it can become, the choices each target has (as a
// schema the converter sheet draws), and how it is made. Engines, from the most faithful down:
//   Word / Excel / PowerPoint when installed (office-com.cjs) · Windows' PDF renderer, picture
//   codecs and OCR in Charles' helper (pdf-render.cjs, helper-job.cjs) · FFmpeg (media.cjs) ·
//   local Whisper (transcribe.cjs) · Windows' tar.exe (archive.cjs) · Charles' own readers and
//   writers (sheets.cjs, docs.cjs, pptx-write.cjs, searchable-pdf.cjs, vectorize.cjs, tables.cjs).
// Nothing here uploads anything; the source file is only read and nothing that exists is overwritten.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ext = (f) => {
  const b = path.basename(f).toLowerCase();
  if (/\.tar\.(gz|xz|bz2)$/.test(b)) return 'tar.' + b.split('.').pop();
  return path.extname(b).slice(1);
};
const SETS = {
  pdf: ['pdf'],
  word: ['docx', 'doc', 'odt', 'rtf'],
  sheet: ['xlsx', 'xls', 'ods'],
  delimited: ['csv', 'tsv'],
  json: ['json'],
  slides: ['pptx', 'ppt', 'odp'],
  txt: ['txt'],
  md: ['md', 'markdown'],
  html: ['html', 'htm'],
  epub: ['epub'],
  raster: ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'bmp', 'tif', 'tiff', 'avif'],
  heic: ['heic', 'heif'],
  svg: ['svg'],
  ico: ['ico'],
  gif: ['gif'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'amr'],
  video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'mpeg', 'mpg', 'ts', 'm2ts', '3gp', 'ogv', 'm4v'],
  subs: ['srt', 'vtt'],
  archive: ['zip', '7z', 'tar', 'tgz', 'tar.gz', 'tar.xz', 'txz', 'tar.bz2', 'rar'],
};
const setOf = (f) => Object.keys(SETS).find((k) => SETS[k].includes(ext(f))) || null;

// ── labels and groups of the targets this file adds ─────────────────────────────────────────────
const LABELS = {
  xlsx: 'XLSX', ods: 'ODS', odt: 'ODT', rtf: 'RTF', epub: 'EPUB', odp: 'ODP', pptx: 'PPTX', tsv: 'TSV', csv: 'CSV', json: 'JSON', aac: 'AAC', mkv: 'MKV', avi: 'AVI',
  'pdf-xlsx': 'XLSX · tablolar', 'pdf-csv': 'CSV · tablolar', 'pptx-pages': 'PPTX · sayfa görselleri', 'pptx-text': 'PPTX · düzenlenebilir',
  'ocr-pdf': 'Aranabilir PDF', 'ocr-txt': 'TXT', 'ocr-docx': 'DOCX', 'ocr-xlsx': 'XLSX · tablo', 'ocr-csv': 'CSV · tablo',
  'pages-png': 'PNG · sayfa sayfa', 'pages-jpg': 'JPEG · sayfa sayfa', 'pages-tiff': 'TIFF · çok sayfalı',
  'sheet-png': 'PNG · sayfa/aralık', 'sheet-jpg': 'JPEG · sayfa/aralık', 'page-png': 'PNG · sayfanın görünümü', 'page-jpg': 'JPEG · sayfanın görünümü',
  'svg-trace': 'SVG · vektörleştir', 'ico-png': 'PNG · simgeler',
  'anim-webp': 'WebP · hareketli', 'anim-mp4': 'MP4 · hareketli', 'frames-png': 'PNG · kareler', 'frames-jpg': 'JPEG · kareler',
  'clip-gif': 'GIF · bölüm', 'clip-webp': 'WebP · hareketli bölüm', 'join-gif': 'GIF · hareketli (birleştir)', 'join-webp': 'WebP · hareketli (birleştir)',
  'audio-mp3': 'MP3 · ses', 'audio-wav': 'WAV · ses', 'audio-flac': 'FLAC · ses', 'audio-m4a': 'M4A · ses',
  'say-txt': 'TXT · yazıya dök', 'say-docx': 'DOCX · yazıya dök', 'say-srt': 'SRT · yazıya dök', 'say-vtt': 'VTT · yazıya dök',
  'sub-txt': 'TXT · zamanlar olmadan', 'notes-txt': 'TXT · konuşmacı notları',
  extract: 'Klasöre çıkar', 'arc-zip': 'ZIP', 'arc-7z': '7Z', 'arc-tar': 'TAR', 'arc-tgz': 'TAR.GZ',
};
const GROUPS = {
  'pdf-xlsx': 'data', 'pdf-csv': 'data', 'ocr-xlsx': 'data', 'ocr-csv': 'data', xlsx: 'data', ods: 'data', tsv: 'data', csv: 'data', json: 'data',
  odt: 'document', rtf: 'document', epub: 'document', pptx: 'presentation', odp: 'presentation', 'pptx-pages': 'presentation', 'pptx-text': 'presentation',
  'ocr-pdf': 'ocr', 'ocr-txt': 'ocr', 'ocr-docx': 'ocr',
  'pages-png': 'image', 'pages-jpg': 'image', 'pages-tiff': 'image', 'sheet-png': 'image', 'sheet-jpg': 'image', 'page-png': 'image', 'page-jpg': 'image', 'svg-trace': 'image', 'ico-png': 'image', 'frames-png': 'image', 'frames-jpg': 'image',
  'anim-webp': 'animation', 'anim-mp4': 'animation', 'clip-gif': 'animation', 'clip-webp': 'animation', 'join-gif': 'animation', 'join-webp': 'animation',
  aac: 'audio', 'audio-mp3': 'audio', 'audio-wav': 'audio', 'audio-flac': 'audio', 'audio-m4a': 'audio', mkv: 'video', avi: 'video',
  'say-txt': 'speech', 'say-docx': 'speech', 'say-srt': 'speech', 'say-vtt': 'speech', 'sub-txt': 'subtitle', 'notes-txt': 'presentation',
  extract: 'archive', 'arc-zip': 'archive', 'arc-7z': 'archive', 'arc-tar': 'archive', 'arc-tgz': 'archive',
};

/** What one file can become here (convert.cjs adds its own long-standing targets). */
function targetsOf(file) {
  const e = ext(file);
  const s = setOf(file);
  const not = (list) => list.filter((t) => t !== e && !(t === 'jpg' && ['jpeg', 'jfif'].includes(e)) && !(t === 'tiff' && e === 'tif') && !(t === 'html' && e === 'htm') && !(t === 'md' && e === 'markdown'));
  switch (s) {
    case 'pdf': return ['docx', 'pdf-xlsx', 'pdf-csv', 'pptx-pages', 'pptx-text', 'txt', 'html', 'png', 'jpg', 'pages-tiff', 'ocr-pdf', 'ocr-txt', 'ocr-docx'];
    case 'word': return not(['pdf', 'docx', 'odt', 'rtf', 'txt', 'html', 'md', 'epub', 'pages-png', 'pages-jpg']);
    case 'sheet': return not(['xlsx', 'ods', 'pdf', 'csv', 'tsv', 'html', 'sheet-png', 'sheet-jpg']);
    case 'delimited': return not(['xlsx', 'ods', 'csv', 'tsv', 'json', 'html', 'pdf']);
    case 'json': return ['csv', 'tsv', 'xlsx'];
    case 'slides': return not(['pptx', 'odp', 'pdf', 'png', 'jpg', 'pages-tiff', 'txt', 'notes-txt', 'docx', 'md']);
    case 'txt': return ['pdf', 'docx', 'odt', 'rtf', 'html', 'md'];
    case 'md': return ['pdf', 'docx', 'html', 'txt', 'epub'];
    case 'html': return ['pdf', 'docx', 'txt', 'md', 'page-png', 'page-jpg', 'epub'];
    case 'epub': return ['pdf', 'txt', 'html', 'docx'];
    case 'raster': return [...not(['png', 'jpg', 'webp', 'bmp', 'tiff', 'avif', 'pdf', 'ico']), 'svg-trace', 'ocr-txt', 'ocr-docx', 'ocr-pdf', 'ocr-xlsx', 'ocr-csv'];
    case 'heic': return ['jpg', 'png', 'webp', 'pdf'];
    case 'svg': return ['png', 'jpg', 'webp', 'pdf'];
    case 'ico': return ['ico-png'];
    case 'gif': return ['anim-webp', 'anim-mp4', 'frames-png', 'frames-jpg'];
    case 'audio': return [...not(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus']), 'say-txt', 'say-docx', 'say-srt', 'say-vtt'];
    case 'video': return [...not(['mp4', 'mkv', 'mov', 'avi', 'webm']), 'audio-mp3', 'audio-wav', 'audio-flac', 'audio-m4a', 'clip-gif', 'clip-webp', 'frames-png', 'frames-jpg', 'say-txt', 'say-docx', 'say-srt', 'say-vtt'];
    case 'subs': return [e === 'srt' ? 'vtt' : 'srt', 'sub-txt'];
    case 'archive': return ['extract', ...['arc-zip', 'arc-7z', 'arc-tar', 'arc-tgz'].filter((t) => !(t === 'arc-zip' && e === 'zip') && !(t === 'arc-7z' && e === '7z') && !(t === 'arc-tar' && e === 'tar') && !(t === 'arc-tgz' && ['tgz', 'tar.gz'].includes(e)))];
    default: return [];
  }
}
/** Targets that take several files together into one result. */
function batchTargets(files) {
  const out = [];
  const images = files.every((f) => ['raster', 'heic', 'gif'].includes(setOf(f)));
  if (files.length > 1 && images) out.push('join-gif', 'join-webp');
  // one archive goes to another archive format through its own targets (repack)
  if (files.length > 1 || setOf(files[0]) !== 'archive') out.push('arc-7z', 'arc-tar');
  return out;
}

// ── which program a target needs ────────────────────────────────────────────────────────────────
/** null: Charles can do it itself; else 'word' | 'excel' | 'powerpoint'. */
function officeNeed(file, target) {
  const e = ext(file);
  if (e === 'doc') return 'word';
  if (e === 'xls') return 'excel';
  if (e === 'odp') return 'powerpoint';
  if (e === 'ppt' && ['pptx', 'odp'].includes(target)) return 'powerpoint';
  if (e === 'pptx' && target === 'odp') return 'powerpoint';
  return null;
}

// ── the choices of each target (the sheet draws these) ──────────────────────────────────────────
const Q = { id: 'quality', type: 'select', label: 'Kalite', choices: [['high', 'Yüksek'], ['balanced', 'Dengeli'], ['small', 'Küçük']], value: 'balanced' };
const PAGES = [
  { id: 'pageMode', type: 'select', label: 'Sayfalar', choices: [['all', 'Tüm sayfalar'], ['some', 'Seçili sayfalar']], value: 'all' },
  { id: 'pages', type: 'text', label: 'Sayfa aralığı', placeholder: '1-3, 5', show: ['pageMode', 'some'], max: 200 },
];
const DPI = { id: 'dpi', type: 'select', label: 'Çözünürlük', choices: [['72', '72 DPI · Küçük'], ['150', '150 DPI · Önerilen'], ['200', '200 DPI'], ['300', '300 DPI · Baskı']], value: '150' };
const OCR_DPI = { ...DPI, value: '300', choices: [['200', '200 DPI'], ['300', '300 DPI · Önerilen'], ['400', '400 DPI']] };
const BG = { id: 'bg', type: 'color', label: 'Saydam yerlerin rengi', value: '#ffffff' };
const OUT = { id: 'outDir', type: 'folder', label: 'Kaydedileceği yer' };
const ENC_IN = { id: 'encoding', type: 'select', label: 'Karakter kodlaması', choices: [['auto', 'Otomatik'], ['utf-8', 'UTF-8'], ['windows-1254', 'Windows-1254 (Türkçe)'], ['windows-1252', 'Windows-1252 (Batı)'], ['iso-8859-9', 'ISO-8859-9'], ['utf-16le', 'UTF-16']], value: 'auto' };
const ENC_OUT = { id: 'outEncoding', type: 'select', label: 'Çıktı kodlaması', choices: [['utf-8-bom', 'UTF-8 (Excel uyumlu)'], ['utf-8', 'UTF-8 (BOM’suz)'], ['windows-1254', 'Windows-1254 (Türkçe)'], ['utf-16le', 'UTF-16']], value: 'utf-8-bom' };
const SEP = { id: 'separator', type: 'select', label: 'Ayırıcı', choices: [['auto', 'Otomatik'], ['comma', 'Virgül ,'], ['semicolon', 'Noktalı virgül ;'], ['tab', 'Sekme'], ['pipe', 'Dikey çizgi |']], value: 'auto' };
const HEADER = { id: 'header', type: 'select', label: 'Sütun başlıkları', choices: [['yes', 'İlk satır başlık'], ['no', 'Başlık yok']], value: 'yes' };
const TYPES = { id: 'types', type: 'select', label: 'Veri türleri', choices: [['auto', 'Sayı ve tarihleri tanı'], ['text', 'Hepsi metin']], value: 'auto' };
const SHEET = { id: 'sheet', type: 'sheet', label: 'Çalışma sayfası' };
const RANGE = { id: 'range', type: 'text', label: 'Hücre aralığı', placeholder: 'A1:D20 (boş: tümü)', max: 30 };
const LANG = (choices) => ({ id: 'lang', type: 'select', label: 'Dil', choices, value: choices[0][0] });
const REVIEW = { id: 'review', type: 'check', label: 'Kaydetmeden önce kontrol et', value: true };
const AUDIO = [
  { id: 'bitrate', type: 'select', label: 'Bit hızı', choices: [['auto', 'Kaliteye göre'], ['96k', '96 kbps'], ['128k', '128 kbps'], ['192k', '192 kbps'], ['256k', '256 kbps'], ['320k', '320 kbps']], value: 'auto' },
  { id: 'sampleRate', type: 'select', label: 'Örnekleme hızı', choices: [['auto', 'Kaynakla aynı'], ['22050', '22,05 kHz'], ['32000', '32 kHz'], ['44100', '44,1 kHz'], ['48000', '48 kHz']], value: 'auto' },
  { id: 'channels', type: 'select', label: 'Kanal', choices: [['auto', 'Kaynakla aynı'], ['2', 'Stereo'], ['1', 'Mono']], value: 'auto' },
];
const VIDEO = [
  { id: 'height', type: 'select', label: 'Çözünürlük', choices: [['0', 'Orijinal'], ['2160', '2160p'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']], value: '0' },
  { id: 'fps', type: 'select', label: 'Kare hızı', choices: [['auto', 'Kaynakla aynı'], ['24', '24'], ['25', '25'], ['30', '30'], ['50', '50'], ['60', '60']], value: 'auto' },
  { id: 'audio', type: 'select', label: 'Ses', choices: [['keep', 'Yeniden kodla'], ['copy', 'Olduğu gibi kopyala'], ['none', 'Sesi kaldır']], value: 'keep' },
  { ...AUDIO[0], label: 'Ses bit hızı' },
];
const CLIP = [
  { id: 'start', type: 'text', label: 'Başlangıç', placeholder: '0:05', max: 12 },
  { id: 'end', type: 'text', label: 'Bitiş', placeholder: '0:12', max: 12 },
  { id: 'width', type: 'select', label: 'Genişlik', choices: [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['960', '960 px']], value: '480' },
  { id: 'fps', type: 'select', label: 'Kare hızı', choices: [['8', '8'], ['10', '10'], ['12', '12'], ['15', '15'], ['24', '24']], value: '12' },
];
const SAY_LANGS = [['auto', 'Otomatik'], ['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['ar', 'العربية'], ['ru', 'Русский'], ['zh', '中文']];

/** The choices and notes of `target` for `files` (absolute paths). ocrLangs: what Windows' OCR knows here. */
function schema(files, target, { ocrLangs = [] } = {}) {
  const first = files[0];
  const s = setOf(first);
  const e = ext(first);
  const options = [];
  const notes = [];
  const ocrLang = LANG(ocrLangs.length ? ocrLangs.map((l) => [l, l]) : [['', 'Windows dili']]);
  if (s === 'pdf' && ['png', 'jpg', 'pages-tiff'].includes(target)) {
    options.push(...PAGES, DPI);
    if (target === 'jpg') options.push(Q);
    if (target === 'png') options.push({ id: 'background', type: 'select', label: 'Arka plan', choices: [['white', 'Beyaz (kâğıt gibi)'], ['transparent', 'Saydam']], value: 'white' });
    options.push(OUT);
  }
  if (s === 'pdf' && ['pdf-xlsx', 'pdf-csv'].includes(target)) {
    options.push(...PAGES, ocrLang);
    if (target === 'pdf-csv') options.push(ENC_OUT);
    notes.push('Tablo, sayfadaki yazıların hizasından çıkarılır; çizgisiz veya birleşik hücreli tablolarda sütunlar kayabilir. Kaydetmeden önce hücreleri kontrol edebilirsin. Metni olmayan (taranmış) sayfalar OCR ile okunur.');
  }
  if (s === 'pdf' && ['pptx-pages', 'pptx-text'].includes(target)) {
    options.push(...PAGES);
    if (target === 'pptx-pages') options.push(DPI);
    notes.push(target === 'pptx-pages' ? 'Her sayfa bir slayt resmi olur: görünüm aynen kalır, metin düzenlenemez.' : 'Her sayfanın metni, yerinde duran düzenlenebilir kutulara aktarılır; resimler, çizgiler ve renkler taşınmaz.');
  }
  if (s === 'pdf' && ['docx', 'txt', 'html'].includes(target)) notes.push('Yalnızca metin aktarılır; sayfa düzeni, resimler ve tablolar korunmaz. Taranmış PDF için OCR seçeneklerini kullan.');
  if (target.startsWith('ocr-')) {
    if (s === 'pdf') options.push(...PAGES, OCR_DPI);
    options.push(ocrLang);
    if (['ocr-txt', 'ocr-docx', 'ocr-xlsx', 'ocr-csv'].includes(target)) options.push(REVIEW);
    if (target === 'ocr-csv') options.push(ENC_OUT);
    notes.push('Metin bu bilgisayarda Windows’un kendi metin tanıma özelliğiyle okunur; hiçbir şey gönderilmez. El yazısı, eğik veya düşük çözünürlüklü taramalarda hatalar olabilir.' + (ocrLangs.length ? '' : ' Bu bilgisayarda OCR dili yüklü değil: Windows Ayarlar → Dil’den bir dil paketi ekle.'));
  }
  if (s === 'word' && ['pages-png', 'pages-jpg'].includes(target)) options.push(...PAGES, DPI, ...(target === 'pages-jpg' ? [Q] : []), OUT);
  if (s === 'word' && !['pdf', 'pages-png', 'pages-jpg'].includes(target) && e !== 'doc') notes.push('Word yüklü değilse yalnızca başlıklar, paragraflar ve listeler aktarılır; tablolar, resimler ve biçimler korunmaz.');
  if ((s === 'sheet' || s === 'delimited' || s === 'json') && ['csv', 'tsv'].includes(target)) {
    if (s === 'sheet') options.push(SHEET);
    options.push(ENC_OUT);
    notes.push('CSV ve TSV yalnızca bir sayfanın değerlerini tutar: formüller (son sonuçları yazılır), biçimlendirme ve diğer sayfalar korunmaz.');
  }
  if (s === 'sheet' && ['sheet-png', 'sheet-jpg'].includes(target)) options.push(SHEET, RANGE, ...(target === 'sheet-jpg' ? [Q] : []));
  if (s === 'sheet' && ['xlsx', 'ods', 'html', 'pdf'].includes(target)) notes.push('Excel yüklü değilse yalnızca değerler aktarılır: formüller (son sonuçları kalır), biçimler, grafikler ve resimler korunmaz.');
  if (s === 'delimited') options.unshift(SEP, ENC_IN, HEADER, TYPES);
  if (s === 'json' || (s === 'delimited' && target === 'json')) {
    if (!options.includes(HEADER)) options.push(HEADER);
  }
  if (s === 'slides' && ['png', 'jpg', 'pages-tiff'].includes(target)) options.push({ id: 'width', type: 'select', label: 'Genişlik', choices: [['1280', '1280 px'], ['1920', '1920 px'], ['2560', '2560 px'], ['3840', '3840 px']], value: '1920' }, ...(target === 'jpg' ? [Q] : []), OUT);
  if (s === 'slides' && target === 'txt') options.push({ id: 'notes', type: 'check', label: 'Konuşmacı notlarını ayrı bir dosyaya da yaz', value: false });
  if (s === 'html' && ['page-png', 'page-jpg'].includes(target)) {
    options.push({ id: 'width', type: 'select', label: 'Sayfa genişliği', choices: [['800', '800 px'], ['1280', '1280 px'], ['1920', '1920 px']], value: '1280' }, ...(target === 'page-jpg' ? [Q] : []));
    notes.push('Sayfa betikler kapalı ve internete çıkmadan çizilir; çok uzun sayfalar 16 000 piksel yükseklikte kesilir.');
  }
  if (['md', 'html', 'word'].includes(s) && target === 'epub') options.push({ id: 'title', type: 'text', label: 'Kitap adı', placeholder: path.basename(first, path.extname(first)), max: 200 });
  if ((s === 'raster' || s === 'heic' || s === 'svg') && ['jpg', 'bmp', 'pdf'].includes(target)) options.push(BG);
  if (s === 'raster' && target === 'svg-trace') {
    options.push({ id: 'colors', type: 'select', label: 'Renk sayısı', choices: [['2', '2'], ['4', '4'], ['8', '8'], ['12', '12'], ['16', '16']], value: '8' }, { id: 'detail', type: 'select', label: 'Ayrıntı', choices: [['low', 'Az (yumuşak)'], ['normal', 'Orta'], ['high', 'Çok']], value: 'normal' });
    notes.push('Vektörleştirme resmi renk alanlarına çevirir: logo, simge ve çizimlerde iyi sonuç verir, fotoğraflar afiş gibi görünür.');
  }
  if (s === 'gif' && ['frames-png', 'frames-jpg'].includes(target)) options.push({ id: 'frames', type: 'text', label: 'Kareler', placeholder: '1, 5-8', max: 200 });
  if (s === 'video' && ['frames-png', 'frames-jpg'].includes(target)) {
    options.push({ id: 'frameMode', type: 'select', label: 'Kareler', choices: [['times', 'Belirli anlar'], ['every', 'Aralıkla']], value: 'times' });
    options.push({ id: 'times', type: 'text', label: 'Anlar', placeholder: '0:05, 1:20', show: ['frameMode', 'times'], max: 300 });
    options.push({ id: 'every', type: 'select', label: 'Her', show: ['frameMode', 'every'], choices: [['1', '1 sn'], ['5', '5 sn'], ['10', '10 sn'], ['30', '30 sn'], ['60', '60 sn']], value: '10' });
  }
  if (s === 'video' && ['clip-gif', 'clip-webp'].includes(target)) options.push(...CLIP);
  if (['anim-webp', 'anim-mp4', 'clip-webp', 'join-webp'].includes(target)) options.push(Q);
  if (['join-gif', 'join-webp'].includes(target)) options.push({ id: 'order', type: 'order', label: 'Sıra' }, { id: 'delay', type: 'select', label: 'Her kare', choices: [['100', '0,1 sn'], ['250', '0,25 sn'], ['500', '0,5 sn'], ['1000', '1 sn'], ['2000', '2 sn']], value: '500' }, { id: 'width', type: 'select', label: 'Genişlik', choices: [['0', 'İlk görsel kadar'], ['480', '480 px'], ['800', '800 px'], ['1280', '1280 px']], value: '0' });
  const audioOut = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus'].includes(target) || target.startsWith('audio-');
  if ((s === 'audio' || s === 'video') && audioOut) {
    options.push(...(['wav', 'flac', 'audio-wav', 'audio-flac'].includes(target) ? AUDIO.slice(1) : AUDIO), ...(target === 'ogg' || target === 'opus' || target === 'mp3' || target === 'm4a' || target === 'aac' || target === 'audio-mp3' || target === 'audio-m4a' ? [Q] : []));
    if (['wav', 'flac', 'audio-wav', 'audio-flac'].includes(target) && (s === 'video' || ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'amr'].includes(e)))
      notes.push('Kayıplı bir sesi (MP3, AAC, OGG …) FLAC veya WAV’a dönüştürmek kaybolmuş kaliteyi geri getirmez; dosya yalnızca büyür.');
  }
  if (s === 'video' && ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(target)) options.push(...VIDEO.slice(0, 2), Q, ...VIDEO.slice(2));
  if (target.startsWith('say-')) {
    options.push(LANG(SAY_LANGS));
    notes.push('Konuşma bu bilgisayardaki Whisper modeliyle yazıya dökülür; hiçbir şey gönderilmez. Uzun kayıtlar birkaç dakika sürebilir.');
  }
  if (target === 'notes-txt') notes.push('Yalnızca konuşmacı notları yazılır, slayt sırasıyla.');
  if (target === 'extract') notes.push('Arşiv önce denetlenir: klasör dışına yazmaya çalışan, bağlantı içeren ya da çok büyük arşivler açılmaz. İçerik yeni bir klasöre çıkarılır.');
  if (target.startsWith('arc-') && s === 'archive') notes.push('Arşiv önce güvenli biçimde geçici bir klasöre çıkarılır, sonra yeni biçimde paketlenir.');
  const need = officeNeed(first, target);
  if (need) notes.push(`Bu dönüşüm için Microsoft ${{ word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' }[need]} gerekir.`);
  return { options, notes };
}

// ── option checking ─────────────────────────────────────────────────────────────────────────────
/** Only values the schema offers pass; text fields are cut to their limit; colours must be #rrggbb. */
function clean(options, raw = {}) {
  const out = {};
  for (const o of options) {
    const v = raw[o.id];
    if (o.type === 'select') out[o.id] = o.choices.some(([c]) => c === v) ? v : o.value;
    else if (o.type === 'check') out[o.id] = typeof v === 'boolean' ? v : !!o.value;
    else if (o.type === 'color') out[o.id] = typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : o.value;
    else if (o.type === 'text') out[o.id] = typeof v === 'string' ? v.slice(0, o.max || 200) : '';
    else if (o.type === 'folder') out[o.id] = typeof v === 'string' && path.isAbsolute(v) && fs.existsSync(v) && fs.statSync(v).isDirectory() ? v : '';
    else if (o.type === 'sheet') out[o.id] = typeof v === 'string' ? v.slice(0, 64) : '';
    else if (o.type === 'order') out[o.id] = Array.isArray(v) && v.every((n) => Number.isInteger(n)) ? v : null;
  }
  return out;
}

module.exports = { ext, setOf, SETS, LABELS, GROUPS, targetsOf, batchTargets, officeNeed, schema, clean, tmpDir: () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-conv-')) };
