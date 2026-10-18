from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from vault.catalogue import router as catalogue_router
from vault.db import engine

app = FastAPI(title="MTG Vault", version="0.1.0")
app.include_router(catalogue_router)


@app.get("/api/v1/health")
def health() -> JSONResponse:
    try:
        with engine.connect() as db:
            db.execute(text("SELECT 1 FROM collections LIMIT 1"))
        return JSONResponse({"status": "ok"})
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503)
