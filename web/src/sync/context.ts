import type { DbClient } from "../db/batch";
import { smtpMailer, type MailEnv, type Mailer } from "./email";

export type SyncConfig = {
  /** Sign-ups stop once this many accounts exist (verified or not). */
  maxUsers: number;
  /** Ciphertext bytes each user may store. */
  quotaBytes: number;
  /** SESSION_SECRET, the root of the token-signing and code keys
   * (src/sync/tokens.ts). Empty when unset: using it then throws. */
  sessionSecret: string;
};

/** What the sync services touch outside themselves. Each host builds one
 * per request from its environment (createSyncContext); scripts/ and test/
 * pass in-memory libSQL or local D1, a mailer that records codes, and a
 * fake clock. */
export type SyncContext = {
  db: DbClient;
  mail: Mailer;
  now: () => number;
  config: SyncConfig;
};

/** The settings the sync context reads; Node's process.env fits, and so
 * do a Worker's bindings. */
export type SyncEnv = MailEnv & {
  SESSION_SECRET?: string;
  SYNC_MAX_USERS?: string;
  SYNC_QUOTA_BYTES?: string;
};

function envInt(env: SyncEnv, name: "SYNC_MAX_USERS" | "SYNC_QUOTA_BYTES", fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${name} must be a whole number, got "${raw}"`);
  return n;
}

export function createSyncContext(env: SyncEnv, db: DbClient): SyncContext {
  return {
    db,
    mail: smtpMailer(env),
    now: Date.now,
    config: {
      maxUsers: envInt(env, "SYNC_MAX_USERS", 100),
      quotaBytes: envInt(env, "SYNC_QUOTA_BYTES", 25 * 1024 * 1024),
      sessionSecret: env.SESSION_SECRET ?? "",
    },
  };
}
