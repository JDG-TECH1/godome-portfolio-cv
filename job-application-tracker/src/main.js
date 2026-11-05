import { createClient } from "@supabase/supabase-js";
import "./style.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const root = document.querySelector("#app");
const statuses = ["À examiner", "À préparer", "Prête à envoyer", "Envoyée", "Entretien", "Refusée", "Relance"];
const defaults = {
  full_name: "KOFFI (Jean-David) GODOME",
  phone: "+225 05 86 54 26 86",
  location: "Grand-Bassam, Côte d’Ivoire",
  linkedin_url: "https://www.linkedin.com/in/koffi-godome-b4041531a/",
  portfolio_url: "https://godome-portfolio-cv.vercel.app/",
  github_url: "https://github.com/JDG-TECH1",
  target_roles: "Développeur Full Stack, Développeur d’applications, Développeur Node.js, Développeur IA",
  skills: "JavaScript, TypeScript, Node.js, React, Next.js, Java, Python, PHP, MySQL, PostgreSQL, Supabase, IA générative, n8n",
  target_locations: "Côte d’Ivoire, France, Canada",
  work_preferences: "Télétravail, hybride ou sur site selon l’offre",
  contract_types: "CDI, CDD, freelance",
  availability: "À convenir",
  salary_expectation: "",
  cv_url: "https://godome-portfolio-cv.vercel.app/CV-Jean-David-Godome.pdf",
};

let supabase;
let currentUser = null;
let profile = null;
let offers = [];

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const dateTime = (value) => value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "";
const localDate = () => new Intl.DateTimeFormat("en-CA").format(new Date());

function showError(container, text) {
  const element = typeof container === "string" ? document.querySelector(container) : container;
  if (!element) return;
  element.textContent = text;
  element.classList.remove("success");
}

function showSuccess(container, text) {
  const element = typeof container === "string" ? document.querySelector(container) : container;
  if (!element) return;
  element.textContent = text;
  element.classList.add("success");
}

function field(name, label, value = "", options = {}) {
  const { type = "text", required = false, hint = "", placeholder = "", rows = 0, autocomplete = "" } = options;
  const id = `profile-${name}`;
  const common = `id="${id}" name="${name}" ${required ? "required" : ""} ${autocomplete ? `autocomplete="${autocomplete}"` : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}`;
  const control = rows
    ? `<textarea ${common} rows="${rows}">${esc(value)}</textarea>`
    : `<input ${common} type="${type}" value="${esc(value)}" ${type === "url" ? 'inputmode="url"' : ""}>`;
  return `<label class="field" for="${id}"><span>${label}${required ? " *" : ""}</span>${control}${hint ? `<small>${hint}</small>` : ""}</label>`;
}

function profileValues(source = {}) {
  return { ...defaults, ...source };
}

