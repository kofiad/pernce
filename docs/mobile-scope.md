# Pernce Mobile — Scope

A native iOS + Android version of Pernce that works fully offline. An
optional, end-to-end encrypted cloud sync is built but held back: it will
be a paid add-on, released once people using the offline app want it
(decision 6).

## 1. Goals and non-goals

**Goals**

- One codebase for iOS and Android.
- Every feature works with no network and no account: accounts, income,
  expenses, transfers (including cross-currency with fees), budgets,
  per-user editable categories, analytics, and CSV/JSON import and export.
- The app ships offline-only first, so people can use and test it with no
  server behind it (decision 6).
- Sync, when it ships, is an opt-in paid add-on, and anyone can sign up
  for it themselves. A user who never signs up never needs a server.
- Synced data is **end-to-end encrypted**: the server stores ciphertext it
  can't read. Edits made offline on several devices merge without
  corrupting balances.
- Each currency uses its own precision: two decimals for all of them,
  XOF and XAF included (ISO 4217 gives the CFA francs none, but people
  track centimes; until 2026.10.5 the app stored whole francs).
- The mobile app follows `docs/design/pernce_design.md` (same tokens, colors and
  category icons).

**Non-goals for v1**

- Shared or household ledgers where several users edit one account.
- Automatic bank feeds or SMS / mobile-money parsing. These are good v2
  candidates for the GHS/XOF mobile-money use case.
- Tablet-specific layouts, widgets, and watch apps.

## 2. Decisions

| # | Question | Decision | What it means |
|---|---|---|---|
| 1 | Sign-up | **Self-serve sign-up for sync** | Email + password sign-up, email verification, and abuse limits on the sync server (§6). Password reset interacts with encryption (§5.3). |
| 2 | Categories | **Per-user, editable** | On mobile, categories are ordinary user rows: seeded from `DEFAULT_CATEGORIES` with fresh UUIDs on first run, then editable and synced like everything else. This removes the "stable category ids" server migration the first draft needed. |
| 3 | Audience | **A few people for now** | Vercel Hobby + Neon free tier are enough. The sync server just stores small encrypted records, so it's cheap to run. Revisit quotas before any public launch. |
| 4 | Encryption | **End-to-end encryption** | The server can't validate, merge, or compute anything, so all of that moves to the devices (§5). It also affects the web app (§5.4, the one open question left). |
| 5 | Minor units | **Per-currency precision** | Implemented in `core/src/money.ts` (`currencyDecimals`, `toMinor`, `fromMinor`, `roundToCurrency`). The mobile app stores integer minor units per currency. The web app still shows two decimals everywhere; that's a separate web change. |
| 6 | Release order (2026-10-02) | **Offline first; sync later, as a paid add-on** | Sync means paying for server hosting, so it waits until people using the offline app ask for it, and then pays for itself. v2026.10.3 ships the app without sync: no sync screens, triggers or sync-only native modules. The sync client (`mobile/src/sync/`) and server (`web/src/sync/`) stay in the repo and in CI. Decisions 1, 3 and 4 apply when sync ships. |

## 3. Why the web app can't just be wrapped

The web app is server-first. Pages are React Server Components, writes are
Server Actions (`web/src/app/*/actions.ts`), and all data lives in Postgres
behind `web/src/db/queries.ts` and `web/src/db/mutations.ts`. A Capacitor or PWA
wrapper would stop working offline, because every screen needs a server
round trip. The mobile app needs its own local database; the domain logic
is shared through `core/` (§4).

Things in the current design that the mobile app does differently:

| Web app today | Why it can't carry over | Mobile app |
|---|---|---|
| `accounts.balance` is a stored running total, changed by `applyBalanceEffect` on every write. | If two devices each apply deltas offline and then sync, the balances conflict. Last-write-wins loses money, and replaying deltas double-counts. | Store `opening_balance` on the account; the balance is opening + the sum of `balanceDeltas()` over its ledger rows. Balances are never synced. |
| Categories are global rows created by `db:seed`. | Every device must be able to create and edit categories offline. | Per-user category rows (decision 2). |
| Money is `numeric(18,2)`, handled as JS `number`. | SQLite has no exact decimal type, so a REAL column would drift. | Integer minor units per currency (decision 5). Exchange rates are stored as TEXT. |
| Rows have no change clock, and deletes are hard deletes. | Sync needs both. | Every row carries an HLC timestamp; deletes are tombstones (§5). |
| Auth is a signed cookie; users are created with `pnpm run create-user`. | Native clients need bearer tokens; sync needs self-serve sign-up. | Token auth + sign-up on the sync server (§6). |

