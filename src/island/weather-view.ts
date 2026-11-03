// v0.9.14: the weather view (now, the next hours, five days) — the island's Hava durumu panel
// and the app window's Hava durumu card each have one (src/island/shelf.ts, workspace/dashboard.ts).
import { el, icon } from '../workspace/icons';

const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const button = (cls: string, label: string, ...children: (Node | string)[]) => {
  const b = el('button', cls, ...children);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  return b;
};
const svg = (name: string) => icon(name);

export function weatherView(api: any, pickCity: () => void, sendHeight: () => void = () => {}) {
  const wrap = el('div', 'weather-sheet h13-weather');
  wrap.dataset.kind = 'weather';
  function load() {
    const change = button('weather-change', 'Şehri değiştir', svg('location'));
    change.title = 'Şehri değiştir';
    change.onclick = pickCity;
    if (!wrap.childElementCount) wrap.append(el('p', 'weather-note', 'Tahmin yükleniyor…'));
    void Promise.resolve(api.weatherForecast?.())
      .then((f: any) => {
        if (!f?.city) {
          const choose = button('weather-choose', 'Şehrini seç', svg('location'), el('span', '', 'Şehrini seç'));
          choose.onclick = pickCity;
          wrap.replaceChildren(el('p', 'weather-note', 'Hava durumunu görmek için şehrini seç.'), choose);
          sendHeight();
          return;
        }
        const c = f.current || {};
        const deg = (v: any) => (Number.isFinite(v) ? v + '°' : '—');
        const city = el('strong', 'weather-city', f.city);
        city.translate = false;
        const details = el('div', 'weather-details');
        if (Number.isFinite(c.feels)) details.append(el('span', '', el('small', '', 'Hissedilen'), el('b', '', deg(c.feels))));
        if (Number.isFinite(c.humidity)) details.append(el('span', '', el('small', '', 'Nem'), el('b', '', '%' + c.humidity)));
        if (Number.isFinite(c.wind)) details.append(el('span', '', el('small', '', 'Rüzgâr'), el('b', '', c.wind + ' km/sa')));
        const now = el(
          'div',
          'weather-now',
          el('span', 'weather-now-emoji', c.emoji || '🌤️'),
          el('span', 'weather-now-temp', deg(c.temp)),
          el('span', 'weather-now-text', city, el('small', '', c.text || '')),
          details,
        );
        // the next hours of today
        const hours = el('div', 'weather-hours');
        (Array.isArray(f.hours) ? f.hours : []).slice(0, 7).forEach((h: any, i: number) => {
          // "Şimdi" is the current reading (the same numbers as the box beside it)
          const temp = i === 0 && Number.isFinite(c.temp) ? c.temp : h.temp;
          const cell = el(
            'div',
            'weather-hour' + (i === 0 ? ' now' : ''),
            el('small', 'weather-hour-time', i === 0 ? 'Şimdi' : String(h.time || '')),
            el('span', 'weather-hour-emoji', (i === 0 && c.emoji) || h.emoji || '🌤️'),
            el('b', 'weather-hour-temp', deg(temp)),
          );
          cell.setAttribute('aria-label', `${i === 0 ? 'Şimdi' : h.time}: ${h.text || ''}, ${deg(h.temp)}`);
          hours.append(cell);
        });
        // the city button sits at the top right, next to the hourly title
        const hourly = el('div', 'weather-block weather-block-hours', el('div', 'h13-sec-head', el('small', 'h13-sec-title', 'Bugün · saatlik'), change), hours);
        if (!hours.childElementCount) hours.hidden = true;
        const days = el('div', 'weather-days');
        // today and the next five days
        (f.days || []).slice(0, 6).forEach((d: any, i: number) => {
          const date = new Date(String(d.date) + 'T12:00:00');
          const name = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : DAYS[date.getDay()] || '';
          const day = el(
            'div',
            'weather-day' + (i === 0 ? ' today' : ''),
            el('small', 'weather-day-name', name),
            el(
              'span',
              'weather-day-sky',
              el('span', 'weather-day-emoji', d.emoji || '🌤️'),
              el('small', 'weather-day-rain' + (Number(d.rain) >= 40 ? ' wet' : ''), Number.isFinite(d.rain) && d.rain > 0 ? '%' + d.rain : ''),
            ),
            el('span', 'weather-day-temps', el('b', '', deg(d.max)), el('small', '', deg(d.min))),
          );
          day.setAttribute('aria-label', `${name}: ${d.text || ''}, ${deg(d.max)} / ${deg(d.min)}`);
          days.append(day);
        });
        const daily = el('div', 'weather-block weather-block-days', el('div', 'h13-sec-head', el('small', 'h13-sec-title', '6 günlük')), days);
        wrap.replaceChildren(el('div', 'weather-top', now, hourly), daily);
        sendHeight();
      })
      .catch(() => {
        const retry = button('weather-choose', 'Şehri değiştir', svg('location'), el('span', '', 'Şehri değiştir'));
        retry.onclick = pickCity;
        wrap.replaceChildren(el('p', 'weather-note', 'Hava durumuna şu anda ulaşılamıyor.'), retry);
        sendHeight();
      });
  }
  return { root: wrap, load };
}
