// v0.7.2: public holidays and special days of the country that goes with the interface
// language (tr → Türkiye, en → United States, de → Germany, fr → France, es → Spain,
// zh → China). Names stay in that country's language. Lunar holidays are listed for
// 2025–2028; the others are calculated for any year.
import { easterDate } from '../vendor/slime/wardrobe';

export type Holiday = { date: string; name: string; off: boolean };

const iso = (y: number, m: number, d: number) =>
  y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const shift = (y: number, m: number, d: number, days: number) => {
  const t = new Date(y, m - 1, d + days);
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
};
/** n-th weekday (0 = Sunday) of a month; n = -1 → the last one. */
function nth(y: number, m: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(y, m - 1, 1).getDay();
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(y, m, 0).getDate();
  const last = new Date(y, m - 1, lastDay).getDay();
  return iso(y, m, lastDay - ((last - weekday + 7) % 7));
}
const span = (start: string, days: number, name: string, off = true, zh = false): Holiday[] => {
  const [y, m, d] = start.split('-').map(Number);
  const day = (i: number) => (zh ? `（第${i + 1}天）` : ` (${i + 1}. gün)`);
  return Array.from({ length: days }, (_, i) => ({ date: shift(y, m, d, i), name: days > 1 ? name + day(i) : name, off }));
};

