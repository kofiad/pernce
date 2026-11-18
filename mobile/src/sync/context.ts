import type { DB } from "../data/db";
import type { SessionStore, SyncApi } from "./api";

/** Secrets kept in the platform keychain (expo-secure-store in the app,
 * a Map in tests). The data key opens records; the wrap key (derived from
 * the password) lets this device follow a key change made on another one
 * without asking for the password again. */
export type SecretStore = SessionStore & {
  getDataKey(): Promise<Uint8Array | null>;
  setDataKey(key: Uint8Array | null): Promise<void>;
  getWrapKey(): Promise<Uint8Array | null>;
  setWrapKey(key: Uint8Array | null): Promise<void>;
};

export type SyncContext = {
  db: DB;
  api: SyncApi;
  secrets: SecretStore;
  /** Shown in the server's session list. */
  deviceName?: string;
  /** Tests only: stands in for the set of currencies this build accepts
   * (default: core's CURRENCIES), to simulate an app update. */
  currencySignature?: string;
};
