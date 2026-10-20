# V1 acceptance record

Implementation and automated validation began on 18 October 2026. No v1.0 tag or stable release is authorised by incomplete hardware checks.

## Automated evidence

- React lint/type checks, component tests and production builds pass.
- PostgreSQL tests cover grouped printings, filters, translated and multi-face names, stock transfers, repeated operations, competing mutations, independent plans, complete allocation, disassembly, Commander exceptions and previewed native imports.
- The complete live Scryfall refresh stored 118,773 printings.
- All 39 backend tests pass, including migration backfills, type/mana filters, first-printing covers and offline image-cache behaviour. On the full catalogue, the Plains name query improved from 15.48 seconds to 0.17 seconds after migration 0003.
- Both legacy JSON arrays and current gzip-compressed JSONL are covered. A failure after the first 500 catalogue rows rolls back the whole refresh.
- Chromium against Docker Compose passes the Plains search → printing → receipt → planned deck → physical allocation journey and rejects an unresolved import.
- A synthetic camera stream runs through the real bundled Tesseract engine; no stock is written until printing and quantity confirmation. No external browser OCR requests occur.
- Review updates add local PaddleOCR PP-OCRv5 mobile. Both real engines pass the synthetic non-land title/mana separation case and recover set/collector hints for a unique printing suggestion. The five browser journeys also cover manual printing override, compact mana dropdown closing/viewport fit, dependent subtype options and URL state. Twenty-five frontend tests cover geometry, numbered names, footer layouts/conflicts/failures, printing ambiguity, camera failures and filter controls.
- Scanner follow-up: 28 frontend tests and six browser journeys cover application-launch PaddleOCR model loading without camera access, shared worker reuse across navigation, exact title/face selection, correctable card/printing selections and retry after preparation or inference failure.
- Desktop and 390-pixel layouts are exercised. Permission denial and insecure camera contexts have component coverage.
- Fresh Compose startup and migration succeeded. Backup and replacement restore retained the smoke inventory's 11 owned copies and 3 allocated copies.

The release-review correctness follow-up adds a PostgreSQL snapshot regression and
frontend delayed-response regressions: 39 backend and 31 frontend tests pass.
Planned entry edits wait for fresh deck data after saving, aggregate stock totals
share one statement snapshot, and background catalogue sync polls and refreshes
active catalogue consumers. CI applies production lockfile constraints. The stylesheet was consolidated into
readable rules with one query per responsive breakpoint; all computed styles
matched across 25 Chromium page/viewport comparisons. Explicit frontend Prettier
settings and a CI format check cover owned source and tooling files while leaving
generated types, vendor files and downloaded models in their upstream formats.

Scanner device feedback on 20 October: the maintainer reports successful iPhone
scanning. Android Chrome exposed an ultrawide default lens with poor close focus;
a camera selector now permits a remembered explicit lens choice. Thirty-six
frontend tests cover exact camera constraints, switching/cleanup, preference
reuse, missing-device fallback and enumeration failure. After the selector update
in PR #47, the maintainer confirmed scanning also works on the Android phone.
The reported basic scanning flow now succeeds on desktop Firefox, iPhone and
Android Chrome. Reported phones are a Samsung S22 using Chrome and an iPhone 17;
their Android/iOS versions were described as "latest", with exact OS/browser
version numbers not supplied. Device/browser versions and the expanded edge-case observations
below remain to be recorded; these reports do not imply final release approval.

## Required before v1.0 publication

- [ ] Android Chrome: use a real printed card over trusted HTTPS; verify title recognition, printing choice, finish, quantity, storage/deck destination and cancellation.
- [ ] iPhone Safari: repeat with rear camera, including permission denial/recovery and leaving the scanner screen.
- [ ] Desktop webcam: repeat with real cards and different lighting; verify readable fallback when capture is ambiguous.
- [ ] Verify a double-faced card, an older printing without reliable collector hints, foil glare and two printings sharing artwork. Wrong guesses must remain correctable before saving.
- [ ] Maintainer reviews final UI and the release PR; all required CI and review discussions are resolved.
- [ ] Record device/browser versions, observations and corrective PRs in issues #8 and #10.

Real-device observations cannot be inferred from an emulated viewport or synthetic camera test. Keep the release PR unmerged and do not publish v1.0 until the above evidence is recorded.

The maintainer explicitly requested a review pause before merging `develop` into `main`. Prepare the release PR as a draft; merging into `main` requires their subsequent approval.
