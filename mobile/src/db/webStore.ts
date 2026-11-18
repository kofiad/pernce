import {
  asSnapshot,
  DATABASE_PATH,
  isHotJournal,
  OLD_IDB_NAME,
  OLD_SNAPSHOT_KEY,
  POOL_DIRECTORY,
  POOL_HEADER_SIZE,
  poolFilePath,
  sqliteImage,
} from "./legacyPool";

/** Web only (client.web.ts): where the in-memory database is saved between
 * visits, the one-tab-at-a-time lock, and the move from the old OPFS pool. */

const IDB_NAME = "pernce";
const IDB_STORE = "snapshots";
const SNAPSHOT_KEY = "pernce.db";
const TAB_LOCK = "pernce-db";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let opened: Promise<IDBDatabase> | null = null;

async function store(mode: IDBTransactionMode) {
  opened ??= idb();
  return (await opened).transaction(IDB_STORE, mode).objectStore(IDB_STORE);
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The last saved copy of the database file, if any. */
export async function loadSnapshot(): Promise<Uint8Array | null> {
  const value: unknown = await done((await store("readonly")).get(SNAPSHOT_KEY));
  return asSnapshot(value);
}

/** The copy saved under the app's old name (before the rename to Pernce),
 * if any; null when that database doesn't exist or can't be read. It is
 * never written or deleted, so it stays as a safety copy. Opening it
 * doesn't create it: the upgrade that would is aborted. */
export async function loadOldNameSnapshot(): Promise<Uint8Array | null> {
  try {
    const database = await new Promise<IDBDatabase | null>((resolve, reject) => {
      const req = indexedDB.open(OLD_IDB_NAME);
      req.onupgradeneeded = () => req.transaction?.abort(); // it didn't exist
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => (req.error?.name === "AbortError" ? resolve(null) : reject(req.error));
    });
    if (!database) return null;
    try {
      if (!database.objectStoreNames.contains(IDB_STORE)) return null;
      const objects = database.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE);
      return asSnapshot(await done(objects.get(OLD_SNAPSHOT_KEY)));
    } finally {
      database.close();
    }
  } catch (e) {
    console.warn("Couldn't read the web database saved under the old name", e);
    return null;
  }
}

/** Replaces the saved copy. An IndexedDB write is all or nothing, so a
 * crash keeps the previous copy rather than half of this one. */
export async function saveSnapshot(bytes: Uint8Array): Promise<void> {
  await done((await store("readwrite")).put(bytes, SNAPSHOT_KEY));
}

/** Two tabs would each keep their own copy in memory and overwrite each
 * other's saves, so only one tab opens the database. Resolves once this tab
 * holds the lock (for as long as it's open). If another tab has it, this
 * throws, and the page reloads by itself when that tab closes. */
export async function lockThisTab(): Promise<void> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return;
  const held = new Promise<never>(() => {});
  const got = await new Promise<boolean>((resolve, reject) => {
    locks
      .request(TAB_LOCK, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        return lock ? held : undefined;
      })
      .catch(reject);
  });
  if (got) return;
  void locks.request(TAB_LOCK, () => {
    location.reload();
    return held;
  });
  throw new Error("Pernce is open in another tab. Close that tab to use it here.");
}

/** The database file from the old OPFS pool, read straight from the pool
 * files (no SQLite, so it can't deadlock), or null if there isn't a usable
 * one. Call it before anything starts expo-sqlite's worker, which takes the
 * pool files' access handles. */
export async function readLegacyDatabase(): Promise<Uint8Array | null> {
  const dir = await legacyDirectory();
  if (!dir) return null;
  const files = new Map<string, File>();
  for await (const handle of dir.values()) {
    if (handle.kind !== "file") continue;
    const file = await handle.getFile();
    const path = poolFilePath(new Uint8Array(await file.slice(0, POOL_HEADER_SIZE).arrayBuffer()));
    if (path) files.set(path, file);
  }
  const contents = async (path: string) => {
    const file = files.get(path);
    return file ? new Uint8Array(await file.slice(POOL_HEADER_SIZE).arrayBuffer()) : null;
  };
  for (const side of [`${DATABASE_PATH}-journal`, `${DATABASE_PATH}-wal`]) {
    const bytes = await contents(side);
    if (bytes && isHotJournal(bytes)) {
      console.warn(`The old web database has unfinished changes (${side}); it will be downloaded again.`);
      return null;
    }
  }
  const main = await contents(DATABASE_PATH);
  return main ? sqliteImage(main) : null;
}

/** Deletes the old pool once its database is saved elsewhere. expo-sqlite's
 * worker makes a new, empty one when it starts; that one is never used. */
export async function removeLegacyDatabase(): Promise<void> {
  try {
    await (await navigator.storage.getDirectory()).removeEntry(POOL_DIRECTORY, { recursive: true });
  } catch (e) {
    // Most likely a tab of an older build still has it open.
    console.warn("Couldn't remove the old web database", e);
  }
}

async function legacyDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(POOL_DIRECTORY);
  } catch {
    return null;
  }
}
