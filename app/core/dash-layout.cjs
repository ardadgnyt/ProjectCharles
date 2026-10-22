// v0.7.7: the customizable home page of the app window — which cards, in which column and
// order, plus the contents of the "Notlar" and "Hızlı komutlar" cards (companion.json).
const CARDS = ['music', 'reminders', 'calendar', 'mail', 'ask', 'home', 'usage', 'commands', 'notes', 'sysusage', 'sysinfo', 'modules'];
// v0.8.0: AIs the "Kalan kullanım" card can show (null = every connected one)
const USAGE_PROVIDERS = ['gpt', 'claude', 'gemini', 'cursor', 'abacus'];
// same rule as a module manifest's id (app/modules/manifest.cjs)
const MODULE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const MAX_MODULES = 100;
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
  if ('usageShow' in patch) {
    const v = patch.usageShow;
    if (v === null) delete next.usageShow;
    else {
      if (!Array.isArray(v) || v.length > USAGE_PROVIDERS.length || v.some((id) => !USAGE_PROVIDERS.includes(id)))
        throw Error('Geçersiz kullanım kartı seçimi.');
      next.usageShow = USAGE_PROVIDERS.filter((id) => v.includes(id));
    }
  }
  // v0.8.7: the "Modüller" card — which installed modules it shows, in order (null = all)
  if ('modules' in patch) {
    const v = patch.modules;
    if (v === null) delete next.modules;
    else {
      if (!Array.isArray(v) || v.length > MAX_MODULES || v.some((id) => typeof id !== 'string' || !MODULE_ID.test(id)))
        throw Error('Geçersiz modül kartı seçimi.');
      next.modules = [...new Set(v)];
    }
  }
  if (!next.cols) next.cols = DEFAULT.cols.map((c) => c.slice());
  return next;
}

module.exports = { cleanDash, CARDS, DEFAULT, USAGE_PROVIDERS };
