import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Local SQLite schema. Mirrors web/src/db/schema.ts, adapted for an
 * offline, sync-ready device database (docs/mobile-scope.md §3, §5):
 *
 * - Primary keys are UUIDs generated on the device.
 * - Money is INTEGER minor units in the row's own currency's precision
 *   (core `toMinor`/`fromMinor`); never REAL. Exchange rates are TEXT.
 * - Account balances are never stored: balance = opening_balance + the sum
 *   of core `balanceDeltas()` over the account's non-deleted transactions.
 * - Every user-data row has `updated_at` (an HLC string from core, sorts
 *   with a plain compare) and a `deleted` tombstone flag. Every read filters
 *   `deleted = 0`; see src/data/.
 * - No user_id columns: the database is one person's.
 *
 * After changing this file run `pnpm run db:generate` and commit the new
 * migration in drizzle/ plus the regenerated src/db/migrations.ts. */

const syncColumns = {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  /** HLC timestamp of the last write (core hlc.ts). */
  updatedAt: text("updated_at").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
};

/** One row: the person using this device. Mirrors the web `users` row's
 * name and base currency (no email/password; sign-in is a phase 3-4
 * concern). */
export const profile = sqliteTable("profile", {
  ...syncColumns,
  name: text("name").notNull().default(""),
  baseCurrency: text("base_currency").notNull().default("USD"),
  /** The avatar: a color token or "#rrggbb", and an icon (null: initials). */
  color: text("color").notNull().default("primary"),
  icon: text("icon"),
});

export const accounts = sqliteTable("accounts", {
  ...syncColumns,
  name: text("name").notNull(),
  type: text("type", { enum: ["bank", "mobile_money", "investment", "cash", "other"] }).notNull(),
  institution: text("institution"),
  currency: text("currency").notNull(),
  /** A color token or a custom "#rrggbb". */
  color: text("color").notNull().default("primary"),
  /** Null: the avatar shows the name's initials. */
  icon: text("icon"),
  /** Minor units. The web app's stored running `balance` has no equivalent
   * here: it's derived from this plus the ledger. May be negative. */
  openingBalance: integer("opening_balance").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

/** Per-user and editable (scope decision 2), seeded from core
 * DEFAULT_CATEGORIES with fresh UUIDs on first run. */
export const categories = sqliteTable(
  "categories",
  {
    ...syncColumns,
    name: text("name").notNull(),
    kind: text("kind", { enum: ["income", "expense"] }).notNull(),
    color: text("color").notNull(),
    icon: text("icon").notNull().default("more"),
    /** Expense categories only; null for income. */
    spendingType: text("spending_type", { enum: ["essential", "discretionary"] }),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("categories_sort_idx").on(t.kind, t.sortOrder)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    ...syncColumns,
    accountId: text("account_id").notNull(),
    categoryId: text("category_id"),
    /** Transfers: the account money moved into. Null otherwise. */
    transferAccountId: text("transfer_account_id"),
    type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
    /** Minor units of `currency`, always positive. For a transfer, what left
     * the source excluding `fee`. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    /** Transfers: minor units of `transfer_currency` the destination got. */
    transferAmount: integer("transfer_amount"),
    transferCurrency: text("transfer_currency"),
    /** Cross-currency transfers: 1 `currency` = this many
     * `transfer_currency`, as a decimal string. */
    exchangeRate: text("exchange_rate"),
    /** Transfers: minor units of `currency`, debited on top of `amount`. */
    fee: integer("fee").notNull().default(0),
    note: text("note"),
    /** "YYYY-MM-DD", local calendar date. */
    occurredAt: text("occurred_at").notNull(),
  },
  (t) => [
    index("transactions_occurred_idx").on(t.occurredAt),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_transfer_account_idx").on(t.transferAccountId),
    index("transactions_category_idx").on(t.categoryId),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    ...syncColumns,
    categoryId: text("category_id").notNull(),
    /** First of the month it applies to, "YYYY-MM-01". */
    period: text("period").notNull(),
    /** Minor units of `currency`. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    /** The budget's own look; null uses its category's color / icon. */
    color: text("color"),
    icon: text("icon"),
  },
  // One live budget per category and month. Partial, so a deleted budget's
  // tombstone doesn't block setting a new one.
  (t) => [uniqueIndex("budgets_category_period_idx").on(t.categoryId, t.period).where(sql`deleted = 0`)],
);

/** Fetched market rates: 1 unit of `currency` = `rate_to_usd` USD. Not user
 * data (every device fetches the same public numbers), so not synced and
 * no HLC/tombstone. */
export const fxRates = sqliteTable("fx_rates", {
  currency: text("currency").primaryKey(),
  rateToUsd: text("rate_to_usd").notNull(),
  source: text("source").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

/** The user's hand-set rates; these win over fx_rates. User data, so they
 * sync like everything else (the `rate_override` collection in §5.1). */
export const rateOverrides = sqliteTable(
  "rate_overrides",
  {
    ...syncColumns,
    currency: text("currency").notNull(),
    rateToUsd: text("rate_to_usd").notNull(),
  },
  (t) => [uniqueIndex("rate_overrides_currency_idx").on(t.currency).where(sql`deleted = 0`)],
);

/** Device-local key/value settings that never sync: this device's HLC node
 * id and last timestamp, app lock preference, onboarding state. */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Profile = typeof profile.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type RateOverride = typeof rateOverrides.$inferSelect;
