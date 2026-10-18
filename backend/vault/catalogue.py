from pathlib import Path
from typing import Annotated, Any, Literal
from typing import cast as type_cast
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import Float, String, case, cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from vault import scryfall
from vault.config import settings
from vault.db import COLLECTION_ID, session
from vault.models import Balance, Card, Cover, Printing, SyncState
from vault.schemas import CardDetail, CardPage
from vault.sync import upsert_batch

router = APIRouter(prefix="/api/v1", tags=["catalogue"])
DB = Annotated[Session, Depends(session, scope="function")]


def require[T](db: Session, model: type[T], identity: Any) -> T:
    result = db.get(model, identity)
    if result is None:
        raise HTTPException(404, "Not found")
    return result


def totals(db: Session) -> Any:
    return (
        select(
            Printing.card_id.label("card_id"),
            func.sum(Balance.quantity).label("owned"),
            func.sum(
                case((Balance.deck_id.is_not(None), 1), else_=0) * Balance.quantity
            ).label("in_decks"),
        )
        .join(Printing, Printing.id == Balance.printing_id)
        .where(Balance.collection_id == COLLECTION_ID)
        .group_by(Printing.card_id)
        .subquery()
    )


@router.get("/cards", response_model=CardPage)
def cards(
    db: DB,
    q: str = Query("", max_length=200),
    scope: Literal["owned", "catalogue"] = "owned",
    colors: str | None = Query(None, pattern="^[WUBRG]*$"),
    color_mode: Literal["exact", "contains", "within"] = "within",
    mana_min: float | None = None,
    mana_max: float | None = None,
    mana_cost: str = "",
    card_type: str = "",
    subtype: str = "",
    sort: Literal["name", "mana", "color", "type", "owned", "available"] = "name",
    offset: int = Query(0, ge=0),
    limit: int = Query(48, ge=1, le=100),
) -> dict[str, Any]:
    counts = totals(db)
    owned = func.coalesce(counts.c.owned, 0)
    allocated = func.coalesce(counts.c.in_decks, 0)
    query: Any = select(Card, owned, allocated).outerjoin(
        counts, counts.c.card_id == Card.id
    )
    if scope == "owned":
        query = query.where(owned > 0)
    if q:
        # Includes translated printed names and the individual names of card faces.
        faces = func.jsonb_array_elements(Printing.data["card_faces"]).table_valued(
            "value"
        )
        translated_face = (
            select(1)
            .select_from(faces)
            .where(cast(faces.c.value, JSONB)["printed_name"].astext.ilike(f"%{q}%"))
            .correlate(Printing)
            .exists()
        )
        query = query.where(
            or_(
                Card.name.ilike(f"%{q}%"),
                Card.id.in_(
                    select(Printing.card_id).where(
                        or_(
                            Printing.data["printed_name"].astext.ilike(f"%{q}%"),
                            translated_face,
                        )
                    )
                ),
            )
        )
    if colors is not None:
        identities = Card.data["color_identity"]
        selection = list(dict.fromkeys(colors))
        if color_mode in ("exact", "contains"):
            query = query.where(identities.contains(selection))
        if color_mode in ("exact", "within"):
            query = query.where(identities.contained_by(selection))
    mana = cast(Card.data["cmc"].astext, Float)
    if mana_min is not None:
        query = query.where(mana >= mana_min)
    if mana_max is not None:
        query = query.where(mana <= mana_max)
    if mana_cost:
        query = query.where(
            or_(
                Card.data["mana_cost"].astext == mana_cost.upper(),
                Card.data["card_faces"].contains([{"mana_cost": mana_cost.upper()}]),
            )
        )
    for value, part in [(card_type, 1), (subtype, 2)]:
        if value:
            query = query.where(
                func.split_part(Card.data["type_line"].astext, "—", part).ilike(
                    f"%{value}%"
                )
            )
    ordering = {
        "name": Card.name,
        "mana": mana,
        "color": cast(Card.data["color_identity"], String),
        "type": Card.data["type_line"].astext,
        "owned": owned.desc(),
        "available": (owned - allocated).desc(),
    }[sort]
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(
        query.order_by(ordering, Card.name, Card.id).offset(offset).limit(limit)
    ).all()
    result = []
    for row in rows:
        card = type_cast(Card, row[0])
        total_owned = type_cast(Any, row[1])
        in_decks = type_cast(Any, row[2])
        cover = db.get(Cover, (COLLECTION_ID, card.id))
        printing: UUID | None = (
            cover.printing_id
            if cover
            else db.scalar(
                select(Printing.id)
                .where(Printing.card_id == card.id)
                .order_by(Printing.id)
                .limit(1)
            )
        )
        result.append(
            {
                "id": str(card.id),
                "name": card.name,
                "data": card.data,
                "owned": int(total_owned),
                "in_decks": int(in_decks),
                "available": int(total_owned - in_decks),
                "cover_id": str(printing) if printing else None,
            }
        )
    return {"items": result, "total": total, "offset": offset, "limit": limit}


