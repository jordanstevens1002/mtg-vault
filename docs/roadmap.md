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

## Additional backlog

These enhancements are tracked in **Future enhancements**, all initially in
Backlog. Tracking an idea does not commit a delivery date or implementation order.

| Feature | Intended behaviour | Tracking |
| --- | --- | --- |
| Storage hierarchy and QR labels | Find cards by box, binder or divider and open location contents from printed labels. | [#54](https://github.com/jordanstevens1002/mtg-vault/issues/54) |
| Deck completion | Show missing copies and where available stock is stored; export acquisition lists. | [#55](https://github.com/jordanstevens1002/mtg-vault/issues/55) |
| Inventory history and safe undo | Trace physical changes and reverse them only when current balances permit. | [#56](https://github.com/jordanstevens1002/mtg-vault/issues/56) |
| Bulk inventory actions | Preview and confirm transfers or exports across selected variants and locations. | [#57](https://github.com/jordanstevens1002/mtg-vault/issues/57) |
| Saved searches and tags | Reopen frequent views and organise the collection with personal tags. | [#58](https://github.com/jordanstevens1002/mtg-vault/issues/58) |
| Scheduled backups and status | Track backup health, schedule backups and verify restoration. | [#59](https://github.com/jordanstevens1002/mtg-vault/issues/59) |
| Deck snapshots and comparison | Compare list revisions without silently moving physical stock. | [#60](https://github.com/jordanstevens1002/mtg-vault/issues/60) |
| Trading workflow | Keep proposed trades separate from atomic completed exchanges. | [#61](https://github.com/jordanstevens1002/mtg-vault/issues/61) |
| Collections and memberships | Add accounts and roles through a separately designed migration and authorisation model. | [#62](https://github.com/jordanstevens1002/mtg-vault/issues/62) |
| Preconstructed-deck import | Choose an official product list, preview exact contents and import a plan or physical deck. | [#63](https://github.com/jordanstevens1002/mtg-vault/issues/63) |

## Preconstructed-deck proposal

See the [import design](preconstructed-decks.md) for the proposed data source,
few-click flow, printing resolution, inventory behaviour, tests and delivery slices.
Users choose whether they are adding a newly acquired deck, building from existing
copies or creating a plan; the preview states exactly how owned stock changes.

Prefer physical retrieval, deck completion and inventory history early because
they directly support built decks and bulk ownership. Preconstructed import can
build on the existing catalogue and import primitives without waiting for batch
camera scanning. Confirm delivery order before implementation.
