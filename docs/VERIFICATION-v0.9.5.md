# v0.9.5 Beta — Windows Quick Share candidate

Development: `C:\Project Charles\ProjectCharles vArgon`. DeepSeek's folder is
read-only reference. The user subsequently authorized copying the completed
source to `C:\GitHub\ProjectCharles` and creating update/setup ZIPs under
`C:\Project Charles\ProjectCharles Release`. The main installation is untouched.

The production ShareService uses the actual vendored MultiDrop Python backend,
not the former JavaScript discovery engine. The upstream revision, runtime,
dependency versions, licenses and two protocol adaptations are recorded in
`tools/quickshare/README.md`, `UPSTREAM.json` and `charles.patch`.

DeepSeek's per-job coordinator/offer cleanup changes were reviewed and reused;
its custom DNS cache and persistent listener list are not used by the new engine.
Charles starts receiving with explicit consent, independently of the share sheet.
Off is respected by startup, asynchronous mode changes and maintenance.

## Validation

* Four consecutive real loopback transfers from the independent JS sender to
  bundled MultiDrop: correct contents, four prompts, one worker/listener/id.
* Three consecutive bundled MultiDrop -> independent JS receiver transfers,
  followed by rejection and a successful retry.
* Consent cancellation followed by another successful receive.
* Concurrent start, receiving Off during startup/resume, mode toggles and stored
  endpoint identity across worker restart.
* MultiDrop's own crypto, unicast responder and loopback tests against the
  vendored implementation: 37 passed, 1 skipped, 1 hardware test deselected.
* LocalSend preparation/upload client certificate and two-way registration tests.
* Sharing regression suite: 40 tests, 38 passed, 2 optional tests skipped.
* Deployed vArgon runtime: 7 transfer/lifecycle/LocalSend tests passed.
* Full suite ran 328 tests. Two version-label assertions were corrected and
  their 25-test group passed on rerun. One unrelated Gemini-model test also
  fails in the untouched baseline (`test/v050.test.cjs`); it was not changed.

Pre-change source/build backup:
`C:\Users\User\Documents\ChatGPT\Sanal Asistan Kodlaması\v095-before-20261026-151330`.

Hardware BLE is intentionally not a dependency of the Windows backend.
Local loopback success does not prove phone visibility or router forwarding.

## Phone verification — partial

2026-10-26: the actual new Python backend recorded two consecutive phone -> PC
transfers completing successfully. The user also reported successful outbound
sharing. Later process inspection showed the DeepSeek build running again, so
the later outbound/idle observations cannot yet be attributed to this backend.
Do not mark the Slime idle case fixed without testing the correct installation.

Device naming: explicit DNS-SD names are preserved. After a successful incoming
file, its sender name can label a hidden peer at the same address for two minutes
and remains associated with the observed endpoint for up to 30 minutes, in memory
only. Unknown hidden phones are shown as "Android cihazı". Three naming tests and
seven transfer/LocalSend tests passed together. No transport/lifecycle changes
were made for this display fix.

Close other Charles builds before starting this vArgon. Permit the bundled
runtime on the local network when Windows requests it. No other Quick Share
test advertiser should be running.

1. Fresh launch, without touching receiving or opening the panel: phone sees PC.
2. Send a small file; consent appears immediately. Accept and verify contents.
3. Send several different files back-to-back; PC remains one device.
4. Let Slime sleep and send again with the share sheet closed.
5. Send from Charles to the phone.
6. Turn receiving Off, verify refusal; turn On and repeat.
7. Verify LocalSend with the existing app.

Record timestamps and the matching `quickshare.log` events if a step fails.
Logs avoid file contents and keys. Do not label real-phone behavior fixed before
the actual phone tests pass. The user has authorized local v0.9.5 packages;
package SHA-256/CRC and runtime inclusion are checked separately from phone tests.

## WhatsApp photo fix

Installed gateway version: GOWA 9.6.0. Its `/message/{id}/download` route returns
JSON metadata with `file_url`/`file_path`, not the Base64 object previously
expected by Charles. Reference:
https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/v9.6.0/src/ui/rest/message.go

Charles now reads the authenticated loopback static file, verifies an allowed
raster signature and converts it to the existing thumbnail/data URL. External
URLs and redirects cannot receive the bridge credentials. Temporary storage
lag retries; failures do not permanently mark a photo as unavailable. Updates
retain `update:true`, preserving the fix for dismissed/stuck notification cards.
Seven tests cover metadata, legacy Base64/binary, retries, concurrent refresh,
URL restrictions, notification updates and shutdown. Actual WhatsApp UI photo
verification remains a user-device check; no messages were sent by the agent.
