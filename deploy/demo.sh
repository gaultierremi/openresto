#!/usr/bin/env bash
set -euo pipefail

DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RACINE="$(cd "$DEPLOY/.." && pwd)"
CONFIG="$DEPLOY/demo.env"

compose() {
  env -u COMPOSE_FILE -u COMPOSE_PROJECT_NAME -u COMPOSE_PROFILES -u COMPOSE_ENV_FILES \
    -u DEMO_PASSWORD_HASH -u DEMO_ADMIN_PASSWORD -u DEMO_JWT_KEY \
    docker compose --project-name openresto-demo --env-file "$CONFIG" \
    -f "$DEPLOY/docker-compose.demo.yml" "$@"
}

case "${1:-}" in
  preparer)
    command -v python3 >/dev/null
    docker info >/dev/null
    docker pull httpd:2.4-alpine
    python3 "$DEPLOY/demo/preparer.py" "$CONFIG"
    chmod a+r "$DEPLOY/demo/Caddyfile"
    compose config -q
    ;;
  construire)
    compose build backend
    compose build frontend
    compose build reverse-proxy
    ;;
  demarrer)
    docker network inspect openresto-demo-caddy >/dev/null 2>&1 || docker network create openresto-demo-caddy
    compose up -d --wait backend frontend reverse-proxy
    if compose exec -T backend test -f /data/.demo-initialisee; then
      echo "Base existante conservée : aucune réinitialisation."
    else
      python3 "$RACINE/scripts/demo_online_data.py" | compose exec -T backend sqlite3 -bail /data/openresto.db
      compose exec -T backend touch /data/.demo-initialisee
    fi
    compose up -d --wait acces
    echo "Démonstration démarrée ; raccordez maintenant le Caddy existant (docs/DEMO-EN-LIGNE.md)."
    ;;
  verifier)
    compose ps
    compose exec -T backend curl -fsS http://127.0.0.1:8080/api/health
    compose exec -T backend sqlite3 /data/openresto.db 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
    ;;
  arreter)
    compose down
    echo "Pile OpenResto arrêtée. Volumes et réseau partagé conservés."
    ;;
  *)
    echo "Usage : $0 preparer|construire|demarrer|verifier|arreter" >&2
    exit 2
    ;;
esac
