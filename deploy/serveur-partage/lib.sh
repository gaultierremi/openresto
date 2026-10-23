#!/usr/bin/env bash
# Outils communs aux scripts du serveur partagé (installer, verifier, mettre-a-jour, sauvegarder, restaurer).
# À « sourcer », pas à lancer.

# Variables lues par les scripts qui chargent ce fichier.
# shellcheck disable=SC2034
DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RACINE="$(cd "$DEPLOY/.." && pwd)"
# Les scripts de sauvegarde (backup/) lisent ces deux variables : ils travaillent ainsi sur la pile
# du serveur partagé et pas sur celle d'un serveur dédié.
export ENV_FILE="${ENV_FILE:-$DEPLOY/serveur-partage.env}"
export COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY/docker-compose.serveur-partage.yml}"
# shellcheck source=../backup/lib.sh
. "$DEPLOY/backup/lib.sh"

# shellcheck disable=SC2034
readonly PROJET="openresto-serveur"
# shellcheck disable=SC2034
readonly SERVICES=(acces reverse-proxy backend frontend)

erreur() { echo "[ERREUR] $*" >&2; }
attention() { echo "[ATTENTION] $*"; }
ok() { echo "[OK] $*"; }

# Les variables d'OpenResto ne se lisent QUE dans deploy/serveur-partage.env. Sur un serveur partagé,
# le shell de quelqu'un peut déjà porter un JWT_KEY, un ADMIN_PASSWORD ou un BACKUP_DIR d'une autre
# application, et Docker Compose donne la priorité à l'environnement sur le fichier : on les retire.
# shellcheck disable=SC2034
readonly VARIABLES_PROPRES=(
  OPENRESTO_PORT OPENRESTO_ECOUTE OPENRESTO_URL_PUBLIQUE OPENRESTO_ACCES_PROTEGE OPENRESTO_UTILISATEUR
  OPENRESTO_MOT_DE_PASSE OPENRESTO_ENVIRONNEMENT OPENRESTO_LANGUE OPENRESTO_PUBLIC_LAUNCH JWT_KEY ADMIN_EMAIL ADMIN_PASSWORD
  SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD SMTP_FROM_EMAIL SMTP_FROM_NAME SMTP_ENABLE_SSL
  SMTP_SEND_CONFIRMATIONS BACKUP_DIR BACKUP_KEEP_DAILY BACKUP_KEEP_WEEKLY BACKUP_REMOTE
  BACKUP_REMOTE_RETENTION_DAYS BACKUP_PING_URL
)

hors_environnement() {
  local retirer=() variable
  for variable in "${VARIABLES_PROPRES[@]}"; do retirer+=(-u "$variable"); done
  env "${retirer[@]}" "$@"
}

lire_env() {
  local valeur
  valeur="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r')" || true
  valeur="${valeur%\"}"; valeur="${valeur#\"}"
  printf '%s' "${valeur:-${2:-}}"
}

compose() {
  hors_environnement docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ${COMPOSE_OVERRIDE:+-f "$COMPOSE_OVERRIDE"} "$@"
}

# Docker répond et le fichier de configuration existe, sinon dit quoi faire.
verifier_prerequis() {
  if ! command -v docker >/dev/null 2>&1; then
    erreur "Docker n'est pas installé sur ce serveur."
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    erreur "Docker ne répond pas. Si le message parle de « permission denied », relancez avec sudo ou ajoutez votre utilisateur au groupe docker."
    return 1
  fi
  if [ ! -f "$ENV_FILE" ]; then
    erreur "deploy/serveur-partage.env est introuvable : lancez d'abord ./deploy/installer.sh"
    return 1
  fi
}

# Adresse d'origine de ce serveur, telle que le réseau la voit (aucun paquet n'est envoyé).
adresse_ip_du_serveur() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "$ip"
}

# Conteneurs qui ne sont pas les nôtres : on les montre, on n'y touche jamais.
autres_conteneurs() {
  docker ps --format '{{.Names}} ({{.Ports}})' 2>/dev/null | grep -v "^${PROJET}-" || true
}

# Les trois images d'OpenResto (surchargeables : la CI et les tests utilisent des images déjà construites).
images_openresto() {
  printf '%s\n' \
    "${OPENRESTO_IMAGE_BACKEND:-localhost/openresto-serveur-backend:local}" \
    "${OPENRESTO_IMAGE_FRONTEND:-localhost/openresto-serveur-frontend:local}" \
    "${OPENRESTO_IMAGE_NGINX:-localhost/openresto-serveur-nginx:local}"
}

images_presentes() {
  local image
  while read -r image; do
    docker image inspect "$image" >/dev/null 2>&1 || return 1
  done < <(images_openresto)
}

# Construit les images, en disant que ça avance (une construction dure 5 à 15 minutes sans rien afficher).
# Le détail est mis de côté et n'est montré qu'en cas d'échec.
construire_images() {
  local journal pid minutes=0
  journal="$(mktemp "${TMPDIR:-/tmp}/openresto-construction.XXXXXX")"
  compose --progress=plain build >"$journal" 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    sleep "${PAUSE_CONSTRUCTION:-30}"
    minutes=$((minutes + 1))
    if kill -0 "$pid" 2>/dev/null && [ $((minutes % 2)) -eq 0 ]; then
      echo "    ... la construction continue ($((minutes / 2)) min)"
    fi
  done
  if ! wait "$pid"; then
    erreur "La construction des images a échoué. Dernières lignes :"
    tail -n 25 "$journal" | sed 's/^/    | /' >&2
    echo "    Journal complet : $journal" >&2
    return 1
  fi
  rm -f "$journal"
}
