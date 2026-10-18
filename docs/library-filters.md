# Library filters and covers

Owned library and All cards share the same URL-backed filters. Card type and
subtype options come from the local catalogue and work offline. Choose a card type
to limit subtypes; changing the type clears an incompatible subtype. On multi-face
cards, a selected type and subtype must appear together on the same face. Compound
subtypes such as Time Lord and whole plane names remain intact.
Type names use Scryfall's canonical card-type vocabulary, verified 18 October 2026;
words from joke type lines are not offered as additional card types.

The Mana cost builder matches the complete cost, including repeated pips. Click a
mana symbol to add a pip, set generic mana using the range control, and click a
selected pip to remove it. The order of clicks does not affect matching. `{0}` is a
zero-mana cost; clearing the builder removes the cost filter. Generic mana and the
colourless diamond are separate. Mana-value range filters remain available.

The first printing added for a card becomes its library cover, including scanner
confirmation, direct-to-deck receipt and native CSV imports. Later receipts,
transfers, removals and catalogue refreshes keep that preference. You can explicitly
choose another printing on the card's detail page, even one you do not own.

Existing collections did not record scan timestamps before this change. Where no
cover preference exists, the library uses an owned printing; the next receipt
retains an existing owned printing. It cannot reconstruct a historical scan order.
Future first receipts record the actual chosen printing transactionally.

Migration 0004 backfills a small, indexed type-line field so dropdown options do not
require decompressing every printing's provider metadata. Inventory and cover
preferences remain included in the full database backup.
