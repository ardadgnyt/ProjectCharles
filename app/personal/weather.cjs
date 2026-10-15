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
module.exports = { Weather, describe };
