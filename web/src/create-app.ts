import { Hono, type MiddlewareHandler } from "hono";
import { readEnv } from "./env";
import { appShellHeaders } from "./middleware/appShell";
import { cors } from "./middleware/cors";
import { fxRatesCron, syncPruneCron } from "./routes/cron";
import { fxRates } from "./routes/fx";
import { methods } from "./routes/methods";
import { syncRoutes } from "./routes/sync";
import { vercelClientIp, type ClientIp } from "./sync/http";
import type { SyncContext } from "./sync/context";
import type { AppEnv, HonoEnv } from "./types";

export type AppOptions = {
  /** Builds the request's database, mailer, clock and settings from the
   * host's environment: libSQL on Vercel and Node (src/node-app.ts), D1 on
   * Workers (src/worker.ts), in-memory test doubles in test/. Called at
   * most once per request, and only for routes that need it. */
  createContext: (env: AppEnv) => SyncContext;
  /** How to read the caller's address, which depends on the host. */
  clientIp?: ClientIp;
  /** Serves the web app's files on non-API paths (webAppFiles in
   * src/web-app-files.ts): the Vercel function (src/node-app.ts) and the local
   * Node server (src/node.ts) pass it. Only the API Worker leaves it out (it
   * has no web app; the public app is a separate assets-only Worker). */
  staticFiles?: MiddlewareHandler[];
};

/** The whole server as one framework-neutral Hono app: the same routes,
 * paths, status codes and auth on Vercel (Node), Cloudflare Workers and
 * the local dev server. Nothing here touches process.env or a database
 * connection at import time; hosts hand both in per request. */
export function createApp({ createContext, clientIp = vercelClientIp, staticFiles = [] }: AppOptions) {
  const app = new Hono<HonoEnv>();

  app.use("*", async (c, next) => {
    let ctx: SyncContext | undefined;
    c.set("getCtx", () => (ctx ??= createContext(readEnv(c))));
    await next();
  });
  app.use("*", appShellHeaders);

  // The API: the sync store, the public FX rates and two crons. Everything
  // else is the web app's static files.
  const api = new Hono<HonoEnv>();
  api.use("/fx", cors);
  api.use("/sync/*", cors);
  methods(api, "/fx", { GET: fxRates });
  methods(api, "/cron/fx-rates", { GET: fxRatesCron });
  methods(api, "/cron/sync-prune", { GET: syncPruneCron });
  api.route("/sync", syncRoutes(clientIp));
  api.all("*", (c) => c.json({ error: "Not found" }, 404));
  app.route("/api", api);

  // The web app: files, then index.html for unknown paths (client-side
  // routes like /settings).
  for (const handler of staticFiles) app.use("*", handler);
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError((err, c) => {
    console.error(`${c.req.method} ${c.req.path} failed:`, err);
    return c.json({ error: "Internal server error" }, 500);
  });
  return app;
}

export type App = ReturnType<typeof createApp>;