## 4. Repo layout and code sharing

Everything lives in this repo (`kofiad/pernce`):

```
web/      server: Hono app on Vercel and Cloudflare (@pernce/web)
core/     @pernce/core: framework-free money logic
mobile/   Expo app (@pernce/mobile)
docs/     this document, plus design references in docs/design/
```

- **`core/`** and **`web/`** are pnpm workspace packages of the root. The
  web app imports core directly; the old
  `web/src/lib/{currency,format,csv,categories}.ts`
  files re-export from it, so no web import sites changed. It holds:
  - currency list and FX conversion (`toBaseCurrency`), formatting, CSV,
    default categories
  - `resolveTransactionInput()` (every validation rule from the web app's
    `resolveTransaction`, with identical error messages) and
    `balanceDeltas()`, the one definition of how a transaction moves money
  - report math: `summarizeNetWorth`, `budgetProgress`, `categorySpend`,
    `monthlySeries`, `netWorthTrend`. Each app runs its own grouped query
    and hands the rows to these.
  - design tokens (`colors`) and per-currency money helpers
  - tests: `pnpm test` at the root
- **`mobile/`** is deliberately *not* a workspace member. Expo SDK 58 pins
  `react@19.3.0` while the web app is on `19.2.8`, and React Native breaks
  when two copies of React end up in one bundle. So `mobile/` has its own
  `node_modules`, `pnpm-workspace.yaml` and lockfile, and links core with a
  `link:` dependency.
  `mobile/metro.config.js` adds core to Metro's watch folders.
- Vercel builds with Root Directory `web` and ignores `mobile/`
  (`.vercelignore`). The web `tsc`/ESLint configs only see `web/`.
- **CI** (`.github/workflows/ci.yml`) runs on every PR and push to `main`.
  The `verify` job runs `pnpm audit`, core tests, lint, web typecheck,
  `db:verify`, and the core build; the `mobile` job runs the app's
  typecheck, lint and tests. Builds must stay warning-free (README,
  "Keeping builds warning-free"). Any new dependency with an install
  script needs an `allowBuilds` entry in the `pnpm-workspace.yaml` that
  installs it, and that includes `mobile/pnpm-workspace.yaml`, which also
  carries `overrides` (esbuild, xcode's uuid, expo-quick-actions'
  image-utils, the Expo CLI's zod) that keep its install and audit clean; the README explains
  each.
- **Releases.** All three packages share one CalVer version (bump it
  with `pnpm run version:set`) and release together. Pushing a
  `vYYYY.MM.PATCH` tag runs `.github/workflows/release.yml`, which:
  - creates a GitHub Release from the tag's `CHANGELOG.md` section
  - publishes core to GitHub Packages as `@kofiad/pernce-core`
  - attaches EAS builds of the mobile app (a production Android APK and
    an iOS simulator build) when an `EXPO_TOKEN` secret is set (§8.1)

  Releases so far (see `CHANGELOG.md` and the Releases section of the
  root README):
  - v2026.10.0 (2026-09-30): the phase 1 scaffold
  - v2026.10.1 (2026-10-01): the offline app (phase 2) and the sync
    server (phase 3), with the first mobile builds
  - v2026.10.2 (2026-10-01): a production Android APK, with reanimated
    and worklets pinned to SDK 57's versions
  - v2026.10.3 (2026-10-02): the redesigned offline app for people to
    use and test, without sync (decision 6)

  The sync client (phase 4) is merged, but not wired into the app
  (§9.4).

## 5. Sync design (end-to-end encrypted)

Built (phases 3 and 4) but not in the app yet: sync ships later as a paid
add-on (decision 6, §9.5). The design below still stands.

### 5.1 What the server stores

The server is an encrypted record store. For each user it keeps one table
of records:

| Column | Plaintext? | Purpose |
|---|---|---|
| `id` | yes | The row's UUID, created on the device |
| `collection` | yes | `account`, `transaction`, `budget`, `category`, `rate_override`, `profile` |
| `hlc` | yes | Hybrid logical clock of the last write, used for last-writer-wins |
| `deleted` | yes | Tombstone flag |
| `server_seq` | yes | Monotonic cursor for pulls |
| `key_version` | yes | Which data key encrypted it (for key rotation) |
| `ciphertext` | **no** | XChaCha20-Poly1305 encryption of the row's JSON |

The server learns how many records of each kind a user has and when they
change, but not amounts, names, notes, or dates. This metadata leak is
accepted; padding and batching could reduce it later.

### 5.2 How sync works

- `POST /api/sync/push` sends `{ records: [...] }` from the
  device's outbox. The server keeps the record with the higher HLC for each
  id and assigns `server_seq`.
- `GET /api/sync/pull?since=<server_seq>` returns every record changed
  since the cursor.
- **Merging happens on the device.** The server can't read rows, so the
  device decrypts pulled records, validates them with the same core rules
  it uses for local writes, and applies last-writer-wins per row.
  - Balances are derived from the ledger (§3), so merged ledgers can't
    produce inconsistent balances. The worst case is that an edit made on
    another device is overwritten by a later one.
  - Natural-key collisions are merged deterministically on every device.
    Examples: two devices each create "Groceries, Oct" as a budget, or each
    seed a "Groceries" category on first run. The row with the lowest UUID
    wins, and references to the loser are rewritten. Every device reaches
    the same result without the server.
- Sync runs on app start, on foreground, after a debounce following a local
  write, on pull-to-refresh, and as a best-effort background task. There's
  an outbox on the device, so a write never waits on the network.
- FX rates aren't user data. They stay plaintext on a public
  `GET /api/fx` endpoint. Hand-edited rates are per-user
  `rate_override` records, so they're encrypted like everything else.

### 5.3 Keys and recovery

- On sign-up the device generates a random 256-bit **data key**. It is
  stored on the server only in wrapped (encrypted) form:
  - wrapped with a key derived from the user's password (Argon2id). The
    server authenticates with a *separate* value derived from the same
    password, so the login hash never reveals the wrapping key.
  - wrapped again with a **recovery key**, shown once at sign-up for the
    user to save.
- A new device signs in, downloads the wrapped key, and unwraps it
  locally. The data key lives in `expo-secure-store`.
- **Forgotten password:** email reset gets the user back into the account.
  Their data can only be decrypted with the recovery key, or re-uploaded
  from a device that's still signed in (that device still holds the data
  key). Without either, the cloud copy is lost. The UI must say so plainly
  at sign-up.
