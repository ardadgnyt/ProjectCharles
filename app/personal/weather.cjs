// Open-Meteo city search and forecast with a time-limited cache.
function describe(code) {
  if (code === 0) return 'Açık ☀️';
  if (code <= 3) return 'Parçalı bulutlu 🌤️';
  if (code <= 48) return 'Sisli 🌫️';
  if (code >= 95) return 'Gök gürültülü ⛈️';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'Karlı ❄️';
  return 'Yağışlı 🌧️';
}
class Weather {
  constructor(fetcher = fetch) {
    this.fetch = fetcher;
    this.cached = null;
    this.pending = null;
    this.forecastCache = null;
  }
  /**
   * v0.8.14: the next five days for the weather sheet (Open-Meteo, cached for 30 minutes):
   * { city, current: { temp, feels, humidity, wind, code, text, emoji }, days: [{ date, code,
   * text, emoji, max, min, rain }] }
   */
  async forecast(city) {
    if (!city || !Number.isFinite(+city.latitude) || !Number.isFinite(+city.longitude)) return null;
    const key = JSON.stringify(city);
    if (this.forecastCache?.key === key && Date.now() - this.forecastCache.time < 30 * 60000) return this.forecastCache.value;
    const r = await this.json(
      `https://api.open-meteo.com/v1/forecast?latitude=${+city.latitude}&longitude=${+city.longitude}` +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&forecast_days=5&timezone=auto',
    );
    const d = r.daily || {};
    const days = (Array.isArray(d.time) ? d.time : []).slice(0, 5).map((date, i) => {
      const code = Number(d.weather_code?.[i]);
      const [text, emoji] = split(describe(code));
      const num = (v) => (Number.isFinite(v) ? Math.round(v) : null);
      return { date: String(date), code, text, emoji, max: num(d.temperature_2m_max?.[i]), min: num(d.temperature_2m_min?.[i]), rain: num(d.precipitation_probability_max?.[i]) };
    });
    if (!days.length) throw Error('Hava durumu tahmini alınamadı.');
    const c = r.current || {};
    const [text, emoji] = split(describe(Number(c.weather_code)));
    const round = (v) => (Number.isFinite(v) ? Math.round(v) : null);
    const value = {
      city: String(city.name || '').split(',')[0],
      current: { temp: round(c.temperature_2m), feels: round(c.apparent_temperature), humidity: round(c.relative_humidity_2m), wind: round(c.wind_speed_10m), code: Number(c.weather_code), text, emoji },
      days,
      updatedAt: Date.now(),
      source: 'Open-Meteo',
    };
    this.forecastCache = { key, time: Date.now(), value };
    return value;
  }
  async json(url) {
    const r = await this.fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw Error('Hava durumu servisine ulaşılamadı.');
    return r.json();
  }
  async cities(query) {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80)
      throw Error('En az iki harfli bir şehir/ilçe yaz.');
    const r = await this.json(
      'https://geocoding-api.open-meteo.com/v1/search?count=8&language=tr&name=' +
        encodeURIComponent(query.trim()),
    );
    return (r.results || []).map((c) => ({
      name: [c.name, c.admin1, c.country].filter(Boolean).join(', '),
      latitude: c.latitude,
      longitude: c.longitude,
    }));
  }
  async current(city) {
    if (!city) return null;
    const key = JSON.stringify(city);
    if (this.cached?.key === key && Date.now() - this.cached.time < 20 * 60000)
      return this.cached.value;
    if (this.pending?.key === key) return this.pending.promise;
    const promise = (async () => {
      const r = await this.json(
        `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code&timezone=auto`,
      );
      if (!Number.isFinite(r.current?.temperature_2m)) throw Error('Hava durumu verisi eksik.');
      const value = {
        text: `${city.name.split(',')[0]} · ${Math.round(r.current.temperature_2m)}° · ${describe(r.current.weather_code)}`,
        updatedAt: Date.now(),
        source: 'Open-Meteo',
      };
      this.cached = { key, time: Date.now(), value };
      return value;
    })();
    this.pending = { key, promise };
    try {
      return await promise;
    } finally {
      this.pending = null;
    }
  }
}
/** "Parçalı bulutlu 🌤️" → ["Parçalı bulutlu", "🌤️"] */
function split(described) {
  const i = described.lastIndexOf(' ');
  return [described.slice(0, i), described.slice(i + 1)];
}
module.exports = { Weather, describe };
