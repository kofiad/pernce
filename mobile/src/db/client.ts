import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { defaultDatabaseDirectory, openDatabaseSync } from "expo-sqlite";
import type { DB } from "../data/db";
import { setUuidGenerator } from "../data/ids";
import { chooseDatabaseName, DATABASE_NAME, directoryUri, LEGACY_DATABASE_NAME } from "./databaseName";
import { migrations } from "./migrations";
import * as schema from "./schema";

// The phones' database (client.web.ts is the web's). expo-sqlite's
// synchronous API is what drizzle's expo driver uses, so every data-layer
// call is a plain synchronous function.
setUuidGenerator(randomUUID);

/** perance.db if this phone already has it (see databaseName.ts), else
 * pernce.db. If looking for perance.db fails, look for pernce.db; if that
 * fails too, the legacy name is the safe one: opening it creates it on a
 * fresh install, and finds the data otherwise. */
function databaseName() {
  const look = (name: string) => {
    try {
      return new File(directoryUri(defaultDatabaseDirectory), name).exists;
    } catch {
      return null;
    }
  };
  const legacy = look(LEGACY_DATABASE_NAME);
  return chooseDatabaseName(legacy, legacy === null ? look(DATABASE_NAME) : null);
}

const sqlite = openDatabaseSync(databaseName());
sqlite.execSync("PRAGMA journal_mode = WAL;");

/** The one on-device database. */
export const db: DB = drizzle(sqlite, { schema });

let ready: Promise<void> | null = null;

/** Applies bundled migrations, once per launch. */
export function prepareDatabase() {
  ready ??= migrate(db, migrations);
  return ready;
}
