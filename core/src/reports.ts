import { toBaseCurrency } from "./currency";
import type { TransactionType } from "./transactions";

/** Pure aggregations behind the dashboard, budgets and analytics. Each
 * app does its own grouped query (SQLite on both)
 * and hands the rows here, so the arithmetic - FX conversion, what counts
 * as spend - is the same everywhere. Amounts in rows are plain numbers in
 * major units. */

export type RatesToUsd = Record<string, number>;

export function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** First day of the *next* month - an exclusive upper bound. */
export function monthEnd(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/** "YYYY-MM" for the month `d` falls in, in local time. */
export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function summarizeNetWorth(
  accounts: { currency: string; balance: number }[],
  baseCurrency: string,
  rates: RatesToUsd,
) {
  const byCurrency = new Map<string, number>();
  let totalBase = 0;

  for (const a of accounts) {
    byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0) + a.balance);
    totalBase += toBaseCurrency(a.balance, a.currency, baseCurrency, rates);
  }

  return {
    baseCurrency,
    totalBase,
    byCurrency: Array.from(byCurrency.entries()).map(([currency, amount]) => ({
      currency,
      amount,
      amountBase: toBaseCurrency(amount, currency, baseCurrency, rates),
    })),
  };
}

/** Expense totals grouped by category and currency. */
export type SpendRow = { categoryId: string | null; currency: string; total: number };

/** How much of a budget has been spent. A budget counts every expense in
 * its category, whatever currency the transaction was logged in: spend in
 * other currencies is converted into the budget's currency at the current
 * cached rate. `convertedFrom` lists the other currencies that contributed,
 * so the UI can flag that the total is an FX estimate. */
export function budgetProgress(
  budget: { categoryId: string; amount: number; currency: string },
  spendRows: SpendRow[],
  rates: RatesToUsd,
) {
  let spent = 0;
  const convertedFrom: string[] = [];
  for (const r of spendRows) {
    if (r.categoryId !== budget.categoryId) continue;
    spent += toBaseCurrency(r.total, r.currency, budget.currency, rates);
    if (r.currency !== budget.currency) convertedFrom.push(r.currency);
  }
  const amount = budget.amount;
  return {
    spent,
    convertedFrom,
    remaining: amount - spent,
    pct: amount > 0 ? Math.min(999, (spent / amount) * 100) : 0,
    over: spent > amount,
  };
}

/** Spending by category in the base currency, largest first. */
export function categorySpend<C extends { id: string }>(
  spendRows: SpendRow[],
  categories: C[],
  baseCurrency: string,
  rates: RatesToUsd,
) {
  const byCategory = new Map<string, { category: C | undefined; amountBase: number }>();
  for (const r of spendRows) {
    const key = r.categoryId ?? "uncategorized";
    const existing = byCategory.get(key) ?? {
      category: categories.find((c) => c.id === r.categoryId),
      amountBase: 0,
    };
    existing.amountBase += toBaseCurrency(r.total, r.currency, baseCurrency, rates);
    byCategory.set(key, existing);
  }

  const entries = Array.from(byCategory.values()).sort((a, b) => b.amountBase - a.amountBase);
  const total = entries.reduce((s, e) => s + e.amountBase, 0);
  return entries.map((e) => ({
    ...e,
    pct: total > 0 ? (e.amountBase / total) * 100 : 0,
  }));
}

/** Transaction totals grouped by month ("YYYY-MM"), type and currency.
 * `fees` is the sum of transfer fees (0 for income/expense). */
export type MonthlyRow = { month: string; type: TransactionType; currency: string; total: number; fees: number };

/** Income vs expense per month in the base currency, for the `months`
 * months ending with the one `now` falls in, oldest first. Months with no
 * activity are included as zeros. */
export function monthlySeries(
  rows: MonthlyRow[],
  months: number,
  baseCurrency: string,
  rates: RatesToUsd,
  now: Date = new Date(),
) {
  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const bucket = byMonth.get(r.month) ?? { income: 0, expense: 0 };
    const base = toBaseCurrency(r.total, r.currency, baseCurrency, rates);
    if (r.type === "income") bucket.income += base;
    if (r.type === "expense") bucket.expense += base;
    // A transfer's amount only moves money between your own accounts, but
    // its fee genuinely leaves - count it as spend so the month's net (and
    // netWorthTrend, which walks back through it) reflects it.
    if (r.type === "transfer") bucket.expense += toBaseCurrency(r.fees, r.currency, baseCurrency, rates);
    byMonth.set(r.month, bucket);
  }

  const results: { month: Date; income: number; expense: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const bucket = byMonth.get(monthKey(month)) ?? { income: 0, expense: 0 };
    results.push({ month, income: bucket.income, expense: bucket.expense });
  }

  return results;
}

/** Approximate net worth at the end of each month in `series`,
 * reconstructed by walking the current total backwards through each
 * month's net (income - expense). There's no stored historical snapshot,
 * so this is an approximation - it ignores balance adjustments made
 * outside of logged transactions (e.g. a manually edited starting balance). */
export function netWorthTrend(
  series: { month: Date; income: number; expense: number }[],
  currentTotal: number,
) {
  const points: { month: Date; value: number }[] = [];
  let runningBack = currentTotal;
  for (let i = series.length - 1; i >= 0; i--) {
    points[i] = { month: series[i].month, value: runningBack };
    runningBack -= series[i].income - series[i].expense;
  }
  return points;
}
