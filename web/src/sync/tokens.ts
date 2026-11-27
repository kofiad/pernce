import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// No database access in here: the sync routes' auth check (src/routes/sync.ts)
// only needs the signing secret. SESSION_SECRET reaches these functions as a
// parameter (SyncContext.config), never through process.env, because Workers
// have no process.env at import time.

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days, sliding
const AUDIENCE = "pernce-sync";

/** A key for one purpose, derived from SESSION_SECRET so the sync server
 * needs no extra secret. Each label gives an unrelated key, so the access
 * tokens ("sync-access-token"), email-code hashes ("sync-email-code") and the
 * prelogin salt ("sync-prelogin-salt") can never stand in for one another. */
export function deriveSecret(secret: string | undefined, label: string): Buffer {
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to .env.local (any long random string).");
  }
  return createHmac("sha256", secret).update(`pernce:${label}`).digest();
}

/** Which session and refresh token an access token was issued with, so
 * the first request that uses it can mark that refresh token as received
 * (sync_sessions.token_used). */
export type AccessTokenSession = { sessionId: string; tokenHash: string };

export async function createAccessToken(secret: string, userId: string, session: AccessTokenSession) {
  const expiresAt = Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000;
  const token = await new SignJWT({ sid: session.sessionId, rth: session.tokenHash })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(deriveSecret(secret, "sync-access-token"));
  return { token, expiresAt };
}

/** The user id in a valid access token, or null. */
export async function verifyAccessToken(
  secret: string | undefined,
  token: string | null | undefined,
): Promise<string | null> {
  return (await verifyAccessTokenClaims(secret, token))?.userId ?? null;
}

/** The user id and, for tokens issued since sessions were tied to them,
 * the session it came from; null for an invalid token. */
export async function verifyAccessTokenClaims(
  secret: string | undefined,
  token: string | null | undefined,
): Promise<{ userId: string; session: AccessTokenSession | null } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, deriveSecret(secret, "sync-access-token"), {
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string") return null;
    const { sid, rth } = payload;
    const session = typeof sid === "string" && typeof rth === "string" ? { sessionId: sid, tokenHash: rth } : null;
    return { userId: payload.sub, session };
  } catch {
    return null;
  }
}

export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}

export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Refresh tokens are 256 random bits, so a plain SHA-256 is enough to make
 * a leaked table useless. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Keyed, so a leaked table of 6-digit codes can't be reversed offline. */
export function hashEmailCode(secret: string, userId: string, purpose: string, code: string): string {
  return createHmac("sha256", deriveSecret(secret, "sync-email-code")).update(`${userId}:${purpose}:${code}`).digest("hex");
}
