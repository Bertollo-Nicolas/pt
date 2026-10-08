# Drill C-bet

Navigation : **Entraînement → Drill C-bet**, ou carte dédiée sur le dashboard. Aucune range importée nécessaire.

Le MVP comporte 64 flops BTN vs BB en pot relancé, des sessions de 20 décisions, trois modes (apprentissage, drill, mastery), quatre niveaux cumulatifs et une confiance facultative avant la réponse. Les fréquences sont présentées dans le feedback, sans être évaluées.

Le modèle reprend la spécification pédagogique fournie : ce ne sont pas des résultats solver. Les boards connectés bas riches en nuts pour BB reçoivent un sizing intermédiaire ; la connexion seule ne déclenche pas une grosse mise. Les règles monotone et pairé priment sur les règles ace-high.

## Données et moteur

- `lib/cbet-drill/dataset.ts` : chaque ligne définit les cartes, la texture, le sizing attendu, la règle éditoriale et la difficulté. Les réponses ne sont pas calculées par le classificateur.
- `lib/cbet-drill/engine.ts` : classification descriptive, évaluation, statistiques et tirage pondéré. Environ un tirage sur trois renforce les faiblesses, avec un autre flop de la dernière texture ratée non corrigée. Les autres équilibrent les textures et favorisent les boards peu vus. Pas de répétition exacte pendant la session tant que des boards inédits restent disponibles ; les petits pools évitent les trois derniers boards.
- `components/drill/CbetDrillView.tsx` : préparation, décision, feedback et bilan. Ajouter un board ne nécessite pas de modifier l’interface ou le moteur.

## Sauvegarde

Chaque réponse met à jour `config.cbetDrill` via une action atomique Zustand. Le stockage local existant et la synchronisation du JSON `config` vers Supabase enregistrent la progression sans migration SQL. La synchronisation réseau conserve le délai existant de trois secondes. Les agrégats sont conservés à vie ; les 200 dernières réponses permettent le ciblage récent et bornent la taille du stockage. L’état de la session en cours reste temporaire : quitter conserve les décisions mais interrompt la session.

Le bouton de remise à zéro des préférences conserve les réponses du drill. « Tout réinitialiser » dans le parcours efface aussi la progression C-bet.

## Validation

`npm run test:drill` vérifie le dataset, les couleurs/connexions/As bas, les exceptions stratégiques, la notation, les séries, le stockage JSON, les compteurs au-delà de 200 réponses, la déduplication et la répétition adaptative. Vérifier également TypeScript, lint, build et les interactions desktop/mobile.
