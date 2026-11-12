// v0.9.27: EVREN connects by the key alone (EVREN's own terms only when EVREN asks), EVREN's error
// texts, the steps list of an answer. Other languages: src/settings/lang/*.ts ({n} is a number).
export const english0927: Record<string, string> = {
  // Settings → AI Models → EVREN
  'Kaydet ve bağlan': 'Save and connect',
  'EVREN şartlarını göster': "Show EVREN's terms",
  'Kabul et ve bağlan': 'Accept and connect',
  'Anahtar kayıtlı ama bağlantı doğrulanmadı. Bağlantıyı test et’e bas.':
    'A key is saved but the connection has not been checked. Press Test connection.',
  'Anahtar kaydedildi, EVREN bağlantısı doğrulanıyor…': 'Key saved, checking the EVREN connection…',
  'EVREN’e kabul gönderiliyor…': 'Sending your acceptance to EVREN…',
  'EVREN kullanım şartlarının metni okunamadı. EVREN sayfasından kontrol et.':
    "Could not read the text of EVREN's terms. Check on the EVREN page.",
  'Anahtar geçerli, ama EVREN bu hesap için kendi kullanım şartlarının kabulünü istiyor. Metni Ayarlar → AI Modelleri → EVREN kartında okuyup oradan kabul edebilirsin.':
    'The key is valid, but EVREN asks this account to accept its own usage terms. You can read the text and accept it in Settings → AI Models → EVREN.',
  'Önce EVREN API anahtarını yapıştır.': 'Paste your EVREN API key first.',
  // what EVREN answers (app/ai/evren.cjs)
  'EVREN bu hesap için kendi kullanım şartlarının kabul edilmesini istiyor. Bağlantı, şartlar EVREN tarafında kabul edilince kurulur.':
    'EVREN asks this account to accept its own usage terms. The connection is made once they are accepted at EVREN.',
  'EVREN zamanında yanıt vermedi. Bir süre sonra yeniden dene.': 'EVREN did not answer in time. Try again in a while.',
  'EVREN zamanında yanıt vermedi. İnternet bağlantını kontrol edip yeniden dene.':
    'EVREN did not answer in time. Check your internet connection and try again.',
  'EVREN kullanım şartları bu sırada güncellenmiş. Yeni metni okuyup yeniden dene.':
    "EVREN's usage terms were updated meanwhile. Read the new text and try again.",
  'EVREN isteği kabul etmedi (geçersiz istek). Charles’ı güncelleyip yeniden dene.':
    'EVREN did not accept the request (invalid request). Update Charles and try again.',
  'EVREN kullanım şartlarının sürümü okunamadı. Metni yeniden açıp tekrar dene.':
    "Could not read the version of EVREN's terms. Open the text again and retry.",
  'EVREN API anahtarı geçersiz veya eksik. Ayarlar → AI Modelleri bölümünden anahtarını kontrol et.':
    'The EVREN API key is invalid or missing. Check your key in Settings → AI Models.',
  'EVREN sunucusuna bağlantı kurulamadı. İnternet, VPN ve güvenlik duvarını kontrol et.':
    'Could not reach the EVREN server. Check your internet, VPN and firewall.',
  'EVREN sunucusuna şu an ulaşılamıyor. Bir süre sonra yeniden dene.':
    'The EVREN server cannot be reached right now. Try again in a while.',
  'EVREN günlük kullanım hakkı dolmuş görünüyor. Bir süre sonra yeniden dene.':
    'Your daily EVREN allowance seems to be used up. Try again in a while.',
  'EVREN yanıtı okunamadı.': "Could not read EVREN's answer.",
  // the steps of an answer (src/chat/steps.ts)
  'İşlem adımları': 'Steps',
  'Sohbet bağlamı özetlendi': 'Conversation context summarized',
  'İnceleme başladı': 'Review started',
  'İnceleme tamamlandı': 'Review finished',
  'Yardımcı ajan': 'Helper agent',
  'Görsel incelendi': 'Picture viewed',
  'Dosya okuma': 'File read',
  Plan: 'Plan',
  İşlem: 'Action',
  // GitHub Copilot (src/settings/cli-card.ts, app/ai/cli-kits.cjs)
  'GitHub hesabınla, resmi GitHub Copilot komut satırı aracı üzerinden bağlan. Araç Charles ile gelmez: önce kurulum sayfasındaki adımlarla kur, sonra GitHub Copilot ile giriş’e bas ve tarayıcıda izin ver. Hesabının Copilot planı neye izin veriyorsa o kullanılır. Sohbet modunda araçsız çalışır.':
    'Connect with your GitHub account through the official GitHub Copilot command line tool. The tool does not come with Charles: install it with the steps on the setup page, then press Sign in with GitHub Copilot and approve in the browser. Whatever your account’s Copilot plan allows is used. In chat mode it runs without tools.',
  'Giriş penceresi açıldı. Tarayıcıda GitHub hesabınla izin ver, sonra pencereyi kapat ve burada Bağlantıyı test et’e bas.':
    'The sign-in window is open. Approve with your GitHub account in the browser, then close the window and press Test connection here.',
  'Giriş penceresi açıldı. Bir sağlayıcı seçip girişi tamamla, sonra pencereyi kapat ve burada Bağlantıyı test et’e bas.':
    'The sign-in window is open. Pick a provider and finish signing in, then close the window and press Test connection here.',
  'Çıkış yap':
    'Sign out',
  'Sayfayı yeniden aç':
    'Open the page again',
  'Kurulu · Giriş yaptıktan sonra Bağlantıyı test et’e bas.':
    'Installed · After signing in, press Test connection.',
  'Standart':
    'Standard',
  'Maksimum':
    'Maximum',
  '✓ GitHub Copilot bağlı':
    '✓ GitHub Copilot connected',
  // the cards as they are laid out, and their "Charles ile kur" guides
  'GitHub hesabınla GitHub Copilot’un komut satırı aracı üzerinden bağlan. Hesabının Copilot planı neye izin veriyorsa o kullanılır; plan değişirse model listesi kendiliğinden güncellenir.':
    'Connect with your GitHub account through GitHub Copilot’s command line tool. Whatever your account’s Copilot plan allows is used; if the plan changes, the model list updates by itself.',
  'Giriş penceresi açıldı. Tarayıcıda GitHub hesabınla izin ver, sonra pencereyi kapat ve Bağlantıyı kontrol et’e bas.':
    'The sign-in window is open. Approve with your GitHub account in the browser, then close the window and press Check connection.',
  'Giriş penceresi açıldı. Bir sağlayıcı seçip girişi tamamla, sonra pencereyi kapat ve Bağlantıyı kontrol et’e bas.':
    'The sign-in window is open. Pick a provider and finish signing in, then close the window and press Check connection.',
  '1 · GitHub Copilot aracını kur':
    '1 · Install the GitHub Copilot tool',
  '2 · Hesabınla giriş yap':
    '2 · Sign in with your account',
  '3 · Bağlantıyı kontrol et':
    '3 · Check the connection',
  'GitHub Copilot’un komut satırı aracı Charles ile gelmez. Aşağıdaki düğmeyle kurulum sayfasını aç ve Windows adımlarıyla kur. Zaten kuruluysa sonraki adıma geç.':
    'GitHub Copilot’s command line tool does not come with Charles. Open the setup page with the button below and install it with the Windows steps. If it is already installed, go to the next step.',
  'Aşağıdaki düğmeye bas. Charles küçük bir siyah pencere açar ve tarayıcıda GitHub’ın giriş sayfası açılır. GitHub hesabınla izin ver, sonra siyah pencereyi kapat.':
    'Press the button below. Charles opens a small black window and GitHub’s sign-in page opens in your browser. Approve with your GitHub account, then close the black window.',
  'Bağlantıyı kontrol et’e bas. Charles, GitHub Copilot’a kısa bir deneme mesajı gönderir; yanıt gelirse GitHub Copilot model listesine eklenir.':
    'Press Check connection. Charles sends GitHub Copilot a short test message; if it answers, GitHub Copilot joins the model list.',
  'Onayladıktan sonra Tamam, sonraki adım’a bas.':
    'After confirming, press OK, next step.',
  'GitHub Copilot planındaki modeller değişti; model listesi güncellendi.':
    'The models of your GitHub Copilot plan changed; the model list was updated.',
  'GitHub Copilot planındaki modeller değişti; seçili model artık planda yok, Otomatik’e geçildi.':
    'The models of your GitHub Copilot plan changed; the chosen model is no longer in the plan, so Auto is used.',
  'GitHub Copilot hesabı':
    'GitHub Copilot account',
  'GitHub Copilot ile giriş':
    'Sign in with GitHub Copilot',
};

