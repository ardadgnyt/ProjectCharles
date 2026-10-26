# Third-party materials

Charles' own code, the Slime character, the app icon and the interface sounds belong to
HzPederPan (see `LICENSE` and `LICENSE-ASSETS.md`). The components below keep their own licenses.

## Inspiration

Charles’s design is inspired by Charles from the *Epic Minequest* video series on Sam Green’s
YouTube channel (https://www.youtube.com/@SamGreen). No artwork, audio or video from that series
is included in Project Charles, and the project is not affiliated with Sam Green.

## MultiDrop / Quick Share

Since v0.9.5, Windows Quick Share runs the MultiDrop Python backend directly
from tools/quickshare/vendor, reference commit
60119f5d32ae2c68ca755c04776e0d62b6a43489 (GPL-3.0-or-later).
Its source, LICENSE and THIRD_PARTY_NOTICES.md are shipped there. Charles's
adapter, source hashes, dependency lock and explicit upstream modifications
are documented in tools/quickshare/README.md and charles.patch.
The private Python runtime and cryptography/cffi/protobuf/zeroconf/ifaddr/
pycparser libraries retain their original license files in that folder.

The Quick Share implementation in app/files/quickshare.cjs and
app/files/quickshare-channel.cjs adapts protocol handling from
https://github.com/digitaldanis/multidrop (reference revision 60119f5),
licensed GPL-3.0-or-later. The JavaScript adaptation and Charles integration
were modified in October 2026: a persistent encrypted reader, flow control,
file integrity checks, Windows discovery, lifecycle and UI integration.
Project Charles source code is distributed under GPL-3.0-or-later; see LICENSE.
The upstream notice is preserved in licenses/multidrop-NOTICES.md. Components
mentioned there that are not shipped with Charles are not Charles dependencies.

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


## Download tools (0.8.1)

- **yt-dlp**: Unlicense; official Windows builds include components with their own licenses.
  Source and notices: https://github.com/yt-dlp/yt-dlp and
  https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt .
- **FFmpeg**: the bundled 6.0 essentials Windows build is GPL v3, obtained through
  ffmpeg-static 5.2.0. Build/source distribution: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.0
  and https://www.gyan.dev/ffmpeg/builds/ . FFmpeg source: https://git.ffmpeg.org/ffmpeg.git (n6.0).
  License: https://www.gnu.org/licenses/gpl-3.0.html . FFmpeg runs as a separate executable;
  the Download module and, since 0.8.10, the island's converter start it.
- Executable versions and hashes are recorded in tools/download/versions.json.
  Download tool license texts and source references accompany the installer in licenses/download/.

## KaTeX
KaTeX 0.19.0 (MIT), used to render equations locally as MathML. See licenses/katex/LICENSE.

## WhatsApp gateway (0.8.8)
"Mesajlar Charles'ta" (Ayarlar → Eklentiler → WhatsApp) uses GOWA, go-whatsapp-web-multidevice
by Aldino Kemal (MIT License): https://github.com/aldinokemal/go-whatsapp-web-multidevice .
It is not shipped with Charles: when the user turns the feature on, Charles downloads the
Windows build from GOWA's GitHub release, checks it against the SHA-256 GOWA publishes, keeps it
in %APPDATA%\Charles\whatsapp\gateway and runs it as a separate program on 127.0.0.1 only.
WhatsApp is a trademark of WhatsApp LLC; Charles is not affiliated with or endorsed by it.
