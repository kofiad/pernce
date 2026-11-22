import { expect, test } from "@playwright/test";

const TABS = ["Accounts", "Net worth", "Budgets", "Insights"];

async function state(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    selected: [...document.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute("aria-selected")),
    tabindex: [...document.querySelectorAll('[role="tab"]')].map((t) => (t as HTMLElement).tabIndex),
    visiblePanels: [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => !(p as HTMLElement).hidden).map((p) => p.id),
    expanded: [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) .acc-t')].map((b) => b.getAttribute("aria-expanded")),
  }));
}

test("tabs: click picks a panel, opens its first item, ARIA follows", async ({ page }) => {
  await page.goto("/");
  expect(await state(page)).toEqual({
    selected: ["true", "false", "false", "false"],
    tabindex: [0, -1, -1, -1],
    visiblePanels: ["panel-0"],
    expanded: ["true", "false", "false"],
  });
  await page.getByRole("tab", { name: "Budgets" }).click();
  expect(await state(page)).toEqual({
    selected: ["false", "false", "true", "false"],
    tabindex: [-1, -1, 0, -1],
    visiblePanels: ["panel-2"],
    expanded: ["true", "false", "false"],
  });
  await expect(page.getByText("November 2026")).toBeVisible();
});

test("tabs: arrows wrap, Home and End jump, focus follows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Accounts" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Net worth" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Net worth" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Insights" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Accounts" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Insights" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Accounts" })).toBeFocused();
  expect((await state(page)).visiblePanels).toEqual(["panel-0"]);
});

test("accordion: one item open at a time, by click and by Enter", async ({ page }) => {
  await page.goto("/");
  const items = page.locator("#panel-0 .acc-t");
  await items.nth(1).click();
  expect((await state(page)).expanded).toEqual(["false", "true", "false"]);
  await expect(page.locator("#panel-0 .acc-b:visible")).toHaveCount(1);
  await expect(page.locator("#panel-0 .acc-b:visible")).toContainText("record both sides");
  await items.nth(2).focus();
  await page.keyboard.press("Enter");
  expect((await state(page)).expanded).toEqual(["false", "false", "true"]);
  // A new tab opens its first item again.
  await page.getByRole("tab", { name: "Insights" }).click();
  expect((await state(page)).expanded).toEqual(["true", "false", "false"]);
  await expect(page.locator("#panel-3 .acc-b:visible a")).toHaveAttribute("href", "/app/");
});

test("every tab has a panel and a visual", async ({ page }) => {
  await page.goto("/");
  for (const name of TABS) {
    await page.getByRole("tab", { name }).click();
    await expect(page.locator(".fpanel:visible .card")).toBeVisible();
  }
});

test("without JavaScript the Accounts tab and its first item are showing", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".fpanel:visible")).toHaveCount(1);
  await expect(page.locator("#panel-0")).toBeVisible();
  await expect(page.getByText("Every account, in its own currency")).toBeVisible();
  await expect(page.locator("#panel-0 .acc-b:visible")).toHaveCount(1);
  await context.close();
});
