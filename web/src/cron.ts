import { refreshAllRates } from "./lib/fx";
import { pruneSyncData } from "./sync/records";
import type { SyncContext } from "./sync/context";

/** The two scheduled jobs. Vercel Cron calls them over HTTP
 * (src/routes/cron.ts, schedules in web/vercel.json); Cloudflare Cron
 * Triggers call scheduled() in src/worker.ts (schedules in
 * wrangler.jsonc). Keep the schedules in the three places in step. */
export const FX_RATES_CRON = "0 6 * * *";
export const SYNC_PRUNE_CRON = "30 6 * * *";

export const refreshRates = (ctx: SyncContext) => refreshAllRates({ db: ctx.db });
export const pruneSync = (ctx: SyncContext) => pruneSyncData(ctx);
