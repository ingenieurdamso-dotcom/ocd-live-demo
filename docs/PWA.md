# PWA OCD Live : fonctionnement réel

Ce document décrit ce que le code fait. Il ne décrit pas une application installée hors ligne, ni un score Lighthouse, ni un comportement qu’un navigateur n’a pas été observé faire. La démo reste une proposition non officielle, avec des données fictives. Elle n’est ni exploitée ni approuvée par Bovann.

## Rôle

La PWA est une couche facultative au-dessus du site web. Réserver, suivre un dossier et ouvrir l’espace équipe se font dans le navigateur, sans installation. L’installation, quand le navigateur la propose, ouvre le même site en affichage `standalone`. Elle n’ajoute aucune capacité métier : pas de file d’envoi, pas de dossier hors ligne, pas de notification.

Deux mécanismes sont distincts et ne doivent pas être confondus :

- le service worker, qui ne garde qu’une coquille informative ;
- le bandeau React « Hors connexion », qui bloque les envois dans un onglet déjà ouvert.

## Fichiers

| Fichier                                                             | Rôle                                                                                                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                                                        | Lien du manifeste, icône, `apple-touch-icon`, `theme-color` `#f4f2ed`, métadonnées Open Graph. Le script chargé est l’application Vite, pas une coquille mise en cache. |
| `public/manifest.webmanifest`                                       | Identité d’installation.                                                                                                                                                |
| `public/sw.js`                                                      | Service worker. Seule logique de cache.                                                                                                                                 |
| `public/offline.html`                                               | Page statique affichée si une navigation échoue alors que le service worker contrôle déjà la page.                                                                      |
| `public/offline.css`                                                | Style de cette seule page. Police système, fond `#f4f2ed`, encre `#20231f`. Ce n’est pas la feuille de l’application.                                                   |
| `public/icon-192.png`, `public/icon-512.png`, `public/ocd-logo.png` | Icônes et logo autorisés dans le cache.                                                                                                                                 |
| `src/main.tsx`                                                      | Enregistre `/sw.js` après le chargement. Un échec est ignoré.                                                                                                           |
| `src/App.tsx`                                                       | Bandeau réseau, proposition d’installation, routes.                                                                                                                     |
| `src/components.tsx`                                                | Composant `Offline`.                                                                                                                                                    |

`/og.png` est référencé par la balise Open Graph. Il n’est pas dans l’allowlist : le service worker ne le met pas en cache.

## Manifeste

Valeurs servies telles quelles :

- `id` et `start_url` et `scope` : `/`
- `name` : `OCD Live — Démo Adama`
- `short_name` : `OCD Live Démo`
- `lang` : `fr`
- `display` : `standalone`
- `background_color` et `theme_color` : `#f4f2ed`
- icônes 192 et 512, `purpose` : `any`

Il n’y a pas de `share_target`, de raccourcis, de captures d’écran déclarées, ni de mode `fullscreen`. Le démarrage ouvre l’accueil `/`, jamais un dossier ni l’administration.

## Enregistrement

`src/main.tsx` attend l’événement `load`, puis appelle `navigator.serviceWorker.register("/sw.js")`. La promesse rejetée est avalée. Le commentaire du code le dit : l’installation est facultative, le web reste utilisable.

Conséquence : si l’enregistrement échoue, aucune page hors connexion n’est préparée. L’onglet courant continue avec le JavaScript déjà chargé.

Un service worker n’existe que dans un contexte sécurisé. `http://127.0.0.1` et `http://localhost` le sont. Une origine `http://` avec l’adresse IP du Wi-Fi ne l’est pas : le navigateur refuse l’enregistrement, le `catch` l’ignore, et le téléphone n’a ni cache ni installation. La réservation sur cette adresse ne doit donc rien attendre du service worker. C’est aussi pour cela que la clé d’envoi n’utilise pas `crypto.randomUUID`, absent dans ce même contexte. Elle est produite avec `crypto.getRandomValues`. Le détail de la clé est dans `docs/API.md`.

## Cycle du service worker

Le nom du cache est `ocd-safe-shell-v1`.

**Installation.** `caches.open` puis `cache.addAll` de l’allowlist, puis `skipWaiting`. Le nouveau worker ne reste pas en attente de la fermeture des onglets. Si `addAll` échoue (une ressource de la liste manque), l’installation échoue et l’ancien worker, s’il existe, reste en place.

