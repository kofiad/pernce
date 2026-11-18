import { CURRENCIES, legacyMinorFactor, type SyncCollection } from "@pernce/core";
import { accounts, budgets, categories, profile, rateOverrides, transactions } from "../db/schema";
import { validateAccountInput } from "../data/accounts";
import { assertPeriod } from "../data/budgets";
import { normalizeCategory } from "../data/categories";
import type { DB } from "../data/db";
import { checkColor, checkColorOrNull, checkIconOrNull } from "../data/look";
import { isSupportedCurrency } from "../data/profile";
import { checkStoredTransaction } from "../data/transactions";

/** How each synced table travels. A record's plaintext envelope (id, HLC,
 * tombstone) comes from the row's `id`, `updated_at` and `deleted`; every
 * other column goes into the encrypted payload as JSON.
 *
 * Pulled payloads are untrusted input (another device, or a server that
 * swapped nothing it could read but might still misbehave), so each
 * collection checks its payload with the same rules as a local write
 * before it touches the database. */

/** The columns besides the sync envelope. */
type Payload<T> = Omit<T, "id" | "updatedAt" | "deleted">;

export type CollectionDef = {
  collection: SyncCollection;
  table: typeof profile | typeof accounts | typeof categories | typeof transactions | typeof budgets | typeof rateOverrides;
  /** Throws if `raw` isn't a valid row; returns the columns to store. */
  parse(db: DB, raw: unknown): Record<string, unknown>;
};

type Raw = Record<string, unknown>;

function object(raw: unknown): Raw {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Payload isn't an object");
  return raw as Raw;
}

const str = (r: Raw, k: string): string => {
  if (typeof r[k] !== "string") throw new Error(`${k} must be text`);
  return r[k] as string;
};
const strOrNull = (r: Raw, k: string): string | null => (r[k] === null || r[k] === undefined ? null : str(r, k));
const int = (r: Raw, k: string): number => {
  if (!Number.isSafeInteger(r[k])) throw new Error(`${k} must be a whole number`);
  return r[k] as number;
};
const bool = (r: Raw, k: string): boolean => {
  if (typeof r[k] !== "boolean") throw new Error(`${k} must be true or false`);
  return r[k] as boolean;
};

const currency = (r: Raw, k: string) => {
  const c = str(r, k);
  if (!isSupportedCurrency(c)) throw new Error(`Unsupported currency "${c}"`);
  return c;
};

const createdAt = (r: Raw) => ({ createdAt: str(r, "createdAt") });

/** Payloads from builds before XOF and XAF had 2 decimals hold whole
 * francs; toPayload marks newer ones. Reads the amount at `k` in today's
 * minor units of `cur`. */
const money = (r: Raw, k: string, cur: string | null) => (r.cfaCentimes === true ? 1 : legacyMinorFactor(cur)) * int(r, k);
const moneyOrNull = (r: Raw, k: string, cur: string | null) => (r[k] === null || r[k] === undefined ? null : money(r, k, cur));

const CODES = new Set<string>(CURRENCIES.map((c) => c.code));

/** In dependency order: a page of pulled records is applied in this order,
 * so a transaction can see the account it names when both arrive together. */
export const COLLECTIONS: CollectionDef[] = [
  {
    collection: "profile",
    table: profile,
    parse(_db, raw): Payload<typeof profile.$inferSelect> {
      const r = object(raw);
      return {
        ...createdAt(r),
        name: str(r, "name").trim(),
        baseCurrency: currency(r, "baseCurrency"),
        // Payloads from builds before the avatar look have neither field.
        color: r.color === undefined ? "primary" : checkColor(str(r, "color")),
        icon: checkIconOrNull(strOrNull(r, "icon")),
      };
    },
  },
  {
    collection: "category",
    table: categories,
    parse(_db, raw): Payload<typeof categories.$inferSelect> {
      const r = object(raw);
      const values = normalizeCategory({
        name: str(r, "name"),
        kind: str(r, "kind") as "income" | "expense",
        color: str(r, "color"),
        icon: str(r, "icon"),
        spendingType: strOrNull(r, "spendingType") as "essential" | "discretionary" | null,
      });
      return { ...createdAt(r), ...values, sortOrder: int(r, "sortOrder"), archived: bool(r, "archived") };
    },
  },
  {
    collection: "account",
    table: accounts,
    parse(_db, raw): Payload<typeof accounts.$inferSelect> {
      const r = object(raw);
      const values = validateAccountInput({
        name: str(r, "name"),
        type: str(r, "type") as typeof accounts.$inferSelect.type,
        institution: strOrNull(r, "institution"),
        currency: str(r, "currency"),
        color: str(r, "color"),
        icon: strOrNull(r, "icon"),
        openingBalance: money(r, "openingBalance", str(r, "currency")),
      });
      return { ...createdAt(r), ...values, archived: bool(r, "archived") };
    },
  },
  {
    collection: "rate_override",
    table: rateOverrides,
    parse(_db, raw): Payload<typeof rateOverrides.$inferSelect> {
      const r = object(raw);
      const c = str(r, "currency");
      if (c === "USD" || !CODES.has(c)) throw new Error(`Unsupported currency "${c}"`);
      const rate = str(r, "rateToUsd");
      const n = Number(rate);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Rate must be a positive number");
      return { ...createdAt(r), currency: c, rateToUsd: rate };
    },
  },
  {
    collection: "budget",
    table: budgets,
    parse(_db, raw): Payload<typeof budgets.$inferSelect> {
      const r = object(raw);
      const period = str(r, "period");
      assertPeriod(period);
      const cur = currency(r, "currency");
      const amount = money(r, "amount", cur);
      if (amount <= 0) throw new Error("Amount must be a positive number");
      return {
        ...createdAt(r),
        categoryId: str(r, "categoryId"),
        period,
        amount,
        currency: cur,
        color: checkColorOrNull(strOrNull(r, "color")),
        icon: checkIconOrNull(strOrNull(r, "icon")),
      };
    },
  },
  {
    collection: "transaction",
    table: transactions,
    parse(db, raw): Payload<typeof transactions.$inferSelect> {
      const r = object(raw);
      const cur = currency(r, "currency");
      const transferCurrency = strOrNull(r, "transferCurrency");
      const row = {
        accountId: str(r, "accountId"),
        categoryId: strOrNull(r, "categoryId"),
        transferAccountId: strOrNull(r, "transferAccountId"),
        type: str(r, "type") as typeof transactions.$inferSelect.type,
        amount: money(r, "amount", cur),
        currency: cur,
        transferAmount: moneyOrNull(r, "transferAmount", transferCurrency),
        transferCurrency,
        exchangeRate: strOrNull(r, "exchangeRate"),
        fee: money(r, "fee", cur),
        note: strOrNull(r, "note"),
        occurredAt: str(r, "occurredAt"),
      };
      if (row.transferCurrency !== null && !isSupportedCurrency(row.transferCurrency)) {
        throw new Error(`Unsupported currency "${row.transferCurrency}"`);
      }
      checkStoredTransaction(db, row);
      return { ...createdAt(r), ...row };
    },
  },
];

export const COLLECTION_BY_NAME = new Map(COLLECTIONS.map((d) => [d.collection, d]));

/** What goes into a record's ciphertext. `cfaCentimes` says its XOF/XAF
 * amounts are already in centimes (see `money`). */
export function toPayload(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, updatedAt: _updatedAt, deleted: _deleted, ...rest } = row;
  return { ...rest, cfaCentimes: true };
}
