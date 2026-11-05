const STATUS_VALUES = ["À examiner", "À préparer", "Prête à envoyer", "Envoyée", "Entretien", "Refusée", "Relance"];
const $ = (selector) => document.querySelector(selector);
let currentState;

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
    aiDraftButton.textContent = "Rédiger avec l'IA locale";
    aiDraftButton.disabled = !currentState.ai.available;
    aiDraftButton.title = currentState.ai.available ? "Le texte reste sur cet ordinateur." : currentState.ai.message;
    aiDraftButton.addEventListener("click", async () => {
      try {
        await api(`/api/offers/${offer.id}/ai-draft`, { model: $("#ai-model").value });
        message("Brouillon IA locale créé. Relis-le et vérifie chaque affirmation.");
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
    addText(bubble, "strong", "", message.role === "assistant" ? "Assistant local" : "Toi");
    addText(bubble, "p", "", message.content);
    container.append(bubble);
  }
}

function render(state) {
  currentState = state;
  renderProfile(state.profile);
  renderBatches(state.batches);
  renderOffers(state.offers);
  renderAudit(state.audit);
  renderConversation(state.conversation);
  $("#schedule-enabled").checked = state.schedule.enabled;
  $("#schedule-status").textContent = state.schedule.enabled
    ? "Actif : prépare 5 recherches d'emploi à chaque créneau et 5 recherches de missions à 10 h."
    : "En pause. Aucun travail planifié ne sera créé.";
  $("#clock").textContent = `${state.clock.hour}:${state.clock.minute} · Abidjan`;
  $("#data-directory").textContent = state.dataDirectory;
  $("#ai-message").textContent = state.ai.message;
  const modelSelect = $("#ai-model");
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
  sendButton.textContent = "Réflexion locale…";
  try {
    await api("/api/chat", { message: content, model: $("#ai-model").value });
    formElement.reset();
    message("Réponse locale reçue. Vérifie les conseils et les faits.");
    await refresh();
  } catch (error) {
    message(error.message, true);
  } finally {
    sendButton.textContent = "Envoyer à l'IA locale";
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

$("#refresh").addEventListener("click", () => refresh().catch((error) => message(error.message, true)));
$("#clear-data").addEventListener("click", async () => {
  const answer = prompt("Pour effacer le profil local, les offres, l'historique et le journal, saisis exactement : SUPPRIMER MES DONNÉES LOCALES");
  if (answer !== "SUPPRIMER MES DONNÉES LOCALES") return;
  try {
    await api("/api/data/clear", { confirm: answer });
    message("Données locales effacées.");
    await refresh();
  } catch (error) {
    message(error.message, true);
  }
});

refresh().catch((error) => message(`Impossible de charger le compagnon : ${error.message}`, true));
setInterval(() => refresh().catch((error) => message(error.message, true)), 60_000);
