import threading
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from vault.config import settings

_gate = threading.Lock()
_last_request = 0.0
HOSTS = {"api.scryfall.com", "data.scryfall.io", "cards.scryfall.io"}


def trusted_url(url: str, hosts: set[str] = HOSTS) -> str:
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in hosts
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise ValueError("Untrusted provider URL")
    return url


def client() -> httpx.Client:
    return httpx.Client(
        headers={
            "User-Agent": settings().scryfall_user_agent,
            "Accept": "application/json",
        },
        timeout=60,
        follow_redirects=False,
    )


def get_json(path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    global _last_request
    with _gate:
        time.sleep(max(0, 0.3 - (time.monotonic() - _last_request)))
        _last_request = time.monotonic()
        with client() as http:
            response = http.get(
                trusted_url("https://api.scryfall.com" + path), params=params
            )
            # Do not power through rate limits. The caller reports the failure.
            response.raise_for_status()
            return dict(response.json())
