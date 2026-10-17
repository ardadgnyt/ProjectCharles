// v0.7.7: the customizable home page of the app window — which cards, in which column and
// order, plus the contents of the "Notlar" and "Hızlı komutlar" cards (companion.json).
const CARDS = ['music', 'reminders', 'calendar', 'mail', 'ask', 'home', 'usage', 'commands', 'notes', 'sysusage', 'sysinfo'];
const DEFAULT = { cols: [['music', 'reminders', 'calendar'], ['mail', 'ask', 'home', 'usage']] };

function cleanCols(cols) {
  if (!Array.isArray(cols) || cols.length !== 2) throw Error('Geçersiz kart yerleşimi.');
  const seen = new Set();
  return cols.map((col) => {
    if (!Array.isArray(col) || col.length > CARDS.length) throw Error('Geçersiz kart yerleşimi.');
    return col.filter((id) => {
      if (typeof id !== 'string' || !CARDS.includes(id)) throw Error('Bilinmeyen kart: ' + String(id).slice(0, 30));
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  });
}
function cleanCommands(list) {
  if (!Array.isArray(list) || list.length > 12) throw Error('En fazla 12 hızlı komut olabilir.');
  return list.map((c) => {
    const label = String(c?.label || '').trim().slice(0, 40);
    const prompt = String(c?.prompt || '').trim().slice(0, 2000);
    if (!label || !prompt) throw Error('Hızlı komutun adı ve mesajı olmalı.');
    return { label, prompt };
  });
}

/** Merges a patch from the renderer into the saved value, checking every field. */
function cleanDash(patch, current) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('Geçersiz ana sayfa ayarı.');
  const next = { ...(current || {}) };
  if ('cols' in patch) next.cols = cleanCols(patch.cols);
  if ('notes' in patch) {
    if (typeof patch.notes !== 'string') throw Error('Geçersiz not.');
    next.notes = patch.notes.slice(0, 20000);
  }
  if ('commands' in patch) next.commands = cleanCommands(patch.commands);
  if (!next.cols) next.cols = DEFAULT.cols.map((c) => c.slice());
  return next;
}

module.exports = { cleanDash, CARDS, DEFAULT };
