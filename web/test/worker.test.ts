import assert from "node:assert/strict";
import { after, afterEach, before, describe, mock, test } from "node:test";
import { CURRENCIES } from "@pernce/core/currency";
import { exchangeRates } from "../src/db/schema";
import worker from "../src/worker";
import { localD1 } from "../scripts/d1";
import { b64, kdf } from "./helpers";

// The Worker's own handlers (src/worker.ts) over a local D1: fetch() routes
// the same API with the D1 binding from the Worker's env, and scheduled()
// runs the two cron jobs. The sync service logic on D1 is covered in depth
// by `pnpm run db:verify:d1`.
type D1 = Awaited<ReturnType<typeof localD1>>;
let d1: D1;
const waitUntilCalls: Promise<unknown>[] = [];
const execCtx = { waitUntil: (p: Promise<unknown>) => void waitUntilCalls.push(p) };

before(async () => {
  d1 = await localD1();
});
after(async () => {
  await d1.dispose();
});
afterEach(() => mock.restoreAll());

const vars = () => d1.env as unknown as Record<string, string>;
// Whatever a local web/.dev.vars holds must not leak into the tests.
const env = (extra: Record<string, unknown> = {}) => ({
  ...d1.env,
  NODE_ENV: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  CRON_SECRET: "",
  SESSION_SECRET: "worker-test-secret",
  ...extra,
});
const call = (path: string, init?: RequestInit, extra?: Record<string, unknown>) =>
  worker.fetch(new Request(`https://api.pernce.com${path}`, init), env(extra), execCtx as never);

describe("Worker fetch on D1", () => {
  test("wrangler.jsonc allows the app's origin and the Worker answers CORS from it", async () => {
    assert.equal(vars().ALLOWED_ORIGINS, "https://pernce.com");
    const res = await call("/api/fx", { method: "OPTIONS", headers: { origin: "https://pernce.com" } }, {
      ALLOWED_ORIGINS: vars().ALLOWED_ORIGINS,
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://pernce.com");
  });

  test("a dev origin gets no CORS unless it is configured", async () => {
    const res = await call("/api/fx", { headers: { origin: "http://localhost:8081" } }, { ALLOWED_ORIGINS: "https://pernce.com" });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    const on = await call("/api/fx", { headers: { origin: "http://localhost:8081" } }, { ALLOWED_ORIGINS: "https://pernce.com,http://localhost:8081" });
    assert.equal(on.headers.get("access-control-allow-origin"), "http://localhost:8081");
  });

  test("/api/fx reads D1; unknown paths are JSON 404s; non-API paths too", async () => {
    const res = await call("/api/fx");
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).rates, {});
    assert.equal((await call("/api/nope")).status, 404);
    assert.equal((await call("/settings")).status, 404);
  });

  test("a sync sign-up on D1: 503 without SMTP, 202 and a printed code in development", async () => {
    const body = JSON.stringify({ email: "w@example.com", authKey: b64(32), kdf: kdf(), wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) });
    const init = { method: "POST", body, headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.5" } };
    const refused = await call("/api/sync/signup", init);
    assert.equal(refused.status, 503);
    assert.equal((await refused.json()).error, "email_unavailable");
    const logged: string[] = [];
    mock.method(console, "info", (...args: unknown[]) => void logged.push(args.join(" ")));
    const ok = await call("/api/sync/signup", init, { NODE_ENV: "development" });
    assert.equal(ok.status, 202);
    const code = /\b(\d{6})\b/.exec(logged.join("\n"))?.[1];
    assert.ok(code, "the code is printed to the log");
    const verified = await call(
      "/api/sync/verify",
      { method: "POST", body: JSON.stringify({ email: "w@example.com", code }), headers: { "content-type": "application/json" } },
    );
    assert.equal(verified.status, 200);
    const { accessToken } = await verified.json();
    const keys = await call("/api/sync/keys", { headers: { authorization: `Bearer ${accessToken}` } });
    assert.equal(keys.status, 200);
  });

  test("the sign-up limit counts CF-Connecting-IP, and ignores a forged X-Forwarded-For", async () => {
    const post = (i: number, headers: Record<string, string>) =>
      call("/api/sync/signup", {
        method: "POST",
        body: JSON.stringify({ email: `l${i}@example.com`, authKey: b64(32), kdf: kdf(), wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) }),
        headers: { "content-type": "application/json", ...headers },
      }, { NODE_ENV: "development" });
    mock.method(console, "info", () => {});
    const statuses: number[] = [];
    // A new forged X-Forwarded-For each time must not reset the count.
    for (let i = 0; i < 6; i++) statuses.push((await post(i, { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": `1.1.1.${i}` })).status);
    assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429]);
  });
});

describe("Worker scheduled() on D1", () => {
  test("the 06:00 job refreshes the rates", async () => {
    const quotes = { usd: Object.fromEntries(CURRENCIES.map((c) => [c.code.toLowerCase(), 4])) };
    mock.method(globalThis, "fetch", async () => Response.json(quotes));
    await worker.scheduled({ cron: "0 6 * * *" }, env() as never, execCtx);
    const rows = await d1.db.select().from(exchangeRates);
    assert.equal(rows.length, CURRENCIES.length - 1);
    assert.equal(rows.find((r) => r.currency === "EUR")?.rateToUsd, "0.25");
  });

  test("the 06:30 job prunes", async () => {
    await worker.scheduled({ cron: "30 6 * * *" }, env() as never, execCtx);
  });

  test("an unknown schedule fails loudly", async () => {
    await assert.rejects(worker.scheduled({ cron: "1 2 3 4 5" }, env() as never, execCtx), /No job is scheduled/);
  });

  test("the schedules in wrangler.jsonc and web/vercel.json are the ones the code knows", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { FX_RATES_CRON, SYNC_PRUNE_CRON } = await import("../src/cron");
    const wrangler = readFileSync(join(import.meta.dirname, "..", "wrangler.jsonc"), "utf8");
    assert.ok(wrangler.includes(`"crons": ["${FX_RATES_CRON}", "${SYNC_PRUNE_CRON}"]`));
    const vercel = JSON.parse(readFileSync(join(import.meta.dirname, "..", "vercel.json"), "utf8"));
    assert.deepEqual(
      vercel.crons.map((c: { path: string; schedule: string }) => [c.path, c.schedule]),
      [["/api/cron/fx-rates", FX_RATES_CRON], ["/api/cron/sync-prune", SYNC_PRUNE_CRON]],
    );
  });
});
