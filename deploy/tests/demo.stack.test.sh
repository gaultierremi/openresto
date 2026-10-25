#!/usr/bin/env bash
set -euo pipefail
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP="$(mktemp -d)"
TEMOIN="openresto-demo-temoin-$$"
creee=0

nettoyer() {
  local resultat=$?
  if [ "$resultat" != 0 ] && [ "$creee" = 1 ]; then
    docker logs --tail=15 "$TEMOIN" >&2 || true
    docker compose --project-name openresto-demo --env-file "$TEMP/deploy/demo.env" \
      -f "$TEMP/deploy/docker-compose.demo.yml" logs --tail=30 backend frontend acces >&2 || true
  fi
  docker rm -f "$TEMOIN" >/dev/null 2>&1 || true
  if [ "$creee" = 1 ]; then
    "$TEMP/deploy/demo.sh" arreter >/dev/null 2>&1 || true
    docker volume rm openresto-demo_donnees openresto-demo_medias >/dev/null 2>&1 || true
    docker network rm openresto-demo-caddy >/dev/null 2>&1 || true
  fi
  rm -rf "$TEMP"
}
trap nettoyer EXIT

if docker network inspect openresto-demo-caddy >/dev/null 2>&1 || \
   docker volume inspect openresto-demo_donnees >/dev/null 2>&1 || \
   docker volume inspect openresto-demo_medias >/dev/null 2>&1; then
  echo "Test refusé : une démonstration existe déjà ; aucune modification." >&2
  exit 1
fi
mkdir -p "$TEMP/deploy" "$TEMP/scripts"
cp "$RACINE/deploy/demo.sh" "$RACINE/deploy/docker-compose.demo.yml" "$TEMP/deploy/"
cp -R "$RACINE/deploy/demo" "$RACINE/deploy/serveur-partage" "$TEMP/deploy/"
cp "$RACINE/scripts/demo_data.py" "$RACINE/scripts/demo_online_data.py" "$TEMP/scripts/"
"$TEMP/deploy/demo.sh" preparer
creee=1
docker network create openresto-demo-caddy >/dev/null
cat > "$TEMP/Caddyfile" <<'CADDY'
:80 {
  @demo host openresto.134-209-92-233.sslip.io
  handle @demo {
    reverse_proxy openresto-demo-acces:80
  }
  handle {
    respond "apprenti-temoin"
  }
}
CADDY
docker run -d --name "$TEMOIN" --network openresto-demo-caddy -p 127.0.0.1::80 \
  -e HTTP_PROXY= -e HTTPS_PROXY= -e ALL_PROXY= -e http_proxy= -e https_proxy= -e all_proxy= \
  -v "$TEMP/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine >/dev/null
AVANT="$(docker inspect "$TEMOIN" --format '{{.Id}} {{.State.StartedAt}}')"
ADRESSE="http://$(docker port "$TEMOIN" 80/tcp)"
"$TEMP/deploy/demo.sh" demarrer
compose() {
  docker compose --project-name openresto-demo --env-file "$TEMP/deploy/demo.env" \
    -f "$TEMP/deploy/docker-compose.demo.yml" "$@"
}
compose exec -T backend sqlite3 /data/openresto.db '.backup /tmp/demo-test.db'
compose cp backend:/tmp/demo-test.db "$TEMP/migree.db"
# Le test de données part de la base de démarrage, avant le profil, donc vider seulement la copie.
python3 - "$TEMP/migree.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute('DELETE FROM BrandSettings')
    db.execute('DELETE FROM MenuItems')
    db.execute('DELETE FROM MenuCategories')
    db.execute('DELETE FROM Menus')
    db.execute('DELETE FROM Tables')
    db.execute('DELETE FROM Sections')
    db.execute('DELETE FROM Restaurants')
PY
python3 "$RACINE/deploy/tests/demo-data.test.py" "$TEMP/migree.db"

python3 "$RACINE/deploy/tests/demo-http.test.py" "$TEMP/deploy/demo.env" "$ADRESSE"
test "$(compose exec -T backend sqlite3 /data/openresto.db 'SELECT COUNT(*) FROM Bookings;')" = 0

IP_TEMOIN="$(docker inspect "$TEMOIN" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
if compose exec -T backend curl --connect-timeout 2 --max-time 3 "http://$IP_TEMOIN/" >/dev/null 2>&1; then
  echo "Échec : l'API atteint un réseau externe à son réseau interne." >&2
  exit 1
fi
for service in acces reverse-proxy backend frontend; do
  test "$(docker inspect "$(compose ps -q "$service")" --format '{{len .HostConfig.PortBindings}}')" = 0
done
"$TEMP/deploy/demo.sh" demarrer
"$TEMP/deploy/demo.sh" verifier
"$TEMP/deploy/demo.sh" arreter
test "$AVANT" = "$(docker inspect "$TEMOIN" --format '{{.Id}} {{.State.StartedAt}}')"
test "$(docker exec "$TEMOIN" wget -Y off -qO- http://127.0.0.1/)" = apprenti-temoin
echo "OK : redémarrage sans réinitialisation, absence de ports, API isolée et arrêt sans toucher au voisin."
