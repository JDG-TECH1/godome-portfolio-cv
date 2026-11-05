# Suivi de candidatures — Vercel + Supabase

Application web multi-appareils. Supabase Auth gère les comptes et les e-mails de récupération; Supabase Postgres stocke le profil privé et les offres; Vercel sert l’interface.

## Formulaire de création de compte

Le formulaire demande nom, e-mail, mot de passe (12 caractères minimum), téléphone, ville/pays, liens LinkedIn/portfolio/GitHub/CV, postes recherchés, compétences, lieux souhaités, préférence de travail, contrats et disponibilité. Salaire souhaité est facultatif. Les valeurs du CV de KOFFI (Jean-David) GODOME sont préremplies et modifiables. Une case de consentement informe du stockage cloud. Le mot de passe de l’application n’est jamais stocké en clair.

## 1. Créer/configurer Supabase

1. Crée un projet sur [Supabase](https://supabase.com/dashboard).
2. Dans **SQL Editor**, exécute `supabase/migrations/202611050001_initial.sql`.
3. Dans **Authentication → URL Configuration**, ajoute l’URL Vercel comme Site URL et comme URL de redirection, avec `https://<ton-projet>.vercel.app/**`. Ajoute aussi `http://localhost:5173/**` pour le développement local.
4. Dans **Authentication → Providers → Email**, active la vérification d’adresse et la réinitialisation. Configure un fournisseur e-mail/SMTP si nécessaire.
5. Dans les paramètres de sécurité Auth, définis la longueur minimale du mot de passe à 12 caractères (la vérification du formulaire seule ne remplace pas la règle serveur).
6. Récupère l’URL du projet et sa clé publishable/anon dans **Project Settings → API**.

La migration active RLS pour les tables et limite chaque ligne au propriétaire authentifié. La clé `service_role` ne doit jamais être utilisée dans le navigateur ou dans Vercel.

## 2. Tester localement

1. Copier `.env.example` vers `.env.local`.
2. Remplacer les deux valeurs Supabase par celles du projet.
3. Exécuter `npm.cmd install`, puis `npm.cmd run dev`.
4. Ouvrir `http://localhost:5173`.

Les nouveaux utilisateurs peuvent recevoir un e-mail de confirmation avant leur première connexion. « Mot de passe oublié » utilise le flux de récupération Supabase.

## 3. Déployer sur GitHub puis Vercel

1. Pousser ce dossier dans un dépôt GitHub privé ou public. Ne pousser aucun `.env.local`.
2. Dans Vercel, importer ce dépôt et choisir `job-application-tracker` comme **Root Directory**.
3. Définir les variables d’environnement pour Preview et Production :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (ou la clé publishable Supabase)
4. Déployer, puis copier l’URL Vercel dans la configuration URL/Auth Supabase.
5. Tester création de compte, e-mail de confirmation, connexion, modification du profil, offre et réinitialisation depuis un autre appareil.

## Confidentialité et limites

- Les profils et candidatures sont stockés sur Supabase et accessibles depuis tes appareils après connexion.
- La base utilise des politiques RLS afin qu’un utilisateur ne puisse lire ou modifier que ses propres enregistrements.
- Les mots de passe des sites d’emploi ne sont pas collectés. Le navigateur conserve leurs sessions selon leurs règles.
- Les annonces, formulaires et envois restent sous ton contrôle; l’interface ne crée aucun compte tiers et ne soumet pas de candidature automatiquement.
- Le lien CV prérempli est public (l’URL du portfolio); remplace-le si tu veux employer un CV différent.

## Assistant de recherche (première version)

- Prépare des recherches publiques pour un métier et un pays/région sur LinkedIn, des pages carrière Greenhouse, Lever, Ashby et Workday, ainsi que Job Bank, HelloWork, France Travail, Emploi.ci, Malt, Upwork, ComeUp et Fiverr. Les plateformes disponibles varient selon le lieu et leurs propres règles; ces liens ne constituent pas une recherche exhaustive ni une collecte automatique des annonces.
- Suit le nombre de candidatures marquées « Envoyée » dans le mois, avec un objectif indicatif de 200.
- Calcule une adéquation indicative à partir du titre, des compétences et du lieu renseignés dans le profil et l’annonce. Le détail du score est visible avant enregistrement; ce calcul simple n’est ni une évaluation ATS ni une garantie d’adéquation. Le score reste modifiable.
- Détecte les offres déjà enregistrées à la même adresse, permet de trier par adéquation ou échéance et d’exporter les offres en JSON. L’export contient les descriptions et notes des offres; conserve le fichier de façon privée.
- Génère des brouillons de candidature en mettant en avant les compétences du profil repérées dans l’annonce, ainsi que des brouillons de prise de contact. Relis et adapte chaque texte; aucun compte tiers n’est créé et aucun message n’est envoyé automatiquement.
- Le site Vercel ne peut pas lire les autres fenêtres du navigateur, les mots de passe enregistrés ou les fichiers locaux. Le compagnon Windows local, ses autorisations et ses limites sont décrits ci-dessous.

## Compagnon Windows local (première version)

Le compagnon est un programme Node.js local, distinct du site Vercel. Il écoute uniquement sur `127.0.0.1:8788` et n'ouvre aucun port sur le réseau.

1. Installe Node.js LTS si nécessaire.
2. Double-clique sur `companion/Demarrer-Compagnon.bat`, ou lance `npm.cmd run companion` depuis ce dossier.
3. Ouvre `http://127.0.0.1:8788` dans ton navigateur.
4. Le profil de recherche est enregistré dans `%LOCALAPPDATA%\EmploiIA\Companion\state.json`. Les identifiants OAuth Gmail et ses jetons sont conservés séparément dans `gmail.dpapi`, chiffrés pour le compte Windows courant.

### Ce qu'il fait actuellement

- Prépare cinq recherches d'emploi à 10 h et cinq autres à 15 h, heure d'Abidjan, lorsque la planification est activée. À 10 h, il ajoute cinq recherches de missions sur Malt, Upwork, ComeUp, Fiverr et LinkedIn Services. Les recherches sont des liens à ouvrir volontairement; le compagnon ne lance pas des dizaines d'onglets.
- Enregistre les offres que tu saisis, calcule une adéquation heuristique explicable, suit leur statut et prépare un brouillon local.
- Peut utiliser un modèle **Ollama déjà installé et démarré localement** pour créer un brouillon IA. Les requêtes sont envoyées uniquement au service Ollama de cet ordinateur (`127.0.0.1:11434`); le compagnon n'installe pas de modèle et n'envoie pas de contenu à un fournisseur cloud. Le modèle est détecté dans le tableau de bord.
- Avec Ollama disponible, le chat conserve jusqu'à 20 échanges récents (40 messages) pour donner du contexte. La conversation peut être effacée séparément. Sans modèle local disponible, le compagnon affiche l'état et désactive le chat IA.
- Gmail peut lire les métadonnées et extraits des 10 derniers messages pertinents de la boîte de réception (recherche limitée aux 30 derniers jours), à la demande ou toutes les 15 minutes si la surveillance est activée. Il peut préparer un e-mail; l'envoi exige une confirmation distincte, un seul destinataire et une limite d'un envoi par 30 secondes.
- Écrit un journal local des recherches planifiées, modifications de profil, offres et brouillons. Le bouton « Effacer les données du compagnon » demande une confirmation et met la planification en pause.
- La planification fonctionne uniquement tant que le compagnon reste ouvert. Pour le lancer à chaque ouverture de session Windows, exécute `companion/Activer-Demarrage-Windows.ps1` et confirme la demande. Pour révoquer ce démarrage automatique, exécute `companion/Desactiver-Demarrage-Windows.ps1`. Ces scripts n'utilisent pas les droits administrateur.

### Configurer Gmail (facultatif)

1. Dans [Google Cloud Console](https://console.cloud.google.com/), crée un projet, active **Gmail API**, puis configure l'écran de consentement OAuth. Si l'audience est en mode **Test**, ajoute ton adresse Google comme utilisateur test.
2. Crée un identifiant OAuth de type **Desktop app** dans [Clients OAuth](https://console.cloud.google.com/auth/clients). Ne crée pas de client Web ni de redirection Vercel : le compagnon utilise un callback local temporaire sur `127.0.0.1`.
3. Dans le compagnon, colle l'identifiant et le secret du client Desktop, puis choisis **Connecter mon compte Google** et accepte les autorisations demandées dans la fenêtre Google.
4. La lecture se fait uniquement après connexion. Active la surveillance explicitement; désactive-la ou choisis **Révoquer et déconnecter Gmail** pour arrêter l'accès. L'effacement de toutes les données locales tente aussi de révoquer l'accès Google.

Le compagnon demande les portées `gmail.readonly` et `gmail.send`. Google les classe respectivement comme restreinte et sensible; un avertissement « application non vérifiée » ou des limites de test peuvent s'appliquer. Pour un usage personnel, reste en mode test et autorise uniquement ton propre compte. Les jetons et le secret OAuth sont protégés par DPAPI dans le compte Windows courant, et ne sont pas envoyés à Vercel/Supabase. Les messages synchronisés ne comprennent que l'expéditeur, l'objet, la date et un extrait limité. Pour retirer l'accès, utilise aussi [les connexions tierces du compte Google](https://myaccount.google.com/connections). Voir les [exigences de vérification des portées OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

Le flux Gmail simulé est vérifié sous Windows avec `npm.cmd test`; ce test ne réalise pas de connexion réelle à Google et n'envoie aucun e-mail réel.

### Autorisations et limites actuelles

- **Aucune candidature ni aucun e-mail n'est envoyé automatiquement.** Les candidatures sont préparées pour que tu les vérifies et les soumettes toi-même. L'envoi Gmail exige toujours la confirmation explicite de l'e-mail affiché. Aucun mot de passe Google ou de site tiers n'est demandé.
- Le contrôle d'autres fenêtres et l'automatisation de formulaires ne sont pas implémentés. Le compagnon ne crée pas de compte tiers et ne postule pas tout seul.
- Le générateur sans Ollama repose sur des règles simples, pas sur un modèle d'IA. Les correspondances et brouillons sont indicatifs; vérifie chaque affirmation.
- Ce compagnon ne synchronise pas ses données avec Supabase et ne réveille pas un PC en veille. Arrête-le en fermant sa fenêtre terminal ou en appuyant sur `Ctrl+C`.
- La mémoire locale (profil, offres, journal et conversation) est un fichier du profil Windows. Efface la conversation ou toutes les données depuis l'interface; sinon, arrête le compagnon puis supprime uniquement les fichiers du dossier `EmploiIA\Companion`. Pour supprimer Gmail aussi, utilise d'abord le bouton de révocation ou l'effacement des données.
