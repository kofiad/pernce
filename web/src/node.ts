import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./create-app";
import { libsqlFromEnv } from "./db/libsql";
import { createSyncContext } from "./sync/context";
import { webAppFiles } from "./web-app-files";

/** The local server (`pnpm run dev`, `pnpm start`): the API plus the web
 * app's export from public/ (`pnpm run build:app`), with the same SPA
 * fallback and headers as Vercel. Loads .env.local, then .env. */
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // no such file
  }
}

const server = createApp({
  createContext: (env) => createSyncContext(env, libsqlFromEnv(env)),
  staticFiles: webAppFiles([join(process.cwd(), "public")]),
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: (request) => server.fetch(request, process.env), port }, (info) => {
  console.log(`Pernce server on http://localhost:${info.port} (API at /api, web app from public/)`);
});
