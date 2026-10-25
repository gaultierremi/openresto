# OpenResto en ligne de démonstration — serveur partagé

Adresse : **https://openresto.134-209-92-233.sslip.io**. Apprenti garde
**https://134-209-92-233.sslip.io**, ses conteneurs, ses volumes et ses ports 80/443.
Seul Gaultier lance les commandes ci-dessous sur le serveur. Aucun déploiement automatique.

Prévoir **10 minutes de manipulation**, plus la construction initiale des images
(5 à 15 minutes selon le serveur ; conserver au moins 3 Go de mémoire disponible
pour le build, en plus de la mémoire utilisée par Apprenti, et 5 Go de disque libre).
Prérequis : Ubuntu avec Git, Python 3, Docker et Docker Compose v2. Le DNS sslip.io
pointe ces deux noms vers 134.209.92.233 ; le Caddy existant obtient le certificat
du nouveau nom. Aucun nouveau port à ouvrir, aucune adresse e-mail à configurer.

## 1. Préparer les images et les secrets

Dans votre session SSH habituelle sur `134.209.92.233` :

```bash
(
set -euo pipefail
free -m
cd ~
git clone --branch feat/v5-demo-en-ligne https://github.com/gaultierremi/openresto.git openresto-demo
cd openresto-demo
./deploy/demo.sh preparer
./deploy/demo.sh construire
./deploy/demo.sh demarrer
)
```

Le sous-shell garde votre session SSH ouverte si une commande échoue. Vérifiez la
colonne `available` de `free -m` avant de construire. Le script construit l'API,
puis le frontend, puis nginx, l'un après l'autre, pour limiter le pic de mémoire
sur ce serveur partagé. Un export web à froid peut utiliser environ 2,4 Go à lui seul.

Après fusion de cette PR, utiliser `--branch main` pour une nouvelle installation.
Ne réutilisez pas un clone ou un fichier `.env` d'Apprenti. Le script utilise
toujours le projet Compose `openresto-demo` et ignore les variables Compose et
les secrets de démonstration exportés dans le shell.

Le mot de passe visiteur (`DEMO_PASSWORD`, utilisateur **demo**), celui de l'admin
(`DEMO_ADMIN_PASSWORD`, identifiant **admin@openresto-demo.example**) et la clé JWT
sont générés dans `deploy/demo.env`, permissions **600**, ignoré par Git et par les
builds Docker. Consultez ce fichier dans votre éditeur privé pour vous connecter ;
ne le collez ni dans une PR ni dans un message. Ne partagez que le mot de passe
visiteur avec les personnes invitées à la démonstration. L'image httpd sert
uniquement à calculer bcrypt, sans réseau, puis disparaît.

Relancer ces commandes conserve les secrets et la base existants. Le premier
démarrage applique les migrations EF, puis remplace uniquement les deux exemples
automatiques du projet dans une base sans réservation ni configuration utilisateur.
Il crée « L'Atelier des Nuages », restaurant et adresse inventés, trois tables,
trois plats en français avec traductions néerlandaises et anglaises, en euros.
Pas de réservation préexistante, aucun vrai client ni vrai restaurateur.

## 2. Raccorder le Caddy existant, sans redémarrer Apprenti

Depuis votre session SSH, valider une copie avant d'écrire dans la configuration
réelle. Le sous-shell ci-dessous conserve la session ouverte en cas d'erreur :

```bash
(
set -euo pipefail
cd ~/openresto-demo
CADDY="$(docker ps --filter publish=443 --format '{{.Names}}')"
test -n "$CADDY"
test "$(printf '%s\n' "$CADDY" | wc -l)" -eq 1
docker inspect "$CADDY" --format 'Caddy : {{.Name}} ; service : {{index .Config.Labels "com.docker.compose.service"}}'
CADDYFILE="$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')"
if [ -z "$CADDYFILE" ]; then
  CADDYDIR="$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}')"
  test -n "$CADDYDIR"
  CADDYFILE="$CADDYDIR/Caddyfile"
fi
test -f "$CADDYFILE"
test ! -e "$CADDYFILE.avant-openresto"
CANDIDAT="$(mktemp)"
trap 'rm -f "$CANDIDAT"' EXIT
sudo cat "$CADDYFILE" | tee "$CANDIDAT" >/dev/null
cat deploy/demo/caddy-existant.caddy >> "$CANDIDAT"
docker exec -i -w /etc/caddy "$CADDY" caddy validate --config - --adapter caddyfile < "$CANDIDAT"
sudo cp -a "$CADDYFILE" "$CADDYFILE.avant-openresto"
docker network connect openresto-demo-caddy "$CADDY"
if ! { cat "$CANDIDAT" | sudo tee "$CADDYFILE" >/dev/null &&
  docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; }; then
  sudo cat "$CADDYFILE.avant-openresto" | sudo tee "$CADDYFILE" >/dev/null
  docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  exit 1
fi
)
```

