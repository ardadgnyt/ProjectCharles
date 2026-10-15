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
};
function setupURL(id, step = 0) {
  const pages = PAGES[id];
  if (pages && !pages.length && step === 0) return null;
  if (!pages || !Number.isInteger(step) || step < 0 || step >= pages.length)
    throw Error('Geçersiz kurulum adımı.');
  return pages[step];
}
function googleConfig(text) {
  if (typeof text !== 'string' || text.length > 50000)
    throw Error('Google yapılandırma dosyası geçersiz.');
  let value;
  try {
    value = JSON.parse(text).installed;
  } catch {}
  if (
    !value ||
    typeof value.client_id !== 'string' ||
    !value.client_id.endsWith('.apps.googleusercontent.com') ||
    typeof value.client_secret !== 'string'
  )
    throw Error(
      'Google Cloud’dan Desktop app / Masaüstü uygulaması türündeki OAuth JSON dosyasını indir. API anahtarı veya servis hesabı dosyası kullanma.',
    );
  return { clientId: value.client_id, secret: value.client_secret };
}
module.exports = { setupURL, googleConfig };
