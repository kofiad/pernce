import type { MiddlewareHandler } from "hono";

/** True for /api and everything under it: the API. Everything else is the
 * web app's static files and its SPA fallback. */
export const isApiPath = (path: string) => path === "/api" || path.startsWith("/api/");

/** The cross-origin isolation headers on every web app path (not /api).
 * expo-sqlite's synchronous API on web needs SharedArrayBuffer, which
 * browsers only allow on cross-origin isolated pages. require-corp rather
 * than credentialless: Safari only supports require-corp. The same rule is
 * in web/vercel.json (Vercel's CDN serves the files there) and
 * web/cloudflare/_headers (the public app's Worker). */
export const appShellHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  if (isApiPath(c.req.path)) return;
  c.header("Cross-Origin-Embedder-Policy", "require-corp");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
};
