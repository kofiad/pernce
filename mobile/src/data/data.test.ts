import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { DEFAULT_CATEGORIES } from "@pernce/core";
import * as schema from "../db/schema";
import { createAccount, getAccountWithBalance, listAccounts, setAccountArchived, updateAccount } from "./accounts";
import { exportBackup, exportTransactionsCsv, importBackup, importTransactionsCsv, deleteAllLocalData } from "./backup";
import { budgetExpenses, budgetFor, budgetsForMonth, copyPreviousMonthBudgets, deleteBudget, lastBudgetLook, setBudget } from "./budgets";
import {
  createCategory,
  listCategories,
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from "./categories";
import { changeVersion } from "./changes";
import { allPages, PAGE_ROWS, type DB } from "./db";
import { getMeta, stamp } from "./meta";
import { getProfile, setupProfile, updateProfile } from "./profile";
import { clearRateOverride, getRatesMap, listRates, refreshMarketRates, setRateOverride, storeMarketRates } from "./rates";
import {
  accountBalanceTrend,
  categorySpendForRange,
  incomeExpenseForRange,
  monthToDateFor,
  monthlySeriesFor,
  netWorth,
  spendingTypeSplit,
} from "./reports";
import { hexToHsv, hsvToHex, parseHex, whiteContrast } from "./look";
import { createTestDb, migrateTestDb } from "./test-utils";
import { countTransactions, createTransaction, deleteTransaction, getTransaction, listTransactions, updateTransaction } from "./transactions";

async function setup(base = "USD") {
  const db = await createTestDb();
  setupProfile(db, { name: "Ama", baseCurrency: base });
  storeMarketRates(db, { GHS: 0.08, XOF: 0.0016, EUR: 1.1 }, "test", "2026-09-01T00:00:00.000Z");
  const usd = createAccount(db, { name: "Checking", type: "bank", currency: "USD", color: "primary", openingBalance: 100_00 });
  const ghs = createAccount(db, { name: "MoMo", type: "mobile_money", currency: "GHS", color: "accent-teal", openingBalance: 0 });
  const xof = createAccount(db, { name: "Wave", type: "mobile_money", currency: "XOF", color: "accent-cyan", openingBalance: 5000_00 });
  const cat = (name: string) => listCategories(db).find((c) => c.name === name)!.id;
  return { db, usd, ghs, xof, cat };
}

const balance = (db: DB, id: string) => getAccountWithBalance(db, id)!.balance;

test("first run seeds the default categories once, with fresh UUIDs", async () => {
  const db = await createTestDb();
  setupProfile(db, { baseCurrency: "GHS" });
  setupProfile(db, { baseCurrency: "GHS", name: "Kofi" });
  const cats = listCategories(db);
  assert.equal(cats.length, DEFAULT_CATEGORIES.length);
  assert.equal(new Set(cats.map((c) => c.id)).size, cats.length);
  assert.match(cats[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(getProfile(db)?.name, "Kofi");
  assert.throws(() => setupProfile(db, { baseCurrency: "ZZZ" }), /Unsupported currency/);
});

test("every write stamps a monotonic HLC updated_at", async () => {
  const { db, usd } = await setup();
  const before = getAccountWithBalance(db, usd)!.updatedAt;
  updateAccount(db, usd, { name: "Main", type: "bank", currency: "USD", color: "primary", openingBalance: 100_00 });
  const after = getAccountWithBalance(db, usd)!.updatedAt;
  assert.ok(after > before);
  assert.equal(getMeta(db, "hlc_last"), after);
  // A clock that jumps back still moves forward.
  assert.ok(stamp(db, 0) > after);
});

test("balances are opening balance plus balanceDeltas over live transactions", async () => {
  const { db, usd, ghs, xof, cat } = await setup();
  createTransaction(db, { type: "income", accountId: usd, categoryId: cat("Salary & Wages"), amount: 500_00, occurredAt: "2026-09-01" });
  const coffee = createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Dining Out"), amount: 4_50, occurredAt: "2026-09-02" });
  // USD -> GHS at a rate, with a fee.
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 100_00, exchangeRate: 12.5, fee: 1_99, occurredAt: "2026-09-03" });
  // USD -> XOF by amount received.
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: xof, amount: 10_00, transferAmount: 6000_00, occurredAt: "2026-09-03" });

  assert.equal(balance(db, usd), 100_00 + 500_00 - 4_50 - 100_00 - 1_99 - 10_00);
  assert.equal(balance(db, ghs), 1250_00);
  assert.equal(balance(db, xof), 11000_00);

  // Soft delete: the row stays as a tombstone but stops counting anywhere.
  deleteTransaction(db, coffee);
  assert.equal(balance(db, usd), 100_00 + 500_00 - 100_00 - 1_99 - 10_00);
  assert.equal(getTransaction(db, coffee), null);
  assert.equal(listTransactions(db).some((t) => t.id === coffee), false);
  const tomb = db.select().from(schema.transactions).where(eq(schema.transactions.id, coffee)).get()!;
  assert.equal(tomb.deleted, true);
  assert.throws(() => deleteTransaction(db, coffee), /not found/);
});

