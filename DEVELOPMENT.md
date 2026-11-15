# Project Charles — Developer guide

Idea and direction: **HzPederPan**

Charles’s design is inspired by Charles from the *Epic Minequest* series on
[Sam Green’s YouTube channel](https://www.youtube.com/@SamGreen). The project is independent and
has no connection with Sam Green.

This guide explains where things are in the source, how the app works, and how to build and test a
change. For installation see `README.md`; for version history see `CHANGELOG.md`.

---

## 1. Folder layout

```
ProjectCharles/
├── Start-Charles.cmd            starts Charles with existing data (Node.js not needed)
├── setup/                       installer tools:
│   ├── Install.cmd              installs on another computer (runs install.ps1)
│   ├── install.ps1              the installer itself
│   ├── Create-Desktop-Shortcut.vbs  creates a desktop shortcut
│   └── Reset-Charles.cmd        backs up and resets local settings (archives chats)
├── README.md                    introduction and installation
├── CHANGELOG.md                 changes per version
├── DEVELOPMENT.md               this guide
├── .gitignore / .gitattributes  files kept out of GitHub / Windows line endings
├── package.json                 app definition; "main": app/main.cjs
├── biome.json                   formatting rules
│
├── app/                         MAIN PROCESS (Electron, Node.js): the side that reaches the computer
├── src/                         INTERFACE SOURCE (TypeScript): compiled to dist/renderer.js
├── public/                      INTERFACE ASSETS (HTML, CSS, sounds): copied into dist/
├── dist/                        RUNNING INTERFACE (build output; do not edit; not on GitHub)
├── test/                        automated tests (node --test)
├── scripts/                     build, start and setup scripts
├── docs/                        user guide, architecture, plugin setup, README images
├── licenses/                    third-party licenses
│
├── node_modules/                runtime components (Electron, Codex, Claude Code, …)
├── models/                      local Whisper speech models (small + tiny)
└── tools/                       Antigravity, Cursor and Whisper tools
```

**User data is not in this folder.** Chats, settings, memory and account connections are in
Windows’ application data folder: `%APPDATA%\Charles`. See section 6.

---

## 2. How the app runs

```
 Windows ── electron.exe ── app/main.cjs  (main process: windows, IPC, files, network, child processes)
                               │  ▲
              app/preload.cjs  │  │  only the allowed calls (window.charles.*)
                               ▼  │
                         dist/index.html + dist/renderer.js   (interface, sandboxed)
```

1. `main.cjs` opens the window (transparent, frameless, always on top) and serves **only `dist/`**
   through the `charles://app/` protocol.
2. The interface cannot reach Node.js. Every operation goes through a function in `preload.cjs` to
   an `ipcMain.handle` endpoint. Endpoints are defined with `safeHandler`, which checks the sender.
3. Chat: for GPT models `app/ai/agent.cjs` starts the local Codex app-server; for Antigravity,
   Claude, Cursor and Abacus AI `app/ai/providers.cjs` runs that subscription’s CLI tool; GitHub
   Copilot is a CLI "kit" (`app/ai/cli-kits.cjs`, below); EVREN is an OpenAI-compatible HTTP API
   reached with the user's key (`app/ai/evren.cjs`). The seven are `PROVIDERS` in
   `src/chat/model-picker.ts`; what each can do from the + menu is `CAPABILITIES` in
   `src/chat/capabilities.ts` (the same table is checked again in `app/ai/provider-drawing.cjs`).
4. Before sending a message, `main.cjs` → `safeHandler('send')` answers some requests **locally**
   (Spotify, opening apps, weather, plugin commands, memory). The rest go to the AI.

---

## 3. `app/` — main process

| Folder | What it does | Important files |
| --- | --- | --- |
| `app/` (root) | Entry points | `main.cjs` (windows: the transparent island and the framed app window, one shared page in a WebContentsView; layout, IPC endpoints), `preload.cjs` (interface bridge) |
| `app/core/` | Infrastructure | `store.cjs` (safe JSON storage), `policy.cjs` (Codex permissions), `layout.cjs` (panel sizes), `preferences.cjs`, `shortcuts.cjs`, `startup.cjs`, `extras.cjs` (appearance preferences and attachments), `desktop-pet.cjs`, `pet-physics.cjs`, `task-mode.cjs`, `proposals.cjs`, `ask-format.cjs`, `reset.cjs`, `file-preview.cjs`, `change-review.cjs`, `dash-layout.cjs`, `system-info.cjs`, `release-notes.cjs` (notes of a version from `CHANGELOG.md`; first install, update or restart), `metric-stats.cjs` (Current / Average / Peak and chart points), `untrusted.cjs` (`fence()` / `defuse()` for outside text), `fullscreen-gate.cjs` (the full-screen gate, section 7), `low-memory.cjs` (Low memory mode, read before `ready`), `attention.cjs` (taskbar flashes), `updater.cjs` |
| `app/ai/` | AI and chats | `agent.cjs` + `rpc.cjs` (Codex), `providers.cjs`, `abacus.cjs`, `evren.cjs`, `cli-kits.cjs` (GitHub Copilot through its own command line tool), `provider-tools.cjs` (tool permissions in project mode; no permission-bypass mode), `provider-images.cjs` (pictures per message), `provider-drawing.cjs` + `svg-render.cjs` (an SVG drawing turned into a PNG in a hidden page), `sessions.cjs`, `chat-folders.cjs`, `chat-classifier.cjs`, `ask-once.cjs` (module requests; `moduleModel()` falls back from a default model that is no longer usable), `chat-actions.cjs` ("remember this" and the other local actions), `conversation-tools.cjs` |
| `app/usage/` | AI usage on the island | `codex-usage.cjs`, `gemini-usage.cjs`, `claude-usage.cjs`, `cursor-usage.cjs`, `evren-usage.cjs` |
| `app/modules/` | Modules | `manifest.cjs`, `package.cjs`, `registry.cjs`, `storage.cjs`, `protocol.cjs`, `host.cjs`, `module-preload.cjs`, `ai-image.cjs`; docs: `docs/MODULES.md` |
| `app/plugins/` | Accounts and notifications | `plugins.cjs`, `pop3.cjs`, `plugin-commands.cjs`, `home-climate.cjs`, `mail-search.cjs`, `oauth-setup.cjs`, `mail-triage.cjs`, `mail-alerts.cjs`, `mail-bubble.cjs` + `bubble-preload.cjs` (the card window), `notice-cards.cjs` (every card's fields), `notice-text.cjs` (the cards' and toasts' texts in six languages), `deadlines.cjs`, `whatsapp-live.cjs` |
| `app/voice/` | Voice | `voice.cjs` + `voice.ps1` (Whisper, Windows speech), `dictation.cjs` + `dictation-preload.cjs` (push to talk), `gemini-live.cjs`, `live-computer.cjs`, `live-plugins.cjs`, `wake-profile.cjs` ("Hey Charles" training and matching) |
| `app/personal/` | Personal data | `personal.cjs`, `memory.cjs`, `profile-transfer.cjs`, `creator-profile.cjs`, `companion.cjs`, `weather.cjs`, `weather-chat.cjs` |
| `app/system/` | Windows helpers | `helper-hub.cjs` + `charles-helper.exe` (the one helper process; source `setup/CharlesHelper.cs`), `desktop.cjs` + `.ps1`, `media-worker.cjs`, `performance.cjs`, `live-metrics.cjs` (system monitor), `content-drop.cjs` + `content-reader.ps1` (what Charles reads when dropped), `watchdog.cjs`, `foreground.cjs`, `computer-time.cjs`, `weekly.cjs`, `capture.cjs`, `web-commands.cjs`, `whatsapp.cjs`, `open-with.cjs` |
| `app/files/` | Files | `library.cjs`, `docx.cjs`, `pdf-text.cjs`, `file-rack.cjs`, `slides.cjs` + `pptx-read.cjs`, `ppt-read.cjs`, `powerpoint-com.cjs`, `convert.cjs`, `share.cjs`; converter (v0.9.26): `convert-ops.cjs` (targets, labels and choices per file type), `convert-run.cjs` (runners per type), `convert-host.cjs` (HTML rendering and the engines the converter gets), `office-com.cjs` (Word/Excel/PowerPoint over COM), `pdf-render.cjs`, `pdf-layout.cjs`, `helper-job.cjs`, `sheets.cjs`, `docs.cjs`, `tables.cjs`, `searchable-pdf.cjs`, `pptx-write.cjs`, `vectorize.cjs`, `media.cjs`, `archive.cjs` (section 7), `transcribe.cjs`; `image-actions.cjs` (save, copy and attach a picture from the big view) |

Every file starts with a short description line.

**Rule:** work that runs all day goes in the helper (`setup/CharlesHelper.cs`), not in a PowerShell
process. `.ps1` helpers are for occasional work and stay in the same folder as the `.cjs` that runs
them.

### The helper (`charles-helper.exe`)
One small program built by `scripts/build-helper.ps1` (`npm run build` runs it when the source
changed) with the .NET Framework compiler and WinRT metadata that come with Windows. It needs no SDK
and no install, and it is tracked like `Charles.exe`. `helper-hub.cjs` starts it with the first
channel and ends it with the last; each channel behaves like a child process of its own, so
`Foreground`, `MediaWorker`, `LiveMetrics`, `PerformanceHistory` and `Dictation` use it the way they
used their own process.

| Channel | Thread | What it does |
| --- | --- | --- |
| `fg` | message loop | foreground window; reports changes through WinEvent hooks, no polling |
| `media` | queue | Spotify session; `{"changed":true}` when it changes, then the page asks |
| `metrics` | queue | counters for the system monitor |
| `usage` | queue | per-program usage, once a minute |
| `keys` | queue + hook thread | push to talk; the hook has its own thread and is removed on `off` |
| `guard` | queue | a shelf drag: frees the screen if Charles is frozen after the button was released (`app/files/drag-guard.cjs`) |

Messages are `<channel>\t<payload>` lines. The channels and their requests are a fixed list: nothing
runs a command. `--grab` (pictures of the screen; goes after a minute's rest) and `--static`
(processor and memory names, once) are short-lived modes of the same file. The converter adds three
more (v0.9.26), each started per job by `app/files/helper-job.cjs` with one JSON line on stdin and
answering with JSON lines:

| Mode | What it does |
| --- | --- |
| `--pdf` | page count and size; pages to PNG through `Windows.Data.Pdf`. The renderer scales by the screen's DPI, so the scale is calibrated on a one-inch test first and sizes come out in real points |
| `--image` | frames of GIF and multi-page TIFF, and HEIC decoding through WIC (HEIC needs the HEIF Image Extensions) |
| `--ocr` | installed OCR languages; words with their boxes through `Windows.Media.Ocr` |

`--pdf` and `--ocr` reference the WinRT metadata and `System.Runtime.WindowsRuntime.dll`; `--image`
uses WPF (`PresentationCore.dll`, `System.Xaml.dll`). `scripts/build-helper.ps1` adds them.

**Office over COM** (`app/files/office-com.cjs`): one hidden PowerShell per job, the job as JSON in
`CHARLES_JOB`, never in the script. The file is opened read-only with `AutomationSecurity = 3`
(macros off) and a dummy password, so a protected file fails instead of asking. Word and Excel are
closed only when the instance was started by the job (`-not $app.Visible`); PowerPoint, which has one
instance, only when no presentation is open and it is not visible. An earlier draft that checked for
a running Word left hidden instances behind, so keep this rule.

The helper ends when stdin closes, so it cannot outlive Charles, and Windows removes its hooks with
it. After sleep or unlock `hub.refresh()` sets hooks and the media connection up again, replacing the
old ones. After four falls within a minute it is not started for five minutes. The classes that use
a channel handle a failed channel as they handled a failed process. Keep the file to C# 5 (the
compiler Windows ships).

---

## 4. `src/` — interface (TypeScript)

| Folder | What it does |
| --- | --- |
| `src/renderer.ts` | Entry point: chat flow, sending, approvals, character reactions |
| `src/chat/` | Messages: `markdown.ts`, `math.ts` + `katex-lazy.ts` / `katex-source.ts` (formulas, section 7), `model-picker.ts` (`PROVIDERS`), `model-note.ts` (the "Next message: …" line), `capabilities.ts`, `image-card.ts`, `history-folders.ts`, `activity.ts`, `steps.ts` (the steps list of an answer), `follow.ts` (where the chat is), `reactions.ts`, `reading.ts`, `status-scroll.ts`, `ai-questions.ts`, `steer.ts`, `stop-text.ts`, `highlight.ts`, `release-notes.ts`, `content-context.ts` |
| `src/island/` | The island and Slime: `shelf.ts`, `usage.ts` (the usage gauge and its read intervals), `usage-all.ts` (the AI usage panel), `weather-view.ts`, `timer.ts`, `system-monitor.ts`, `panel-motion.ts`, `companion.ts`, `onboarding.ts` (the welcome tour), `desktop-pet.ts`, `wardrobe.ts`, `animation-loop.ts` + `frame-rate.ts` (Slime's frame rate, section 7), `voice-bars.ts`, `file-rack.ts` |
| `src/workspace/` | App window: `workspace.ts`, `sidebar.ts`, `dashboard.ts`, `side-panel.ts`, `calendar.ts` + `holidays.ts`, `home.ts`, `dash-edit.ts` + `extra-cards.ts` (the home page's edit mode and "Reset layout"), `work.ts`, `review.ts` + `diff.ts`, `drop-slime.ts`, `modal.ts`, `icons.ts`, `bridge.ts` |
| `src/settings/` | Settings pages: `settings-pages.ts`, `settings-cards.ts`, `providers.ts`, `cli-card.ts`, `abacus-card.ts`, `evren-card.ts`, `connected-state.ts` (a card's connected state, section 7), `default-model.ts` + `default-model-data.ts` (the default model list), `plugins.ts`, `gcal-card.ts`, `whatsapp-card.ts`, `plugin-guide.ts`, `refresh-on-show.ts`, `shortcuts.ts`, `shortcut-view.ts` (key labels and the row's answer line), `push-to-talk.ts`, `weekly-summary.ts` + `weekly-model.ts`, `low-memory.ts`, `update-page.ts`, `personal.ts`, `extras.ts`, `workspace.ts`, `profile-transfer.ts`, `account-tab.ts`, `i18n*.ts` (Turkish → English), `lang/de.ts`, `fr.ts`, `es.ts`, `zh.ts` (English text → other languages; `{n}` is a number) |
| `src/voice/` | Voice interface: `voice.ts`, `dictation.ts`, `wav.ts`, `wake.ts` + `wake-gate.ts` ("Hey Charles", section 7), `wake-training.ts`, `gemini-live.ts` |
| `src/ui/` | Shared helpers: `tooltip.ts` and `no-native-tooltips.ts` (section 7), `tokens.ts` (the design tokens for code that draws), `sound-button.ts`, `mic-button.ts`, `context-menu.ts`, `watch-select.ts` |
| `src/vendor/` | Slime engine, accessories, sounds and animation helpers (license: THIRD-PARTY-NOTICES.md) |

---

## 5. `public/` — HTML and styles

| File | Purpose |
| --- | --- |
| `index.html` | Main window skeleton |
| `bubble.html/.css/.js` | Notification cards (a separate small window); `bubble.js` draws every card from the fields `notice-cards.cjs` gives, as text only, with its line icons (`ICONS`) |
| `capture.html/.css/.js` | Screen region selection layer |
| `pet.html/.css` | Charles outside the panel (drawn by the page’s own engine) |
| `drop-target.html/.css/.js` | The frame around what Charles would read |
| `dictation.html/.css/.js` | The push-to-talk indicator, under the island |
| `styles/*.css` | Styles, one file per component, loaded in a fixed order (below) |
| `images/` | Images the pages load (the WhatsApp mark on the notification card) |

**Stylesheets.** `public/styles/` holds one file per component, loaded in this order by `index.html`:
`00-tokens.css` (the design tokens: colours, radii, type; everything else uses them), `01-base.css`,
`02-island.css` (frame, notch, top bar), `03-chat.css` (feed, messages, message box), `04-shelf.css`
(shelf, cards, tools), `05-dialogs.css` (history, release notes, lightbox, tooltip), `06-settings.css`,
`07-workspace.css` (the app window, `body.workspace`), `08-tour.css`, `09-notify.css` (also loaded alone
by `bubble.html`). The small windows (capture, dictation, drop target, notification card) link
`00-tokens.css` before their own stylesheet in `public/`. A later file wins at equal specificity, so an
override of another component goes in the later file. A few rules carry "kept in this file for the
cascade": they belong to another component but must load after this file's rules. Each file marks where
its rules came from (`/* ── from 18-v0810.css ── */`). Tests read an old release's rules with `release()`
from `test/old-styles.cjs`. Merged in v1.0.0 with every rule kept in its cascade order.

Colours, corner radii, text sizes and weights come from the tokens in `00-tokens.css` (`--cream` and its
alpha steps, `--ok` / `--danger` / `--warn`, `--r-sm` … `--r-pill`, `--fs-i1` … `--fs-i6` for the island
and `--fs-a1` … `--fs-a6` for the app window, `--fw-regular`, `--fw-strong`). The older variable families
(`--sb-*`, `--ac-*`, `--ws-*`) read those tokens; new rules use the tokens or `--sb-*`, never a literal.
The island's own outline is exempt from the radius scale: it is drawn to match the window mask.

---

## 6. User data (`%APPDATA%\Charles`)

| File / folder | Contents |
| --- | --- |
| `charles-history.json` (+ `.bak`) | Chat history, folders, edit branches |
| `personal.json` | Memory, reminders, appearance, access mode |
| `companion.json` | City, docking side, interface language, Low memory mode (`lowMemory`, read before the app is ready) |
| `display.json` | Screen, auto close, default model |
| `plugins.enc.json` | Plugin accounts, **encrypted by Windows** (DPAPI; reconnect on another computer) |
| `gemini-live.enc.json` | Gemini Live API key, encrypted |
| `providers/` | Antigravity / Claude / Cursor sessions, `enabled.json` (main AI) |
| `computer-time.json`, `weekly.json`, `resource-history.sqlite` | Usage statistics |
| `dictation.json` | Push to talk: on or off, and the key |
| `system-monitor.json` | Whether the monitor measures in the background |
| `whats-new.json` | The last version started (first install, update or restart) |

The app name is fixed with `app.setName('Charles')`, so **every Charles version uses the same data**.
The folder is created at first start if missing. Only one Charles can run at a time (single
instance lock), so two versions never write to the same file together.

Records are written through `app/core/store.cjs`: first `.tmp`, a forced disk write (fsync), then a
rename; a damaged file is not deleted but set aside as `.corrupt-…`.

---

## 7. Important flows

### AI usage (island)
`src/island/usage.ts` follows the provider of the selected model and asks through
`usageRead(force, provider)`. Each request carries a sequence number; if the user changed provider
meanwhile, the old answer is dropped. Main side: `main.cjs` → `safeHandler('usage-read')`.

The periodic read (`PERIODIC`: ChatGPT every minute, Claude, Cursor and EVREN every five minutes)
runs at that pace only while a gauge is on screen; otherwise `quotaReadDelay()` stretches it to at
least `HIDDEN_READ_MS` (ten minutes). A `ResizeObserver` on the gauge and on the app window's
`.ws-usage` card notices when one comes on screen, and `quotaReadOnShow()` then reads at once if
the last read is older than the visible interval. A low-quota notice can therefore come up to ten
minutes later while nothing shows usage.

### Notification cards
```
plugins.poll()  →  new unread mail  →  mail-alerts.mail()
   → mail-triage.triageMail()  (local flags + keyword rules; the AI only when the user turned that on)
   → notice-cards.mail()  →  mail-bubble.add()  →  a card (separate window, never takes focus)
   → click  →  the mail's full text becomes an attachment  →  'mail-explain' to the interface
   → renderer.ts sends the message, Charles explains the mail
```
Every card, from every producer (reminders and focus timers, updates, mail, calendar, WhatsApp, the
usage limit, the watchdog, modules, saved files, Quick Share), is built by a function of
`app/plugins/notice-cards.cjs`, so they share one shape: `{ id, kind, icon, source?, title, reason?,
action?, vars?, t? }`. `icon` is a name from `ICONS` in `public/bubble.js` (line icons; an unknown
name, an emoji included, draws nothing). `action` names what a click does. `t` lists the fields that
are Charles' own Turkish text; `vars` fill `{name}` in them. Untrusted text (mail subjects, senders,
file names) is never in `t`. `app/plugins/notice-text.cjs` holds those texts in English, German,
French, Spanish and Chinese; `mail-bubble.cjs` sends the rows of the interface language with the
list of cards (again only after the language changed or the window was opened anew), so `bubble.js`
keeps no table of its own and inserts everything as text, never HTML.
The same file gives the Windows toasts (weekly summary, reminders) their texts. The WhatsApp card
shows `public/images/whatsapp-mark-*.png`.

`bubbleSpot()` in `mail-bubble.cjs` places the cards: under the island, beside a tall panel, above
it, or in the corner of the app window. All windows on Windows share one topmost band, so the cards
are raised again whenever the island is activated. The card window's page process is not kept for
good: `closeLater()` destroys the window `CLOSE_AFTER` (150 s) after the last card went, and only
when `mayCloseCards()` allows it (no card listed or held back, no WhatsApp reply being written, no
card action running, not on screen); `ensureWindow()` opens it again for the next card. Cards wait
(`place()` shows nothing) while `fullscreenOther` is true.

### The full-screen guard and gate
The helper's `fg` channel reports the window in front with `full`, `pid` and, from v1.0.0, `covers`
(it covers its whole monitor), `readable` (its rectangle and monitor could be read), `quns` (Windows'
notification state) and `mon` (that monitor's `[left, top, right, bottom]` in physical pixels).
`full` is `covers`, or, for a window that could not be read (some games), Windows saying a
full-screen program runs (`quns` 3 or 4; `QUNS_BUSY`, 2, never counts, because it stays on while a
full-screen program runs on any display). `startTopGuard()` in `main.cjs` gets each report and asks
`decide()` in `app/core/fullscreen-gate.cjs` (pure), which gives two states:

- `fullscreenFront`: a full-screen program is in front, on any display. `fullscreenGate`
  (`createGate()`) then holds what Charles does by himself that could bring the taskbar up over it:
  `activate` (focus, show, restore), `flash` and `toast`, each under a key (a newer one replaces it;
  `drop()` forgets what was answered meanwhile). A deliberate action of the user is never held.
  `flush()` runs what waited, in order, when the program is left. Push to talk pauses too.
- `fullscreenOther`: that program is on a display that holds a visible Charles window (island, app
  window, desktop Slime, cards). The island leaves the topmost band, the cards wait, and the page gets
  `ui-fullscreen-other`, which stops Slime's draw loop. With full screen only on another display the
  island stays topmost on its own.

A report without a boolean `full` changes nothing (it used to count as "not full screen"). An older
helper report without `mon` falls back to the old rule (here = front) and to the display under the
pointer for drawing (`fullscreenCoversCharles()`). The 5 s guard timer asks the helper again while
either state is on, so a closed full-screen program with nothing in front cannot leave them stuck.
`CHARLES_QA_FG_UNREADABLE=1` makes the helper treat every front window as unreadable, for tests.

### Panel animation
`app/main.cjs` → `position()` calculates the target size and sends `ui-layout`.
`src/island/panel-motion.ts` brings the body to the final size and scales from the old one. The
centred panel uses `translateX(-50%)`; a docked panel has no transform. The mouse area
(`visibleBounds`) follows the same rule; if one changes the other must too.

### Charles outside the panel
With the panel or app window open, `movePetDrag` calls `startPetOut()`: the page opens
`public/pet.html` as a small window of its own and copies each frame of the one engine there. The
gesture comes from `executeJavaScript(…, true)`, because `window.open` needs one. From the closed
island the older mode (`detached`) shrinks the whole page to him.

### Dropping Charles on content
`content-drop.cjs` arms only after the pointer stayed still (`holdStep`). `content-reader.ps1` finds
the first window under the point, skipping Charles’ own and windows that show nothing, from the
window list alone (`probe`, milliseconds); the exact area comes after from UI Automation (`refine`),
which may take seconds on a large page and never holds the frame back. The frame's window is drawn
before it is shown and closes a few seconds after the drag. A saved Word or PowerPoint file and a
local PDF in a browser are attached as files; other text becomes an attachment with
`untrusted: 'content'`, so the turn runs without tools and the text is fenced as data.

`pet-drag` notes where the drag began (`origin`). When the reading ends `finishDrop()` sends him
back with `sendPetBack()`, unless a newer drag has begun (`petDragId`); a result that arrives during
a drag waits for the release. A newer drop drops an older result (`contentRun`).
`src/chat/content-context.ts` holds the card: `sent(ids)` removes it once the chat took a message
with that attachment; a message the chat refused leaves it.

### Dates in mail
`deadlineProposal()` in `app/plugins/deadlines.cjs` asks in the chat. With Google Calendar connected
(`plugins.calendarWriter()`) the event is added directly, under an id made from the mail and date, so
answering twice makes one event. Microsoft's connection reads only (`Calendars.Read`). No program is
opened unasked: the `.ics` file is a button of its own, because Windows hands it to the default
calendar app (often Outlook) and the event only exists once the user saves it there. A failed answer
leaves the question open (`Proposals.answer`).

### Dragging a file off the shelf
`dragCard()` in `src/island/file-rack.ts` draws the picture and name in real pixels, as under a
desktop icon, and `rack-drag` hands it to Electron's `startDrag`, which is Windows' drag and drop in
Charles' own process. Electron writes the file's path in whatever room is left beside the picture and
that cannot be turned off, so the picture is kept wide, with clear sides. Starting the drag from the
helper was tried in v0.9.20 and does not work: the mouse belongs to Charles' window while the button
is down, so a drag in another process either never ends or ends at once.

`startDrag` blocks the main thread for the whole drag. Timers run inside it and those that touch the
window wait on `rackDragging`. Explorer's Drop is one synchronous call: with a name that already exists
it lasts until "Replace or Skip" is answered, and nothing in Charles runs meanwhile. Two things keep
the screen usable. Before the drag `setShape` cuts the window down to the visible panel, so the large
transparent surface neither takes drops nor covers what Windows opens. If the button is up and the
drag has not ended after 260 ms, the helper's `guard` channel makes the window click-through and takes
it out of the topmost band from outside. The `finally` around `startDrag` puts both back, and again
200 ms later for a guard that was on its way.

### A file coming in
`share.cjs` emits `offer`. On the island the panel opens (`src/island/share.ts`). In the app window that
panel is not on screen, so `main.cjs` shows a card from `app/files/share-card.cjs`: `item.choices` in
`mail-bubble.cjs` draws buttons and answers through `onChoice`. The `state` event removes the question
when it was answered elsewhere, timed out or the phone gave up.

### Island size
`appearance.island` is `large` or `small` (Settings → Appearance). `layout.cjs` makes every island state
3/4 (`ISLAND_SMALL`; 2/3 until v0.9.26) from the same base numbers, so the visible area, click area and what is placed from them (cards,
the dictation indicator) follow and nothing adds up; the native surface stays as it is. `02-island.css` (the rules from `37-v0920.css`)
zooms `main.island` by the same number, and `src/island/island-size.ts` holds it for the page's own
arithmetic; `test/v0927.test.cjs` keeps the three together. The app window, Charles on the desktop and
the plugin guide share the page but are left out of that rule. The saved chat height is always the
Large one.

### AI connections through a command line tool (`app/ai/cli-kits.cjs`)
GitHub Copilot is a "kit": `find` (where the user's install puts the tool; it is not shipped), `env`,
`plan` (the command line of one message), `answer` (text and a clear error out of what the tool
printed), `loginArgs` (sign-in in a console window) and `listModels`. `providers.cjs` drives a kit
through the same branches as Abacus AI. A chat never gets tools (`--deny-tool`), and no kit ever uses a
mode that skips permissions. A new CLI connection is a kit plus its id in the lists
`test/v0927-providers.test.cjs` names.

What a real install showed: Copilot is usually VS Code's launcher
`…\Microsoft VS Code\bin\copilot-shim\copilot.exe` (the real tool), and VS Code being signed in does
not sign the command line tool in. `copilot help config` lists every model id the tool knows, which is
not what an account has: the account's list comes from a session opened over `--acp`
(`copilotAccountModels`: `initialize`, `session/new`, read `models.availableModels`; no prompt is
sent). `Providers.refreshKitModels` asks it at every sign-in check, every hour (`watchKitModels`) and
at once when the tool answers "Model … is not available"; a changed list is sent to the page as
`provider-models-changed`, which rebuilds the model menu and, when it is a change of plan rather than
the first list, says so.

Kimi and OpenCode were kits in 0.9.27-rc.1 to rc.3 and were removed in rc.4 at the user's request.
`Providers` deletes what they left in `providers/` (`kimi/`, `kimi.json`, `opencode.json`) and resets a
main AI that was one of them.

### Where the chat is (`src/chat/follow.ts`)
One file owns the chat list's scroll position. It remembers the first message on screen and how far
into it the top edge is, not a pixel count: at another width the text wraps differently and the same
number is another place. "At the end" is kept apart and always wins. Code that moves or resizes the list
(`panel-motion.ts`, docking in `companion.ts`, island ↔ app window in `workspace.ts`) calls `hold(list,
name)` before and `release(list, name)` after; a list that was hidden is put back when it is shown, and
a jump to the top that no wheel, key or press caused is undone. `keepPlace(list, work)` is for rows
added above the reader (older messages). Do not write `feed.scrollTop` anywhere else.

### Steps of an answer (`src/chat/steps.ts`)
`describe(item)` turns one reported item into a row (label, preview, detail, state) or into nothing:
an item with no content is not drawn, one without detail is a line that does not open. `mergeItem`
keeps what is known when a closing event carries only an id and a state. Only the published `summary`
of a reasoning item is shown, never its `content`. `stepLists()` draws one list per turn; the user's
message starts a new one (history keeps no "turn started"), and `finish(status)` closes steps that never
reported their end.

### What Slime wears and holds
`outfitLayer()` in `src/vendor/slime/outfits.ts` says where an accessory lives: `body` (bow tie, scarf,
leash, pumpkin, banana, arrow), `face` (glasses, monocle, eye patch) or `head` (hats, bow, headphones,
ears). One frame is drawn in this order: body, eyes, mouth and moustache, `body` items, `face` items,
the reading sheet, the work prop, `head` items. A new accessory needs only its layer. `PROP_TOP` in
`src/chat/activity.ts` is the line no held prop rises above, so the mouth and moustache stay whole.

### Frames
`animationLoop` draws Charles. Up to 30 frames a second a timer starts the frame; 60 frames follow the
display. The rate is one pure rule, `slimeFrameRate()` in `src/island/frame-rate.ts`, which
`src/renderer.ts` feeds each frame:

| State | Frames a second |
| --- | --- |
| dragged, hovered, jelly moving, or the costume itself moving (`costumeMoving`: tweens, particles, dance, a slot changing; not the head following the pointer) | 60 |
| the AI works | 30 |
| asleep (`SLEEP_FPS`; he only breathes and the "z" letters drift up) | 8 |
| pointer and keyboard rested for four seconds | 12 |
| otherwise (head and eyes follow the pointer) | 30 with focus, 20 without focus or on the compact island |

Waking draws at once at the awake rate (`slimeLoop.now()`). The loop does not draw at all while his
canvas is hidden (a `ResizeObserver` on `#slime`, for the app window) or while `body.fullscreen-other`
is set (section "The full-screen guard and gate"). These frames are nearly all of an open, idle
island's CPU, so a change to the rule needs a measurement, not a guess; `test/v100-perffix.test.cjs`
keeps the table.

### Sending a message
`sendMessage()` in `src/renderer.ts` is the one way out. Called with no argument it takes the message
box; with `{ text, attachments? }` (an edited bubble, a button on the content card) it leaves the box
and its draft alone. It resolves true once `api.send` accepted the message.

### Message style
The user's bubble has one definition, the `--ch-bubble*` variables (from `10-noir.css`, now in the merged
stylesheets). The island, the app window and the text of a message with files all read them. Many
`body.workspace` rules in `07-workspace.css` use `!important`, so a rule for the shared chat must be
checked in both places.

### Attachments
`src/chat/attachment-card.ts` draws both forms: the card in the message box (`attachmentCard`) and the
file in a sent message (`sentFile`; a picture there is only the picture). No element keeps a `title`
(`ui/no-native-tooltips.ts`, see "Tooltips"), so the whole name is shown by `attachmentNames`.

A file has no size limit; `MAX_ATTACHMENTS` in `app/core/extras.cjs` allows 1000 per message.
`ingestFile` copies asynchronously and `ingest` stays for Charles' own small files. `inputs()` keeps the
text of one message under `MAX_ATTACHMENT_TEXT`: `fitted()` cuts a file inside its fence, adds a note for
the model, and `result.cut` names the file. `cut` must not reach Codex, so `inputs()` takes it off each
item and leaves it on the array. A text file is read only as far as the room allows.

With more than 24 pictures, `shownAttachments` in `main.cjs` stores smaller JPEG thumbnails, because they
live in `charles-history.json`. `loadImages` gives each picture its share of `MAX_REQUEST_IMAGE_BYTES`.

An extra instruction goes through `steer` with attachment ids. Outside content (`extras.untrusted`) is
refused there, because a running turn has its tools: `steer.ts` keeps it in the queue for a turn of its own.

### Language
`languageUI` in `src/settings/i18n.ts` watches the page. It reads only the nodes that changed, does
nothing in Turkish, and skips what people, tools and the AI wrote (`NOT_INTERFACE`). Walking the whole
chat for each added message froze a long chat for seconds. Besides text it translates `aria-label`,
`placeholder`, `title`, `aria-description` and `data-tip`; `t()` translates a text that code builds.

Where translations live: the interface is written in Turkish. Turkish → English is in
`src/settings/i18n*.ts` (a map and a patterns array per file, all merged in `i18n.ts`); English →
German, French, Spanish and Chinese is in `src/settings/lang/{de,fr,es,zh}.ts`, keyed by the English
text (`{n}` stands for a number). A new or changed visible text needs a row in all five. A pattern
(a text with a name or number inside, such as `Sonraki mesaj: (.+)`) also works as a template for the
other languages: `templateOf()` turns what it made into English with `{a}`, `{b}` … where the captured
parts go, the language table translates that template, and each part is put back (translated too
when it is an interface text). A template with a part missing is never shown; the English is.

`scripts/build.mjs` writes each of the four tables to `dist/lang/<code>.js` (a script that calls
`charlesLanguageTable(code, table)`); in the page bundle the four imports are empty. `loadLanguage()`
adds the script for the language in use only, and the page applies a language only once its table
is in. A script, not `fetch`, because a script added before the page's load event holds that event,
and `main.cjs` shows the window after it, so the table is in before anything is on screen. Tests
and tools that bundle `i18n.ts` get the tables as before. (During v1.0.0 several areas wrote their
new rows to `.qa/h100/lang-*.json`, and `.qa/h100/lang-merge.cjs` copied them into
`src/settings/lang/*.ts` before the release; that was a one-time tool, and the `.qa` folder is not
in the repository.)

### Editing a message
`src/chat/message-editor.ts` edits inside the bubble and changes nothing until Save. Save branches
with `editMessage`, switches to the branch and sends. If the message is refused, `undoEdit` removes
the branch and the editor reopens with the text and the reason. `editInfo` tells the editor which
attachments can go again; a history entry keeps the attachment's `id`, and `extras.revive()` finds the
file in the inbox (seven days).

### Push to talk
The helper's `keys` channel holds a low-level keyboard hook that looks at one key or at a chord of
two (`vk2`, default Right + Up); the gestures live in its `PushToTalk` class. `Chord` sits in front
of them: the first key waits up to 100 ms, because once the app has it the cursor has moved, and it is
sent on if the second one does not come or another key does. "Pressed" is the two keys joining and
"released" is the first of them letting go. `dictation.json` carries `keyScheme`: a file without it
that says `Right` held the old default, not a choice, and moves to `Right+Up`. Testing with real key
events while an installed Charles runs: its hook sees every key the test's hook lets through. Text is typed with `SendInput` as Unicode, marked so the hook ignores it.
`dictation.cjs` compares the target before and after with `canType()`. The indicator uses
`bubbleSpot()` too, from the island or from the cards when they show, and follows them through
`mailBubble.onPlaced`. Its window closes 30 seconds after it was last hidden.

### Changing a shortcut
`src/settings/key-names.ts` names a key from `KeyboardEvent.code` (its place on the keyboard), never
from `e.key`, which AltGr, Shift or a Turkish layout turn into another character. A captured key goes
straight to `shortcuts-apply`; `app/core/shortcuts.cjs` checks it (`problem()`), compares it with the
other shortcuts and with push to talk (`reserved`), tries to register it and answers
`{ ok }` or `{ ok: false, reason: 'invalid' | 'modifier' | 'duplicate' | 'reserved' | 'in-use', with }`.
The row shows the answer through `statusLine()` in `shortcut-view.ts`: "saved" leaves after a moment,
an error stays, and each message has a number so an older timer cannot close a newer one. The keys are
drawn by `keyChips()` as one label per key (never a text field, which cut long combinations). While a row records, `recording(true)` unregisters the global shortcuts and
`dictation-pause` stops push to talk, so neither fires on the key being recorded. `loadable()` keeps
every valid saved choice and drops only a broken one.

### System monitor
`live-metrics.cjs` uses the helper's `metrics` channel and keeps an hour of samples: every second while the monitor
is on screen, every 5 seconds otherwise. GPU load per adapter is the sum per engine across processes,
then the busiest engine; engines are never added together.

### "Hey Charles" (`src/voice/wake.ts`, `wake-gate.ts`, `app/voice/wake-profile.cjs`)
`wake.ts` reads the microphone in frames of 4096 samples (256 ms at 16 kHz) and gives each frame's
level to a `WakeGate` (`wake-gate.ts`, pure, no timers). `push(rms)` returns a span of frames to
check, or null. A clip opens on an "active" frame (above `max(threshold, floor * openRatio)`) with
one frame of lead-in, and closes after three quiet frames, or at `firstFrames` (11 frames, 2.8 s)
when the sound goes on; the next clips are `nextFrames` (19) long and carry the last `carryFrames`
(6) frames, so a phrase across a boundary lies whole in one clip. Checks are at least
`minGapFrames` (13 frames, 3.3 s) apart while sound goes on (clips that close sooner are merged into
one span), and come at once after a quiet spell. The noise floor rises slowly toward steady sound and
falls fast, and a capped clip lifts it to its quietest frame, so steady sound (a fan, steady music)
costs one check and then opens no clips. The rule the numbers keep: never gate out a phrase the
earlier gate would have sent. Each number in `WAKE` carries the measurement behind it.

`wake.ts` keeps the last 64 frames, writes a span as a WAV and sends it to `wake-check`; while a
check runs, up to three spans wait in a queue (no frame is skipped). `main.cjs` transcribes it with
Whisper (`voice.cjs` `transcribe(..., { empty: true })`, which returns '' for silence) and answers
`!!text && match(text, profile)`. `match()` in `wake-profile.cjs` normalises the text and accepts
"hey", "okay" or "ok" followed by "charles" or one of its listed spellings (charls, carles, charlz,
carls, charlie), or by a near spelling (`nearCharles()`: "char" plus one to four of the letters l,
e, t, s, i, z, ending in s or z, at most two edits from "charles"; so "chars" and "charts" pass,
"chart", "charge", "chairs" and "carl" do not), or a phrase from the user's trained profile. On a
hit the island expands and the voice conversation starts (the `#voice-call` button).
`test/v100-wake.test.cjs` holds the gate's equivalence and the matching cases.

### Archives (`app/files/archive.cjs`)
Windows' `tar.exe` (bsdtar) packs and unpacks ZIP, 7z, TAR, TAR.GZ and TAR.XZ and unpacks RAR. Before
anything is unpacked, `inspect()` lists the archive (`--numeric-owner -tvf`, so an owner name with
spaces cannot shift the columns) and refuses it when a line cannot be read, an entry is a link
(`l`, `h`), a device, FIFO or other special type, a path leaves the folder (`safeEntry()`: absolute,
drive letter, `..`), or the archive holds more than 50,000 files or 8 GB. It always unpacks into a
new `.part` folder that is renamed when complete; nothing that exists is overwritten.

`tar.exe` works in the ANSI code page, and a name outside it (Chinese, Japanese, Korean, Greek,
Russian or emoji on a Turkish Windows) crashes packing (0xC0000005) and makes reading a UTF-8 ZIP or
pax TAR fail. `tarCanHold()` asks `tar.exe` itself: it lists a tiny UTF-8 ZIP holding the names, which
must read back exactly in one of the ANSI code pages (this also catches best-fit letters such as ā
becoming a). It checks the names inside, the archive's own path and the folders `tar.exe` is sent
into (`pathParts()`). When they cannot be held, Charles' own code takes over: `zipWrite()` (fflate,
streaming) and `zipEntries()` / `zipExtract()`, and `tarWrite()` / `tarEntries()` / `tarExtract()`
(with zlib for TAR.GZ). These apply the same refusals through the shared `vetName()`, and the TAR
reader takes only files and folders. ZIP is also written by Charles when two items from different
folders share a name (the second becomes "name (2)"). 7z, TAR.XZ and RAR with such names are refused
with a plain message (`NAME_WRITE`, `NAME_READ`). Packing several files offers ZIP, 7z and TAR
(`batchTargets()` in `convert-ops.cjs`). `test/v100-archive.test.cjs` covers both routes.

### Tooltips (`src/ui/tooltip.ts`, `src/ui/no-native-tooltips.ts`)
Never set `title` for a hint. A native `title` tooltip is a window Windows draws itself, in the
system look and outside the island's shape, so `no-native-tooltips.ts` removes every `title` as it
appears: its text becomes `data-tip`, and for screen readers the element's `aria-label` when it has
no name of its own, else its `aria-description`. It is loop-proof (it compares before writing, drops
the records its own removals cause, and leaves a `title` that keeps coming back after 20 conversions
in 2 s, with a console warning), but a script that writes `title` on every frame defeats it; that
was a real bug in streamed answers. Write the hint directly instead: `data-tip` for the visible
tooltip, `aria-description` for a longer description, `aria-label` for an icon button's name.
`tooltip.ts` shows one tooltip element of the page for the anchor under the pointer or the keyboard
focus: its text is `data-tip`, else `aria-description`, else the `aria-label` of a control without
visible text, and never the anchor's own visible text unless that text is cut off. It shows after
500 ms (at once within 400 ms of the last one), is placed inside the island's visible shape (the
mask's ears and corners) or the app window, is `aria-hidden`, and runs no timer or observer while
nothing is hovered or focused. `data-no-tip` turns it off for an element.

### Formulas (`src/chat/math.ts`)
KaTeX is not in `dist/renderer.js`. `scripts/build.mjs` bundles it as `dist/katex.js` and swaps
`katex-source.ts` (which tests and tools bundle) for `katex-lazy.ts` in the page, which adds that
script on the first formula. Until it is in, a formula is a `.math-wait` placeholder; `mathReady()`
lets `markdown.ts` wait before drawing an answer, and placeholders elsewhere are replaced when it
arrives.

### Low memory mode (`app/core/low-memory.cjs`)
Settings → Performance → "Low memory mode" (`src/settings/low-memory.ts`) saves `lowMemory` in
`companion.json`. Hardware acceleration can only be turned off before the app is ready, so line 50 of
`main.cjs` reads that one value with `lowMemoryWanted()` (anything unreadable means off) and calls
`app.disableHardwareAcceleration()`. The setting shows a "Restart" button while the saved choice
and the running Charles differ (`low-memory-active`, `app-restart`); nothing restarts without that
click.

### The home page and its reset (`src/workspace/dash-edit.ts`)
`dashboard.ts` gives `dashEditor()` the cards, two columns and a `top` zone that holds the message box
(`ask`) at full width above them. `DEFAULT_LAYOUT` (the same as `DEFAULT` in
`app/core/dash-layout.cjs`) is the page before the user changes it. The edit mode's bar has "Reset
layout" ("Düzeni sıfırla"), which asks in the bar itself, then sets `resetLayout(defaults)` (a fresh
copy: nothing hidden, default order), saves it and stays in the edit mode. A saved layout is applied
once it is read (`loadDash()`); until then the default page shows.

### A card's connected state (`src/settings/connected-state.ts`)
Every account card (AI models and Plugins, and Gemini Live) shows its state the same way.
`showConnected(button, on, idle)` hides the sign-in button while connected and makes it the card's
primary button while not. `stateLine()` turns a `p.hint` into the card's one status line
(`role="status"`): while `connected` it starts with a green dot and "Bağlı", then " · " and the last
check's text when there is one (`READY` is "Modeller kullanıma hazır."); otherwise the text alone.
Write the line's `textContent` and `connected`; do not add a "… connected" label to a button.

### The welcome tour's providers (`src/island/onboarding.ts`)
The AI step lists every provider of `PROVIDERS` (`src/chat/model-picker.ts`) in its order, with the
texts in `TOUR_PROVIDERS`. A provider marked `later` (Abacus AI, EVREN, GitHub Copilot) is set up on
its Settings card, which opens when the tour ends. A new provider needs its row in `TOUR_PROVIDERS`
or it is left out of the tour.

### Removed in v1.0.0 and earlier
- The developer services tracker (a "GitHub connection · coming soon" card on Plugins, an old token
  store with a refresh timer and its tray item) was removed with its code in v1.0.0. Updates from
  GitHub, "Open with GitHub Desktop" and GitHub Copilot are separate and stay.
- The "Try expressions" panel on the Appearance page (a beta testing tool, `src/settings/expressions.ts`)
  was removed in v1.0.0. Charles' expressions themselves are unchanged.
- A DeepSeek connection was considered for v1.0.0 and never shipped (DeepSeek offers only a paid API
  key, no account sign-in); its empty stubs were removed.
- Kimi and OpenCode were CLI kits in 0.9.27-rc.1 to rc.3 and were removed in rc.4 (see "AI connections
  through a command line tool").

---

## 8. Development

You need **Node.js 24** (for development only; the user package needs no Node).

```bat
npm.cmd ci                  :: dependencies (first time)
npm.cmd run build           :: copies public/ → dist/, compiles src/ → dist/renderer.js
npm.cmd test                :: all automated tests
npm.cmd run dev             :: builds and opens Electron
```

Formatting (optional): `npx @biomejs/biome format --write app src test scripts`
(rules in `biome.json`: 2 spaces, 100 character lines, single quotes).

### Adding a feature
1. Put main process code in the right `app/<area>/` folder, with a short first-line description.
2. Open the endpoint with `safeHandler('name', …)` in `main.cjs` and add
   `name: (...) => invoke('name', ...)` to `preload.cjs`.
3. Put interface code under `src/<area>/` and call it from `src/renderer.ts`.
4. Put styles in the component's file in `public/styles/` (section 5), using the tokens.
5. Put every new visible text in Turkish in the code, with its English row in an `i18n*.ts` table
   and its German, French, Spanish and Chinese rows in `src/settings/lang/*.ts` (section 7,
   "Language"). A hint is `data-tip` / `aria-description` / `aria-label`, never `title` (section 7,
   "Tooltips").
6. Add a test under `test/`, then run `npm.cmd test` and `npm.cmd run build`.
7. Write the release notes in English in `CHANGELOG.md`: Charles shows that section after an update.

### Tests
`npm.cmd test` runs `node --test test/*.test.cjs`; most files are named after the release that
added them (`v0927.test.cjs`, `v100-<area>.test.cjs`). When a change breaks an older test's
expectation on purpose, update that expectation in the same change and say why. Two helpers:

- `test/old-styles.cjs`: the stylesheets were merged in v1.0.0 (section 5). `release('18-v0810.css')`
  gives back the rules that came from that old release file, in load order, so an older test keeps
  checking the same rules; `styles()` gives every stylesheet in load order.
- `test/exports-check.cjs` (run by `test/v100-bughunt.test.cjs`, or alone with `node
  test/exports-check.cjs`): every name an `app/` file takes from a local module must be one that
  module exports. A method `main.cjs` called on a class that no longer had it made every quit throw.

### Trying a change in a real window
The owner's QA harness is local and not in the repository (`.qa/` is in `.gitignore`): `.qa/h26/lib.cjs`
`launch({ name, port, language, seed })` starts Electron on a profile of its own under
`.qa/h26/profiles/<name>`, never the user's data, with an eval port. Test windows are quiet by
default: `.qa/h26/entry.cjs` makes them tool windows that never take the focus, never flash and let
clicks through, because a test window that took the foreground brought the taskbar up over the
owner's full-screen video. `QA_REAL_WINDOWS=1` keeps the real window behaviour (only for a run the
owner starts while away), and `QA_GUARD=1` also runs for real the two helpers a preview start leaves
off (needed to test the full-screen guard). Never send real keyboard or mouse input while the owner
uses the PC; use page-internal events.

### Security rules (do not change)
- The interface window uses `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- AI answers and mail contents are handled as text, not HTML.
- Account keys are stored only with `safeStorage` (Windows encryption).
- Antigravity / Claude / Cursor chat connections run tool-free. A folder explicitly named in an
  Antigravity message selects Project mode; the access setting limits reading and editing.
- Outside text (a mail Charles opened or found, content read by dropping Charles on a window, a mail
  attachment) is marked `untrusted` (`extras.untrusted()`) and goes to the model through `fence()` in
  `app/core/untrusted.cjs`: a block whose end tag carries a random id. `defuse()` removes invisible
  characters (bidi controls, zero-width characters, U+2028/2029 and the Unicode tag characters) and
  defuses tags that pretend to open or close a data block or a chat role, ChatML markers
  (`<|im_start|>`), and the same tags written with fullwidth or small-form brackets. Files the user
  attaches are fenced the same way.
- A turn with outside content runs in chat mode with "Ask for approval" access and without tools,
  and `untrustedTask()` in `app/core/task-mode.cjs` drops the web tasks (`web`, `research`) from it;
  the page says so. An extra instruction with outside content is not steered into a running turn
  (it waits for a turn of its own).
- "Remember this" (`app/ai/chat-actions.cjs`) stores one line of at most `MAX_REMEMBER` (300)
  characters; a longer or multi-line text is asked about instead.
- `file-open` with the default app never starts a program or script: `runnable()` in
  `app/system/open-with.cjs` (the module packer's `FORBIDDEN` list plus script types) sends it to
  its folder instead.
- The converter writes each job to a temporary name of its own (`partPath()`) and `settle()` in
  `app/files/convert.cjs` moves it to a free name at the end without ever replacing a file (hard
  link, or a copy with `COPYFILE_EXCL`).
- Archives: the refusals in section 7 ("Archives") hold on both routes, `tar.exe` and Charles' own.

---

## 9. Packaging

`npm run release:pack` builds the in-place update package. `test/`, `src/` and `scripts/` are not
needed to run; they are for development.

What the two packers leave out: both never ship secrets or personal files (`*.enc.json`, `*.key`,
`*.pem`, `.env*`, `personal.json` and the like), `.qa` or `graphify-out`. The update zip carries no
`node_modules` at all. `scripts/package.py` (the installer's payload) also leaves out what only
building needs: the Electron downloader's packages (`@electron/get`, `undici` and their helpers),
`esbuild` and `@esbuild/*` with their `.bin` shims, and the folders `src/`, `test/` and `scripts/`
(`dist/` is always built before packing). The update zip still carries `src/`, `test/` and `scripts/`,
because a source checkout that updates in place rebuilds `dist/` from `src/`.
`tools\quickshare\python\python.exe -B scripts\package.py --list <folder>` prints what would ship
without writing anything.

Run `npm audit` without `--omit=dev`. Electron is listed as a development dependency because npm
installs it as a build tool, but `node_modules/electron/dist` is the runtime that ships inside Charles,
so an `--omit=dev` audit skips the one package whose advisories reach users. Read the full report and
judge each entry by whether it ships: `scripts/package.py --list` shows the payload. Electron's
downloader (`@electron/get`, `undici` and their helpers) and the build tool `esbuild` are excluded from
it, so their advisories stay in the development tree only. Any Electron advisory is fixed by moving to
the newest patch of the same major version with `npm install electron@<version> --save-dev --save-exact`
(v1.0.0 ships Electron 44.11.3). Afterwards check that `node_modules/electron/dist/electron.exe --version`
reports it; if `dist` is missing, run `node node_modules/electron/install.js`.

The update zip has no `node_modules`, so an install that updates in place gets the new Electron through
`charlesRuntime` in `package.json` (see `docs/UPDATES.md`, "The second part"). When Electron is raised,
change all four fields together:
1. `electron`: the new version (the same as `devDependencies.electron`).
2. `url`: `https://github.com/electron/electron/releases/download/v<version>/electron-v<version>-win32-x64.zip`.
3. `sha256`: the line for that file in the release's official `SHASUMS256.txt`; check that it equals
   the zip npm downloaded (`%LOCALAPPDATA%\electron\Cache\<hash>\electron-v<version>-win32-x64.zip`).
4. `bytes`: that zip's size.

`test/v100-runtime.test.cjs` fails while `electron` differs from `node_modules/electron/package.json`
or from the `electron` entry in `devDependencies`. `.qa/h100/runtime/run-harness.cjs --real` runs the
launcher's apply step on the new zip in a scratch folder.

### The installer (`CharlesSetup.exe`)
```bat
tools\quickshare\python\python.exe -B scripts\setup-pack.py <output folder>
```
`scripts/build-setup.ps1` compiles `setup/CharlesSetup.cs` with the .NET Framework compiler that comes
with Windows (C# 5, no SDK, nothing downloaded) and embeds `LICENSE`, `LICENSE-ASSETS.md` and
`THIRD-PARTY-NOTICES.md`. `scripts/setup-pack.py` appends the application as a zip with
`charles-manifest.json`, then a footer with the zip's SHA-256 and sizes. The same program is the
uninstaller: `Uninstall Charles.exe` is its first part alone.

`Engine` has no window, registry or shortcuts, so tests can run it on sample data; `Shell` holds what
touches the rest of Windows, all of it in the user's own folders and `HKCU`. A setup unpacks and checks
everything in `_setup\stage` beside the live files; only a complete copy replaces them, one top-level
item at a time, with a journal (`_setup\swap.txt`) that puts the old files back after a failure or the
next time a setup starts. `app/core/updater.cjs` and the setup share the same folder layout and app id,
and the setup leaves the same protected names alone.

The setup's language is for the setup. `charles-install.json` is written only when `%APPDATA%\Charles`
has no `companion.json`, so a language somebody chose is never changed. `setup/install.ps1` stays for
running from a folder; releases use `CharlesSetup.exe`.

### Charles' name in Windows
`Charles.exe` (`setup/CharlesLauncher.cs`) copies `electron.exe` to `charles-host-<key>.exe` and writes
Charles' icon and version resource into that copy; Task Manager takes the name from its
`FileDescription`. The Electron file stays as it came. Charles.exe sets `CHARLES_HOST`; a host started
any other way (the restart after an older updater) goes through Charles.exe first, so it never stays
on an old copy. Changing the resource means raising `host-v4` in the launcher and the
number `CHARLES_HOST` carries (the launcher sets it, the first lines of `app/main.cjs` compare it);
v1.0.0 raised it from 3 so the host says 1.0.0.0.

Before it makes the host, Charles.exe puts a newer Electron in place when `_update\runtime\pending.json`
asks for one (`RuntimeApply` in the launcher; the new `dist` has no host yet, so the next one is made
from the new `electron.exe`). It needs `System.IO.Compression` and `System.Web.Extensions`, which
`scripts/build-launcher.ps1` references.

## Charles Download (optional)

The download engine and its clipboard/island bridge are separate, under `app/modules/download/`.
`app/modules/host.cjs` routes calls; `module-preload.cjs` exposes a limited API. The module’s own
setup notes live in its separate repository and in the Releases → Modules package. Tools are set up
with `npm run setup:download`.
