# Third-party materials

Charles' own code, the Slime character, the app icon and the interface sounds belong to
HzPederPan (see `LICENSE` and `LICENSE-ASSETS.md`). The components below keep their own licenses.

## Inspiration

Charles’s design is inspired by Charles from the *Epic Minequest* video series on Sam Green’s
YouTube channel (https://www.youtube.com/@SamGreen). No artwork, audio or video from that series
is included in Project Charles, and the project is not affiliated with Sam Green.

## Character engine code

Parts of the animation and drawing code in `src/vendor/` (`slime/engine.ts`, `slime/outfits.ts`,
`slime/wardrobe.ts`, `core/anim.ts`, `core/sound.ts`, `core/layout.ts`) are derived from source
code published under the MIT License. As that license requires, its copyright and permission
notice is included in `LICENSE` and kept in `licenses/engine-MIT-LICENSE.txt`. The Slime character, its drawing, the icon
and the sounds are not taken from that source.

Versions of dependencies and their registry integrity hashes are pinned in `package-lock.json`. Their own license files remain in the installed packages.

Markdown formatting uses markdown-it 15.0.2. License notices for its bundled dependencies are retained in `licenses/`. Raw HTML and remote images are disabled; only HTTP(S) links are actionable.


## Local speech
- whisper.cpp v1.9.2, MIT: https://github.com/ggml-org/whisper.cpp/tree/v1.9.2. License: licenses/WHISPER-CPP-LICENSE.
- OpenAI Whisper multilingual base weights, MIT: https://huggingface.co/ggerganov/whisper.cpp. License: licenses/WHISPER-MODEL-LICENSE.
- Model SHA-256: 60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe.
- Runtime archive SHA-256: 49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a.
- Windows Turkish speech uses the installed Windows SAPI / OneCore voice; no voice package is redistributed.

- Active speech model: Whisper multilingual small. SHA-256: 1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b. Same MIT Whisper model license.

## v1.1
Reading accessories are vector code inspired by the user-provided Charles-okuyor.gif.
Local document extraction: pdf-parse 1.1.1 (MIT, including its bundled PDF.js notices) and fflate 0.8.3 (MIT). Original package licenses remain in node_modules.

## v3.0
Bundled official clients: @google/gemini-cli 0.63.0, @google/genai 2.28.0 and @anthropic-ai/claude-code 2.1.296. Their license notices remain in node_modules. Authentication uses the official clients, not a shared account or redistributed credentials.

Wake model: Whisper multilingual tiny, same MIT model license. SHA-256: be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21.

## v3.1
Node.js 24.21.0 Windows x64 runtime is bundled for the interactive Gemini CLI. Its complete license is retained in tools/node/LICENSE.

## v3.1 R2
Official Google Antigravity CLI 1.3.3 replaces the Gemini CLI consumer account connection. Origin and checksum: tools/antigravity/NOTICE.txt. Google service terms apply to account use.

## v3.2 additions

- Cursor Agent CLI, Windows x64 package 2026.10.01-e373342, downloaded from https://downloads.cursor.com/lab/2026.10.01-e373342/windows/x64/agent-cli-package.zip . Bundled upstream notices are preserved in tools/cursor. Cursor is an independent service and requires its own account/terms.
- ImapFlow and mailparser (npm): upstream licenses and dependencies are preserved under node_modules. Used for user-configured TLS IMAP access.
