/** Reading the database the web app used to keep in OPFS, without opening
 * it through SQLite. The web build used to store it with expo-sqlite's
 * AccessHandlePoolVFS (wa-sqlite), which Safari can deadlock on (README.md,
 * "Web"). That VFS keeps every SQLite file in a pool file named at random in
 * the `expo-sqlite/` directory: a 4096-byte header (the SQLite path,
 * null-terminated, in bytes 0–512, then 4 bytes of open flags and an 8-byte
 * digest of both), and the file's contents after it. Pure functions, so
 * they're tested in Node. */

export const POOL_DIRECTORY = "expo-sqlite";
/** The path the old web builds gave the database, before the rename to Pernce
 * (kept so their pool files are still found). */
export const DATABASE_PATH = "/perance.db";

export const POOL_HEADER_SIZE = 4096;
const PATH_SIZE = 512;
const CORPUS_SIZE = PATH_SIZE + 4;

/** The SQLite path a pool file holds, or null for a free or damaged one.
 * `header` is the file's first 4096 bytes. */
export function poolFilePath(header: Uint8Array): string | null {
  if (header.length < CORPUS_SIZE + 8 || header[0] === 0) return null;
  const corpus = header.subarray(0, CORPUS_SIZE);
  const stored = new DataView(header.buffer, header.byteOffset + CORPUS_SIZE, 8);
  const [d1, d2] = digest(corpus);
  // The VFS writes the digest as a native (little-endian) Uint32Array.
  if (stored.getUint32(0, true) !== d1 || stored.getUint32(4, true) !== d2) return null;
  const end = corpus.indexOf(0);
  return new TextDecoder().decode(corpus.subarray(0, end < 0 ? PATH_SIZE : Math.min(end, PATH_SIZE)));
}

/** AccessHandlePoolVFS's header digest (cyrb53-style). */
function digest(corpus: Uint8Array): [number, number] {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const value of corpus) {
    h1 = Math.imul(h1 ^ value, 2654435761);
    h2 = Math.imul(h2 ^ value, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

/** Whether a journal or WAL file (its contents, after the pool header)
 * still holds changes. A hot rollback journal means a transaction was cut
 * off and the main file may be half written; only SQLite can repair that,
 * through the VFS this is avoiding. */
export function isHotJournal(contents: Uint8Array): boolean {
  return contents.length > 0 && contents.some((b) => b !== 0);
}

/** The database file inside a pool file's contents, trimmed to the size its
 * header gives, or null if it isn't a usable SQLite database. */
export function sqliteImage(contents: Uint8Array): Uint8Array | null {
  const magic = "SQLite format 3\0";
  if (contents.length < 100) return null;
  for (let i = 0; i < magic.length; i++) if (contents[i] !== magic.charCodeAt(i)) return null;
  const view = new DataView(contents.buffer, contents.byteOffset, contents.byteLength);
  const raw = view.getUint16(16);
  const pageSize = raw === 1 ? 65536 : raw;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) return null;
  const pages = view.getUint32(28);
  // The in-header page count is valid only if the change counter matches
  // "version-valid-for" (sqlite.org/fileformat.html, 1.3.7).
  const counted = pages > 0 && view.getUint32(24) === view.getUint32(92) ? pages * pageSize : contents.length;
  if (counted > contents.length || counted % pageSize !== 0) return null;
  return contents.slice(0, counted);
}

/** The IndexedDB database and key the web app saved its database under
 * before the rename to Pernce (webStore.ts reads it once; it is kept as a
 * safety copy). */
export const OLD_IDB_NAME = "perance";
export const OLD_SNAPSHOT_KEY = "perance.db";

/** A stored IndexedDB value as a database image, or null if it isn't one. */
export function asSnapshot(value: unknown): Uint8Array | null {
  return value instanceof Uint8Array && value.length > 0 ? value : null;
}

/** Which saved copy to start from: this build's own, else the one saved
 * under the old name. `fromOldName` says the old one was used, so the
 * caller saves it under the new name. */
export function chooseSnapshot(current: unknown, oldName: unknown): { bytes: Uint8Array | null; fromOldName: boolean } {
  const own = asSnapshot(current);
  if (own) return { bytes: own, fromOldName: false };
  const old = asSnapshot(oldName);
  return { bytes: old, fromOldName: old !== null };
}
