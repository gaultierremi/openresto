#!/usr/bin/env bash
# Comportement des scripts du serveur partagé (installer, verifier, mettre-a-jour), joués contre des doublures de
# docker, ss, df, ip et curl : aucun démon Docker, aucun droit root, aucun réseau. Tout s'écrit dans un dossier jetable,
# dans une copie de deploy/ placée dans un vrai dépôt Git (la mise à jour fait un vrai « git pull »).
#
#   deploy/tests/serveur-partage.test.sh
#
# Ce que ça épingle, ce sont les règles qui comptent sur un serveur qui n'est pas le nôtre : un refus n'écrit et ne démarre
# rien, une relance ne réécrit jamais la configuration, une construction qui casse ne touche pas à ce qui tourne, et rien
# n'est arrêté, supprimé ni nettoyé hors du périmètre d'OpenResto.
# pass() ne peut pas échouer : « A && pass || fail » ci-dessous est un vrai si/sinon.
# Les doublures sont des scripts écrits sur disque : leurs corps sont entre apostrophes exprès.
# shellcheck disable=SC2015,SC2016
set -Eeuo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "${work:?}"' EXIT
passed=0; failed=0
pass() { passed=$((passed + 1)); printf 'PASS  %s\n' "$*"; }
fail() { failed=$((failed + 1)); printf 'FAIL  %s\n' "$*" >&2; }
expect() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 : attendu « $2 », obtenu « $3 »"; fi; }
contient() { if grep -qF -- "$2" <<<"$3"; then pass "$1"; else fail "$1 : « $2 » absent de : $3"; fi; }
absent() { if grep -qF -- "$2" <<<"$3"; then fail "$1 : « $2 » présent dans : $3"; else pass "$1"; fi; }

bin="$work/bin"; etat="$work/etat"; appels="$work/appels"; depot="$work/depot"; doubles="$work/doubles"
mkdir -p "$bin" "$etat" "$doubles"

# --- doublures ------------------------------------------------------------------------------------------------
cat > "$bin/docker" <<'SH'
#!/usr/bin/env bash
echo "docker $*" >> "$APPELS"
case "$1" in compose) echo "env JWT_KEY=${JWT_KEY-absent} ADMIN_PASSWORD=${ADMIN_PASSWORD-absent} BACKUP_DIR=${BACKUP_DIR-absent}" >> "$APPELS" ;; esac
a=" $* "
case "$*" in
  "info") [ ! -e "$ETAT/docker-casse" ] || exit 1 ;;
  "info -f "*) echo "$ETAT" ;;
  "ps --format"*) cat "$ETAT/autres" 2>/dev/null || true; [ ! -e "$ETAT/demarre" ] || echo "openresto-serveur-backend-1 (8080/tcp)" ;;
  "ps -a --format"*) cat "$ETAT/restes-conteneurs" 2>/dev/null || true ;;
  "volume ls -q") cat "$ETAT/restes-volumes" 2>/dev/null || true ;;
  "network ls"*) cat "$ETAT/restes-reseaux" 2>/dev/null || true ;;
  "network inspect"*) cat "$ETAT/contenu-reseau" 2>/dev/null || echo "openresto-serveur-acces-1 openresto-serveur-backend-1" ;;
  "image inspect"*) [ -e "$ETAT/images" ] || exit 1 ;;
  "image prune"*) exit 0 ;;
  "inspect --format"*) cat "$ETAT/sante" 2>/dev/null || echo healthy ;;
  "compose version") exit 0 ;;
  compose*)
    sous=""
    for mot in "$@"; do case "$mot" in build|up|ps|exec|logs|run|stop|config) sous="$mot"; break ;; esac; done
    case "$sous" in
      build) if [ -e "$ETAT/build-echoue" ]; then echo "ERROR: step 7/12 failed (simulé)" >&2; exit 1; fi; touch "$ETAT/images" ;;
      up) touch "$ETAT/demarre" ;;
      ps)
        case "$a" in
          *" -q "*) if [ -e "$ETAT/demarre" ]; then echo "id-$(echo "$a" | awk '{print $NF}')"; fi ;;
          *"{{.Ports}}"*) svc="$(echo "$a" | awk '{print $NF}')"; cat "$ETAT/ports-$svc" 2>/dev/null || true ;;
        esac ;;
      exec) echo '{"status":"ok"}' ;;
    esac ;;
