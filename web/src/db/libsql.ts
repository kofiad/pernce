import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import type { DbClient } from "./batch";

/** What the libSQL connection reads from the environment. */
export type LibsqlEnv = { DATABASE_URL?: string; DATABASE_AUTH_TOKEN?: string };

let cached: { key: string; db: DbClient } | null = null;

/** libSQL for the Vercel host, local development and the scripts: a
 * `file:local.db` SQLite file, or a Turso `libsql://…` database (the
 * personal instance). Connects on first use rather than at import, so the
 * server builds without database settings (Vercel preview builds, whose
 * settings are Production-only), and the client is reused across requests
 * on a warm instance. */
export function libsqlFromEnv(env: LibsqlEnv): DbClient {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local; `file:local.db` works for local development.",
    );
  }
  const authToken = env.DATABASE_AUTH_TOKEN || undefined;
  const key = `${url}\n${authToken ?? ""}`;
  if (cached?.key !== key) cached = { key, db: drizzle(createClient({ url, authToken }), { schema }) };
  return cached.db;
}
