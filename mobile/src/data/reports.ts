import { and, eq, gte, lt, or, sql } from "drizzle-orm";
import {
  balanceDeltas,
  categorySpend,
  fromMinor,
  monthEnd,
  monthStart,
  monthlySeries,
  netWorthTrend,
  summarizeNetWorth,
  toBaseCurrency,
  toLocalISODate,
  type MonthlyRow,
  type SpendRow,
} from "@pernce/core";
import { transactions } from "../db/schema";
import { getAccountWithBalance, listAccounts } from "./accounts";
import { listCategories } from "./categories";
import type { DB } from "./db";
import { baseCurrencyOf } from "./profile";
import { getRatesMap } from "./rates";

/** SQLite grouped queries feeding core's report math. Sums are exact
 * integer minor units per currency; they're converted to major units only
 * here, where core needs to mix currencies. Results are major-unit numbers
 * for display. */

/** Expense totals by category and currency for [from, to). */
export function spendRows(db: DB, from: string, to: string): SpendRow[] {
  return db
    .select({
      categoryId: transactions.categoryId,
      currency: transactions.currency,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.deleted, false),
        eq(transactions.type, "expense"),
        gte(transactions.occurredAt, from),
        lt(transactions.occurredAt, to),
      ),
    )
    .groupBy(transactions.categoryId, transactions.currency)
    .all()
    .map((r) => ({ ...r, total: fromMinor(r.total, r.currency) }));
}

/** Month bounds as "YYYY-MM-DD" strings: [first of month, first of next). */
export function monthRange(month: Date) {
  return { from: toLocalISODate(monthStart(month)), to: toLocalISODate(monthEnd(month)) };
}

/** Net worth across non-archived accounts, like the web dashboard. */
export function netWorth(db: DB) {
  const accs = listAccounts(db);
  return summarizeNetWorth(
    accs.map((a) => ({ currency: a.currency, balance: fromMinor(a.balance, a.currency) })),
    baseCurrencyOf(db),
    getRatesMap(db),
  );
}

export function categorySpendForRange(db: DB, from: string, to: string) {
  return categorySpend(
    spendRows(db, from, to),
    listCategories(db, { includeArchived: true }),
    baseCurrencyOf(db),
    getRatesMap(db),
  );
}

/** Spend split into essentials / discretionary / unclassified, in the base
 * currency. */
export function spendingTypeSplit(db: DB, from: string, to: string) {
  const split = { essential: 0, discretionary: 0, other: 0 };
  for (const e of categorySpendForRange(db, from, to)) {
    const t = e.category?.spendingType;
    split[t === "essential" ? "essential" : t === "discretionary" ? "discretionary" : "other"] += e.amountBase;
  }
  return split;
}

/** Income vs expense per month (transfer fees count as expense), oldest
 * first, `months` months ending with the one `now` is in. */
