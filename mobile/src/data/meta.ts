import { eq } from "drizzle-orm";
import { tickHlc } from "@pernce/core";
import { meta } from "../db/schema";
import type { DB } from "./db";
import { newId } from "./ids";

/** Device-local settings (never synced). */
export function getMeta(db: DB, key: string): string | null {
  const row = db.select().from(meta).where(eq(meta.key, key)).get();
  return row?.value ?? null;
}

export function setMeta(db: DB, key: string, value: string | null) {
  if (value === null) {
    db.delete(meta).where(eq(meta.key, key)).run();
    return;
  }
  db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run();
}

/** A fresh HLC timestamp for a local write (core hlc.ts), persisted so the
 * clock never goes backwards across restarts. The node id is a random id
 * for this install. */
export function stamp(db: DB, nowMs: number = Date.now()): string {
  let node = getMeta(db, "hlc_node");
  if (!node) {
    node = newId().replace(/-/g, "").slice(0, 16);
    setMeta(db, "hlc_node", node);
  }
  const next = tickHlc(getMeta(db, "hlc_last"), node, nowMs);
  setMeta(db, "hlc_last", next);
  return next;
}

/** HLC receive: after applying a write from another device, move this
 * device's clock up to it, so every later local write sorts after it even
 * if this device's wall clock is behind. */
export function observeHlc(db: DB, remote: string) {
  const last = getMeta(db, "hlc_last");
  if (!last || remote > last) setMeta(db, "hlc_last", remote);
}

/** created_at / updated_at for a new row. */
export function newRowStamps(db: DB) {
  return { createdAt: new Date().toISOString(), updatedAt: stamp(db), deleted: false };
}
