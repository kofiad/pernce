import { and, asc, eq, gt, inArray, lt, isNull, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import {
  hlcAfter,
  type PulledRecord,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncRecord,
} from "@pernce/core/sync";
import { emailTokens, syncRecords, syncSessions, syncUsers } from "../db/schema";
import { chunkRows, runBatch } from "../db/batch";
import type { SyncContext } from "./context";
import { SyncHttpError, unauthorized } from "./errors";

/** The encrypted record store (docs/sync.md). The server
 * can't read records, so all it does is keep the latest write per id and
 * hand out changes in order. Validation and merging happen on devices. */

/** Bounds one pull response, well under Vercel's 4.5 MB limit. */
const PULL_MAX_BYTES = 2 * 1024 * 1024;
const UNVERIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Last writer wins by HLC. At an equal HLC a higher key version wins, so a
 * device that re-encrypts every record under a new data key can replace
 * them without inventing new writes. */
function supersedes(a: { hlc: string; keyVersion: number }, b: { hlc: string; keyVersion: number }) {
  return hlcAfter(a.hlc, b.hlc) || (a.hlc === b.hlc && a.keyVersion > b.keyVersion);
}

const excluded = (column: AnyColumn) => sql.raw(`excluded."${column.name}"`);

/** Columns per sync_records row, for chunking inserts under SQLite's
 * bound-parameter limit. */
const RECORD_COLUMNS = 10;
/** A push whose read went stale is retried, after a short random wait so
 * pushes that collided don't collide again, this many times in all. */
const PUSH_ATTEMPTS = 6;

/** The guard in a push batch fails with this when another push (or a wipe
 * or key change) for the same user committed after this one read. */
function isStalePush(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if (e instanceof Error && e.message.includes("NOT NULL constraint failed: sync_users.seq")) return true;
  }
  return false;
}

export async function push(
  userId: string,
  records: SyncRecord[],
  ctx: SyncContext,
): Promise<SyncPushResponse> {
  // Several writes to one row in a batch: only the latest counts.
  const latest = new Map<string, SyncRecord>();
  for (const r of records) {
    const prev = latest.get(r.id);
    if (!prev || supersedes(r, prev)) latest.set(r.id, r);
  }
  const incoming = [...latest.values()];
  if (incoming.length === 0) return { accepted: [], stale: [] };

  for (let attempt = 1; ; attempt++) {
    try {
      return await tryPush(userId, incoming, ctx);
    } catch (err) {
      if (!isStalePush(err)) throw err;
      if (attempt >= PUSH_ATTEMPTS) {
        throw new SyncHttpError(503, "internal", "Another device is syncing right now. Try again in a moment.");
      }
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 * attempt));
    }
  }
}

/** Reads the user's counters and the stored versions of the incoming
 * records, then writes everything in one batch. D1 has no row locks, so
 * instead the batch starts with a guard: it sets the user's new seq only if
 * seq, storage_bytes and key_version are still what we read, and NULL
 * otherwise, which the NOT NULL constraint turns into an error that rolls
 * the whole batch back. So pushes commit in seq order and a pull cursor
 * can't skip a record that commits late, the same guarantee the old
 * SELECT ... FOR UPDATE gave. */
async function tryPush(userId: string, incoming: SyncRecord[], ctx: SyncContext): Promise<SyncPushResponse> {
  const [user] = await ctx.db
    .select({ seq: syncUsers.seq, storageBytes: syncUsers.storageBytes, keyVersion: syncUsers.keyVersion, verifiedAt: syncUsers.verifiedAt })
    .from(syncUsers)
    .where(eq(syncUsers.id, userId));
  if (!user?.verifiedAt) throw unauthorized();
  if (incoming.some((r) => r.keyVersion !== user.keyVersion)) {
    throw new SyncHttpError(409, "key_changed", "Your encryption key changed on another device. Sign in again.");
  }

  const current = new Map<string, { hlc: string; keyVersion: number; size: number }>();
  for (const ids of chunkRows(incoming.map((r) => r.id), 1, 90)) {
    const rows = await ctx.db
      .select({ id: syncRecords.id, hlc: syncRecords.hlc, keyVersion: syncRecords.keyVersion, size: syncRecords.size })
      .from(syncRecords)
      .where(and(eq(syncRecords.userId, userId), inArray(syncRecords.id, ids)));
    for (const r of rows) current.set(r.id, r);
  }

  const accepted: SyncRecord[] = [];
  const stale: string[] = [];
  let growth = 0;
  for (const r of incoming) {
    const existing = current.get(r.id);
    if (existing && !supersedes(r, existing)) {
      stale.push(r.id);
      continue;
    }
    accepted.push(r);
    growth += (r.ciphertext?.length ?? 0) - (existing?.size ?? 0);
  }
  // Shrinking is always allowed, so a user over quota can still delete.
  if (growth > 0 && user.storageBytes + growth > ctx.config.quotaBytes) {
    throw new SyncHttpError(413, "quota_exceeded", "Your sync storage is full.");
  }
  if (accepted.length === 0) return { accepted: [], stale };

  let seq = user.seq;
  const updatedAt = new Date(ctx.now());
  const rows = accepted.map((r) => ({
    userId,
    id: r.id,
    collection: r.collection,
    hlc: r.hlc,
    deleted: r.deleted,
    keyVersion: r.keyVersion,
    ciphertext: r.ciphertext,
    size: r.ciphertext?.length ?? 0,
    serverSeq: ++seq,
    updatedAt,
  }));
  const unchanged = and(
    eq(syncUsers.seq, user.seq),
    eq(syncUsers.storageBytes, user.storageBytes),
    eq(syncUsers.keyVersion, user.keyVersion),
  );
  await runBatch(ctx.db, [
    ctx.db
      .update(syncUsers)
      .set({ seq: sql`CASE WHEN ${unchanged} THEN ${seq} ELSE NULL END`, storageBytes: user.storageBytes + growth })
      .where(eq(syncUsers.id, userId)),
    ...chunkRows(rows, RECORD_COLUMNS).map((chunk) =>
      ctx.db
        .insert(syncRecords)
        .values(chunk)
        .onConflictDoUpdate({
          target: [syncRecords.userId, syncRecords.id],
          set: {
            collection: excluded(syncRecords.collection),
            hlc: excluded(syncRecords.hlc),
            deleted: excluded(syncRecords.deleted),
            keyVersion: excluded(syncRecords.keyVersion),
            ciphertext: excluded(syncRecords.ciphertext),
            size: excluded(syncRecords.size),
            serverSeq: excluded(syncRecords.serverSeq),
            updatedAt: excluded(syncRecords.updatedAt),
          },
        }),
    ),
  ]);
  return { accepted: accepted.map((r) => r.id), stale };
}

