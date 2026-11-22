# Development

How to run, check and build Pernce locally. For the tour of the repo see the
[README](../README.md); for hosting see [deployment.md](deployment.md); for
the rules reviews look for see [CONTRIBUTING.md](../CONTRIBUTING.md).

- [Local setup (server)](#local-setup-server)
- [Keeping builds warning-free](#keeping-builds-warning-free)
- [Project structure](#project-structure)

## Local setup (server)

The app needs no server to run (see `mobile/README.md`). For working on
sync or the FX API:

1. **Install dependencies**: `pnpm install` (the repo uses pnpm only;
   the version is pinned in `package.json` `packageManager`)
2. **Configure**: `cp web/.env.example web/.env.local`, then set
   `DATABASE_URL=file:local.db` (a SQLite file in `web/`, git-ignored) and
   `SESSION_SECRET` (`openssl rand -base64 32`). Leave `SMTP_USER` /
   `SMTP_PASSWORD` blank and sign-up codes print to the `pnpm run dev` log.
   `ALLOWED_ORIGINS=http://localhost:8081` (the example's default) lets the
   app's web dev server call it; change it if `expo start --web` uses
   another port.
3. **Create the schema and reference data**:

   ```bash
   pnpm run db:migrate   # applies web/drizzle/ to your database
   pnpm run db:seed      # currencies and starter FX rates
   ```

4. **Run it**: `pnpm run dev` (the Hono server on Node, port 3000: the API
   and `web/public/`, with the same SPA fallback and headers as Vercel;
   `.env.local` is read at start), and in another terminal the app pointed
   at it:

   ```bash
   cd mobile
   APP_VARIANT=personal SYNC_URL=http://localhost:3000 pnpm expo start --web
   ```

   `SYNC_URL` is needed here because the dev server (port 8081) isn't the
   sync server; the hosted web app uses its own origin. A dev build on a
   phone needs your machine's LAN address instead of `localhost`.
5. **Check the production build** (the app and the API from one server,
   as Vercel serves them):

   ```bash
   pnpm --filter @pernce/web build:app   # personal web export into web/public/
   pnpm start                            # http://localhost:3000
   ```

   `pnpm start` runs with `NODE_ENV=production`, so sign-up needs SMTP; for
   a sign-up you can finish without email, run `pnpm run dev` on the same
   export instead.
6. **Verify**: `pnpm run db:verify` runs the sync server through sign-up,
   sessions, push/pull, last-writer-wins, racing pushes, quotas and resets
   on an in-memory SQLite database; `pnpm run db:verify:d1` runs the same
   checks on a local Cloudflare D1 (workerd, no login). `pnpm --filter
   @pernce/web test` runs the HTTP tests of every route, the CORS, cron and
   app-shell behaviour, and the Worker's handlers over D1.
7. **The Worker locally** (optional): `cp web/.dev.vars.example
   web/.dev.vars`, `pnpm --filter @pernce/web db:migrate:d1:local`, then
   `pnpm --filter @pernce/web dev:worker` runs the Cloudflare build of the
   API (local D1, port 8787). `pnpm --filter @pernce/web dev:store-app`
   serves the public store web app (after `build:store-app`) the way
   Workers static assets will, on port 8788.


## Keeping builds warning-free

`web/vercel.json` installs production dependencies only
(`pnpm install --frozen-lockfile --prod`, in `web/` and `mobile/`), so dev tooling
like ESLint and drizzle-kit never reaches the Vercel build and its
deprecation notices stay out of the log. The app's web export must run on
`mobile/`'s production dependencies too. Anything the server (`web/src/`, except the local Node server's two files) or
`pnpm run build` needs (Hono, Drizzle, TypeScript, `@types/node`) must be
in `web/package.json` `dependencies`, not `devDependencies`. Dev tooling is
type-checked separately (`web/tsconfig.tools.json`) and CI runs both:
`pnpm --filter @pernce/web typecheck`.

The build command runs its scripts with
`--config.verify-deps-before-run=false`. `core` has only
devDependencies, so a `--prod` install leaves it without a
`node_modules`, and pnpm's check before each `pnpm run` takes that for an
out-of-date install: it warns ("Workspace package @pernce/core has
dependencies but does not have a modules directory") and installs
everything again.

`mobile/pnpm-workspace.yaml` overrides `esbuild` to `^0.28.2`, like the root, so
drizzle-kit's `@esbuild-kit/*` loader doesn't pull in a vulnerable esbuild.
It also overrides the Expo CLI's `zod` to `^4.6.6`: the CLI asks for
`zod@3`, which has a memory-exhaustion advisory fixed only in 4.6.6, and
the few schemas it builds (dev-tools plugins) work unchanged on zod 4.
Drop the override once `@expo/cli` depends on a fixed zod.

`pnpm audit` in `mobile/` still reports `node-forge` (via the Expo CLI's
`@expo/code-signing-certificates`). That's accepted: it runs only in the
build tooling, never in the app, and has no fixed release yet
(`node-forge@1.4.0` is the latest). Revisit when it does.

The root `pnpm audit` (the one CI runs) is clean through one setting in the
root `pnpm-workspace.yaml`: `picomatch` (GHSA-fc5q-39xc-vjpf, high,
`<=4.0.7`, via `tinyglobby` in `tsup`, ESLint, wrangler and the TypeScript
tooling) is accepted under `auditConfig.ignoreGhsas`: it runs only in build,
lint and test tooling on our own source, never in the server or the app
bundle, and no patched release exists yet. Revisit when one does
(`mobile/` isn't audited in CI; its `pnpm audit` has the same picomatch plus
the `node-forge` entries above). No other overrides or ignores are needed:
the audit is otherwise clean.

`pnpm dlx expo-doctor` (in `mobile/`) skips the React Native Directory check
for three packages (`expo.doctor` in `mobile/package.json`):
`react-native-libsodium`, listed as untested on the New Architecture
(it runs there; see `mobile/README.md`, "Sync"), and `expo-modules-core`
and `unimodules-app-loader`, which have no directory entry.

Packages with install scripts must be approved in `allowBuilds` (root and
`mobile/` `pnpm-workspace.yaml`) or pnpm skips the script and warns:
`pnpm approve-builds` lists them. Overrides live in the same files.
pnpm doesn't hoist dependencies, so a package that runs a tool (like
`tsx` in `core/`) must list it itself.

`mobile/pnpm-workspace.yaml` overrides `xcode`'s `uuid` to `^11.1.1`: Expo's config
plugins depend on `xcode@3`, which pins the deprecated `uuid@7` but only
calls `uuid.v4()` during iOS prebuild. Drop the override once Expo stops
depending on `xcode@3` / `uuid@7`.

The Release workflow runs EAS CLI with `pnpm dlx eas-cli@latest`. Its install
prints deprecation notices for eas-cli's own dependencies (uuid, glob, rimraf,
inflight); those are upstream and accepted, alongside the `eslint@9` and
`@esbuild-kit/*` notices.

## Project structure

The root `pnpm run …` scripts forward to the `web/` package (except
`test`/`core:build`); `mobile/` has its own (see `mobile/README.md`).

```
web/                   @pernce/web — the server: one Hono app, two hosts
  src/
    create-app.ts       the app: routes, CORS, app-shell headers; the host
                        hands it the database and settings per request
    node-app.ts         Node entry (libSQL): bundled into web/server.mjs,
                        the Vercel function
    worker.ts           Cloudflare Worker entry (D1, scheduled() crons)
    node.ts             the local server; web-app-files.ts serves public/
    routes/             /api/sync/*, /api/fx, /api/cron/*
    middleware/         CORS, COOP/COEP headers for app paths
    db/
      schema.ts           Drizzle tables: currencies, rates, sync store
      libsql.ts d1.ts     the two database connections
      batch.ts            DbClient, all-or-nothing writes via db.batch()
      mutations.ts        writes to the reference data (FX rates)
    lib/                 FX fetch, scrypt hashing, rate limiting
    sync/                accounts.ts (sign-up, sessions, reset, keys),
                         records.ts (push/pull), tokens.ts
    cron.ts              the two scheduled jobs (HTTP and Cron Trigger)
  test/                  HTTP tests, Worker tests (local D1)
  public/                the personal web app, exported by `pnpm run
                         build:app` (generated, git-ignored)
  public-store/          the public store web app, `build:store-app`
                         (generated, git-ignored)
  vercel.json            Hono framework, build, headers, crons, public/ into
                         the function
  wrangler.jsonc         the API Worker (D1, crons, CORS origin)
  wrangler.app.jsonc     the public app Worker (static assets); cloudflare/
                         holds its _headers
  scripts/
    seed.ts              currencies + starter FX rates
    verify-sync.ts       sync server checks, in-memory libSQL (db:verify)
    verify-d1.ts         the same checks on a local D1 (db:verify:d1)
  drizzle/               generated SQL migrations — commit these
core/                  @pernce/core — framework-free money logic (currency,
                       formatting, CSV, categories, transaction validation,
                       balance deltas, report math) shared with the mobile
                       app; `pnpm test` runs its tests
mobile/                @pernce/mobile — the offline-first Expo app for
                       iOS, Android and the web; see mobile/README.md
docs/                  sync.md (sync design), mobile-scope.md (mobile plan),
                       development.md, deployment.md, web-deployment.md,
                       design/ (design system)
scripts/               release tooling (version.mjs, release-notes.mjs)
.github/workflows/     ci.yml (checks), release.yml (builds and publishes tagged releases)
```

