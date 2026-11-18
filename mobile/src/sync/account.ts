import type { SyncKdf, SyncLoginResponse } from "@pernce/core";
import { notifyChange } from "../data/changes";
import { SyncApiError } from "./api";
import type { SyncContext } from "./context";
import {
  derivePasswordKeys,
  formatRecoveryKey,
  newKdf,
  parseRecoveryKey,
  randomKey,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
  type PasswordKeys,
} from "./crypto";
import { beginSession, clearSyncState, getKeyVersion, getSyncStatus, getSyncUser, setKeyVersion, setSyncState } from "./state";

/** Sign-up, sign-in, password reset and key recovery (docs/mobile-scope.md
 * §5.3). The password never leaves the device: it derives an auth key
 * (sent) and a wrap key (kept), and the data key that encrypts records is
 * only ever stored on the server wrapped by the wrap key or by the
 * recovery key. */

export const MIN_PASSWORD_LENGTH = 10;

export type SignedIn = { state: "on" | "needs_key" };

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Stores the session and works out the data key:
 * 1. the one this device just made (sign-up) or unwrapped with the password;
 * 2. after a password reset nobody re-wrapped it yet: if this device still
 *    holds the key for this account, re-wrap it for the new password;
 * 3. otherwise the device is signed in but needs the recovery key. */
async function completeSignIn(
  ctx: SyncContext,
  res: SyncLoginResponse,
  wrapKey: Uint8Array,
  knownDataKey: Uint8Array | null = null,
): Promise<SignedIn> {
  const { db, api, secrets } = ctx;
  await secrets.setSession({
    accessToken: res.accessToken,
    accessTokenExpiresAt: res.accessTokenExpiresAt,
    refreshToken: res.refreshToken,
  });
  await secrets.setWrapKey(wrapKey);

  let dataKey = knownDataKey;
  if (!dataKey && res.keys.wrappedKeyPassword) {
    dataKey = unwrapDataKey(wrapKey, res.keys.wrappedKeyPassword);
    if (!dataKey) throw new Error("Your password worked, but it couldn't open your encryption key. Use your recovery key.");
  }
  const sameAccount = getSyncUser(db)?.id === res.user.id && getKeyVersion(db) === res.keys.keyVersion;
  if (!dataKey && sameAccount) {
    const local = await secrets.getDataKey();
    if (local) {
      await api.putKeys({
        keyVersion: res.keys.keyVersion,
        wrappedKeyPassword: wrapDataKey(wrapKey, local),
        wrappedKeyRecovery: res.keys.wrappedKeyRecovery,
      });
      dataKey = local;
    }
  }

  beginSession(db, res.user, res.keys.keyVersion);
  await secrets.setDataKey(dataKey);
  const state = dataKey ? "on" : "needs_key";
  setSyncState(db, state);
  notifyChange();
  return { state };
}

// ---- sign-up ----

export type PendingSignup = {
  email: string;
  keys: PasswordKeys;
  dataKey: Uint8Array;
  /** Shown once, after the email is verified. */
  recoveryKey: string;
  body: { email: string; authKey: string; kdf: SyncKdf; wrappedKeyPassword: string; wrappedKeyRecovery: string };
};

/** Makes the keys and asks the server to email a code. Nothing is stored
 * on the device until the code is confirmed. */
export async function startSignup(ctx: SyncContext, emailInput: string, password: string): Promise<PendingSignup> {
  checkPassword(password);
  const email = normalizeEmail(emailInput);
  const kdf = newKdf();
  const keys = derivePasswordKeys(password, kdf);
  const dataKey = randomKey();
  const recovery = randomKey();
  const body = {
    email,
    authKey: toBase64(keys.authKey),
    kdf,
    wrappedKeyPassword: wrapDataKey(keys.wrapKey, dataKey),
    wrappedKeyRecovery: wrapDataKey(recovery, dataKey),
  };
  await ctx.api.signup(body);
  return { email, keys, dataKey, recoveryKey: formatRecoveryKey(recovery), body };
}

/** Sends the same sign-up again, which emails a new code (at most once a
 * minute; the server ignores faster retries). */
export async function resendSignupCode(ctx: SyncContext, pending: PendingSignup) {
  await ctx.api.signup(pending.body);
}

export async function finishSignup(ctx: SyncContext, pending: PendingSignup, code: string): Promise<SignedIn> {
  const res = await ctx.api.verify({ email: pending.email, code: code.trim(), deviceName: ctx.deviceName });
  return completeSignIn(ctx, res, pending.keys.wrapKey, pending.dataKey);
}

// ---- sign-in ----

export type PendingVerification = { email: string; wrapKey: Uint8Array };

