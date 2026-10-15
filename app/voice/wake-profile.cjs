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
function match(text, profile) {
  const value = normalize(text);
  return (
    /^(?:hey|okay|ok) (?:charles|charls|carles|charlz|carls|charlie)(?: |$)/.test(value) ||
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
