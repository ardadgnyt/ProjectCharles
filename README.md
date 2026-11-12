<p align="center">
  <img src="docs/images/banner.png" alt="Project Charles — seven Slimes in different colours and accessories" width="100%">
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-v0.9.27%20release%20candidate-edc9a9?style=flat-square">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011%20x64-2b2f3a?style=flat-square">
  <a href="LICENSE"><img alt="License: GPL v3 or later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue?style=flat-square"></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-44-47848f?style=flat-square">
  <img alt="Interface languages: English, Turkish, German, French, Spanish, Chinese" src="https://img.shields.io/badge/UI-English%20%7C%20Turkish%20%7C%20German%20%7C%20French%20%7C%20Spanish%20%7C%20Chinese-2b2f3a?style=flat-square">
</p>

<p align="center">
  <a href="#install-and-update">Install</a> ·
  <a href="#highlights">Highlights</a> ·
  <a href="#modules">Modules</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="docs/USER-GUIDE.md">User guide</a>
</p>

**Charles** is a desktop AI companion for Windows. A small *island* sits at the top of your
screen with your AI quota, the weather, your music and important mail. Click it and it opens
into a chat and project workspace. Living on top of it all is **Slime**, a jelly character
who reacts to what you and the AI are doing: he thinks while the AI thinks, codes on a tiny
laptop while it writes code, and gets dizzy if you shake him too hard.

