/** The sync server's wire protocol (docs/mobile-scope.md §5–6), shared by the
 * server (web/src/sync) and the mobile sync client so both agree on shapes
 * and limits.
 *
 * The server never sees plaintext user data. Keys, as the client derives
 * them (mobile/src/sync/crypto.ts):
 *
 *   master     = Argon2id(password, kdf.salt, kdf.opsLimit, kdf.memLimit) -> 32 bytes
 *   authKey    = HMAC-SHA256(master, "pernce-sync-auth")   sent to the server, which stores only a hash of it
 *   wrapKey    = HMAC-SHA256(master, "pernce-sync-wrap")   never leaves the device
 *   dataKey    = 32 random bytes, made once on sign-up
 *   wrappedKeyPassword = XChaCha20-Poly1305(wrapKey, dataKey)
 *   wrappedKeyRecovery = XChaCha20-Poly1305(recoveryKey, dataKey)
 *   record.ciphertext  = XChaCha20-Poly1305(dataKey, JSON of the row)
 *
 * Binary values (authKey, salts, wrapped keys, ciphertext) travel as
 * standard base64. */

/** Kinds of synced rows. Plaintext on the server (§5.1). */
export const SYNC_COLLECTIONS = [
  "account",
  "transaction",
  "budget",
  "category",
  "rate_override",
  "profile",
] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

/** Argon2id parameters, in libsodium's crypto_pwhash units. */
export type SyncKdf = {
  algorithm: "argon2id";
  /** base64 of 16 random bytes, made on sign-up */
  salt: string;
  opsLimit: number;
  /** bytes */
  memLimit: number;
};

/** What a new account uses, and what /prelogin returns for an unknown email
 * (so the answer doesn't reveal whether the account exists). 3 passes over
 * 64 MiB: libsodium's interactive memory with a moderate pass count. */
export const DEFAULT_KDF_PARAMS = { algorithm: "argon2id", opsLimit: 3, memLimit: 64 * 1024 * 1024 } as const;

export const KDF_LIMITS = {
  opsLimit: { min: 1, max: 10 },
  memLimit: { min: 8 * 1024 * 1024, max: 1024 * 1024 * 1024 },
} as const;

export const SYNC_LIMITS = {
  /** Records per push. Keeps a request well under Vercel's 4.5 MB body cap. */
  pushRecords: 200,
  /** base64 characters of one record's ciphertext */
  recordCiphertext: 16 * 1024,
  /** Records per pull page (the server may return fewer to bound the size). */
  pullRecords: 500,
  /** base64 characters of a wrapped data key */
  wrappedKey: 512,
} as const;

/** A row as it travels between device and server. `ciphertext` is null only
 * for a tombstone (`deleted: true`). */
export type SyncRecord = {
  id: string;
  collection: SyncCollection;
  /** core hlc.ts timestamp of the last write; the higher one wins */
  hlc: string;
  deleted: boolean;
  keyVersion: number;
  ciphertext: string | null;
};

export type PulledRecord = SyncRecord & { serverSeq: number };

/** The server only checks that an HLC is well formed and compares with a
 * plain string compare (see hlc.ts). The node id is limited to a safe
 * alphabet so every HLC is plain ASCII. */
const SYNC_HLC = /^\d{13}-[0-9a-f]{4}-[0-9A-Za-z_]{1,64}$/;

export function isSyncHlc(s: string): boolean {
  return SYNC_HLC.test(s);
}

/** True if `a` is a later write than `b`. */
export function hlcAfter(a: string, b: string): boolean {
  return a > b;
}

export type SyncKeys = {
  kdf: SyncKdf;
  /** null after a password reset until a device holding the data key
   * re-wraps it (PUT /api/sync/keys) */
  wrappedKeyPassword: string | null;
  wrappedKeyRecovery: string;
  keyVersion: number;
};

export type SyncSession = {
  accessToken: string;
  /** epoch ms */
  accessTokenExpiresAt: number;
  refreshToken: string;
};

/** Returned by /login, /verify and /reset/confirm. */
export type SyncLoginResponse = SyncSession & {
  user: { id: string; email: string };
  keys: SyncKeys;
};

export type SyncPushRequest = { records: SyncRecord[] };
/** `stale`: ids the server already holds a later write for. Pull to get it. */
export type SyncPushResponse = { accepted: string[]; stale: string[] };

export type SyncPullResponse = {
  records: PulledRecord[];
  /** pass as `since` next time */
  cursor: number;
  hasMore: boolean;
  keyVersion: number;
};

/** Every error body is `{ error, message }`. */
export type SyncErrorCode =
  | "bad_request"
  | "unauthorized"
  | "invalid_credentials"
  | "email_not_verified"
  | "invalid_code"
  | "rate_limited"
  | "signups_closed"
  | "key_changed"
  | "quota_exceeded"
  | "email_unavailable"
  | "internal";

export type SyncError = { error: SyncErrorCode; message: string };

/** GET /api/fx: the server's daily rates, public and not user data (§5.2).
 * Rates are 1 unit -> USD as decimal strings (the mobile app stores them as
 * TEXT); USD itself is left out. `updatedAt` is ISO, null if none yet. */
export type FxRatesResponse = {
  source: string;
  rates: Record<string, string>;
  updatedAt: string | null;
};
