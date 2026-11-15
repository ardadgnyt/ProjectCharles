// v1.0.0: voice bars on the island, the version line. Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100Core: Record<string, string> = {
  // security fixes (G2, G6-G9): German, French, Spanish, Chinese in .qa/h100/lang-security.json
  'Dışarıdan gelen içerik eklendiği için web araması bu mesajda kapalı.':
    'Web search is off for this message because it has outside content attached.',
  'Bu metnin tamamını hafızama kaydetmedim. Hangi cümleyi hatırlamamı istersin? Örneğin: “Bunu hatırla: …”':
    'I did not save this whole text to my memory. Which sentence should I remember? For example: “Bunu hatırla: …”',
  'Sonuç için boş bir dosya adı bulunamadı.': 'No free file name was found for the result.',
  'Arşivdeki bir kayıt okunamadı; güvenlik için açılmadı.':
    'An entry in the archive could not be read; it was not opened, for safety.',
  'Bu bir program ya da betik dosyası; çalıştırılmadı, bulunduğu klasör açıldı.':
    'This is a program or script file; it was not run, its folder was opened instead.',
  // archive file names outside the code page: German, French, Spanish, Chinese in .qa/h100/lang-archive.json
  'Arşiv bozuk; açılamıyor.': 'The archive is damaged; it cannot be opened.',
  'Bu ZIP arşivi desteklenmeyen bir sıkıştırma yöntemi kullanıyor; açılamıyor.':
    'This ZIP archive uses an unsupported compression method; it cannot be opened.',
  'Arşivde aynı adı taşıyan iki kayıt var; güvenlik için açılmadı.':
    'The archive has two entries with the same name; it was not opened, for safety.',
  'Bu dosyalar ZIP olarak paketlenemiyor: toplam 4 GB’den büyük ya da 65.000’den fazla dosya var.':
    'These files cannot be packed as ZIP: they are larger than 4 GB in total or more than 65,000 files.',
  // archive: Charles' own TAR reader and writer; German, French, Spanish, Chinese in .qa/h100/lang-archive2.json
  'Bazı dosya adlarında Windows’un arşiv aracının (tar.exe) işleyemediği karakterler var (ör. Çince, Japonca, Rusça); bu biçimde paketlenemiyor. ZIP ya da TAR seçin.':
    'Some file names contain characters that the Windows archive tool (tar.exe) cannot handle (for example Chinese, Japanese, Russian); they cannot be packed in this format. Choose ZIP or TAR.',
  'Arşivdeki bazı dosya adlarında Windows’un arşiv aracının (tar.exe) okuyamadığı karakterler var (ör. Çince, Japonca, Rusça); bu biçimdeki arşiv açılamıyor. Böyle adlar ZIP, TAR ve TAR.GZ arşivlerinde açılabiliyor.':
    'Some file names in the archive contain characters that the Windows archive tool (tar.exe) cannot read (for example Chinese, Japanese, Russian); an archive in this format cannot be opened. Such names can be opened in ZIP, TAR and TAR.GZ archives.',
  'Arşivde aygıt ya da özel bir dosya türü var; güvenlik için açılmadı.':
    'The archive has a device or another special file type; it was not opened, for safety.',
  'Bir dosya paketlenirken değişti; yeniden deneyin.': 'A file changed while it was being packed; try again.',
  // notification cards and toasts (app/plugins/notice-text.cjs holds the same rows for the card
  // window): German, French, Spanish, Chinese in .qa/h100/lang-notify.json
  'Saat {time} için hatırlatma': 'Reminder for {time}',
  'Charles güncellendi': 'Charles was updated',
  '{v} kuruldu': '{v} is installed',
  'Yenilikleri gör': 'See what’s new',
  'Güncelleme kurulamadı': 'The update could not be installed',
  'Charles önceki sürümle açıldı. Ayrıntılar _update\\update.log dosyasında.':
    'Charles opened with the previous version. The details are in _update\\update.log.',
  'Güncelleme var': 'Update available',
  '{v} hazır. Ayarlar’ın Genel sayfasından kurabilirsin.':
    '{v} is ready. You can install it from the General page in Settings.',
  'Hesabında önemli olarak işaretli': 'Marked as important in your account',
  'Önemli görünüyor': 'Looks important',
  '“{x}” içeriyor': 'Contains “{x}”',
  '15 dakika içinde başlıyor': 'Starts in 15 minutes',
  'Yeni takvim etkinliği': 'New calendar event',
  'Disk doluyor': 'The disk is filling up',
  'İşlemci %{n} dolu. En çok {app} kullanıyor.': 'The processor is at {n}%. {app} uses the most.',
  'İşlemci %{n} dolu.': 'The processor is at {n}%.',
  'Bellek %{n} dolu. En çok {app} kullanıyor.': 'Memory is at {n}%. {app} uses the most.',
  'Bellek %{n} dolu.': 'Memory is at {n}%.',
  'C: diskinde yalnızca {gb} GB boş yer kaldı.': 'Only {gb} GB is free on drive C:.',
  'Dosya kaydedildi': 'File saved',
  '{peer} dosya göndermek istiyor': '{peer} wants to send you a file',
  'Bir cihaz': 'A device',
  'Quick Share için ağ izni gerekiyor': 'Quick Share needs network access',
  'Bu Wi-Fi Windows’ta “Ortak ağ” olarak ayarlı. Telefonların bu bilgisayarı görmesi için ağı “Özel” yap.':
    'This Wi-Fi is set to “Public network” in Windows. Set it to “Private” so phones can see this computer.',
  'Telefonların bu bilgisayarı görmesi için Gönder kartında “Ağ izni ver”e bas.':
    'Press “Allow network access” on the Send card so phones can see this computer.',
  'Geçen haftanın özeti hazır.': 'Last week’s summary is ready.',
  '{n} bildirim daha': '{n} more notifications',
  // perf2 (P10, Settings → Performance): German, French, Spanish, Chinese in .qa/h100/lang-perf2.json
  'Bellek kullanımı': 'Memory use',
  'Düşük bellek modu': 'Low memory mode',
  'Grafik hızlandırmayı kapatır; Charles daha az bellek kullanır, hareketli animasyonlarda işlemciyi biraz daha çok kullanır. Charles yeniden başlatılınca geçerli olur.':
    'Turns graphics acceleration off: Charles uses less memory and a little more processor time during animations. Takes effect when Charles restarts.',
  // the second part of an update, a newer Electron (Settings → General → Updates; app/core/runtime-update.cjs):
  // German, French, Spanish, Chinese in .qa/h100/lang-runtime.json
  'Güncellemenin ikinci bölümü indiriliyor…': 'Downloading the second part of the update…',
  'Güncellemenin ikinci bölümü hazır.': 'The second part of the update is ready.',
  'Charles yeniden başlayınca birkaç saniyede kurulur.': 'It installs in a few seconds when Charles restarts.',
  'Şimdi yeniden başlat': 'Restart now',
  'Güncellemenin ikinci bölümü kuruldu.': 'The second part of the update is installed.',
  'Güncellemenin ikinci bölümü kurulamadı.': 'The second part of the update could not be installed.',
  'Güncellemenin ikinci bölümü indirilemedi.': 'The second part of the update could not be downloaded.',
  'İnternete bağlanılamadı; daha sonra yeniden denenecek.': 'Could not connect to the internet; Charles will try again later.',
  'Dosya şu an indirilemiyor; daha sonra yeniden denenecek.': 'The file cannot be downloaded right now; Charles will try again later.',
  'Dosya izin verilmeyen bir adresten istendi; durduruldu.': 'The file was requested from an address that is not allowed; stopped.',
  'İndirilen dosya doğrulanamadı; silindi.': 'The downloaded file could not be verified; it was deleted.',
  'Diskte yeterli boş yer yok; en az 1 GB gerekiyor.': 'There is not enough free disk space; at least 1 GB is needed.',
  'Charles önceki hâliyle açıldı.': 'Charles opened as it was before.',
  'Güncellemenin ikinci bölümü henüz hazır değil.': 'The second part of the update is not ready yet.',
  'Önce etkin yanıtı durdur, sonra yeniden başlat.': 'Stop the active answer first, then restart.',
  'Charles.exe bulunamadı.': 'Charles.exe was not found.',
};
export const patterns100Core: [RegExp, (...m: string[]) => string][] = [];
