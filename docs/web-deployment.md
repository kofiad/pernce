# Web deployment status and Cloudflare plan

_Last updated: 2026-11-18_

## Current status

- **Personal instance, live: Vercel Hobby + Turso** at
  <https://pernce.vercel.app>: one project, `pernce`, serving the API and the
  personal web app (with sync). Since the move off Next.js (this change) the
  server is one Hono app (`web/src/node-app.ts`, bundled into `web/server.mjs`); the project's `vercel.json` now
  says `"framework": "hono"`. **The first deploy of this change is the
  owner's to check** (see "Vercel redeploy notes").
- **Public web app, built, not deployed: Cloudflare Workers static assets**
  for <https://pernce.com>: the offline-only store web build
  (`web/wrangler.app.jsonc`). Ready to deploy; the checklist is below.
- **Public API Worker, built, tested and measured, not deployed**: the same
  Hono app on Workers with D1 for <https://api.pernce.com>
  (`web/wrangler.jsonc`). Waits until sync goes public (the store app ships
  offline-only; sync is held back as a paid add-on; see `mobile/README.md`,
  "Sync"). Two things must be settled first: scrypt over the free plan's CPU
  limit and the rate limiters (below).

The web app is installable as an iPhone PWA (Share, Add to Home Screen),
which replaces the 7-day sideload refresh; see `mobile/README.md`, "Web".

## The plan (decided 2026-10-21, revised 2026-11-18)

Everything has to run on free tiers.

1. **Done: the web app runs on SQLite.** One Drizzle schema and data layer
   serve every host. Money is integer minor units, and all-or-nothing
   writes use `db.batch()`, since D1 has no interactive transactions (see
   `web/src/db/batch.ts`).
2. **Done: personal instance on Vercel Hobby + Turso,** at
   <https://pernce.vercel.app>. A private deployment used by its owner
   alone, with its own Turso (libSQL) database. Setup steps are in
   README.md, "Deploying to Vercel".
3. **Done: personal mobile build with sync** pointed at that instance
   (`pnpm run ios:device:personal` in `mobile/`; see `mobile/README.md`,
   "Sync"). Sign-ups are capped at one account (`SYNC_MAX_USERS=1`). Its
   web build is the personal web app, served from the same origin as the
   API.
4. **Done: Next.js dropped; one Hono app, two hosts.** `web/` is a
   framework-neutral Hono app (`web/AGENTS.md`). Vercel (personal) runs it
   as a Node function on libSQL; Cloudflare (public) runs it on Workers with
   D1. Same routes, paths, status codes and auth on both.
