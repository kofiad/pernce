import type { DbClient } from "./batch";
import { exchangeRates } from "./schema";

/** Writes to the server's own tables (the sync store's are in src/sync/).
 * Each takes the database to write to, so every host (and the tests) passes
 * its own. */

/** One exchange-rate upsert as a batchable statement. */
export function exchangeRateStatement(
  currency: string,
  rateToUsd: number,
  source: string,
  dbClient: DbClient,
) {
  const updatedAt = new Date();
  const value = String(rateToUsd);
  return dbClient
    .insert(exchangeRates)
    .values({ currency, rateToUsd: value, source, updatedAt })
    .onConflictDoUpdate({ target: exchangeRates.currency, set: { rateToUsd: value, source, updatedAt } });
}

export async function upsertExchangeRate(
  currency: string,
  rateToUsd: number,
  source: string,
  dbClient: DbClient,
) {
  const [row] = await exchangeRateStatement(currency, rateToUsd, source, dbClient).returning();
  return row;
}