/** `needs_code`: the account was never verified (sign-up was interrupted).
 * The server has just emailed a code; finish with verifyAndSignIn. */
export async function signIn(
  ctx: SyncContext,
  emailInput: string,
  password: string,
): Promise<SignedIn | { state: "needs_code"; pending: PendingVerification }> {
  const email = normalizeEmail(emailInput);
  const kdf = await ctx.api.prelogin(email);
  const keys = derivePasswordKeys(password, kdf);
  let res: SyncLoginResponse;
  try {
    res = await ctx.api.login({ email, authKey: toBase64(keys.authKey), deviceName: ctx.deviceName });
  } catch (e) {
    if (e instanceof SyncApiError && e.code === "email_not_verified") {
      return { state: "needs_code", pending: { email, wrapKey: keys.wrapKey } };
    }
    throw e;
  }
  return completeSignIn(ctx, res, keys.wrapKey);
}

/** Finishes an interrupted sign-up. Its recovery key was never shown, so
 * a new one is made and returned for the recovery-key screen. */
export async function verifyAndSignIn(
  ctx: SyncContext,
  pending: PendingVerification,
  code: string,
): Promise<SignedIn & { recoveryKey: string | null }> {
  const res = await ctx.api.verify({ email: pending.email, code: code.trim(), deviceName: ctx.deviceName });
  const result = await completeSignIn(ctx, res, pending.wrapKey);
  return { ...result, recoveryKey: result.state === "on" ? await newRecoveryKey(ctx) : null };
}

// ---- password reset ----

export async function requestPasswordReset(ctx: SyncContext, email: string) {
  await ctx.api.requestReset(normalizeEmail(email));
}

/** Sets the new password. The data key can't be carried over by the
 * server, so it's recovered on the device: from the recovery key if given,
 * or from this device if it still holds it (completeSignIn). Otherwise the
 * device ends up in `needs_key`. */
export async function confirmPasswordReset(
  ctx: SyncContext,
  input: { email: string; code: string; password: string; recoveryKey?: string },
): Promise<SignedIn> {
  checkPassword(input.password);
  const recovery = input.recoveryKey?.trim() ? parseRecoveryKey(input.recoveryKey) : null;
  if (input.recoveryKey?.trim() && !recovery) throw new Error("That doesn't look like a recovery key. Check it and try again.");
  const kdf = newKdf();
  const keys = derivePasswordKeys(input.password, kdf);
  const res = await ctx.api.confirmReset({
    email: normalizeEmail(input.email),
    code: input.code.trim(),
    authKey: toBase64(keys.authKey),
    kdf,
    wrappedKeyPassword: null,
    deviceName: ctx.deviceName,
  });
  const result = await completeSignIn(ctx, res, keys.wrapKey);
  if (result.state === "needs_key" && input.recoveryKey) {
    await recoverWithKey(ctx, input.recoveryKey);
    return { state: "on" };
  }
  return result;
}

// ---- keys ----

/** Opens the data key with the recovery key and re-wraps it for the
 * current password, so other devices can sign in normally again. */
export async function recoverWithKey(ctx: SyncContext, recoveryKeyText: string) {
  const { db, api, secrets } = ctx;
  const recovery = parseRecoveryKey(recoveryKeyText);
  if (!recovery) throw new Error("That doesn't look like a recovery key. Check it and try again.");
  const keys = await api.getKeys();
  const dataKey = unwrapDataKey(recovery, keys.wrappedKeyRecovery);
  if (!dataKey) throw new Error("That recovery key doesn't match this account.");
  const wrapKey = await secrets.getWrapKey();
  if (!wrapKey) throw new Error("Sign in again first.");
  await api.putKeys({
    keyVersion: keys.keyVersion,
    wrappedKeyPassword: wrapDataKey(wrapKey, dataKey),
    wrappedKeyRecovery: keys.wrappedKeyRecovery,
  });
  await secrets.setDataKey(dataKey);
  setKeyVersion(db, keys.keyVersion, { resync: false });
  setSyncState(db, "on");
  notifyChange();
}

/** For `needs_key` after a password reset: checks whether another device
 * that still had the data key has since signed in and re-wrapped it for
 * the new password. True if this device can sync again. */
export async function retryKey(ctx: SyncContext): Promise<boolean> {
  const { db, api, secrets } = ctx;
  const [keys, wrapKey] = await Promise.all([api.getKeys(), secrets.getWrapKey()]);
  const dataKey = wrapKey && keys.wrappedKeyPassword ? unwrapDataKey(wrapKey, keys.wrappedKeyPassword) : null;
  if (!dataKey) return false;
  const resync = keys.keyVersion !== getKeyVersion(db);
  await secrets.setDataKey(dataKey);
  setKeyVersion(db, keys.keyVersion, { resync });
  setSyncState(db, "on");
  notifyChange();
  return true;
}

