# v0.9.4 Beta validation

Version remains `0.9.4-beta.1`. Only vArgon, the local GitHub source folder and local setup/update packages change. No main installation update, git push or hosted release publication is performed.

## Receiving behavior

- Receiving starts On, with explicit user approval for every offer. Legacy automatic-accept settings are not restored.
- Slime sleeping, a collapsed island and a closed sharing panel do not control reception. The main process independently checks listeners, visibility and announcements every 10 seconds without cycling receive mode or rotating identity.
- Explicit Off prevents background recovery from re-enabling reception. A new application launch starts On again.
- Quick Share identity/TXT remain stable during an engine lifetime. Transfers do not withdraw or re-register the receiver.
- Sender BLE wake advertising is separate, bounded to an outgoing discovery window and stopped on incoming sessions or completed/cancelled sends.
- Normal and legacy-router mDNS responses were decoded with python-zeroconf and compared with MultiDrop's unchanged UnicastResponder.response, including contents, TTL, cache flags, query id and questions.
- The secure reader follows MultiDrop's expect_sharing handling of intermediate frames. An early peer ACCEPT is not local consent: introduction and user decision remain required. Cancellation and a fixed deadline have dedicated tests.

Reference: https://github.com/digitaldanis/multidrop/tree/main/src/multidrop/backends/quickshare

## Validation

30 targeted tests passed; the opt-in hardware BLE test was skipped to avoid competing with active phone testing. Tests cover four rapid transfers with one device identity, registration retry, query throttling, outgoing BLE lifetime, headless background recovery, Off during recovery, legacy settings, consent and LocalSend. An unmodified MultiDrop Python peer sends to and receives from Charles over loopback.

The maintainer confirmed successful real-phone transfers, then reported an issue after Slime became idle. The final receive-maintenance change and default-On behavior have automated coverage; real-phone validation after several minutes with Slime idle remains necessary. Local tests do not prove every Android device or network works.

The Windows computer itself must remain awake. Windows power settings are unchanged.

## Archive and conversion fixes retained

- ZIP/ZIP64 directory, sizes/offsets, CRC and uncompressed sizes are validated by updater, module reader and converter.
- Case-insensitive, normalized-path and file/directory collisions fail before extraction writes output.
- Duplicate CSV keys and excess columns fail instead of silently losing values.
- Invalid subtitle times and reversed/equal ranges fail.
- A pre-aborted FFmpeg operation never starts a process.
- Existing update SHA-256 verification remains separate; CRC findings do not demonstrate a SHA-256 bypass.

Update/setup packages are checked for SHA-256, ZIP CRC and agreement with final source files, including nested setup payload and per-file hashes.
