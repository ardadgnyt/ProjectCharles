// Companion logic: foreground app, AI suggestion frequency, weather coordination.
const path = require('node:path');
const { Agent } = require('../ai/agent.cjs');
const { Foreground } = require('../system/foreground.cjs');
const { Weather } = require('./weather.cjs');
function localSuggestion(app) {
  const n = app.toLowerCase();
  if (/code|devenv|idea|pycharm/.test(n))
    return 'Kod üzerinde misin? Bir hatayı birlikte inceleyebiliriz.';
  if (/winword|acrobat|pdf|foxit/.test(n))
    return 'Belgeden bir bölümü bana bırak; birlikte açıklayalım.';
  if (/excel/.test(n)) return 'Bir formül veya tabloyu birlikte kontrol edebiliriz.';
  if (/chrome|msedge|firefox|brave/.test(n)) return 'Bir paragrafı seçip üzerime bırakabilirsin.';
  if (/spotify/.test(n)) return 'Müziğine eşlik edeyim; istersen bir odak sayacı başlatalım.';
  return 'Hazırım. Birlikte ne yapalım?';
}
class Companion {
  constructor({ root, prefs, send, eligible, model, demo = false }) {
    Object.assign(this, { root, prefs, send, eligible, model, demo });
    this.foreground = new Foreground();
    this.weather = new Weather();
    this.app = '';
    this.changedAt = Date.now();
    this.started = Date.now();
    this.result = null;
    this.weatherValue = null;
    this.weatherNext = 0;
    this.inflight = false;
    this.agent = null;
    this.timer = null;
    this.stopped = false;
  }
  snapshot() {
    return {
      app: this.prefs.data.observeApps ? this.app : '',
      suggestion: this.result?.app === this.app ? this.result.text : localSuggestion(this.app),
      ai: !!(this.result?.app === this.app),
      weather: this.weatherValue,
      preferences: this.prefs.data,
    };
  }
  start() {
    this.timer = setInterval(() => void this.tick(), 5000);
    void this.tick();
  }
  async tick() {
    if (this.stopped || this.inflight) return;
    this.inflight = true;
    try {
      if (this.prefs.data.observeApps && !this.demo) {
        const r = await this.foreground.read();
        const name = r?.app || '';
        if (
          name &&
          !/^(electron|codex|chatgpt|powershell|pwsh|lockapp|credentialuibroker)$/i.test(name) &&
          name !== this.app
        ) {
          this.app = name.slice(0, 80);
          this.changedAt = Date.now();
          this.result = null;
        }
      } else {
        this.app = '';
        this.foreground.stop();
      }
      if (Date.now() > this.weatherNext) {
        this.weatherNext = Date.now() + 20 * 60000;
        try {
          this.weatherValue = await this.weather.current(this.prefs.data.city);
        } catch {
          this.weatherValue = {
            text: 'Hava durumu şu an alınamıyor',
            source: 'Open-Meteo',
          };
        }
      }
      this.send(this.snapshot());
      if (this.canSuggest()) void this.suggest();
    } finally {
      this.inflight = false;
    }
  }
  canSuggest(now = Date.now()) {
    const p = this.prefs.data,
      u = p.usage;
    const day = new Date(now).toLocaleDateString('en-CA');
    return (
      !this.demo &&
      !this.agent &&
      p.setup &&
      p.observeApps &&
      p.aiSuggestions &&
      !!this.app &&
      this.eligible() &&
      now - this.started >= 60000 &&
      now - this.changedAt >= 60000 &&
      now - (u.last || 0) >= 15 * 60000 &&
      (u.day !== day || u.count < 8) &&
      this.result?.app !== this.app
    );
  }
  async suggest() {
    if (!this.canSuggest()) return;
    const app = this.app,
      p = this.prefs.data;
    const day = new Date().toLocaleDateString('en-CA');
    p.usage = {
      day,
      count: (p.usage.day === day ? p.usage.count : 0) + 1,
      last: Date.now(),
    };
    this.prefs.save();
    const agent = new Agent(this.root);
    this.agent = agent;
    let answer = '';
    let timer;
    let resolveTurn;
    const done = new Promise((resolve) => (resolveTurn = resolve));
    agent.on('event', (e) => {
      if (e.type === 'error' || e.type === 'disconnected') resolveTurn(false);
      if (e.type === 'agent') {
        const { method, params } = e.data;
        if (method === 'item/completed' && params.item.type === 'agentMessage')
          answer = params.item.text || answer;
        if (method === 'turn/completed') resolveTurn(params.turn.status === 'completed');
      }
    });
    try {
      timer = setTimeout(() => {
        resolveTurn(false);
        agent.stop();
      }, 45000);
      await agent.connect();
      if (
        this.stopped ||
        this.agent !== agent ||
        !this.prefs.data.aiSuggestions ||
        !this.prefs.data.observeApps
      )
        return;
      await agent.send({
        cwd: this.root,
        model: this.model() || null,
        mode: 'chat',
        access: 'ask',
        prompt:
          'Yalnızca tek kısa Türkçe öneri üret (en fazla 100 karakter). Kullanıcının açık uygulama adı: ' +
          JSON.stringify(app) +
          '. Ekran içeriğini bilmiyorsun. İçeriği gördüğünü iddia etme. Araç çağırma, web veya dosya okuma. Charles masaüstü asistanı olarak yapılabilecek bir iş öner.',
      });
      const ok = await done;
      if (ok && answer && this.app === app && this.prefs.data.aiSuggestions) {
        this.result = { app, text: answer.replace(/\s+/g, ' ').slice(0, 180) };
        this.send(this.snapshot());
      }
    } catch {
    } finally {
      clearTimeout(timer);
      agent.stop();
      if (this.agent === agent) this.agent = null;
    }
  }
  refresh({ weather = true } = {}) {
    if (weather) {
      this.weatherNext = 0;
      this.weatherValue = null;
    }
    if (!this.prefs.data.aiSuggestions) {
      this.agent?.stop();
      this.agent = null;
      this.result = null;
    }
    if (!this.prefs.data.observeApps) {
      this.app = '';
      this.foreground.stop();
      this.result = null;
    }
    this.send(this.snapshot());
    void this.tick();
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.foreground.stop();
    this.agent?.stop();
    this.agent = null;
  }
}
module.exports = { Companion, localSuggestion };
