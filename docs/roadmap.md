# Roadmap

The [GitHub project](https://github.com/users/jordanstevens1002/projects/1) tracks
implementation status. Future work lives in the **Future enhancements** milestone;
no release date or version is committed until scope and acceptance criteria are agreed.
Existing v1 publication acceptance remains tracked in issues #8 and #10.

## Planned scanning upgrades

| Feature | Intended behaviour | Tracking |
| --- | --- | --- |
| Batch scanning | Capture cards one at a time into a pending queue, correct printings and quantities, then confirm the batch together. Stock changes only on confirmation. | [#51](https://github.com/jordanstevens1002/mtg-vault/issues/51) |
| Continuous video scanning | Recognise stable camera frames automatically, suppress repeated detections and send proposed cards to the review queue. Include pause, correction and intentional duplicate-copy controls. | [#52](https://github.com/jordanstevens1002/mtg-vault/issues/52) |

Implement the batch review queue before continuous video scanning. Both retain
local PaddleOCR processing, explicit confirmation and transactional, idempotent
inventory changes. Start continuous scanning with a mobile feasibility check and
agree measurable detection and performance targets before implementation.
Multiple cards in one photograph is a separate possible feature, not implied by
these two items.

## Ideas for discussion

These are suggestions rather than scheduled work or approved implementation scope.

- **Find a physical card:** storage hierarchy (box, binder, divider) and printable
  QR labels that open a location's contents. Make bulk cards easier to retrieve.
- **Deck completion view:** show missing copies, preferred printings and which
  storage locations hold available copies; export an acquisition list without
  reserving stock for competing plans.
- **Inventory history and undo:** explain receipts, corrections and transfers;
  reverse an operation only when current physical balances allow it.
- **Bulk inventory actions:** select cards or an entire storage location to move,
  tag or export, with a clear quantity preview and atomic confirmation.
- **Saved views and tags:** reopen frequent filters and organise cards by personal
  categories such as trade stock, favourites or a particular deck project.
- **Backup status and scheduling:** display the last successful backup and offer
  documented scheduled backups plus a restore verification workflow.
- **Deck snapshots and comparison:** compare revisions, record substitutions and
  distinguish list changes from physical inventory moves.
- **Trading workflow:** record offered and received copies with previewed physical
  stock changes, keeping proposed trades separate from completed transfers.
- **Multiple collections and memberships:** add accounts and permissions through
  the existing collection boundary when needed; requires a separate authentication
  and migration design.

Prefer retrieval, deck completion and inventory history first: they directly
support the application's focus on built decks and bulk ownership. Evaluate new
external providers, offline mutation queues and recognition models separately;
none is introduced by this roadmap.
