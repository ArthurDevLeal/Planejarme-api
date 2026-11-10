import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { mainRouter } from "../src/routes/main-router.ts";
import { ErrorMiddleware } from "../src/middlewares/errors.ts";
import { prisma } from "../lib/prisma.ts";

let server: Server;
let baseUrl = "";
const realFetch = globalThis.fetch;

before(async () => {
  process.env.WEB_URL = "http://web.test";
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  app.use(ErrorMiddleware);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function go(path: string, cookie?: string) {
  const response = await realFetch(baseUrl + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: response.status, location: response.headers.get("location") ?? "", setCookie: response.headers.get("set-cookie") ?? "" };
}
const fragment = (location: string) => new URLSearchParams(new URL(location).hash.slice(1));

test("provedor sem chaves ou desconhecido volta ao web com erro", async () => {
  const google = await go("/auth/oauth/google");
  assert.equal(google.status, 302);
  assert.equal(fragment(google.location).get("error"), "unavailable");
  assert.equal(fragment((await go("/auth/oauth/facebook")).location).get("error"), "unavailable");
});

test("início redireciona ao Google e prende o state num cookie httpOnly", async () => {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  const start = await go("/auth/oauth/google");
  const url = new URL(start.location);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.match(url.searchParams.get("redirect_uri") ?? "", /\/auth\/oauth\/google\/callback$/);
  const state = url.searchParams.get("state")!;
  assert.ok(state.length >= 40);
  assert.match(start.setCookie, /oauth_state=google%3A/);
  assert.match(start.setCookie, /HttpOnly/i);
  assert.match(start.setCookie, /SameSite=Lax/i);
});

test("callback recusa state ausente ou trocado e acesso negado", async () => {
  assert.equal(fragment((await go("/auth/oauth/google/callback?code=x&state=abc")).location).get("error"), "state");
  assert.equal(
    fragment((await go("/auth/oauth/google/callback?code=x&state=abc", "oauth_state=google%3Aoutro")).location).get("error"),
    "state",
  );
  assert.equal(
    fragment((await go("/auth/oauth/google/callback?code=x&state=abc", "oauth_state=github%3Aabc")).location).get("error"),
    "state",
  );
  assert.equal(fragment((await go("/auth/oauth/google/callback?error=access_denied&state=abc")).location).get("error"), "denied");
});

function mockGoogle(userinfo: Record<string, unknown>) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "google-token" });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json(userinfo);
    return realFetch(input, init);
  }) as typeof fetch;
}

test("e-mail não verificado no Google não entra", async () => {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  mockGoogle({ email: "x@example.invalid", email_verified: false, name: "X" });
  try {
    const result = await go("/auth/oauth/google/callback?code=c&state=s1", "oauth_state=google%3As1");
    assert.equal(fragment(result.location).get("error"), "email");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("login com Google cria a conta na primeira vez e reaproveita depois", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  const email = `oauth-${randomUUID()}@example.invalid`;
  mockGoogle({ email: email.toUpperCase(), email_verified: true, name: "Aluna OAuth" });
  try {
    const first = await go("/auth/oauth/google/callback?code=c&state=s2", "oauth_state=google%3As2");
    assert.match(first.location, /^http:\/\/web\.test\/auth\/oauth\/callback#/);
    const params = fragment(first.location);
    assert.equal(params.get("new"), "1");
    const payload = jwt.verify(params.get("token")!, process.env.JWT_SECRET!) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    assert.equal(user?.email, email);
    assert.equal(user?.name, "Aluna OAuth");

    const second = fragment((await go("/auth/oauth/google/callback?code=c&state=s3", "oauth_state=google%3As3")).location);
    assert.equal(second.get("new"), null);
    assert.equal((jwt.verify(second.get("token")!, process.env.JWT_SECRET!) as { id: string }).id, payload.id);
  } finally {
    globalThis.fetch = realFetch;
    await prisma.user.deleteMany({ where: { email } });
  }
});