function renderAuth(mode = "register") {
  const isRegister = mode === "register";
  root.innerHTML = `
    <header class="topbar"><a class="brand" href="/">Candidatures<span>.</span></a><span class="local-label">Ton espace personnel</span></header>
    <main class="auth-wrap">
      <section class="auth-card">
        <div class="eyebrow">${isRegister ? "Créer mon espace" : mode === "forgot" ? "Récupération sécurisée" : "Espace personnel"}</div>
        <h1>${isRegister ? "Ton profil professionnel." : mode === "forgot" ? "Réinitialiser le mot de passe." : "Content de te revoir."}</h1>
        <p class="lead">${isRegister ? "Renseigne ton profil une seule fois : il aidera à préparer le suivi des offres et tes futures candidatures." : mode === "forgot" ? "Un code de récupération sera envoyé à l’adresse de ton compte." : "Connecte-toi pour retrouver tes offres et le suivi de tes candidatures."}</p>
        <form id="auth-form" class="${isRegister ? "registration-form" : ""}">
          ${isRegister ? `
            <h2>Compte sécurisé</h2>
            <div class="form-grid">
              ${field("full_name", "Nom complet", defaults.full_name, { required: true, autocomplete: "name" })}
              ${field("email", "Adresse e-mail", "", { required: true, type: "email", autocomplete: "email" })}
              ${field("password", "Mot de passe", "", { required: true, type: "password", autocomplete: "new-password", hint: "12 caractères minimum. Choisis un mot de passe unique." })}
              ${field("password_confirm", "Confirmer le mot de passe", "", { required: true, type: "password", autocomplete: "new-password" })}
            </div>
            <h2>Coordonnées et liens</h2>
            <div class="form-grid">
              ${field("phone", "Téléphone", defaults.phone, { required: true, type: "tel", autocomplete: "tel" })}
              ${field("location", "Ville et pays", defaults.location, { required: true, autocomplete: "address-level2" })}
              ${field("linkedin_url", "Profil LinkedIn", defaults.linkedin_url, { type: "url" })}
              ${field("portfolio_url", "Portfolio", defaults.portfolio_url, { type: "url" })}
              ${field("github_url", "GitHub", defaults.github_url, { type: "url" })}
              ${field("cv_url", "Lien vers le CV PDF", defaults.cv_url, { type: "url" })}
            </div>
            <h2>Préférences de recherche</h2>
            <div class="form-grid">
              ${field("target_roles", "Postes recherchés", defaults.target_roles, { required: true, rows: 2, hint: "Sépare les postes par des virgules." })}
              ${field("skills", "Compétences principales", defaults.skills, { required: true, rows: 2, hint: "Technologies et domaines de compétence." })}
              ${field("target_locations", "Pays et lieux souhaités", defaults.target_locations, { required: true })}
              ${field("work_preferences", "Télétravail / mobilité", defaults.work_preferences, { required: true })}
              ${field("contract_types", "Types de contrat", defaults.contract_types, { required: true })}
              ${field("availability", "Disponibilité", defaults.availability, { required: true })}
              ${field("salary_expectation", "Salaire souhaité (facultatif)", "", { placeholder: "Montant et devise, ou à discuter" })}
            </div>
            <label class="consent"><input name="privacy_consent" type="checkbox" required><span>J’accepte que les informations de mon profil et mes offres soient stockées sur Supabase pour utiliser cette application.</span></label>
          ` : mode === "forgot" ? `
            ${field("email", "Adresse e-mail", "", { required: true, type: "email", autocomplete: "email" })}
          ` : `
            ${field("email", "Adresse e-mail", "", { required: true, type: "email", autocomplete: "email" })}
            ${field("password", "Mot de passe", "", { required: true, type: "password", autocomplete: "current-password" })}
          `}
          <p id="form-message" class="message" role="status"></p>
          <button class="button button-primary submit-button" type="submit">${isRegister ? "Créer mon compte" : mode === "forgot" ? "Envoyer le code de récupération" : "Se connecter"}</button>
        </form>
        <div class="auth-links">
          ${mode === "login" ? `<button id="forgot-link" class="text-button" type="button">Mot de passe oublié ?</button><button id="register-link" class="text-button" type="button">Créer mon compte</button>` : ""}
          ${mode === "register" ? `<button id="login-link" class="text-button" type="button">J’ai déjà un compte</button>` : ""}
          ${mode === "forgot" ? `<button id="login-link" class="text-button" type="button">Retour à la connexion</button>` : ""}
        </div>
        <p class="privacy-note">Ne saisis pas ici les mots de passe de LinkedIn ou d’autres sites d’emploi. Les candidatures restent à vérifier et confirmer par toi.</p>
      </section>
    </main>
    <footer>Stockage sécurisé Supabase · accès à ton compte depuis tes appareils</footer>`;

  document.querySelector("#auth-form").addEventListener("submit", (event) => {
    handleAuthSubmit(event, mode).catch((error) => showError("#form-message", error.message));
  });
  document.querySelector("#forgot-link")?.addEventListener("click", () => renderAuth("forgot"));
  document.querySelector("#login-link")?.addEventListener("click", () => renderAuth("login"));
  document.querySelector("#register-link")?.addEventListener("click", () => renderAuth("register"));
}

function collectProfile(formData) {
  const keys = [
    "full_name", "phone", "location", "linkedin_url", "portfolio_url", "github_url",
    "target_roles", "skills", "target_locations", "work_preferences", "contract_types",
    "availability", "salary_expectation", "cv_url",
  ];
  return Object.fromEntries(keys.map((key) => [key, String(formData.get(key) || "").trim()]));
}

