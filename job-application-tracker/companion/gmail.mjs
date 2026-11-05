import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";

const HOST = "127.0.0.1";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
const MAX_SAVED_MESSAGES = 50;
const MAX_PROTECTED_BYTES = 2_000_000;

function randomUrlSafe(size = 32) {
  return randomBytes(size).toString("base64url");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function dpapiTransform(input, decrypt = false) {
  if (process.platform !== "win32") throw new Error("Le coffre Gmail nécessite Windows DPAPI.");
  const script = decrypt
    ? "$encoded=[Console]::In.ReadToEnd().Trim();$cipher=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded));$secure=ConvertTo-SecureString $cipher;$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr);[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plain)))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}"
    : "$encoded=[Console]::In.ReadToEnd().Trim();$plain=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded));$secure=ConvertTo-SecureString $plain -AsPlainText -Force;[Console]::Out.Write((ConvertFrom-SecureString $secure))";
  const { stdout } = await new Promise((resolve, reject) => {
    const processHandle = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    const errors = [];
    let outputBytes = 0;
    processHandle.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PROTECTED_BYTES) processHandle.kill();
      else output.push(chunk);
    });
    processHandle.stderr.on("data", (chunk) => errors.push(chunk));
    processHandle.on("error", reject);
    processHandle.on("close", (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(errors).toString("utf8").trim() || "Windows DPAPI n'a pas pu protéger les données."));
      resolve({ stdout: Buffer.concat(output).toString("utf8").trim() });
    });
    processHandle.stdin.end(Buffer.from(input, "utf8").toString("base64"));
  });
  return decrypt ? JSON.parse(Buffer.from(stdout, "base64").toString("utf8")) : stdout;
}

async function fetchJson(url, options = {}, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000), ...options });
  } catch (error) {
    throw new Error(error.name === "TimeoutError" ? "La requête Gmail a dépassé 15 secondes." : "Connexion au service Gmail impossible.");
  }
  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Gmail/OAuth a retourné une réponse invalide.");
    }
  }
  if (!response.ok) {
    const details = String(data.error?.message || data.error_description || `HTTP ${response.status}`).slice(0, 300);
    throw new Error(`Gmail/OAuth : ${details}`);
  }
  return data;
}

