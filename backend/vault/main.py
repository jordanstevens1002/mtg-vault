from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from vault.catalogue import router as catalogue_router
from vault.db import engine
from vault.decks import router as decks_router
from vault.inventory import router as inventory_router

app = FastAPI(title="MTG Vault", version="0.1.0")
app.include_router(catalogue_router)
app.include_router(inventory_router)
app.include_router(decks_router)


@app.get("/api/v1/health")
def health() -> JSONResponse:
    try:
        with engine.connect() as db:
            db.execute(text("SELECT 1 FROM collections LIMIT 1"))
        return JSONResponse({"status": "ok"})
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503)
