#!/usr/bin/env bash
# OpenResto à côté d'une fausse Apprenti, pour de vrai (Docker réel) : la preuve que les deux cohabitent.
#
#   OPENRESTO_TEST_BACKEND=local/openresto-backend:ci OPENRESTO_TEST_FRONTEND=local/openresto-frontend:ci \
#   OPENRESTO_TEST_NGINX=local/openresto-nginx:ci deploy/tests/serveur-partage.stack.test.sh
#
# La fausse Apprenti reprend exactement les noms qui pourraient entrer en collision : projet « apprenti-serveur », services
# « app », « db » et « caddy », réseau « interne », volume « apprenti-db », et un port d'entrée sur le 8080. Elle démarre
# d'abord. Ensuite l'installateur d'OpenResto passe (avec les images déjà construites), puis on vérifie que rien de ce qui
# appartient à Apprenti n'a bougé, que les deux sites répondent, que le mot de passe protège, que la connexion à
# l'administration marche en HTTP, qu'une sauvegarde se restaure et qu'une construction cassée ne coûte rien.
# Il faut Docker, Docker Compose, curl, et les ports 8080 et 8081 libres.
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
passed=0; failed=0
pass() { passed=$((passed + 1)); printf 'PASS  %s\n' "$*"; }
fail() { failed=$((failed + 1)); printf 'FAIL  %s\n' "$*" >&2; }
expect() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 : attendu « $2 », obtenu « $3 »"; fi; }
contient() { if grep -qF -- "$2" <<<"$3"; then pass "$1"; else fail "$1 : « $2 » absent de : $3"; fi; }

export OPENRESTO_IMAGE_BACKEND="${OPENRESTO_TEST_BACKEND:-local/openresto-backend:ci}"
export OPENRESTO_IMAGE_FRONTEND="${OPENRESTO_TEST_FRONTEND:-local/openresto-frontend:ci}"
export OPENRESTO_IMAGE_NGINX="${OPENRESTO_TEST_NGINX:-local/openresto-nginx:ci}"
port_apprenti=8080
port_openresto=8081
depot="$work/depot"
apprenti="$work/apprenti"
fichier_env="$depot/deploy/serveur-partage.env"

nettoyer() {
  docker compose -p openresto-serveur -f "$depot/deploy/docker-compose.serveur-partage.yml" --env-file "$fichier_env" \
    ${COMPOSE_OVERRIDE:+-f "$COMPOSE_OVERRIDE"} down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker compose -p apprenti-serveur -f "$apprenti/docker-compose.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  # Les dossiers de données appartiennent à l'utilisateur des conteneurs.
  rm -rf "${work:?}"
}
trap nettoyer EXIT

if docker compose ls -a --format json 2>/dev/null | grep -q '"apprenti-serveur"\|"openresto-serveur"'; then
  echo "Un projet « apprenti-serveur » ou « openresto-serveur » existe déjà sur cette machine : ce test ne s'y superpose pas." >&2
  exit 2
fi

# --- La fausse Apprenti : mêmes noms de services, de réseau et de volume qu'OpenResto pourrait partager ----------------
mkdir -p "$apprenti" "$depot"
cat > "$apprenti/Caddyfile.app" <<'CADDY'
:3000 {
	respond "apprenti en marche" 200
}
CADDY
cat > "$apprenti/Caddyfile.caddy" <<'CADDY'
:80 {
	reverse_proxy app:3000
}
CADDY
cat > "$apprenti/docker-compose.yml" <<EOF
name: apprenti-serveur
services:
  db:
    image: alpine:3
    command: ["sleep", "infinity"]
    volumes: [apprenti-db:/var/lib/data]
    networks: [interne]
  app:
    image: caddy:2-alpine
    volumes: ["./Caddyfile.app:/etc/caddy/Caddyfile:ro"]
    networks: [interne]
  caddy:
    image: caddy:2-alpine
    ports: ["$port_apprenti:80"]
    volumes: ["./Caddyfile.caddy:/etc/caddy/Caddyfile:ro"]
    networks: [interne]
