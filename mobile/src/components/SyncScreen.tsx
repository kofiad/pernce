import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { RecoveryKeyView, UnlockView } from "./SyncAuthFlow";
import {
  Actions,
  Button,
  Card,
  ConfirmDialog,
  ErrorCard,
  Field,
  Group,
  GroupLabel,
  IconButton,
  Inline,
  NavHeader,
  Row,
  Screen,
  T,
} from "./ui";
import { db } from "../db/client";
import { useData } from "../lib/hooks";
import { authenticate, isLockEnabled } from "../lib/lock";
import { requestSync, syncContext } from "../lib/sync";
import { dateLabel, type Messages } from "../i18n";
import { useT } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { deleteCloudAccount, newRecoveryKey, signOut } from "../sync/account";
import { describeError, PULL_SAVE_FAILED } from "../sync/engine";
import { countOutbox } from "../sync/outbox";
import { getSyncStatus } from "../sync/state";

/** "Today, 09:39", "Sep 12, 18:05", or "Never". */
function lastSynced(iso: string | null, t: Messages) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const day = dateLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, t);
  return `${day.split(",")[0]}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const FEATURES = [
  { icon: "lock", title: "End-to-end encrypted", body: "Only your password or recovery key unlocks it." },
  { icon: "refresh", title: "Works offline", body: "Changes queue up and upload when you’re back online." },
  { icon: "key", title: "Recovery key", body: "A backup key in case you forget your password." },
];

/** Settings -> Sync (docs/mobile-scope.md §7): M26 intro when off, M31
 * status when on, M32 unlock when the key is missing. */
export function SyncScreen() {
  const { c } = useTheme();
  const t = useT();
  const status = useData(getSyncStatus);
  const pending = useData((d) => (status.state === "on" ? countOutbox(d) : 0), [status.state]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"signout" | "delete" | null>(null);
  const [password, setPassword] = useState("");

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 50));
      await fn();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  async function confirmOwner(reason: string) {
    return !isLockEnabled(db) || (await authenticate(t, reason));
  }

  if (recoveryKey) {
    return (
      <Screen narrow>
        <NavHeader parent={{ label: t.settings.title, href: "/settings" }} title="Sync" onBack={() => setRecoveryKey(null)} />
        <RecoveryKeyView recoveryKey={recoveryKey} onDone={() => setRecoveryKey(null)} />
      </Screen>
    );
  }

  if (status.state === "off") {
    return (
      <Screen narrow>
        <NavHeader parent={{ label: t.settings.title, href: "/settings" }} title="Sync" />
        <View style={{ marginTop: 16 }}>
          <IconButton icon="cloud" label="Sync" px={72} iconVariant="xl" />
        </View>
        <T variant="title" style={{ marginTop: 24, marginBottom: 12 }}>
          Sync between your phones
        </T>
        <T variant="body" color={c.mute} style={{ marginBottom: 28 }}>
          Your data is encrypted on this phone before it leaves. The server stores ciphertext it can’t read.
        </T>
        <View style={{ gap: 16 }}>
          {FEATURES.map((f) => (
            <Inline key={f.title} style={{ alignItems: "flex-start" }}>
              <IconButton icon={f.icon} size="sm" label={f.title} />
              <View style={{ flex: 1 }}>
                <T variant="label">{f.title}</T>
                <T variant="caption" color={c.mute}>
                  {f.body}
                </T>
              </View>
            </Inline>
          ))}
        </View>
        <Actions style={{ paddingTop: 24 }}>
          <Button label="Create a sync account" onPress={() => router.push("/sync-auth?mode=signup")} />
          <Button label="Sign in" variant="outline" onPress={() => router.push("/sync-auth?mode=signin")} />
        </Actions>
      </Screen>
    );
  }

  if (status.state === "needs_key") {
    return (
      <Screen narrow>
        <NavHeader parent={{ label: t.settings.title, href: "/settings" }} title="Sync" />
        <UnlockView top={16} onDone={() => requestSync()} />
      </Screen>
    );
  }

  const host = status.server?.replace(/^https?:\/\//, "") ?? "";
  const signedOut = status.state === "signed_out";
  const headline = signedOut ? "Signed out" : pending > 0 ? "Changes waiting" : status.lastError ? "Couldn’t sync" : "Up to date";

  return (
    <Screen narrow>
      <NavHeader parent={{ label: t.settings.title, href: "/settings" }} title="Sync" />
      <Card style={{ marginTop: 8, marginBottom: 8 }}>
        <Inline style={{ marginBottom: 16 }}>
          <IconButton icon={signedOut || status.lastError ? "alert" : "check"} variant="selected" label={headline} />
          <View style={{ flex: 1 }}>
            <T variant="bodyBold">{headline}</T>
            <T variant="caption" color={c.mute}>
              {signedOut ? "This phone was signed out, for example after a password reset." : "End-to-end encrypted"}
            </T>
          </View>
        </Inline>
        {signedOut ? (
          <Button label="Sign in again" onPress={() => router.push("/sync-auth?mode=signin")} />
        ) : (
          <Button
            label="Sync now"
            icon="refresh"
            loading={busy === "sync"}
            onPress={() =>
              run("sync", async () => {
                const result = await requestSync();
                if (result && !result.ok) setError(result.error);
              })
            }
          />
        )}
      </Card>
      {error || status.lastError ? (
        <ErrorCard
          title={status.failures > 1 ? `Couldn’t sync ${status.failures} times since ${lastSynced(status.failingSince, t)}` : "Couldn’t sync"}
          style={{ marginBottom: 8 }}
        >
          {error ?? status.lastError}
          {status.failures > 1 && status.lastError?.startsWith(PULL_SAVE_FAILED)
            ? "\n\nChanges from your other devices can’t arrive until this works. Sync now to try again; on the web, reload the page first."
            : ""}
        </ErrorCard>
      ) : null}
      {status.rejected > 0 ? (
        <ErrorCard title={`${status.rejected} change${status.rejected === 1 ? "" : "s"} not applied`} style={{ marginBottom: 8 }}>
          Changes from your other phones were invalid here. Updating the app on every phone usually fixes this.
        </ErrorCard>
      ) : null}
      {signedOut ? null : (
        <Group>
          <Row title="Last synced" value={lastSynced(status.lastSyncAt, t)} chevron={false} />
          <Row title="Changes waiting to upload" value={String(pending)} chevron={false} />
        </Group>
      )}

      <GroupLabel>Account</GroupLabel>
      <Group>
        <Row icon="mail" title={status.user?.email ?? ""} chevron={false} />
        <Row icon="globe" title="Server" value={host} chevron={false} />
      </Group>

      {signedOut ? null : (
        <>
          <GroupLabel>Recovery key</GroupLabel>
          <Group>
            <Row
              icon="key"
              title="Make a new recovery key"
              onPress={() =>
                run("recovery", async () => {
                  if (!(await confirmOwner("Confirm to make a new recovery key"))) return;
                  setRecoveryKey(await newRecoveryKey(syncContext));
                })
              }
            />
          </Group>
        </>
      )}

      <Actions inline style={{ marginTop: 28 }}>
        <Button label="Sign out" variant="outline" icon="log-out" loading={busy === "signout"} onPress={() => setDialog("signout")} />
        {signedOut ? null : <Button label="Delete cloud account" variant="danger" icon="trash" onPress={() => setDialog("delete")} />}
      </Actions>

      <ConfirmDialog
        visible={dialog === "signout"}
        icon="log-out"
        title="Sign out of sync?"
        body="Your data stays on this phone and in the cloud. Changes stop syncing until you sign in again."
        confirmLabel="Sign out"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          run("signout", () => signOut(syncContext));
        }}
      />
      <ConfirmDialog
        visible={dialog === "delete"}
        title="Delete cloud account?"
        body="This deletes your sync account and the encrypted cloud copy. Data on your phones stays."
        confirmLabel="Delete cloud account"
        busy={busy === "delete"}
        onCancel={() => {
          setPassword("");
          setDialog(null);
        }}
        onConfirm={() =>
          run("delete", async () => {
            await deleteCloudAccount(syncContext, password);
            setPassword("");
            setDialog(null);
          })
        }
      >
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" lead="lock" />
        {error && dialog === "delete" ? (
          <T variant="caption" color={c.negativeText} style={{ marginTop: -12, marginBottom: 16 }}>
            {error}
          </T>
        ) : null}
      </ConfirmDialog>
    </Screen>
  );
}
