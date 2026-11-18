import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LockGate } from "../components/LockGate";
import { SideNav } from "../components/SideNav";
import { T } from "../components/ui";
import { getAppearance } from "../data/preferences";
import { db, prepareDatabase } from "../db/client";
import { useData, useProfile } from "../lib/hooks";
import { useFocusRing, useLayout } from "../lib/layout";
import { startPwa } from "../lib/pwa";
import { syncApp, syncEnabled } from "../lib/syncFeature";
import { applyAppearance, useTheme } from "../lib/theme";

// Personal build only: loading it here also registers the background task
// before the first render (lib/syncApp.ts).
const SyncRuntime = syncEnabled ? syncApp().SyncRuntime : null;

export default function RootLayout() {
  const [state, setState] = useState<"loading" | "ready" | Error>("loading");
  // Inter and JetBrains Mono, the artboard's typefaces; a font that fails
  // to load falls back to the system font rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
  });
  const { c } = useTheme();

  useEffect(startPwa, []);

  useEffect(() => {
    prepareDatabase().then(
      () => {
        // Before the first screen draws, so a Light/Dark choice doesn't flash.
        applyAppearance(getAppearance(db));
        setState("ready");
      },
      (e: unknown) => setState(e instanceof Error ? e : new Error(String(e))),
    );
  }, []);

  if (state !== "ready" || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.canvas, padding: 24 }}>
        {state === "loading" || state === "ready" ? (
          <ActivityIndicator color={c.primary} />
        ) : (
          <T align="center">Couldn&apos;t open the local database: {state.message}</T>
        )}
      </View>
    );
  }
  return <App />;
}

function App() {
  const { c } = useTheme();
  const hasProfile = !!useProfile();
  const appearance = useData(getAppearance);
  // Follows Settings → Appearance, and a wipe resetting it to System.
  useEffect(() => applyAppearance(appearance), [appearance]);
  const navTheme = c.scheme === "light" ? DefaultTheme : DarkTheme;
  const { nav, wide } = useLayout();
  useFocusRing(c.brand);
  // Wide screens draw sheets as dialogs over the page they came from
  // (Screen, W09), so that page has to stay on screen under them.
  const modal = wide
    ? ({ presentation: "transparentModal", contentStyle: { backgroundColor: "transparent" } } as const)
    : ({ presentation: "modal" } as const);

  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{
          ...navTheme,
          colors: { ...navTheme.colors, primary: c.primary, background: c.canvas, card: c.canvas, text: c.text, border: c.hairline },
        }}
      >
        {SyncRuntime ? <SyncRuntime /> : null}
        {/* From 768px (the web only) the rail or the sidebar replaces the tab dock. */}
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.canvas }}>
          {hasProfile && nav !== "dock" ? <SideNav nav={nav} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <LockGate>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.canvas } }}>
                <Stack.Protected guard={!hasProfile}>
                  <Stack.Screen name="onboarding" />
                </Stack.Protected>
                <Stack.Protected guard={hasProfile}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="accounts/[id]" />
                  <Stack.Screen name="budgets/[categoryId]" />
                  <Stack.Screen name="account-form" options={modal} />
                  <Stack.Screen name="transaction" options={modal} />
                  <Stack.Screen name="categories" />
                  <Stack.Screen name="category-form" options={modal} />
                  <Stack.Screen name="budget-form" options={modal} />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="rates" />
                  <Stack.Screen name="data" />
                  <Stack.Screen name="sync" />
                  <Stack.Screen name="sync-auth" options={modal} />
                </Stack.Protected>
              </Stack>
            </LockGate>
          </View>
        </View>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
