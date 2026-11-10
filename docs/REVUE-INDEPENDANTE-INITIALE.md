> Archive du rapport initial, **avant corrections**. Les numéros de lignes et 27 tests sont historiques. Aucune donnée personnelle réelle, valeur de secret ou identifiant privé n’y figure. Résolutions et preuves actuelles : REVUE-RESOLUTIONS.md. Ne pas interpréter ce rapport comme validation des corrections ni certification.

# Revue indépendante OCD Live

État : 8 novembre 2026, Africa/Ouagadougou (UTC+0). Lecture seule de l’application autonome `/workspace/ocd-live`, sans git, sans modification de source, sans utilisation des identifiants privés et sans requête vers le serveur de présentation 4173.

## Verdict

Les protections serveur examinées sont cohérentes pour une démonstration locale à données fictives. Aucune faille critique ou haute établie dans ce passage. Une course de réponses dans le suivi privé est reproduite : corriger avant présentation. Deux points de durcissement/fiabilité restent à traiter. Ce passage n’est ni une certification de sécurité ni un feu vert pour Internet ou données réelles.

## 1 : Moyen : une réponse de report du dossier A peut remplacer le dossier B

**Source :** `src/Tracking.tsx:77-90`, notamment `setBooking(await api(...))` lignes 82–87 ; comparaison avec la protection `tokenRef.current !== token` présente pour GET aux lignes 48–56.

**Reproduction exécutée, sans serveur ni donnée réelle :** React test renderer, fetch simulé différé, dossier A avec report ; cliquer Accepter ; changer le fragment de suivi vers B ; attendre le chargement de B ; résoudre enfin la réponse POST de A. Résultat : le lien reste B mais les informations A s’affichent. La mutation de A est bien celle demandée initialement ; aucune lecture non autorisée d’un dossier inconnu n’est démontrée. Il s’agit néanmoins d’une confusion de dossiers et d’une réapparition d’informations qui ne correspondent pas au lien courant.

**Preuves :** `/workspace/ocd-review-scratch/tracking-race.mjs` et `tracking-race-result.txt` : `Before old response, visible B: true`, puis `After old response, WRONG visible A while link is B: true`.

**Correction recommandée :** capturer la génération du dossier/token pour toute opération asynchrone (POST, GET, catch/finally), invalider les résultats au changement de fragment et ne publier une réponse que pour la génération courante. Le POST déjà reçu peut légitimement aboutir côté serveur : ignorer son résultat visuel n’est pas annuler l’action. Ajouter tests pour réponse POST tardive, GET lancé avant POST puis réponse ancienne après confirmation, changement de fragment pendant erreur et état busy/copie réinitialisé.

## 2 : Faible à moyen : fraîcheur réseau déduite de navigator.onLine ; données anciennes restent actionnables

**Sources :** `src/App.tsx:23,28-40` ; `src/Booking.tsx:55-89,380-383` ; `src/Admin.tsx:55-83,132-159` ; `src/Tracking.tsx:42-76,227-239`.

**Observation statique :** l’état online dépend des événements navigateur, qui ne prouvent pas la joignabilité du serveur. Après coupure du serveur ou erreur HTTP, tout en restant connecté au réseau, l’administration et le suivi conservent les anciens dossiers et leurs boutons ; le message d’erreur existe, mais l’état obsolète n’est pas modélisé et les commandes restent disponibles. La réservation efface ses slots sur échec, mais conserve l’horodatage `updated` et peut encore afficher « Disponibilités actualisées » après cet échec. Le serveur revérifie les mutations : aucun double booking serveur démontré. C’est surtout une lacune UX/PWA et de conformité à l’exigence « données périmées claires, rafraîchir avant action ».

**Repro à ajouter :** charger un écran, faire échouer les fetch suivants en laissant navigator.onLine=true ; constater erreur + actions actives/horodatage ancien. Pas de recette navigateur effectuée ici.

**Correction :** séparer connectivité et fraîcheur (`fresh/loading/stale/failed`), afficher dernière synchronisation comme historique et non disponibilité actuelle, désactiver les actions dépendantes du planning après erreur jusqu’à rafraîchissement réussi. Protéger aussi les charges concurrentes par séquence/génération : un polling GET ancien ne doit pas écraser une mutation récente. Tester API inaccessible et erreurs non réseau, pas seulement événement offline.

## 3 : Faible, durcissement avant diffusion : idempotence globale avec restitution du secret porteur

**Sources :** `server/store.mjs:33,229-247` ; `src/Booking.tsx:50,101-109`.

La clé est globalement unique en base et non liée à un navigateur/secret de soumission indépendant. Une clé arbitraire de 12 caractères est acceptée ; si un tiers connaît/devine une clé et reproduit exactement le payload normalisé, l’API renvoie l’objet précédent complet avec son jeton privé. Le client courant utilise randomUUID : dans le flux normal, cette clé est imprévisible. Aucune attaque pratique contre ces UUID ni fuite réelle constatée ; ne pas présenter ce point comme un IDOR exploitable sans connaissance de clé et données.

**Recommandation :** traiter/documenter la clé d’idempotence comme un secret de récupération aussi sensible que le reçu ; exiger de l’entropie suffisante ou ajouter un secret de soumission lié à la récupération, éviter les clés humaines ou communes et tester deux clients distincts. La clé en useRef est perdue au rechargement : la garantie de reprise après réponse perdue vaut seulement pour le même composant vivant. Préciser cette limite ou concevoir une reprise explicite sans stockage de PII/jetons privés non maîtrisé.