export function monthlySeriesFor(db: DB, months = 6, now: Date = new Date()) {
  const rangeStart = toLocalISODate(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
  const rangeEnd = toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const month = sql<string>`substr(${transactions.occurredAt}, 1, 7)`;
  const rows = db
    .select({
      month,
      type: transactions.type,
      currency: transactions.currency,
      total: sql<number>`sum(${transactions.amount})`,
      fees: sql<number>`sum(${transactions.fee})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.deleted, false),
        gte(transactions.occurredAt, rangeStart),
        lt(transactions.occurredAt, rangeEnd),
      ),
    )
    .groupBy(month, transactions.type, transactions.currency)
    .all();
  const majorRows: MonthlyRow[] = rows.map((r) => ({
    ...r,
    total: fromMinor(r.total, r.currency),
    fees: fromMinor(r.fees, r.currency),
  }));
  return monthlySeries(majorRows, months, baseCurrencyOf(db), getRatesMap(db), now);
}

export function netWorthTrendFor(db: DB, months = 6, now: Date = new Date()) {
  return netWorthTrend(monthlySeriesFor(db, months, now), netWorth(db).totalBase);
}

/** Income and spend per day in the base currency (transfer fees count as
 * spend), keyed "YYYY-MM-DD", for days on or after `from`. */
function dailyFlows(db: DB, from: string) {
  const day = sql<string>`substr(${transactions.occurredAt}, 1, 10)`;
  const rows = db
    .select({
      day,
      type: transactions.type,
      currency: transactions.currency,
      total: sql<number>`sum(${transactions.amount})`,
      fees: sql<number>`sum(${transactions.fee})`,
    })
    .from(transactions)
    .where(and(eq(transactions.deleted, false), gte(transactions.occurredAt, from)))
    .groupBy(day, transactions.type, transactions.currency)
    .all();
  const base = baseCurrencyOf(db);
  const rates = getRatesMap(db);
  const out = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const conv = (minor: number) => toBaseCurrency(fromMinor(minor, r.currency), r.currency, base, rates);
    const bucket = out.get(r.day) ?? { income: 0, expense: 0 };
    if (r.type === "income") bucket.income += conv(r.total);
    if (r.type === "expense") bucket.expense += conv(r.total);
    if (r.type === "transfer") bucket.expense += conv(r.fees);
    out.set(r.day, bucket);
  }
  return out;
}

/** "This month", day by day from the 1st through `now`'s day: running
 * totals of money in and out, and net worth at the end of each day (walked
 * back from the current total, like netWorthTrend, through every later
 * day's net, future-dated ones included). */
export function monthToDateFor(db: DB, now: Date = new Date()) {
  const days = Array.from({ length: now.getDate() }, (_, i) => toLocalISODate(new Date(now.getFullYear(), now.getMonth(), i + 1)));
  const flows = dailyFlows(db, days[0]);
  let income = 0;
  let expense = 0;
  const points = days.map((d) => {
    const f = flows.get(d);
    income += f?.income ?? 0;
    expense += f?.expense ?? 0;
    return { day: d, income, expense };
  });
  let later = 0;
  for (const [d, f] of flows) if (d > days[days.length - 1]) later += f.income - f.expense;
  let back = netWorth(db).totalBase - later;
  const netWorthByDay: number[] = [];
  for (let i = days.length - 1; i >= 0; i--) {
    netWorthByDay[i] = back;
    const f = flows.get(days[i]);
    back -= (f?.income ?? 0) - (f?.expense ?? 0);
  }
  return points.map((p, i) => ({ ...p, netWorth: netWorthByDay[i] }));
}

/** Income and spend (transfer fees count as spend) in the base currency
 * for [from, to); either bound may be open. */
/** Money in and out over [from, to) in the base currency; transfer fees
 * count as out. Given a category, only its income or expenses. */
export function incomeExpenseForRange(db: DB, from?: string, to?: string, categoryId?: string) {
  const rows = db
    .select({
      type: transactions.type,
      currency: transactions.currency,
      total: sql<number>`sum(${transactions.amount})`,
      fees: sql<number>`sum(${transactions.fee})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.deleted, false),
        from ? gte(transactions.occurredAt, from) : undefined,
        to ? lt(transactions.occurredAt, to) : undefined,
        categoryId ? eq(transactions.categoryId, categoryId) : undefined,
      ),
    )
    .groupBy(transactions.type, transactions.currency)
    .all();
  const base = baseCurrencyOf(db);
  const rates = getRatesMap(db);
  const out = { income: 0, expense: 0 };
  for (const r of rows) {
    const conv = (minor: number) => toBaseCurrency(fromMinor(minor, r.currency), r.currency, base, rates);
    if (r.type === "income") out.income += conv(r.total);
    if (r.type === "expense") out.expense += conv(r.total);
    if (r.type === "transfer") out.expense += conv(r.fees);
  }
  return out;
}

/** One account's balance (minor units) at the start of each of the last
 * `months` months, then now: `months + 1` points, oldest first. Walks back
 * from the current balance through the ledger. */
export function accountBalanceTrend(db: DB, accountId: string, months = 6, now: Date = new Date()): number[] {
  const account = getAccountWithBalance(db, accountId);
  if (!account) return [];
  const starts = Array.from({ length: months }, (_, i) =>
    toLocalISODate(new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1)),
  );
  const rows = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.deleted, false),
        or(eq(transactions.accountId, accountId), eq(transactions.transferAccountId, accountId)),
        gte(transactions.occurredAt, starts[0]),
      ),
    )
    .all();
  const deltas = rows.map((t) => ({
    at: t.occurredAt,
    delta: balanceDeltas(t)
      .filter((d) => d.accountId === accountId)
      .reduce((sum, d) => sum + d.delta, 0),
  }));
  const at = (start: string) => account.balance - deltas.filter((d) => d.at >= start).reduce((sum, d) => sum + d.delta, 0);
  return [...starts.map(at), account.balance];
}
