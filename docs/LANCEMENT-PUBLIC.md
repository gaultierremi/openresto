# Lancement public d’OpenResto — CX-O1

L’accueil présente les réservations, la carte QR et le site vitrine. Deux entrées conduisent à l’inscription d’un restaurateur et à la recherche d’une table. Le premier établissement est gratuit, sans commission et sans carte bancaire. Un établissement supplémentaire relève d’un accord distinct ; aucun paiement n’est déclenché par ce parcours.

## Activer l’accueil et l’inscription

Sur une version construite depuis cette branche, ajouter `OPENRESTO_PUBLIC_LAUNCH=true` dans le fichier de configuration du kit de production (`deploy/.env`) ou du kit pour serveur partagé (`deploy/serveur-partage.env`). Les deux recettes transmettent cette valeur à `PublicLaunch:Enabled` dans ASP.NET. Pour une autre installation, définir directement `PublicLaunch__Enabled=true` dans l’environnement du backend. Le propriétaire effectue lui-même le redémarrage de l’instance.

Sans cette option, l’accueil existant est conservé et l’inscription publique est fermée. `/decouvrir` permet de relire la présentation. Avec l’option, `/` sert l’accueil public en français et `/decouvrir` y redirige. Les pages des restaurants, le parcours client et les liens déjà diffusés conservent leurs adresses.

Configurer l’adresse HTTPS publique dans les réglages de marque, puis tester la messagerie depuis l’administration. Sur une base existante, les variables SMTP ne remplacent pas les réglages déjà enregistrés : l’écran d’administration reste la référence. Une adresse publique HTTPS et une messagerie fonctionnelle sont nécessaires à l’envoi des liens d’inscription. Une indisponibilité affiche un message en français et permet de recommencer.

L’accueil, les documents légaux, la liste des restaurants et la carte QR sont des documents HTML rendus par le backend, sans JavaScript, police distante ni service externe. Les pages de réservation et de recherche utilisent un petit script de même origine, autorisé par son empreinte CSP, pour appeler les API de blocage de table, de réservation, de recherche et d’annulation existantes. Les disponibilités restent calculées par le service existant ; les créneaux sont convertis en UTC à partir du fuseau du restaurant, y compris après minuit.

Le proxy doit utiliser la configuration nginx de cette version : elle route aussi `/locations`, `/locations/{id}`, `/lookup`, `/booking-confirmation/{ref}` et `/menu/{r,t}/{token}` vers le backend. Lorsque le mode public est désactivé, le backend signale explicitement au proxy de servir le frontend existant. Un restaurant privé ou une carte introuvable conserve une vraie réponse 404.

## Parcours et données

1. Le restaurateur indique le nom de son restaurant et son adresse e-mail. Le formulaire est protégé contre les requêtes frauduleuses et limité par adresse IP.
2. Un e-mail contient un lien personnel valable quatorze jours. Le navigateur ne reçoit aucun jeton dans la réponse du formulaire. Un renvoi réutilise le même brouillon et remplace le lien précédent. Une adresse déjà inscrite obtient la même page de confirmation et peut utiliser la connexion existante.
3. Depuis le lien, le restaurateur choisit un mot de passe et accepte les versions courantes des conditions, de la confidentialité et de l’accord de sous-traitance. Le journal conserve les versions, les empreintes des textes et la date d’acceptation.
4. L’assistant existant enregistre les coordonnées légales, les horaires, les salles et les tables, puis propose la carte et l’identité visuelle. Le restaurateur prévisualise avant de publier. Les étapes obligatoires sont vérifiées côté serveur.
5. La publication rend le restaurant visible, son site accessible et sa carte QR consultable. Un client peut rejoindre sa page de réservation depuis son site, choisir une date et un créneau, confirmer avec son nom et son e-mail, puis retrouver ou annuler sa réservation avec sa référence et son adresse e-mail. Aucune donnée personnelle n’est ajoutée à l’URL de la page ni au stockage local par ce parcours.

Un brouillon n’est jamais visible aux clients. Le compte créé reste un compte restaurateur, sans accès aux API d’administration ni à l’espace plateforme. Les demandes non finalisées sont supprimées par le passage quotidien de rétention trente jours après la dernière demande, si aucun compte ni aucune réservation n’y est associé. Une erreur SMTP conserve temporairement le brouillon pour permettre la reprise.

Les pages d’inscription et les liens personnels ont des en-têtes interdisant leur mise en cache et leur indexation. Le service worker ne conserve ni les formulaires ni les pages d’administration ou d’inscription. Les documents juridiques restent en `noindex` pendant leur statut de modèle.

## Textes à compléter avant une ouverture réelle

Les quatre documents proviennent du même `LegalCatalog` pour l’API, les pages publiques et les consentements. Ils portent la version `2026-10-22` et affichent leur statut de modèle. L’exploitant doit compléter ses coordonnées, son identité légale, l’hébergeur, la messagerie, les pays de traitement, les durées des journaux et les informations entre crochets, puis faire valider les textes et les pratiques par un juriste. Une modification des textes impose une nouvelle version du catalogue.

La politique distingue les données des restaurateurs et celles de leurs clients. Elle décrit le formulaire d’inscription, les stockages nécessaires, les droits, les journaux techniques et les transferts à vérifier. Elle ne présente pas le modèle comme une validation juridique acquise.

## Vérification reproductible

La suite `Lancement public` de GitHub Actions construit une pile isolée en environnement `Testing`. Sa messagerie est une boîte de test locale, sans envoi vers Internet. Les identifiants de l’administration sont générés pour le run. Aucun identifiant réel n’est nécessaire.

```bash
export OPENRESTO_TEST_JWT_KEY="$(openssl rand -hex 48)"
export OPENRESTO_TEST_ADMIN_PASSWORD="$(openssl rand -hex 24)"
docker compose -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.launch.yml up -d --build --wait
cd openresto-frontend
npm ci
npx playwright install --with-deps chromium
npx playwright test -c playwright.launch.config.ts
node scripts/audit-public-launch.mjs
cd ..
docker compose -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.launch.yml down -v
```

Le test couvre la navigation sans JavaScript, le clavier, l’affichage mobile, les contrôles WCAG AA par axe, l’inscription par e-mail, les consentements, la reprise de l’assistant, la publication, la carte et la réservation client. Les tests HTTP vérifient aussi les refus sans écriture, l’absence de privilèges administratifs, la panne SMTP et la limite des trente jours.

L’audit Lighthouse utilise le profil mobile standard et vérifie un minimum de 90 en performance et en accessibilité. Il couvre aussi le formulaire de réservation et la carte QR du restaurant publié par le test. Il produit les rapports HTML/JSON et les scores dans `openresto-frontend/lighthouse-launch/`. Le score SEO des formulaires et des modèles est volontairement réduit par leur directive `noindex`. Le sitemap inclut l’accueil canonique et les seuls sites de restaurant publiés ; les données structurées `Restaurant` restent celles des sites existants.

Les rapports et captures des tests sont conservés dans l’artefact Actions `lancement-public-preuves`. Les captures de référence se trouvent dans `docs/captures/cx-o1/`.

Aucune modification du schéma de données ni migration SQL n’est nécessaire. Aucune instance réelle n’a été modifiée par ce chantier.
