#!/usr/bin/env bash
# Installe OpenResto sur un serveur qui héberge déjà d'autres applications (Apprenti, par exemple), sans les toucher.
# Usage : ./deploy/installer.sh                      (essai : adresse IP, port 8081, mot de passe obligatoire)
#         ./deploy/installer.sh --verifier-seulement (contrôle la machine, n'écrit et ne démarre rien)
#         ./deploy/installer.sh --passer-au-domaine reservations.exemple.fr
#
# Tous les contrôles passent d'abord ; tant qu'un seul échoue, RIEN n'est écrit ni démarré. Ensuite : fichier de
# configuration avec des mots de passe fabriqués au hasard, construction des images, démarrage, contrôle de santé.
# Relançable sans risque : une configuration existante n'est jamais réécrite.
# Codes de sortie : 0 tout va bien, 1 refusé ou échoué avant le démarrage, 2 démarré mais pas en bonne santé.
set -Eeuo pipefail
# shellcheck source=serveur-partage/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/serveur-partage/lib.sh"

# Surchargeable pour que les tests tournent sans toucher à la machine.
meminfo="${MEMINFO_FILE:-/proc/meminfo}"
verificateur="${INSTALLER_VERIFIER:-$DEPLOY/verifier.sh}"

readonly PORT_PAR_DEFAUT=8081
# La construction du site web demande environ 3 Go de mémoire ; le reste du serveur en a besoin aussi.
readonly MEMOIRE_MIN_MO=3000
readonly MEMOIRE_CONSEILLEE_MO=4000
readonly DISQUE_MIN_MO=6144
readonly SORTIE_NON_SAIN=2

aide() {
  cat <<'AIDE'
Usage : ./deploy/installer.sh [options]

  --port <n>                 port d'entrée sur le serveur (défaut 8081 ; Apprenti garde le 8080)
  --ip <adresse>             adresse IP à afficher et à autoriser (défaut : celle du serveur)
  --utilisateur <nom>        identifiant du mot de passe du site (défaut « essai »)
  --email-admin <adresse>    compte administrateur d'OpenResto (défaut admin@openresto.local)
  --domaine <nom>            site déjà derrière un nom de domaine en HTTPS (le Caddy du serveur le sert) :
                             mode Production, sans mot de passe de site, écoute locale seulement
  --ecoute <adresse>         adresse d'écoute du port (défaut 0.0.0.0 ; 127.0.0.1 avec --domaine)
  --sans-construction        utilise des images déjà construites (CI, tests)
  --verifier-seulement       contrôle la machine, n'écrit rien, ne démarre rien
  --passer-au-domaine <nom>  bascule une installation d'essai vers un nom de domaine en HTTPS
  --oui                      ne pose aucune question
AIDE
}

port=""; ip=""; utilisateur=""; email_admin=""; domaine=""; ecoute=""
sans_construction=0; verifier_seulement=0; passer_domaine=""; oui=0

prendre() { [ -n "${2:-}" ] || { erreur "$1 demande une valeur."; exit 1; }; }
lire_arguments() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --port) prendre "$@"; port="$2"; shift 2 ;;
      --ip) prendre "$@"; ip="$2"; shift 2 ;;
      --utilisateur) prendre "$@"; utilisateur="$2"; shift 2 ;;
      --email-admin) prendre "$@"; email_admin="$2"; shift 2 ;;
      --domaine) prendre "$@"; domaine="$2"; shift 2 ;;
      --ecoute) prendre "$@"; ecoute="$2"; shift 2 ;;
      --passer-au-domaine) prendre "$@"; passer_domaine="$2"; shift 2 ;;
      --sans-construction) sans_construction=1; shift ;;
      --verifier-seulement) verifier_seulement=1; shift ;;
      --oui) oui=1; shift ;;
      -h | --help) aide; exit 0 ;;
      *) aide >&2; erreur "Option inconnue : $1"; exit 1 ;;
    esac
  done
}