function emailHeader(message, name) {
  return message.payload?.headers?.find((header) => header.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.value || "";
}

function validateEmailMessage(input) {
  const to = String(input.to || "").trim();
  const subject = String(input.subject || "").trim();
  const body = String(input.body || "").trim();
  if (to.length > 254 || !/^[^@\s,<>]+@[^@\s,<>]+\.[^@\s,<>]+$/.test(to)) throw new Error("Saisis une seule adresse e-mail valide.");
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw new Error("L'objet doit contenir au plus 200 caractères et ne pas inclure de retour à la ligne.");
  if (!body || body.length > 10_000) throw new Error("Le message doit contenir entre 1 et 10 000 caractères.");
  return { to, subject, body };
}

export class GmailService {
  #filePath;
  #appUrl;
  #fetch;
  #data = null;
  #oauth = null;
  #pendingSend = null;
  #lastSendAt = 0;

  constructor({ filePath, appUrl, fetchImpl = fetch }) {
    this.#filePath = filePath;
    this.#appUrl = appUrl;
    this.#fetch = fetchImpl;
  }

  async load() {
    try {
      this.#data = await dpapiTransform(await readFile(this.#filePath, "utf8"), true);
    } catch (error) {
      if (error.code === "ENOENT") {
        this.#data = { clientId: "", clientSecret: "", tokens: null, email: "", monitorEnabled: false, messages: [], lastScanAt: "" };
        return;
      }
      throw new Error(`Impossible d'ouvrir le coffre Gmail de ce compte Windows : ${error.message}`);
    }
    this.#data.messages = Array.isArray(this.#data.messages) ? this.#data.messages.slice(0, MAX_SAVED_MESSAGES) : [];
  }

  async #save() {
    const encrypted = await dpapiTransform(JSON.stringify(this.#data));
    await writeFile(this.#filePath, `${encrypted}\n`, { encoding: "utf8", mode: 0o600 });
  }

  status() {
    return {
      configured: Boolean(this.#data?.clientId && this.#data?.clientSecret),
      connected: Boolean(this.#data?.tokens?.refresh_token),
      email: this.#data?.email || "",
      monitorEnabled: Boolean(this.#data?.monitorEnabled),
      lastScanAt: this.#data?.lastScanAt || "",
      messages: (this.#data?.messages || []).slice(0, 20),
      scopes: this.#data?.tokens?.scope?.split(" ") || [],
    };
  }

  async configure(input) {
    const clientId = String(input.clientId || "").trim();
    const clientSecret = String(input.clientSecret || "").trim();
    if (!clientId.endsWith(".apps.googleusercontent.com") || clientId.length > 300) throw new Error("L'identifiant doit être celui d'un client OAuth Google Desktop valide.");
    if (clientSecret.length < 8 || clientSecret.length > 300) throw new Error("Le secret OAuth semble invalide.");
    if (this.#data?.tokens?.refresh_token) {
      const result = await this.disconnect();
      if (!result.revoked) throw new Error(`L'ancien accès Google n'a pas pu être révoqué. Jetons locaux effacés; vérifie ton compte Google. ${result.message || ""}`.trim());
    }
    this.#data = { ...this.#data, clientId, clientSecret, tokens: null, email: "", monitorEnabled: false, messages: [], lastScanAt: "" };
    await this.#save();
    return this.status();
  }

  async startAuthorization() {
    if (!this.#data?.clientId || !this.#data?.clientSecret) throw new Error("Configure d'abord l'identifiant et le secret du client OAuth Desktop.");
    if (this.#oauth) throw new Error("Une autorisation Google est déjà en cours.");
    const state = randomUrlSafe();
    const verifier = randomUrlSafe(48);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const listener = createServer();
    const callback = await new Promise((resolve, reject) => {
      listener.once("error", reject);
      listener.listen(0, HOST, () => {
        listener.removeListener("error", reject);
        resolve(listener.address());
      });
    });
    const redirectUri = `http://${HOST}:${callback.port}`;
    const cleanup = () => {
      clearTimeout(timeout);
      listener.close();
      this.#oauth = null;
    };
    const timeout = setTimeout(() => cleanup(), 5 * 60_000);
    timeout.unref();
    this.#oauth = { listener, state, verifier, clientId: this.#data.clientId, clientSecret: this.#data.clientSecret };
    listener.on("request", async (request, response) => {
      if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::ffff:127.0.0.1") {
        response.writeHead(403).end("Accès local uniquement.");
        return;
      }
      const requestUrl = new URL(request.url, redirectUri);
      if (requestUrl.pathname !== "/" || request.method !== "GET") {
        response.writeHead(404).end("Route inconnue.");
        return;
      }
      if (requestUrl.searchParams.get("state") !== state) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("État OAuth invalide. Recommence la connexion.");
        cleanup();
        return;
      }
      const oauthError = requestUrl.searchParams.get("error");
      if (oauthError) {
        response.writeHead(303, { location: `${this.#appUrl}/?gmail_error=${encodeURIComponent(oauthError)}` }).end();
        cleanup();
        return;
      }
      try {
        const code = requestUrl.searchParams.get("code");
        if (!code) throw new Error("Google n'a pas retourné de code d'autorisation.");
        const tokens = await fetchJson("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: this.#oauth.clientId,
            client_secret: this.#oauth.clientSecret,
            code,
            code_verifier: this.#oauth.verifier,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        }, this.#fetch);
        if (!tokens.refresh_token) throw new Error("Google n'a pas fourni de jeton de renouvellement. Retire l'accès existant dans Google puis reconnecte le compte.");
        this.#data.tokens = { ...tokens, expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000 };
        const profile = await this.#gmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/profile");
        this.#data.email = String(profile.emailAddress || "");
        this.#data.monitorEnabled = false;
        await this.#save();
        response.writeHead(303, { location: `${this.#appUrl}/?gmail=connected` }).end();
      } catch (error) {
        response.writeHead(303, { location: `${this.#appUrl}/?gmail_error=${encodeURIComponent(error.message.slice(0, 240))}` }).end();
      } finally {
        cleanup();
      }
    });
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: this.#data.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return authorizationUrl.toString();
  }

  async disconnect() {
    const token = this.#data?.tokens?.refresh_token;
    this.#data.tokens = null;
    this.#data.email = "";
    this.#data.monitorEnabled = false;
    this.#data.messages = [];
    this.#data.lastScanAt = "";
    this.#pendingSend = null;
    await this.#save();
    if (!token) return { revoked: false };
    try {
      await fetchJson("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      }, this.#fetch);
      return { revoked: true };
    } catch (error) {
      return { revoked: false, message: error.message };
    }
  }

  async clear() {
    const wasConnected = Boolean(this.#data?.tokens?.refresh_token);
    const result = await this.disconnect();
    this.#data = { clientId: "", clientSecret: "", tokens: null, email: "", monitorEnabled: false, messages: [], lastScanAt: "" };
    await this.#save();
    return wasConnected ? result : { revoked: true };
  }

  async #accessToken() {
    if (!this.#data?.tokens?.refresh_token) throw new Error("Connecte d'abord Gmail avec OAuth.");
    if (this.#data.tokens.access_token && Number(this.#data.tokens.expires_at) > Date.now() + 60_000) return this.#data.tokens.access_token;
    const refreshed = await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.#data.clientId,
        client_secret: this.#data.clientSecret,
        refresh_token: this.#data.tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    }, this.#fetch);
    this.#data.tokens = {
      ...this.#data.tokens,
      ...refreshed,
      refresh_token: this.#data.tokens.refresh_token,
      expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
    };
    await this.#save();
    return this.#data.tokens.access_token;
  }

  async #gmailRequest(url, options = {}) {
    const accessToken = await this.#accessToken();
    return fetchJson(url, {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${accessToken}` },
    }, this.#fetch);
  }

  async scanRecentMessages() {
    const query = "in:inbox newer_than:30d {candidature application interview entretien freelance projet client job}";
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.search = new URLSearchParams({ q: query, maxResults: "20" }).toString();
    const list = await this.#gmailRequest(listUrl);
    const details = await Promise.all((list.messages || []).slice(0, 10).map(async ({ id }) => {
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
      const params = new URLSearchParams({ format: "metadata" });
      for (const header of ["From", "Subject", "Date"]) params.append("metadataHeaders", header);
      url.search = params.toString();
      const message = await this.#gmailRequest(url);
      return {
        id: message.id,
        threadId: message.threadId,
        from: emailHeader(message, "From").slice(0, 300),
        subject: emailHeader(message, "Subject").slice(0, 300),
        date: emailHeader(message, "Date").slice(0, 120),
        snippet: String(message.snippet || "").slice(0, 500),
      };
    }));
    const combined = [...details, ...this.#data.messages.filter((old) => !details.some((fresh) => fresh.id === old.id))];
    this.#data.messages = combined.slice(0, MAX_SAVED_MESSAGES);
    this.#data.lastScanAt = new Date().toISOString();
    await this.#save();
    return { messages: details, scannedAt: this.#data.lastScanAt };
  }

  async setMonitoring(enabled) {
    if (enabled && !this.#data?.tokens?.refresh_token) throw new Error("Connecte Gmail avant d'activer la surveillance.");
    this.#data.monitorEnabled = Boolean(enabled);
    await this.#save();
    return this.status();
  }

  prepareSend(input) {
    if (!this.#data?.tokens?.refresh_token) throw new Error("Connecte Gmail avant de préparer un envoi.");
    const message = validateEmailMessage(input);
    this.#pendingSend = { id: randomUUID(), ...message, expiresAt: Date.now() + 5 * 60_000 };
    return { id: this.#pendingSend.id, to: message.to, subject: message.subject, body: message.body, expiresInSeconds: 300 };
  }

  async confirmSend(id) {
    const pending = this.#pendingSend;
    if (!pending || pending.id !== id || pending.expiresAt < Date.now()) {
      this.#pendingSend = null;
      throw new Error("La confirmation est absente ou expirée. Prépare à nouveau le message.");
    }
    if (Date.now() - this.#lastSendAt < 30_000) throw new Error("Patiente 30 secondes entre deux e-mails envoyés.");
    this.#pendingSend = null;
    this.#lastSendAt = Date.now();
    const encodedSubject = Buffer.from(pending.subject, "utf8").toString("base64");
    const mime = [
      `To: ${pending.to}`,
      `Subject: =?UTF-8?B?${encodedSubject}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(pending.body, "utf8").toString("base64"),
    ].join("\r\n");
    const result = await this.#gmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
    });
    return { id: result.id, threadId: result.threadId, to: pending.to, subject: pending.subject };
  }
}
