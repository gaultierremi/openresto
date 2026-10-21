# Première mise en ligne sur un serveur Linux vierge

Court et copiable. Le détail et les raisons sont dans [HEBERGEMENT.md](HEBERGEMENT.md).

**Deux parcours, au choix :**

- **A. Démo** : l'application complète avec des **données fictives**, sans nom de domaine, en HTTP, vue par un tunnel SSH. À choisir ce soir si vous n'avez pas encore de domaine. 25 à 40 minutes dont 10 à 20 de construction.
- **B. Vraie mise en ligne** : domaine, HTTPS, sauvegardes, instance **vide**. Mêmes durées de construction, plus le temps du DNS.

Ne mélangez pas : **ne chargez jamais les données de démo sur une instance qui recevra de vrais clients.**

## Avant de commencer

- Une VM **Debian 12 ou Ubuntu 24.04**, **4 Go de mémoire** (la construction du frontend en veut 3), 20 Go de disque, un accès `ssh` avec `sudo`.
- Pour B seulement : un nom de domaine dont un enregistrement **A** pointe sur la VM, et les ports **80** et **443** ouverts chez l'hébergeur.
- La branche à utiliser : **`preview/test-serveur`** tant que les PR ne sont pas fusionnées, **`main`** ensuite.

## 1. Docker et le code (A et B)

```bash
sudo apt-get update && sudo apt-get install -y git ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
. /etc/os-release
sudo curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

**Se déconnecter puis se reconnecter en SSH** (pour que le groupe `docker` soit pris en compte), puis :

```bash
git clone --branch preview/test-serveur --depth 1 https://github.com/gaultierremi/openresto.git ~/openresto
cd ~/openresto
```

## 2A. Démo avec données fictives

```bash
bash .devcontainer/demo.sh setup      # construit, démarre, charge la démo, affiche les identifiants
```

Le script génère les mots de passe (ils ne sont dans aucun fichier du dépôt) et les affiche dans un encadré ; `bash .devcontainer/demo.sh banner` le réaffiche. L'application n'écoute que sur la boucle locale du serveur : **depuis votre poste**, ouvrez un tunnel puis allez sur <http://localhost:5062>.

```bash
ssh -L 5062:localhost:5062 utilisateur@adresse-du-serveur
```

Ce que contient la démo : 10 lieux, 41 tables, environ 500 réservations générées autour d'aujourd'hui, une brasserie belge en euros avec sa carte, son site publié et sa version néerlandaise, un lieu suspendu, un brouillon avec une invitation en attente.

| À essayer                                | Où                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Administration (Propriétaire)            | `/admin`, identifiant `demo@openresto.test`, mot de passe de l'encadré                       |
| Espace plateforme                        | `/admin/platform` (établissements, statuts, conservation)                                    |
| Site d'un restaurant, en français        | `/r/brasserie-de-la-senne-doree`                                                             |
| Le même en néerlandais                   | `/r/brasserie-de-la-senne-doree?lang=nl`                                                     |
| Parcours d'inscription d'un restaurateur | `/onboarding/invitation/demo-invitation-brasserie-du-canal`                                  |
| Espace du restaurateur de démo           | `/onboarding/login`, identifiant `gerant@senne-doree.example`, même mot de passe             |
| Carte à scanner                          | l'adresse `/menu/r/…` de l'encadré ; les codes à imprimer sont dans l'admin, page _QR codes_ |

Remettre la démo à neuf : `bash .devcontainer/demo.sh reseed`. Arrêter : `… stop`. **Tout effacer : `… clean`.**

## 2B. Vraie mise en ligne

Vérifier d'abord la machine, sans rien écrire :

```bash
sudo ./deploy/install.sh --domain reservations.example.be --email ops@example.be --preflight-only
```

Puis installer. **`--build` est nécessaire** : les images publiées par le projet amont ne contiennent pas ce dépôt.

```bash
sudo ./deploy/install.sh --domain reservations.example.be --email ops@example.be --build --firewall
./deploy/health.sh
```

- Docker absent ? Ajoutez `--install-docker` et sautez l'étape 1.
- Le **mot de passe administrateur n'est pas affiché** : `sudo grep ADMIN_PASSWORD deploy/.env`. Connexion sur `https://<domaine>/admin` avec l'adresse donnée par `--admin-email` (par défaut `--email`). Le changer aussitôt.
- Ensuite, dans l'admin : **Paramètres → Email** (réglages SMTP, puis le mail de test), puis **Plateforme → Ajouter un établissement** pour inviter un premier restaurateur.
- Mise à jour plus tard : `git pull`, puis `./deploy/update.sh` (il reconstruit, après une sauvegarde).
- **Avant un vrai restaurant** : faire valider les textes légaux par un juriste ([PLATEFORME.md](PLATEFORME.md)).

## Les 5 pannes probables

| #   | Ce que vous voyez                                                                           | Cause                                                                                  | Remède                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | B : « https://… does not answer correctly » (code 2), ou le navigateur refuse le certificat | DNS pas encore propagé, port 80 fermé chez l'hébergeur, ou un enregistrement AAAA faux | `dig +short <domaine>` doit rendre l'IP de la VM ; ouvrir 80 et 443 ; `docker compose -f deploy/docker-compose.prod.yml logs caddy`. Let's Encrypt limite les essais : corrigez d'abord, réessayez ensuite. |
| 2   | « the image build failed », ou `Killed` pendant la construction du frontend                 | Moins de 3 Go de mémoire libre                                                         | Ajouter du swap (`sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`) ou prendre une VM à 4 Go, puis relancer la même commande.                  |
| 3   | `429 Too Many Requests` en tirant une image (node, caddy, nginx)                            | Docker Hub limite les tirages anonymes par adresse IP, fréquent sur des IP partagées   | `docker login` avec un compte gratuit, ou attendre une heure et relancer. La commande est relançable sans risque.                                                                                           |
| 4   | « port 80 is already in use » (ou 443)                                                      | Apache ou nginx déjà installé par l'hébergeur                                          | `sudo ss -ltnp 'sport = :80'` pour voir qui ; `sudo systemctl disable --now apache2 nginx` ; relancer.                                                                                                      |
| 5   | Pas de mail d'invitation ni de confirmation                                                 | SMTP non réglé : le serveur n'envoie rien tant qu'il n'est pas configuré               | Admin → Paramètres → Email. D'ici là, le lien d'invitation s'affiche **une seule fois** à l'écran : le copier et le transmettre à la main. La démo n'envoie aucun mail.                                     |

Si le pare-feu vous verrouille dehors (B, `--firewall`) : l'installateur refuse de l'activer quand `sshd` écoute ailleurs que sur le port donné (`--ssh-port`) ; gardez malgré tout une seconde session SSH ouverte pendant l'installation et repérez la console de secours de l'hébergeur.
