#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_path=${1:-"backups/mtg-vault-$(date -u +%Y%m%dT%H%M%SZ).dump"}
mkdir -p "$(dirname "$backup_path")"
trap 'rm -f "$backup_path.tmp"' EXIT
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup_path.tmp"
mv "$backup_path.tmp" "$backup_path"
printf 'Backup written to %s\n' "$backup_path"
