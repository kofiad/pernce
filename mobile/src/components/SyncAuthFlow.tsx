import { useRef, useState, type ReactNode } from "react";
import { Pressable, Share, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import { db } from "../db/client";
import { useData } from "../lib/hooks";
import { DEFAULT_SYNC_SERVER, syncContext } from "../lib/sync";
import { FONT, radius, useTheme } from "../lib/theme";
import {
  MIN_PASSWORD_LENGTH,
  confirmPasswordReset,
  finishSignup,
  recoverWithKey,
  requestPasswordReset,
  resendSignupCode,
  signIn,
  startOver,
  startSignup,
  unlockWithPassword,
  verifyAndSignIn,
  type PendingSignup,
  type PendingVerification,
} from "../sync/account";
import { SyncApiError } from "../sync/api";
import { getServer, getSyncUser, setServer } from "../sync/state";
import { Icon } from "./Icon";
import {
  Actions,
  Button,
  Card,
  ConfirmDialog,
  ErrorCard,
  Field,
  FieldLabel,
  IconButton,
  InsetNote,
  Link,
  T,
  styles as ui,
  text,
} from "./ui";

/** Sign up, sign in and reset password for sync (docs/mobile-scope.md §5.3,
 * §7; artboard M27–M30). Used inside onboarding and from Settings -> Sync.
 * Every path ends in `onDone`, after any recovery-key screen. */

export type AuthMode = "signin" | "signup" | "reset";

type Step =
  | { kind: "form" }
  | { kind: "signup-code"; pending: PendingSignup }
  | { kind: "verify-code"; pending: PendingVerification }
  | { kind: "reset-code"; email: string }
  | { kind: "show-recovery"; recoveryKey: string }
  | { kind: "needs-key" };

function message(e: unknown) {
  if (e instanceof SyncApiError) {
    if (e.code === "invalid_credentials") return "Wrong email or password.";
    if (e.code === "network") return e.message;
    if (e.code === "signups_closed") return "This server isn't taking new sign-ups.";
    if (e.code === "email_unavailable") return "The server can't send email right now. Try again later.";
  }
  return e instanceof Error ? e.message : String(e);
}

/** Lets the spinner paint before Argon2id blocks the JS thread for a
 * second or so. */
const nextFrame = () => new Promise((r) => setTimeout(r, 50));

/** A screen's intro: optional 64px icon plate, heading-lg title, muted
 * lead. */
export function Intro({ icon, title, children, top = 8 }: { icon?: string; title: string; children?: ReactNode; top?: number }) {
  const { c } = useTheme();
  return (
    <>
      {icon ? (
        <View style={{ marginTop: top, marginBottom: 20 }}>
          <IconButton icon={icon} label={title} px={64} iconVariant="l" />
        </View>
      ) : null}
      <T variant="title" style={{ marginTop: icon ? 0 : top, marginBottom: 8 }}>
        {title}
      </T>
      {children ? (
        <T variant="bodySm" color={c.mute} style={{ marginBottom: 24 }}>
          {children}
        </T>
      ) : null}
    </>
  );
}

/** A password field with the eye toggle. */
function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
  newPassword,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  error?: string | null;
  hint?: string;
  newPassword?: boolean;
}) {
  const { c } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChange}
      secureTextEntry={!visible}
      textContentType={newPassword ? "newPassword" : "password"}
      autoCapitalize="none"
      autoCorrect={false}
      lead="lock"
      trail={
        <Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"} onPress={() => setVisible(!visible)} hitSlop={10}>
          <Icon name="eye" color={value ? c.text : c.placeholder} variant="s" />
        </Pressable>
      }
      error={error}
      hint={hint}
    />
  );
}

