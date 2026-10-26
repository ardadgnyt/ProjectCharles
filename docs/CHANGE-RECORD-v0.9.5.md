# v0.9.5 implementation record

Windows Quick Share now runs MultiDrop's pinned Python backend, zeroconf and
cryptography in a bundled runtime. Charles uses stdio IPC for offers, acceptance,
progress, cancellation, discovery and health. There is one backend per Charles
process, with serialized receiving transitions and no renderer-owned listeners.
The former JS QuickShareEngine is kept for legacy tests, not started in production.

DeepSeek's coordinator work was used as a base for `share.cjs`. Receive-mode
transitions no longer force a healthy Off/On cycle; the backend owns network
watching. Per-transfer UI scoping is retained. LocalSend's shared mDNS socket
forwards relevant queries to MultiDrop's responder without running a second QS
engine. LocalSend's transport is unchanged.

Added: `app/files/quickshare-multidrop.cjs`, `tools/quickshare/` source/runtime/
licenses/lock/manifest/patch and `test/quickshare-multidrop.test.cjs`.
Changed: coordinator, LocalSend query forwarding hook, two legacy test fixtures,
version metadata, documentation and third-party notices. No UI layout changes.

Upstream adaptations are limited to explicit receiver cancellation and rejecting
missing receipt timeouts; see `tools/quickshare/charles.patch`. DNS-SD, wire and
crypto source are upstream. No direct use of Linux BLE or Apple AWDL.

Real-device observations and remaining checks are recorded in VERIFICATION-v0.9.5.md.
The user subsequently requested local source promotion and v0.9.5 update/setup
archives with SHA-256. No remote GitHub publication, push or hosted release is requested.

WhatsApp photo loading now follows GOWA 9.6's local-file metadata response,
with bounded loopback fetching, retries and deduplicated in-memory thumbnails.
Quick Share update packaging uses a separate root and migrates only its managed
runtime, preserving existing AI/voice tools. Source/runtime licenses are included.
