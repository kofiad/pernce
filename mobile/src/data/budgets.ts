import { and, asc, desc, eq, lt } from "drizzle-orm";
import { budgetProgress, fromMinor, monthStart, toLocalISODate } from "@pernce/core";
import { budgets, type Budget, type Transaction } from "../db/schema";
import { getCategory } from "./categories";
import { notifyChange } from "./changes";
import type { DB } from "./db";
import { newId } from "./ids";
import { checkColorOrNull, checkIconOrNull } from "./look";
import { newRowStamps, stamp } from "./meta";
import { isSupportedCurrency } from "./profile";
import { getRatesMap } from "./rates";
import { monthRange, spendRows } from "./reports";
import { listTransactions } from "./transactions";

/** "YYYY-MM-01" for the month `d` falls in. */
export function periodOf(d: Date) {
  return toLocalISODate(monthStart(d));
}

export function assertPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(period)) throw new Error("Budget period must be the first of a month");
}

export function listBudgets(db: DB, period: string): Budget[] {
  return db
    .select()
    .from(budgets)
    .where(and(eq(budgets.deleted, false), eq(budgets.period, period)))
    .orderBy(asc(budgets.createdAt), asc(budgets.id))
    .all();
}

export type BudgetWithProgress = Budget & {
  /** Major units of the budget's currency. */
  spent: number;
  remaining: number;
  pct: number;
  over: boolean;
  /** Other currencies whose spend was converted in; non-empty means the
   * total is an FX estimate. */
  convertedFrom: string[];
};

/** Budgets for the month `month` falls in, each with core budgetProgress
 * over that month's expense spend. */
export function budgetsForMonth(db: DB, month: Date): BudgetWithProgress[] {
  const rows = listBudgets(db, periodOf(month));
  if (rows.length === 0) return [];
  const { from, to } = monthRange(month);
  const spend = spendRows(db, from, to);
  const rates = getRatesMap(db);
  return rows.map((b) => ({
    ...b,
    ...budgetProgress({ categoryId: b.categoryId, amount: fromMinor(b.amount, b.currency), currency: b.currency }, spend, rates),
  }));
}

/** The budget for one category in the month `month` falls in, if set. */
export function budgetFor(db: DB, categoryId: string, month: Date): BudgetWithProgress | null {
  return budgetsForMonth(db, month).find((b) => b.categoryId === categoryId) ?? null;
}

/** The look the category's most recent budget had before `period`, so a
 * new month's budget starts out looking like the last one. */
export function lastBudgetLook(db: DB, categoryId: string, period: string) {
  const prev = db
    .select({ color: budgets.color, icon: budgets.icon })
    .from(budgets)
    .where(and(eq(budgets.deleted, false), eq(budgets.categoryId, categoryId), lt(budgets.period, period)))
    .orderBy(desc(budgets.period))
    .get();
  return prev ?? { color: null, icon: null };
}

/** What counts towards a category's budget in a month: its live expenses,
 * newest first (M09a). */
export function budgetExpenses(db: DB, categoryId: string, month: Date): Transaction[] {
  return listTransactions(db, { categoryId, type: "expense", ...monthRange(month) });
}

/** Creates or replaces the budget for a category and month. `amount` is
 * minor units of `currency`. `color` / `icon` give the budget its own look;
 * null or omitted uses the category's. */
export function setBudget(
  db: DB,
  input: { categoryId: string; period: string; amount: number; currency: string; color?: string | null; icon?: string | null },
) {
  assertPeriod(input.period);
  const category = getCategory(db, input.categoryId);
  if (!category) throw new Error("Category not found");
  if (category.kind !== "expense") throw new Error("Budgets are for expense categories");
  if (!isSupportedCurrency(input.currency)) throw new Error(`Unsupported currency "${input.currency}"`);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Amount must be a positive number");
  const look = { color: checkColorOrNull(input.color), icon: checkIconOrNull(input.icon) };
  const values = { categoryId: input.categoryId, period: input.period, amount: input.amount, currency: input.currency, ...look };

  const existing = db
    .select()
    .from(budgets)
    .where(and(eq(budgets.deleted, false), eq(budgets.categoryId, input.categoryId), eq(budgets.period, input.period)))
    .get();
  let id: string;
  if (existing) {
    id = existing.id;
    db.update(budgets)
      .set({ amount: input.amount, currency: input.currency, ...look, updatedAt: stamp(db) })
      .where(eq(budgets.id, id))
      .run();
  } else {
    id = newId();
    db.insert(budgets)
      .values({ id, ...newRowStamps(db), ...values })
      .run();
  }
  notifyChange();
  return id;
}

export function deleteBudget(db: DB, id: string) {
  db.update(budgets).set({ deleted: true, updatedAt: stamp(db) }).where(eq(budgets.id, id)).run();
  notifyChange();
}

/** Copies the previous month's budgets into `period` for categories that
 * don't have one there yet. Returns how many were added. */
export function copyPreviousMonthBudgets(db: DB, period: string) {
  assertPeriod(period);
  const [y, m] = period.split("-").map(Number);
  const prev = toLocalISODate(new Date(y, m - 2, 1));
  const existing = new Set(listBudgets(db, period).map((b) => b.categoryId));
  let added = 0;
  db.transaction((tx) => {
    for (const b of listBudgets(tx, prev)) {
      if (existing.has(b.categoryId)) continue;
      const cat = getCategory(tx, b.categoryId);
      if (!cat || cat.archived) continue;
      tx.insert(budgets)
        .values({
          id: newId(),
          ...newRowStamps(tx),
          categoryId: b.categoryId,
          period,
          amount: b.amount,
          currency: b.currency,
          color: b.color,
          icon: b.icon,
        })
        .run();
      added++;
    }
  });
  notifyChange();
  return added;
}
