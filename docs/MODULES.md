# Charles modules (API v1)

A module adds a small app to Charles. It has its own code and interface (HTML, CSS,
JavaScript) and opens in its own window. A module runs only with what Charles gives it: it has
**no Node.js, no direct file system access and no network**. Everything goes through
`window.charlesModule`, and Charles checks every call against the module's permissions.

Users install modules in **Settings → Modules → Load module** (a `.zip`). A working example is
in [`docs/examples/hello-module/`](examples/hello-module/).

## Package format

A module is a `.zip` with `manifest.json` at its root. A zip whose files all sit in one top
folder (`hello-module/manifest.json`) is accepted too.

```
hello-module/
  manifest.json
  index.html      ← "entry"
  app.js
  style.css
  icon.png        ← "icon" (optional)
```

Build the zip with the same checks Charles uses:

```
npm run module:pack docs/examples/hello-module            → hello-1.0.0.zip
npm run module:pack <folder> <out.zip>
```

### manifest.json

```json
{
  "id": "hello",
  "name": "Merhaba Modülü",
  "version": "1.0.0",
  "author": "HzPederPan",
  "description": "Short description",
  "charlesApi": 1,
  "entry": "index.html",
  "icon": "icon.png",
  "window": { "width": 1100, "height": 760, "minWidth": 800, "minHeight": 560 },
  "permissions": ["ai", "image", "voice"]
}
```

| Field | Rules |
| --- | --- |
| `id` | `^[a-z0-9][a-z0-9-]{1,40}$`. The same id installs as an **update** (data is kept). |
| `name` | Required, at most 60 characters. Window title. |
| `version` | Semantic version (`1.0.0`, `1.2.0-beta.1`). |
| `author` | Required, at most 60 characters. |
| `description` | Required, at most 300 characters. |
| `charlesApi` | Must be `1`. Other values are refused. |
| `entry` | An `.html` file inside the package. |
| `icon` | Optional `.png`, `.jpg`, `.svg` or `.webp` inside the package (shown in Settings). |
| `window` | Optional. `width`/`height` (default 1100 × 760), `minWidth`/`minHeight` (default 480 × 360). |
| `permissions` | Optional list of `ai`, `image`, `voice`, `download`, `appearance`, `files`. |

Unknown fields, unknown permissions, missing fields or a bad id are refused with a clear message.

## Permissions

| Permission | Allows |
| --- | --- |
| `ai` | `ai.chat` — ask the user's connected AI, optionally with images from the module's own data folder. Nothing is written to the chat history. |
| `image` | `ai.image` — create an image with the chat's image tool. |
| `voice` | `voice.speak` / `voice.stop` — read text aloud. |
| `download` | `download.*` — Charles' download engine (yt-dlp, FFmpeg, the download queue). |
| `appearance` | `slime.wear` — accessories on the desktop Slime while the module is open (Charles 0.8.8+). |
| `files` | `files.save` / `files.pick` — save a file to the user's computer and read files the user picks, always through Windows' own Save / Open window (Charles 0.9.12+). Shown to the user as: “Kaydet penceresiyle bilgisayarına dosya kaydedebilir, Aç penceresiyle seçtiğin dosyaları okuyabilir. Neyin ve nereye kaydedileceğini, hangi dosyanın açılacağını her seferinde sen seçersin; modül başka hiçbir dosyana erişemez.” |
| `storage` *(always)* | Files in the module's own data folder only. |
| `slime` *(always)* | `slime.emote`, `slime.react`, `slime.look` — Slime's expressions and reactions, and reading his look. |
| `notify` *(always)* | `notify` — a short message in Charles' notification bubble. |

Before installing, the user sees the name, version, author, description and every permission
explained, and chooses **Install** or **Cancel**.

## API v1 — `window.charlesModule`

Every call returns a Promise and rejects with a readable `Error` message. Calls are limited per
module (e.g. 60 calls / 10 s in general, `ai.chat` 12 / min, `ai.image` 4 / min).

