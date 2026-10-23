# CX-O2 — Le quotidien du restaurateur

Un restaurant publié ouvre son tableau de bord depuis `/onboarding`. Un brouillon
continue d’ouvrir l’assistant. Le bouton « Modifier mon restaurant » permet de
retrouver les cinq étapes ; l’assistant propose aussi le retour au tableau de bord.
L’espace fonctionne sur navigateur, téléphone compris.

## Réservations et chiffres

La semaine va du lundi au dimanche dans le fuseau du restaurant. La liste et le CSV
portent sur les réservations non annulées de cette semaine. Les noms déjà anonymisés
ne réapparaissent pas. Les absences restent dans les décomptes de réservations et de
couverts réservés ; elles sont exclues du remplissage.

Le remplissage est le rapport entre les couverts-minutes réservés pendant les heures
d’ouverture et les places-minutes disponibles. Les tables groupées ne gonflent pas
la capacité : seules les places des tables physiques comptent. Les services de la
veille qui continuent après minuit sont répartis sur les deux dates. Une capacité
nulle ou une journée fermée donne « — ». Le taux est borné à 100 %.

Limite connue : une borne de service située dans l’heure inexistante du passage à
l’heure d’été peut empêcher le calcul du tableau de bord et du CSV cette semaine-là.
La conversion suit actuellement les règles existantes de disponibilité.

Les boutons de statut utilisent les transitions du serveur : une absence ne peut
pas être déclarée avant le début de la réservation, hors tolérance existante. Une
table libérée par une absence ou une fin de repas peut accueillir la file d’attente.

## Exceptions d’horaires

Une date peut être fermée ou avoir ses propres heures, y compris une ouverture sur
un jour habituellement fermé ou un service dépassant minuit. L’exception appartient
au **jour de début du service** : fermer le samedi ne coupe pas le service du
vendredi à 00:00. Retirer l’exception rétablit les horaires hebdomadaires.

La modification ne supprime ni n’annule aucune réservation existante. Le
restaurateur doit prévenir les clients concernés. Les nouvelles disponibilités,
prises d’option et réservations suivent immédiatement les nouvelles heures ; le
calendrier client les reçoit dans la fiche du restaurant. Une date passée, une date
invalide ou une heure invalide est refusée avant écriture. Au plus 100 dates peuvent
être enregistrées par restaurant.

## File d’attente

Le restaurateur peut inscrire une personne, la retirer ou l’installer sur une table
adaptée dès qu’elle se libère. Le serveur vérifie à nouveau la disponibilité lors
de l’installation. Il refuse d’installer un groupe lorsque rien ne convient.

Côté client, la file existante reste accessible pendant un service sans réservation.
Elle est aussi proposée pendant un service ouvert lorsque toutes les tables et
tous les groupes adaptés à la taille demandée sont occupés ou retenus. Une table
adaptée encore libre ferme cette possibilité. Il s’agit d’une attente **maintenant**,
pas d’une liste pour une réservation à une date future. La rétention existante de
la file est conservée.

## Rappel mail automatique

Un traitement vérifie chaque minute les réservations à venir dans les 24 heures,
encore à l’état « Réservée », non annulées, non anonymisées, avec un e-mail, dans un
restaurant publié et non archivé. Il traite au plus 100 réservations par passage.

**Le mode simulé est activé pour tous les restaurants, y compris après mise à
niveau.** Il inscrit « Rappel simulé » et n’appelle aucun serveur mail. L’activation
de l’envoi réel demande une confirmation dans l’interface ; elle réutilise le SMTP
déjà configuré par la plateforme, sans nouveau prestataire. Le texte suit la langue
du client et l’heure du restaurant.

Une réservation est réclamée atomiquement avant envoi : deux passages ne produisent
pas deux mails. Les états sont simulé, en cours, envoyé ou non envoyé. Un échec
SMTP n’est pas relancé automatiquement. Un arrêt du processus après la réclamation
peut laisser « Envoi en cours » : le choix est d’éviter un doublon, pas de promettre
une livraison exactement une fois. Passer du simulé au réel ne renvoie pas les
rappels déjà simulés. Aucun corps de mail, adresse ou message SMTP brut n’est ajouté
aux journaux par ce traitement.

## Carte QR, export et accès

Le classement compte un affichage quand au moins la moitié du plat est visible dans
le navigateur QR. Le compteur est cumulatif depuis son activation ; ce n’est pas un
nombre de visiteurs uniques. Un retour sur un plat peut compter à nouveau. Il n’y
a ni cookie de suivi, ni identifiant de visiteur, ni adresse IP conservée par ce
compteur. Les plats cachés, cartes non publiées et restaurants non publics ne peuvent
pas être comptés. Le rendu HTML du mini-site et l’application native ne l’alimentent
pas. La donnée publique reste opaque : aucun identifiant interne de plat n’est exposé.

Les vues ont leur propre quota de 1 200 requêtes par minute et par IP, distinct du
quota de lecture publique et du quota global de navigation, y compris lorsqu’il
est épuisé. Cela permet par exemple 30 lectures de 40 plats par minute derrière
une même connexion. Au-delà, les vues sont ignorées par le navigateur et la carte
reste lisible. Le traitement reste un envoi par plat vu ; chaque envoi vérifie
encore la publication et la visibilité de la carte.

Le CSV de la semaine utilise UTF-8 avec BOM et le séparateur `;`. Les guillemets et
retours à la ligne sont échappés ; les cellules pouvant devenir des formules sont
préfixées d’une apostrophe. Les lectures de clients, y compris l’export et la file,
sont auditées et répondent avec `Cache-Control: no-store`.

Toutes les routes du quotidien utilisent `RequireRestaurateur`, refusent les clés
API et passent par le contrôle d’appartenance existant. Un restaurant étranger,
inexistant ou archivé répond 404. Les identifiants de réservation et de ticket sont
contrôlés dans le restaurant demandé. Un restaurant suspendu reste lisible et refuse
les écritures. Aucun accès à l’administration n’est accordé au restaurateur.

## Livraison et vérification

Une seule migration EF additive : `RestaurantOperations`. Elle ajoute les
exceptions et le mode de simulation au restaurant, le compteur au plat, et deux
champs de suivi du rappel à la réservation. Elle ne supprime aucune ligne et
n’ajoute aucune suppression en cascade. Le SQL de mise à niveau est fourni pour
lecture dans `docs/sql/restaurant-operations.sql` ; le démarrage applique la migration
EF automatiquement, sans opération SQL manuelle à effectuer.

Le jeu de démonstration montre une fermeture dans deux semaines et des compteurs de
plats pour la Senne Dorée. Les rappels y restent simulés.

Vérifications : tests backend de service et HTTP, tests frontend sur iOS et Android,
contrats OpenAPI et routes, formatage/lint/TypeScript, et Playwright
`e2e/restaurant-operations.spec.ts`. Ce scénario utilise de nouveaux comptes et des
clients fictifs, vérifie le CSV, une fermeture, une file complète puis libérée, le
compteur QR et une largeur de 390 px. La CI de PR l’exécute après les tests smoke.
Les captures sont dans `docs/captures/cx-o2/` ; le test les joint également à son
rapport Playwright.
