import gzip
import json
from typing import Any
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from vault import sync
from vault.models import Card, SyncState


@pytest.mark.parametrize("jsonl", [False, True])
def test_supported_bulk_formats(
    db: Session, monkeypatch: pytest.MonkeyPatch, jsonl: bool
) -> None:
    row = {"id": str(uuid4()), "oracle_id": str(uuid4()), "name": "Fixture card"}
    payload = (
        gzip.compress((json.dumps(row) + "\n").encode())
        if jsonl
        else json.dumps([row]).encode()
    )
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, content=payload)
    )
    monkeypatch.setattr(sync, "engine", db.bind)
    monkeypatch.setattr(
        sync.scryfall,
        "get_json",
        lambda path: {
            "jsonl_download_uri"
            if jsonl
            else "download_uri": "https://data.scryfall.io/test"
        },
    )
    monkeypatch.setattr(
        sync.scryfall, "client", lambda: httpx.Client(transport=transport)
    )
    sync.refresh()
    db.expire_all()
    assert db.get(Card, row["oracle_id"])
    state = db.get(SyncState, 1)
    assert state and state.last_success and not state.error


def test_failure_after_first_batch_rolls_back_whole_snapshot(
    db: Session, plains: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    rows = [
        {"id": str(uuid4()), "oracle_id": str(uuid4()), "name": "New card"}
        for _ in range(501)
    ]
    rows[-1]["id"] = "invalid-uuid"
    payload = gzip.compress(
        ("\n".join(json.dumps(row) for row in rows) + "\n").encode()
    )
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, content=payload)
    )
    monkeypatch.setattr(sync, "engine", db.bind)
    monkeypatch.setattr(
        sync.scryfall,
        "get_json",
        lambda path: {"jsonl_download_uri": "https://data.scryfall.io/test"},
    )
    monkeypatch.setattr(
        sync.scryfall, "client", lambda: httpx.Client(transport=transport)
    )
    sync.refresh()
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Card)) == 1
    assert db.get(Card, plains[0].id)
    state = db.get(SyncState, 1)
    assert state and state.error and not state.running
