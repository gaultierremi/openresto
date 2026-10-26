#!/usr/bin/env bash
set -euo pipefail
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP="$(mktemp -d)"
TEMOIN="openresto-demo-validation-$$"
nettoyer() {
  docker rm -f "$TEMOIN" >/dev/null 2>&1 || true
  rm -rf "$TEMP"
}
trap nettoyer EXIT

voisin() {
  docker exec "$TEMOIN" wget -Y off -qO- --header='Host: apprenti.test' http://127.0.0.1/
}

for retour_final in non oui; do
  printf 'respond "apprenti-temoin"\n' > "$TEMP/reponse.caddy"
  printf '{\n  auto_https off\n}\nhttp://apprenti.test {\n  import reponse.caddy\n}' > "$TEMP/Caddyfile"
  if [ "$retour_final" = oui ]; then printf '\n' >> "$TEMP/Caddyfile"; fi
  cp "$TEMP/Caddyfile" "$TEMP/avant"
  docker run -d --rm --name "$TEMOIN" \
    -e HTTP_PROXY= -e HTTPS_PROXY= -e ALL_PROXY= -e http_proxy= -e https_proxy= -e all_proxy= \
    -v "$TEMP:/etc/caddy:ro" caddy:2-alpine >/dev/null
  for _ in $(seq 1 20); do
    if voisin > "$TEMP/reponse" 2>/dev/null; then break; fi
    sleep 1
  done
  test "$(cat "$TEMP/reponse")" = apprenti-temoin
  AVANT="$(docker inspect "$TEMOIN" --format '{{.Id}} {{.State.StartedAt}}')"

  cat "$TEMP/avant" "$RACINE/deploy/demo/caddy-existant.caddy" > "$TEMP/candidat"
  docker exec -i -w /etc/caddy "$TEMOIN" caddy validate --config - --adapter caddyfile < "$TEMP/candidat"
  cmp "$TEMP/avant" "$TEMP/Caddyfile"
  printf '\nconfiguration invalide {\n' >> "$TEMP/candidat"
  if docker exec -i -w /etc/caddy "$TEMOIN" caddy validate --config - --adapter caddyfile < "$TEMP/candidat" > "$TEMP/refus" 2>&1; then
    echo "Échec : la configuration invalide a été acceptée." >&2
    exit 1
  fi
  cmp "$TEMP/avant" "$TEMP/Caddyfile"
  test "$(voisin)" = apprenti-temoin

  cat "$TEMP/avant" "$RACINE/deploy/demo/caddy-existant.caddy" > "$TEMP/Caddyfile"
  docker exec "$TEMOIN" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  test "$(voisin)" = apprenti-temoin
  cat "$TEMP/avant" > "$TEMP/Caddyfile"
  docker exec -i -w /etc/caddy "$TEMOIN" caddy validate --config - --adapter caddyfile < "$TEMP/avant"
  docker exec "$TEMOIN" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  cmp "$TEMP/avant" "$TEMP/Caddyfile"
  test "$(voisin)" = apprenti-temoin
  test "$AVANT" = "$(docker inspect "$TEMOIN" --format '{{.Id}} {{.State.StartedAt}}')"
  docker rm -f "$TEMOIN" >/dev/null
done
echo "OK : Caddyfile avec/sans retour final, copie invalide refusée sans écriture, reload et retour arrière sans impact voisin."