async function handleAuthSubmit(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const message = document.querySelector("#form-message");
  if (mode === "register") {
    const password = String(formData.get("password") || "");
    if (password.length < 12) return showError(message, "Le mot de passe doit contenir au moins 12 caractères.");
    if (password !== formData.get("password_confirm")) return showError(message, "Les deux mots de passe ne correspondent pas.");
    if (!formData.get("privacy_consent")) return showError(message, "Confirme le consentement au stockage du profil.");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const values = collectProfile(formData);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: values },
    });
    if (error) return showError(message, error.message);
    if (data.session && data.user) {
      currentUser = data.user;
      const { error: saveError } = await supabase.from("profiles").upsert({ user_id: data.user.id, ...values });
      if (saveError) return showError(message, `Compte créé, mais profil non enregistré : ${saveError.message}`);
      await loadDashboard();
    } else {
      form.reset();
      showSuccess(message, "Compte créé. Vérifie ta boîte e-mail pour confirmer l’adresse, puis connecte-toi.");
    }
    return;
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (mode === "forgot") {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/?reset=1` });
    if (error) return showError(message, error.message);
    return showSuccess(message, "Si le compte existe, un lien de récupération a été envoyé. Vérifie aussi les courriers indésirables.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: String(formData.get("password") || "") });
  if (error) return showError(message, error.message);
  currentUser = data.user;
  await loadDashboard();
}

function renderProfileEditor() {
  const value = profileValues(profile || {});
  return `
    <details class="profile-panel">
      <summary>Mon profil et mes préférences</summary>
      <form id="profile-form" class="profile-edit-form">
        <div class="form-grid">
          ${field("full_name", "Nom complet", value.full_name || "", { required: true })}
          ${field("phone", "Téléphone", value.phone || "", { required: true, type: "tel" })}
          ${field("location", "Ville et pays", value.location || "", { required: true })}
          ${field("linkedin_url", "Profil LinkedIn", value.linkedin_url || "", { type: "url" })}
          ${field("portfolio_url", "Portfolio", value.portfolio_url || "", { type: "url" })}
          ${field("github_url", "GitHub", value.github_url || "", { type: "url" })}
          ${field("cv_url", "Lien vers le CV PDF", value.cv_url || "", { type: "url" })}
          ${field("target_roles", "Postes recherchés", value.target_roles || "", { required: true, rows: 2 })}
          ${field("skills", "Compétences principales", value.skills || "", { required: true, rows: 2 })}
          ${field("target_locations", "Pays et lieux souhaités", value.target_locations || "", { required: true })}
          ${field("work_preferences", "Télétravail / mobilité", value.work_preferences || "", { required: true })}
          ${field("contract_types", "Types de contrat", value.contract_types || "", { required: true })}
          ${field("availability", "Disponibilité", value.availability || "", { required: true })}
          ${field("salary_expectation", "Salaire souhaité (facultatif)", value.salary_expectation || "")}
        </div>
        <p id="profile-message" class="message" role="status"></p>
        <button class="button button-primary" type="submit">Enregistrer mon profil</button>
      </form>
    </details>`;
}

function renderOfferForm() {
  return `
    <form id="offer-form" class="offer-form hidden">
      <h3>Nouvelle piste</h3>
      <div class="form-grid">
        ${field("company", "Entreprise", "", { required: true })}
        ${field("title", "Intitulé du poste", "", { required: true })}
        ${field("url", "Lien de l’offre", "", { required: true, type: "url", placeholder: "https://" })}
        ${field("location", "Lieu")}
        ${field("source", "Plateforme", "", { placeholder: "LinkedIn, Job Bank…" })}
        ${field("job_type", "Type de contrat")}
        ${field("salary", "Salaire annoncé")}
        ${field("deadline", "Date limite", "", { type: "date" })}
        ${field("fit_score", "Adéquation estimée (%)", "", { type: "number", placeholder: "Calcul automatique si vide" })}
        <label class="field" for="offer-status"><span>Statut</span><select id="offer-status" name="status"><option>À examiner</option><option>À préparer</option><option>Prête à envoyer</option></select></label>
        ${field("notes", "Description de l’offre et notes", "", { rows: 5, hint: "Colle la description ici pour une estimation plus pertinente." })}
      </div>
      <p id="fit-preview" class="fit-preview" aria-live="polite">Ajoute le titre, le lieu et la description pour voir une estimation expliquée.</p>
      <p id="offer-message" class="message" role="status"></p>
      <div class="form-actions"><button class="button button-primary" type="submit">Enregistrer l’offre</button><button id="cancel-add" class="button button-outline" type="button">Annuler</button></div>
    </form>`;
}

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

function containsTerm(text, term) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedTerm = normalizeText(term);
  return Boolean(normalizedTerm) && normalizedText.includes(` ${normalizedTerm} `);
}

function scoreOffer(offer) {
  const title = normalizeText(offer.title);
  const evidence = normalizeText(`${offer.title || ""} ${offer.notes || ""}`);
  const roles = String(profile?.target_roles || "").split(",").map((role) => normalizeText(role)).filter(Boolean);
  const skills = String(profile?.skills || "").split(",").map((skill) => normalizeText(skill)).filter((skill) => skill.length > 1);
  const roleCoverage = roles.map((role) => {
    if (title.includes(role)) return 1;
    const words = role.split(/\s+/).filter((word) => word.length > 1);
    return words.length ? words.filter((word) => containsTerm(title, word)).length / words.length : 0;
  });
  const bestRoleCoverage = Math.max(0, ...roleCoverage);
  const roleScore = Math.round(45 * bestRoleCoverage);
  const matchedSkills = skills.filter((skill) => containsTerm(evidence, skill));
  const skillScore = skills.length ? Math.round(40 * matchedSkills.length / skills.length) : 0;
  const desiredLocations = String(profile?.target_locations || "").split(",").map(normalizeText).filter(Boolean);
  const jobLocation = normalizeText(offer.location);
  const remoteMatch = /remote|teletravail|a distance/.test(jobLocation) && /remote|teletravail|distance/.test(normalizeText(profile?.work_preferences));
  const locationMatch = jobLocation && desiredLocations.some((desired) => desired.includes(jobLocation) || jobLocation.includes(desired));
  const locationScore = locationMatch || remoteMatch ? 15 : jobLocation ? 0 : 8;
  const locationReason = locationMatch ? "lieu dans tes préférences" : remoteMatch ? "télétravail compatible" : jobLocation ? "lieu hors de tes préférences" : "lieu à vérifier";
  const bestRoleIndex = roleCoverage.indexOf(bestRoleCoverage);
  return {
    score: Math.min(100, roleScore + skillScore + locationScore),
    roleScore,
    skillScore,
    locationScore,
    matchedRole: roles[bestRoleIndex] || "",
    matchedSkills,
    locationReason,
  };
}

function renderFitPreview() {
  const form = document.querySelector("#offer-form");
  if (!form) return;
  const values = new FormData(form);
  const result = scoreOffer({
    title: String(values.get("title") || ""),
    location: String(values.get("location") || ""),
    notes: String(values.get("notes") || ""),
  });
  const role = result.matchedRole ? `métier ${result.roleScore}/45` : "métier à vérifier";
  const skills = result.matchedSkills.length ? `${result.matchedSkills.join(", ")} (${result.skillScore}/40)` : `compétences à vérifier (${result.skillScore}/40)`;
  document.querySelector("#fit-preview").textContent = `Estimation indicative : ${result.score}/100 · ${role} · ${skills} · ${result.locationReason} (${result.locationScore}/15). Vérifie les critères obligatoires toi-même.`;
}

function renderAssistant() {
  const firstRole = (profile?.target_roles || "").split(",")[0].trim();
  return `
    <section class="assistant-panel">
      <div class="assistant-heading">
        <div>
          <div class="eyebrow">Assistant de recherche</div>
          <h2>Des pistes ciblées, à vérifier avant d’agir.</h2>
          <p>Choisis un métier et un pays pour ouvrir des recherches sur des plateformes publiques.</p>
        </div>
        <div class="monthly-goal"><strong id="month-count">0</strong><span>/ 200 candidatures ce mois-ci</span><progress id="month-progress" max="200" value="0" aria-label="Progression de l’objectif mensuel"></progress></div>
      </div>
      <form id="agent-search-form" class="agent-search-form">
        ${field("agent_role", "Métier ou service recherché", firstRole, { required: true, placeholder: "Développeur Full Stack" })}
        ${field("agent_location", "Pays ou région", (profile?.target_locations || "").split(",")[0].trim() || "Monde entier", { required: true, placeholder: "Monde entier" })}
        <label class="field" for="agent-mode"><span>Type de recherche</span><select id="agent-mode" name="mode"><option value="jobs">Emploi salarié</option><option value="clients">Missions / clients</option></select></label>
        <button class="button button-primary" type="submit">Préparer les recherches</button>
      </form>
      <div id="agent-search-results" class="agent-search-results" aria-live="polite"></div>
      <div class="draft-grid">
        <form id="job-draft-form" class="draft-card">
          <h3>Préparer une candidature</h3>
          <p>Génère un brouillon à relire et personnaliser avant tout envoi.</p>
          ${field("draft_company", "Entreprise", "", { required: true })}
          ${field("draft_title", "Poste", "", { required: true })}
          ${field("draft_description", "Description de l’offre", "", { rows: 4, hint: "Le brouillon ne mettra en avant que les compétences déjà inscrites dans ton profil." })}
          <button class="button button-outline" type="submit">Créer mon brouillon</button>
          <textarea id="job-draft-output" class="draft-output hidden" rows="8" readonly aria-label="Brouillon de candidature"></textarea>
          <button class="button button-outline copy-draft hidden" data-copy="job-draft-output" type="button">Copier le brouillon</button>
        </form>
        <form id="client-draft-form" class="draft-card">
          <h3>Préparer une prise de contact</h3>
          <p>Un message de prospection à vérifier ; aucun message n’est envoyé automatiquement.</p>
          ${field("client_name", "Nom du client ou de l’entreprise", "", { required: true })}
          ${field("client_need", "Besoin repéré", "", { required: true, rows: 2, placeholder: "Ex. refonte d’une application web" })}
          <button class="button button-outline" type="submit">Rédiger une proposition</button>
          <textarea id="client-draft-output" class="draft-output hidden" rows="8" readonly aria-label="Brouillon de prise de contact"></textarea>
          <button class="button button-outline copy-draft hidden" data-copy="client-draft-output" type="button">Copier le brouillon</button>
        </form>
      </div>
      <p class="safety-note">Les recherches ouvrent des pages publiques ; elles ne garantissent pas l’exhaustivité. Les comptes tiers, candidatures et prises de contact restent à créer, vérifier et envoyer par toi. N’enregistre pas ici de mots de passe tiers.</p>
    </section>`;
}

function searchLinks(role, locationName, mode) {
  const query = `${role} ${locationName}`.trim();
  const google = (site, label) => ({
    label,
    url: `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${query} ${mode === "jobs" ? "emploi offre" : "freelance mission client"}`)}`,
  });
  const generalSearch = (label) => ({
    label,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${mode === "jobs" ? "emploi offre" : "freelance mission client"}`)}`,
  });
  if (mode === "clients") {
    return [
      google("malt.fr", "Rechercher sur Malt"),
      google("upwork.com", "Rechercher sur Upwork"),
      google("linkedin.com/services", "Rechercher des clients LinkedIn"),
      google("comeup.com", "Rechercher sur ComeUp"),
      google("fiverr.com", "Rechercher sur Fiverr"),
      generalSearch("Recherche web générale"),
    ];
  }
  const links = [
    { label: "Rechercher sur LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(locationName)}` },
    google("linkedin.com/jobs", "Autres offres LinkedIn"),
    google("greenhouse.io", "Carrières (Greenhouse)"),
    google("jobs.lever.co", "Carrières (Lever)"),
    google("ashbyhq.com", "Carrières (Ashby)"),
    google("workdayjobs.com", "Carrières (Workday)"),
  ];
  const worldwide = /monde|world|international/i.test(locationName);
  if (worldwide || /canada/i.test(locationName)) {
    links.push(google("jobbank.gc.ca", "Offres au Canada (Job Bank)"));
  }
  if (worldwide || /france/i.test(locationName)) {
    links.push(google("hellowork.com", "Offres en France (HelloWork)"));
    links.push(google("francetravail.fr", "Offres en France (France Travail)"));
  }
  if (worldwide || /côte d.?ivoire|cote d.?ivoire|abidjan/i.test(locationName)) {
    links.push(google("emploi.ci", "Offres en Côte d’Ivoire"));
  }
  links.push(generalSearch("Recherche web générale"));
  return links;
}

