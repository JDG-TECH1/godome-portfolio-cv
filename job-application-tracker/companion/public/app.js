const STATUS_VALUES = ["À examiner", "À préparer", "Prête à envoyer", "Envoyée", "Entretien", "Refusée", "Relance"];
const $ = (selector) => document.querySelector(selector);
let currentState;
let pendingGmailSendId = "";

function message(text, isError = false) {
  const target = $("#global-message");
  target.textContent = text;
  target.classList.toggle("error", isError);
  target.classList.toggle("success", !isError && Boolean(text));
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Erreur HTTP ${response.status}`);
  return result;
}

function addText(parent, tag, className, value) {
  const child = document.createElement(tag);
  if (className) child.className = className;
  child.textContent = value;
  parent.append(child);
  return child;
}

function renderProfile(profile) {
  const form = $("#profile-form");
  form.elements.fullName.value = profile.fullName;
  form.elements.roles.value = profile.roles.join(", ");
  form.elements.skills.value = profile.skills.join(", ");
  form.elements.locations.value = profile.locations.join(", ");
  form.elements.portfolioUrl.value = profile.portfolioUrl;
  form.elements.cvUrl.value = profile.cvUrl;
}

function renderBatches(batches) {
  const container = $("#batches");
  container.replaceChildren();
  $("#empty-batches").classList.toggle("hidden", batches.length > 0);
  for (const batch of batches) {
    const section = document.createElement("article");
    section.className = "batch-card";
    addText(section, "h3", "", `${batch.slot} · ${new Date(batch.createdAt).toLocaleString("fr-FR")}`);
    addText(section, "p", "muted", batch.note);
    const list = document.createElement("div");
    list.className = "task-list";
    for (const task of batch.tasks) {
      const item = document.createElement("div");
      item.className = "task";
      addText(item, "span", "task-kind", task.kind === "job-search" ? "Emploi" : "Missions");
      addText(item, "strong", "", task.source);
      addText(item, "span", "muted", `${task.role} · ${task.location}`);
      const link = document.createElement("a");
      link.className = "button button-outline";
      link.href = task.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Ouvrir cette recherche";
      item.append(link);
      list.append(item);
    }
    section.append(list);
    container.append(section);
  }
}

function renderOffers(offers) {
  const container = $("#offers");
  container.replaceChildren();
  for (const offer of offers) {
    const card = document.createElement("article");
    card.className = "offer-card";
    const heading = document.createElement("h3");
    const link = document.createElement("a");
    link.href = offer.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${offer.title} · ${offer.company}`;
    heading.append(link);
    card.append(heading);
    addText(card, "p", "muted", `${offer.location || "Lieu à vérifier"} · Estimation indicative : ${offer.fit.score}/100`);
    if (offer.draft) {
      addText(card, "p", "muted", `Brouillon préparé par : ${offer.draftProvider || "assistant local à règles"}`);
      const draft = document.createElement("textarea");
      draft.className = "draft";
      draft.readOnly = true;
      draft.rows = 10;
      draft.value = offer.draft;
      card.append(draft);
      const copy = document.createElement("button");
      copy.className = "button button-outline";
      copy.type = "button";
      copy.textContent = "Copier le brouillon";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(draft.value);
          message("Brouillon copié. Relis-le avant tout envoi.");
        } catch (error) {
          message(`Copie impossible : ${error.message}`, true);
        }
      });
      card.append(copy);
    }
    const actions = document.createElement("div");
    actions.className = "offer-actions";
    const status = document.createElement("select");
    status.setAttribute("aria-label", `Statut pour ${offer.title}`);
    for (const value of STATUS_VALUES) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = offer.status === value;
      status.append(option);
    }
    status.addEventListener("change", async () => {
      try {
        await api(`/api/offers/${offer.id}/status`, { status: status.value });
        message("Statut mis à jour localement.");
        await refresh();
      } catch (error) {
        message(error.message, true);
      }
    });
    const draftButton = document.createElement("button");
    draftButton.className = "button button-primary";
    draftButton.type = "button";
    draftButton.textContent = offer.draft ? "Actualiser le brouillon" : "Préparer un brouillon";
    draftButton.addEventListener("click", async () => {
      try {
        await api(`/api/offers/${offer.id}/draft`, {});
        message("Brouillon préparé localement. Vérifie chaque affirmation avant utilisation.");
        await refresh();
      } catch (error) {
        message(error.message, true);
      }
    });
    const aiDraftButton = document.createElement("button");
    aiDraftButton.className = "button button-outline";
    aiDraftButton.type = "button";
    aiDraftButton.textContent = "Rédiger avec l'IA";
    aiDraftButton.disabled = !currentState.ai.available;
    aiDraftButton.title = currentState.ai.available ? "Le texte reste sur cet ordinateur." : currentState.ai.message;
    aiDraftButton.addEventListener("click", async () => {
      try {
        await api(`/api/offers/${offer.id}/ai-draft`, { model: $("#ai-model").value });
        message("Brouillon IA créé. Relis-le et vérifie chaque affirmation.");
        await refresh();
      } catch (error) {
        message(error.message, true);
      }
    });
    actions.append(status, draftButton, aiDraftButton);
    card.append(actions);
    container.append(card);
  }
}

