import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORY_ICONS, ICON_PATHS } from "./icons";
import { DEFAULT_CATEGORIES } from "./categories";

test("icons: every default category icon and picker icon exists", () => {
  for (const c of DEFAULT_CATEGORIES) assert.ok(c.icon in ICON_PATHS, c.icon);
  for (const i of CATEGORY_ICONS) assert.ok(i in ICON_PATHS, i);
});
