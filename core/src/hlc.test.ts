import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHlc, parseHlc, tickHlc } from "./hlc";

test("hlc: timestamps sort in write order, even when the clock goes backwards", () => {
  const a = tickHlc(null, "node-a", 1_000);
  const b = tickHlc(a, "node-a", 1_000);
  const c = tickHlc(b, "node-a", 500); // clock jumped back
  const d = tickHlc(c, "node-a", 2_000);
  assert.deepEqual([a, b, c, d], [a, b, c, d].slice().sort());
  assert.ok(a < b && b < c && c < d);
  assert.deepEqual(parseHlc(c), { wall: 1_000, counter: 2, node: "node-a" });
  assert.equal(parseHlc(formatHlc({ wall: 1_790_000_000_000, counter: 15, node: "x" })).counter, 15);
  assert.ok(tickHlc(formatHlc({ wall: 5, counter: 0xffff, node: "n" }), "n", 5) > formatHlc({ wall: 5, counter: 0xffff, node: "n" }));
  assert.throws(() => parseHlc("nope"));
});
