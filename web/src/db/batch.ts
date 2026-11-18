import type { BatchItem } from "drizzle-orm/batch";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/** The database every data-layer function takes: libSQL (Turso, local
 * files, the in-memory databases scripts/ and test/ use) or Cloudflare D1.
 * Both are Drizzle async SQLite databases, so queries are written once;
 * the one thing that differs in type is `batch()`, which runBatch() wraps.
 * Each host builds its own (src/db/libsql.ts, src/db/d1.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the run-result type differs per driver
export type DbClient = BaseSQLiteDatabase<"async", any, typeof schema>;

/** D1 has no interactive transactions, so a write that must be all-or-
 * nothing is built as a list of statements and sent in one batch, which
 * both D1 and libSQL run as a single SQL transaction. Reads that decide
 * what to write happen before the batch; when the batch must not commit if
 * what was read has changed since, it includes a guard: a statement that
 * fails, rolling the batch back, if the rows it read have changed (see
 * push() in src/sync/records.ts), or conditions on each write that make it
 * a no-op instead (see mutations.ts). */
export async function runBatch(dbClient: DbClient, statements: BatchItem<"sqlite">[]): Promise<unknown[]> {
  if (statements.length === 0) return [];
  // Both drivers' databases have batch(); the shared base class doesn't.
  const batch = (dbClient as unknown as { batch(s: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]): Promise<unknown[]> })
    .batch;
  return batch.call(dbClient, statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

/** SQLite caps bound parameters per statement (D1 at 100), so multi-row
 * inserts are split into chunks of rows. */
export function chunkRows<T>(rows: T[], columnsPerRow: number, maxParams = 100): T[][] {
  const size = Math.max(1, Math.floor(maxParams / columnsPerRow));
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}
