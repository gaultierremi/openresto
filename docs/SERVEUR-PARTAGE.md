# Installer OpenResto sur un serveur qui héberge déjà Apprenti

Ce guide est écrit pour quelqu'un qui n'est pas informaticien. Chaque étape dit **quoi taper**, **ce que vous devez voir** et **quoi faire si ce n'est pas le cas**. Une ligne grise comme `./deploy/installer.sh` se **copie-colle** dans le terminal du serveur, puis `Entrée`.

> **Ce guide n'a pas encore été joué sur le vrai serveur.** Il a été testé avec une fausse Apprenti installée à côté, sur une machine de test (voir [Ce qui a été testé](#ce-qui-a-été-testé-et-ce-qui-ne-lest-pas)). Au premier essai, lisez bien ce que le script affiche : il dit toujours ce qu'il fait.

## En deux minutes

- Le serveur fait déjà tourner **Apprenti** sur le port **8080**. OpenResto s'installe **à côté**, sur le port **8081**, sans rien changer à Apprenti.
- Tant qu'il n'y a pas de nom de domaine, le site d'OpenResto s'ouvre à l'adresse `http://ADRESSE-DU-SERVEUR:8081` et **demande un identifiant et un mot de passe avant d'afficher quoi que ce soit**.
- **Données fictives seulement** pour l'instant : l'adresse est en `http://` (sans cadenas), donc les mots de passe voyagent en clair. C'est acceptable pour montrer le produit à un associé, pas pour de vrais clients.
- Quand un nom de domaine existera, une seule commande fait passer OpenResto en `https://` (voir [Quand il y aura un nom de domaine](#quand-il-y-aura-un-nom-de-domaine)).

## Ce qui est séparé d'Apprenti (et pourquoi vous ne risquez rien)

|                            | Apprenti                          | OpenResto                                                  |
| -------------------------- | --------------------------------- | ---------------------------------------------------------- |
| Projet Docker              | `apprenti-serveur`                | `openresto-serveur`                                        |
| Port ouvert sur le serveur | 8080                              | **8081** (un seul)                                         |
| Réseaux Docker             | `apprenti-serveur_interne`        | `openresto-serveur_interne` et `openresto-serveur_acces`   |
| Volumes (les données)      | `apprenti-serveur_apprenti-db`, … | `openresto-serveur_donnees`, `openresto-serveur_medias`, … |
| Noms des services          | `app`, `db`, `caddy`              | `acces`, `reverse-proxy`, `backend`, `frontend`            |
| Fichier de configuration   | `deploy/.env` (dans son dépôt)    | `deploy/serveur-partage.env` (dans celui-ci)               |
| Base de données            | Postgres                          | un fichier SQLite, **jamais exposé**                       |

Les scripts d'OpenResto **ne touchent qu'à ce qui porte le préfixe `openresto-serveur`**. Ils n'arrêtent, ne redémarrent, ne suppriment ni ne nettoient rien d'autre : le nettoyage après une mise à jour ne supprime que les images marquées « OpenResto ». Le contrôle `./deploy/verifier.sh` vérifie aussi qu'aucun conteneur d'une autre application n'est branché sur les réseaux d'OpenResto.

## Avant de commencer

À demander à la personne qui administre le serveur (Julien) :

1. **Un accès au terminal du serveur** (SSH) avec un utilisateur normal (pas `root`).
2. Cet utilisateur peut **utiliser Docker** : la commande `docker ps` s'affiche sans erreur. Sinon : `sudo usermod -aG docker "$USER"`, puis se reconnecter.
3. Au moins **4 Go de mémoire libre** (mémoire + swap) **pendant la construction** (10 à 15 minutes), et **6 Go de disque libre**. Apprenti continue de tourner pendant ce temps, mais peut ralentir.
4. Le **port 8081 libre**. Le script le vérifie et propose un autre numéro s'il est pris.
5. Si le serveur a un pare-feu (`ufw`), il faut **ouvrir le port 8081** (sinon le site ne s'ouvre que depuis le serveur lui-même). C'est Julien qui tape : `sudo ufw allow 8081/tcp`. Le script le rappelle s'il détecte `ufw` actif.

## Pas à pas

### 1. Se connecter au serveur

Depuis votre ordinateur, ouvrez un terminal et tapez (Julien donne l'adresse et le nom d'utilisateur) :

```bash
ssh nom-utilisateur@adresse-du-serveur
```

### 2. Récupérer OpenResto

```bash
git clone https://github.com/gaultierremi/openresto.git
cd openresto
```

> Tant que la mise à jour « serveur partagé » n'est pas fusionnée dans la branche principale, ajoutez `-b chore/serveur-partage` après `git clone` : `git clone -b chore/serveur-partage https://github.com/…`.

### 3. Faire contrôler le serveur, sans rien installer

```bash
./deploy/installer.sh --verifier-seulement
```

Vous devez voir des lignes `[OK]` et, à la fin : **« Tout est en ordre : l'installation peut se faire »**. Le script a aussi listé les autres applications du serveur (Apprenti) en précisant qu'il n'y touche pas.

Si une ligne `[ERREUR]` apparaît, **rien n'a été installé** et la ligne dit quoi faire (port pris, pas assez de mémoire, Docker inaccessible…). Voir [Dépannage](#dépannage).

### 4. Installer

```bash
./deploy/installer.sh
```

- Compter **10 à 20 minutes** la première fois. Le script écrit « la construction continue (N min) » toutes les minutes : c'est normal, ne l'interrompez pas.
- À la fin, il contrôle la santé du site et affiche **« OpenResto est installé. Ouvrez : http://… »**.

### 5. Noter les deux mots de passe (ils ne seront plus affichés)

Juste après, le script affiche un encadré « À NOTER MAINTENANT » :

- **la porte d'entrée du site** : un identifiant (`essai`) et un mot de passe, demandés par le navigateur ;
- **l'administration d'OpenResto** : une adresse e-mail et un mot de passe, pour gérer les restaurants.

Recopiez-les dans un gestionnaire de mots de passe. **Ne les envoyez ni par e-mail ni par message.** Ils restent aussi dans le fichier `deploy/serveur-partage.env`, lisible par vous seul. Pour les relire plus tard :

```bash
grep -E 'OPENRESTO_UTILISATEUR|OPENRESTO_MOT_DE_PASSE|ADMIN_EMAIL|ADMIN_PASSWORD' deploy/serveur-partage.env
```

### 6. Ouvrir le site

Dans un navigateur, tapez l'adresse affichée (par exemple `http://203.0.113.7:8081`).

1. Le navigateur demande un **identifiant et un mot de passe** : ce sont ceux de « la porte d'entrée ».
2. Le site d'OpenResto s'affiche.
3. Ajoutez `/admin` à l'adresse (`http://203.0.113.7:8081/admin`), connectez-vous avec l'e-mail et le mot de passe de l'administration, et **changez ce mot de passe** dès la première connexion.

Votre navigateur affiche « Non sécurisé » : c'est normal, il n'y a pas de nom de domaine (donc pas de cadenas) pour l'instant.

## Montrer le site à Chris

Donnez-lui **l'adresse** et **les identifiants de la porte d'entrée** (identifiant + mot de passe du site), pas ceux de l'administration, sauf s'il doit modifier des choses. Rappelez-lui que ce sont des données d'essai.

## Au quotidien

Toutes ces commandes se tapent depuis le dossier `openresto`.

| Je veux…                                               | Commande                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vérifier que tout va bien                              | `./deploy/verifier.sh`                                                                                                                           |
| Mettre à jour (sauvegarde, nouvelle version, contrôle) | `./deploy/mettre-a-jour.sh`                                                                                                                      |
| Faire une sauvegarde                                   | `./deploy/sauvegarder.sh`                                                                                                                        |
| Restaurer une sauvegarde                               | `./deploy/restaurer.sh deploy/sauvegardes/daily/FICHIER.tar.gz`                                                                                  |
| Voir les messages de l'application                     | `docker compose -p openresto-serveur --env-file deploy/serveur-partage.env -f deploy/docker-compose.serveur-partage.yml logs --tail 100 backend` |
| Arrêter OpenResto (les données restent)                | `docker compose -p openresto-serveur --env-file deploy/serveur-partage.env -f deploy/docker-compose.serveur-partage.yml stop`                    |
| Redémarrer                                             | `docker compose -p openresto-serveur --env-file deploy/serveur-partage.env -f deploy/docker-compose.serveur-partage.yml up -d`                   |

OpenResto **redémarre tout seul** si le serveur redémarre.

### Mettre à jour

`./deploy/mettre-a-jour.sh` fait, dans l'ordre : une **sauvegarde**, la récupération de la nouvelle version, sa **construction pendant que l'ancienne tourne encore**, le redémarrage, puis le contrôle de santé.

- **Si la construction échoue**, le script le dit clairement (« RIEN N'A CHANGÉ »), remet le code à la version d'avant et laisse l'ancienne version en ligne. Envoyez les lignes affichées à la personne qui développe OpenResto.
- **Si la nouvelle version démarre mais ne va pas bien**, le script dit où est la sauvegarde faite juste avant et comment revenir en arrière.
- Il refuse de travailler si quelqu'un a modifié des fichiers à la main sur le serveur, ou si une autre mise à jour est déjà en cours.

### Sauvegarder

`./deploy/sauvegarder.sh` écrit un fichier daté dans `deploy/sauvegardes/` (la base, les clés de chiffrement et les images téléversées, lisible par vous seul ; les 7 dernières quotidiennes et 4 hebdomadaires sont gardées).

- **Elle reste sur le serveur** : si le serveur disparaît, elle disparaît avec. **Copiez-la ailleurs** de temps en temps, depuis votre ordinateur : `scp nom-utilisateur@adresse-du-serveur:openresto/deploy/sauvegardes/daily/*.tar.gz .`
- Pour une sauvegarde **chaque nuit** : tapez `crontab -e` et ajoutez la ligne suivante (en remplaçant le chemin par celui de `pwd` dans le dossier `openresto`) :

  ```
  15 3 * * * /home/nom-utilisateur/openresto/deploy/sauvegarder.sh >> /home/nom-utilisateur/openresto-sauvegarde.log 2>&1
  ```

- Contenant des données de clients, ces fichiers sont **personnels** : ne les envoyez pas par e-mail.

## Quand il y aura un nom de domaine

Prérequis : un nom (par exemple `reservations.exemple.fr`) dont l'enregistrement DNS pointe vers l'adresse du serveur.

1. Dans le dossier `openresto` :

   ```bash
   ./deploy/installer.sh --passer-au-domaine reservations.exemple.fr
   ```

   Le script explique ce qu'il va changer et demande de taper « oui » : mode **Production** (les connexions exigent le cadenas), **le mot de passe de la porte d'entrée est retiré** (le site devient public, l'administration garde son propre mot de passe), et le port 8081 n'écoute plus que **depuis le serveur lui-même**. L'ancienne configuration est gardée dans `deploy/serveur-partage.env.avant-domaine`.

2. Le cadenas (HTTPS) n'est **pas** fait par OpenResto : c'est le **Caddy du serveur** qui le fait. Le script affiche le petit bloc à lui donner, par exemple :

   ```
   reservations.exemple.fr {
       reverse_proxy 127.0.0.1:8081
   }
   ```

   Julien l'ajoute à son fichier Caddy, puis tape `sudo systemctl reload caddy`. Caddy obtient alors tout seul le certificat.

3. Si le Caddy du serveur tourne **dans Docker** (et non comme service du serveur), `127.0.0.1` n'est pas le serveur vu depuis ce Caddy : demandez de l'aide à la personne qui l'administre (il faut alors une adresse d'écoute que ce Caddy peut joindre, option `--ecoute`, accompagnée d'une règle de pare-feu qui ferme le port 8081 à l'extérieur).

4. Contrôler : `./deploy/verifier.sh` doit dire « Tout est bon », puis ouvrir `https://reservations.exemple.fr`.

## Pourquoi « mode essai » tant qu'il n'y a pas de nom de domaine ?

Pour des raisons de sécurité, la connexion à l'administration utilise un « cookie sécurisé » que le navigateur **refuse de conserver sur une adresse en `http://`**. L'installateur règle donc OpenResto en **mode essai** (`Development`) tant que le site n'a pas de cadenas. Ce mode laisse voir la page `/openapi` (toujours derrière le mot de passe de la porte d'entrée) et rend la base de données plus bavarde dans ses messages d'erreur ; le kit coupe la partie des journaux qui recopierait des e-mails de clients. C'est pourquoi on n'y met **que des données fictives**, et pourquoi `./deploy/verifier.sh` le rappelle. Dès le nom de domaine, on passe en **Production**.

Dans les deux modes, la clé qui signe les connexions et le mot de passe de l'administration sont **fabriqués au hasard** pour ce serveur : ceux qui figurent dans le code public d'OpenResto sont refusés (`verifier.sh` le contrôle en tentant une connexion avec la clé publique du dépôt).

## Dépannage

### « permission denied » ou « Docker ne répond pas »

Votre utilisateur n'a pas le droit d'utiliser Docker. Julien tape `sudo usermod -aG docker nom-utilisateur`, puis vous vous déconnectez et vous vous reconnectez. À défaut, préfixez la commande par `sudo`.

### « Le port 8081 est déjà utilisé »

Une autre application l'occupe. Le script propose un port libre : `./deploy/installer.sh --port 8082`. (Les ports 80 et 443 sont refusés exprès : ils sont ceux du Caddy du serveur.)

### « Mémoire libre … la construction serait tuée »

Il manque de la mémoire pour construire le site web. Demandez à Julien de libérer de la mémoire (ou d'ajouter du « swap »), ou de construire à un moment où le serveur est calme.

### La construction a échoué

Le script affiche les 25 dernières lignes et un fichier de journal complet. **Rien n'a été démarré, Apprenti n'est pas touchée.** Une fois le problème réglé, relancez simplement `./deploy/installer.sh` : il reprend sans rien réécrire.

### Le site ne s'ouvre pas depuis mon ordinateur

1. `./deploy/verifier.sh` dit-il « Tout est bon » ? Sinon, lisez les lignes `[ERREUR]`.
2. Si oui, c'est presque toujours le **pare-feu** : Julien doit ouvrir le port (`sudo ufw allow 8081/tcp`), et, chez un hébergeur, aussi dans son pare-feu en ligne.
3. Vérifiez l'adresse : `deploy/serveur-partage.env`, ligne `OPENRESTO_URL_PUBLIQUE`. Si le serveur a plusieurs adresses et que la détection s'est trompée, ajoutez l'option `--ip` à l'installation (avec un dossier propre) ou corrigez cette ligne.

### Le navigateur redemande le mot de passe en boucle

Le mot de passe de la porte d'entrée est faux. Relisez-le avec la commande de l'étape 5.

### Je me connecte à `/admin` mais je suis aussitôt déconnecté

Le site est ouvert sur une adresse en `https://` alors qu'OpenResto est en mode essai, ou l'inverse. Lancez `./deploy/verifier.sh` : la ligne concernée explique le réglage à corriger.

### J'ai perdu le mot de passe de l'administration

Il est dans `deploy/serveur-partage.env` (ligne `ADMIN_PASSWORD`). S'il a été changé depuis dans l'administration, demandez de l'aide : ce changement n'est pas écrit dans ce fichier.

### Tout effacer, OpenResto seulement

**Irréversible : supprime aussi les données d'OpenResto.** Ne touche pas à Apprenti.

```bash
docker compose -p openresto-serveur --env-file deploy/serveur-partage.env -f deploy/docker-compose.serveur-partage.yml down --volumes
rm deploy/serveur-partage.env
```

## Ce qui a été testé, et ce qui ne l'est pas

|                                                                                                                                                                                                                                                                            | Testé   | Comment                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Refus propres (port pris, mémoire, disque, Docker, restes d'une installation) : rien n'est écrit ni démarré                                                                                                                                                                | Oui     | `deploy/tests/serveur-partage.test.sh` (doublures des commandes de la machine) |
| Installation d'essai puis relance, bascule vers un domaine, mise à jour (ordre, construction cassée, code modifié à la main, verrou), nettoyage limité aux images d'OpenResto                                                                                              | Oui     | idem                                                                           |
| Cohabitation réelle : une fausse Apprenti (mêmes noms de services, de réseau et de volume, port 8080) démarre d'abord ; OpenResto s'installe à côté ; Apprenti reste identique (conteneurs, démarrages, réseaux, volumes), seul le port 8081 est publié, aucun nom partagé | Oui     | `deploy/tests/serveur-partage.stack.test.sh`, Docker réel                      |
| Mot de passe de la porte d'entrée (401 puis 200), connexion à l'administration en HTTP, sauvegarde puis restauration, construction cassée sans conséquence, suppression d'OpenResto sans effet sur Apprenti                                                                | Oui     | idem                                                                           |
| Jeton d'administrateur fabriqué avec la clé publique du dépôt : refusé                                                                                                                                                                                                     | Oui     | idem, et contrôle permanent dans `verifier.sh`                                 |
| **Le vrai serveur** (Ubuntu 24.04, le vrai Apprenti, le vrai Caddy), `ufw`, le pare-feu de l'hébergeur                                                                                                                                                                     | **Non** | Aucun serveur n'a été touché                                                   |
| Construction des images sur le serveur (durée, mémoire)                                                                                                                                                                                                                    | **Non** | Estimée : 10 à 20 minutes, environ 3 Go                                        |
| Bascule vers un domaine derrière le Caddy du serveur                                                                                                                                                                                                                       | **Non** | Le bloc à ajouter est donné, non essayé                                        |
