export function voiceUI(api: any, notice: (text: string) => void, busy: () => boolean) {
  const mic = document.getElementById('voice-mic') as HTMLButtonElement;
  const cancel = document.getElementById('voice-cancel') as HTMLButtonElement;
  const read = document.getElementById('voice-read') as HTMLInputElement;
  const status = document.getElementById('voice-status')!;
  const prompt = document.getElementById('prompt') as HTMLTextAreaElement;
  let phase = 'idle',
    epoch = 0,
    stream: MediaStream | null = null,
    context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null,
    processor: ScriptProcessorNode | null = null,
    gain: GainNode | null = null;
  let chunks: Float32Array[] = [],
    length = 0,
    timer: number | undefined,
    seconds: number | undefined,
    finalText = '';
  function show(p: string, text: string) {
    phase = p;
    document.body.dataset.voicePhase = p;
    status.textContent = text;
    mic.setAttribute('aria-label', p === 'recording' ? 'Dikteyi bitir' : 'Dikte et');
    mic.title = p === 'recording' ? 'Dikteyi bitir' : 'Dikte et';
    mic.disabled = !['idle', 'recording'].includes(p);
    mic.setAttribute('aria-pressed', String(p === 'recording'));
    cancel.hidden = p === 'idle';
  }
  function closeMic() {
    window.clearTimeout(timer);
    window.clearInterval(seconds);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    processor?.disconnect();
    if (processor) processor.onaudioprocess = null;
    processor = null;
    source?.disconnect();
    source = null;
    gain?.disconnect();
    gain = null;
    if (context) {
      void context.close();
      context = null;
    }
  }
  async function stop() {
    const wasActive = phase !== 'idle';
    epoch++;
    closeMic();
    chunks = [];
    length = 0;
    await api.voiceStop();
    show('idle', wasActive ? 'Ses işlemi durduruldu.' : '');
  }
  function wav() {
    const data = new Uint8Array(44 + length * 2),
      v = new DataView(data.buffer);
    const str = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    str(0, 'RIFF');
    v.setUint32(4, data.length - 8, true);
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
    v.setUint32(40, length * 2, true);
    let offset = 44;
    for (const chunk of chunks)
      for (const sample of chunk) {
        const s = Math.max(-1, Math.min(1, sample));
        v.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
        offset += 2;
      }
    return data;
  }
  async function finish() {
    if (phase !== 'recording') return;
    const token = epoch;
    closeMic();
    show('transcribing', 'Konuşman bilgisayarında yazıya çevriliyor…');
    try {
      const data = wav();
      chunks = [];
      length = 0;
      const text = await api.voiceTranscribe(data);
      if (token !== epoch) return;
      prompt.value = (prompt.value.trim() ? prompt.value.trim() + '\n' : '') + text;
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      show('idle', 'Metni kontrol et, ardından Gönder’e bas.');
      prompt.focus();
    } catch (e) {
      if (token === epoch) {
        show('idle', 'Yeniden deneyebilirsin.');
        notice((e as Error).message);
      }
    }
  }
  mic.onclick = async () => {
    if (phase === 'recording') {
      await finish();
      return;
    }
    if (document.body.dataset.liveVoice === 'active') {
      notice('Önce sesli görüşmeyi bitir.');
      return;
    }
    if (busy()) {
      notice('Konuşmadan önce yanıtın tamamlanmasını bekle.');
      return;
    }
    const token = ++epoch;
    show('starting', 'Mikrofon hazırlanıyor…');
    try {
      await api.voiceArm();
      if (token !== epoch) return;
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (token !== epoch) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = acquired;
      context = new AudioContext({ sampleRate: 16000 });
      await context.resume();
      if (token !== epoch) return;
      if (context.sampleRate !== 16000) throw Error('Mikrofon 16 kHz ses kaydı başlatamadı.');
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      gain = context.createGain();
      gain.gain.value = 0;
      chunks = [];
      length = 0;
      processor.onaudioprocess = (e) => {
        if (phase !== 'recording') return;
        const input = e.inputBuffer.getChannelData(0);
        const chunk = input.slice(0, Math.min(input.length, 960000 - length));
        chunks.push(chunk);
        length += chunk.length;
        if (length >= 960000) void finish();
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      show('recording', 'Dinliyorum · bitirmek için ■ Bitir · en fazla 60 sn');
      const start = Date.now();
      seconds = window.setInterval(() => {
        status.textContent = `Dinliyorum · ${Math.floor((Date.now() - start) / 1000)} / 60 sn`;
      }, 1000);
      timer = window.setTimeout(() => void finish(), 60000);
    } catch (e) {
      if (token === epoch) {
        closeMic();
        await api.voiceStop();
        show('idle', 'Mikrofon açılamadı.');
        notice((e as Error).message);
      }
    }
  };
  cancel.onclick = () => void stop();
  api.onPowerPaused((v: boolean) => {
    if (v && phase !== 'idle') void stop();
  });
  read.onchange = () => {
    if (!read.checked && phase === 'speaking') void stop();
  };
  async function speak(text: string) {
    if (document.body.dataset.liveVoice === 'active' || !read.checked || !text || phase !== 'idle')
      return;
    const token = ++epoch;
    show('speaking', 'Yanıt okunuyor…');
    try {
      await api.voiceSpeak(text);
    } catch (e) {
      if (token === epoch) notice((e as Error).message);
    } finally {
      if (token === epoch) show('idle', 'Sesli yanıt tamamlandı.');
    }
  }
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && phase !== 'idle') {
        e.preventDefault();
        e.stopImmediatePropagation();
        void stop();
      }
    },
    true,
  );
  api.onExpanded((expanded: boolean) => {
    if (!expanded && phase !== 'idle') void stop();
  });
  window.addEventListener('beforeunload', closeMic);
  return {
    stop,
    async read(text: string) {
      if (phase !== 'idle') await stop();
      read.checked = true;
      await speak(text);
    },
    active: () =>
      document.body.dataset.liveVoice === 'active' || !['idle', 'speaking'].includes(phase),
    begin() {
      finalText = '';
      if (phase === 'speaking') void stop();
    },
    item(item: any) {
      if (item.type === 'agentMessage' && item.text && item.phase !== 'commentary')
        finalText = item.text;
    },
    completed(ok: boolean) {
      if (ok) void speak(finalText);
      finalText = '';
    },
    local(text: string) {
      void speak(text);
    },
  };
}
