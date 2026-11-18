import { useEffect, useState } from "react";
import { setBackgroundSync } from "../lib/backgroundSync";
import { useData } from "../lib/hooks";
import { clearLegacySecrets, syncContext, useSyncTriggers } from "../lib/sync";
import { dropOrphanedSyncState } from "../sync/account";
import { getSyncStatus } from "../sync/state";

/** Mounted once at the root in the personal build: syncs on start, on
 * returning to the app and after local writes, and keeps the background
 * task registered while sync is on. Renders nothing. */
export function SyncRuntime() {
  const status = useData(getSyncStatus).state;
  // First forget sync bookkeeping whose keychain secrets are gone (an
  // in-place upgrade across the rename), so nothing syncs against it.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    dropOrphanedSyncState(syncContext)
      .catch(() => false)
      .then(clearLegacySecrets)
      .finally(() => setChecked(true));
  }, []);
  useSyncTriggers(checked ? status : "off");
  useEffect(() => {
    // Only after the check: the state before it may be stale, and
    // registering and unregistering in a row would race.
    if (!checked) return;
    // Best effort; not every device allows background tasks.
    setBackgroundSync(status === "on").catch(() => {});
  }, [checked, status]);
  return null;
}
