import { useMemo, useSyncExternalStore } from "react";
import { listAccounts } from "../data/accounts";
import { listCategories } from "../data/categories";
import { changeVersion, subscribeChanges } from "../data/changes";
import { baseCurrencyOf, getProfile } from "../data/profile";
import { getRatesMap } from "../data/rates";
import type { DB } from "../data/db";
import { db } from "../db/client";

/** Runs a synchronous data-layer read and re-runs it after any write
 * (src/data/changes.ts). `deps` are the read's own inputs, e.g. filters. */
export function useData<T>(read: (db: DB) => T, deps: readonly unknown[] = []): T {
  const version = useSyncExternalStore(subscribeChanges, changeVersion);
  // deps are plain values (ids, dates, filter objects), so a JSON key
  // compares them by value and keeps the dependency list static.
  const depsKey = JSON.stringify(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(db), [version, depsKey]);
}

/** id -> row maps for rendering transactions, archived rows included so
 * history still shows their names, plus what converts amounts to the base
 * currency. */
export function useLookups() {
  return useData((d) => {
    const accounts = new Map(listAccounts(d, { includeArchived: true }).map((a) => [a.id, a]));
    const categories = new Map(listCategories(d, { includeArchived: true }).map((c) => [c.id, c]));
    return { accounts, categories, rates: getRatesMap(d), base: baseCurrencyOf(d) };
  });
}

export type Lookups = ReturnType<typeof useLookups>;

export function useProfile() {
  return useData(getProfile);
}
