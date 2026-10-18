from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from vault.db import UNSORTED_ID


def plan(client: TestClient, card: Any, quantity: int) -> str:
    deck = client.post("/api/v1/decks", json={"name": "Plan"}).json()["id"]
    assert (
        client.put(
            f"/api/v1/decks/{deck}/entries",
            json={"entries": [{"card_id": str(card.id), "quantity": quantity}]},
        ).status_code
        == 200
    )
    return str(deck)


def test_plans_do_not_reserve_and_build_is_atomic(
    client: TestClient, plains: Any
) -> None:
    card, printing, _ = plains
    source = client.post(
        "/api/v1/inventory/movements",
        json={
            "operation_id": str(uuid4()),
            "kind": "receipt",
            "printing_id": str(printing.id),
            "quantity": 3,
            "destination": {"location_id": str(UNSORTED_ID)},
        },
    ).json()["destination_balance_id"]
    first, second = plan(client, card, 3), plan(client, card, 3)
    assert client.get(f"/api/v1/decks/{first}").json()["shortages"][str(card.id)] == 0
    assert client.get(f"/api/v1/decks/{second}").json()["shortages"][str(card.id)] == 0
    bad = {
        "operation_id": str(uuid4()),
        "selections": [{"source_id": source, "quantity": 2}],
    }
    assert client.post(f"/api/v1/decks/{first}/build", json=bad).status_code == 409
    assert client.get("/api/v1/summary").json()["available"] == 3
    body = {
        "operation_id": str(uuid4()),
        "selections": [{"source_id": source, "quantity": 3}],
    }
    assert client.post(f"/api/v1/decks/{first}/build", json=body).status_code == 200
    assert client.post(f"/api/v1/decks/{first}/build", json=body).status_code == 200
    assert client.get(f"/api/v1/decks/{second}").json()["shortages"][str(card.id)] == 3
    assert (
        client.post(
            f"/api/v1/decks/{second}/build", json={**body, "operation_id": str(uuid4())}
        ).status_code
        == 409
    )
    assert client.get(f"/api/v1/decks/{second}").json()["state"] == "planned"
    assert client.get("/api/v1/summary").json() == {
        "owned": 3,
        "in_decks": 3,
        "available": 0,
    }
    assert (
        client.post(
            f"/api/v1/decks/{first}/disassemble",
            json={"operation_id": str(uuid4()), "location_id": str(UNSORTED_ID)},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/summary").json()["available"] == 3
    assert client.get(f"/api/v1/decks/{first}").json()["entries"][0]["quantity"] == 3
