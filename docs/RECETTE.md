# Recette navigateur : BLOQUÉE, aucune case exécutée

Application réelle : http://127.0.0.1:4173 (origine exacte). Le serveur Node doit rester allumé. Aucune recette visuelle n’est revendiquée ici : les tests automatiques ne remplacent pas le navigateur.

**État au 2026-11-08 02:21 Africa/Ouagadougou (UTC+0) :** le navigateur réel du parent a reçu ERR_CONNECTION_REFUSED sur 127.0.0.1:4173 puis localhost. Les essais ont été arrêtés sur instruction ; aucun changement de proxy, liaison réseau, tunnel ou déploiement. Checklist préparatoire uniquement, à utiliser seulement après résolution autorisée du blocage d’accès. Les tests React/SW simulés ne constituent pas cette recette.

## 1. Visuel et responsive
- Accueil à 1440×900 puis 390×844 et 320 px : vrai logo orange net à proportion conservée, titres non tronqués, aucun débordement horizontal ni bouton masqué.
- Six packs présents, notice prix illustratifs visible. Grand Live sombre, quatre sessions mensuelles décrites honnêtement.
- Clavier : lien d’évitement, navigation, boutons et détails FAQ ; focus visible. Labels et erreurs lisibles ; préférence mouvement réduit respectée.
- Vérifier chargement local polices/assets et absence d’erreurs console/CSP. Zoom 200 % : parcours encore utilisable.

## 2. Réservation réelle
- /reserver : studio, Découverte, jour futur, heure disponible.
- Étape activité : bouton « Remplir un exemple » (ne pas saisir de données personnelles), récapitulatif, envoyer.
- Reçu : demande en attente, pas confirmée ; lien privé à conserver. Copie du lien fonctionnelle ou message d’aide si refus navigateur.
- Deuxième parcours à distance et pack 4 h. Mensuel ne réserve que la première session, promotion Visibilité manuelle clairement annoncée.
- Double clic et retour réseau ne créent pas deux dossiers (en plus des preuves API). Après réponse perdue, récupération explicite du même payload original dans le composant vivant, même après édition. Fermer/recharger perd cette mémoire : ne pas présenter une reprise persistante.
- Recliquer la formule/date déjà choisie ne doit pas laisser le chargement bloqué ; détails désactivés pendant envoi.

## 3. Collisions et erreurs
- Deux onglets affichent la même disponibilité. A envoie, B envoie le même créneau. B doit voir le conflit et retrouver son activité intacte après choix d’un autre créneau.
- Formulaire incomplet : validation explicite. Date hors horaires / passée, email invalide ou consentement absent : jamais de faux reçu réussi.
- Réseau coupé : bandeau, aucune mutation ; après reconnexion, rafraîchir et vérifier les disponibilités avant envoi.
- Serveur inaccessible tout en restant connecté au Wi-Fi : état « non actualisées », dernière synchronisation historique, boutons serveur bloqués ; succès d’actualisation les réactive.
- Quota : 3 options en attente/IP, puis quatrième dossier distinct => 429 explicite ; traiter/refuser/laisser expirer libère une place. Préparer au plus une option en attente avant scénario collision à deux onglets pour ne pas déclencher une autre limite en premier.
- Réponses différées : changer de reçu pendant POST, logout/relogin pendant GET, inverser deux GET ; aucune donnée ancienne ne doit remplacer le contexte actuel (preuves automatisées disponibles).

## 4. Équipe
- /admin doit afficher une connexion, jamais les demandes sans session.
- /demo-equipe offre un aperçu public fictif en lecture seule ; il n’est pas une porte dérobée ni le contenu de la base.
- Authentification avec la valeur du fichier privé admin-login.txt uniquement via mécanisme sécurisé de saisie ; ne jamais afficher le mot de passe en chat/vidéo.
- Une fois connecté : filtrer, chercher, ouvrir un dossier, confirmer puis vérifier le suivi client.
- Refus motivé : motif visible et créneau libéré.
- Report : nouveau jour/heure UTC+0 et motif, ancien conservé ; client accepte/refuse depuis suivi privé ; vérifier les deux transitions et une collision de report.
- Planning : cartes horaires cohérentes, propositions figurent aussi sur le nouveau jour. Notifications toutes étiquetées simulées.
- Déconnexion : données visibles effacées et endpoint admin de nouveau refusé.

## 5. PWA
- Manifeste et icônes 192/512 détectés ; installation facultative si prise en charge.
- Après première visite, navigation sans réseau => écran informatif hors connexion, aucun reçu/admin caché.
- Ne pas prétendre installation smartphone avec localhost distant. Déploiement HTTPS non autorisé ni fourni.

## Vidéo préparée, pas produite

Voir **docs/MOTION-STORYBOARD.md** : storyboard/narration 120 s, scènes, checklist des captures, transitions et protection des secrets. Toutes les captures sont manquantes à cause du blocage navigateur. Aucun MP4, screenshot inventé ou vidéo de maquette ne remplace la vidéo de l’application réelle demandée.
