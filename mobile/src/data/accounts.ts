import { and, asc, eq, or, sql } from "drizzle-orm";
import { ACCOUNT_TYPES, balanceDeltas } from "@pernce/core";
import { accounts, transactions, type Account } from "../db/schema";
import { notifyChange } from "./changes";
import type { DB } from "./db";
import { newId } from "./ids";
import { checkColor, checkIconOrNull } from "./look";
import { newRowStamps, stamp } from "./meta";
import { isSupportedCurrency } from "./profile";

export type AccountType = Account["type"];
export type AccountWithBalance = Account & { balance: number };

/** Every account's ledger total in minor units of its own currency,
 * excluding the opening balance.
 *
 * One grouped query sums the ledger per (account, destination, type), and
 * core balanceDeltas() turns each group into balance movements. Because
 * balanceDeltas is linear in amount, fee and transfer_amount, applying it
 * to a group's sums gives exactly the same result as applying it to each
 * transaction and adding up, so this *is* "the sum of balanceDeltas() over
 * the account's non-deleted transactions", in integer minor units. */
export function ledgerTotals(db: DB, accountId?: string): Map<string, number> {
  if (accountId) return computeLedgerTotals(db, accountId);
  // The all-accounts scan reads the whole ledger and a screen asks for it
  // several times per refresh (accounts, net worth, charts), so it's kept
  // until anything is written. total_changes() counts every row this
  // connection has changed, inside a transaction too, so a stale total can't
  // be served. Slow on web, where each query crosses to the SQLite worker.
  // Drivers return a raw row as an object or as an array of values.
  const row = db.get<{ n: number } | [number]>(sql`select total_changes() as n`);
  const changes = Array.isArray(row) ? row[0] : row?.n;
  const hit = ledgerCache.get(db);
  if (hit && hit.changes === changes) return hit.totals;
  const totals = computeLedgerTotals(db);
  if (changes !== undefined) ledgerCache.set(db, { changes, totals });
  return totals;
}

const ledgerCache = new WeakMap<object, { changes: number; totals: Map<string, number> }>();

function computeLedgerTotals(db: DB, accountId?: string): Map<string, number> {
  const rows = db
    .select({
      accountId: transactions.accountId,
      transferAccountId: transactions.transferAccountId,
      type: transactions.type,
      amount: sql<number>`sum(${transactions.amount})`,
      fee: sql<number>`sum(${transactions.fee})`,
      // null when every row in the group is null (income/expense)
      transferAmount: sql<number | null>`sum(${transactions.transferAmount})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.deleted, false),
        accountId
          ? or(eq(transactions.accountId, accountId), eq(transactions.transferAccountId, accountId))
          : undefined,
      ),
    )
    .groupBy(transactions.accountId, transactions.transferAccountId, transactions.type)
    .all();

  const totals = new Map<string, number>();
  for (const r of rows) {
    for (const d of balanceDeltas(r)) {
      totals.set(d.accountId, (totals.get(d.accountId) ?? 0) + d.delta);
    }
  }
  return totals;
}

function withBalances(rows: Account[], totals: Map<string, number>): AccountWithBalance[] {
  return rows.map((a) => ({ ...a, balance: a.openingBalance + (totals.get(a.id) ?? 0) }));
}

export function listAccounts(db: DB, { includeArchived = false }: { includeArchived?: boolean } = {}) {
  const rows = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.deleted, false), includeArchived ? undefined : eq(accounts.archived, false)))
    .orderBy(asc(accounts.archived), asc(accounts.createdAt), asc(accounts.id))
    .all();
  return withBalances(rows, ledgerTotals(db));
}

export function getAccount(db: DB, id: string): Account | null {
  return db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.deleted, false))).get() ?? null;
}

export function getAccountWithBalance(db: DB, id: string): AccountWithBalance | null {
  const a = getAccount(db, id);
  return a ? withBalances([a], ledgerTotals(db, id))[0] : null;
}

export type AccountInput = {
  name: string;
  type: AccountType;
  institution?: string | null;
  currency: string;
  color: string;
  /** Null or omitted: the avatar shows the name's initials. */
  icon?: string | null;
  /** Minor units of `currency`; may be negative (e.g. a card in debt). */
  openingBalance: number;
};

/** Account rules, shared by local writes and rows pulled by sync. Returns
 * the normalized columns or throws. */
export function validateAccountInput(input: AccountInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  if (!ACCOUNT_TYPES.some((t) => t.value === input.type)) throw new Error(`Unknown account type "${input.type}"`);
  if (!isSupportedCurrency(input.currency)) throw new Error(`Unsupported currency "${input.currency}"`);
  if (!Number.isSafeInteger(input.openingBalance)) throw new Error("Opening balance must be a whole number of minor units");
  return {
    name,
    type: input.type,
    institution: input.institution?.trim() || null,
    currency: input.currency,
    color: checkColor(input.color),
    icon: checkIconOrNull(input.icon),
    openingBalance: input.openingBalance,
  };
}

export function createAccount(db: DB, input: AccountInput): string {
  const values = validateAccountInput(input);
  const id = newId();
  db.insert(accounts)
    .values({ id, ...newRowStamps(db), ...values })
    .run();
  notifyChange();
  return id;
}

export function accountHasTransactions(db: DB, id: string) {
  return !!db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.deleted, false),
        or(eq(transactions.accountId, id), eq(transactions.transferAccountId, id)),
      ),
    )
    .limit(1)
    .get();
}

export function updateAccount(db: DB, id: string, input: AccountInput) {
  const existing = getAccount(db, id);
  if (!existing) throw new Error("Account not found");
  const values = validateAccountInput(input);
  // Transactions are stored in the account's currency; switching it would
  // reinterpret every amount on it.
  if (values.currency !== existing.currency && accountHasTransactions(db, id)) {
    throw new Error("Can't change the currency of an account that has transactions");
  }
  db.update(accounts)
    .set({ ...values, updatedAt: stamp(db) })
    .where(eq(accounts.id, id))
    .run();
  notifyChange();
}

/** Archived accounts leave pickers and net worth but keep their history. */
export function setAccountArchived(db: DB, id: string, archived: boolean) {
  if (!getAccount(db, id)) throw new Error("Account not found");
  db.update(accounts).set({ archived, updatedAt: stamp(db) }).where(eq(accounts.id, id)).run();
  notifyChange();
}
