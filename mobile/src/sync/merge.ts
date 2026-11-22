import { and, asc, eq, ne } from "drizzle-orm";
import type { SyncCollection } from "@pernce/core";
import { accounts, budgets, categories, profile, rateOverrides, transactions } from "../db/schema";
import type { DB } from "../data/db";
import { observeHlc, stamp } from "../data/meta";
import { COLLECTIONS, COLLECTION_BY_NAME, type CollectionDef } from "./collections";

/** Merging pulled records into the local database (docs/sync.md). The server can't read records, so every device merges on its own,
 * and the rules are deterministic so every device ends up with the same
 * rows:
 *
 * - Last writer wins per row: a pulled record replaces the local row only
 *   if its HLC is later. A tombstone is just a later write, so it beats any
 *   older edit.
 * - Natural-key collisions (two devices each made "Groceries", or a budget
 *   for the same category and month) are settled by keeping the row with
 *   the lowest UUID. The loser becomes a tombstone and references to it are
 *   moved to the winner. Those are ordinary local writes, so they're pushed
 *   like any other edit.
 *
 * Balances are never merged: they're derived from the ledger (§3). */

/** A pulled record after decryption. `payload` is null for a tombstone. */
export type IncomingRecord = {
  id: string;
  collection: SyncCollection;
  hlc: string;
  deleted: boolean;
  payload: unknown;
};

export type Rejected = { id: string; collection: string; reason: string };

// Every synced table has the same envelope columns (id, updated_at,
// deleted), so one table's type stands in for all of them here.
type AnyTable = typeof accounts;
const tableOf = (def: CollectionDef) => def.table as unknown as AnyTable;

const ORDER = new Map(COLLECTIONS.map((d, i) => [d.collection, i]));

/** Last-write-wins merge of a page of pulled records, then settles
 * collisions. One SQLite transaction, so a crash can't leave half a page
 * applied; `afterApply` runs inside it (the engine stores the pull cursor
 * there). Returns the records that failed validation and were skipped. */
export function applyIncoming(db: DB, records: IncomingRecord[], afterApply?: (tx: DB) => void): Rejected[] {
  const sorted = [...records].sort((a, b) => (ORDER.get(a.collection) ?? 99) - (ORDER.get(b.collection) ?? 99));
  return db.transaction((tx) => {
    const rejected: Rejected[] = [];
    for (const r of sorted) {
      // First, so a stamp made while applying it sorts after it.
      observeHlc(tx, r.hlc);
      const reason = applyOne(tx, r);
      if (reason) rejected.push({ id: r.id, collection: r.collection, reason });
    }
    settleCollisions(tx);
    afterApply?.(tx);
    return rejected;
  });
}

/** Applies one record; returns why it was rejected, or null. */
function applyOne(db: DB, r: IncomingRecord): string | null {
  const def = COLLECTION_BY_NAME.get(r.collection);
  if (!def) return `Unknown collection "${r.collection}"`;
  const t = tableOf(def);
  const local = db.select({ updatedAt: t.updatedAt }).from(t).where(eq(t.id, r.id)).get();
  // Already have this write, or a later one.
  if (local && local.updatedAt >= r.hlc) return null;

  if (r.deleted) {
    // A tombstone for a row this device never had needs nothing stored.
    if (local) db.update(t).set({ deleted: true, updatedAt: r.hlc }).where(eq(t.id, r.id)).run();
    return null;
  }

  let values: Record<string, unknown>;
  try {
    values = def.parse(db, r.payload);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }

  let deleted = false;
  let updatedAt = r.hlc;
  if (settleUnique(db, def.collection, r.id, values) === "incoming-loses") {
    // Kept as a tombstone with this device's stamp, so the loss is pushed
    // and the server's copy converges too.
    deleted = true;
    updatedAt = stamp(db);
  }
  const row = { ...values, deleted, updatedAt };
  db.insert(t)
    .values({ id: r.id, ...row } as never)
    .onConflictDoUpdate({ target: t.id, set: row as never })
    .run();
  return null;
}

