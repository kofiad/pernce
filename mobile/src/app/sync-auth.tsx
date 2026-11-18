import { Redirect } from "expo-router";
import { syncApp, syncEnabled } from "../lib/syncFeature";

/** Settings -> Sync -> sign in / create account / reset password (M27-M30).
 * Personal build only (lib/syncFeature.ts). */
export default function SyncAuth() {
  if (!syncEnabled) return <Redirect href="/settings" />;
  const { SyncAuthScreen } = syncApp();
  return <SyncAuthScreen />;
}
