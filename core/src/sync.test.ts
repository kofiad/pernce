import assert from "node:assert/strict";
import { test } from "node:test";
import { hlcAfter, isSyncHlc } from "./sync";
import { tickHlc } from "./hlc";

test("sync: the server accepts HLCs the devices make, and orders them", () => {
  const node = "3f2a9c1e0b7d4e21";
  const a = tickHlc(null, node, 1_790_000_000_000);
  const b = tickHlc(a, node, 1_790_000_000_000);
  assert.ok(isSyncHlc(a) && isSyncHlc(b));
  assert.ok(hlcAfter(b, a) && !hlcAfter(a, b) && !hlcAfter(a, a));
  assert.ok(hlcAfter(tickHlc(null, "0", 1_790_000_000_001), tickHlc(null, "ffff", 1_790_000_000_000)));
  for (const bad of ["", "nope", "179000000000-0000-a", "1790000000000-000g-a", "1790000000000-0000-", "1790000000000-0000-a b", `1790000000000-0000-${"a".repeat(65)}`]) {
    assert.equal(isSyncHlc(bad), false, bad);
  }
});
