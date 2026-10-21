#!/usr/bin/env bash
# Restores a backup taken by backup.sh. Replaces the database, the Data Protection keys and the
# media with the archive's content. The current state is kept first as
# BACKUP_DIR/pre-restore/, so a wrong restore can itself be undone.
#
#   restore.sh [--yes] /srv/openresto-backups/daily/openresto-20261020-030001.tar.gz
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

assume_yes=0
if [ "${1:-}" = "--yes" ]; then assume_yes=1; shift; fi
archive="${1:-}"
[ -f "$archive" ] || die "usage: restore.sh [--yes] <archive.tar.gz>"
archive="$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")"

BACKUP_DIR="$(env_get BACKUP_DIR /srv/openresto-backups)"

if [ -f "$archive.sha256" ]; then
  ( cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256" ) || die "checksum mismatch: the archive is damaged"
else
  log "WARN: no .sha256 beside the archive; skipping the checksum"
fi

work="$(mktemp -d "$BACKUP_DIR/.restore.XXXXXX")"
trap 'rm -rf "$work"' EXIT
tar -xzf "$archive" -C "$work"
[ -f "$work/openresto.db" ] || die "the archive has no openresto.db"
[ -d "$work/media" ] || mkdir -p "$work/media"
[ -d "$work/dp-keys" ] || mkdir -p "$work/dp-keys"
chmod -R a+rX "$work"

log "archive manifest:"; sed 's/^/    /' "$work/MANIFEST" 2>/dev/null || true

# Checked before anything is touched, with the backend image's own sqlite3. The mount is
# writable on purpose: a snapshot of a WAL-mode database opens as WAL, and SQLite cannot open
# one on a read-only mount (it needs to create the -shm file). Only the three named items are
# copied afterwards, so the scratch files this leaves in $work are never restored.
check="$(compose run --rm --no-deps -T -v "$work:/restore" --entrypoint sqlite3 backend \
  /restore/openresto.db "PRAGMA integrity_check;" | tr -d '\r')"
[ "$check" = "ok" ] || die "the archive's database fails integrity_check: $check"

if [ "$assume_yes" -ne 1 ]; then
  printf 'This replaces the live database and media with %s.\nType "restore" to continue: ' "$(basename "$archive")"
  read -r answer
  [ "$answer" = "restore" ] || die "aborted"
fi

log "stopping the backend"
compose stop backend

mkdir -p "$BACKUP_DIR/pre-restore"
before="$BACKUP_DIR/pre-restore/openresto-pre-restore-$(date -u +%Y%m%d-%H%M%S).tar.gz"
compose run --rm --no-deps -T -v "$BACKUP_DIR/pre-restore:/out" --entrypoint tar backend \
  -czf "/out/$(basename "$before")" -C / data app/wwwroot/media
log "previous state kept in $before"

log "restoring"
compose run --rm --no-deps -T -v "$work:/restore:ro" --entrypoint sh backend -c '
  set -e
  find /data -mindepth 1 -delete
  find /app/wwwroot/media -mindepth 1 -delete
  cp -a /restore/openresto.db /data/openresto.db
  cp -a /restore/dp-keys /data/dp-keys
  cp -a /restore/media/. /app/wwwroot/media/
  chown -R app:app /data /app/wwwroot/media
'

log "starting the backend"
compose up -d --no-deps backend
wait_backend_healthy 60 || die "the backend did not become healthy after the restore; see: docker compose logs backend"
check="$(compose exec -T backend sqlite3 /data/openresto.db "PRAGMA integrity_check;" | tr -d '\r')"
[ "$check" = "ok" ] || die "integrity_check after the restore said: $check"
log "restore complete; integrity_check ok"

# Keep the three newest safety copies; they hold personal data and are not rotated elsewhere.
find "$BACKUP_DIR/pre-restore" -maxdepth 1 -name "openresto-pre-restore-*.tar.gz" | sort -r | tail -n +4 | xargs -r rm -f