## 4 : Métier / anti-abus, pas une faille d’autorisation démontrée

`server/app.mjs:94` autorise 30 demandes/h/IP ; `server/store.mjs:258` bloque 24 h sans identité vérifiée. Un client peut donc déposer de nombreuses options et consommer le planning, y compris sur plusieurs dates. Le plafond IP limite mais ne prévient pas l’accaparement, et tous les utilisateurs locaux/derrière un proxy peuvent partager le même quota. Pour démo privée : acceptable si assumé ; avant diffusion : définir quota d’options actives, contrôle de demande et stratégie anti-abus, sans prétendre qu’un simple Origin est une authentification. Aucun test de charge agressif effectué.

## Points positifs vérifiés dans les sources

- Accès administration : routes de liste/actions protégées par session serveur, pas de rôle client magique ; aperçu `/demo-equipe` alimenté par fixtures distinctes et handlers mutateurs gardés par preview.
- Mot de passe scrypt avec sel ; comparaison timingSafeEqual ; mot de passe généré non affiché. Aucun fichier privé lu durant la revue.
- Session 256 bits, hash serveur, expiration 8 h ; cookie HttpOnly, SameSite Strict, Secure si origine HTTPS, chemin /api/admin. Logout invalide la session. Sessions et limiteurs mono-processus assumés.
- Mutations : origine exacte + JSON requis, CSRF pour mutations admin, pas de CORS permissif. Les faux en-têtes Origin émis par un client non navigateur ne lui confèrent aucun accès admin.
- Limites générales et spécifiques, tailles JSON/champs bornées ; pas de sink HTML dangereux ou stockage local de PII repéré. Rendu React textuel et SQL paramétré. CSP restrictive, no-referrer, no-store.
- SQLite `BEGIN IMMEDIATE` contient expiration, contrôle de conflit et écriture ; chevauchement semi-ouvert testé entre deux processus. Ressource unique studio/distance.
- Pending 24 h : expiration logique à chaque transaction ; confirmation après expiration refusée. Proposition de report protège les deux intervalles ; acceptation remplace atomiquement ; refus/expiration revient à l’état précédent ou expired si option initiale dépassée. Une demande pending sous report peut protéger l’ancien intervalle au-delà de son hold initial jusqu’à expiration de proposition : politique actuelle explicite, pas une faille de concurrence établie.
- L’acceptation client d’un report confirme directement après proposition admin, conformément à l’hypothèse implémentée ; si un second clic admin est souhaité, c’est une décision métier différente.
- Six packs configurables présents ; mensuel réserve seulement la première session, autres dates/crédits manuels clairement indiqués. Promotion sans création/publication automatique et prix de démonstration marqués.
- Jetons reçus 256 bits dans fragment HTML puis chemin API ; pas de répertoire public. Bearer token assumé : possesseur peut lire/répondre. Pas de rotation/révocation ciblée disponible, limite production documentée. Chemins API peuvent contenir le token dans de futurs logs proxy : les masquer lors d’un éventuel déploiement.
- SW : allowlist de fichiers informatifs, exclusion API et requêtes non GET ; navigation réseau avec fallback sûr ; aucun cache des dossiers/admin. Cela ne supprime pas les informations déjà en mémoire d’un onglet.
- Archive inspectée par noms : aucune entrée credentials/admin-login/sqlite/.env/demo-receipts détectée ; ce contrôle de noms ne vaut pas scan exhaustif de secrets dans chaque contenu.

## Vérifications réellement exécutées

- `node --import tsx --test tests/*.test.mjs` : **27/27 réussis**, dont API sur ports éphémères/SQLite mémoire, store et concurrence avec base temporaire séparée. Aucun appel au serveur 4173.
- `npm audit --json` : **0 avis connus**, dépendances de développement comprises, à l’instant de cette revue. Cela ne mesure pas les failles de logique ci-dessus ni les vulnérabilités inconnues.
- Repro supplémentaire tracking : échoue fonctionnellement comme décrit au point 1 (script sort normalement après avoir consigné le défaut).
- Logs propres à la revue : `/workspace/ocd-live-independent-tests.txt`, `/workspace/ocd-live-independent-audit.json`. Avertissement de dépréciation react-test-renderer, pas un échec de test.

## Non vérifié / limites

Pas de navigateur réel, accessibilité visuelle/clavier complète, installation réelle PWA, mobiles, capture vidéo, TLS/reverse proxy, host/proxy en production, fuite de données réelles, charge, fuzzing exhaustif, récupération/rotation de secrets, sauvegardes, ni analyse de chaque fichier d’archive. Aucun test d’intrusion externe, aucune modification de fixtures du serveur existant. Les accès locaux au disque et bootstrap sont hors modèle de menace démontré et restent limités à des données fictives ; ne pas certifier l’admin comme prêt pour production.

Priorité de retour au builder : corriger le point 1 avec test rouge/vert ; traiter la fraîcheur et les réponses concurrentes du point 2 ; décider/documenter point 3 et politique anti-abus avant toute diffusion. Refaire tests + build + recette navigateur après correction, et reconstruire l’archive pour éviter de livrer une version antérieure.
