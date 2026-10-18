"""Construction checks against Comprehensive Rules effective 2026-09-25.

Sources: rules 903 and 702.124; card-specific exceptions use current Oracle text.
This module deliberately has no inventory mutation dependencies.
"""

import re
from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy.orm import Session

from vault.decks import detail
from vault.inventory import DB, scoped
from vault.models import Deck, SyncState
from vault.schemas import ValidationView

router = APIRouter(prefix="/api/v1/decks", tags=["commander"])

RULES_DATE = "2026-09-25"
RULES_URL = "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt"


def front(card: dict[str, Any]) -> dict[str, Any]:
    return card.get("card_faces", [card])[0]


def text(card: dict[str, Any]) -> str:
    return str(front(card).get("oracle_text", "")).replace("’", "'")


def eligible(card: dict[str, Any]) -> bool:
    face = front(card)
    types = face.get("type_line", "")
    legendary = "Legendary" in types
    return bool(
        (
            legendary
            and (
                "Creature" in types
                or (
                    ("Vehicle" in types or "Spacecraft" in types)
                    and "power" in face
                    and "toughness" in face
                )
            )
        )
        or "can be your commander" in text(card).lower()
    )


def pairs(first: dict[str, Any], second: dict[str, Any]) -> bool:
    for leader, other in [(first, second), (second, first)]:
        types = front(other).get("type_line", "")
        if (
            eligible(leader)
            and "choose a background" in text(leader).lower()
            and all(t in types for t in ("Legendary", "Enchantment", "Background"))
        ):
            return True
        if (
            eligible(leader)
            and "doctor's companion" in text(leader).lower()
            and eligible(other)
            and "Creature" in types
            and types.split("—")[-1].strip() == "Time Lord Doctor"
        ):
            return True
    if not eligible(first) or not eligible(second):
        return False
    texts = [text(first), text(second)]
    if all(re.search(r"(?im)^partner\s*(?:\(|$)", t) for t in texts):
        return True
    if all(re.search(r"(?im)^friends forever\b", t) for t in texts):
        return True
    variants = [re.findall(r"(?im)^partner\s*[—-]\s*([^\n(]+)", t) for t in texts]
    if set(v.strip().lower() for v in variants[0]) & set(
        v.strip().lower() for v in variants[1]
    ):
        return True
    return all(
        re.search(
            r"(?im)^partner with "
            + re.escape(str(other.get("name", "")))
            + r"(?:\s*\(|\s*$)",
            t,
        )
        for t, other in zip(texts, [second, first], strict=True)
    )


def copy_limit(card: dict[str, Any]) -> int | None:
    if "Basic" in front(card).get("type_line", "").split("—")[0]:
        return None
    oracle = text(card).lower()
    if re.search(r"(?:a|your) deck can have any number of cards named ", oracle):
        return None
    match = re.search(r"(?:a|your) deck can have up to (\w+) cards named ", oracle)
    if match:
        number = match[1]
        words = {
            "one": 1,
            "two": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8,
            "nine": 9,
            "ten": 10,
            "eleven": 11,
            "twelve": 12,
            "thirteen": 13,
            "fourteen": 14,
            "fifteen": 15,
        }
        return int(number) if number.isdigit() else words.get(number, 1)
    return 1


def validate(entries: list[dict[str, Any]]) -> list[dict[str, str]]:
    findings = []

    def warn(code: str, message: str) -> None:
        findings.append({"code": code, "message": message})

    active = [e for e in entries if e["section"] != "sideboard"]
    commanders = [e for e in active if e["section"] == "commander"]
    if sum(e["quantity"] for e in active) != 100:
        warn("deck_size", "Commander requires exactly 100 cards including commanders.")
    if any(e["section"] == "sideboard" for e in entries):
        warn(
            "sideboard",
            "Commander does not use a sideboard; these cards are outside the validated deck.",
        )
    count = sum(e["quantity"] for e in commanders)
    valid_leaders = (
        count == 1 and len(commanders) == 1 and eligible(commanders[0]["data"])
    ) or (
        count == 2
        and len(commanders) == 2
        and pairs(commanders[0]["data"], commanders[1]["data"])
    )
    if not valid_leaders:
        warn(
            "commander",
            "Choose an eligible commander or a valid two-commander pairing.",
        )
    identity = set().union(
        *(set(e["data"].get("color_identity", [])) for e in commanders)
    )
    quantities: dict[str, int] = defaultdict(int)
    data_by_name = {}
    for entry in active:
        card = entry["data"]
        name = card.get("name", entry.get("name", "Unknown card"))
        # Oracle canonical names also cover alternate names on themed printings.
        quantities[name] += entry["quantity"]
        data_by_name[name] = card
        if card.get("legalities", {}).get("commander") != "legal":
            warn(
                "card_legality", f"{name}: not confirmed legal in the cached catalogue."
            )
        required = set(card.get("color_identity", []))
        land_types = front(card).get("type_line", "")
        if "Land" in land_types:
            for land, colour in {
                "Plains": "W",
                "Island": "U",
                "Swamp": "B",
                "Mountain": "R",
                "Forest": "G",
            }.items():
                if re.search(r"\b" + land + r"\b", land_types.split("—")[-1]):
                    required.add(colour)
        if commanders and not required <= identity:
            warn(
                "color_identity",
                f"{name}: outside the commander's colour identity or permitted basic land types.",
            )
    for name, quantity in quantities.items():
        limit = copy_limit(data_by_name[name])
        if limit is not None and quantity > limit:
            warn(
                "copy_limit",
                f"{name}: {quantity} copies exceeds the permitted {limit}.",
            )
    return findings


def report(db: Session, deck_id: UUID) -> dict[str, Any]:
    deck = scoped(db, Deck, deck_id)
    state = db.get(SyncState, 1)
    return {
        "format": deck.format,
        "rules_date": RULES_DATE,
        "rules_url": RULES_URL,
        "catalogue_updated_at": state.last_success if state else None,
        "findings": validate(detail(deck_id, db)["entries"])
        if deck.format == "commander"
        else [],
        "validated": deck.format == "commander",
    }


@router.get("/{deck_id}/validation", response_model=ValidationView)
def validation(deck_id: UUID, db: DB) -> dict[str, Any]:
    return report(db, deck_id)
