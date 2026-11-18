import { CURRENCIES, FEATURED_CURRENCIES } from "@pernce/core";
import type { Language } from "../data/preferences";
import { en, type Messages } from "./en";
import { fr } from "./fr";

/** The app's UI strings, in the phone's language. No React Native
 * imports, so it's tested in Node; screens get the current catalogue from
 * `useT()` (lib/i18n.ts).
 * Money keeps its artboard format in every language (lib/money.ts). */

export type { Messages };

export const MESSAGES: Record<Language, Messages> = { en, fr };

/** Core and the data layer throw English messages (they're shared with the
 * web app); this rewrites the ones a user can hit. Anything unknown stays
 * as it is. */
export function translateError(e: unknown, t: Messages): string {
  const message = e instanceof Error ? e.message : String(e);
  for (const [pattern, replacement] of t.errors) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** The platform's name for a currency in `locale`, or null where
 * Intl.DisplayNames is missing or doesn't know the code. */
function platformCurrencyName(code: string, locale: string): string | null {
  if (!displayNames.has(locale)) {
    try {
      displayNames.set(locale, new Intl.DisplayNames([locale], { type: "currency" }));
    } catch {
      displayNames.set(locale, null);
    }
  }
  try {
    const name = displayNames.get(locale)?.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** "US Dollar" / "Dollar américain": the catalogue's own name, else the
 * platform's in the catalogue's language, else core's English name, else
 * the code. */
export function currencyName(code: string, t: Messages) {
  return (
    t.currencies[code] ??
    platformCurrencyName(code, t.locale) ??
    CURRENCIES.find((c) => c.code === code)?.name ??
    code
  );
}

/** The picker's rows for `query` (matched on code or name): with no query
 * the featured currencies come first, then the rest by name. */
export function currencyRows(query: string, t: Messages): { code: string; name: string }[] {
  const q = query.trim().toLowerCase();
  const all = CURRENCIES.map((cur) => ({ code: cur.code as string, name: currencyName(cur.code, t) }));
  if (q) return all.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  const featured = FEATURED_CURRENCIES as readonly string[];
  const pinned = featured.map((code) => all.find((r) => r.code === code)!);
  const rest = all.filter((r) => !featured.includes(r.code)).sort((a, b) => a.name.localeCompare(b.name, t.locale));
  return [...pinned, ...rest];
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from `d` to today: 0 today, 1 yesterday. */
function daysAgo(d: Date, now = new Date()) {
  return Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
}

/** "Sep 14" / "14 sept.", with the year when it isn't this year. */
export function shortDate(d: Date, t: Messages, now = new Date()) {
  return new Intl.DateTimeFormat(t.locale, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  }).format(d);
}

/** "Today" / "Yesterday", or null for any other day. */
export function relativeDay(d: Date, t: Messages, now = new Date()) {
  const ago = daysAgo(d, now);
  return ago === 0 ? t.common.today : ago === 1 ? t.common.yesterday : null;
}

const parseISODate = (iso: string) => new Date(`${iso}T00:00:00`);

/** The date field: "Today, Sep 14" / "Yesterday, Sep 13" / "Sep 10". */
export function dateLabel(iso: string, t: Messages, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = parseISODate(iso);
  const rel = relativeDay(d, t, now);
  return rel ? `${rel}, ${shortDate(d, t, now)}` : shortDate(d, t, now);
}

/** Activity day headings: "Today · Sep 14" / "Sep 12". */
export function dayHeading(iso: string, t: Messages, now = new Date()) {
  const d = parseISODate(iso);
  const rel = relativeDay(d, t, now);
  return rel ? `${rel} · ${shortDate(d, t, now)}` : shortDate(d, t, now);
}

/** "September 2026" / "Septembre 2026". */
export function monthYear(d: Date, t: Messages) {
  return capitalize(new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric" }).format(d));
}

/** Chart axes: "Sep" / "sept.". */
export function monthShort(d: Date, t: Messages) {
  return new Intl.DateTimeFormat(t.locale, { month: "short" }).format(d);
}

/** "today at 06:00" / "Sep 12 at 06:00", for "Updated …". */
export function updatedAt(iso: string, t: Messages, now = new Date()) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const rel = relativeDay(d, t, now);
  return t.rates.updatedAt(rel ? rel.toLocaleLowerCase(t.locale) : shortDate(d, t, now), time);
}
