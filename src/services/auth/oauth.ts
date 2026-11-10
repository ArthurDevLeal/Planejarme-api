import { hash } from "bcrypt";
import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma.ts";

export type OAuthProvider = "google" | "github";

const PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    env: "GOOGLE",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    env: "GITHUB",
  },
} as const;

export type OAuthProfile = { email: string; name: string };

export class OAuthError extends Error {
  constructor(public code: "unavailable" | "denied" | "state" | "email" | "failed", detail?: string) {
    super(detail ?? code);
  }
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

function credentials(provider: OAuthProvider) {
  const prefix = PROVIDERS[provider].env;
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) throw new OAuthError("unavailable");
  return { clientId, clientSecret };
}

export function callbackUrl(provider: OAuthProvider) {
  const apiUrl = (process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");
  return `${apiUrl}/auth/oauth/${provider}/callback`;
}

export function buildAuthorizeUrl(provider: OAuthProvider, state: string) {
  const { clientId } = credentials(provider);
  const url = new URL(PROVIDERS[provider].authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl(provider));
  url.searchParams.set("scope", PROVIDERS[provider].scope);
  url.searchParams.set("state", state);
  if (provider === "google") url.searchParams.set("response_type", "code");
  return url.toString();
}

async function getJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new OAuthError("failed", `${url} respondeu ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function FetchOAuthProfileService(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
  const { clientId, clientSecret } = credentials(provider);
  const token = await getJson(PROVIDERS[provider].tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl(provider),
      grant_type: "authorization_code",
    }),
  });
  const accessToken = token.access_token;
  if (typeof accessToken !== "string") throw new OAuthError("failed", "token ausente");
  const auth = { Authorization: `Bearer ${accessToken}` };

  if (provider === "google") {
    const info = await getJson("https://openidconnect.googleapis.com/v1/userinfo", { headers: auth });
    if (typeof info.email !== "string" || info.email_verified !== true) throw new OAuthError("email");
    return { email: info.email, name: typeof info.name === "string" && info.name ? info.name : info.email.split("@")[0] };
  }

  const headers = { ...auth, Accept: "application/vnd.github+json", "User-Agent": "planejarme-api" };
  const [user, emails] = await Promise.all([
    getJson("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }).then((r) => (r.ok ? r.json() : [])),
  ]);
  const primary = (emails as { email: string; primary: boolean; verified: boolean }[]).find(
    (item) => item.primary && item.verified,
  );
  if (!primary) throw new OAuthError("email");
  const name = typeof user.name === "string" && user.name ? user.name : String(user.login ?? primary.email.split("@")[0]);
  return { email: primary.email, name };
}

export async function FindOrCreateOAuthUserService({ email, name }: OAuthProfile) {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { userId: existing.id, isNew: false };

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name.slice(0, 100),
      passwordHash: await hash(crypto.randomBytes(32).toString("base64url"), 8),
    },
    select: { id: true },
  });
  return { userId: user.id, isNew: true };
}
