import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../db/client";
import { useT } from "../lib/i18n";
import { authenticate, getLockAfter, isLockEnabled } from "../lib/lock";
import { GUTTER, useTheme } from "../lib/theme";
import { Button, Logo, T } from "./ui";

/** M03 Lock screen: covers the app until the user authenticates, when app
 * lock is on and the app comes back after the "Lock after" time. */
export function LockGate({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const t = useT();
  const [locked, setLocked] = useState(() => isLockEnabled(db));
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    setBusy(true);
    try {
      if (await authenticate(t)) setLocked(false);
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") backgroundedAt.current = Date.now();
      if (next === "active" && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away >= getLockAfter(db) && isLockEnabled(db)) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Prompt as soon as the lock screen appears; the button retries.
  useEffect(() => {
    if (!locked) return;
    let cancelled = false;
    authenticate(t).then((ok) => {
      if (ok && !cancelled) setLocked(false);
    });
    return () => {
      cancelled = true;
    };
  }, [locked, t]);

  return (
    <View style={styles.flex}>
      {children}
      {locked ? (
        <SafeAreaView style={[StyleSheet.absoluteFill, { backgroundColor: c.canvas }]}>
          <View style={styles.body}>
            <View style={styles.center}>
              <Logo size={64} />
              <T variant="headingMd" align="center" style={{ marginTop: 16 }}>
                {t.lock.locked}
              </T>
              <T variant="bodySm" color={c.mute} align="center">
                {t.lock.lockedBody}
              </T>
            </View>
            <Button label={t.lock.unlock} icon="face" onPress={unlock} loading={busy} />
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
});
