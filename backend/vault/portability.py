import csv
import hashlib
import io
import json
import re
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import func, select

from vault.config import settings
from vault.db import COLLECTION_ID
from vault.inventory import (
    DB,
    Input,
    Movement,
    Placement,
    apply_movement,
    remember,
    replay,
)
from vault.models import Balance, Card, Deck, DeckEntry, Location, Printing
from vault.schemas import ImportPreview

router = APIRouter(prefix="/api/v1", tags=["portability"])
FIELDS = [
    "version",
    "printing_id",
    "finish",
    "quantity",
    "location",
    "deck",
    "deck_id",
    "deck_format",
    "section",
]


class ImportInput(Input):
    kind: Literal["collection", "decklist"]
    content: str = Field(max_length=2000000)
    deck_name: str = Field(default="Imported deck", min_length=1, max_length=160)
    deck_format: Literal["commander", "casual"] = "commander"


class ConfirmInput(ImportInput):
    operation_id: UUID
    preview_hash: str


def _preview_data(body: ImportInput, db: DB) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    if body.kind == "collection":
        reader = csv.DictReader(io.StringIO(body.content.lstrip("\ufeff")), strict=True)
        if reader.fieldnames != FIELDS:
            raise HTTPException(422, f"Expected CSV columns: {', '.join(FIELDS)}")
        formats: dict[str, str] = {}
        for index, raw in enumerate(reader, 2):
            if index > settings().max_import_rows + 1:
                raise HTTPException(422, "Import exceeds row limit")
            try:
                if None in raw or any(v is None for v in raw.values()):
                    raise ValueError("Incorrect number of columns")
                if raw["version"] != "1":
                    raise ValueError("Unsupported CSV version")
                printing = db.get(Printing, UUID(raw["printing_id"]))
                if not printing:
                    raise ValueError(
                        "Printing not in catalogue; fetch its language printing first"
                    )
                quantity = int(raw["quantity"])
                if not 0 < quantity <= 1000000:
                    raise ValueError("Quantity must be between 1 and 1000000")
                if raw["finish"] not in printing.data.get("finishes", ["nonfoil"]):
                    raise ValueError("Finish unavailable for printing")
                location, deck = raw["location"].strip(), raw["deck"].strip()
                if bool(location) == bool(deck) or max(len(location), len(deck)) > 160:
                    raise ValueError(
                        "Choose one named location or deck, at most 160 characters"
                    )
                section = raw["section"] or "mainboard"
                if section not in ("mainboard", "sideboard", "commander"):
                    raise ValueError("Unknown deck section")
                deck_format = raw["deck_format"] or "casual"
                if deck_format not in ("commander", "casual"):
                    raise ValueError("Unknown deck format")
                if deck:
                    deck_id = str(UUID(raw["deck_id"])) if raw["deck_id"] else ""
                    matches = list(
                        db.scalars(
                            select(Deck).where(
                                Deck.id == UUID(deck_id)
                                if deck_id
                                else (Deck.collection_id == COLLECTION_ID)
                                & (Deck.name == deck)
                            )
                        )
                    )
                    if len(matches) > 1 or any(
                        d.collection_id != COLLECTION_ID
                        or d.name != deck
                        or d.state != "built"
                        or d.format != deck_format
                        for d in matches
                    ):
                        raise ValueError(
                            "Deck name is ambiguous, planned, or has a different format"
                        )
                    identity = deck_id or deck
                    description = deck + ":" + deck_format
                    if identity in formats and formats[identity] != description:
                        raise ValueError("Conflicting formats for the same deck")
                    formats[identity] = description
                rows.append(
                    {
                        "printing_id": str(printing.id),
                        "name": printing.data.get("name", ""),
                        "language": printing.data.get("lang", "en"),
                        "finish": raw["finish"],
                        "quantity": quantity,
                        "location": location,
                        "deck": deck,
                        "deck_id": deck_id if deck else "",
                        "deck_format": deck_format,
                        "section": section if deck else "mainboard",
                    }
                )
            except (ValueError, TypeError, KeyError) as exc:
                errors.append({"line": index, "error": str(exc)})
    else:
        section = "mainboard"
        grouped: dict[tuple[str, str], dict[str, Any]] = {}
        for index, line in enumerate(body.content.splitlines(), 1):
            if index > settings().max_import_rows:
                raise HTTPException(422, "Decklist exceeds line limit")
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line in ("[mainboard]", "[commander]", "[sideboard]"):
                section = line[1:-1]
                continue
            match = re.fullmatch(
                r"(\d+)x?\s+([^|]+?)(?:\s*\|\s*([0-9a-fA-F-]+))?", line
            )
            if not match:
                errors.append(
                    {
                        "line": index,
                        "error": "Expected quantity, English card name, and optional | printing UUID",
                    }
                )
                continue
            quantity, name, preferred = int(match[1]), match[2].strip(), match[3]
            card = db.scalar(select(Card).where(func.lower(Card.name) == name.lower()))
            if not card or quantity <= 0 or quantity > 1000000:
                errors.append(
                    {
                        "line": index,
                        "error": f"Unresolved card or invalid quantity: {name}",
                    }
                )
                continue
            if preferred:
                try:
                    printing = db.get(Printing, UUID(preferred))
                    if not printing or printing.card_id != card.id:
                        raise ValueError()
                except ValueError:
                    errors.append(
                        {
                            "line": index,
                            "error": "Preferred printing does not match card",
                        }
                    )
                    continue
            key = (str(card.id), section)
            if key in grouped:
                if grouped[key]["preferred_printing_id"] != preferred:
                    errors.append(
                        {
                            "line": index,
                            "error": "Conflicting preferred printings in one section",
                        }
                    )
                grouped[key]["quantity"] += quantity
                if grouped[key]["quantity"] > 1000000:
                    errors.append(
                        {"line": index, "error": "Combined quantity exceeds limit"}
                    )
            else:
                grouped[key] = {
                    "card_id": str(card.id),
                    "name": card.name,
                    "quantity": quantity,
                    "section": section,
                    "preferred_printing_id": preferred,
                }
        rows = list(grouped.values())
    if not rows and not errors:
        errors.append({"line": 0, "error": "Import contains no cards"})
    before = int(
        db.scalar(
            select(func.coalesce(func.sum(Balance.quantity), 0)).where(
                Balance.collection_id == COLLECTION_ID
            )
        )
        or 0
    )
    result = {
        "kind": body.kind,
        "deck_name": body.deck_name if body.kind == "decklist" else None,
        "deck_format": body.deck_format if body.kind == "decklist" else None,
        "rows": rows,
        "errors": errors,
        "quantity": sum(r["quantity"] for r in rows),
        "owned_before": before,
        "mode": "add physical copies"
        if body.kind == "collection"
        else "create planned deck",
    }
    result["preview_hash"] = hashlib.sha256(
        json.dumps(result, sort_keys=True).encode()
    ).hexdigest()
    return result


