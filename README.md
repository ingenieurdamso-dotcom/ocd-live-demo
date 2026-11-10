# OCD Live : démonstration fonctionnelle d’Adama

PWA française, mobile-first, réservation et administration. **Proposition non officielle** : Bovann n’a validé ni ce produit, ni ses tarifs. Données fictives uniquement. Aucun paiement, email, SMS, push ou diffusion vidéo réelle.

## Démarrage

Prérequis : Node.js **24.15 ou supérieur**, npm, un port local libre. Projet autonome : aucun dépôt, compte cloud ou hébergeur requis.

```bash
cd ocd-live
npm ci
npm run build
npm run bootstrap
npm start
```

Ouvrir **http://127.0.0.1:4173** (pas une adresse publique). L’origine autorisée est exacte : ne pas remplacer 127.0.0.1 par localhost sans changer `APP_ORIGIN`. Le serveur est lié à 127.0.0.1 par défaut et reste privé à la machine.

- `/` : accueil, six formules, fonctionnement, FAQ.
- `/reserver` : demande sans compte, quatre étapes, exemple fictif prérempli au choix.
- `/suivi#<jeton>` : reçu privé, statut, historique, réponse au report. Le jeton n’est pas dans le chemin envoyé au serveur pour charger la page HTML.
- `/admin` : connexion, demandes, détail, confirmation/refus/report, planning et journal interne.
- `/demo-equipe` : aperçu public **en lecture seule**, fixtures fictives distinctes de la base. Il ne donne accès à aucune demande enregistrée.
- `/confidentialite` : limites et fonctionnement expliqués.

## Mise en ligne sur Render (plan Free)

Le fichier `render.yaml` (Blueprint) décrit un service web Node, plan `free`, région `frankfurt`, version de Node fixée par `.node-version` (24, compatible avec `engines` ≥ 24.15).

- Build : `npm ci --include=dev && npm run build` (les devDependencies servent au build Vite/TypeScript).
- Démarrage : `npm start` (`node server/index.mjs`).
- Santé : `GET /api/health`.

Variables d’environnement :

| Variable         | Valeur                                                   | Rôle                                                                                   |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`       | `production` (Blueprint)                                 | Origine exacte seulement, démarrage refusé sans identifiants valides                   |
| `HOST`           | `0.0.0.0` (Blueprint)                                    | Écoute sur toutes les interfaces du conteneur                                          |
| `PORT`           | fourni par Render                                        | Port d’écoute                                                                          |
| `TRUST_PROXY`    | `1` (Blueprint)                                          | IP client prise derrière le proxy TLS unique (quotas par visiteur)                     |
| `APP_ORIGIN`     | à saisir : `https://<service>.onrender.com`              | Seule origine acceptée pour les mutations ; à défaut `RENDER_EXTERNAL_URL` est utilisé |
| `ADMIN_USERNAME` | à saisir                                                 | Identifiant de l’espace équipe (3–64 caractères a-z, 0-9, `.`, `_`, `-`)               |
| `ADMIN_PASSWORD` | à saisir, 16 caractères minimum, aléatoire de préférence | Haché en mémoire au démarrage, jamais écrit sur disque ni journalisé                   |

Limites du plan Free : mise en veille après 15 minutes sans visite (réveil d’environ une minute) et disque éphémère. La base SQLite est recréée vide automatiquement au démarrage : les demandes de démonstration disparaissent à chaque redémarrage, redéploiement ou mise en veille.

## Accès administrateur

En production (Render), les identifiants viennent uniquement de `ADMIN_USERNAME` et `ADMIN_PASSWORD`. En local, si ces variables sont absentes, `npm run bootstrap` génère un mot de passe aléatoire, jamais codé en dur ni affiché dans les journaux. Fichiers privés par défaut :

- `~/.local/share/ocd-live-demo/admin-login.txt` : identifiant et mot de passe local, permissions 600.
- `~/.local/share/ocd-live-demo/credentials.json` : sel et hachage scrypt, permissions 600.
- `~/.local/share/ocd-live-demo/bookings.sqlite` : dossiers **fictifs**, permissions 600 dans dossier 700.

Ces fichiers sont **hors de la source, du serveur statique et de l’archive**. Ne pas les envoyer ni publier leur contenu. Le compte ne correspond à aucun compte Bovann réel. Connectez-vous avec le formulaire `/admin`. Après déconnexion, l’interface efface ses dossiers et le serveur invalide la session.

