# Deployment

How the server and the web apps are hosted. Both hosts run the same Hono app
from `web/`. The Vercel side (the personal instance) and the public store web app at
pernce.com (Cloudflare) are live; the API Worker for api.pernce.com is built
and tested but **not deployed yet**. For status, free-plan measurements and the owner's checklist see
[web-deployment.md](web-deployment.md); for local development see
[development.md](development.md).

- [Deploying to Vercel (Hobby, free)](#deploying-to-vercel-hobby-free)
- [Deploying to Cloudflare (pernce.com live, API not deployed)](#deploying-to-cloudflare-perncecom-live-api-not-deployed)

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
  preset, so the project's Framework Preset setting needn't be edited; check Settings → Build & Deployment shows
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

## Deploying to Cloudflare (pernce.com live, API not deployed)

Cloudflare hosts the public side, from the same `web/` package. Two Workers,
two configs, both on free tiers; neither sets an `account_id` (a login can
see several Cloudflare accounts: run `wrangler whoami` after `wrangler
login`, make sure the account is your personal one, and `export
CLOUDFLARE_ACCOUNT_ID=<its id>` before any deploy). The step-by-step owner
checklist, the free-plan measurements and the caveats are in
`docs/web-deployment.md`.

- **pernce.com** (`web/wrangler.app.jsonc`): the landing page (`web/site/`)
  at `/` and the offline-only store build under `/app`, as Workers static
  assets with a small Worker script (`web/cloudflare/site-worker.ts`) for
  what no asset matches (`/`, `/app/` and its client-side routes, 301s for
  old root-level app links).
  `pnpm --filter @pernce/web build:store-app` builds both into
  `web/public-store/` (never `web/public/`, the personal export) and adds
  `web/cloudflare/_headers` (COOP/COEP for `/app/*`); the config attaches
  the `pernce.com` custom domain. Deploy with `pnpm --filter @pernce/web deploy:store-app`.
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