def preview_data(body: ImportInput, db: DB) -> dict[str, Any]:
    try:
        return _preview_data(body, db)
    except csv.Error as exc:
        raise HTTPException(
            422, "Malformed CSV or field exceeds supported length"
        ) from exc


@router.post("/imports/preview", response_model=ImportPreview)
def preview(body: ImportInput, db: DB) -> dict[str, Any]:
    return preview_data(body, db)


@router.post("/imports/confirm")
def confirm(body: ConfirmInput, db: DB) -> dict[str, Any]:
    fingerprint, old = replay(
        db, body.operation_id, {"action": "import", **body.model_dump(mode="json")}
    )
    if old is not None:
        return old
    result = preview_data(body, db)
    if result["preview_hash"] != body.preview_hash:
        raise HTTPException(
            409, "Inventory or resolved rows changed; preview the import again"
        )
    if result["errors"]:
        raise HTTPException(422, "Resolve all preview errors before importing")
    if body.kind == "collection":
        for row in result["rows"]:
            if row["location"]:
                location = db.scalar(
                    select(Location).where(
                        Location.collection_id == COLLECTION_ID,
                        func.lower(Location.name) == row["location"].lower(),
                    )
                )
                if not location:
                    location = Location(
                        collection_id=COLLECTION_ID, name=row["location"]
                    )
                    db.add(location)
                    db.flush()
                destination = Placement(location_id=location.id)
            else:
                deck = db.scalar(
                    select(Deck).where(
                        Deck.id == UUID(row["deck_id"])
                        if row["deck_id"]
                        else (Deck.collection_id == COLLECTION_ID)
                        & (Deck.name == row["deck"])
                    )
                )
                if not deck:
                    deck = Deck(
                        id=UUID(row["deck_id"]) if row["deck_id"] else uuid4(),
                        collection_id=COLLECTION_ID,
                        name=row["deck"],
                        format=row["deck_format"],
                        state="built",
                    )
                    db.add(deck)
                    db.flush()
                destination = Placement(deck_id=deck.id, section=row["section"])
            apply_movement(
                db,
                Movement(
                    operation_id=uuid4(),
                    kind="receipt",
                    printing_id=UUID(row["printing_id"]),
                    finish=row["finish"],
                    quantity=row["quantity"],
                    destination=destination,
                ),
            )
        response = {"imported": result["quantity"], "kind": body.kind}
    else:
        deck = Deck(
            collection_id=COLLECTION_ID,
            name=body.deck_name.strip(),
            format=body.deck_format,
            state="planned",
        )
        if not deck.name:
            raise HTTPException(422, "Deck name cannot be blank")
        db.add(deck)
        db.flush()
        for row in result["rows"]:
            db.add(
                DeckEntry(
                    deck_id=deck.id,
                    card_id=UUID(row["card_id"]),
                    quantity=row["quantity"],
                    section=row["section"],
                    preferred_printing_id=UUID(row["preferred_printing_id"])
                    if row["preferred_printing_id"]
                    else None,
                )
            )
        response = {
            "imported": result["quantity"],
            "kind": body.kind,
            "deck_id": str(deck.id),
        }
    return remember(db, body.operation_id, fingerprint, response)


