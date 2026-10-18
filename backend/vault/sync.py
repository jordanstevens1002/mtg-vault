"""Atomic catalogue refresh. Run as a separate Compose process."""

import json
import logging
import tempfile
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import ijson
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from vault import scryfall
from vault.config import settings
from vault.db import engine
from vault.models import Card, Printing, SyncState

log = logging.getLogger(__name__)


def upsert_batch(db: Session, rows: list[dict[str, Any]]) -> int:
    cards, prints = {}, {}
    for raw in rows:
        data = json.loads(json.dumps(raw, default=float))
        # Some non-game objects have no Oracle identity; retain a stable identity.
        card_id = UUID(data.get("oracle_id") or data["id"])
        cards[card_id] = {"id": card_id, "name": data["name"], "data": data}
        prints[UUID(data["id"])] = {
            "id": UUID(data["id"]),
            "card_id": card_id,
            "data": data,
        }
    if not prints:
        return 0
    statement = insert(Card).values(list(cards.values()))
    db.execute(
        statement.on_conflict_do_update(
            index_elements=[Card.id],
            set_={"name": statement.excluded.name, "data": statement.excluded.data},
        )
    )
    statement = insert(Printing).values(list(prints.values()))
    db.execute(
        statement.on_conflict_do_update(
            index_elements=[Printing.id],
            set_={
                "card_id": statement.excluded.card_id,
                "data": statement.excluded.data,
            },
        )
    )
    return len(prints)


def refresh() -> None:
    with engine.connect() as lock:
        if not lock.scalar(text("SELECT pg_try_advisory_lock(187634001)")):
            return
        try:
            with Session(engine) as db, db.begin():
                state = db.get(SyncState, 1) or SyncState(id=1)
                state.running, state.last_attempt, state.error = (
                    True,
                    datetime.now(UTC),
                    None,
                )
                db.add(state)
            bulk = scryfall.get_json("/bulk-data/default_cards")
            url = scryfall.trusted_url(bulk["download_uri"], {"data.scryfall.io"})
            with tempfile.TemporaryFile() as file:
                with scryfall.client() as http, http.stream("GET", url) as response:
                    response.raise_for_status()
                    for chunk in response.iter_bytes():
                        file.write(chunk)
                file.seek(0)
                with Session(engine) as db, db.begin():
                    count, batch = 0, []
                    for row in ijson.items(file, "item"):
                        batch.append(row)
                        if len(batch) == 500:
                            count += upsert_batch(db, batch)
                            batch = []
                    count += upsert_batch(db, batch)
                    if count == 0:
                        raise ValueError("Provider returned an empty catalogue")
                    completed = db.get(SyncState, 1)
                    assert completed
                    completed.last_success, completed.running, completed.error = (
                        datetime.now(UTC),
                        False,
                        None,
                    )
            log.info("Catalogue refresh completed: %s printings", count)
        except Exception as exc:
            log.exception("Catalogue refresh failed; previous snapshot retained")
            with Session(engine) as db, db.begin():
                state = db.get(SyncState, 1) or SyncState(id=1)
                state.running, state.error = False, str(exc)[:500]
                db.add(state)
        finally:
            lock.execute(text("SELECT pg_advisory_unlock(187634001)"))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    while True:
        refresh()
        time.sleep(settings().sync_interval_seconds)
