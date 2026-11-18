import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Icon } from "../components/Icon";
import { ChoiceSheet, CurrencySheet } from "../components/inputs";
import { ACCOUNT_COLOURS, ColorRow, IconRow, PROFILE_ICONS, ProfileAvatar, profileLetters } from "../components/look";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  Group,
  GroupLabel,
  IconButton,
  ListRow,
  NavHeader,
  Row,
  Screen,
  T,
  Toggle,
} from "../components/ui";
import { deleteAllLocalData } from "../data/backup";
import { listCategories } from "../data/categories";
import { APPEARANCES, getAppearance, setAppearance } from "../data/preferences";
import { updateProfile } from "../data/profile";
import { listRates } from "../data/rates";
import { db } from "../db/client";
import { useData, useProfile } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { LOCK_AFTER, authenticate, canUseLock, getLockAfter, isLockEnabled, lockAfterLabel, setLockAfter, setLockEnabled } from "../lib/lock";
import { syncApp, syncEnabled } from "../lib/syncFeature";
import { useTheme } from "../lib/theme";
import { showAlert } from "../lib/alert";

// Personal build only (lib/syncFeature.ts).
const sync = syncEnabled ? syncApp() : null;
const useSyncAccountEmail = sync ? sync.useSyncAccountEmail : () => null;

type Sheet = "profile" | "currency" | "lockAfter" | "appearance";

/** M23 Settings: grouped lists; the destructive action sits last (M04
 * confirms it). Appearance opens M23a; the language is the phone's. The
 * artboard's Sync group is only in the personal build (lib/syncFeature.ts)
 * until sync ships (docs/mobile-scope.md §9). */