/** Records changed after `since` (a server_seq), oldest first. */
export async function pull(
  userId: string,
  since: number,
  limit: number,
  ctx: SyncContext,
): Promise<SyncPullResponse> {
  const [user] = await ctx.db
    .select({ keyVersion: syncUsers.keyVersion, verifiedAt: syncUsers.verifiedAt })
    .from(syncUsers)
    .where(eq(syncUsers.id, userId));
  if (!user?.verifiedAt) throw unauthorized();

  const rows = await ctx.db
    .select()
    .from(syncRecords)
    .where(and(eq(syncRecords.userId, userId), gt(syncRecords.serverSeq, since)))
    .orderBy(asc(syncRecords.serverSeq))
    .limit(limit + 1);

  const records: PulledRecord[] = [];
  let bytes = 0;
  for (const r of rows.slice(0, limit)) {
    // Always at least one record, so a cursor can't get stuck.
    if (records.length > 0 && bytes + r.size > PULL_MAX_BYTES) break;
    bytes += r.size;
    records.push({
      id: r.id,
      collection: r.collection as PulledRecord["collection"],
      hlc: r.hlc,
      deleted: r.deleted,
      keyVersion: r.keyVersion,
      ciphertext: r.ciphertext,
      serverSeq: r.serverSeq,
    });
  }
  return {
    records,
    cursor: records.at(-1)?.serverSeq ?? since,
    hasMore: rows.length > records.length,
    keyVersion: user.keyVersion,
  };
}

/** Deletes every stored record (the account stays). For starting over with
 * a new data key when the old one is lost. server_seq keeps counting, so
 * devices' cursors stay valid. */
export async function wipeRecords(userId: string, ctx: SyncContext) {
  const [user] = await ctx.db.select({ id: syncUsers.id }).from(syncUsers).where(eq(syncUsers.id, userId));
  if (!user) throw unauthorized();
  // storage_bytes changes, so a push that read before this fails its guard.
  await runBatch(ctx.db, [
    ctx.db.delete(syncRecords).where(eq(syncRecords.userId, userId)),
    ctx.db.update(syncUsers).set({ storageBytes: 0 }).where(eq(syncUsers.id, userId)),
  ]);
}

/** Daily cleanup: sign-ups never verified within a week, expired sessions
 * and expired email codes. */
export async function pruneSyncData(ctx: SyncContext) {
  const now = ctx.now();
  const expired = await ctx.db
    .select({ id: syncUsers.id })
    .from(syncUsers)
    .where(and(isNull(syncUsers.verifiedAt), lt(syncUsers.createdAt, new Date(now - UNVERIFIED_TTL_MS))));
  const sessions = await ctx.db
    .delete(syncSessions)
    .where(lt(syncSessions.expiresAt, new Date(now)))
    .returning({ id: syncSessions.id });
  const codes = await ctx.db
    .delete(emailTokens)
    .where(lt(emailTokens.expiresAt, new Date(now)))
    .returning({ userId: emailTokens.userId });
  for (const { id } of expired) await deleteSyncUserRows(id, ctx);
  return { unverifiedUsers: expired.length, sessions: sessions.length, emailCodes: codes.length };
}

/** Deletes a sync user and everything stored for them, in one batch.
 * Explicit rather than ON DELETE CASCADE, which libSQL over HTTP doesn't
 * enforce (see src/db/schema.ts). */
export async function deleteSyncUserRows(userId: string, ctx: SyncContext) {
  await runBatch(ctx.db, [
    ctx.db.delete(syncRecords).where(eq(syncRecords.userId, userId)),
    ctx.db.delete(syncSessions).where(eq(syncSessions.userId, userId)),
    ctx.db.delete(emailTokens).where(eq(emailTokens.userId, userId)),
    ctx.db.delete(syncUsers).where(eq(syncUsers.id, userId)),
  ]);
}
