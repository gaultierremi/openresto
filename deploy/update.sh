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

# A registry whose first segment is not a host (no dot, no colon, not localhost) is a Docker Hub
# namespace anyone could register: never pull from one. Checked before anything is touched.
registry="$(env_get OPENRESTO_REGISTRY)"
case "${registry%%/*}" in
  "" | localhost | *.* | *:*) ;;
  *) die "OPENRESTO_REGISTRY '$registry' would be read as a Docker Hub namespace; use a host name or localhost" ;;
esac

log "backing up before the upgrade"
"$here/backup/backup.sh"

# An install made with `install.sh --build` has images named localhost/openresto-*: there is no
# registry behind that name, so the upgrade rebuilds from the checkout (git pull it first).
if [ "$registry" = localhost ]; then
  COMPOSE_OVERRIDE="$here/docker-compose.build.yml"
  log "building $version from this checkout"
  compose build
else
  log "pulling $version"
  compose pull
fi
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
