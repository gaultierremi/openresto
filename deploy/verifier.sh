#!/usr/bin/env bash
# Contrôle de santé d'OpenResto sur le serveur partagé : les services tournent, le site répond, le mot de passe
# protège, rien d'autre que le port d'entrée n'est ouvert, et rien n'est partagé avec les autres applications.
# Usage : ./deploy/verifier.sh
# Code de sortie 0 = tout est bon (des [ATTENTION] peuvent rester) ; 1 = au moins une [ERREUR].
set -uo pipefail
# shellcheck source=serveur-partage/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/serveur-partage/lib.sh"
verifier_prerequis || exit 1

# Clé de signature d'appsettings.Development.json, publique puisque versionnée.
readonly CLE_JWT_PUBLIQUE='openresto-dev-only-jwt-key-do-not-use-in-production-abc123!!'

echecs=0
echec() { echo "[ERREUR] $*"; echecs=$((echecs + 1)); }
# attendre_200 CODE « message si 200 » « message sinon »
attendre_200() {
  if [ "$1" = 200 ]; then ok "$2"; else echec "$3 (code ${1:-aucune réponse})."; fi
}
cmd_journaux() { echo "           Voir : docker compose -f deploy/docker-compose.serveur-partage.yml --env-file deploy/serveur-partage.env logs --tail 50 $1"; }

port="$(lire_env OPENRESTO_PORT 8081)"
protege="$(lire_env OPENRESTO_ACCES_PROTEGE 1)"
utilisateur="$(lire_env OPENRESTO_UTILISATEUR)"
motdepasse="$(lire_env OPENRESTO_MOT_DE_PASSE)"
mode="$(lire_env OPENRESTO_ENVIRONNEMENT)"
url_publique="$(lire_env OPENRESTO_URL_PUBLIQUE)"
ecoute="$(lire_env OPENRESTO_ECOUTE 0.0.0.0)"

# --- 1. Les quatre services tournent et se disent en bonne santé ---
for service in "${SERVICES[@]}"; do
  conteneur="$(compose ps --status running -q "$service" 2>/dev/null)"
  if [ -z "$conteneur" ]; then
    echec "Le service « $service » ne tourne pas."
    cmd_journaux "$service"
    continue
  fi
  etat=""
  # Juste après un démarrage, les contrôles internes de Docker peuvent encore dire « starting » : on attend.
  for _ in $(seq 1 60); do
    etat="$(docker inspect --format '{{.State.Health.Status}}' "$conteneur" 2>/dev/null || true)"
    [ "$etat" != "starting" ] && break
    sleep 2
  done
  if [ "$etat" = "healthy" ]; then
    ok "Le service « $service » tourne et se dit en bonne santé."
  else
    echec "Le service « $service » tourne mais son contrôle de santé dit « ${etat:-inconnu} »."
    cmd_journaux "$service"
  fi
done

# --- 2. L'application répond, vue de l'intérieur (sans passer par le mot de passe) ---
sante="$(compose exec -T backend curl -fsS -m 10 http://127.0.0.1:8080/api/health 2>/dev/null | tr -d '\r' || true)"
case "$sante" in
  *'"ok"'*) ok "L'application répond (/api/health)." ;;
  *) echec "L'application ne répond pas à /api/health."; cmd_journaux backend ;;
esac

# --- 3. Seul le service « acces » est ouvert vers l'extérieur ---
exposes=""
for service in backend frontend reverse-proxy; do
  if compose ps --format '{{.Ports}}' "$service" 2>/dev/null | grep -q -- '->'; then exposes="$exposes $service"; fi
done
if [ -z "$exposes" ]; then
  ok "Seul le service d'entrée (« acces ») publie un port : l'application et ses fichiers ne sont pas joignables directement."
else
  echec "Des services publient un port hors du réseau interne :$exposes. Seul « acces » doit le faire : retirez tout « ports » de ces services."
