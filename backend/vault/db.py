from collections.abc import Iterator
from uuid import UUID

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from vault.config import settings

COLLECTION_ID = UUID("00000000-0000-4000-8000-000000000001")
UNSORTED_ID = UUID("00000000-0000-4000-8000-000000000002")
engine = create_engine(settings().database_url, pool_pre_ping=True)


def session() -> Iterator[Session]:
    with Session(engine) as db:
        with db.begin():
            yield db
