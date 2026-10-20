#!/usr/bin/env bash
# Shared by backup.sh and restore.sh. Source it; do not run it.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.prod.yml}"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit "${2:-1}"; }

# Reads KEY from the env file without sourcing it: a password containing $ or a space must
# not be executed. The environment wins, so tests and one-off runs can override a value.
env_get() {
  local key="$1" default="${2:-}" value
  if [ -n "${!key:-}" ]; then printf '%s' "${!key}"; return; fi
  if [ -f "$ENV_FILE" ]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
    if [ -n "$value" ]; then printf '%s' "$value"; return; fi
  fi
  printf '%s' "$default"
}

# COMPOSE_OVERRIDE: an extra compose file layered on top (the tests use it; production does not).
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ${COMPOSE_OVERRIDE:+-f "$COMPOSE_OVERRIDE"} "$@"
}

wait_backend_healthy() {
  local tries="${1:-60}" status
  for _ in $(seq 1 "$tries"); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q backend)" 2>/dev/null || true)"
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  return 1
}
