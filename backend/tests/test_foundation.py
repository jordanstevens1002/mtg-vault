from fastapi.testclient import TestClient

from vault.main import app


def test_api_contract() -> None:
    schema = TestClient(app).get("/openapi.json").json()
    assert "/api/v1/health" in schema["paths"]
