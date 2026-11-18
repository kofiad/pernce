import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { testApp } from "./helpers";

const ORIGIN = "https://pernce.com";
const preflight = { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "POST" } };

describe("CORS configured (the API Worker: ALLOWED_ORIGINS)", async () => {
  const t = await testApp();
  const env = { ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:8081/` };

  test("a preflight from an allowed origin is answered with 204 and the allow headers", async () => {
    for (const path of ["/api/fx", "/api/sync/push", "/api/sync/login"]) {
      const res = await t.request(path, preflight, env);
      assert.equal(res.status, 204, path);
      assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
      assert.equal(res.headers.get("access-control-allow-methods"), "GET, POST, PUT, DELETE, OPTIONS");
      assert.equal(res.headers.get("access-control-allow-headers"), "Authorization, Content-Type");
      assert.equal(res.headers.get("access-control-max-age"), "86400");
      assert.equal(res.headers.get("vary"), "Origin");
      assert.equal(res.headers.get("access-control-allow-credentials"), null);
    }
  });

  test("a preflight needs no token (it comes before authentication)", async () => {
    const res = await t.request("/api/sync/pull", preflight, env);
    assert.equal(res.status, 204);
  });

  test("actual responses carry the headers: public, rejected and failed ones", async () => {
    const init = { headers: { origin: ORIGIN } };
    const fx = await t.request("/api/fx", init, env);
    assert.equal(fx.status, 200);
    assert.equal(fx.headers.get("access-control-allow-origin"), ORIGIN);
    const rejected = await t.request("/api/sync/pull", init, env);
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("access-control-allow-origin"), ORIGIN);
    const badBody = await t.request("/api/sync/login", { method: "POST", ...init }, env);
    assert.equal(badBody.status, 400);
    assert.equal(badBody.headers.get("access-control-allow-origin"), ORIGIN);
  });

  test("a configured dev origin works, with its trailing slash ignored", async () => {
    const res = await t.request("/api/fx", { method: "OPTIONS", headers: { origin: "http://localhost:8081" } }, env);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:8081");
  });

  test("another origin gets nothing", async () => {
    const res = await t.request("/api/fx", { method: "OPTIONS", headers: { origin: "https://evil.example" } }, env);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    const get = await t.request("/api/fx", { headers: { origin: "https://evil.example" } }, env);
    assert.equal(get.headers.get("access-control-allow-origin"), null);
  });

  test("unknown API paths and the cron routes get no CORS headers", async () => {
    const nope = await t.request("/api/nope", { headers: { origin: ORIGIN } }, env);
    assert.equal(nope.headers.get("access-control-allow-origin"), null);
    const cron = await t.request("/api/cron/fx-rates", { headers: { origin: ORIGIN } }, env);
    assert.equal(cron.headers.get("access-control-allow-origin"), null);
  });

  test("the old WEB_APP_ORIGINS name still works", async () => {
    const res = await t.request("/api/fx", { headers: { origin: ORIGIN } }, { WEB_APP_ORIGINS: ORIGIN });
    assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  });
});

describe("CORS not configured (the personal Vercel instance: same-origin)", async () => {
  const t = await testApp();

  test("no CORS headers on anything, even for a browser origin", async () => {
    for (const [path, init] of [
      ["/api/fx", { headers: { origin: ORIGIN } }],
      ["/api/fx", preflight],
      ["/api/sync/push", preflight],
      ["/api/sync/pull", { headers: { origin: ORIGIN } }],
    ] as const) {
      const res = await t.request(path, init);
      assert.equal(res.headers.get("access-control-allow-origin"), null, path);
      assert.equal(res.headers.get("vary"), null, path);
    }
  });

  test("a preflight is still answered 204", async () => {
    assert.equal((await t.request("/api/sync/push", preflight)).status, 204);
  });
});
