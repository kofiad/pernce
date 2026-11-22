import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("every Open the app goes to /app/", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.getByRole("link", { name: /^Open (the )?app$/ }).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThanOrEqual(3);
  expect(new Set(hrefs)).toEqual(new Set(["/app/"]));
  await page.locator(".hero-copy").getByRole("link", { name: "Open the app" }).click();
  await expect(page).toHaveURL(/\/app\/$/);
});

test("GitHub, changelog and in-page anchors", async ({ page }) => {
  await page.goto("/");
  const gh = await page.getByRole("link", { name: /GitHub/ }).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(new Set(gh)).toEqual(new Set(["https://github.com/kofiad/pernce"]));
  await expect(page.getByRole("link", { name: /changelog/i }).first()).toHaveAttribute(
    "href",
    "https://github.com/kofiad/pernce/blob/main/CHANGELOG.md",
  );
  for (const [name, id] of [["Features", "#features"], ["Privacy", "#privacy"], ["Open source", "#open-source"]]) {
    await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name })).toHaveAttribute("href", id);
    await expect(page.locator(id)).toHaveCount(1);
  }
});

test("store badges are not links", async ({ page }) => {
  await page.goto("/");
  const badges = page.locator(".store");
  expect(await badges.count()).toBe(4);
  expect(await badges.evaluateAll((els) => els.map((e) => e.closest("a") !== null || e.tagName === "A"))).toEqual([false, false, false, false]);
  await expect(page.getByRole("link", { name: /iPhone|Android|App Store|Google Play/ })).toHaveCount(0);
  await expect(badges.first()).toContainText("Coming soon");
});

test("no mention of Claude Code, no analytics", async ({ page }) => {
  await page.goto("/");
  const html = (await page.content()).toLowerCase();
  expect(html).not.toContain("claude");
  expect(html).not.toMatch(/google-analytics|gtag|plausible|segment\.com/);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    test(`accessibility (axe, WCAG AA) at ${width} ${colorScheme}`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme, viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      for (const tab of ["Accounts", "Net worth", "Budgets", "Insights"]) {
        await page.getByRole("tab", { name: tab }).click();
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), tab).toEqual([]);
      }
      await context.close();
    });
  }
}
