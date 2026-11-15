// v1.0.0: the data behind Ayarlar → AI Modelleri → Varsayılan model: groups by provider, search and
// what a saved choice that is no longer offered means. No DOM here, so it can be unit tested.

/** One row of `api.models()` (see Providers.models and Agent.models in the main process). */
export interface ModelRow {
  id: string;
  name: string;
  isDefault?: boolean;
  efforts?: { value: string; label?: string; id: string }[];
}
export interface Choice {
  /** what is saved through `api.startupModel` ('' = GPT's own Auto) */
  value: string;
  provider: string;
  providerLabel: string;
  /** the model's own name, without its provider ("Sonnet 5.5"); 'Otomatik' for an Auto row */
  name: string;
  /** a short second line ("GPT-5.5" under GPT's Auto), or '' */
  meta: string;
  auto: boolean;
}
export interface Group {
  provider: string;
  label: string;
  choices: Choice[];
}
/** "No fixed default": Charles keeps the model last picked in the chat (saved as null). */
export const LAST = '__last__';
/** From this many models on, the list gets a search field. */
export const SEARCH_THRESHOLD = 10;

const PREFIXED = /^([a-z][a-z0-9_-]*):/;
/** The provider of a model id: the part before ':' ("claude:opus" → claude); GPT has none. */
export function providerOf(id: string) {
  return PREFIXED.exec(id)?.[1] || 'gpt';
}
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Claude · Sonnet 5.5" → "Sonnet 5.5". */
export function shortName(name: string) {
  const at = name.indexOf(' · ');
  return (at >= 0 ? name.slice(at + 3) : name).trim() || name;
}
/** A provider's display name: the known one, else the prefix its model names carry, else its id. */
function labelFor(provider: string, names: Map<string, string>, rowName = '') {
  const known = names.get(provider);
  if (known) return known;
  const at = rowName.indexOf(' · ');
  if (at > 0) return rowName.slice(0, at).trim();
  return provider === 'gpt' ? 'OpenAI' : capitalise(provider);
}

/**
 * The model list in groups, one per provider, in the order of `providers` (the composer's picker
 * list), then any other provider in the order it came. A provider nobody listed (a new connection)
 * needs no change here: its name comes from its model names ("NewAI · …").
 * Auto rows are only those the product has: GPT's (value '', as in the composer) and ids that end
 * in ":auto" (EVREN, Abacus AI, Cursor, GitHub Copilot…).
 */
export function buildGroups(list: ModelRow[], providers: [string, string][] = []): Group[] {
  const names = new Map(providers);
  const groups = new Map<string, Group>();
  const group = (provider: string, rowName: string) => {
    let g = groups.get(provider);
    if (!g) {
      g = { provider, label: labelFor(provider, names, rowName), choices: [] };
      groups.set(provider, g);
    }
    return g;
  };
  const gpt = list.filter((m) => providerOf(m.id) === 'gpt');
  if (gpt.length)
    group('gpt', '').choices.push({
      value: '',
      provider: 'gpt',
      providerLabel: group('gpt', '').label,
      name: 'Otomatik',
      meta: gpt.find((m) => m.isDefault)?.name || 'GPT',
      auto: true,
    });
  const seen = new Set<string>();
  for (const m of list) {
    if (!m || typeof m.id !== 'string' || seen.has(m.id)) continue;
    seen.add(m.id);
    const provider = providerOf(m.id);
    const g = group(provider, String(m.name || ''));
    const auto = /:auto$/.test(m.id);
    g.choices.push({
      value: m.id,
      provider,
      providerLabel: g.label,
      name: auto ? 'Otomatik' : shortName(String(m.name || m.id.replace(PREFIXED, ''))),
      meta: '',
      auto,
    });
  }
  const order = (p: string) => {
    const i = providers.findIndex(([id]) => id === p);
    return i < 0 ? providers.length : i;
  };
  // a stable sort keeps the order of appearance among providers that are not listed
  return [...groups.values()].sort((a, b) => order(a.provider) - order(b.provider));
}

/** Lower case without accents, with Turkish dotless/dotted i folded together. */
export function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}
/** Groups whose models match every word of `query` (in the model's or the provider's name). */
export function filterGroups(groups: Group[], query: string): Group[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  const out: Group[] = [];
  for (const g of groups) {
    const choices = g.choices.filter((c) => {
      const hay = fold(`${c.name} ${c.meta} ${g.label} ${c.value}`);
      return words.every((w) => hay.includes(w));
    });
    if (choices.length) out.push({ ...g, choices });
  }
  return out;
}
export const countChoices = (groups: Group[]) => groups.reduce((n, g) => n + g.choices.length, 0);

export type Resolved =
  | { kind: 'last' }
  | { kind: 'ok'; choice: Choice }
  | {
      kind: 'missing';
      value: string;
      provider: string;
      providerLabel: string;
      name: string;
      /** 'provider': that AI is not connected; 'model': it is, but no longer lists this model */
      reason: 'provider' | 'model';
    };
/**
 * What a saved default stands for in today's list. Like the chat's model list (populateModels),
 * an effort id of a listed model ("gemini-4-argon-high") and the old bare Claude names
 * ("claude:sonnet") are still that model. Anything else is shown as unavailable, never silently
 * as another model.
 */
export function resolveSaved(
  saved: string | null | undefined,
  groups: Group[],
  list: ModelRow[],
  providers: [string, string][] = [],
): Resolved {
  if (saved === null || saved === undefined || saved === LAST) return { kind: 'last' };
  const all = groups.flatMap((g) => g.choices);
  const exact = all.find((c) => c.value === saved);
  if (exact) return { kind: 'ok', choice: exact };
  const owner = list.find((m) => m.efforts?.some((e) => e.id === saved));
  const byEffort = owner && all.find((c) => c.value === owner.id);
  if (byEffort) return { kind: 'ok', choice: byEffort };
  const alias = /^claude:(opus|sonnet|haiku)$/.exec(saved);
  const byAlias = alias && all.find((c) => c.value.startsWith('claude:claude-' + alias[1] + '-'));
  if (byAlias) return { kind: 'ok', choice: byAlias };
  const provider = providerOf(saved);
  const listed = groups.find((g) => g.provider === provider);
  const bare = saved.replace(PREFIXED, '');
  return {
    kind: 'missing',
    value: saved,
    provider,
    providerLabel: listed?.label || labelFor(provider, new Map(providers)),
    name: saved === '' || bare === 'auto' ? 'Otomatik' : bare,
    reason: listed ? 'model' : 'provider',
  };
}
