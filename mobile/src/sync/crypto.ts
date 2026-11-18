import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { DEFAULT_KDF_PARAMS, type SyncCollection, type SyncKdf } from "@pernce/core";

/** End-to-end encryption for sync (docs/mobile-scope.md §5.3), following
 * the key contract in core sync.ts:
 *
 *   master  = Argon2id(password, kdf)            native libsodium on the phone
 *   authKey = HMAC-SHA256(master, "pernce-sync-auth")
 *   wrapKey = HMAC-SHA256(master, "pernce-sync-wrap")
 *   sealed  = nonce (24 random bytes) || XChaCha20-Poly1305(key, nonce, plaintext, aad)
 *
 * Records are bound to their id and collection through the associated
 * data, so the server can't swap one record's ciphertext for another's.
 *
 * Argon2id and random bytes come from a provider: libsodium in the app
 * (src/lib/sync.ts), libsodium-wrappers in Node tests. Everything else is
 * pure TS (@noble), so this file runs unchanged under `pnpm test`. */

export type CryptoProvider = {
  /** 32-byte Argon2id13 hash, libsodium crypto_pwhash units. */
  argon2id(password: Uint8Array, salt: Uint8Array, opsLimit: number, memLimit: number): Uint8Array;
  randomBytes(length: number): Uint8Array;
};

let provider: CryptoProvider | null = null;

export function setCryptoProvider(p: CryptoProvider) {
  provider = p;
}

function crypto(): CryptoProvider {
  if (!provider) throw new Error("Sync crypto isn't available in this build");
  return provider;
}

export const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const SALT_BYTES = 16;
const WRAP_AAD = "pernce-data-key";

// ---- UTF-8 (Hermes doesn't promise TextEncoder/TextDecoder) ----

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** Only ever decodes what utf8Encode made (after authenticated
 * decryption), so it doesn't validate. */
export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const n = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4;
    let c = n === 1 ? b : b & (0xff >> (n + 1));
    for (let j = 1; j < n; j++) c = (c << 6) | (bytes[i + j] & 63);
    out += String.fromCodePoint(c);
    i += n;
  }
  return out;
}

const encoder = { encode: utf8Encode };
const decoder = { decode: utf8Decode };

// ---- base64 (standard alphabet, padded), as the server expects ----

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Map([...B64].map((ch, i) => [ch, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  if (s.length % 4 !== 0) throw new Error("Invalid base64");
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const ch = s[i + j];
      const v = ch === "=" ? 0 : B64_INDEX.get(ch);
      if (v === undefined) throw new Error("Invalid base64");
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ---- keys ----

export function randomKey(): Uint8Array {
  return crypto().randomBytes(KEY_BYTES);
}

/** KDF parameters for a new password: a fresh salt, core's defaults. */
export function newKdf(): SyncKdf {
  return { ...DEFAULT_KDF_PARAMS, salt: toBase64(crypto().randomBytes(SALT_BYTES)) };
}

export type PasswordKeys = { authKey: Uint8Array; wrapKey: Uint8Array };

/** The slow part of sign-in (Argon2id). NFC-normalized, so the same
 * password typed on two keyboards derives the same keys. */
export function derivePasswordKeys(password: string, kdf: SyncKdf): PasswordKeys {
  if (kdf.algorithm !== "argon2id") throw new Error(`Unsupported key derivation "${kdf.algorithm}"`);
  const master = crypto().argon2id(encoder.encode(password.normalize("NFC")), fromBase64(kdf.salt), kdf.opsLimit, kdf.memLimit);
  return {
    authKey: hmac(sha256, master, encoder.encode("pernce-sync-auth")),
    wrapKey: hmac(sha256, master, encoder.encode("pernce-sync-wrap")),
  };
}

function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): Uint8Array {
  const nonce = crypto().randomBytes(NONCE_BYTES);
  const sealed = xchacha20poly1305(key, nonce, encoder.encode(aad)).encrypt(plaintext);
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce);
  out.set(sealed, NONCE_BYTES);
  return out;
}

/** Throws if the key is wrong or the data was tampered with. */
function open(key: Uint8Array, data: Uint8Array, aad: string): Uint8Array {
  if (data.length < NONCE_BYTES + 16) throw new Error("Ciphertext is too short");
  return xchacha20poly1305(key, data.subarray(0, NONCE_BYTES), encoder.encode(aad)).decrypt(data.subarray(NONCE_BYTES));
}

/** wrappedKeyPassword / wrappedKeyRecovery */
export function wrapDataKey(wrappingKey: Uint8Array, dataKey: Uint8Array): string {
  return toBase64(seal(wrappingKey, dataKey, WRAP_AAD));
}

/** Null if `wrappingKey` doesn't open it (wrong password or recovery key). */
export function unwrapDataKey(wrappingKey: Uint8Array, wrapped: string): Uint8Array | null {
  try {
    const key = open(wrappingKey, fromBase64(wrapped), WRAP_AAD);
    return key.length === KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}

const recordAad = (collection: SyncCollection, id: string) => `${collection}/${id}`;

export function encryptRecord(dataKey: Uint8Array, collection: SyncCollection, id: string, payload: unknown): string {
  return toBase64(seal(dataKey, encoder.encode(JSON.stringify(payload)), recordAad(collection, id)));
}

export function decryptRecord(dataKey: Uint8Array, collection: SyncCollection, id: string, ciphertext: string): unknown {
  return JSON.parse(decoder.decode(open(dataKey, fromBase64(ciphertext), recordAad(collection, id))));
}

// ---- recovery key ----

/** Crockford base32: no I, L, O or U, so it reads back unambiguously. */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 32 random bytes as 52 characters in groups of four, e.g. "7KQ2-…". */
export function formatRecoveryKey(key: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of key) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

/** Accepts any case, spaces or dashes, and the usual look-alikes
 * (O for 0, I/L for 1). Null if it isn't a well-formed key. */
export function parseRecoveryKey(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== Math.ceil((KEY_BYTES * 8) / 5)) return null;
  const out = new Uint8Array(KEY_BYTES);
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      if (o < KEY_BYTES) out[o++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return out;
}
