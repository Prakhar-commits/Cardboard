import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler, Response } from "express";

/**
 * A stateless session cookie.
 *
 * The gate exists to keep a paid API key from being a free public endpoint.
 * It was HTTP Basic first, which cost no frontend work but hands the user the
 * browser's native sign-in dialog — unstyleable, and the first thing anyone
 * sees of the product.
 *
 * This replaces it without introducing a session store: the cookie carries
 * its own expiry and an HMAC over that expiry, so the server verifies it by
 * recomputing the signature rather than by looking anything up. There is
 * still nothing to persist, and a restart does not sign anyone out — the
 * secret comes from the environment, so it is stable across deploys.
 *
 * Cookies also beat a token-in-a-header here: the browser attaches them
 * automatically to <video> and <img> requests against /media, which a header
 * scheme cannot reach without proxying every asset through fetch().
 */

export const SESSION_COOKIE = "sd_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — long enough for a demo session

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Keep the timing profile flat rather than returning early on length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(secret: string, now = Date.now()): string {
  const expiresAt = String(now + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator === -1) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sign(expiresAt, secret))) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

/** Minimal cookie header parse — avoids adding cookie-parser for one value. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, isProduction: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction, // Railway terminates TLS; locally we're on http
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export interface AuthConfig {
  password: string;
  /** Signing key for session cookies. Separate from the password so the
   *  password can be rotated without a code change, but defaulted from it so
   *  a demo deploy needs exactly one variable set. */
  secret: string;
}

export function readAuthConfig(isProduction: boolean): AuthConfig | null {
  const password = process.env.DEMO_PASSWORD?.trim();

  if (!password) {
    if (isProduction) {
      throw new Error(
        "DEMO_PASSWORD is not set. Refusing to start in production without the demo gate — " +
          "an open instance exposes the Anthropic API key to anyone with the URL."
      );
    }
    return null;
  }

  return { password, secret: process.env.SESSION_SECRET?.trim() || password };
}

export function checkPassword(candidate: unknown, config: AuthConfig): boolean {
  return typeof candidate === "string" && safeEqual(candidate, config.password);
}

/**
 * Gates the API and media routes. The SPA shell itself is deliberately left
 * open — the login screen has to be servable to be usable, and the bundle
 * contains no secrets.
 */
export function requireSession(config: AuthConfig): RequestHandler {
  return (req, res, next) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (verifySessionToken(token, config.secret)) {
      next();
      return;
    }
    res.status(401).json({ error: "Not authenticated." });
  };
}
