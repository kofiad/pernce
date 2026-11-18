import { Platform } from "react-native";

/** Web only: registers the service worker that lets the installed app
 * launch offline (scripts/pwa.mjs writes it into the export), and asks the
 * browser to keep the local database rather than evict it. A new build's
 * worker installs in the background and takes over on the next launch.
 * Does nothing on phones or on the dev server, which has no sw.js. */
export function startPwa(): void {
  if (Platform.OS !== "web" || process.env.NODE_ENV !== "production") return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  navigator.storage?.persist?.().catch(() => {});
}
