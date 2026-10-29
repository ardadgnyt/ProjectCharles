// "Get to know me" import from ChatGPT answers.
// v0.9.6: the question pack lives beside this file (it is app content, not documentation).
const { randomUUID } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path');
function guide() {
  return fs.readFileSync(path.join(__dirname, 'intro-questions.md'), 'utf8');
}
function validate(items) {
  if (!Array.isArray(items) || !items.length || items.length > 16)
    throw Error('1–16 bilgi bölümü gerekli.');
  return items.map((item) => {
    if (!item || typeof item.title !== 'string' || typeof item.text !== 'string')
      throw Error('Her bölümde title ve text alanları olmalı.');
    const title = item.title.trim(),
      text = item.text.trim();
    if (!title || title.length > 100 || !text || title.length + text.length + 2 > 2000)
      throw Error('Her bölüm başlığıyla birlikte 2000 karakteri aşmamalı ve boş olmamalı.');
    return { title, text };
  });
}
function preview(raw) {
  if (typeof raw !== 'string' || raw.length > 40000)
    throw Error('Yanıt en fazla 40.000 karakter olabilir.');
  const clean = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value;
  try {
    value = JSON.parse(clean);
  } catch {
    throw Error(
      'ChatGPT yanıtının JSON bölümünü bütünüyle yapıştır. Soru paketindeki çıktı biçimini kullanmasını iste.',
    );
  }
  return validate(Array.isArray(value) ? value : value.sections);
}
function save(personal, items) {
  const selected = validate(items);
  const records = selected.map(({ title, text }) => `${title}: ${text}`);
  const existing = new Set(personal.data.memories.map((m) => m.text));
  const unique = [...new Set(records)].filter((text) => !existing.has(text));
  const all = [...personal.data.memories.map((m) => m.text), ...unique];
  if (all.length > 50)
    throw Error(
      'Hafızada en fazla 50 kayıt saklanabilir. Daha az bölüm seç veya eski kayıtları sil.',
    );
  if (all.join('\n').length > 15000)
    throw Error(
      'Toplam hafıza 15.000 karakteri aşıyor. Metinleri kısalt veya daha az bölüm seç; hiçbir kayıt henüz eklenmedi.',
    );
  const before = personal.data.memories;
  personal.data.memories = [
    ...before,
    ...unique.map((text) => ({
      id: randomUUID(),
      text,
      source: 'chatgpt-import',
      updatedAt: Date.now(),
    })),
  ];
  try {
    personal.save();
  } catch (e) {
    personal.data.memories = before;
    throw e;
  }
  return { added: unique.length, data: personal.data };
}
module.exports = { guide, preview, save };