test("a rate-derived amount received is rounded to the destination's precision", async () => {
  const { db, usd, xof } = await setup();
  const id = createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: xof, amount: 1_00, exchangeRate: 600.666, occurredAt: "2026-09-03" });
  const t = getTransaction(db, id)!;
  assert.equal(t.transferAmount, 600_67);
  assert.equal(t.transferCurrency, "XOF");
  assert.equal(t.exchangeRate, "600.666");
});

test("writes are validated by core with the web app's messages", async () => {
  const { db, usd, ghs, cat } = await setup();
  const base = { accountId: usd, occurredAt: "2026-09-01" } as const;
  assert.throws(() => createTransaction(db, { ...base, type: "expense", amount: 0 }), /positive number/);
  assert.throws(() => createTransaction(db, { ...base, type: "expense", amount: 1.5 }), /minor units/);
  assert.throws(() => createTransaction(db, { ...base, type: "expense", amount: 100, currency: "GHS" }), /does not match account currency/);
  assert.throws(() => createTransaction(db, { ...base, type: "transfer", amount: 100 }), /destination account is required/);
  assert.throws(() => createTransaction(db, { ...base, type: "transfer", amount: 100, transferAccountId: ghs }), /needs the amount received or the exchange rate/);
  assert.throws(() => createTransaction(db, { ...base, type: "expense", amount: 100, occurredAt: "2026-02-30" }), /valid YYYY-MM-DD/);
  assert.throws(() => createTransaction(db, { ...base, type: "expense", amount: 100, categoryId: cat("Salary & Wages") }), /is an income category/);
  assert.throws(() => createTransaction(db, { ...base, accountId: "nope", type: "expense", amount: 100 }), /Account not found/);
  assert.equal(listTransactions(db).length, 0);
});

test("editing a transaction moves balances to match", async () => {
  const { db, usd, ghs, cat } = await setup();
  const id = createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 20_00, occurredAt: "2026-09-01" });
  updateTransaction(db, id, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 20_00, transferAmount: 240_00, occurredAt: "2026-09-01" });
  assert.equal(balance(db, usd), 80_00);
  assert.equal(balance(db, ghs), 240_00);
  assert.equal(getTransaction(db, id)!.categoryId, null);
});

test("account currency is locked once it has transactions; archive hides it", async () => {
  const { db, usd, ghs } = await setup();
  createTransaction(db, { type: "income", accountId: usd, amount: 1_00, occurredAt: "2026-09-01" });
  assert.throws(
    () => updateAccount(db, usd, { name: "Checking", type: "bank", currency: "EUR", color: "primary", openingBalance: 0 }),
    /Can't change the currency/,
  );
  updateAccount(db, ghs, { name: "MoMo", type: "mobile_money", currency: "EUR", color: "primary", openingBalance: -5_00 });
  assert.equal(balance(db, ghs), -5_00);
  setAccountArchived(db, ghs, true);
  assert.equal(listAccounts(db).some((a) => a.id === ghs), false);
  assert.equal(listAccounts(db, { includeArchived: true }).some((a) => a.id === ghs), true);
});

test("listTransactions filters by account (either side), type, dates and note", async () => {
  const { db, usd, ghs, cat } = await setup();
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 1_00, note: "Market run", occurredAt: "2026-08-31" });
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 1_00, transferAmount: 12_00, occurredAt: "2026-09-01" });
  createTransaction(db, { type: "income", accountId: ghs, amount: 5_00, occurredAt: "2026-09-02" });
  assert.equal(listTransactions(db, { accountId: ghs }).length, 2);
  assert.equal(listTransactions(db, { type: "expense" }).length, 1);
  assert.equal(listTransactions(db, { from: "2026-09-01", to: "2026-10-01" }).length, 2);
  assert.equal(listTransactions(db, { search: "market" }).length, 1);
  assert.equal(listTransactions(db, { categoryId: cat("Groceries") }).length, 1);
  assert.deepEqual(
    listTransactions(db).map((t) => t.occurredAt),
    ["2026-09-02", "2026-09-01", "2026-08-31"],
  );
  assert.equal(listTransactions(db, { limit: 1, offset: 1 })[0].occurredAt, "2026-09-01");
});

