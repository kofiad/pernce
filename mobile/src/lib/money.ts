import { currencyDecimals, formatMoneyCompact, fromMinor } from "@pernce/core";

/** One-character symbols the artboard writes before the number ("$18,444.82");
 * every other currency is written as its code ("GHS 4,250.00", "XOF 850,000.00"). */
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

type Opts = { signDisplay?: "auto" | "always" | "exceptZero" };

/** Artboard money format: "$3,120.40", "−GHS 42.50", "+$450.00". Negatives
 * use a true minus sign (−). */
export function fmtMajor(amount: number, currency: string, { signDisplay = "auto" }: Opts = {}) {
  const decimals = currencyDecimals(currency);
  const n = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const symbol = SYMBOL[currency];
  const body = symbol ? `${symbol}${n}` : `${currency} ${n}`;
  const isZero = Number(n.replace(/,/g, "")) === 0;
  if (amount < 0 && !isZero) return `−${body}`;
  if (amount > 0 && (signDisplay === "always" || signDisplay === "exceptZero")) return `+${body}`;
  if (isZero && signDisplay === "always") return `+${body}`;
  return body;
}

/** Display edge for stored minor units. */
export function fmtMinor(minor: number, currency: string, opts?: Opts) {
  return fmtMajor(fromMinor(minor, currency), currency, opts);
}

export const fmtCompact = formatMoneyCompact;

/** Code-first, for per-currency chips: "USD $16,533.55", "XOF 850,000.00". */
export function fmtWithCode(amount: number, currency: string) {
  const s = fmtMajor(amount, currency);
  return SYMBOL[currency] ? `${currency} ${s}` : s;
}

/** Whole amounts drop their decimals, as in the artboard's compact spots
 * ("$210 / $300", "$2,140"). */
export function fmtShort(amount: number, currency: string, opts?: Opts) {
  const s = fmtMajor(amount, currency, opts);
  return Math.round(amount * 100) % 100 === 0 ? s.replace(/\.0+$/, "") : s;
}

/** What's written before the number: "$", or the code and a space ("GHS "). */
export function currencyPrefix(currency: string) {
  return SYMBOL[currency] ?? `${currency} `;
}

/** The artboard's holdings chips: the code sits beside the chip's amount,
 * so only a symbol is kept ("$16,533.55", "850,000", "1,275.00"). */
export function fmtBare(amount: number, currency: string) {
  const s = fmtMajor(amount, currency);
  return SYMBOL[currency] ? s : s.replace(`${currency} `, "");
}

/** Chart value axes, short enough for a 40px gutter: "$1k", "$2.5k",
 * "−$500", "850k" (no symbol: the number alone). Given the gridlines'
 * `step`, keeps as many decimals as it takes to tell them apart
 * ("$20.2k", "$20.4k" rather than "$20k" twice). */
export function fmtAxis(amount: number, currency: string, step?: number) {
  const a = Math.abs(amount);
  const [unit, suffix, decimals] = a >= 1e6 ? [1e6, "M", a >= 1e7 ? 0 : 1] : a >= 1e3 ? [1e3, "k", a >= 1e4 ? 0 : 1] : [1, "", 0];
  let d = decimals;
  while (step && d < 3 && Math.abs(Math.round((step / unit) * 10 ** d) - (step / unit) * 10 ** d) > 1e-9) d++;
  const n = `${+(a / unit).toFixed(d)}${suffix}`;
  return `${amount < 0 ? "−" : ""}${SYMBOL[currency] ?? ""}${n}`;
}
