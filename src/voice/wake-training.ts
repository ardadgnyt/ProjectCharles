import { wave } from './wake';
export function wakeTraining(api: any, notice: (s: string) => void) {
  const host = document.getElementById('wake-enabled')!.closest('section')!,
    section = document.createElement('div');
  section.className = 'wake-training';
  section.innerHTML =
    '<h4>Hey Charles eğitimi</h4><p class="hint">Üç kez “Hey Charles” söyle. Her kayıt 3 saniye sürer. Ses yerel olarak işlenir; kayıtlar eğitim sonunda tutulmaz. Bu özellik ses kimliği doğrulaması yapmaz.</p>';
  const meter = document.createElement('progress');
  meter.max = 1;
  meter.value = 0;
  meter.setAttribute('aria-label', 'Mikrofon seviyesi');
  const status = document.createElement('p');
  status.className = 'hint';
  status.setAttribute('role', 'status');
  const record = document.createElement('button');
  record.textContent = 'Eğitimi başlat';
  const test = document.createElement('button');
  test.textContent = 'Algılamayı test et';
  const reset = document.createElement('button');
  reset.textContent = 'Eğitimi sıfırla';
  section.append(meter, status, record, test, reset);
  host.append(section);
  let samples: any[] = [],
    active = false,
    controller: AbortController | null = null;
  async function capture(training: boolean) {
    if (
      active ||
      document.body.dataset.liveVoice === 'active' ||
      ['recording', 'transcribing'].includes(document.body.dataset.voicePhase || '')
    ) {
      notice('Önce etkin ses işlemini bitir.');
      return;
    }
    active = true;
    record.disabled = test.disabled = reset.disabled = true;
    document.body.dataset.wakeTraining = 'true';
    document.dispatchEvent(new Event('wake-training'));
    controller = new AbortController();
    let stream: MediaStream | null = null,
      ctx: AudioContext | null = null,
      source: MediaStreamAudioSourceNode | null = null,
      processor: ScriptProcessorNode | null = null,
      gain: GainNode | null = null;
    try {
      await api.wakeTrainingArm();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.resume();
      if (ctx.sampleRate !== 16000) throw Error('16 kHz kayıt açılamadı.');
      source = ctx.createMediaStreamSource(stream);
      processor = ctx.createScriptProcessor(4096, 1, 1);
      gain = ctx.createGain();
      gain.gain.value = 0;
      const chunks: Float32Array[] = [];
      status.textContent = 'Şimdi “Hey Charles” söyle…';
      processor.onaudioprocess = (e) => {
        const a = e.inputBuffer.getChannelData(0).slice();
        chunks.push(a);
        meter.value = Math.min(1, Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length) * 8);
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 3000);
        controller!.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(Error('Kayıt iptal edildi.'));
          },
          { once: true },
        );
      });
      processor.disconnect();
      processor.onaudioprocess = null;
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      status.textContent = 'Kayıt inceleniyor…';
      const data = await api.wakeTrainingSample(wave(chunks), training);
      if (training) {
        samples.push(data);
        status.textContent = samples.length + '/3 · ' + data.text;
        if (samples.length === 3) {
          await api.wakeTrainingSave(samples);
          samples = [];
          status.textContent = 'Eğitim kaydedildi. Algılamayı test edebilirsin.';
          document.dispatchEvent(new Event('wake-trained'));
        }
      } else status.textContent = (data.hit ? 'Algılandı: ' : 'Algılanamadı: ') + data.text;
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      processor?.disconnect();
      source?.disconnect();
      gain?.disconnect();
      void ctx?.close();
      active = false;
      controller = null;
      record.disabled = test.disabled = reset.disabled = false;
      record.textContent = samples.length ? 'Sonraki örneği kaydet' : 'Eğitimi başlat';
      meter.value = 0;
      document.body.dataset.wakeTraining = '';
    }
  }
  record.onclick = () => void capture(true);
  test.onclick = () => void capture(false);
  reset.onclick = () =>
    void api.wakeTrainingSave(null).then(() => {
      samples = [];
      status.textContent = 'Eğitim sıfırlandı.';
      document.dispatchEvent(new Event('wake-trained'));
    });
  api.onPowerPaused((v: boolean) => {
    if (v) controller?.abort();
  });
  window.addEventListener('beforeunload', () => controller?.abort());
}
