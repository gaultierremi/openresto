# Carte QR native : préparer une visite restaurateur

Le module fonctionne sans abonnement, service de QR ni service de traduction externe.
AtlasQR sert uniquement de référence fonctionnelle ; les cartes et les images restent dans OpenResto.

1. Connectez-vous avec le compte restaurateur et ouvrez l’étape **Carte** de son restaurant.
2. Ajoutez les catégories et les plats, leur description et leur prix en euros. Un prix vide signifie « prix sur demande ». Les flèches changent l’ordre des catégories et des plats.
3. Déclarez les allergènes parmi les **14 allergènes UE**. Les informations viennent du restaurateur : un champ vide ne signifie pas « sans allergènes ».
4. Choisissez la langue principale de chaque plat et complétez ses traductions **FR/NL/EN**. **Proposer** utilise un lexique culinaire embarqué : les formulations inconnues sont signalées et restent à compléter. Relisez, corrigez puis **validez** la proposition. Elle n’entre dans la carte enregistrée qu’après cette validation et l’enregistrement de l’étape. Les traductions saisies directement sont enregistrées avec la carte ; un champ vide conserve le texte principal pour le visiteur.
5. Enregistrez une première fois la carte. Les plats enregistrés proposent alors l’ajout/remplacement/suppression d’une photo **JPEG, PNG ou WebP, 2 Mo maximum**, ainsi que les états **Disponible**, **Épuisé** et **Masqué**. Ces actions prennent effet immédiatement sans enregistrer à nouveau les champs du plat. Un état reste actif jusqu’au prochain changement manuel : pensez à rouvrir les plats au service suivant.
6. Dans l’**Aperçu**, utilisez **Imprimer la carte / PDF** ou **Imprimer tous les QR / PDF**. Une fenêtre A4 s’ouvre ; son bouton **Imprimer / Enregistrer en PDF** ouvre le dialogue du navigateur. Autorisez cette fenêtre si le navigateur la bloque. Les QR comprennent le code général et un code par table, avec leur adresse complète. Leur adresse utilise l’adresse publique configurée pour l’instance, sinon celle du navigateur.
7. Publiez le restaurant quand ses étapes requises sont complètes. Scannez le QR général puis celui d’une table depuis un téléphone. Le second affiche aussi le nom de la table. Vérifiez les langues, les prix, les allergènes et le plat épuisé. Un plat masqué et une catégorie invisible ne figurent ni sur la carte publique ni sur son impression.

La carte publique affiche les photos à la demande et permet aussi d’imprimer la carte sélectionnée, dans la langue du visiteur. L’impression comporte les descriptions, les prix, les allergènes déclarés et les ruptures de stock ; les photos ne consomment pas d’encre.

Un compte restaurateur ne lit et ne modifie que ses restaurants. Un restaurant suspendu reste consultable dans son espace, mais ses écritures sont refusées et sa carte publique devient indisponible.

Les données de `scripts/demo_data.py` sont fictives. La Brasserie de la Senne Dorée propose 22 plats traduits en néerlandais et en anglais, un plat épuisé, un prix sur demande et un brouillon non publié. Les photos de démonstration restent liées aux fichiers présents sur disque, comme les autres médias du dépôt.

Ce chantier ne modifie aucun fichier de déploiement. La mise en ligne reste suivie séparément dans la PR #28.
