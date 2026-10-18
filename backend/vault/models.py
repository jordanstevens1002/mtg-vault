from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Collection(Base):
    __tablename__ = "collections"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160))


class Card(Base):
    __tablename__ = "cards"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Printing(Base):
    __tablename__ = "printings"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id"), index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("collection_id", "name"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    collection_id: Mapped[UUID] = mapped_column(
        ForeignKey("collections.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))


class Deck(Base):
    __tablename__ = "decks"
    __table_args__ = (
        CheckConstraint("state IN ('planned','built')"),
        CheckConstraint("format IN ('commander','casual')"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    collection_id: Mapped[UUID] = mapped_column(
        ForeignKey("collections.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    state: Mapped[str] = mapped_column(default="planned")
    format: Mapped[str] = mapped_column(default="commander")


class Balance(Base):
    __tablename__ = "balances"
    __table_args__ = (
        UniqueConstraint("collection_id", "printing_id", "finish", "placement"),
        CheckConstraint("quantity >= 0"),
        CheckConstraint("finish IN ('nonfoil','foil','etched','glossy')"),
        CheckConstraint("section IN ('mainboard','sideboard','commander')"),
        CheckConstraint("(location_id IS NULL) <> (deck_id IS NULL)"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    collection_id: Mapped[UUID] = mapped_column(
        ForeignKey("collections.id"), index=True
    )
    printing_id: Mapped[UUID] = mapped_column(ForeignKey("printings.id"), index=True)
    finish: Mapped[str]
    # Language is part of Scryfall's printing identity, not an independent override.
    placement: Mapped[str]
    location_id: Mapped[UUID | None] = mapped_column(ForeignKey("locations.id"))
    deck_id: Mapped[UUID | None] = mapped_column(ForeignKey("decks.id"))
    section: Mapped[str] = mapped_column(default="mainboard")
    quantity: Mapped[int] = mapped_column(default=0)


class DeckEntry(Base):
    __tablename__ = "deck_entries"
    __table_args__ = (
        UniqueConstraint("deck_id", "card_id", "section"),
        CheckConstraint("quantity > 0"),
        CheckConstraint("section IN ('mainboard','sideboard','commander')"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    deck_id: Mapped[UUID] = mapped_column(ForeignKey("decks.id"), index=True)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id"))
    preferred_printing_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("printings.id")
    )
    section: Mapped[str]
    quantity: Mapped[int]


class Cover(Base):
    __tablename__ = "covers"
    collection_id: Mapped[UUID] = mapped_column(
        ForeignKey("collections.id"), primary_key=True
    )
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id"), primary_key=True)
    printing_id: Mapped[UUID] = mapped_column(ForeignKey("printings.id"))


class Operation(Base):
    __tablename__ = "operations"
    collection_id: Mapped[UUID] = mapped_column(
        ForeignKey("collections.id"), primary_key=True
    )
    key: Mapped[UUID] = mapped_column(primary_key=True)
    payload_hash: Mapped[str]
    result: Mapped[dict[str, Any]] = mapped_column(JSONB)


class SyncState(Base):
    __tablename__ = "sync_state"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    last_success: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None]
    running: Mapped[bool] = mapped_column(default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
