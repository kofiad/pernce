import { router } from "expo-router";
import { db } from "../db/client";
import { useData } from "../lib/hooks";
import { syncContext, timeAgo } from "../lib/sync";
import { useTheme } from "../lib/theme";
import { signOut } from "../sync/account";
import { getSyncStatus } from "../sync/state";
import { Dot, Group, GroupLabel, Inline, Row, T } from "./ui";

/** Settings' Sync group (M23), personal build only. English only, like the
 * other sync screens: the personal build has one user. */
export function SyncSettingsGroup() {
  const { c } = useTheme();
  const sync = useData(getSyncStatus);
  const failing = sync.state === "on" && sync.lastError !== null;
  const value =
    sync.state === "off" ? (
      "Off"
    ) : (
      <Inline gap={6}>
        <Dot color={failing ? c.negative : sync.state === "on" ? c.positive : sync.state === "needs_key" ? c.warning : c.negative} />
        <T variant="row" color={c.stone}>
          {failing ? "Couldn’t sync" : sync.state === "on" ? timeAgo(sync.lastSyncAt) : sync.state === "needs_key" ? "Needs key" : "Signed out"}
        </T>
      </Inline>
    );
  return (
    <>
      <GroupLabel>Sync</GroupLabel>
      <Group>
        <Row icon="cloud" title="Sync" value={value} onPress={() => router.push("/sync")} />
      </Group>
      <T variant="caption" color={c.stone} style={{ marginTop: 8 }}>
        End-to-end encrypted. The server only ever sees ciphertext.
      </T>
    </>
  );
}

/** The signed-in sync account's email, for the profile card. */
export function useSyncAccountEmail(): string | null {
  return useData(getSyncStatus).user?.email ?? null;
}

/** Signs out before a wipe, so the keys and session go with the data. */
export async function signOutBeforeWipe() {
  if (getSyncStatus(db).state !== "off") await signOut(syncContext).catch(() => {});
}
