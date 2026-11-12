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
   Claude and Cursor `app/ai/providers.cjs` runs that subscription’s CLI tool.
4. Before sending a message, `main.cjs` → `safeHandler('send')` answers some requests **locally**
   (Spotify, opening apps, weather, plugin commands, memory). The rest go to the AI.

---

## 3. `app/` — main process

| Folder | What it does | Important files |
| --- | --- | --- |
| `app/` (root) | Entry points | `main.cjs` (windows: the transparent island and the framed app window, one shared page in a WebContentsView; layout, IPC endpoints), `preload.cjs` (interface bridge) |
| `app/core/` | Infrastructure | `store.cjs` (safe JSON storage), `policy.cjs` (Codex permissions), `layout.cjs` (panel sizes), `preferences.cjs`, `shortcuts.cjs`, `startup.cjs`, `extras.cjs` (appearance preferences and attachments), `desktop-pet.cjs`, `pet-physics.cjs`, `task-mode.cjs`, `proposals.cjs`, `ask-format.cjs`, `reset.cjs`, `file-preview.cjs`, `change-review.cjs`, `dash-layout.cjs`, `system-info.cjs`, `release-notes.cjs` (notes of a version from `CHANGELOG.md`; first install, update or restart), `metric-stats.cjs` (Current / Average / Peak and chart points) |
| `app/ai/` | AI and chats | `agent.cjs` + `rpc.cjs` (Codex), `providers.cjs`, `cli-kits.cjs` + `kimi.cjs` (Kimi, GitHub Copilot and OpenCode through their own command line tools), `provider-tools.cjs` (tool permissions in project mode; no permission-bypass mode), `sessions.cjs`, `chat-folders.cjs`, `chat-classifier.cjs`, `ask-once.cjs`, `chat-actions.cjs`, `conversation-tools.cjs` |
| `app/usage/` | Remaining usage on the island | `codex-usage.cjs`, `gemini-usage.cjs`, `claude-usage.cjs`, `cursor-usage.cjs`, `evren-usage.cjs` |
| `app/modules/` | Modules | `manifest.cjs`, `package.cjs`, `registry.cjs`, `storage.cjs`, `protocol.cjs`, `host.cjs`, `module-preload.cjs`, `ai-image.cjs`; docs: `docs/MODULES.md` |
| `app/plugins/` | Accounts and notifications | `plugins.cjs`, `pop3.cjs`, `plugin-commands.cjs`, `home-climate.cjs`, `mail-search.cjs`, `oauth-setup.cjs`, `mail-triage.cjs`, `mail-alerts.cjs`, `mail-bubble.cjs` + `bubble-preload.cjs`, `deadlines.cjs`, `whatsapp-live.cjs` |
| `app/voice/` | Voice | `voice.cjs` + `voice.ps1` (Whisper, Windows speech), `dictation.cjs` + `dictation-preload.cjs` (push to talk), `gemini-live.cjs`, `live-computer.cjs`, `live-plugins.cjs`, `wake-profile.cjs` |
| `app/personal/` | Personal data | `personal.cjs`, `memory.cjs`, `profile-transfer.cjs`, `creator-profile.cjs`, `companion.cjs`, `weather.cjs`, `weather-chat.cjs` |
| `app/system/` | Windows helpers | `helper-hub.cjs` + `charles-helper.exe` (the one helper process; source `setup/CharlesHelper.cs`), `desktop.cjs` + `.ps1`, `media-worker.cjs`, `performance.cjs`, `live-metrics.cjs` (system monitor), `content-drop.cjs` + `content-reader.ps1` (what Charles reads when dropped), `watchdog.cjs`, `foreground.cjs`, `computer-time.cjs`, `weekly.cjs`, `capture.cjs`, `web-commands.cjs`, `whatsapp.cjs`, `open-with.cjs` |
| `app/files/` | Files | `library.cjs`, `docx.cjs`, `pdf-text.cjs`, `file-rack.cjs`, `slides.cjs` + `pptx-read.cjs`, `ppt-read.cjs`, `powerpoint-com.cjs`, `convert.cjs`, `share.cjs`; converter (v0.9.26): `convert-ops.cjs` (targets, labels and choices per file type), `convert-run.cjs` (runners per type), `convert-host.cjs` (HTML rendering and the engines the converter gets), `office-com.cjs` (Word/Excel/PowerPoint over COM), `pdf-render.cjs`, `pdf-layout.cjs`, `helper-job.cjs`, `sheets.cjs`, `docs.cjs`, `tables.cjs`, `searchable-pdf.cjs`, `pptx-write.cjs`, `vectorize.cjs`, `media.cjs`, `archive.cjs`, `transcribe.cjs`; `image-actions.cjs` (save, copy and attach a picture from the big view) |

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
| `src/chat/` | Messages: `markdown.ts`, `model-picker.ts`, `history-folders.ts`, `activity.ts`, `steps.ts` (the steps list of an answer), `follow.ts` (where the chat is), `reactions.ts`, `reading.ts`, `status-scroll.ts`, `ai-questions.ts`, `steer.ts`, `highlight.ts`, `release-notes.ts`, `content-context.ts` |
| `src/island/` | The island and Slime: `shelf.ts`, `usage.ts`, `panel-motion.ts`, `companion.ts`, `desktop-pet.ts`, `wardrobe.ts`, `animation-loop.ts`, `file-rack.ts`, `system-monitor.ts` |
| `src/workspace/` | App window: `workspace.ts`, `sidebar.ts`, `dashboard.ts`, `side-panel.ts`, `calendar.ts` + `holidays.ts`, `home.ts`, `dash-edit.ts` + `extra-cards.ts`, `work.ts`, `review.ts` + `diff.ts`, `drop-slime.ts`, `modal.ts`, `icons.ts`, `bridge.ts` |
| `src/settings/` | Settings pages: `settings-pages.ts`, `settings-cards.ts`, `providers.ts`, `plugins.ts`, `plugin-guide.ts`, `shortcuts.ts`, `shortcut-view.ts` (key labels and the row's answer line), `push-to-talk.ts`, `personal.ts`, `extras.ts`, `workspace.ts`, `profile-transfer.ts`, `account-tab.ts`, `i18n*.ts` (Turkish → English), `lang/de.ts`, `fr.ts`, `es.ts`, `zh.ts` (English text → other languages; `{n}` is a number) |
| `src/voice/` | Voice interface: `voice.ts`, `dictation.ts`, `wav.ts`, `wake.ts`, `wake-training.ts`, `gemini-live.ts` |
| `src/ui/` | Shared helpers: `sound-button.ts`, `mic-button.ts`, `context-menu.ts` |
| `src/vendor/` | Slime engine, accessories, sounds and animation helpers (license: THIRD-PARTY-NOTICES.md) |

---

## 5. `public/` — HTML and styles

| File | Purpose |
| --- | --- |
| `index.html` | Main window skeleton |
| `bubble.html/.css/.js` | Notification cards (a separate small window) |
| `capture.html/.css/.js` | Screen region selection layer |
| `pet.html/.css` | Charles outside the panel (drawn by the page’s own engine) |
| `drop-target.html/.css/.js` | The frame around what Charles would read |
| `dictation.html/.css/.js` | The push-to-talk indicator, under the island |
| `styles/*.css` | Styles, loaded in order; a later file overrides an earlier one |

Colours come from the `:root` variables in `5-design-system.css` (`--sb-*`) and `6-acrylic.css`
(`--ac-*`).

---

## 6. User data (`%APPDATA%\Charles`)

| File / folder | Contents |
| --- | --- |
| `charles-history.json` (+ `.bak`) | Chat history, folders, edit branches |
| `personal.json` | Memory, reminders, appearance, access mode |
| `companion.json` | City, docking side, suggestion preferences |
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

### Remaining usage (island)
`src/island/usage.ts` follows the provider of the selected model and asks through
`usageRead(force, provider)`. Each request carries a sequence number; if the user changed provider
meanwhile, the old answer is dropped. Main side: `main.cjs` → `safeHandler('usage-read')`.

### Important mail bubbles
```
plugins.poll()  →  new unread mail  →  mail-alerts.mail()
   → mail-triage.triageMail()  (one AI request; without AI: flags + keyword rules)
   → mail-bubble.add()  →  a card (separate window, never takes focus)
   → click  →  the mail's full text becomes an attachment  →  'mail-explain' to the interface
   → renderer.ts sends the message, Charles explains the mail
```
`bubbleSpot()` in `mail-bubble.cjs` places the cards: under the island, beside a tall panel, above
it, or in the corner of the app window. All windows on Windows share one topmost band, so the cards
are raised again whenever the island is activated.

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
`deadlineProposal()` in `app/plugins/deadlines.cjs` asks in the chat. With Google Takvim connected
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
the dictation indicator) follow and nothing adds up; the native surface stays as it is. `37-v0920.css`
zooms `main.island` by the same number, and `src/island/island-size.ts` holds it for the page's own
arithmetic; `test/v0927.test.cjs` keeps the three together. The app window, Charles on the desktop and
the plugin guide share the page but are left out of that rule. The saved chat height is always the
Large one.

