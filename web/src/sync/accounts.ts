import { createHmac, timingSafeEqual } from "node:crypto";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_KDF_PARAMS,
  type SyncKdf,
  type SyncKeys,
  type SyncLoginResponse,
  type SyncSession,
} from "@pernce/core/sync";
import { emailTokens, syncSessions, syncUsers, type SyncUser } from "../db/schema";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/password";
import { createRateLimiter } from "../lib/rate-limit";
import { runBatch } from "../db/batch";
import type { SyncContext } from "./context";
import { deleteSyncUserRows } from "./records";
import { alreadyRegisteredMessage, resetEmailMessage, verifyEmailMessage } from "./email";
import { SyncHttpError, invalidCode, invalidCredentials, rateLimited, unauthorized } from "./errors";
import {
  REFRESH_TOKEN_TTL_MS,
  createAccessToken,
  deriveSecret,
  hashEmailCode,
  hashRefreshToken,
  newEmailCode,
  newRefreshToken,
} from "./tokens";

/** Sign-up, sign-in, sessions, password reset, wrapped keys and account
 * deletion for the sync server (docs/mobile-scope.md §5.3, §6). The client
 * authenticates with an auth key derived from the password (core sync.ts),
 * so nothing here ever sees the password or anything that unwraps the data
 * key. */

const CODE_TTL_MS = 15 * 60 * 1000;
/** A new code isn't sent while the last one is younger than this. */
const CODE_RESEND_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;

// In-memory, per instance (see lib/rate-limit.ts).
const loginLimiter = createRateLimiter("sync-login", { windowMs: 10 * 60 * 1000, max: 8 });
const signupLimiter = createRateLimiter("sync-signup", { windowMs: 60 * 60 * 1000, max: 5 });
/** Emails sent to one address, so the server can't be used to flood an inbox. */
const emailLimiter = createRateLimiter("sync-email", { windowMs: 60 * 60 * 1000, max: 6 });

type Purpose = (typeof emailTokens.purpose.enumValues)[number];

function keysOf(user: SyncUser): SyncKeys {
  return {
    kdf: user.kdf,
    wrappedKeyPassword: user.wrappedKeyPassword,
    wrappedKeyRecovery: user.wrappedKeyRecovery,
    keyVersion: user.keyVersion,
  };
}

async function findByEmail(db: SyncContext["db"], email: string) {
  const [user] = await db.select().from(syncUsers).where(eq(syncUsers.email, email)).limit(1);
  return user;
}

/** The signed-in, verified user behind an access token. A token outlives a
 * deleted account by up to 15 minutes; this is what stops it there. */
export async function requireUser(userId: string, ctx: SyncContext): Promise<SyncUser> {
  const [user] = await ctx.db.select().from(syncUsers).where(eq(syncUsers.id, userId)).limit(1);
  if (!user?.verifiedAt) throw unauthorized();
  return user;
}

/** The KDF parameters a client needs before it can derive the auth key.
 * An unknown email gets the defaults with a salt made from the email, the
 * same on every call, so the answer doesn't say whether the account exists. */
export async function prelogin(email: string, ctx: SyncContext): Promise<SyncKdf> {
  const user = await findByEmail(ctx.db, email);
  if (user) return user.kdf;
  const salt = createHmac("sha256", deriveSecret(ctx.config.sessionSecret, "sync-prelogin-salt")).update(email).digest().subarray(0, 16);
  return { ...DEFAULT_KDF_PARAMS, salt: salt.toString("base64") };
}

