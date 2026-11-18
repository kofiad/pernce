import { createHash, timingSafeEqual } from "node:crypto";
import type { Context, Handler } from "hono";
import { readEnv } from "../env";
import type { HonoEnv } from "../types";
import { pruneSync, refreshRates } from "../cron";

/** Compares in constant time: both sides are hashed first, so the buffers
 * have equal length whatever the caller sent. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// Vercel Cron calls these on a schedule (web/vercel.json) with
// `Authorization: Bearer $CRON_SECRET`: set CRON_SECRET as an env var and
// Vercel adds the header itself. They're reachable by anyone on the
// internet, so they fail closed: never skip the check if CRON_SECRET isn't
// configured, instead of leaving them wide open.

const withCronAuth =
  (handler: (c: Context<HonoEnv>) => Promise<Response>): Handler<HonoEnv> =>
  (c) => {
    const secret = readEnv(c).CRON_SECRET;
    if (!secret || !sameSecret(c.req.header("authorization") ?? "", `Bearer ${secret}`)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return handler(c);
  };

export const fxRatesCron = withCronAuth(async (c) => {
  try {
    const updated = await refreshRates(c.var.getCtx());
    return c.json({ ok: true, updated });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, 502);
  }
});

export const syncPruneCron = withCronAuth(async (c) => c.json({ ok: true, deleted: await pruneSync(c.var.getCtx()) }));
