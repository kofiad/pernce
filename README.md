# Pernce

A personal, multi-currency finance tracker. Accounts (bank, mobile money,
investments) across USD/GHS/XOF/XAF/CAD and more, income & expenses,
budgets, and analytics, with full import/export of your own data. One
offline-first Expo app runs on iOS, Android and the web; an optional
end-to-end encrypted sync server keeps devices in step.

The repo holds three packages that are versioned and released together:

| Folder | Package | What it is |
|---|---|---|
| `mobile/` | `@pernce/mobile` | The app: Expo for iOS/Android and its web build; see `mobile/README.md` |
| `web/` | `@pernce/web` | The server: sync API, public FX rates, daily crons (one Hono app on Vercel and on Cloudflare Workers), and on Vercel it hosts the personal web app |
| `core/` | `@pernce/core` | Framework-free money logic shared by both |

Design reference: `docs/design/pernce_design.md` and
`docs/design/pernce-artboard.html` are the source of truth for colors, type, spacing and component
shapes — the app's theme (`core/src/tokens.ts`, `mobile/src/lib/theme.ts`)
and components are a direct port of those tokens.

## How it's put together

- **The app** (`mobile/`) keeps everything in a local SQLite database:
  money as integer minor units, balances derived from the ledger. It works
  offline with no account. The store build is offline-only; the personal
  build (`APP_VARIANT=personal`) adds sync, and its web build is the
  personal web app at <https://pernce.vercel.app> (same screens, same data,
  decrypted in the browser), served by the server below. The store build's
  web export is the public web app at <https://pernce.com> (offline-only),
  served by Cloudflare. See `mobile/README.md`.
- **Sync** (`web/src/sync/`, `/api/sync/*`) is an end-to-end encrypted
  record store with its own self-serve accounts (`sync_users`). It only
  ever holds ciphertext; devices merge (last writer wins on HLC). Bearer
  tokens; the Vercel web app is same-origin, so CORS (`ALLOWED_ORIGINS`) is
  only for the app's dev server and the public API Worker.
  Design: `docs/mobile-scope.md` §5–6; wire types: `core/src/sync.ts`.
- **Currency conversion**: `exchange_rates` stores `1 unit -> USD` for every
  currency. A daily cron (Vercel Cron: `web/vercel.json` →
  `/api/cron/fx-rates`; Cloudflare: a Cron Trigger, `web/wrangler.jsonc`)
  refreshes them from a free, keyless API, and `GET /api/fx` serves them to
  the app.
- **Database**: SQLite via Drizzle (`web/src/db/schema.ts`): currencies,
  exchange rates and the sync tables. Turso (libSQL) for the personal
  Vercel instance and local development, Cloudflare D1 for the public API
  Worker, so no interactive transactions (`web/src/db/batch.ts`).