const TR_RAMAZAN: Record<number, string> = { 2025: '2025-03-30', 2026: '2026-03-20', 2027: '2027-03-09', 2028: '2028-02-26' };
const TR_KURBAN: Record<number, string> = { 2025: '2025-06-06', 2026: '2026-05-27', 2027: '2027-05-16', 2028: '2028-05-05' };
const CN_SPRING: Record<number, string> = { 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26' };
const CN_QINGMING: Record<number, string> = { 2025: '2025-04-04', 2026: '2026-04-05', 2027: '2027-04-05', 2028: '2028-04-04' };
const CN_DRAGON: Record<number, string> = { 2025: '2025-05-31', 2026: '2026-06-19', 2027: '2027-06-09', 2028: '2028-05-28' };
const CN_MOON: Record<number, string> = { 2025: '2025-10-06', 2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03' };

export function holidays(year: number, lang: string): Holiday[] {
  const [em, ed] = easterDate(year);
  const easter = (days: number) => shift(year, em, ed, days);
  const h = (date: string, name: string, off = true): Holiday => ({ date, name, off });
  const list: Holiday[] = [];
  switch (lang) {
    case 'tr': {
      list.push(
        h(iso(year, 1, 1), 'Yılbaşı'),
        h(iso(year, 2, 14), 'Sevgililer Günü', false),
        h(iso(year, 4, 23), 'Ulusal Egemenlik ve Çocuk Bayramı'),
        h(iso(year, 5, 1), 'Emek ve Dayanışma Günü'),
        h(nth(year, 5, 0, 2), 'Anneler Günü', false),
        h(iso(year, 5, 19), 'Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
        h(nth(year, 6, 0, 3), 'Babalar Günü', false),
        h(iso(year, 7, 15), 'Demokrasi ve Millî Birlik Günü'),
        h(iso(year, 8, 30), 'Zafer Bayramı'),
        h(iso(year, 10, 29), 'Cumhuriyet Bayramı'),
        h(iso(year, 11, 10), 'Atatürk’ü Anma Günü', false),
        h(iso(year, 11, 24), 'Öğretmenler Günü', false),
      );
      if (TR_RAMAZAN[year]) list.push(...span(TR_RAMAZAN[year], 3, 'Ramazan Bayramı'));
      if (TR_KURBAN[year]) list.push(...span(TR_KURBAN[year], 4, 'Kurban Bayramı'));
      break;
    }
    case 'en':
      list.push(
        h(iso(year, 1, 1), 'New Year’s Day'),
        h(nth(year, 1, 1, 3), 'Martin Luther King Jr. Day'),
        h(iso(year, 2, 14), 'Valentine’s Day', false),
        h(nth(year, 2, 1, 3), 'Presidents’ Day'),
        h(easter(0), 'Easter', false),
        h(nth(year, 5, 0, 2), 'Mother’s Day', false),
        h(nth(year, 5, 1, -1), 'Memorial Day'),
        h(nth(year, 6, 0, 3), 'Father’s Day', false),
        h(iso(year, 6, 19), 'Juneteenth'),
        h(iso(year, 7, 4), 'Independence Day'),
        h(nth(year, 9, 1, 1), 'Labor Day'),
        h(nth(year, 10, 1, 2), 'Columbus Day'),
        h(iso(year, 10, 31), 'Halloween', false),
        h(iso(year, 11, 11), 'Veterans Day'),
        h(nth(year, 11, 4, 4), 'Thanksgiving'),
        h(iso(year, 12, 25), 'Christmas Day'),
        h(iso(year, 12, 31), 'New Year’s Eve', false),
      );
      break;
    case 'de':
      list.push(
        h(iso(year, 1, 1), 'Neujahr'),
        h(iso(year, 2, 14), 'Valentinstag', false),
        h(easter(-2), 'Karfreitag'),
        h(easter(0), 'Ostersonntag', false),
        h(easter(1), 'Ostermontag'),
        h(iso(year, 5, 1), 'Tag der Arbeit'),
        h(nth(year, 5, 0, 2), 'Muttertag', false),
        h(easter(39), 'Christi Himmelfahrt'),
        h(easter(50), 'Pfingstmontag'),
        h(iso(year, 10, 3), 'Tag der Deutschen Einheit'),
        h(iso(year, 12, 24), 'Heiligabend', false),
        h(iso(year, 12, 25), '1. Weihnachtstag'),
        h(iso(year, 12, 26), '2. Weihnachtstag'),
        h(iso(year, 12, 31), 'Silvester', false),
      );
      break;
    case 'fr':
      list.push(
        h(iso(year, 1, 1), 'Jour de l’an'),
        h(iso(year, 2, 14), 'Saint-Valentin', false),
        h(easter(1), 'Lundi de Pâques'),
        h(iso(year, 5, 1), 'Fête du Travail'),
        h(iso(year, 5, 8), 'Victoire 1945'),
        h(easter(39), 'Ascension'),
        h(easter(50), 'Lundi de Pentecôte'),
        h(nth(year, 5, 0, -1), 'Fête des mères', false),
        h(iso(year, 7, 14), 'Fête nationale'),
        h(iso(year, 8, 15), 'Assomption'),
        h(iso(year, 11, 1), 'Toussaint'),
        h(iso(year, 11, 11), 'Armistice 1918'),
        h(iso(year, 12, 25), 'Noël'),
      );
      break;
    case 'es':
      list.push(
        h(iso(year, 1, 1), 'Año Nuevo'),
        h(iso(year, 1, 6), 'Epifanía del Señor'),
        h(iso(year, 2, 14), 'San Valentín', false),
        h(easter(-3), 'Jueves Santo', false),
        h(easter(-2), 'Viernes Santo'),
        h(iso(year, 5, 1), 'Fiesta del Trabajo'),
        h(nth(year, 5, 0, 1), 'Día de la Madre', false),
        h(iso(year, 8, 15), 'Asunción de la Virgen'),
        h(iso(year, 10, 12), 'Fiesta Nacional de España'),
        h(iso(year, 11, 1), 'Todos los Santos'),
        h(iso(year, 12, 6), 'Día de la Constitución'),
        h(iso(year, 12, 8), 'Inmaculada Concepción'),
        h(iso(year, 12, 25), 'Navidad'),
      );
      break;
    case 'zh':
      list.push(h(iso(year, 1, 1), '元旦'), h(iso(year, 5, 1), '劳动节'), ...span(iso(year, 10, 1), 3, '国庆节', true, true));
      if (CN_SPRING[year]) {
        list.push(...span(CN_SPRING[year], 3, '春节', true, true));
        const [y, m, d] = CN_SPRING[year].split('-').map(Number);
        list.push(h(shift(y, m, d, -1), '除夕'), h(shift(y, m, d, 14), '元宵节', false));
      }
      if (CN_QINGMING[year]) list.push(h(CN_QINGMING[year], '清明节'));
      if (CN_DRAGON[year]) list.push(h(CN_DRAGON[year], '端午节'));
      if (CN_MOON[year]) list.push(h(CN_MOON[year], '中秋节'));
      break;
  }
  // "(1. gün)" is Turkish: other languages just repeat the name
  return lang === 'tr' ? list : list.map((x) => ({ ...x, name: x.name.replace(/ \(\d+\. gün\)$/, '') }));
}

export function holidaysBetween(from: Date, to: Date, lang: string): Holiday[] {
  const out: Holiday[] = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) out.push(...holidays(y, lang));
  const a = iso(from.getFullYear(), from.getMonth() + 1, from.getDate());
  const b = iso(to.getFullYear(), to.getMonth() + 1, to.getDate());
  return out.filter((x) => x.date >= a && x.date <= b).sort((x, y) => x.date.localeCompare(y.date));
}
