import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtAxis } from "./money";

test("fmtAxis keeps the short forms", () => {
  assert.equal(fmtAxis(1000, "USD"), "$1k");
  assert.equal(fmtAxis(2500, "USD"), "$2.5k");
  assert.equal(fmtAxis(-500, "USD"), "−$500");
  assert.equal(fmtAxis(850000, "XOF"), "850k");
  assert.equal(fmtAxis(20000, "USD", 5000), "$20k");
});

test("fmtAxis tells close gridlines apart", () => {
  const labels = (ticks: number[]) => ticks.map((t) => fmtAxis(t, "USD", ticks[1] - ticks[0]));
  assert.deepEqual(labels([20000, 20200, 20400, 20600]), ["$20k", "$20.2k", "$20.4k", "$20.6k"]);
  assert.deepEqual(labels([20000, 20250, 20500]), ["$20k", "$20.25k", "$20.5k"]);
  assert.deepEqual(labels([1200000, 1250000, 1300000]), ["$1.2M", "$1.25M", "$1.3M"]);
});
