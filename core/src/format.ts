import { currencyDecimals } from "./money";

/** "YYYY-MM-DD" for the calendar date `d` falls on in local time. Not
 * toISOString(), which converts to UTC first: anywhere east of UTC, local
 * midnight on the 1st is still the previous day in UTC, so month-start
 * dates came out as e.g. "2026-08-31" and budget/month lookups missed. */
export function toLocalISODate(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Like formatMoney, but in the currency's own precision
 * (currencyDecimals), which is how the mobile app stores and shows money. */
export function formatAmount(amount: number, currency: string, { signDisplay }: { signDisplay?: "auto" | "always" | "exceptZero" } = {}) {
  const decimals = currencyDecimals(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: currency === "XOF" || currency === "XAF" ? "code" : "symbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay,
    }).format(amount);
  } catch {
    const sign = signDisplay && signDisplay !== "auto" && amount > 0 ? "+" : "";
    return `${sign}${currency} ${amount.toFixed(decimals)}`;
  }
}

export function formatMoney(amount: number | string, currency: string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: currency === "XOF" || currency === "XAF" ? "code" : "symbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Same amount, but always rendered with the currency code prefix (used in
 * contexts where several currencies sit side by side and the symbol alone
 * would be ambiguous, e.g. "$" for both USD and CAD). */
export function formatMoneyWithCode(amount: number | string, currency: string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(n: number, digits = 0) {
  return `${n.toFixed(digits)}%`;
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = {}) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...opts,
  }).format(date);
}

export function relativeDateLabel(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round(
    (startOfDay(today).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return formatDate(date, { weekday: "long" });
  return formatDate(date, { year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

export function monthLabel(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

/** Short form for chart axes and tight labels, e.g. "$1.2K", "GH₵35K". */
export function formatMoneyCompact(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: currency === "XOF" || currency === "XAF" ? "code" : "symbol",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}