**Activation.** La liste des caches est lue. Seuls les noms qui commencent par `ocd-safe-shell-` et qui ne sont pas le nom courant sont supprimés. Un cache d’une autre application n’est pas touché. Ensuite `clients.claim()` prend le contrôle des onglets déjà ouverts sur cette origine. Prendre le contrôle ne met pas l’application en cache : le HTML et le JavaScript de l’app n’entrent jamais dans ce cache.

**Interception.** L’écouteur `fetch` ignore la requête, sans appeler `respondWith`, dans trois cas :

- origine différente de celle du worker ;
- méthode autre que `GET` ;
- chemin qui commence par `/api/`.

Ces requêtes suivent le réseau normal. Un POST de réservation, une lecture de dossier, un login ou un catalogue ne sont ni servis ni écrits par le worker. Il n’y a aucun `cache.put` dans `sw.js`. Le cache n’est rempli qu’une fois, au moment de `addAll`.

**Navigation** (`request.mode === "navigate"`). Le worker tente `fetch` de la requête. Si ce fetch aboutit, la réponse du réseau est rendue, y compris l’accueil, `/reserver`, `/suivi`, `/admin`. Elle n’est pas conservée. Si le fetch rejette, la réponse est `caches.match("/offline.html")`. Ce n’est pas une copie de la page demandée. Le hash de l’URL n’est pas une ressource mise en cache : un lien `/suivi#…` rechargé sans réseau affiche la page hors connexion, pas le dossier.

**Asset de l’allowlist.** `caches.match` d’abord, sinon le réseau. Il n’y a pas de mise à jour silencieuse de la copie. Pour changer le logo, l’icône, la page ou la feuille hors connexion, il faut changer le nom `ocd-safe-shell-v1` : l’activation supprimera l’ancien cache de cette famille, et la prochaine installation remplira le nouveau. Tant que le nom ne change pas, le navigateur peut continuer à servir la copie installée.

Tout autre GET de la même origine (le bundle JavaScript, `index.html`, une page, `/og.png`) n’est pas intercepté. Le navigateur le demande au réseau, sans filet du worker.

## Allowlist exacte

Seuls ces chemins sont demandés à l’installation et relus ensuite :

- `/offline.html`
- `/offline.css`
- `/manifest.webmanifest`
- `/icon-192.png`
- `/icon-512.png`
- `/ocd-logo.png`

Ne sont pas dans cette liste, et ne doivent pas y être ajoutés : `/api/`, l’administration, le suivi, le HTML de l’application, le bundle, les dossiers, les reçus, les identifiants, les jetons.

La page hors connexion dit, en français, qu’aucune demande, confirmation ou réponse à un report ne peut être envoyée, et que les créneaux et les dossiers privés ne sont pas stockés hors ligne. Le lien « Réessayer l’accueil » pointe vers `/`. S’il n’y a toujours pas de réseau, cette navigation retombe sur la même page.

## Deux expériences hors connexion

### Onglet déjà ouvert

`App` initialise `online` avec `navigator.onLine` et écoute `online` et `offline`. Le retour du réseau relance `GET /api/catalog`. La coupure ne relit pas le catalogue.

`Offline` affiche, seulement quand `online` est faux :

> Hors connexion : créneaux et statuts non actualisés. Les envois sont désactivés.

Ce bandeau est du React déjà en mémoire. Le service worker n’intervient pas : il n’y a pas de nouvelle navigation. Les formulaires lisent la prop `online` et refusent les mutations. `api()` refuse aussi tout appel si `navigator.onLine` est faux, avec le message « Vous êtes hors connexion. Aucune demande n’a été envoyée. », statut `0`, code `OFFLINE`.

`navigator.onLine` ne prouve pas que le serveur répond. Une erreur HTTP alors que le navigateur se dit en ligne laisse les données au statut « non actualisées » et bloque l’action jusqu’à une relecture réussie. Ce mécanisme est celui de la fraîcheur, documenté dans le README, pas celui du cache.

### Coupure pendant un envoi de réservation

Si le réseau tombe pendant un POST déjà parti, et que la page de réservation reste ouverte, le scope d’async ne jette pas cette mutation. L’écran propose « Récupérer le reçu du même envoi ». Une réponse `201` qui arrive ensuite ouvre encore `/suivi#` suivi du jeton. Quitter cette page abandonne seulement l’affichage : la réponse tardive ne redirige plus. Cette mémoire est celle du composant React, perdue au rechargement. Ce n’est pas une file d’attente du service worker. Il n’y a pas de Background Sync.

