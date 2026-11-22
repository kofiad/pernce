import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`landing page renders in ${colorScheme}, with no errors and no other origins`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    const problems: string[] = [];
    const origins = new Set<string>();
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(String(e)));
    page.on("request", (r) => origins.add(new URL(r.url()).origin));
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(/Every currency\.\s*One ledger\./);
    await expect(page).toHaveTitle("Pernce: every currency, one ledger");
    expect(problems).toEqual([]);
    expect([...origins]).toEqual([baseURL]);
    // The page follows the scheme.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(colorScheme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
    // The landing page is not cross-origin isolated (only /app is).
    expect(response?.headers()["cross-origin-embedder-policy"]).toBeUndefined();
    await context.close();
  });
}

test("head: canonical, social card, no third-party scripts", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://pernce.com/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://pernce.com/og.png");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'self'");
  // No inline styles anywhere, so the policy needs no 'unsafe-inline'.
  expect(csp).toContain("style-src 'self';");
  expect(csp).not.toContain("unsafe-inline");
  expect(await page.locator("[style]").count()).toBe(0);
  const scripts = await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
  expect(scripts).toHaveLength(1);
  // Content-hashed, so a new page never runs an older cached script.
  expect(scripts[0]).toMatch(/^http:\/\/localhost:8788\/site\/site\.js\?v=[0-9a-f]{10}$/);
  expect(await page.locator('link[rel="stylesheet"]').getAttribute("href")).toMatch(/^\/site\/site\.css\?v=[0-9a-f]{10}$/);
});

test("first load stays under 500 KB, images and fonts included", async ({ page }) => {
  let bytes = 0;
  page.on("response", async (r) => {
    const body = await r.body().catch(() => null);
    if (body) bytes += body.length;
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  expect(bytes).toBeLessThan(500 * 1024);
});

test("the version in the repo card is the web package version", async ({ page }) => {
  const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8"));
  await page.goto("/");
  await expect(page.getByText(`v${version}`)).toBeVisible();
});

test("one set of figures: the feature visuals use the hero's demo data", async ({ page }) => {
  await page.goto("/");
  const html = await page.content();
  // The hero screenshot shows the demo backup's $15,574.03; so does every visual.
  expect(html).toContain("$15,574.03");
  for (const sample of ["$18,444.82", "Ama", "Vanguard"]) expect(html, sample).not.toContain(sample);
  await expect(page.locator(".device.front img")).toHaveAttribute("alt", /\$15,574\.03/);
});
