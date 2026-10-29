// v0.9.10: short durations and percentages in the UI language. The usage panels (island and app
// window) always wrote "5sa 58dk" and "%58", even with Charles in English.
import { uiLanguage, type Language } from './i18n';

type Units = { d: (n: number) => string; h: (n: number) => string; m: (n: number) => string; s: (n: number) => string; now: string; join: string };
const UNITS: Record<Language, Units> = {
  tr: { d: (n) => n + 'g', h: (n) => n + 'sa', m: (n) => n + 'dk', s: (n) => n + ' sn', now: 'şimdi', join: ' ' },
  en: { d: (n) => n + 'd', h: (n) => n + 'h', m: (n) => n + 'm', s: (n) => n + ' s', now: 'now', join: ' ' },
  de: { d: (n) => n + ' T.', h: (n) => n + ' Std.', m: (n) => n + ' Min.', s: (n) => n + ' s', now: 'jetzt', join: ' ' },
  fr: { d: (n) => n + ' j', h: (n) => n + ' h', m: (n) => n + ' min', s: (n) => n + ' s', now: 'maintenant', join: ' ' },
  es: { d: (n) => n + ' d', h: (n) => n + ' h', m: (n) => n + ' min', s: (n) => n + ' s', now: 'ahora', join: ' ' },
  zh: { d: (n) => n + '天', h: (n) => n + '小时', m: (n) => n + '分钟', s: (n) => n + '秒', now: '现在', join: '' },
};
const units = (lang?: Language) => UNITS[lang || uiLanguage()] || UNITS.tr;

/** "2sa 10dk" / "2h 10m" / "45 dk" → for a number of minutes; zero parts are left out. */
export function shortMinutes(minutes: number, lang?: Language) {
  const u = units(lang);
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return u.now;
  if (total < 60) return lang === 'tr' || (!lang && uiLanguage() === 'tr') ? total + ' dk' : u.m(total);
  const hours = Math.floor(total / 60),
    rest = total % 60;
  if (hours < 24) return [u.h(hours), rest ? u.m(rest) : ''].filter(Boolean).join(u.join);
  const days = Math.floor(hours / 24);
  return [u.d(days), hours % 24 ? u.h(hours % 24) : ''].filter(Boolean).join(u.join);
}

/** A duration in seconds (weekly summary, system cards): "72sa 14dk", "45 sn", "0 dk". */
export function shortSeconds(seconds: number, lang?: Language) {
  const u = units(lang);
  if (!seconds || seconds < 0) return (lang || uiLanguage()) === 'tr' ? '0 dk' : u.m(0);
  if (seconds < 60) return u.s(Math.round(seconds));
  return shortMinutes(Math.floor(seconds / 60), lang);
}

/** "%58" in Turkish, "58%" elsewhere (Chinese, French and German put it the same way as English here). */
export function percent(n: number, lang?: Language) {
  return (lang || uiLanguage()) === 'tr' ? '%' + n : n + '%';
}
