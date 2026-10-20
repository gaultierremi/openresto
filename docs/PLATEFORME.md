# Ouvrir la plateforme à un premier restaurant

Document pour **Gaultier**. Il décrit ce que la plateforme sait faire depuis le Sprint 4, comment
inscrire un restaurant, ce qu'il faut compléter **avant** de le faire pour de vrai, et ce qui
n'est pas encore couvert. Le détail technique est dans `CLAUDE.md` (section « Platform: one
instance, many restaurants »).

## Le parcours, de bout en bout

1. **Vous ajoutez l'établissement** : espace d'administration → **Plateforme** → *Ajouter un
   établissement* (nom, e-mail du restaurateur, langue de l'invitation : français, néerlandais ou
   anglais). L'établissement naît en **brouillon** : invisible des clients, aucune réservation
   possible.
2. **Le restaurateur reçoit un e-mail** avec un lien valable 14 jours, à usage unique. Si l'envoi
   échoue (SMTP non configuré), le lien s'affiche à l'écran, **une seule fois** : copiez-le et
   transmettez-le vous-même. Seule l'empreinte du lien est conservée.
3. **Il crée son compte** (mot de passe d'au moins 10 caractères) en cochant séparément les
   conditions d'utilisation, la politique de confidentialité et l'accord de sous-traitance. Chaque
   acceptation est journalisée avec la version du document et l'empreinte du texte montré.
4. **L'assistant en 5 étapes** : informations et identité légale (raison sociale, numéro
   d'entreprise vérifié, TVA facultative, durée de conservation des réservations) · horaires · salles
   et tables · première carte (import photo/PDF : l'emplacement est réservé, désactivé) · logo et
   couleurs. Il peut être quitté et repris à tout moment ; la carte et le logo peuvent être passés.
5. **Aperçu** du site, de la carte QR et de la page de réservation, puis **Publier** : le site, la
   carte et la réservation en ligne s'ouvrent ensemble. « Dépublier » remet en brouillon.

## L'espace Plateforme (Owners seulement)

- La liste donne, par établissement : statut (brouillon, publié, suspendu), invitation, dernière
  connexion, réservations (total et à venir) et avancement de l'assistant. **Aucun nom de client.**
- **Suspendre** (avec un motif que le restaurateur lit) retire l'établissement des pages publiques
  et refuse toute nouvelle réservation ; les réservations déjà prises restent et leurs clients
  peuvent encore les annuler. **Réactiver** rend l'établissement dans l'état où il était.
- **Renvoyer l'invitation** sert aussi de récupération : un restaurateur qui a perdu son mot de
  passe ouvre le nouveau lien et en choisit un autre.
- **Données clients…** est la seule porte vers les clients d'un restaurant : elle exige un motif
  (10 à 300 caractères, à écrire à propos du ticket, jamais d'un client) et le motif est inscrit
  dans le journal d'activité avec votre nom.

## À faire AVANT d'inscrire un vrai restaurant

1. **Faire valider les quatre documents légaux par un juriste.** Ce sont des modèles, marqués
   « à faire valider » sur chaque page. Ils contiennent des champs entre crochets
   (`[Dénomination de la société exploitante]`, adresse, numéro d'entreprise, hébergeur,
   arrondissement judiciaire, durée de conservation du journal de consentement…) à remplir dans
   `OpenRestoApi.Core/Application/Legal/LegalTexts.cs`. Une fois validés : passer
   `LegalCatalog.NeedsLegalReview` à `false` et **changer `LegalCatalog.Version`** (les anciennes
   acceptations restent valables comme preuve, les nouvelles inscriptions portent la nouvelle).
2. **Configurer l'envoi d'e-mails** (SMTP, voir `docs/HEBERGEMENT.md`) : sans lui, chaque
   invitation se transmet à la main.
3. **Vérifier la langue par défaut** : `OPENRESTO_DEFAULT_LOCALE=fr` (déjà dans le kit
   d'hébergement). Le navigateur d'un visiteur néerlandophone choisira le néerlandais tout seul.
4. **Tester le parcours sur la démo** : le brouillon « Brasserie du Canal » porte une invitation
   dont le jeton est public (`/onboarding/invitation/demo-invitation-brasserie-du-canal`) ; la
   remise à zéro de la démo la remet en place.

## Ce qui n'est pas couvert

- **Le restaurateur ne gère pas encore ses réservations lui-même.** Après publication, il n'a que
  l'assistant (modifiable à tout moment). Voir ses réservations, les annuler, tenir la salle exige
  de cloisonner l'espace d'administration par restaurant : c'est le prochain chantier. D'ici là,
  c'est vous (Owner/Manager) qui avez accès aux réservations de tous.
- **Les écrans d'administration montrent encore les clients à tout Owner/Manager.** Seul l'espace
  Plateforme respecte la règle « jamais sans motif journalisé ». Les écrans Réservations,
  Tableau de bord et Liste d'attente, eux, sont ceux d'avant.
- **La couleur choisie par le restaurateur peint son site vitrine**, pas la page de réservation ni
  la carte QR, qui gardent la couleur de l'instance.
- **Mot de passe oublié** : pas de lien automatique pour un restaurateur ; il passe par une
  nouvelle invitation que vous renvoyez.
- **Néerlandais** : tout ce que voit un client, plus l'e-mail de confirmation et les sites. Pas
  l'administration ni l'assistant (ils retombent sur le français). Les documents légaux sont en
  français seulement.
- **L'import de la carte depuis une photo ou un PDF** n'existe pas : seul son emplacement est
  prévu.
- **Une instance, des comptes e-mail communs** : l'expéditeur des e-mails (SMTP) et la marque
  restent ceux de l'instance.

## Conservation des données

Chaque établissement garde le nom, l'e-mail et les remarques de ses clients **12 mois après le
repas** par défaut (réglable de 1 à 60 mois dans l'assistant, étape 1). Passé ce délai, une tâche
quotidienne efface ces champs : la réservation reste pour les statistiques (date, couverts,
table). Les appareils de rappel, les e-mails en échec et les tickets de liste d'attente fermés
liés à ces réservations disparaissent avec. Le journal d'activité garde ses 365 jours habituels.