- Crypto libraries: `@noble/ciphers` (XChaCha20-Poly1305, pure TS, audited)
  for records. For Argon2id, use a native module (`react-native-libsodium`)
  because pure-JS Argon2 is too slow on low-end Android. Expo Go can't
  run it, so the app needs its own development build. That build is free
  on your own machine (§8.1). (The offline release needs one anyway, for
  the home-screen shortcut.)

### 5.4 The web app and encryption (open question)

The current web app renders on the server from plaintext Postgres. With
end-to-end encryption, the server can't read synced data, so the web app
can't show it as it works today. The options:

- **A. Keep them separate for now (recommended).** Sync is between the
  user's phones only. The web app keeps working exactly as it does, with
  its own data. Moving data between them uses the existing JSON
  export/import. This needs no change to the web app, and nothing is
  thrown away.
- **B. Make the web a sync client later.** Build the Expo app for the web
  too (Expo supports web via `react-native-web`, and `expo-sqlite` has a
  web backend), decrypting in the browser. Over time that replaces the
  Next.js UI, and the Next.js app shrinks to the sync API, sign-up and FX.
  It could be done after phase 5 for roughly 5–8 days, most of it
  web-specific polish.

Both options start with A, so this doesn't block anything until after
sync ships.

## 6. Server work

This is built in this repo, next to the web app. It uses new tables only;
the web app's own tables don't change.

1. **Tables:** `sync_users` (email, login hash, verified flag, wrapped
   data keys), `sync_records` (§5.1), `sync_sessions` (hashed refresh
   tokens), `email_tokens` (verification and reset). These are separate
   from the web app's `users`, so option A needs no web migration.
2. **Sign-up and auth:** `POST /api/sync/signup`, `/verify`, `/login`
   (returns an access JWT via `jose` plus a rotating refresh token),
   `/refresh`, `/reset`. Email goes through a transactional email API
   (Gmail SMTP with an app password fits the audience). Rate limit with the existing
   limiter, plus a per-user storage quota.
