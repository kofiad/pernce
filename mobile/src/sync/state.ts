import type { DB } from "../data/db";
import { getMeta, setMeta } from "../data/meta";

/** Sync bookkeeping in the device-local `meta` table, so screens can read
 * it synchronously with useData. Secrets (tokens, keys) are never stored
 * here; they live in the platform keychain (see SecretStore). */

const K = {
  state: "sync_state",
  user: "sync_user",
  server: "sync_server",
  keyVersion: "sync_key_version",
  cursor: "sync_cursor",
  pushedHlc: "sync_pushed_hlc",
  pushAll: "sync_push_all",
  lastSyncAt: "sync_last_at",
  lastError: "sync_last_error",
  rejected: "sync_rejected",
  failingSince: "sync_failing_since",
  failures: "sync_failures",
  currencies: "sync_currencies",
} as const;

/**
 * - `on`: signed in with the data key; syncing.
 * - `needs_key`: signed in, but the data key can't be opened with the
 *   password (after a password reset). Needs the recovery key, a device
 *   that still has the key, or starting over.
 * - `signed_out`: the server ended the session (e.g. a password reset on
 *   another device). Sign in again; local data is untouched.
 */
export type SyncState = "on" | "needs_key" | "signed_out";

export type SyncUser = { id: string; email: string };

export type SyncStatus = {
  state: SyncState | "off";
  user: SyncUser | null;
  server: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Pulled changes that failed validation and were skipped. */
  rejected: number;
  /** When the current run of failed syncs began, and how many failed in a
   * row; null and 0 after a sync that worked. */
  failingSince: string | null;
  failures: number;
};

export function getSyncStatus(db: DB): SyncStatus {
  const state = getMeta(db, K.state) as SyncState | null;
  const user = getMeta(db, K.user);
  return {
    state: state ?? "off",
    user: user ? (JSON.parse(user) as SyncUser) : null,
    server: getMeta(db, K.server),
    lastSyncAt: getMeta(db, K.lastSyncAt),
    lastError: getMeta(db, K.lastError),
    rejected: Number(getMeta(db, K.rejected) ?? 0),
    failingSince: getMeta(db, K.failingSince),
    failures: Number(getMeta(db, K.failures) ?? 0),
  };
}

export function setSyncState(db: DB, state: SyncState | null) {
  setMeta(db, K.state, state);
}

export function getSyncUser(db: DB): SyncUser | null {
  return getSyncStatus(db).user;
}

/** Signing in as `user`. A different account than last time starts from
 * an empty cursor. Either way every local row is offered to the server
 * once, so data made while offline (or under another account) is
 * uploaded; the server ignores what it already has. */
export function beginSession(db: DB, user: SyncUser, keyVersion: number) {
  const previous = getSyncUser(db);
  if (previous?.id !== user.id) {
    setMeta(db, K.cursor, null);
    setMeta(db, K.rejected, null);
  }
  setMeta(db, K.user, JSON.stringify(user));
  setMeta(db, K.keyVersion, String(keyVersion));
  setMeta(db, K.pushAll, "1");
  setMeta(db, K.lastError, null);
  setMeta(db, K.failingSince, null);
  setMeta(db, K.failures, null);
}

/** Signed out on purpose: forget everything about the account. Local data
 * stays. */
export function clearSyncState(db: DB) {
  for (const key of Object.values(K)) setMeta(db, key, null);
}

/** The sync server's origin, chosen on the sign-in screen. */
export function getServer(db: DB): string | null {
  return getMeta(db, K.server);
}

export function setServer(db: DB, url: string) {
  setMeta(db, K.server, url.trim().replace(/\/+$/, ""));
}

export function getKeyVersion(db: DB): number {
  return Number(getMeta(db, K.keyVersion) ?? 0);
}

/** A new data key: everything is pulled again and re-pushed under it. */
export function setKeyVersion(db: DB, keyVersion: number, { resync }: { resync: boolean }) {
  setMeta(db, K.keyVersion, String(keyVersion));
  if (resync) {
    setMeta(db, K.cursor, null);
    setMeta(db, K.pushAll, "1");
  }
}

/** Records in a currency this build didn't know were skipped, and the
 * cursor moved past them. When the supported set changes (an app update),
 * pull everything again so they are applied; what is already held is
 * ignored. `signature` identifies the set. */
export function repullIfCurrenciesChanged(db: DB, signature: string) {
  if (getMeta(db, K.currencies) === signature) return;
  setMeta(db, K.currencies, signature);
  setMeta(db, K.cursor, null);
  setMeta(db, K.rejected, null);
}

export function getCursor(db: DB): number {
  return Number(getMeta(db, K.cursor) ?? 0);
}

export function setCursor(db: DB, cursor: number) {
  setMeta(db, K.cursor, String(cursor));
}

export function getPushMark(db: DB): { all: boolean; since: string | null } {
  return { all: getMeta(db, K.pushAll) === "1", since: getMeta(db, K.pushedHlc) };
}

/** Everything this device wrote up to `hlc` is on the server. */
export function setPushMark(db: DB, hlc: string | null) {
  setMeta(db, K.pushedHlc, hlc);
  setMeta(db, K.pushAll, null);
}

export function recordSyncResult(db: DB, result: { error: string | null; rejected?: number; at?: string }) {
  const at = result.at ?? new Date().toISOString();
  if (result.error === null) {
    setMeta(db, K.lastSyncAt, at);
    setMeta(db, K.failingSince, null);
    setMeta(db, K.failures, null);
  } else {
    const { failingSince, failures } = getSyncStatus(db);
    setMeta(db, K.failingSince, failingSince ?? at);
    setMeta(db, K.failures, String(failures + 1));
  }
  setMeta(db, K.lastError, result.error);
  if (result.rejected) setMeta(db, K.rejected, String(getSyncStatus(db).rejected + result.rejected));
}
