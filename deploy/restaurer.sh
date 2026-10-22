#!/usr/bin/env bash
# Restaure OpenResto depuis une sauvegarde : REMPLACE la base, les clés et les images actuelles.
# Usage : ./deploy/restaurer.sh deploy/sauvegardes/daily/openresto-AAAAMMJJ-HHMMSS.tar.gz   (--oui : sans confirmation)
# Avant de remplacer quoi que ce soit, l'état actuel est gardé dans deploy/sauvegardes/pre-restore/.
set -uo pipefail
# shellcheck source=serveur-partage/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/serveur-partage/lib.sh"
verifier_prerequis || exit 1

oui=0
if [ "${1:-}" = "--oui" ]; then oui=1; shift; fi
fichier="${1:-}"
if [ -z "$fichier" ] || [ ! -f "$fichier" ]; then
  erreur "Indiquez la sauvegarde à restaurer. Disponibles :"
  find "$(lire_env BACKUP_DIR "$DEPLOY/sauvegardes")" -name 'openresto-*.tar.gz' -not -path '*/pre-restore/*' 2>/dev/null | sort -r | sed 's/^/    /' >&2
  exit 1
fi

if [ "$oui" != 1 ]; then
  echo "Ceci REMPLACE la base, les clés et les images actuelles d'OpenResto par le contenu de : $fichier"
  echo "(Les autres applications du serveur ne sont pas touchées.)"
  printf 'Tapez « oui » pour continuer : '
  read -r reponse
  if [ "$reponse" != oui ]; then echo "Annulé. Rien n'a été changé."; exit 1; fi
fi

journal="$(mktemp "${TMPDIR:-/tmp}/openresto-restauration.XXXXXX")"
trap 'rm -f "$journal"' EXIT
if hors_environnement "$DEPLOY/backup/restore.sh" --yes "$fichier" >"$journal" 2>&1; then
  echo "Restauration terminée. Contrôlez avec : ./deploy/verifier.sh"
else
  code=$?
  erreur "La restauration a échoué (code $code). Détail :"
  sed 's/^/    | /' "$journal" >&2
  echo "L'état d'avant est conservé dans $(lire_env BACKUP_DIR "$DEPLOY/sauvegardes")/pre-restore/ (s'il a pu être sauvegardé)." >&2
  exit 1
fi
