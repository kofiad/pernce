import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "../db/schema";

/** What every data-layer function takes. Both the app's expo-sqlite
 * database and the Node tests' database (test-utils.ts) are this type, and
 * so is the `tx` inside db.transaction(), so functions compose inside a
 * transaction. The data layer never imports React Native or Expo, so it
 * runs unchanged under `pnpm test`. */
export type DB = BaseSQLiteDatabase<"sync", any, typeof schema>;

/** Rows per call for reads that can return a whole table. */
export const PAGE_ROWS = 200;

/** Reads every row a query matches, PAGE_ROWS at a time in id order. On
 * web, one synchronous expo-sqlite call can return only about 1 MB (a few
 * thousand transactions), so a read that grows with the user's history
 * goes through this. `page` returns the next rows after `afterId` (all
 * from the start when null), ordered by id, at most `limit` of them. Still
 * synchronous: nothing can write between pages. */
export function allPages<T extends { id: string }>(page: (afterId: string | null, limit: number) => T[]): T[] {
  const out: T[] = [];
  let afterId: string | null = null;
  for (;;) {
    const rows = page(afterId, PAGE_ROWS);
    out.push(...rows);
    if (rows.length < PAGE_ROWS) return out;
    afterId = rows[rows.length - 1].id;
  }
}
