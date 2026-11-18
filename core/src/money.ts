/** Decimal places per currency. Every supported currency has 2, the CFA
 * francs included: they have no subunit in ISO 4217, but people track
 * fractional francs (fees, interest, conversions), so the app keeps
 * centimes. Anything not listed uses 2.
 *
 * Both apps store money as integer minor units in this precision (toMinor);
 * the web UI still formats everything with two decimals (see
 * docs/mobile-scope.md, §9 decision 5). */
const CURRENCY_DECIMALS: Record<string, number> = {};

/** Until 2026.10.5 XOF and XAF had 0 decimals, so data written before then
 * (a device database, a sync payload, a mobile backup) holds whole francs.
 * Multiply such a stored amount by this to get today's minor units. */
export function legacyMinorFactor(currency: string | null): number {
  return currency === "XOF" || currency === "XAF" ? 100 : 1;
}

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

/** Rounds to cents. */
export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Rounds to the currency's own precision, e.g. 1234.567 XOF -> 1234.57. */
export function roundToCurrency(n: number, currency: string) {
  return fromMinor(toMinor(n, currency), currency);
}

/** Major units (e.g. 12.34, or "12.34" from an old backup) to integer minor
 * units in the currency's own precision (1234 for USD and for XOF). SQLite
 * has no exact decimal type, so both apps store money this way instead of
 * as REAL, which would drift. */
export function toMinor(amount: number | string, currency: string): number {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) throw new Error(`Not a valid amount: ${amount}`);
  const minor = Math.round(n * 10 ** currencyDecimals(currency));
  // Math.round(-0.4) is -0; keep zero unsigned so it compares and stores cleanly.
  return minor === 0 ? 0 : minor;
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyDecimals(currency);
}

/** Keeps what the user is typing into an amount field valid for the
 * currency as they type: digits and one decimal point, at most
 * currencyDecimals(currency) places, commas dropped. Used on
 * every keystroke, so it trims rather than rejects. */
export function sanitizeAmountInput(
  text: string,
  currency: string,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): string {
  const decimals = currencyDecimals(currency);
  const sign = allowNegative && text.trim().startsWith("-") ? "-" : "";
  const cleaned = text.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return sign + cleaned;
  if (decimals === 0) return sign + cleaned.slice(0, dot);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
  return `${sign}${cleaned.slice(0, dot)}.${fraction}`;
}

/** Parses a finished amount field into integer minor units. Returns an
 * error message instead of throwing so forms can show it inline. Rejects
 * more decimal places than the currency has rather than rounding them away
 * silently. */
export function parseAmountInput(
  text: string,
  currency: string,
  { allowZero = false, allowNegative = false }: { allowZero?: boolean; allowNegative?: boolean } = {},
): { minor: number; error: null } | { minor: null; error: string } {
  const trimmed = text.trim().replace(/,/g, "");
  if (trimmed === "") return { minor: null, error: "Enter an amount" };
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  if (!pattern.test(trimmed) || !/\d/.test(trimmed)) return { minor: null, error: "Not a valid amount" };
  const decimals = currencyDecimals(currency);
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    return {
      minor: null,
      error: decimals === 0 ? `${currency} has no decimal places` : `${currency} allows at most ${decimals} decimal places`,
    };
  }
  const minor = toMinor(trimmed, currency);
  if (minor === 0 && !allowZero) return { minor: null, error: "Amount must be a positive number" };
  if (minor < 0 && !allowNegative) return { minor: null, error: "Amount must be a positive number" };
  return { minor, error: null };
}

/** Minor units back to the plain string an amount field shows when editing
 * (no grouping, no symbol), e.g. 123450 USD -> "1234.5", 150000 XOF -> "1500". */
export function minorToInput(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  const s = fromMinor(minor, currency).toFixed(decimals);
  return decimals === 0 ? s : s.replace(/\.?0+$/, "");
}
