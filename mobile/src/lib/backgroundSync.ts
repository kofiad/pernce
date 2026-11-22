import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { prepareDatabase } from "../db/client";
import { dropOrphanedSyncState } from "../sync/account";
import { requestSync, syncContext } from "./sync";

/** Best-effort background sync (docs/sync.md). The OS decides
 * when it runs (iOS may rarely run it at all), which is fine: the app also
 * syncs on start and on every return to the foreground. */

// Keeps the pre-rename name: the app was renamed in place, and a task the OS
// already has registered under this name is found (and can be unregistered)
// rather than orphaned. Never shown to anyone.
const SYNC_TASK = "perance-sync";

// Must be defined at module scope, before the app renders, so a background
// launch finds it. Imported from the root layout.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    await prepareDatabase();
    // Stale bookkeeping (an upgrade across the rename) must not sync.
    await dropOrphanedSyncState(syncContext).catch(() => false);
    const result = await requestSync();
    return result && !result.ok ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function setBackgroundSync(enabled: boolean) {
  // Browsers have no background tasks; the web app syncs while it's open.
  if (Platform.OS === "web") return;
  const registered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
  if (enabled && !registered) {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    // Minutes; the OS treats it as a lower bound.
    await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 60 });
  } else if (!enabled && registered) {
    await BackgroundTask.unregisterTaskAsync(SYNC_TASK);
  }
}
