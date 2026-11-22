# Landing page: implementation plan

Status: **implemented** on branch `landing-page` (approved by the owner
2026-11-22). Kept as the record of the decisions; the docs it lists under
Phase 6 describe the result.

Design source: `docs/design/pernce-artboard.html`, Site page (S01 desktop,
S01a features state, S02 phone) and `docs/design/pernce_design.md`,
"Landing page (pernce.com/)". When this plan and the design disagree, the
design wins.

## Goal

`https://pernce.com/` serves a static landing page; the offline store web app
moves to `https://pernce.com/app/`. Nothing breaks for people who already
used or installed the app at `/` (it went live 2026-11-22).

## Decisions (owner, 2026-11-22)

- Landing at the root, app at `/app`. Store build only: the personal Vercel
  instance (`pernce.vercel.app`, `build:app`) keeps the app at `/` and gets no
  landing page.
- Product images are **real app screenshots** of the store build loaded with
  `docs/demo/pernce-demo-backup.json`; feature visuals are HTML/CSS.
- Playwright tests live **in the repo** (`web/`) and run **in CI**.
- Old app links (`pernce.com/settings`, …) **301 to `/app/...`**, via a small
  Worker script in front of the static assets.
- Store badges: outlined, generic phone icon, "Coming soon", no Apple/Google
  marks. No Claude Code mention anywhere. No analytics, no third-party
  requests.

## Non-goals

- Deploying (the owner runs `pnpm --filter @pernce/web deploy:store-app`).
- Commits, pushes, tags, version bumps (owner approval each time).
- Any change to the personal build, the API Worker (`wrangler.jsonc`), sync,
  or app features.

## Target URL layout (pernce.com, `web/public-store/`)

| Path | Served by | What |
| --- | --- | --- |
| `/` | Worker → `/index.html` asset | Landing page |
| `/site/*` | static assets | Landing CSS, JS, images, fonts |
| `/favicon.svg`, `/favicon.png`, `/robots.txt`, `/og.png` | static assets | Site metadata |
| `/sw.js` | static asset | **Retire worker** (kills the old root-scoped SW) |
| `/app` | Worker | 301 → `/app/` |
| `/app/` and `/app/<route>` | Worker → `/app/index.html` (200) | The store web app (SPA fallback) |
| `/app/<file>` (`_expo/`, `assets/`, `sw.js`, manifest, icons) | static assets | App files |
| any other miss without a file extension | Worker | 301 → `/app` + same path + query |
| any other miss with a file extension | Worker | 404 (plain) |

