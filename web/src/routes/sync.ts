import { Hono, type Context } from "hono";
import { readEnv } from "../env";
import type { SyncError } from "@pernce/core/sync";
import { deleteAccount, getKeys, login, logout, markTokenUsed, prelogin, putKeys, refresh, requestPasswordReset, confirmPasswordReset, signup, verifyEmail } from "../sync/accounts";
import { readBody, readQuery, requireUserId, syncRoute, type ClientIp } from "../sync/http";
import { pull, push, wipeRecords } from "../sync/records";
import {
  deleteAccountSchema,
  loginSchema,
  preloginSchema,
  pullQuerySchema,
  pushSchema,
  putKeysSchema,
  refreshSchema,
  resetConfirmSchema,
  resetRequestSchema,
  signupSchema,
  verifySchema,
} from "../sync/schemas";
import { bearerToken, verifyAccessTokenClaims } from "../sync/tokens";
import type { HonoEnv } from "../types";
import { methods } from "./methods";

// The mobile sync API (src/sync) uses bearer tokens, never the web cookie.
// These endpoints are how a device gets a token in the first place; every
// other one needs a valid access token.
const PUBLIC = new Set(
  ["prelogin", "signup", "verify", "login", "refresh", "logout", "reset", "reset/confirm"].map((p) => `/api/sync/${p}`),
);

/** The sync API, mounted at /api/sync. `clientIp` is the host's way to read
 * the caller's address (sign-up rate limit). */
export function syncRoutes(clientIp: ClientIp) {
  const sync = new Hono<HonoEnv>();

  sync.use("*", async (c, next) => {
    // Only /api/sync/<something> is guarded; /api/sync itself is just unknown.
    if (PUBLIC.has(c.req.path) || !c.req.path.startsWith("/api/sync/")) return next();
    const claims = await verifyAccessTokenClaims(
      readEnv(c).SESSION_SECRET,
      bearerToken(c.req.header("authorization") ?? null),
    );
    if (!claims) return c.json({ error: "unauthorized", message: "Sign in again." } satisfies SyncError, 401);
    // The device has its current refresh token: from now on the previous one
    // counts as a replay (accounts.ts refresh). An indexed no-op once marked.
    if (claims.session) await markTokenUsed(claims.session, c.var.getCtx());
    return next();
  });

  const ctx = (c: Context<HonoEnv>) => c.var.getCtx();

  /** Deletes the sync account and all its data (required by Apple once
   * sign-up exists). The body repeats the auth key. */
  methods(sync, "/account", {
    DELETE: syncRoute(async (c) => {
      const userId = await requireUserId(c);
      await deleteAccount(userId, (await readBody(c, deleteAccountSchema)).authKey, ctx(c));
    }),
  });

  methods(sync, "/keys", {
    GET: syncRoute(async (c) => getKeys(await requireUserId(c), ctx(c))),
    PUT: syncRoute(async (c) => {
      const userId = await requireUserId(c);
      return putKeys(userId, await readBody(c, putKeysSchema), ctx(c));
    }),
  });

  methods(sync, "/login", { POST: syncRoute(async (c) => login(await readBody(c, loginSchema), ctx(c))) });

  /** Ends this device's session. Takes the refresh token rather than an
   * access token, which may already have expired. */
  methods(sync, "/logout", {
    POST: syncRoute(async (c) => {
      await logout((await readBody(c, refreshSchema)).refreshToken, ctx(c));
    }),
  });

  /** KDF parameters for an email, so the client can derive its auth key. */
  methods(sync, "/prelogin", {
    POST: syncRoute(async (c) => {
      const { email } = await readBody(c, preloginSchema);
      return { kdf: await prelogin(email, ctx(c)) };
    }),
  });

  /** GET /api/sync/pull?since=<cursor>&limit=<n> */
  methods(sync, "/pull", {
    GET: syncRoute(async (c) => {
      const userId = await requireUserId(c);
      const { since, limit } = readQuery(c, pullQuerySchema);
      return pull(userId, since, limit, ctx(c));
    }),
  });

  methods(sync, "/push", {
    POST: syncRoute(async (c) => {
      const userId = await requireUserId(c);
      return push(userId, (await readBody(c, pushSchema)).records, ctx(c));
    }),
  });

  /** Deletes the cloud copy of every record; the account stays. */
  methods(sync, "/records", {
    DELETE: syncRoute(async (c) => {
      await wipeRecords(await requireUserId(c), ctx(c));
    }),
  });

  methods(sync, "/refresh", {
    POST: syncRoute(async (c) => refresh((await readBody(c, refreshSchema)).refreshToken, ctx(c))),
  });

  /** Sets the new password, signs out every other device, and signs this one in. */
  methods(sync, "/reset/confirm", {
    POST: syncRoute(async (c) => confirmPasswordReset(await readBody(c, resetConfirmSchema), ctx(c))),
  });

  /** Emails a reset code if the account exists. Always 202. Next step:
   * POST /api/sync/reset/confirm. */
  methods(sync, "/reset", {
    POST: syncRoute(async (c) => {
      await requestPasswordReset((await readBody(c, resetRequestSchema)).email, ctx(c));
      return c.json({ ok: true }, 202);
    }),
  });

  /** Always 202, whether or not the email already has an account: the email
   * itself says which. Next step: POST /api/sync/verify with the code. */
  methods(sync, "/signup", {
    POST: syncRoute(async (c) => {
      await signup(await readBody(c, signupSchema), clientIp(c.req.raw.headers), ctx(c));
      return c.json({ ok: true }, 202);
    }),
  });

  /** Confirms the sign-up code and signs the device in. */
  methods(sync, "/verify", { POST: syncRoute(async (c) => verifyEmail(await readBody(c, verifySchema), ctx(c))) });

  return sync;
}
