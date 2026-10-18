# V1 acceptance record

Implementation and automated validation began on 18 October 2026. No v1.0 tag or stable release is authorised by incomplete hardware checks.

## Automated evidence

- React lint/type checks, component tests and production builds pass.
- PostgreSQL tests cover grouped printings, filters, translated and multi-face names, stock transfers, repeated operations, competing mutations, independent plans, complete allocation, disassembly, Commander exceptions and previewed native imports.
- The complete live Scryfall refresh stored 118,773 printings.
- All 33 backend tests pass, including migration backfills and offline image-cache behaviour. On the full catalogue, the Plains name query improved from 15.48 seconds to 0.17 seconds after migration 0003; both browser journeys then passed in 7.2 seconds.
- Both legacy JSON arrays and current gzip-compressed JSONL are covered. A failure after the first 500 catalogue rows rolls back the whole refresh.
- Chromium against Docker Compose passes the Plains search → printing → receipt → planned deck → physical allocation journey and rejects an unresolved import.
- A synthetic camera stream runs through the real bundled Tesseract engine; no stock is written until printing and quantity confirmation. No external browser OCR requests occur.
- Desktop and 390-pixel layouts are exercised. Permission denial and insecure camera contexts have component coverage.
- Fresh Compose startup and migration succeeded. Backup and replacement restore retained the smoke inventory's 11 owned copies and 3 allocated copies.

## Required before v1.0 publication

- [ ] Android Chrome: use a real printed card over trusted HTTPS; verify title recognition, printing choice, finish, quantity, storage/deck destination and cancellation.
- [ ] iPhone Safari: repeat with rear camera, including permission denial/recovery and leaving the scanner screen.
- [ ] Desktop webcam: repeat with real cards and different lighting; verify readable fallback when capture is ambiguous.
- [ ] Verify a double-faced card, an older printing without reliable collector hints, foil glare and two printings sharing artwork. Wrong guesses must remain correctable before saving.
- [ ] Maintainer reviews final UI and the release PR; all required CI and review discussions are resolved.
- [ ] Record device/browser versions, observations and corrective PRs in issues #8 and #10.

Real-device observations cannot be inferred from an emulated viewport or synthetic camera test. Keep the release PR unmerged and do not publish v1.0 until the above evidence is recorded.

The maintainer explicitly requested a review pause before merging `develop` into `main`. Prepare the release PR as a draft; merging into `main` requires their subsequent approval.
