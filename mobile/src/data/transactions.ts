import { and, count, desc, eq, gte, like, lt, or, type SQL } from "drizzle-orm";
import {
  fromMinor,
  needsTransferDestination,
  resolveTransactionInput,
  roundToCurrency,
  toMinor,
  type TransactionType,
} from "@pernce/core";
import { transactions, type Transaction } from "../db/schema";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";
import { notifyChange } from "./changes";
import type { DB } from "./db";
import { newId } from "./ids";
import { newRowStamps, stamp } from "./meta";

/** A transaction as the app hands it to the data layer. Money is minor
 * units: `amount` and `fee` in the source account's currency,
 * `transferAmount` in the destination's. */
export type TransactionDraft = {
  type: TransactionType;
  accountId: string;
  categoryId?: string | null;
  transferAccountId?: string | null;
  amount: number;
  /** Defaults to the source account's currency. Given explicitly by
   * imports, so a mismatch is rejected rather than silently relabelled. */
  currency?: string;
  /** Transfers only: what the destination received, minor units of its
   * currency. For cross-currency transfers give this or `exchangeRate`. */
  transferAmount?: number | null;
  /** Transfers only: 1 source unit = this many destination units. */
  exchangeRate?: number | null;
  /** Transfers only: minor units of the source currency. */
  fee?: number | null;
  note?: string | null;
  /** "YYYY-MM-DD" */
  occurredAt: string;
};

export function isISODate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Validates a draft with core resolveTransactionInput (the web app's
 * rules and messages) and returns the columns to store. Core works in
 * major units, so minor units are converted just for that call and back;
 * a derived amount received is rounded to the destination currency's own
 * precision. */
export function resolveDraft(db: DB, draft: TransactionDraft) {
  const source = getAccount(db, draft.accountId);
  const dest =
    needsTransferDestination(draft) && draft.transferAccountId ? getAccount(db, draft.transferAccountId) : null;
  const currency = draft.currency ?? source?.currency ?? "";

  for (const [label, v] of [
    ["Amount", draft.amount],
    ["Fee", draft.fee],
    ["Amount received", draft.transferAmount],
  ] as const) {
    if (v !== null && v !== undefined && !Number.isSafeInteger(v)) throw new Error(`${label} must be in minor units`);
  }
  if (!isISODate(draft.occurredAt)) throw new Error("Date must be a valid YYYY-MM-DD date");
  if (draft.categoryId && draft.type !== "transfer") {
    const category = getCategory(db, draft.categoryId);
    if (!category) throw new Error("Category not found");
    if (category.kind !== draft.type) throw new Error(`"${category.name}" is an ${category.kind} category`);
  }

  const resolved = resolveTransactionInput(
    {
      type: draft.type,
      accountId: draft.accountId,
      categoryId: draft.categoryId ?? null,
      transferAccountId: draft.transferAccountId ?? null,
      amount: fromMinor(draft.amount, currency),
      currency,
      transferAmount:
        draft.transferAmount != null && dest ? fromMinor(draft.transferAmount, dest.currency) : null,
      exchangeRate: draft.exchangeRate ?? null,
      fee: draft.fee != null ? fromMinor(draft.fee, currency) : null,
      note: draft.note?.trim() || null,
      occurredAt: draft.occurredAt,
    },
    source,
    dest,
    { round: roundToCurrency },
  );

  return {
    accountId: resolved.accountId,
    categoryId: resolved.categoryId,
    transferAccountId: resolved.transferAccountId,
    type: resolved.type,
    amount: toMinor(resolved.amount, resolved.currency),
    currency: resolved.currency,
    transferAmount:
      resolved.transferAmount !== null && resolved.transferCurrency
        ? toMinor(resolved.transferAmount, resolved.transferCurrency)
        : null,
    transferCurrency: resolved.transferCurrency,
    exchangeRate: resolved.exchangeRate !== null ? String(resolved.exchangeRate) : null,
    fee: toMinor(resolved.fee, resolved.currency),
    note: resolved.note,
    occurredAt: resolved.occurredAt,
  };
}

export type StoredTransaction = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deleted">;

/** Checks a stored row that didn't come through resolveDraft (one pulled
 * by sync) with the same core rules: it must be exactly what
 * resolveTransactionInput would have stored. An account that isn't on this
 * device yet (it may arrive later in the same sync) is taken to be in the
 * currency the row names. Throws with the core message if not. */