### Nouvelle navigation sans réseau

Si le service worker est déjà actif et que le chargement d’une page échoue, le visiteur voit `offline.html`. Il ne voit pas le dernier accueil, le dernier récapitulatif, ni un dossier. Si le service worker n’a jamais été installé (cas typique de l’adresse IP en HTTP), le navigateur montre sa propre erreur réseau. Le projet ne la remplace pas.

## Installation

`App` écoute `beforeinstallprompt`, appelle `preventDefault`, et garde l’événement. Le bandeau du bas dit : « Un lien suffit. L’installation reste facultative. »

- Si l’événement a été capturé, le bouton affiche « Installer OCD Live » et appelle `prompt()`. Une acceptation retire l’événement. Un refus le laisse disponible.
- Sinon, le bouton affiche « À propos de l’installation » et ouvre ou ferme un encart. Le texte dit d’utiliser le menu du navigateur (« Installer l’application » ou « Ajouter à l’écran d’accueil »), que localhost est accepté sur cet ordinateur, et qu’un téléphone a besoin d’une adresse HTTPS accessible. Rien n’est à installer pour réserver.

Cette démo ne fournit pas cet HTTPS. Un téléphone sur `http://<ip-du-wi-fi>:4173` peut utiliser le site. Il ne reçoit en général ni l’événement d’installation ni le service worker. Le projet ne prétend pas le contraire, et ne fournit pas de tunnel pour contourner cette limite.

La page `/confidentialite` répète la même frontière : installation facultative, page informative hors connexion, horaires et dossiers qui exigent le réseau, aucun envoi silencieux en attente.

## Ce qui n’est jamais conservé dans le navigateur

- Pas de `localStorage` dans `src/api.ts` ni dans `public/sw.js`.
- Pas de `cache.put`.
- Pas de dossier, de jeton de suivi, de clé d’idempotence, de session admin ni de mot de passe dans le cache.
- Le cookie de session admin est `HttpOnly`, chemin `/api/admin`. Le worker ne le lit pas. Les routes `/api/` ne sont pas interceptées.
- Le jeton de reçu vit dans le hash de `/suivi` et dans la base SQLite du serveur. Fermer l’onglet ou vider le cache du worker ne le copie nulle part, et ne le supprime pas du serveur non plus. Seul le lien encore connu permet de rouvrir le dossier, et seulement avec le réseau.

## Tests qui verrouillent ce contrat

`tests/pwa.test.mjs` :

- le manifeste est `standalone`, en français, avec de vraies icônes 192 et 512 ;
- le worker contient l’allowlist et `offline.html`, ne contient pas `cache.put` ni `localStorage` ;
- la page hors connexion dit qu’aucune demande n’est envoyée ;
- un worker exécuté dans un bac à sable met en cache la page hors connexion et pas `/api`, `/admin` ou `/suivi` ;
- un GET `/api/admin/bookings` n’est pas intercepté ;
- une navigation dont le réseau échoue reçoit l’objet hors connexion, pas des données de dossier ;
- l’activation supprime `ocd-safe-shell-v0` et laisse `other-app-cache` ainsi que le cache courant.

Ces tests exécutent le script. Ils ne lancent pas Chrome et ne mesurent pas l’installation réelle.

## Limites

- HTTP local uniquement dans cette démo. Pas de certificat, pas de domaine public.
- L’enregistrement du worker et l’installation depuis une IP Wi-Fi en HTTP ne sont pas fournis par la plateforme. Le site y fonctionne comme un site web.
- Le cache ne se rafraîchit pas tout seul. Changer un fichier de l’allowlist sans changer le nom du cache laisse l’ancienne copie.
- `skipWaiting` et `clients.claim` rendent le nouveau worker actif vite. Comme il ne met pas l’application en cache, ils ne provoquent pas une version hors ligne fantôme du planning. Ils ne dispensent pas pour autant de recharger après un nouveau build servi par le réseau.
- Aucune file d’envoi, aucun push, aucune synchronisation périodique.
- Aucun chiffre de performance ou d’audit Lighthouse n’est revendiqué ici.
