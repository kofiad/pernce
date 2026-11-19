# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Pernce monorepo

Personal multi-currency finance tracker. Three packages, versioned and
released together:

- `web/` — `@pernce/web`, the server: one framework-neutral Hono app (API
  only: sync, `/api/fx`, crons), SQLite via Drizzle, on two hosts: Vercel
  (personal instance, Node, Turso/libSQL, `src/node-app.ts`, bundled into `web/server.mjs`) and Cloudflare
  Workers (public API, D1, `src/worker.ts`; built and tested, not deployed).
  On Vercel it also hosts the personal web app: the build exports it into
  `web/public/` (generated, git-ignored), served at every non-API path.
  Read `web/AGENTS.md` before touching it (layout, how the db and env reach
  the app per request, the D1 and production-dependency rules).
- `core/` — `@pernce/core`, framework-free money logic shared by both apps.
  No runtime deps. Apps import its TypeScript source directly (`exports`
  points at `src/`), so no build step is needed during development.
- `mobile/` — Expo SDK 58 app for iOS, Android and the web (its web build
  is the web app). Read `mobile/AGENTS.md` and
  `mobile/README.md` before touching it. Not in the pnpm workspace (own React
  version, own `pnpm-workspace.yaml` and lockfile); links core via
  `link:../core`, so install/run its commands from `mobile/`.

## Commands

From the repo root (root scripts forward to `web/`, except `test`/`core:build`):

```bash
pnpm install                           # pnpm only (packageManager in package.json)
pnpm run dev                           # Hono server on Node :3000 (web/.env.local), serves web/public/
pnpm run dev:worker                    # the Cloudflare Worker build (wrangler dev, local D1)
pnpm run lint                          # web ESLint
pnpm --filter @pernce/web typecheck   # server (prod deps) + tools tsconfig
pnpm --filter @pernce/web build       # what Vercel runs after build:app (tsc --noEmit)
pnpm test                              # core tests (tsx --test core/src/*.test.ts)
pnpm run test:web                      # HTTP tests of the app + Worker handlers on local D1
pnpm run db:verify                     # sync server checks on in-memory libSQL
pnpm run db:verify:d1                  # the same checks on a local Cloudflare D1 (workerd)
pnpm run build:worker                  # wrangler dry-run bundle of the API Worker (no login)
pnpm run build:app                     # personal web export -> web/public/
pnpm run build:store-app               # store (offline-only) web export -> web/public-store/
pnpm run db:generate                   # after editing web/src/db/schema.ts; commit web/drizzle/
pnpm run core:build                    # tsup build of core (only for publishing)
```

Single core test: `cd core && pnpm exec tsx --test --test-name-pattern "<name>" src/core.test.ts`.

From `mobile/`:

```bash
pnpm install
pnpm expo install <pkg>   # never plain pnpm add for deps
pnpm run typecheck
pnpm run lint
pnpm test                 # Node test runner over src/**/*.test.ts on node:sqlite
pnpm run db:generate      # after editing src/db/schema.ts; also regenerates src/db/migrations.ts
pnpm expo run:ios|android # dev build (Expo Go won't work: native quick-actions module)
```

CI (`.github/workflows/ci.yml`) runs: `pnpm audit`, `pnpm test`, lint, web
typecheck, web `build`, web tests, `db:verify`, `db:verify:d1`, `build:worker`,
`core:build`, then mobile typecheck/lint/test and both web exports.

## Architecture

- **Money**: integer minor units per currency precision (core `toMinor`/
  `fromMinor`); convert only at UI edges. FX rates are stored as
  `1 unit -> USD`, refreshed by a daily Vercel cron (`/api/cron/fx-rates`).
- **Server data**: `web/src/db/schema.ts` holds only currencies, FX rates
  and the sync store; nobody's money is stored on the server in plaintext.
  It must stay D1-compatible: no interactive transactions (lint bans
  `.transaction(`); all-or-nothing writes go through `runBatch()`
  (`web/src/db/batch.ts`) with guards against concurrent changes; keep
  inserts under D1's 100 bound parameters per statement (`chunkRows()`).
- **Mobile data layer**: `mobile/src/data/` (plain synchronous Drizzle over
  expo-sqlite). Unlike web, balances are *never* stored: `opening_balance` +
  core `balanceDeltas()` over non-deleted transactions. Writes go through
  core `resolveTransactionInput`. Rows have device
  UUIDs, an HLC `updated_at` (core `hlc.ts`), and a `deleted` tombstone that
  every read must filter.