### AI connections through a command line tool (`app/ai/cli-kits.cjs`)
Kimi, GitHub Copilot and OpenCode are "kits": `find` (where the user's install puts the tool; none is
shipped), `env`, `plan` (the command line of one message), `answer` (text and a clear error out of what
the tool printed), and for sign-in either `loginArgs` (a console window) or Kimi's own device-code flow
(`Providers.kimiLogin`, no window). `providers.cjs` drives all three through the same branches as Abacus
AI. A chat never gets tools: Kimi through an agent file whose `tools` list is a whitelist, Copilot
through `--deny-tool`, OpenCode through `OPENCODE_CONFIG_CONTENT`. No kit ever uses a mode that skips
permissions. Kimi keeps a home of its own (`providers/kimi/home`, `KIMI_CODE_HOME`); its models and
reasoning levels are read from that home's `config.toml`, and the level of the next run is written
there (`withEffort`), because the tool has no option for it. A new CLI connection is a kit plus its id
in the lists `test/v0927-providers.test.cjs` names.

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
display. `src/renderer.ts` picks the rate: 60 while he moves fast (drag, hover, jelly, costume actions),
30 while the AI works, 20 or 30 with the pointer moving, 12 once pointer and keyboard have rested for
four seconds. These frames are nearly all of an open, idle island's CPU.

