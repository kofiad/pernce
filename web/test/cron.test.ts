import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import { CURRENCIES } from "@pernce/core/currency";
import { testApp } from "./helpers";

afterEach(() => mock.restoreAll());

const quotes = { usd: Object.fromEntries(CURRENCIES.map((c) => [c.code.toLowerCase(), 2])) };

describe("cron routes", async () => {
  const t = await testApp();
  const withSecret = (secret: string) => ({ headers: { authorization: `Bearer ${secret}` } });

  for (const path of ["/api/cron/fx-rates", "/api/cron/sync-prune"]) {
    test(`${path}: a missing secret is 401`, async () => {
      const res = await t.request(path);
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: "Unauthorized" });
    });
    test(`${path}: a wrong secret is 401`, async () => {
      assert.equal((await t.request(path, withSecret("nope"))).status, 401);
      assert.equal((await t.request(path, { headers: { authorization: "cron-secret" } })).status, 401);
    });
    test(`${path}: wrong lengths and near-misses are 401, only the exact secret passes`, async () => {
      for (const given of ["Bearer cron-secre", "Bearer cron-secrets", "Bearer cron-secreT", "bearer cron-secret", "Bearer " + "x".repeat(10_000), ""]) {
        const res = await t.request(path, { headers: given ? { authorization: given } : {} });
        assert.equal(res.status, 401, JSON.stringify(given.slice(0, 30)));
      }
      mock.method(globalThis, "fetch", async () => Response.json(quotes));
      assert.equal((await t.request(path, withSecret("cron-secret"))).status, 200);
    });
    test(`${path}: fails closed when CRON_SECRET isn't configured`, async () => {
      const env = { CRON_SECRET: undefined };
      // `Bearer undefined` and an empty bearer must not pass either.
      for (const authorization of ["Bearer undefined", "Bearer ", "Bearer"]) {
        const res = await t.request(path, { headers: { authorization } }, env);
        assert.equal(res.status, 401, authorization);
      }
      assert.equal((await t.request(path, undefined, env)).status, 401);
    });
    test(`${path}: only GET`, async () => {
      const res = await t.request(path, { method: "POST", ...withSecret("cron-secret") });
      assert.equal(res.status, 405);
      assert.equal(res.headers.get("allow"), "GET, HEAD, OPTIONS");
    });
  }

  test("fx-rates: the right secret refreshes the rates", async () => {
    mock.method(globalThis, "fetch", async () => Response.json(quotes));
    const res = await t.request("/api/cron/fx-rates", withSecret("cron-secret"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.updated.length, CURRENCIES.length - 1);
    const fx = await (await t.request("/api/fx")).json();
    assert.equal(fx.rates.EUR, "0.5");
    assert.ok(fx.updatedAt);
  });

  test("fx-rates: an unreachable rate API is a 502 with the reason", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new Error("offline");
    });
    const res = await t.request("/api/cron/fx-rates", withSecret("cron-secret"));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Could not reach the exchange rate API/);
  });

  test("sync-prune: the right secret prunes and reports counts", async () => {
    const res = await t.request("/api/cron/sync-prune", withSecret("cron-secret"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, deleted: { unverifiedUsers: 0, sessions: 0, emailCodes: 0 } });
  });
});
