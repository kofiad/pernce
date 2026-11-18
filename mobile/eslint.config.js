// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

// The sync wiring and the native modules it needs exist only in the
// personal build; the store build doesn't link them. Everything else
// reaches them through syncApp() in src/lib/syncFeature.ts.
const SYNC_WIRING = [
  "src/lib/sync.ts",
  "src/lib/backgroundSync.ts",
  "src/lib/syncApp.ts",
  "src/lib/syncCrypto*.ts",
  "src/components/Sync*.tsx",
  "src/components/useSyncRefresh.tsx",
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: SYNC_WIRING,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react-native-libsodium", "expo-secure-store", "expo-background-task", "expo-task-manager"].map((name) => ({
            name,
            message: "Personal build only: use it from the sync wiring, reached via syncApp() (src/lib/syncFeature.ts).",
          })),
          patterns: [
            {
              regex: "(^|/)(lib/(sync|backgroundSync|syncApp|syncCrypto)|components/(Sync\\w*|useSyncRefresh))$",
              message: "Personal build only: reach the sync wiring through syncApp() (src/lib/syncFeature.ts).",
            },
          ],
        },
      ],
    },
  },
]);
