import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { migrate } from "drizzle-orm/d1/migrator";
import { join } from "node:path";
import * as schema from "../src/db/schema";
import type { DbClient } from "../src/db/batch";

/** A fresh local D1 (workerd, via wrangler's platform proxy: no Cloudflare
 * login, nothing persisted) with the real migrations applied. Also returns
 * the raw binding and wrangler.jsonc's vars, for tests that run the Worker's
 * own handlers. `dispose()` stops workerd. */
export async function localD1() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(import.meta.dirname, "..", "wrangler.jsonc"),
    persist: false,
    envFiles: [], // don't read .env / .dev.vars: the checks bring their own settings
  });
  const binding = proxy.env.DB;
  const db: DbClient = drizzle(binding, { schema });
  await migrate(drizzle(binding), { migrationsFolder: join(import.meta.dirname, "..", "drizzle") });
  return { db, binding, env: proxy.env, dispose: () => proxy.dispose() };
}