3. **Sync endpoints:** `push` and `pull` (§5.2), accepting
   `Authorization: Bearer` via the sync auth middleware (`web/src/routes/sync.ts`).
4. **`GET /api/fx`:** public, cached rates from the existing daily cron.
5. **Account deletion:** required by Apple once sign-up exists.

**Estimate:** 6–8 days.

## 7. Mobile app screens (v1)

These mirror the web routes. The sync items (marked *sync*) are built
but held back until sync ships (decision 6).

- **Onboarding.** Name and base currency, optional app lock. *Sync:*
  "Use offline" or "Sign up / sign in to sync", recovery-key screen on
  sign-up.
- **Home.** Net worth in the base currency, recent activity, budget
  highlights.
- **Accounts.** List, detail, create and edit, archive; opening balance
  set at creation; amounts entered in the currency's own precision.
- **Activity.** Infinite list with filters; add and edit an expense,
  income, or transfer (cross-currency amount received / rate, and fee).
  A "quick add" flow and a home-screen shortcut are the most-used paths
  on mobile.
- **Budgets.** Monthly budgets, progress, and the FX-estimate flag.
- **Categories.** Add, rename, recolor, re-icon, reorder, archive; set
  essential vs discretionary.
- **Analytics.** Category spend, essential vs discretionary, and a
  6-month series.
- **Settings.** Profile and base currency, FX rates (auto plus manual
  override), import/export (CSV and JSON through the share sheet, including
  importing a web-app JSON backup), app lock, and delete local data.
  *Sync:* sync status, recovery key, sign out, delete the cloud account.

## 8. Stack

| Layer | Choice |
|---|---|
| App | Expo SDK 58 (React Native 0.88) + TypeScript, Expo Router (`mobile/src/app`) |
| Local DB | SQLite via `expo-sqlite` + Drizzle ORM (`drizzle-orm/expo-sqlite`, bundled migrations) |
| State | Synchronous data-layer reads (`src/data/`) re-run by a `useData` hook after any write (a tiny change feed in `src/data/changes.ts`); local component state for UI |
| Styling | `StyleSheet` with `@pernce/core` tokens; NativeWind is optional later |
| Charts | `react-native-svg` (in Expo Go; no Skia or Reanimated needed) |
| Security | `expo-local-authentication` (app lock, passcode fallback); with sync: `expo-secure-store` (data key, tokens), `@noble/ciphers` + libsodium (§5.3) |
| Files | `expo-document-picker`, `expo-sharing`, `expo-file-system` |
| Builds | Local builds by default (free, §8.1); EAS Build is optional |

### 8.1 Costs: staying free

Expo is open source and free. Nothing in this plan needs a paid service
until you publish to the app stores.

- **Development (phases 2–3):** run the app in **Expo Go**, a free app from
  the stores. Phase 2 should use only libraries that Expo Go includes
  (`expo-sqlite`, `expo-secure-store`, `expo-local-authentication`, etc.),
  and flag any dependency that would need a custom build. Known limit: Face
  ID doesn't work inside Expo Go on iOS; the app lock can fall back to the
  device passcode there.
- **Own builds (since phase 4):** `pnpm expo run:android` (Android Studio) and
  `pnpm expo run:ios` (Xcode; needs a Mac) are free; `pnpm run android|ios`
  in `mobile/` runs the same commands. EAS Build is optional:
  its free tier has a monthly build allowance, and it's mainly useful for
  iOS builds without a Mac.
- **Release builds:** the release workflow's mobile job uses EAS and
  counts against that free allowance (two builds per release). It needs
  an `EXPO_TOKEN` repo secret and an EAS `projectId` in `mobile/app.json`;
  both exist since v2026.10.1, the first release with mobile builds.
- **Server:** the offline app needs none. Once sync ships, Vercel Hobby,
  Neon free tier, and a Gmail account cover a few users; paid sync
  (decision 6) is what covers hosting past that.
- **Unavoidable when publishing (any framework):**
  - Apple Developer Program: $99 a year for TestFlight or the App Store.
    Without it, Xcode can still install on your own iPhone, but the app
    expires after 7 days.
  - Google Play: $25, once. Sideloading an APK is always free.

## 9. Phased plan

