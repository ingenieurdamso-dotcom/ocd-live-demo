# Sécurité : périmètre réel

## Menaces traitées dans cette démo

- Mutations administratives anonymes : 401 ; sessions contrôlées côté serveur, pas de drapeau client donnant des droits.
- Mot de passe : aléatoire au bootstrap, haché scrypt avec sel aléatoire ; comparaison constante ; fichiers privés hors distribution.
- Sessions : secrets aléatoires 256 bits, hachés en mémoire, durée 8 h ; cookie HttpOnly / SameSite Strict / chemin /api/admin. Secure automatiquement si origine configurée HTTPS ; absent uniquement sur HTTP local.
- CSRF : origine exacte obligatoire pour toute mutation, JSON obligatoire, jeton CSRF sur mutations authentifiées. Aucun CORS permissif.
- Exposition des dossiers : aucun annuaire public, liens de suivi avec jeton aléatoire 256 bits. Le détenteur du lien peut consulter/répondre : c’est un secret porteur, pas une identité vérifiée.
- Injections : requêtes SQL paramétrées, validation serveur des tailles et champs, rendu texte React sans dangerousSetInnerHTML.
- Concurrence : transactions SQLite immédiates, contrôle final de chevauchement, test réel entre deux processus. Toutes les voies d’écriture passent par le même moteur.
- Abus : limite générale 600/min/IP, demandes 30/h/IP, connexions 8/15min/IP, réponses reports 40/h/IP ; taille JSON 16 Kio, longueur du mot de passe 200. Compteurs bornés et nettoyés. Quotas persistants transactionnels 3 options actives/IP et 100 globales ; replay avant comptage. Métadonnées IP pseudonymisées hors réponses ; trust proxy=false par défaut, 1 saut si TRUST_PROXY=1 (Render).
- Navigateur : CSP restrictive sans script inline ni source distante, anti-frame, nosniff, referrer no-referrer, camera/micro/géoloc/paiement désactivés.
- Cache : no-store HTTP ; serviceworker allowlist sans données ou API. Pas de stockage local de PII ou token de suivi. Police et assets locaux, aucun tracker.
- Erreurs : messages applicatifs limités, aucune stack ni requête SQL renvoyée. Aucun log de corps, cookie, token ou mot de passe.

- Idempotence : format UUIDv4 exigé, clé générée par crypto.getRandomValues (pas randomUUID, absent sur HTTP non localhost) ; secret de récupération avec payload exact. Validation du format ≠ preuve d’entropie d’un client tiers. Récupération uniquement en mémoire du composant vivant, pas de persistance PII.
- Courses UI : générations de dossier/session et séquences de lecture ; une mutation invalide les GET antérieurs, suspend les nouvelles lectures jusqu’à terminaison et ignore les résultats d’une ancienne génération. Un résultat UI ignoré n’annule pas une écriture déjà reçue par le serveur.
- Joignabilité : navigator.onLine seul ne suffit pas. Les erreurs API rendent les données périmées, l’horodatage reste historique et les mutations sont bloquées jusqu’à synchronisation réussie.

## Risques et non-objectifs

- Administrateur unique local ; pas de MFA, SSO, récupération, rôles multiples ou annuaire.
- Base non chiffrée sur disque ; permissions OS et box privée uniquement. L’utilisateur local capable de lire ces fichiers ou contrôler le processus peut accéder aux données fictives.
- Les jetons de reçus sont conservés dans la base privée pour restituer un reçu idempotent. Leur possession suffit à accéder au dossier ; ne jamais mettre de données réelles dans la démo.
- Mot de passe bootstrap conservé en clair dans un fichier 600 pour remise locale ; à remplacer par un vrai flux de gestion des secrets avant production. Ne pas l’archiver.
- Sessions et limiteurs de débit en mémoire, mono-instance ; les quotas actifs sont en SQLite. Aucun dispositif DDoS ni identité vérifiée/Sybil. Plusieurs utilisateurs d’une même IP partagent trois options ; plusieurs IP peuvent contourner ce regroupement et consommer la capacité globale. Les nouvelles options migrées sans owner_key connu ne sont attribuées qu’au plafond global ; rotation du hachage administrateur change le regroupement IP. Politique métier/identité à définir avant diffusion.
- Pas de chiffrement réseau sur le serveur HTTP local. Toute publication externe exige reverse proxy HTTPS, configuration et audit revus, jamais un simple tunnel improvisé.
- Absence de politique de rétention automatisée, sauvegarde/restauration, rotation de jetons client, de journal d’audit immuable et d’alertes.
- La déconnexion retire l’accès serveur et les données de l’état React visible ; cela n’est pas une promesse d’effacement forensique de mémoire navigateur.
- `npm audit` zéro avis connu n’est ni un audit applicatif ni une garantie de sécurité.

## Preuves

`tests/api.test.mjs`, `tests/store.test.mjs`, `tests/concurrency.test.mjs`, `tests/pwa.test.mjs`. Rapports de tests et de build dans `reports/`. 51 tests réussis, dont régressions de revue et quota multiprocessus. Une revue indépendante limitée a identifié les quatre points traités dans docs/REVUE-RESOLUTIONS.md ; ce n’est pas un audit/certificat professionnel. Recette navigateur réelle, accessibilité, installation PWA et capture vidéo **bloquées** : ERR_CONNECTION_REFUSED observé par le parent ; aucune solution d’exposition sanctionnée trouvée, essais arrêtés. Aucun contournement réseau entrepris.

## Dépendances de développement

Un avis DoS modéré minimatch introduit par ESLint 10 a été corrigé par un override ciblé vers minimatch 11.0.1 ou compatible 11.x, avec lint et suite complète repassés. Vérifier la compatibilité de cet override à chaque montée de version. Les dépendances de production et de développement sont incluses dans l’audit final. Le renderer React déprécié reste limité aux tests de composants ; il ne figure pas dans le bundle applicatif.

## Déploiement Render (démo en ligne)

- HTTPS terminé par le proxy de Render ; `APP_ORIGIN` en https rend le cookie de session `Secure`.
- `NODE_ENV=production` : mutations acceptées uniquement avec `Origin` exactement égal à `APP_ORIGIN` ; le relâchement « même hôte » est désactivé (il n’existe qu’hors production et pour des hôtes non publics).
- `TRUST_PROXY=1` : IP client lue derrière un unique proxy pour les limites de débit et quotas ; sans cette variable, X-Forwarded-For est ignoré.
- Identifiants : `ADMIN_USERNAME` / `ADMIN_PASSWORD` fournis par l’environnement Render (`sync: false`), hachés scrypt en mémoire, jamais écrits sur disque ni journalisés. Démarrage refusé en production s’ils manquent ou si le mot de passe fait moins de 16 caractères. Le fichier `admin-login.txt` n’existe qu’en usage local.
- Disque éphémère du plan Free : base SQLite recréée vide à chaque démarrage. Données fictives uniquement.
- Une seule instance : sessions et limites de débit sont en mémoire du processus.
