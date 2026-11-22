import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBase, serviceWorkerPaths } from "./webBase";

test("normalizeBase accepts the forms Expo and the config produce", () => {
  assert.equal(normalizeBase(undefined), "");
  assert.equal(normalizeBase(""), "");
  assert.equal(normalizeBase("/"), "");
  assert.equal(normalizeBase("/app"), "/app");
  assert.equal(normalizeBase("/app/"), "/app");
  assert.equal(normalizeBase("app"), "/app");
});

test("serviceWorkerPaths keeps the root build exactly as before", () => {
  assert.deepEqual(serviceWorkerPaths(""), { url: "/sw.js", scope: "/" });
  assert.deepEqual(serviceWorkerPaths("/app"), { url: "/app/sw.js", scope: "/app/" });
});
