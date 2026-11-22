import { expect, test } from "@playwright/test";

test("the app at /app/: boots isolated, keeps data across a reload, works offline", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/app/");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  await page.locator("input").first().fill("Persona");
  await page.getByText("Get started").click();
  await expect(page.getByText("Total net worth").first()).toBeVisible();
  // The database is saved to IndexedDB shortly after each change.
  await page.waitForTimeout(1500);

  const reg = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const r = await navigator.serviceWorker.getRegistration("/app/");
    return { scope: r?.scope, script: (r?.active ?? r?.waiting ?? r?.installing)?.scriptURL };
  });
  expect(reg).toEqual({ scope: `${new URL(page.url()).origin}/app/`, script: `${new URL(page.url()).origin}/app/sw.js` });
  // Nothing registered at the root.
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope))).toEqual([
    `${new URL(page.url()).origin}/app/`,
  ]);
  // Wait until the worker has finished precaching.
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("pernce-app-")).length)).toBe(1);

  await page.reload();
  await expect(page.getByText("Persona").first()).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Persona").first()).toBeVisible();
  await page.goto("/app/settings");
  await expect(page.getByText("Persona").first()).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("a deep link under /app/ opens the app", async ({ page }) => {
  await page.goto("/app/settings");
  await expect(page.locator("#root")).not.toBeEmpty();
  expect(new URL(page.url()).pathname).toMatch(/^\/app\//);
});

test("an installed app (display-mode standalone) opening / goes straight to /app/", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Chromium has no emulation switch for display-mode, so answer the one query the page makes.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.replace(/\s/g, "") === "(display-mode:standalone)" ? ({ ...real("all"), matches: true, media: q } as MediaQueryList) : real(q);
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/app\/$/);
  await context.close();
});

test("a browser tab (display-mode browser) stays on the landing page", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe("/");
});
