import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { DbClient } from "./batch";

/** What the D1 connection reads from the Worker's bindings (wrangler.jsonc). */
export type D1Env = { DB?: AnyD1Database };

const cache = new WeakMap<object, DbClient>();

/** D1 for the Cloudflare host. The binding comes with each request (Workers
 * have no process.env at import time), so nothing is global; the Drizzle
 * wrapper is just cached per binding. */
export function d1FromEnv(env: D1Env): DbClient {
  const binding = env.DB;
  if (!binding) throw new Error('The D1 binding "DB" is missing. Add it to wrangler.jsonc (d1_databases).');
  let db = cache.get(binding);
  if (!db) {
    db = drizzle(binding, { schema });
    cache.set(binding, db);
  }
  return db;
}