async function sendCode(user: SyncUser, purpose: Purpose, ctx: SyncContext) {
  const now = ctx.now();
  const [last] = await ctx.db
    .select({ createdAt: emailTokens.createdAt })
    .from(emailTokens)
    .where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, purpose)));
  // The last code is still on its way and still valid.
  if (last && now - last.createdAt.getTime() < CODE_RESEND_MS) return;
  if (emailLimiter.isLimited(user.email)) return;
  emailLimiter.hit(user.email);

  const code = newEmailCode();
  const values = {
    codeHash: hashEmailCode(ctx.config.sessionSecret, user.id, purpose, code),
    attempts: 0,
    expiresAt: new Date(now + CODE_TTL_MS),
    createdAt: new Date(now),
  };
  await ctx.db
    .insert(emailTokens)
    .values({ userId: user.id, purpose, ...values })
    .onConflictDoUpdate({ target: [emailTokens.userId, emailTokens.purpose], set: values });
  try {
    await ctx.mail(user.email, purpose === "verify" ? verifyEmailMessage(code) : resetEmailMessage(code));
  } catch (err) {
    // Nobody got this code, so don't let it hold off the retry.
    await ctx.db.delete(emailTokens).where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, purpose)));
    throw err;
  }
}

/** Checks an emailed code and uses it up. Every guess counts, right or
 * wrong, and the count goes up before the comparison, so parallel guesses
 * can't share one attempt. */
async function consumeCode(email: string, purpose: Purpose, code: string, ctx: SyncContext): Promise<SyncUser> {
  const user = await findByEmail(ctx.db, email);
  if (!user) throw invalidCode();
  const where = and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, purpose));
  const [token] = await ctx.db
    .update(emailTokens)
    .set({ attempts: sql`${emailTokens.attempts} + 1` })
    .where(where)
    .returning();
  if (!token || token.expiresAt.getTime() < ctx.now() || token.attempts > CODE_MAX_ATTEMPTS) throw invalidCode();
  const expected = Buffer.from(token.codeHash, "hex");
  const given = Buffer.from(hashEmailCode(ctx.config.sessionSecret, user.id, purpose, code), "hex");
  if (!timingSafeEqual(expected, given)) throw invalidCode();
  // Conditional on the hash, so two requests with the right code can't both use it.
  const [used] = await ctx.db
    .delete(emailTokens)
    .where(and(where, eq(emailTokens.codeHash, token.codeHash)))
    .returning();
  if (!used) throw invalidCode();
  return user;
}

/** A new refresh token and the statement that stores its session, for
 * callers that send it in a batch with other writes. */
