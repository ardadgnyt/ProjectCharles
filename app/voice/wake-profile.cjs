// "Hey Charles" wake word profile and matching.
function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function sample(text) {
  const value = normalize(text);
  if (
    !/^(hey|hey charles|hey charls|hey carles|hey carl|hey carlz|hey charlz|hey sarl|hey sarls|hey sarli|hey sar|hey carli|hey charlie|hey charlese|hey carls)$/.test(
      value,
    ) ||
    value === 'hey'
  )
    throw Error('Hey Charles net duyulmadı. Sessiz bir ortamda tekrar dene.');
  return value;
}
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
// v1.0.0: how whisper (tiny, English) writes "Charles" from real voices: "chars", "charts", "charz".
// Accepted: "char" plus 1-4 of the letters l, e, t, s, i, z, ending in s or z, at most two edits from
// "charles" (a final z counts as s). Not: "chart", "charge", "chaps", "chairs", "cheers", "carl".
function nearCharles(word) {
  const w = word.replace(/z$/, 's');
  return /^char[letsiz]{1,4}$/.test(w) && w.endsWith('s') && distance(w, 'charles') <= 2;
}
function match(text, profile) {
  const value = normalize(text),
    words = value.split(' ');
  return (
    /^(?:hey|okay|ok) (?:charles|charls|carles|charlz|carls|charlie)(?: |$)/.test(value) ||
    (/^(?:hey|okay|ok)$/.test(words[0]) && !!words[1] && nearCharles(words[1])) ||
    (profile?.phrases || []).some((p) => value === p || value.startsWith(p + ' '))
  );
}
function profile(samples) {
  if (!Array.isArray(samples) || samples.length !== 3) throw Error('Üç örnek kayıt gerekli.');
  const phrases = samples.map((s) => sample(s.text)),
    levels = samples.map((s) => s.rms);
  if (levels.some((v) => !Number.isFinite(v) || v < 0.002 || v > 1))
    throw Error('Mikrofon seviyesi geçersiz.');
  return {
    phrases: [...new Set(phrases)],
    threshold: Math.max(0.003, Math.min(0.012, Math.min(...levels) * 0.2)),
    trainedAt: Date.now(),
  };
}
module.exports = { normalize, sample, match, profile };
