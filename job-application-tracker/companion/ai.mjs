const OLLAMA_URL = "http://127.0.0.1:11434";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export async function getAiStatus({
  apiKey = process.env.OPENAI_API_KEY || "",
  openAiModel = process.env.EMPLOIIA_OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
  fetchImpl = fetch,
} = {}) {
  let local = { available: false, models: [], message: "Ollama n'est pas démarré ou a retourné une réponse invalide." };
  try {
    const response = await fetchImpl(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) {
      local.message = `Ollama répond avec HTTP ${response.status}.`;
    } else {
      const data = await response.json();
      const models = Array.isArray(data.models) ? data.models.map((model) => model.name).filter(Boolean) : [];
      local = {
        available: models.length > 0,
        models,
        message: models.length ? "Modèle local prêt." : "Ollama fonctionne, mais aucun modèle n'est installé.",
      };
    }
  } catch (error) {
    local.message = error.name === "TimeoutError" ? "Ollama ne répond pas sur cet ordinateur." : local.message;
  }

  const cloudAvailable = Boolean(apiKey);
  const message = local.available
    ? `Ollama local prioritaire${cloudAvailable ? ` · OpenAI (${openAiModel}) en secours` : ""}.`
    : cloudAvailable
      ? `${local.message} Basculement OpenAI (${openAiModel}) activé; les prompts seront transmis à OpenAI en cas de recours au cloud.`
      : `${local.message} Configure OPENAI_API_KEY pour activer le secours cloud.`;
  return {
    available: local.available || cloudAvailable,
    models: local.models,
    provider: local.available ? "Ollama local prioritaire" : cloudAvailable ? "OpenAI en secours" : "",
    cloudAvailable,
    cloudModel: cloudAvailable ? openAiModel : "",
    message,
  };
}

async function callOpenAi({ apiKey, model, messages, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model, input: messages, store: false }),
    });
  } catch (error) {
    const message = error.name === "TimeoutError" ? "La génération OpenAI a dépassé 90 secondes." : "La connexion à l'API OpenAI a échoué.";
    throw Object.assign(new Error(message), { status: 503 });
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw Object.assign(new Error("OpenAI a retourné une réponse invalide."), { status: 502 });
  }
  if (!response.ok) {
    const details = String(result.error?.message || `HTTP ${response.status}`).slice(0, 300);
    throw Object.assign(new Error(`OpenAI : ${details}`), { status: response.status === 401 ? 401 : 502 });
  }
  const content = String(result.output_text || result.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("") || "").trim();
  if (!content) throw Object.assign(new Error("OpenAI a retourné une réponse vide."), { status: 502 });
  return content.slice(0, 20_000);
}

export async function completeWithFallback(messages, {
  model = "",
  apiKey = process.env.OPENAI_API_KEY || "",
  openAiModel = process.env.EMPLOIIA_OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
  fetchImpl = fetch,
  localStatus,
} = {}) {
  const status = localStatus || await getAiStatus({ apiKey, openAiModel, fetchImpl });
  let localError;
  if (status.models.includes(model)) {
    try {
      const response = await fetchImpl(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({ model, stream: false, options: { temperature: 0.3 }, messages }),
      });
      if (!response.ok) throw new Error(`Ollama a refusé la génération (HTTP ${response.status}).`);
      const result = await response.json();
      const content = String(result.message?.content || "").trim();
      if (!content) throw new Error("Ollama a retourné une réponse vide.");
      return { content: content.slice(0, 20_000), provider: "Ollama local" };
    } catch (error) {
      localError = error;
    }
  } else if (model) {
    localError = Object.assign(new Error("Le modèle choisi n'est pas disponible dans Ollama."), { status: 400 });
  }

  if (apiKey) {
    try {
      return { content: await callOpenAi({ apiKey, model: openAiModel, messages, fetchImpl }), provider: `OpenAI (${openAiModel})` };
    } catch (error) {
      if (localError) throw Object.assign(new Error(`${localError.message} Le secours OpenAI a également échoué : ${error.message}`), { status: error.status || 502 });
      throw error;
    }
  }
  if (localError) {
    const message = localError.name === "TimeoutError" ? "La génération locale a dépassé 90 secondes." : localError.message;
    throw Object.assign(new Error(message), { status: localError.status || 503 });
  }
  throw Object.assign(new Error("Aucun modèle IA disponible. Démarre Ollama ou configure OPENAI_API_KEY."), { status: 503 });
}
