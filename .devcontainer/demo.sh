#!/usr/bin/env bash
# The full OpenResto stack with demo data, for GitHub Codespaces and for a local Docker.
#
#   demo.sh setup    generate credentials, build, start, load the demo data, print the banner
#   demo.sh start    start the stack again (a resumed Codespace); falls back to setup on a first run
#   demo.sh banner   print the address and the generated credentials
#   demo.sh reseed   reload the demo data (bookings are generated relative to today)
#   demo.sh stop     stop the containers, keep the data
#   demo.sh clean    remove containers, data and the generated credentials
#
# The credentials are generated here, written to .devcontainer/demo.env (git-ignored) and never
# committed. DEMO_NO_BUILD=1 reuses images that already exist; DEMO_COMPOSE_EXTRA=<file> layers one
# more compose file on top.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ENV_FILE=.devcontainer/demo.env
PORT=5062
export COMPOSE_PROJECT_NAME=openresto-demo

# Codespaces reaches the app through a forwarded https address; anywhere else it is localhost.
if [ -n "${CODESPACE_NAME:-}" ]; then
  ORIGIN="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  export DEMO_BIND=0.0.0.0
else
  ORIGIN="http://localhost:${PORT}"
fi

compose_files=(-f docker-compose.yml -f .devcontainer/docker-compose.demo.yml)
[ -n "${DEMO_COMPOSE_EXTRA:-}" ] && compose_files+=(-f "$DEMO_COMPOSE_EXTRA")
compose() { docker compose --env-file "$ENV_FILE" "${compose_files[@]}" "$@"; }

log() { printf '[demo] %s\n' "$*"; }
die() { printf '[demo] ERREUR : %s\n' "$*" >&2; exit 1; }

ensure_tools() {
  command -v docker >/dev/null 2>&1 || die "docker est introuvable."
  docker compose version >/dev/null 2>&1 || die "le plugin « docker compose » est introuvable."
  if ! command -v python3 >/dev/null 2>&1; then
    log "installation de python3 (nécessaire pour générer les données de démo)"
    sudo apt-get update -qq && sudo apt-get install -y -qq python3
  fi
}

ensure_secrets() {
  if [ -s "$ENV_FILE" ]; then
    # The address changes with the Codespace's name; the passwords do not.
    sed -i "s|^DEMO_ORIGIN=.*|DEMO_ORIGIN=${ORIGIN}|" "$ENV_FILE"
    return
  fi
  log "génération des identifiants de démo"
  umask 077
  python3 - "$ORIGIN" > "$ENV_FILE" <<'PY'
import secrets, sys
print("DEMO_ADMIN_EMAIL=demo@openresto.test")
print("DEMO_ADMIN_PASSWORD=" + secrets.token_urlsafe(15))
print("DEMO_JWT_KEY=" + secrets.token_urlsafe(48))
print("DEMO_ORIGIN=" + sys.argv[1])
PY
}

secret() { grep -E "^$1=" "$ENV_FILE" | cut -d= -f2-; }

seed() {
  local sql accounts
  sql="$(mktemp)"; accounts="$(mktemp)"
  trap 'rm -f "$sql" "$accounts"' RETURN
  log "chargement des données de démo"
  python3 scripts/demo_data.py all > "$sql"
  # The password reaches the generator through the environment, never argv, where ps would show it.
  ADMIN_EMAIL="$(secret DEMO_ADMIN_EMAIL)" ADMIN_PASSWORD="$(secret DEMO_ADMIN_PASSWORD)" \
    python3 scripts/demo_data.py accounts > "$accounts"
  compose exec -T backend sqlite3 /data/openresto.db < "$sql" >/dev/null
  compose exec -T backend sqlite3 /data/openresto.db < "$accounts" >/dev/null
  compose exec -T backend sqlite3 /data/openresto.db 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null
}

# The dataset names the public demo's address as the site's, and the QR codes encode it: scanned
# from a phone they would open that site instead of this one.
point_site_at_origin() {
  compose exec -T backend sqlite3 /data/openresto.db "UPDATE BrandSettings SET WebsiteUrl='${ORIGIN}';" >/dev/null
}

hook_banner() {
  local line="[ -f \"$PWD/.devcontainer/demo.sh\" ] && bash \"$PWD/.devcontainer/demo.sh\" banner # openresto-demo"
  # Cosmetic: a home directory we cannot write to must not fail the setup.
  grep -qF '# openresto-demo' "$HOME/.bashrc" 2>/dev/null || printf '%s\n' "$line" >> "$HOME/.bashrc" || true
}

banner() {
  [ -s "$ENV_FILE" ] || { log "pas encore installé : lance « bash .devcontainer/demo.sh setup »"; return 0; }
  local token
  token="$(compose exec -T backend sqlite3 /data/openresto.db 'SELECT PublicToken FROM Restaurants ORDER BY Id LIMIT 1;' 2>/dev/null | tr -d '\r' || true)"
  echo
  echo "════════════════════ OpenResto — démo ════════════════════"
  echo "  Application   : $ORIGIN"
  echo "  Administration : $ORIGIN/admin"
  [ -n "$token" ] && echo "  Carte QR (1er lieu) : $ORIGIN/menu/r/$token"
  echo
  echo "  Propriétaire  : $(secret DEMO_ADMIN_EMAIL)"
  echo "  Gérant        : manager@openresto.com"
  echo "  Mot de passe  : $(secret DEMO_ADMIN_PASSWORD)   (le même pour les deux)"
  echo
  echo "  Ces identifiants sont générés pour cette instance ; ils ne sont pas dans le dépôt."
  if [ -n "${CODESPACE_NAME:-}" ]; then
    echo "  Le port $PORT est PRIVÉ : seul ton compte GitHub y accède. Pour montrer l'aperçu,"
    echo "  onglet Ports > clic droit sur $PORT > Visibilité du port (voir docs/HEBERGEMENT.md)."
  fi
  echo "══════════════════════════════════════════════════════════"
}

up() { compose up -d --wait --wait-timeout 300; }

case "${1:-}" in
  setup)
    ensure_tools
    ensure_secrets
    [ "${DEMO_NO_BUILD:-0}" = 1 ] || { log "construction des images (10 à 15 min la première fois)"; compose build; }
    up
    seed
    point_site_at_origin
    hook_banner
    banner
    ;;
  start)
    if [ ! -s "$ENV_FILE" ]; then exec bash "$0" setup; fi
    ensure_tools
    ensure_secrets
    up
    point_site_at_origin
    hook_banner
    ;;
  banner) banner ;;
  reseed)
    [ -s "$ENV_FILE" ] || die "rien d'installé : lance d'abord « setup »."
    ensure_tools
    seed
    point_site_at_origin
    log "données rechargées"
    ;;
  stop)
    [ -s "$ENV_FILE" ] || die "rien d'installé."
    compose stop
    ;;
  clean)
    [ -s "$ENV_FILE" ] && compose down --volumes --remove-orphans
    rm -f "$ENV_FILE"
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