function buildJobDraft(company, title, description = "") {
  const name = profile?.full_name || "Candidat";
  const skills = (profile?.skills || "").split(",").map((skill) => skill.trim()).filter(Boolean);
  const jobText = normalizeText(`${title} ${description}`);
  const relevantSkills = skills.filter((skill) => containsTerm(jobText, skill)).slice(0, 6);
  const skillList = (relevantSkills.length ? relevantSkills : skills.slice(0, 6)).join(", ");
  const portfolio = profile?.portfolio_url ? `Mon portfolio : ${profile.portfolio_url}` : "";
  const cv = profile?.cv_url ? `Vous pouvez également consulter mon CV : ${profile.cv_url}` : "";
  const skillSentence = relevantSkills.length
    ? `Les compétences de mon profil qui recoupent votre annonce incluent ${skillList}.`
    : `Mon profil comprend notamment ${skillList || "des technologies de développement logiciel"}, ainsi que l’intégration d’API et de solutions d’intelligence artificielle générative.`;
  return `Objet : Candidature au poste de ${title}\n\nMadame, Monsieur,\n\nJe vous adresse ma candidature pour le poste de ${title} au sein de ${company}. Développeur Full Stack, je conçois et réalise des applications adaptées aux besoins métier, de l’analyse jusqu’au déploiement.\n\n${skillSentence} Méthodique et autonome, je veille à proposer des solutions fiables et maintenables. Je serais heureux d’échanger avec vous sur les priorités du poste et sur la manière dont je pourrais y contribuer.\n\n${portfolio}\n${cv}\n\nCordialement,\n${name}`;
}