port_valide() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1024 ] && [ "$1" -le 65535 ]; }
ip_valide() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] && ! [[ "$1" =~ (^|\.)(25[6-9]|2[6-9][0-9]|[3-9][0-9]{2})(\.|$) ]]; }
domaine_valide() { [[ "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; }
utilisateur_valide() { [[ "$1" =~ ^[a-z0-9_-]{3,32}$ ]]; }
email_valide() { [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; }

valider_arguments() {
  [ -z "$port" ] || port_valide "$port" || { erreur "--port doit être un nombre entre 1024 et 65535 (les ports 80 et 443 sont ceux du Caddy du serveur)."; exit 1; }
  [ -z "$ip" ] || ip_valide "$ip" || { erreur "--ip « $ip » n'est pas une adresse IPv4 valide."; exit 1; }
  [ -z "$ecoute" ] || ip_valide "$ecoute" || { erreur "--ecoute « $ecoute » n'est pas une adresse IPv4 valide."; exit 1; }
  [ -z "$utilisateur" ] || utilisateur_valide "$utilisateur" || { erreur "--utilisateur : 3 à 32 caractères, minuscules, chiffres, tiret ou souligné."; exit 1; }
  [ -z "$email_admin" ] || email_valide "$email_admin" || { erreur "--email-admin « $email_admin » n'est pas une adresse e-mail valide."; exit 1; }
  local nom
  for nom in "$domaine" "$passer_domaine"; do
    [ -z "$nom" ] || domaine_valide "$nom" || { erreur "« $nom » n'est pas un nom de domaine valide (en minuscules, par exemple reservations.exemple.fr)."; exit 1; }
  done
  if [ -n "$domaine" ] && [ -n "$passer_domaine" ]; then erreur "--domaine et --passer-au-domaine s'excluent."; exit 1; fi
}

# --- Fichier de configuration -------------------------------------------------------------------------
definir() { # CLE VALEUR : remplace la ligne CLE= du fichier, sans jamais exécuter son contenu
  local temporaire
  temporaire="$(mktemp "$ENV_FILE.XXXXXX")"
  awk -v cle="$1" -v valeur="$2" 'BEGIN { FS = OFS = "=" } $1 == cle && !fait { print cle "=" valeur; fait = 1; next } { print }' "$ENV_FILE" >"$temporaire"
  mv "$temporaire" "$ENV_FILE"
}

secret() { openssl rand -hex "$1"; }

ecrire_configuration() {
  umask 077
  cp "$DEPLOY/serveur-partage.env.exemple" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  definir OPENRESTO_PORT "$port"
  definir OPENRESTO_ECOUTE "$ecoute"
  definir OPENRESTO_UTILISATEUR "$utilisateur"
  definir ADMIN_EMAIL "$email_admin"
  definir JWT_KEY "$(openssl rand -base64 48 | tr -d '\n')"
  definir ADMIN_PASSWORD "$(secret 16)"
  definir BACKUP_DIR "$DEPLOY/sauvegardes"
  if [ -n "$domaine" ]; then
    definir OPENRESTO_URL_PUBLIQUE "https://$domaine"
    definir OPENRESTO_ENVIRONNEMENT Production
    definir OPENRESTO_ACCES_PROTEGE 0
    definir OPENRESTO_MOT_DE_PASSE "$(secret 16)"
  else
    definir OPENRESTO_URL_PUBLIQUE "http://$ip:$port"
    definir OPENRESTO_ENVIRONNEMENT Development
    definir OPENRESTO_ACCES_PROTEGE 1
    definir OPENRESTO_MOT_DE_PASSE "$(secret 16)"
  fi
}

# --- Contrôles ----------------------------------------------------------------------------------------
problemes=0
c_ok() { ok "$@"; }
c_attention() { attention "$@"; }
c_erreur() { echo "[ERREUR] $*"; problemes=$((problemes + 1)); }

memoire_disponible_mo() {
  awk '/^MemAvailable:/ { m = $2 } /^SwapFree:/ { s = $2 } END { print int((m + s) / 1024) }' "$meminfo"
}

controler_outils() {
  local outil paquet manquants=""
  for outil in openssl curl awk grep; do
    command -v "$outil" >/dev/null 2>&1 || manquants="$manquants $outil"
  done
  if [ -z "$manquants" ]; then
    c_ok "Les outils nécessaires sont là (openssl, curl, awk, grep)."
  else
    paquet="${manquants# }"
    c_erreur "Outil(s) manquant(s) :$manquants. Installez-les : sudo apt-get install -y $paquet"
  fi
}

controler_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    c_erreur "Docker n'est pas installé sur ce serveur."
    return
  fi
  if ! docker info >/dev/null 2>&1; then
    c_erreur "Docker ne répond pas. Si le message parle de « permission denied », relancez avec sudo ou ajoutez votre utilisateur au groupe docker."
    return
  fi
  if ! docker compose version >/dev/null 2>&1; then
    c_erreur "Le module « docker compose » (version 2) manque : sudo apt-get install -y docker-compose-plugin"
    return
  fi
  c_ok "Docker répond, avec « docker compose »."
}

controler_ressources() {
  local memoire disque racine
  if [ "$sans_construction" = 1 ] || images_presentes; then
    c_ok "Les images d'OpenResto sont déjà construites : pas de construction, donc pas besoin de beaucoup de mémoire."
  else
    memoire="$(memoire_disponible_mo)"
    if [ "$memoire" -lt "$MEMOIRE_MIN_MO" ]; then
      c_erreur "Mémoire libre (RAM + swap) : ${memoire} Mo. La construction du site web en demande environ 3000 Mo : elle serait tuée en cours de route. Libérez de la mémoire ou ajoutez du swap."
    elif [ "$memoire" -lt "$MEMOIRE_CONSEILLEE_MO" ]; then
      c_attention "Mémoire libre (RAM + swap) : ${memoire} Mo. Suffisant à la limite : la construction peut ralentir les autres applications pendant 10 minutes."
    else
      c_ok "Mémoire libre (RAM + swap) : ${memoire} Mo."
    fi
  fi
  racine="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
  disque="$(df -Pm "$racine" 2>/dev/null | awk 'NR == 2 { print $4 }')"
  if [ -z "$disque" ]; then
    c_attention "Espace disque de Docker non lisible : vérifiez qu'il reste au moins 6 Go."
  elif [ "$disque" -lt "$DISQUE_MIN_MO" ]; then
    c_erreur "Espace disque libre pour Docker : ${disque} Mo. Il en faut au moins ${DISQUE_MIN_MO} Mo (images et construction)."
  else
    c_ok "Espace disque libre pour Docker : ${disque} Mo."
  fi
}

port_occupe() {
  command -v ss >/dev/null 2>&1 || return 2
  [ -n "$(ss -H -ltn "sport = :$1" 2>/dev/null)" ]
}

controler_port() {
  local candidat suggestion="" statut
  if [ -f "$ENV_FILE" ] && [ -n "$(compose ps -q acces 2>/dev/null)" ]; then
    c_ok "Le port $port est celui d'OpenResto, déjà démarré."
    return
  fi
  statut=0
  port_occupe "$port" || statut=$?
  case $statut in
    0)
      for candidat in $(seq $((port + 1)) $((port + 20))); do
        if ! port_occupe "$candidat"; then suggestion="$candidat"; break; fi
      done
      c_erreur "Le port $port est déjà utilisé par autre chose sur ce serveur.${suggestion:+ Essayez : ./deploy/installer.sh --port $suggestion}"
      ;;
    1) c_ok "Le port $port est libre." ;;
    *) c_attention "Impossible de vérifier que le port $port est libre (la commande « ss » manque)." ;;
  esac
}