> Charles’s design is inspired by **Charles** from Sam Green’s *Epic Minequest* series on
> [YouTube](https://www.youtube.com/@SamGreen).

---

## Features

### The island

A big **voice chat** card (tap and talk; its bars follow your voice and Charles’), a message box
with dictation, Charles in the middle, the Spotify card, and four cards that open a panel below
them: **Files**, **AI usage**, **Weather** and **Tools**. While music plays, the closed island
shows the cover, the song and the artist.

<p align="center">
  <img src="docs/images/island.png" alt="The island: the voice chat card, the message box, Charles, the Spotify card and the Files, AI usage, Weather and Tools cards" width="720">
</p>

### Tools

The **Tools** card opens eight tools and your installed modules. Reminders, Calendar, Emails and
Smart home are the same cards as in the app window; Usage summary is the weekly summary from
Settings.

| Tool | What it does |
| --- | --- |
| **Color picker** | Pick a color anywhere on the screen with a magnifier (correct on HDR screens too), adjust it, copy it as HEX · RGB · HSL; four shades and your recent colors |
| **Timer** | Focus sessions with a task name, a break you choose when the focus ends, countdown and stopwatch; it keeps running on the closed island and can mute notifications |
| **Reminders** | Upcoming reminders, tick them off, add a new one; Charles can also add them by voice |
| **Calendar** | The month with Google / Outlook events, reminders and holidays; the day’s list; Edit opens the full editor |
| **Emails** | Important emails (or the newest ones); a click lets Charles explain the email in the chat |
| **Usage summary** | This week or last week: computer time, active use, Charles’ work, sessions, files, commands and your most used apps |
| **Smart home** | Your Home Assistant lights, plugs, sensors and scenes; switch them on the tile |
| **System monitor** | Live CPU, GPU and RAM charts with Current, Average and Peak values |

<p align="center">
  <img src="docs/images/tools.png" alt="The Tools panel on the island" width="720">
</p>

<p align="center">
  <img src="docs/images/tool-colors.png" alt="Color picker: saturation and hue, the selected color with four shades, HEX RGB HSL and recent colors" width="49%">
  <img src="docs/images/tool-timer.png" alt="Timer: a 50 minute focus with a 10 minute break, task name, sound and quiet switches" width="49%">
</p>
<p align="center">
  <img src="docs/images/tool-reminders.png" alt="Reminders: upcoming reminders with check boxes and times" width="49%">
  <img src="docs/images/tool-calendar.png" alt="Calendar: the month and the day's events" width="49%">
</p>
<p align="center">
  <img src="docs/images/tool-mail.png" alt="Emails: important emails with sender, subject and why they matter" width="49%">
  <img src="docs/images/tool-home-assistant.png" alt="Smart home: Home Assistant devices with switches" width="49%">
</p>
<p align="center">
  <img src="docs/images/tool-usage.png" alt="Usage summary: this week's computer time, Charles' work and the most used apps" width="49%">
</p>

### System monitor

Open **Tools → System monitor** to watch CPU, GPU and RAM side by side.

- **Current, Average, Peak:** pick what the big numbers show. The chart keeps running and marks the average or the peak.
- **1 min, 5 min, 1 hr:** the numbers and the chart always use the same range. A range that is not full yet says how long was really measured.
- **Pause and reset:** stop measuring for a moment, or clear the history.
- **Several GPUs:** a list lets you pick which one to follow.

Charles measures once a second while the monitor is on screen and every 5 seconds behind it, so
history is already there when you open it; **Measure in the background** turns that off. The last
hour stays in memory. Nothing is written to disk or sent anywhere, and time the computer slept
shows as a gap in the line.

Values come from Windows performance counters, so no driver or extra tool is needed. GPU load is
the busiest engine, as in Task Manager. GPU temperature and power appear when Windows reports them,
and power is a percentage rather than watts. CPU temperature has no reliable source and shows
**No data**. Tested on one NVIDIA GPU; several GPUs and other vendors have not been tested.

<p align="center">
  <img src="docs/images/system-monitor.png" alt="System monitor: CPU, GPU and RAM charts with the Average view selected, the 1 minute range and the background measuring switch. Real values from a test machine; the process list is hidden." width="640">
</p>

### Ask about what is on your screen

Hold Charles over a web page, a document or an email for a moment. A frame shows what he would
read. Let go, and only that one thing is read. A card above the message box then shows the title,
the app and how much was read, with **Summarize**, **Key points** and **What I need to do**; you
can also type your own question. Moving Charles without stopping is just a move, and **Esc** cancels.

Dropping him sends nothing to an AI. Content goes out only when you press a button or send a
question, and the card names the AI it goes to. While the card is open the content goes with each
question; **×** removes it. Text from a page or a file is treated as data, so instructions hidden
in it are not followed, and such a turn runs without tools.

No browser extension is needed. Charles uses the Windows accessibility interface, so he reads what
an app shares:

| Where | What is read |
| --- | --- |
| Chrome and Edge pages | The loaded text of the page in the active tab (no other tabs); parts that load while scrolling are left out |
| PDFs opened from this computer in Chrome or Edge | The whole file |
| Word and PowerPoint (`.docx`, `.pptx`, `.ppt`) | The saved file, with slide numbers and notes; unsaved changes are not included, and the card says so |
| Notepad and similar editors | The text in the window |
| Adobe Acrobat, and apps that share no text | A picture of that window, marked as the visible part only |
| Web mail | Read as a page |

Other browsers and desktop mail apps depend on what they share and have not been tested. Password
managers and windows with a password field in focus are not read.

<p align="center">
  <img src="docs/images/content-drop.png" alt="The card above the message box after Charles was dropped on a sample page: title, source, what was read, and the Summarize, Key points and What I need to do buttons. Real interface with sample content." width="560">
</p>

### Push to talk

Type with your voice in any app. Turn it on in **Settings → Shortcuts → Push to talk**.

- **Hold Right Arrow + Up Arrow together, speak, let go:** your words are typed at the cursor. Either
  key can go first.
- **Press the pair twice quickly:** hands-free recording; press it again to finish.
- **Esc:** cancels the recording or the text that is on its way.

You can choose another key or combination in the same place: one key, two keys pressed together, or
a combination with Ctrl, Alt, Shift or Win. While the feature is on, either arrow pressed alone still
does its normal job, a moment later. It is off by default and steps aside for full-screen apps such
as games.

Speech is turned into text by the local Whisper model. Audio stays on your computer and no
recording is kept. The clipboard is not used and Enter is never pressed. Password fields and apps
running as administrator are not typed into, and if the focus moves while you speak, the text waits
in a small card so you can copy it or insert it. The status bubble appears right under the island,
where notifications appear, and takes neither the keyboard nor the focus.

### Convert files on your desktop

Open **Files → Convert** (or drag a file onto the **Files** card: its Convert / Send tiles open
by themselves), choose an output format, then press **Convert**. Everything runs on your computer
and the result is saved beside the original.

- **Documents:** PDF, Word (DOCX, DOC, ODT, RTF), TXT, Markdown, HTML and EPUB into each other;
  PDF into DOCX, XLSX or PPTX; pages as PNG, JPEG or TIFF.
- **Spreadsheets and data:** XLSX, XLS, ODS, CSV, TSV and JSON, with sheet, range, separator,
  encoding and header choices; a sheet as a picture or PDF.
- **Presentations:** PPTX, PPT and ODP into each other and PDF; slides as pictures; text with or
  without speaker notes.
- **Scans:** text recognition with Windows' own OCR into a searchable PDF, TXT or DOCX, and
  tables into XLSX or CSV after you check them.
- **Pictures:** PNG, JPEG, WebP, BMP, TIFF, AVIF, HEIC, SVG, ICO and GIF, PNG or JPEG into a real
  SVG, several pictures into one animation or one PDF in your order.
- **Sound, video and speech:** MP3, WAV, FLAC, M4A, AAC, OGG, Opus, MP4, MKV, MOV, AVI and WebM
  with quality choices; clips to GIF or WebP; speech to TXT, DOCX, SRT or VTT with local Whisper.
- **Archives:** ZIP, 7z and TAR made and extracted, RAR extracted, always safely.

Only the formats the chosen files can become on this computer are offered. Word, Excel and
PowerPoint are used for their own formats when they are installed. See the
[User Guide](docs/USER-GUIDE.md#converting-files) for the full list.

<p align="center">
  <img src="docs/images/converter.png" alt="Files → Convert with a sample PDF: output formats grouped as document, data, presentation, image, text recognition and archive" width="720">
</p>

### File shelf

Keep files on the island until you need them. Open **Files → File shelf**, then:

- **Add files:** drag them onto the shelf. Charles keeps its own copy, so the original can move or disappear.
- **Paste a screenshot:** with the shelf on screen, press **Ctrl+V**. A picture on the clipboard is saved as a PNG with a preview.
- **Take them out:** drag a row to a folder or another program. It arrives as a real file, and the file’s picture and name follow the pointer on a transparent background.

Files stay on the shelf after a restart, until you remove them.

<p align="center">
  <img src="docs/images/file-shelf.png" alt="File shelf with sample files: each row shows a preview, the file name and its size" width="560">
</p>

### All Android devices with Quick Share

Open **Files → Send**, drop or choose files, and press **Send** beside a nearby device. Quick Share supports
two-way transfers between Android devices and computers on the same local
network. Charles remains discoverable while running when receiving is enabled, even with
the panel closed. An incoming request opens the accept/reject panel immediately.
Quick Share must be available and enabled on the Android device.

<p align="center">
  <img src="docs/images/sharing.png" alt="Files → Send with a sample picture, nearby devices with their own Send buttons, and the Receiving switch" width="720">
</p>

- **Receiving switch on:** enabled at startup; every file still needs your approval. It stays on while Slime sleeps or the sharing panel is closed.
- **Switch off:** disables receiving and visibility until you enable it again or restart Charles. Sending remains available.

<p align="center">
  <img src="docs/images/sharing-receive.png" alt="Incoming file request with a matching PIN and Accept / Decline buttons" width="720">
</p>

Received files go to Downloads; an existing file with the same name is preserved. Transfers have
been tested successfully on Samsung and other Android brands. Apple devices (iPhone, iPad and Mac)
use the **LocalSend app** to share files with Charles on the same local network. Native Apple
AirDrop/AWDL is not supported on Windows.

*Screenshots use sample file, device and status data.* [Sharing guide](docs/SHARING.md)

## Highlights

### An assistant that does things

- **Island:** a thin strip at the top of the screen (a small notch with music controls while
  a song plays) opens into the home page and grows down into the chat.
- **Converter:** drop files on the island to turn them into other formats: pictures, audio,
  video, Word/Markdown/PDF text, CSV/JSON, subtitles, ZIP. Offline, saved next to the original.
- **Your own AI accounts:** chat with **ChatGPT (Codex)**, **Claude**, **Antigravity**, **Cursor** or
  **Abacus AI** and switch models from the message box. Pictures work with GPT, Claude and
  Antigravity. Long chats keep their whole history, even on models without a thread of their own.
- **Projects:** chats in a project know each other. Charles sees the project’s instructions
  and what was said and decided in its other chats. Folders keep everything else tidy.
- **Project mode:** pick a folder and let the AI write code in it, with your approval first.
- **Right-click on text:** select text in a message, a code block or a text box and right-click
  for **Copy**, **Paste** and **Ask Charles**. Ask Charles puts the selection in the message box as
  a quote and waits for your question.
- **WhatsApp in Charles** *(experimental)*: link WhatsApp once with a QR code. New messages
  appear under the island, with quick replies and a reply box; nothing is sent until you press
  send. Typed or spoken *“send Mom ‘I’m on my way’ on WhatsApp”* works too.
- **Voice:** say **“Hey Charles”**. Gemini Live for real-time talk, local Whisper for dictation,
  and a microphone button that switches all listening off.
- **Mail and calendar:** Gmail, Google Calendar, Outlook or any POP3/IMAP mailbox. Important
  mail appears as a bubble under the island and opens in its own chat.
- **Notifications that stay visible:** WhatsApp, mail and reminder cards appear under the island,
  beside a tall panel, or in the corner of the app window, without taking the keyboard from what
  you are typing.
- **App window:** chats with projects and folders, an overview you arrange yourself (Spotify,
  reminders, calendar, mail, smart home, usage, system, notes, quick commands, **modules**),
  and a side panel for files, code and terminal output.
- **Modules:** add tools that open in their own window from a `.zip` (study planner, downloads,
  a game master…). Every ability goes through a permission you approve. Modules can use
  Charles’ own Slime, his reactions and accessories ([docs/MODULES.md](docs/MODULES.md)).
- **Updates you can read:** after an update, a card opens what changed in that version. The notes
  come from your computer, so they work with no AI; **Let Charles explain** is optional.
- **Little things:** copy formulas as LaTeX or Word equations, add instructions while the AI is
  still working, reminders and focus timers, weather, screen capture, Home Assistant, and
  in-app updates from GitHub.

### A character with personality

- More than 20 expressions and work animations: in love, dizzy, sleeping, researching with a
  magnifier, coding, drawing, getting an idea 💡 and more.
- **Slime studio:** seven colours, a moustache, and hats, glasses and other accessories to mix
  and match. Seasonal hats come on their own.
- **Desktop pet:** drag Slime onto your desktop, throw him and watch him bounce like jelly. From
  the app window or the open island he leaves his place empty and everything else stays where it
  is; double-click him to send him home. After reading a page or document he goes back by himself.
- Interface in **English, Turkish, German, French, Spanish and Chinese**.

## Modules

<p align="center">
  <img src="docs/images/modules.png" alt="Three modules in their own windows: Study with Charles, FRP and Charles Download" width="100%">
</p>

Modules add whole new tools to Charles, each in its own window: **Study with Charles** (courses,
sources, a tutor that reads them, focus timer, exam countdown), **FRP** (Charles runs your
tabletop game or helps the GM) and **Charles Download** (videos, audio or just the part you
want). Install them from a `.zip` in **Settings → Modules**; the open ones are one click away on
the **Modules** card of the overview.

**Get the official modules:** [**Releases → Modules**](https://github.com/ardadgnyt/ProjectCharles/releases#release-Modules)

**Build your own:** anyone can make a module. A module is a small web page with a
`manifest.json`; through Charles it can ask the user’s AI (with pictures), create images, speak,
keep its own files, show notifications, use Charles’ download engine, and draw Slime with his
accessories, reactions and cursor tracking — every ability behind a permission the user
approves. See [docs/MODULES.md](docs/MODULES.md).

### AI usage and weather

**AI usage** shows every connected AI (Codex, Claude, Antigravity, Cursor, Abacus AI, EVREN, Kimi, GitHub Copilot, OpenCode)
with its two windows and when they reset. **Weather** shows the current conditions, the next
hours, today and the next five days; the location button changes the city.

<p align="center">
  <img src="docs/images/usage.png" alt="AI usage panel: Codex, Claude, Antigravity, Cursor, Abacus AI and EVREN with remaining-usage rings" width="49%">
  <img src="docs/images/weather.png" alt="Weather panel: current conditions, hourly forecast, today and the next five days" width="49%">
</p>

## Screenshots

<p align="center">
  <img src="docs/images/workspace.png" alt="The Charles app window: chats in folders and projects, and the Spotify, reminders, calendar, important emails and smart home cards" width="100%">
</p>

<p align="center">
  <img src="docs/images/workspace-editors.png" alt="The calendar editor over the app window" width="49%">
  <img src="docs/images/workspace-home.png" alt="The smart home layout editor over the app window" width="49%">
</p>

<p align="center">
  <img src="docs/images/expressions-grid.png" alt="Twelve Slime expressions and work animations" width="100%">
</p>

## Install and update

Download **CharlesSetup.exe** from [**Releases**](../../releases). There is no zip to unpack and no
command window: the setup is one program.

<table>
<tr><td width="50%" valign="top">

#### 🇬🇧 English

1. Download **CharlesSetup.exe** from [**Releases**](../../releases) and double-click it.
2. Choose English or Turkish, read and accept the license, choose a folder, then press **Install**.
3. Start Charles and sign in with your AI account in **Settings → AI models**.

**Requirements:** Windows 10 or 11 (64-bit) and about 3 GB of free space. No administrator rights
needed.

**Windows warning:** the setup is not code-signed yet, so Windows SmartScreen may warn you. If you
trust where the file came from, choose **More info → Run anyway**.

**Where it goes:** a new install goes to `%LOCALAPPDATA%\Programs\Charles`; if the setup finds your
Charles folder, it offers that one. It creates Start menu and Desktop shortcuts. The setup opens in
Turkish on a Turkish Windows and in English otherwise; Charles keeps its own language setting.

**Updating:** use **Settings → General → Updates** inside Charles, or run CharlesSetup.exe on your
Charles folder. The in-app update works reliably from v0.8.2 on; on older versions use the setup once.

**Removing:** use **Windows Settings → Apps → Charles**. Your data stays unless you tick the separate
box to delete it. Your chats, settings and keys are kept in `%APPDATA%\Charles`.

</td><td width="50%" valign="top">

#### 🇹🇷 Türkçe <a id="kurulum-ve-güncelleme"></a>

1. **CharlesSetup.exe** dosyasını [**Releases**](../../releases) sayfasından indirin ve çift tıklayın.
2. Türkçe veya İngilizce seçin, lisansı okuyup kabul edin, klasörü seçin ve **Kur** düğmesine basın.
3. Charles’ı başlatın ve **Ayarlar → Yapay zekâ modelleri** bölümünden yapay zekâ hesabınızla giriş yapın.

**Gereksinimler:** Windows 10 veya 11 (64-bit) ve yaklaşık 3 GB boş alan. Yönetici izni gerekmez.

**Windows uyarısı:** kurulum henüz kod imzalı değildir, bu yüzden Windows SmartScreen uyarı verebilir.
Dosyanın kaynağına güveniyorsanız **Daha fazla bilgi → Yine de çalıştır** seçeneğini belirleyin.

**Nereye kurulur:** yeni kurulum `%LOCALAPPDATA%\Programs\Charles` klasörüne yapılır; kurulum Charles
klasörünüzü bulursa onu önerir. Başlat menüsü ve Masaüstü kısayolları oluşturur. Kurulum, Windows’unuz
Türkçeyse Türkçe, değilse İngilizce açılır; Charles kendi dil ayarını korur. Lisans metinleri
İngilizcedir, onaylanmış bir Türkçe çevirisi yoktur.

**Güncelleme:** Charles içinde **Ayarlar → Genel → Güncellemeler** bölümünü kullanın ya da
CharlesSetup.exe dosyasını Charles klasörünüzde çalıştırın. Uygulama içi güncelleme v0.8.2’den itibaren
kararlı çalışır; daha eski sürümlerde bir kez kurulumu kullanın.

**Kaldırma:** **Windows Ayarları → Uygulamalar → Charles** bölümünü kullanın. Verileriniz, ayrıca
işaretlemediğiniz sürece silinmez. Sohbetleriniz, ayarlarınız ve anahtarlarınız
`%APPDATA%\Charles` dizininde durur.

</td></tr>
<tr><td valign="top">

#### 🇩🇪 Deutsch

1. Lade **CharlesSetup.exe** unter [**Releases**](../../releases) herunter und doppelklicke darauf.
2. Wähle Englisch oder Türkisch, lies und akzeptiere die Lizenz, wähle einen Ordner und klicke auf **Install**.
3. Starte Charles und melde dich unter **Einstellungen → KI-Modelle** mit deinem KI-Konto an.

**Voraussetzungen:** Windows 10 oder 11 (64-Bit) und etwa 3 GB freier Speicherplatz. Es sind keine
Administratorrechte erforderlich.

**Windows-Warnung:** Das Setup ist noch nicht codesigniert, daher kann Windows SmartScreen warnen.
Wenn du der Quelle der Datei vertraust, wähle **Weitere Informationen → Trotzdem ausführen**.

**Speicherort:** Eine neue Installation landet in `%LOCALAPPDATA%\Programs\Charles`; findet das Setup
deinen Charles-Ordner, schlägt es diesen vor. Es legt Verknüpfungen im Startmenü und auf dem Desktop
an. Das Setup selbst gibt es nur auf Englisch und Türkisch; Charles behält seine eigene
Spracheinstellung.

**Aktualisieren:** Nutze **Einstellungen → Allgemein → Updates** in Charles oder führe CharlesSetup.exe
für deinen Charles-Ordner aus. Das In-App-Update funktioniert ab v0.8.2 zuverlässig; bei älteren
Versionen nutze einmal das Setup.

**Entfernen:** Nutze **Windows-Einstellungen → Apps → Charles**. Deine Daten bleiben erhalten, solange
du nicht das separate Kästchen zum Löschen ankreuzt. Chats, Einstellungen und Schlüssel liegen in
`%APPDATA%\Charles`.

</td><td valign="top">

#### 🇫🇷 Français

1. Téléchargez **CharlesSetup.exe** depuis [**Releases**](../../releases) et double-cliquez dessus.
2. Choisissez l’anglais ou le turc, lisez et acceptez la licence, choisissez un dossier et cliquez sur **Install**.
3. Lancez Charles et connectez-vous à votre compte d’IA dans **Réglages → Modèles d’IA**.

**Configuration requise :** Windows 10 ou 11 (64 bits) et environ 3 Go d’espace libre. Aucun droit
d’administrateur n’est requis.

**Avertissement de Windows :** l’installateur n’est pas encore signé, Windows SmartScreen peut donc
afficher un avertissement. Si vous faites confiance à la provenance du fichier, sélectionnez
**Informations complémentaires → Exécuter quand même**.

**Emplacement :** une nouvelle installation va dans `%LOCALAPPDATA%\Programs\Charles` ; si
l’installateur trouve votre dossier Charles, il le propose. Il crée des raccourcis dans le menu
Démarrer et sur le Bureau. L’installateur existe seulement en anglais et en turc ; Charles garde son
propre réglage de langue.

**Mise à jour :** utilisez **Réglages → Général → Mises à jour** dans Charles, ou lancez
CharlesSetup.exe sur votre dossier Charles. La mise à jour intégrée fonctionne de façon fiable depuis
la v0.8.2 ; sur les versions plus anciennes, utilisez une fois l’installateur.

**Désinstallation :** utilisez **Paramètres Windows → Applications → Charles**. Vos données restent
en place, sauf si vous cochez la case distincte pour les supprimer. Vos discussions, paramètres et
clés se trouvent dans `%APPDATA%\Charles`.

</td></tr>
<tr><td valign="top">

#### 🇪🇸 Español

1. Descarga **CharlesSetup.exe** desde [**Releases**](../../releases) y haz doble clic en él.
2. Elige inglés o turco, lee y acepta la licencia, elige una carpeta y pulsa **Install**.
3. Inicia Charles y entra con tu cuenta de IA en **Ajustes → Modelos de IA**.

**Requisitos:** Windows 10 u 11 (64 bits) y unos 3 GB de espacio libre. No se necesitan privilegios de
administrador.

**Aviso de Windows:** el instalador aún no tiene firma de código, así que Windows SmartScreen puede
mostrar un aviso. Si confías en el origen del archivo, selecciona **Más información → Ejecutar de
todas formas**.

**Ubicación:** una instalación nueva va a `%LOCALAPPDATA%\Programs\Charles`; si el instalador encuentra
tu carpeta de Charles, la propone. Crea accesos directos en el menú Inicio y en el Escritorio. El
instalador solo está en inglés y turco; Charles conserva su propio ajuste de idioma.

**Actualizar:** usa **Ajustes → General → Actualizaciones** dentro de Charles, o ejecuta
CharlesSetup.exe sobre tu carpeta de Charles. La actualización integrada funciona de forma estable
desde la v0.8.2; en versiones anteriores usa el instalador una vez.

**Desinstalar:** usa **Configuración de Windows → Aplicaciones → Charles**. Tus datos se conservan
salvo que marques la casilla aparte para borrarlos. Tus chats, ajustes y claves están en
`%APPDATA%\Charles`.

</td><td valign="top">

#### 🇨🇳 简体中文

1. 从 [**Releases**](../../releases) 下载 **CharlesSetup.exe** 并双击运行。
2. 选择英语或土耳其语，阅读并接受许可协议，选择文件夹，然后点击 **Install**。
3. 启动 Charles，在 **设置 → AI 模型** 中登录您的 AI 账户。

**系统要求：** Windows 10 或 11（64 位），约 3 GB 可用空间。无需管理员权限。

**Windows 提示：** 安装程序尚未进行代码签名，因此 Windows SmartScreen 可能会显示警告。如果您信任文件来源，请选择“更多信息” (More info) → “仍要运行” (Run anyway)。

**安装位置：** 全新安装的目录为 `%LOCALAPPDATA%\Programs\Charles`；如果安装程序找到您的 Charles 文件夹，会建议使用该文件夹。它会创建开始菜单和桌面快捷方式。安装程序只有英语和土耳其语界面；Charles 保留自己的语言设置。

**更新：** 在 Charles 中打开 **设置 → 常规 → 更新**，或在您的 Charles 文件夹上运行 CharlesSetup.exe。应用内更新自 v0.8.2 起可稳定使用；更早的版本请先用安装程序安装一次。

**卸载：** 打开 **Windows 设置 → 应用 → Charles**。除非您勾选单独的删除选项，否则数据会保留。您的聊天记录、设置和密钥保存在 `%APPDATA%\Charles` 目录下。

</td></tr>
</table>

| File · Dosya | What it does · Ne yapar |
| --- | --- |
| `CharlesSetup.exe` | Installs Charles · Charles’ı kurar |
| `Uninstall Charles.exe` | Removes Charles (also in Windows Settings → Apps) · Charles’ı kaldırır (Windows Ayarları → Uygulamalar’da da var) |
| `setup/Create-Desktop-Shortcut.vbs` | Desktop shortcut for this folder · Bu klasör için masaüstü kısayolu |
| `setup/Reset-Charles.cmd` | Backs up and resets settings and chats (asks first) · Ayarları ve sohbetleri yedekleyip sıfırlar (önce sorar) |
| `Start-Charles.cmd` | Starts Charles from its folder · Charles’ı klasöründen başlatır |

## Running from source

The repository holds the source code and the download tools for Charles Download
(`tools/download/`: yt-dlp and FFmpeg, see `licenses/download/`); `node_modules/`, `dist/`, the
speech models and the other helper tools are created or downloaded on your machine. You need
[Node.js](https://nodejs.org) 22 or newer.

```cmd
git clone https://github.com/HzPederPan/ProjectCharles.git
cd ProjectCharles
npm ci
npm run setup
npm run build
npm start
```

| Command | Purpose |
| --- | --- |
| `npm run setup:voice` | Optional: whisper.cpp and the speech model (~500 MB) |
| `npm test` | Automated tests |
| `npm run dev` | Build the interface and start Electron |
| `python scripts/setup-pack.py <folder>` | `CharlesSetup.exe` + `.sha256` |
| `npm run release:pack` | `charles-update-<version>.zip` + `.sha256` for in-place updates |

The Antigravity and Cursor sign-in helpers come with the release package. Abacus AI
uses its own `abacusai` command line tool
([setup page](https://abacus.ai/help/abacusai-desktop/cli-installation)).

## Your data and privacy

- Chats, memory, settings and **all keys and account connections** live in
  **`%APPDATA%\Charles`**, never in the app folder; keys are encrypted with Windows (DPAPI).
- Updates and new installs keep your data. **Settings → Account** opens this folder and can
  remove connections or reset everything (it asks first and keeps a backup).
- Mail, calendar and Drive connections are **read-only**; incoming content never runs
  commands.
- **WhatsApp** messages stay in memory only. The open-source gateway is downloaded only when you
  turn the feature on, checked against its SHA-256 and runs on this computer only.
- The microphone button turns off Hey Charles, dictation, push to talk and voice chat. Your
  messages go only to the AI provider you choose.
- **Push to talk** uses local speech recognition. **System monitor** readings stay in memory.
  **Dropping Charles on content** reads it only at that moment, never in the background, and it
  leaves your computer only when you send a question.

## Project layout

```text
ProjectCharles/
├── Start-Charles.cmd     start Charles from this folder
├── setup/                installer, shortcut, reset
├── app/                  Electron main process: AI, plugins, modules, voice
├── src/                  interface (TypeScript) → dist/renderer.js
│   ├── vendor/slime/     the Slime character
│   └── module-kit/       Slime for module windows
├── public/               HTML, CSS, sounds, icons
├── scripts/              build, packaging, voice setup
├── test/                 automated tests
└── docs/                 guides and README images
```

## Documentation

| Document | Contents |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | What changed in every version (English from v0.9.18; older entries are in Turkish) |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Code tour, data files, build and test |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Chat, project mode, voice, Slime, settings, shortcuts |
| [docs/SHARING.md](docs/SHARING.md) | Quick Share and LocalSend |
| [docs/PLUGINS-SETUP.md](docs/PLUGINS-SETUP.md) | Google, Microsoft, mail, Home Assistant |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the parts fit together |
| [docs/MODULES.md](docs/MODULES.md) | Writing modules: package, permissions, API, Slime kit |
| [docs/UPDATES.md](docs/UPDATES.md) | In-place updates from GitHub Releases |

## Credits

- Charles’s design is inspired by **Charles** from the *Epic Minequest* series on
  [Sam Green’s YouTube channel](https://www.youtube.com/@SamGreen). Project Charles is a
  fan-inspired, independent project, not affiliated with or endorsed by Sam Green.

## License

Copyright © 2026 **HzPederPan**.

The source code is licensed under **GNU GPL v3 or later**. You may use, modify
and redistribute it under that license, including commercially. Distributed
builds include the corresponding Charles source and build scripts. Third-party
components retain their notices. Artwork and names are described separately in
[LICENSE-ASSETS.md](LICENSE-ASSETS.md). See also [LICENSE](LICENSE) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Charles is an independent project. It is not affiliated with OpenAI, Anthropic, Google,
Cursor, Abacus AI or WhatsApp.
