// v1.0.0: the numbers of the weekly summary, shaped once for both views (Ayarlar → Haftalık özet and
// the island's Araçlar → Kullanım özeti). Pure: no DOM, the language is a parameter, so tests can
// check unknown vs zero, rounding and every locale. A value that was not measured is null, never 0.
import { hoursMinutes } from './time-units';
import type { Language } from './i18n';

const LOCALES: Record<Language, string> = { tr: 'tr-TR', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', zh: 'zh-CN' };
export const locale = (lang: Language) => LOCALES[lang] || 'tr-TR';

/** 12 345 / 12.345 / 12,345 in the language's own way. */
export function formatCount(n: number, lang: Language) {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(n);
}
/** Hours with one decimal for the chart values (axis says "saat"): 7,6 / 7.6. */
export function formatHours(seconds: number, lang: Language) {
  const h = seconds / 3600;
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: h < 10 ? 1 : 0, minimumFractionDigits: 0 }).format(h);
}
export const formatDuration = (seconds: number, lang: Language) => hoursMinutes(seconds, lang);

/** "9–13 Kas", "9–13 Nov", "9.–13. Nov.", "11月9日至13日"; across months "30 Kas – 6 Ara". */
export function rangeLabel(start: number, endExclusive: number, lang: Language) {
  const last = new Date(Math.max(start, endExclusive - 1));
  const first = new Date(start);
  const f = new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short' });
  // formatRange differs between ICU builds (Chinese came out as "11/9 – 11/13"), so it is built here
  if (first.getMonth() !== last.getMonth() || first.getFullYear() !== last.getFullYear()) return f.format(first) + ' – ' + f.format(last);
  if (+first === +last || first.getDate() === last.getDate()) return f.format(first);
  const dayOnly = new Intl.DateTimeFormat(locale(lang), { day: 'numeric' });
  // Chinese names the month first ("11月9日 – 13日"); the others name it last ("9 – 13 Kas")
  if (lang === 'zh') return f.format(first) + ' – ' + dayOnly.format(last);
  return dayOnly.format(first) + (lang === 'de' ? '.' : '') + ' – ' + f.format(last);
}
/** "Pzt", "Mon", "Mo", "周一" */
export function weekdayShort(t: number, lang: Language) {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short' }).format(new Date(t)).replace(/\.$/, '');
}
/** "Sal 10 Kas", "Tue 10 Nov", "11月10日周二" */
export function dayLabel(t: number, lang: Language) {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(t));
}
/** "14:05" / "14.05" in the language's own way */
export function clock(t: number, lang: Language) {
  return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}

/** The highest bar's value rounded up to a readable top line. */
export function niceMax(value: number, steps: number[]) {
  for (const s of steps) if (value <= s) return s;
  const last = steps[steps.length - 1];
  return Math.ceil(value / last) * last;
}
const HOUR_STEPS = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24].map((h) => h * 3600);
const COUNT_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

export type Day = {
  start: number;
  weekday: string;
  date: string;
  today: boolean;
  future: boolean;
  /** Charles was open that day (an interval was recorded); false: no measurement, not zero */
  measured: boolean;
  computer: number | null;
  active: number | null;
  turns: number | null;
  aiSeconds: number | null;
};
export type Summary = {
  period: 'current' | 'previous';
  start: number;
  end: number;
  range: string;
  /** nothing measured and no request recorded in the range */
  empty: boolean;
  /** measuring began inside the range: days before it are unknown */
  partialSince: string | null;
  computer: { total: number | null; active: number | null; idle: number | null; max: number };
  ai: {
    /** false: Charles was never open in the range, so a zero would be a guess */
    known: boolean;
    turns: number | null;
    seconds: number | null;
    sessions: number | null;
    files: number | null;
    added: number | null;
    removed: number | null;
    commands: number | null;
    permissions: number | null;
    longest: number | null;
    busiestDay: string | null;
    max: number;
    models: { name: string; turns: number; share: number }[];
  };
  days: Day[];
  apps: { name: string; seconds: number; activeSeconds: number; share: number }[];
  otherApps: { count: number; seconds: number } | null;
  enabled: boolean;
};

