# Value vs fish passif

Accès : **Drill → Value vs passif**, ou carte **Value vs fish passif** du catalogue.

## Déroulement

Le nombre de situations est saisi manuellement avant la session (six par défaut). Une situation conserve toutes ses streets, quel que soit le nombre choisi. Les lignes de base se jouent **street par street** : main de Hero connue, flop visible, turn puis river révélées seulement après la décision précédente. Chaque réponse est verrouillée, corrigée et sauvegardée. Même après une erreur, la suite suit la ligne de référence du cours ; l’historique indique les étapes corrigées.

L’option d’apprentissage affiche la catégorie de main avant de répondre. Par défaut, elle n’est révélée qu’après la réponse. On peut cibler une texture, les adaptations seules ou le mélange complet. Les erreurs favorisent un autre exemple de la même famille ; les situations déjà vues sont évitées tant que le pool le permet.

## Contenu du cours

Les 29 lignes sont séparées en six familles : pairé haut, pairé bas, haut connecté **non pairé**, bas connecté, ace dry et ace drawy. Les 33 exemples de base illustrent ces lignes avec des mains concrètes ; sept adaptations séparées complètent le dataset, soit 40 situations.

Les confirmations de l’utilisateur sont conservées :

- Trips forts/faibles : distinction par le kicker, avec des exemples sans ambiguïté (As contre petit kicker). Aucun seuil intermédiaire non fourni n’est inventé.
- High connected TPTK : **pot → overbet → shove**.
- TP moyenne hors ace-high : kicker Q à 9 ; l’exception explicite ace-high AJ+ reste prioritaire. Les exemples ace-high utilisent AT pour la catégorie moyenne et A5 pour la faible.
- PP fortes : TT+ ; les exemples de PP moyenne restent sous TT. Les catégories non couvertes par une ligne fournie ne sont pas extrapolées.
- Toutes les alternatives sont acceptées : 80 % ou shove river avec top trips ; 33 % ou 50 % turn avec paire moyenne sur high connected ; check ou 33 % river avec TP moyenne sur ace dry ; 33 % ou shove river avec TPGK sur ace drawy.
- Top set sur ace dry : 50 % flop ; top set sur ace drawy : 80 % flop. La suite reste celle de la ligne DP/set.

Les adaptations flush et monotone demandent une **direction de sizing** (réduire / maintenir / augmenter) lorsqu’aucun pourcentage précis n’est fourni. La quinte sur quatre cartes connectées utilise l’exemple explicite **pot → 75 %** ; la quinte supérieure à celle du board attend **overbet**. La grosse value river sur monotone est un principe séparé. Le drill ne chiffre ni overbet ni shove sans information de stack.

Les notes de profils VPIP/WTSD figurent dans une fiche mémo, sans devenir des seuils de scoring inventés. L’hypothèse des lignes de base est Hero IP, checks adverses, calls des mises précédentes, absence de relance.

## Code et sauvegarde

- `lib/value-drill/dataset.ts` : règles éditoriales du cours et exemples légaux.
- `lib/value-drill/engine.ts` : validation, statistiques et sélection.
- `components/drill/ValueDrillView.tsx` : setup, cartes, streets, correction, bilan et fiches mémo.

Les compteurs globaux, par famille et par street, ainsi que les 200 dernières décisions, sont conservés dans `config.valueDrill`. Ils utilisent le stockage local et la synchronisation existante du compte, indépendamment du C-bet et des Maths. La réinitialisation des préférences les conserve ; la réinitialisation de l’apprentissage les efface. Quitter ou changer d’onglet conserve les réponses mais interrompt la session.

## Validation

`npm run test:value` vérifie les 29 lignes et 40 situations, les cartes distinctes, les runouts révélés une carte à la fois, les exceptions et alternatives, les adaptations, le comptage par street, la déduplication, la sérialisation et la sélection.

QA navigateur isolé : entrée du catalogue, affichage des mains/boards, catégorie cachée, session complète de 18 décisions (dont une erreur volontaire), alternatives acceptées, réponses désactivées, bilan, sauvegarde après rechargement, adaptations et viewport mobile 390 × 844 sans débordement horizontal. L’aperçu et le script de QA temporaires sont retirés avant livraison.
