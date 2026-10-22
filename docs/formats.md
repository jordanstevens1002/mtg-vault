# Native import and export formats

Preview imports in **Import / export**, resolve every reported error, then confirm. A preview never writes inventory. Confirmation is atomic and rechecks the preview against current data. Retry a failed request without changing its operation ID to avoid duplicate application.

## Collection CSV v1

The header and order are:

```csv
version,printing_id,finish,quantity,location,deck,deck_id,deck_format,section
```

Each row describes physical copies of a Scryfall printing. Use `version=1`, a positive integer quantity and an available finish (`nonfoil`, `foil`, `etched`, or `glossy`). Language is determined by the printing UUID; it cannot be silently changed independently.

Specify exactly one storage location name or built deck name. Storage rows use `mainboard` and leave deck fields blank. Deck rows use `commander` or `casual` as the format and one of `mainboard`, `commander`, or `sideboard` as their section.

Exports include the deck UUID so two decks sharing a name remain distinct. Handwritten imports may omit it if the deck name is unambiguous. Existing deck identifiers must match the name, format and built state. Missing named locations and built decks are created during confirmation. Unknown printing UUIDs must first be fetched into the catalogue.

**Imports add copies.** Importing an export into the same populated deployment increases its quantities; it does not replace or reconcile counts. Review the displayed owned-before and added quantities. Use a database restore when replacing an entire deployment.

Exports contain physical copies in storage and built decks. Planned lists, cover preferences and operation records belong to the database backup; export plans separately as text when needed.

## Native deck text

```text
[commander]
1 A Commander Name
[mainboard]
20 Plains
[sideboard]
```

Use English catalogue names with positive quantities. Optional preferred printings append ` | <Scryfall printing UUID>`. Duplicate names in the same section combine when their printing preferences agree. Blank lines and lines beginning with `#` are ignored.

Imports always create a new planned deck and never reserve stock. Text exports from built decks describe their card requirements; the collection CSV preserves actual allocated printings and finishes.

Each import accepts at most 10,000 rows/lines and 2 MB of text. The preview displays the first 100 resolved rows while confirmation includes the whole validated file. ManaBox-specific and other third-party formats are outside v1.
