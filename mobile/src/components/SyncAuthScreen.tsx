import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "./ui";
import { SyncAuthFlow, type AuthMode } from "./SyncAuthFlow";
import { requestSync } from "../lib/sync";

/** Settings -> Sync -> sign in / create account / reset password (M27–M30,
 * the "Sync account" sheet). */
export function SyncAuthScreen() {
  const { mode } = useLocalSearchParams<{ mode?: AuthMode }>();
  return (
    <Screen sheet="Sync account">
      <SyncAuthFlow
        initialMode={mode === "signup" || mode === "reset" ? mode : "signin"}
        onDone={() => {
          requestSync();
          router.back();
        }}
      />
    </Screen>
  );
}