/** For `needs_key`: opens the data key with the account password, when
 * the server holds it wrapped for that password (another device re-wrapped
 * it after a reset, or this device's keychain lost its copy). */
export async function unlockWithPassword(ctx: SyncContext, password: string) {
  const { db, api, secrets } = ctx;
  const user = getSyncUser(db);
  if (!user) throw new Error("Sign in again first.");
  const { wrapKey } = derivePasswordKeys(password, await api.prelogin(user.email));
  const keys = await api.getKeys();
  const dataKey = keys.wrappedKeyPassword ? unwrapDataKey(wrapKey, keys.wrappedKeyPassword) : null;
  if (!dataKey) throw new Error("That password can't open your synced data yet. Use your recovery key.");
  await secrets.setWrapKey(wrapKey);
  await secrets.setDataKey(dataKey);
  setKeyVersion(db, keys.keyVersion, { resync: keys.keyVersion !== getKeyVersion(db) });
  setSyncState(db, "on");
  notifyChange();
}

/** Replaces the recovery key; the old one stops working. */
export async function newRecoveryKey(ctx: SyncContext): Promise<string> {
  const { db, api, secrets } = ctx;
  const [keys, dataKey, wrapKey] = await Promise.all([api.getKeys(), secrets.getDataKey(), secrets.getWrapKey()]);
  if (!dataKey || !wrapKey || keys.keyVersion !== getKeyVersion(db)) {
    throw new Error("Your keys changed on another device. Sync, then try again.");
  }
  const recovery = randomKey();
  await api.putKeys({
    keyVersion: keys.keyVersion,
    wrappedKeyPassword: wrapDataKey(wrapKey, dataKey),
    wrappedKeyRecovery: wrapDataKey(recovery, dataKey),
  });
  return formatRecoveryKey(recovery);
}

/** For a lost data key: erases the cloud copy and starts again with a new
 * key (and recovery key) under the next key version. This device's data
 * is uploaded on the next sync; any other device still holding the old
 * key re-uploads its own data when it notices the change (engine.ts). */
export async function startOver(ctx: SyncContext): Promise<string> {
  const { db, api, secrets } = ctx;
  const wrapKey = await secrets.getWrapKey();
  if (!wrapKey) throw new Error("Sign in again first.");
  const keys = await api.getKeys();
  const dataKey = randomKey();
  const recovery = randomKey();
  await api.putKeys({
    keyVersion: keys.keyVersion + 1,
    wrappedKeyPassword: wrapDataKey(wrapKey, dataKey),
    wrappedKeyRecovery: wrapDataKey(recovery, dataKey),
  });
  await api.wipeRecords();
  await secrets.setDataKey(dataKey);
  setKeyVersion(db, keys.keyVersion + 1, { resync: true });
  setSyncState(db, "on");
  notifyChange();
  return formatRecoveryKey(recovery);
}

// ---- leaving ----

async function forgetLocally(ctx: SyncContext) {
  await Promise.all([
    ctx.secrets.setSession(null),
    ctx.secrets.setDataKey(null),
    ctx.secrets.setWrapKey(null),
  ]);
  clearSyncState(ctx.db);
  notifyChange();
}

/** Sync bookkeeping with no secrets behind it: the keychain entries it
 * belonged to are gone (the app was renamed in place and reads new keys, or
 * the keychain was restored without them). Forget the bookkeeping so the
 * device shows as signed out instead of failing every sync; local data
 * stays. True if it cleared anything. */
export async function dropOrphanedSyncState(ctx: SyncContext): Promise<boolean> {
  if (getSyncStatus(ctx.db).state === "off") return false;
  const [session, dataKey, wrapKey] = await Promise.all([
    ctx.secrets.getSession(),
    ctx.secrets.getDataKey(),
    ctx.secrets.getWrapKey(),
  ]);
  if (session || dataKey || wrapKey) return false;
  clearSyncState(ctx.db);
  notifyChange();
  return true;
}

/** Stops syncing on this device. Local data stays; the cloud copy stays. */
export async function signOut(ctx: SyncContext) {
  await ctx.api.logout();
  await forgetLocally(ctx);
}

/** Deletes the sync account and its cloud copy. Asks for the password
 * again (the server checks it). Local data stays. */
export async function deleteCloudAccount(ctx: SyncContext, password: string) {
  const user = getSyncUser(ctx.db);
  if (!user) throw new Error("Not signed in.");
  const kdf = await ctx.api.prelogin(user.email);
  const { authKey } = derivePasswordKeys(password, kdf);
  await ctx.api.deleteAccount(toBase64(authKey));
  await forgetLocally(ctx);
}
