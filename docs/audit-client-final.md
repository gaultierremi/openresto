# Audit du parcours du client final

Ce que voit la personne qui réserve ou qui scanne la carte QR à table, sur un téléphone de
375 px. Cet audit sert de plan : chaque constat porte un identifiant (R, C, A, M, X, V) que les
PR de correction reprennent.

## Périmètre et méthode

- **Hors périmètre**, parce qu'une autre session s'en occupe (PR #8) : l'inscription du
  restaurateur, l'espace plateforme, les pages légales, le néerlandais. Rien de ce qui suit n'y touche.
- **Instance** : backend ASP.NET en `Development` sur une base jetable remplie par
  `scripts/seed-local.sh` (restaurants et clients fictifs, « Marie Test » pour les essais),
  frontend servi depuis `expo export --platform web`, c'est-à-dire ce que sert la production.
- **La carte QR n'est pas sur `main`.** Le module menu vit dans la PR #2 (ouverte) ; la carte a
  donc été auditée sur la branche `feat/menu-api`, la tête de cette PR. Les corrections qui la
  concernent ne peuvent atterrir qu'après elle (voir « Plan »).
- **Captures** : Playwright, Chromium, 375 × 812 à l'échelle 2, tactile.
  `openresto-frontend/scripts/capture-client-audit.mjs` les refait et réaffiche les chiffres cités
  ici (`docs/captures/client-final/`).
- **Accessibilité** : axe-core 4.10 (WCAG 2.0/2.1/2.2 A et AA) sur l'accueil, les lieux, la feuille
  de réservation, la confirmation, la recherche de réservation et la carte, en clair et en sombre.
- **Vitesse** : Chromium avec CPU ralenti ×4 et réseau simulé (4G : 9 Mb/s, 170 ms d'aller-retour ;
  4G lente : 1,6 Mb/s, 150 ms). Le serveur d'essai compresse en gzip comme nginx.
- **Pas fait** : aucun essai sur un vrai téléphone, aucun lecteur d'écran lancé (NVDA, VoiceOver,
  TalkBack) — axe ne voit qu'une partie de ce que vit un utilisateur de lecteur d'écran —, aucune
  photo de plat (les données de démonstration n'en ont pas), et le français est la seule langue
  guest vérifiée à l'œil.

## Résumé

| Id  | Constat                                                                                                    | Gravité | Correction         |
| --- | ---------------------------------------------------------------------------------------------------------- | ------- | ------------------ |
| C1  | L'heure de la confirmation suit le fuseau du téléphone, pas celui du restaurant                            | haute   | PR #12             |
| X1  | La couleur de marque échoue le contraste AA (3,3 à 3,8 : 1) en texte et en bouton                          | haute   | PR #13             |
| R1  | L'heure choisie n'apparaît pas dans la liste de pastilles de la feuille                                    | moyenne | PR #14             |
| X2  | « Book now » et « Details » : 36 px de haut                                                                | moyenne | PR #14             |
| X3  | Pastilles d'heure et onglets sans `aria-checked` / `aria-selected` dans le DOM, aucun repère `main`        | moyenne | PR #14 (en partie) |
| R3  | Le bouton Confirmer est sous le pli de la feuille de réservation                                           | moyenne | PR #15             |
| C3  | La page de confirmation contacte Nominatim et OpenStreetMap à son ouverture                                | moyenne | PR #16             |
| M2  | Filtres allergènes et régime jamais mémorisés, panneau fermé à chaque scan                                 | moyenne | PR #17 (sur #2)    |
| A1  | Le lien de la réservation porte l'adresse e-mail du client dans l'URL                                      | moyenne | reportée           |
| M1  | La carte (4,8 Ko de données) attend 1,16 Mo de JavaScript : 4,6 s en 4G, 9,6 s en 4G lente                 | haute   | après #2 et #8     |
| V1  | Un seul paquet de 4,2 Mo (1,1 Mo en gzip) pour toutes les pages, administration comprise                   | moyenne | à étudier          |
| C2  | Le courriel de confirmation n'a ni lien calendrier, ni autre langue, et promet une modification impossible | moyenne | après PR #8        |

## Parcours 1 — Réserver une table en moins de 30 secondes, sans compte

Écran de départ : la page Lieux (`01-locations.png`) montre déjà, par lieu, les trois prochaines
heures libres et « +27 » pour le reste. Un appui sur une heure ouvre la feuille de réservation
(`02-booking-sheet.png`).

**Chemin mesuré** : 1 appui sur l'heure → 2 champs (nom, e-mail ; `autocomplete` posé, `type=email`)
→ 1 appui sur « Confirm Booking ». Scripté, frappe comprise : 3,5 s, dont environ 2 s d'attente
d'une tenue de table (« Checking availability… », bouton grisé). Par une personne, au pouce, l'ordre
de grandeur est de 15 à 25 s : l'objectif des 30 s est tenu. **Ce chiffre n'est pas mesuré sur
une personne.**

Il n'y a pas de champ inutile : pas de téléphone, pas de compte, le message libre est optionnel.
Le formulaire est déjà au minimum ; ce qui reste est de la friction de lecture.

- **R1 — l'heure choisie disparaît.** On touche 09:00 sur la carte du lieu ; la feuille s'ouvre sur
  l'onglet « Lunch » (11:30 à 13:30) où 09:00 n'est pas. Seul « Exact time » la rappelle, plus bas.
  Le client ne voit pas ce qu'il a choisi (`02-booking-sheet.png`). `PopularTimesPicker` démarre
  toujours sur « Lunch » quand l'onglet se choisit, sans regarder l'heure déjà retenue.
- **R2 — deux sélecteurs pour la même heure** (pastilles, puis « Exact time »). Cohérent mais
  redondant ; non traité, parce que le retirer change la mise en page de la feuille et de la page
  de réservation et que R1 règle le plus gênant.
- **R3 — le bouton de confirmation est sous le pli** (`03-booking-sheet-bottom.png`) : il faut
  traverser « Choose a section or table » et un paragraphe de six lignes sur les données. Sur
  téléphone natif il est déjà ancré (`DockedBookingSubmit`) ; sur le web non. Corrigé par la PR #15.

## Parcours 2 — Scanner le QR et lire la carte

Constaté sur la branche de la PR #2. La carte est bien pensée : une page par jeton QR (le jeton est
une chaîne de 22 caractères, 128 bits ; un jeton inconnu, un lieu archivé et un lieu sans carte
publiée répondent le même 404), les 14 allergènes du règlement (UE) 1169/2011, trois filtres de
régime en pastilles de 44 px, un bouton « Réserver une table » toujours visible, un sélecteur de
langue (`07-qr-menu.png`, `08-qr-menu-allergens.png`).

