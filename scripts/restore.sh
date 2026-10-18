#!/usr/bin/env bash
set -euo pipefail
if [ "${VAULT_RESTORE_CONFIRM:-}" != "replace" ] || [ "$#" -ne 1 ]; then
  printf 'Restoring replaces the current database. Usage: VAULT_RESTORE_CONFIRM=replace bash scripts/restore.sh backup.dump\n' >&2
  exit 1
fi
test -r "$1"
docker compose stop api sync web
docker compose exec -T db sh -c 'exec pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1"
printf 'Database restored. Run migrations and verify before restarting the application.\n'