```js
const C = window.charlesModule;

await C.info();
// → { id, version, charlesVersion, language, permissions, features }
//   `features` (Charles 0.8.7+) lists optional abilities, e.g. ['ai.images']. Older Charles
//   versions send no `features`: treat it as an empty list.

await C.ai.chat({ system: 'Answer briefly.', messages: [{ role: 'user', content: 'Hi' }], model });
// → answer text. `model` is optional (the user's default model). `role`: "user" | "assistant";
//   the last message must be the user's. Up to 50 messages, 100 000 characters in total.
//   Optional `onChunk(text)` is called once with the whole answer (no streaming in API v1).

if ((await C.info()).features?.includes('ai.images'))
  await C.ai.chat({ messages: [{ role: 'user', content: 'What does this page say?' }], images: ['courses/k1/sources/s9.png'] });
// Charles 0.8.7+: optional `images` — up to 10 PNG / JPG / JPEG / WebP files (20 MB each) from
//   the module's own data folder (the same paths as `storage`). Nothing outside that folder can
//   be sent. Needs only the `ai` permission. Works with GPT, Claude and Antigravity (Gemini); with a Cursor, EVREN or
//   Abacus AI model the call fails with “Görseller şu an yalnızca GPT, Claude ve Antigravity ile
//   çalışıyor.” When `features` has no 'ai.images', show your own “images can't be sent” note.

await C.ai.image({ prompt: 'A green slime in a red hat, watercolour' });
// → { path: 'images/2026-….png', url: 'charles-module://<id>/_data/images/2026-….png' }
//   Uses the chat's built-in image tool (Codex / ChatGPT sign-in), takes up to ~3 minutes.

await C.storage.setJSON('notes.json', { text: 'hello' });
await C.storage.getJSON('notes.json', /* fallback */ null);
await C.storage.writeFile('a/b.txt', 'text');                 // or Uint8Array
await C.storage.writeFile('pic.png', base64, { encoding: 'base64' });
await C.storage.readFile('a/b.txt');                           // { encoding: 'utf8' | 'base64' | 'binary' }
await C.storage.listFiles('a');                                // [{ path, dir, size, modified }]
await C.storage.deleteFile('a/b.txt');

await C.voice.speak('Merhaba!');
await C.voice.stop();

await C.slime.emote('happy');   // love, surprised, proud, wink, yawn, happy, annoyed
// Charles 0.8.8+ (features: slime.look, slime.react, slime.wear):
await C.slime.react('greet');   // greet, blink, squash, slap, dizzy, gulp (or an expression above)
await C.slime.look();           // → { color, mustache, hat, eyes, other } — the user's choice
await C.slime.wear({ eyes: 'roundGlasses' });  // "appearance" permission; taken off when the window closes
await C.slime.wear(null);                      // take it off now
C.on('slime-look', (look) => { /* the user changed colour or accessories */ });
await C.notify('Done!');        // at most 300 characters

// Charles 0.9.12+ (features: files.save, files.pick; "files" permission). Only right after a
// click or a key press in the module; one Save / Open window at a time, 6 calls / min.
const r = await C.files.save({
  name: 'Eldoria.zip',                    // suggested name only (no folders)
  // the content, one of:
  // data: 'text' | Uint8Array | base64 (with encoding: 'base64')
  // from: 'images/p1.png'               // one file from the module's own data folder
  zip: ['universes/u_abc/'],              // files/folders from the data folder → Charles zips them
  zipRoot: 'universes/u_abc/',            // this prefix is taken off the paths inside the zip
  filters: [{ name: 'Evren paketi', extensions: ['zip'] }],
  title: 'Evreni dışa aktar',             // optional window title
});
// → { saved: true, name: 'Eldoria.zip', size: 482113 }   — never the full path
// → { saved: false }                                    — the user cancelled (not an error)
// Charles shows “Kaydedildi: Eldoria.zip” in its bubble; a click shows the file in its folder.

const p = await C.files.pick({ filters: [{ name: 'Evren paketi', extensions: ['zip'] }], multiple: false, encoding: 'binary' });
// → { picked: true, files: [{ name, size, data }] }  data: Uint8Array ('binary'), text ('utf8') or base64
// → { picked: false, files: [] }                    — cancelled

const off = C.on('language', (lang) => { /* 'tr', 'en', 'de', … */ });
```

## Slime in your module window — `CharlesSlime` (Charles 0.8.8+)

Charles serves its own Slime to every module; nothing has to be copied into the module:

