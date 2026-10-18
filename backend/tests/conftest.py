import os
from collections.abc import Iterator
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from vault.db import COLLECTION_ID
from vault.models import Card, Printing


@pytest.fixture
def db() -> Iterator[Session]:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to an isolated PostgreSQL database")
    if "test" not in url.rsplit("/", 1)[-1]:
        raise RuntimeError("Tests require a database name containing 'test'")
    os.environ["DATABASE_URL"] = url
    from vault.config import settings

    settings.cache_clear()
    command.upgrade(Config("backend/alembic.ini"), "head")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE balances, deck_entries, operations, covers, decks, printings, cards, sync_state CASCADE"
            )
        )
        connection.execute(
            text(
                "DELETE FROM locations WHERE id <> '00000000-0000-4000-8000-000000000002'"
            )
        )
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    from vault.db import session
    from vault.main import app

    def override() -> Iterator[Session]:
        with Session(db.bind) as connection, connection.begin():
            yield connection

    app.dependency_overrides[session] = override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def plains(db: Session) -> tuple[Card, Printing, Printing]:
    card = Card(
        id=uuid4(),
        name="Plains",
        type_line="Basic Land — Plains",
        data={
            "name": "Plains",
            "cmc": 0,
            "color_identity": [],
            "type_line": "Basic Land — Plains",
            "legalities": {"commander": "legal"},
            "oracle_text": "({T}: Add {W}.)",
        },
    )
    db.add(card)
    db.flush()
    prints = [
        Printing(
            id=uuid4(),
            card_id=card.id,
            data={
                "name": "Plains",
                "lang": "en",
                "set": s,
                "collector_number": "1",
                "finishes": ["nonfoil", "foil"],
                "image_uris": {
                    "normal": "https://cards.scryfall.io/normal/front/test.jpg"
                },
            },
        )
        for s in ("lea", "m21")
    ]
    db.add_all(prints)
    db.commit()
    assert COLLECTION_ID
    return card, prints[0], prints[1]
