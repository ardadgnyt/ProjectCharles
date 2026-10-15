export function wave(chunks: Float32Array[]) {
  const n = chunks.reduce((s, c) => s + c.length, 0),
    bytes = new Uint8Array(44 + n * 2),
    v = new DataView(bytes.buffer);
  const str = (p: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, bytes.length - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  let i = 44;
  for (const c of chunks)
    for (const value of c) {
      const x = Math.max(-1, Math.min(1, value));
      v.setInt16(i, x * (x < 0 ? 32768 : 32767), true);
      i += 2;
    }
  return bytes;
}
export function wakeUI(api: any, busy: () => boolean, notice: (s: string) => void) {
  const section = document.createElement('section');
  section.className = 'setting-section';
  section.innerHTML =
    '<h3>Hey Charles</h3><label><input type="checkbox" id="wake-enabled"> Hey Charles diyerek sesli görüşmeyi başlat</label><p class="hint">Uyandırma sözü bilgisayarında aranır. Özellik açıkken mikrofon dinlemede kalır. “Hey Charles” dedikten sonra panelin açılmasını bekleyip konuş. Gemini Live seçiliyse sonraki görüşme Google’a gönderilir.</p><p id="wake-status" class="hint" role="status"></p>';
  document.querySelector('.settings-page[data-category=general]')!.append(section);
  const toggle = document.getElementById('wake-enabled') as HTMLInputElement,
    note = document.getElementById('wake-status')!;
  let enabled = false,
    paused = false,
    starting = false,
    stream: MediaStream | null = null,
    ctx: AudioContext | null = null,
    source: MediaStreamAudioSourceNode | null = null,
    processor: ScriptProcessorNode | null = null,
    gain: GainNode | null = null,
    epoch = 0,
    checking = false,
    cooldown = 0;
  const mic = document.getElementById('voice-call') as HTMLButtonElement;
  let threshold = 0.008;
  const preferences = () =>
    api
      .companionRead()
      .then(
        (p: any) => (threshold = (p.wakeProfile || p.preferences?.wakeProfile)?.threshold || 0.008),
      );
  void preferences();
  document.addEventListener('wake-trained', () => void preferences());
  document.addEventListener('wake-training', stop);
  document.addEventListener('mic-privacy-off', stop);
  const occupied = () =>
    document.body.dataset.micOff === 'true' ||
    document.body.dataset.wakeTraining === 'true' ||
    busy() ||
    document.body.dataset.liveVoice === 'active' ||
    document.body.dataset.voicePhase === 'recording' ||
    document.body.dataset.voicePhase === 'transcribing' ||
    mic.disabled ||
    mic.getAttribute('aria-pressed') === 'true' ||
    document.body.dataset.voicePhase === 'speaking';
  function stop() {
    epoch++;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      processor = null;
    }
    source?.disconnect();
    gain?.disconnect();
    source = null;
    gain = null;
    void ctx?.close();
    ctx = null;
    void api.wakeStop();
    note.textContent =
      document.body.dataset.micOff === 'true'
        ? 'Mikrofon kapalı · üstteki mikrofon simgesinden açabilirsin'
        : enabled
          ? 'Uyandırma dinlemesi beklemede.'
          : 'Kapalı';
  }
  async function start() {
    if (!enabled || paused || starting || stream || occupied() || Date.now() < cooldown) return;
    starting = true;
    const token = ++epoch;
    try {
      await api.wakeArm();
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (token !== epoch) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.resume();
      if (token !== epoch) return;
      if (ctx.sampleRate !== 16000) throw Error('16 kHz mikrofon kaydı açılamadı.');
      source = ctx.createMediaStreamSource(s);
      processor = ctx.createScriptProcessor(4096, 1, 1);
      gain = ctx.createGain();
      gain.gain.value = 0;
      let chunks: Float32Array[] = [],
        silent = 0,
        noise = 0.003;
      processor.onaudioprocess = (e) => {
        if (token !== epoch || checking || occupied()) return;
        const a = e.inputBuffer.getChannelData(0),
          rms = Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
        if (!chunks.length) {
          noise = noise * 0.98 + Math.min(rms, 0.015) * 0.02;
          if (rms < Math.max(threshold, noise * 2)) return;
        }
        chunks.push(a.slice());
        silent = rms < Math.max(0.006, noise * 1.6) ? silent + 1 : 0;
        if (silent < 3 && chunks.length < 16) return;
        const clip = chunks;
        chunks = [];
        silent = 0;
        if (clip.length < 2) return;
        checking = true;
        void api
          .wakeCheck(wave(clip))
          .then(async (hit: boolean) => {
            if (hit && token === epoch && !occupied()) {
              stop();
              cooldown = Date.now() + 5000;
              await api.expand(true);
              await new Promise((r) => setTimeout(r, 400));
              if (enabled && !paused && !occupied()) {
                notice('Hey Charles duydum. Konuşabilirsin.');
                mic.click();
              }
            }
          })
          .catch(() => {})
          .finally(() => (checking = false));
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);
      note.textContent = 'Hey Charles için mikrofon dinleniyor · yerel';
    } catch (e) {
      if (token === epoch) {
        stop();
        cooldown = Date.now() + 30000;
        note.textContent = (e as Error).message;
      }
    } finally {
      starting = false;
    }
  }
  toggle.onchange = async () => {
    enabled = toggle.checked;
    try {
      await api.wakeEnable(enabled);
      if (enabled) await start();
      else stop();
    } catch (e) {
      enabled = false;
      toggle.checked = false;
      stop();
      notice((e as Error).message);
    }
  };
  void api.companionRead().then((p: any) => {
    enabled = !!(p.wakeEnabled ?? p.preferences?.wakeEnabled);
    toggle.checked = enabled;
    void start();
  });
  mic.addEventListener(
    'pointerdown',
    () => {
      if (stream) {
        stop();
        cooldown = Date.now() + 3000;
      }
    },
    true,
  );
  window.setInterval(() => {
    if (occupied() && stream) stop();
    else void start();
  }, 1000);
  api.onPowerPaused((v: boolean) => {
    paused = v;
    if (v) stop();
    else void start();
  });
  window.addEventListener('beforeunload', stop);
}
