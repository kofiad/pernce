import { and, asc, count, gt, sql } from "drizzle-orm";
import { accounts } from "../db/schema";
import { allPages, type DB } from "../data/db";
import { getMeta } from "../data/meta";
import { COLLECTIONS, type CollectionDef } from "./collections";
import { getPushMark } from "./state";

/** The outbox: rows this device changed since its last successful push.
 *
 * There's no separate queue to keep in step with every write. Each local
 * write stamps `updated_at` with this device's HLC, whose node id is the
 * part after the second dash, and HLCs from one node only ever increase.
 * So "changed here since the last push" is exactly "stamped with this
 * node, later than the push mark". Rows merged in from other devices carry
 * their own node id and are left out. */

export type OutboxRow = { def: CollectionDef; row: Record<string, unknown> & { id: string; updatedAt: string; deleted: boolean } };

/** Where the node id starts in an HLC: 13 digits, dash, 4 hex, dash. */
const NODE_OFFSET = 20;

function pendingWhere(db: DB, t: typeof accounts) {
  const { all, since } = getPushMark(db);
  if (all) return { ok: true as const, where: undefined };
  const node = getMeta(db, "hlc_node");
  // No node yet means this device has never written anything.
  if (!node) return { ok: false as const };
  return {
    ok: true as const,
    where: and(sql`substr(${t.updatedAt}, ${NODE_OFFSET}) = ${node}`, since ? gt(t.updatedAt, since) : undefined),
  };
}

/** Every pending row, plus the mark to store once they're all pushed: the
 * newest HLC this device has issued. Reads are synchronous, so no write
 * can slip in between collecting and taking the mark, and any later write
 * gets a later HLC and stays pending. */
export function collectOutbox(db: DB): { rows: OutboxRow[]; mark: string | null } {
  const mark = getMeta(db, "hlc_last");
  const rows: OutboxRow[] = [];
  for (const def of COLLECTIONS) {
    const t = def.table as unknown as typeof accounts;
    const q = pendingWhere(db, t);
    if (!q.ok) break;
    const page = (afterId: string | null, limit: number) =>
      db
        .select()
        .from(t)
        .where(and(q.where, afterId === null ? undefined : gt(t.id, afterId)))
        .orderBy(asc(t.id))
        .limit(limit)
        .all();
    for (const row of allPages(page)) rows.push({ def, row });
  }
  return { rows, mark };
}

/** How many rows collectOutbox would return, without reading them. */
export function countOutbox(db: DB): number {
  let n = 0;
  for (const def of COLLECTIONS) {
    const t = def.table as unknown as typeof accounts;
    const q = pendingWhere(db, t);
    if (!q.ok) break;
    n += db.select({ n: count() }).from(t).where(q.where).get()?.n ?? 0;
  }
  return n;
}

export function hasOutbox(db: DB): boolean {
  return COLLECTIONS.some((def) => {
    const t = def.table as unknown as typeof accounts;
    const q = pendingWhere(db, t);
    return q.ok && !!db.select({ id: t.id }).from(t).where(q.where).limit(1).get();
  });
}