/** code6: one box per digit over a hidden input. */
function CodeBoxes({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const { c } = useTheme();
  const input = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable onPress={() => input.current?.focus()} style={[s.code, { marginBottom: 20 }]} accessibilityLabel="6-digit code">
      {Array.from({ length: 6 }, (_, i) => {
        const on = focused && i === Math.min(value.length, 5);
        return (
          <View
            key={i}
            style={[
              s.codeBox,
              { backgroundColor: c.field, borderColor: on ? c.text : c.fieldBorder },
              on ? { boxShadow: `0 0 0 1px ${c.text}` } : null,
            ]}
          >
            <Text style={[s.codeDigit, { color: c.text }]}>{value[i] ?? ""}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        style={s.hiddenInput}
      />
    </Pressable>
  );
}

export function SyncAuthFlow({ initialMode, onDone }: { initialMode: AuthMode; onDone: () => void }) {
  const { c } = useTheme();
  const knownEmail = useData(getSyncUser)?.email ?? "";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [server, setServerInput] = useState(() => getServer(db) || DEFAULT_SYNC_SERVER);
  const [editServer, setEditServer] = useState(!server);
  const [email, setEmail] = useState(knownEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await nextFrame();
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  function applyServer() {
    if (!/^https?:\/\/\S+$/.test(server.trim())) throw new Error("Enter the sync server's address, starting with https://");
    setServer(db, server);
  }

  function checkNewPassword() {
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    if (password !== confirm) throw new Error("The passwords don’t match.");
  }

  const toMode = (next: AuthMode) => {
    setMode(next);
    setStep({ kind: "form" });
    setError(null);
    setInfo(null);
  };
  const afterSignIn = (state: "on" | "needs_key") => (state === "on" ? onDone() : setStep({ kind: "needs-key" }));
  const mismatch = confirm.length > 0 && password !== confirm ? "The passwords don’t match." : null;

  const serverField = (
    <Field
      label="Sync server"
      value={server}
      onChangeText={setServerInput}
      editable={editServer}
      placeholder="https://…"
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="url"
      lead="globe"
      hint={DEFAULT_SYNC_SERVER ? undefined : "The address of your Pernce sync server, from whoever runs it."}
      trail={editServer ? undefined : <Link small label="Change" onPress={() => setEditServer(true)} />}
    />
  );

  const emailField = (
    <Field
      label="Email"
      value={email}
      onChangeText={setEmail}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      keyboardType="email-address"
      textContentType="emailAddress"
      lead="mail"
    />
  );

  const feedback = (
    <>
      {error ? <ErrorCard title={error} style={{ marginBottom: 20 }} /> : null}
      {info ? (
        <InsetNote icon="info" style={{ marginBottom: 20 }}>
          {info}
        </InsetNote>
      ) : null}
    </>
  );

  if (step.kind === "show-recovery") {
    return <RecoveryKeyView recoveryKey={step.recoveryKey} onDone={onDone} />;
  }

  if (step.kind === "needs-key") {
    return <UnlockView onDone={onDone} onSkip={onDone} />;
  }

  if (step.kind === "signup-code" || step.kind === "verify-code") {
    return (
      <>
        <Intro icon="mail" title="Check your email" />
        <T variant="bodySm" color={c.mute} style={{ marginBottom: 28 }}>
          Finish signing up: we’ve emailed a code to{" "}
          <T variant="bodySm" weight="700">
            {email.trim()}
          </T>
          .
        </T>
        <FieldLabel>6-digit code</FieldLabel>
        <CodeBoxes value={code} onChange={setCode} />
        {step.kind === "signup-code" ? (
          <T variant="caption" color={c.mute}>
            Didn’t get it?{" "}
            <Text
              accessibilityRole="link"
              style={[text.caption, { fontFamily: FONT["600"], color: c.link }]}
              onPress={() =>
                run(async () => {
                  await resendSignupCode(syncContext, step.pending);
                  setInfo("If a minute has passed since the last one, a new code is on its way.");
                })
              }
            >
              Send a new code
            </Text>
          </T>
        ) : null}
        <View style={{ height: 20 }} />
        {feedback}
        <Actions>
          <Button
            label="Verify"
            loading={busy}
            disabled={code.length !== 6}
            onPress={() =>
              run(async () => {
                if (step.kind === "signup-code") {
                  const result = await finishSignup(syncContext, step.pending, code);
                  if (result.state === "on") setStep({ kind: "show-recovery", recoveryKey: step.pending.recoveryKey });
                  else afterSignIn(result.state);
                } else {
                  const result = await verifyAndSignIn(syncContext, step.pending, code);
                  if (result.recoveryKey) setStep({ kind: "show-recovery", recoveryKey: result.recoveryKey });
                  else afterSignIn(result.state);
                }
              })
            }
          />
          <Button label="Back to sign in" variant="text" onPress={() => toMode("signin")} />
        </Actions>
      </>
    );
  }

  if (step.kind === "reset-code") {
    return (
      <>
        <Intro title="Choose a new password">Enter the code we emailed to {step.email.trim()} and a new password.</Intro>
        <FieldLabel>6-digit code</FieldLabel>
        <CodeBoxes value={code} onChange={setCode} />
        <PasswordField label="New password" value={password} onChange={setPassword} newPassword hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
        <PasswordField label="Repeat new password" value={confirm} onChange={setConfirm} newPassword error={mismatch} />
        <Field
          label="Recovery key (if you have it)"
          value={recoveryKey}
          onChangeText={setRecoveryKey}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="XXXX-XXXX-…"
          lead="key"
          mono
          hint="Without it, your synced data can only be unlocked again from a phone that still has it."
        />
        {feedback}
        <Actions>
          <Button
            label="Reset password"
            loading={busy}
            disabled={code.length !== 6}
            onPress={() =>
              run(async () => {
                checkNewPassword();
                const result = await confirmPasswordReset(syncContext, { email, code, password, recoveryKey });
                afterSignIn(result.state);
              })
            }
          />
          <Button label="Back to sign in" variant="text" onPress={() => toMode("signin")} />
        </Actions>
      </>
    );
  }

  if (mode === "reset") {
    return (
      <>
        <Intro title="Reset your password">We’ll email you a code to choose a new one.</Intro>
        {emailField}
        {serverField}
        {feedback}
        <Actions>
          <Button
            label="Email me a code"
            loading={busy}
            onPress={() =>
              run(async () => {
                applyServer();
                await requestPasswordReset(syncContext, email);
                setCode("");
                setPassword("");
                setConfirm("");
                setStep({ kind: "reset-code", email });
              })
            }
          />
          <Button label="Back to sign in" variant="text" onPress={() => toMode("signin")} />
        </Actions>
      </>
    );
  }

  if (mode === "signup") {
    return (
      <>
        <Intro title="Create a sync account">
          Your password encrypts your data. We can’t reset what we can’t read — you’ll get a recovery key next.
        </Intro>
        {emailField}
        <PasswordField label="Password" value={password} onChange={setPassword} newPassword hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
        <PasswordField label="Repeat password" value={confirm} onChange={setConfirm} newPassword error={mismatch} />
        {feedback}
        <Actions>
          <Button
            label="Create account"
            loading={busy}
            onPress={() =>
              run(async () => {
                applyServer();
                checkNewPassword();
                const pending = await startSignup(syncContext, email, password);
                setCode("");
                setStep({ kind: "signup-code", pending });
              })
            }
          />
          <Button label="I already have an account" variant="text" onPress={() => toMode("signin")} />
        </Actions>
      </>
    );
  }

  return (
    <>
      <Intro title="Sign in to sync">Use the account you created on your other phone.</Intro>
      {emailField}
      <PasswordField label="Password" value={password} onChange={setPassword} />
      <View style={{ alignItems: "flex-end", marginTop: -8, marginBottom: 20 }}>
        <Link label="Forgot password?" onPress={() => toMode("reset")} />
      </View>
      {serverField}
      {feedback}
      <Actions>
        <Button
          label="Sign in"
          loading={busy}
          onPress={() =>
            run(async () => {
              applyServer();
              const result = await signIn(syncContext, email, password);
              if (result.state === "needs_code") {
                setCode("");
                setStep({ kind: "verify-code", pending: result.pending });
              } else {
                afterSignIn(result.state);
              }
            })
          }
        />
        <Button label="Create an account" variant="text" onPress={() => toMode("signup")} />
      </Actions>
    </>
  );
}

/** M30: shown once, right after the key is made. Continue stays
 * secondary until the key has been saved or copied. */
export function RecoveryKeyView({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const { c } = useTheme();
  const [saved, setSaved] = useState(false);
  const groups = recoveryKey.split("-");
  const rows = Array.from({ length: Math.ceil(groups.length / 3) }, (_, i) => groups.slice(i * 3, i * 3 + 3));
  return (
    <>
      <Intro icon="key" title="Save your recovery key">
        If you forget your password, this key is the only way back into your synced data.
      </Intro>
      <Card style={{ marginBottom: 16 }}>
        <View style={s.rkey} accessible accessibilityLabel={`Recovery key ${recoveryKey}`}>
          {rows.map((row, r) => (
            <View key={r} style={s.rkeyRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[s.rkeyCell, row[i] ? { backgroundColor: c.inset } : null]}>
                  <Text style={[s.rkeyText, { color: c.text }]}>{row[i] ?? ""}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </Card>
      <InsetNote icon="alert">
        Store it somewhere safe and offline — a password manager or printed copy. We can’t recover it for you.
      </InsetNote>
      <Actions style={{ marginTop: "auto", paddingTop: 24 }}>
        <Button
          label="Save or copy…"
          variant={saved ? "outline" : "primary"}
          icon="copy"
          onPress={() =>
            Share.share({ message: `Pernce recovery key: ${recoveryKey}` })
              .then((r) => r.action === Share.sharedAction && setSaved(true))
              .catch(() => {})
          }
        />
        <Button label="Continue" variant={saved ? "primary" : "outline"} onPress={onDone} />
      </Actions>
    </>
  );
}

/** M32: unlock synced data with the password or the recovery key; "Lost
 * both?" starts over. */
export function UnlockView({ onDone, onSkip, top = 8 }: { onDone: () => void; onSkip?: () => void; top?: number }) {
  const { c } = useTheme();
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState<"unlock" | "startover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function run(kind: "unlock" | "startover", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await nextFrame();
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  if (newKey) return <RecoveryKeyView recoveryKey={newKey} onDone={onDone} />;

  return (
    <>
      <Intro icon="lock" title="Unlock your synced data" top={top}>
        Enter your password, or your recovery key if you’ve forgotten it.
      </Intro>
      <PasswordField label="Password" value={password} onChange={setPassword} />
      <View style={[ui.inline, { gap: 12, marginTop: -4, marginBottom: 16 }]}>
        <View style={[s.rule, { backgroundColor: c.hairline }]} />
        <T variant="caption" color={c.stone}>
          or
        </T>
        <View style={[s.rule, { backgroundColor: c.hairline }]} />
      </View>
      <Field
        label="Recovery key"
        value={recovery}
        onChangeText={setRecovery}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="XXXX-XXXX-…"
        lead="key"
        mono
      />
      {error ? <ErrorCard title={error} style={{ marginBottom: 20 }} /> : null}
      <Button
        label="Unlock"
        loading={busy === "unlock"}
        disabled={!password && !recovery.trim()}
        onPress={() =>
          run("unlock", async () => {
            if (recovery.trim()) await recoverWithKey(syncContext, recovery);
            else await unlockWithPassword(syncContext, password);
            onDone();
          })
        }
      />
      {onSkip ? <Button label="Not now" variant="text" onPress={onSkip} style={{ marginTop: 12 }} /> : null}
      <Card inset style={{ marginTop: "auto" }}>
        <T variant="label" style={{ marginBottom: 4 }}>
          Lost both?
        </T>
        <T variant="caption" color={c.mute} style={{ marginBottom: 12 }}>
          Start over erases the cloud copy. Data on this phone stays.
        </T>
        <Button label="Start over" variant="danger" small loading={busy === "startover"} onPress={() => setConfirm(true)} />
      </Card>
      <View style={{ height: 24 }} />
      <ConfirmDialog
        visible={confirm}
        icon="alert"
        title="Erase the cloud copy?"
        body="Synced data that isn't on this phone (or another signed-in phone) is lost for good."
        confirmLabel="Start over"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          run("startover", async () => setNewKey(await startOver(syncContext)));
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  code: { flexDirection: "row", gap: 8 },
  codeBox: { flex: 1, height: 60, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  codeDigit: { fontFamily: FONT["500"], fontSize: 24, lineHeight: 32 },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  rkey: { gap: 8 },
  rkeyRow: { flexDirection: "row", gap: 8 },
  rkeyCell: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  rkeyText: { fontFamily: FONT.mono, fontSize: 15, lineHeight: 20, letterSpacing: 0.5 },
  rule: { flex: 1, height: 1 },
});
