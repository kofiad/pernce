import { router } from "expo-router";
import { View } from "react-native";
import { useData } from "../lib/hooks";
import { useTheme } from "../lib/theme";
import { getSyncStatus, syncNotice } from "../sync/state";
import { Button, Card, IconButton, T } from "./ui";

/** sync-banner (docs/design M05a/M05b): at the top of Home while sync has
 * stopped on this device. Not dismissible; it goes once sync works. The
 * card and its button both open Sync, which shows how to fix it. */
export function SyncBanner() {
  const { c } = useTheme();
  const notice = useData((d) => syncNotice(getSyncStatus(d)));
  if (!notice) return null;
  const open = () => router.push("/sync");
  return (
    <Card onPress={open} style={{ padding: 16, marginBottom: 24, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconButton icon="alert" size="sm" iconColor={c.warning} label={notice.title} />
      <View style={{ flex: 1 }}>
        <T variant="bodySm" weight="600">
          {notice.title}
        </T>
        <T variant="caption" color={c.mute}>
          {notice.body}
        </T>
      </View>
      <Button label={notice.action} small onPress={open} />
    </Card>
  );
}
