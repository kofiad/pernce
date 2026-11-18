import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import type { SyncSession } from "@pernce/core";
import { notifyChange, subscribeChanges } from "../data/changes";
import { db } from "../db/client";
import { getMeta, setMeta } from "../data/meta";
import { SyncApi } from "../sync/api";
import type { SecretStore, SyncContext } from "../sync/context";
import { fromBase64, setCryptoProvider, toBase64 } from "../sync/crypto";
import { runSync, type SyncResult } from "../sync/engine";
import { hasOutbox } from "../sync/outbox";
import { LEGACY_SECRET_KEYS, SECRET_KEYS } from "../sync/secretKeys";
import { getServer, getSyncStatus, setSyncState } from "../sync/state";
import { syncCryptoProvider } from "./syncCrypto";
import { SYNC_URL } from "./syncFeature";

/** The app's sync wiring: native crypto, keychain storage, the API client
 * and when to sync. The sync logic itself is in src/sync/ (no React Native
 * imports, tested in Node). */

// Argon2id and random bytes for src/sync/crypto.ts: native libsodium on
// phones, libsodium's WebAssembly build on web (syncCrypto.ts /
// syncCrypto.web.ts; Metro picks the file per platform).
setCryptoProvider(syncCryptoProvider);

/** The server new sign-ins use unless changed on the sign-in screen
 * (syncFeature.ts). */
export const DEFAULT_SYNC_SERVER = SYNC_URL ?? "";

// Readable after the first unlock so the background task can sync, and
// never migrated to another device by a backup.
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

function stored<T>(key: string, encode: (v: T) => string, decode: (s: string) => T) {
  // The web has no keychain. The browser's own storage keeps you signed in
  // on this browser (the owner's choice); anyone with this browser profile
  // can read it.
  if (Platform.OS === "web") {
    return {
      async get(): Promise<T | null> {
        const s = localStorage.getItem(key);
        return s === null ? null : decode(s);
      },
      async set(value: T | null) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, encode(value));
      },
    };
  }
  return {
    async get(): Promise<T | null> {
      const s = await SecureStore.getItemAsync(key, STORE_OPTIONS);
      return s === null ? null : decode(s);
    },
    async set(value: T | null) {
      if (value === null) await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
      else await SecureStore.setItemAsync(key, encode(value), STORE_OPTIONS);
    },
  };
}

const session = stored<SyncSession>(SECRET_KEYS.session, JSON.stringify, JSON.parse);
const dataKey = stored<Uint8Array>(SECRET_KEYS.dataKey, toBase64, fromBase64);
const wrapKey = stored<Uint8Array>(SECRET_KEYS.wrapKey, toBase64, fromBase64);

const LEGACY_CLEARED = "legacy_sync_secrets_cleared";

/** Once per install: deletes the keychain entries the sync secrets had
 * before the rename (their account is gone). Never touches the current
 * keys, and never throws. */
export async function clearLegacySecrets(): Promise<void> {
  try {
    if (getMeta(db, LEGACY_CLEARED)) return;
    await Promise.all(
      LEGACY_SECRET_KEYS.map((key) =>
        Platform.OS === "web"
          ? Promise.resolve(localStorage.removeItem(key))
          : SecureStore.deleteItemAsync(key, STORE_OPTIONS),
      ),
    );
    setMeta(db, LEGACY_CLEARED, "1");
  } catch {
    // Best effort; tried again next launch.
  }
}

const secrets: SecretStore = {
  getSession: session.get,
  setSession: session.set,
  getDataKey: dataKey.get,
  setDataKey: dataKey.set,
  getWrapKey: wrapKey.get,
  setWrapKey: wrapKey.set,
};

export const syncContext: SyncContext = {
  db,
  secrets,
  api: new SyncApi({
    baseUrl: () => getServer(db) || DEFAULT_SYNC_SERVER || null,
    sessions: secrets,
    onSessionEnded: () => {
      setSyncState(db, "signed_out");
      notifyChange();
    },
  }),
  // The server keeps up to 100 characters.
  deviceName: (Constants.deviceName ?? (Platform.OS === "web" ? "Web browser" : undefined))?.slice(0, 100) || undefined,
};

let running: Promise<SyncResult> | null = null;
let again = false;

/** Syncs now, or right after the run in progress (one at a time, so two
 * runs never push the same outbox or refresh the same token). Null when
 * sync is off. */
export function requestSync(): Promise<SyncResult> | null {
  if (getSyncStatus(db).state !== "on") return null;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let result: SyncResult;
    do {
      again = false;
      result = await runSync(syncContext);
    } while (again && result.ok);
    running = null;
    return result;
  })();
  return running;
}

/** Wait after the last local write before pushing, so a burst of edits
 * goes up together. */
const DEBOUNCE_MS = 4000;

/** While the app is in the foreground, pull this often so edits from another
 * device show up without leaving and returning. A run with nothing new is
 * one cheap pull. */
const POLL_MS = 20_000;

/** Sync on app start, on returning to the foreground, on a timer while in
 * the foreground, and shortly after local writes (§5.2). Mounted once at the root, which also registers the
 * background task (lib/backgroundSync.ts). */
export function useSyncTriggers(state: string) {
  useEffect(() => {
    if (state !== "on") return;
    requestSync();
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") requestSync();
    });
    // requestSync is a no-op while a run is in progress, so a slow run never
    // stacks up polls.
    const poll = setInterval(() => {
      if (AppState.currentState === "active") requestSync();
    }, POLL_MS);
    // Back online (or the window focused): catch up now rather than at the
    // next poll. Browsers only; phones use AppState above.
    const onWake = () => void requestSync();
    if (Platform.OS === "web") {
      window.addEventListener("online", onWake);
      window.addEventListener("focus", onWake);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Every change notifies, including sync's own merges; only an outbox
    // with something in it is worth a run.
    const unsubscribe = subscribeChanges(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (getSyncStatus(db).state === "on" && hasOutbox(db)) requestSync();
      }, DEBOUNCE_MS);
    });
    return () => {
      appState.remove();
      clearInterval(poll);
      if (Platform.OS === "web") {
        window.removeEventListener("online", onWake);
        window.removeEventListener("focus", onWake);
      }
      unsubscribe();
      clearTimeout(timer);
    };
  }, [state]);
}

/** "5 min ago" for the last sync time. */
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
