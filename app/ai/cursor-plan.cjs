// v0.9.25: the Cursor models a Free account can really use.
//
// `agent models` lists every model whatever the plan, and on a Free account all but a few fail with
//   "ActionRequiredError: Model unavailable on Free Free includes Grok 4.7, Grok 4.6, and Auto with
//    fixed settings. Switch to an included model to continue."
// "Fixed settings" means one variant per family (checked 2026-11-08: grok-4.7-medium and
// cursor-grok-4.6-medium work, grok-4.7-low and cursor-grok-4.6-high do not). So Charles reads the
// plan from `agent about`, takes the included families from Cursor's own refusal, and tries the
// family's variants with a one-word prompt until one answers. A refused variant stops before any
// answer is made; one that answers costs a tiny request. The result is kept for a week in
// providers/cursor-plan.json (ids only) and the model picker shows only those models.
const WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_PROBES = 14;
const REFUSAL = /Model unavailable on ([A-Za-z][\w ]*?)\b[\s\S]*?includes ([^\n]+?) with fixed settings/i;

/** "Subscription Tier   Free" → "Free" (null when it is not there). */
function parseTier(text) {
  const m = /Subscription Tier\s+([A-Za-z][\w ]*?)\s*(?:\r?\n|$)/i.exec(String(text || ''));
  return m ? m[1].trim() : null;
}

/** Cursor's refusal → { tier, families } ("Grok 4.7", "Grok 4.6", "Auto"), or null. */
function parseRefusal(text) {
  const m = REFUSAL.exec(String(text || ''));
  if (!m) return null;
  const families = m[2]
    .split(/,|\band\b/i)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return { tier: m[1].trim(), families };
}

const norm = (s) => String(s || '').replace(/[​‌‍]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The listed models of one family, the likeliest "fixed settings" variant first. */
function candidates(family, list) {
  const f = norm(family);
  const rows = list.filter(([, name]) => {
    const n = norm(name);
    return n === f || n.startsWith(f + ' ');
  });
  const score = ([id, name]) => {
    const n = norm(name);
    const fast = /fast/.test(id) || /fast/.test(n);
    return (fast ? 10 : 0) + (/medium/.test(id) ? 0 : n === f ? 1 : /low/.test(id) ? 3 : 2);
  };
  return rows.sort((a, b) => score(a) - score(b));
}

function isPaid(plan) {
  return !!plan?.tier && !/^free$/i.test(plan.tier);
}

/** Should the saved check be done again (another plan, another list, or a week old)? */
function stale(plan, tier, listKey, now = Date.now()) {
  return !plan || plan.tier !== tier || plan.listKey !== listKey || !(now - (plan.checkedAt || 0) < WEEK);
}

/** The picker's Cursor rows for this plan: a Free account sees only what it can use. */
function visible(list, plan) {
  if (!plan || isPaid(plan) || !Array.isArray(plan.allowed)) return list;
  const ok = new Set(['auto', ...plan.allowed]);
  return list.filter(([id]) => ok.has(id));
}

/**
 * Finds the usable models of a Free account. `ask(id)` sends one tiny prompt with that model and
 * resolves { ok, refusal } (refusal: parseRefusal of its error, or null).
 */
async function probeFree(list, ask) {
  const allowed = [];
  let probes = 0;
  // the refusal of a model that is surely not included names the included families
  const first = list.find(([id]) => id !== 'auto' && !/grok|auto/i.test(id)) || list.find(([id]) => id !== 'auto');
  if (!first) return { allowed, families: [] };
  const r = await ask(first[0]);
  probes++;
  if (r.ok) allowed.push(first[0]);
  const families = r.refusal?.families || [];
  for (const family of families) {
    if (/^auto$/i.test(family)) continue;
    for (const [id] of candidates(family, list)) {
      if (probes >= MAX_PROBES) break;
      if (allowed.includes(id)) break;
      const t = await ask(id);
      probes++;
      if (t.ok) {
        allowed.push(id);
        break;
      }
      if (!t.refusal) break; // another kind of failure: stop guessing for this family
    }
  }
  return { allowed, families };
}

function listKey(list) {
  return list.map(([id]) => id).join(',');
}

module.exports = { parseTier, parseRefusal, candidates, probeFree, visible, stale, isPaid, listKey, WEEK };
