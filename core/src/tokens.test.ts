import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CATEGORIES } from "./categories";
import { colors, isColorValue, resolveColor } from "./tokens";
import { ACCOUNT_COLORS } from "./currency";

test("tokens: every category and account color resolves", () => {
  for (const c of DEFAULT_CATEGORIES) assert.ok(c.color in colors, c.color);
  for (const c of ACCOUNT_COLORS) assert.ok(c in colors, c);
});

test("tokens: stored colors are a token or a lowercase #rrggbb", () => {
  assert.ok(isColorValue("accent-teal"));
  assert.ok(isColorValue("#2f8f6b"));
  for (const bad of ["#2F8F6B", "#fff", "2f8f6b", "red", "", null, 1]) assert.equal(isColorValue(bad), false, String(bad));
  assert.equal(resolveColor("#2f8f6b"), "#2f8f6b");
  assert.equal(resolveColor("accent-teal"), colors["accent-teal"]);
  assert.equal(resolveColor("nope"), colors.stone);
});
