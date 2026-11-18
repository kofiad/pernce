import { eq, sql } from "drizzle-orm";
import { CURRENCIES, SYNC_LIMITS, type PulledRecord, type SyncRecord } from "@pernce/core";
import { accounts } from "../db/schema";
import { notifyChange } from "../data/changes";
import type { DB } from "../data/db";
import { SyncApiError } from "./api";
import { COLLECTION_BY_NAME, toPayload } from "./collections";
import type { SyncContext } from "./context";
import { decryptRecord, encryptRecord, unwrapDataKey } from "./crypto";
import { applyIncoming, type IncomingRecord } from "./merge";
import { collectOutbox } from "./outbox";
import {
  getCursor,
  getKeyVersion,
  getSyncStatus,
  recordSyncResult,
  repullIfCurrenciesChanged,
  setCursor,
  setKeyVersion,
  setPushMark,
  setSyncState,
} from "./state";

/** Identifies the set of currencies this build accepts (see
 * repullIfCurrenciesChanged). */
const CURRENCY_SIGNATURE = CURRENCIES.map((c) => c.code).join(",");

/** One sync run: pull every change since the cursor and merge it, then
 * push this device's outbox (docs/mobile-scope.md §5.2). Pulling first
 * means collisions are settled before anything is pushed, so the push
 * already carries the settled rows. */

export type SyncResult =
  | { ok: true; pulled: number; pushed: number; rejected: number }
  | { ok: false; error: string };

/** How often an idle poll refreshes the "last synced" time. */
const QUIET_STAMP_MS = 5 * 60 * 1000;

/** How an error that stops a pulled page from being saved begins. */
export const PULL_SAVE_FAILED = "Couldn't save downloaded changes";

/** The data key changed on the server and this device can't follow. */
class NeedsKey extends Error {}

/** Never throws: the outcome is also stored for the sync status screen. */
export async function runSync(ctx: SyncContext): Promise<SyncResult> {
  const { db } = ctx;
  if (getSyncStatus(db).state !== "on") return { ok: false, error: "Sync is off." };
  const before = getSyncStatus(db);
  let result: SyncResult;
  let changed = true;
  try {
    repullIfCurrenciesChanged(db, ctx.currencySignature ?? CURRENCY_SIGNATURE);
    const counts = await syncPass(ctx, true);
    result = { ok: true, ...counts };
    // A poll that found nothing is the common case: leave the database and
    // the screens alone (every notify re-runs every query, which is slow on
    // web), and refresh the "last synced" stamp only now and then.
    const quiet = counts.pulled + counts.pushed + counts.rejected === 0 && before.lastError === null;
    changed = !quiet;
    const fresh = before.lastSyncAt !== null && Date.now() - new Date(before.lastSyncAt).getTime() < QUIET_STAMP_MS;
    if (!(quiet && fresh)) recordSyncResult(db, { error: null, rejected: counts.rejected });
  } catch (e) {
    rollBackLeftover(db);
    result = { ok: false, error: describeError(e) };
    // A signed-out or locked-out state explains itself on the status screen.
    if (getSyncStatus(db).state === "on") recordSyncResult(db, { error: result.error });
    changed = result.error !== before.lastError || getSyncStatus(db).state !== before.state;
  }
  if (changed) notifyChange();
  return result;
}

export function describeError(e: unknown): string {
  if (e instanceof NeedsKey) return e.message;
  if (e instanceof SyncApiError) {
    if (e.code === "network") return "Offline. Changes will sync when you're back online.";
    if (e.code === "unauthorized") return "Signed out. Sign in again to keep syncing.";
    return e.message;
  }
  // Drizzle wraps the driver's error ("Failed to run the query 'begin'"),
  // so the real reason is further down the cause chain.
  const parts: string[] = [];
  for (let c: unknown = e; c != null && parts.length < 5; c = c instanceof Error ? c.cause : null) {
    const message = (c instanceof Error ? c.message : String(c)).trim();
    if (message && !parts.includes(message)) parts.push(message);
  }
  return parts.join(": ") || "Unknown error";
}

/** A transaction that failed half way (e.g. its rollback failed too) can
 * leave the connection inside it, and then every later transaction fails
 * at "begin". Data-layer calls are synchronous, so nothing else can have a
 * transaction open here: roll back whatever is left. */
function rollBackLeftover(db: DB) {
  try {
    db.run(sql`rollback`);
  } catch {
    // No transaction was open.
  }
}