@router.get("/cards/{card_id}", response_model=CardDetail)
def card_detail(card_id: UUID, db: DB) -> dict[str, Any]:
    card = require(db, Card, card_id)
    prints = db.scalars(
        select(Printing)
        .where(Printing.card_id == card_id)
        .order_by(Printing.data["released_at"].astext.desc(), Printing.id)
    ).all()
    balances = db.scalars(
        select(Balance)
        .join(Printing, Printing.id == Balance.printing_id)
        .where(
            Printing.card_id == card_id,
            Balance.collection_id == COLLECTION_ID,
            Balance.quantity > 0,
        )
    ).all()
    return {
        "id": str(card.id),
        "name": card.name,
        "data": card.data,
        "printings": [{"id": str(p.id), "data": p.data} for p in prints],
        "balances": [
            {
                "id": str(b.id),
                "printing_id": str(b.printing_id),
                "finish": b.finish,
                "quantity": b.quantity,
                "location_id": str(b.location_id) if b.location_id else None,
                "deck_id": str(b.deck_id) if b.deck_id else None,
                "section": b.section,
            }
            for b in balances
        ],
    }


class CoverInput(BaseModel):
    printing_id: UUID


@router.put("/cards/{card_id}/cover")
def cover(card_id: UUID, body: CoverInput, db: DB) -> dict[str, str]:
    printing = require(db, Printing, body.printing_id)
    if printing.card_id != card_id:
        raise HTTPException(422, "Cover must be a printing of this card")
    db.merge(
        Cover(collection_id=COLLECTION_ID, card_id=card_id, printing_id=printing.id)
    )
    return {"printing_id": str(printing.id)}


@router.post("/cards/{card_id}/printings/fetch")
def fetch_printings(
    card_id: UUID, db: DB, language: str = Query("en", pattern="^[a-z]{2,3}$")
) -> dict[str, int]:
    require(db, Card, card_id)
    try:
        rows = scryfall.get_json(
            "/cards/search",
            {"q": f"oracleid:{card_id} lang:{language}", "unique": "prints"},
        )
        count = upsert_batch(db, rows["data"])
        while rows.get("has_more"):
            next_url = scryfall.trusted_url(rows["next_page"], {"api.scryfall.com"})
            rows = scryfall.get_json(next_url.removeprefix("https://api.scryfall.com"))
            count += upsert_batch(db, rows["data"])
        return {"fetched": count}
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Printing lookup unavailable; retry later") from exc


@router.get("/catalogue-sync")
def sync_status(db: DB) -> dict[str, Any]:
    state = db.get(SyncState, 1)
    return {
        "last_success": state.last_success if state else None,
        "last_attempt": state.last_attempt if state else None,
        "running": state.running if state else False,
        "error": state.error if state else None,
        "printings": db.scalar(select(func.count()).select_from(Printing)),
    }


@router.get("/images/{printing_id}/{face}")
def image(printing_id: UUID, face: int, db: DB) -> FileResponse:
    if face not in (0, 1):
        raise HTTPException(404, "No such face")
    cache = settings().image_cache_dir
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{printing_id}-{face}.jpg"
    if path.exists():
        return FileResponse(
            path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    printing = require(db, Printing, printing_id)
    data = printing.data
    faces = data.get("card_faces", [])
    images = data.get("image_uris", {}) if face == 0 else {}
    if not images and face < len(faces):
        images = faces[face].get("image_uris", {})
    if not images.get("normal"):
        raise HTTPException(404, "Image unavailable")
    temporary: Path | None = None
    try:
        import tempfile

        url = scryfall.trusted_url(images["normal"], {"cards.scryfall.io"})
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as file:
            temporary = Path(file.name)
            with scryfall.client() as http, http.stream("GET", url) as response:
                response.raise_for_status()
                if not response.headers.get("content-type", "").startswith(
                    "image/jpeg"
                ):
                    raise ValueError("Unexpected image content type")
                size = 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > 8 * 1024 * 1024:
                        raise ValueError("Image exceeds size limit")
                    file.write(chunk)
            temporary.replace(path)
        return FileResponse(path, media_type="image/jpeg")
    except (httpx.HTTPError, ValueError, OSError) as exc:
        raise HTTPException(
            503, "Image unavailable; cached images remain accessible"
        ) from exc
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
