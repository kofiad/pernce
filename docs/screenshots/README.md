# Screenshots

Every image here is generated from the synthetic backup
`docs/demo/pernce-demo-backup.json` (an invented person, "Demo"; made by
`mobile/scripts/make-demo-backup.ts` through the app's own data layer, so it
contains nothing real) on the store web build (`pnpm run build:store-app`).

| File | Size | What |
| --- | --- | --- |
| `home.png` | 2560x1600 | Home, desktop, light |
| `home-dark.png` | 2560x1600 | Home, desktop, dark (follows the system scheme) |
| `transactions.png` | 2560x1600 | Activity list |
| `budgets.png` | 2560x1600 | Insights, Budgets (November 2026, one over, one near limit) |
| `insights.png` | 2560x1600 | Insights, Trends |
| `transfer.png` | 2560x2120 | New transaction as a USD to GHS transfer with rate and fee (not saved) |
| `mobile-home.png` | 780x1688 | Home in the phone layout (390x844 at 2x) |
| `social-preview.png` | 1280x640 | GitHub social preview (upload in repo settings) |

## Regenerating

The Playwright script lives outside the repo; the steps are:

1. `cd mobile && node --experimental-sqlite --no-warnings=ExperimentalWarning --import tsx scripts/make-demo-backup.ts`
   rewrites the backup (deterministic; "now" is 2026-11-20).
2. `pnpm run build:store-app`, then serve `web/public-store/` with
   `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp` plus an SPA fallback
   (`pnpm --filter @pernce/web dev:store-app` does this, or a small Node server).
3. With headless Chromium (Playwright), open a fresh context at 1280x800,
   device scale factor 2, `colorScheme` light, and `Date` fixed to
   2026-11-20 (`page.clock.setFixedTime`).
4. Onboarding: type the name "Demo", keep USD, "Get started".
5. Settings, "Import CSV" (it opens "Your data"), then "Import JSON backup";
   answer the file chooser with the backup. The result card reads
   "5 accounts, 32 categories, 117 transactions, 5 budgets, 4 rates".
6. Use the sidebar to open Home, Activity, Insights (Budgets, then Trends)
   and screenshot each after about 3 s so charts settle. Click only visible
   matches: Home stays mounted behind other pages.
7. Transfer: Home, "Transfer", To account "MTN MoMo", sent 800, received
   8728 (the app derives the rate 10.91), fee 8, a note; screenshot at
   1280x1060 and cancel.
8. Dark: a new context with `colorScheme: "dark"`, same import, Home.
9. Phone: import at 1280x800, open Home, then resize the viewport to 390x844.
10. Social preview: an HTML page at 1280x640 (brand greens from
    `core/src/tokens.ts`, Inter, `mobile/assets/icon.png`, the home screenshot
    tilted on the right), screenshotted at 1x.
