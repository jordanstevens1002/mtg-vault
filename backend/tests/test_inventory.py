from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from vault.db import COLLECTION_ID, UNSORTED_ID
from vault.inventory import Movement, movement
from vault.models import Balance, Deck


def receipt(printing: Any, quantity: int = 5) -> dict[str, Any]:
    return {
        "operation_id": str(uuid4()),
        "kind": "receipt",
        "printing_id": str(printing.id),
        "quantity": quantity,
        "destination": {"location_id": str(UNSORTED_ID)},
    }


def test_idempotent_receipts_and_transfer(
    client: TestClient, db: Session, plains: Any
) -> None:
    payload = receipt(plains[1])
    response = client.post("/api/v1/inventory/movements", json=payload)
    assert response.status_code == 200
    assert (
        client.post("/api/v1/inventory/movements", json=payload).json()
        == response.json()
    )
    assert client.get("/api/v1/summary").json() == {
        "owned": 5,
        "in_decks": 0,
        "available": 5,
    }
    assert (
        client.post(
            "/api/v1/inventory/movements", json={**payload, "quantity": 6}
        ).status_code
        == 409
    )
    deck = Deck(collection_id=COLLECTION_ID, name="Built", state="built")
    db.add(deck)
    db.commit()
    transfer = {
        "operation_id": str(uuid4()),
        "kind": "transfer",
        "source_id": response.json()["destination_balance_id"],
        "quantity": 3,
        "destination": {"deck_id": str(deck.id)},
    }
    assert client.post("/api/v1/inventory/movements", json=transfer).status_code == 200
    assert client.get("/api/v1/summary").json() == {
        "owned": 5,
        "in_decks": 3,
        "available": 2,
    }
    assert (
        client.post(
            "/api/v1/inventory/movements",
            json={**transfer, "operation_id": str(uuid4())},
        ).status_code
        == 409
    )
    assert client.get("/api/v1/summary").json()["owned"] == 5


def test_negative_and_wrong_destination_rejected(
    client: TestClient, db: Session, plains: Any
) -> None:
    assert (
        client.post(
            "/api/v1/inventory/movements", json=receipt(plains[1], -1)
        ).status_code
        == 422
    )
    planned = Deck(collection_id=COLLECTION_ID, name="Plan")
    db.add(planned)
    db.commit()
    payload = receipt(plains[1])
    payload["destination"] = {"deck_id": str(planned.id)}
    assert client.post("/api/v1/inventory/movements", json=payload).status_code == 409
    payload["destination"] = {
        "location_id": str(UNSORTED_ID),
        "deck_id": str(planned.id),
    }
    assert client.post("/api/v1/inventory/movements", json=payload).status_code == 422


def test_concurrent_removal_never_oversells(
    client: TestClient, db: Session, plains: Any
) -> None:
    source = client.post(
        "/api/v1/inventory/movements", json=receipt(plains[1], 1)
    ).json()["destination_balance_id"]

    def remove() -> int:
        from fastapi import HTTPException

        try:
            with Session(db.bind) as connection, connection.begin():
                movement(
                    Movement(
                        operation_id=uuid4(),
                        kind="remove",
                        source_id=source,
                        quantity=1,
                    ),
                    connection,
                )
            return 200
        except HTTPException as error:
            return error.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: remove(), range(2)))
    assert sorted(results) == [200, 409]
    db.expire_all()
    assert db.scalar(select(Balance.quantity)) == 0


def test_named_storage(client: TestClient) -> None:
    response = client.post("/api/v1/locations", json={"name": " Binder A "})
    assert response.status_code == 201
    assert response.json()["name"] == "Binder A"
    assert (
        client.post("/api/v1/locations", json={"name": "binder a"}).status_code == 409
    )
    assert len(client.get("/api/v1/locations").json()) == 2