Variables facultatives : `PORT=4173`, `HOST=127.0.0.1`, `APP_ORIGIN=http://127.0.0.1:4173`, `OCD_DATA_DIR=/chemin/prive`, `TRUST_PROXY=0`. Pour une mise en ligne, utiliser la configuration Render ci-dessus (HTTPS, `NODE_ENV=production`, identifiants par variables) plutôt que changer simplement HOST.

## Exemples vivants facultatifs

Sur une base vide et serveur local déjà lancé :

```bash
npm run seed:demo
```

Ce scénario utilise **l’API réelle** pour créer cinq dossiers fictifs, confirmer une demande, proposer un report et refuser une demande. Il se connecte uniquement à localhost, puis se déconnecte. Les reçus sont conservés dans `~/.local/share/ocd-live-demo/demo-receipts.json` (600), sans afficher leurs jetons. Exécuter une seule fois pour préparer la présentation ; si des demandes ont été modifiées ensuite, le scénario peut s’arrêter sans les écraser.

## Six packs illustratifs

| Formule     |       Durée réservée ici | Prix fictif FCFA | Particularité                                                    |
| ----------- | -----------------------: | ---------------: | ---------------------------------------------------------------- |
| Découverte  |                   90 min |           15 000 | Première session                                                 |
| Essentiel   |                  120 min |           20 000 | Une session                                                      |
| Grand Live  |                  240 min |           35 000 | Un créneau continu                                               |
| Duo         |                  180 min |           30 000 | Deux activités dans un seul dossier/contact                      |
| Visibilité  |                  240 min |           55 000 | Demande de vidéo promotionnelle ; organisation manuelle          |
| Rendez-vous | 90 min, première session |           50 000 | Proposition mensuelle 4 × 90 min ; trois autres dates à convenir |

Catalogue central configurable dans `server/catalog.mjs`. **Aucun moteur de récurrence, de débit de crédits ou de publication promotionnelle n’est prétendu implémenté.** Les sessions futures mensuelles ne bloquent pas automatiquement le planning.

## Règles réellement implémentées

- Lomé UTC+0 explicitement affiché ; départs toutes les 30 minutes, 09:00–21:00, durée entière incluse, horizon glissant de 90 jours. Tous les jours sont ouverts dans cette démo.
- Une ressource partagée studio/distance. Intervalles semi-ouverts : la fin d’une session peut être le début de la suivante. Aucun tampon ajouté.
- Une demande en attente protège 24 h. L’expiration est logique, contrôlée à chaque lecture et écriture, sans dépendre d’un cron.
- Confirmation manuelle, refus avec motif, report avec motif. Le report protège provisoirement ancien et nouveau créneaux. Le client répond via son lien privé. Acceptation : nouveau confirmé, ancien libéré atomiquement. Refus/expiration : ancien état conservé, sauf option initiale déjà expirée.
- Pas de réservation passée, hors heures, date inexistante ou chevauchement. Le contrôle final se fait en transaction SQLite `BEGIN IMMEDIATE`, y compris entre processus.
- Une clé privée UUIDv4 aléatoire par contenu permet de récupérer le même reçu après réponse perdue. Le bouton « Récupérer le reçu du même envoi » reprend explicitement le contenu original, même après modification du formulaire. **Cette récupération existe uniquement tant que le composant de réservation reste ouvert ; elle est perdue au rechargement, à la fermeture ou au départ de la page.** Aucun stockage local de PII n’est ajouté. Une même clé avec un contenu différent renvoie 409. La clé est un secret porteur, pas une preuve d’identité.

- Quotas transactionnels : **3 options actives par connexion IP**, **100 au total** ; `pending` et report issu de `pending` comptent. Confirmation, refus ou expiration libèrent le quota. Rejouer le même envoi ne consomme pas de place. IP dérivée par le serveur, en-têtes proxy ignorés. Les utilisateurs partageant une IP partagent le quota. Ce durcissement ne protège pas contre les identités multiples/Sybil.
- Fraîcheur distincte de la connexion réseau : après un échec API, données « non actualisées » et actions bloquées jusqu’à lecture réussie. Horodatage de **dernière synchronisation réussie**, historique, pas une promesse de disponibilité. Séquences/générations empêchent les anciennes réponses GET/POST de remplacer le dossier, la session ou une mutation récents.

## PWA et réseau

Manifeste, logo réel, icônes 192/512, service worker et page hors connexion. Le cache est une **allowlist informative** : offline.html, offline.css, manifeste, icônes, logo. Aucune API, donnée client, page admin ou reçu n’est mis en cache. Après navigation sans réseau, on affiche une page sûre, pas un ancien dossier. Dans un onglet déjà ouvert, un bandeau indique que l’état n’est plus actualisé et les mutations sont désactivées. Le cycle complet est décrit dans `docs/PWA.md`.