| Phase | Deliverable | Est. | Status |
|---|---|---|---|
| 0. Decisions | §2 | — | **Done**, except §5.4 (not blocking) |
| 1. Core + scaffold | `core/` with tests; web app on top of it, behaviour unchanged; Expo app in `mobile/` bundling core | 3–4 d | **Done** |
| 2. Offline app | SQLite schema and migrations, every screen in §7, per-user categories, per-currency amounts, import/export, direct FX fetch, app lock. **Shippable on its own as an offline-only app.** | 15–19 d | **Released** in v2026.10.1 (§9.1); needs on-device testing |
| 3. Sync server | §6 | 6–8 d | **Released** in v2026.10.1 (§9.2); needs Gmail SMTP env vars before real sign-ups |
| 4. Sync client | Encryption and keys, recovery key, outbox, push/pull, on-device merge, multi-device tests | 10–13 d | **Merged**, not in the app (§9.4): held back for phase 6 |
| 4b. Offline release | The app without sync, for people to use and test (decision 6) | — | **Released** in v2026.10.3; needs on-device testing |
| 5. Hardening and release | Low-end Android performance pass, accessibility, crash reporting (free tier), store listings, privacy labels, TestFlight / Play internal testing (the paid store accounts in §8.1 start here) | 4–6 d | |
| 6. Paid sync | Billing and entitlements, re-wiring the sync client, the native build with libsodium, server setup (§9.5) | TBD | Waits for user demand |
| **Remaining** | On-device testing of the offline app, then phase 5. Phase 6 when users ask for sync. | **~4–6 dev-days** before phase 6 | |

### 9.1 Phase 2 status

Merged in PR #6 (`feat/mobile-phase-2`), released in v2026.10.1:

- **Database.** `mobile/src/db/schema.ts`: profile, accounts
  (`opening_balance`), categories, transactions, budgets, `fx_rates`,
  `rate_overrides`, and a device-local `meta` table. UUID keys made on the
  device, HLC `updated_at` (core `hlc.ts`), `deleted` tombstones filtered
  from every read, money as integer minor units, rates as TEXT. Migrations
  come from drizzle-kit and are inlined into `src/db/migrations.ts`.
- **Data layer.** `mobile/src/data/` has no React Native imports. Writes
  are validated by core `resolveTransactionInput` (the destination amount
  is rounded to the destination currency). Balances are opening balance
  plus `balanceDeltas()` over a grouped ledger query. Budgets and reports
  feed SQLite grouped queries to core's report functions. It has Node
  tests (`pnpm test` in `mobile/`) that run the real
  `drizzle-orm/expo-sqlite` driver over `node:sqlite`.
- **Screens.** Every screen in §7, except the sync items (sign-up,
  recovery key, sync status, sign out, cloud account deletion) and the
  home-screen shortcut.
- **FX.** The app fetches directly from fawazahmed0 (URLs and parsing in
  core `fx.ts`, shared with the web cron), at most every 12 hours, and
  falls back to stored rates. Manual overrides win over fetched rates.
- **Import/export.** A JSON backup and a transactions CSV go out through
  the share sheet. Three formats come in through the document picker:
  - this app's JSON backup
  - the web app's JSON backup: web balances become opening balances, and
    web categories are matched by name
  - a bank CSV, matched on account and category names
  Amounts are rounded to each currency's precision, and every change is
  listed.
- **App lock.** `expo-local-authentication` with the device passcode as
  fallback. The app re-locks after a minute in the background by default
  ("Lock after": immediately, 1 or 5 minutes).

Not done in phase 2, and done in phase 4 with the development build:

- **Home-screen shortcut.** Needed a native quick-actions module that
  Expo Go doesn't include.
- **Face ID on iOS.** Expo Go couldn't use it, so the lock prompted for
  the device passcode there.

### 9.2 Phase 3 status

Merged in PR #7 (`feat/sync-server`), released in v2026.10.1. The server
is in `web/src/sync/`; the
routes in `web/src/app/api/sync/` are thin wrappers. The wire types,
limits and key-derivation contract are in `core/src/sync.ts`, so the phase
4 client uses the same definitions.

- **Tables.** Migration `0006_sync_server` adds `sync_users`,
  `sync_records`, `sync_sessions` and `email_tokens`. It adds new tables
  only. Each user has a `seq` counter that is bumped under a row lock on
  every push. That keeps one user's pushes in commit order, so a pull
  cursor can't skip a record that commits late.
- **Auth without the password.** The client derives a `master` key with
  Argon2id, then two keys from it with HMAC: an `authKey` it sends and a
  `wrapKey` it keeps. The server stores only a scrypt hash of `authKey`.
  `POST /api/sync/prelogin` returns the user's KDF salt and parameters.
  For an unknown email it returns the defaults with a stable fake salt,
  so it doesn't reveal which emails have accounts.
