import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * HTTP Basic auth over the whole app. Chosen over a login screen because the
 * browser's native prompt costs no frontend work and, once accepted, applies
 * automatically to the <video> and download requests that pull from /media —
 * which a token-in-a-header scheme would not.
 *
 * This is a demo gate, not a security boundary: it protects a paid API key
 * from casual traffic. It is only meaningful over TLS, which the platform
 * terminates for us.
 */

// ASCII only: Node throws ERR_INVALID_CHAR on non-ASCII header values, which
// turns every unauthenticated request into a 500 instead of a 401.
const REALM = "Style Decomposer demo";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths first and
  // still run the comparison to keep the timing profile flat.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export interface AuthConfig {
  user: string;
  password: string;
}

/**
 * Reads the gate's credentials from the environment. In production a missing
 * password is a hard boot failure rather than an open door — deploying
 * without setting the env var is exactly the mistake that would expose the
 * API key, so it must not fail quietly.
 */
export function readAuthConfig(isProduction: boolean): AuthConfig | null {
  const password = process.env.DEMO_PASSWORD?.trim();
  const user = process.env.DEMO_USER?.trim() || "demo";

  if (!password) {
    if (isProduction) {
      throw new Error(
        "DEMO_PASSWORD is not set. Refusing to start in production without the demo gate — " +
          "an open instance exposes the Anthropic API key to anyone with the URL."
      );
    }
    return null;
  }

  return { user, password };
}

export function basicAuth(config: AuthConfig): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;

    if (header?.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator !== -1) {
        const user = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);
        // Both comparisons always run — short-circuiting on the username
        // would leak which half was wrong.
        const userOk = safeEqual(user, config.user);
        const passwordOk = safeEqual(password, config.password);
        if (userOk && passwordOk) {
          next();
          return;
        }
      }
    }

    res.setHeader("WWW-Authenticate", `Basic realm="${REALM}", charset="UTF-8"`);
    res.status(401).send("Authentication required.");
  };
}
