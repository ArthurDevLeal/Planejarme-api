import { Request, Response } from "express";
import crypto from "node:crypto";
import {
  buildAuthorizeUrl,
  FetchOAuthProfileService,
  FindOrCreateOAuthUserService,
  isOAuthProvider,
  OAuthError,
} from "../services/auth/oauth.ts";
import { signSessionToken } from "../utils/session-token.ts";

const STATE_COOKIE = "oauth_state";

function webCallback(fragment: Record<string, string>) {
  const webUrl = (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
  // Fragmento (#), não query: o token não aparece em logs de servidor nem no Referer.
  return `${webUrl}/auth/oauth/callback#${new URLSearchParams(fragment)}`;
}

function readCookie(req: Request, name: string) {
  const match = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function sameValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Navegação do navegador (não fetch): erros viram redirect para o web, nunca JSON. */
export class OAuthController {
  Start = (req: Request, res: Response) => {
    const provider = String(req.params.provider);
    if (!isOAuthProvider(provider)) return res.redirect(webCallback({ error: "unavailable" }));
    try {
      const state = crypto.randomBytes(32).toString("base64url");
      const url = buildAuthorizeUrl(provider, state);
      // O state fica preso a este navegador: impede que alguém faça a vítima entrar na conta do atacante.
      res.cookie(STATE_COOKIE, `${provider}:${state}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 10 * 60 * 1000,
        path: "/auth/oauth",
      });
      return res.redirect(url);
    } catch (error) {
      return res.redirect(webCallback({ error: error instanceof OAuthError ? error.code : "failed" }));
    }
  };

  Callback = async (req: Request, res: Response) => {
    const provider = String(req.params.provider);
    const expected = readCookie(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, { path: "/auth/oauth" });
    try {
      if (!isOAuthProvider(provider)) throw new OAuthError("unavailable");
      if (typeof req.query.error === "string") throw new OAuthError("denied");
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!expected || !state || !sameValue(expected, `${provider}:${state}`)) throw new OAuthError("state");
      if (!code) throw new OAuthError("failed", "código ausente");

      const profile = await FetchOAuthProfileService(provider, code);
      const { userId, isNew } = await FindOrCreateOAuthUserService(profile);
      return res.redirect(webCallback({ token: signSessionToken(userId), ...(isNew ? { new: "1" } : {}) }));
    } catch (error) {
      if (!(error instanceof OAuthError) || error.code === "failed") console.error("[oauth]", provider, error);
      return res.redirect(webCallback({ error: error instanceof OAuthError ? error.code : "failed" }));
    }
  };
}
