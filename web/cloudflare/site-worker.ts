// pernce.com's Worker (wrangler.app.jsonc): it runs only when no static asset
// matches the request (assets win first, so hits cost nothing), and decides
// what a miss means. Layout, from web/public-store/:
//
//   /                  the landing page (assets: /index.html)
//   /site/*            landing CSS, JS, images, fonts (assets)
//   /app/              the store web app (assets: /app/index.html)
//   /app/<route>       a client-side route of the app: /app/index.html, 200
//   /app/<file>        app files (assets)
//
// Links from before the landing page existed (pernce.com/settings) had the
// app at the root: they 301 to the same path under /app. A miss with a file
// extension is a plain 404, never an HTML page (a missing script must not
// look like a successful one). So is /api/*: the API lives on its own host
// (api.pernce.com), and an API call that lands here must fail loudly rather
// than get the app's HTML. No dependencies, so it stays tiny on the free
// plan. Pure `handle()` so the tests can drive it with a fake ASSETS.

export interface SiteEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** The app needs SharedArrayBuffer (expo-sqlite's synchronous web API), so
 * its pages are cross-origin isolated; the landing page isn't. Same pair as
 * cloudflare/_headers, which covers the files assets serve themselves. */
const APP_HEADERS: Record<string, string> = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const hasExtension = (pathname: string): boolean => /\.[^/]+$/.test(pathname.slice(pathname.lastIndexOf("/") + 1));

function redirect(location: string): Response {
  return new Response(null, { status: 301, headers: { Location: location } });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function asset(env: SiteEnv, request: Request, path: string, extra?: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  const res = await env.ASSETS.fetch(new Request(url, { method: request.method, headers: request.headers }));
  if (!extra || res.status !== 200) return res;
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(extra)) out.headers.set(name, value);
  return out;
}

export async function handle(request: Request, env: SiteEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  const { pathname, search } = url;

  if (pathname === "/") return asset(env, request, "/index.html");
  if (pathname === "/app") return redirect(`/app/${search}`);
  if (pathname === "/app/" || (pathname.startsWith("/app/") && !hasExtension(pathname))) {
    return asset(env, request, "/app/index.html", APP_HEADERS);
  }
  if (pathname.startsWith("/app/")) return notFound();
  if (pathname === "/api" || pathname.startsWith("/api/")) return notFound();
  if (!hasExtension(pathname)) return redirect(`/app${pathname}${search}`);
  return notFound();
}

export default {
  fetch: (request: Request, env: SiteEnv) => handle(request, env),
};
