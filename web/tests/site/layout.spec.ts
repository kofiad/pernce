import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const sizes = [
  { width: 1440, height: 900 },
  { width: 1024, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

for (const { width, height } of sizes) {
  test(`layout at ${width}: no horizontal scroll, hero and panels as designed`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    const copy = (await page.locator(".hero-copy").boundingBox())!;
    const stage = (await page.locator(".stage").boundingBox())!;
    if (width >= 1024) {
      // S01: copy left, stage right, side by side.
      expect(stage.x).toBeGreaterThan(copy.x + copy.width - 1);
      expect(stage.height).toBe(680);
      expect(Math.abs(stage.y + stage.height / 2 - (copy.y + copy.height / 2))).toBeLessThan(120);
    } else {
      // Stacked: the stage under the copy, and centred when it is not full width.
      expect(stage.y).toBeGreaterThan(copy.y + copy.height - 1);
      if (width >= 768) {
        expect(stage.width).toBe(560);
        expect(Math.round(stage.x * 2 + stage.width)).toBe(width);
      }
    }
    if (width < 768) {
      expect(stage.height).toBe(460);
      await expect(page.locator(".device.back")).toBeHidden();
      await expect(page.locator(".device.front")).toBeVisible();
      // Tabs are a swipeable row.
      const overflow = await page.locator(".ftabs").evaluate((el) => getComputedStyle(el).overflowX);
      expect(overflow).toBe("auto");
      // 20 px gutter.
      expect((await page.locator(".lp-nav").boundingBox())!.x).toBe(20);
      expect(await page.locator(".nav-cta").innerText()).toBe("Open app");
    } else {
      await expect(page.locator(".device.back")).toBeVisible();
      const panel = (await page.locator(".fpanel:visible").boundingBox())!;
      const acc = (await page.locator(".fpanel:visible .acc").boundingBox())!;
      const vis = (await page.locator(".fpanel:visible > div:last-child").boundingBox())!;
      if (width >= 1024) expect(vis.x).toBeGreaterThan(acc.x + acc.width - 1);
      else expect(vis.y).toBeGreaterThan(acc.y + acc.height - 1);
      expect(panel.width).toBeGreaterThan(width * 0.8);
      const pts = await page.locator(".pts .pt").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
      if (width >= 900) expect(new Set(pts.map(Math.round)).size).toBe(1);
      else expect(new Set(pts.map(Math.round)).size).toBe(3);
    }
    // Targets are at least 44 px tall.
    const small = await page
      .locator("a, button")
      .evaluateAll((els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null && !e.classList.contains("skip"))
          .map((e) => {
            const r = e.getBoundingClientRect();
            const hit = e.classList.contains("btn") && e.classList.contains("nav-cta") && r.width > 0 ? 44 : r.height;
            return { text: e.textContent?.trim().slice(0, 30), h: Math.max(r.height, hit) };
          })
          .filter((x) => x.h < 36),
      );
    expect(small).toEqual([]);
    await context.close();
  });
}

// Pixel baselines exist only for platforms they were generated on (fonts
// render differently per OS). chromium-darwin: run
// `pnpm --filter @pernce/web exec playwright test layout --update-snapshots`
// on a Mac. chromium-linux is what CI compares against; make it in the same
// image CI runs the site job in (mcr.microsoft.com/playwright:<version>-noble,
// see .github/workflows/ci.yml), on a COPY of the checkout without
// node_modules (the container's install would replace your macOS binaries),
// after `pnpm run build:store-app` on the host:
//   rsync -a --exclude node_modules --exclude mobile --exclude .git ./ ~/pernce-linux/
//   docker run --rm --ipc=host -v ~/pernce-linux:/repo -w /repo -e CI=1 \
//     mcr.microsoft.com/playwright:v1.56.1-noble bash -c \
//     'npm i -g "$(node -p "require(\"./package.json\").packageManager")" && pnpm install --frozen-lockfile --filter "@pernce/web..." &&
//      cd web && pnpm exec playwright test layout --update-snapshots=all'
// then copy ~/pernce-linux/web/tests/site/__screenshots__/chromium-linux back.
// (Docker Desktop must be able to see the folder, so keep the copy under $HOME.)
const baselineDir = join(import.meta.dirname, "__screenshots__", `chromium-${process.platform}`);
for (const colorScheme of ["light", "dark"] as const) {
  for (const { width, height } of [sizes[0], sizes[3]]) {
    test(`screenshot at ${width} ${colorScheme}`, async ({ browser }, testInfo) => {
      test.skip(!existsSync(baselineDir) && testInfo.config.updateSnapshots !== "all", `no screenshot baselines for ${process.platform}`);
      const context = await browser.newContext({ viewport: { width, height }, colorScheme });
      const page = await context.newPage();
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`landing-${width}-${colorScheme}.png`, { fullPage: true });
      await context.close();
    });
  }
}
