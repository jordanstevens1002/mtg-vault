from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://vault:vault@localhost:5432/vault"
    image_cache_dir: Path = Path("/tmp/mtg-vault-images")
    scryfall_user_agent: str = (
        "MTGVault/0.1 (+https://github.com/jordanstevens1002/mtg-vault)"
    )
    sync_interval_seconds: int = 86400
    max_import_rows: int = 10000


@lru_cache
def settings() -> Settings:
    return Settings()
