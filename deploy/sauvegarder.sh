#!/usr/bin/env bash
# Sauvegarde cohérente d'OpenResto : la base, les clés et les images téléversées, dans un fichier daté
# (dossier deploy/sauvegardes, lisible par vous seul). Garde les 7 dernières sauvegardes quotidiennes et 4 hebdomadaires.
# Usage : ./deploy/sauvegarder.sh
# ATTENTION : la sauvegarde reste sur ce serveur. Si le serveur est perdu, elle l'est aussi : copiez-la ailleurs
# (docs/SERVEUR-PARTAGE.md, « Sauvegarder »).
set -uo pipefail
# shellcheck source=serveur-partage/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/serveur-partage/lib.sh"
verifier_prerequis || exit 1

if [ -z "$(compose ps --status running -q backend 2>/dev/null)" ]; then
  erreur "OpenResto ne tourne pas : rien à sauvegarder. Démarrez-le avec : docker compose -f deploy/docker-compose.serveur-partage.yml --env-file deploy/serveur-partage.env up -d"
  exit 1
fi

journal="$(mktemp "${TMPDIR:-/tmp}/openresto-sauvegarde.XXXXXX")"
trap 'rm -f "$journal"' EXIT
if hors_environnement "$DEPLOY/backup/backup.sh" >"$journal" 2>&1; then
  dossier="$(lire_env BACKUP_DIR "$DEPLOY/sauvegardes")"
  derniere="$(find "$dossier/daily" -name 'openresto-*.tar.gz' | sort | tail -n 1)"
  echo "Sauvegarde faite : ${derniere#"$RACINE"/} ($(du -h "$derniere" | cut -f1))"
else
  code=$?
  erreur "La sauvegarde a échoué (code $code). Détail :"
  sed 's/^/    | /' "$journal" >&2
  exit 1
fi
