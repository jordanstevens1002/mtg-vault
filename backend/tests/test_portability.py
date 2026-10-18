from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from vault.db import COLLECTION_ID, UNSORTED_ID
from vault.models import Deck


def stock(
    client: TestClient, printing: Any, destination: dict[str, str] | None = None
) -> None:
    response = client.post(
        "/api/v1/inventory/movements",
        json={
            "operation_id": str(uuid4()),
            "kind": "receipt",
            "printing_id": str(printing.id),
            "quantity": 2,
            "destination": destination or {"location_id": str(UNSORTED_ID)},
        },
    )
    assert response.status_code == 200, response.text


def test_collection_preview_confirmation_and_retry(
    client: TestClient, plains: Any
) -> None:
    stock(client, plains[1])
    content = client.get("/api/v1/exports/collection").text
    body = {"kind": "collection", "content": content}
    preview = client.post("/api/v1/imports/preview", json=body).json()
    assert preview["quantity"] == 2 and not preview["errors"]
    assert preview["mode"] == "add physical copies"
    assert client.get("/api/v1/summary").json()["owned"] == 2
    confirm = {
        **body,
        "preview_hash": preview["preview_hash"],
        "operation_id": str(uuid4()),
    }
    assert client.post("/api/v1/imports/confirm", json=confirm).status_code == 200
    assert client.post("/api/v1/imports/confirm", json=confirm).status_code == 200
    assert client.get("/api/v1/summary").json()["owned"] == 4


def test_unresolved_rows_and_stale_preview_block_all_changes(
    client: TestClient, plains: Any
) -> None:
    stock(client, plains[1])
    content = client.get("/api/v1/exports/collection").text
    bad = (
        content
        + content.splitlines()[1].replace(str(plains[1].id), str(uuid4()))
        + "\n"
    )
    body = {"kind": "collection", "content": bad}
    preview = client.post("/api/v1/imports/preview", json=body).json()
    assert len(preview["errors"]) == 1
    assert (
        client.post(
            "/api/v1/imports/confirm",
            json={
                **body,
                "preview_hash": preview["preview_hash"],
                "operation_id": str(uuid4()),
            },
        ).status_code
        == 422
    )
    body = {"kind": "collection", "content": content}
    preview = client.post("/api/v1/imports/preview", json=body).json()
    stock(client, plains[1])
    assert (
        client.post(
            "/api/v1/imports/confirm",
            json={
                **body,
                "preview_hash": preview["preview_hash"],
                "operation_id": str(uuid4()),
            },
        ).status_code
        == 409
    )
    assert client.get("/api/v1/summary").json()["owned"] == 4


def test_decklist_import_is_planned_and_roundtrips(
    client: TestClient, plains: Any
) -> None:
    body = {
        "kind": "decklist",
        "content": f"[mainboard]\n2 Plains | {plains[1].id}\n3 Plains | {plains[1].id}\n",
        "deck_name": "My plan",
    }
    preview = client.post("/api/v1/imports/preview", json=body).json()
    assert not preview["errors"] and preview["quantity"] == 5
    response = client.post(
        "/api/v1/imports/confirm",
        json={
            **body,
            "preview_hash": preview["preview_hash"],
            "operation_id": str(uuid4()),
        },
    )
    assert response.status_code == 200, response.text
    deck_id = response.json()["deck_id"]
    assert client.get(f"/api/v1/decks/{deck_id}").json()["state"] == "planned"
    assert client.get("/api/v1/summary").json()["owned"] == 0
    assert (
        f"5 Plains | {plains[1].id}"
        in client.get(f"/api/v1/exports/decks/{deck_id}").text
    )


def test_csv_preserves_distinct_decks_with_same_name(
    client: TestClient, db: Session, plains: Any
) -> None:
    decks = [
        Deck(
            collection_id=COLLECTION_ID,
            name="Same name",
            state="built",
            format="casual",
        )
        for _ in range(2)
    ]
    db.add_all(decks)
    db.commit()
    for deck in decks:
        stock(client, plains[1], {"deck_id": str(deck.id)})
    content = client.get("/api/v1/exports/collection").text
    assert all(str(deck.id) in content for deck in decks)
    body = {"kind": "collection", "content": content}
    preview = client.post("/api/v1/imports/preview", json=body).json()
    assert not preview["errors"]
    response = client.post(
        "/api/v1/imports/confirm",
        json={
            **body,
            "preview_hash": preview["preview_hash"],
            "operation_id": str(uuid4()),
        },
    )
    assert response.status_code == 200
    assert [client.get(f"/api/v1/decks/{d.id}").json()["quantity"] for d in decks] == [
        4,
        4,
    ]


def test_bad_csv_is_a_validation_error(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/imports/preview",
            json={"kind": "collection", "content": "not,a,valid,header"},
        ).status_code
        == 422
    )
    from vault.portability import FIELDS

    malformed = ",".join(FIELDS) + '\n"unterminated'
    assert (
        client.post(
            "/api/v1/imports/preview", json={"kind": "collection", "content": malformed}
        ).status_code
        == 422
    )
