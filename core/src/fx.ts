/** Free, keyless exchange rate API (updated daily), CDN hosted, with a
 * mirror. https://github.com/fawazahmed0/exchange-api
 * The web app's daily cron and the mobile app's direct fetch both use
 * these, so they agree on the source and on how to read it. */
export const FX_API_URLS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
  "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
] as const;

export const FX_SOURCE = "fawazahmed0";

/** Reads the API's `{ usd: { ghs: 12.3, ... } }` payload (1 USD -> X) and
 * returns 1 X -> USD for each of `codes` it has a usable rate for. USD
 * itself is skipped (it's always 1). Anything malformed is left out rather
 * than stored as NaN or Infinity. */
export function parseUsdQuotes(json: unknown, codes: readonly string[]): Record<string, number> {
  const usd = (json as { usd?: unknown } | null)?.usd;
  if (!usd || typeof usd !== "object") throw new Error("Unexpected exchange rate API response");
  const quotes = usd as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const code of codes) {
    if (code === "USD") continue;
    const rate = quotes[code.toLowerCase()];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    out[code] = 1 / rate;
  }
  return out;
}