- **Server**: `web/` is one framework-neutral [Hono](https://hono.dev) app
  with two hosts: Vercel (personal instance, Node) and Cloudflare (public:
  the API Worker at `api.pernce.com`, built and tested but not deployed
  yet, and the static public app at `pernce.com`). See `web/AGENTS.md` and
  `docs/web-deployment.md`.

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

## Deploying to Vercel (Hobby, free)

One Vercel project, `pernce` (Root Directory `web`), deploys from this repo
on every push to `main` and serves <https://pernce.vercel.app>: the API
(the Hono app, bundled from `web/src/node-app.ts` into `web/server.mjs`, which
Vercel's zero-config Hono support runs as a function) and the personal web app at every other path. Keep
**Include source files outside of the Root Directory** on: the build needs
`core/` and `mobile/`.

`web/vercel.json` sets the build:

- **Install**: production-only installs (`pnpm install --frozen-lockfile
  --prod`) in `web/` (the root pnpm workspace) and then in `mobile/`, which
  has its own lockfile (it isn't in the workspace). Vercel uses the pnpm
  version in `packageManager` only with Corepack on, so the project sets
  the `ENABLE_EXPERIMENTAL_COREPACK=1` environment variable.
- **Build**: `pnpm run build:app` (the personal variant's web export,
  `APP_VARIANT=personal pnpm exec expo export -p web`, written into
  `web/public/`, which is git-ignored), then `pnpm run build`
  (a type-check of the server, then esbuild bundles it into `web/server.mjs`,
  the entry Vercel's Hono builder runs; `@pernce/core` and `src/` are inlined,
  the other dependencies stay external so Vercel traces them).
- **Framework**: `"framework": "hono"` in `web/vercel.json` selects the Hono
  preset, so the project's Framework Preset setting (Next.js before this
  change) needn't be edited; check Settings → Build & Deployment shows
  Hono/Other after the first deploy and that Output Directory is empty or
  `public`. The function serves the web app itself: `vercel.json`
  `functions."web/server.mjs".includeFiles` copies `web/public/` into it, and
  the app answers files and, for other non-API paths, `index.html` (deep
  links like `/settings`), with long immutable caching for the hashed
  `_expo/static` and `assets` files that Vercel's CDN then keeps. (Vercel's
  hono preset lists `public/` for its CDN before the build command runs, so
  the generated export never reaches it, and it prints a warning for any
  `rewrites`; hence no rewrites.) `vercel.json` `headers` add the
  cross-origin isolation headers the app's SQLite needs (`mobile/README.md`
  "Web") on everything outside `/api/`.
  Trade-off, accepted for now: every un-hashed response (`index.html` on each
  load or deep link, `sw.js`, the manifest, icons) is a function invocation
  (no `s-maxage`, no ETag), a few per app load, well within Hobby's free
  invocation allowance for one user; a cold start also loads the libsql
  native module. The hashed bundles and fonts are cached at the edge. A
  missing `/_expo/` or `/assets/` file (or any path ending in an extension)
  is a JSON 404, never `index.html`. Revisit with a prebuilt
  `.vercel/output` (static files on the CDN) or by hosting the app on
  Cloudflare.

