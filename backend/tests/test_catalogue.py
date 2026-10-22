from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from vault.db import COLLECTION_ID, UNSORTED_ID
from vault.models import Balance, Card, Deck, Printing
from vault.scryfall import trusted_url


def test_grouped_plains_counts(client: TestClient, db: Session, plains: Any) -> None:
    card, first, second = plains
    deck = Deck(collection_id=COLLECTION_ID, name="White deck", state="built")
    db.add(deck)
    db.flush()
    db.add_all(
        [
            Balance(
                collection_id=COLLECTION_ID,
                printing_id=first.id,
                finish="nonfoil",
                quantity=7,
                placement=f"location:{UNSORTED_ID}",
                location_id=UNSORTED_ID,
            ),
            Balance(
                collection_id=COLLECTION_ID,
                printing_id=second.id,
                finish="foil",
                quantity=3,
                placement=f"deck:{deck.id}:mainboard",
                deck_id=deck.id,
            ),
        ]
    )
    db.commit()
    response = client.get("/api/v1/cards", params={"q": "Plains"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert (
        body["items"][0]["owned"],
        body["items"][0]["in_decks"],
        body["items"][0]["available"],
    ) == (10, 3, 7)
    detail = client.get(f"/api/v1/cards/{card.id}").json()
    assert len(detail["printings"]) == 2
    assert len(detail["balances"]) == 2
    assert (
        client.put(
            f"/api/v1/cards/{card.id}/cover", json={"printing_id": str(second.id)}
        ).status_code
        == 200
    )
    assert client.get("/api/v1/cards?q=Plains").json()["items"][0]["cover_id"] == str(
        second.id
    )


def test_colour_mana_and_face_filters(
    client: TestClient, db: Session, plains: Any
) -> None:
    from vault.sync import upsert_batch

    upsert_batch(
        db,
        [
            {
                "id": str(uuid4()),
                "oracle_id": str(uuid4()),
                "name": "Front // Back",
                "printed_name": "Vorne // Hinten",
                "cmc": 2,
                "color_identity": ["W", "U"],
                "type_line": "Legendary Creature — Human",
                "card_faces": [
                    {"name": "Front", "mana_cost": "{W}{U}"},
                    {"name": "Back", "mana_cost": ""},
                ],
            }
        ],
    )
    db.commit()
    base = "/api/v1/cards?scope=catalogue"
    assert client.get(base + "&colors=W&color_mode=within").json()["total"] == 1
    assert client.get(base + "&colors=W&color_mode=contains").json()["total"] == 1
    assert client.get(base + "&colors=W&color_mode=exact").json()["total"] == 0
    assert client.get(base + "&colors=WU&color_mode=exact").json()["total"] == 1
    response = client.get(
        base,
        params={
            "scope": "catalogue",
            "mana_cost": "{W}{U}",
            "mana_min": 2,
            "mana_max": 2,
            "card_type": "Creature",
            "subtype": "Human",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert client.get(base + "&q=Hinten").json()["total"] == 1
    assert client.get(base + "&offset=1&limit=1").json()["total"] == 2


@pytest.mark.parametrize(
    "url",
    [
        "http://cards.scryfall.io/a",
        "https://cards.scryfall.io.evil.test/a",
        "https://user@cards.scryfall.io/a",
        "https://127.0.0.1/a",
        "https://cards.scryfall.io:444/a",
    ],
)
def test_provider_url_restrictions(url: str) -> None:
    with pytest.raises(ValueError):
        trusted_url(url)


def test_failed_refresh_retains_snapshot(
    db: Session, plains: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from vault import sync
    from vault.models import SyncState

    monkeypatch.setattr(sync, "engine", db.bind)

    def fail(*args: Any) -> None:
        raise RuntimeError("Provider offline")

    monkeypatch.setattr(sync.scryfall, "get_json", fail)
    sync.refresh()
    db.expire_all()
    assert db.get(Card, plains[0].id)
    state = db.get(SyncState, 1)
    assert state and state.error == "Provider offline" and not state.running


def test_bulk_batch_deduplicates_oracle_identity(db: Session) -> None:
    from vault.sync import upsert_batch

    oracle = str(uuid4())
    assert (
        upsert_batch(
            db,
            [
                {"id": str(uuid4()), "oracle_id": oracle, "name": "Plains"},
                {"id": str(uuid4()), "oracle_id": oracle, "name": "Plains"},
            ],
        )
        == 2
    )
    db.commit()
    assert len(db.query(Card).all()) == 1
    assert len(db.query(Printing).all()) == 2


def test_name_search_excludes_rules_text_and_includes_translated_faces(
    client: TestClient, db: Session, plains: Any
) -> None:
    from vault.sync import upsert_batch

    upsert_batch(
        db,
        [
            {
                "id": str(uuid4()),
                "oracle_id": str(uuid4()),
                "name": "Other card",
                "oracle_text": "Search for a Plains card.",
                "card_faces": [{"printed_name": "Vorne"}, {"printed_name": "Hinten"}],
            }
        ],
    )
    db.commit()
    assert client.get("/api/v1/cards?scope=catalogue&q=Plains").json()["total"] == 1
    assert client.get("/api/v1/cards?scope=catalogue&q=Hinten").json()["total"] == 1
