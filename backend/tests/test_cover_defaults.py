from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from vault.db import COLLECTION_ID, UNSORTED_ID
from vault.models import Balance, Cover, Deck


def test_first_receipt_cover_survives_more_stock_removal_and_explicit_override(
    client: TestClient, db: Session, plains: Any
) -> None:
    card, a, b = plains
    # Choose the larger UUID first so the old UUID-sorted fallback would fail.
    first, second = sorted([a, b], key=lambda printing: str(printing.id), reverse=True)

    def receive(printing: Any, destination: dict[str, str]) -> dict[str, Any]:
        response = client.post(
            "/api/v1/inventory/movements",
            json={
                "operation_id": str(uuid4()),
                "kind": "receipt",
                "quantity": 1,
                "printing_id": str(printing.id),
                "destination": destination,
            },
        )
        assert response.status_code == 200, response.text
        return response.json()

    def cover() -> str:
        return client.get("/api/v1/cards?q=Plains").json()["items"][0]["cover_id"]

    deck = Deck(collection_id=COLLECTION_ID, name="First scan deck", state="built")
    db.add(deck)
    db.commit()
    received = receive(first, {"deck_id": str(deck.id)})
    assert cover() == str(first.id)
    receive(second, {"location_id": str(UNSORTED_ID)})
    assert cover() == str(first.id)
    assert (
        client.post(
            "/api/v1/inventory/movements",
            json={
                "operation_id": str(uuid4()),
                "kind": "remove",
                "quantity": 1,
                "source_id": received["destination_balance_id"],
            },
        ).status_code
        == 200
    )
    assert cover() == str(first.id)
    assert (
        client.put(
            f"/api/v1/cards/{card.id}/cover", json={"printing_id": str(second.id)}
        ).status_code
        == 200
    )
    receive(first, {"location_id": str(UNSORTED_ID)})
    assert cover() == str(second.id)


def test_legacy_inventory_prefers_an_owned_printing_without_claiming_scan_order(
    client: TestClient, db: Session, plains: Any
) -> None:
    card, a, b = plains
    owned = max([a, b], key=lambda printing: str(printing.id))
    db.add(
        Balance(
            collection_id=COLLECTION_ID,
            printing_id=owned.id,
            finish="nonfoil",
            quantity=2,
            placement=f"location:{UNSORTED_ID}",
            location_id=UNSORTED_ID,
        )
    )
    db.commit()
    assert db.get(Cover, (COLLECTION_ID, card.id)) is None
    assert client.get("/api/v1/cards?q=Plains").json()["items"][0]["cover_id"] == str(
        owned.id
    )


def test_native_import_first_row_becomes_cover(client: TestClient, plains: Any) -> None:
    card, first, second = plains
    content = "version,printing_id,finish,quantity,location,deck,deck_id,deck_format,section\n"
    for printing in (first, second):
        content += f"1,{printing.id},nonfoil,1,Unsorted,,,casual,mainboard\n"
    body = {"kind": "collection", "content": content}
    preview = client.post("/api/v1/imports/preview", json=body).json()
    assert not preview["errors"]
    confirmed = client.post(
        "/api/v1/imports/confirm",
        json={
            **body,
            "preview_hash": preview["preview_hash"],
            "operation_id": str(uuid4()),
        },
    )
    assert confirmed.status_code == 200, confirmed.text
    assert client.get(f"/api/v1/cards?scope=owned&q={card.name}").json()["items"][0][
        "cover_id"
    ] == str(first.id)
