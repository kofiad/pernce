// Everything the app uses from sync, loaded only through syncApp()
// (lib/syncFeature.ts) in the personal build. Importing this registers the
// background task, which must happen before the first render.
import "./backgroundSync";

export { requestSync, syncContext, timeAgo } from "./sync";
export { SyncRuntime } from "../components/SyncRuntime";
export { SyncScreen } from "../components/SyncScreen";
export { SyncAuthScreen } from "../components/SyncAuthScreen";
export { SyncSettingsGroup, useSyncAccountEmail, signOutBeforeWipe } from "../components/SyncSettings";
export { SyncOnboarding } from "../components/SyncOnboarding";
export { useSyncRefresh } from "../components/useSyncRefresh";
