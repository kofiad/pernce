// Test-only: runs the app's own drizzle-orm/expo-sqlite driver and bundled
// migrations against Node's built-in SQLite, so data-layer tests exercise
// the same SQL the phone does without a device or a native test dependency.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import type { SQLiteDatabase } from "expo-sqlite";
import * as schema from "../db/schema";
import { migrations } from "../db/migrations";
import type { DB } from "./db";

/** The slice of expo-sqlite's SQLiteDatabase that drizzle's driver calls. */
function expoShim(sqlite: DatabaseSync) {
  return {
    prepareSync(source: string) {
      const stmt = sqlite.prepare(source);
      return {
        executeSync(params: SQLInputValue[] = []) {
          let ran: { changes: number | bigint; lastInsertRowid: number | bigint } | null = null;
          const run = () => (ran ??= stmt.run(...params));
          return {
            get changes() {
              return Number(run().changes);
            },
            get lastInsertRowId() {
              return Number(run().lastInsertRowid);
            },
            getAllSync: () => stmt.all(...params),
            getFirstSync: () => stmt.get(...params) ?? null,
          };
        },
        executeForRawResultSync(params: SQLInputValue[] = []) {
          return {
            getAllSync: () => {
              stmt.setReturnArrays(true);
              try {
                return stmt.all(...params);
              } finally {
                stmt.setReturnArrays(false);
              }
            },
          };
        },
        finalizeSync() {},
      };
    },
  };
}

/** A fresh in-memory database with every bundled migration, or only the
 * first `upTo` (finish with migrateTestDb), to test a migration's effect on
 * data written before it. */
export async function createTestDb(upTo?: number): Promise<DB> {
  const sqlite = new DatabaseSync(":memory:");
  const db = drizzle(expoShim(sqlite) as unknown as SQLiteDatabase, { schema });
  if (upTo === undefined) await migrate(db, migrations);
  else await migrate(db, { ...migrations, journal: { ...migrations.journal, entries: migrations.journal.entries.slice(0, upTo) } });
  return db;
}

/** Applies the bundled migrations a createTestDb(upTo) database is missing. */
export async function migrateTestDb(db: DB) {
  await migrate(db, migrations);
}
