import { and, asc, count, eq, sql } from "drizzle-orm";
import { ACCOUNT_COLORS, DEFAULT_CATEGORIES, type SpendingType } from "@pernce/core";
import { categories, type Category } from "../db/schema";
import { notifyChange } from "./changes";
import type { DB } from "./db";
import { newId } from "./ids";
import { checkColor, checkIcon } from "./look";
import { newRowStamps, stamp } from "./meta";

export type CategoryKind = "income" | "expense";

/** Seeds core DEFAULT_CATEGORIES with fresh UUIDs, once: only when the
 * table has never had a row (tombstones included), so deleting every
 * category doesn't bring the defaults back. */
/** `names` renames them for the app's language, keyed by core's English
 * name (i18n `defaultCategories`); they're ordinary rows after that. */
export function seedDefaultCategories(db: DB, names: Record<string, string> = {}) {
  const [{ n }] = db.select({ n: count() }).from(categories).all();
  if (n > 0) return 0;
  DEFAULT_CATEGORIES.forEach((c, i) => {
    db.insert(categories)
      .values({
        id: newId(),
        ...newRowStamps(db),
        name: names[c.name] ?? c.name,
        kind: c.kind,
        color: c.color,
        icon: c.icon,
        spendingType: c.spendingType,
        sortOrder: i,
      })
      .run();
  });
  return DEFAULT_CATEGORIES.length;
}

export function listCategories(
  db: DB,
  { kind, includeArchived = false }: { kind?: CategoryKind; includeArchived?: boolean } = {},
): Category[] {
  const conditions = [eq(categories.deleted, false)];
  if (kind) conditions.push(eq(categories.kind, kind));
  if (!includeArchived) conditions.push(eq(categories.archived, false));
  return db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name), asc(categories.id))
    .all();
}

export function getCategory(db: DB, id: string): Category | null {
  return db.select().from(categories).where(and(eq(categories.id, id), eq(categories.deleted, false))).get() ?? null;
}

export type CategoryInput = {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  spendingType: SpendingType | null;
};

/** Category rules that don't depend on other rows, shared by local writes
 * and rows pulled by sync. Name clashes from sync are settled separately
 * (src/sync/merge.ts), since two devices can each create one offline. */
export function normalizeCategory(input: CategoryInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  if (input.kind !== "income" && input.kind !== "expense") throw new Error(`Unknown category kind "${input.kind}"`);
  if (input.spendingType !== null && input.spendingType !== "essential" && input.spendingType !== "discretionary") {
    throw new Error(`Unknown spending type "${input.spendingType}"`);
  }
  return {
    name,
    kind: input.kind,
    color: checkColor(input.color),
    icon: checkIcon(input.icon),
    // Needs vs wants only means something for spending.
    spendingType: input.kind === "expense" ? input.spendingType : null,
  };
}

function validate(db: DB, input: CategoryInput, id?: string) {
  const values = normalizeCategory(input);
  const name = values.name;
  // Names are how bank CSV imports find a category, so keep them unique per
  // kind (case-insensitively), archived ones included.
  const clash = db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.deleted, false),
        eq(categories.kind, input.kind),
        sql`lower(${categories.name}) = ${name.toLowerCase()}`,
      ),
    )
    .all()
    .find((c) => c.id !== id);
  if (clash) throw new Error(`There's already an ${input.kind} category called "${name}"`);
  return values;
}

export function createCategory(db: DB, input: CategoryInput): string {
  const values = validate(db, input);
  const id = newId();
  const last = db
    .select({ max: sql<number | null>`max(${categories.sortOrder})` })
    .from(categories)
    .where(and(eq(categories.deleted, false), eq(categories.kind, values.kind)))
    .get();
  db.insert(categories)
    .values({ id, ...newRowStamps(db), ...values, sortOrder: (last?.max ?? -1) + 1 })
    .run();
  notifyChange();
  return id;
}

/** Rename, recolor, re-icon, or change essential/discretionary. The kind
 * can't change: existing transactions and budgets rely on it. */
export function updateCategory(db: DB, id: string, input: Omit<CategoryInput, "kind">) {
  const existing = getCategory(db, id);
  if (!existing) throw new Error("Category not found");
  const values = validate(db, { ...input, kind: existing.kind }, id);
  db.update(categories)
    .set({ ...values, updatedAt: stamp(db) })
    .where(eq(categories.id, id))
    .run();
  notifyChange();
}

/** Archived categories drop out of pickers but keep their history. */
export function setCategoryArchived(db: DB, id: string, archived: boolean) {
  if (!getCategory(db, id)) throw new Error("Category not found");
  db.update(categories).set({ archived, updatedAt: stamp(db) }).where(eq(categories.id, id)).run();
  notifyChange();
}

/** Stores `orderedIds` (one kind's categories, in display order) as
 * sort_order 0..n-1. Only rows whose position actually changed are
 * written, so a move touches as few synced rows as possible. */
export function reorderCategories(db: DB, orderedIds: string[]) {
  db.transaction((tx) => {
    orderedIds.forEach((id, i) => {
      const c = getCategory(tx, id);
      if (!c) throw new Error("Category not found");
      if (c.sortOrder !== i) {
        tx.update(categories).set({ sortOrder: i, updatedAt: stamp(tx) }).where(eq(categories.id, id)).run();
      }
    });
  });
  notifyChange();
}

/** Account colors are a subset of the tokens; categories may use any. */
export const CATEGORY_COLORS = [...ACCOUNT_COLORS, "accent-blue-link", "accent-danger", "accent-deep-red", "stone"] as const;