```html
<div id="pet"></div>
<script src="/_charles/slime.js"></script>
<script>
  const slime = CharlesSlime.mount(document.getElementById('pet'), {
    size: 160,                 // CSS pixels
    look: 'charles',           // the user's colour and accessories (default), or { color, mustache, hat, eyes, other }
    wear: { eyes: 'roundGlasses' },  // always worn on top of the look
    interactive: true,         // eyes follow the cursor, hover heart, slap wobble, dizzy after 3 taps, wink
    sound: true,               // Charles' interface sounds (after the first click)
  });
  slime.emote('happy');        // expressions
  slime.react('greet');        // greet, blink, squash, slap, dizzy, gulp
  slime.state('thinking');     // idle, working, thinking, searching, question, error, finished, sleeping
  slime.station('read');       // work animations: none, terminal, web, read, code, image
  slime.wear({ hat: 'crown' }); slime.setLook({ color: 'blue' }); slime.dance(true);
  slime.destroy();
</script>
```

`CharlesSlime.accessories`, `.colors`, `.emotes`, `.reactions`, `.states` and `.stations` list the
valid values. Only `/_charles/slime.js` and `/_charles/sounds/<name>.wav` are served there.
Check `(await C.info()).features.includes('slime.kit')` before loading it on older Charles versions.

Files in the data folder can be shown directly in the page with
`charles-module://<id>/_data/<path>` (for example the `url` that `ai.image` returns).

## Where things live

| What | Where |
| --- | --- |
| Installed files | `%APPDATA%\Charles\modules\<id>\` |
| The module's data | `%APPDATA%\Charles\module-data\<id>\` — kept when the module is updated or removed, unless "Delete its data too" is ticked. Quota 500 MB. |
| The list | `%APPDATA%\Charles\modules.json` — id, version, on/off, granted permissions, install date, window position |

## Security limits

* **Package checks** (zip and folder alike): no `..`, absolute paths, drive letters or
  backslashes in names; at most 2000 files and 100 MB unpacked; no executables or scripts
  (`.exe .dll .bat .cmd .com .ps1 .vbs .msi .node .sh .lnk .scr .jar .reg .hta …`); no links.
  A package is unpacked into a temporary folder and only moved into place when complete.
* **Window**: `sandbox`, `contextIsolation`, no `nodeIntegration`, `webSecurity` on, no
  `<webview>`, its own in-memory session per module. DevTools only in developer mode.
* **Network**: every `http`, `https`, `ws`, `wss`, `ftp` and `file` request of a module is
  cancelled. Camera, microphone, location, notifications, downloads: refused.
* **Files**: `charles-module://<id>/` serves only that module's folder (path escapes refused,
  correct MIME types, `nosniff`); a module never reads another module's files.
* **Content-Security-Policy** on every response:
  `default-src 'self' charles-module:; script-src 'self' charles-module:; style-src 'self' 'unsafe-inline' charles-module:; img-src 'self' data: blob: charles-module:; connect-src 'self' charles-module:; object-src 'none'; frame-src 'none'; form-action 'none'`.
  No inline scripts and no external scripts.
* **Navigation**: leaving the module's pages and `window.open` are blocked; an `http(s)` link
  opens in the default browser only after the user agrees.
* **Files** (`files.save` / `files.pick`, Charles 0.9.12+): the window opens only right after a
  click or key press in the module (`navigator.userActivation`), one window at a time and at most 6
  calls a minute. The suggested name is cleaned (no folders, `..`, `<>:"/|?*`, Windows' reserved
  names); executable types (the package list above) are refused, also when the user types such
  an extension in the window. `from` and `zip` read only the module's own data folder (the same
  checks as `storage`, no links). At most 200 MB per save, 5000 files in a zip, 20 files / 200 MB
  per pick. Files are written atomically (temporary file, then rename). The module never learns a
  full path: it gets only the name and the size (or the picked files' names and contents).
* **API**: each call is matched to the window's module (webContents → module id) and its
  permissions; a turned-off module can't be opened or call anything.

## Developer mode

Settings → Modules → **Developer mode** adds **Load from folder**: the folder goes through the
same checks and is used in place (nothing is copied). When a file in it changes, it is checked
again and the open module window reloads by itself; a broken change is reported in Charles'
notification bubble. Removing such a module never deletes the folder.

## Not in API v1

Streaming answers, downloading modules from the internet, a module store, signing, native code.
