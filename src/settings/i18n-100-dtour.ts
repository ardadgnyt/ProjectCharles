// v1.0.0: the welcome tour and Settings (design pass). Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100DTour: Record<string, string> = {
  // welcome tour (src/island/onboarding.ts): Charles' own voice, no emoji, no exclamation marks
  'Ben Charles': 'I’m Charles',
  'Masaüstünde yaşayan bir Slime’ım. Sohbet eder, e-postalarına bakar, hatırlatma kurar, bilgisayarında iş yaparım. Beni hazırlamak birkaç adım sürer.':
    'I’m a Slime who lives on your desktop. I chat, check your email, set reminders and get things done on your computer. Setting me up takes a few steps.',
  'Yapay zekâ hesabını bağla': 'Connect your AI account',
  'Kullandığın hesabı seç, girişte yanındayım. Diğerlerini sonra Ayarlar’daki AI Modelleri sayfasından ekleyebilirsin.':
    'Pick the account you use and I’ll help you sign in. You can add the others later on the AI models page in Settings.',
  'Pro veya Max aboneliği gerekir': 'Needs a Pro or Max plan',
  'Yalnızca sohbet modunda çalışır': 'Works in chat mode only',
  // step 2: the providers set up on their Settings card after the tour
  'Resmi komut satırı aracıyla': 'With its official command line tool',
  'EVREN API anahtarınla': 'With your EVREN API key',
  'GitHub hesabınla': 'With your GitHub account',
  'Rengimi seç': 'Pick my color',
  'Yedi rengim var, istersen bıyık da takarım. Diğer aksesuarlar Ayarlar’daki Görünüm sayfasında.':
    'I come in seven colors, and I can wear a moustache if you like. More accessories are on the Appearance page in Settings.',
  'Bıyık tak': 'Add a moustache',
  Hazırız: 'We’re ready',
  'Beni adacıktan sürükleyip masaüstüne bırakabilirsin; fırlatırsan duvarlardan sekerim. Bir şey sormak için buraya yaz ya da “Hey Charles” de.':
    'You can drag me off the island onto the desktop; throw me and I bounce off the walls. To ask something, type here or say “Hey Charles”.',
  // Ayarlar → Genel → Güncellemeler (update-page.ts): the three facts in two sentences
  'Charles yeniden başlar. Sohbetlerin ve ayarların korunur; sorun olursa önceki sürüme dönülür.':
    'Charles restarts. Your chats and settings are kept; if something goes wrong, the previous version comes back.',
};
export const patterns100DTour: [RegExp, (...m: string[]) => string][] = [
  // step 2: a provider set up on its card ({a} is the provider's name)
  [/^Tanışma bitince Ayarlar’da (.+) kartını açarım\.$/, (_, n) => `When the tour ends, I’ll open the ${n} card in Settings.`],
];
