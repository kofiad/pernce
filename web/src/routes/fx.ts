import type { Handler } from "hono";
import { eq } from "drizzle-orm";
import { FX_SOURCE } from "@pernce/core/fx";
import type { FxRatesResponse } from "@pernce/core/sync";
import { exchangeRates } from "../db/schema";
import type { HonoEnv } from "../types";

/** Public: the rates the daily cron fetched. Rates typed in by hand on the
 * web app (source "manual") are some user's choice, not public data, so
 * they're left out. */
export const fxRates: Handler<HonoEnv> = async (c) => {
  const { db } = c.var.getCtx();
  const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.source, FX_SOURCE));
  const latest = rows.reduce<Date | null>((max, r) => (max && max > r.updatedAt ? max : r.updatedAt), null);
  const body: FxRatesResponse = {
    source: FX_SOURCE,
    rates: Object.fromEntries(rows.map((r) => [r.currency, r.rateToUsd])),
    updatedAt: latest?.toISOString() ?? null,
  };
  // Rates change once a day; let the CDN answer most requests.
  c.header("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return c.json(body);
};
