import Constants from "expo-constants";
import type { ReactElement } from "react";
import { Platform, type RefreshControlProps } from "react-native";

/** Whether this build has sync. Only the personal build does
 * (APP_VARIANT=personal, app.config.ts); the store build ships
 * offline-only and doesn't even link sync's native modules
 * (plugins/withoutSyncModules.js).
 *
 * So nothing outside the sync wiring may import it statically: screens
 * reach it through syncApp(), which loads it only when sync is on. */
export const syncEnabled = Constants.expoConfig?.extra?.variant === "personal";

/** The sync server new sign-ins start with: SYNC_URL if the build set one
 * (app.config.ts), else the page's own origin on web (the server hosts the
 * web app). Null without sync, and on phones built without SYNC_URL: the
 * sign-in screen then asks for the server's address. */
const configured: unknown = Constants.expoConfig?.extra?.syncUrl;
export const SYNC_URL: string | null = !syncEnabled
  ? null
  : typeof configured === "string"
    ? configured
    : Platform.OS === "web"
      ? window.location.origin
      : null;

type SyncApp = typeof import("./syncApp");
let loaded: SyncApp | null = null;

/** The sync wiring (lib/syncApp.ts). Throws in the store build, where its
 * native modules aren't there to load. */
export function syncApp(): SyncApp {
  if (!syncEnabled) throw new Error("Sync isn't part of this build.");
  // A require rather than an import, so the store build never runs it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (loaded ??= require("./syncApp") as SyncApp);
}

/** Pull-to-refresh that syncs (undefined without sync). Picked once, so
 * it's the same hook on every render. */
export const useSyncRefresh: () => ReactElement<RefreshControlProps> | undefined = syncEnabled
  ? () => syncApp().useSyncRefresh()
  : () => undefined;
