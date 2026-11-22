// Regenerates the two product shots on the landing page (web/site/img/):
// the STORE web build served at /app, loaded with the synthetic demo backup
// (docs/demo/pernce-demo-backup.json) through the app's own Your data →
// Import JSON backup, "today" fixed at 2026-11-20, phone layout at 390x844,
// device scale 2. Steps follow docs/screenshots/README.md.
//
//   pnpm --filter @pernce/web build:store-app    # first
//   pnpm --filter @pernce/web site:screenshots
//
//   home-dark.png     Home, dark (the phone in front)
//   budgets-light.png Insights → Budgets, light (the phone behind)
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const backup = join(web, "..", "docs", "demo", "pernce-demo-backup.json");
const outDir = join(web, "site", "img");
const PORT = 8791;
const base = `http://localhost:${PORT}`;
const TODAY = new Date("2026-11-20T10:00:00Z");

const server = spawn("pnpm", ["exec", "wrangler", "dev", "-c", "wrangler.app.jsonc", "--port", String(PORT)], {
  cwd: web,
  stdio: "ignore",
});
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/app/`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wrangler dev did not start");
}

/** A context at desktop size with the backup imported, then the phone size. */
async function loaded(browser, colorScheme) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme });
  const page = await context.newPage();
  await page.clock.setFixedTime(TODAY);
  await page.goto(`${base}/app/`);
  await page.locator("input").first().fill("Demo");
  await page.getByText("Get started").click();
  await page.getByText("Settings").first().click();
  await page.getByText("Import CSV").first().click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Import JSON backup").first().click();
  (await chooser).setFiles(backup);
  await page.getByText(/117 transactions/).waitFor({ timeout: 30000 });
  // The app saves its database to IndexedDB shortly after each change; then
  // reload at phone size so it starts on Home with the dock.
  await page.waitForTimeout(2000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/app/`);
  await page.waitForTimeout(3000);
  return { context, page };
}

/** Phone dock tab: the label sits in the nav; click the visible match. */
async function openTab(page, name) {
  await page.getByText(name, { exact: true }).locator("visible=true").last().click();
  await page.waitForTimeout(3000);
}

async function shoot(page, name) {
  const raw = await page.screenshot({ type: "png" });
  // 8-bit palette: UI screenshots have few colours, so this is a fraction of the size.
  const out = await sharp(raw).png({ palette: true, quality: 90, colours: 256, effort: 10 }).toBuffer();
  const file = join(outDir, name);
  await (await import("node:fs/promises")).writeFile(file, out);
  console.log(`${name}: ${(out.length / 1024).toFixed(0)} KB`);
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  {
    const { context, page } = await loaded(browser, "dark");
    await openTab(page, "Home");
    await shoot(page, "home-dark.png");
    await context.close();
  }
  {
    const { context, page } = await loaded(browser, "light");
    await openTab(page, "Insights");
    // Insights opens on Budgets.
    await shoot(page, "budgets-light.png");
    await context.close();
  }
  await browser.close();
} finally {
  stop();
}
