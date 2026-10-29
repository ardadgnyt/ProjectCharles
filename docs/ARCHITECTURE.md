# Architecture

Charles is an Electron app with three parts: the **main process** (Node.js, `app/`), the
**interface** (TypeScript in `src/`, bundled into `dist/renderer.js`) and a few small
**helper windows** (mail bubble, screen capture). For a file-by-file tour in Turkish, see
[DEVELOPMENT.md](../DEVELOPMENT.md).

```text
 ┌──────────────────────────── Electron main process (app/) ───────────────────────────┐
 │ main.cjs        windows, island layout, tray, shortcuts, IPC handlers (safeHandler)  │
 │ ai/             Codex app-server (JSON-RPC), Claude Code, Antigravity, Cursor; chat rooms │
 │ plugins/        Gmail/Calendar/Drive, Outlook, POP3/IMAP, Home Assistant, services   │
 │ voice/          Hey Charles wake word, Whisper dictation, Gemini Live                │
 │ system/         foreground app, media, performance, capture (PowerShell workers)     │
 │ personal/       memory, reminders, weather, accessories, first-run profile           │
 │ core/           durable JSON store, preferences, policy, desktop-pet physics         │
 └──────────────────────────────▲────────────────────────────────────▲─────────────────┘
                                │ preload.cjs (contextBridge, IPC)   │ events
 ┌──────────────────────────────┴──── Interface (src/ → dist/) ───────┴─────────────────┐
 │ renderer.ts     island, chat feed, composer, model picker, notices                  │
 │ island/         companion strip, desktop pet + jelly, Slime studio, welcome tour    │
 │ settings/       settings pages, plugins, shortcuts, i18n (English / Turkish)         │
 │ chat/ voice/    markdown, history folders, image card, proposals; mic and live voice │
 │ vendor/slime/   the Slime character: canvas engine, shape, accessories, wardrobe     │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

## Main ideas

- **One window, many shapes.** The same transparent window is the compact island, the large
  panel and the desktop pet. `main.cjs` resizes and moves it, and the interface follows
  `ui-layout` events.
- **Strict IPC.** Every request from the interface goes through `safeHandler`. It accepts calls
  only from the app's own page (`charles://app/`) and returns `{ ok, value | error }`.
- **AI providers as local CLIs.** GPT runs through the Codex app-server over line-delimited
  JSON-RPC (`ai/rpc.cjs`, `ai/agent.cjs`). Claude Code, Antigravity and Cursor run as
  child processes (`ai/providers.cjs`). Sign-ins belong to those tools. Charles never sees
  passwords.
- **Permissions.** `core/policy.cjs` turns the Access setting into Codex thread parameters and
  approval answers. Content from mail or the web cannot run commands on its own.
- **Durable storage.** `core/store.cjs` writes JSON atomically (temp file, fsync, rename) and
  keeps a `.bak` copy for recovery. Everything lives in `%APPDATA%\Charles`. Plugin keys are
  encrypted with Electron `safeStorage` (Windows DPAPI).
- **Slime is pure canvas.** `src/vendor/slime/engine.ts` draws the body, face, accessories
  (`outfits.ts`) and work props every frame. States (thinking, working, …), emotes and
  particles are driven by what the AI is doing (`chat/activity.ts`, `chat/reactions.ts`).
- **Desktop pet physics.** `core/pet-physics.cjs` moves the window when Slime is thrown
  (friction and bouncing). `island/jelly.ts` draws the matching squash and wobble.
- **Two languages.** The interface is written in Turkish and translated live into English by
  `settings/i18n.ts`, which watches the page and swaps known texts and patterns.

## Build and test

```cmd
npm run build   :: esbuild bundles src/ and copies public/ into dist/
npm test        :: node --test test/*.test.cjs
```