export default function Settings() {
  const { c } = useTheme();
  const t = useT();
  const profile = useProfile();
  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState(profile?.color ?? "primary");
  const [icon, setIcon] = useState<string | null>(profile?.icon ?? null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const lock = useData(isLockEnabled);
  const lockAfter = useData(getLockAfter);
  const appearance = useData(getAppearance);
  const categoryCount = useData((d) => listCategories(d).length);
  const manualRates = useData((d) => listRates(d).some((r) => r.override));
  const syncEmail = useSyncAccountEmail();

  async function toggleLock() {
    const next = !lock;
    if (next && !(await canUseLock())) {
      showAlert(t.lock.noPasscode, t.settings.noPasscodeBody);
      return;
    }
    // Confirm it's really the owner, both to turn on and to turn off.
    if (await authenticate(t, next ? t.lock.confirmOn : t.lock.confirmOff)) {
      setLockEnabled(db, next);
    }
  }

  async function wipe() {
    setConfirmWipe(false);
    if (isLockEnabled(db) && !(await authenticate(t, t.lock.confirmWipe))) return;
    await sync?.signOutBeforeWipe();
    // With no profile, the root layout's guard shows onboarding.
    deleteAllLocalData(db);
  }

  function saveProfile() {
    updateProfile(db, { name, color, icon });
    setSheet(null);
  }

  function openProfile() {
    // Start from what's saved, not from an edit that was closed unsaved.
    setName(profile?.name ?? "");
    setColor(profile?.color ?? "primary");
    setIcon(profile?.icon ?? null);
    setSheet("profile");
  }

  const check = (on: boolean) => (on ? <Icon name="check" color={c.text} /> : null);

  if (!profile) return null;
  const displayName = profile.name.trim();

  return (
    <Screen narrow>
      <NavHeader title={t.settings.title} />
      <Card style={{ marginTop: 8, marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 12 }} onPress={openProfile}>
        <ProfileAvatar profile={profile} size="md" />
        <View style={{ flex: 1 }}>
          <T variant="bodyBold" numberOfLines={1}>
            {displayName || t.settings.yourName}
          </T>
          <T variant="caption" color={c.stone} numberOfLines={1}>
            {syncEmail ?? (Platform.OS === "web" ? t.settings.storedInBrowser : t.settings.storedOnPhone)}
          </T>
        </View>
        <Icon name="chevron-right" color={c.text} variant="s" />
      </Card>

      <GroupLabel>{t.settings.preferences}</GroupLabel>
      <Group>
        <Row icon="user" title={t.settings.name} value={displayName || t.settings.notSet} onPress={openProfile} />
        <Row icon="globe" title={t.settings.baseCurrency} value={profile.baseCurrency} onPress={() => setSheet("currency")} />
        <Row icon="tag" title={t.categories.title} value={String(categoryCount)} onPress={() => router.push("/categories")} />
        <Row
          icon="swap"
          title={t.settings.exchangeRates}
          value={manualRates ? t.common.manual : t.common.auto}
          onPress={() => router.push("/rates")}
        />
        <Row icon="mode" title={t.settings.appearance} value={t.settings.appearances[appearance]} onPress={() => setSheet("appearance")} />
      </Group>

      {sync ? <sync.SyncSettingsGroup /> : null}

      <GroupLabel>{t.settings.yourData}</GroupLabel>
      <Group>
        <Row icon="upload" title={t.settings.exportData} onPress={() => router.push("/data")} />
        <Row icon="download" title={t.settings.importCsv} onPress={() => router.push("/data")} />
      </Group>

      {/* No Face ID or passcode in a browser, so no app lock on web. */}
      {Platform.OS === "web" ? null : (
        <>
          <GroupLabel>{t.settings.security}</GroupLabel>
          <Group>
            <Row icon="face" title={t.settings.appLock} right={<Toggle value={lock} onChange={toggleLock} label={t.settings.appLock} />} />
            {lock ? (
              <Row icon="refresh" title={t.lock.lockAfter} value={lockAfterLabel(lockAfter, t)} onPress={() => setSheet("lockAfter")} />
            ) : null}
          </Group>
        </>
      )}

      <Group style={{ marginTop: 24 }}>
        <Row
          left={<IconButton icon="trash" size="sm" label={t.settings.deleteLocal} iconColor={c.negativeText} />}
          title={t.settings.deleteLocal}
          titleColor={c.negativeText}
          chevron={false}
          onPress={() => setConfirmWipe(true)}
        />
      </Group>

      <T variant="caption" color={c.stone} align="center" style={{ marginTop: 24 }}>
        Pernce · {Constants.expoConfig?.version ?? ""}
      </T>

      <ChoiceSheet visible={sheet === "profile"} title={t.look.profile} onClose={() => setSheet(null)}>
        <View style={{ alignItems: "center", marginTop: 4, marginBottom: 20 }}>
          <ProfileAvatar profile={{ name, color, icon }} size="lg" />
        </View>
        <Field
          label={t.settings.yourName}
          value={name}
          onChangeText={setName}
          placeholder={t.onboarding.namePlaceholder}
          autoCapitalize="words"
        />
        <ColorRow value={color} onChange={setColor} presets={ACCOUNT_COLOURS} icon={icon} letters={profileLetters(name)} />
        <IconRow value={icon} onChange={setIcon} suggestions={PROFILE_ICONS} initials={profileLetters(name)} />
        <Button label={t.common.save} onPress={saveProfile} />
      </ChoiceSheet>
      <CurrencySheet
        visible={sheet === "currency"}
        title={t.settings.baseCurrency}
        value={profile.baseCurrency}
        onClose={() => setSheet(null)}
        onChange={(baseCurrency) => updateProfile(db, { baseCurrency })}
      />
      <ChoiceSheet visible={sheet === "lockAfter"} title={t.lock.lockAfter} onClose={() => setSheet(null)}>
        {LOCK_AFTER.map((ms, i) => (
          <ListRow
            key={ms}
            title={lockAfterLabel(ms, t)}
            right={check(ms === lockAfter)}
            onPress={() => {
              setLockAfter(db, ms);
              setSheet(null);
            }}
            last={i === LOCK_AFTER.length - 1}
          />
        ))}
      </ChoiceSheet>
      <ChoiceSheet visible={sheet === "appearance"} title={t.settings.appearance} onClose={() => setSheet(null)}>
        {APPEARANCES.map((a, i) => (
          <ListRow
            key={a}
            title={t.settings.appearances[a]}
            sub={a === "system" ? t.settings.matchPhone : undefined}
            right={check(a === appearance)}
            onPress={() => {
              setAppearance(db, a);
              setSheet(null);
            }}
            last={i === APPEARANCES.length - 1}
          />
        ))}
      </ChoiceSheet>

      <ConfirmDialog
        visible={confirmWipe}
        title={t.settings.wipeTitle}
        body={t.settings.wipeBody}
        confirmLabel={t.settings.wipeConfirm}
        onConfirm={wipe}
        onCancel={() => setConfirmWipe(false)}
      />
    </Screen>
  );
}
