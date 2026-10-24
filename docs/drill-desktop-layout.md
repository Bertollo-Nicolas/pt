# Disposition desktop des drills

À partir de 1024 px de largeur, le catalogue, les préparations de session, les exercices et les bilans utilisent la hauteur disponible dans l’application. La disposition est vérifiée avec la navigation et l’en-tête réels, pas uniquement avec le composant de drill en pleine largeur.

- Catalogue sur trois colonnes.
- Préparation : réglages et statistiques côte à côte ; modes C-bet et thèmes Maths en rangée ; longueur de session toujours accessible.
- Exercice : question et réponses à gauche, correction et bouton suivant à droite. Sur Value, board et main de Hero sont côte à côte ; les neuf actions occupent deux rangées.
- Bilan : score et actions à gauche, statistiques à droite.
- Fiches mémo : bouton dédié et fenêtre avec une fiche sélectionnable à la fois. Les lignes, formules et repères du cours sont conservés.
- Explications longues : accessibles à la demande, sans pousser le bouton suivant sous la fenêtre. La règle mentale C-bet et le calcul Maths restent visibles dans la correction principale.
- Fenêtres de 700 px de hauteur ou moins : espacement compact supplémentaire, sans couper les réponses ni masquer les informations des exercices.
- Mobile : disposition verticale et défilement naturel. Les fenêtres modales conservent le focus clavier et se ferment avec Échap.

La stratégie, les réponses attendues, les statistiques et les règles de sauvegarde ne changent pas. Les conteneurs gardent un défilement de secours pour éviter de couper du contenu sur des dimensions ou niveaux de zoom hors des formats vérifiés.

## Vérification

QA dans un navigateur isolé, avec une clé de stockage de test et la vraie disposition latérale : 1024×768, 1280×640, 1280×720, 1366×650, 1366×768 et 1920×1080.

Mesures de `scrollHeight/clientHeight` et `scrollWidth/clientWidth` : aucun débordement sur le catalogue, les trois préparations, les questions et corrections, les bilans, les cinq thèmes Maths, les sept adaptations Value, toutes les fiches mémo et les fenêtres d’explication. Les boutons d’action restent dans le viewport ; la navigation principale ne nécessite pas de défilement sur ces formats. Le bilan Maths avec cinq thèmes ratés et le viewport mobile 390×844 sont également vérifiés. L’aperçu et le script de QA temporaires sont retirés avant livraison.
