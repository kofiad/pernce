import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { OLD_IDB_NAME, OLD_SNAPSHOT_KEY } from "./legacyPool";
import { loadOldNameSnapshot } from "./webStore";

const STORE = "snapshots";

const names = async () => (await indexedDB.databases()).map((d) => d.name);

/** Creates the old-name database as the pre-rename web build did. */
function createOld(entries: Record<string, unknown>, withStore = true): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OLD_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (withStore) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!withStore) {
        db.close();
        return resolve();
      }
      const tx = db.transaction(STORE, "readwrite");
      for (const [key, value] of Object.entries(entries)) tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(OLD_IDB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

test("no old-name database: null, and it isn't created", async () => {
  assert.equal(await loadOldNameSnapshot(), null);
  assert.ok(!(await names()).includes(OLD_IDB_NAME));
});

test("old-name database with a snapshot: returns it and leaves it in place", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  await createOld({ [OLD_SNAPSHOT_KEY]: bytes });
  assert.deepEqual(await loadOldNameSnapshot(), bytes);
  assert.ok((await names()).includes(OLD_IDB_NAME), "kept as a safety copy");
  assert.deepEqual(await loadOldNameSnapshot(), bytes, "reading doesn't consume it");
});

test("old-name database without the key, with an empty or foreign value, or without the store: null", async () => {
  await createOld({ other: new Uint8Array([9]) });
  assert.equal(await loadOldNameSnapshot(), null);
  await new Promise<void>((r) => (indexedDB.deleteDatabase(OLD_IDB_NAME).onsuccess = () => r()));
  await createOld({ [OLD_SNAPSHOT_KEY]: new Uint8Array(0) });
  assert.equal(await loadOldNameSnapshot(), null);
  await new Promise<void>((r) => (indexedDB.deleteDatabase(OLD_IDB_NAME).onsuccess = () => r()));
  await createOld({ [OLD_SNAPSHOT_KEY]: "not bytes" });
  assert.equal(await loadOldNameSnapshot(), null);
  await new Promise<void>((r) => (indexedDB.deleteDatabase(OLD_IDB_NAME).onsuccess = () => r()));
  await createOld({}, false);
  assert.equal(await loadOldNameSnapshot(), null);
});
