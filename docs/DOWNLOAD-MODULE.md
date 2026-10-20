# Charles Download — v0.8.1 Beta

Charles Download is a separate module (download-1.0.0.zip). The host bridge ships with Charles 0.8.1.

## Install / Kurulum

1. Install Charles 0.8.1 Beta and restart Charles after updating.
2. Settings → Modules → Load module → select `modules-bundled/download-1.0.0.zip` from the Charles folder.
3. Open Charles Download. Copy a supported video/file URL, or paste any HTTP/HTTPS URL into the module.
4. Choose MP4, MP3 or direct file; select quality and optionally a time range; click Download.

Türkçe: **Ayarlar → Modüller → Modül yükle** ile Charles klasöründeki
`modules-bundled/download-1.0.0.zip` dosyasını seç. Modülü aç; bağlantıyı yapıştır veya
kopyala. MP4/MP3 ve kaliteyi seç, istersen **Bölüm seç** ile başlangıç/bitiş belirle.
**İndirmeye başla / Kesiti kaydet** düğmesine bas.

## Behavior and limits

- Windows clipboard monitoring is local, URL-only and can be disabled in the module.
  Only supported media hostnames and recognized file extensions trigger automatic cards.
  Other URLs can be entered manually. Copying never starts a download by itself.
- MP4 uses H.264/AAC and MP3 uses 128, 192 or 320 kbps. Available video resolutions come from yt-dlp.
- Precise cuts currently download the source first, then encode the selected interval.
  Large/high-resolution sources need enough temporary disk space and conversion time.
- Direct downloads resume using HTTP Range and If-Range. Without server support they restart.
  Media downloads resume when yt-dlp/source supports it. Converting can be canceled, not paused.
- Two simultaneous jobs, up to 50 unfinished jobs, last 200 records persisted.
- No DRM bypass, login/cookie import, live-stream recording, GIF export, browser-extension
  interception or inline video/audio preview in this version. Site support depends on yt-dlp.
- Download only content you are authorized to save.

## Architecture and data

`app/modules/download/engine.cjs` owns queue, child processes, validation and files.
`bridge.cjs` owns clipboard polling, the floating card and native folder dialogs.
Only the enabled module with id `download` can call `window.charlesModule.download`.
Existing top-frame sender checks and rate limits still apply. Module HTML has no Node.js
or direct network access; it cannot choose arbitrary commands or open downloaded executables.
Treat installing/replacing the first-party `download` module as granting download/clipboard access.

Default output: Windows Downloads/Charles. Settings, queue and temporary media:
`%APPDATA%/Charles/module-data/download/engine/`.
Executables: `tools/download/yt-dlp.exe`, `tools/download/ffmpeg.exe`.
The bundled `tools/cursor/node.exe` provides yt-dlp's JavaScript runtime when available.
The module package contains only HTML/JS/CSS/SVG/JSON; native tools stay outside its sandbox.

## Source setup

The separate charles-download-module project provides:

```powershell
npm install
npm run setup:tools
npm test
npm run pack
node scripts/install-host.cjs "C:\Path\To\ProjectCharles"
```

Tools are downloaded from the upstream release channels. yt-dlp's SHA256 is checked.
The host installer backs up the two modified module-bridge files before patching.
After a host update, restart Charles. Existing chats/settings and the FRP module are preserved.
See THIRD-PARTY-NOTICES.md for tool licenses and source links.

From a ProjectCharles checkout, run `npm run setup:download` to install the verified native tools. Then `npm run build` creates the bundled module ZIP.