function newSession(userId: string, deviceName: string | undefined, ctx: SyncContext) {
  const refreshToken = newRefreshToken();
  const insert = ctx.db.insert(syncSessions).values({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    deviceName: deviceName || null,
    expiresAt: new Date(ctx.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { refreshToken, insert };
}

async function loginResponse(user: SyncUser, refreshToken: string, ctx: SyncContext): Promise<SyncLoginResponse> {
  const access = await createAccessToken(ctx.config.sessionSecret, user.id);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
    user: { id: user.id, email: user.email },
    keys: keysOf(user),
  };
}

async function startSession(user: SyncUser, deviceName: string | undefined, ctx: SyncContext): Promise<SyncLoginResponse> {
  const { refreshToken, insert } = newSession(user.id, deviceName, ctx);
  await insert;
  return loginResponse(user, refreshToken, ctx);
}

export type SignupInput = {
  email: string;
  authKey: string;
  kdf: SyncKdf;
  wrappedKeyPassword: string;
  wrappedKeyRecovery: string;
};

/** Creates an unverified account and emails a code. Answers the same way
 * whether or not the email is taken: a verified owner gets a "you already
 * have an account" email instead, and an unverified sign-up is replaced, so
 * nobody can squat an address they can't read mail for. */
export async function signup(input: SignupInput, ip: string, ctx: SyncContext): Promise<void> {
  if (signupLimiter.isLimited(ip)) throw rateLimited();
  signupLimiter.hit(ip);

  const authHash = await hashPassword(input.authKey);
  const existing = await findByEmail(ctx.db, input.email);
  if (existing?.verifiedAt) {
    if (!emailLimiter.isLimited(input.email)) {
      emailLimiter.hit(input.email);
      await ctx.mail(input.email, alreadyRegisteredMessage());
    }
    return;
  }
  if (!existing) {
    const [{ n }] = await ctx.db.select({ n: count() }).from(syncUsers);
    if (n >= ctx.config.maxUsers) {
      throw new SyncHttpError(403, "signups_closed", "This server isn't taking new sign-ups right now.");
    }
  }

  const fields = {
    authHash,
    kdf: input.kdf,
    wrappedKeyPassword: input.wrappedKeyPassword,
    wrappedKeyRecovery: input.wrappedKeyRecovery,
    createdAt: new Date(ctx.now()),
  };
  const [user] = await ctx.db
    .insert(syncUsers)
    .values({ email: input.email, ...fields })
    .onConflictDoUpdate({ target: syncUsers.email, set: fields, setWhere: isNull(syncUsers.verifiedAt) })
    .returning();
  // No row: it was verified between our read and this write. Nothing to do.
  if (user) await sendCode(user, "verify", ctx);
}

export async function verifyEmail(
  input: { email: string; code: string; deviceName?: string },
  ctx: SyncContext,
): Promise<SyncLoginResponse> {
  const user = await consumeCode(input.email, "verify", input.code, ctx);
  const [verified] = await ctx.db
    .update(syncUsers)
    .set({ verifiedAt: user.verifiedAt ?? new Date(ctx.now()) })
    .where(eq(syncUsers.id, user.id))
    .returning();
  return startSession(verified, input.deviceName, ctx);
}

export async function login(
  input: { email: string; authKey: string; deviceName?: string },
  ctx: SyncContext,
): Promise<SyncLoginResponse> {
  // Counted before the slow hash, not after a failure, so parallel guesses
  // can't all get past the check first.
  if (loginLimiter.isLimited(input.email)) throw rateLimited();
  loginLimiter.hit(input.email);
  const user = await findByEmail(ctx.db, input.email);
  // Runs the full hash even for an unknown email (see DUMMY_PASSWORD_HASH).
  const ok = await verifyPassword(input.authKey, user?.authHash ?? DUMMY_PASSWORD_HASH);
  if (!ok || !user) throw invalidCredentials();
  loginLimiter.clear(input.email);
  if (!user.verifiedAt) {
    await sendCode(user, "verify", ctx);
    throw new SyncHttpError(403, "email_not_verified", "Enter the code we emailed you to finish signing up.");
  }
  return startSession(user, input.deviceName, ctx);
}

/** Swaps a refresh token for a new one plus a fresh access token. */
export async function refresh(refreshToken: string, ctx: SyncContext): Promise<SyncSession> {
  const hash = hashRefreshToken(refreshToken);
  const [session] = await ctx.db.select().from(syncSessions).where(eq(syncSessions.tokenHash, hash)).limit(1);
  if (!session) {
    // A token that was already swapped for a newer one is being replayed:
    // someone else has a copy. End the session so neither copy works.
    await ctx.db.delete(syncSessions).where(eq(syncSessions.previousTokenHash, hash));
    throw unauthorized();
  }
  const now = ctx.now();
  if (session.expiresAt.getTime() < now) {
    await ctx.db.delete(syncSessions).where(eq(syncSessions.id, session.id));
    throw unauthorized();
  }
  const next = newRefreshToken();
  const [rotated] = await ctx.db
    .update(syncSessions)
    .set({
      tokenHash: hashRefreshToken(next),
      previousTokenHash: hash,
      lastUsedAt: new Date(now),
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    })
    .where(and(eq(syncSessions.id, session.id), eq(syncSessions.tokenHash, hash)))
    .returning();
  // A concurrent refresh with the same token got there first.
  if (!rotated) throw unauthorized();
  const access = await createAccessToken(ctx.config.sessionSecret, session.userId);
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt, refreshToken: next };
}

export async function logout(refreshToken: string, ctx: SyncContext): Promise<void> {
  await ctx.db.delete(syncSessions).where(eq(syncSessions.tokenHash, hashRefreshToken(refreshToken)));
}

/** Emails a reset code if the account exists; silent either way. */
export async function requestPasswordReset(email: string, ctx: SyncContext): Promise<void> {
  const user = await findByEmail(ctx.db, email);
  if (user) await sendCode(user, "reset", ctx);
}

export type ResetInput = {
  email: string;
  code: string;
  authKey: string;
  kdf: SyncKdf;
  wrappedKeyPassword: string | null;
  wrappedKeyRecovery?: string;
  deviceName?: string;
};

/** Sets a new password (auth key and KDF salt) and signs out every device.
 * The old password-wrapped data key can't be opened with the new password,
 * so it's replaced by whatever the device sends: a re-wrap if it unlocked
 * the data key with the recovery key, otherwise null until a device that
 * still holds the data key signs in and re-wraps it (§5.3). */
export async function confirmPasswordReset(input: ResetInput, ctx: SyncContext) {
  const user = await consumeCode(input.email, "reset", input.code, ctx);
  const authHash = await hashPassword(input.authKey);
  const fields = {
    authHash,
    kdf: input.kdf,
    wrappedKeyPassword: input.wrappedKeyPassword,
    ...(input.wrappedKeyRecovery ? { wrappedKeyRecovery: input.wrappedKeyRecovery } : {}),
    // The code proved the email, so a reset also finishes a sign-up.
    verifiedAt: user.verifiedAt ?? new Date(ctx.now()),
  };
  // Signs out every device and starts this one's session, all or nothing.
  const { refreshToken, insert } = newSession(user.id, input.deviceName, ctx);
  await runBatch(ctx.db, [
    ctx.db.update(syncUsers).set(fields).where(eq(syncUsers.id, user.id)),
    ctx.db.delete(syncSessions).where(eq(syncSessions.userId, user.id)),
    insert,
  ]);
  const result = await loginResponse({ ...user, ...fields }, refreshToken, ctx);
  loginLimiter.clear(input.email);
  return result;
}

export async function getKeys(userId: string, ctx: SyncContext): Promise<SyncKeys> {
  return keysOf(await requireUser(userId, ctx));
}

/** Stores re-wrapped copies of the data key. `keyVersion` is either the
 * current one (same data key, e.g. after a password reset) or the next one
 * (a new data key; devices re-encrypt and push every record under it). */
export async function putKeys(
  userId: string,
  input: { keyVersion: number; wrappedKeyPassword: string; wrappedKeyRecovery: string },
  ctx: SyncContext,
): Promise<SyncKeys> {
  const user = await requireUser(userId, ctx);
  if (input.keyVersion !== user.keyVersion && input.keyVersion !== user.keyVersion + 1) {
    throw keysChanged();
  }
  // Conditional on the key version we checked, so two devices can't both
  // move it on from the same one.
  const [updated] = await ctx.db
    .update(syncUsers)
    .set({
      keyVersion: input.keyVersion,
      wrappedKeyPassword: input.wrappedKeyPassword,
      wrappedKeyRecovery: input.wrappedKeyRecovery,
    })
    .where(and(eq(syncUsers.id, userId), eq(syncUsers.keyVersion, user.keyVersion)))
    .returning();
  if (!updated) throw keysChanged();
  return keysOf(updated);
}

const keysChanged = () =>
  new SyncHttpError(409, "key_changed", "Your keys changed on another device. Sign in again.");

/** Deletes the account and everything stored for it. Asks for the auth key
 * again, so a stolen access token alone can't do it. */
export async function deleteAccount(userId: string, authKey: string, ctx: SyncContext) {
  const user = await requireUser(userId, ctx);
  if (loginLimiter.isLimited(user.email)) throw rateLimited();
  loginLimiter.hit(user.email);
  if (!(await verifyPassword(authKey, user.authHash))) throw invalidCredentials();
  await deleteSyncUserRows(userId, ctx);
}