export const patterns0927: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) adım$/, (_, n) => `${n} steps`],
  [/^(GitHub Copilot) aracı bu bilgisayarda bulunamadı\. Kurulum sayfasındaki adımlarla kurduktan sonra yeniden dene\.$/, (_, n) => `The ${n} tool was not found on this computer. Install it with the steps on the setup page, then try again.`],
  [/^(GitHub Copilot) komut satırı aracı bu bilgisayarda bulunamadı\. Kurulum sayfasındaki adımlarla kur, sonra yeniden dene\.$/, (_, n) => `The ${n} command line tool was not found on this computer. Install it with the steps on the setup page, then try again.`],
  [/^(GitHub Copilot) komut satırı aracı bulunamadı\. (?:Önce kurulum sayfasındaki adımlarla kur, sonra yeniden dene|Kurup Ayarlar → AI Modelleri’nden bağlantıyı yeniden test et)\.$/, (_, n) => `The ${n} command line tool was not found. Install it, then test the connection again in Settings → AI Models.`],
  [/^(GitHub Copilot) oturumu açık değil\. .+ ile giriş’e bas, girişi tamamla ve yeniden kontrol et\.$/, (_, n) => `You are not signed in to ${n}. Press Sign in with ${n}, finish signing in and check again.`],
  [/^(GitHub Copilot) hesabın bu modeli kullanamıyor\. Otomatik’i ya da listeden başka bir model seç\.$/, (_, n) => `Your ${n} account cannot use this model. Choose Auto or another model from the list.`],
  [/^(GitHub Copilot) oturumu açık değil\. Ayarlar → AI Modelleri → .+ kartından giriş yap, sonra Bağlantıyı (?:test|kontrol) et’e bas\.$/, (_, n) => `You are not signed in to ${n}. Sign in from its card in Settings → AI Models, then press Check connection.`],
  [/^(GitHub Copilot) bu hesabın kullanım hakkının dolduğunu ya da planının bu modeli kapsamadığını bildirdi\. Başka bir model seç ya da daha sonra yeniden dene\.$/, (_, n) => `${n} says this account’s allowance is used up or its plan does not include this model. Choose another model or try again later.`],
  [/^(GitHub Copilot) yanıt vermedi\.(?: \((.*)\))?$/, (_, n, why) => `${n} did not answer.${why ? ' (' + why + ')' : ''}`],
  [/^(GitHub Copilot) zamanında yanıt vermedi\. İnternet bağlantını kontrol edip yeniden dene\.$/, (_, n) => `${n} did not answer in time. Check your internet connection and try again.`],
  [/^Bağlı · (GitHub Copilot) yanıt verdi\.$/, (_, n) => `Connected · ${n} answered.`],
  [/^(GitHub Copilot) bağlantısı test ediliyor: kısa bir deneme mesajı gönderiliyor…$/, (_, n) => `Testing the ${n} connection: sending a short test message…`],
  [/^Bu mesaj (GitHub Copilot) komut satırı için çok uzun \(en fazla 28\.000 karakter\)\. Belgeyi kısalt ya da başka bir model seç\.$/, (_, n) => `This message is too long for the ${n} command line (28,000 characters at most). Shorten the document or choose another model.`],
  [/^(GitHub Copilot) aracı bu bilgisayarda kurulu değil\. Charles ile kur’a bas; adım adım anlatır\.$/, (_, n) => `The ${n} tool is not installed on this computer. Press Set up with Charles; it explains step by step.`],
  [/^Bağlandı\. (GitHub Copilot) model listesinde\. Kurulumu bitir düğmesine basabilirsin\.$/, (_, n) => `Connected. ${n} is in the model list. You can press Finish setup.`],
];
