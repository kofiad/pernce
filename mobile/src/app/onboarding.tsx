import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Icon } from "../components/Icon";
import { ChoiceSheet, CurrencyPicker } from "../components/inputs";
import { Actions, BrandMark, Button, Field, FieldMessage, Group, IconButton, ListRow, Logo, NavHeader, Note, Row, Screen, T, Toggle } from "../components/ui";
import { setupProfile } from "../data/profile";
import { db } from "../db/client";
import { translateError } from "../i18n";
import { useT } from "../lib/i18n";
import { useLayout } from "../lib/layout";
import { LOCK_AFTER, authenticate, canUseLock, lockAfterLabel, setLockAfter, setLockEnabled } from "../lib/lock";
import { syncApp, syncEnabled } from "../lib/syncFeature";
import { FONT, useTheme } from "../lib/theme";
import { showAlert } from "../lib/alert";

/** M01 / M02 First run: name and base currency, then the optional app
 * lock step. Everything stays on this phone; no network or account.
 *
 * The artboard's sync choices are left out until sync ships
 * (docs/mobile-scope.md §9), except "Sign in to sync" in the personal build
 * (lib/syncFeature.ts), for setting up a new phone from the cloud copy. */
export default function Onboarding() {
  const { c } = useTheme();
  const t = useT();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [lock, setLock] = useState(false);
  const [lockAfter, setLockAfterMs] = useState(60_000);
  const [lockAfterOpen, setLockAfterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"welcome" | "lock" | "sync">("welcome");
  const { nav, wide } = useLayout();

  async function toggleLock(next: boolean) {
    if (!next) return setLock(false);
    if (!(await canUseLock())) {
      showAlert(t.lock.noPasscode, t.onboarding.noPasscodeBody);
      return;
    }
    if (await authenticate(t, t.lock.confirmOn)) setLock(true);
  }

  function finishLock(enabled: boolean) {
    setLockEnabled(db, enabled);
    if (enabled) setLockAfter(db, lockAfter);
    setBusy(true);
    try {
      // Creating the profile flips the root layout's guard to the app.
      setupProfile(db, { name, baseCurrency: currency }, t.defaultCategories);
    } catch (e) {
      setBusy(false);
      showAlert(t.onboarding.couldntSetUp, translateError(e, t));
    }
  }

  if (step === "sync" && syncEnabled) {
    const { SyncOnboarding } = syncApp();
    return <SyncOnboarding name={name} baseCurrency={currency} onBack={() => setStep("welcome")} />;
  }

  if (step === "lock") {
    return (
      <Screen>
        <NavHeader
          onBack={() => setStep("welcome")}
          right={
            <T variant="caption" color={c.stone}>
              {t.onboarding.stepOf}
            </T>
          }
        />
        <View style={{ marginTop: 24 }}>
          <IconButton icon="face" label={t.onboarding.appLock} px={72} iconVariant="xl" />
        </View>
        <T variant="title" style={{ marginTop: 28, marginBottom: 12 }}>
          {t.onboarding.appLock}
        </T>
        <T variant="body" color={c.mute} style={{ marginBottom: 28 }}>
          {t.onboarding.appLockBody}
        </T>
        <Group>
          <Row left={<Icon name="lock" color={c.text} variant="s" />} title={t.onboarding.requireFaceId} right={<Toggle value={lock} onChange={toggleLock} label={t.onboarding.requireFaceId} />} />
          <Row left={<Icon name="refresh" color={c.text} variant="s" />} title={t.lock.lockAfter} value={lockAfterLabel(lockAfter, t)} onPress={() => setLockAfterOpen(true)} />
        </Group>
        <Note icon="info" style={{ marginTop: 16 }}>
          {t.onboarding.changeLater}
        </Note>
        <Actions style={{ paddingTop: 24 }}>
          <Button label={t.common.continue} onPress={() => finishLock(lock)} loading={busy} />
          <Button label={t.onboarding.notNow} variant="text" onPress={() => finishLock(false)} />
        </Actions>
        <ChoiceSheet visible={lockAfterOpen} title={t.lock.lockAfter} onClose={() => setLockAfterOpen(false)}>
          {LOCK_AFTER.map((ms, i) => (
            <ListRow
              key={ms}
              title={lockAfterLabel(ms, t)}
              right={ms === lockAfter ? <Icon name="check" color={c.text} /> : null}
              onPress={() => {
                setLockAfterMs(ms);
                setLockAfterOpen(false);
              }}
              last={i === LOCK_AFTER.length - 1}
            />
          ))}
        </ChoiceSheet>
      </Screen>
    );
  }

  const intro = Platform.OS === "web" ? t.onboarding.introWeb : t.onboarding.intro;
  const form = (
    <>
      <Field label={t.onboarding.nameOptional} value={name} onChangeText={setName} placeholder={t.onboarding.namePlaceholder} autoCapitalize="words" />
      <CurrencyPicker label={t.onboarding.baseCurrency} long value={currency} onChange={setCurrency} />
      <View style={{ marginTop: -20, marginBottom: wide ? 32 : 24 }}>
        <FieldMessage hint={t.onboarding.baseCurrencyHint} />
      </View>
      <Actions inline={nav === "side"}>
        {/* No app lock on web (no Face ID or passcode in a browser). */}
        <Button label={t.onboarding.getStarted} onPress={() => (Platform.OS === "web" ? finishLock(false) : setStep("lock"))} />
        {syncEnabled ? <Button label="Sign in to sync" variant="text" onPress={() => setStep("sync")} /> : null}
      </Actions>
    </>
  );

  if (nav === "side") {
    // W14: the headline on an inset band beside the form.
    return (
      <View style={[s.split, { backgroundColor: c.canvas }]}>
        <View style={[s.band, { backgroundColor: c.inset }]}>
          <View style={s.brand}>
            <BrandMark size={32} />
            <T variant="heading" weight="600">
              Pernce
            </T>
          </View>
          <View>
            <Text style={[s.headline, { color: c.text }]}>{t.onboarding.headline}</Text>
            <T variant="bodyLg" color={c.mute} style={{ maxWidth: 480 }}>
              {intro}
            </T>
          </View>
          <View />
        </View>
        <View style={s.formSide}>
          <View style={{ width: 400, maxWidth: "100%" }}>{form}</View>
        </View>
      </View>
    );
  }

  return (
    <Screen narrow={480}>
      <View style={{ marginTop: 24 }}>
        <Logo />
      </View>
      <T variant="displayLg" style={{ marginTop: 32, marginBottom: 12, lineHeight: 50 }}>
        {t.onboarding.headline}
      </T>
      <T variant="bodyLg" color={c.mute} style={{ marginBottom: 32 }}>
        {intro}
      </T>
      {form}
    </Screen>
  );
}

const s = StyleSheet.create({
  split: { flex: 1, flexDirection: "row" },
  band: { flex: 1, padding: 64, justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  /** display-xl: 80 / 1.0 / −0.8 */
  headline: { fontFamily: FONT["500"], fontSize: 80, lineHeight: 80, letterSpacing: -0.8, marginBottom: 24 },
  formSide: { flex: 1, alignItems: "center", justifyContent: "center", padding: 64 },
});
