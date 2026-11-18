import { z } from "zod";
import { KDF_LIMITS, SYNC_COLLECTIONS, SYNC_LIMITS, isSyncHlc } from "@pernce/core/sync";

/** Request bodies for the sync API. The shapes are documented in core sync.ts. */

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const base64 = (maxLength: number) => z.string().max(maxLength).regex(BASE64, "must be base64");

/** base64 of exactly `bytes` bytes */
const base64Bytes = (bytes: number) =>
  z
    .string()
    .regex(BASE64, "must be base64")
    .refine((s) => Buffer.from(s, "base64").length === bytes, `must be ${bytes} bytes`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

/** The client's Argon2-derived auth key (never the password). */
const authKey = base64Bytes(32);

const kdf = z.object({
  algorithm: z.literal("argon2id"),
  salt: base64Bytes(16),
  opsLimit: z.int().min(KDF_LIMITS.opsLimit.min).max(KDF_LIMITS.opsLimit.max),
  memLimit: z.int().min(KDF_LIMITS.memLimit.min).max(KDF_LIMITS.memLimit.max),
});

const wrappedKey = base64(SYNC_LIMITS.wrappedKey).min(1);
const code = z.string().trim().regex(/^\d{6}$/, "must be the 6-digit code");
const deviceName = z.string().trim().max(100).optional();
const refreshToken = z.string().min(1).max(200);

export const preloginSchema = z.object({ email: emailSchema });

export const signupSchema = z.object({
  email: emailSchema,
  authKey,
  kdf,
  wrappedKeyPassword: wrappedKey,
  wrappedKeyRecovery: wrappedKey,
});

export const verifySchema = z.object({ email: emailSchema, code, deviceName });

export const loginSchema = z.object({ email: emailSchema, authKey, deviceName });

export const refreshSchema = z.object({ refreshToken });

export const resetRequestSchema = z.object({ email: emailSchema });

export const resetConfirmSchema = z.object({
  email: emailSchema,
  code,
  authKey,
  kdf,
  /** Null unless this device can still unwrap the data key (e.g. with the
   * recovery key). */
  wrappedKeyPassword: wrappedKey.nullable(),
  /** Only when the device also made a new recovery key. */
  wrappedKeyRecovery: wrappedKey.optional(),
  deviceName,
});

export const putKeysSchema = z.object({
  keyVersion: z.int().min(1),
  wrappedKeyPassword: wrappedKey,
  wrappedKeyRecovery: wrappedKey,
});

export const deleteAccountSchema = z.object({ authKey });

const record = z
  .object({
    id: z.uuid(),
    collection: z.enum(SYNC_COLLECTIONS),
    hlc: z.string().refine(isSyncHlc, "must be an HLC timestamp"),
    deleted: z.boolean(),
    keyVersion: z.int().min(1),
    // nonce (24) + tag (16) at the very least
    ciphertext: base64(SYNC_LIMITS.recordCiphertext).min(56).nullable(),
  })
  .refine((r) => r.deleted || r.ciphertext !== null, "only a deleted record may omit its ciphertext");

export const pushSchema = z.object({
  records: z.array(record).max(SYNC_LIMITS.pushRecords),
});

export const pullQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_LIMITS.pullRecords).default(SYNC_LIMITS.pullRecords),
});