Installation facultative selon le navigateur. HTTP localhost est un contexte accepté sur ordinateur. **Installer sur un téléphone distant requiert un hébergement HTTPS accessible**, non livré ni autorisé ici. Ne pas prétendre que l’adresse 127.0.0.1 de cette box fonctionne sur le téléphone.

## Vérification

```bash
npm run lint
npm run format:check
npm test
npm run typecheck
npm run build
npm audit --json
```

51 tests métier, API HTTP, concurrence multiprocessus, rendu React et interactions de composants, exécution simulée du service worker. Lint, formatage, tests et build réussis au 8 novembre 2026, Africa/Ouagadougou UTC+0. `npm audit` : zéro vulnérabilité connue à cet instant, pas une preuve d’absence de faille. Les tests d’interactions utilisent `react-test-renderer` qui émet un avertissement de dépréciation ; il est réservé au développement.

Les rapports historiques (`reports/`) ne sont pas inclus dans cette copie de déploiement. Revue indépendante initiale et corrections documentées dans `docs/REVUE-INDEPENDANTE-INITIALE.md` et `docs/REVUE-RESOLUTIONS.md`.

**BLOCAGE CONSTATÉ :** le vrai navigateur du parent a reçu `ERR_CONNECTION_REFUSED` sur les deux adresses locales essayées, malgré une réponse HTTP 200 antérieure depuis le Shell. Aucun outil d’exposition/preview sanctionné n’a été trouvé. Les tentatives réseau/navigateur ont été arrêtées, sans tunnel, proxy ou déploiement. **Rendu visuel, installation PWA réelle et enregistrement motion design : bloqués, non vérifiés, non livrés.** Le serveur local et les tests isolés ne prouvent pas l’accès depuis ce navigateur. Aucun navigateur piloté par script n’a été utilisé.

Le livrable vidéo est seulement préparé : narration, storyboard 120 s et liste des captures dans `docs/MOTION-STORYBOARD.md`. Il n’existe aucun MP4 ou faux écran prétendant montrer l’application capturée. La recette future est dans `docs/RECETTE.md` ; ne pas relancer les essais réseau sans résolution autorisée de ce blocage.

## Architecture / documentation

- `server/store.mjs` : SQLite, validation et transitions transactionnelles.
- `server/app.mjs`, `server/security.mjs` : API, contrôle d’accès, sessions, protections HTTP.
- `src/` : expérience publique, réservation, suivi et administration.
- `public/` : logo réel et ressources PWA sûres.
- `docs/SECURITE.md`, `docs/API.md`, `docs/RECETTE.md`, `docs/LOGO-PROVENANCE.md`.
- `docs/superpowers/plans/2026-11-08-ocd-live.md` : plan et suivi d’exécution.

Logo original crop PNG conservé octet pour octet ; icônes produites par réduction et placement sur un carré, sans redessin. Couleurs observées, pas une charte officielle. Police Manrope servie localement, sans Google Fonts externe.

## Limites avant production

Ce n’est pas un logiciel audité ou prêt à recevoir des données réelles. Il manque entre autres : décision commerciale Bovann, droits de marque et contenus, identité/destinataires opérationnels, sauvegardes/restauration, conservation et exercice des droits, mécanismes de récupération de compte, supervision, authentification renforcée, HTTPS correctement déployé, tests d’accessibilité et navigateurs réels, charge et audit de sécurité professionnel. Une revue indépendante limitée du code a eu lieu : elle ne remplace pas ces validations. Les limites de débit et sessions sont en mémoire et réinitialisées à chaque redémarrage. SQLite est adapté à cette démo mono-instance, pas un choix de capacité validé pour une exploitation massive.

Superdesign a été chargé et son CLI vérifié ; l’authentification exigeait une autorisation utilisateur indisponible. Aucun brouillon externe ni génération facturée n’a été créé ; la direction approuvée a été réalisée localement.

### Dépendances de développement : correction vérifiée

L’ajout d’ESLint 10 a révélé un avis DoS modéré dans sa dépendance minimatch 10. L’override ciblé `minimatch:^11.0.1` utilise la version corrigée ; lint, tests et build ont été réexécutés après cette modification. Le rapport final npm audit est à zéro avis. Cet override est à revalider lors d’une mise à jour du linter. Aucun downgrade vers une version ESLint non maintenue n’est conservé. Les licences OFL des deux polices embarquées sont dans docs/licenses/.
