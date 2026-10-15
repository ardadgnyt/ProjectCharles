#!/usr/bin/env python3
"""Charles' interface sounds (v0.6.0) — soft, jelly-like "bloop" sounds, made in code.

    python3 scripts/generate-sounds.py            → writes public/sounds/<name>.wav (48 kHz, 16-bit stereo)

Every sound is synthesised here (sine tones with pitch glides, soft envelopes and a little
"wobble" for the slime feel), so the files are Charles' own.
"""
import math
import os
import random
import struct
import wave

RATE = 48000
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sounds')


def env(t, dur, attack=0.008, release=0.08):
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = min(1.0, max(0.0, (dur - t) / release)) if release > 0 else 1.0
    return a * r


def tone(f0, f1, dur, vol=0.5, wobble=0.0, wob_hz=7.0, harm=0.18, attack=0.008, release=None):
    """A gliding sine (f0 → f1, exponential) with a soft second harmonic."""
    release = release if release is not None else min(0.12, dur * 0.6)
    n = int(dur * RATE)
    out, phase = [], 0.0
    for i in range(n):
        t = i / RATE
        k = t / dur
        f = f0 * (f1 / f0) ** k
        f *= 1 + wobble * math.sin(2 * math.pi * wob_hz * t)
        phase += 2 * math.pi * f / RATE
        s = math.sin(phase) + harm * math.sin(2 * phase)
        out.append(vol * env(t, dur, attack, release) * s / (1 + harm))
    return out


def noise(dur, vol=0.3, lp=0.2):
    n = int(dur * RATE)
    out, y = [], 0.0
    rnd = random.Random(7)
    for i in range(n):
        t = i / RATE
        y += lp * (rnd.uniform(-1, 1) - y)
        out.append(vol * y * env(t, dur, 0.002, dur * 0.8))
    return out


def silence(dur):
    return [0.0] * int(dur * RATE)


def seq(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


def mix(*parts):
    n = max(len(p) for p in parts)
    return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]


SOUNDS = {
    # tiny UI ticks
    'blip': lambda: tone(1400, 1700, 0.06, 0.35),
    'tick': lambda: tone(2000, 1800, 0.035, 0.25),
    'hover': lambda: tone(900, 1100, 0.05, 0.18),
    # bubble pops
    'pop': lambda: tone(500, 1100, 0.09, 0.5, wobble=0.02),
    'open': lambda: tone(380, 760, 0.14, 0.4, wobble=0.015),
    'close': lambda: tone(760, 360, 0.14, 0.4, wobble=0.015),
    'peek': lambda: seq(tone(600, 900, 0.07, 0.35), tone(900, 1200, 0.07, 0.3)),
    'attach': lambda: seq(tone(700, 700, 0.05, 0.3), silence(0.02), tone(1050, 1050, 0.07, 0.3)),
    'send': lambda: tone(450, 1300, 0.16, 0.42, wobble=0.01),
    # character
    'greet': lambda: seq(tone(520, 660, 0.12, 0.42, wobble=0.02), tone(780, 990, 0.16, 0.42, wobble=0.02)),
    'love': lambda: seq(tone(660, 660, 0.16, 0.4), tone(880, 880, 0.18, 0.4), tone(1320, 1250, 0.3, 0.32, wobble=0.012)),
    'proud': lambda: seq(tone(523, 523, 0.1, 0.38), tone(659, 659, 0.1, 0.38), tone(784, 784, 0.1, 0.38), tone(1046, 1046, 0.28, 0.36)),
    'wink': lambda: seq(tone(900, 1300, 0.07, 0.35), tone(1300, 1000, 0.09, 0.3)),
    'yawn': lambda: tone(520, 240, 0.7, 0.35, wobble=0.03, wob_hz=4.5, attack=0.08, release=0.25),
    'sleep': lambda: seq(tone(330, 280, 0.35, 0.25, attack=0.08), tone(280, 220, 0.45, 0.2, attack=0.08)),
    'dizzy': lambda: tone(700, 350, 0.8, 0.32, wobble=0.12, wob_hz=9, release=0.2),
    # Clicking the Slime: a sweet, soft jelly "boing" and a cute little "hmm-mm" (pure tones,
    # high and gentle — no noise, no buzz).
    'annoyed': lambda: seq(
        tone(620, 540, 0.14, 0.34, wobble=0.025, wob_hz=9, harm=0.0, attack=0.02, release=0.08),
        silence(0.04),
        tone(560, 440, 0.2, 0.32, wobble=0.03, wob_hz=8, harm=0.0, attack=0.02, release=0.12),
    ),
    'gulp': lambda: seq(tone(420, 180, 0.16, 0.5, wobble=0.04), tone(260, 140, 0.12, 0.35)),
    'slap': lambda: seq(
        tone(520, 880, 0.07, 0.36, wobble=0.03, wob_hz=20, harm=0.0, attack=0.005, release=0.03),
        tone(880, 660, 0.12, 0.3, wobble=0.04, wob_hz=14, harm=0.0, attack=0.005, release=0.09),
    ),
    # states
    'approval': lambda: seq(tone(660, 660, 0.11, 0.38), tone(990, 990, 0.18, 0.38)),
    'approve': lambda: seq(tone(740, 740, 0.08, 0.36), tone(1110, 1110, 0.16, 0.36)),
    'question': lambda: seq(tone(600, 650, 0.12, 0.38), tone(700, 1000, 0.22, 0.38, wobble=0.01)),
    'error': lambda: seq(tone(520, 480, 0.18, 0.4, harm=0.35), silence(0.03), tone(400, 300, 0.32, 0.4, harm=0.35)),
    'finish': lambda: seq(tone(523, 523, 0.09, 0.36), tone(659, 659, 0.09, 0.36), tone(784, 800, 0.32, 0.36, wobble=0.008)),
    'rate': lambda: seq(tone(700, 640, 0.16, 0.35), tone(560, 500, 0.16, 0.35), tone(420, 360, 0.3, 0.35)),
    'think': lambda: seq(tone(800, 820, 0.06, 0.22), silence(0.08), tone(900, 920, 0.06, 0.22), silence(0.08), tone(1000, 1020, 0.06, 0.22)),
    'search': lambda: seq(tone(600, 900, 0.1, 0.28), silence(0.05), tone(700, 1000, 0.1, 0.28)),
    'work': lambda: seq(tone(500, 560, 0.07, 0.3), silence(0.05), tone(560, 620, 0.07, 0.3), silence(0.05), tone(620, 700, 0.1, 0.3)),
}


def write(name, samples):
    os.makedirs(OUT, exist_ok=True)
    peak = max(1e-6, max(abs(s) for s in samples))
    scale = min(1.0, 0.89 / peak)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = bytearray()
        for s in samples:
            v = int(max(-1.0, min(1.0, s * scale)) * 32767)
            frames += struct.pack('<hh', v, v)
        w.writeframes(bytes(frames))


if __name__ == '__main__':
    for name, make in SOUNDS.items():
        write(name, make())
    print(len(SOUNDS), 'ses yazıldı →', os.path.normpath(OUT))
