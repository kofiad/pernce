# `@pernce/web`: the server

One framework-neutral [Hono](https://hono.dev) app, no Next.js. It is the
API (sync, `/api/fx`, two crons) and runs on two hosts. Read this before
touching `web/`; the repo-wide rules are in the root `CLAUDE.md`.

## Layout

- `src/create-app.ts`: `createApp({ createContext, clientIp?, staticFiles? })`
  builds the whole app. It never touches `process.env` or a database at
  import time: each request gets a `SyncContext` (database, mailer, clock,
  settings) from the host's `createContext(env)`, built lazily by
  `c.var.getCtx()`.
- `src/node-app.ts`: the Node entry. libSQL (Turso, or `file:local.db`),
  plus the web app's files (`src/web-app-files.ts`). On Vercel it is not run
  from source: `scripts/bundle-server.mjs` (the end of `pnpm run build`)
  bundles it with `src/` and `@pernce/core` into `web/server.mjs` (git-
  ignored), the one file Vercel's Hono builder picks up (it looks for
  `app|index|server` files that import `hono`; it transpiles TypeScript file
  by file, which Node's ESM loader then can't resolve). Don't add `app.*`,
  `index.*` or `server.*` files that import `hono` in `web/` or `web/src/`:
  Vercel warns about multiple entrypoints.
- `src/worker.ts`: the Cloudflare Worker entry. D1 (`DB` binding), CORS from
  `ALLOWED_ORIGINS`, `scheduled()` for the crons. Config: `wrangler.jsonc`.
- `src/node.ts`: the local server (`pnpm run dev`, `pnpm start`): the API,
  plus `public/` through `src/web-app-files.ts` (files, then `index.html`
  for other GET/HEAD paths).
- `src/routes/`, `src/middleware/`: the routes (`methods()` also gives the
  405/OPTIONS answers), CORS, and the COOP/COEP app-shell headers.
- `src/env.ts`: `readEnv(c)` reads `c.env` (Worker bindings, test
  bindings), then `process.env`. Always per request.
- `src/db/`: `schema.ts`, `batch.ts` (`DbClient`, `runBatch`, `chunkRows`),
  `libsql.ts`, `d1.ts`. Both drivers are Drizzle async SQLite, so queries
  are written once.
- `src/sync/`, `src/lib/`, `src/cron.ts`: the sync services (take a
  `SyncContext`; the design is in `docs/sync.md`), scrypt and the in-memory rate limiters, the FX refresh,
  the two cron jobs.
- `site/`: the landing page for pernce.com (plain HTML, CSS, a little JS, the
  retire `sw.js`, `img/`), copied into `public-store/` by `build:store-app`.
  `cloudflare/`: `site-worker.ts` (the Worker in front of the static assets
  on pernce.com: `/`, `/app/...`, old-link redirects; runs only on asset
  misses) and `_headers`. `tests/site/`: Playwright tests (`pnpm run
  test:site`, after `build:store-app`); `playwright.config.ts` starts
  `wrangler dev -c wrangler.app.jsonc`.
- `test/`: HTTP tests of the app (`app.request()` over in-memory libSQL) and
  of the Worker handlers over a local D1. `scripts/`: `db:verify` (sync
  checks on in-memory libSQL), `db:verify:d1` (the same on local D1),
  `seed.ts`, `build-store-app.mjs`.

## Rules

- **D1 compatibility.** No interactive transactions (ESLint bans
  `.transaction(`): all-or-nothing writes use `runBatch()` with guards.
  Keep inserts under 100 bound parameters (`chunkRows()`). No
  `ON DELETE CASCADE`: delete child rows explicitly.
- **No globals for config or the database.** Workers have no `process.env`
  at import time. Read settings through the context or `readEnv(c)`; pass
  the db through `SyncContext`. Don't import `src/db/libsql.ts` from code
  the Worker bundles (it would pull `@libsql/client` in), or
  `src/db/d1.ts` from Vercel's.
- **Same API on both hosts**: paths, methods, status codes, bodies, bearer
  auth. Behaviour that differs by host is a `createApp` option
  (`clientIp`, `staticFiles`), never an `if (cloudflare)`.
- **Production deps.** Vercel installs `web/` with `--prod`: anything
  `src/` (minus `node.ts`) imports, plus esbuild (the bundle step), TypeScript
  and `@types/node` for `pnpm run build`, belongs in `dependencies`. Wrangler,
  tests, tsx, drizzle-kit and the Node server's dependencies are dev-only.
  `tsconfig.json` checks the server with production deps only;
  `tsconfig.tools.json` the rest.
- **In-memory rate limiters** (`src/lib/rate-limit.ts`) are per instance on
  Vercel and per isolate on Workers, where they are close to ineffective
  (docs/web-deployment.md). Don't weaken them; put a Cloudflare rate
  limiting rule in front before the Worker API is public.
- Keep the cron schedules in step in `src/cron.ts`, `vercel.json` and
  `wrangler.jsonc` (a test checks).
- Serving the web app: on Vercel the function does it (`src/web-app-files.ts`
  over `web/public/`, which `vercel.json` `functions.includeFiles` copies
  into the function), with COOP/COEP from `vercel.json` `headers` and
  `appShellHeaders`. Vercel's hono preset can't deploy a build-generated
  `public/` to its CDN (its static step lists `public/` before the build
  command runs) and prints a warning for any `rewrites`. The public app
  Worker uses `wrangler.app.jsonc` and `cloudflare/_headers`; the Node server
  the same `web-app-files.ts`. A change to one is a change to all three.
- Export paths: `mobile/scripts/pwa.mjs` renames Expo's
  `assets/node_modules/...` (and `.pnpm`) directories to `assets/vendor/...`
  after every export, because hosts skip directories named `node_modules`.
  Don't undo it.

## Commands

```bash
pnpm run dev                 # Node server on :3000, watches src/
pnpm run dev:worker          # wrangler dev, local D1 (migrate it first: db:migrate:d1:local)
pnpm test                    # HTTP + Worker tests
pnpm run db:verify           # sync checks, in-memory libSQL
pnpm run db:verify:d1        # the same checks, local D1 in workerd
pnpm run typecheck           # server (prod deps) + tools
pnpm run build               # what Vercel runs after build:app: tsc --noEmit
pnpm run build:worker        # wrangler deploy --dry-run: bundle size, no login
pnpm run build:app           # personal web app export -> public/
pnpm run build:store-app     # landing page + store app under /app -> public-store/
pnpm run build:store-worker  # wrangler dry run of the pernce.com Worker
pnpm run test:site           # Playwright, needs build:store-app first
```
