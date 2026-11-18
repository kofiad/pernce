import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";
import type { SyncKdf } from "@pernce/core/sync";

/** SQLite schema for the server: shared reference data (currencies and the
 * FX rates the daily cron refreshes) and the sync store, which only ever
 * holds ciphertext. People's money lives in the app (mobile/, also the web
 * app), never here in plaintext.
 *
 * Runs on Turso (libSQL) for the personal Vercel instance and on D1 later:
 *
 * - Dates are INTEGER milliseconds; ids are UUIDs made in JS
 *   (crypto.randomUUID works on Node and Workers).
 * - Exchange rates are TEXT decimals, read with Number().
 * - D1 has no interactive transactions, so multi-row writes go through
 *   `db.batch()` (src/db/batch.ts), never `db.transaction()`. Don't rely on
 *   ON DELETE CASCADE either: libSQL over HTTP doesn't turn foreign key
 *   enforcement on, so deletes remove child rows explicitly. */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const EMAIL_TOKEN_PURPOSES = ["verify", "reset"] as const;

/** Currencies the FX cron tracks. Seeded once (scripts/seed.ts). */
export const currencies = sqliteTable("currencies", {
  code: text("code").primaryKey(), // ISO 4217, e.g. "USD"
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
});

/** Cached FX rates, one row per currency, always relative to 1 unit -> USD.
 * Refreshed by the daily cron; served to the apps by /api/fx. */
export const exchangeRates = sqliteTable("exchange_rates", {
  currency: text("currency")
    .primaryKey()
    .references(() => currencies.code),
  rateToUsd: text("rate_to_usd").notNull(),
  source: text("source").notNull().default("manual"), // "manual" | "fawazahmed0"
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Sync server (docs/mobile-scope.md §5–6). Separate from the web app's own
// tables: a sync user is not a web user, and the server only ever holds
// ciphertext for them.

/** A mobile sync account. Self-serve sign-up; `authHash` is a hash of the
 * client's Argon2-derived auth key, never of the password itself, and the
 * data key is only stored wrapped (core sync.ts). */
export const syncUsers = sqliteTable(
  "sync_users",
  {
    id: id(),
    email: text("email").notNull(),
    authHash: text("auth_hash").notNull(),
    kdf: text("kdf", { mode: "json" }).$type<SyncKdf>().notNull(),
    /** Null until the email code is confirmed; unverified accounts can't
     * sign in and are pruned after a week. */
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    /** Null after a password reset until a device re-wraps the data key. */
    wrappedKeyPassword: text("wrapped_key_password"),
    wrappedKeyRecovery: text("wrapped_key_recovery").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    /** Last server_seq handed out. A push only commits if this (and
     * storage_bytes, key_version) still match what it read, so one user's
     * pushes commit in seq order and a pull cursor never skips a record
     * that commits late (src/sync/records.ts). */
    seq: integer("seq").notNull().default(0),
    /** Sum of sync_records.size, checked against the quota on push. */
    storageBytes: integer("storage_bytes").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sync_users_email_idx").on(t.email)],
);

/** One encrypted row per (user, device-made id). Last writer wins by `hlc`. */
export const syncRecords = sqliteTable(
  "sync_records",
  {
    userId: text("user_id")
      .notNull()
      .references(() => syncUsers.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    collection: text("collection").notNull(),
    hlc: text("hlc").notNull(),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    serverSeq: integer("server_seq").notNull(),
    keyVersion: integer("key_version").notNull(),
    /** base64; null for a tombstone */
    ciphertext: text("ciphertext"),
    /** length of `ciphertext`, for the storage quota */
    size: integer("size").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index("sync_records_user_seq_idx").on(t.userId, t.serverSeq),
  ],
);

/** A signed-in device. Only a SHA-256 of its refresh token is stored; the
 * token rotates on every refresh, and presenting the previous one again
 * (a replayed, likely stolen token) ends the session. */
export const syncSessions = sqliteTable(
  "sync_sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => syncUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    previousTokenHash: text("previous_token_hash"),
    deviceName: text("device_name"),
    createdAt: createdAt(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("sync_sessions_token_idx").on(t.tokenHash),
    index("sync_sessions_previous_token_idx").on(t.previousTokenHash),
    index("sync_sessions_user_idx").on(t.userId),
  ],
);

/** The one live emailed code per user and purpose. Stored as an HMAC;
 * dies after a few wrong guesses or 15 minutes. */
export const emailTokens = sqliteTable(
  "email_tokens",
  {
    userId: text("user_id")
      .notNull()
      .references(() => syncUsers.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: EMAIL_TOKEN_PURPOSES }).notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.purpose] })],
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type Currency = typeof currencies.$inferSelect;
export type SyncUser = typeof syncUsers.$inferSelect;