test("budgets: progress, FX-estimate flag, one per category and month, soft delete", async () => {
  const { db, usd, ghs, cat } = await setup();
  const groceries = cat("Groceries");
  const period = "2026-09-01";
  setBudget(db, { categoryId: groceries, period, amount: 40_00, currency: "USD" });
  createTransaction(db, { type: "expense", accountId: usd, categoryId: groceries, amount: 30_00, occurredAt: "2026-09-05" });
  createTransaction(db, { type: "expense", accountId: ghs, categoryId: groceries, amount: 250_00, occurredAt: "2026-09-06" });
  createTransaction(db, { type: "expense", accountId: usd, categoryId: groceries, amount: 99_00, occurredAt: "2026-10-01" }); // next month
  const deleted = createTransaction(db, { type: "expense", accountId: usd, categoryId: groceries, amount: 99_00, occurredAt: "2026-09-07" });
  deleteTransaction(db, deleted);

  const [b] = budgetsForMonth(db, new Date(2026, 8, 15));
  assert.equal(b.spent, 50);
  assert.deepEqual(b.convertedFrom, ["GHS"]);
  assert.equal(b.over, true);

  // Setting it again replaces rather than duplicates.
  setBudget(db, { categoryId: groceries, period, amount: 60_00, currency: "USD" });
  assert.equal(budgetsForMonth(db, new Date(2026, 8, 1)).length, 1);
  assert.equal(budgetsForMonth(db, new Date(2026, 8, 1))[0].over, false);

  assert.equal(copyPreviousMonthBudgets(db, "2026-10-01"), 1);
  assert.equal(copyPreviousMonthBudgets(db, "2026-10-01"), 0);

  // A deleted budget's tombstone doesn't block setting a new one.
  deleteBudget(db, budgetsForMonth(db, new Date(2026, 8, 1))[0].id);
  assert.equal(budgetsForMonth(db, new Date(2026, 8, 1)).length, 0);
  setBudget(db, { categoryId: groceries, period, amount: 10_00, currency: "USD" });
  assert.equal(budgetsForMonth(db, new Date(2026, 8, 1)).length, 1);

  assert.throws(() => setBudget(db, { categoryId: cat("Salary & Wages"), period, amount: 1, currency: "USD" }), /expense categories/);
  assert.throws(() => setBudget(db, { categoryId: groceries, period: "2026-09-02", amount: 1, currency: "USD" }), /first of a month/);
});

test("budget detail: the month's live expenses in the category, and its budget", async () => {
  const { db, usd, ghs, cat } = await setup();
  const groceries = cat("Groceries");
  setBudget(db, { categoryId: groceries, period: "2026-09-01", amount: 40_00, currency: "USD" });
  createTransaction(db, { type: "expense", accountId: usd, categoryId: groceries, amount: 30_00, occurredAt: "2026-09-05" });
  createTransaction(db, { type: "expense", accountId: ghs, categoryId: groceries, amount: 250_00, occurredAt: "2026-09-20" });
  createTransaction(db, { type: "expense", accountId: usd, categoryId: groceries, amount: 1_00, occurredAt: "2026-10-01" }); // next month
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Dining Out"), amount: 1_00, occurredAt: "2026-09-06" });
  deleteTransaction(db, createTransaction(db, { type: "expense", accountId: usd, categoryId: groceries, amount: 9_00, occurredAt: "2026-09-07" }));

  const sep = new Date(2026, 8, 10);
  assert.deepEqual(
    budgetExpenses(db, groceries, sep).map((t) => t.occurredAt),
    ["2026-09-20", "2026-09-05"],
  );
  assert.equal(budgetFor(db, groceries, sep)?.spent, 50);
  // October has a transaction but no budget.
  assert.equal(budgetFor(db, groceries, new Date(2026, 9, 1)), null);
  assert.equal(budgetExpenses(db, groceries, new Date(2026, 9, 1)).length, 1);
});

test("reports: net worth, category spend, essentials split, 6-month series", async () => {
  const { db, usd, ghs, xof, cat } = await setup();
  createTransaction(db, { type: "income", accountId: usd, categoryId: cat("Salary & Wages"), amount: 1000_00, occurredAt: "2026-09-01" });
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 100_00, occurredAt: "2026-09-02" });
  createTransaction(db, { type: "expense", accountId: ghs, categoryId: cat("Dining Out"), amount: 500_00, occurredAt: "2026-09-02" });
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 50_00, transferAmount: 600_00, fee: 2_00, occurredAt: "2026-07-10" });

  // USD 100 + 1000 - 100 - 52 = 948; GHS 600 - 500 = 100 -> 8 USD; XOF 5000 -> 8 USD.
  const nw = netWorth(db);
  assert.equal(nw.baseCurrency, "USD");
  assert.ok(Math.abs(nw.totalBase - (948 + 8 + 8)) < 1e-9);
  setAccountArchived(db, xof, true);
  assert.ok(Math.abs(netWorth(db).totalBase - 956) < 1e-9);

  const spend = categorySpendForRange(db, "2026-09-01", "2026-10-01");
  assert.deepEqual(
    spend.map((s) => [s.category?.name, Math.round(s.amountBase * 100) / 100]),
    [
      ["Groceries", 100],
      ["Dining Out", 40],
    ],
  );
  assert.deepEqual(spendingTypeSplit(db, "2026-09-01", "2026-10-01"), { essential: 100, discretionary: 40, other: 0 });

  // Activity's totals, all categories or one (M07b).
  assert.deepEqual(incomeExpenseForRange(db, "2026-09-01", "2026-10-01"), { income: 1000, expense: 140 });
  assert.deepEqual(incomeExpenseForRange(db, "2026-09-01", "2026-10-01", cat("Dining Out")), { income: 0, expense: 40 });
  assert.equal(listTransactions(db, { categoryId: cat("Dining Out"), from: "2026-09-01", to: "2026-10-01" }).length, 1);

  const series = monthlySeriesFor(db, 6, new Date(2026, 8, 20));
  assert.equal(series.length, 6);
  assert.deepEqual(
    series.slice(-3).map((m) => [m.month.getMonth(), m.income, m.expense]),
    [
      [6, 0, 2],
      [7, 0, 0],
      [8, 1000, 140],
    ],
  );
});

