# In-place updates (v0.8.0)

Charles updates itself from **GitHub Releases** of `ardadgnyt/ProjectCharles`.

## For users

**Settings → General → Updates**

* **Check for updates** — asks GitHub for the newest release and compares it with the installed
  version (semantic versions: `0.8.0-beta.1 < 0.8.0-beta.2 < 0.8.0 < 0.8.1-beta.1`).
* **Check automatically at startup** — on by default; checks once, about 20 seconds after Charles
  starts, and shows a notification when a new version is out.
* **Update** — downloads, verifies and installs; Charles closes and opens again by itself.

Your chats, settings and keys (`%APPDATA%\Charles`) are never touched. `node_modules`, `models` and
`tools` are only replaced when the update zip contains them. The replaced files are kept in
`<Charles folder>\_update\backup` until the next update; the log is `_update\update.log`.

## Where the information comes from

1. `https://api.github.com/repos/ardadgnyt/ProjectCharles/releases/latest`
2. If that has no release (only pre-releases exist): `…/releases?per_page=20`, the highest version.
3. If the API does not answer (offline, rate limit): `https://github.com/ardadgnyt/ProjectCharles/releases/latest`;
   the tag is read from the redirect and the files are expected at
   `…/releases/download/<tag>/charles-update-<version>.zip` (+ `.sha256`). Release notes are then
   shown as a link to the GitHub page.

Downloads are accepted only over HTTPS from `github.com` / `*.githubusercontent.com`.

## Publishing an update

```
npm run build
npm run release:pack            → release/charles-update-<version>.zip
                                  release/charles-update-<version>.zip.sha256
```

Create a GitHub release (tag e.g. `v0.8.1-beta.1`), write the notes, and attach **both** files.
The version in the file name is the `version` in `package.json`; Charles checks that the
`package.json` inside the zip has the same name and exactly that version.

`release:pack` packs `Charles.exe`, `app/`, `dist/`, `public/`, `src/`, `test/`, `scripts/`,
`setup/`, `docs/`, `licenses/`, `package.json`, `package-lock.json`, `Start-Charles.cmd`, `LICENSE`,
`LICENSE-ASSETS.md`, `THIRD-PARTY-NOTICES.md`, `README.md`, `DEVELOPMENT.md` and `CHANGELOG.md`
(the list is `BASE` in `scripts/release-pack.cjs`); `node_modules` is never in it. Personal and machine files (`.env`, `Charles-creator.json`,
`charles-install.json`, `*.enc.json`, logs …) are never packed. A rarely needed extra folder can be
added with `npm run release:pack -- --with tools/cursor`. When an update needs new dependencies in
`node_modules`, publish a full installer instead. A newer Electron is the exception: it travels as the
update's second part (below).

## Checks before anything changes

* SHA-256 of the zip must match the `.sha256` file of the release (missing `.sha256` → refused).
* Zip: no `..`, absolute paths, drive letters or backslashes (zip-slip); at most 40 000 files and
  1.5 GB unpacked (checked before unpacking); zip at most 400 MB; no two files differing only in case.
* The zip must contain Charles' `package.json` with the expected version, and may not contain
  `_update`, `.git`, `charles-install.json`, `.env` or the personal JSON files.

## The swap (`_update\swap.ps1`)

Runs with Windows PowerShell after Charles quits: waits for Charles to close, moves each item the
zip replaces into `_update\backup`, moves the new item into place, and on any error removes the
new items and moves the old ones back (roll-back). Then it writes `_update\result.json` and
starts Charles again; Charles reports the result once.

## The second part: a newer Electron (v1.0.0)

The update zip never carries `node_modules`, so the Electron that runs Charles
(`node_modules\electron\dist`) travels another way. Users see it as "the second part of the update";
Electron is named only as a detail.

**`charlesRuntime` in `package.json`** names the runtime this version wants:

```json
"charlesRuntime": {
  "electron": "44.11.3",
  "url": "https://github.com/electron/electron/releases/download/v44.11.3/electron-v44.11.3-win32-x64.zip",
  "sha256": "97fca9b8e9b90cdc88c1efd44160ca4b89b15101721d93c8befcbeb35b93fb59",
  "bytes": 158283059
}
```

`package.json` arrives inside the SHA-verified update zip, so the pinned hash does not come from the
network. The zip is Electron's own release file; Charles does not repackage it.

1. **Download** (`app/core/runtime-update.cjs`): when the running Electron is older than
   `charlesRuntime.electron` (Windows x64 only, never downward), Charles downloads the zip into
   `_update\runtime\<name>.part`, once shortly after start (5 seconds after an update, otherwise
   45 seconds) and then at most every 6 hours while it runs. It uses the updater's download (HTTPS,
   GitHub hosts only, every redirect checked), needs 1 GB of free disk space first, checks the size and
   the SHA-256, renames the file and only then writes `_update\runtime\pending.json`. A wrong hash
   deletes the file. Off in `--demo`.
2. **Before the swap of a later update**: when the new version's `package.json` asks for a newer
   Electron, `prepare()` fetches it before the restart (never fatal; `pending.json` then names that app
   version, so a rolled-back swap leaves it alone). The update restarts through `Charles.exe`.
3. **Apply** (`setup/CharlesLauncher.cs`, before Electron runs): when `pending.json` exists,
   Charles.exe waits for every program in `node_modules\electron\dist` to end (up to 20 seconds after a
   restart Charles asked for; otherwise it does not wait), requires that `pending.json` names the same
   Electron version and SHA-256 as `charlesRuntime` in the `package.json` beside it (a file that
   disagrees is dropped), checks the zip's SHA-256 and the free space,
   unpacks it into `dist.new` (zip-slip check), requires `electron.exe` and a `version` file with the
   expected version, renames `dist` → `dist.old` and `dist.new` → `dist`, and deletes `dist.old`, the
   zip and `pending.json`. A small window that never takes the focus says what it does. Any error puts
   the old `dist` back; after 3 failed starts it gives up and Settings offers a retry. A `dist` missing
   beside a `dist.old` (an interrupted swap) is renamed back on the next start. The result is
   `_update\runtime\result.json`, which Charles reads once.
4. **Restart**: the card "The second part of the update is ready" and the line in Settings → General →
   Updates start `Charles.exe` and quit. A host started without the launcher while a runtime waits
   (an older updater's restart) hands over to `Charles.exe` at the top of `app/main.cjs`; the launcher
   sets `CHARLES_RUNTIME_TRIED` whenever it left the runtime where it was, so this never loops.

The old `charles-host-<key>.exe` goes with the old `dist`; Charles.exe makes a new one (its key includes
`electron.exe`'s size and time), as after a reinstall. Shortcuts point at `Charles.exe` and stay valid.
`node_modules\electron\package.json` keeps its old version on such a copy; nothing at start-up reads it.

**When Electron is raised**, change all four fields together: `electron` (also `devDependencies`),
`url`, `sha256` (the line for the win32-x64 zip in the release's official `SHASUMS256.txt`, checked
against the zip npm downloaded) and `bytes` (that zip's size). `test/v100-runtime.test.cjs` checks that
`electron` matches `node_modules/electron`.

## Download tools in 0.8.1

Run `npm run setup:download` and `npm run build`, then `npm run release:pack -- --with tools/download`. The 0.8.1 update includes the native tools, module ZIP and notices. Full installers include the same files.
