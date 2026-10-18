from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from vault.config import settings
from vault.db import COLLECTION_ID


def test_cached_images_and_library_survive_provider_outage(
    client: TestClient, plains: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from vault import scryfall

    monkeypatch.setattr(settings(), "image_cache_dir", tmp_path)
    first, second = plains[1:]
    cached = tmp_path / f"{first.id}-0.jpg"
    cached.write_bytes(b"previously-cached-provider-image")

    def offline() -> None:
        raise httpx.ConnectError("Provider offline")

    monkeypatch.setattr(scryfall, "client", offline)
    response = client.get(f"/api/v1/images/{first.id}/0")
    assert response.status_code == 200
    assert response.content == b"previously-cached-provider-image"
    assert client.get(f"/api/v1/images/{second.id}/0").status_code == 503
    assert list(tmp_path.iterdir()) == [cached]
    assert client.get("/api/v1/cards?scope=catalogue&q=Plains").json()["total"] == 1


def test_upgrade_preserves_existing_decks(db: Session) -> None:
    config = Config("backend/alembic.ini")
    db.rollback()
    command.downgrade(config, "0001")
    assert db.bind
    with db.bind.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO decks (id, collection_id, name, state, format) VALUES ('00000000-0000-4000-8000-000000000099', :collection, 'Existing plan', 'planned', 'commander')"
            ),
            {"collection": COLLECTION_ID},
        )
    command.upgrade(config, "head")
    with db.bind.connect() as connection:
        row = connection.execute(
            text(
                "SELECT name, state, commander_colors FROM decks WHERE id='00000000-0000-4000-8000-000000000099'"
            )
        ).one()
        assert tuple(row) == ("Existing plan", "planned", {})


def test_upgrade_backfills_translated_and_face_names(db: Session) -> None:
    import json

    config = Config("backend/alembic.ini")
    db.rollback()
    command.downgrade(config, "0002")
    assert db.bind
    card_id, printing_id = uuid4(), uuid4()
    data = {
        "name": "Front // Back",
        "printed_name": "Vorne // Hinten",
        "card_faces": [
            {"name": "Front", "printed_name": "Vorne"},
            {"name": "Back", "printed_name": "Hinten"},
        ],
        "oracle_text": "Not a searchable name",
    }
    with db.bind.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO cards (id, name, data) VALUES (:id, 'Front // Back', CAST(:data AS jsonb))"
            ),
            {"id": card_id, "data": json.dumps(data)},
        )
        connection.execute(
            text(
                "INSERT INTO printings (id, card_id, data) VALUES (:id, :card, CAST(:data AS jsonb))"
            ),
            {"id": printing_id, "card": card_id, "data": json.dumps(data)},
        )
    command.upgrade(config, "head")
    with db.bind.connect() as connection:
        names = connection.scalar(
            text("SELECT search_names FROM printings WHERE id=:id"), {"id": printing_id}
        )
        assert names == "Front // Back\nVorne // Hinten\nFront\nVorne\nBack\nHinten"
        assert "Not a searchable name" not in names
        assert (
            connection.scalar(
                text(
                    "SELECT count(*) FROM pg_indexes WHERE indexname IN ('ix_cards_name_trgm', 'ix_printings_search_names_trgm')"
                )
            )
            == 2
        )
