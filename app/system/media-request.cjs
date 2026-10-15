// Validates Spotify media actions.
function mediaRequest(value) {
  const r = typeof value === 'string' ? { action: value } : value;
  if (
    !r ||
    !['status', 'play', 'pause', 'next', 'previous', 'seek', 'shuffle', 'repeat'].includes(r.action)
  )
    throw Error('Geçersiz medya işlemi.');
  if (r.action === 'seek') {
    if (!Number.isFinite(r.position) || r.position < 0 || r.position > 86400)
      throw Error('Geçersiz parça konumu.');
    return { action: r.action, position: r.position };
  }
  if (r.action === 'shuffle') {
    if (typeof r.enabled !== 'boolean') throw Error('Geçersiz karıştırma seçimi.');
    return { action: r.action, enabled: r.enabled };
  }
  if (r.action === 'repeat') {
    if (!['None', 'Track', 'List'].includes(r.mode)) throw Error('Geçersiz tekrar seçimi.');
    return { action: r.action, mode: r.mode };
  }
  return { action: r.action };
}
module.exports = { mediaRequest };
