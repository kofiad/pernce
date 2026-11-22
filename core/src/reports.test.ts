import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetProgress, categorySpend, monthlySeries, netWorthTrend, summarizeNetWorth } from "./reports";

const rates = { USD: 1, GHS: 0.08, XOF: 0.0016 };

test("reports: net worth, budgets, category spend", () => {
  const nw = summarizeNetWorth(
    [
      { currency: "USD", balance: 100 },
      { currency: "GHS", balance: 1000 },
    ],
    "USD",
    rates,
  );
  assert.equal(nw.totalBase, 180);

  const spend = [
    { categoryId: "food", currency: "USD", total: 30 },
    { categoryId: "food", currency: "GHS", total: 250 },
    { categoryId: "rent", currency: "USD", total: 500 },
  ];
  const b = budgetProgress({ categoryId: "food", amount: 40, currency: "USD" }, spend, rates);
  assert.equal(b.spent, 50);
  assert.deepEqual(b.convertedFrom, ["GHS"]);
  assert.equal(b.over, true);

  const cs = categorySpend(spend, [{ id: "food" }, { id: "rent" }], "USD", rates);
  assert.deepEqual(
    cs.map((c) => c.category?.id),
    ["rent", "food"],
  );
});

test("reports: monthly series counts transfer fees as spend and fills empty months", () => {
  const now = new Date(2026, 8, 15);
  const series = monthlySeries(
    [
      { month: "2026-09", type: "income", currency: "USD", total: 100, fees: 0 },
      { month: "2026-09", type: "transfer", currency: "USD", total: 50, fees: 2 },
      { month: "2026-07", type: "expense", currency: "GHS", total: 125, fees: 0 },
    ],
    3,
    "USD",
    rates,
    now,
  );
  assert.deepEqual(
    series.map((s) => [s.month.getMonth(), s.income, s.expense]),
    [
      [6, 0, 10],
      [7, 0, 0],
      [8, 100, 2],
    ],
  );
  assert.deepEqual(
    netWorthTrend(series, 500).map((p) => p.value),
    [402, 402, 500],
  );
});