networks:
  interne:
volumes:
  apprenti-db:
EOF
docker compose -p apprenti-serveur -f "$apprenti/docker-compose.yml" up -d --wait >/dev/null 2>&1 || docker compose -p apprenti-serveur -f "$apprenti/docker-compose.yml" up -d >/dev/null
for _ in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port_apprenti/")" = 200 ] && break; sleep 1; done
expect "Apprenti (fausse) répond avant l'installation" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port_apprenti/")"

instantane_apprenti() {
  docker ps -a --filter label=com.docker.compose.project=apprenti-serveur --format '{{.ID}} {{.Names}} {{.Image}}' | sort
  docker ps -aq --filter label=com.docker.compose.project=apprenti-serveur | xargs docker inspect --format '{{.Name}} {{.State.StartedAt}}' | sort
  docker network ls --filter label=com.docker.compose.project=apprenti-serveur --format '{{.ID}} {{.Name}}' | sort
  docker volume ls --filter label=com.docker.compose.project=apprenti-serveur --format '{{.Name}}' | sort
}
avant_apprenti="$(instantane_apprenti)"

echo "== installation d'OpenResto à côté"
mkdir -p "$depot"
cp -r "$here" "$depot/deploy"
cp "$here/../.gitignore" "$depot/.gitignore"
set +e
sortie="$("$depot/deploy/installer.sh" --ip 127.0.0.1 --sans-construction 2>&1 </dev/null)"
code=$?
set -e
printf '%s\n' "$sortie" | sed 's/mot de passe : [0-9a-f]*/mot de passe : <masqué>/' | tail -n 40
expect "l'installateur se termine bien" 0 "$code"
mdp_site="$(grep -E '^OPENRESTO_MOT_DE_PASSE=' "$fichier_env" | cut -d= -f2-)"
mdp_admin="$(grep -E '^ADMIN_PASSWORD=' "$fichier_env" | cut -d= -f2-)"
admin_email="$(grep -E '^ADMIN_EMAIL=' "$fichier_env" | cut -d= -f2-)"
base="http://127.0.0.1:$port_openresto"

echo "== les deux applications cohabitent, sans rien partager"
expect "Apprenti répond toujours" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port_apprenti/")"
expect "Apprenti n'a pas été touchée (conteneurs, démarrages, réseaux, volumes identiques)" "$avant_apprenti" "$(instantane_apprenti)"
nos_conteneurs="$(docker ps -a --filter label=com.docker.compose.project=openresto-serveur --format '{{.Names}}' | sort)"
autres_conteneurs="$(docker ps -a --filter label=com.docker.compose.project=apprenti-serveur --format '{{.Names}}' | sort)"
expect "OpenResto a quatre conteneurs" 4 "$(grep -c . <<<"$nos_conteneurs")"
expect "tous nos conteneurs portent le préfixe du projet" 0 "$(grep -vc '^openresto-serveur-' <<<"$nos_conteneurs" || true)"
expect "aucun nom de conteneur en commun" "" "$(comm -12 <(echo "$nos_conteneurs") <(echo "$autres_conteneurs"))"
nos_services="$(docker ps -a --filter label=com.docker.compose.project=openresto-serveur --format '{{.Label "com.docker.compose.service"}}' | sort)"
autres_services="$(docker ps -a --filter label=com.docker.compose.project=apprenti-serveur --format '{{.Label "com.docker.compose.service"}}' | sort)"
expect "aucun nom de service en commun (app, db, caddy contre acces, backend, frontend, reverse-proxy)" "" "$(comm -12 <(echo "$nos_services") <(echo "$autres_services"))"
nos_reseaux="$(docker network ls --filter label=com.docker.compose.project=openresto-serveur --format '{{.Name}}' | sort)"
nos_volumes="$(docker volume ls --filter label=com.docker.compose.project=openresto-serveur --format '{{.Name}}' | sort)"
expect "nos réseaux portent le préfixe du projet" 0 "$(grep -vc '^openresto-serveur_' <<<"$nos_reseaux" || true)"
expect "nos volumes portent le préfixe du projet" 0 "$(grep -vc '^openresto-serveur_' <<<"$nos_volumes" || true)"
contient "OpenResto a ses propres volumes" "openresto-serveur_donnees" "$nos_volumes"
expect "le volume d'Apprenti existe toujours, seul" "apprenti-serveur_apprenti-db" "$(docker volume ls --filter label=com.docker.compose.project=apprenti-serveur --format '{{.Name}}')"
for reseau in openresto-serveur_interne openresto-serveur_acces; do
  etrangers="$(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$reseau" | tr ' ' '\n' | grep -v '^openresto-serveur-' | grep . || true)"
  expect "le réseau $reseau ne contient aucun conteneur d'Apprenti" "" "$etrangers"