Si la validation de la copie échoue, le fichier réel et le Caddy actif restent
intacts. Le bloc commence par une ligne vide : il fonctionne aussi lorsque le
fichier d'origine n'a pas de retour à la ligne final. Si l'écriture ou le rechargement échoue,
la copie d'origine est rétablie immédiatement. Le réseau peut alors rester raccordé ;
le §5 permet de le retirer. Si le serveur utilise un autre chemin de Caddyfile,
adaptez uniquement ce chemin d'après les montages du conteneur ; ne remplacez
jamais la configuration d'Apprenti. Le bloc ajouté est simplement :

```caddyfile
openresto.134-209-92-233.sslip.io {
    reverse_proxy openresto-demo-acces:80
}
```

La protection par mot de passe reste **dans la pile OpenResto** : pages HTML,
médias, admin et API, avec une seule exception, la lecture `GET /api/menus/r/<jeton>`
ou `GET /api/menus/t/<jeton>`. Ces cartes fictives sont publiques par leur jeton
aléatoire de 128 bits, afin que la requête du navigateur sans identifiants HTTP
puisse les charger. Un POST sur ces chemins reste protégé, tout comme la page HTML
`/menu/r/<jeton>` ou `/menu/t/<jeton>`. Le réseau externe `openresto-demo-caddy`
relie seulement le Caddy existant à `openresto-demo-acces`. Ne raccordez jamais
la base, l'API ou le frontend à ce réseau. Aucun service OpenResto ne publie de port.
Les réseaux `facade` et `interne` sont internes à Docker ; SQLite, les clés de
session et les médias ont leurs volumes propres, préfixés `openresto-demo_`.

## 3. Conserver le raccordement après une recréation de Caddy

`docker network connect` survit à un redémarrage, mais pas à une recréation du
conteneur. Dans le **dossier Compose d'Apprenti**, ajouter un fichier
`compose.openresto-demo.yml` (adapter `caddy` si le service affiché au §2 porte un
autre nom). Le modèle prêt à copier se trouve dans
[`deploy/demo/compose.caddy.yml`](../deploy/demo/compose.caddy.yml) :

```yaml
services:
  caddy:
    networks:
      default: {}
      openresto-demo-caddy: {}
networks:
  openresto-demo-caddy:
    external: true
    name: openresto-demo-caddy
```

Valider sans rien recréer, en reprenant **tous les fichiers Compose habituellement
utilisés pour Apprenti**, puis ajouter ce fichier en dernier. `default` garde
le réseau implicite d'Apprenti ; les réseaux nommés explicitement dans son fichier
de base sont conservés par la fusion Compose :

```bash
docker compose -f docker-compose.yml -f compose.openresto-demo.yml config -q
```

Pour les prochaines mises à jour d'Apprenti, ajouter aussi
`-f compose.openresto-demo.yml` à sa commande habituelle. Cette surcharge conserve
ses réseaux actuels. Ne lancez aucun `up`, `down` ou `restart` sur Apprenti pour
installer cette démonstration.

Lors de la première mise à jour future avec cette surcharge, Compose recréera
le conteneur Caddy : prévoir quelques secondes d'interruption à un moment calme
et conserver son volume `/data` pour les certificats. Si Apprenti utilise déjà
des réseaux explicites, cette surcharge ajoute également `default` à Caddy.
Si le réseau externe a été supprimé, recréez-le avec
`docker network create openresto-demo-caddy` avant cette mise à jour, ou retirez
la surcharge des commandes Apprenti si la démonstration n'est plus utilisée.

