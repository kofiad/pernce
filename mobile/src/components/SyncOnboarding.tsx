import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { getProfile, setupProfile } from "../data/profile";
import { db } from "../db/client";
import { useT } from "../lib/i18n";
import { requestSync } from "../lib/sync";
import { useTheme } from "../lib/theme";
import { SyncAuthFlow } from "./SyncAuthFlow";
import { NavHeader, Screen, T } from "./ui";
import { showAlert } from "../lib/alert";

/** First run on a new phone, personal build: sign in to sync and pull the
 * account's data, profile included, before the app opens. The name and
 * currency from the welcome step only apply if the account has no profile
 * yet. */
export function SyncOnboarding({ name, baseCurrency, onBack }: { name: string; baseCurrency: string; onBack: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const [downloading, setDownloading] = useState(false);

  async function finish() {
    setDownloading(true);
    try {
      await requestSync();
      // Creating the profile flips the root layout's guard to the app.
      if (!getProfile(db)) setupProfile(db, { name, baseCurrency }, t.defaultCategories);
    } catch (e) {
      setDownloading(false);
      showAlert("Couldn't set up", e instanceof Error ? e.message : String(e));
    }
  }

  if (downloading) {
    return (
      <Screen scroll={false} narrow={480}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <ActivityIndicator color={c.text} />
          <T variant="bodySm" color={c.mute}>
            Getting your data…
          </T>
        </View>
      </Screen>
    );
  }
  return (
    <Screen narrow={480}>
      <NavHeader onBack={onBack} />
      <SyncAuthFlow initialMode="signin" onDone={finish} />
    </Screen>
  );
}