test("month to date: running in/out per day, net worth walked back through later days", async () => {
  const { db, usd, ghs, cat } = await setup();
  createTransaction(db, { type: "income", accountId: usd, categoryId: cat("Salary & Wages"), amount: 1000_00, occurredAt: "2026-09-02" });
  createTransaction(db, { type: "expense", accountId: ghs, categoryId: cat("Dining Out"), amount: 100_00, occurredAt: "2026-09-02" });
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 50_00, transferAmount: 600_00, fee: 2_00, occurredAt: "2026-09-03" });
  // Last month is already in the opening point; next week's is undone.
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 10_00, occurredAt: "2026-08-30" });
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 20_00, occurredAt: "2026-09-10" });

  const days = monthToDateFor(db, new Date(2026, 8, 4, 15));
  assert.deepEqual(
    days.map((d) => [d.day, d.income, Math.round(d.expense * 100) / 100]),
    [
      ["2026-09-01", 0, 0],
      ["2026-09-02", 1000, 8],
      ["2026-09-03", 1000, 10],
      ["2026-09-04", 1000, 10],
    ],
  );
  // Now: USD 100 - 10 + 1000 - 52 - 20 = 1018; GHS 600 - 100 = 500 -> 40; XOF 5000 -> 8; undo Sep 10's 20 = 1086.
  // Only flows are walked back, so the transfer's FX gap (50 USD out, 48 USD in) isn't: an approximation, as in netWorthTrend.
  const nw = days.map((d) => Math.round(d.netWorth * 100) / 100);
  assert.deepEqual(nw, [96, 1088, 1086, 1086]);
});

test("account balance trend walks back from today's balance, month by month", async () => {
  const { db, usd, ghs, cat } = await setup();
  createTransaction(db, { type: "income", accountId: usd, categoryId: cat("Salary & Wages"), amount: 1000_00, occurredAt: "2026-09-01" });
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 100_00, occurredAt: "2026-08-15" });
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 50_00, transferAmount: 600_00, fee: 2_00, occurredAt: "2026-07-10" });
  // Before the window: already in the opening point.
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 10_00, occurredAt: "2026-01-05" });

  // Starts of Apr..Sep, then now. USD: 100 - 10 = 90 until Jul; -52 in Jul; -100 in Aug; +1000 in Sep.
  assert.deepEqual(accountBalanceTrend(db, usd, 6, new Date(2026, 8, 20)), [90_00, 90_00, 90_00, 90_00, 38_00, -62_00, 938_00]);
  assert.equal(countTransactions(db), 4);
  // GHS only sees the transfer's arrival.
  assert.deepEqual(accountBalanceTrend(db, ghs, 6, new Date(2026, 8, 20)), [0, 0, 0, 0, 600_00, 600_00, 600_00]);
  assert.deepEqual(accountBalanceTrend(db, "missing"), []);
});

test("rates: overrides win over fetched rates; USD is 1; offline keeps stored rates", async () => {
  const { db } = await setup();
  assert.equal(getRatesMap(db).GHS, 0.08);
  setRateOverride(db, "GHS", 0.07);
  setRateOverride(db, "GHS", 0.075);
  assert.equal(getRatesMap(db).GHS, 0.075);
  assert.equal(listRates(db).find((r) => r.currency === "GHS")!.market!.rateToUsd, 0.08);
  clearRateOverride(db, "GHS");
  assert.equal(getRatesMap(db).GHS, 0.08);
  assert.throws(() => setRateOverride(db, "USD", 2), /always 1/);

  const offline = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  await assert.rejects(refreshMarketRates(db, offline), /saved rates/);
  assert.equal(getRatesMap(db).GHS, 0.08);

  const urls: string[] = [];
  const mirrorOnly = (async (url: string) => {
    urls.push(url);
    if (urls.length === 1) return { ok: false } as Response;
    return { ok: true, json: async () => ({ usd: { ghs: 10, xof: 500, eur: 0.9 } }) } as Response;
  }) as unknown as typeof fetch;
  const updated = await refreshMarketRates(db, mirrorOnly);
  assert.equal(urls.length, 2);
  assert.ok(updated.includes("GHS"));
  assert.equal(getRatesMap(db).GHS, 0.1);
});

