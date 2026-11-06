# File sharing

When Charles starts, **File receiving is on** and it stays on in the background even if the sharing panel is never opened. Being on does not mean files are accepted automatically: every incoming transfer asks for approval. The Quick Share engine uses its own bundled Windows runtime (`tools/quickshare`, based on [MultiDrop](https://github.com/digitaldanis/multidrop)); third-party license and copyright notices are in `THIRD-PARTY-NOTICES.md`.

- **On:** the incoming file’s name, size and matching code are shown; choose Accept or Decline. On the island this is on the Send card. With the app window open it is a card in the window’s top right corner, which also shows the transfer and, when it is done, opens the file’s folder on a click.
- **Off:** the device announcement and incoming transfers stop.

Android devices are supported through built-in Quick Share, and Apple devices through the LocalSend app. If a phone hides its name, the name learned during a connection is remembered for the session; unknown phones appear as **Android device**.

## Being visible on the phone

- Charles repeats its Quick Share announcement every few seconds by itself, so the computer appears on the phone’s share sheet without opening the sharing panel.
- Announcements go out only on real network adapters (virtual ones such as VirtualBox, Hyper-V, WSL and VPNs are skipped), and the phone gets only the address on its own network. This keeps it from trying an address it cannot reach and staying on “Connecting…”.
- After sleep and after unlocking, announcing starts again with new sockets; multicast membership is refreshed every minute.
- Some routers do not pass multicast between Wi-Fi devices, so Charles also sends a copy of the announcement directly to devices that speak mDNS on the network, phones included.

For phones to see the computer, Windows Firewall has to allow the Quick Share runtime. If it does not (or a block rule exists because Windows’ first prompt was closed), Charles notices: the sharing panel shows an **Allow network access** button and reminds you once shortly after start. With Windows’ approval the button runs `tools/quickshare/Allow-Local-Network.ps1`, which allows TCP/53318 and UDP/5353 only from local devices on private or domain networks and removes only the block rules written for this runtime.

## Sending and receiving

Choose a file and click a nearby device to start sending. Progress appears after the receiver accepts. **Show in folder** is available for received files. Files with the same name are not overwritten; a new name is used. A cancelled or incomplete transfer is not shown as successful, and its partial file is removed. When sending to a phone whose address has gone stale, Charles looks for the device again and tries once more with the new address. If the phone still refuses, its screen must be on and its Quick Share visibility set to “Everyone”. iPhones need LocalSend on Windows, because Windows Wi-Fi drivers have no Apple AWDL support.

Quick Share and LocalSend start independently: if one cannot start, the other keeps working and the reason appears in the sharing panel. Connection stages and errors are written to `%APPDATA%\Charles\logs\quickshare.log` (`start-failed`, `bridge-exit`, `bridge-stderr`, with user folders removed). File contents, device names and encryption keys are not logged.

## Device test

1. Close Charles, wait a minute and open it. Without touching the sharing panel, send a file from the phone with Quick Share: the computer should be listed within a few seconds and the transfer should finish.
2. Repeat while Slime sleeps and the island is small.
3. Put the computer to sleep, wake it and send again from the phone.
4. Send two files one after the other; each should ask for approval.
