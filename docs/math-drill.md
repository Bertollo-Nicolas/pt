# Catalogue Drill et Maths

Le menu principal conserve une entrée **Drill**. Elle ouvre le catalogue : **C-bet théorie · IP BU vs BB** et **Maths du poker**. Les onglets internes permettent d’accéder au catalogue et aux deux modules. Les nouveaux drills peuvent y ajouter leur carte et leur vue sans multiplier les entrées du menu principal.

## Organisation

Maths propose cinq thèmes : cote de call, outs/probabilités, rentabilité d’un bluff, ratio value/bluff river et cote implicite. Un thème se travaille en dix calculs à réponse libre ; le mode mixte alterne les thèmes en vingt calculs, et revient sur les thèmes ratés avec un exemple différent. Une fiche mémo par thème présente formules, tables et limites des modèles.

La correction comprend la réponse attendue, le calcul et l’interprétation. La virgule et le point sont acceptés ; la consigne précise l’arrondi. Les réponses sont verrouillées après validation. Le bilan donne le score et permet de retravailler directement un thème raté.

## Précisions mathématiques

- Le pot affiché est toujours le pot **avant** la mise adverse. Call : `C / (P + 2C)`. La formule `C / (pot + C)` n’est équivalente que si ce pot inclut déjà la mise adverse.
- Bluff pur sans équité : folds requis `B / (P + B)`.
- River polarisée : value par bluff `(P + B) / B`. Une mise de demi-pot correspond à trois values pour un bluff, soit 25 % de bluffs **parmi les mises**, sans généraliser à la range totale.
- Les réponses attendues suivent les repères du cours fournis par l’utilisateur : 15 outs → 30 % sur une street, 54 % sur deux ; 12 → 24/48 ; 9 → 18/36 ; 8 → 16/32 ; 6 → 12/24 ; 4 → 8/16. La probabilité exacte reste présentée séparément. Voir deux cartes suppose l’absence de nouveau paiement. Les outs sont supposés propres.
- « Flush draw + straight » est précisé : flush draw + gutshot donne généralement 12 outs (9 + 4 − 1) ; flush draw + OESD en donne généralement 15 (9 + 8 − 2).
- Implicites sur la prochaine carte : `max(0, C/p − (P + 2C))`, gain futur conditionnel pris à vilain, sans nouveaux frais si le tirage rate. Pour P=10, C=7,5 et p=9/47 : environ 14,2 bb supplémentaires. Aucun gain futur n’est garanti.

## Implémentation et sauvegarde

`lib/math-drill.ts` contient les formules, les 126 variantes de questions, la validation et la sélection. `MathDrillView` contient les fiches et l’interface. `DrillView` orchestre le catalogue. Pas de nouvelle dépendance.

La progression maths est indépendante du C-bet dans `config.mathDrill` : compteurs globaux et par thème, séries et 200 dernières réponses. La sauvegarde Zustand locale et la synchronisation existante du JSON config vers le compte s’appliquent sans migration SQL. Quitter interrompt la session mais conserve les réponses validées. La remise à zéro des préférences conserve les deux progressions ; la remise à zéro de l’apprentissage les efface.

## Validation

`npm run test:math` couvre les formules, les pourcentages exacts, les approximations, la saisie, les arrondis acceptés, la déduplication, la cohérence des réponses, les statistiques, la sérialisation et la sélection mixte. Les tests du C-bet restent disponibles via `npm run test:drill`.

QA effectuée sur un aperçu temporaire avec une clé de stockage isolée : catalogue, accès au C-bet, navigation des thèmes, session complète de dix calculs avec neuf bonnes réponses, erreur de saisie, réponse verrouillée, saisie avec virgule, implicites, mode mixte, table de probabilités et viewport mobile 390 × 844 sans débordement horizontal. L’aperçu temporaire est retiré avant livraison.