test("categories: add, rename, recolor, reorder, archive; names unique per kind", async () => {
  const { db } = await setup();
  const id = createCategory(db, { name: "Pets", kind: "expense", color: "accent-teal", icon: "heart", spendingType: "essential" });
  assert.throws(
    () => createCategory(db, { name: "pets", kind: "expense", color: "accent-teal", icon: "heart", spendingType: null }),
    /already an expense category/,
  );
  // Same name is fine for the other kind.
  createCategory(db, { name: "Pets", kind: "income", color: "accent-teal", icon: "heart", spendingType: "essential" });
  assert.equal(listCategories(db, { kind: "income" }).find((c) => c.name === "Pets")!.spendingType, null);

  updateCategory(db, id, { name: "Pet care", color: "accent-pink", icon: "gift", spendingType: "discretionary" });
  const expense = listCategories(db, { kind: "expense" });
  assert.equal(expense.at(-1)!.name, "Pet care");
  assert.throws(() => updateCategory(db, id, { name: "Pet care", color: "nope", icon: "gift", spendingType: null }), /Unknown color/);

  const reordered = [id, ...expense.filter((c) => c.id !== id).map((c) => c.id)];
  reorderCategories(db, reordered);
  assert.equal(listCategories(db, { kind: "expense" })[0].id, id);

  setCategoryArchived(db, id, true);
  assert.equal(listCategories(db, { kind: "expense" }).some((c) => c.id === id), false);
  assert.equal(listCategories(db, { kind: "expense", includeArchived: true }).some((c) => c.id === id), true);
});

test("mobile JSON backup round-trips exactly into a fresh install", async () => {
  const { db, usd, ghs, cat } = await setup("GHS");
  createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 12_34, occurredAt: "2026-09-01" });
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 10_00, exchangeRate: 12.3456, fee: 50, occurredAt: "2026-09-02" });
  const gone = createTransaction(db, { type: "income", accountId: usd, amount: 1_00, occurredAt: "2026-09-03" });
  deleteTransaction(db, gone);
  setBudget(db, { categoryId: cat("Groceries"), period: "2026-09-01", amount: 200_00, currency: "USD" });
  setRateOverride(db, "XOF", 0.00165);
  const backup = JSON.parse(JSON.stringify(exportBackup(db)));
  assert.equal(backup.format, "pernce-mobile-backup");
  assert.equal(backup.transactions.length, 2, "tombstones aren't exported");

  // Backups written before the rename (format "perance-mobile-backup") still import.
  const legacy = await createTestDb();
  setupProfile(legacy, { baseCurrency: "USD" });
  const legacyReport = importBackup(legacy, { ...backup, format: "perance-mobile-backup" });
  assert.equal(legacyReport.kind, "mobile-backup");
  assert.deepEqual(legacyReport.skipped, []);
  assert.equal(balance(legacy, usd), balance(db, usd));

  const fresh = await createTestDb();
  setupProfile(fresh, { baseCurrency: "USD" });
  const report = importBackup(fresh, backup);
  assert.equal(report.kind, "mobile-backup");
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(report.adjusted, []);
  assert.equal(balance(fresh, usd), balance(db, usd));
  assert.equal(balance(fresh, ghs), balance(db, ghs));
  assert.equal(getProfile(fresh)!.baseCurrency, "GHS");
  assert.equal(getRatesMap(fresh).XOF, 0.00165);
  // Backup categories matched the fresh install's seeded ones by name.
  assert.equal(listCategories(fresh, { includeArchived: true }).length, DEFAULT_CATEGORIES.length);
  assert.equal(budgetsForMonth(fresh, new Date(2026, 8, 1))[0].spent, 12.34);

  // Importing again is idempotent.
  importBackup(fresh, backup);
  assert.equal(listTransactions(fresh).length, 2);
  assert.equal(balance(fresh, usd), balance(db, usd));

  // Restoring over rows deleted since the backup revives their tombstones
  // instead of failing on the duplicate id.
  const budget = budgetsForMonth(db, new Date(2026, 8, 1))[0];
  deleteBudget(db, budget.id);
  const txId = listTransactions(db)[0].id;
  deleteTransaction(db, txId);
  const restored = importBackup(db, backup);
  assert.deepEqual(restored.skipped, []);
  assert.equal(budgetsForMonth(db, new Date(2026, 8, 1))[0].id, budget.id);
  assert.ok(getTransaction(db, txId));
});