function renderAudit(entries) {
  const list = $("#audit");
  list.replaceChildren();
  for (const entry of entries) {
    const item = document.createElement("li");
    addText(item, "time", "", new Date(entry.at).toLocaleString("fr-FR"));
    addText(item, "strong", "", entry.action);
    if (entry.details) addText(item, "span", "muted", entry.details);
    list.append(item);
  }
}

function renderConversation(messages) {
  const container = $("#conversation");
  container.replaceChildren();
  for (const message of messages) {
    const bubble = document.createElement("article");
    bubble.className = `chat-message ${message.role === "assistant" ? "assistant" : "user"}`;
    addText(bubble, "strong", "", message.role === "assistant" ? `Assistant · ${message.provider || "IA"}` : "Toi");
    addText(bubble, "p", "", message.content);
    container.append(bubble);
  }
}

function emailAddressFromHeader(value) {
  const bracketed = String(value).match(/<([^<>]+)>/);
  const address = (bracketed ? bracketed[1] : value).trim();
  return /^[^@\s,<>]+@[^@\s,<>]+\.[^@\s,<>]+$/.test(address) ? address : "";
}

function renderGmail(gmail) {
  $("#gmail-status").textContent = gmail.connected ? `Connecté : ${gmail.email || "compte Google"}` : gmail.configured ? "OAuth prêt · non connecté" : "Non connecté";
  $("#gmail-permission-title").textContent = gmail.connected ? "Gmail connecté" : "Gmail";
  $("#gmail-permission-detail").textContent = gmail.connected
    ? `Lecture ${gmail.monitorEnabled ? "surveillée" : "manuelle"} · envoi uniquement après confirmation explicite.`
    : "Non connecté · aucun e-mail n'est lu ni envoyé.";
  $("#gmail-config-form").classList.toggle("hidden", gmail.configured);
  $("#gmail-configured").classList.toggle("hidden", !gmail.configured);
  $("#gmail-connect").disabled = !gmail.configured || gmail.connected;
  $("#gmail-disconnect").disabled = !gmail.connected;
  $("#gmail-monitor").checked = gmail.monitorEnabled;
  $("#gmail-monitor").disabled = !gmail.connected;
  $("#gmail-scan").disabled = !gmail.connected;
  $("#gmail-monitor-status").textContent = gmail.monitorError
    ? `Erreur de surveillance : ${gmail.monitorError}`
    : gmail.monitorEnabled
      ? `Surveillance active. Dernière vérification : ${gmail.lastScanAt ? new Date(gmail.lastScanAt).toLocaleString("fr-FR") : "en attente"}.`
      : `Surveillance arrêtée.${gmail.lastScanAt ? ` Dernière vérification : ${new Date(gmail.lastScanAt).toLocaleString("fr-FR")}.` : ""}`;
  const messages = $("#gmail-messages");
  messages.replaceChildren();
  if (!gmail.messages.length) addText(messages, "p", "empty", gmail.connected ? "Aucun message lié à la recherche d'emploi dans les résultats récents." : "Connecte Gmail pour consulter des messages récents liés à l'emploi.");
  for (const mail of gmail.messages) {
    const card = document.createElement("article");
    card.className = "email-card";
    addText(card, "strong", "", mail.subject || "(sans objet)");
    addText(card, "p", "muted", `De : ${mail.from || "expéditeur indisponible"}`);
    addText(card, "time", "", mail.date || "");
    addText(card, "p", "snippet", mail.snippet || "");
    const reply = document.createElement("button");
    reply.className = "button button-outline";
    reply.type = "button";
    reply.textContent = "Préparer une réponse";
    reply.disabled = !emailAddressFromHeader(mail.from);
    reply.addEventListener("click", () => {
      $("#gmail-compose-form").elements.to.value = emailAddressFromHeader(mail.from);
      $("#gmail-compose-form").elements.subject.value = mail.subject.toLocaleLowerCase().startsWith("re:") ? mail.subject : `Re: ${mail.subject}`;
      $("#gmail-compose-form").elements.body.focus();
      $("#gmail-compose-form").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    card.append(reply);
    messages.append(card);
  }
  for (const control of $("#gmail-compose-form").elements) control.disabled = !gmail.connected;
  $("#gmail-prepare-send").disabled = !gmail.connected;
}

function render(state) {
  currentState = state;
  renderProfile(state.profile);
  renderBatches(state.batches);
  renderOffers(state.offers);
  renderAudit(state.audit);
  renderConversation(state.conversation);
  renderGmail(state.gmail);
  $("#schedule-enabled").checked = state.schedule.enabled;
  $("#schedule-status").textContent = state.schedule.enabled
    ? "Actif : prépare 5 recherches d'emploi à chaque créneau et 5 recherches de missions à 10 h."
    : "En pause. Aucun travail planifié ne sera créé.";
  $("#clock").textContent = `${state.clock.hour}:${state.clock.minute} · Abidjan`;
  $("#data-directory").textContent = state.dataDirectory;
  $("#ai-message").textContent = state.ai.message;
  const modelSelect = $("#ai-model");
  $("#ai-model-control").classList.toggle("hidden", state.ai.models.length === 0);
  const selectedModel = modelSelect.value;
  modelSelect.replaceChildren();
  for (const model of state.ai.models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.append(option);
  }
  if (state.ai.models.includes(selectedModel)) modelSelect.value = selectedModel;
  $("#send-chat").disabled = !state.ai.available;
  $("#send-chat").title = state.ai.available ? "" : state.ai.message;
}

async function refresh() {
  render(await api("/api/state"));
}

$("#schedule-enabled").addEventListener("change", async (event) => {
  try {
    const result = await api("/api/schedule", { enabled: event.target.checked });
    message(result.enabled ? "Planification activée. Elle ne prépare que des liens." : "Planification mise en pause.");
    await refresh();
  } catch (error) {
    event.target.checked = !event.target.checked;
    message(error.message, true);
  }
});

$("#run-now").addEventListener("click", async () => {
  try {
    await api("/api/run", {});
    message("Recherches préparées. Ouvre seulement les liens que tu souhaites examiner.");
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/profile", Object.fromEntries(form.entries()));
    message("Profil local enregistré.");
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#offer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await api("/api/offers", Object.fromEntries(form.entries()));
    formElement.reset();
    message("Offre ajoutée au suivi local.");
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const content = String(new FormData(formElement).get("message") || "").trim();
  const sendButton = $("#send-chat");
  sendButton.disabled = true;
  sendButton.textContent = "Réflexion…";
  try {
    const result = await api("/api/chat", { message: content, model: $("#ai-model").value });
    formElement.reset();
    message(`Réponse reçue via ${result.provider}. Vérifie les conseils et les faits.`);
    await refresh();
  } catch (error) {
    message(error.message, true);
  } finally {
    sendButton.textContent = "Envoyer à l'IA";
    sendButton.disabled = !currentState.ai.available;
  }
});

$("#clear-chat").addEventListener("click", async () => {
  if (!confirm("Effacer la mémoire de conversation stockée sur cet ordinateur ?")) return;
  try {
    await api("/api/chat/clear", {});
    message("Mémoire de conversation effacée.");
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#gmail-config-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  try {
    await api("/api/gmail/configure", Object.fromEntries(new FormData(formElement).entries()));
    formElement.reset();
    message("Configuration OAuth enregistrée et chiffrée dans ton compte Windows.");
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#gmail-change-config").addEventListener("click", () => {
  if (!confirm("Remplacer la configuration déconnectera Gmail et effacera l'historique de messages local. Continuer ?")) return;
  $("#gmail-config-form").classList.remove("hidden");
  $("#gmail-configured").classList.add("hidden");
});

$("#gmail-connect").addEventListener("click", async () => {
  try {
    const { authorizationUrl } = await api("/api/gmail/connect", {});
    location.assign(authorizationUrl);
  } catch (error) {
    message(error.message, true);
  }
});

$("#gmail-disconnect").addEventListener("click", async () => {
  if (!confirm("Déconnecter Gmail, arrêter la surveillance et demander à Google de révoquer cet accès ?")) return;
  try {
    const result = await api("/api/gmail/disconnect", {});
    message(result.revoked ? "Gmail déconnecté et accès révoqué." : `Jetons locaux effacés. Révocation Google à vérifier : ${result.message || "ouvre la sécurité de ton compte Google."}`);
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#gmail-monitor").addEventListener("change", async (event) => {
  const checkbox = event.currentTarget;
  try {
    const result = await api("/api/gmail/monitor", { enabled: checkbox.checked });
    message(result.scanError
      ? `Surveillance activée, mais la première vérification a échoué : ${result.scanError}`
      : checkbox.checked ? "Surveillance Gmail activée (mots-clés d'emploi uniquement)." : "Surveillance Gmail désactivée.");
    await refresh();
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    message(error.message, true);
  }
});

$("#gmail-scan").addEventListener("click", async () => {
  try {
    const result = await api("/api/gmail/scan", {});
    message(`Vérification terminée : ${result.newCount} nouveau(x) message(s) lié(s) à l'emploi.`);
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#gmail-compose-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const { pending } = await api("/api/gmail/send/prepare", form);
    pendingGmailSendId = pending.id;
    $("#gmail-send-to").textContent = `À : ${pending.to}`;
    $("#gmail-send-subject").textContent = `Objet : ${pending.subject}`;
    $("#gmail-send-body").textContent = pending.body;
    $("#gmail-send-preview").classList.remove("hidden");
    $("#gmail-send-preview").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    message(error.message, true);
  }
});

$("#gmail-confirm-send").addEventListener("click", async () => {
  if (!pendingGmailSendId) return message("Aucun e-mail en attente de confirmation.", true);
  const to = $("#gmail-send-to").textContent;
  const subject = $("#gmail-send-subject").textContent;
  if (!confirm(`Dernière confirmation avant envoi depuis ton Gmail :\n${to}\n${subject}\n\nConfirmer cet e-mail unique ?`)) return;
  try {
    const result = await api("/api/gmail/send/confirm", { id: pendingGmailSendId, confirmed: true });
    pendingGmailSendId = "";
    $("#gmail-send-preview").classList.add("hidden");
    $("#gmail-compose-form").reset();
    message(`E-mail envoyé à ${result.to}.`);
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

$("#gmail-cancel-send").addEventListener("click", () => {
  pendingGmailSendId = "";
  $("#gmail-send-preview").classList.add("hidden");
  message("Envoi annulé.");
});

$("#refresh").addEventListener("click", () => refresh().catch((error) => message(error.message, true)));
$("#clear-data").addEventListener("click", async () => {
  const answer = prompt("Pour effacer le profil local, les offres, l'historique et le journal, saisis exactement : SUPPRIMER MES DONNÉES LOCALES");
  if (answer !== "SUPPRIMER MES DONNÉES LOCALES") return;
  try {
    const result = await api("/api/data/clear", { confirm: answer });
    message(result.gmailRevoked
      ? "Données locales effacées et accès Gmail révoqué."
      : `Données locales effacées. Vérifie la révocation Gmail dans Google : ${result.gmailRevocationMessage}`);
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

refresh().catch((error) => message(`Impossible de charger le compagnon : ${error.message}`, true));
setInterval(() => refresh().catch((error) => message(error.message, true)), 60_000);
const gmailCallback = new URLSearchParams(location.search);
if (gmailCallback.has("gmail")) {
  message("Gmail connecté par OAuth.");
  history.replaceState(null, "", location.pathname);
} else if (gmailCallback.has("gmail_error")) {
  message(`Connexion Google non terminée : ${gmailCallback.get("gmail_error")}`, true);
  history.replaceState(null, "", location.pathname);
}
