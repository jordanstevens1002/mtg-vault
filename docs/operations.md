# Operating MTG Vault

## Deployment and HTTPS

Use `docker compose up --build -d` after copying `.env.example` to `.env` and choosing a unique URL-safe database password. The migration service runs before the API and synchronisation process. Only the frontend gateway is published; PostgreSQL and the API remain on the Compose network.

Point an existing HTTPS reverse proxy at `http://127.0.0.1:8080`. If your proxy runs elsewhere, bind the gateway to the required trusted interface using `APP_BIND` and restrict network access. Keep the deployment on a private LAN or VPN. A public source repository does not make the collection safe for unauthenticated public access.

For nginx, the essential upstream block is:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    client_max_body_size 8m;
}
```

Configure your existing certificate and HTTPS listener separately. Each device must trust that certificate. Ordinary HTTP on a private IP cannot request browser cameras; localhost is the development exception. Allow camera access only when scanning. If permission is denied, use the browser's site settings or the manual search fallback.

## Catalogue and cached images

The `sync` service refreshes Scryfall's default-card dataset daily. It supports current compressed JSONL and legacy JSON arrays, stages the download, and commits all upserts together. Failed refreshes retain the previous snapshot. A PostgreSQL advisory lock prevents simultaneous refreshes. Provider rate-limit errors are reported rather than retried aggressively.

Inspect `docker compose logs --tail 100 sync` and `GET /api/v1/catalogue-sync`. To request one refresh explicitly:

```bash
docker compose run --rm sync python -c 'from vault.sync import refresh; refresh()'
```

The initial download is substantial; allow disk space for the compressed download, database and image cache. No GPU is required. Additional language printings can be fetched from the card detail page. Images are cached on first viewing; an offline uncached image shows a placeholder. Cached metadata and inventory remain local. Browser OCR assets are bundled and served locally, without a CDN.

## Backup and restore

```bash
bash scripts/backup.sh backups/vault.dump
```

This writes a PostgreSQL custom-format dump with restrictive local permissions. It includes owned stock, decks, plans, locations, cover preferences, migration state, catalogue metadata and idempotency records. Store copies away from the host and schedule the command using your own backup system. Protect `.env` separately. Images are reproducible and excluded; back up the Compose `images` volume separately if retaining the offline cache matters.

Restore replaces the current database and stops app services:

```bash
VAULT_RESTORE_CONFIRM=replace bash scripts/restore.sh backups/vault.dump
docker compose run --rm migrate
docker compose up -d
```

Use a matching application version initially, verify card/deck quantities, then upgrade. The restore script intentionally leaves services stopped after restoring so failures cannot expose a half-restored collection. A collection CSV is additive and is not a substitute for restoring a complete backup.

## Upgrades and migration recovery

1. Back up and record the running commit/tag and configuration.
2. Review release notes, stop app services, and check out the intended release.
3. Run `docker compose build` followed by `docker compose run --rm migrate`.
4. Start with `docker compose up -d`; check health, catalogue status and representative quantities.

If a migration fails, leave app services stopped and inspect its error. Do not edit an already published migration. Restore the pre-upgrade dump with its matching application version when rollback requires data recovery. `docker compose down` retains volumes; `down --volumes` deletes the collection and must not be used for routine upgrades.

Commander construction warnings include colour-choice controls for commanders such as The Prismatic Piper. These deck preferences are stored by additive migration 0002 and included in database backups; they do not change physical stock.

Migration 0003 backfills searchable names and adds PostgreSQL trigram indexes. Allow extra migration time for an existing catalogue. The Compose database owner can install the bundled `pg_trgm` extension; with an externally managed database, have its administrator provision that extension before migrating. Downgrading removes the indexes and derived names while retaining the extension and physical inventory.

The collection UUID scopes all private data. Future account support can introduce identities and memberships without changing printing identities or existing physical balances. V1 has no administration, credentials or access control within the app.
