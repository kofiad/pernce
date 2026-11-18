import { and, eq } from "drizzle-orm";
import { CURRENCIES, FX_API_URLS, FX_SOURCE, VOLATILE_CURRENCIES, parseUsdQuotes, type RatesToUsd } from "@pernce/core";
import { fxRates, rateOverrides } from "../db/schema";
import { notifyChange } from "./changes";
import type { DB } from "./db";
import { newId } from "./ids";
import { newRowStamps, stamp } from "./meta";

const CODES = CURRENCIES.map((c) => c.code);

function parseRate(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** { currency -> 1 unit in USD } for core's report functions: fetched
 * rates, with the user's overrides on top. USD is always 1. */
export function getRatesMap(db: DB): RatesToUsd {
  const map: RatesToUsd = { USD: 1 };
  for (const r of db.select().from(fxRates).all()) {
    const n = parseRate(r.rateToUsd);
    if (n) map[r.currency] = n;
  }
  for (const r of db.select().from(rateOverrides).where(eq(rateOverrides.deleted, false)).all()) {
    const n = parseRate(r.rateToUsd);
    if (n) map[r.currency] = n;
  }
  return map;
}

export type RateInfo = {
  currency: string;
  /** What reports use. Null if this currency has no rate at all yet. */
  effective: number | null;
  market: { rateToUsd: number; source: string; fetchedAt: string } | null;
  override: { id: string; rateToUsd: number } | null;
};

export function listRates(db: DB): RateInfo[] {
  const market = new Map(db.select().from(fxRates).all().map((r) => [r.currency, r]));
  const overrides = new Map(
    db
      .select()
      .from(rateOverrides)
      .where(eq(rateOverrides.deleted, false))
      .all()
      .map((r) => [r.currency, r]),
  );
  return CODES.filter((c) => c !== "USD").map((currency) => {
    const m = market.get(currency);
    const o = overrides.get(currency);
    const mRate = m ? parseRate(m.rateToUsd) : null;
    const oRate = o ? parseRate(o.rateToUsd) : null;
    return {
      currency,
      effective: oRate ?? mRate,
      market: m && mRate ? { rateToUsd: mRate, source: m.source, fetchedAt: m.fetchedAt } : null,
      override: o && oRate ? { id: o.id, rateToUsd: oRate } : null,
    };
  });
}

/** Market rates older than this are called stale. */
export const STALE_RATE_DAYS = 7;

export type RateWarning = "none" | "stale" | "volatile";

/** Whether the rate a currency would be converted at deserves a warning:
 * none at all; a market rate that has gone stale; or a currency whose
 * market rate is unreliable. A manual rate silences all of these but
 * "none". USD never warns. */
export function rateWarning(currency: string, info: RateInfo | undefined, now = new Date()): RateWarning | null {
  if (currency === "USD") return null;
  if (!info || info.effective === null) return "none";
  if (info.override) return null;
  if (VOLATILE_CURRENCIES.includes(currency)) return "volatile";
  if (info.market && now.getTime() - new Date(info.market.fetchedAt).getTime() > STALE_RATE_DAYS * 86_400_000) return "stale";
  return null;
}

/** Newest fetch time across market rates, or null if never fetched. */
export function lastRatesFetch(db: DB): string | null {
  let latest: string | null = null;
  for (const r of db.select({ fetchedAt: fxRates.fetchedAt }).from(fxRates).all()) {
    if (!latest || r.fetchedAt > latest) latest = r.fetchedAt;
  }
  return latest;
}

export function storeMarketRates(db: DB, ratesToUsd: Record<string, number>, source: string, fetchedAt: string) {
  db.transaction((tx) => {
    for (const [currency, rate] of Object.entries(ratesToUsd)) {
      if (currency === "USD" || !Number.isFinite(rate) || rate <= 0) continue;
      const values = { currency, rateToUsd: String(rate), source, fetchedAt };
      tx.insert(fxRates).values(values).onConflictDoUpdate({ target: fxRates.currency, set: values }).run();
    }
  });
  notifyChange();
}

/** Fetches today's rates straight from the free API (primary, then the
 * mirror) and stores them. Throws if both are unreachable; the stored
 * rates stay in use, so offline just means slightly stale numbers. */
export async function refreshMarketRates(db: DB, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  let json: unknown = null;
  for (const url of FX_API_URLS) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) continue;
      json = await res.json();
      break;
    } catch {
      // try the mirror
    }
  }
  if (json === null) throw new Error("Couldn't reach the exchange rate service. Using saved rates.");
  const rates = parseUsdQuotes(json, CODES);
  storeMarketRates(db, rates, FX_SOURCE, new Date().toISOString());
  return Object.keys(rates);
}

/** A hand-set rate: 1 `currency` = `rateToUsd` USD. Wins over fetched rates. */
export function setRateOverride(db: DB, currency: string, rateToUsd: number) {
  if (currency === "USD") throw new Error("USD is always 1");
  if (!CODES.includes(currency as (typeof CODES)[number])) throw new Error(`Unsupported currency "${currency}"`);
  if (!Number.isFinite(rateToUsd) || rateToUsd <= 0) throw new Error("Rate must be a positive number");
  const existing = db
    .select()
    .from(rateOverrides)
    .where(and(eq(rateOverrides.currency, currency), eq(rateOverrides.deleted, false)))
    .get();
  if (existing) {
    db.update(rateOverrides)
      .set({ rateToUsd: String(rateToUsd), updatedAt: stamp(db) })
      .where(eq(rateOverrides.id, existing.id))
      .run();
  } else {
    db.insert(rateOverrides)
      .values({ id: newId(), ...newRowStamps(db), currency, rateToUsd: String(rateToUsd) })
      .run();
  }
  notifyChange();
}

export function clearRateOverride(db: DB, currency: string) {
  db.update(rateOverrides)
    .set({ deleted: true, updatedAt: stamp(db) })
    .where(and(eq(rateOverrides.currency, currency), eq(rateOverrides.deleted, false)))
    .run();
  notifyChange();
}
