# Drills personnalisés préflop

L’entrée **Drills** ouvre le nouveau système de scénarios. Les anciens modules théoriques ne sont pas réactivés.

## Parcours

1. Choisir une range dans la bibliothèque, tous dossiers confondus.
2. Créer un scénario : nom, action source détectée, table HU ou 3–6 joueurs, position Hero et tapis de départ. Dans la séquence, chaque étape de Hero possède ses boutons personnalisables, une réponse juste et une explication facultative. Les actions adverses sont automatiques.
3. Enregistrer, modifier, dupliquer ou supprimer le scénario.
4. Choisir une range et cocher les scénarios à travailler, définir le nombre total de **mains** et 1–6 tables simultanées.
5. Recevoir la main avant la première décision de Hero, répondre, puis jouer la suite du coup. Feedback juste/faux pendant une seconde ; les adversaires jouent automatiquement, puis Hero répond à nouveau. Après la dernière décision, la main suivante arrive automatiquement. Un bilan reprend les erreurs par étape.

## Règles

- Un scénario s’applique uniquement aux classes de mains associées au nom exact de son action source. Une fréquence strictement positive suffit ; les mains mixtes peuvent donc apparaître dans plusieurs scénarios. Tirage uniforme par classe, sans pondération par combos ou fréquence.
- Fold utilise la même interprétation que les flashcards : les folds implicites sont inclus.
- Blindes 0,5 / 1 bb, sans ante, préflop uniquement. Tous les joueurs ont le même tapis initial (2–1 000 bb). Montants de raise exprimés en total engagé sur la street.
- Le simulateur contrôle l’ordre de parole, les folds, les calls et les relances minimales. Les situations à tapis et les side pots ne sont pas pris en charge dans cette version.
- Pot, contributions et tapis restants sont calculés depuis les blindes et les étapes déjà jouées. Hero reste en bas, même si sa position change. La table conserve une géométrie de pilule horizontale au ratio 2,2:1, indépendamment de la hauteur de l’écran.
- Les badges joueurs affichent position et tapis ; les actions sont regroupées dans le récapitulatif au-dessus de la table. Pour 4 tables, disposition 2 × 2 ; pour 5–6 tables, disposition 3 × 2. Sur un écran peu haut, ces tables utilisent un affichage miniature ; sur mobile elles restent empilées.
- Chaque étape Hero possède 2–6 boutons : libellé, action et montant total pour une relance. Le bouton juste est coché dans cette étape ; aucune réponse globale n’est demandée dans le contexte du scénario. Les libellés et actions ne peuvent pas être dupliqués, sauf sizings distincts d’une relance.
- La bonne réponse vient de la configuration du scénario, pas d’un solver. Après une erreur intermédiaire, la séquence continue avec l’action de référence, annoncée dans le feedback.
- Le nombre de mains désigne le total sur toutes les tables. Les statistiques comptent chaque décision de Hero séparément.
- Pause et fermeture de l’onglet arrêtent les temporisations ; le bouton de fin de session ouvre un bilan sans perdre les décisions validées.
- Une range ou une action supprimée rend son scénario indisponible ; il reste possible de le réassocier ou de le supprimer.

## Sauvegarde

`AppConfig.scenarioDrill` contient les scénarios, les compteurs cumulés et les 200 dernières décisions. Sauvegarde locale via le store existant et synchronisation du compte via `/api/sync` (config JSON existante, aucune migration SQL). La remise à zéro des préférences conserve ces données. La session, la préparation et le brouillon sont désormais conservés dans `config.drillWorkspace` ; chaque réponse et son checkpoint sont enregistrés ensemble. Voir [la mémoire du workspace](workspace-memory.md).

Les scénarios v2 utilisent `steps`, avec `options` et `correctId` sur chaque étape Hero. Les anciens scénarios `moves` + `correct` sont convertis à la lecture : les actions Hero déjà scriptées deviennent des questions, les actions adverses restent automatiques, et la décision finale est ajoutée à la séquence. La conversion est enregistrée lors de l’édition ; les ranges et anciennes statistiques sont conservées.

