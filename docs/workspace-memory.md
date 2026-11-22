# Navigation, mémoire et synchronisation

## URL

- Accueil : `/`.
- Flashcards : `/flashcards?cat=…&tab=…`.
- Range builder : `/builder?cat=…&tab=…`.
- Révisions : `/revisions`.
- Catalogue des drills : `/drills`, avec `cat` et `tab` pour la range choisie.
- Éditeur : `/drills/scenarios/<id>` ; `/drills/scenarios/new` initialise un brouillon.
- Session : `/drills/session/<id>`.

Ces chemins possèdent une route Next réelle, utilisable après rechargement. La navigation courante conserve le workspace monté via History API : changer d’outil ne recharge pas les données du compte. Les liens de navigation peuvent aussi être ouverts dans un nouvel onglet. Précédent/suivant restaure la page et la range. Une URL explicite a priorité sur la page mémorisée ; l’ouverture sur `/` reprend la dernière page si elle existe. Le clic « Accueil » mémorise `/`.

Si la connexion expire, le middleware transmet un paramètre `next` à la connexion et préserve les cookies renouvelés. Seules les destinations internes reconnues sont acceptées.

## Données conservées

La structure existante `public.user_data.config` est un `jsonb`, protégé par les politiques RLS du compte. Aucun changement SQL n’est nécessaire pour ces champs :

- `workspaceNavigation` : dernier chemin et horodatage.
- `drillWorkspace.setup` : range, scénarios cochés, nombre de mains et de tables.
- `drillWorkspace.draft` / `editorStep` : brouillon complet et étape ouverte dans l’éditeur.
- `drillWorkspace.checkpoint` : dernière session, ses identifiants, scénarios de référence, mains et couleurs exactes, phase/étape de chaque table, décisions et compteurs.
- `scenarioDrill` : scénarios publiés et statistiques cumulées, avec horodatage.

Les modifications restent enregistrées immédiatement dans le store local existant et sont synchronisées dans la colonne JSON du compte. Les réponses du drill et leur checkpoint sont publiés ensemble dans une seule modification du store pour éviter un double comptage au refresh.

Une reprise de session se fait **en pause**. La préparation, le brouillon et le checkpoint peuvent aussi être retrouvés depuis le catalogue. La session en cours est le dernier checkpoint ; il ne s’agit pas d’un historique de toutes les sessions. Les grilles peintes en cours et les sessions flash temporaires ne sont pas incluses dans ce checkpoint : leur page et leur range restent mémorisées.

## Fiabilité de la synchronisation

Le chargement distant ne doit pas écraser un checkpoint ou des statistiques de drill locaux plus récents. `mergeSyncedConfig` compare leurs horodatages. Les préférences ordinaires conservent le comportement distant existant.

Les écritures attendent le chargement initial du compte, sont sérialisées, regroupées après 1,5 seconde et envoyées au plus tard après 5 secondes de changements continus. Le changement de visibilité, le retour en ligne et la fermeture déclenchent également une tentative d’envoi. Le local reste la copie immédiate en cas de fermeture avant la fin d’un envoi.

Les erreurs Supabase d’écriture remontent désormais à l’API ; une écriture refusée ne doit pas afficher un faux état « synchronisé ». La base active doit naturellement avoir le schéma existant installé ; aucun accès direct à une base utilisateur n’est effectué par les tests.

## Vérifications

- `npm run test:workspace` : parsing des routes, retour de connexion sûr, paramètres de range, sérialisation exacte du checkpoint, arbitrage local/distant et remontée des erreurs DB.
- Tests navigateur avec fixture isolée, sans écritures dans un compte utilisateur : refresh d’un brouillon et de son étape, refresh au milieu d’un feedback, conservation des cartes et des compteurs, reprise en pause, absence de double score, mémoire de la préparation, navigation précédent/suivant entre pages et ranges, reprise depuis `/`, accès direct à l’éditeur, retour de connexion.
- Mode de jeu épuré vérifié en six tables à 1920×1080, 1440×900, 1280×640 et 1024×768 sans scroll desktop, ainsi qu’à 390×844 sans débordement horizontal.