## 4. Vérifier et montrer la démonstration

```bash
(
set -euo pipefail
cd ~/openresto-demo
./deploy/demo.sh verifier
curl -s -o /dev/null -w '%{http_code}\n' https://openresto.134-209-92-233.sslip.io/
curl -s -o /dev/null -w '%{http_code}\n' https://134-209-92-233.sslip.io/
)
```

La première URL répond **401** sans mot de passe ; la seconde doit garder son
comportement habituel. Dans le navigateur : saisir **demo** et le mot de passe
visiteur, puis ouvrir `/locations/1` pour réserver avec une identité inventée et
une adresse `visiteur@openresto-demo.example`. Depuis `/admin/login`, utiliser
l'identifiant admin indiqué au §1 et son mot de passe distinct ; aller dans
**QR codes**, copier l'adresse affichée sous le code du restaurant dans un nouvel
onglet, puis passer de FR à NL et EN. Il n'y a pas de bouton d'ouverture de la carte.
Les trois noms de plats et leurs descriptions changent ; les titres de carte et
de catégorie sont volontairement trilingues.

Aucun SMTP n'est configuré ; les confirmations e-mail sont désactivées. L'API n'a
pas d'accès Internet sortant, même si un visiteur admin ajoute une configuration
SMTP. Aucun prestataire de paiement n'est configuré et aucun paiement n'est demandé.
Ne saisissez ni adresse réelle, ni carte bancaire, ni vraie donnée personnelle.
Le test de la réservation se termine à sa confirmation dans le navigateur.
Cette instance n'est pas destinée à accueillir un restaurant réel. Les connexions
peuvent laisser des IP techniques dans l'audit applicatif ; arrêtez la pile en fin
de démonstration et ne publiez pas de copie de sa base.

## 5. Retour arrière (moins d'une minute)

Depuis la session SSH, **restaurer d'abord Caddy** puis arrêter OpenResto. La
détection des chemins est répétée, sans dépendre des variables du sous-shell du §2 :

```bash
(
set -euo pipefail
CADDY="$(docker ps --filter publish=443 --format '{{.Names}}')"
test -n "$CADDY"
test "$(printf '%s\n' "$CADDY" | wc -l)" -eq 1
CADDYFILE="$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')"
if [ -z "$CADDYFILE" ]; then
  CADDYDIR="$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}')"
  test -n "$CADDYDIR"
  CADDYFILE="$CADDYDIR/Caddyfile"
fi
test -f "$CADDYFILE.avant-openresto"
sudo cat "$CADDYFILE.avant-openresto" | docker exec -i -w /etc/caddy "$CADDY" caddy validate --config - --adapter caddyfile
sudo cat "$CADDYFILE.avant-openresto" | sudo tee "$CADDYFILE" >/dev/null
docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker network disconnect openresto-demo-caddy "$CADDY"
cd ~/openresto-demo
./deploy/demo.sh arreter
)
```

Retirer ensuite la surcharge
`compose.openresto-demo.yml` des futures commandes Apprenti et supprimer ce fichier.
Si Caddy a été modifié pour un autre besoin entre-temps, retirer seulement le bloc
OpenResto au lieu de restaurer toute l'ancienne copie. Les volumes OpenResto restent
disponibles pour reprendre la démo. Aucun `down -v`, nettoyage global ou suppression
de volume Apprenti n'est nécessaire.

## Choix de cette PR

- Source : `main` à jour au démarrage du chantier, sans dépendre des autres PR. La base est SQLite,
  conformément au projet ; aucun serveur PostgreSQL ajouté, aucune migration nouvelle.
- Le profil `scripts/demo_online_data.py` réutilise l'assemblage et l'émission SQL
  de `scripts/demo_data.py`, sans modifier ce dernier, pour éviter les conflits de chantier.
  Le SQL est envoyé directement à SQLite, sans fichier SQL numéroté à attribuer.
- `.bifrost/status.json` reste intact : au démarrage du chantier, la PR #25 le touchait déjà.
  L'erreur signalée correspond bien à `En relecture`, valeur absente de l'énumération
  Heimdall (`En cours`, `Prête à merger`, `Terminé`, `Bloqué`). Sa correction appartient
  à cette PR dédiée, conformément à la consigne de non-concurrence.
