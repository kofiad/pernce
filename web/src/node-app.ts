import { createApp } from "./create-app";
import { libsqlFromEnv } from "./db/libsql";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSyncContext } from "./sync/context";
import { webAppFiles } from "./web-app-files";

/** The server for Node hosts, as a default-exported Hono app: libSQL (Turso,
 * or `file:local.db`), environment from process.env read per request. It is
 * not run from here on Vercel: scripts/bundle-server.mjs bundles it into
 * web/server.mjs, the one file Vercel's Hono builder picks up and runs as the
 * function; it also serves the web app's files (src/web-app-files.ts). The
 * Cloudflare Worker is src/worker.ts. */
// web/public/ travels with the function (vercel.json `functions.includeFiles`)
// next to the bundle, web/server.mjs; `../public` is for running from src/.
const here = dirname(fileURLToPath(import.meta.url));

const app = createApp({
  createContext: (env) => createSyncContext(env, libsqlFromEnv(env)),
  // The web app's files and its SPA fallback, answered by the function.
  // (The COOP/COEP headers come from vercel.json at Vercel's edge and from
  // the app-shell middleware too.)
  staticFiles: webAppFiles([join(here, "public"), join(here, "..", "public")]),
});

export default app;
