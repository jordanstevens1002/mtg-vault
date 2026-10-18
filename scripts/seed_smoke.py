"""Explicit test-only fixture loader. Pipe into a freshly created API container."""

import json
import os
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from vault.db import engine
from vault.models import Balance
from vault.sync import upsert_batch

if os.environ.get("VAULT_ALLOW_FIXTURES") != "1":
    raise SystemExit("Set VAULT_ALLOW_FIXTURES=1 only for an isolated smoke deployment")

with Session(engine) as db, db.begin():
    if db.scalar(select(func.count()).select_from(Balance)):
        raise SystemExit("Refusing to seed a deployment containing physical inventory")
    rows = json.loads(Path("tests/fixtures/catalogue.json").read_text())
    upsert_batch(db, rows)
    print(f"Loaded {len(rows)} test printings; no physical stock added")
