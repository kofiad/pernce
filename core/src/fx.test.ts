import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUsdQuotes } from "./fx";

test("fx: parses the API payload into rates to USD, skipping junk", () => {
  const rates = parseUsdQuotes({ usd: { ghs: 12.5, xof: 600, eur: 0, cad: "x" } }, ["USD", "GHS", "XOF", "EUR", "CAD", "GBP"]);
  assert.deepEqual(rates, { GHS: 0.08, XOF: 1 / 600 });
  assert.throws(() => parseUsdQuotes({ nope: 1 }, ["GHS"]));
  assert.throws(() => parseUsdQuotes(null, ["GHS"]));
});