const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** v: what `weekly-read` answers. now: for "today". apps: how many apps are listed by name. */
export function shapeSummary(v: any, lang: Language, now = Date.now(), appsShown = 6): Summary {
  const period = v?.period === 'previous' ? 'previous' : 'current';
  const start = num(v?.start);
  const end = num(v?.end) || now;
  const rawDays: any[] = Array.isArray(v?.days) ? v.days : [];
  const cDays: any[] = Array.isArray(v?.computerDays) ? v.computerDays : [];
  const turns = num(v?.turns);
  // older main processes did not send computerMeasured: then a recorded second counts as measured
  const computerMeasured = typeof v?.computerMeasured === 'boolean' ? v.computerMeasured : num(v?.computerSeconds) > 0;
  const aiKnown = computerMeasured || turns > 0;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const days: Day[] = rawDays.slice(0, 7).map((d, i) => {
    const c = cDays[i];
    const future = !!d.future;
    const measured = !future && !!c?.measured;
    // a request needs Charles open, so a day with requests was measured for them even without intervals
    const dayTurns = num(d.turns);
    const aiDay = !future && (measured || dayTurns > 0);
    return {
      start: num(d.start),
      weekday: weekdayShort(num(d.start), lang),
      date: dayLabel(num(d.start), lang),
      today: num(d.start) === +todayStart,
      future,
      measured,
      computer: measured ? num(c.computerSeconds) : null,
      active: measured ? num(c.activeSeconds) : null,
      turns: aiDay ? dayTurns : null,
      aiSeconds: aiDay ? num(d.seconds) : null,
    };
  });
  const computerTotal = computerMeasured ? num(v?.computerSeconds) : null;
  const computerActive = computerMeasured ? num(v?.activeSeconds) : null;
  const since = num(v?.computerTrackingSince);
  // the first day that has a measurement, when measuring began inside this range
  const partialSince = since > start && since < end ? dayLabel(since, lang) : null;
  const models: any[] = Array.isArray(v?.models) ? v.models : v?.topAgent ? [{ model: v.topAgent, turns }] : [];
  const apps: any[] = Array.isArray(v?.apps) ? v.apps : [];
  const appsTotal = apps.reduce((s, a) => s + num(a.seconds), 0) || 1;
  const shown = apps.slice(0, appsShown);
  const rest = apps.slice(appsShown);
  const ai = aiKnown;
  const pick = (x: any) => (ai ? num(x) : null);
  return {
    period,
    start,
    end,
    range: rangeLabel(start, Math.min(end, now), lang),
    empty: !computerMeasured && turns === 0 && !apps.length,
    partialSince,
    computer: {
      total: computerTotal,
      active: computerActive,
      idle: computerTotal === null || computerActive === null ? null : Math.max(0, computerTotal - computerActive),
      max: niceMax(Math.max(0, ...days.map((d) => d.computer || 0)), HOUR_STEPS),
    },
    ai: {
      known: ai,
      turns: pick(turns),
      seconds: pick(v?.seconds),
      sessions: pick(v?.sessions),
      files: pick(v?.files),
      added: pick(v?.added),
      removed: pick(v?.removed),
      commands: pick(v?.commands),
      permissions: pick(v?.permissions),
      // a longest chat and a busiest day exist only once there was a request
      longest: turns > 0 ? num(v?.longestSeconds) : null,
      busiestDay: turns > 0 && typeof v?.busiestDay === 'string' ? dayLabel(+new Date(v.busiestDay + 'T12:00:00'), lang) : null,
      max: niceMax(Math.max(0, ...days.map((d) => d.turns || 0)), COUNT_STEPS),
      models: models
        .filter((m) => num(m.turns) > 0)
        .map((m) => ({ name: String(m.model || 'GPT'), turns: num(m.turns), share: turns ? num(m.turns) / turns : 0 })),
    },
    days,
    apps: shown.map((a) => ({ name: String(a.name || ''), seconds: num(a.seconds), activeSeconds: num(a.activeSeconds), share: num(a.seconds) / appsTotal })),
    otherApps: rest.length ? { count: rest.length, seconds: rest.reduce((s, a) => s + num(a.seconds), 0) } : null,
    enabled: v?.enabled !== false,
  };
}
