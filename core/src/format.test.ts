import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmount } from "./format";

test("format: formatAmount uses each currency's own precision", () => {
  assert.equal(formatAmount(1234.5, "USD"), "$1,234.50");
  assert.match(formatAmount(1500, "XOF"), /^XOF\s1,500\.00$/);
  assert.equal(formatAmount(12, "GHS", { signDisplay: "always" }).startsWith("+"), true);
  assert.equal(formatAmount(-3, "USD"), "-$3.00");
});