controler_noms() {
  local reste
  [ -f "$ENV_FILE" ] && return
  reste="$( { docker ps -a --format '{{.Names}}' | grep -E "^${PROJET}-" || true
    docker volume ls -q | grep -E "^${PROJET}_" || true
    docker network ls --format '{{.Name}}' | grep -E "^${PROJET}_" || true; } 2>/dev/null)"
  if [ -n "$reste" ]; then
    c_erreur "Des restes d'une installation précédente d'OpenResto existent déjà (conteneurs, volumes ou réseaux « $PROJET »). Ce n'est pas une installation neuve : ne les supprimez pas à la main, demandez de l'aide, car ils peuvent contenir des données."
  else
    c_ok "Aucun nom de conteneur, de volume ou de réseau d'OpenResto n'est déjà pris."
  fi
}

controler_pare_feu() {
  command -v ufw >/dev/null 2>&1 || return 0
  local etat
  etat="$(ufw status 2>/dev/null || true)"
  case "$etat" in
    *"Status: active"*)
      if grep -Eq "(^|[[:space:]])$port(/tcp)?[[:space:]].*ALLOW" <<<"$etat"; then
        c_ok "Le pare-feu (ufw) laisse déjà passer le port $port."
      elif [ -z "$domaine" ]; then
        c_attention "Le pare-feu (ufw) est actif : pour ouvrir le site depuis l'extérieur, la personne qui administre le serveur doit lancer : sudo ufw allow $port/tcp"
      fi
      ;;
  esac
}