done
expect "seul le service d'entrée publie un port" "acces" "$(docker ps --filter label=com.docker.compose.project=openresto-serveur --format '{{.Label "com.docker.compose.service"}} {{.Ports}}' | grep -- '->' | awk '{print $1}')"

echo "== le mot de passe protège, la connexion à l'administration marche en HTTP"
expect "sans mot de passe : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/health")"
expect "mauvais mot de passe : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' -u essai:mauvais "$base/api/health")"
expect "avec le bon : /api/health 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" "$base/api/health")"
expect "avec le bon : la page d'accueil 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" "$base/")"
jar="$work/cookies"
entetes="$(curl -s -D - -o /dev/null -u "essai:$mdp_site" -c "$jar" -H 'Content-Type: application/json' \
  -X POST "$base/api/admin/auth/login" -d "{\"email\":\"$admin_email\",\"password\":\"$mdp_admin\"}")"
contient "connexion à l'administration acceptée" " 200" "$(head -n 1 <<<"$entetes")"
if grep -qi '^set-cookie:.*secure' <<<"$entetes"; then fail "le cookie de connexion est « Secure » : un navigateur ne le garderait pas en HTTP"; else pass "le cookie de connexion n'est pas « Secure » (mode essai) : il survit en HTTP"; fi
expect "la session ouverte est reconnue" 200 "$(curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" -b "$jar" "$base/api/admin/auth/me")"
# Un jeton d'administrateur fabriqué à la main : refusé avec la clé publique du dépôt (appsettings.Development.json), accepté
# avec la vraie clé du serveur (le témoin qui prouve que la fabrication est valide).
jeton_forge() {
  python3 - "$1" <<'PY'
import base64, hashlib, hmac, json, sys, time
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
p = b64(json.dumps({"sub": "1", "email": "x@x", "role": "Owner", "session_version": 0, "exp": int(time.time()) + 3600,
                    "iss": "openresto-api", "aud": "openresto-admin"}).encode())
print(f"{h}.{p}." + b64(hmac.new(sys.argv[1].encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()))
PY
}
cle_publique='openresto-dev-only-jwt-key-do-not-use-in-production-abc123!!'
cle_serveur="$(grep -E '^JWT_KEY=' "$fichier_env" | cut -d= -f2-)"
expect "jeton signé avec la clé publique du dépôt : refusé" 401 "$(curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" -H "Cookie: openresto_auth=$(jeton_forge "$cle_publique")" "$base/api/admin/auth/me")"
expect "témoin : jeton signé avec la vraie clé du serveur : accepté" 200 "$(curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" -H "Cookie: openresto_auth=$(jeton_forge "$cle_serveur")" "$base/api/admin/auth/me")"
expect "le mot de passe administrateur public du dépôt est refusé" 401 "$(curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" -H 'Content-Type: application/json' -X POST "$base/api/admin/auth/login" -d '{"email":"admin@openresto.com","password":"dev-password-change-before-production"}')"
expect "la page d'API ouverte (openapi) est derrière le mot de passe" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$base/openapi/v1.json")"

