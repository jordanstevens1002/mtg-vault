"""Public response contracts used to generate the TypeScript client types."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CardData(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = ""
    printed_name: str | None = None
    type_line: str = ""
    oracle_text: str = ""
    mana_cost: str = ""
    cmc: float = 0
    color_identity: list[str] = Field(default_factory=list)
    legalities: dict[str, str] = Field(default_factory=dict)
    card_faces: list["CardData"] = Field(default_factory=list)
    finishes: list[str] = Field(default_factory=lambda: ["nonfoil"])
    lang: str = "en"
    set: str = ""
    set_name: str = ""
    collector_number: str = ""
    released_at: str = ""


class CardSummary(BaseModel):
    id: UUID
    name: str
    data: CardData
    owned: int
    in_decks: int
    available: int
    cover_id: UUID | None


class CardPage(BaseModel):
    items: list[CardSummary]
    total: int
    offset: int
    limit: int


class PrintingView(BaseModel):
    id: UUID
    data: CardData


class BalanceView(BaseModel):
    id: UUID
    printing_id: UUID
    finish: str
    quantity: int
    location_id: UUID | None
    deck_id: UUID | None
    section: str


class CardDetail(BaseModel):
    id: UUID
    name: str
    data: CardData
    printings: list[PrintingView]
    balances: list[BalanceView]


class LocationView(BaseModel):
    id: UUID
    name: str


class StockSummary(BaseModel):
    owned: int
    in_decks: int
    available: int


class DeckSummary(BaseModel):
    id: UUID
    name: str
    format: str
    state: str
    quantity: int


class EntryView(BaseModel):
    card_id: UUID
    name: str
    data: CardData
    section: str
    quantity: int
    preferred_printing_id: UUID | None


class SourceView(BaseModel):
    id: UUID
    card_id: UUID
    printing_id: UUID
    data: CardData
    finish: str
    quantity: int
    location_id: UUID


class DeckDetail(DeckSummary):
    entries: list[EntryView]
    sources: list[SourceView]
    shortages: dict[str, int]


class Finding(BaseModel):
    code: str
    message: str


class ValidationView(BaseModel):
    format: str
    rules_date: str
    rules_url: str
    catalogue_updated_at: datetime | None
    findings: list[Finding]
    validated: bool


class ImportErrorView(BaseModel):
    line: int
    error: str


class ImportPreview(BaseModel):
    kind: str
    rows: list[dict[str, object]]
    errors: list[ImportErrorView]
    quantity: int
    owned_before: int
    mode: str
    preview_hash: str
