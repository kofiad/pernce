import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { importBackup } from "./backup";
import { budgetsForMonth } from "./budgets";
import { listAccounts } from "./accounts";
import { netWorth } from "./reports";
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
});