export function checkStoredTransaction(db: DB, row: StoredTransaction) {
  if (row.type !== "income" && row.type !== "expense" && row.type !== "transfer") {
    throw new Error(`Unknown transaction type "${row.type}"`);
  }
  for (const [label, v] of [
    ["Amount", row.amount],
    ["Fee", row.fee],
    ["Amount received", row.transferAmount],
  ] as const) {
    if (v !== null && !Number.isSafeInteger(v)) throw new Error(`${label} must be in minor units`);
  }
  if (!isISODate(row.occurredAt)) throw new Error("Date must be a valid YYYY-MM-DD date");
  if (row.type === "transfer" ? row.categoryId !== null : row.transferAccountId !== null) {
    throw new Error("Only transfers have a destination, and transfers have no category");
  }
  if (row.categoryId) {
    const category = getCategory(db, row.categoryId);
    if (category && category.kind !== row.type) throw new Error(`"${category.name}" is an ${category.kind} category`);
  }

  const source = getAccount(db, row.accountId) ?? { id: row.accountId, currency: row.currency };
  const dest = row.transferAccountId
    ? (getAccount(db, row.transferAccountId) ?? { id: row.transferAccountId, currency: row.transferCurrency ?? "" })
    : null;
  const rate = row.exchangeRate === null ? null : Number(row.exchangeRate);
  const resolved = resolveTransactionInput(
    {
      type: row.type,
      accountId: row.accountId,
      categoryId: row.categoryId,
      transferAccountId: row.transferAccountId,
      amount: fromMinor(row.amount, row.currency),
      currency: row.currency,
      transferAmount:
        row.transferAmount !== null && row.transferCurrency ? fromMinor(row.transferAmount, row.transferCurrency) : null,
      exchangeRate: rate,
      fee: fromMinor(row.fee, row.currency),
      note: row.note,
      occurredAt: row.occurredAt,
    },
    source,
    dest,
    { round: roundToCurrency },
  );
  const transferAmount =
    resolved.transferAmount !== null && resolved.transferCurrency
      ? toMinor(resolved.transferAmount, resolved.transferCurrency)
      : null;
  if (
    resolved.transferCurrency !== row.transferCurrency ||
    transferAmount !== row.transferAmount ||
    (resolved.exchangeRate === null) !== (row.exchangeRate === null) ||
    toMinor(resolved.fee, resolved.currency) !== row.fee
  ) {
    throw new Error("Transfer amounts don't match the accounts' currencies");
  }
}

export function createTransaction(db: DB, draft: TransactionDraft): string {
  const values = resolveDraft(db, draft);
  const id = newId();
  db.insert(transactions)
    .values({ id, ...newRowStamps(db), ...values })
    .run();
  notifyChange();
  return id;
}

export function updateTransaction(db: DB, id: string, draft: TransactionDraft) {
  if (!getTransaction(db, id)) throw new Error("Transaction not found");
  const values = resolveDraft(db, draft);
  db.update(transactions)
    .set({ ...values, updatedAt: stamp(db) })
    .where(eq(transactions.id, id))
    .run();
  notifyChange();
}

/** Soft delete: the row stays as a tombstone for sync, and every read
 * (including balances) ignores it. */
export function deleteTransaction(db: DB, id: string) {
  if (!getTransaction(db, id)) throw new Error("Transaction not found");
  db.update(transactions).set({ deleted: true, updatedAt: stamp(db) }).where(eq(transactions.id, id)).run();
  notifyChange();
}

export function getTransaction(db: DB, id: string): Transaction | null {
  return db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.deleted, false))).get() ?? null;
}

export type TransactionFilters = {
  /** Matches either side of a transfer. */
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  /** Matches either side of a transfer. */
  currency?: string;
  /** Inclusive "YYYY-MM-DD". */
  from?: string;
  /** Exclusive "YYYY-MM-DD". */
  to?: string;
  /** Case-insensitive match on the note. */
  search?: string;
  limit?: number;
  offset?: number;
};

/** Newest first; id breaks ties, so every device lists the same rows in
 * the same order. */
export function listTransactions(db: DB, f: TransactionFilters = {}): Transaction[] {
  const conditions: (SQL | undefined)[] = [eq(transactions.deleted, false)];
  if (f.accountId) {
    conditions.push(or(eq(transactions.accountId, f.accountId), eq(transactions.transferAccountId, f.accountId)));
  }
  if (f.categoryId) conditions.push(eq(transactions.categoryId, f.categoryId));
  if (f.type) conditions.push(eq(transactions.type, f.type));
  if (f.currency) {
    conditions.push(or(eq(transactions.currency, f.currency), eq(transactions.transferCurrency, f.currency)));
  }
  if (f.from) conditions.push(gte(transactions.occurredAt, f.from));
  if (f.to) conditions.push(lt(transactions.occurredAt, f.to));
  // SQLite's LIKE is case-insensitive for ASCII.
  if (f.search?.trim()) conditions.push(like(transactions.note, `%${f.search.trim().replace(/[%_]/g, "")}%`));

  const q = db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt), desc(transactions.id))
    .limit(f.limit ?? -1)
    .offset(f.offset ?? 0);
  return q.all();
}

/** How many live transactions there are (the CSV export's row count). */
export function countTransactions(db: DB): number {
  return db.select({ n: count() }).from(transactions).where(eq(transactions.deleted, false)).get()?.n ?? 0;
}
