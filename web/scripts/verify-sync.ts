/**
 * Checks the sync server against an in-memory libSQL database with the real
 * migrations applied (the checks are in scripts/sync-checks.ts; the same
 * ones run on a local D1 with `pnpm run db:verify:d1`). Run with:
 * pnpm run db:verify
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { join } from "node:path";
import * as schema from "../src/db/schema";
import { runSyncChecks } from "./sync-checks";

async function main() {
  console.log("Starting in-memory libSQL...");
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(import.meta.dirname, "..", "drizzle") });
  const failed = await runSyncChecks(db);
  client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Sync verification crashed:", err);
  process.exit(1);
});
