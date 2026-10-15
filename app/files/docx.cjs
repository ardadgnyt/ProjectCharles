// Extracts plain text from .docx files.
const { unzipSync, strFromU8 } = require('fflate');
function docxText(bytes) {
  const zip = unzipSync(bytes, {
    filter: (file) => file.name === 'word/document.xml' && file.originalSize <= 10 * 1024 * 1024,
  });
  const xml = zip['word/document.xml'];
  if (!xml) throw Error('Word belgesinin metni okunamadı veya çok büyük.');
  const decode = (s) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(1114111, Number(n))));
  return strFromU8(xml)
    .split(/<\/w:p>/)
    .map((p) =>
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decode(m[1])).join(''),
    )
    .join('\n')
    .slice(0, 200000);
}
module.exports = { docxText };
