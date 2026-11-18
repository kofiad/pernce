/** A tiny change feed: every write in the data layer bumps the version,
 * and the app's hooks re-run their queries when it changes. All queries
 * are synchronous SQLite reads on a small personal ledger, so re-reading
 * on any change is simpler than tracking which query depends on which
 * table, and it's fast enough. */
let version = 0;
const listeners = new Set<() => void>();

export function notifyChange() {
  version++;
  for (const l of listeners) l();
}

export function subscribeChanges(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function changeVersion() {
  return version;
}