montrer_les_autres() {
  local autres
  autres="$(autres_conteneurs)"
  if [ -n "$autres" ]; then
    echo "[INFO]  Applications déjà présentes sur ce serveur (OpenResto n'y touche pas) :"
    printf '%s\n' "$autres" | sed 's/^/          /'
  fi
}

# --- Basculer vers un nom de domaine ------------------------------------------------------------------------
passer_au_domaine() {
  [ -f "$ENV_FILE" ] || { erreur "Rien n'est installé : lancez d'abord ./deploy/installer.sh"; exit 1; }
  verifier_prerequis || exit 1
  local nom="$passer_domaine" port_actuel ecoute_nouvelle
  port_actuel="$(lire_env OPENRESTO_PORT "$PORT_PAR_DEFAUT")"
  ecoute_nouvelle="${ecoute:-127.0.0.1}"
  echo "Passage à https://$nom :"
  echo "  - mode Production (les connexions exigent HTTPS) ;"
  echo "  - le mot de passe du site est retiré : le site devient PUBLIC (l'administration garde son propre mot de passe) ;"
  echo "  - le port $port_actuel n'écoute plus que sur $ecoute_nouvelle ;"
  echo "  - ce n'est PAS le Caddy d'OpenResto qui fait le HTTPS : celui du serveur doit servir $nom (exemple ci-dessous)."
  if [ "$oui" != 1 ]; then
    printf 'Tapez « oui » pour continuer : '
    read -r reponse
    [ "$reponse" = oui ] || { echo "Annulé. Rien n'a été changé."; exit 1; }
  fi
  cp -p "$ENV_FILE" "$ENV_FILE.avant-domaine"
  definir OPENRESTO_URL_PUBLIQUE "https://$nom"
  definir OPENRESTO_ENVIRONNEMENT Production
  definir OPENRESTO_ACCES_PROTEGE 0
  definir OPENRESTO_ECOUTE "$ecoute_nouvelle"
  echo "Redémarrage d'OpenResto..."
  compose up -d
  afficher_exemple_caddy "$nom" "$port_actuel" "$ecoute_nouvelle"
  "$verificateur" || exit "$SORTIE_NON_SAIN"
}

