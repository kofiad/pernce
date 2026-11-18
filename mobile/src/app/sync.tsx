import { Redirect } from "expo-router";
import { syncApp, syncEnabled } from "../lib/syncFeature";

/** Settings -> Sync (M24-M26). Personal build only (lib/syncFeature.ts). */
export default function Sync() {
  if (!syncEnabled) return <Redirect href="/settings" />;
  const { SyncScreen } = syncApp();
  return <SyncScreen />;
}
