import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GmailService } from "./gmail.mjs";

test("Gmail OAuth uses PKCE and requires one explicit confirmation per send", { skip: process.platform !== "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "emploiia-gmail-test-"));
  const filePath = join(directory, "gmail.dpapi");
  let sendCount = 0;
  const mockGoogle = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname === "/token" && url.hostname === "oauth2.googleapis.com") {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get("code_verifier")?.length, 64);
      assert.equal(form.has("client_secret"), false);
      return Response.json({ access_token: "mock-access-token", refresh_token: "mock-refresh-token", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send" });
    }
    if (url.pathname === "/revoke") return new Response(null, { status: 200 });
    if (url.pathname === "/gmail/v1/users/me/profile") return Response.json({ emailAddress: "candidate@example.test" });
    if (url.pathname === "/gmail/v1/users/me/messages" && options.method !== "POST") {
      assert.match(url.searchParams.get("q"), /in:inbox newer_than:30d/);
      return Response.json({ messages: [{ id: "message-1" }] });
    }
    if (url.pathname.endsWith("/messages/message-1")) {
      assert.equal(url.searchParams.getAll("metadataHeaders").length, 3);
      return Response.json({
        id: "message-1",
        threadId: "thread-1",
        snippet: "Réponse concernant une candidature",
        payload: { headers: [{ name: "From", value: "Recruiter <recruiter@example.test>" }, { name: "Subject", value: "Entretien" }, { name: "Date", value: "Thu, 05 Nov 2026 10:00:00 +0000" }] },
      });
    }
    if (url.pathname.endsWith("/messages/send")) {
      sendCount += 1;
      const request = JSON.parse(options.body);
      const decoded = Buffer.from(request.raw, "base64url").toString("utf8");
      assert.match(decoded, /To: recruiter@example\.test/);
      assert.equal(Buffer.from(decoded.split("\r\n\r\n").at(-1), "base64").toString("utf8"), "Bonjour, merci pour votre message.");
      return Response.json({ id: "sent-1", threadId: "thread-1" });
    }
    throw new Error(`Unexpected mock Google request: ${url.href}`);
  };
  const service = new GmailService({ filePath, appUrl: "http://127.0.0.1:8788", fetchImpl: mockGoogle });
  let callbackUrl = "";
  try {
    await service.load();
    await service.configure({ clientId: "test.apps.googleusercontent.com" });
    const authorization = new URL(await service.startAuthorization());
    assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    const redirect = new URL(authorization.searchParams.get("redirect_uri"));
    callbackUrl = `${redirect.origin}/?code=test-code&state=${authorization.searchParams.get("state")}`;
    const callback = await fetch(callbackUrl, { redirect: "manual" });
    assert.equal(callback.status, 303);
    assert.equal(service.status().connected, true);
    assert.equal(service.status().email, "candidate@example.test");

    const scan = await service.scanRecentMessages();
    assert.equal(scan.messages.length, 1);
    assert.equal(scan.messages[0].from, "Recruiter <recruiter@example.test>");

    assert.throws(() => service.prepareSend({ to: "not-an-address", subject: "Test", body: "Bonjour" }), /adresse e-mail valide/);
    const pending = service.prepareSend({ to: "recruiter@example.test", subject: "Merci pour votre retour", body: "Bonjour, merci pour votre message." });
    assert.equal(sendCount, 0);
    const sent = await service.confirmSend(pending.id);
    assert.equal(sent.id, "sent-1");
    assert.equal(sendCount, 1);
    await assert.rejects(() => service.confirmSend(pending.id), /confirmation est absente ou expirée/);
    assert.equal(sendCount, 1);

    const protectedData = await readFile(filePath, "utf8");
    assert.equal(protectedData.includes("mock-refresh-token"), false);
    assert.equal(protectedData.includes("client-secret-for-tests"), false);
    assert.equal((await service.disconnect()).revoked, true);
    assert.equal(service.status().connected, false);
  } finally {
    if (callbackUrl) await fetch(callbackUrl).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
