# Charles Quick Share — Windows backend

Charles 0.9.6 uses MultiDrop's Python QuickShareBackend directly, pinned to
`60119f5d32ae2c68ca755c04776e0d62b6a43489`:
https://github.com/digitaldanis/multidrop/tree/60119f5d32ae2c68ca755c04776e0d62b6a43489

`vendor/` includes the corresponding source, protocol definitions, license and
upstream notices. `UPSTREAM.json` records original and shipped SHA-256 hashes.
`charles.patch` records every change to upstream protocol files:

* inbound: send CANCEL before closing a user-cancelled, accepted transfer;
* outbound: propagate receipt timeouts instead of reporting success;
* mdns (0.9.6): announce on every real adapter (virtual ones such as VirtualBox,
  Hyper-V, WSL and VPNs are skipped), answer each phone with the address on its
  own subnet only, send all answer chunks, repeat a short unsolicited
  announcement every 4 s (also unicast to recent mDNS neighbours on the same subnet,
  for access points that do not pass multicast between Wi-Fi clients) and rejoin the
  mDNS group every minute;
* backend (0.9.6): keep the announcement across transient enumeration gaps and
  `republish()` from fresh sockets after sleep/resume.

The UKEY2/crypto, framing, file writer and receive/send protocol are upstream code. Windows
does not run a BLE advertiser. Each worker preserves its endpoint throughout
transfers; Charles additionally stores the endpoint id across launches.

`bridge.py` adapts UI consent/events, coalesces discovery (a background scan
every 30 s, plus one whenever the share panel opens), retains found peers for
90 seconds, serializes receiving transitions and offers `refresh` (publish
again, same endpoint id) for resume. It is controlled only
through inherited stdin/stdout pipes; no network control API is opened.
Parent EOF shuts down the worker. The Electron main process owns its lifetime,
independent of the renderer, panel visibility and Slime animations.

`python/` is a private Windows x64 embedded runtime; no system Python is needed.
It ignores global Python installations and environment search paths.
Python 3.13.17: https://www.python.org/downloads/release/python-31317/
Archive SHA-256:
`9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38`
Its license is `python/LICENSE.txt`. Dependencies are pinned in
`requirements.lock`; their license texts are retained in each `.dist-info`
directory in `python/packages/`. No pip/test runner is shipped.

Charles integration: `app/files/quickshare-multidrop.cjs` and `share.cjs`.
The former JavaScript Quick Share engine was removed from the app in 0.9.6; it
survives only as an independent test peer in `test/support/`. LocalSend keeps
its own implementation and uses `app/files/mdns-wire.cjs` for DNS packets.
Relevant queries received by its shared UDP/5353 socket are forwarded to the
same upstream UnicastResponder; this does not create another receiver.

Preferred receive TCP port: 53318, random fallback if occupied. Windows Firewall
must permit this private Python executable to receive LAN TCP and UDP/5353.
`Allow-Local-Network.ps1` adds two rules for this executable, restricted to
LocalSubnet, Private profile only, TCP/53318 and UDP/5353. It requires the normal Windows administrator consent. It does
not disable the firewall or change rules belonging to other installations.

Setup packaging includes this **entire** folder. Update packaging maps it to
`quickshare-tools/`; the adapter moves only that managed directory into
`tools/quickshare` at next start, preserving other AI/voice tools. The source
checkout retains the vendored sources/licenses and `requirements.lock`.
Maintainers can restore the private binary runtime with
`python scripts/setup-quickshare.py`. End users do not install Python or pip.