afficher_exemple_caddy() { # nom port ecoute
  local cible="$3"
  [ "$cible" = 0.0.0.0 ] && cible=127.0.0.1
  cat <<CADDY

À ajouter dans le Caddyfile du serveur (par la personne qui l'administre), puis « sudo systemctl reload caddy » :

    $1 {
        reverse_proxy $cible:$2
    }

(Si le Caddy du serveur tourne lui-même dans Docker, 127.0.0.1 n'est pas l'hôte : voir docs/SERVEUR-PARTAGE.md, « Quand il y aura un nom de domaine ».)
CADDY
}

# --- Déroulement --------------------------------------------------------------------------------------------
lire_arguments "$@"
valider_arguments

if [ -n "$passer_domaine" ]; then passer_au_domaine; exit 0; fi

config_existait=0
[ -f "$ENV_FILE" ] && config_existait=1

if [ "$config_existait" = 1 ]; then
  # Le fichier fait foi : une option qui le contredit est refusée plutôt qu'ignorée en silence.
  accord() { [ -z "$2" ] || [ "$2" = "$(lire_env "$3")" ] || { erreur "$1 $2 contredit $3=$(lire_env "$3") dans deploy/serveur-partage.env. Modifiez le fichier si c'est voulu (pour un nom de domaine : --passer-au-domaine)."; exit 1; }; }
  accord --port "$port" OPENRESTO_PORT
  accord --utilisateur "$utilisateur" OPENRESTO_UTILISATEUR
  accord --email-admin "$email_admin" ADMIN_EMAIL
  accord --ecoute "$ecoute" OPENRESTO_ECOUTE
  [ -z "$domaine" ] || { erreur "--domaine ne s'applique qu'à une première installation : utilisez --passer-au-domaine."; exit 1; }
  port="$(lire_env OPENRESTO_PORT "$PORT_PAR_DEFAUT")"
  ecoute="$(lire_env OPENRESTO_ECOUTE 0.0.0.0)"
else
  port="${port:-$PORT_PAR_DEFAUT}"
  utilisateur="${utilisateur:-essai}"
  email_admin="${email_admin:-admin@openresto.local}"
  if [ -n "$domaine" ]; then ecoute="${ecoute:-127.0.0.1}"; else ecoute="${ecoute:-0.0.0.0}"; fi
  if [ -z "$domaine" ] && [ -z "$ip" ]; then ip="$(adresse_ip_du_serveur)"; fi
fi

echo "OpenResto — installation sur un serveur partagé"
echo
echo "Contrôles avant d'écrire quoi que ce soit :"
controler_outils
controler_docker
if [ "$problemes" -eq 0 ]; then
  controler_ressources
  controler_port
  controler_noms
  controler_pare_feu
  montrer_les_autres
fi
if [ "$config_existait" = 0 ] && [ -z "$domaine" ] && [ -z "$ip" ]; then
  c_erreur "L'adresse IP de ce serveur n'a pas pu être trouvée. Donnez-la avec : ./deploy/installer.sh --ip ADRESSE"
fi

if [ "$problemes" -gt 0 ]; then
  echo
  echo "$problemes problème(s) : rien n'a été installé, rien n'a été démarré, les autres applications du serveur n'ont pas été touchées."
  exit 1
fi
if [ "$verifier_seulement" = 1 ]; then
  echo
  echo "Tout est en ordre : l'installation peut se faire. (Mode « vérifier seulement » : rien n'a été écrit.)"
  exit 0
fi

echo
generee=0
if [ "$config_existait" = 0 ]; then
  echo "1/4 Création du fichier de configuration (deploy/serveur-partage.env, lisible par vous seul)..."
  ecrire_configuration
  generee=1
else
  echo "1/4 Le fichier de configuration existe déjà : il est conservé tel quel."
fi

if images_presentes; then
  echo "2/4 Les images d'OpenResto sont déjà construites."
elif [ "$sans_construction" = 1 ]; then
  erreur "--sans-construction, mais les images n'existent pas : $(images_openresto | tr '\n' ' ')"
  exit 1
else
  echo "2/4 Construction des images (5 à 15 minutes la première fois ; Apprenti continue de tourner)..."
  if ! construire_images; then
    echo "Rien n'a été démarré. Le fichier de configuration est conservé : relancez ./deploy/installer.sh une fois le problème réglé." >&2
    exit 1
  fi
fi

echo "3/4 Démarrage..."
if ! compose up -d; then
  erreur "Le démarrage a échoué. Voir : docker compose -f deploy/docker-compose.serveur-partage.yml --env-file deploy/serveur-partage.env logs"
  exit "$SORTIE_NON_SAIN"
fi

echo "4/4 Contrôle de santé..."
echo
"$verificateur" || exit "$SORTIE_NON_SAIN"

echo
echo "OpenResto est installé. Ouvrez : $(lire_env OPENRESTO_URL_PUBLIQUE)"
if [ "$generee" = 1 ]; then
  echo
  echo "À NOTER MAINTENANT (ces mots de passe ne seront plus affichés ; ils sont dans deploy/serveur-partage.env) :"
  if [ "$(lire_env OPENRESTO_ACCES_PROTEGE)" = 1 ]; then
    echo "  Porte d'entrée du site     identifiant : $(lire_env OPENRESTO_UTILISATEUR)    mot de passe : $(lire_env OPENRESTO_MOT_DE_PASSE)"
  fi
  echo "  Administration d'OpenResto ($(lire_env OPENRESTO_URL_PUBLIQUE)/admin)    e-mail : $(lire_env ADMIN_EMAIL)    mot de passe : $(lire_env ADMIN_PASSWORD)"
  echo "  Changez le mot de passe de l'administration à la première connexion."
fi
if [ -n "$domaine" ]; then afficher_exemple_caddy "$domaine" "$port" "$ecoute"; fi
echo
echo "Pas encore fait : une sauvegarde automatique chaque nuit (docs/SERVEUR-PARTAGE.md, « Sauvegarder »)."
