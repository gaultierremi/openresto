# Langues d’OpenResto en Belgique

Les parcours clients (carte QR, réservation, confirmation et e-mails) et le site public sont disponibles en français, néerlandais et anglais. La langue du navigateur est reconnue, y compris `fr-BE`, `nl-BE` et `en-GB`. Le visiteur peut toujours en choisir une autre.

Dans l’application, le choix est mémorisé sur l’appareil. Un lien `?lang=fr`, `?lang=nl` ou `?lang=en` permet de transmettre la langue du site à la réservation et de l’e-mail à la confirmation. Un nouveau choix met également ce paramètre à jour. Le site public, sans JavaScript ni cookie, utilise des liens FR / NL / EN et l’en-tête `Accept-Language` ; sans langue reconnue, il s’ouvre en français.

L’espace restaurateur `/onboarding` est entièrement traduit en français et néerlandais, suit le navigateur et propose un sélecteur sur la connexion, l’invitation et l’assistant. L’administration de la plateforme garde ses langues existantes ; ses textes non traduits en néerlandais se replient sur le français.

## Saisir les plats

Dans l’étape **Carte** de l’assistant ou l’éditeur de plats de l’administration :

1. Saisir le nom et la description principaux.
2. Indiquer leur langue avec **Langue principale du plat**.
3. Saisir les noms et descriptions des deux autres langues dans leurs champs dédiés.

Chaque champ traduit laissé vide reprend le champ principal correspondant. Le nom peut donc être traduit sans la description. Le repli s’applique à la carte QR, au site et à ses données structurées. Les intitulés de cartes et catégories et les autres textes libres du restaurateur restent tels qu’il les a saisis.

Aucun service de traduction n’est appelé et aucune clé externe n’est nécessaire. Les textes juridiques existants restent les modèles français à faire valider juridiquement ; leurs titres et les commandes de l’interface sont traduits.

## Stockage et compatibilité

La migration additive `AddDishTranslations` ajoute `MenuItems.PrimaryLanguage` (français par défaut pour les plats existants) et `MenuItems.TranslationsJson` (facultatif). Les textes actuels restent dans `Name` et `Description`. Aucune réservation ni aucun plat n’est supprimé.

Les API de plats et de l’assistant acceptent `primaryLanguage` et `translations`, un objet indexé par `fr`, `nl` et `en`. Omettre les traductions préserve celles déjà enregistrées ; envoyer `{}` les efface. Les langues inconnues et les textes dépassant les limites existantes sont refusés avant écriture. L’assistant valide les traductions de tous les plats avant de commencer à enregistrer la carte.

## Vérification

- Tests backend : `dotnet test OpenRestoApi.Tests/OpenRestoApi.Tests.csproj`.
- Tests frontend : `npm test --prefix openresto-frontend -- --runInBand`, puis `npm run test:android --prefix openresto-frontend -- --runInBand`.
- Parcours navigateur : démarrer la pile avec `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build`, puis `npm run test:e2e --prefix openresto-frontend -- multilingual.spec.ts`.

Le scénario `multilingual.spec.ts`, inclus dans les tests smoke de chaque PR, vérifie les trois langues du navigateur, les plats traduits et leur repli, le site, la réservation par l’interface, la langue envoyée à l’API, la confirmation et sa persistance après rechargement. Il vérifie aussi la saisie des traductions dans l’assistant et le changement de langue de la connexion restaurateur en français et néerlandais. Les tests backend couvrent le contenu des e-mails et la langue de leurs liens.
