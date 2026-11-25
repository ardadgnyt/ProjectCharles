// Links to the official Google / Microsoft OAuth setup pages, and (v0.6.5) the Google AI
// Studio page where the Gemini Live API key is created.
const PAGES = {
  google: [
    'https://console.cloud.google.com/projectcreate',
    'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
    'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
    'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    'https://console.cloud.google.com/auth/overview',
    'https://console.cloud.google.com/auth/clients',
    'https://console.cloud.google.com/auth/audience',
  ],
  microsoft: [
    'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
  ],
  gemini: ['https://aistudio.google.com/api-keys'],
  // Gemini account sign-in runs in the Antigravity console window; no web page to open.
  'gemini-login': [],
  // v0.7.1: the other AI accounts sign in from their own window / the browser
  'gpt-login': [],
  'claude-login': [],
  'cursor-login': [],
  // v0.8.0: Abacus AI (its setup page is opened from the guide's own button)
  'abacus-login': [],
  'copilot-login': [],
  // v0.9.8: EVREN — an API key from the user's EVREN account
  'evren-login': ['https://evren.ssyz.org.tr/'],
};
function setupURL(id, step = 0) {
  const pages = PAGES[id];
  if (pages && !pages.length && step === 0) return null;
  if (!pages || !Number.isInteger(step) || step < 0 || step >= pages.length)
    throw Error('Geçersiz kurulum adımı.');
  return pages[step];
}
function googleConfig(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 50000)
    throw Error('Google yapılandırma dosyası geçersiz.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Error(
      'Seçilen dosya geçerli bir JSON değil. Google Cloud’dan aldığın masaüstü OAuth JSON dosyasını seç.',
    );
  }
  const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.installed : null;
  const clientId = typeof value?.client_id === 'string' ? value.client_id.trim() : '';
  const secret = typeof value?.client_secret === 'string' ? value.client_secret.trim() : '';
  if (
    !clientId ||
    clientId.length > 250 ||
    /\s/.test(clientId) ||
    !clientId.endsWith('.apps.googleusercontent.com') ||
    !secret ||
    secret.length > 4000 ||
    /\s/.test(secret)
  )
    throw Error(
      'Google Cloud’dan Desktop app / Masaüstü uygulaması türündeki OAuth JSON dosyasını indir. API anahtarı veya servis hesabı dosyası kullanma.',
    );
  return { clientId, secret };
}
module.exports = { setupURL, googleConfig };