test("XOF/XAF saved as whole francs become centimes: the database and old backups", async () => {
  // Migrations 0000-0001: before CFA francs had decimals.
  const db = await createTestDb(2);
  setupProfile(db, { baseCurrency: "USD" });
  const usd = createAccount(db, { name: "Checking", type: "bank", currency: "USD", color: "primary", openingBalance: 100_00 });
  const xof = createAccount(db, { name: "Wave", type: "mobile_money", currency: "XOF", color: "accent-cyan", openingBalance: 5000 });
  const xaf = createAccount(db, { name: "Orange", type: "mobile_money", currency: "XAF", color: "accent-teal", openingBalance: 0 });
  const groceries = listCategories(db).find((c) => c.name === "Groceries")!.id;
  const spend = createTransaction(db, { type: "expense", accountId: xof, categoryId: groceries, amount: 1500, occurredAt: "2026-09-01" });
  const send = createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: xaf, amount: 10_00, transferAmount: 6000, fee: 50, occurredAt: "2026-09-02" });
  setBudget(db, { categoryId: groceries, period: "2026-09-01", amount: 20000, currency: "XOF" });
  const v1 = { ...JSON.parse(JSON.stringify(exportBackup(db))), version: 1 };

  await migrateTestDb(db);
  const check = (d: DB) => {
    assert.equal(balance(d, xof), 3500_00);
    assert.equal(balance(d, xaf), 6000_00);
    assert.equal(balance(d, usd), 100_00 - 10_00 - 50, "USD untouched");
    assert.equal(getTransaction(d, spend)!.amount, 1500_00);
    assert.equal(getTransaction(d, send)!.fee, 50);
    assert.equal(d.select().from(schema.budgets).get()!.amount, 20000_00);
  };
  check(db);

  const fresh = await createTestDb();
  setupProfile(fresh, { baseCurrency: "USD" });
  const report = importBackup(fresh, v1);
  assert.deepEqual(report.adjusted, []);
  check(fresh);
});