type Counts = { pulled: number; pushed: number; rejected: number };

async function syncPass(ctx: SyncContext, mayFollowKeyChange: boolean): Promise<Counts> {
  const { db, api, secrets } = ctx;
  const dataKey = await secrets.getDataKey();
  if (!dataKey) {
    setSyncState(db, "needs_key");
    throw new NeedsKey("This device needs your recovery key to read synced data.");
  }
  const keyVersion = getKeyVersion(db);
  const followKeyChange = async (): Promise<Counts> => {
    if (!mayFollowKeyChange) throw new Error("Your encryption key keeps changing. Try again in a minute.");
    await adoptServerKey(ctx);
    return syncPass(ctx, false);
  };

  let pulled = 0;
  let rejected = 0;
  for (;;) {
    const page = await api.pull(getCursor(db));
    if (page.keyVersion !== keyVersion) return followKeyChange();
    const incoming: IncomingRecord[] = [];
    for (const r of page.records) {
      if (alreadyHave(db, r)) continue;
      if (r.deleted) {
        incoming.push({ ...r, payload: null });
        continue;
      }
      try {
        if (r.keyVersion !== keyVersion || !r.ciphertext) throw new Error("Encrypted with an old key");
        incoming.push({ ...r, payload: decryptRecord(dataKey, r.collection, r.id, r.ciphertext) });
      } catch {
        rejected++;
      }
    }
    try {
      rejected += applyIncoming(db, incoming, (tx) => setCursor(tx, page.cursor)).length;
    } catch (e) {
      // Nothing after this page arrives until it applies, so say so.
      throw new Error(PULL_SAVE_FAILED, { cause: e });
    }
    pulled += incoming.length;
    if (incoming.length > 0) notifyChange();
    if (!page.hasMore) break;
  }

  const { rows, mark } = collectOutbox(db);
  const records: SyncRecord[] = [];
  let tooLarge = 0;
  for (const { def, row } of rows) {
    const ciphertext = row.deleted ? null : encryptRecord(dataKey, def.collection, row.id, toPayload(row));
    if (ciphertext && ciphertext.length > SYNC_LIMITS.recordCiphertext) {
      tooLarge++;
      continue;
    }
    records.push({ id: row.id, collection: def.collection, hlc: row.updatedAt, deleted: row.deleted, keyVersion, ciphertext });
  }
  try {
    for (let i = 0; i < records.length; i += SYNC_LIMITS.pushRecords) {
      // `stale` ids: the server has a later write. The next pull brings it.
      await api.push(records.slice(i, i + SYNC_LIMITS.pushRecords));
    }
  } catch (e) {
    if (e instanceof SyncApiError && e.code === "key_changed") return followKeyChange();
    // The mark stays put, so the whole outbox goes again next time; the
    // server ignores what it already has.
    throw e;
  }
  setPushMark(db, mark);
  if (tooLarge > 0) throw new Error(`${tooLarge} change${tooLarge === 1 ? " is" : "s are"} too large to sync (very long notes?).`);
  return { pulled, pushed: records.length, rejected };
}

/** Skips decrypting what this device already has (including the echo of
 * its own pushes). */
function alreadyHave(db: DB, r: PulledRecord) {
  const def = COLLECTION_BY_NAME.get(r.collection);
  if (!def) return false;
  const t = def.table as unknown as typeof accounts;
  const local = db.select({ updatedAt: t.updatedAt }).from(t).where(eq(t.id, r.id)).get();
  return !!local && local.updatedAt >= r.hlc;
}

/** Another device replaced the data key (it "started over"). If the new
 * key opens with this device's password-derived wrap key, switch to it and
 * resync everything: pull it all again, and push every local row under the
 * new key, which also restores anything the wipe took that only this
 * device still had. Otherwise this device needs the recovery key. */
export async function adoptServerKey(ctx: SyncContext) {
  const { db, api, secrets } = ctx;
  const keys = await api.getKeys();
  if (keys.keyVersion === getKeyVersion(db)) return;
  const wrapKey = await secrets.getWrapKey();
  const dataKey = wrapKey && keys.wrappedKeyPassword ? unwrapDataKey(wrapKey, keys.wrappedKeyPassword) : null;
  setKeyVersion(db, keys.keyVersion, { resync: true });
  await secrets.setDataKey(dataKey);
  if (!dataKey) {
    setSyncState(db, "needs_key");
    throw new NeedsKey("Your encryption key changed on another device. Enter your recovery key to keep syncing.");
  }
}
