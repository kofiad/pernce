import { createApp } from "./create-app";
import { FX_RATES_CRON, SYNC_PRUNE_CRON, pruneSync, refreshRates } from "./cron";
import { d1FromEnv } from "./db/d1";
import { cloudflareClientIp } from "./sync/http";
import { createSyncContext } from "./sync/context";
import type { AppEnv } from "./types";

/** The API on Cloudflare Workers (api.pernce.com): the same app as
 * src/node-app.ts with D1 bound as `DB` (wrangler.jsonc) instead of libSQL, and
 * Cron Triggers instead of Vercel Cron. Everything the app reads comes from
 * the Worker's `env` (vars, secrets, bindings) per request; Workers have no
 * process.env at import time.
 *
 * Not deployed yet (docs/web-deployment.md): the public web app is
 * offline-only until sync goes public.
 *
 * Limits of this host, written down in docs/web-deployment.md:
 * - the sign-in rate limiters are in memory (src/lib/rate-limit.ts), so each
 *   isolate counts separately and a determined caller isn't throttled
 *   reliably. Add a Cloudflare rate limiting rule on /api/sync/* before the
 *   API is public;
 * - scrypt (password.ts) costs about 17 to 21 ms of CPU (measured in workerd
 *   and Node), over the free plan's 10 ms per request, on sign-up, sign-in, reset and account deletion. */
const app = createApp({
  createContext: (env) => createSyncContext(env, d1FromEnv(env)),
  clientIp: cloudflareClientIp,
});

export default {
  fetch: app.fetch,

  /** Cron Triggers call this instead of making an HTTP request, so there's
   * no CRON_SECRET to check: the same functions the cron routes run. */
  async scheduled(controller: { cron: string }, env: AppEnv, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const context = createSyncContext(env, d1FromEnv(env));
    const run =
      controller.cron === FX_RATES_CRON
        ? refreshRates(context)
        : controller.cron === SYNC_PRUNE_CRON
          ? pruneSync(context)
          : Promise.reject(new Error(`No job is scheduled for "${controller.cron}".`));
    // waitUntil keeps the Worker alive until the job ends; a rejection is
    // logged by the runtime and shows as a failed Cron Trigger.
    ctx.waitUntil(run);
    await run;
  },
};
