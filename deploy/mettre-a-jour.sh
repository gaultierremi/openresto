#!/usr/bin/env bash
# Met OpenResto à jour : sauvegarde, récupération du nouveau code, construction, redémarrage, contrôle.
# Usage : ./deploy/mettre-a-jour.sh            (--sans-git : ne récupère pas de nouveau code, reconstruit seulement)
#
# La nouvelle version est CONSTRUITE pendant que l'ancienne tourne encore : si la construction casse, rien n'a bougé,
# le code revient à l'état d'avant et le site reste en ligne. Les autres applications du serveur ne sont jamais touchées
# (le nettoyage ne supprime que les images d'OpenResto).
set -Eeuo pipefail
# shellcheck source=serveur-partage/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/serveur-partage/lib.sh"
verifier_prerequis || exit 1

# Surchargeables pour que les tests jouent l'enchaînement sans Docker.
sauvegardeur="${MAJ_SAUVEGARDER:-$DEPLOY/sauvegarder.sh}"
verificateur="${MAJ_VERIFIER:-$DEPLOY/verifier.sh}"

# Tout est dans une fonction appelée sur la dernière ligne : « git pull » peut remplacer CE fichier pendant
# qu'il tourne, et bash lirait alors la suite d'un fichier différent.
mise_a_jour() {
  sans_git=0
  [ "${1:-}" = "--sans-git" ] && sans_git=1

  # Deux mises à jour en même temps se marcheraient dessus.
  exec 9>"$DEPLOY/.mise-a-jour.verrou"
  if ! flock -n 9; then erreur "Une mise à jour est déjà en cours."; exit 1; fi

  cd "$RACINE"
  avant=""
  if [ "$sans_git" = 0 ]; then
    if ! git rev-parse --git-dir >/dev/null 2>&1; then erreur "Ce dossier n'est pas un dépôt Git : impossible de récupérer la nouvelle version."; exit 1; fi
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      erreur "Des fichiers du code ont été modifiés à la main sur ce serveur. Rien n'a été touché. Demandez de l'aide avant de continuer (git status les montre)."
      exit 1
    fi
    avant="$(git rev-parse HEAD)"
  fi

  if [ -n "$(compose ps --status running -q backend 2>/dev/null)" ]; then
    echo "1/5 Sauvegarde avant la mise à jour..."
    if ! "$sauvegardeur"; then
      erreur "La sauvegarde a échoué : la mise à jour est annulée, rien n'a été changé."
      exit 1
    fi
  else
    echo "1/5 OpenResto ne tourne pas : pas de sauvegarde."
  fi

  if [ "$sans_git" = 0 ]; then
    echo "2/5 Récupération de la nouvelle version (branche $(git branch --show-current))..."
    if ! git pull --ff-only; then
      erreur "Impossible de récupérer la nouvelle version (pas de réseau, ou historique modifié). Rien n'a été changé."
      exit 1
    fi
    apres="$(git rev-parse HEAD)"
    if [ "$avant" = "$apres" ]; then echo "    Déjà à jour (${apres:0:7})."; else echo "    ${avant:0:7} -> ${apres:0:7}"; fi
  else
    echo "2/5 Récupération sautée (--sans-git)."
  fi

  echo "3/5 Construction de la nouvelle version (5 à 15 minutes ; l'ancienne reste en ligne)..."
  if ! construire_images; then
    if [ -n "$avant" ]; then
      git reset --hard --quiet "$avant"
      echo "Le code est revenu à la version d'avant (${avant:0:7})." >&2
    fi
    echo "RIEN N'A CHANGÉ : l'ancienne version tourne toujours et la sauvegarde d'avant est conservée. Transmettez les lignes ci-dessus à la personne qui développe OpenResto." >&2
    exit 1
  fi

  echo "4/5 Redémarrage sur la nouvelle version..."
  compose up -d --remove-orphans

  echo "5/5 Contrôle de santé..."
  echo
  if ! "$verificateur"; then
    echo >&2
    erreur "La nouvelle version ne se porte pas bien. La sauvegarde faite au début est dans $(lire_env BACKUP_DIR "$DEPLOY/sauvegardes")/daily."
    echo "Pour revenir en arrière : ./deploy/restaurer.sh <cette sauvegarde> après avoir remis l'ancien code (git checkout ${avant:0:7}) et relancé ./deploy/mettre-a-jour.sh --sans-git." >&2
    exit 1
  fi

  # Seulement les images d'OpenResto : un « docker image prune » général supprimerait aussi celles des autres applications.
  docker image prune -f --filter "label=com.openresto.serveur=1" >/dev/null
  echo
  echo "Mise à jour terminée."
}

mise_a_jour "$@"; exit $?
