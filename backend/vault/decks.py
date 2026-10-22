from collections import defaultdict
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import delete, func, select

from vault.db import COLLECTION_ID
from vault.inventory import (
    DB,
    Input,
    Movement,
    NameInput,
    Placement,
    Section,
    apply_movement,
    lock_collection,
    remember,
    replay,
    scoped,
)
from vault.models import Balance, Card, Deck, DeckEntry, Printing
from vault.schemas import DeckDetail, DeckSummary

router = APIRouter(prefix="/api/v1/decks", tags=["decks"])


class DeckInput(NameInput):
    format: Literal["commander", "casual"] = "commander"
    state: Literal["planned", "built"] = "planned"


class EntryInput(Input):
    card_id: UUID
    section: Section = "mainboard"
    quantity: int = Field(gt=0, le=1000000)
    preferred_printing_id: UUID | None = None


class EntriesInput(Input):
    entries: list[EntryInput] = Field(max_length=2000)


class Selection(Input):
    source_id: UUID
    quantity: int = Field(gt=0, le=1000000)
    section: Section = "mainboard"


class BuildInput(Input):
    operation_id: UUID
    selections: list[Selection] = Field(max_length=4000)


class DisassembleInput(Input):
    operation_id: UUID
    location_id: UUID


def deck_summary(db: DB, deck: Deck) -> dict[str, Any]:
    quantity = (
        db.scalar(
            select(func.coalesce(func.sum(Balance.quantity), 0)).where(
                Balance.deck_id == deck.id, Balance.collection_id == COLLECTION_ID
            )
        )
        if deck.state == "built"
        else db.scalar(
            select(func.coalesce(func.sum(DeckEntry.quantity), 0)).where(
                DeckEntry.deck_id == deck.id
            )
        )
    )
    return {
        "id": str(deck.id),
        "name": deck.name,
        "format": deck.format,
        "state": deck.state,
        "quantity": int(quantity or 0),
        "commander_colors": deck.commander_colors,
    }


@router.get("", response_model=list[DeckSummary])
def list_decks(db: DB) -> list[dict[str, Any]]:
    return [
        deck_summary(db, deck)
        for deck in db.scalars(
            select(Deck).where(Deck.collection_id == COLLECTION_ID).order_by(Deck.name)
        )
    ]


@router.post("", status_code=201)
def create_deck(body: DeckInput, db: DB) -> dict[str, Any]:
    lock_collection(db)
    deck = Deck(
        collection_id=COLLECTION_ID,
        name=body.name.strip(),
        format=body.format,
        state=body.state,
    )
    db.add(deck)
    db.flush()
    return deck_summary(db, deck)


@router.get("/{deck_id}", response_model=DeckDetail)
def detail(deck_id: UUID, db: DB) -> dict[str, Any]:
    deck = scoped(db, Deck, deck_id)
    result = deck_summary(db, deck)
    entries: list[dict[str, Any]] = []
    if deck.state == "planned":
        for entry in db.scalars(select(DeckEntry).where(DeckEntry.deck_id == deck.id)):
            card = db.get(Card, entry.card_id)
            assert card
            entries.append(
                {
                    "card_id": str(card.id),
                    "name": card.name,
                    "data": card.data,
                    "section": entry.section,
                    "quantity": entry.quantity,
                    "preferred_printing_id": str(entry.preferred_printing_id)
                    if entry.preferred_printing_id
                    else None,
                }
            )
    balances = db.scalars(
        select(Balance).where(
            Balance.collection_id == COLLECTION_ID,
            Balance.quantity > 0,
            Balance.deck_id == deck.id,
        )
    ).all()
    grouped: dict[tuple[UUID, str], dict[str, Any]] = {}
    for balance in balances:
        printing = db.get(Printing, balance.printing_id)
        assert printing
        card = db.get(Card, printing.card_id)
        assert card
        key = (card.id, balance.section)
        item = grouped.setdefault(
            key,
            {
                "card_id": str(card.id),
                "name": card.name,
                "data": card.data,
                "section": balance.section,
                "quantity": 0,
                "preferred_printing_id": None,
            },
        )
        item["quantity"] += balance.quantity
    if deck.state == "built":
        entries = list(grouped.values())
    sources: list[dict[str, Any]] = []
    for balance, printing, card in db.execute(
        select(Balance, Printing, Card)
        .join(Printing, Printing.id == Balance.printing_id)
        .join(Card, Card.id == Printing.card_id)
        .where(
            Balance.collection_id == COLLECTION_ID,
            Balance.location_id.is_not(None),
            Balance.quantity > 0,
        )
    ):
        if str(card.id) in {e["card_id"] for e in entries}:
            sources.append(
                {
                    "id": str(balance.id),
                    "card_id": str(card.id),
                    "printing_id": str(printing.id),
                    "data": printing.data,
                    "finish": balance.finish,
                    "quantity": balance.quantity,
                    "location_id": str(balance.location_id),
                }
            )
    demand: dict[str, int] = defaultdict(int)
    for item in entries:
        demand[item["card_id"]] += item["quantity"]
    shortages = {
        card_id: max(
            0, quantity - sum(s["quantity"] for s in sources if s["card_id"] == card_id)
        )
        for card_id, quantity in demand.items()
    }
    result.update(entries=entries, sources=sources, shortages=shortages)
    return result


