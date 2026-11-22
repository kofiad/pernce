import { expect, test } from "@playwright/test";

// The URL table of docs/landing-page-plan.md / docs/web-deployment.md, against
// the real Worker (wrangler dev) and the real assets.
const get = (request: import("@playwright/test").APIRequestContext, path: string) =>
  request.get(path, { maxRedirects: 0 });

const isolated = (h: Record<string, string>) =>
  h["cross-origin-embedder-policy"] === "require-corp" && h["cross-origin-opener-policy"] === "same-origin";

test("/ is the landing page, not isolated", async ({ request }) => {
  const res = await get(request, "/");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Every currency.");
  expect(isolated(res.headers())).toBe(false);
  expect(res.headers()["cross-origin-embedder-policy"]).toBeUndefined();
});

test("/site/* and root metadata files are assets without COOP/COEP", async ({ request }) => {
  for (const [path, type] of [
    ["/site/site.css", /css/],
    ["/site/site.js", /javascript/],
    ["/site/img/home-dark.png", /png/],
    ["/site/fonts/inter-latin-opsz-normal.woff2", /woff2/],
    ["/favicon.svg", /svg/],
    ["/favicon.png", /png/],
    ["/robots.txt", /text\/plain/],
    ["/og.png", /png/],
  ] as const) {
    const res = await get(request, path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toMatch(type);
    expect(res.headers()["cross-origin-embedder-policy"], path).toBeUndefined();
  }
  expect((await get(request, "/site/site.css")).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect((await get(request, "/site/fonts/inter-latin-opsz-normal.woff2")).headers()["cache-control"]).toContain("immutable");
});

test("/sw.js is the retire worker", async ({ request }) => {
  const res = await get(request, "/sw.js");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain("registration.unregister()");
  expect(body).not.toContain("PRECACHE");
});

test("/app redirects to /app/, keeping the query", async ({ request }) => {
  for (const [from, to] of [["/app", "/app/"], ["/app?a=1&b=2", "/app/?a=1&b=2"]]) {
    const res = await get(request, from);
    expect(res.status(), from).toBe(301);
    expect(res.headers().location, from).toBe(to);
  }
});

test("/app/ and client-side routes are the app shell, isolated", async ({ request }) => {
  for (const path of ["/app/", "/app/settings", "/app/accounts/0f8c-demo", "/app/index.html"]) {
    const res = await get(request, path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toMatch(/text\/html/);
    expect(isolated(res.headers()), path).toBe(true);
    expect(await res.text(), path).toContain('<div id="root">');
  }
});

test("/app files are assets with COOP/COEP; the app's service worker is there", async ({ request }) => {
  for (const path of ["/app/sw.js", "/app/manifest.webmanifest", "/app/icon-192.png", "/app/favicon.ico"]) {
    const res = await get(request, path);
    expect(res.status(), path).toBe(200);
    expect(isolated(res.headers()), path).toBe(true);
  }
  const manifest = await (await get(request, "/app/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/app/");
  expect(manifest.scope).toBe("/app/");
  const sw = await (await get(request, "/app/sw.js")).text();
  expect(sw).toContain('"pernce-app-');
  expect(sw).toContain('"/app/index.html"');
});

test("old root-level app links 301 to /app, with path and query", async ({ request }) => {
  for (const [from, to] of [
    ["/settings", "/app/settings"],
    ["/accounts/abc?x=1", "/app/accounts/abc?x=1"],
    ["/transactions", "/app/transactions"],
  ]) {
    const res = await get(request, from);
    expect(res.status(), from).toBe(301);
    expect(res.headers().location, from).toBe(to);
  }
});

test("a missing file, or /api (on api.pernce.com), is a plain 404", async ({ request }) => {
  for (const path of ["/_expo/static/js/web/entry-old.js", "/app/_expo/static/js/web/nope.js", "/nope.png", "/app/assets/missing.ttf", "/api/fx", "/api/sync/pull"]) {
    const res = await get(request, path);
    expect(res.status(), path).toBe(404);
    expect(res.headers()["content-type"], path).toMatch(/text\/plain/);
  }
});

test("the old app files are gone from the root", async ({ request }) => {
  for (const path of ["/manifest.webmanifest", "/icon-192.png", "/_expo/static/js/web/x.js"]) {
    expect((await get(request, path)).status(), path).toBe(404);
  }
});
