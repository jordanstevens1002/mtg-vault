# Preconstructed-deck import proposal

Status: proposed post-v1 feature, not implemented. Track delivery in [#63](https://github.com/jordanstevens1002/mtg-vault/issues/63). The goal is to add an unmodified, supported preconstructed deck in
a few clicks while preserving exact physical quantities and printing identity.

## User flow

1. Open **Decks → Import preconstructed deck**. Search by product/deck name or
   filter by release, set and deck type. Product variants appear separately.
2. Select a deck and choose what the import means:
   - **Add a newly acquired deck:** receive the product's cards as new owned copies
     and place them in a new built deck. Show an explicit “Adds N owned cards” label.
   - **Build from cards I already own:** use existing available copies; ownership
     stays unchanged. Suggest exact product variants first, show shortages and let
     the user choose acceptable owned alternatives.
   - **Create a planned deck:** copy the list and preferred printings without
     changing or reserving inventory.
3. Review a populated preview and confirm. Show commander/mainboard/sideboard
   counts, actual printings and finish/language, the ownership/allocation delta,
   destination and any unresolved entries. Let users edit substitutions, quantities
   or the deck name before saving. Flag an existing import of the same product,
   but permit another purchased copy through a new explicit confirmation.

Require the user to choose an import mode; never infer that an already-owned card
means the new product should not add another copy. Remember language/location
preferences, but keep the stock effect visible on every preview. A complete,
resolved product needs no card-by-card clicks. Modified decks and ambiguous source
records require correction rather than a silently approximate import.

## Proposed data source

Use **MTGJSON** as a versioned product/deck-list adapter, while retaining Scryfall
for canonical identity, printing metadata and images. MTGJSON is a community data
source for official products, not an official Wizards API. Do not promise complete
product or edition coverage until sampled and measured.

The [deck index](https://mtgjson.com/data-models/deck-list/) provides names, codes,
release dates, types and individual file names. The
[deck model](https://mtgjson.com/data-models/deck/) separates commanders, mainboard,
sideboard and tokens, with sealed-product cross-references. Its
[card entries](https://mtgjson.com/data-models/card/card-deck/) include quantities,
language and finish information. Optional
[Scryfall identifiers](https://mtgjson.com/data-models/identifiers/) provide the
preferred bridge into the existing local catalogue. Verify actual product finish
semantics during the feasibility spike; a printing's available finishes do not
necessarily identify the finish packed in a specific product.

Preserve [MTGJSON's MIT attribution](https://mtgjson.com/license/) in distributed
source data and documentation. Card names, text and artwork retain their existing
rights; importing a deck does not change the application's licence.

## Catalogue and resolution

- Refresh a small index through the existing backend synchronisation process;
  fetch full deck snapshots on demand and cache them in PostgreSQL. Reuse the
  backend image and scheduler; add no broker. Expose source timestamp and errors.
- Fetch only from configured provider origins and validated index paths, with
  timeouts, size limits, schema validation and bounded retries. This feature does
  not accept arbitrary remote URLs. Publish refreshed data atomically and retain
  the last successful snapshot on failure. Cached products work offline once
  their necessary catalogue records are present.
- Identify templates by provider and provider deck key plus edition/product
  identity where available, not display name. Keep source version, fetch time,
  content hash and original section/quantity data. Store immutable revisions so a
  provider refresh cannot alter an imported deck or an open preview.
- Resolve `scryfallId` to a printing and Oracle identity. If absent, attempt a
  unique set/collector-number/language match; names support manual correction but
  never silently choose a physical printing. Fetch missing printings through the
  existing constrained Scryfall adapter. Explain unmatched records.
- Preserve exact variant counts, repeated basic lands and paired commanders.
  Aggregate duplicate rows only for the same physical variant and section.
  Join multi-face records representing one physical card using source identifiers;
  do not sum front/back records blindly. Ambiguous face records block physical
  import until resolved. Do not automatically promote alternate commanders.
- Show tokens, oversized display cards and other extras separately. Initially
  exclude them from physical import with an explicit preview notice; optional
  inclusion requires an agreed inventory model and reliable quantities. Do not
  count tokens as playable deck cards or invent quantities from a token list.
  Random booster contents and variable extras are never received automatically.
- The first supported scope should be fixed-content Commander decks and a sample
  of non-Commander decks represented as Casual. Identify unsupported digital-only,
  special-section or variable-content products clearly rather than flattening
  them into a misleading list. Current Commander validation remains warnings;
  other-format validation is not added by this feature.

## Preview and commit contract

Extend the existing import preview/confirmation approach. A collection-scoped
preview records the source snapshot/hash, selected mode, reviewed deck entries,
resolved variants, stock delta and destinations. Return actionable unresolved
entries and, for existing-stock builds, available quantities and shortages. Edits
create a revised preview; confirmation always refers to the version reviewed.
A proposed endpoint family is `/api/v1/precons` for browsing and
`/api/v1/precon-imports` for preview/confirmation, with generated frontend types.
Final names and schema belong to the API implementation slice.

Confirmation must revalidate preview ownership/version and current stock inside a
transaction. Allocate existing balances using the established concurrency controls;
a stale preview or shortage makes no partial changes. New-deck receipt and deck
creation/allocation happen together. Planned import creates entries only. An
idempotency key covers the entire confirmation, returning the original result on
retry; a deliberate second product copy uses a new confirmation/key.

Retain source provenance on the imported deck and import operation. Updates to the
source template are offered as a comparison, never applied automatically. Explain
how many copies were added or allocated in the result. Reuse normal disassembly
and correction operations rather than silently deleting import history. Include
source/provenance records in database backups and define their portable export
representation before shipping.

## Delivery slices and validation

1. **Source feasibility and fixtures:** verify index/deck schema, coverage,
   attribution, exact variants and counts against a representative sample of
   published manufacturer decklists. Include foil commanders, paired commanders,
   alternate editions, repeated basics, multi-face cards and token/extras records.
2. **Local product catalogue:** migrations, adapter, cache, sync status and tests
   for offline use, interrupted refresh and unsupported records.
3. **Planned-deck import:** browse/select/preview/confirm without stock changes.
4. **Physical import:** atomic new-product receipts and existing-copy allocation;
   test retries, concurrent stock changes, shortages and duplicate-product imports.
5. **Mobile review:** keyboard/touch journeys, exact printing corrections,
   cancellation and a complete resolved product imported without per-card actions.

Split each stage further to meet repository PR-size guidance. Dependencies are
existing catalogue, import-preview and stock primitives; batch camera scanning and
inventory-history enhancements are useful integrations, not prerequisites.