**Server** (`pernce`): create a free [Turso](https://turso.tech) database
(`turso db create pernce`; `turso db show pernce --url` for `DATABASE_URL`,
`turso db tokens create pernce` for `DATABASE_AUTH_TOKEN`) and set, for
Production: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SESSION_SECRET`,
`CRON_SECRET` (Vercel sends it to the crons as a bearer token),
`SMTP_USER`/`SMTP_PASSWORD` (a Gmail app password, for sign-up codes), and
`SYNC_MAX_USERS=1` to keep sign-ups to yourself. No `ALLOWED_ORIGINS`: the
web app is same-origin (nothing sends CORS headers). Migrate and seed from your machine, again
whenever `web/src/db/schema.ts` changes (`pnpm run db:generate`):

```bash
DATABASE_URL="<libsql://… URL>" DATABASE_AUTH_TOKEN="<token>" pnpm run db:migrate
DATABASE_URL="<libsql://… URL>" DATABASE_AUTH_TOKEN="<token>" pnpm run db:seed
```

The database settings are Production-only, so preview deployments of the
server build (it connects on first query, not at import) but can't reach
your data: a preview's web app runs, but can't sign in to sync. `web/vercel.json` declares the two daily crons (`/api/cron/fx-rates` at
06:00 UTC, `/api/cron/sync-prune` at 06:30); Hobby allows once-a-day crons.

## Deploying to Cloudflare (public: pernce.com)

Cloudflare hosts the public side, from the same `web/` package. Two Workers,
two configs, both on free tiers; neither sets an `account_id` (a login can
see several Cloudflare accounts: run `wrangler whoami` after `wrangler
login`, make sure the account is your personal one, and `export
CLOUDFLARE_ACCOUNT_ID=<its id>` before any deploy). The step-by-step owner
checklist, the free-plan measurements and the caveats are in
`docs/web-deployment.md`.

- **Public web app** (`web/wrangler.app.jsonc`, <https://pernce.com>): the
  offline-only store build as Workers static assets, no script.
  `pnpm --filter @pernce/web build:store-app` exports it into
  `web/public-store/` (never `web/public/`, the personal export) and adds
  `web/cloudflare/_headers` (the COOP/COEP headers); the config sets the
  single-page-application fallback and attaches the `pernce.com` custom
  domain. Deploy with `pnpm --filter @pernce/web deploy:store-app`.
  `www.pernce.com` redirects to the apex with a Redirect Rule (an
  assets-only Worker can't redirect by hostname): `docs/web-deployment.md`.
- **API Worker** (`web/wrangler.jsonc`, <https://api.pernce.com>): `src/worker.ts`,
  the same Hono app with a D1 binding (`DB`), CORS for `ALLOWED_ORIGINS`
  (`https://pernce.com`) and Cron Triggers for the two jobs. **Built and
  tested, not deployed**: the public web app is offline-only until sync
  goes public. `pnpm --filter @pernce/web build:worker` bundles it
  (`wrangler deploy --dry-run`: no login, nothing uploaded).
  `drizzle-kit`'s `web/drizzle/` SQL files are what `wrangler d1
  migrations apply` reads (`migrations_dir`); the `database_id` in
  `wrangler.jsonc` is a placeholder until `wrangler d1 create pernce`.
  Secrets (`wrangler secret put`): `SESSION_SECRET`, `SMTP_USER`,
  `SMTP_PASSWORD`. Its in-memory rate limiters don't work across isolates
  and scrypt sign-in is over the free plan's 10 ms CPU: read
  `docs/web-deployment.md` ("Free plan measurements", "Rate limiting")
  before making it public.

### Keeping builds warning-free

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
the `node-forge` entries above). (Dropping Next.js and `eslint-config-next`
made the old `minimatch` and `fast-glob` overrides unnecessary: the audit
is clean without them.)

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
docs/                  mobile-scope.md (mobile plan), design/ (design system)
scripts/               release tooling (version.mjs, release-notes.mjs)
.github/workflows/     ci.yml (checks), release.yml (builds and publishes tagged releases)
```

## Releases

Versions are CalVer, `YYYY.MM.PATCH`, and web, core and mobile always share
one version. Release notes live in `CHANGELOG.md`.

To cut a release:

```bash
pnpm run version:set 2026.10.1   # bumps every package.json, app.json, lockfiles
# add a "## [2026.10.1] - <date>" section to CHANGELOG.md, then commit and merge
git tag v2026.10.1 && git push origin v2026.10.1
```

Pushing the tag runs `.github/workflows/release.yml`, which checks that
every package is at the tagged version, runs the tests, lint, typecheck and
`db:verify`, and then:

- creates the GitHub Release from that version's CHANGELOG section,
- publishes `@pernce/core` to GitHub Packages as `@kofiad/pernce-core`
  and attaches the tarball to the release (see `core/README.md` for how to
  install it),
- builds the mobile app with EAS and attaches both builds to the release:
  a signed Android APK (`production-apk` profile in `mobile/eas.json`, the
  `production` build as an APK, with an auto-incremented versionCode) and an
  iOS simulator build (`preview` profile).

The web app isn't a release artifact: Vercel deploys `main` as usual.

**One-time setup for mobile builds.** The mobile job is skipped with a
warning until this is done:

1. `cd mobile && pnpm dlx eas-cli@latest login && pnpm dlx eas-cli@latest init`,
   then commit the `extra.eas.projectId` it adds to `app.json`.
2. Create the Android signing key once, interactively:
   `pnpm dlx eas-cli@latest credentials -p android` (let EAS generate a
   keystore; all profiles share it). CI builds run
   non-interactively and can't generate one.
3. Create an access token at expo.dev (Account settings → Access tokens) and
   add it as the `EXPO_TOKEN` repository secret on GitHub.
4. Re-run the release for an existing tag from Actions → Release → Run
   workflow.

## Contributing

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
checks and the rules reviews look for, and the
[Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately as
described in [SECURITY.md](SECURITY.md).

## License

Copyright 2026 Gilbert A. Henyo and Pernce contributors.

Pernce is licensed under the [Apache License 2.0](LICENSE); see also
[NOTICE](NOTICE). The Pernce name, logo and app icon are not covered by the
license: if you publish your own build, give it a different name and icon
(see [TRADEMARKS.md](TRADEMARKS.md)).