function buildClientDraft(company, need) {
  const name = profile?.full_name || "Jean-David GODOME";
  const skills = (profile?.skills || "").split(",").map((skill) => skill.trim()).filter(Boolean).slice(0, 6).join(", ");
  return `Bonjour ${company},\n\nJ’ai découvert votre besoin concernant « ${need} » et souhaiterais vous proposer mon aide. Je suis ${name}, développeur Full Stack et concepteur de solutions numériques. Je peux vous accompagner sur l’analyse du besoin, la réalisation et la mise en production d’une solution adaptée.\n\nMes compétences couvrent notamment ${skills || "le développement d’applications web"}, l’intégration d’API et l’automatisation. Je serais ravi d’en apprendre davantage sur vos objectifs et vos contraintes afin de vous proposer une approche pertinente, sans engagement.\n\nVous pouvez découvrir mon travail ici : ${profile?.portfolio_url || "portfolio disponible sur demande"}.\n\nSeriez-vous disponible pour un court échange ?\n\nBien cordialement,\n${name}`;
}

function renderOfferList() {
  const search = document.querySelector("#search").value.toLocaleLowerCase();
  const statusFilter = document.querySelector("#status-filter").value;
  const filtered = offers.filter((offer) => {
    const text = `${offer.company} ${offer.title} ${offer.location || ""} ${offer.source || ""}`.toLocaleLowerCase();
    return text.includes(search) && (!statusFilter || offer.status === statusFilter);
  });
  const sortBy = document.querySelector("#sort-filter").value;
  if (sortBy === "fit") filtered.sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1));
  else if (sortBy === "deadline") filtered.sort((a, b) => (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31"));
  else filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const container = document.querySelector("#offers");
  container.innerHTML = filtered.map((offer) => {
    const facts = [
      offer.location && `Lieu : ${offer.location}`,
      offer.job_type && `Contrat : ${offer.job_type}`,
      offer.salary && `Salaire : ${offer.salary}`,
      offer.source && `Source : ${offer.source}`,
      offer.deadline && `Échéance : ${offer.deadline}`,
      offer.fit_score !== null && `Adéquation indicative : ${offer.fit_score}%`,
      offer.applied_at && `Envoyée le : ${dateTime(offer.applied_at)}`,
    ].filter(Boolean);
    return `<article class="offer-card">
      <div>
        <h3><a href="${esc(offer.url)}" target="_blank" rel="noopener noreferrer">${esc(offer.title)}</a></h3>
        <p class="company">${esc(offer.company)}</p>
        <div class="meta">${facts.map((item) => `<span>${esc(item)}</span>`).join("")}</div>
        ${offer.notes ? `<p class="notes">${esc(offer.notes)}</p>` : ""}
      </div>
      <div class="offer-actions">
        <select aria-label="Statut pour ${esc(offer.title)}" data-status="${esc(offer.id)}">
          ${statuses.map((status) => `<option ${offer.status === status ? "selected" : ""}>${esc(status)}</option>`).join("")}
        </select>
        <button class="button button-outline" data-delete="${esc(offer.id)}" type="button">Supprimer</button>
      </div>
    </article>`;
  }).join("");
  document.querySelector("#empty").classList.toggle("hidden", filtered.length > 0);
  container.classList.toggle("hidden", filtered.length === 0);
}

async function loadOffers() {
  const { data, error } = await supabase.from("offers").select("*").order("created_at", { ascending: false });
  if (error) {
    showError("#offer-message", error.message);
    return;
  }
  offers = data || [];
  const now = new Date();
  const monthCount = offers.filter((offer) => {
    if (!offer.applied_at) return false;
    const applied = new Date(offer.applied_at);
    return applied.getFullYear() === now.getFullYear() && applied.getMonth() === now.getMonth();
  }).length;
  document.querySelector("#hero-month-count").textContent = monthCount;
  document.querySelector("#month-count").textContent = monthCount;
  document.querySelector("#month-progress").value = Math.min(monthCount, 200);
  renderOfferList();
}

async function loadDashboard() {
  if (!currentUser) return;
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", currentUser.id).maybeSingle();
  if (error) {
    root.innerHTML = `<main class="auth-wrap"><section class="auth-card"><h1>Impossible de charger le profil</h1><p>${esc(error.message)}</p><button id="retry" class="button button-primary">Réessayer</button></section></main>`;
    document.querySelector("#retry").addEventListener("click", loadDashboard);
    return;
  }
  profile = data || {};
  root.innerHTML = `
    <header class="topbar"><a class="brand" href="/">Candidatures<span>.</span></a><div class="account-bar"><span>${esc(profile.full_name || currentUser.email)}</span><button id="logout" class="button button-outline" type="button">Déconnexion</button></div></header>
    <main>
      <section class="hero">
        <div><div class="eyebrow">Recherche d’emploi · espace privé</div><h1>Garde le fil de chaque candidature.</h1><p>Bonjour ${esc((profile.full_name || "").split(" ")[0] || "")}. Explore des pistes, prépare tes dossiers et suis tes démarches depuis tes appareils.</p></div>
        <div class="daily-card"><strong id="hero-month-count">0</strong><span>candidatures envoyées ce mois-ci</span><small>Objectif personnel : 200 par mois. La pertinence passe avant le volume.</small></div>
      </section>
      ${renderProfileEditor()}
      ${renderAssistant()}
      <div class="toolbar"><div><h2>Mes offres</h2><p class="muted">L’heure d’envoi est enregistrée quand tu marques la candidature comme envoyée.</p></div><button id="add-toggle" class="button button-primary" type="button">+ Ajouter une offre</button></div>
      ${renderOfferForm()}
      <div class="filters"><input id="search" type="search" placeholder="Rechercher une entreprise ou un poste"><select id="status-filter"><option value="">Tous les statuts</option>${statuses.map((status) => `<option>${esc(status)}</option>`).join("")}</select><select id="sort-filter" aria-label="Trier les offres"><option value="recent">Plus récentes</option><option value="fit">Meilleure adéquation</option><option value="deadline">Échéance la plus proche</option></select><button id="export-offers" class="button button-outline" type="button">Exporter mes offres</button></div>
      <div id="offers" class="offers"></div><div id="empty" class="empty hidden">Aucune offre pour le moment. Ajoute une annonce pour commencer ton suivi.</div>
      <p class="safety-note">Les identifiants des sites d’emploi ne sont pas conservés. Le système prépare et suit tes candidatures, mais tu confirmes toi-même chaque envoi.</p>
    </main>
    <footer>Données privées sur Supabase · accès multi-appareils · mot de passe récupérable par e-mail</footer>`;

  document.querySelector("#logout").addEventListener("click", async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) return showError("#profile-message", signOutError.message);
    currentUser = null;
    renderAuth("login");
  });

  document.querySelector("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = collectProfile(new FormData(event.currentTarget));
    const { error: updateError } = await supabase.from("profiles").upsert({ user_id: currentUser.id, ...values });
    if (updateError) return showError("#profile-message", updateError.message);
    profile = { ...profile, ...values };
    showSuccess("#profile-message", "Profil enregistré.");
    document.querySelector(".account-bar span").textContent = profile.full_name;
  });
  document.querySelector("#add-toggle").addEventListener("click", () => document.querySelector("#offer-form").classList.toggle("hidden"));
  document.querySelector("#cancel-add").addEventListener("click", () => document.querySelector("#offer-form").classList.add("hidden"));
  document.querySelector("#search").addEventListener("input", renderOfferList);
  document.querySelector("#status-filter").addEventListener("change", renderOfferList);
  document.querySelector("#sort-filter").addEventListener("change", renderOfferList);
  document.querySelector("#export-offers").addEventListener("click", exportOffers);
  document.querySelector("#offer-form").addEventListener("submit", addOffer);
  document.querySelector("#offer-form").addEventListener("input", renderFitPreview);
  document.querySelector("#offers").addEventListener("change", updateStatus);
  document.querySelector("#offers").addEventListener("click", deleteOffer);
  document.querySelector("#agent-search-form").addEventListener("submit", prepareSearches);
  document.querySelector("#job-draft-form").addEventListener("submit", prepareJobDraft);
  document.querySelector("#client-draft-form").addEventListener("submit", prepareClientDraft);
  document.querySelector(".assistant-panel").addEventListener("click", copyDraft);
  await loadOffers();
}

