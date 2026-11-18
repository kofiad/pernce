import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { randomUUID } from "expo-crypto";
import { deserializeDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { subscribeChanges } from "../data/changes";
import type { DB } from "../data/db";
import { setUuidGenerator } from "../data/ids";
import { migrations } from "./migrations";
import * as schema from "./schema";
import { chooseSnapshot } from "./legacyPool";
import { loadOldNameSnapshot, loadSnapshot, lockThisTab, readLegacyDatabase, removeLegacyDatabase, saveSnapshot } from "./webStore";

// The web's database (client.ts is the phones'). expo-sqlite runs SQLite in
// a worker, and each synchronous call spins the page's main thread until the
// worker answers. With the database in OPFS that deadlocks in Safari: the
// worker's OPFS writes wait on the main thread, which is spinning (README.md,
// "Web"). So SQLite keeps the database in memory, where nothing touches
// OPFS, and the whole file (a few hundred KB) is saved to IndexedDB shortly
// after each change, and loaded from there at start.

/** How long after a change the database is saved. A tab killed within this
 * window loses that change. */
const SAVE_DELAY_MS = 300;
/** Catches writes that don't notify (sync bookkeeping, for one). */
const SAVE_CHECK_MS = 2000;

setUuidGenerator(randomUUID);

let sqlite: SQLiteDatabase | null = null;
let opened: DB | null = null;

/** The database, once prepareDatabase() has resolved (the root layout waits
 * for it before rendering anything). */
export const db: DB = new Proxy({} as DB, {
  get(_, key) {
    if (!opened) throw new Error("The database isn't open yet; await prepareDatabase() first.");
    const value = Reflect.get(opened, key, opened);
    return typeof value === "function" ? value.bind(opened) : value;
  },
});

let ready: Promise<void> | null = null;

/** Takes this tab's lock, loads the saved database (or the old OPFS one,
 * once) and applies bundled migrations, once per launch. */
export function prepareDatabase() {
  ready ??= openDatabase().catch((e: unknown) => {
    throw inUseElsewhere(e) ? new Error(IN_USE, { cause: e }) : e;
  });
  return ready;
}

const IN_USE =
  "Pernce’s storage is still open in another window or tab, maybe one running an older version. Quit the browser (on a Mac, ⌘Q) and open Pernce again.";

/** OPFS files (the old pool, which expo-sqlite's worker also opens) can be
 * held by a page this tab's lock doesn't cover: one still running a build
 * from before it, or a page that hung. The browser then refuses access
 * (Safari: "The object is in an invalid state."). The worker passes errors
 * on as messages only, so match those too. */
function inUseElsewhere(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  const message = e instanceof Error ? e.message : String(e);
  return (
    name === "InvalidStateError" ||
    name === "NoModificationAllowedError" ||
    /invalid state|modifications are not allowed|can ?not be modified/i.test(message)
  );
}

async function openDatabase() {
  await lockThisTab();
  const own = await loadSnapshot();
  // Once, after the rename to Pernce: pick up the copy saved under the old
  // IndexedDB name and save it under the new one (the old stays untouched).
  const { bytes: first, fromOldName } = chooseSnapshot(own, own ? null : await loadOldNameSnapshot());
  let bytes = first;
  if (bytes && fromOldName) {
    // Never save a damaged copy under the new name: fall through to the
    // next source, as for the old OPFS database below.
    if (await imageIntact(bytes)) await saveSnapshot(bytes);
    else {
      console.warn("The web database saved under the old name is damaged; ignoring it.");
      bytes = null;
    }
  }
  const fromLegacy = !bytes && (bytes = await readLegacyDatabase()) !== null;
  if (bytes && fromLegacy) {
    // Before the worker starts: it holds the old pool's files open.
    await saveSnapshot(bytes);
    await removeLegacyDatabase();
  }
  sqlite = await openSaved(bytes);
  if (fromLegacy && !(await isIntact(sqlite))) {
    console.warn("The old web database is damaged; it will be downloaded again.");
    await sqlite.closeAsync();
    sqlite = await openSaved(null);
  }
  opened = drizzle(sqlite, { schema });
  await migrate(opened, migrations);
  await save(true);
  startSaving();
}

function openSaved(bytes: Uint8Array | null) {
  return bytes ? deserializeDatabaseAsync(bytes) : openDatabaseAsync(":memory:");
}

/** Whether a saved database image opens and passes SQLite's quick check. */
async function imageIntact(bytes: Uint8Array) {
  let database: SQLiteDatabase | null = null;
  try {
    database = await deserializeDatabaseAsync(bytes);
    return await isIntact(database);
  } catch {
    return false;
  } finally {
    await database?.closeAsync().catch(() => {});
  }
}

async function isIntact(database: SQLiteDatabase) {
  try {
    const row = await database.getFirstAsync<{ quick_check: string }>("PRAGMA quick_check");
    return row?.quick_check === "ok";
  } catch {
    return false;
  }
}

/** total_changes() when the database was last saved. */
let savedChanges = -1;
let saving: Promise<void> | null = null;
let again = false;

/** Saves the database if anything changed since the last save (or always,
 * with `force`). One save at a time; a request during one runs after it. */
function save(force = false): Promise<void> {
  if (saving) {
    again = true;
    return saving;
  }
  saving = (async () => {
    if (!sqlite) return;
    try {
      // Read before serialising: a change in between is saved now and
      // counted next time, so it's saved twice rather than missed.
      const changes = (await sqlite.getFirstAsync<{ n: number }>("select total_changes() as n"))?.n ?? -1;
      if (!force && changes === savedChanges) return;
      await saveSnapshot(await sqlite.serializeAsync());
      savedChanges = changes;
    } catch (e) {
      console.error("Couldn't save the database", e);
    }
  })().finally(() => {
    saving = null;
    if (again) {
      again = false;
      void save();
    }
  });
  return saving;
}

function startSaving() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  subscribeChanges(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, SAVE_DELAY_MS);
  });
  setInterval(() => void save(), SAVE_CHECK_MS);
  // Leaving the page: save now rather than after the delay. The browser may
  // not wait for it, so the delay stays short.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void save();
  });
  window.addEventListener("pagehide", () => void save());
}
