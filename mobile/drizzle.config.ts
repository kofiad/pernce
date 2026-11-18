import { defineConfig } from "drizzle-kit";

// `pnpm run db:generate` writes SQL migrations to drizzle/, then
// scripts/bundle-migrations.mjs inlines them into src/db/migrations.ts so
// Metro bundles them with the app (no .sql loader or babel plugin needed)
// and the Node tests run exactly the same migrations.
export default defineConfig({
  dialect: "sqlite",
  driver: "expo",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
