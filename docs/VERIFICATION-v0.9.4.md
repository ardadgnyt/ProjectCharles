# v0.9.4 Beta validation

## Changes under test

- ZIP and ZIP64 directory records, ZIP64 entry sizes/offsets, CRC and unpacked size checks for updates, modules and extraction.
- Reject case-insensitive and normalized-path collisions before extraction writes any file.
- Reject duplicate CSV keys (including generated column-name collisions), excess cells and invalid subtitle timestamps.
- A pre-aborted FFmpeg operation never invokes the process launcher.
- Quick Share recreates failed mDNS discovery, restarts exited BLE publishers and rebinds on resume even when the IP address is unchanged. Receive-off remains off.

`test/v094.test.cjs` includes corrupted and valid fixtures, ZIP64 per-entry extra fields, compressed Unicode filenames, public Converter failures and an injected discovery transport. Existing Quick Share / MultiDrop and LocalSend tests are also run before packaging.

## Automated results (25 October 2026)

- Both source folders build successfully.
- vArgon full suite: 310 passed, 0 failed, 0 skipped before the final additional startup-retry test. The final v0.9.4 regression file then passed all 10 tests, including startup retry and the accompanying null-offer error-handler fix.
- Local GitHub checkout: 441 tests, 408 passed, 31 failed, 2 skipped before that last additional test. All 31 failing test names also failed on the untouched v0.9.3 baseline. This broader folder contains historical UI/source-layout and documentation assertions absent from vArgon; they have not been removed or rewritten just to obtain a green run. No new failure appeared in the comparison.
- Real unmodified MultiDrop Python peer transfer in both directions and the LocalSend certificate/registration/receive tests passed in vArgon.
- The final source and ZIP contents are checked separately during packaging, including SHA-256 and ZIP CRC verification. No real-phone v0.9.4 result is claimed here.

## Device acceptance still required

The maintainer previously verified real-device Quick Share (Samsung and other Android brands) and LocalSend. Those results apply to v0.9.3. The new v0.9.4 background recovery needs a fresh real-device test:

1. Start Charles with receive mode Everyone; keep the island collapsed. Without first sending from the PC, send a photo from Android and accept the incoming request.
2. Wait several minutes and repeat, including with the island hidden.
3. Turn Bluetooth off/on, reconnect Wi-Fi, and resume from Windows sleep; repeat after up to 15 seconds of recovery time.
4. Set receive mode Off and verify no new transfer can be accepted. Re-enable Everyone and repeat.
5. Repeat a LocalSend transfer in both directions with an Apple device.

Charles must be running and the PC awake. This change does not wake a sleeping computer. Bluetooth advertising support and the network's multicast/firewall policy still matter. Hardware discovery is not proven by the injected transport tests.

The BLE helper now observes Windows publisher status and exits on Stopped/Aborted so the independent engine timer can restart it. Status/error transitions are recorded in `%APPDATA%/Charles/logs/quickshare.log`. See [Microsoft publisher status documentation](https://learn.microsoft.com/en-us/uwp/api/windows.devices.bluetooth.advertisement.bluetoothleadvertisementpublisherstatus).

CRC protects against archive corruption; the existing update SHA-256 check remains separate. These fixes do not claim a SHA-256 bypass was possible.

## Scope

Only the local GitHub checkout and vArgon source folders are updated. Setup/update ZIPs and SHA-256 files are generated locally. No main installation update, git push or hosted release publication is performed.