test("web backup import: balances become opening balances, XOF rounded and reported", async () => {
  const db = await createTestDb();
  setupProfile(db, { baseCurrency: "USD" });
  const webCat = { id: "11111111-1111-4111-8111-111111111111", name: "Groceries", kind: "expense", color: "accent-lime", icon: "cart", spendingType: "essential", sortOrder: "3" };
  const webOnlyCat = { id: "22222222-2222-4222-8222-222222222222", name: "Hobbies", kind: "expense", color: "not-a-token", icon: "nope", spendingType: null, sortOrder: "40" };
  const snapshot = {
    exportedAt: "2026-09-30T00:00:00.000Z",
    profile: { name: "Ama", email: "ama@example.com", baseCurrency: "GHS" },
    accounts: [
      { id: "a1", userId: "u", name: "Checking", type: "bank", institution: null, currency: "USD", color: "primary", balance: "475.50", archived: false, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a2", userId: "u", name: "Wave", type: "mobile_money", institution: null, currency: "XOF", color: "accent-cyan", balance: "15000.404", archived: false, createdAt: "2026-01-01T00:00:00.000Z" },
    ],
    categories: [webCat, webOnlyCat],
    transactions: [
      { id: "t1", userId: "u", accountId: "a1", categoryId: webCat.id, transferAccountId: null, type: "expense", amount: "24.50", currency: "USD", transferAmount: null, transferCurrency: null, exchangeRate: null, fee: "0", note: "Market", occurredAt: "2026-09-01", createdAt: "2026-09-01T10:00:00.000Z" },
      { id: "t2", userId: "u", accountId: "a2", categoryId: webOnlyCat.id, transferAccountId: null, type: "expense", amount: "1500.506", currency: "XOF", transferAmount: null, transferCurrency: null, exchangeRate: null, fee: "0", note: null, occurredAt: "2026-09-02", createdAt: "2026-09-02T10:00:00.000Z" },
      { id: "t3", userId: "u", accountId: "a1", categoryId: null, transferAccountId: "a2", type: "transfer", amount: "10.00", currency: "USD", transferAmount: "6000.00", transferCurrency: "XOF", exchangeRate: "600.00000000", fee: "0.50", note: null, occurredAt: "2026-09-03", createdAt: "2026-09-03T10:00:00.000Z" },
      { id: "t4", userId: "u", accountId: "missing", categoryId: null, transferAccountId: null, type: "income", amount: "5", currency: "USD", transferAmount: null, transferCurrency: null, exchangeRate: null, fee: "0", note: null, occurredAt: "2026-09-03", createdAt: "2026-09-03T10:00:00.000Z" },
    ],
    budgets: [{ id: "b1", userId: "u", categoryId: webCat.id, period: "2026-09-01", amount: "300.00", currency: "USD", createdAt: "2026-09-01T00:00:00.000Z" }],
    exchangeRates: [
      { currency: "GHS", rateToUsd: "0.08000000", source: "fawazahmed0", updatedAt: "2026-09-29T00:00:00.000Z" },
      { currency: "XOF", rateToUsd: "0.00160000", source: "manual", updatedAt: "2026-09-29T00:00:00.000Z" },
    ],
  };

  const report = importBackup(db, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(report.kind, "web-backup");
  assert.deepEqual(report.counts, { accounts: 2, categories: 2, transactions: 3, budgets: 1, rates: 2 });
  assert.equal(report.skipped.length, 1);
  assert.match(report.skipped[0], /account isn't in the backup/);
  // Balance and the XOF expense were rounded to centimes, and said so.
  assert.equal(report.adjusted.length, 2);
  assert.ok(report.adjusted.some((m) => /15000\.404 XOF rounded to 15000\.40 XOF/.test(m)));
  assert.ok(report.adjusted.some((m) => /1500\.506 XOF rounded to 1500\.51 XOF/.test(m)));

  // Derived balances equal the web app's stored balances (XOF rounded).
  assert.equal(balance(db, "a1"), 475_50);
  assert.equal(balance(db, "a2"), 15000_40);
  assert.equal(getAccountWithBalance(db, "a1")!.openingBalance, 475_50 + 24_50 + 10_50);

  // Groceries matched this device's seeded category; Hobbies was added
  // with safe styling.
  const cats = listCategories(db);
  assert.equal(cats.filter((c) => c.name === "Groceries").length, 1);
  const hobbies = cats.find((c) => c.name === "Hobbies")!;
  assert.equal(hobbies.color, "stone");
  assert.equal(hobbies.icon, "more");
  assert.equal(getTransaction(db, "t1")!.categoryId, cats.find((c) => c.name === "Groceries")!.id);
  assert.equal(budgetsForMonth(db, new Date(2026, 8, 1))[0].spent, 24.5);
  assert.equal(getProfile(db)!.baseCurrency, "GHS");
  assert.equal(getRatesMap(db).XOF, 0.0016);

  // Re-import: same result, nothing duplicated.
  importBackup(db, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(listTransactions(db).length, 3);
  assert.equal(balance(db, "a1"), 475_50);
  assert.throws(() => importBackup(db, { hello: "world" }), /isn't a Pernce backup/);
});

test("CSV: export uses each currency's precision; bank CSV import matches names and reports", async () => {
  const { db, usd, ghs, xof, cat } = await setup();
  createTransaction(db, { type: "expense", accountId: xof, categoryId: cat("Groceries"), amount: 1500_00, note: "=SUM(A1)", occurredAt: "2026-09-01" });
  createTransaction(db, { type: "transfer", accountId: usd, transferAccountId: ghs, amount: 10_00, transferAmount: 125_00, fee: 25, occurredAt: "2026-09-02" });
  const csv = exportTransactionsCsv(db);
  const lines = csv.split("\n");
  assert.equal(lines[0], "date,type,account,category,amount,currency,note,to_account,received_amount,received_currency,exchange_rate,fee");
  assert.equal(lines[1], "2026-09-02,transfer,Checking,,10.00,USD,,MoMo,125.00,GHS,12.5,0.25");
  assert.equal(lines[2], "2026-09-01,expense,Wave,Groceries,1500.00,XOF,'=SUM(A1),,,,,");

  const before = balance(db, xof);
  const bank = [
    "Date,Type,Account,Category,Amount,Currency,Note",
    "2026-09-10,expense,wave,groceries,-250.604,XOF,market",
    "2026-09-10,expense,Wave,Nope,100,,",
    "2026-09-11,income,Checking,Salary & Wages,\"1,000.00\",USD,pay",
    "2026-09-11,expense,Unknown,,5,USD,",
    "11/09/2026,expense,Checking,,5,USD,",
    "2026-09-12,expense,Checking,,5,GHS,",
    "2026-09-12,transfer,Checking,,5,USD,",
  ].join("\n");
  const report = importTransactionsCsv(db, bank);
  assert.equal(report.counts.transactions, 3);
  assert.equal(report.skipped.length, 4);
  assert.ok(report.adjusted.some((m) => /250\.604 XOF rounded to 250\.60 XOF/.test(m)));
  assert.ok(report.adjusted.some((m) => /no expense category "Nope"/.test(m)));
  assert.equal(balance(db, xof), before - 250_60 - 100_00);
  assert.throws(() => importTransactionsCsv(db, "foo,bar\n1,2"), /needs a "date" column/);

  // The app's own CSV export imports back (transfers included).
  const fresh = await setup();
  const again = importTransactionsCsv(fresh.db, csv);
  assert.deepEqual(again.skipped, []);
  assert.equal(balance(fresh.db, fresh.ghs), 125_00);
});

test("delete local data wipes everything back to onboarding; writes notify", async () => {
  const { db, usd } = await setup();
  const v = changeVersion();
  createTransaction(db, { type: "income", accountId: usd, amount: 1_00, occurredAt: "2026-09-01" });
  assert.ok(changeVersion() > v);
  deleteAllLocalData(db);
  assert.equal(getProfile(db), null);
  assert.equal(listAccounts(db, { includeArchived: true }).length, 0);
  assert.equal(listCategories(db, { includeArchived: true }).length, 0);
  assert.equal(getMeta(db, "hlc_last"), null);
  setupProfile(db, { baseCurrency: "USD" });
  assert.equal(listCategories(db).length, DEFAULT_CATEGORIES.length);
});

test("looks: custom colours and icons on accounts, budgets and the profile survive a backup", async () => {
  const { db, usd, cat } = await setup();
  const groceries = cat("Groceries");
  updateAccount(db, usd, { name: "Checking", type: "bank", currency: "USD", color: "#2f8f6b", icon: "card", openingBalance: 100_00 });
  assert.throws(() => updateAccount(db, usd, { name: "Checking", type: "bank", currency: "USD", color: "#2F8F6B", openingBalance: 0 }), /Unknown color/);
  assert.throws(() => updateAccount(db, usd, { name: "Checking", type: "bank", currency: "USD", color: "primary", icon: "nope", openingBalance: 0 }), /Unknown icon/);

  // A budget's own look, carried into next month by a copy and offered to a new one.
  setBudget(db, { categoryId: groceries, period: "2026-09-01", amount: 40_00, currency: "USD", color: "#123456", icon: "cart" });
  assert.deepEqual(lastBudgetLook(db, groceries, "2026-11-01"), { color: "#123456", icon: "cart" });
  assert.deepEqual(lastBudgetLook(db, groceries, "2026-09-01"), { color: null, icon: null });
  copyPreviousMonthBudgets(db, "2026-10-01");
  assert.equal(budgetFor(db, groceries, new Date(2026, 9, 1))?.icon, "cart");

  updateProfile(db, { color: "accent-teal", icon: "user" });
  assert.equal(getProfile(db)?.icon, "user");

  const fresh = await createTestDb();
  setupProfile(fresh, { baseCurrency: "USD" });
  importBackup(fresh, JSON.parse(JSON.stringify(exportBackup(db))));
  const acc = listAccounts(fresh).find((a) => a.name === "Checking")!;
  assert.equal(acc.color, "#2f8f6b");
  assert.equal(acc.icon, "card");
  assert.equal(budgetsForMonth(fresh, new Date(2026, 8, 1))[0].color, "#123456");
  assert.equal(getProfile(fresh)?.color, "accent-teal");
  assert.equal(getProfile(fresh)?.icon, "user");

  // Back to initials.
  updateProfile(db, { icon: null });
  assert.equal(getProfile(db)?.icon, null);
});

test("colour wheel maths: hex <-> HSV round-trips; white contrast", () => {
  assert.equal(hsvToHex({ h: 0, s: 1, v: 1 }), "#ff0000");
  assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), "#00ff00");
  assert.equal(hsvToHex({ h: 0, s: 0, v: 0 }), "#000000");
  for (const hex of ["#2f8f6b", "#0b7a62", "#ffffff", "#000000", "#d6325f", "#739a10"]) assert.equal(hsvToHex(hexToHsv(hex)), hex);
  assert.equal(parseHex(" 2F8F6B"), "#2f8f6b");
  assert.equal(parseHex("#fff"), null);
  assert.ok(whiteContrast("#000000") > 20);
  assert.ok(whiteContrast("#ffff00") < 3);
  assert.ok(whiteContrast("#0b7a62") >= 3);
});

test("allPages reads every row, including an exact multiple of the page size", () => {
  for (const n of [0, 1, PAGE_ROWS - 1, PAGE_ROWS, 2 * PAGE_ROWS, 2 * PAGE_ROWS + 3]) {
    const ids = Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(5, "0") }));
    let calls = 0;
    const rows = allPages((afterId, limit) => {
      calls++;
      return ids.filter((r) => afterId === null || r.id > afterId).slice(0, limit);
    });
    assert.deepEqual(rows, ids);
    assert.equal(calls, Math.floor(n / PAGE_ROWS) + 1);
  }
});

