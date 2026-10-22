"""Catalogue-derived filter vocabulary, including multi-face type lines."""

import re

# Scryfall /catalog/card-types, verified 2026-10-18. Joke type lines also contain
# ordinary words; only expose canonical types, normalising unusual capitalisation.
CARD_TYPES = {
    name.casefold(): name
    for name in (
        "Artifact",
        "Battle",
        "Boss",
        "Conspiracy",
        "Creature",
        "Dungeon",
        "Emblem",
        "Enchantment",
        "Event",
        "Hero",
        "Instant",
        "Kindred",
        "Land",
        "Phenomenon",
        "Plane",
        "Planeswalker",
        "Scheme",
        "Sorcery",
        "Vanguard",
    )
}


def type_options(lines: list[str]) -> dict[str, list[str]]:
    options: dict[str, set[str]] = {}
    for line in lines:
        for face in line.split(" // "):
            before, _, after = face.partition(" — ")
            types = {
                CARD_TYPES[token.casefold()]
                for token in before.split()
                if token.casefold() in CARD_TYPES
            }
            # Plane subtypes are whole plane names; Time Lord is one creature type.
            subtypes = (
                {after}
                if "Plane" in types and after
                else set(re.findall(r"Time Lord|\S+", after))
            )
            for name in types:
                options.setdefault(name, set()).update(subtypes)
    return {name: sorted(values) for name, values in sorted(options.items())}
