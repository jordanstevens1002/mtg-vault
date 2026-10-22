import hashlib
import json
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from vault.catalogue import require
from vault.db import COLLECTION_ID, session
from vault.models import Balance, Collection, Cover, Deck, Location, Operation, Printing
from vault.schemas import LocationView, StockSummary

router = APIRouter(prefix="/api/v1", tags=["inventory"])
DB = Annotated[Session, Depends(session, scope="function")]
Section = Literal["mainboard", "sideboard", "commander"]
Finish = Literal["nonfoil", "foil", "etched", "glossy"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Placement(Input):
    location_id: UUID | None = None
    deck_id: UUID | None = None
    section: Section = "mainboard"

    @model_validator(mode="after")
    def one_destination(self) -> "Placement":
        if (self.location_id is None) == (self.deck_id is None):
            raise ValueError("Choose exactly one location or built deck")
        return self


class Movement(Input):
    operation_id: UUID
    kind: Literal["receipt", "remove", "transfer"]
    quantity: int = Field(gt=0, le=1000000)
    printing_id: UUID | None = None
    finish: Finish = "nonfoil"
    source_id: UUID | None = None
    destination: Placement | None = None

    @model_validator(mode="after")
    def coherent(self) -> "Movement":
        if self.kind == "receipt":
            if not self.printing_id or not self.destination or self.source_id:
                raise ValueError("Receipts require a printing and destination only")
        elif not self.source_id or self.printing_id:
            raise ValueError(
                "Transfers/removals require a source balance, not a printing"
            )
        if self.kind == "transfer" and not self.destination:
            raise ValueError("Transfers require a destination")
        if self.kind == "remove" and self.destination:
            raise ValueError("Removals have no destination")
        return self


def scoped[T](db: Session, model: type[T], identity: Any) -> T:
    record = require(db, model, identity)
    if getattr(record, "collection_id", None) != COLLECTION_ID:
        raise HTTPException(404, "Not found")
    return record


def lock_collection(db: Session) -> None:
    # Serialise physical mutations within a collection, including empty-balance inserts.
    # The boundary can later be narrowed without changing API or stock semantics.
    db.execute(
        select(Collection).where(Collection.id == COLLECTION_ID).with_for_update()
    ).scalar_one()


def replay(
    db: Session, key: UUID, payload: BaseModel | dict[str, Any]
) -> tuple[str, dict[str, Any] | None]:
    lock_collection(db)
    data = (
        payload.model_dump(mode="json") if isinstance(payload, BaseModel) else payload
    )
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    old = db.get(Operation, (COLLECTION_ID, key))
    if old and old.payload_hash != fingerprint:
        raise HTTPException(409, "Operation ID already used for a different request")
    return fingerprint, old.result if old else None


def remember(
    db: Session, key: UUID, fingerprint: str, result: dict[str, Any]
) -> dict[str, Any]:
    db.add(
        Operation(
            collection_id=COLLECTION_ID,
            key=key,
            payload_hash=fingerprint,
            result=result,
        )
    )
    db.flush()
    return result


def destination_balance(
    db: Session, printing_id: UUID, finish: str, destination: Placement
) -> Balance:
    printing = require(db, Printing, printing_id)
    if finish not in printing.data.get("finishes", ["nonfoil"]):
        raise HTTPException(422, "Finish is unavailable for this printing")
    if destination.location_id:
        scoped(db, Location, destination.location_id)
        placement = f"location:{destination.location_id}"
    else:
        deck = scoped(db, Deck, destination.deck_id)
        if deck.state != "built":
            raise HTTPException(409, "Planned decks do not hold physical stock")
        placement = f"deck:{deck.id}:{destination.section}"
    balance = db.scalar(
        select(Balance).where(
            Balance.collection_id == COLLECTION_ID,
            Balance.printing_id == printing_id,
            Balance.finish == finish,
            Balance.placement == placement,
        )
    )
    if not balance:
        balance = Balance(
            collection_id=COLLECTION_ID,
            printing_id=printing_id,
            finish=finish,
            quantity=0,
            placement=placement,
            location_id=destination.location_id,
            deck_id=destination.deck_id,
            section=destination.section if destination.deck_id else "mainboard",
        )
        db.add(balance)
        db.flush()
    return balance


def apply_movement(db: Session, body: Movement) -> dict[str, Any]:
    target = None
    if body.kind == "receipt":
        assert body.printing_id and body.destination
        printing = require(db, Printing, body.printing_id)
        if not db.get(Cover, (COLLECTION_ID, printing.card_id)):
            # Older deployments have no scan timestamps. Prefer an existing owned
            # printing in that case; otherwise this first receipt becomes the cover.
            existing = db.scalar(
                select(Printing.id)
                .join(Balance, Balance.printing_id == Printing.id)
                .where(
                    Printing.card_id == printing.card_id,
                    Balance.collection_id == COLLECTION_ID,
                    Balance.quantity > 0,
                )
                .order_by(Balance.id)
                .limit(1)
            )
            db.add(
                Cover(
                    collection_id=COLLECTION_ID,
                    card_id=printing.card_id,
                    printing_id=existing or printing.id,
                )
            )
        target = destination_balance(
            db, body.printing_id, body.finish, body.destination
        )
        target.quantity += body.quantity
    else:
        source = scoped(db, Balance, body.source_id)
        if source.quantity < body.quantity:
            raise HTTPException(409, "Insufficient stock; refresh available quantities")
        if body.destination:
            target = destination_balance(
                db, source.printing_id, source.finish, body.destination
            )
            if target.id == source.id:
                raise HTTPException(422, "Source and destination are identical")
            target.quantity += body.quantity
        source.quantity -= body.quantity
    db.flush()
    return {
        "operation_id": str(body.operation_id),
        "destination_balance_id": str(target.id) if target else None,
        "quantity": body.quantity,
    }


@router.post("/inventory/movements")
def movement(body: Movement, db: DB) -> dict[str, Any]:
    fingerprint, old = replay(db, body.operation_id, body)
    if old is not None:
        return old
    return remember(db, body.operation_id, fingerprint, apply_movement(db, body))


class NameInput(Input):
    name: str = Field(min_length=1, max_length=160, pattern=r".*\S.*")


@router.get("/locations", response_model=list[LocationView])
def locations(db: DB) -> list[dict[str, str]]:
    return [
        {"id": str(item.id), "name": item.name}
        for item in db.scalars(
            select(Location)
            .where(Location.collection_id == COLLECTION_ID)
            .order_by(Location.name)
        )
    ]


@router.post("/locations", status_code=201)
def add_location(body: NameInput, db: DB) -> dict[str, str]:
    lock_collection(db)
    name = body.name.strip()
    if db.scalar(
        select(Location.id).where(
            Location.collection_id == COLLECTION_ID,
            func.lower(Location.name) == name.lower(),
        )
    ):
        raise HTTPException(409, "A location with that name already exists")
    location = Location(collection_id=COLLECTION_ID, name=name)
    db.add(location)
    db.flush()
    return {"id": str(location.id), "name": location.name}


@router.patch("/locations/{location_id}")
def rename_location(location_id: UUID, body: NameInput, db: DB) -> dict[str, str]:
    lock_collection(db)
    location = scoped(db, Location, location_id)
    if db.scalar(
        select(Location.id).where(
            Location.collection_id == COLLECTION_ID,
            Location.id != location_id,
            func.lower(Location.name) == body.name.strip().lower(),
        )
    ):
        raise HTTPException(409, "A location with that name already exists")
    location.name = body.name.strip()
    return {"id": str(location.id), "name": location.name}


@router.get("/summary", response_model=StockSummary)
def summary(db: DB) -> dict[str, int]:
    # One statement gives both aggregates the same PostgreSQL snapshot.
    owned, built = db.execute(
        select(
            func.coalesce(func.sum(Balance.quantity), 0),
            func.coalesce(
                func.sum(Balance.quantity).filter(Balance.deck_id.is_not(None)), 0
            ),
        ).where(Balance.collection_id == COLLECTION_ID)
    ).one()
    return {
        "owned": int(owned),
        "in_decks": int(built),
        "available": int(owned - built),
    }