@router.put("/{deck_id}/entries")
def replace_entries(deck_id: UUID, body: EntriesInput, db: DB) -> dict[str, int]:
    lock_collection(db)
    deck = scoped(db, Deck, deck_id)
    if deck.state != "planned":
        raise HTTPException(409, "Edit built decks through physical stock transfers")
    seen = set()
    for entry in body.entries:
        if (entry.card_id, entry.section) in seen:
            raise HTTPException(422, "Combine duplicate entries in the same section")
        seen.add((entry.card_id, entry.section))
        if not db.get(Card, entry.card_id):
            raise HTTPException(404, "Unknown card")
        if entry.preferred_printing_id:
            printing = db.get(Printing, entry.preferred_printing_id)
            if not printing or printing.card_id != entry.card_id:
                raise HTTPException(422, "Preferred printing belongs to another card")
    db.execute(delete(DeckEntry).where(DeckEntry.deck_id == deck.id))
    db.add_all(
        [DeckEntry(deck_id=deck.id, **entry.model_dump()) for entry in body.entries]
    )
    return {"entries": len(body.entries)}


@router.post("/{deck_id}/build")
def build(deck_id: UUID, body: BuildInput, db: DB) -> dict[str, Any]:
    fingerprint, old = replay(
        db,
        body.operation_id,
        {"action": "build", "deck_id": str(deck_id), **body.model_dump(mode="json")},
    )
    if old is not None:
        return old
    deck = scoped(db, Deck, deck_id)
    if deck.state != "planned":
        raise HTTPException(409, "Deck is already built")
    required = {
        (entry.card_id, entry.section): entry.quantity
        for entry in db.scalars(select(DeckEntry).where(DeckEntry.deck_id == deck.id))
    }
    selected: dict[tuple[UUID, str], int] = defaultdict(int)
    demand: dict[UUID, int] = defaultdict(int)
    for selection in body.selections:
        source = scoped(db, Balance, selection.source_id)
        if not source.location_id:
            raise HTTPException(409, "Build from available storage stock")
        printing = db.get(Printing, source.printing_id)
        assert printing
        selected[(printing.card_id, selection.section)] += selection.quantity
        demand[source.id] += selection.quantity
        if demand[source.id] > source.quantity:
            raise HTTPException(409, "Insufficient stock; nothing has been allocated")
    if dict(selected) != required:
        raise HTTPException(
            409, "Choose physical copies for every planned entry, with no extras"
        )
    deck.state = "built"
    db.flush()
    for selection in body.selections:
        apply_movement(
            db,
            Movement(
                operation_id=uuid4(),
                kind="transfer",
                source_id=selection.source_id,
                quantity=selection.quantity,
                destination=Placement(deck_id=deck.id, section=selection.section),
            ),
        )
    return remember(
        db, body.operation_id, fingerprint, {"deck_id": str(deck.id), "state": "built"}
    )


@router.post("/{deck_id}/disassemble")
def disassemble(deck_id: UUID, body: DisassembleInput, db: DB) -> dict[str, Any]:
    fingerprint, old = replay(
        db,
        body.operation_id,
        {
            "action": "disassemble",
            "deck_id": str(deck_id),
            **body.model_dump(mode="json"),
        },
    )
    if old is not None:
        return old
    deck = scoped(db, Deck, deck_id)
    if deck.state != "built":
        raise HTTPException(409, "Only built decks can be disassembled")
    entries: dict[tuple[UUID, str], int] = defaultdict(int)
    balances = list(
        db.scalars(
            select(Balance).where(
                Balance.collection_id == COLLECTION_ID,
                Balance.deck_id == deck.id,
                Balance.quantity > 0,
            )
        )
    )
    for balance in balances:
        printing = db.get(Printing, balance.printing_id)
        assert printing
        entries[(printing.card_id, balance.section)] += balance.quantity
        apply_movement(
            db,
            Movement(
                operation_id=uuid4(),
                kind="transfer",
                source_id=balance.id,
                quantity=balance.quantity,
                destination=Placement(location_id=body.location_id),
            ),
        )
    db.execute(delete(DeckEntry).where(DeckEntry.deck_id == deck.id))
    db.add_all(
        [
            DeckEntry(deck_id=deck.id, card_id=card, section=section, quantity=quantity)
            for (card, section), quantity in entries.items()
        ]
    )
    deck.state = "planned"
    return remember(
        db,
        body.operation_id,
        fingerprint,
        {"deck_id": str(deck.id), "state": "planned"},
    )