- **Endpoints.** These are public:
  - `prelogin`, `signup`, `verify`, `login`, `refresh`, `logout`
  - `reset` and `reset/confirm`

  These need a bearer token, which the sync auth middleware (`web/src/routes/sync.ts`) checks:
  - `GET`/`PUT keys`
  - `push` and `pull`
  - `DELETE records` (wipes the cloud copy)
  - `DELETE account` (repeats the auth key)

  Errors are `{ error, message }`. Access tokens are 15-minute JWTs
  signed with a key derived from `SESSION_SECRET`, so a web cookie can't
  pass as one, or the reverse. Refresh tokens last 60 days and rotate on
  every use. Replaying a token that was already used ends that session.
- **Email.** Codes are 6 digits, not links, so no deep-link setup is
  needed. A code lasts 15 minutes and allows 5 guesses, and a new one can
  be sent once a minute. Sign-up gives the same answer whether or not the
  email is taken: the owner of a taken address gets a "you already have
  an account" email instead.
- **Reset.** Resetting signs every device out. The password-wrapped data
  key is replaced by whatever the device sends: a re-wrap if it unlocked
  the data key with the recovery key, otherwise `null` until a device
  still holding the data key signs in and calls `PUT keys` (§5.3).
- **Merge rules.** The record with the higher HLC wins. At an equal HLC,
  the higher key version wins, so re-encrypting under a new data key can
  replace rows without inventing new writes. The server refuses records
  under any key version except the current one (`key_changed`).
- **Limits.** These are in-memory per-instance rate limits:
  - sign-in: 8 per 10 minutes per email
  - sign-up: 5 per hour per IP
  - emails: 6 per hour per address

  Also:
  - Each user can store `SYNC_QUOTA_BYTES` of ciphertext (25 MB by
    default). Deletes are always allowed.
  - Sign-ups stop at `SYNC_MAX_USERS` accounts (100 by default).
  - Each push or pull fits under Vercel's 4.5 MB limit.
  - The daily `/api/cron/sync-prune` removes week-old unverified sign-ups,
    expired sessions and expired codes.
- **FX.** `GET /api/fx` is public and cached by the CDN for an hour. It
  serves only rates the cron fetched, never hand-edited web rates.
- **Tests.** `pnpm run db:verify` now also runs `web/scripts/verify-sync.ts`
  (83 checks on PGlite). The routes were also tested end to end over HTTP
  against Postgres 17 with a production build.

Not done in phase 3:

- **Email delivery.** It needs a Gmail app password, with `SMTP_USER`
  and `SMTP_PASSWORD` set on Vercel. Until then, production answers
  sign-up and reset with a 503.
- **Changing the password while signed in.** Not in §6. A user who knows
  their password can still do it through reset.
- **Shared rate limits.** The limiters are per instance, like the web
  login's. A shared store (e.g. Upstash's free tier) matters only past
  the "few people" audience.

### 9.3 What remains

As of 2026-10-02. Phases 0–4 are merged to `main`. v2026.10.3 ships the
offline app without sync (decision 6); phase 5 hasn't started.

