# MTG Vault

Self-hosted Magic: The Gathering collection management, focused on cards in built decks and bulk storage.

React + TypeScript, FastAPI + PostgreSQL, deployed with Docker Compose. One collection per deployment; no application login. Run only on a trusted LAN or VPN behind device-trusted HTTPS.

## Run with Docker Compose

```bash
git clone https://github.com/jordanstevens1002/mtg-vault.git
cd mtg-vault
git checkout develop  # Until the first stable release is published
cp .env.example .env
# Set a unique URL-safe POSTGRES_PASSWORD in .env
docker compose up --build -d
```

Open `http://localhost:8080` on the host. For phone scanning, configure your existing reverse proxy to provide **device-trusted HTTPS** to this gateway. A plain HTTP LAN address cannot access phone cameras. The gateway binds to loopback by default; change `APP_BIND` only for your trusted proxy/network. Do not expose this unauthenticated application to the public internet.

The first catalogue download runs in the background and may take several minutes. Existing inventory remains usable during refreshes and internet outages; previously viewed card images are cached. The footer reports the last successful catalogue refresh. Camera frames and OCR processing stay in the browser.

- [Operator guide](docs/operations.md): proxy, synchronisation, backups, restore and upgrades
- [Native formats](docs/formats.md): previewed collection CSV and planned decklists
- [Library controls](docs/library-filters.md) and [local OCR engines](docs/scanning.md)
- [Acceptance record](docs/acceptance.md): automated evidence and remaining hardware gates

## Development and verification

`develop` integrates features; `main` contains stable releases. Start with an issue and read [CONTRIBUTING.md](CONTRIBUTING.md).

Use Python 3.13 and Node 24:

```bash
python3.13 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.lock
pip install -e 'backend[dev]'
cd frontend
npm ci
npm run dev
```

Run `uvicorn vault.main:app --reload` separately with a `DATABASE_URL` pointing to a migrated PostgreSQL database. Vite proxies `/api` to port 8000. Run `alembic -c backend/alembic.ini upgrade head` from the repository root first.

```bash
ruff check backend
ruff format --check backend
mypy --config-file backend/pyproject.toml backend/vault
TEST_DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/vault_test pytest backend/tests
cd frontend
npm run check
npm test
npm run build
```

Integration tests require an isolated database whose name contains `test`; they clear its application data. Browser smoke tests use a fresh isolated Compose deployment: explicitly load the fixture with `docker compose exec -e VAULT_ALLOW_FIXTURES=1 -T api python - < scripts/seed_smoke.py`, then run `npm run test:e2e` in `frontend`. Never seed a real collection. CI also verifies backup/restore and generated API types.

To regenerate client types after API changes, run `python scripts/export_openapi.py > /tmp/mtg-openapi.json` from the root, then `npx openapi-typescript /tmp/mtg-openapi.json -o src/generated/api.ts` from `frontend`.

## Licence and attribution

Application code is GPL-3.0-only. Card names, text and artwork belong to their respective owners and are not relicensed by this project. Card metadata and images are obtained from [Scryfall](https://scryfall.com). MTG Vault is unofficial and is not endorsed by Wizards of the Coast or Scryfall.
