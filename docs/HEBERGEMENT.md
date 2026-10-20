# Hébergement d'OpenResto en production

Document pour **Gaultier** (qui exploite) et **l'hébergeur** (qui fournit la VM, probablement All4Net).
Tout ce qui est décrit ici est livré dans `deploy/`. La pile et les scripts ont été exécutés en
local ; ce qui ne l'a pas été est listé au [§12](#12-ce-qui-a-été-testé-et-ce-qui-ne-lest-pas).

## 1. En bref

- **Une VM Linux** (Debian 12 ou Ubuntu 24.04), **Docker** et **Docker Compose**, rien d'autre.
- **Quatre conteneurs** : Caddy (HTTPS automatique, seul exposé sur Internet), nginx (routage et
  en-têtes de sécurité), le backend ASP.NET et le frontend web.
- **Base de données = un fichier SQLite** (`openresto.db`). Il n'y a pas de serveur de base de
  données, donc **aucun port de base exposé**, par construction.
- **Sauvegarde quotidienne cohérente** (7 jours + 4 semaines), copie hors VM possible, restauration
  testée.
- **Un restaurant indépendant = une instance** (voir [§3](#3-plusieurs-restaurants--une-instance-ou-une-par-client)).
  Une instance sait gérer plusieurs _lieux_, mais pas isoler des clients différents.

## 2. Architecture

```
Internet ──► Caddy :80/:443 ──► nginx (interne) ──► backend  (ASP.NET + SQLite)
 (HTTPS auto)                                  └──► frontend (site web statique)
```

| Conteneur       | Rôle                                                                                | Port publié                  |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| `caddy`         | Certificat Let's Encrypt, redirection HTTP→HTTPS                                    | **80, 443 (tcp), 443 (udp)** |
| `reverse-proxy` | nginx : `/api` → backend, `/media` → fichiers, `/` → frontend, en-têtes de sécurité | aucun                        |
| `backend`       | API, SQLite, envoi des mails                                                        | aucun                        |
| `frontend`      | Site web (export statique)                                                          | aucun                        |

Seul Caddy publie des ports. Les autres conteneurs vivent sur deux réseaux Docker internes
(`edge` : Caddy ↔ nginx ; `app` : nginx ↔ backend ↔ frontend).

Données sur la VM (`DATA_DIR`, par défaut `/srv/openresto`) :

| Dossier  | Contenu                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `db/`    | `openresto.db` (+ `-wal`, `-shm`) et `dp-keys/` (clés qui chiffrent le mot de passe SMTP et le cookie « réservations récentes ») |
| `media/` | Images et menus PDF téléversés                                                                                                   |

## 3. Plusieurs restaurants : une instance ou une par client ?

**Réponse : une instance gère nativement plusieurs _lieux_ d'un même exploitant, mais ne sépare pas
des clients indépendants. Pour des restaurateurs distincts, il faut une instance par client.**

Ce qui est vrai dans le code (vérifié) :

- OpenResto est **multi-lieux** : une instance contient N restaurants (lieux), chacun avec ses
  horaires, tables, sections, pauses de réservation, liste d'attente. C'est fait pour une enseigne
  qui a plusieurs adresses.
- Mais tout le reste est **global à l'instance** :
  - **Comptes admin non rattachés à un lieu.** Un Owner ou un Manager voit et modifie _tous_ les
    lieux et _toutes_ les réservations (`AdminCredential` n'a aucun lien avec un restaurant).
  - **Une seule identité visuelle** (nom, couleurs, logo, pied de page) : une ligne `BrandSettings`.
  - **Un seul expéditeur de mails** (une ligne `EmailSettings`) : les confirmations de tous les lieux
    partent avec le même nom et la même adresse d'expéditeur.
  - **Une seule base, un seul domaine.** Les clients des restaurants A et B sont dans les mêmes tables.

|                                        | **A. Une instance, N lieux**             | **B. Une instance par client** (recommandé)                     |
| -------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Convient à                             | Une enseigne / un seul exploitant        | Des restaurateurs indépendants                                  |
| Isolation des données                  | Aucune entre lieux (mêmes comptes admin) | Totale : base, médias, comptes, clés propres                    |
| Identité visuelle, expéditeur de mails | Uniques                                  | Propres à chaque client, domaine propre possible                |
| RGPD                                   | Un seul responsable de traitement        | Un responsable par client, registre et suppression simples      |
| Ressources (mesurées au repos)         | ≈ 160 Mo de RAM au total                 | ≈ 145 Mo par instance (backend 108, frontend 31, nginx 5)       |
| Mises à jour                           | Une seule                                | **Une par instance** (scriptée : `update.sh`)                   |
| Sauvegarde / restauration              | Une seule                                | Une par instance : restaurer un client n'affecte pas les autres |
| Panne d'un client                      | Touche tout le monde                     | Isolée                                                          |

**Ce que cela implique pour toi (modèle B) :**

- Chaque client a son dossier (`/opt/openresto-<client>/`), son `.env`, son `DATA_DIR`, son nom de
  domaine ou sous-domaine, son compte Owner. Le nom de projet Docker doit différer
  (`COMPOSE_PROJECT_NAME=openresto-<client>`).
- **Ce que le kit livré fait : une instance par VM, avec son Caddy.** Plusieurs instances sur la
  _même_ VM demandent un Caddy partagé (un seul processus peut tenir les ports 80/443) qui route par
  nom de domaine vers chaque instance. **Ce n'est pas livré** : à faire dès que le deuxième client
  arrive (voir [§11](#11-limites-et-décisions-ouvertes)). Pour la démo et le premier client, le kit
  tel quel suffit.
- Les mises à jour d'OpenResto se font instance par instance : prévoir une boucle sur les dossiers
  (voir [§7](#7-mise-à-jour)).

## 4. Dimensionnement de la VM

### Besoins par instance (mesurés)

Mesure faite sur la pile de ce dépôt (4 conteneurs, après ~120 requêtes), en mémoire au repos :
backend 108 Mio, frontend 31 Mio, nginx 5 Mio, Caddy 16 Mio (Caddy est unique par VM).
Taille des images : backend 1,28 Go, frontend 0,30 Go, nginx 0,10 Go, Caddy 0,09 Go, **partagées**
entre toutes les instances d'une même VM. Une base fraîchement créée pèse 0,7 Mo (mesuré) ; l'ordre de grandeur de
croissance (réservations) et de médias est une estimation, à confirmer en exploitation.

Limites mémoire posées dans le compose (pour qu'un conteneur qui s'emballe ne prive pas les autres de mémoire) :
backend 1 Go, frontend 256 Mo, nginx 256 Mo, Caddy 256 Mo.

### Estimation

| Scénario                                                                                                             | vCPU | RAM                                 | Disque     | Remarque                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| **Démo + 1 à 3 premiers clients**                                                                                    | 2    | 4 Go                                | 40 Go SSD  | ≈ 0,6 Go de RAM utilisée au repos pour 4 instances                                                       |
| **1 démo + 20 restaurants, une instance chacun**                                                                     | 4    | **8 Go minimum, 16 Go confortable** | 100 Go SSD | 21 × ≈ 0,15 Go au repos ≈ 3 Go ; on compte 0,4 Go par instance en pointe, soit ≈ 8,5 Go, plus le système |
| 1 démo + 20 restaurants = **20 lieux d'une seule instance** (modèle A, non recommandé pour des clients indépendants) | 2    | 4 Go                                | 40 Go SSD  |                                                                                                          |

Pour le disque du scénario à 21 instances : images 1,8 Go + système ≈ 10 Go + par instance (base +
médias ≈ 0,1 Go) + sauvegardes locales (7 + 4 archives par instance, ≈ 0,1 Go chacune au départ) ≈
30 à 60 Go. 100 Go laisse de la marge ; **surveiller le remplissage** ([§9](#9-supervision-minimale)).

Ces chiffres sont des **estimations à confirmer avec une vraie charge** : on mesure au repos et on
extrapole. Le trafic d'un restaurant est faible (quelques dizaines de réservations par jour).

### Ce qu'il faut demander à l'hébergeur

À transmettre tel quel :

> - VM Linux **Debian 12 ou Ubuntu Server 24.04 LTS**, amd64. Dimensionnement : voir tableau ci-dessus (2 vCPU / 4 Go / 40 Go pour démarrer, extensible à chaud ou par migration).
> - **Adresse IPv4 fixe**. IPv6 optionnel ; si une adresse IPv6 est attribuée, elle doit être routée correctement.
> - **Reverse DNS (PTR)** réglable sur l'IP, si possible (utile même si les mails passent par un relais).
> - **Ports entrants ouverts** : 22/tcp (SSH, idéalement restreint à des IP précises), 80/tcp, 443/tcp, 443/udp. Rien d'autre.
> - **Ports sortants libres** : 443/tcp, 80/tcp (mises à jour, Let's Encrypt, images Docker), 587/tcp et 465/tcp (envoi des mails via un relais SMTP). Le port 25 sortant n'est pas nécessaire.
> - **Accès SSH par clé uniquement** ; pas de mot de passe root par défaut.
> - **Datacenter en Belgique / Union européenne**, hébergement et sauvegardes dans l'UE.
> - **Instantanés (snapshots)** de la VM, fréquence et rétention à préciser, **en plus** de nos sauvegardes applicatives.
> - Un **contrat de sous-traitance RGPD** (DPA) signable.
> - Console de secours (accès hors SSH) en cas de blocage du pare-feu.

## 5. Installation pas à pas

Hypothèses : VM Debian 12 / Ubuntu 24.04 neuve, un utilisateur `deploy` avec `sudo`, un nom de
domaine dont tu contrôles la zone DNS. Exemple : `reservations.example.be`.

### 5.1 DNS (avant tout)

Chez le registrar : un enregistrement **A** `reservations.example.be → <IP fixe de la VM>`. Ne pas
publier d'AAAA sauf si l'IPv6 est opérationnelle de bout en bout (sinon Let's Encrypt peut échouer
sur IPv6). Vérifier : `dig +short reservations.example.be` renvoie l'IP.

### 5.2 Système

```bash
# En root ou via sudo. Mises à jour et paquets de base
sudo apt-get update && sudo apt-get -y full-upgrade
sudo apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades
```

**SSH par clé uniquement** (garde une seconde session ouverte pendant le test) :

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'CONF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
CONF
sudo sshd -t && sudo systemctl reload ssh
```

**Pare-feu** (ufw). Autoriser SSH _avant_ d'activer :

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp          # idéalement: sudo ufw allow from <ton-ip> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp         # HTTP/3
sudo ufw enable
```

> **Piège Docker** : Docker écrit ses propres règles et **contourne ufw** pour les ports qu'il
> publie. Ici seul Caddy publie des ports (80/443, voulus). **N'ajoute jamais de `ports:` à un
> autre service** — ce serait ouvert sur Internet quoi qu'ufw affiche.

**fail2ban** (protège SSH) : activé par défaut sur Debian/Ubuntu avec la prison `sshd`.

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

**Mises à jour de sécurité automatiques** :

```bash
sudo dpkg-reconfigure -plow unattended-upgrades     # répondre Oui
```

Un redémarrage est parfois nécessaire après une mise à jour du noyau (`/var/run/reboot-required`).
Les conteneurs repartent seuls (`restart: unless-stopped`). Pour automatiser, dans
`/etc/apt/apt.conf.d/50unattended-upgrades` : `Unattended-Upgrade::Automatic-Reboot "true";` et
`Unattended-Upgrade::Automatic-Reboot-Time "04:30";` (après la sauvegarde de 03:15).

### 5.3 Docker

Procédure officielle (Debian : remplacer `ubuntu` par `debian` dans l'URL) :

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy      # se reconnecter ensuite
docker compose version
```

### 5.4 Récupérer le kit

```bash
sudo mkdir -p /opt/openresto && sudo chown deploy: /opt/openresto
git clone --depth 1 https://github.com/gaultierremi/openresto.git /opt/openresto
cd /opt/openresto/deploy
```

(Dépôt privé : utiliser une clé de déploiement en lecture seule. Seul le dossier `deploy/` sert sur
la VM ; il peut aussi être copié avec `scp -r`.)

### 5.5 Configurer

```bash
cp .env.example .env && chmod 600 .env
$EDITOR .env
```

À remplir impérativement : `DOMAIN`, `ACME_EMAIL`, `OPENRESTO_VERSION` (version exacte, jamais
`latest`), `JWT_KEY` (`openssl rand -base64 48`), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mot de passe
long et unique ; il ne sert qu'à créer le premier compte Owner). Le compose refuse de démarrer si
l'un d'eux manque.

```bash
sudo mkdir -p /srv/openresto /srv/openresto-backups      # DATA_DIR et BACKUP_DIR
```

> **Images.** Par défaut le kit tire `ghcr.io/karanshukla/openresto-*:<version>`, les images
> publiées par le projet amont. Ce dépôt n'en publie pas encore (décision [§11](#11-limites-et-décisions-ouvertes)).
> Pour construire depuis ce dépôt : `docker compose -f docker-compose.prod.yml -f docker-compose.build.yml build`
> (le frontend demande ≈ 3 Go de RAM : à faire en CI ou sur une machine plus grosse, pas sur une VM de 2 Go).

### 5.6 Démarrer et vérifier

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --wait
./smoke.sh
```

`smoke.sh` attend que les quatre conteneurs soient `healthy`, puis interroge `https://<DOMAIN>`
(`/api/health`, la page d'accueil, `/api/brand`), vérifie que `/openapi/v1.json` est fermé et que
HTTP redirige vers HTTPS. Il finit par `SMOKE OK`. Le premier démarrage prend quelques dizaines de
secondes : Caddy obtient le certificat. Si le certificat échoue : `docker compose logs caddy`
(cause fréquente : DNS pas encore propagé, ou port 80 fermé).

### 5.7 Premiers réglages (dans l'admin)

1. Ouvrir `https://<DOMAIN>/admin`, se connecter avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Créer le ou les lieux, tables, horaires ; régler l'identité visuelle (Paramètres → Marque).
3. Paramètres → **Email** : vérifier la configuration SMTP et lancer le test ([§6](#6-mails-de-confirmation)).
4. `ADMIN_PASSWORD` ne sert qu'à créer le premier compte : après avoir changé ton mot de passe dans l'admin, la valeur du `.env` est sans effet.

### 5.8 Activer la sauvegarde quotidienne

```bash
sudo cp /opt/openresto/deploy/systemd/openresto-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openresto-backup.timer
sudo systemctl start openresto-backup.service            # première sauvegarde tout de suite
systemctl list-timers openresto-backup.timer
```

Détails et restauration : [§8](#8-sauvegarde-et-restauration).

## 6. Mails de confirmation

### 6.1 Configuration par variables d'environnement

Dans `.env` :

```dotenv
SMTP_HOST=smtp.exemple.be
SMTP_PORT=587
SMTP_USERNAME=…
SMTP_PASSWORD=…
SMTP_FROM_EMAIL=reservations@exemple.be
SMTP_FROM_NAME=Chez Louise
SMTP_ENABLE_SSL=true
SMTP_SEND_CONFIRMATIONS=true
```

**Règle importante : ces variables ne servent qu'au premier démarrage.** Au démarrage, si
`SMTP_HOST` est renseigné et que la page Paramètres → Email n'a encore jamais été enregistrée,
OpenResto la remplit avec ces valeurs (mot de passe chiffré en base). Ensuite **la page admin fait
foi** et les variables sont ignorées : changer `SMTP_PASSWORD` dans `.env` plus tard ne change rien,
il faut le modifier dans l'admin. Ce choix évite qu'un redémarrage écrase ce que l'admin a réglé.

Port 587 = STARTTLS (quel que soit `SMTP_ENABLE_SSL`) ; 465 = TLS implicite si `SMTP_ENABLE_SSL=true`.

> **Attention : cela ne fonctionne qu'avec une image qui contient ce changement.** Avant, le
> backend **ne lisait pas** ces variables (SMTP uniquement en base, via l'admin) ; la lecture a été
> ajoutée par ce chantier (`EmailSettingsBootstrap`). Les images amont `ghcr.io/karanshukla/…:2.4.1`
> (celles que le kit tire par défaut) ne l'ont **pas** : avec elles, `SMTP_*` est sans effet et il
> faut régler le mail dans l'admin. Pour que les variables servent, construire les images depuis ce
> dépôt (`docker-compose.build.yml`) ou publier celles du fork ([§11](#11-limites-et-décisions-ouvertes)).

### 6.2 SPF, DKIM, DMARC : à demander pour le domaine d'expédition

Les mails de confirmation doivent partir d'une adresse d'un domaine que tu contrôles (le
`SMTP_FROM_EMAIL`), via un serveur SMTP autorisé à envoyer pour ce domaine. Sans les trois
enregistrements ci-dessous, Gmail, Outlook et consorts classent ces mails en spam ou les refusent.

À demander au **fournisseur SMTP** (relais transactionnel UE, ou serveur de mail de l'hébergeur) les
valeurs exactes, puis à publier **dans la zone DNS du domaine** :

| Enregistrement | Type DNS                                               | Rôle                                      | Forme                                                                                                                             |
| -------------- | ------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **SPF**        | TXT sur `exemple.be`                                   | Liste les serveurs autorisés à envoyer    | `v=spf1 include:<domaine-spf-du-fournisseur> -all` (un seul SPF par domaine : le fusionner avec l'existant)                       |
| **DKIM**       | TXT (ou CNAME) sur `<sélecteur>._domainkey.exemple.be` | Signature cryptographique des mails       | Valeur et sélecteur **fournis par le fournisseur SMTP**                                                                           |
| **DMARC**      | TXT sur `_dmarc.exemple.be`                            | Politique si SPF/DKIM échouent + rapports | Commencer par `v=DMARC1; p=none; rua=mailto:dmarc@exemple.be`, observer les rapports 2 à 4 semaines, puis passer à `p=quarantine` |

Contrôles :

- Le domaine de `SMTP_FROM_EMAIL` doit être **le même** (ou un sous-domaine) que celui signé en DKIM et couvert par SPF : c'est l'« alignement » DMARC.
- Le fournisseur doit autoriser l'envoi depuis l'IP de la VM sur le port 587 (le port sortant doit être ouvert par l'hébergeur, [§4](#ce-quil-faut-demander-à-lhébergeur)).
- Envoyer un test (Paramètres → Email) vers une boîte Gmail, ouvrir « Afficher l'original » : `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
- Éviter d'envoyer directement depuis la VM (sans relais) : il faudrait IP propre, PTR cohérent et réputation à bâtir.

**Un domaine par client** (modèle B) : chaque client a donc ses propres SPF/DKIM/DMARC s'il veut
envoyer sous son nom ; sinon, expédier depuis un domaine à toi (`reservations@ton-domaine.be`) avec
un `SMTP_FROM_NAME` au nom du restaurant.

## 7. Mise à jour

1. Lire `CHANGELOG.md` de la version cible (migrations, changements d'environnement).
2. Modifier `OPENRESTO_VERSION` dans `.env`.
3. `./update.sh`

`update.sh` : refuse `latest`, **fait une sauvegarde**, tire les images, redémarre, attend que le
backend soit `healthy` et affiche les journaux sinon. La base se met à jour toute seule au
démarrage.

**Plusieurs instances (modèle B)** : boucle sur les dossiers, en s'arrêtant à la première erreur :

```bash
for d in /opt/openresto-*/deploy; do (cd "$d" && ./update.sh) || break; done
```

**Revenir en arrière** (la base a pu être migrée vers l'avant, donc on restaure la sauvegarde prise
juste avant) :

```bash
cd /opt/openresto/deploy
$EDITOR .env                                   # remettre l'ancienne OPENRESTO_VERSION
docker compose -f docker-compose.prod.yml pull
./backup/restore.sh /srv/openresto-backups/daily/openresto-<AAAAMMJJ-HHMMSS>.tar.gz
./smoke.sh
```

La procédure de retour arrière n'a pas été rejouée dans un test automatisé (la restauration, elle, l'est).

## 8. Sauvegarde et restauration

### 8.1 Ce qui est sauvegardé

`deploy/backup/backup.sh` produit **une archive** contenant :

- la base SQLite via **l'API de sauvegarde en ligne de SQLite** (`.backup`), jamais une copie du
  fichier pendant qu'il est écrit, puis `PRAGMA integrity_check` sur l'instantané ;
- les clés de protection des données (`dp-keys/`) ;
- les médias ;
- un `MANIFEST` (date, version OpenResto, dernière migration).

**Pas dans l'archive : le `.env`** (il contient des secrets). Le garder dans un gestionnaire de mots
de passe. Les certificats Caddy ne sont pas sauvegardés : ils se régénèrent.

Rotation : les **7** dernières archives quotidiennes (`daily/`) et les **4** dernières
hebdomadaires (`weekly/`, la première sauvegarde de chaque semaine ISO). Chaque archive a son
`.sha256`. La rotation compte les fichiers, pas les jours : des jours manqués ne vident pas le dossier.

Réglages (`.env`) : `BACKUP_DIR`, `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`.

### 8.2 Planification

Un timer systemd (`openresto-backup.timer`) lance la sauvegarde à 03:15 (+ jusqu'à 10 min aléatoires)
et rattrape un passage manqué (`Persistent=true`). Journaux : `journalctl -u openresto-backup`.
Échec visible avec `systemctl --failed`.

### 8.3 Copie hors VM

Une sauvegarde sur le même disque ne protège pas d'une perte de la VM. Avec
[rclone](https://rclone.org) (S3, SFTP, WebDAV, etc.) :

```bash
sudo apt-get install -y rclone
sudo rclone config            # créer un « remote », ex. "stockage" (région UE !)
sudo rclone mkdir stockage:openresto-backups
```

puis dans `.env` : `BACKUP_REMOTE=stockage:openresto-backups`. Chaque sauvegarde copie les archives
et supprime sur le distant celles de plus de `BACKUP_REMOTE_RETENTION_DAYS` jours (35 par défaut).
Si la copie échoue, la sauvegarde locale est conservée et le script sort avec le code 3 (le service
systemd passe en échec).

- Utiliser un **espace dédié** : la purge distante supprime tout `*.tar.gz` / `*.sha256` plus vieux que 35 jours à cet endroit.
- Les archives contiennent des **données personnelles** : chiffrer côté distant avec un remote
  rclone de type `crypt` (`rclone config` → _crypt_, pointant sur le remote réel), et garder le mot
  de passe de chiffrement hors de la VM.
- `BACKUP_PING_URL` (optionnel) : URL pingée après chaque sauvegarde réussie, pour un service de type
  healthchecks.io qui alerte quand le ping manque.

### 8.4 Restaurer

```bash
cd /opt/openresto/deploy
./backup/restore.sh /srv/openresto-backups/daily/openresto-<AAAAMMJJ-HHMMSS>.tar.gz
```

Le script : vérifie la somme de contrôle (refuse une archive abîmée sans rien toucher), contrôle
l'intégrité de la base de l'archive, demande de taper `restore`, arrête le backend, **conserve l'état
actuel dans `pre-restore/`** (les trois plus récents), remplace base, clés et médias, redémarre,
attend `healthy` et refait un `integrity_check`. Pour un script : `restore.sh --yes <archive>`.

À faire **une fois par mois** : restaurer la dernière archive sur une machine de test (ou une instance
jetable) et vérifier qu'une réservation connue s'y trouve. Une sauvegarde jamais restaurée n'est pas
une sauvegarde.

Perte totale de la VM : nouvelle VM, [§5](#5-installation-pas-à-pas) jusqu'au démarrage, remettre le
`.env` d'origine, récupérer l'archive depuis le stockage distant, `restore.sh`.

## 9. Supervision minimale

Le strict nécessaire, sans installer de pile de monitoring :

1. **Disponibilité (uptime)** — un service externe, **hors de la VM**, qui interroge
   `https://<DOMAIN>/api/health` toutes les 1 à 5 minutes et prévient par mail/SMS quand ce n'est pas
   un `200`. Exemples : UptimeRobot, Better Stack, ou une instance Uptime Kuma sur une autre machine.
   Le service ne reçoit que l'URL publique. Une sonde par instance.
2. **Sauvegarde** — `BACKUP_PING_URL` (dead-man's switch) ou, à défaut, `systemctl --failed` et une
   vérification hebdomadaire de la date du dernier fichier dans `daily/`.
3. **Disque** — alerte à 80 % : `df -h /srv /var/lib/docker`. À la main chaque semaine au début, ou
   le service externe via un script `curl` (dead-man's switch) si tu veux l'automatiser.
4. **Conteneurs** — `docker compose -f docker-compose.prod.yml ps` : les quatre `healthy`. `restart: unless-stopped`
   relance un conteneur qui tombe ; les journaux sont limités à 3 × 10 Mo par conteneur.
5. **Certificat** — Caddy le renouvelle seul ; l'outil d'uptime peut aussi alerter à l'expiration.

Commandes utiles :

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 backend
docker stats --no-stream
```

## 10. Checklist sécurité et RGPD

### 10.1 Sécurité (à cocher à la mise en service)

- [ ] SSH par clé uniquement, `PermitRootLogin no`, accès restreint aux IP connues si possible
- [ ] ufw actif : seuls 22, 80, 443/tcp, 443/udp ouverts (`sudo ufw status`)
- [ ] `sudo ss -tlnp` : **seuls** 22, 80, 443 en écoute sur `0.0.0.0` ; aucun port de base de données (il n'y en a pas), ni 8080/8081/2019
- [ ] Contrôle depuis l'extérieur (autre machine) : `nmap -Pn <IP>` ne montre que 22, 80, 443
- [ ] fail2ban actif (`fail2ban-client status sshd`)
- [ ] Mises à jour de sécurité automatiques activées (`unattended-upgrades`) ; redémarrages du noyau planifiés
- [ ] `.env` en `chmod 600`, propriétaire `deploy`, **jamais** dans git ni dans une sauvegarde non chiffrée
- [ ] `JWT_KEY` unique par instance (`openssl rand -base64 48`), `ADMIN_PASSWORD` long et unique, remplacé par un mot de passe personnel dès la première connexion
- [ ] `OPENRESTO_VERSION` épinglée (pas `latest`)
- [ ] `https://<DOMAIN>/openapi/v1.json` répond 404 (vérifié par `smoke.sh`)
- [ ] En-têtes de sécurité présents (HSTS, `X-Frame-Options`, CSP) : `curl -sI https://<DOMAIN>/ | grep -i -E 'strict|frame|content-security'`
- [ ] Sauvegarde hors VM active, **chiffrée**, restauration rejouée une fois
- [ ] Uptime externe actif
- [ ] Docker mis à jour régulièrement (`apt-get upgrade`, au moins chaque trimestre) ; images OpenResto mises à jour avec `update.sh`
- [ ] Aucun `ports:` ajouté aux services autres que Caddy

### 10.2 RGPD

_Ce paragraphe décrit les faits techniques et une organisation raisonnable ; ce n'est pas un avis
juridique. À faire valider par un juriste ou un DPO avant d'engager des clients._

**Rôles.** Le restaurant est **responsable de traitement** des données de ses clients ; toi, qui
héberges et exploites l'application pour son compte, es **sous-traitant** (art. 28) ; l'hébergeur de
la VM est ton **sous-traitant ultérieur**. Il faut donc : un contrat de sous-traitance entre chaque
restaurateur et toi ; un DPA entre toi et l'hébergeur ; la liste de tes sous-traitants ultérieurs
(hébergeur, fournisseur SMTP, stockage de sauvegarde, service d'uptime).

**Quelles données, où.**

| Donnée                                                                      | Où                                                                                    | Finalité                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Nom, e-mail, téléphone, nombre de couverts, date/heure, remarques du client | Base SQLite (`DATA_DIR/db`) et sauvegardes                                            | Gérer la réservation, envoyer la confirmation   |
| Adresse IP des visiteurs                                                    | Journaux Caddy/nginx (conteneurs, 3 × 10 Mo) ; journal d'audit pour les actions admin | Sécurité, limitation de débit                   |
| Comptes admin (e-mail, mot de passe haché)                                  | Base                                                                                  | Accès à l'administration                        |
| Abonnements aux notifications (adresse push du navigateur)                  | Base                                                                                  | Rappels de réservation, si le client les active |
| Cookie « réservations récentes » (chiffré)                                  | Navigateur du client                                                                  | Retrouver ses réservations                      |
| Mots de passe SMTP                                                          | Base, chiffré avec `dp-keys/`                                                         | Envoi des mails                                 |

**Hébergement en UE.** VM en Belgique (à faire figurer au contrat All4Net), fournisseur SMTP et
stockage de sauvegarde **dans l'UE** (choisir la région à la création du compte). Aucune donnée n'est
envoyée à un service tiers par l'application elle-même. Seule exception : si le client active les
rappels push, l'adresse push est celle du navigateur (Google/Apple/Mozilla selon le navigateur) ;
les notifications natives passent par le service Expo si l'application mobile est publiée (non
activée dans ce kit).

**Durée de conservation — point d'attention.** L'application **ne purge pas automatiquement** les
réservations : elles restent en base tant qu'on ne les supprime pas. Seul le **journal d'audit** a
une rétention automatique (365 jours par défaut, réglable par `Audit__RetentionDays`). Il faut donc
**fixer une durée avec chaque restaurateur** (repères usuels : quelques mois à 3 ans après la date
de la réservation, à justifier par la finalité) et l'appliquer :

- à la main : dans l'admin, détail d'une réservation → **Supprimer définitivement (RGPD)**, ou
  `DELETE /api/admin/bookings/{id}` ; cela efface les données personnelles de la réservation ;
- les demandes de suppression d'un client passent par le restaurant (le formulaire de réservation
  l'indique) puis par cette même action ;
- **une purge automatique n'existe pas** : c'est un chantier à ouvrir si le nombre de clients le justifie.

**Les sauvegardes conservent les données supprimées** jusqu'à rotation : au plus ≈ 5 semaines en
local (7 jours + 4 semaines), `BACKUP_REMOTE_RETENTION_DAYS` (35 jours) à distance. À mentionner dans
la politique de conservation ; en cas de restauration, **rejouer les suppressions demandées depuis**.

**Registre des traitements (art. 30).** Chaque restaurateur tient le sien ; toi aussi, comme
sous-traitant. Modèle à recopier :

| Champ                     | À renseigner                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsable de traitement | Restaurant (nom, adresse, contact)                                                                                                         |
| Sous-traitant             | Toi (nom, contact) ; sous-traitants ultérieurs : All4Net (VM), fournisseur SMTP, stockage de sauvegarde                                    |
| Finalité                  | Gestion des réservations de tables ; envoi de confirmations                                                                                |
| Base légale               | Exécution de mesures précontractuelles à la demande de la personne (art. 6.1.b)                                                            |
| Catégories de personnes   | Clients ayant réservé ; personnel ayant un compte admin                                                                                    |
| Catégories de données     | Identité, e-mail, téléphone, détails de la réservation, adresse IP                                                                         |
| Destinataires             | Le restaurant ; les sous-traitants ci-dessus                                                                                               |
| Transferts hors UE        | Aucun (à confirmer pour chaque sous-traitant ultérieur)                                                                                    |
| Durée de conservation     | À fixer (voir ci-dessus) ; sauvegardes : 35 jours                                                                                          |
| Mesures de sécurité       | HTTPS, accès admin par compte nominatif, mots de passe hachés, sauvegardes chiffrées, journal d'audit, pare-feu, mises à jour automatiques |

## 11. Limites et décisions ouvertes

Ce que le kit **ne fait pas**, volontairement ou faute de temps :

1. **Plusieurs instances sur une même VM** : non livré (un Caddy partagé qui route par domaine est à
   écrire). À traiter avant le 2ᵉ client si les clients partagent une VM.
2. **Images Docker du fork** : le kit tire par défaut les images amont `ghcr.io/karanshukla/…` à une
   version précise (la 2.4.1 existe, vérifié). Ces images n'ont **pas** la lecture de `SMTP_*`
   (§6.1) ni le module de menus à venir : dès que le fork diverge, il faut publier ses propres
   images (workflow de publication à ajouter) et pointer `OPENRESTO_REGISTRY` dessus.
3. **Purge automatique des réservations** : absente de l'application (voir §10.2).
4. **Supervision** : sondes externes à brancher par toi ; aucune alerte n'est envoyée par la VM
   elle-même hormis le ping de sauvegarde.
5. **Application mobile native, passes Wallet, notifications push** : non configurées dans ce kit
   (variables VAPID présentes mais vides).
6. **Haute disponibilité** : aucune ; une VM, un SQLite. La reprise après sinistre = restauration
   d'une sauvegarde (quelques minutes) ; l'indisponibilité pendant une mise à jour est de l'ordre de
   la minute.

## 12. Ce qui a été testé, et ce qui ne l'est pas

|                                                                                                                                                                   | Testé                             | Comment                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Pile complète (Caddy → nginx → backend/frontend), 4 conteneurs `healthy`, HTTPS, `/api/health`, `/`, `/api/brand`, `/openapi` fermé                               | Oui                               | `deploy/tests/stack.test.sh` + `smoke.sh`, en local avec `DOMAIN=localhost` (certificat interne Caddy) |
| Adresse IP du visiteur transmise jusqu'au backend (et non celle de Caddy)                                                                                         | Oui                               | Témoin avec/sans `nginx-realip.conf`                                                                   |
| SMTP rempli depuis l'environnement, mot de passe jamais renvoyé ni journalisé                                                                                     | Oui                               | Tests unitaires + test de bout en bout                                                                 |
| Sauvegarde cohérente, rotation 7 + 4, somme de contrôle, échec de copie distante, restauration (ligne de base, média, réglages email), refus d'une archive abîmée | Oui                               | `deploy/tests/stack.test.sh`                                                                           |
| Copie distante réelle                                                                                                                                             | Oui (remote de type chemin local) | rclone 1.75                                                                                            |
| Obtention d'un vrai certificat Let's Encrypt                                                                                                                      | **Non**                           | Impossible hors d'un vrai domaine public ; la config Caddy est validée (`caddy validate`)              |
| Commandes d'installation de la VM (ufw, fail2ban, Docker, systemd), timer systemd                                                                                 | **Non**                           | Aucune VM réelle touchée ; commandes standard à rejouer avec attention                                 |
| Retour arrière après une mise à jour                                                                                                                              | **Non**                           | Procédure écrite, non rejouée automatiquement                                                          |
| Healthcheck du frontend avec `curl` (image de prod)                                                                                                               | **Non en local**                  | Dépôts de paquets Alpine bloqués dans l'environnement d'essai ; le job CI `deploy-kit` le couvre       |