fi
publie="$(compose ps --format '{{.Ports}}' acces 2>/dev/null | tr -d '\r' || true)"
case "$publie" in
  *":$port->80/tcp"*) ok "Le site est publié sur le port $port (écoute : $ecoute)." ;;
  *) echec "Le port $port n'est pas publié par « acces » (ports vus : ${publie:-aucun})." ;;
esac

# --- 4. Le site vu de l'extérieur : mot de passe, accueil ---
if command -v curl >/dev/null 2>&1; then
  base="http://127.0.0.1:$port"
  sans="$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "$base/api/health" 2>/dev/null || true)"
  if [ "$protege" = 1 ]; then
    if [ "$sans" = 401 ]; then
      ok "Sans mot de passe, le site refuse l'accès (401) : il n'est pas public."
    else
      echec "Sans mot de passe, le site répond ${sans:-rien} au lieu de 401 : il pourrait être ouvert à tous."
    fi
    avec="$(printf 'user = "%s:%s"\n' "$utilisateur" "$motdepasse" | curl -sS -o /dev/null -m 15 -w '%{http_code}' --config - "$base/api/health" 2>/dev/null || true)"
    if [ "$avec" = 200 ]; then
      ok "Avec l'identifiant et le mot de passe du fichier de configuration, le site s'ouvre."
    else
      echec "Avec l'identifiant et le mot de passe du fichier de configuration, le site répond ${avec:-rien}."
    fi
    accueil="$(printf 'user = "%s:%s"\n' "$utilisateur" "$motdepasse" | curl -sS -o /dev/null -m 15 -w '%{http_code}' --config - "$base/" 2>/dev/null || true)"
    attendre_200 "$accueil" "La page d'accueil s'affiche." "La page d'accueil ne s'affiche pas"
  else
    attendre_200 "$sans" "Le site répond sans mot de passe (accès ouvert, comme demandé)." "Le site ne répond pas à /api/health"
    accueil="$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "$base/" 2>/dev/null || true)"
    attendre_200 "$accueil" "La page d'accueil s'affiche." "La page d'accueil ne s'affiche pas"
    case "$url_publique" in
      http://*) echec "Le site est ouvert à tous (OPENRESTO_ACCES_PROTEGE=0) sur une adresse http:// : remettez 1 tant qu'il n'y a pas de nom de domaine en HTTPS." ;;
    esac
  fi
else
  attention "curl n'est pas installé : les contrôles d'accès par mot de passe sont sautés (sudo apt-get install -y curl)."
fi

# --- 5. Mode et adresse doivent aller ensemble ---
case "$mode:$url_publique" in
  Production:http://*) echec "Mode Production avec une adresse http:// : les cookies de connexion sont « Secure », la connexion à l'administration ne fonctionnera pas. Passez à un nom de domaine en HTTPS ou revenez en Development." ;;
  Development:https://*) attention "Mode Development avec une adresse https:// : passez OPENRESTO_ENVIRONNEMENT=Production (messages d'erreur détaillés et /openapi ouverts sinon)." ;;
  Development:*) attention "Mode essai (Development) : messages d'erreur détaillés et page /openapi accessibles derrière le mot de passe. Données FICTIVES seulement." ;;
esac
case "$url_publique" in
  http://*) [ "$protege" = 1 ] && attention "Adresse en HTTP : le mot de passe voyage en clair. Acceptable pour un essai de quelques heures avec des données fictives, pas au-delà." ;;
esac

# --- 6. Réglages de sécurité ---
droits="$(stat -c %a "$ENV_FILE" 2>/dev/null || true)"
if [ "$droits" = 600 ]; then ok "Le fichier de configuration n'est lisible que par vous."; else attention "Le fichier deploy/serveur-partage.env est lisible par d'autres (droits $droits) : chmod 600 deploy/serveur-partage.env"; fi
if [ "$protege" = 1 ]; then
  [ "${#motdepasse}" -ge 16 ] || attention "Le mot de passe du site fait moins de 16 caractères."
  [ "$motdepasse" != "$utilisateur" ] || attention "Le mot de passe du site est identique à l'identifiant."
