import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // D1 (the Cloudflare deployment's database) has no interactive
    // transactions; all-or-nothing writes use db.batch() (src/db/batch.ts).
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='transaction']",
          message: "D1 has no interactive transactions: use runBatch() from src/db/batch.ts.",
        },
      ],
    },
  },
  {
    // Plain Node scripts.
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", fetch: "readonly", setTimeout: "readonly" } },
  },
  {
    // The landing page's browser scripts (site/site.js) and its retire
    // service worker (site/sw.js).
    files: ["site/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        self: "readonly",
        caches: "readonly",
      },
    },
  },
  globalIgnores([
    // The web app's export (pnpm run build:app) and the public store app's
    // (pnpm run build:store-app), linted in mobile/.
    "public/**",
    "public-store/**",
    // wrangler's local state and build output.
    ".wrangler/**",
    "dist-worker/**",
    "dist-store-worker/**",
    // Playwright output.
    "test-results/**",
    "playwright-report/**",
    // The Vercel function bundle (scripts/bundle-server.mjs).
    "server.mjs",
    // Test fixtures standing in for the web app's export.
    "test/fixtures/**",
  ]),
]);
