import { inArray } from "drizzle-orm";
import { currencies, exchangeRates } from "../db/schema";
import { exchangeRateStatement } from "../db/mutations";
import { FX_API_URLS, FX_SOURCE, parseUsdQuotes } from "@pernce/core/fx";
import { CURRENCIES } from "@pernce/core/currency";
import { chunkRows, runBatch, type DbClient } from "../db/batch";

// Free, no-key, no-rate-limit exchange rate API (updated daily), CDN hosted.
// The URLs and parsing live in core so the mobile app fetches the same way.
async function fetchUsdQuotes(): Promise<unknown> {
  for (const url of FX_API_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // try the next mirror
    }
  }
  throw new Error("Could not reach the exchange rate API (tried primary + fallback).");
}

/** Fetches 1 USD -> X for every tracked currency and stores 1 X -> USD
 * (the inverse) in exchange_rates, tagged with source "fawazahmed0". */
export async function refreshAllRates({ db, quotes }: { db: DbClient; quotes?: unknown }) {
  // `quotes` lets scripts/verify-sync.ts and test/ run this with a canned
  // payload instead of fetching.
  const json = quotes ?? (await fetchUsdQuotes());
  await ensureCurrencies(db);
  const tracked = await db.select().from(currencies);
  const ratesToUsd = parseUsdQuotes(
    json,
    tracked.map((c) => c.code),
  );

  // A batch of 50 upserts instead of a round trip per currency (each
  // statement has 5 bound parameters, well under D1's 100 per statement).
  const entries = Object.entries(ratesToUsd);
  for (const chunk of chunkRows(entries, 1, 50)) {
    await runBatch(
      db,
      chunk.map(([code, rateToUsd]) => exchangeRateStatement(code, rateToUsd, FX_SOURCE, db)),
    );
  }
  return entries.map(([code]) => code);
}

/** Makes the table match core's CURRENCIES: adds the ones it lacks (so a
 * deploy that grows the list is tracked from the next cron run without
 * re-seeding) and drops retired ones with their cached rates. */
async function ensureCurrencies(db: DbClient) {
  const have = new Set((await db.select({ code: currencies.code }).from(currencies)).map((c) => c.code));
  const wanted = new Set<string>(CURRENCIES.map((c) => c.code));
  const retired = [...have].filter((code) => !wanted.has(code));
  // Chunked: D1 allows 100 bound parameters per statement. Rates first,
  // since they reference the currency.
  for (const chunk of chunkRows(retired, 1)) {
    await db.delete(exchangeRates).where(inArray(exchangeRates.currency, chunk));
    await db.delete(currencies).where(inArray(currencies.code, chunk));
  }
  const missing = CURRENCIES.filter((c) => !have.has(c.code)).map((c) => ({ ...c }));
  for (const chunk of chunkRows(missing, 3)) {
    await db.insert(currencies).values(chunk).onConflictDoNothing();
  }
}
