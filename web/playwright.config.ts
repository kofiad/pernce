import { defineConfig } from "@playwright/test";

// Browser tests of pernce.com as the Cloudflare Worker serves it: the landing
// page at /, the store app at /app, the routing table. They run against
// `wrangler dev -c wrangler.app.jsonc` over web/public-store/, so build that
// first: `pnpm run build:store-app` (CI does). Chromium only.
const PORT = 8788;

export default defineConfig({
  testDir: "tests/site",
  // Screenshot baselines are per platform (font rendering); a platform with no
  // baselines skips those assertions (tests/site/layout.spec.ts).
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}-{platform}/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `pnpm exec wrangler dev -c wrangler.app.jsonc --port ${PORT}`,
    url: `http://localhost:${PORT}/app/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