- **M1 — la carte attend le programme.** La réponse de l'API pèse **4 863 octets** ; la page
  doit d'abord charger **1 161 Ko** (gzip) de JavaScript. Premier plat lisible après **4,6 s** en 4G
  et **9,6 s** en 4G lente, CPU ralenti. Tant que le paquet n'est pas arrivé, l'écran est vide.
  Le service worker laisse passer `/api/` sans le mettre en cache et l'écran ne garde rien en
  stockage : une page déjà ouverte n'affiche pas la carte hors réseau. La seule vraie
  réponse est une page HTML servie par le backend, comme le fait déjà la PR #8 pour le site du
  restaurant (`/r/<slug>`, route nginx dédiée) ; elle suppose les PR #2 et #8 et leur routage
  nginx, d'où « après #2 et #8 » et non une PR de plus ici.
- **M2 — le filtre allergènes demande deux appuis, et chaque scan repart de zéro.** « Éviter des
  allergènes » est replié ; le choix n'est écrit nulle part. Une personne allergique le refait à
  chaque table, chaque visite. Ce qui existe est correct une fois ouvert : 14 pastilles de 44 px,
  la liste se réduit sur-le-champ (21 plats, 13 après « Gluten » dans les données d'essai),
  et un rappel de signaler l'allergie au personnel.
- **M3 — contraste** : 4 éléments sous AA (même cause que X1, couleur de marque).
- **M4 — langue** : l'interface de la carte suit la langue choisie, mais les noms et descriptions
  des plats sont saisis dans une seule langue par le restaurateur ; il n'y a pas de traduction par
  plat. Corriger demande une migration : hors de ce chantier, à décider avec la PR #8 (néerlandais).
- **M5 — photos** : le composant existe (`MenuPhoto`) ; non vérifié avec de vraies photos.

## Parcours 3 — Recevoir la confirmation

La page de confirmation est complète : référence en un appui (« Copy », « Share »), ajout à
Google, Outlook ou fichier `.ics`, itinéraire Google ou Apple (`04-confirmation.png`).

- **C1 — l'heure est fausse hors du fuseau du restaurant.** La feuille de réservation annonce
  « All times are in America/New York » ; la confirmation, elle, formate avec le fuseau du
  téléphone (`fmtTime`/`fmtDateTime` sans `timeZone`). Même réservation, deux téléphones :
  **09:30 AM** sur un appareil réglé sur New York, **03:30 PM** sur un appareil réglé sur Bruxelles
  (`05-link-other-timezone.png`). Pour un restaurant belge et des clients belges l'écart est nul ;
  pour un touriste, un voyageur, un téléphone mal réglé, il fait manquer la table. `fmtDateTimeInZone`
  existe déjà et n'est pas utilisée ici.
- **C2 — le courriel** (`EmailTemplateService`) : en anglais seulement, sans lien calendrier, et il
  écrit « Need to change or cancel your reservation? » alors que la page répond « This booking cannot
  be modified ». Traiter le courriel maintenant entrerait en conflit avec la PR #8, qui y change les
  textes et la langue : à reprendre après elle.
- **C3 — deux services tiers dès l'ouverture.** `BookingResultPanel` envoyait l'adresse du restaurant
  à Nominatim depuis le navigateur du client, sans qu'il ait rien demandé (et sur toutes les
  plateformes, application native comprise, alors que seul le web dessine la carte), puis intégrait un
  cadre OpenStreetMap : deux tiers apprennent l'IP du client à chaque ouverture de sa réservation, et la
  connexion faible paie le poids. Mesuré : `nominatim.openstreetmap.org` contacté dès que la page s'ouvre.
  Corrigé par la PR #16 : la carte se charge à l'appui sur « Afficher la carte ».

