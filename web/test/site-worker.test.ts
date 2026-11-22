import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, type SiteEnv } from "../cloudflare/site-worker";

// A fake of the assets binding: exact file paths, like html_handling "none".
const FILES = new Set(["/index.html", "/app/index.html", "/app/sw.js", "/sw.js", "/site/site.css"]);
const seen: string[] = [];
const env: SiteEnv = {
  ASSETS: {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      seen.push(path);
      return FILES.has(path) ? new Response(`file ${path}`, { status: 200 }) : new Response("nope", { status: 404 });
    },
  },
};
const get = (path: string, method = "GET") => handle(new Request(`https://pernce.com${path}`, { method }), env);

test("/ is the landing page", async () => {
  const res = await get("/");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "file /index.html");
  assert.equal(res.headers.get("Cross-Origin-Embedder-Policy"), null);
});

test("/app redirects to /app/ and keeps the query", async () => {
  const res = await get("/app?x=1");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Location"), "/app/?x=1");
});

test("/app/ and client-side routes are the app shell with COOP and COEP", async () => {
  for (const path of ["/app/", "/app/settings", "/app/accounts/abc-123", "/app/transactions/"]) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), "file /app/index.html", path);
    assert.equal(res.headers.get("Cross-Origin-Embedder-Policy"), "require-corp", path);
    assert.equal(res.headers.get("Cross-Origin-Opener-Policy"), "same-origin", path);
  }
});

test("old root-level links go to the same path under /app", async () => {
  const res = await get("/settings?tab=data");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Location"), "/app/settings?tab=data");
  assert.equal((await get("/accounts/x")).headers.get("Location"), "/app/accounts/x");
});

test("a missing file, or the API (it lives on api.pernce.com), is a plain 404, never HTML", async () => {
  for (const path of ["/_expo/static/js/web/old.js", "/app/_expo/missing.js", "/nope.png", "/app/assets/x.ttf", "/api", "/api/fx", "/api/sync/pull?since=1"]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.match(res.headers.get("Content-Type") ?? "", /^text\/plain/);
  }
});

test("only GET and HEAD", async () => {
  const res = await get("/", "POST");
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("Allow"), "GET, HEAD");
  assert.equal((await get("/", "HEAD")).status, 200);
});
