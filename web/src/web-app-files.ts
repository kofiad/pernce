import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, relative, sep } from "node:path";
import type { MiddlewareHandler } from "hono";
import { getMimeType } from "hono/utils/mime";

/** Serves the web app's export (web/public/) from the server itself: the
 * files, then index.html for any other GET or HEAD that isn't the API
 * (client-side routes like /settings). Used by the local Node server
 * (src/node.ts) and by the Vercel function (src/node-app.ts). Vercel's
 * hono preset can't put an export that the build generates onto its CDN
 * (its static step lists `public/` before the build command runs), so the
 * function carries the files (vercel.json `functions.includeFiles`) and
 * answers for them; the CDN caches what it sends. Cloudflare serves the
 * public app as Workers static assets instead (wrangler.app.jsonc).
 *
 * `roots` are candidate directories, tried in order; the first with an
 * index.html is used (looked for again on every request until found, so a
 * missing export is a 404, not a stuck state). */

const MIME_EXTRA: Record<string, string> = {
  webmanifest: "application/manifest+json",
  wasm: "application/wasm",
  ttf: "font/ttf",
  map: "application/json",
};

/** Paths that name a file, not a client-side route: build output folders, or a
 * last segment with an extension. */
const NOT_A_ROUTE = /^\/(?:_expo|assets)\/|\.[A-Za-z0-9]+$/;

/** Hashed build output never changes under its name; everything else
 * (index.html, sw.js, the manifest, icons) must be revalidated. */
const IMMUTABLE = /^\/(?:_expo\/static|assets)\//;

export function webAppFiles(roots: string[]): MiddlewareHandler[] {
  let root: string | null = null;
  const findRoot = () => (root ??= roots.find((r) => existsSync(join(r, "index.html"))) ?? null);

  const send = (c: Parameters<MiddlewareHandler>[0], file: string, cache: string) => {
    const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
    const type = MIME_EXTRA[ext] ?? getMimeType(file) ?? "application/octet-stream";
    c.header("Content-Type", type);
    c.header("Cache-Control", cache);
    return c.body(readFileSync(file));
  };
  const revalidate = "public, max-age=0, must-revalidate";

  const files: MiddlewareHandler = async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const dir = findRoot();
    if (!dir) return next();
    let path: string;
    try {
      path = decodeURIComponent(c.req.path);
    } catch {
      return next();
    }
    // Stay inside the root: no "..", no NUL.
    const file = normalize(join(dir, path));
    if (path.includes("\0") || !file.startsWith(dir + sep)) return next();
    try {
      if (!statSync(file).isFile()) return next();
    } catch {
      return next();
    }
    // Immutability follows the file that was found, not the requested path:
    // /assets/..%2Fsw.js resolves to sw.js, which must revalidate.
    const resolved = "/" + relative(dir, file).split(sep).join("/");
    return send(c, file, IMMUTABLE.test(resolved) ? "public, max-age=31536000, s-maxage=31536000, immutable" : revalidate);
  };

  const spaFallback: MiddlewareHandler = async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const dir = findRoot();
    if (!dir) return next();
    // A missing build file is a 404, never index.html: the service worker's
    // cache.addAll would cache an HTML page as a script after a redeploy.
    // Client-side routes have no file extension (/accounts/abc).
    if (NOT_A_ROUTE.test(c.req.path)) return next();
    return send(c, join(dir, "index.html"), revalidate);
  };

  return [files, spaFallback];
}
