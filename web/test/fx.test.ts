import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FX_SOURCE } from "@pernce/core/fx";
import { currencies, exchangeRates } from "../src/db/schema";
import { testApp } from "./helpers";

describe("GET /api/fx", async () => {
  const t = await testApp();

  test("an empty database answers with no rates and no date", async () => {
    const res = await t.request("/api/fx");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await res.json(), { source: FX_SOURCE, rates: {}, updatedAt: null });
  });

  test("serves the cron's rates, leaves out hand-typed ones, and can be cached", async () => {
    await t.db.insert(currencies).values([
      { code: "EUR", name: "Euro", symbol: "€" },
      { code: "GHS", name: "Cedi", symbol: "₵" },
    ]);
    await t.db.insert(exchangeRates).values([
      { currency: "EUR", rateToUsd: "1.1", source: FX_SOURCE, updatedAt: new Date(1_790_000_000_000) },
      { currency: "GHS", rateToUsd: "0.07", source: "manual", updatedAt: new Date(1_790_000_100_000) },
    ]);
    const res = await t.request("/api/fx");
    assert.equal(res.headers.get("cache-control"), "public, s-maxage=3600, stale-while-revalidate=86400");
    assert.deepEqual(await res.json(), {
      source: FX_SOURCE,
      rates: { EUR: "1.1" },
      updatedAt: new Date(1_790_000_000_000).toISOString(),
    });
  });

  test("only GET", async () => {
    const res = await t.request("/api/fx", { method: "POST" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, HEAD, OPTIONS");
  });
});
