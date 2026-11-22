import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { importBackup } from "./backup";
import { budgetsForMonth } from "./budgets";
import { listAccounts } from "./accounts";
import { categorySpendForRange, netWorth } from "./reports";
import { countTransactions } from "./transactions";
import { createTestDb } from "./test-utils";

// The README screenshots come from this file (docs/demo/, made by
// scripts/make-demo-backup.ts); keep it importable.
describe("demo backup", () => {
  it("imports and computes net worth and budgets", async () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, "../../../docs/demo/pernce-demo-backup.json"), "utf8"));
    const db = await createTestDb();
    importBackup(db, json);

    assert.equal(listAccounts(db).length, 5);
    const n = countTransactions(db);
    assert.ok(n >= 80 && n <= 120, `${n} transactions`);
    assert.equal(json.budgets.length, 5);

    const nw = netWorth(db);
    assert.equal(nw.baseCurrency, "USD");
    assert.ok(nw.totalBase > 0);
    assert.equal(nw.byCurrency.length, 5);

    const budgets = budgetsForMonth(db, new Date(2026, 10, 15));
    assert.equal(budgets.length, 5);
    assert.ok(budgets.some((b) => b.over), "at least one budget is over");
    assert.ok(budgets.some((b) => !b.over && b.pct >= 85), "one is near its limit");
  });

  // pernce.com shows these figures twice: in the hero screenshots (made from
  // this backup by web/scripts/site-screenshots.mjs) and typed into the
  // feature visuals in web/site/index.html. If the backup changes, this fails:
  // regenerate the screenshots and update the figures in index.html to match,
  // then these numbers.
  it("still has the figures the landing page shows", async () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, "../../../docs/demo/pernce-demo-backup.json"), "utf8"));
    const db = await createTestDb();
    importBackup(db, json);
    const cents = (n: number) => Math.round(n * 100) / 100;

    const nw = netWorth(db);
    assert.equal(cents(nw.totalBase), 15574.03);
    assert.deepEqual(
      Object.fromEntries(nw.byCurrency.map((c) => [c.currency, [cents(c.amount), cents(c.amountBase)]])),
      { USD: [12912.58, 12912.58], GBP: [464.89, 617.84], GHS: [9348, 857.21], EUR: [798.16, 927.46], CAD: [362.91, 258.94] },
    );
    const spent = budgetsForMonth(db, new Date(2026, 10, 15)).map((b) => [b.amount / 100, cents(b.spent)]);
    assert.deepEqual(spent.sort((a, b) => a[0] - b[0]), [[50, 21.16], [80, 74.28], [90, 56.83], [210, 243.09], [500, 308.13]]);
    const spend = categorySpendForRange(db, "2026-11-01", "2026-12-01");
    assert.equal(cents(spend.reduce((t, s) => t + s.amountBase, 0)), 2907.13);
    assert.deepEqual(spend.slice(0, 5).map((s) => [s.category?.name, cents(s.amountBase)]), [
      ["Rent & Mortgage", 1850], ["Groceries", 308.13], ["Dining Out", 243.09], ["Utilities", 99], ["Shopping", 98.57],
    ]);
  });
});