**On-device testing of the offline app.** On a real Android phone and a
real iPhone, using the release APK or a development build (Expo Go
can't run the app: it has no `expo-quick-actions`): every screen in §7,
import/export, the app lock with Face ID, and the "Quick add" shortcut.
Collect feedback from the first users, including whether they'd pay for
sync.

**Phase 5: hardening and release (4–6 d).** See the table above. The paid
store accounts (§8.1) start here. Without sync, the store submission is
simpler: no account sign-up (so no in-app account deletion), no
encryption to declare beyond the OS's, and "data not collected" privacy
labels.

**Phase 6: paid sync,** when users ask for it. See §9.5.

**Open, not blocking:**

- the §5.4 web-and-encryption decision, due after sync ships
- changing the password while signed in
- shared rate limits, if the audience grows
- switching the app's FX fetch to `GET /api/fx` (optional)

### 9.4 Phase 4 status

Merged in PR #13 (`feat/sync-client`), never released. For the offline
release (decision 6), the app wiring and screens were removed after
commit `a9b4fa1`, along with the sync-only native modules
(`react-native-libsodium`, `expo-secure-store`, `expo-background-task`,
`expo-task-manager`); `mobile/README.md` ("Sync") lists what to restore.
The client itself is still in `mobile/src/sync/`, has no React Native
imports, and its tests still run under `pnpm test` and in CI. As built,
`mobile/src/lib/sync.ts` wired it to native libsodium, the keychain and
the sync triggers. The rest of this section describes it as built.

- **Development build.** `react-native-libsodium` (Argon2id),
  `expo-secure-store`, `expo-background-task` and `expo-quick-actions`
  need the app's own build, not Expo Go; `expo-dev-client` and an EAS
  `development` profile are added. libsodium's install script is approved
  in `mobile/pnpm-workspace.yaml` `allowBuilds`. The phase 2 leftovers came
  with it: the "Quick add" home-screen shortcut, and Face ID for the app
  lock.
- **Keys** follow `core/src/sync.ts` exactly. The password is
  NFC-normalized before Argon2id. Wrapped keys and records are
  `nonce ‖ XChaCha20-Poly1305` (`@noble/ciphers`). A record's associated
  data is its collection and id, so the server can't swap one record's
  ciphertext for another's. The keychain holds the session, the data key,
  and the wrap key. Keeping the wrap key lets a device follow a key change
  made elsewhere without asking for the password again.
- **Recovery key.** 32 random bytes, shown as 52 Crockford base32
  characters in groups of four. Look-alike characters (O/0, I/L/1) are
  accepted. Settings → Sync can make a new one, which replaces the old.
- **Outbox without a queue.** Every local write stamps `updated_at` with
  this device's HLC, and HLCs from one node only increase. So "changed
  here since the last push" is "stamped with this node, later than the
  push mark". Rows merged from other devices carry their own node id and
  aren't pushed back. If a push fails partway, the mark doesn't move and
  the whole outbox goes again; the server ignores what it already has.
  Signing in (and any key change) pushes every local row once, which is
  how offline data reaches a new account.
- **Engine.** One run pulls pages from the cursor until `hasMore` is
  false, then pushes in batches of `SYNC_LIMITS.pushRecords`. Each page is
  applied in one SQLite transaction together with its cursor. Rows the
  device already has (its own echoes) aren't decrypted. Other behaviour:
  - Access tokens are refreshed ahead of expiry and on a 401, one refresh
    at a time.
  - A refused refresh token means the server ended the session; the app
    shows "signed out" and keeps the data key.
  - `key_changed` (from a pull's key version or a push): the device
    fetches the keys and opens the new data key with its wrap key. If that
    works it resyncs everything; otherwise it asks for the recovery key.
  - `quota_exceeded` and other errors are shown on the sync screen. The
    outbox stays, so nothing is lost.
- **Merge.** Applying a pulled row also moves the device's HLC up to it
  (HLC receive), so later local edits always sort after it.
  - **Last writer wins:** a pulled row replaces the local one only if its
    HLC is later. A tombstone is just a later write.
  - **Validation:** pulled rows go through the same rules as local
    writes. Account, category and budget checks are shared with the data
    layer. A transaction must be exactly what core
    `resolveTransactionInput` would have stored, checked against the real
    accounts when they're on the device. Invalid rows are skipped and
    counted on the sync screen.
  - **Collisions:** settled by lowest UUID on every device:
    - categories with the same kind and name. The loser's transactions and
      budgets move to the winner, including ones that arrive later.
    - budgets with the same category and month, and rate overrides with
      the same currency
    - more than one profile

    The loser becomes a tombstone stamped by the device, so the settled
    state is pushed too.
- **Triggers.** Sync runs on app start, on return to the foreground, 4
  seconds after a local write (only if the outbox has something), on
  pull-to-refresh (Home and Activity), and as an hourly best-effort
  background task. One run at a time.
- **Screens.**
  - Onboarding: "Use offline", or sign in / sign up. Signing in on a new
    phone pulls the profile and data before the app opens.
  - Sign-up: email code, a plain warning about lost passwords that must be
    acknowledged, then the recovery key (confirm it was saved).
  - Sign-in, which also finishes an interrupted sign-up with a new
    recovery key.
  - Password reset, with an optional recovery key.
  - Settings → Sync: status, last sync, pending changes, sync now, new
    recovery key, sign out, delete cloud account (asks for the password).
    When the key is missing: unlock with the recovery key, "check again"
    after another phone re-wraps it, or start over.
  - Delete local data also signs the phone out of sync.
- **Tests.** `mobile/src/sync/sync.test.ts` has 17 tests (5 for crypto, 12 for sync). They run
  several devices (each with its own SQLite database and keychain)
  against an in-memory server with the real server's merge rules, using
  real Argon2id from `libsodium-wrappers-sumo`. Covered:
  - offline data reaching a new phone, with only ciphertext on the server
  - offline edits on two phones converging with equal balances, and a
    later delete beating an earlier edit
  - two phones that each set up offline converging on one set of default
    categories, one budget per month, and one profile
  - paged pulls
  - rejection of rows that break the money rules
  - token refresh, and refresh-token replay ending the session
  - password reset with and without the recovery key
  - starting over with a new key while another phone holds offline edits
  - recovery-key rotation, interrupted sign-up, sign-out, and deleting the
    cloud account

  CI gains a `mobile` job (typecheck, lint, tests).

Not done in phase 4:

- **A native build.** The JS bundles for both platforms and `expo
  prebuild` applies every config plugin (background modes, Face ID string,
  keychain excluded from Android backup). No device build has run yet:
  this machine has no Xcode or Android SDK. `react-native-libsodium` is
  listed as untested on the New Architecture in the React Native
  Directory, though its README says it supports it. The first
  `pnpm expo run:android` will settle it.
- **FX from the sync server.** The app still fetches rates from
  fawazahmed0 directly. Switching to `GET /api/fx` was optional.
- **Changing the password while signed in.** Still done through reset.

### 9.5 Phase 6: paid sync

Not started; it waits until people using the offline app ask for sync.
What it takes:

- **Billing.** On iOS, a paid digital feature like sync has to be sold
  through Apple's in-app purchase (App Store guideline 3.1.1), and Google
  Play requires Play Billing for the same. Apple and Google take 15% (on
  the small-business programs) to 30%. A subscription fits the running
  cost. RevenueCat (free under a revenue threshold) or `expo-iap` handle
  both stores. Price it to cover Vercel, Neon and email past their free
  tiers.
- **Entitlements on the server.** The sync server must refuse push and
  pull for users without an active subscription: store the entitlement
  per `sync_users` row, set it from store receipts or webhooks (or
  RevenueCat's), and return a clear error code the app can show. What
  happens to the cloud copy after a subscription lapses (keep it for N
  days, read-only, then delete) needs deciding.
- **Re-wire the app.** Restore the removed files and native modules
  (`mobile/README.md`, "Sync"), put sign-up behind the purchase, and run
  the first native build with `react-native-libsodium` (it's listed as
  untested on the New Architecture).
- **Server setup** (minutes, from the old §9.3):
  1. Apply migration `0006_sync_server` to production:
     `DATABASE_URL="<production>" pnpm run db:migrate`.
  2. Create a Gmail app password (the account needs 2-step verification),
     then set `SMTP_USER` and `SMTP_PASSWORD` on Vercel (Production).
  3. Optionally, set `SYNC_MAX_USERS` and `SYNC_QUOTA_BYTES`. The defaults
     are 100 users and 25 MB per user.
  4. Smoke test: sign up through `POST /api/sync/signup` and check that
     the code arrives.
- **On-device testing** of sync: sign up, then sync between two phones,
  including offline edits on both, a password reset, and a lapsed
  subscription.
- **Store review** then needs what §10 lists: in-app account deletion and
  the encryption export-compliance answer.

## 10. Risks

- **Money-logic drift between web and mobile.** Mitigated by
  `core/`: both apps call the same functions, and `pnpm test` plus
  `pnpm run db:verify` cover them. CI runs both on every PR.
- **Lost keys mean lost cloud data.** This is inherent to end-to-end
  encryption. Mitigated by the recovery key, re-upload from any signed-in
  device, and the fact that every device keeps a full local copy.
- **Clock skew and iOS background limits.** The HLC plus the server cursor
  avoid trusting device clocks. Sync also runs on foreground, so
  background runs aren't required.
- **App-store review for finance apps.** Needs a privacy policy and
  accurate data-safety labels. Once sync ships it also needs in-app
  account deletion, the export-compliance answer for encryption (standard
  encryption is exempt, but it has to be declared), and store billing for
  the subscription (§9.5).
- **Nobody pays for sync.** Then it stays out, and the server costs
  nothing. Users can still move data between phones with the JSON
  export/import.
