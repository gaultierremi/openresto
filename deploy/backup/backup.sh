#!/usr/bin/env bash
# Consistent backup of an OpenResto instance: the SQLite database (through SQLite's own online
# backup, never a raw copy of a file that is being written), the Data Protection keys and the
# uploaded media, in one archive. Run daily by systemd (deploy/systemd) or cron.
#
#   backup.sh            take a backup, rotate, push off-site if BACKUP_REMOTE is set
#
# Layout under BACKUP_DIR:
#   daily/openresto-YYYYmmdd-HHMMSS.tar.gz   newest BACKUP_KEEP_DAILY kept
#   weekly/openresto-YYYY-Www.tar.gz         the first backup of each ISO week, newest BACKUP_KEEP_WEEKLY kept
# Each archive has a .sha256 beside it. Exit codes: 0 ok, 1 backup failed, 3 backup kept but off-site push failed.
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_DIR="$(env_get BACKUP_DIR /srv/openresto-backups)"
KEEP_DAILY="$(env_get BACKUP_KEEP_DAILY 7)"
KEEP_WEEKLY="$(env_get BACKUP_KEEP_WEEKLY 4)"
REMOTE="$(env_get BACKUP_REMOTE)"
REMOTE_DAYS="$(env_get BACKUP_REMOTE_RETENTION_DAYS 35)"
PING_URL="$(env_get BACKUP_PING_URL)"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"

exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || die "another backup is already running"

stamp="$(date -u +%Y%m%d-%H%M%S)"
work="$(mktemp -d "$BACKUP_DIR/.work.XXXXXX")"
snapshot="/data/.snapshot-$stamp.db"
trap 'compose exec -T backend rm -f "$snapshot" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

[ -n "$(compose ps -q backend)" ] || die "the backend container is not running; nothing to back up from"

log "snapshotting the database"
compose exec -T backend sqlite3 -cmd ".timeout 10000" /data/openresto.db ".backup '$snapshot'"
check="$(compose exec -T backend sqlite3 "$snapshot" "PRAGMA integrity_check;" | tr -d '\r')"
[ "$check" = "ok" ] || die "integrity_check on the snapshot said: $check"
migration="$(compose exec -T backend sqlite3 "$snapshot" \
  'SELECT MigrationId FROM "__EFMigrationsHistory" ORDER BY MigrationId DESC LIMIT 1;' | tr -d '\r')"

mkdir -p "$work/content"
compose cp "backend:$snapshot" "$work/content/openresto.db"
# Only an absent directory is tolerated (an instance that never encrypted anything). A copy that
# fails on an existing one must stop the backup: without these keys a restore cannot read the
# saved SMTP password or the "recent bookings" cookie.
if compose exec -T backend test -d /data/dp-keys; then
  compose cp backend:/data/dp-keys "$work/content/dp-keys"
else
  mkdir -p "$work/content/dp-keys"
fi
compose cp backend:/app/wwwroot/media "$work/content/media"

{
  echo "created_at=$(date -u +%FT%TZ)"
  echo "openresto_version=$(env_get OPENRESTO_VERSION unknown)"
  echo "last_migration=$migration"
  echo "media_files=$(find "$work/content/media" -type f | wc -l)"
} > "$work/content/MANIFEST"

archive="$BACKUP_DIR/daily/openresto-$stamp.tar.gz"
tar -czf "$archive.part" -C "$work/content" .
tar -tzf "$archive.part" >/dev/null
mv "$archive.part" "$archive"
chmod 600 "$archive"
( cd "$BACKUP_DIR/daily" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256" )
log "wrote $archive ($(du -h "$archive" | cut -f1)), last migration $migration"

week="$(date -u +%G-W%V)"
weekly="$BACKUP_DIR/weekly/openresto-$week.tar.gz"
if [ ! -e "$weekly" ]; then
  cp -p "$archive" "$weekly"
  ( cd "$BACKUP_DIR/weekly" && sha256sum "$(basename "$weekly")" > "$(basename "$weekly").sha256" )
  log "first backup of $week: kept as $weekly"
fi

# Rotation is by count, not by age, so a gap of missed days never leaves the directory empty.
rotate() { # dir keep
  local dir="$1" keep="$2" old
  find "$dir" -maxdepth 1 -name "openresto-*.tar.gz" | sort -r | tail -n +"$((keep + 1))" | while read -r old; do
    rm -f "$old" "$old.sha256"
    log "rotated out $old"
  done
}
rotate "$BACKUP_DIR/daily" "$KEEP_DAILY"
rotate "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

status=0
if [ -n "$REMOTE" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    log "ERROR: BACKUP_REMOTE is set but rclone is not installed" >&2
    status=3
  elif rclone copy "$BACKUP_DIR" "$REMOTE" --include "*.tar.gz" --include "*.sha256" \
    && rclone delete "$REMOTE" --min-age "${REMOTE_DAYS}d" --include "*.tar.gz" --include "*.sha256"; then
    log "off-site copy to $REMOTE done"
  else
    log "ERROR: off-site copy to $REMOTE failed; the local backup is intact" >&2
    status=3
  fi
fi

if [ "$status" -eq 0 ] && [ -n "$PING_URL" ]; then
  curl -fsS -m 10 --retry 2 -o /dev/null "$PING_URL" || log "WARN: could not reach BACKUP_PING_URL"
fi
exit "$status"