5. **Done (not deployed): public Cloudflare deployment.** `pernce.com` was
   purchased in 2026-11 (the rename to Pernce is done, GitHub issue #22).
   The split app/API layout: the static store web app at `pernce.com`, the
   API Worker at `api.pernce.com`, which the app will call cross-origin
   (CORS for `https://pernce.com`). The app is offline-only for now, so only
   the static app is on the owner's checklist; the API Worker is later.

## Where things are

| | Vercel (personal) | Cloudflare (public) |
|---|---|---|
| Web app | personal build (sync), `web/public/` from `build:app`, served by the Vercel function itself (files bundled in via `vercel.json` `includeFiles`; SPA fallback in the app), COOP/COEP from `vercel.json` headers | store build (offline), `web/public-store/` from `build:store-app`, Workers static assets (`wrangler.app.jsonc`, `cloudflare/_headers`) at `pernce.com` |
| API | `web/server.mjs`, esbuild bundle of `web/src/node-app.ts` (Node function), same origin | `web/src/worker.ts` (Worker), `api.pernce.com`, CORS for `https://pernce.com` |
| Database | Turso/libSQL (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`) | D1 binding `DB` |
| Crons | Vercel Cron to `/api/cron/*` with `CRON_SECRET` | Cron Triggers to `scheduled()` (no secret) |
| Local | `pnpm run dev` (Node server, `file:local.db`) | `pnpm run dev:worker`, `pnpm run dev:store-app` |

How the database and settings reach the app: `createApp()` takes a
`createContext(env)`. Vercel/Node (`src/node-app.ts`) builds libSQL from
`process.env`; the Worker (`src/worker.ts`) builds Drizzle D1 from the
`DB` binding and the Worker's vars and secrets. `readEnv(c)` reads `c.env`
first, then `process.env`, per request, so nothing is read at import time
(Workers have none) and tests pass their own bindings. Details:
`web/AGENTS.md`.

The server holds no plaintext money data, only the sync store (ciphertext)
and reference data. The sync design (own `sync_users` and bearer tokens,
end-to-end encryption) doesn't depend on the host, and the client
(`mobile/src/sync/`) only needs the server's URL (`SYNC_URL`).

## Free plan measurements (API Worker, 2026-11-18)

Limits are from Cloudflare's Workers limits page as read on 2026-11-18.
Free plan: **10 ms CPU per request, and per Cron Trigger**; 1 s start-up;
50 subrequests per request; 100,000 requests a day; 5 Cron Triggers per
account (this Worker uses 2); 128 MB memory. The page says there is **no
compressed size limit and the uncompressed limit is 64 MiB on both plans**
(it used to be 3 MB compressed on Free; measured below against both).
Static assets: 20,000 files per version, 25 MiB per file.

**Bundle** (`pnpm run build:worker`, `wrangler deploy --dry-run --outdir`,
wrangler 4.163.0, no login): **1586 KiB raw (`worker.js` 1,624,174 bytes),
294.5 KiB gzip** as wrangler reports it (297,854 bytes by `gzip -9`).
Largest parts: zod 738 KiB, nodemailer 482 KiB, drizzle-orm 181 KiB, hono
62 KiB, app and core 56 KiB, jose 34 KiB. It fits both the current limit
and the old 3 MB compressed one with room to spare. (nodemailer is the
SMTP mailer; see "Email on Workers".)

**CPU.** Measured in workerd locally (`wrangler dev`, local D1, wall time
per request, which is a good proxy where the work is CPU-bound; wrangler
doesn't report CPU) and in Node:

| Request | Result | Fits 10 ms? |
|---|---|---|
| prelogin, keys, small pull, cron auth | 1.2 to 1.6 ms wall (D1 and HMAC/JWT included) | yes |
| push of 10 records | 11 ms wall including local D1 round trips | likely (CPU share unknown) |
| push of 200 records (the maximum) | 17 to 19 ms wall | unknown; measure on Cloudflare |
| pull of 500 records (about 0.96 MB) | 19 ms wall | unknown; measure on Cloudflare |
| **login, sign-up, reset/confirm, delete account** | **about 16 to 18 ms wall** (scrypt N=16384, r=8, p=1: 18 to 21 ms CPU in Node) | **no** |
| daily FX refresh (153 currencies, parse + 4 upsert batches) | 7 to 12 ms wall in Node over in-memory SQLite, excluding the fetch | borderline |

**Verdict: the bundle fits the free plan; the hot path (token check,
small reads) fits; the four endpoints that run scrypt do not** (they would
fail with Cloudflare's CPU-exceeded error), and the larger pushes, pulls and
the FX cron are borderline and must be measured with real CPU numbers
(`wrangler tail` or the dashboard) after a first deploy. Options, none
applied:

1. **Workers Paid** (about $5 a month): CPU limit becomes 30 s by default.
   Simplest, but not free.
2. **Cheaper password hashing.** The server hashes the client's Argon2id-
   derived 256-bit auth key, never the password, so a slow server-side hash
   protects little: a stored hash of 256 random bits can't be brute-forced.
   A keyed `HMAC-SHA256` (or scrypt at N=4096, about 4 ms) would fit.
   `verifyPassword()` reads the cost from each stored hash, so old hashes
   keep verifying. This is a security design change, so it is not made here.
3. **Keep the sync sign-in endpoints on Vercel** (Node, no 10 ms limit) and
   run only the rest on Workers, or keep sync on Vercel altogether.
4. **Split by cost**: Argon2/scrypt-style work in a Durable Object or
   Workflows is not free either; not recommended.

## Rate limiting on Workers

The sign-in, sign-up and email limiters are in-memory maps
(`web/src/lib/rate-limit.ts`). On Vercel they are per warm instance, which
the comment in that file accepts for one person. On Workers every isolate has
its own map, and isolates start and stop freely, so **the limiters are close
to ineffective there**: a caller spreading requests across isolates is not
throttled. Auth itself is not weakened (every login still needs the right
auth key; the sign-up cap and quotas are database-backed), but brute-force
and email-flooding protection is. Before the Worker API is public: add a
Cloudflare rate limiting rule on `api.pernce.com/api/sync/*` (check the
current free-plan allowance), or move the counters into D1 (a table and a
batch-guarded counter, as `push()` does), or a Durable Object. The client
address for the sign-up limit comes from `CF-Connecting-IP`
(`cloudflareClientIp`), never `X-Forwarded-For`, which a caller can forge
through Cloudflare.

## Email on Workers

Sign-up and reset codes go out through Gmail SMTP with nodemailer, which
connects over TCP/TLS. It is bundled into the Worker (482 KiB raw) and
loaded on first send, but **no SMTP send has been tested from workerd**:
Workers' `node:net`/`node:tls` support and Cloudflare's outbound connection
rules might not allow it. Test it with `wrangler dev` (which uses workerd)
and real Gmail credentials before relying on it. If it fails, replace the
mailer in `web/src/sync/email.ts` (a `Mailer` is one async function) with an
HTTPS email API call (Resend, Brevo...); `createSyncContext` is the only
place it is chosen. Without `SMTP_USER`/`SMTP_PASSWORD` the Worker answers
sign-up and reset with 503 (it is never "development"; set `NODE_ENV=
development` in `.dev.vars` to print codes to the dev log).

## Vercel redeploy notes

- `web/vercel.json` sets `"framework": "hono"`, which overrides the
  project's Framework Preset (Next.js until now), so no dashboard change is
  required. After the first deploy check Settings → Build & Deployment:
  Framework Preset shows Hono (or Other), Output Directory is blank or
  `public`, and the Install and Build commands are the ones from
  `vercel.json` (they override the dashboard). Root Directory stays `web`,
  and keep "Include source files outside of the Root Directory" on.
- **How Vercel's Hono preset actually builds this** (found with a local
  `vercel build` and a first preview, which failed with
  `FUNCTION_INVOCATION_FAILED`):
  - It picks the entry after the build command, by name (`app`, `index`,
    `server`, then the same under `src/`) among files that import `hono`, and
    transpiles TypeScript file by file without bundling. Node's ESM loader
    then can't resolve the extensionless relative imports or `@pernce/core`
    (whose `exports` point at `.ts`). So `pnpm run build` ends with
    `scripts/bundle-server.mjs`: esbuild bundles `src/node-app.ts`, `src/` and
    `@pernce/core` into `web/server.mjs` (git-ignored), every other
    dependency external so Vercel traces `node_modules` (libsql's native
    binary included). `server.mjs` keeps a literal `from "hono"`, which the
    builder requires, and is the only entry candidate (more than one prints a
    "Multiple entrypoints" warning).
  - Its static step lists `public/**/*` for the CDN *before* the build
    command runs, so the generated export never reaches the CDN (the
    `.vercel/output/static` folder doesn't exist). The function therefore
    serves the web app: `vercel.json` `functions."web/server.mjs".includeFiles`
    (`web/public/**`, relative to the repository root) copies the export
    into the function, `src/web-app-files.ts` serves it with long immutable
    caching for hashed files and revalidation for `index.html` and `sw.js`,
    and returns `index.html` for other GET/HEAD paths (deep links). The CDN
    caches the immutable responses.
  - Any `rewrites` entry in `vercel.json` prints "Internal rewrites in
    backend framework projects now route requests using the rewritten
    destination path", so there are none; the fallback is in the app.
  - Vercel (like wrangler) skips directories named `node_modules`, which is
    where Expo puts its fonts and package images
    (`assets/node_modules/.pnpm/...`); `mobile/scripts/pwa.mjs` renames them
    to `assets/vendor/...` after each export, and rewrites the references.
- **Trade-off of function-served static files** (accepted by the owner for
  now): every un-hashed response (`index.html` on every load and deep link,
  `sw.js`, the manifest, icons) is a function invocation (no `s-maxage`, no
  ETag): roughly a few invocations per app load, within Hobby's free
  invocation allowance for one user. Cold starts load the libsql native
  module. Hashed bundles and fonts are immutable and served from the edge
  cache after the first request. Revisit options: a prebuilt
  `.vercel/output` (static on the CDN, our own `config.json` routes), or
  serving the personal app from Cloudflare too.
- Missing build files: `/_expo/...`, `/assets/...` and any path whose last
  segment has an extension are a JSON 404 on the Node server and the Vercel
  function, never `index.html` (the service worker's `cache.addAll` would
  otherwise cache an HTML page as a script after a redeploy). Immutable
  caching is decided from the file that was found, not the requested path.
  **Known difference on Cloudflare:** the public app Worker
  (`not_found_handling: "single-page-application"`) answers every unknown
  path, missing assets included, with `index.html` 200; assets-only Workers
  have no option to exclude paths (only `404-page` or `none`, which break
  deep links). Fixing it needs a small Worker script in front
  (`run_worker_first` for `/_expo/*` and `/assets/*`); not done.
- Verified on a preview deployment (2026-11-18, no app env vars): `/`,
  `/settings`, `/accounts/x`, `/sw.js` and `/favicon.ico` answer 200 with
  COOP and COEP (the HTML and `sw.js` with `max-age=0, must-revalidate`);
  the hashed entry bundle and a font answer 200 with `max-age=31536000,
  immutable` and are `x-vercel-cache: HIT` from the second request;
  `/api/fx` is a JSON 500 (no `DATABASE_URL` on previews), `/api/nope` a 404
  JSON, `/api/sync/pull` and `/api/cron/fx-rates` 401 JSON, all without
  COOP/COEP or CORS headers. The Production deployment is still to be
  checked after the merge.
- After a deploy check (`curl -I`): `/`, a deep link such as `/settings`, and
  `/sw.js` return the app files with `Cross-Origin-Opener-Policy:
  same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; `/api/fx`
  returns JSON without those headers; `/api/nope` is
  `{"error":"Not found"}` with a 404; `/api/sync/pull` is a 401 JSON; the
  Crons tab lists the two jobs. Preview deployments have no database
  settings (they are Production-only), so database routes answer a JSON 500
  there: expected.
- Environment variables do not change (`DATABASE_URL`,
  `DATABASE_AUTH_TOKEN`, `SESSION_SECRET`, `CRON_SECRET`, `SMTP_USER`,
  `SMTP_PASSWORD`, `SYNC_MAX_USERS`); `NODE_ENV=production` is set by Vercel.
  `WEB_APP_ORIGINS` is now `ALLOWED_ORIGINS` (the old name still works);
  neither is set on Vercel.
- Behaviour differences from the Next.js server: a trailing-slash path no
  longer redirects (`/api/fx/` is a 404); `/api` itself is a JSON 404 like
  other unknown API paths; unknown `/api/sync/*` paths are JSON 404s after
  authentication (not an HTML page); unexpected errors outside the sync
  routes are `{"error":"Internal server error"}` 500s.

## Owner checklist

All external steps are yours; nothing here has been run. Do 1 to 6 now for
the public web app; 7 onwards only when sync goes public.

1. **Cloudflare account.** Use your *personal* Cloudflare account. Add
   `pernce.com` to it as a zone (the domain is registered with Cloudflare, so
   it may already be there) and wait until it is Active. The custom domain
   below only attaches if the zone is in the same account you deploy to.
2. **Log in** from `web/`: `pnpm exec wrangler login`.
3. **Pick the account.** Run `pnpm exec wrangler whoami`. Your login may be
   a member of several accounts: confirm the one marked as your personal
   account is the one to use, then `export CLOUDFLARE_ACCOUNT_ID=<that
   account's id>` in the shell you deploy from (or add `"account_id"` to the
   wrangler configs yourself). No config sets it, so a deploy never silently
   picks another account. Do this before any `deploy` or `d1 create`.
4. **Deploy the public app**: `pnpm run build:store-app`, then
   `pnpm --filter @pernce/web deploy:store-app` (`wrangler deploy -c
   wrangler.app.jsonc`). Its `routes` entry attaches `pernce.com` as a
   Custom Domain (it creates the DNS record and certificate; it fails if the
   apex already has a conflicting CNAME record: delete that record first).
   Check <https://pernce.com>, a deep link such as `/settings`, and that the
   response has the COOP/COEP headers.
5. **`www` redirect.** In the zone's DNS add a proxied record for `www`
   (an `AAAA` to `100::`, proxy on) so the hostname reaches Cloudflare, then
   Rules → Redirect Rules → create: when Hostname equals `www.pernce.com`,
   Dynamic redirect to `concat("https://pernce.com", http.request.uri.path)`,
   status 301, preserve query string. (An assets-only Worker can't redirect
   by hostname, and `_redirects` can't match hosts.)
6. **Install check**: open the site on an iPhone, Add to Home Screen. The
   public app has its own origin, so its data is separate from the
   `pernce.vercel.app` web app's.

Later, when sync goes public:

7. **Settle the two blockers** above: the CPU cost of scrypt on the free
   plan (decide among the options; measure on Cloudflare) and rate limiting
   (Cloudflare rule or D1 counters). Test email sending from workerd.
8. **Create the database**: `pnpm exec wrangler d1 create pernce` (after
   step 3). Put the printed id in `database_id` in `web/wrangler.jsonc`
   (replace the all-zero placeholder) and commit it.
9. **Apply the migrations**: `pnpm exec wrangler d1 migrations apply DB
   --remote` from `web/` (it reads `web/drizzle/`; run it again after every
   `pnpm run db:generate`). No seed script is needed on D1: the first run of
   the 06:00 job adds every currency and its rate. To fill them at once, call
   the cron route (needs `CRON_SECRET`, below) or use the dashboard's
   "trigger" for the Cron Trigger.
10. **Set the secrets** (`pnpm exec wrangler secret put <NAME>`, each prompts
    for the value): `SESSION_SECRET` (`openssl rand -base64 32`),
    `SMTP_USER`, `SMTP_PASSWORD` (a Gmail app password, or the keys of
    whatever mailer replaces it), and optionally `CRON_SECRET` (only needed
    to call `/api/cron/*` by hand; Cron Triggers don't use it). Variables
    in `wrangler.jsonc` `vars`: `ALLOWED_ORIGINS=https://pernce.com`,
    `SYNC_MAX_USERS`; also optional `SYNC_QUOTA_BYTES`.
11. **Deploy the API**: `pnpm --filter @pernce/web deploy:worker`
    (`wrangler deploy`, the default config), then attach
    `api.pernce.com`: add `"routes": [{ "pattern": "api.pernce.com",
    "custom_domain": true }]` to `wrangler.jsonc` and deploy again (or
    Workers & Pages → pernce-api → Settings → Domains & Routes). Check
    `curl https://api.pernce.com/api/fx` and that the two Cron Triggers are
    listed.
12. **Point the app at it**: build the app with the API's URL, e.g.
    `APP_VARIANT=personal SYNC_URL=https://api.pernce.com` for the web
    export (and for phone builds; see `mobile/README.md`, "Sync"), and
    redeploy the static app. Without `SYNC_URL` a personal web build would
    call its own origin (`pernce.com`), which has no API.

## Upgrading to the Pernce rename (owner procedure)

The rename changes the sync key-derivation labels, so the old sync account
can't sign in any more, and with `SYNC_MAX_USERS=1` the server refuses a new
sign-up (`403 signups_closed`) while the old `sync_users` row exists. Do the
steps in this order:

1. **Before deploying**, as a precaution, export a backup from the old phone
   app (Export backup) and from the old web app at
   <https://pernce.vercel.app>. Keep both files.
2. Deploy the rename (merge to `main`; Vercel deploys it).
3. Empty all the sync tables on Turso (the schema's sync tables are
   `sync_users`, `sync_records`, `sync_sessions` and `email_tokens`; leave
   `currencies` and `exchange_rates` alone). Log in first with
   `turso auth login`. Find `<db-name>` with `turso db list` (or take it
   from the host in the Vercel project's `DATABASE_URL`:
   `libsql://<db-name>-<org>.turso.io`). Children first, then users:

   ```bash
   turso db shell <db-name> "DELETE FROM sync_records; DELETE FROM sync_sessions; DELETE FROM email_tokens; DELETE FROM sync_users;"
   ```

   Check with `turso db shell <db-name> "SELECT count(*) FROM sync_users;"`
   (0).
4. Update the phone app in place (install the new build over the old one;
   the native ID `com.kofiad.perance` deliberately stayed for that upgrade,
   so it is the same app and keeps its data (the ID later became
   `com.pernce.app`; see `mobile/README.md`), including its `perance.db` database). On first
   launch it notices the sync account is gone and shows sync as signed out;
   register sync again. If something went wrong, import the phone backup
   from step 1 (Import JSON backup; set up a profile first, because
   importing only applies the backup's name and base currency to a profile
   that already exists, while accounts, transactions, budgets and
   categories import either way).
5. Open <https://pernce.vercel.app>. It keeps its local data (it is copied
   from the old storage name on first load); sign in to sync and pull, or
   import the web backup instead. Other devices: register or sign in the
   same way.

## Takedown checklist

1. **Back up production data.** `pg_dump` isn't installed by default.
   Install it with `brew install libpq`, then run this from `web/`
   (`DATABASE_URL` lives in `web/.env`):

   ```bash
   $(brew --prefix libpq)/bin/pg_dump \
     "$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d "\"'")" \
     -Fc -f ~/pernce-prod-backup.dump
   $(brew --prefix libpq)/bin/pg_restore -l ~/pernce-prod-backup.dump | head   # sanity check
   ```

   Keep a copy of the dump somewhere other than the laptop.
2. **Delete the Vercel project.** Go to Settings → General → Delete Project.
   This removes the deployments, the `*.vercel.app` URL, both crons, the env
   vars and the GitHub link. If the database shows up under the project's
   **Storage** tab (created through Vercel's Neon integration), delete it
   there first, because deleting the project alone leaves it running.
3. **Delete the Neon project.** It's `ep-rapid-queen-…` in us-east-1. Go to
   console.neon.tech → Settings → Delete project. This is permanent and
   takes the branches and backups with it.
4. **Clean up locally.** Remove the dead Neon `DATABASE_URL` from
   `web/.env` / `web/.env.local`, or point it at a local Postgres.

Not affected: the mobile app (offline-only), and CI (`db:verify` runs on
in-memory libSQL).
