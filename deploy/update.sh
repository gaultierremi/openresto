#!/usr/bin/env bash
# Upgrade to the OPENRESTO_VERSION written in .env: backup, pull, restart, wait for health.
#
#   1. edit OPENRESTO_VERSION in .env (read CHANGELOG.md first)
#   2. ./update.sh
#
# If the new version does not come up healthy, the script says so and leaves the backup it took
# at its start; roll back with the steps in docs/HEBERGEMENT.md ("Revenir en arrière").
set -Eeuo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup/lib.sh
. "$here/backup/lib.sh"

version="$(env_get OPENRESTO_VERSION)"
[ -n "$version" ] || die "OPENRESTO_VERSION is not set in $ENV_FILE"
[ "$version" != "latest" ] || die "pin an exact version in OPENRESTO_VERSION, not latest"

log "backing up before the upgrade"
"$here/backup/backup.sh"

log "pulling $version"
compose pull
log "restarting"
compose up -d --remove-orphans

if wait_backend_healthy 90; then
  log "backend healthy on $version"
else
  log "backend NOT healthy; logs follow" >&2
  compose logs --tail=60 backend >&2
  die "upgrade to $version failed; the pre-upgrade backup is in $(env_get BACKUP_DIR /srv/openresto-backups)/daily"
fi

docker image prune -f >/dev/null
compose ps
