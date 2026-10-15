import { pluginGuideUI } from '../settings/plugin-guide';
import liveVoices from '../../public/live-voices.json';
export function geminiLiveUI(api: any, notice: (s: string) => void, busy: () => boolean) {
  const section = document.createElement('section');
  section.className = 'setting-section';
  section.innerHTML =
    '<h3>Gemini Live · sesli görüşme</h3><p class="hint">Mikrofonla doğrudan Gemini ile konuş. Ses Google’a gönderilir; bilgisayar işlemleri bağlı GPT/Codex hesabına mevcut izin ayarlarınla aktarılır; ücretsiz katmanda içerik ürün geliştirmek için kullanılabilir. Faturalandırması kapalı Free Tier projesi kullan. Anahtarın planı Charles tarafından doğrulanamaz.</p><button type="button" id="live-guide" class="primary">Charles ile kur</button><button type="button" id="live-key-page">AI Studio’da ücretsiz anahtar oluştur</button><input id="live-key" type="password" autocomplete="off" placeholder="Gemini API anahtarı" aria-label="Gemini API anahtarı"><label><input type="checkbox" id="live-free"> Projem Free Tier; faturalandırması kapalı</label><label><input type="checkbox" id="live-enabled"> Mikrofon düğmesinde Gemini Live kullan</label><label for="live-voice">Gemini Live sesi</label><select id="live-voice" aria-label="Gemini Live sesi"></select><p class="hint">Sesi seçip Kaydet’e bas. Yeni ses sonraki görüşmede kullanılır; açık görüşme kaydederken sonlandırılır.</p><button type="button" id="live-save">Kaydet</button><button type="button" id="live-test">Bağlantıyı test et</button><button type="button" id="live-clear">Anahtarı sil</button><p id="live-setting-status" class="hint" role="status"></p>';
  document.querySelector('.settings-page[data-category=account]')!.append(section);
  const $ = (id: string) => document.getElementById(id)!;
  const badge = document.createElement('button');
  badge.id = 'live-call-indicator';
  badge.type = 'button';
  badge.hidden = true;
  badge.setAttribute('aria-label', 'Sesli görüşmeyi bitir');
  document.querySelector('#account')!.before(badge);
  // v0.6.5: the badge also shows the microphone level, so you can see your voice going out.
  const badgeText = document.createElement('span');
  badgeText.className = 'live-call-text';
  const meter = document.createElement('span');
  meter.className = 'live-meter';
  meter.setAttribute('aria-hidden', 'true');
  meter.title = 'Ses seviyen';
  for (let i = 0; i < 7; i++) meter.append(document.createElement('i'));
  badge.append(badgeText, meter);
  const callState = (text: string) => {
    badge.hidden = !text;
    badgeText.textContent = text ? '◉ ' + text : '';
  };
  let level = 0,
    meterFrame = 0;
  const bars = [...meter.children] as HTMLElement[];
  const SHAPE = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45];
  function drawMeter() {
    meterFrame = 0;
    const l = Math.min(1, level);
    bars.forEach((b, i) => {
      const h = Math.max(0.12, Math.min(1, l * SHAPE[i] * (0.85 + Math.random() * 0.3)));
      b.style.transform = `scaleY(${h.toFixed(3)})`;
    });
    meter.classList.toggle('speaking', l > 0.12);
    if (active && level > 0.01) meterFrame = requestAnimationFrame(drawMeter);
  }
  function setLevel(rms: number) {
    // speech RMS is roughly 0.01 (quiet) … 0.2 (loud); map it onto 0…1, smoothed
    const target = Math.min(1, Math.sqrt(rms / 0.12));
    level = target > level ? level * 0.4 + target * 0.6 : level * 0.82 + target * 0.18;
    if (!meterFrame) meterFrame = requestAnimationFrame(drawMeter);
  }
  badge.onclick = () => void stop();
  const key = $('live-key') as HTMLInputElement,
    enabled = $('live-enabled') as HTMLInputElement,
    free = $('live-free') as HTMLInputElement;
  const voice = $('live-voice') as HTMLSelectElement;
  voice.add(new Option('Gemini varsayılanı', ''));
  for (const [id, label] of liveVoices) voice.add(new Option(id + ' · ' + label, id));
  let configured = false,
    selected = false,
    active = false,
    generation = 0,
    stream: MediaStream | null = null,
    input: AudioContext | null = null,
    output: AudioContext | null = null,
    processor: ScriptProcessorNode | null = null,
    source: MediaStreamAudioSourceNode | null = null,
    gain: GainNode | null = null,
    next = 0;
  const playing = new Set<AudioBufferSourceNode>();
  let transcriptTimer: ReturnType<typeof setTimeout>;
  const transcripts: any[] = [];
  function flushTranscripts() {
    clearTimeout(transcriptTimer);
    if (!active) return;
    if (playing.size || (output && next > output.currentTime + 0.01)) {
      transcriptTimer = setTimeout(flushTranscripts, 100);
      return;
    }
    for (const detail of transcripts.splice(0))
      document.dispatchEvent(new CustomEvent('charles-live-transcript', { detail }));
  }

  const mic = $('voice-call') as HTMLButtonElement,
    cancel = $('voice-cancel') as HTMLButtonElement,
    status = $('voice-status');
  const paint = (s: any) => {
    voice.value = s.voice || '';
    configured = s.configured;
    selected = s.enabled;
    enabled.checked = selected;
    free.checked = !!s.freeProject;
    key.placeholder = configured
      ? 'Kayıtlı anahtarı değiştirmek için yenisini gir'
      : 'Gemini API anahtarı';
    $('live-setting-status').textContent =
      s.error ||
      (configured
        ? 'Anahtar Windows şifrelemesiyle kayıtlı. Ücretsiz kota Google hesabına göre değişir.'
        : 'Anahtar eklenmedi. Mevcut yerel ses kullanılacak.');
  };
  void api.liveVoiceStatus().then(paint);
  $('live-key-page').onclick = () => void api.liveVoiceKeyPage();
  // v0.6.5: step-by-step key setup next to Slime, like the Google/Microsoft plugin guides
  const guide = pluginGuideUI(api, notice, paint);
  $('live-guide').onclick = () => void guide('gemini');
  $('live-save').onclick = async () => {
    try {
      paint(
        await api.liveVoiceSave({
          key: key.value.trim(),
          enabled: enabled.checked,
          freeProject: free.checked,
          voice: voice.value,
        }),
      );
      key.value = '';
      await stop();
    } catch (e) {
      $('live-setting-status').textContent = (e as Error).message;
    }
  };
  $('live-test').onclick = async () => {
    if (active || busy()) {
      notice('Önce etkin işlemi bitir.');
      return;
    }
    if (key.value.trim()) {
      $('live-setting-status').textContent =
        'Yeni anahtar henüz kaydedilmedi. Önce Kaydet’e bas, ardından bağlantıyı test et.';
      return;
    }
    const button = $('live-test') as HTMLButtonElement;
    button.disabled = true;
    $('live-setting-status').textContent =
      'Kayıtlı anahtarla bağlantı sınanıyor; mikrofon açılmaz…';
    try {
      const ok = await api.liveVoiceStart();
      if (!ok) throw Error('Bağlantı kurulamadı.');
      $('live-setting-status').textContent =
        'Bağlantı başarılı. Gemini Live sesli görüşmeye hazır.';
    } catch (e) {
      $('live-setting-status').textContent = (e as Error).message;
    } finally {
      await api.liveVoiceStop();
      button.disabled = false;
    }
  };
  $('live-clear').onclick = async () => {
    await stop();
    paint(await api.liveVoiceClear());
    key.value = '';
  };
  function silence() {
    clearTimeout(transcriptTimer);
    transcripts.length = 0;
    for (const s of playing) {
      try {
        s.stop();
      } catch {}
    }
    playing.clear();
    next = output?.currentTime || 0;
  }
  async function stop() {
    generation++;
    active = false;
    document.body.dataset.liveVoice = '';
    callState('');
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      processor = null;
    }
    level = 0;
    for (const b of bars) b.style.transform = '';
    meter.classList.remove('speaking');
    source?.disconnect();
    gain?.disconnect();
    source = null;
    gain = null;
    silence();
    void input?.close();
    void output?.close();
    input = output = null;
    mic.disabled = false;
    mic.setAttribute('aria-pressed', 'false');
    mic.setAttribute('aria-label', 'Konuş');
    cancel.hidden = true;
    status.textContent = '';
    await api.liveVoiceStop();
  }
  document.addEventListener('mic-privacy-off', () => {
    if (active) void stop();
  });
  async function start() {
    if (document.body.dataset.micOff === 'true') {
      notice('Mikrofon kapalı. Üstteki mikrofon simgesinden açabilirsin.');
      return;
    }
    if (busy()) {
      notice('Önce etkin yanıtın tamamlanmasını bekle.');
      return;
    }
    const token = ++generation;
    active = true;
    document.body.dataset.liveVoice = 'active';
    callState('Sesli görüşme · Bağlanıyor');
    // The button stays usable: a second press while connecting cancels the call.
    mic.setAttribute('aria-pressed', 'true');
    mic.setAttribute('aria-label', 'Bağlantıyı iptal et');
    cancel.hidden = false;
    status.textContent = 'Gemini Live bağlanıyor…';
    let early: MediaStream | null = null;
    try {
      output = new AudioContext({ sampleRate: 24000 });
      // Microphone and Gemini connection are prepared in parallel.
      const micReady = api
        .liveVoiceArm()
        .then((armed: boolean) =>
          armed
            ? navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
                video: false,
              })
            : null,
        )
        .catch(() => null)
        .then((s: MediaStream | null) => (early = s));
      const [, connected] = await Promise.all([output.resume(), api.liveVoiceStart()]);
      await micReady;
      if (token !== generation) {
        early?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!connected) throw Error('Gemini bağlantısı tamamlanmadan kapandı.');
      const acquired =
        early ||
        (await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
          video: false,
        }));
      early = null;
      if (token !== generation) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = acquired;
      input = new AudioContext({ sampleRate: 16000 });
      await input.resume();
      if (token !== generation) return;
      if (input.sampleRate !== 16000) throw Error('16 kHz mikrofon kaydı başlatılamadı.');
      source = input.createMediaStreamSource(stream);
      // v0.6.5: 64 ms chunks (was 256 ms) and nothing is dropped while a chunk is still being
      // sent — chunks wait in a queue and go out together. Dropped audio made Gemini notice
      // the start and the end of what you said late.
      processor = input.createScriptProcessor(1024, 1, 1);
      gain = input.createGain();
      gain.gain.value = 0;
      let sending = false;
      const queue: Uint8Array[] = [];
      const flush = () => {
        if (sending || !queue.length || token !== generation) return;
        let size = 0,
          n = 0;
        while (n < queue.length && size + queue[n].length <= 32768) size += queue[n++].length;
        const chunk = new Uint8Array(size);
        let at = 0;
        for (const part of queue.splice(0, n)) {
          chunk.set(part, at);
          at += part.length;
        }
        sending = true;
        void api
          .liveVoiceAudio(chunk)
          .catch(async () => {
            if (token === generation) {
              await stop();
              notice('Ses bağlantısı kesildi; yeniden başlatabilirsin.');
            }
          })
          .finally(() => {
            sending = false;
            flush();
          });
      };
      processor.onaudioprocess = (e) => {
        if (!active) return;
        const samples = e.inputBuffer.getChannelData(0),
          bytes = new Uint8Array(samples.length * 2),
          view = new DataView(bytes.buffer);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = Math.max(-1, Math.min(1, samples[i]));
          sum += s * s;
          view.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
        }
        setLevel(Math.sqrt(sum / samples.length));
        // keep at most ~2 s waiting if the connection stalls
        if (queue.length > 32) queue.splice(0, queue.length - 32);
        queue.push(bytes);
        flush();
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(input.destination);
      mic.disabled = false;
      mic.setAttribute('aria-pressed', 'true');
      mic.setAttribute('aria-label', 'Sesli görüşmeyi bitir');
      status.textContent = 'Gemini Live · Dinliyorum · bitirmek için mikrofona bas';
      callState('Sesli görüşme açık');
    } catch (e) {
      (early as MediaStream | null)?.getTracks().forEach((t) => t.stop());
      if (token === generation) {
        const message = (e as Error).message;
        await stop();
        status.textContent = message;
        $('live-setting-status').textContent = message;
        notice(message);
      }
    }
  }
  mic.addEventListener(
    'click',
    (e) => {
      if (!selected && !active) {
        e.preventDefault();
        e.stopImmediatePropagation();
        notice('Sesli görüşme için Ayarlar → Hesap bölümünden Gemini Live etkinleştir.');
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (active) void stop();
      else if (configured) void start();
    },
    true,
  );
  cancel.addEventListener(
    'click',
    (e) => {
      if (!active) return;
      e.stopImmediatePropagation();
      void stop();
    },
    true,
  );
  api.onLiveVoice((event: any) => {
    if (!active) return;
    if (event.type === 'transcript') {
      transcripts.push(event);
      clearTimeout(transcriptTimer);
      transcriptTimer = setTimeout(flushTranscripts, 150);
      return;
    }
    if (event.type === 'tool') {
      callState(
        event.phase === 'running' ? 'Sesli görüşme · İşlem yapılıyor' : 'Sesli görüşme açık',
      );
      return;
    }
    if (event.type === 'closed') {
      void stop().then(() => {
        status.textContent = event.message;
        $('live-setting-status').textContent = event.message;
        notice(event.message);
      });
      return;
    }
    const c = event.data;
    if (c.interrupted) silence();
    for (const part of c.modelTurn?.parts || []) {
      const a = part.inlineData;
      if (!a?.data || !output || !/^audio\/pcm/.test(a.mimeType || '')) continue;
      const bytes = Uint8Array.from(atob(a.data), (s: string) => s.charCodeAt(0));
      if (bytes.length % 2 || bytes.length > 2000000) continue;
      const rate = Number(/rate=(\d+)/.exec(a.mimeType)?.[1] || 24000);
      if (rate < 8000 || rate > 48000) continue;
      const buffer = output.createBuffer(1, bytes.length / 2, rate),
        view = new DataView(bytes.buffer),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = view.getInt16(i * 2, true) / 32768;
      const s = output.createBufferSource();
      s.buffer = buffer;
      s.connect(output.destination);
      playing.add(s);
      s.onended = () => {
        playing.delete(s);
        s.disconnect();
        if (transcripts.length) flushTranscripts();
      };
      next = Math.max(next, output.currentTime + 0.02);
      s.start(next);
      next += buffer.duration;
    }
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (active && e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        void stop();
      }
    },
    true,
  );
  api.onExpanded((v: boolean) => {
    if (!v && active) void stop();
  });
  window.addEventListener('beforeunload', () => {
    stream?.getTracks().forEach((t) => t.stop());
    void api.liveVoiceStop();
  });
  return { stop, active: () => active };
}