@router.get("/exports/collection")
def export_collection(db: DB) -> Response:
    file = io.StringIO()
    writer = csv.DictWriter(file, fieldnames=FIELDS)
    writer.writeheader()
    for balance in db.scalars(
        select(Balance)
        .where(Balance.collection_id == COLLECTION_ID, Balance.quantity > 0)
        .order_by(Balance.id)
    ):
        location = (
            db.get(Location, balance.location_id) if balance.location_id else None
        )
        deck = db.get(Deck, balance.deck_id) if balance.deck_id else None
        writer.writerow(
            {
                "version": "1",
                "printing_id": str(balance.printing_id),
                "finish": balance.finish,
                "quantity": balance.quantity,
                "location": location.name if location else "",
                "deck": deck.name if deck else "",
                "deck_id": str(deck.id) if deck else "",
                "deck_format": deck.format if deck else "",
                "section": balance.section,
            }
        )
    return Response(
        file.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="mtg-vault-collection.csv"'
        },
    )


@router.get("/exports/decks/{deck_id}")
def export_deck(deck_id: UUID, db: DB) -> Response:
    from vault.decks import detail

    deck = detail(deck_id, db)
    lines = []
    for section in ("commander", "mainboard", "sideboard"):
        lines.append(f"[{section}]")
        for entry in deck["entries"]:
            if entry["section"] == section:
                suffix = (
                    f" | {entry['preferred_printing_id']}"
                    if entry["preferred_printing_id"]
                    else ""
                )
                lines.append(f"{entry['quantity']} {entry['name']}{suffix}")
    return Response(
        "\n".join(lines) + "\n",
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="mtg-vault-deck.txt"'},
    )