test("exports read every transaction across pages (web returns ~1 MB per call)", async () => {
  const { db, usd, cat } = await setup();
  const n = 2 * PAGE_ROWS + 7;
  for (let i = 0; i < n; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    createTransaction(db, { type: "expense", accountId: usd, categoryId: cat("Groceries"), amount: 100 + i, occurredAt: `2026-09-${day}` });
  }
  deleteTransaction(db, listTransactions(db, { limit: 1 })[0].id);

  const backup = exportBackup(db);
  assert.equal(backup.transactions.length, n - 1);
  assert.equal(new Set(backup.transactions.map((t) => t.id)).size, n - 1);

  // The CSV keeps its newest-first order although rows are read by id.
  const csv = exportTransactionsCsv(db).trim().split("\n");
  assert.equal(csv.length, n);
  const amounts = csv.slice(1).map((line) => line.split(",")[4]);
  assert.deepEqual(amounts, listTransactions(db).map((t) => (t.amount / 100).toFixed(2)));
});

test("rateWarning: none, stale, volatile; a manual rate silences all but none", async () => {
  const { rateWarning } = await import("./rates");
  const now = new Date("2026-11-07T00:00:00Z");
  const market = (days: number) => ({ rateToUsd: 0.05, source: "x", fetchedAt: new Date(now.getTime() - days * 86_400_000).toISOString() });
  const info = (currency: string, over: object = {}) => ({ currency, effective: 0.05, market: market(1), override: null, ...over });
  assert.equal(rateWarning("USD", undefined, now), null);
  assert.equal(rateWarning("ZAR", undefined, now), "none");
  assert.equal(rateWarning("ZAR", info("ZAR", { effective: null, market: null }), now), "none");
  assert.equal(rateWarning("ZAR", info("ZAR"), now), null);
  assert.equal(rateWarning("ZAR", info("ZAR", { market: market(8) }), now), "stale");
  assert.equal(rateWarning("VES", info("VES"), now), "volatile");
  assert.equal(rateWarning("VES", info("VES", { override: { id: "o", rateToUsd: 0.02 } }), now), null);
});
