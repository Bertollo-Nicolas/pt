# Drills personnalisés préflop

L’entrée **Drills** ouvre le nouveau système de scénarios. Les anciens modules théoriques ne sont pas réactivés.

## Parcours

1. Choisir une range dans la bibliothèque, tous dossiers confondus.
2. Créer un scénario : nom, action source détectée, table HU ou 3–6 joueurs, position Hero, tapis de départ, séquence avant Hero, bonne réponse et explication facultative.
3. Enregistrer, modifier, dupliquer ou supprimer le scénario.
4. Choisir une range et cocher les scénarios à travailler, définir le nombre total de décisions et 1–3 tables simultanées.
5. Répondre, consulter la correction, puis continuer. Un bilan reprend les erreurs.

## Règles

- Un scénario s’applique uniquement aux classes de mains associées au nom exact de son action source. Une fréquence strictement positive suffit ; les mains mixtes peuvent donc apparaître dans plusieurs scénarios. Tirage uniforme par classe, sans pondération par combos ou fréquence.
- Fold utilise la même interprétation que les flashcards : les folds implicites sont inclus.
- Blindes 0,5 / 1 bb, sans ante, préflop uniquement. Tous les joueurs ont le même tapis initial (2–1 000 bb). Montants de raise exprimés en total engagé sur la street.
- Le simulateur contrôle l’ordre de parole, les folds, les calls et les relances minimales. Les situations à tapis et les side pots ne sont pas pris en charge dans cette version.
- Pot, contributions et tapis restants sont calculés depuis les blindes et la séquence. Hero reste en bas, même si sa position change.
- Les décisions proposées dépendent du montant à payer : fold/call/raise ou check/raise. La bonne réponse vient de la configuration du scénario, pas d’un solver.
- Le nombre de situations désigne le total de décisions sur toutes les tables. Les mains remplacent les précédentes jusqu’à atteindre ce total.
- Une range ou une action supprimée rend son scénario indisponible ; il reste possible de le réassocier ou de le supprimer.

## Sauvegarde

`AppConfig.scenarioDrill` contient les scénarios, les compteurs cumulés et les 200 dernières décisions. Sauvegarde locale via le store existant et synchronisation du compte via `/api/sync` (config JSON existante, aucune migration SQL). La remise à zéro des préférences conserve ces données. La session en cours est temporaire ; chaque réponse validée est enregistrée immédiatement.

## Vérification

- `npm run test:scenarios` : filtrage exact, fréquences nulles et mixtes, toutes positions HU/3–6 joueurs, ordre de parole, pot et tapis, actions légales, cartes, déduplication et statistiques persistantes.
- Vérification navigateur sur une route temporaire isolée, sans synchronisation ni données utilisateur : création HU/6-max, sauvegarde après rechargement, modification invalide, duplication, suppression, réponses justes/fausses, bilan et renouvellement des tables.
- Formulaire desktop vérifié sans scroll à 1024×768, 1280×640 et 1366×768. Entraînement trois tables vérifié sans scroll à 1024×768, 1280×640, 1366×768 et 1920×1080 ; mobile 390×844 sans débordement horizontal.
