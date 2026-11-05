// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.18: the numbers of the system monitor. The value shown and the line drawn come from the
// same samples of the same time range. A missing reading is null, never 0: it counts in no average.
const WEIGHT_MAX = 5000;
const valid = (v) => typeof v === 'number' && Number.isFinite(v);

/** samples: [{ t, v }] oldest first. Current / average / peak of the valid ones inside the range. */
function stats(samples, now, rangeMs) {
  const from = now - rangeMs;
  // v0.9.18: a sample counts for the time it stands for: the monitor measures every second on
  // screen and every 5 s behind it, and an average of the samples alone would favour the seconds
  const weightOf = (i) => Math.min(WEIGHT_MAX, Math.max(1, (samples[i + 1]?.t ?? samples[i].t + 1000) - samples[i].t));
  let count = 0,
    sum = 0,
    weight = 0,
    peak = null,
    peakAt = null,
    current = null,
    first = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.t < from || s.t > now || !valid(s.v)) continue;
    count++;
    sum += s.v * weightOf(i);
    weight += weightOf(i);
    if (first === null) first = s.t;
    current = s.v;
    if (peak === null || s.v > peak) {
      peak = s.v;
      peakAt = s.t;
    }
  }
  return {
    current,
    average: count ? sum / weight : null,
    peak,
    peakAt,
    count,
    // how much of the range was really measured (a new monitor does not claim a full minute)
    spanMs: first === null ? 0 : Math.min(rangeMs, now - first),
  };
}

/**
 * What the chart draws: at most `points` points; a pause longer than `gapMs` becomes a null, so the
 * line breaks there instead of joining the two sides. Bucket values keep their peak, so a short
 * spike stays visible in a long range.
 */
function series(samples, now, rangeMs, points = 360, gapMs = 12000) {
  const from = now - rangeMs;
  const inside = samples.filter((s) => s.t >= from && s.t <= now);
  const step = Math.max(1, Math.ceil(inside.length / points));
  const out = [];
  let previous = null;
  for (let i = 0; i < inside.length; i += step) {
    const part = inside.slice(i, i + step);
    if (previous !== null && part[0].t - previous > gapMs) out.push({ t: previous + 1, v: null });
    const seen = part.map((s) => s.v).filter(valid);
    out.push({ t: part[part.length - 1].t, v: seen.length ? Math.max(...seen) : null });
    previous = part[part.length - 1].t;
  }
  return out;
}

module.exports = { stats, series, valid };
