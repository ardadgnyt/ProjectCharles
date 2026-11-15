// The "Hey Charles" clip gate: decides from microphone levels alone when a clip is worth a wake check.
// Pure (no microphone, no timers): wake.ts feeds it one RMS level per 4096-sample frame (256 ms at
// 16 kHz). Rule: never gate out a phrase the v1.0.0 gate would have sent to whisper; save checks only
// on steady sound (no rise) and silence. Measurements: .qa/h100/matrix/WAKE.md and .qa/h100/wake/
// (tts.json: TTS frame levels; snr.json: whisper recognition by SNR; replay.cjs: checks per minute).

export const WAKE = {
  // Default opening level when no wake profile is trained (profile threshold: 0.003-0.012).
  threshold: 0.008,
  // A frame is "active" when above max(threshold, floor * openRatio). snr.json: whisper still
  // recognises the phrase at the lowest SNR listed there; a voice at that SNR raises the frame level
  // over the floor by sqrt(1 + 10^(SNR/10)). The ratio sits below that rise with margin.
  openRatio: 1.15,
  // A frame is quiet (a pause) when below max(quietMin, min(floor at clip start, pauseCap) *
  // quietRatio): exactly the v1.0.0 rule, whose floor never passed 0.015. So music or talk is never a
  // pause, clips over it run to the cap as before, and fluctuating sound does not split into many.
  quietMin: 0.006,
  quietRatio: 1.6,
  pauseCap: 0.015,
  // Quiet frames that end a clip: 768 ms pause after the phrase (unchanged: same latency).
  tailFrames: 3,
  // First clip of a sound: at most 11 frames (2.8 s), so "Hey Charles, saat kaç?" in one breath
  // is checked 2.8 s after it starts (v1.0.0: 4.1 s). TTS (tts.json): the phrase spans 3-7 frames.
  firstFrames: 11,
  // While the sound goes on, the next clips are 19 frames (4.9 s; the WAV stays under the 5 s limit
  // of wake-check) and start with the last 6 frames of the previous one, so any phrase up to 7
  // frames (1.8 s, a slow "Hey, Charles") lies whole in one clip wherever it falls: one check per
  // 13 frames (3.3 s) of ongoing sound. v1.0.0 checked every 4.1 s + check time, with gaps.
  nextFrames: 19,
  carryFrames: 6,
  // Checks are at least 13 frames (3.3 s) apart while sound goes on: clips that close sooner wait
  // and are checked together in one span (all their frames, at most nextFrames long), so a sound
  // full of short bursts (music with a beat, typing) costs at most one check per 3.3 s and no clip
  // is skipped. After a quiet spell the check comes at once, so the phrase is not delayed.
  minGapFrames: 13,
  // Noise floor: rises slowly toward steady sound (also during clips), falls fast; a capped clip
  // lifts it to its quietest frame, so steady sound costs one check, then opens no clips. No cap
  // (was 0.015): any steady level becomes background.
  noiseStart: 0.003,
  noiseRise: 0.05,
  noiseFall: 0.3,
  noiseCap: 1,
};

// A stretch of frames to check, inclusive, counted from the first frame pushed after restart().
export type WakeSpan = [number, number];

export class WakeGate {
  threshold: number;
  noise = WAKE.noiseStart;
  i = -1; // index of the last frame pushed
  start = -1; // first frame of the open clip (with its lead-in), -1 when no clip is open
  frames = 0; // frames in the open clip
  cap: number = WAKE.firstFrames;
  silent = 0; // quiet frames at the end of the open clip
  ref = 0; // noise floor when the clip started (pauses are judged against it)
  levels: number[] = []; // levels of the open clip
  pending: WakeSpan | null = null; // closed clips waiting for their check (see minGapFrames)
  lastCheck = -Infinity; // frame at which the last span was handed out
  constructor(threshold = WAKE.threshold) {
    this.threshold = threshold;
  }
  // A new microphone stream: forget the clip, the waiting spans and the floor.
  restart() {
    this.i = -1;
    this.start = -1;
    this.frames = this.silent = 0;
    this.levels = [];
    this.pending = null;
    this.lastCheck = -Infinity;
    this.noise = WAKE.noiseStart;
  }
  active(rms: number) {
    return rms >= Math.max(this.threshold, this.noise * WAKE.openRatio);
  }
  // One frame in; out: a span to check now, or null.
  push(rms: number): WakeSpan | null {
    const closed = this.clip(rms);
    let out: WakeSpan | null = null;
    if (closed) {
      if (this.pending && closed[1] - this.pending[0] + 1 > WAKE.nextFrames) {
        out = this.pending; // the union would be too long for one check: send what waits
        this.pending = closed;
      } else this.pending = this.pending ? [this.pending[0], closed[1]] : closed;
    }
    if (!out && this.pending && this.i - this.lastCheck >= WAKE.minGapFrames) {
      out = this.pending;
      this.pending = null;
    }
    if (out) this.lastCheck = this.i;
    return out;
  }
  // The clip rule: returns the span of a clip that closes on this frame.
  clip(rms: number): WakeSpan | null {
    this.i++;
    const level = Math.min(rms, WAKE.noiseCap),
      before = this.noise;
    this.noise += (level - this.noise) * (level < this.noise ? WAKE.noiseFall : WAKE.noiseRise);
    if (this.start < 0) {
      if (!this.active(rms)) return null;
      this.start = Math.max(0, this.i - 1); // one frame of lead-in, so a soft "H" is not cut off
      this.frames = 1;
      this.cap = WAKE.firstFrames;
      this.silent = 0;
      this.ref = before; // the floor under the sound that opened the clip
      this.levels = [rms];
      return null;
    }
    this.frames++;
    this.levels.push(rms);
    this.silent =
      rms < Math.max(WAKE.quietMin, Math.min(this.ref, WAKE.pauseCap) * WAKE.quietRatio)
        ? this.silent + 1
        : 0;
    const span: WakeSpan = [this.start, this.i];
    if (this.silent >= WAKE.tailFrames) {
      this.start = -1;
      return span;
    }
    if (this.frames < this.cap) return null;
    // No pause within the cap: check it. The floor rises to the clip's quietest frame (steady sound
    // stops here); if the last frames are still active over it, the sound goes on: the next clip
    // starts with them, so a phrase across the boundary is whole in one clip.
    this.noise = Math.max(this.noise, Math.min(Math.min(...this.levels), WAKE.noiseCap));
    const tail = this.levels.slice(-WAKE.carryFrames);
    if (tail.some((v) => this.active(v))) {
      this.start = this.i + 1 - tail.length;
      this.frames = tail.length;
      this.cap = WAKE.nextFrames;
      this.silent = 0;
      this.ref = this.noise;
      this.levels = tail;
    } else this.start = -1;
    return span;
  }
}
