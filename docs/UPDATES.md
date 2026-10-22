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

`release:pack` packs `app/`, `dist/`, `public/`, `package.json`, `package-lock.json`, `LICENSE`,
`README.md` and `CHANGELOG.md`. Personal and machine files (`.env`, `Charles-creator.json`,
`charles-install.json`, `*.enc.json`, logs …) are never packed. A rarely needed extra folder can be
added with `npm run release:pack -- --with tools/cursor`. When an update needs new dependencies in
`node_modules`, publish a full installer instead.

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
