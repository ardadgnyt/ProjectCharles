// v0.7.4: "Evin içi kaç derece?", "Nem oranı ne?", "Salon kaç derece?" — answered from the
// Home Assistant sensors and thermostats (typed or spoken), instead of the AI saying it has
// no access. Read-only; nothing is changed in Home Assistant.

function norm(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[’']/g, '')
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TEMP = /\b(kac derece|derece|sicaklik|sicak mi|soguk mu|isi|temperature|how warm|how cold|how hot|degrees)\b/;
const HUMID = /\b(nem|nemi|nem orani|rutubet|humidity|humid)\b/;
const INSIDE = /\b(ev|evin|evde|evdeki|evimin|evimde|ic|ici|icerisi|iceride|icerde|oda|odanin|odada|salon|salonun|salonda|mutfak|mutfagin|mutfakta|yatak odasi|banyo|banyonun|cocuk odasi|calisma odasi|home|house|inside|indoor|indoors|room|living room|bedroom|kitchen|bathroom|termostat|thermostat|sensor|sensoru|sensorun)\b/;
const OUTSIDE = /\b(disari|disarisi|disarida|hava durumu|hava nasil|yarin|outside|outdoor|weather|forecast)\b/;

/** → { temperature, humidity, words } when the text asks about the climate at home, else null. */
function climateQuestion(text) {
  const q = norm(text);
  if (!q || q.length > 200) return null;
  const temperature = TEMP.test(q);
  const humidity = HUMID.test(q);
  if (!temperature && !humidity) return null;
  if (OUTSIDE.test(q)) return null;
  // "nem oranı ne?" is about the home; a bare temperature question may be about the weather
  if (!INSIDE.test(q) && !(humidity && !temperature)) return null;
  // set/change requests ("klimayı 22 dereceye ayarla") are not questions
  if (/\b(ayarla|yap|cek|dusur|artir|yukselt|set|change|turn)\b/.test(q) && !/\b(kac|ne|nedir|mi|mu|what|how)\b/.test(q))
    return null;
  return { temperature, humidity, words: q.split(' ') };
}

const num = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const isBad = (r) => ['unavailable', 'unknown', ''].includes(String(r.text ?? ''));

/** Temperature and humidity readings from Home Assistant rows (sensors and climate devices). */
function readings(rows) {
  const temp = [];
  const humid = [];
  for (const r of rows || []) {
    const id = String(r.id || '');
    const cls = String(r.deviceClass || '');
    const unit = String(r.unit || '');
    if (id.startsWith('climate.')) {
      const t = num(r.attrs?.current_temperature);
      const h = num(r.attrs?.current_humidity);
      if (t !== null) temp.push({ id, title: r.title, value: t, unit: r.attrs?.temperature_unit || '°C', thermostat: true });
      if (h !== null) humid.push({ id, title: r.title, value: h, unit: '%' });
      continue;
    }
    if (!id.startsWith('sensor.') || isBad(r)) continue;
    const v = num(r.text);
    if (v === null) continue;
    if (cls === 'temperature' || /^°\s?[CF]?$/.test(unit.trim())) {
      if (v > -40 && v < 70) temp.push({ id, title: r.title, value: v, unit: unit || '°C' });
    } else if (cls === 'humidity' || (unit === '%' && /nem|humid|rutubet/i.test(id + ' ' + r.title))) {
      if (v >= 0 && v <= 100) humid.push({ id, title: r.title, value: v, unit: '%' });
    }
  }
  // outdoor sensors (e.g. "Dış sıcaklık", weather integrations) do not answer "inside"
  // v0.7.4 fix: "hava" (air) is a normal word in Turkish device names ("Hava Sıkıcı Sıcaklık",
// "hava temizleyici"); it no longer marks a sensor as outdoor.
const OUTDOOR = /(^|[\s_.])(dis|disari|outdoor|outside|exterior|balkon|bahce|garden|weather|openweather|met_no|meteo)([\s_.]|$)/;
function isOutdoor(x) {
  return OUTDOOR.test(norm(x.title) + ' ' + String(x.id).toLowerCase());
}
  return { temp: temp.filter((x) => !isOutdoor(x)), humid: humid.filter((x) => !isOutdoor(x)), outdoor: [...temp, ...humid].filter(isOutdoor) };
}

/** Rows that match a room named in the question ("salon kaç derece"), if any. */
function inRoom(list, words) {
  const skip = new Set(['sicak', 'soguk', 'mi', 'mu', 'nemi', 'warm', 'cold', 'hot', 'humidity', 'temperature', 'ev', 'evin', 'evde', 'evdeki', 'ic', 'ici', 'icerisi', 'kac', 'derece', 'nem', 'orani', 'ne', 'nedir', 'su', 'an', 'sicaklik', 'home', 'house', 'inside', 'the', 'is', 'what', 'how', 'in', 'mi', 'mu', 'sensor', 'sensoru']);
  const keys = words.filter((w) => w.length > 2 && !skip.has(w)).map((w) => w.replace(/(nin|nun|in|un|da|de|ta|te|daki|deki)$/, ''));
  if (!keys.length) return [];
  return list.filter((x) => {
    const t = norm(x.title) + ' ' + x.id.toLowerCase();
    return keys.some((k) => k.length > 2 && t.includes(k));
  });
}

const fmt = (v, en) => (Math.round(v * 10) / 10).toLocaleString(en ? 'en-GB' : 'tr-TR');

/** The answer text. `en`: answer in English. */
function climateAnswer(rows, ask, en = false) {
  const { temp, humid } = readings(rows);
  const pick = (list) => {
    const room = inRoom(list, ask.words);
    return room.length ? room : list;
  };
  const tVal = (x) => `${fmt(x.value, en)} ${x.unit === '°F' ? '°F' : '°C'}`;
  // "%48" in Turkish, "48%" in English
  const hVal = (x) => (en ? `${fmt(x.value, en)}%` : `%${fmt(x.value, en)}`);
  const line = (list, label, val) => {
    if (list.length === 1) return `${label} ${val(list[0])} (${list[0].title})`;
    const avg = { ...list[0], value: list.reduce((s, x) => s + x.value, 0) / list.length };
    const each = list.slice(0, 5).map((x) => `${x.title}: ${val(x)}`).join(', ');
    return `${label} ${en ? 'about' : 'ortalama'} ${val(avg)} — ${each}`;
  };
  const parts = [];
  const wantT = ask.temperature || !ask.humidity;
  if (wantT) {
    const list = pick(temp);
    if (list.length) parts.push(line(list, en ? 'Inside it is' : 'Evin içi şu an', tVal));
  }
  // a temperature question also gets the humidity when there is a sensor for it
  if (ask.humidity || (wantT && parts.length)) {
    const list = pick(humid);
    if (list.length) parts.push(line(list, en ? 'Humidity is' : 'Nem oranı', hVal));
  }
  if (!parts.length) {
    const what = ask.humidity && !ask.temperature ? (en ? 'humidity' : 'nem') : en ? 'temperature' : 'sıcaklık';
    return en
      ? `I can't find an indoor ${what} sensor or thermostat in Home Assistant. Check that it is in Home Assistant and has a ${what} value.`
      : `Home Assistant’ta evin içi için bir ${what} sensörü veya termostat bulamadım. Cihazın Home Assistant’ta göründüğünü ve ${what} değeri verdiğini kontrol et.`;
  }
  return parts.join('. ') + '.';
}

/**
 * v0.7.4: for questions the shortcut above does not catch ("hava sıkıcı ölçüyor sıcaklık ve nem
 * değerlerini"), the AI gets the current readings so it does not claim it has no access.
 */
const MENTION = /\b(sicaklik|sicakligi|derece|nem|nemi|rutubet|sensor|sensoru|sensorler|termostat|termometre|klima|hava temizleyici|hava sikici|temperature|humidity|thermostat|sensor)\b/;
function mentionsClimate(text) {
  return MENTION.test(norm(text));
}
function homeContext(rows) {
  const { temp, humid, outdoor } = readings(rows);
  const line = (x) => `- ${x.title} (${x.id}): ${String(Math.round(x.value * 10) / 10).replace('.', ',')} ${x.unit === '%' ? '%' : x.unit === '°F' ? '°F' : '°C'}`;
  const inside = [...temp, ...humid].map(line);
  const out = outdoor.map(line);
  if (!inside.length && !out.length) return '';
  return (
    (inside.length ? 'İç mekân:\n' + inside.join('\n') : '') +
    (out.length ? (inside.length ? '\n' : '') + 'Dış mekân:\n' + out.join('\n') : '')
  );
}

module.exports = { climateQuestion, climateAnswer, readings, mentionsClimate, homeContext };
