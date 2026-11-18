/** Which file the phones' database lives in (client.ts). The app was
 * renamed from Perance to Pernce while keeping its native bundle ID (until
 * the ID itself changed in 2026.11; see mobile/README.md), so copies
 * installed before the rename keep their data in `perance.db`: that file is used
 * permanently when it exists (nothing is moved or copied, so its journal
 * files stay with it). Fresh installs start with the new name. Pure, so
 * it's tested in Node. */

export const LEGACY_DATABASE_NAME = "perance.db";
export const DATABASE_NAME = "pernce.db";

/** `legacyExists` and `currentExists` are the results of looking for each
 * file, or null where the look itself failed. The legacy file wins when it
 * exists; a failed look at it falls back to the current file if that one
 * exists; only if neither look worked is the legacy name used, which opens
 * the data on an upgraded phone and is harmless on a fresh install. */
export function chooseDatabaseName(legacyExists: boolean | null, currentExists: boolean | null = false): string {
  if (legacyExists) return LEGACY_DATABASE_NAME;
  if (legacyExists === false) return DATABASE_NAME;
  if (currentExists) return DATABASE_NAME;
  return LEGACY_DATABASE_NAME;
}

/** A native directory path as a file URI (expo-file-system wants a scheme). */
export function directoryUri(path: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path) ? path : `file://${path}`;
}
