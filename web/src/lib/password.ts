import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Used when no user matches the submitted email, so verifyPassword() still
// runs its full scrypt computation either way - skipping it entirely (as
// `user ? await verifyPassword(...) : false` would) makes "no such email"
// measurably faster than "wrong password", letting an attacker enumerate
// registered emails purely from response timing. This hash doesn't
// correspond to any real password; it only exists to keep the two code
// paths doing the same amount of work.
export const DUMMY_PASSWORD_HASH =
  "scrypt:16384:8:1:76ab9772ac09bc1d7a3014cceb4732b6:f1008c7142ea6982a637c5e191f4cea023ec85fc6b94dd5d80ee4ee07a9b916782233bc61602628ea78813aa84d5f56a237c3ab4bc53fa812c7dea632d555e90";
