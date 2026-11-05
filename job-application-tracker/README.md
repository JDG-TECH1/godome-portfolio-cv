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
- Le compagnon Windows avec accès local explicite n’est pas encore inclus. Le site Vercel ne peut pas lire les autres fenêtres du navigateur, les mots de passe enregistrés, les fichiers locaux ou agir sur l’ordinateur. Une application locale distincte nécessitera une installation et une autorisation explicite.
