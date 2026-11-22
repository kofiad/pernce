import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyDecimals } from "./money";
import { CURRENCIES, FEATURED_CURRENCIES, RETIRED_CURRENCIES, VOLATILE_CURRENCIES } from "./currency";

test("currencies: ZAR is available, codes are unique, featured ones come first", () => {
  const codes = CURRENCIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes("ZAR"));
  assert.ok(CURRENCIES.every((c) => /^[A-Z]{3}$/.test(c.code) && c.name && c.symbol));
  assert.deepEqual(FEATURED_CURRENCIES, codes.slice(0, FEATURED_CURRENCIES.length));
  assert.equal(currencyDecimals("ZAR"), 2);
  // Retired: BGN (euro since 2026-01-01), ANG (replaced by XCG in 2025).
  assert.ok(codes.includes("XCG"));
  for (const retired of Object.keys(RETIRED_CURRENCIES)) assert.ok(!codes.includes(retired as never), `${retired} is retired`);
  for (const v of VOLATILE_CURRENCIES) assert.ok(codes.includes(v as never), `${v} must be a supported currency`);
});
