# CLAUDE.local.md — règles maison (Gaultier) pour le fork OpenResto

Ce fichier complète `CLAUDE.md` du dépôt, qui fait foi pour tout ce qui est technique
(architecture, conventions, tests, migrations EF). En cas de conflit, `CLAUDE.md` gagne
sur la technique, ce fichier gagne sur la méthode de travail.

## 0. Rôles

- **Orchestrateur** : la conversation Claude (chat). Il écrit les briefs, ne code pas.
- **Claude N** (Claude Code) : écrit le code, sur son propre worktree, ouvre une PR.
- **Astra N** (Codex) : relit. Rien n'est mergé sans son verdict. Il ne modifie rien.
- **Gaultier** : seul à merger. Seul à lancer des commandes contre une instance réelle.

## 1. Isolation

- Un worktree par session, jamais dans le dossier partagé :
  `git fetch origin && git worktree add ../openresto-<sujet> -b <type>/<sujet> origin/main`
- Si le dossier existe déjà, une autre instance y travaille : crée le tien.
- Jamais `git checkout --`, `git clean`, `git reset --hard` dans un dossier partagé.
- Une branche, une PR, jamais de merge par un agent. Jamais plus d'un étage d'empilement.
- Pour relire : `git fetch origin pull/<N>/head:refs/review/<N>`.
- Dépendances (`npm ci`, `dotnet restore`) uniquement dans ton propre worktree.
- Arrête les conteneurs Docker que tu as lancés.

## 2. Périmètre

- Un bug hors périmètre : signalé avec fichier:ligne dans le rapport, pas corrigé.
- Pas de « pendant que j'y suis », pas de refonte non demandée.
- Les fichiers qu'une autre instance a en main sont nommés dans le brief : n'y touche pas.
- Ne lis pas le rapport d'un autre agent sauf consigne : ton regard reste indépendant.
- Fichiers suivis : outils d'édition et git uniquement. Jamais `sed`, `rm` ou script qui
  réécrit un fichier du dépôt. Pour retirer un fichier : `git rm`.

## 3. Migrations EF Core

- Une migration = celle que le brief annonce. Si une autre devient nécessaire : stop, dis-le.
- Jamais de modification d'une migration déjà mergée.
- La CI « migration safety » (fresh install vs upgrade identiques) doit passer en local
  avant push si tu touches au schéma — rejoue la même procédure que le workflow.
- Suppression en cascade : explicite, justifiée, testée. Jamais de suppression de
  réservations ou de données client comme effet de bord.

## 4. Sécurité

- Tout endpoint d'écriture admin passe par les policies existantes (voir CLAUDE.md, Auth model).
  Jamais de vérification de rôle faite à la main.
- Une ressource d'un autre restaurant répond 404, comme une ressource inexistante.
- Toute URL ou image saisie par un admin passe par les validateurs existants.
- Aucun message d'erreur brut au client, aucun secret ni donnée client dans un journal.
- Identifiants publics (QR, jetons) : générateur cryptographique, jamais `Random`.
- Zéro service externe : aucune dépendance réseau ajoutée à l'exécution.

## 5. Tests

- Chaque comportement ajouté a un test qui l'épingle : le cas permis ET le refus
  (code HTTP + absence d'écriture). Un test qui ne fait que chercher du texte dans un
  source n'est pas un test de comportement.
- Couverture frontend : la règle du dépôt (100 %) s'applique.
- La suite complète tourne une fois, après le dernier commit. Le code de sortie se lit
  directement, jamais à travers un pipe. Le rapport cite les codes de sortie tels quels.
- Ne dis jamais « vert » sans l'avoir lancé.

## 6. Relecture (Astra)

- Le relecteur n'a pas écrit le code. Il se fait son avis sur le diff et ses propres essais
  AVANT de lire la description de la PR.
- Verdict appuyé sur fichier:ligne : **MERGE**, **MERGE APRÈS CORRECTION** (liste exacte),
  ou **BLOQUÉ** (raison et preuve). Posté en commentaire sur la PR, avec le SHA relu.
- Après « MERGE APRÈS CORRECTION » : contre-vérification des seules corrections.

## 7. Rapport de fin

Commence par la ligne exacte :
`🟩🟩🟩🟩🟩🟩 RAPPORT — <ton nom> — À COPIER 🟩🟩🟩🟩🟩🟩`
et finit par :
`🟥🟥🟥🟥🟥🟥 FIN DU RAPPORT — <ton nom> 🟥🟥🟥🟥🟥🟥`

Entre les deux, court, dans cet ordre :
1. Ce qui a bougé (PR, SHA, fichiers).
2. La migration s'il y en a une.
3. Ce que tu n'as PAS fait, et pourquoi.
4. Constats hors périmètre, fichier:ligne.
5. Ce que le relecteur doit regarder en priorité.
6. Codes de sortie (build, tests backend, tests frontend, lint, format, tsc), tels quels.
7. Signature (« — Claude 1 », « — Astra 1 »).

Posté en commentaire sur la PR (ou dans l'issue « Tableau de bord des agents » s'il n'y a
pas de PR). Si `gh` ne peut pas poster, dis-le en tête de rapport. Puis STOP.