- **Sync**: end-to-end encrypted. Server `web/src/sync/` (+ `/api/sync/*`)
  stores only ciphertext and has its own `sync_users` and bearer tokens.
  Client `mobile/src/sync/` does pull/merge
  (last-writer-wins on HLC)/push. Wire types live in `core/src/sync.ts`.
  Design: `docs/mobile-scope.md` §5–6. **The store app ships
  offline-only** (sync will be a paid add-on); sync is wired in only in the
  personal build (`APP_VARIANT=personal`, `mobile/app.config.ts`). The store
  build doesn't link sync's native modules, so app code reaches the wiring
  only through `syncApp()` in `mobile/src/lib/syncFeature.ts` (ESLint
  enforces it). See `mobile/README.md`, "Sync".
- **Web app**: `mobile/` also runs in the browser (Expo web). Two builds:
  the personal one (with sync, https://pernce.vercel.app), exported into
  `web/public/` by `pnpm --filter @pernce/web build:app` and served by the
  Vercel server from the same origin, so it syncs with its own origin
  (`SYNC_URL` only overrides that, e.g. for `expo start --web`); and the
  store one (offline-only, no sync), exported into `web/public-store/` by
  `build:store-app` and served at https://pernce.com by a Cloudflare Workers
  static-assets Worker. There are no server-rendered pages. Web-specific
  behaviour and gotchas: `mobile/README.md`, "Web". Use `showAlert()`
  rather than `Alert.alert` so messages show on web.
- **Deployment**: two hosts for the one Hono app (`web/`), all on free
  tiers. (1) Personal instance on Vercel Hobby: one project, `pernce`
  (https://pernce.vercel.app, Turso database), the API and the personal web
  app; install/build/headers/crons and the function's included files in `web/vercel.json`. (2)
  Cloudflare, public: the store web app at https://pernce.com
  (`web/wrangler.app.jsonc`) and the API Worker for https://api.pernce.com
  (`web/wrangler.jsonc`: D1, Cron Triggers, CORS for pernce.com), built,
  tested and measured against the Workers free plan but NOT deployed until
  sync goes public. Status, measurements and the owner's checklist:
  `docs/web-deployment.md`.
- Keep `mobile/src/data/` and `mobile/src/sync/` free of React Native/Expo
  imports — their tests run in plain Node.
- **Design**: `docs/design/` (`pernce_design.md`, `pernce-artboard.html`)
  is the single source of truth for all design in the repo — colors, type,
  spacing, component shapes — for the app on every platform. Code ports it
  (`core/src/tokens.ts`, `mobile/src/lib/theme.ts`); when they disagree, the docs
  win. Check them before any UI change.

## Rules

- Ask clarifying questions before starting any task whose answers aren't
  obvious from the prompt (scope, behaviour, UX, data/schema choices,
  delivery). Ask them all up front, in one batch, before writing code;
  don't guess and build. Skip this only when the request leaves nothing
  open to interpretation.
- All packages share one CalVer version (`YYYY.MM.PATCH`); bump with
  `pnpm run version:set <ver>`, never by hand. Releases: see "Releases"
  in README.md and `CHANGELOG.md` (tag push runs `release.yml`).
- Builds must stay warning-free: see "Keeping builds warning-free" in
  README.md. Vercel installs `web/` without devDependencies, so anything
  the server or `pnpm run build` needs (Hono, Drizzle, TypeScript) goes in
  `dependencies`. Packages with install scripts
  need `allowBuilds` approval, and dependency overrides go in `overrides`
  (root and `mobile/` `pnpm-workspace.yaml`). pnpm doesn't hoist: declare
  every package a script or import uses in that package's own package.json.
- `mobile/ios` and `mobile/android` are generated; configure native
  behaviour via `app.json` plugins.
- Never commit or push without explicit approval from the user, every
  time. Approval for one commit or push doesn't carry over to the next.
- Keep work local to this repo. Ask before creating, publishing or
  uploading anything to an external service (claude.ai artifacts, docs,
  hosted pages), even when a skill or slash command defaults to it.
- Design work (including `/design` requests) happens in place in
  `docs/design/`: add or update frames in `pernce-artboard.html` (follow
  its `ms()`/`wsx()` templates; state variants get a suffix like `M10a`),
  and tokens/rules in `pernce_design.md`. Never make a claude.ai
  artifact or a standalone mockup file for it.