## Vérification

- `npm run test:scenarios` : filtrage exact, fréquences nulles et mixtes, toutes positions HU/3–6 joueurs, ordre de parole, pot et tapis, actions légales, cartes, déduplication, migration idempotente, réponses personnalisées par étape, séquence à trois décisions Hero et statistiques persistantes.
- Vérification navigateur sur une route temporaire isolée, sans synchronisation ni données utilisateur : première décision avant le limp, erreur initiale puis suite corrigée, réponse finale et main suivante automatiques, pause, trois tables simultanées, bilan, sauvegarde et modification du bon bouton dans la séquence.
- Nouvelle navigation et pages Accueil/Builder/Flashcards/Révisions vérifiées sur desktop et mobile, avec bibliothèque, paramètres et navigation mobile accessibles.
- Éditeur desktop vérifié sans scroll de page à 1024×768, 1280×640 et 1440×900 (la liste des étapes défile si nécessaire). Entraînement trois tables vérifié sans scroll à 1024×768, 1280×640, 1366×768, 1440×900 et 1920×1080 ; mobile 390×844 sans débordement horizontal. Ratio des tables mesuré à 2,2:1 sur tous ces formats.

## Timer et sons

Le timer est optionnel (0 = sans limite, jusqu’à 3600 secondes) et recommence à chaque décision de Hero. La pause suspend le chrono. Le checkpoint conserve le temps restant et les alertes déjà jouées ; une session restaurée attend une reprise explicite.

À 10 secondes : fond orange pendant une seconde et son 1 deux fois. À 5 secondes : fond rouge pendant une seconde et son 2 une fois. Le son 0 accompagne limp, call et raise de Hero ou des adversaires. Les sons simultanés des tables sont regroupés, et un bouton permet de les couper. Les fichiers originaux sont servis depuis public/audio.

À zéro, la décision est enregistrée comme manquée (sans inventer de fold), puis le drill poursuit la ligne de référence. Une réponse au même instant ne peut pas compter deux fois. Les anciens checkpoints restent compatibles, sans timer.

Validation : npm run test:timer, test:scenarios et test:workspace.

## All-in et sessions multi-ranges

L’action All-in est disponible dans les réponses de Hero et les actions automatiques adverses. Le montant correspond au tapis initial, blindes incluses ; la table affiche les jetons engagés, le pot et le statut All-in. Face à un tapis adverse de même taille, les choix sont Fold ou Call. Les tapis restent identiques pour tous les joueurs du scénario.

Dans la bibliothèque, Ranges du drill permet de cocher plusieurs ranges, puis de choisir leurs scénarios. Chaque nouvelle main tire un scénario du pool, puis une main de son action source. Le scénario précédent est évité quand plusieurs sont disponibles. La sélection est conservée dans la configuration synchronisée.

## Variantes adverses OR

Sur une action adverse Raise, le bouton or placé après le montant ajoute une nouvelle ligne dans le même bloc. Chaque ligne peut contenir une autre action ou un autre sizing, jusqu’à six variantes. La liste de questions Hero garde les mêmes étapes. Le sélecteur Réponse face à permet de configurer les boutons et la bonne réponse pour chaque contexte adverse. Les boutons hérités impossibles dans une variante sont retirés (par exemple Raise face à un tapis identique). Les modifications des boutons dans un contexte ne changent pas les autres.

La main est tirée dans la même action source avant le tirage de la variante. Chaque combinaison adverse est équiprobable et figée dans le checkpoint de la main ; une mauvaise réponse ne change pas de branche. L’éditeur vérifie toutes les combinaisons (maximum 128), dont l’ordre de parole, les sizings, les boutons et les réponses. La suite commune doit rester légale pour chacune ; les variantes ne sont pas des arbres de suites de longueurs différentes.
