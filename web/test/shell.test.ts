import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { webAppFiles } from "../src/web-app-files";
import { testApp } from "./helpers";

// The web app's files and SPA fallback as the Node server and the Vercel function serve them
// (Vercel and Cloudflare do the same with vercel.json and _headers, which
// can't run here). What must hold on every host: app paths get the
// cross-origin isolation headers, /api never does, and the API wins.
const staticFiles = webAppFiles([join(import.meta.dirname, "fixtures", "app")]);

describe("web app files and SPA fallback", async () => {
  const t = await testApp({ staticFiles });

  test("a deep link gets index.html with COOP and COEP", async () => {
    const res = await t.request("/settings");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Pernce test app/);
    assert.equal(res.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
  });

  test("the root and a nested deep link too", async () => {
    for (const path of ["/", "/accounts/new/step-2"]) {
      const res = await t.request(path);
      assert.equal(res.status, 200, path);
      assert.match(await res.text(), /Pernce test app/);
      assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
    }
  });

  test("a real file is served as itself, with the headers", async () => {
    const res = await t.request("/assets/app.js");
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'console.log("app")\n');
    assert.match(res.headers.get("content-type") ?? "", /javascript/);
    assert.equal(res.headers.get("cross-origin-embedder-policy"), "require-corp");
  });

  test("a missing build file is a JSON 404, not index.html; extensionless routes still get the app", async () => {
    for (const path of ["/assets/missing.js", "/assets/missing.png", "/_expo/static/js/web/missing.js", "/robots.txt", "/x/y.wasm"]) {
      const res = await t.request(path);
      assert.equal(res.status, 404, path);
      assert.deepEqual(await res.json(), { error: "Not found" }, path);
    }
    for (const path of ["/accounts/abc", "/accounts/3f2a9c1e-0b7d-4e21-9c1e-0b7d4e213f2a", "/settings"]) {
      const res = await t.request(path);
      assert.equal(res.status, 200, path);
      assert.match(await res.text(), /Pernce test app/, path);
    }
  });

  test("caching: hashed build output is immutable, the shell and service worker revalidate", async () => {
    const asset = await t.request("/assets/app.js");
    assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, s-maxage=31536000, immutable");
    for (const path of ["/", "/settings", "/index.html"]) {
      assert.equal((await t.request(path)).headers.get("cache-control"), "public, max-age=0, must-revalidate", path);
    }
  });

  test("a path can't climb out of the export directory", async () => {
    // Files outside the root are never served: a path with an extension is a 404,
    // an extensionless one gets the app.
    for (const path of ["/..%2Fpackage.json", "/assets/..%2F..%2F..%2Fpackage.json", "/%2e%2e/%2e%2e/package.json"]) {
      assert.equal((await t.request(path)).status, 404, path);
    }
    const res = await t.request("/a%00b");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Pernce test app/);
  });

  test("immutability follows the resolved file: /assets/..%2Findex.html and ..%2Fsw.js revalidate", async () => {
    for (const path of ["/assets/..%2Findex.html", "/assets/..%2Fsw.js", "/_expo/..%2Fsw.js"]) {
      const res = await t.request(path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get("cache-control"), "public, max-age=0, must-revalidate", path);
    }
    assert.match(await (await t.request("/assets/..%2Findex.html")).text(), /Pernce test app/);
    assert.equal((await t.request("/assets/..%2Fsw.js")).headers.get("content-type")?.includes("javascript"), true);
    // ...while the real hashed file still is immutable
    assert.match((await t.request("/assets/app.js")).headers.get("cache-control") ?? "", /immutable/);
  });

  test("HEAD answers like GET without a body", async () => {
    const res = await t.request("/assets/app.js", { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /javascript/);
    assert.equal(await res.text(), "");
  });

  test("only GET and HEAD fall back", async () => {
    const res = await t.request("/settings", { method: "POST" });
    assert.equal(res.status, 404);
    const head = await t.request("/settings", { method: "HEAD" });
    assert.equal(head.status, 200);
  });

  test("/api responses never carry COOP or COEP", async () => {
    for (const path of ["/api/fx", "/api/nope", "/api", "/api/sync/pull", "/api/cron/fx-rates"]) {
      const res = await t.request(path);
      assert.equal(res.headers.get("cross-origin-opener-policy"), null, path);
      assert.equal(res.headers.get("cross-origin-embedder-policy"), null, path);
    }
  });

  test("the API takes precedence over a file or the fallback", async () => {
    // test/fixtures/app/api/fx exists as a file; the route still answers.
    const res = await t.request("/api/fx");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).source, "fawazahmed0");
  });

  test("an unknown /api path is a 404 JSON, not index.html", async () => {
    for (const path of ["/api/nope", "/api", "/api/sync", "/api/cron/nope"]) {
      const res = await t.request(path);
      assert.equal(res.status, 404, path);
      assert.deepEqual(await res.json(), { error: "Not found" }, path);
    }
  });
});

describe("an export that isn't there (no index.html)", async () => {
  const t = await testApp({ staticFiles: webAppFiles([join(import.meta.dirname, "fixtures", "missing")]) });
  test("app paths are JSON 404s and the API still works", async () => {
    assert.equal((await t.request("/settings")).status, 404);
    assert.equal((await t.request("/api/fx")).status, 200);
  });
});

describe("without static files (the API Worker, Vercel's function)", async () => {
  const t = await testApp();
  test("a non-API path is a JSON 404", async () => {
    const res = await t.request("/settings");
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "Not found" });
  });
});