## Parcours 4 — Annuler ou modifier depuis le lien reçu

Le lien du courriel ouvre `/booking-confirmation/<réf>?email=<adresse>` : **sans connexion**, un
appui sur « Cancel This Booking », une confirmation (`06-cancel-prompt.png`). Cela fonctionne,
téléphone sans cookie compris.

Ce qui protège déjà : la référence est tirée d'un générateur cryptographique (trois mots plus quatre
chiffres, 1,77 milliard de combinaisons, environ 30,7 bits), il faut la référence **et** l'adresse,
les routes « par référence » ont un limiteur serré, et l'annulation se ferme d'elle-même 5 minutes
après l'heure de la réservation (`Booking.CanBeCancelledAt`) : le lien « expire » donc déjà pour
l'annulation.

- **A1 — l'adresse e-mail est dans l'URL.** Elle part dans l'historique du navigateur et dans les
  journaux d'accès du serveur (la requête de page, puis les appels à l'API, qui portent la page en
  `Referer` ; la politique `strict-origin-when-cross-origin` de nginx empêche en revanche qu'elle
  parte vers un autre domaine). Un jeton signé, à durée limitée, qui remplace l'adresse dans le lien
  règle cela sans stocker quoi que ce soit (donc sans migration). **Reportée** : le lien est
  fabriqué par `BookingLinks`, appelé par le courriel, la notification de rappel et les cartes
  Wallet ; le courriel et son service passent par `IEmailTemplateService` et
  `BookingConfirmationService`, que la PR #8 réécrit (langue de la réservation, néerlandais). Une
  PR qui y touche maintenant se heurterait à elle ; elle se fait mieux après sa fusion.
- **A2 — pas de modification.** « This booking cannot be modified. However, feel free to cancel and
  rebook » : l'annulation puis une nouvelle réservation est le chemin. Pas de correction proposée ici.
- **A3 — la page reste consultable après l'heure** avec nom et adresse du client, sans échéance.
  Un jeton qui porte la sienne y mettrait un terme ; c'est la part de A1 qui est reportée.

## Accessibilité

axe-core, 375 px, en clair et en sombre.

- **X1 — contraste de la couleur de marque.** `#059669` (la couleur de démonstration) échoue partout où
  elle sert : texte d'onglet et de lien sur `#f2f3f5` **3,39 : 1**, pastilles de tags **3,25**, « Details »
  et « +27 » sur blanc **3,76**, et le blanc sur le bouton rempli (« Book now », « Confirm », « Lunch »)
  **3,76**. Le seuil AA est 4,5 pour ce corps de texte. En sombre, le texte de marque est à 4,3 et
  le blanc sur bouton à 3,76 toujours. Le restaurateur choisit sa couleur : tout ce qu'il choisira
  d'un peu clair échouera de la même façon. `useAppTheme().primaryColor` est le point par où tout
  passe (plus de 400 usages dans le code).
- **X2 — zones tactiles.** « Book now » et « Details » : 36 de haut, sans zone élargie. Le nom du
  restaurant dans la barre du haut (lien de 36) non plus. « Go back », « Open menu » (36 × 36) et le
  lien du pied de page (32) portent déjà un `hitSlop` qui les amène à 44 ou plus : leur boîte
  mesure moins que ce qu'on peut toucher, ce n'est pas un défaut. Les pastilles d'heure (44), les
  champs (44) et la confirmation (50) sont bons. La règle de la maison est 44 px (WCAG 2.5.5).
- **X3 — rôles et noms.** Les pastilles d'heure sont `role=radio` sans `aria-checked` (axe : critique,
  5 éléments) et les onglets Lunch/Dinner/All `role=tab` sans `aria-selected` : react-native-web
  n'émet pas l'état pour ces deux rôles, un lecteur d'écran ne sait pas lequel est choisi. Les
  `dialog` des feuilles ont un nom, mais react-native-web enveloppe tout `Modal` d'un `dialog` sans
  nom que l'application ne peut pas étiqueter (axe : `aria-dialog-name`) ; aucune page n'a de repère
  `main` (axe : 3 à 12 éléments hors repère, la barre de navigation porte déjà `role=navigation`).
  La PR #14 règle les deux premiers ; le conteneur du `Modal` et le repère `main` restent.
