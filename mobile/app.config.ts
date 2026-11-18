import type { ConfigContext, ExpoConfig } from "expo/config";

/** SYNC_URL as an origin without a trailing slash, or undefined if unset.
 * Fails the build on anything else, so a typo doesn't ship. */
function syncUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const url = (() => {
    try {
      return new URL(value.trim());
    } catch {
      return null;
    }
  })();
  if (!url || !/^https?:$/.test(url.protocol)) {
    throw new Error(`SYNC_URL must be an http(s) address like https://sync.example.com, got "${value}".`);
  }
  return url.href.replace(/\/+$/, "");
}

/** An env var that must match `pattern` when set; fails the build otherwise. */
function checked(name: string, pattern: RegExp, example: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!pattern.test(value)) throw new Error(`${name} must look like ${example}, got "${value}".`);
  return value;
}

/** Who the app is, so a fork can build its own without editing app.json
 * (TRADEMARKS.md: a published build needs its own name, icon and IDs):
 *
 * - APP_ID: the iOS bundle ID and Android package (app.json: com.pernce.app).
 *   Reverse-DNS, Android's rules: letters, digits and _, each part starting
 *   with a letter. Changing it makes a different app on the phone.
 * - EAS_OWNER: the Expo account EAS builds belong to (app.json: owner).
 * - EAS_PROJECT_ID: the EAS project (extra.eas.projectId, from `eas init`).
 *
 * Unset, app.json's values apply. Like SYNC_URL, they can live in
 * mobile/.env.local (.env.example). */
const APP_ID = checked("APP_ID", /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/, "com.example.money");
const EAS_OWNER = checked("EAS_OWNER", /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "your-expo-username");
const EAS_PROJECT_ID = checked("EAS_PROJECT_ID", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "a UUID from `eas init`");

/** Two builds from one codebase (static settings are in app.json):
 *
 * - default: the store app, offline-only. The sync native modules are
 *   installed but left out of the native build (plugins/withoutSyncModules.js),
 *   and the sync code is never loaded (src/lib/syncFeature.ts).
 * - APP_VARIANT=personal: the build with sync. SYNC_URL is the server new
 *   sign-ins start with; without it, the web build uses the page's own
 *   origin and phones ask on the sign-in screen (src/lib/syncFeature.ts).
 *   Expo reads both variables from mobile/.env.local too (.env.example).
 *   Same bundle ID, so it installs over the store build and keeps its data.
 *
 * Set APP_VARIANT for prebuild and for the build itself, e.g.
 * `APP_VARIANT=personal TEAM_ID=… pnpm run ios:device`. Switching variants
 * needs a clean prebuild (the script does one). */
const PERSONAL = process.env.APP_VARIANT === "personal";
const SYNC_URL = syncUrl(process.env.SYNC_URL);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ...(EAS_OWNER ? { owner: EAS_OWNER } : {}),
  ios: { ...config.ios, ...(APP_ID ? { bundleIdentifier: APP_ID } : {}) },
  android: { ...config.android, ...(APP_ID ? { package: APP_ID } : {}) },
  plugins: [
    ...(config.plugins ?? []),
    ...(PERSONAL
      ? [
          "react-native-libsodium",
          "./plugins/withLibsodiumBridgeProxy",
          [
            "expo-secure-store",
            { configureAndroidBackup: true, faceIDPermission: "Pernce uses Face ID to unlock the app." },
          ] as [string, unknown],
          "expo-background-task",
        ]
      : ["./plugins/withoutSyncModules"]),
  ],
  extra: {
    ...config.extra,
    ...(EAS_PROJECT_ID ? { eas: { ...config.extra?.eas, projectId: EAS_PROJECT_ID } } : {}),
    variant: PERSONAL ? "personal" : "store",
    // Left out rather than null: Expo's config serializer turns null into {}.
    ...(PERSONAL && SYNC_URL ? { syncUrl: SYNC_URL } : {}),
  },
});