fi
jwt="$(lire_env JWT_KEY)"
[ "${#jwt}" -ge 32 ] || attention "JWT_KEY fait moins de 32 caractères : la clé qui signe les connexions est trop courte."

# --- 6 bis. Aucun jeton d'administrateur signé avec une clé publique ne doit être accepté ---
# appsettings.Development.json (dans le dépôt, donc public) porte une clé de signature : si l'application la prend au
# lieu de JWT_KEY, n'importe qui fabrique un jeton d'administrateur valide. On en fabrique un et on le présente.
jeton_forge() {
  local cle="$1" entete charge signature
  b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  entete="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
  charge="$(printf '{"sub":"1","email":"admin@openresto.com","role":"Owner","session_version":0,"exp":%d,"iss":"openresto-api","aud":"openresto-admin"}' "$(($(date +%s) + 3600))" | b64url)"
  signature="$(printf '%s.%s' "$entete" "$charge" | openssl dgst -sha256 -hmac "$cle" -binary | b64url)"
  printf '%s.%s.%s' "$entete" "$charge" "$signature"
}
if command -v curl >/dev/null 2>&1 && command -v openssl >/dev/null 2>&1; then
  if [ "$protege" = 1 ]; then
    reponse="$(printf 'user = "%s:%s"\n' "$utilisateur" "$motdepasse" | curl -sS -o /dev/null -m 15 -w '%{http_code}' --config - \
      -H "Cookie: openresto_auth=$(jeton_forge "$CLE_JWT_PUBLIQUE")" "http://127.0.0.1:$port/api/admin/auth/me" 2>/dev/null || true)"
  else
    reponse="$(curl -sS -o /dev/null -m 15 -w '%{http_code}' \
      -H "Cookie: openresto_auth=$(jeton_forge "$CLE_JWT_PUBLIQUE")" "http://127.0.0.1:$port/api/admin/auth/me" 2>/dev/null || true)"
  fi
  if [ "$reponse" = 401 ]; then
    ok "Un jeton d'administrateur signé avec la clé publique du dépôt est refusé."
  else
    echec "Un jeton d'administrateur signé avec la clé publique du dépôt est ACCEPTÉ (code ${reponse:-aucune réponse}) : n'importe qui peut se faire passer pour l'administrateur. Arrêtez le site (docker compose ... stop) et prévenez la personne qui développe OpenResto."
  fi
fi

# --- 7. Cohabitation : rien de partagé avec les autres applications ---
etrangers=""
for reseau in "${PROJET}_interne" "${PROJET}_acces"; do
  for nom in $(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$reseau" 2>/dev/null); do
    case "$nom" in "${PROJET}-"*) ;; *) etrangers="$etrangers $nom" ;; esac
  done
done
if [ -z "$etrangers" ]; then
  ok "Les réseaux d'OpenResto ne contiennent que des conteneurs d'OpenResto."
else
  echec "Des conteneurs d'autres applications sont branchés sur les réseaux d'OpenResto :$etrangers"
fi
autres="$(autres_conteneurs)"
if [ -n "$autres" ]; then
  echo "[INFO]  Autres applications présentes sur ce serveur (OpenResto n'y touche pas) :"
  printf '%s\n' "$autres" | sed 's/^/          /'
fi

# --- 8. Sauvegarde ---
dossier="$(lire_env BACKUP_DIR "$DEPLOY/sauvegardes")"
derniere="$(find "$dossier/daily" -name 'openresto-*.tar.gz' 2>/dev/null | sort | tail -n 1)"
if [ -n "$derniere" ]; then
  ok "Dernière sauvegarde : $(basename "$derniere")."
else
  attention "Aucune sauvegarde pour l'instant. Faites-en une : ./deploy/sauvegarder.sh"
fi

echo
if [ "$echecs" -eq 0 ]; then
  echo "Tout est bon. Adresse : $url_publique"
else
  echo "$echecs problème(s) à corriger (lignes [ERREUR] ci-dessus). Dépannage : docs/SERVEUR-PARTAGE.md"
  exit 1
fi
