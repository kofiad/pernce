import { defineConfig } from "drizzle-kit";

// `db:generate` only reads the schema; `db:migrate`/`db:push`/`db:studio`
// connect to DATABASE_URL (a libSQL URL: `file:local.db` or a Turso
// `libsql://…` database, with DATABASE_AUTH_TOKEN).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
  strict: true,
  verbose: true,
});