COOP `same-origin` + COEP `require-corp` apply to `/app/*` only (the app
needs `SharedArrayBuffer`; the landing page doesn't).

## Phase 1: Store app under `/app`

1. `mobile/app.config.ts`: read `WEB_BASE_URL` (unset = `/`); when set, put
   it in `experiments.baseUrl`. Only `web/scripts/build-store-app.mjs` sets
   it (`/app`). Document the variable next to `APP_VARIANT`.
2. `web/scripts/build-store-app.mjs`: export into `public-store/app/`
   (verify where `expo export` with a `baseUrl` writes files; the goal is
   that `/app/index.html` is the app shell and every reference it makes
   starts with `/app/`). Then run `pwa.mjs` on that directory with the base.
3. `mobile/scripts/pwa.mjs`: take an optional base (`node scripts/pwa.mjs
   <dir> [base]`, default `/`). With a base:
   - head links: `/app/manifest.webmanifest`, `/app/apple-touch-icon.png`;
   - write the manifest with `start_url` and `scope` = `/app/` (and icon
     URLs under `/app/`) instead of copying `mobile/public/manifest.webmanifest`
     unchanged;
   - the `assets/node_modules` rename must also match `/app/assets/node_modules`;
   - precache entries are prefixed with the base, the navigation key is
     `/app/index.html`, the `/api/` exclusion stays, and the cache name
     prefix becomes `pernce-app-` (so the retire worker can tell caches apart).
   With no base, output must be byte-for-byte what it is today (personal build).
4. `mobile/src/lib/pwa.ts`: register `${base}sw.js` with `{ scope: base }`,
   where `base` comes from the Expo config (`Constants.expoConfig.experiments.baseUrl`
   or the router's base; pick whichever expo-router exposes on web, and
   cover it with a unit test if it's a pure helper).
5. Grep `mobile/src` for other root-absolute paths (`"/`, `location`,
   `href=`) and make them base-aware where they're URLs (expo-router `href`s
   are already base-relative).
6. Check expo-sqlite's web worker/WASM still loads from `/app/` and the
   database opens (it is origin-scoped, so data saved at `/` before the
   move is still there; verify with the test in Phase 5).

Acceptance: `build:store-app` produces `public-store/app/index.html`; served
under `/app/`, the app boots, creates an account, reloads with data intact,
works offline after first load (SW at `/app/sw.js`, scope `/app/`).
`build:app` output is unchanged.

## Phase 2: Worker in front of the assets

1. New `web/cloudflare/site-worker.ts` (no dependencies; typed with the
   existing Workers types). Only runs on **asset misses** (default assets
   behaviour with `not_found_handling: "none"`), so asset hits stay free:
   - `/` → `env.ASSETS.fetch('/index.html')`.
   - `/app` → 301 `/app/`.
   - `/app/` or `/app/<path without extension>` → `/app/index.html`, 200,
     with COOP/COEP headers set by the Worker.
   - other paths without an extension → 301 to `/app` + path + search.
   - everything else → 404.
2. `web/wrangler.app.jsonc`: add `main`, `assets.binding: "ASSETS"`,
   `not_found_handling: "none"`; keep `html_handling: "none"` and its comment
   (it now also means `/` and `/app/` reach the Worker). Update the header
   comment. Keep it on the Workers free plan.
3. `web/cloudflare/_headers`: scope COOP/COEP to `/app/*`; add
   `/site/*` long-cache headers (`public, max-age=31536000, immutable` only
   if filenames are hashed; otherwise a short max-age).
4. `pnpm run build:worker`-style dry run for this config too
   (`wrangler deploy --dry-run -c wrangler.app.jsonc`), added to the
   `web/package.json` scripts and CI.

Acceptance: under `wrangler dev -c wrangler.app.jsonc`, every row of the URL
table behaves as listed (asserted by the Phase 5 tests).

## Phase 3: Retire the old root service worker

Returning visitors have `/sw.js` (scope `/`) that answers every navigation
with the cached app. Ship a new `/sw.js` (static, `web/site/sw.js`, copied to
the root) that, on install, calls `skipWaiting()`; on activate, deletes every
cache whose name starts with `pernce-` but **not** `pernce-app-`, calls
`self.registration.unregister()`, then reloads open window clients
(`client.navigate(client.url)`). It must not touch IndexedDB/OPFS (the
user's data).

Installed PWAs keep `start_url: "/"` until the browser refreshes the
manifest, so the landing page's first inline `<head>` script does
`if (matchMedia('(display-mode: standalone)').matches) location.replace('/app/')`.

Acceptance (Phase 5 test): a browser context with the *old* build's SW
installed at `/` loads the new deploy, ends up on the landing page at `/`
after one reload, the old caches are gone, and the app at `/app/` still has
the data created before the move.

## Phase 4: The landing page

Source in `web/site/` (new), copied into `public-store/` root by
`build-store-app.mjs` (`index.html` at the root, the rest under `/site/`,
plus `sw.js`, `robots.txt`, `og.png` from `docs/screenshots/social-preview.png`,
favicons from `docs/design/icons/`).

- **Plain HTML, CSS and a small vanilla JS file.** No framework, no build
  step, no runtime dependencies. Works without JS (Accounts tab, first item
  open; the other panels are in the DOM, `hidden`).
- **Tokens**: CSS custom properties copied from `pernce_design.md` /
  `core/src/tokens.ts`, mapped to the same semantic roles as the artboard's
  `.t-dark` / `.t-light` (`--bg`, `--card`, `--inset`, `--text`, `--mute`,
  `--stone`, `--hair`, `--divider`, `--brand`, `--btn`, `--link`, …). Light by
  default, dark under `prefers-color-scheme: dark`. No shadows.
- **Font**: Inter, self-hosted woff2 under `/site/fonts/` (variable,
  latin subset), `font-display: swap`, tabular figures for amounts. Take it
  from a package already in the workspace if one ships it; otherwise add
  `@fontsource-variable/inter` as a web devDependency and copy at build time.
- **Layout** (match the artboard; measure from it, don't eyeball):
  - ≥1024: S01. Content 1200 wide, centred; nav 80 high; hero two columns
    (copy | stage 680 high); sections 120 apart.
  - 768–1023: hero stacks (copy, then the stage centred at 560 wide); the
    features panel stacks accordion above visual; three points in one row
    of three if ≥900, else stacked.
  - <768: S02. 20px gutter, nav = logo + small "Open app" pill, stage 460
    high with only the front phone, tabs as a swipeable chip row
    (`overflow-x: auto`, scroll-snap), sections 72 apart.
- **Sections and copy**: exactly the artboard's S01/S02 text (the `LP` and
  `FT` objects in the artboard script are the copy source): nav, hero (kicker,
  "Every currency. One ledger.", sub, Open the app, View on GitHub, two
  Coming soon badges, "Runs in your browser today. No sign-up."), features
  (tabs + accordion + visual, three points), privacy band, open source +
  repo card, closing CTA, footer. Version in the repo card is read from
  `web/package.json` at build time, not hard-coded.
- **Links**: Open the app → `/app/`; GitHub → `https://github.com/kofiad/pernce`;
  Changelog → `https://github.com/kofiad/pernce/blob/main/CHANGELOG.md`;
  nav items are in-page anchors (`#features`, `#privacy`, `#open-source`).
  Store badges are not links (`aria-disabled`).
- **Features interaction** (`/site/site.js`, <3 KB): WAI-ARIA tabs (roving
  tabindex, arrow keys, Home/End) for the four tabs; inside each panel an
  accordion of `<button aria-expanded>` items, one open at a time, the first
  opened when a tab is picked. The visual belongs to the tab.
- **Feature visuals**: HTML/CSS built from the artboard's components (account
  rows, currency chips, budget bars, the donut as inline SVG, the trend line
  as inline SVG), using the artboard's invented sample data. Not screenshots.
- **Hero images**: two screenshots (Phase 4b) in device bezels drawn in CSS
  (`#161b1a`, radius 48, 9px padding), positioned as in S01; `width`/`height`
  set, `fetchpriority="high"` on the front one, meaningful `alt`.
- **Head**: title "Pernce: every currency, one ledger", meta description,
  canonical `https://pernce.com/`, Open Graph + Twitter card (`/og.png`),
  `theme-color` per scheme, favicon. A strict CSP meta (`default-src 'self'`;
  inline script only for the standalone redirect, via hash).
- **Accessibility**: landmarks, one `h1`, visible `:focus-visible` ring
  (2px `--brand`, offset 2), 44px targets, text contrast 4.5:1 in both
  schemes, `prefers-reduced-motion` respected (there is no motion beyond
  scroll-snap).
- **Budget**: page weight under 500 KB on first load including images and
  font; Lighthouse (Playwright-run is fine) ≥ 95 performance and 100
  accessibility on desktop and mobile emulation.

### Phase 4b: Screenshots

`web/scripts/site-screenshots.mjs` (Playwright; reuses the steps in
`docs/screenshots/README.md`): build the store app, serve it, import
`docs/demo/pernce-demo-backup.json` through the app's own Your data →
Import, fix `Date` to 2026-11-20, then capture at 390×844, device scale 2:

- `web/site/img/home-dark.png`: Home, dark (front phone);
- `web/site/img/budgets-light.png`: Insights → Budgets, light (back phone).

Optimise to ≤150 KB each (PNG quantisation via a dev-only tool, or WebP if a
dev dependency already in the tree can encode it). Commit the outputs;
document regeneration in `docs/screenshots/README.md`.

## Phase 5: Playwright tests (repo + CI)

- `@playwright/test` as a `web/` devDependency (pinned; check `pnpm audit`
  and the `allowBuilds` rule). `web/playwright.config.ts` with a `webServer`
  running `wrangler dev -c wrangler.app.jsonc` on the built `public-store/`.
- Script `test:site` in `web/package.json` (expects `build:store-app` first),
  and a root forwarder.
- `web/tests/site/*.spec.ts`:
  1. Landing renders at `/` in light and dark (`colorScheme`), no console
     errors, no requests to other origins, one `h1` with the tagline.
  2. Layout at 1440, 1024, 768, 390: no horizontal scroll; hero and panel
     arrangement per breakpoint; screenshot assertions
     (`toHaveScreenshot`, committed baselines, small threshold).
  3. Tabs and accordion: click and keyboard (arrows, Home/End, Enter); one
     panel visible; one item expanded; ARIA states correct; works with JS
     disabled (default tab shown).
  4. Links: Open the app → `/app/`; badges not links.
  5. Routing table: every row of the URL table, including status codes,
     redirects with query strings, COOP/COEP on `/app/*` only.
  6. App at `/app/`: boots, add an account, reload, data persists; offline
     after first load (SW scope `/app/`).
  7. Migration: install the *previous* store build (built from `git
     show HEAD:` sources in a temp dir, or a checked-in fixture of its
     `sw.js` + `index.html`) at `/`, create data, switch to the new build,
     reload: landing at `/`, old caches gone, data present at `/app/`.
  8. Standalone: with `display-mode: standalone` emulated, `/` redirects to
     `/app/`.
- CI (`.github/workflows/ci.yml`, mobile job after "Web exports"):
  `pnpm --filter @pernce/web exec playwright install --with-deps chromium`
  (cache `~/.cache/ms-playwright`), then `pnpm --filter @pernce/web
  test:site`; upload the Playwright report on failure. Extend the existing
  export checks: `public-store/index.html` is the landing page,
  `public-store/app/index.html` exists, `_headers` scoped to `/app/*`.

## Phase 6: Docs

- `docs/web-deployment.md`: new URL layout, the Worker, the retire SW,
  the deploy order, and a post-deploy check list for the owner.
- `README.md` "Try it": pernce.com is the site, the app is pernce.com/app.
- `mobile/README.md` "Web": `WEB_BASE_URL`, base-aware PWA.
- `CLAUDE.md` architecture "Web app" bullet: landing at `/`, store app at
  `/app`, `web/site/` source.
- `CHANGELOG.md`: an Unreleased entry.
- `docs/design/pernce_design.md`: only if implementation forced a design
  change (then update the artboard too).

## Verification before handing back

All must pass, warning-free (CLAUDE.md "Keeping builds warning-free"):
`pnpm audit`, `pnpm test`, `pnpm run lint`, `pnpm --filter @pernce/web
typecheck`, `pnpm --filter @pernce/web build`, `pnpm run test:web`,
`pnpm run build:worker`, the new app-worker dry run, `build:app` (output
unchanged vs. before), `build:store-app`, `test:site`, and in `mobile/`:
`pnpm run typecheck`, `pnpm run lint`, `pnpm test`. Plus Playwright
screenshots of `/` at 1440 and 390 in both schemes, compared by eye with
S01/S02, attached to the report.

## Risks to watch

- `expo export` + `experiments.baseUrl` with `web.output: "single"`: confirm
  asset URLs, fonts (renamed by `pwa.mjs`), and expo-sqlite's worker/WASM
  all resolve under `/app/`. If baseUrl can't be made to work cleanly, stop
  and report rather than hand-rewriting paths.
- The retire worker runs once per returning browser; a bug there can strand
  people on a stale app. Test 7 is the gate.
- Workers free plan: the Worker only runs on asset misses (navigations to
  `/`, `/app/...`, and old links), well inside the daily request limit.
- COEP `require-corp` must not end up on the landing page (it would block
  nothing today, but keeps future embeds possible).

## Subagent instructions

- Model: Claude Sonnet 5.5. Work in this repo on a new branch
  `landing-page` (create locally; **do not** commit, push, deploy, or create
  anything on an external service).
- Read first: `CLAUDE.md`, `web/AGENTS.md`, `mobile/AGENTS.md`,
  `mobile/README.md`, `docs/web-deployment.md`, `docs/screenshots/README.md`,
  this plan, and the artboard Site page.
- pnpm only; in `mobile/` add deps with `pnpm expo install`; declare every
  package in the package that uses it.
- Use Playwright for every browser check (CLAUDE.md rule).
- Work phase by phase; after each phase run its acceptance checks. If a
  phase can't meet its acceptance, stop and report what blocked it.
- Hand back: a summary per phase, the full verification output, the
  screenshots, the list of changed files, and anything left open.
