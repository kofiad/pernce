import { useState } from "react";
import { RefreshControl } from "react-native";
import { useData } from "../lib/hooks";
import { requestSync } from "../lib/sync";
import { useTheme } from "../lib/theme";
import { getSyncStatus } from "../sync/state";

/** Pull-to-refresh that syncs, for scroll views on screens that show synced
 * data. Undefined when sync is off, so there's nothing to pull. */
export function useSyncRefresh() {
  const { c } = useTheme();
  const on = useData(getSyncStatus).state === "on";
  const [refreshing, setRefreshing] = useState(false);
  if (!on) return undefined;
  return (
    <RefreshControl
      refreshing={refreshing}
      tintColor={c.primary}
      colors={[c.primary]}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await requestSync();
        } finally {
          setRefreshing(false);
        }
      }}
    />
  );
}
