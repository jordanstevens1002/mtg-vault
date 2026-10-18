from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from vault.sync import upsert_batch


def test_catalogue_type_options_and_same_face_filters(
    client: TestClient, db: Session, plains: Any
) -> None:
    rows = [
        ("Mage", "Legendary Creature — Human Wizard"),
        ("Spell", "Instant — Arcane"),
        ("Doctor", "Creature — Time Lord Doctor"),
        ("Place", "Plane — New Phyrexia"),
        ("Front // Back", "Creature — Human // Land — Forest"),
        ("Joke frame", "Scariest Creature You'll Ever See — Hydra"),
        ("Lowercase", "instant — Arcane"),
    ]
    upsert_batch(
        db,
        [
            {
                "id": str(uuid4()),
                "oracle_id": str(uuid4()),
                "name": name,
                "type_line": line,
            }
            for name, line in rows
        ],
    )
    db.commit()
    options = client.get("/api/v1/card-filters").json()
    assert options["types"] == ["Creature", "Instant", "Land", "Plane"]
    assert options["subtypes"]["Creature"] == [
        "Doctor",
        "Human",
        "Hydra",
        "Time Lord",
        "Wizard",
    ]
    assert options["subtypes"]["Land"] == ["Forest", "Plains"]
    assert options["subtypes"]["Plane"] == ["New Phyrexia"]
    base = "/api/v1/cards?scope=catalogue"
    assert client.get(base + "&card_type=Land&subtype=Forest").json()["total"] == 1
    assert client.get(base + "&card_type=Creature&subtype=Forest").json()["total"] == 0
    assert client.get(base + "&card_type=Creature&subtype=Human").json()["total"] == 2
    assert client.get(base + "&subtype=Hum").json()["total"] == 0


def test_mana_builder_matches_pip_counts_independently_of_click_order(
    client: TestClient, db: Session
) -> None:
    upsert_batch(
        db,
        [
            {"id": str(uuid4()), "name": "Two colours", "mana_cost": "{2}{G}{W}"},
            {"id": str(uuid4()), "name": "Two white", "mana_cost": "{2}{W}{W}"},
            {
                "id": str(uuid4()),
                "name": "Face // Back",
                "card_faces": [{"mana_cost": "{G}{W}"}, {"mana_cost": ""}],
            },
            {"id": str(uuid4()), "name": "Zero", "mana_cost": "{0}"},
            {"id": str(uuid4()), "name": "No cost", "mana_cost": ""},
        ],
    )
    db.commit()
    base = "/api/v1/cards"

    def names(cost: str) -> list[str]:
        response = client.get(base, params={"scope": "catalogue", "mana_cost": cost})
        assert response.status_code == 200, response.text
        return [card["name"] for card in response.json()["items"]]

    assert names("{W}{2}{G}") == ["Two colours"]
    assert names("{2}{W}{W}") == ["Two white"]
    assert names("{W}{G}") == ["Face // Back"]
    assert names("{0}") == ["Zero"]
    assert client.get(base, params={"mana_cost": "2WW"}).status_code == 422
