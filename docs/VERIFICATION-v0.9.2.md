# v0.9.2 Beta verification — 2026-10-25

- Full Node test suite: 299 passed, 0 failed, 0 skipped.
- Independent unmodified MultiDrop peer: two-way transfer passed.
- Sharing checks cover delayed consent, cancellation, duplicate filenames, empty files, encrypted message integrity, background startup/resume and receive-off behavior.
- Browser checks at 680, 760 and 900 px: Charles and resize grip have identical horizontal centers; both side columns have equal widths; converter/send contain icons only and no added labels.
- UI checks: repeated offers update immediately, closed sheets open for incoming offers, stale state is ignored, only the active drop target highlights, and QR is absent.
- At the native 740 × 170 shelf size the receive mode controls fit without vertical clipping.
- Actual vArgon app was opened: Slime renders and Charles/version appears once. README screenshots render the same source components with sample data and identify this in their caption.
- User previously confirmed physical Samsung S24+ transfers in both directions. The final visual/background changes were validated locally; a fresh physical phone test after these changes is not claimed.
- Windows PowerShell installer parsing passed after restoring UTF-8 BOM.
- Historical tests were updated for the current search API, center calculation, version, quota service and workspace callback; no application behavior was changed solely to satisfy those old assertions.
- Both local checkouts built successfully. No remote push or GitHub Release publication is part of this validation.
