// v0.9.6: the effort panel beside the model picker. Turkish "Orta" is also "Center"; the dock
// position is keyed as "Ortada" (i18n-0810) so both meanings can live in one flat table.
// v0.9.6 EVREN: the API-key account's settings card, its connection test, the usage terms the
// service may ask to accept once, and the daily token quota in the usage panel.
export const english096: Record<string, string> = {
  'Efor düzeyi': 'Effort level',
  'Düşük': 'Low',
  'Orta': 'Medium',
  'Yüksek': 'High',
  'Çok Yüksek': 'Extra High',
  'Maksimum': 'Max',
  'Ultra': 'Ultra',
  // EVREN card
  'EVREN hesabı': 'EVREN account',
  'EVREN API anahtarınla bağlan. Anahtar Windows güvenli şifrelemesiyle %APPDATA%\\Charles klasöründe saklanır; proje klasöründe ve sürüm paketinde tutulmaz.':
    'Connect with your EVREN API key. The key is stored with Windows encryption in %APPDATA%\\Charles - never in the project folder or the release package.',
  'Bağlantı test edilince EVREN hesabındaki modeller model listesine eklenir; adları "EVREN · " diye başlar.':
    'Once the connection is tested, the models in your EVREN account join the model list; their names start with "EVREN · ".',
  'Evren Giriş Sayfası': 'EVREN login page',
  'Hesap kontrol ediliyor…': 'Checking account…',
  'Anahtar kaydedildi. Bağlantıyı test et\'e bas.': "Key saved. Press 'Test connection'.",
  'EVREN bağlantısı test ediliyor': 'Testing the EVREN connection',
  'Önce anahtarını gir.': 'Enter your key first.',
  'Anahtar silindi.': 'Key deleted.',
  'Kullanım şartları': 'Terms of use',
  'EVREN kullanım şartlarını okuyup kabul etmeni isteyebilir.':
    'EVREN may ask you to read and accept its usage terms.',
  'Şartları kabul et': 'Accept terms',
  'Şartlar kabul edildi.': 'Terms accepted.',
  // EVREN connection errors
  'EVREN API anahtarı eklenmemiş. Önce anahtarını kaydet.': 'No EVREN API key yet. Save your key first.',
  'EVREN anahtarı eklenmemiş': 'No EVREN API key yet',
  'EVREN model listesi boş geldi.': 'EVREN returned an empty model list.',
  'EVREN bağlantısı kurulamadı.': 'Could not connect to EVREN.',
  'EVREN yanıtı boş geldi.': 'EVREN returned an empty answer.',
  'EVREN yanıtı alınamadı.': 'No answer from EVREN.',
  'Yanıt durduruldu.': 'Answer stopped.',
  // EVREN daily token quota
  'Günlük token': 'Daily tokens',
  'Kota bilgisi okunamadı': 'Could not read the quota',
  // v0.9.12: the "files" module permission
  'Kaydet penceresiyle bilgisayarına dosya kaydedebilir, Aç penceresiyle seçtiğin dosyaları okuyabilir. Neyin ve nereye kaydedileceğini, hangi dosyanın açılacağını her seferinde sen seçersin; modül başka hiçbir dosyana erişemez.':
    'Can save files to your computer through the Save window and read files you pick in the Open window. You choose what is saved and where, and which file is opened, every time; the module cannot reach any other file of yours.',
};

export const patterns096: [RegExp, (...m: string[]) => string][] = [
  [/^Kalan günlük token: (\d+)$/, (_, n) => `Daily tokens left: ${n}`],
];