echo "== le contrôle de santé"
set +e; sortie="$("$depot/deploy/verifier.sh" 2>&1)"; code=$?; set -e
expect "verifier.sh : code 0" 0 "$code"
contient "verifier.sh : voit Apprenti sans y toucher" "apprenti-serveur-caddy-1" "$sortie"
contient "verifier.sh : conclut" "Tout est bon" "$sortie"

echo "== sauvegarde, modification, restauration"
renommer() { curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" -b "$jar" -H 'Content-Type: application/json' -X PATCH "$base/api/brand" -d "{\"appName\":\"$1\"}"; }
nom() { curl -s -u "essai:$mdp_site" "$base/api/brand" | python3 -c 'import json,sys; print(json.load(sys.stdin)["appName"])'; }
expect "marque renommée avant la sauvegarde" 200 "$(renommer Avant-Sauvegarde)"
set +e; sortie="$("$depot/deploy/sauvegarder.sh" 2>&1)"; code=$?; set -e
expect "sauvegarder.sh : code 0" 0 "$code"
contient "sauvegarder.sh : dit où est le fichier" "Sauvegarde faite : deploy/sauvegardes/daily/openresto-" "$sortie"
archive="$(find "$depot/deploy/sauvegardes/daily" -name 'openresto-*.tar.gz' | sort | tail -n 1)"
expect "la sauvegarde n'est lisible que par nous (droits 600)" 600 "$(stat -c %a "$archive")"
expect "marque changée après la sauvegarde" 200 "$(renommer Apres-Sauvegarde)"
set +e; sortie="$("$depot/deploy/restaurer.sh" --oui "$archive" 2>&1)"; code=$?; set -e
expect "restaurer.sh : code 0" 0 "$code"
curl_connexion() { curl -s -o /dev/null -u "essai:$mdp_site" -c "$jar" -H 'Content-Type: application/json' -X POST "$base/api/admin/auth/login" -d "{\"email\":\"$admin_email\",\"password\":\"$mdp_admin\"}"; }
curl_connexion
expect "la marque d'avant la sauvegarde est revenue" Avant-Sauvegarde "$(nom)"
expect "Apprenti répond toujours après la restauration" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port_apprenti/")"

echo "== une construction qui casse ne coûte rien"
# Le dossier de test ne contient pas les sources (nginx, openresto-frontend, ...) : la construction échoue, comme une vraie panne.
set +e; sortie="$("$depot/deploy/mettre-a-jour.sh" --sans-git 2>&1)"; code=$?; set -e
expect "construction cassée : code 1" 1 "$code"
contient "construction cassée : dit que rien n'a changé" "RIEN N'A CHANGÉ" "$sortie"
expect "construction cassée : OpenResto répond toujours" 200 "$(curl -s -o /dev/null -w '%{http_code}' -u "essai:$mdp_site" "$base/api/health")"
expect "construction cassée : Apprenti répond toujours" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port_apprenti/")"
expect "construction cassée : une sauvegarde a été faite avant" 2 "$(find "$depot/deploy/sauvegardes/daily" -name 'openresto-*.tar.gz' | grep -c .)"

echo "== tout supprimer chez nous ne touche pas Apprenti"
docker compose -p openresto-serveur -f "$depot/deploy/docker-compose.serveur-partage.yml" --env-file "$fichier_env" \
  ${COMPOSE_OVERRIDE:+-f "$COMPOSE_OVERRIDE"} down --volumes --remove-orphans >/dev/null 2>&1
expect "OpenResto a disparu" 0 "$(docker ps -a --filter label=com.docker.compose.project=openresto-serveur -q | grep -c . || true)"
expect "Apprenti répond toujours" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port_apprenti/")"
expect "Apprenti est restée identique" "$avant_apprenti" "$(instantane_apprenti)"

echo
echo "réussis : $passed  échoués : $failed"
[ "$failed" -eq 0 ]
