import * as LocalAuthentication from "expo-local-authentication";
import type { DB } from "../data/db";
import type { Messages } from "../i18n";
import { getMeta, setMeta } from "../data/meta";

/** App lock: biometrics where available (Face ID needs the usage string in
 * app.json, which the app's own builds include), always with the device
 * passcode as a fallback. */

export function isLockEnabled(db: DB) {
  return getMeta(db, "app_lock") === "1";
}

export function setLockEnabled(db: DB, enabled: boolean) {
  setMeta(db, "app_lock", enabled ? "1" : null);
}

/** Whether the device has any way to authenticate (passcode counts). */
export async function canUseLock() {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

export async function authenticate(t: Messages, promptMessage = t.lock.unlockPrompt) {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: t.lock.usePasscode,
    disableDeviceFallback: false,
  });
  return result.success;
}

/** How long the app can sit in the background before it locks again.
 * The default leaves time for the share sheet and document picker, which
 * background the app on Android, so an export doesn't lock mid-way. */
export const LOCK_AFTER = [0, 60_000, 300_000] as const;

export function getLockAfter(db: DB): number {
  const stored = getMeta(db, "lock_after");
  const ms = Number(stored);
  return stored !== null && (LOCK_AFTER as readonly number[]).includes(ms) ? ms : 60_000;
}

export function setLockAfter(db: DB, ms: number) {
  setMeta(db, "lock_after", String(ms));
}

export function lockAfterLabel(ms: number, t: Messages) {
  return t.lock.after[ms] ?? t.lock.after[60_000];
}
