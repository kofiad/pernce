import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DEFAULT_KDF_PARAMS, type SyncKdf } from "@pernce/core/sync";
import { createApp, type AppOptions } from "../src/create-app";
import * as schema from "../src/db/schema";
import type { DbClient } from "../src/db/batch";
import type { SyncContext } from "../src/sync/context";
import type { EmailMessage } from "../src/sync/email";

// Node's types make Response.json() `unknown`; the tests read bodies freely.
declare global {
  interface Body {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json(): Promise<any>;
  }
}

// The tests pass their settings per request; a developer's own shell or
// .env must not leak in through the process.env fallback.
for (const key of ["SESSION_SECRET", "CRON_SECRET", "ALLOWED_ORIGINS", "WEB_APP_ORIGINS", "SMTP_USER", "SMTP_PASSWORD", "NODE_ENV", "SYNC_MAX_USERS", "SYNC_QUOTA_BYTES"]) {
  delete process.env[key];
}

export const SESSION_SECRET = "test-session-secret";

export const b64 = (bytes: number) => randomBytes(bytes).toString("base64");
export const kdf = (): SyncKdf => ({ ...DEFAULT_KDF_PARAMS, salt: b64(16) });

/** An in-memory libSQL database with the real migrations applied. */
export async function memoryDb(): Promise<DbClient> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(import.meta.dirname, "..", "drizzle") });
  return db;
}

export type TestApp = Awaited<ReturnType<typeof testApp>>;

/** The Hono app wired like src/node-app.ts but over a given database, a mailer
 * that keeps the emails, and a clock the test can move. `env` is what each
 * request gets as its bindings (secrets, ALLOWED_ORIGINS...). */
export async function testApp(
  options: Partial<AppOptions> & { db?: DbClient; env?: Record<string, string> } = {},
) {
  const db = options.db ?? (await memoryDb());
  const outbox: { to: string; message: EmailMessage }[] = [];
  const clock = { now: Date.now() };
  const ctx: SyncContext = {
    db,
    mail: async (to, message) => {
      outbox.push({ to, message });
    },
    now: () => clock.now,
    config: { maxUsers: 50, quotaBytes: 1_000_000, sessionSecret: SESSION_SECRET },
  };
  const app = createApp({ createContext: () => ctx, ...options });
  const baseEnv = { SESSION_SECRET, CRON_SECRET: "cron-secret", ...options.env };
  const request = (path: string, init?: RequestInit, env: Record<string, string | undefined> = {}) =>
    app.request(path, init, { ...baseEnv, ...env });
  const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    request(path, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const lastCode = (to: string) =>
    /\b(\d{6})\b/.exec(outbox.filter((m) => m.to === to).at(-1)?.message.text ?? "")?.[1] ?? "";
  return { app, ctx, db, outbox, clock, request, json, lastCode };
}
