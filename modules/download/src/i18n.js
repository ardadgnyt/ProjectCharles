// Charles Download — UI strings. Key: Turkish text. Values: en, de, fr, es, zh.
(() => {
  'use strict';
  const langs = ['tr', 'en', 'de', 'fr', 'es', 'zh'];
  const S = {
    'Charles Download': ['Charles Download', 'Charles Download', 'Charles Download', 'Charles Download', 'Charles Download'],
    'Bağlantı bulundu': ['Link found', 'Link gefunden', 'Lien trouvé', 'Enlace encontrado', '发现链接'],
    'Video bulundu': ['Video found', 'Video gefunden', 'Vidéo trouvée', 'Vídeo encontrado', '发现视频'],
    'Ses bulundu': ['Audio found', 'Audio gefunden', 'Audio trouvé', 'Audio encontrado', '发现音频'],
    'Dosya bulundu': ['File found', 'Datei gefunden', 'Fichier trouvé', 'Archivo encontrado', '发现文件'],
    'Bağlantı inceleniyor…': ['Checking link…', 'Link wird geprüft…', 'Analyse du lien…', 'Analizando enlace…', '正在检查链接…'],
    'Bağlantı açılamadı': ['Couldn’t open link', 'Link nicht lesbar', 'Lien illisible', 'No se pudo abrir', '无法打开链接'],
    'Tekrar dene': ['Try again', 'Erneut', 'Réessayer', 'Reintentar', '重试'],
    'Video indir': ['Video', 'Video', 'Vidéo', 'Vídeo', '视频'],
    'Ses indir': ['Audio', 'Audio', 'Audio', 'Audio', '音频'],
    'Video kes': ['Trim', 'Schneiden', 'Découper', 'Recortar', '剪辑'],
    'Ses kes': ['Trim audio', 'Schneiden', 'Découper', 'Recortar', '剪辑'],
    'Dosyayı indir': ['Download file', 'Datei laden', 'Télécharger', 'Descargar archivo', '下载文件'],
    'Tüm seçenekler': ['All options', 'Alle Optionen', 'Toutes les options', 'Todas las opciones', '全部选项'],
    'Kalite seç': ['Choose quality', 'Qualität wählen', 'Choisir la qualité', 'Elegir calidad', '选择画质'],
    'Kapat': ['Close', 'Schließen', 'Fermer', 'Cerrar', '关闭'],
    'Gizle': ['Hide', 'Ausblenden', 'Masquer', 'Ocultar', '隐藏'],
    'Kesi kaydet': ['Save clip', 'Clip speichern', 'Enregistrer', 'Guardar clip', '保存片段'],
    'MP4 (Video)': ['MP4 (Video)', 'MP4 (Video)', 'MP4 (Vidéo)', 'MP4 (Vídeo)', 'MP4（视频）'],
    'MP3 (Ses)': ['MP3 (Audio)', 'MP3 (Audio)', 'MP3 (Audio)', 'MP3 (Audio)', 'MP3（音频）'],
    'Başlangıç': ['Start', 'Start', 'Début', 'Inicio', '开始'],
    'Bitiş': ['End', 'Ende', 'Fin', 'Fin', '结束'],
    'seçildi': ['selected', 'ausgewählt', 'sélectionné', 'seleccionado', '已选'],
    'Süre bilinmiyor': ['Unknown length', 'Dauer unbekannt', 'Durée inconnue', 'Duración desconocida', '时长未知'],
    'Sırada': ['Queued', 'Wartet', 'En attente', 'En cola', '排队中'],
    'İndiriliyor': ['Downloading', 'Lädt', 'Téléchargement', 'Descargando', '下载中'],
    'Duraklatılıyor': ['Pausing', 'Pausiert…', 'Pause…', 'Pausando', '正在暂停'],
    'Duraklatıldı': ['Paused', 'Pausiert', 'En pause', 'En pausa', '已暂停'],
    'İptal edildi': ['Canceled', 'Abgebrochen', 'Annulé', 'Cancelado', '已取消'],
    'İndirme başarısız': ['Download failed', 'Download fehlgeschlagen', 'Échec du téléchargement', 'Descarga fallida', '下载失败'],
    'Video kesiliyor…': ['Trimming video…', 'Video wird geschnitten…', 'Découpage…', 'Recortando vídeo…', '正在剪辑视频…'],
    'Ses kesiliyor…': ['Trimming audio…', 'Audio wird geschnitten…', 'Découpage…', 'Recortando audio…', '正在剪辑音频…'],
    'Dönüştürülüyor…': ['Converting…', 'Wird konvertiert…', 'Conversion…', 'Convirtiendo…', '正在转换…'],
    'Video kaydedildi': ['Video saved', 'Video gespeichert', 'Vidéo enregistrée', 'Vídeo guardado', '视频已保存'],
    'Ses kaydedildi': ['Audio saved', 'Audio gespeichert', 'Audio enregistré', 'Audio guardado', '音频已保存'],
    'Dosya kaydedildi': ['File saved', 'Datei gespeichert', 'Fichier enregistré', 'Archivo guardado', '文件已保存'],
    'Klip': ['Clip', 'Clip', 'Clip', 'Clip', '片段'],
    'Duraklat': ['Pause', 'Pausieren', 'Pause', 'Pausar', '暂停'],
    'Devam et': ['Resume', 'Fortsetzen', 'Reprendre', 'Reanudar', '继续'],
    'İptal et': ['Cancel', 'Abbrechen', 'Annuler', 'Cancelar', '取消'],
    'Klasörde göster': ['Show in folder', 'Im Ordner zeigen', 'Afficher dans le dossier', 'Mostrar en carpeta', '在文件夹中显示'],
    'İndirmeleri aç': ['Open downloads', 'Downloads öffnen', 'Ouvrir', 'Abrir descargas', '打开下载'],
    'indirme daha': ['more downloads', 'weitere', 'de plus', 'más', '个下载'],
    'Bir bağlantı. İstediğin kısım.': ['One link. The part you want.', 'Ein Link. Dein Ausschnitt.', 'Un lien. Le passage voulu.', 'Un enlace. La parte que quieres.', '一个链接，取你想要的部分。'],
    'Video veya dosya bağlantısını yapıştır': ['Paste a video or file link', 'Video- oder Dateilink einfügen', 'Collez un lien vidéo ou fichier', 'Pega un enlace de vídeo o archivo', '粘贴视频或文件链接'],
    'Panodan yapıştır': ['Paste from clipboard', 'Aus Zwischenablage', 'Coller', 'Pegar del portapapeles', '从剪贴板粘贴'],
    'Getir': ['Fetch', 'Laden', 'Charger', 'Obtener', '获取'],
    'Kopyalanan bağlantıları yakala': ['Catch copied links', 'Kopierte Links erkennen', 'Détecter les liens copiés', 'Detectar enlaces copiados', '捕获复制的链接'],
    'İndirmeler': ['Downloads', 'Downloads', 'Téléchargements', 'Descargas', '下载'],
    'Tümü': ['All', 'Alle', 'Tous', 'Todo', '全部'],
    'Devam eden': ['Active', 'Aktiv', 'En cours', 'Activas', '进行中'],
    'Tamamlanan': ['Done', 'Fertig', 'Terminés', 'Completadas', '已完成'],
    'Henüz indirme yok': ['No downloads yet', 'Noch keine Downloads', 'Aucun téléchargement', 'Aún no hay descargas', '暂无下载'],
    'Bir bağlantı kopyala; Charles adacığın altında sorar.': ['Copy a link; Charles will ask under the island.', 'Kopiere einen Link; Charles fragt unter der Insel.', 'Copiez un lien ; Charles proposera sous l’îlot.', 'Copia un enlace; Charles preguntará bajo la isla.', '复制链接后，Charles 会在岛下方询问。'],
    'Kayıt klasörü': ['Save folder', 'Speicherordner', 'Dossier', 'Carpeta', '保存文件夹'],
    'Değiştir': ['Change', 'Ändern', 'Modifier', 'Cambiar', '更改'],
    'İndirme klasörünü aç': ['Open download folder', 'Downloadordner öffnen', 'Ouvrir le dossier', 'Abrir carpeta', '打开下载文件夹'],
    'Motor hazır': ['Engine ready', 'Bereit', 'Prêt', 'Listo', '已就绪'],
    'Araçlar eksik': ['Tools missing', 'Werkzeuge fehlen', 'Outils manquants', 'Faltan herramientas', '缺少工具'],
    'Host eklentisi gerekli': ['Host extension required', 'Host-Erweiterung nötig', 'Extension hôte requise', 'Se requiere extensión', '需要主机扩展'],
    'İndirme araçları (yt-dlp, FFmpeg) Charles’ta bulunamadı. Charles güncellemesi gerekiyor.': ['Download tools (yt-dlp, FFmpeg) were not found in Charles. A Charles update is required.', 'Download-Werkzeuge (yt-dlp, FFmpeg) fehlen in Charles. Ein Charles-Update ist nötig.', 'Les outils (yt-dlp, FFmpeg) sont introuvables dans Charles. Une mise à jour est requise.', 'Charles no tiene las herramientas (yt-dlp, FFmpeg). Se requiere una actualización.', 'Charles 中未找到下载工具（yt-dlp、FFmpeg），需要更新 Charles。'],
    'Bu Charles sürümü indirme altyapısını içermiyor. Charles’ı güncelle ve yeniden başlat.': ['This Charles version has no download host. Update and restart Charles.', 'Diese Charles-Version hat keinen Download-Host. Aktualisiere und starte Charles neu.', 'Cette version de Charles n’inclut pas l’hôte. Mettez à jour et redémarrez.', 'Esta versión de Charles no incluye el host. Actualiza y reinicia.', '此版本 Charles 不含下载主机，请更新并重启。'],
    'Zamanı saniye veya SS:DD:SN biçiminde yaz.': ['Enter time as seconds or HH:MM:SS.', 'Zeit als Sekunden oder HH:MM:SS.', 'Temps en secondes ou HH:MM:SS.', 'Tiempo en segundos o HH:MM:SS.', '请输入秒数或 时:分:秒。'],
    'Başlangıç bitişten önce olmalı.': ['Start must be before end.', 'Start muss vor dem Ende liegen.', 'Le début doit précéder la fin.', 'El inicio debe ser antes del fin.', '开始须早于结束。'],
    'Ses kalitesi': ['Audio quality', 'Audioqualität', 'Qualité audio', 'Calidad de audio', '音质'],
    'Video kalitesi': ['Video quality', 'Videoqualität', 'Qualité vidéo', 'Calidad de vídeo', '画质'],
    'Kesim başlangıcı': ['Clip start', 'Clip-Start', 'Début du clip', 'Inicio del clip', '片段开始'],
    'Kesim bitişi': ['Clip end', 'Clip-Ende', 'Fin du clip', 'Fin del clip', '片段结束'],
    'Bağlantıyı aç': ['Open link', 'Link öffnen', 'Ouvrir', 'Abrir', '打开'],
  };
  let language = 'tr';
  const t = (s) => {
    if (language === 'tr') return s;
    const row = S[s];
    return row ? row[langs.indexOf(language) - 1] || row[0] : s;
  };
  // Durations like "1 dk 18 sn", "52 sn", "1 sa 4 dk".
  const units = {
    tr: ['sa', 'dk', 'sn'], en: ['h', 'm', 's'], de: ['Std', 'Min', 'Sek'], fr: ['h', 'min', 's'], es: ['h', 'min', 's'], zh: ['小时', '分', '秒'],
  };
  function span(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const [H, M, Sx] = units[language] || units.en;
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    const tight = language === 'en' || language === 'zh';
    const j = (n, u) => (tight ? n + u : n + ' ' + u);
    if (h) return j(h, H) + ' ' + j(m, M);
    if (m) return j(m, M) + (s ? ' ' + j(s, Sx) : '');
    return j(s, Sx);
  }
  const percent = (n) => (language === 'tr' ? '%' + Math.round(n) : Math.round(n) + '%');
  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    for (const el of root.querySelectorAll('[data-t-title]')) { el.title = t(el.dataset.tTitle); el.setAttribute('aria-label', el.title); }
    for (const el of root.querySelectorAll('[data-t-placeholder]')) el.placeholder = t(el.dataset.tPlaceholder);
  }
  function setLanguage(lang) {
    lang = langs.includes(lang) ? lang : 'en';
    language = lang;
    document.documentElement.lang = lang;
    apply();
  }
  window.downloadI18n = { t, span, percent, apply, setLanguage, get language() { return language; } };
})();
