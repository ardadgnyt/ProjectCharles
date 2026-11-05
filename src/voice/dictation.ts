// v0.9.18: the microphone part of Bas-konuş (app/voice/dictation.cjs decides everything else).
// Open only between "record" and "stop"; the samples stay in memory and go to the local model.
import { wavBytes } from './wav';

const MAX_SAMPLES = 16000 * 120;

export function dictationUI(api: any) {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let gain: GainNode | null = null;
  let chunks: Float32Array[] = [];
  let length = 0;
  let current = 0;
  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (processor) processor.onaudioprocess = null;
    processor?.disconnect();
    source?.disconnect();
    gain?.disconnect();
    processor = null;
    source = null;
    gain = null;
    void context?.close();
    context = null;
  }
  async function stop(ticket: number) {
    if (ticket !== current) return;
    current = 0;
    close();
    const data = wavBytes(chunks, length);
    chunks = [];
    length = 0;
    await api.dictateAudio(ticket, data).catch(() => {});
  }
  api.onDictateRecord?.(async ({ ticket }: { ticket: number }) => {
    current = ticket;
    chunks = [];
    length = 0;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (ticket !== current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = acquired;
      context = new AudioContext({ sampleRate: 16000 });
      await context.resume();
      if (ticket !== current) return close();
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      gain = context.createGain();
      gain.gain.value = 0;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const chunk = input.slice(0, Math.min(input.length, MAX_SAMPLES - length));
        chunks.push(chunk);
        length += chunk.length;
        if (length >= MAX_SAMPLES) void stop(ticket);
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
    } catch (e) {
      if (ticket !== current) return;
      current = 0;
      close();
      const name = (e as Error).name;
      void api.dictateFailed(
        ticket,
        name === 'NotFoundError' ? 'Mikrofon bulunamadı.' : name === 'NotAllowedError' ? 'Mikrofon izni verilmedi. Windows’un mikrofon ayarlarını kontrol et.' : 'Mikrofon açılamadı.',
      );
    }
  });
  api.onDictateStop?.(({ ticket }: { ticket: number }) => void stop(ticket));
  api.onDictateCancel?.(() => {
    current = 0;
    close();
    chunks = [];
    length = 0;
  });
  window.addEventListener('beforeunload', close);
}