function prepareSearches(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const links = searchLinks(String(form.get("agent_role") || "").trim(), String(form.get("agent_location") || "").trim(), String(form.get("mode") || "jobs"));
  document.querySelector("#agent-search-results").innerHTML = links.map(({ label, url }) => `<a class="search-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join("");
}

function prepareJobDraft(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const output = document.querySelector("#job-draft-output");
  output.value = buildJobDraft(String(form.get("draft_company") || "").trim(), String(form.get("draft_title") || "").trim(), String(form.get("draft_description") || ""));
  output.classList.remove("hidden");
  event.currentTarget.querySelector(".copy-draft").classList.remove("hidden");
}

function prepareClientDraft(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const output = document.querySelector("#client-draft-output");
  output.value = buildClientDraft(String(form.get("client_name") || "").trim(), String(form.get("client_need") || "").trim());
  output.classList.remove("hidden");
  event.currentTarget.querySelector(".copy-draft").classList.remove("hidden");
}

function canonicalOfferUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Le lien de l’offre doit commencer par http:// ou https://.");
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

function exportOffers() {
  const exportData = offers.map(({ user_id, ...offer }) => offer);
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `mes-offres-${localDate()}.json`;
  link.click();
  URL.revokeObjectURL(downloadUrl);
}

async function copyDraft(event) {
  const id = event.target.dataset.copy;
  if (!id) return;
  const output = document.getElementById(id);
  try {
    await navigator.clipboard.writeText(output.value);
    showSuccess(event.target, "Brouillon copié.");
  } catch (error) {
    showError(event.target, `Copie impossible : ${error.message}`);
  }
}

async function addOffer(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const offer = Object.fromEntries(formData.entries());
  const fitEstimate = scoreOffer(offer).score;
  offer.fit_score = offer.fit_score ? Number(offer.fit_score) : fitEstimate;
  offer.deadline = offer.deadline || null;
  if (!offer.company || !offer.title || !offer.url) return showError("#offer-message", "Entreprise, poste et lien sont obligatoires.");
  if (!Number.isInteger(offer.fit_score) || offer.fit_score < 0 || offer.fit_score > 100) return showError("#offer-message", "L’adéquation doit être un nombre entier entre 0 et 100.");
  let canonicalUrl;
  try {
    canonicalUrl = canonicalOfferUrl(offer.url);
  } catch (error) {
    return showError("#offer-message", error.message);
  }
  let duplicate;
  try {
    duplicate = offers.some((existing) => canonicalOfferUrl(existing.url) === canonicalUrl);
  } catch {
    return showError("#offer-message", "Une offre enregistrée contient un lien invalide. Corrige ou supprime cette offre avant d’en ajouter une autre.");
  }
  if (duplicate) return showError("#offer-message", "Cette adresse figure déjà dans tes offres.");
  const { error } = await supabase.from("offers").insert(offer);
  if (error) return showError("#offer-message", error.message);
  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  await loadOffers();
}

async function updateStatus(event) {
  const id = event.target.dataset.status;
  if (!id) return;
  const status = event.target.value;
  const current = offers.find((offer) => String(offer.id) === String(id));
  const appliedAt = status === "Envoyée" ? (current?.status === "Envoyée" ? current.applied_at : new Date().toISOString()) : null;
  const { error } = await supabase.from("offers").update({ status, applied_at: appliedAt, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return showError("#offer-message", error.message);
  await loadOffers();
}

async function deleteOffer(event) {
  const id = event.target.dataset.delete;
  if (!id || !confirm("Supprimer cette offre et son suivi ?")) return;
  const { error } = await supabase.from("offers").delete().eq("id", id);
  if (error) return showError("#offer-message", error.message);
  await loadOffers();
}

async function init() {
  if (!supabaseUrl || !supabaseKey) {
    root.innerHTML = `<main class="auth-wrap"><section class="auth-card"><div class="eyebrow">Configuration requise</div><h1>Connexion à Supabase</h1><p class="lead">Crée le projet Supabase, puis définis <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans Vercel. Pour les tests locaux, place-les dans un fichier <code>.env.local</code>.</p><p class="privacy-note">La clé anon publique est conçue pour être utilisée côté navigateur avec les politiques RLS du schéma SQL. Ne mets jamais la clé service_role dans cette application.</p></section></main>`;
    return;
  }
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    renderAuth("login");
    return showError("#form-message", `Impossible de vérifier la session : ${error.message}`);
  }
  if (session?.user) {
    currentUser = session.user;
    if (new URLSearchParams(location.search).has("reset")) {
      renderResetPassword();
      return;
    }
    await loadDashboard();
  } else {
    renderAuth("register");
  }
  supabase.auth.onAuthStateChange((event, sessionNow) => {
    if (event === "PASSWORD_RECOVERY" && sessionNow?.user) renderResetPassword();
    else if (!sessionNow?.user && currentUser) {
      currentUser = null;
      renderAuth("login");
    }
  });
}

function renderResetPassword() {
  root.innerHTML = `<header class="topbar"><a class="brand" href="/">Candidatures<span>.</span></a></header><main class="auth-wrap"><section class="auth-card"><div class="eyebrow">Récupération sécurisée</div><h1>Nouveau mot de passe.</h1><p class="lead">Choisis un mot de passe d’au moins 12 caractères.</p><form id="reset-form">${field("new_password", "Nouveau mot de passe", "", { type: "password", required: true, autocomplete: "new-password" })}${field("confirm_password", "Confirmer le mot de passe", "", { type: "password", required: true, autocomplete: "new-password" })}<p id="reset-message" class="message" role="status"></p><button class="button button-primary submit-button">Enregistrer</button></form></section></main>`;
  document.querySelector("#reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("new_password") || "");
    if (password.length < 12) return showError("#reset-message", "Le mot de passe doit contenir au moins 12 caractères.");
    if (password !== data.get("confirm_password")) return showError("#reset-message", "Les deux mots de passe ne correspondent pas.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return showError("#reset-message", error.message);
    showSuccess("#reset-message", "Mot de passe modifié.");
    history.replaceState(null, "", "/");
    await loadDashboard();
  });
}

init().catch((error) => {
  console.error(error);
  root.innerHTML = `<main class="auth-wrap"><section class="auth-card"><h1>Une erreur est survenue</h1><p>${esc(error.message)}</p></section></main>`;
});
