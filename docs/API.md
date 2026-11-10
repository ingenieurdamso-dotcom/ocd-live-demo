# API

Origine unique configurée `APP_ORIGIN`, JSON uniquement pour mutations, `Cache-Control: no-store` partout. Aucun endpoint n’envoie de message externe.

| Route                                         | Accès                      | Effet                                                                     |
| --------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| GET /api/health                               | public                     | `{"status":"ok"}` ; contrôle de santé Render, hors limitation de débit    |
| GET /api/catalog                              | public                     | Six packs et métadonnées démo                                             |
| GET /api/availability?date=YYYY-MM-DD&pack=ID | public                     | Créneaux sans identité client, fuseau et heure serveur                    |
| POST /api/bookings                            | public, origine exacte     | Crée option ; `Idempotency-Key` obligatoire, UUIDv4 aléatoire privé       |
| GET /api/booking/:token                       | lien privé                 | Lit un seul dossier après expiration logique                              |
| POST /api/booking/:token/respond              | lien privé, origine exacte | `{accept:true}` ou `{accept:false}` pour un report actif                  |
| POST /api/admin/login                         | origine exacte             | `{username,password}` ; cookie HttpOnly et réponse csrf                   |
| GET /api/admin/session                        | session                    | csrf et identifiant courant                                               |
| POST /api/admin/logout                        | session + CSRF             | Invalidation serveur et cookie                                            |
| GET /api/admin/bookings                       | session                    | Liste privée des dossiers fictifs                                         |
| POST /api/admin/bookings/:id/action           | session + CSRF             | `action:confirm`, `reject` avec reason, `reschedule` avec reason et start |

`X-CSRF-Token` est requis sur les mutations administratives après connexion. Le cookie de session est `HttpOnly`, `SameSite=Strict`, limité à /api/admin, et `Secure` dès que `APP_ORIGIN` est en https (cas de Render).

### Contrôle d’origine des mutations

- **Production (`NODE_ENV=production`)** : toute mutation exige un en-tête `Origin` **exactement égal** à `APP_ORIGIN` (schéma, hôte et port). Aucune autre origine, ni `null`, ni absence d’en-tête n’est acceptée.
- **Hors production uniquement** : on accepte aussi une page servie par ce même serveur (`Origin` = `Host` reçu) **si l’hôte est non public** : loopback, `localhost`, `*.local`, réseaux privés 10/8, 172.16/12, 192.168/16, lien local, IPv6 `::1`/ULA/lien local. Ce relâchement sert aux essais depuis un téléphone sur le Wi-Fi local. Il ne s’applique jamais à un nom d’hôte public, ce qui écarte aussi les pages réassociées par rebinding DNS.

Ce contrôle ne dépend pas des en-têtes du proxy : il compare `Origin` à une valeur de configuration.

## Dossier en entrée

`pack`, `mode` (studio ou remote), `start` (ISO UTC Z, secondes 00, minute multiple de 30), `name` (2–80), `email` (5–160), `phone` (7–30), `country` (2–56, lettres), `tiktok` (pseudo public fictif, 2–30, normalisé avec @), `instagram` (même forme, facultatif), `business` (2–100), `category` (2–60), `description` (10–1000), `consent:true`. Les contacts doivent être fictifs ; exemple test@example.test. Un lien TikTok ou Instagram est refusé : seul le pseudo est conservé. Validation côté client pour l’ergonomie et côté serveur pour l’autorité.

## États

pending, confirmed, rejected, expired, reschedule_proposed. Une proposition contient start/end/reason/expiresAt et conserve previousStatus. `events` est un journal de notifications internes avec `simulated:true`.

## Erreurs

400 champ/date/transition invalide ; 401 session absente/expirée ou identifiants incorrects ; 403 origine/CSRF ; 404 dossier ou route introuvable ; 409 créneau pris, clé déjà utilisée avec autre contenu ou état fermé ; 413 JSON volumineux ; 415 mauvais type de contenu ; 429 limite de débit ou `PENDING_QUOTA` (options actives) atteinte ; 500 erreur générique sans stack.

Une réponse perdue se récupère en répétant le POST avec la même clé et exactement le même contenu : le même reçu est retourné. Ce n’est pas une seconde réservation. L’interface ne prétend jamais que la demande est réussie sans réponse serveur.

## Secrets de récupération et quotas

Le client produit un UUIDv4 avec `crypto.getRandomValues` (122 bits, quartet de version `4`, variant RFC 4122). `crypto.randomUUID` n’est pas utilisé : il est absent hors contexte sécurisé, donc sur une origine HTTP autre que localhost ou 127.0.0.1, et l’appel bloquait le formulaire avant l’envoi. Le serveur vérifie le format/version/variant, **pas la qualité d’aléa effective d’un client arbitraire** : ne jamais substituer une clé humaine, fixe ou publique. Clé et contenu identiques restituent le reçu privé : traiter cette clé aussi confidentiellement que le lien de suivi. Ce mécanisme ne vérifie pas l’identité du détenteur. Aucune reprise inter-navigateurs n’est promise.

Le formulaire garde clé **et payload original** en mémoire de son composant. Après erreur réseau, le bouton de récupération renvoie cet original sans exiger que l’ancienne disponibilité reste libre. Une récupération ne crée donc pas un second dossier si la première écriture a abouti. Une nouvelle soumission modifiée emploie une autre clé. Fermer/recharger/quitter perd cette récupération ; un reçu déjà obtenu reste consultable par son lien privé. Jamais de sauvegarde PII/clé en localStorage.

Le serveur applique 3 options actives/IP et 100 globales, atomiquement dans la transaction d’expiration/écriture. Replay avant quota, pas de consommation supplémentaire. Comptés : pending et reschedule_proposed dont previousStatus=pending. Un report d’une demande déjà confirmée ne compte pas. Les quotas se libèrent à confirmation/refus/expiration ; refuser un report revient à l’option initiale et ne libère pas celle-ci si encore active.

`owner_key` est une colonne **privée** : empreinte serveur de l’IP associée au hachage privé du compte, jamais un champ JSON retourné. Par défaut `trust proxy=false` : X-Forwarded-For fourni par un client n’est pas autoritaire. Derrière un proxy TLS (Render), définir `TRUST_PROXY=1` : Express retient alors comme IP client l’adresse ajoutée par le proxy (entrée la plus à droite de X-Forwarded-For) ; une valeur forgée à gauche par le navigateur est ignorée. Sans cette variable derrière un proxy, tous les visiteurs partageraient l’IP du proxy, donc les mêmes quotas et limites. Ne jamais indiquer plus de sauts qu’il n’en existe réellement : l’IP deviendrait falsifiable. Si Render ajoute plus d’un saut, `TRUST_PROXY=1` retient une adresse interne : les quotas deviennent alors communs, sans jamais être falsifiables. Les options de l’ancien schéma migré, sans propriétaire connu, restent comptées globalement, sans attribution IP inventée. Changer les identifiants change le regroupement IP ; ce dispositif de démonstration n’est pas une identité forte ni un contrôle Sybil. Limites configurables uniquement côté moteur, via `createStore({pendingLimits:{perOwner:3,total:100}})`.

## Données SQLite

Table bookings : id, token, idem, fingerprint, data (objet dossier JSON), owner_key (regroupement privé). Migration additive de owner_key sous verrou. Toutes les valeurs entrantes sont paramétrées ; id et jeton sont aléatoires, pas des numéros publics successifs.
