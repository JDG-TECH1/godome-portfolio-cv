import assert from "node:assert/strict";
import { test } from "node:test";
import { completeWithFallback, getAiStatus } from "./ai.mjs";

test("uses OpenAI when Ollama has no model and disables response storage", async () => {
  let request;
  const result = await completeWithFallback([{ role: "user", content: "Bonjour" }], {
    apiKey: "test-key-not-a-real-credential",
    openAiModel: "gpt-4.1-mini",
    localStatus: { available: false, models: [] },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return Response.json({ output_text: "Réponse test" });
    },
  });

  assert.equal(result.content, "Réponse test");
  assert.equal(result.provider, "OpenAI (gpt-4.1-mini)");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.options.headers.authorization, "Bearer test-key-not-a-real-credential");
  assert.deepEqual(JSON.parse(request.options.body), {
    model: "gpt-4.1-mini",
    input: [{ role: "user", content: "Bonjour" }],
    store: false,
  });
});

test("prefers Ollama and falls back to OpenAI when local generation fails", async () => {
  const requests = [];
  const result = await completeWithFallback([{ role: "user", content: "Bonjour" }], {
    model: "local-model",
    apiKey: "test-key-not-a-real-credential",
    localStatus: { available: true, models: ["local-model"] },
    fetchImpl: async (url) => {
      requests.push(url);
      if (url.endsWith("/api/chat")) return Response.json({ error: "local failure" }, { status: 500 });
      return Response.json({ output_text: "Secours disponible" });
    },
  });

  assert.equal(result.content, "Secours disponible");
  assert.equal(result.provider, "OpenAI (gpt-4.1-mini)");
  assert.equal(requests.length, 2);
  assert.equal(requests[0], "http://127.0.0.1:11434/api/chat");
  assert.equal(requests[1], "https://api.openai.com/v1/responses");
});

test("reports cloud fallback without exposing its API key", async () => {
  const status = await getAiStatus({
    apiKey: "test-key-not-a-real-credential",
    fetchImpl: async () => { throw new Error("Ollama not running"); },
  });

  assert.equal(status.available, true);
  assert.equal(status.provider, "OpenAI en secours");
  assert.equal(status.cloudAvailable, true);
  assert.match(status.message, /transmis à OpenAI/);
  assert.equal(status.message.includes("test-key-not-a-real-credential"), false);
});