/** Budgets (category + month) and rate overrides (currency) have unique
 * indexes over live rows, so a collision is settled before the write. */
function settleUnique(db: DB, collection: SyncCollection, id: string, values: Record<string, unknown>) {
  let clash: { id: string } | undefined;
  if (collection === "budget") {
    clash = db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.deleted, false),
          eq(budgets.categoryId, values.categoryId as string),
          eq(budgets.period, values.period as string),
          ne(budgets.id, id),
        ),
      )
      .get();
    if (clash && id < clash.id) tombstone(db, budgets, clash.id);
  } else if (collection === "rate_override") {
    clash = db
      .select({ id: rateOverrides.id })
      .from(rateOverrides)
      .where(and(eq(rateOverrides.deleted, false), eq(rateOverrides.currency, values.currency as string), ne(rateOverrides.id, id)))
      .get();
    if (clash && id < clash.id) tombstone(db, rateOverrides, clash.id);
  }
  if (!clash) return "no-clash";
  return id < clash.id ? "incoming-wins" : "incoming-loses";
}

function tombstone(db: DB, table: typeof budgets | typeof rateOverrides | typeof categories | typeof profile, id: string) {
  const t = table as unknown as AnyTable;
  db.update(t).set({ deleted: true, updatedAt: stamp(db) }).where(eq(t.id, id)).run();
}

/** Collisions that have no unique index to stop them: categories with the
 * same kind and name (case-insensitive, like local validation), and more
 * than one profile. Cheap enough to run over every row after each page. */
export function settleCollisions(db: DB) {
  const all = db
    .select({ id: categories.id, kind: categories.kind, name: categories.name, deleted: categories.deleted })
    .from(categories)
    .orderBy(asc(categories.id))
    .all();
  const keyOf = (c: (typeof all)[number]) => `${c.kind}\u0000${c.name.trim().toLowerCase()}`;
  const winners = new Map<string, string>();
  for (const c of all) {
    if (c.deleted) continue;
    const winner = winners.get(keyOf(c));
    if (!winner) {
      winners.set(keyOf(c), c.id);
      continue;
    }
    moveCategory(db, c.id, winner);
    tombstone(db, categories, c.id);
  }
  // Categories are archived, never deleted, so a tombstoned one lost a
  // collision. A transaction or budget that names it can still arrive later
  // (written on a device that hadn't merged yet); move it to the winner.
  for (const c of all) {
    const winner = c.deleted ? winners.get(keyOf(c)) : undefined;
    if (winner) moveCategory(db, c.id, winner);
  }

  const profiles = db
    .select({ id: profile.id })
    .from(profile)
    .where(eq(profile.deleted, false))
    .orderBy(asc(profile.id))
    .all();
  for (const p of profiles.slice(1)) tombstone(db, profile, p.id);
}

/** Points a losing category's transactions and budgets at the winner. A
 * budget that then collides with the winner's own budget for that month is
 * settled by lowest UUID, like any other budget collision. */
function moveCategory(db: DB, from: string, to: string) {
  db.update(transactions)
    .set({ categoryId: to, updatedAt: stamp(db) })
    .where(and(eq(transactions.categoryId, from), eq(transactions.deleted, false)))
    .run();
  const moving = db
    .select({ id: budgets.id, period: budgets.period })
    .from(budgets)
    .where(and(eq(budgets.categoryId, from), eq(budgets.deleted, false)))
    .all();
  for (const b of moving) {
    const clash = db
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.categoryId, to), eq(budgets.period, b.period), eq(budgets.deleted, false)))
      .get();
    if (clash && clash.id < b.id) {
      tombstone(db, budgets, b.id);
      continue;
    }
    if (clash) tombstone(db, budgets, clash.id);
    db.update(budgets).set({ categoryId: to, updatedAt: stamp(db) }).where(eq(budgets.id, b.id)).run();
  }
}