- **Bon** : `autocomplete` et `type=email` sur les champs, `aria-expanded` sur le panneau d'allergènes,
  `aria-checked` sur les filtres de la carte, libellés accessibles en clair sur chaque bouton d'heure
  (« Book Paddy's Pub at 09:00 »).

## Vitesse

- **V1 — poids.** Le paquet web est unique : **4,2 Mo (1,1 Mo en gzip)**, chargé tel quel par la page
  Lieux, la carte et la confirmation, administration comprise. Mesuré sur la page Lieux, CPU ×4 :
  premier affichage **3,9 s** (4G) et **8,1 s** (4G lente) ; première heure réservable visible
  **6,5 s** et **10,2 s**. Un essai avec le découpage par route d'Expo Router
  (`asyncRoutes`, web) donne 908 Ko en gzip pour une page Lieux contre 1 103 Ko : **−18 %**, pas
  plus, parce qu'un bloc commun de 578 Ko reste partagé. Pas adopté : le gain ne justifie pas le
  risque de transitions vides, et le vrai levier est M1 (une page légère pour la carte). Une analyse
  du contenu du bloc commun reste à faire.
- nginx compresse déjà en gzip et met en cache les fichiers `/_expo/static/` pour un an
  (`immutable`) : les visites suivantes ne repayent pas ce poids.
- Rendu bloqué par `/api/brand` : `BrandProvider` n'affiche qu'un écran de chargement avant la
  réponse, un aller-retour de plus après le paquet.

## Ce qui est déjà bon (à ne pas défaire)

Réservation sans compte et sans téléphone ; tenue de table de 5 minutes avec compte à rebours ; fuseau
du restaurant annoncé dans la feuille ; ajout au calendrier en trois formats ; jetons de carte de
128 bits avec 404 uniforme ; allergènes réglementaires ; filtres de 44 px ; mode sombre ; langues
EN, FR, ES, DE ; annulation sans connexion limitée dans le temps.

## Plan : une PR par sujet, par ordre d'impact

| PR  | Sujet                                                                  | Constats   | Base            |
| --- | ---------------------------------------------------------------------- | ---------- | --------------- |
| #11 | Cet audit                                                              | —          | `main`          |
| #12 | Heure de la confirmation dans le fuseau du restaurant                  | C1         | `main`          |
| #13 | Couleur de marque rendue lisible (AA) au point d'entrée du thème       | X1, M3     | `main`          |
| #14 | Heure choisie visible, `aria-checked`/`aria-selected`, cibles de 44 px | R1, X2, X3 | `main`          |
| #15 | Bouton Confirmer collé au bas de la feuille (web)                      | R3         | `main`          |
| #16 | Carte affichée à la demande, plus d'appel tiers à l'ouverture          | C3         | `main`          |
| #17 | Carte QR : filtre allergènes et régime mémorisé d'un scan à l'autre    | M2         | `feat/menu-api` |

Ordre d'impact : le fuseau (une heure fausse fait manquer la table) et le contraste (tout l'écran,
des clients comme du restaurateur) d'abord, puis la feuille de réservation, puis la vie privée de la
page de confirmation, puis la mémoire du filtre de la carte.

Sans PR, avec la raison : **A1** (lien de réservation sans adresse e-mail, jeton signé qui expire :
elle passe par le courriel que la PR #8 réécrit, voir plus haut) ; **M1** (page HTML légère pour la
carte : elle suppose la PR #2 et le routage nginx que la PR #8 apporte pour le site du restaurant) ;
**C2** (courriel, après #8) ; **V1** (le découpage par route ne gagne que 18 %, une analyse du bloc
commun de 578 Ko est à faire) ; **R2** (deux sélecteurs d'heure) ; **M4** (noms de plats par langue :
exige une migration) ; **M5** (photos de plats, non vérifiées). Le néerlandais est ajouté par la
PR #8 : les PR ci-dessus qui ajoutent des textes (#16) le font pour en, fr, es, de ; si #8 est fusionnée
avant, `nl.json` devra recevoir la même clé (le test de parité du dépôt le dira).

La carte QR d'une PR empilée (#17) devra, une fois #13 fusionnée, lire `onPrimary` pour l'onglet de
menu sélectionné, qui pose aujourd'hui un blanc figé sur la couleur de marque.

Constat hors périmètre, laissé tel quel : `RecentBookingsList` lit encore le jour d'une réservation
sur l'horloge du téléphone (`fmtMonthDay(new Date(c.date))`), parce que le cache des réservations
récentes n'embarque pas le fuseau du restaurant.