### Sending a message
`sendMessage()` in `src/renderer.ts` is the one way out. Called with no argument it takes the message
box; with `{ text, attachments? }` (an edited bubble, a button on the content card) it leaves the box
and its draft alone. It resolves true once `api.send` accepted the message.

### Message style
The user's bubble has one definition, the `--ch-bubble*` variables in `10-noir.css`. The island, the app
window (`39-v0923.css`) and the text of a message with files (`38-v0922.css`) all read them. `body.workspace`
rules in `9-special.css` use `!important`, so a rule for the shared chat must be checked in both places.

### Attachments
`src/chat/attachment-card.ts` draws both forms: the card in the message box (`attachmentCard`) and the
file in a sent message (`sentFile`; a picture there is only the picture). `title` is removed from every
element (`ui/no-native-tooltips.ts`), so the whole name is shown by `attachmentNames`.

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
chat for each added message froze a long chat for seconds.

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
4. Put styles in a new `public/styles/` file loaded last.
5. Add a test under `test/`, then run `npm.cmd test` and `npm.cmd run build`.
6. Write the release notes in English in `CHANGELOG.md`: Charles shows that section after an update.

### Security rules (do not change)
- The interface window uses `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- AI answers and mail contents are handled as text, not HTML.
- Account keys are stored only with `safeStorage` (Windows encryption).
- Antigravity / Claude / Cursor chat connections run tool-free. A folder explicitly named in an
  Antigravity message selects Project mode; the access setting limits reading and editing.

---

## 9. Packaging

`npm run release:pack` builds the in-place update package. `test/`, `src/` and `scripts/` are not
needed to run; they are for development.

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
on an old copy. Changing the resource means raising `host-v3` in the launcher.

## Charles Download (optional)

The download engine and its clipboard/island bridge are separate, under `app/modules/download/`.
`app/modules/host.cjs` routes calls; `module-preload.cjs` exposes a limited API. The module’s own
setup notes live in its separate repository and in the Releases → Modules package. Tools are set up
with `npm run setup:download`.