esac
exit 0
SH
cat > "$bin/ss" <<'SH'
#!/usr/bin/env bash
dernier="${*: -1}"; port="${dernier##*:}"
if grep -qx "$port" "$ETAT/ports-occupes" 2>/dev/null; then echo "LISTEN 0 4096 0.0.0.0:$port 0.0.0.0:*"; fi
exit 0
SH
cat > "$bin/df" <<'SH'
#!/usr/bin/env bash
echo "Filesystem 1M-blocks Used Available Capacity Mounted"
echo "fake 100000 1000 $(cat "$ETAT/disque" 2>/dev/null || echo 50000) 2% /"
SH
cat > "$bin/ip" <<'SH'
#!/usr/bin/env bash
echo "1.1.1.1 via 10.0.0.1 dev eth0 src 203.0.113.7 uid 1000"
SH
cat > "$bin/curl" <<'SH'
#!/usr/bin/env bash
echo "curl $*" >> "$APPELS"
if [[ "$*" == *"openresto_auth="* ]]; then cat >/dev/null 2>&1 </dev/null; cat "$ETAT/curl-jeton" 2>/dev/null || echo 401; exit 0; fi
if [[ "$*" == *"--config"* ]]; then cat >/dev/null; cat "$ETAT/curl-avec" 2>/dev/null || echo 200; else cat "$ETAT/curl-sans" 2>/dev/null || echo 401; fi
SH
chmod +x "$bin"/*
# Sauvegarde et contrôle de santé : ici on ne vérifie que leur place dans l'enchaînement.
for nom in sauvegarder verifier; do
  printf '#!/usr/bin/env bash\necho "%s" >> "$APPELS"\n[ ! -e "$ETAT/%s-echoue" ]\n' "$nom" "$nom" > "$doubles/$nom.sh"
  chmod +x "$doubles/$nom.sh"
done

# --- un vrai dépôt Git, avec une origine, pour la mise à jour ------------------------------------------------------
mkdir -p "$depot"
cp -r "$src/deploy" "$depot/deploy"
cp "$src/.gitignore" "$depot/.gitignore"
git -C "$depot" init -q -b main
git -C "$depot" -c user.name=t -c user.email=t@t add -A
git -C "$depot" -c user.name=t -c user.email=t@t commit -q -m initial
initial="$(git -C "$depot" rev-parse HEAD)"
git clone -q --bare "$depot" "$work/origine.git"
git -C "$depot" remote add origin "$work/origine.git"
git -C "$depot" fetch -q origin
git -C "$depot" branch -q --set-upstream-to=origin/main main

lancer() { # script args... -> $sortie, $code
  : > "$appels"
  set +e
  sortie="$(env -i PATH="$bin:/usr/bin:/bin" HOME="$work" APPELS="$appels" ETAT="$etat" MEMINFO_FILE="$work/meminfo" \
    PAUSE_CONSTRUCTION=0 TMPDIR="$work" INSTALLER_VERIFIER="$doubles/verifier.sh" MAJ_SAUVEGARDER="$doubles/sauvegarder.sh" \
    MAJ_VERIFIER="$doubles/verifier.sh" "$depot/deploy/$1" "${@:2}" 2>&1 </dev/null)"
  code=$?
  set -e
}
lancer_avec() { # VARIABLE=valeur script args... : comme lancer, avec une variable d'environnement en plus
  local variable="$1"; shift
  : > "$appels"
  set +e
  sortie="$(env -i PATH="$bin:/usr/bin:/bin" HOME="$work" APPELS="$appels" ETAT="$etat" MEMINFO_FILE="$work/meminfo" \
    PAUSE_CONSTRUCTION=0 TMPDIR="$work" INSTALLER_VERIFIER="$doubles/verifier.sh" MAJ_SAUVEGARDER="$doubles/sauvegarder.sh" \
    MAJ_VERIFIER="$doubles/verifier.sh" JWT_KEY=evil ADMIN_PASSWORD=evil BACKUP_DIR=/tmp/evil "$variable" "$depot/deploy/$1" "${@:2}" 2>&1 </dev/null)"
  code=$?
  set -e
}
meminfo() { printf 'MemAvailable: %d kB\nSwapFree: %d kB\n' "$(($1 * 1024))" "$(($2 * 1024))" > "$work/meminfo"; }
fichier_env="$depot/deploy/serveur-partage.env"
nouvelle_machine() {
  rm -rf "${etat:?}"; mkdir -p "$etat"
  rm -f "${fichier_env:?}" "${fichier_env:?}.avant-domaine"
  meminfo 5000 0
}
val() { grep -E "^$1=" "$fichier_env" | tail -n 1 | cut -d= -f2-; }
ordre() { grep -n "$1" "$appels" | head -n 1 | cut -d: -f1; }
nb() { grep -c -- "$1" "$appels" || true; }

echo "== installer : les refus n'écrivent ni ne démarrent rien"
nouvelle_machine; echo "apprenti-serveur-caddy-1 (0.0.0.0:8080->80/tcp)" > "$etat/autres"
lancer installer.sh --verifier-seulement
expect "contrôle seul : code 0" 0 "$code"
[ ! -e "$fichier_env" ] && pass "contrôle seul : aucune configuration écrite" || fail "contrôle seul : une configuration a été écrite"
expect "contrôle seul : rien n'est construit ni démarré" 0 "$(nb ' up \| build')"
contient "contrôle seul : dit que l'installation est possible" "Tout est en ordre" "$sortie"
contient "contrôle seul : montre Apprenti sans y toucher" "apprenti-serveur-caddy-1" "$sortie"

nouvelle_machine; echo 8081 > "$etat/ports-occupes"
lancer installer.sh
expect "port occupé : refusé (code 1)" 1 "$code"
contient "port occupé : propose un port libre" "--port 8082" "$sortie"
[ ! -e "$fichier_env" ] && pass "port occupé : rien écrit" || fail "port occupé : configuration écrite"
expect "port occupé : rien construit" 0 "$(nb 'build')"
contient "port occupé : dit que les autres applications ne sont pas touchées" "n'ont pas été touchées" "$sortie"

nouvelle_machine; meminfo 1200 500
lancer installer.sh
expect "mémoire insuffisante : refusé" 1 "$code"
contient "mémoire insuffisante : donne le chiffre" "1700 Mo" "$sortie"
[ ! -e "$fichier_env" ] && pass "mémoire insuffisante : rien écrit" || fail "mémoire insuffisante : configuration écrite"
touch "$etat/images"
lancer installer.sh --verifier-seulement
expect "mémoire insuffisante mais images déjà construites : accepté" 0 "$code"

nouvelle_machine; echo 2000 > "$etat/disque"
lancer installer.sh
expect "disque insuffisant : refusé" 1 "$code"
contient "disque insuffisant : donne le chiffre" "2000 Mo" "$sortie"

nouvelle_machine; touch "$etat/docker-casse"
lancer installer.sh
expect "Docker qui ne répond pas : refusé" 1 "$code"
contient "Docker qui ne répond pas : dit quoi faire" "permission denied" "$sortie"

nouvelle_machine; echo "openresto-serveur_donnees" > "$etat/restes-volumes"
lancer installer.sh
expect "restes d'une installation : refusé" 1 "$code"
contient "restes d'une installation : ne conseille pas de supprimer à la main" "ne les supprimez pas" "$sortie"

nouvelle_machine
lancer installer.sh --port 80; expect "port 80 refusé" 1 "$code"
contient "port 80 refusé : nomme le Caddy du serveur" "Caddy du serveur" "$sortie"
lancer installer.sh --domaine "Pas Un Domaine"; expect "domaine invalide refusé" 1 "$code"
lancer installer.sh --ip 999.1.1.1; expect "adresse IP invalide refusée" 1 "$code"
lancer installer.sh --option-inconnue; expect "option inconnue refusée" 1 "$code"

echo "== installer : installation d'essai (adresse IP, mot de passe obligatoire)"
nouvelle_machine
lancer_avec JWT_KEY=evil installer.sh
expect "installation : code 0" 0 "$code"
expect "configuration : droits 600" 600 "$(stat -c %a "$fichier_env")"
expect "configuration : port 8081 (Apprenti garde 8080)" 8081 "$(val OPENRESTO_PORT)"
expect "configuration : adresse = IP du serveur et port" "http://203.0.113.7:8081" "$(val OPENRESTO_URL_PUBLIQUE)"
expect "configuration : mode essai" Development "$(val OPENRESTO_ENVIRONNEMENT)"
expect "configuration : mot de passe du site obligatoire" 1 "$(val OPENRESTO_ACCES_PROTEGE)"
mdp="$(val OPENRESTO_MOT_DE_PASSE)"; adm="$(val ADMIN_PASSWORD)"; jwt="$(val JWT_KEY)"
expect "configuration : mot de passe du site de 32 caractères" 32 "${#mdp}"
expect "configuration : mot de passe administrateur de 32 caractères" 32 "${#adm}"
if [ "${#jwt}" -ge 60 ]; then pass "configuration : clé de connexion longue"; else fail "configuration : clé de connexion trop courte (${#jwt})"; fi
if [ "$jwt" != evil ] && [ "$adm" != evil ]; then pass "configuration : les variables d'une autre application dans le shell sont ignorées"; else fail "configuration : une variable étrangère a été reprise"; fi
expect "configuration : sauvegardes dans deploy/sauvegardes" "$depot/deploy/sauvegardes" "$(val BACKUP_DIR)"
# Les appels « docker compose » qui portent notre fichier de configuration (hors simple contrôle de version).
envs="$(grep -A1 '^docker compose --env-file' "$appels" | grep '^env' || true)"
contient "Docker Compose est bien appelé sans les variables du shell" "JWT_KEY=absent ADMIN_PASSWORD=absent BACKUP_DIR=absent" "$envs"
absent "Docker Compose ne reçoit pas JWT_KEY du shell" "JWT_KEY=evil" "$envs"
absent "Docker Compose ne reçoit pas ADMIN_PASSWORD du shell" "ADMIN_PASSWORD=evil" "$envs"
absent "Docker Compose ne reçoit pas BACKUP_DIR du shell" "BACKUP_DIR=/tmp/evil" "$envs"
if [ "$(ordre ' build')" -lt "$(ordre ' up ')" ]; then pass "la construction précède le démarrage"; else fail "démarrage avant construction"; fi
contient "le mot de passe du site est affiché une fois" "mot de passe : $mdp" "$sortie"
contient "le mot de passe administrateur est affiché une fois" "mot de passe : $adm" "$sortie"
contient "l'adresse à ouvrir est affichée" "http://203.0.113.7:8081" "$sortie"
for verbe in ' rm ' ' stop' ' kill' ' down' 'system prune' 'volume rm' 'network rm' 'apprenti'; do
  expect "aucun appel Docker n'arrête, ne supprime ni ne vise une autre application ($verbe)" 0 "$(nb "$verbe")"
done
if git -C "$depot" check-ignore -q deploy/serveur-partage.env; then pass "le fichier de configuration est ignoré par Git (jamais commité)"; else fail "le fichier de configuration n'est pas ignoré par Git"; fi
if git -C "$depot" check-ignore -q deploy/sauvegardes/daily/x.tar.gz; then pass "les sauvegardes sont ignorées par Git"; else fail "les sauvegardes ne sont pas ignorées par Git"; fi
expect "l'installation ne laisse aucun fichier non ignoré dans le dépôt" "" "$(git -C "$depot" status --porcelain --untracked-files=all)"

echo "== installer : relance"
avant="$(sha256sum "$fichier_env")"
touch "$etat/images"
lancer installer.sh
expect "relance : code 0" 0 "$code"
expect "relance : la configuration n'est pas réécrite" "$avant" "$(sha256sum "$fichier_env")"
absent "relance : les mots de passe ne sont pas réaffichés" "$mdp" "$sortie"
expect "relance : les images existantes ne sont pas reconstruites" 0 "$(nb ' build')"
lancer installer.sh --port 9000
expect "relance avec un port qui contredit le fichier : refusé" 1 "$code"
contient "relance contradictoire : dit ce que dit le fichier" "OPENRESTO_PORT=8081" "$sortie"
expect "relance contradictoire : fichier intact" "$avant" "$(sha256sum "$fichier_env")"

echo "== installer : derrière un nom de domaine"
nouvelle_machine
lancer installer.sh --domaine reservations.exemple.fr
expect "domaine : code 0" 0 "$code"
expect "domaine : mode Production" Production "$(val OPENRESTO_ENVIRONNEMENT)"
expect "domaine : adresse https" "https://reservations.exemple.fr" "$(val OPENRESTO_URL_PUBLIQUE)"
expect "domaine : plus de mot de passe de site" 0 "$(val OPENRESTO_ACCES_PROTEGE)"
expect "domaine : écoute locale seulement" 127.0.0.1 "$(val OPENRESTO_ECOUTE)"
contient "domaine : donne l'exemple pour le Caddy du serveur" "reverse_proxy 127.0.0.1:8081" "$sortie"

echo "== installer : passer d'un essai à un domaine"
nouvelle_machine; lancer installer.sh >/dev/null
lancer installer.sh --passer-au-domaine reservations.exemple.fr --oui
expect "bascule : code 0" 0 "$code"
expect "bascule : mode Production" Production "$(val OPENRESTO_ENVIRONNEMENT)"
expect "bascule : adresse https" "https://reservations.exemple.fr" "$(val OPENRESTO_URL_PUBLIQUE)"
expect "bascule : site ouvert" 0 "$(val OPENRESTO_ACCES_PROTEGE)"
expect "bascule : écoute locale" 127.0.0.1 "$(val OPENRESTO_ECOUTE)"
if [ -f "$fichier_env.avant-domaine" ]; then pass "bascule : l'ancienne configuration est gardée"; else fail "bascule : pas de copie de l'ancienne configuration"; fi
contient "bascule : redémarre OpenResto" " up -d" "$(cat "$appels")"
contient "bascule : donne l'exemple pour le Caddy du serveur" "reverse_proxy 127.0.0.1:8081" "$sortie"
nouvelle_machine; lancer installer.sh --passer-au-domaine reservations.exemple.fr --oui
expect "bascule sans installation : refusée" 1 "$code"

echo "== mettre-a-jour"
# Une nouvelle version existe à l'origine.
pousseur="$work/pousseur"; git clone -q "$work/origine.git" "$pousseur"
echo "v2" > "$pousseur/NOUVEAUTE"
git -C "$pousseur" -c user.name=t -c user.email=t@t add -A
git -C "$pousseur" -c user.name=t -c user.email=t@t commit -q -m "version 2"
git -C "$pousseur" push -q origin main
nouvelle_version="$(git -C "$pousseur" rev-parse HEAD)"
a_jour() { nouvelle_machine; lancer installer.sh >/dev/null; git -C "$depot" reset -q --hard "$initial"; touch "$etat/images" "$etat/demarre"; }

a_jour
lancer mettre-a-jour.sh
expect "mise à jour : code 0" 0 "$code"
expect "mise à jour : le nouveau code est récupéré" "$nouvelle_version" "$(git -C "$depot" rev-parse HEAD)"
o_sauv="$(ordre '^sauvegarder')"; o_build="$(ordre ' build')"; o_up="$(ordre ' up ')"; o_ver="$(ordre '^verifier')"
if [ "$o_sauv" -lt "$o_build" ] && [ "$o_build" -lt "$o_up" ] && [ "$o_up" -lt "$o_ver" ]; then pass "ordre : sauvegarde, construction, démarrage, contrôle"; else fail "ordre inattendu ($o_sauv $o_build $o_up $o_ver)"; fi
contient "nettoyage : seulement les images d'OpenResto" "image prune -f --filter label=com.openresto.serveur=1" "$(cat "$appels")"
expect "nettoyage : jamais un nettoyage général des images du serveur" 0 "$(nb '^docker image prune -f$')"
for verbe in ' rm ' ' stop' ' kill' ' down' 'system prune' 'volume rm' 'network rm' 'apprenti'; do
  expect "aucun appel Docker n'arrête, ne supprime ni ne vise une autre application ($verbe)" 0 "$(nb "$verbe")"
done

a_jour; rm -f "$etat/images"; touch "$etat/build-echoue"
lancer mettre-a-jour.sh
expect "construction cassée : code 1" 1 "$code"
expect "construction cassée : l'ancienne version n'est pas redémarrée" 0 "$(nb ' up ')"
expect "construction cassée : le code revient à la version d'avant" "$initial" "$(git -C "$depot" rev-parse HEAD)"
contient "construction cassée : dit que rien n'a changé" "RIEN N'A CHANGÉ" "$sortie"
contient "construction cassée : montre la cause" "step 7/12 failed" "$sortie"
expect "construction cassée : la sauvegarde avait été faite avant" 1 "$(nb '^sauvegarder')"
expect "construction cassée : pas de nettoyage" 0 "$(nb 'image prune')"

a_jour; touch "$etat/sauvegarder-echoue"
lancer mettre-a-jour.sh
expect "sauvegarde en échec : mise à jour annulée" 1 "$code"
expect "sauvegarde en échec : le code n'a pas bougé" "$initial" "$(git -C "$depot" rev-parse HEAD)"
expect "sauvegarde en échec : rien n'est construit" 0 "$(nb ' build')"

a_jour; echo "bidouille" >> "$depot/deploy/Caddyfile"
lancer mettre-a-jour.sh
expect "code modifié à la main : refusé" 1 "$code"
contient "code modifié à la main : explique" "modifiés à la main" "$sortie"
expect "code modifié à la main : ni sauvegarde ni construction" 0 "$(nb 'build\|^sauvegarder')"
git -C "$depot" checkout -q -- deploy/Caddyfile

a_jour; touch "$etat/verifier-echoue"
lancer mettre-a-jour.sh
expect "nouvelle version malade : code 1" 1 "$code"
contient "nouvelle version malade : indique la sauvegarde et le retour" "restaurer.sh" "$sortie"
expect "nouvelle version malade : pas de nettoyage" 0 "$(nb 'image prune')"

a_jour; rm -f "$etat/demarre"
lancer mettre-a-jour.sh
expect "OpenResto à l'arrêt : la mise à jour passe" 0 "$code"
expect "OpenResto à l'arrêt : pas de sauvegarde" 0 "$(nb '^sauvegarder')"

a_jour
( exec 9>"$depot/deploy/.mise-a-jour.verrou"; flock -n 9; sleep 5 ) & verrou=$!
sleep 1
lancer mettre-a-jour.sh --sans-git
expect "deux mises à jour en même temps : la seconde est refusée" 1 "$code"
contient "verrou : explique" "déjà en cours" "$sortie"
kill "$verrou" 2>/dev/null || true; wait "$verrou" 2>/dev/null || true

echo "== verifier (doublures de docker et de curl)"
base_env() {
  printf '%s\n' "OPENRESTO_PORT=8081" "OPENRESTO_ECOUTE=0.0.0.0" "OPENRESTO_URL_PUBLIQUE=http://203.0.113.7:8081" \
    "OPENRESTO_ACCES_PROTEGE=1" "OPENRESTO_UTILISATEUR=essai" "OPENRESTO_MOT_DE_PASSE=0123456789abcdef0123456789abcdef" \
    "OPENRESTO_ENVIRONNEMENT=Development" "JWT_KEY=cle-de-test-cle-de-test-cle-de-test-cle-de-test" "ADMIN_EMAIL=a@b.fr" "ADMIN_PASSWORD=x" \
    "BACKUP_DIR=$work/sauv" > "$fichier_env"
  chmod 600 "$fichier_env"
}
scenario() {
  rm -rf "${etat:?}"; mkdir -p "$etat"; touch "$etat/images" "$etat/demarre"
  printf '%s' "0.0.0.0:8081->80/tcp" > "$etat/ports-acces"
  base_env
}

scenario; lancer verifier.sh
expect "tout va bien : code 0" 0 "$code"
contient "tout va bien : le dit" "Tout est bon" "$sortie"
contient "tout va bien : le mode essai est signalé" "Mode essai (Development)" "$sortie"
contient "tout va bien : HTTP est signalé" "le mot de passe voyage en clair" "$sortie"
contient "tout va bien : l'absence de sauvegarde est signalée" "Aucune sauvegarde" "$sortie"

scenario; echo 200 > "$etat/curl-sans"; lancer verifier.sh
expect "site sans mot de passe alors qu'il devrait en avoir un : refusé" 1 "$code"
contient "site sans mot de passe : l'écrit" "pourrait être ouvert à tous" "$sortie"

scenario; echo 401 > "$etat/curl-avec"; lancer verifier.sh
expect "le mot de passe du fichier ne marche pas : refusé" 1 "$code"

scenario; printf '%s' "0.0.0.0:8080->8080/tcp" > "$etat/ports-backend"; lancer verifier.sh
expect "le backend publie un port : refusé" 1 "$code"
contient "le backend publie un port : le nomme" "publient un port hors du réseau interne : backend" "$sortie"

scenario; echo "openresto-serveur-backend-1 apprenti-serveur-app-1" > "$etat/contenu-reseau"; lancer verifier.sh
expect "un conteneur d'Apprenti sur nos réseaux : refusé" 1 "$code"
contient "conteneur étranger : le nomme" "apprenti-serveur-app-1" "$sortie"

scenario; sed -i 's/Development/Production/' "$fichier_env"; lancer verifier.sh
expect "Production sur une adresse http:// : refusé" 1 "$code"
contient "Production en http : explique les cookies" "Secure" "$sortie"

scenario; sed -i 's/ACCES_PROTEGE=1/ACCES_PROTEGE=0/' "$fichier_env"; echo 200 > "$etat/curl-sans"; lancer verifier.sh
expect "site ouvert à tous sur une adresse http:// : refusé" 1 "$code"
contient "site ouvert en http : dit de remettre le mot de passe" "remettez 1" "$sortie"

scenario; sed -i 's/ACCES_PROTEGE=1/ACCES_PROTEGE=0/;s#http://203.0.113.7:8081#https://r.exemple.fr#;s/Development/Production/' "$fichier_env"; echo 200 > "$etat/curl-sans"; lancer verifier.sh
expect "site ouvert derrière un domaine https en Production : accepté" 0 "$code"

scenario; rm -f "$etat/demarre"; lancer verifier.sh
expect "services arrêtés : refusé" 1 "$code"
contient "services arrêtés : nomme le service" "ne tourne pas" "$sortie"

scenario; echo 200 > "$etat/curl-jeton"; lancer verifier.sh
expect "un jeton signé avec la clé publique du dépôt est accepté : refusé" 1 "$code"
contient "jeton forgé : l'écrit" "ACCEPTÉ" "$sortie"

scenario; lancer verifier.sh
contient "jeton forgé refusé : le dit" "signé avec la clé publique du dépôt est refusé" "$sortie"

scenario; chmod 644 "$fichier_env"; lancer verifier.sh
contient "configuration lisible par d'autres : signalé" "lisible par d'autres" "$sortie"

echo
echo "réussis : $passed  échoués : $failed"
[ "$failed" -eq 0 ]
