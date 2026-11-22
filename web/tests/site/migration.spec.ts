import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { handle } from "../../cloudflare/site-worker";

// A returning visitor of pernce.com from before the landing page: the app was
// at / with a root-scoped service worker (scope "/", caches "pernce-<hash>")
// and their data in the browser. After the new deploy they must land on the
// landing page at /, with the old caches and worker gone, and still have their
// data at /app/.
//
// "Previous deploy": the same app built without a base path and post-processed
// by the previous pwa.mjs (fixtures/previous-pwa.mjs). "New deploy": the real
// site Worker's request handling (cloudflare/site-worker.ts) over the real
// public-store/ files, on the same origin so storage and workers carry over.
// (Real wrangler is covered by routing.spec.ts; one origin can't be two
// servers, so this test serves both phases from a small Node server.)
const web = join(import.meta.dirname, "..", "..");
// Cached between local runs (an export takes a minute). What the test needs
// from it is the old deploy's shape: a root-scoped worker and "pernce-<hash>"
// caches, set by the fixture, plus an app export that runs. So the cache is
// keyed by the fixture and the app's lockfile (new Expo, new export), not by
// every app source file. CI always starts without it.
const mobileDir = join(web, "..", "mobile");
const oldBuildKey = createHash("sha256")
  .update(readFileSync(join(mobileDir, "pnpm-lock.yaml")))
  .update(readFileSync(join(import.meta.dirname, "fixtures", "previous-pwa.mjs")))
  .digest("hex")
  .slice(0, 12);
const oldBuild = join(tmpdir(), `pernce-site-test-previous-build-${oldBuildKey}`);
const newBuild = join(web, "public-store");
const PORT = 8793;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

function fileAt(dir: string, pathname: string): Buffer | null {
  const file = join(dir, decodeURIComponent(pathname));
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return null;
  return readFileSync(file);
}

function serve(mode: () => "old" | "new"): Promise<Server> {
  const isolation = { "cross-origin-embedder-policy": "require-corp", "cross-origin-opener-policy": "same-origin" };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let status = 200;
    let headers: Record<string, string> = {};
    let body: Buffer | string = "";
    if (mode() === "old") {
      // The previous deploy: assets at the root, index.html for every path
      // without an extension, isolation everywhere.
      const path = url.pathname === "/" || !extname(url.pathname) ? "/index.html" : url.pathname;
      const file = fileAt(oldBuild, path);
      status = file ? 200 : 404;
      body = file ?? "not found";
      headers = { ...isolation, "Content-Type": TYPES[extname(path)] ?? "text/plain" };
    } else {
      // Cloudflare tries the static assets first (exact file paths, html_handling
      // "none") and runs the Worker only on a miss.
      const asset = fileAt(newBuild, url.pathname);
      const response = asset
        ? new Response(new Uint8Array(asset), { headers: { "Content-Type": TYPES[extname(url.pathname)] ?? "text/plain" } })
        : await handle(new Request(url, { method: req.method }), {
            ASSETS: {
              async fetch(r) {
                const path = new URL(r.url).pathname;
                const file = fileAt(newBuild, path);
                return file
                  ? new Response(new Uint8Array(file), { headers: { "Content-Type": TYPES[extname(path)] ?? "text/plain" } })
                  : new Response("nope", { status: 404 });
              },
            },
          });
      status = response.status;
      body = Buffer.from(await response.arrayBuffer());
      headers = Object.fromEntries(response.headers);
      // public-store/_headers: isolation for /app/*.
      if (url.pathname.startsWith("/app/")) headers = { ...isolation, ...headers };
    }
    res.writeHead(status, headers).end(body);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

test.describe.configure({ mode: "serial" });

test("a returning visitor lands on the landing page, caches retired, data kept at /app/", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  test.skip(!existsSync(join(newBuild, "index.html")), "run pnpm run build:store-app first");

  if (!existsSync(join(oldBuild, "index.html"))) {
    const env = { ...process.env };
    delete env.APP_VARIANT;
    delete env.SYNC_URL;
    delete env.WEB_BASE_URL;
    execFileSync("pnpm", ["exec", "expo", "export", "--platform", "web", "--output-dir", oldBuild], { cwd: mobileDir, env, stdio: "ignore" });
    execFileSync("node", [join(import.meta.dirname, "fixtures", "previous-pwa.mjs"), oldBuild], { stdio: "ignore" });
  }

  let mode: "old" | "new" = "old";
  const server = await serve(() => mode);
  const origin = `http://localhost:${PORT}`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();

    // Before: the old app at /, with its root service worker and caches.
    await page.goto(`${origin}/`);
    await page.locator("input").first().fill("Returning");
    await page.getByText("Get started").click();
    await expect(page.getByText("Total net worth").first()).toBeVisible();
    await page.waitForTimeout(1500); // the database is saved to IndexedDB after each change
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(async () => (await caches.keys()).some((k) => /^pernce-[0-9a-f]{12}$/.test(k))))
      .toBe(true);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope))).toEqual([`${origin}/`]);

    // The new deploy. The old worker serves the old app for this navigation;
    // the browser checks /sw.js, gets the retire worker, which takes over,
    // clears the old caches, unregisters and reloads open pages.
    mode = "new";
    await page.goto(`${origin}/`);
    let landed = false;
    for (let i = 0; i < 6 && !landed; i++) {
      landed = await page
        .locator("h1")
        .filter({ hasText: "Every currency." })
        .waitFor({ timeout: 5000 })
        .then(() => true, () => false);
      if (!landed) await page.reload();
    }
    expect(landed, "the landing page replaces the old app at /").toBe(true);
    expect(new URL(page.url()).pathname).toBe("/");

    // Old caches and the root worker are gone.
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 15000 })
      .toBe(0);
    expect(await page.evaluate(async () => (await caches.keys()).filter((k) => !k.startsWith("pernce-app-")))).toEqual([]);

    // The data is still there, at /app/.
    await page.goto(`${origin}/app/`);
    await expect(page.getByText("Returning").first()).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope))).toEqual([`${origin}/app/`]);
  } finally {
    await context.close();
    server.close();
  }
});
