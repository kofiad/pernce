import type { D1Env } from "./db/d1";
import type { LibsqlEnv } from "./db/libsql";
import type { SyncContext, SyncEnv } from "./sync/context";

/** Everything the app reads from its host's environment: process.env on
 * Node and Vercel, the Worker's vars, secrets and bindings on Cloudflare.
 * It is always read per request (`readEnv(c)`, src/env.ts), never at
 * import time. */
export type AppEnv = SyncEnv &
  LibsqlEnv &
  D1Env & {
  /** `Authorization: Bearer <this>` authenticates the cron routes. */
  CRON_SECRET?: string;
  /** Origins allowed to call the API from a browser, comma-separated, e.g.
   * https://pernce.com. Unset on Vercel, where the web app is same-origin. */
  ALLOWED_ORIGINS?: string;
  /** The old name of ALLOWED_ORIGINS (development: http://localhost:8081). */
  WEB_APP_ORIGINS?: string;
};

/** The Hono app's type: `getCtx()` builds the request's SyncContext (the
 * database, mailer, clock and settings) the first time a route needs it,
 * so requests that never touch the database (CORS preflights, rejected
 * tokens, unknown paths) work without database settings. */
export type HonoEnv = {
  Variables: { getCtx: () => SyncContext };
};
