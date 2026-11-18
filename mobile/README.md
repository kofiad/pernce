# Pernce mobile

The offline-first iOS/Android app. Scope and plan: `../docs/mobile-scope.md`
(phase 2 status in §9.1).

This is an Expo (SDK 58) app with Expo Router; screens live in `src/app/`.
Shared money logic comes from `../core` (`@pernce/core`), linked
with a `link:` dependency rather than the root pnpm workspace so this app
keeps its own React version (see the scope doc, §4).

```bash
cd mobile
pnpm install
pnpm expo run:android  # or run:ios (Xcode, Mac only): builds and installs the dev build
pnpm expo start        # later runs: the dev build connects to this
pnpm run typecheck     # app + Node test code
pnpm run lint
pnpm test              # data-layer and sync-engine tests in Node
```

Add dependencies with `pnpm expo install <package>`, not `pnpm add`, so
you get versions that match the Expo SDK. `AGENTS.md` has more Expo
conventions.

## Development build (not Expo Go)

The app uses a native module that Expo Go doesn't include, so it runs as
its own development build:

- `expo-quick-actions`: the Expense / Income / Transfer home-screen
  shortcuts (long-press the app icon).

Building it on your own machine is free: `pnpm expo run:android` needs
Android Studio, and `pnpm expo run:ios` needs Xcode on a Mac. Without
those, `eas build --profile development` builds one in the cloud (counts
against the EAS free allowance). The dev build gets Face ID for the app
lock, which Expo Go couldn't.

`ios/` and `android/` are generated (`pnpm expo prebuild`) and never
committed; native settings live in `app.json` plugins.

### App ID, EAS project and the old name

The native ID (iOS bundle ID and Android package) is `com.pernce.app`.
Until 2026.11 it was `com.kofiad.perance`; a different ID is a different
app, so builds with the new ID install next to an old copy rather than over
it. To move your data, export a backup in the old app (Settings → Your data
→ Export backup), then import it in the new one (Import JSON backup), or
sign in to sync in the new app and let it pull. To keep upgrading an old
copy in place instead, build with `APP_ID=com.kofiad.perance`.

A fork you publish needs its own identity (`TRADEMARKS.md`). Set it without
editing `app.json`, in the shell or `mobile/.env.local` (`.env.example`):
`APP_ID` (bundle ID and package), `EAS_OWNER` (your Expo account) and
`EAS_PROJECT_ID` (from `eas init`); `app.config.ts` checks their format and
stops the build on a bad value.

The app was renamed from Perance to Pernce earlier (display name, slug and
scheme `pernce`). Copies installed under the old ID keep their data in
`perance.db` when that file exists (`src/db/databaseName.ts`; fresh
installs use `pernce.db`), and the background task keeps the name
`perance-sync`, so an old copy built with its old ID still upgrades in
place. Sync
secrets moved to `pernce.sync.*` keychain keys and the server's sync tables
were emptied (owner procedure: `docs/web-deployment.md`, "Upgrading to the
Pernce rename"): after upgrading, the app drops its stale sync bookkeeping
(local data stays) and you register sync again. Exporting a backup first is
a sensible precaution; backups from before the rename still import.
`app.json` has no EAS `projectId`: run `pnpm dlx eas-cli@latest init` once
in `mobile/` to create the project and commit the `extra.eas.projectId` it
adds, before building with EAS.

### Installing on an iPhone without SideStore

`TEAM_ID=<team id> pnpm run ios:device` builds a Release app signed with a
free Apple ID (add it in Xcode > Settings > Accounts) and installs it on
the connected iPhone. SideStore installs apps as `<bundle id>.<team id>`,
so the script signs with that same ID: it updates a SideStore-installed
copy in place and keeps its data. The team ID is the suffix shown by
`xcrun devicectl device info apps --device <udid>`. A free signature
lasts 7 days; rerun the script to refresh it.

## Sync (personal build only)

The store app ships offline-only for now. Sync will be an optional, paid
feature (scope doc §2, §9). Until then it's in the **personal build**,
which syncs with a server you run (`web/`). `SYNC_URL` is the server new
sign-ins start with. Without it, the web build uses the page's own origin
and phones ask for the address on the sign-in screen; either way, "Change"
on that screen picks another server for that device. Set it in the shell,
or once in `mobile/.env.local` (copy `.env.example`), which Expo reads for
every command, native builds included. The build stops if it isn't an
`http(s)` address:

```bash
SYNC_URL=https://sync.example.com TEAM_ID=JMM68997D7 pnpm run ios:device:personal   # APP_VARIANT=personal
```

It keeps the store build's bundle ID, so it installs over it and keeps the
data on the phone; turning sync on uploads it. `app.config.ts` decides
what each variant gets:

- **personal**: the sync native modules (`react-native-libsodium`,
  `expo-secure-store`, `expo-background-task`, `expo-task-manager`) and
  their config plugins, and `extra.syncUrl` when `SYNC_URL` is set.
  `plugins/withLibsodiumBridgeProxy.js` applies an upstream fix to
  `react-native-libsodium` 1.7.0, whose iOS code doesn't compile on React
  Native 0.88 (it used `RCTCxxBridge`); drop it once a release has the
  fix.
- **store** (the default): the same modules are installed, but
  `plugins/withoutSyncModules.js` excludes them from autolinking in the
  generated Podfile and settings.gradle, so they aren't in the binary.

Switching variants needs `pnpm expo prebuild --clean` (the device script
does it). Pass `APP_VARIANT=personal` to EAS builds the same way.

In code, `src/lib/syncFeature.ts` says whether sync is on (`syncEnabled`)
and loads the wiring with `syncApp()`. Nothing else may import the wiring
or its native modules (ESLint enforces it), because the store build
can't load them. The wiring:

- `src/lib/sync.ts`: native crypto, keychain storage, the API client and
  when to sync; `src/lib/backgroundSync.ts`: the background task
- `src/lib/syncApp.ts`: what screens use, loaded only via `syncApp()`
- `src/components/Sync*.tsx`, `useSyncRefresh.tsx`: the sync screens
  (English only for now), the Settings group, onboarding sign-in and
  pull-to-refresh

The sync logic is in `src/sync/` and, like `src/data/`, has no React
Native imports, so it's safe to import anywhere:

- `crypto.ts`: key derivation, XChaCha20-Poly1305, recovery keys
- `api.ts`: the HTTP client; refreshes tokens
- `engine.ts`: one sync run (pull, merge, push)
- `merge.ts`: last writer wins, and collision settling
- `outbox.ts`: which local rows still need pushing
- `account.ts`: sign-up, sign-in, reset, recovery
- `state.ts`: sync bookkeeping in `meta`

## Web

The personal build also runs in a browser, as the web app: same screens,
same data (it signs in to sync and decrypts locally). Below 768px wide it
is the phone layout; from 768 the tab dock becomes a rail, and from 1024 a
sidebar, with wide pages and sheets as dialogs (`docs/design/`, Responsive
Behavior; `src/lib/layout.ts`). Phones always get the phone layout: the
wide layouts depend only on the browser's width, never on the variant.

```bash
APP_VARIANT=personal SYNC_URL=http://localhost:3000 pnpm expo start --web   # dev server
APP_VARIANT=personal pnpm expo export -p web      # static build in dist/
```

The sync server hosts the personal build: its Vercel build runs the export
into `web/public/` (`pnpm --filter @pernce/web build:app`) and serves it
at <https://pernce.vercel.app>, next to the API, with an SPA fallback and
the headers below (`web/vercel.json`; the local Node server,
`web/src/web-app-files.ts`, does the same). So the hosted app syncs with
its own origin (`window.location.origin`, `src/lib/syncFeature.ts`), and
needs no CORS. The dev server is on another port: point it at the server
with `SYNC_URL`, and the server allows its origin with `ALLOWED_ORIGINS`
(`web/.env.example`). README.md, "Local setup", has both, and the
production-like check.

The **store** build's web export is the public app at <https://pernce.com>:
`pnpm --filter @pernce/web build:store-app` (no `APP_VARIANT`, so
`extra.variant` is `"store"`, `syncEnabled` is false, `syncApp()` is never
called, and the sync routes just redirect to Settings) writes it into
`web/public-store/` with the same PWA files, plus `_headers` with the
headers below. A Cloudflare Workers static-assets Worker serves it
(`web/wrangler.app.jsonc`, SPA fallback). The sync wiring is still in the
JavaScript bundle (Metro can't drop a `require` behind a runtime flag) but
never runs. It is offline-only: when sync goes public, build it with
`APP_VARIANT=personal SYNC_URL=https://api.pernce.com` instead (the API
Worker allows `https://pernce.com` by CORS; `web/wrangler.jsonc`).

What differs on web:

- **Database**: expo-sqlite runs SQLite as WebAssembly in a worker. Its
  synchronous API needs `SharedArrayBuffer`, so pages must be cross-origin
  isolated (`Cross-Origin-Embedder-Policy: require-corp`,
  `Cross-Origin-Opener-Policy: same-origin`; `web/vercel.json`,
  `web/cloudflare/_headers` and the Node server send them, and `metro.config.js` adds them to the dev server). Each
  synchronous call spins the page's main thread until the worker answers,
  and with the database in OPFS that deadlocks in Safari (the worker's OPFS
  write waits on the spinning main thread). So `src/db/client.web.ts`
  keeps the database **in memory** and saves the whole file to IndexedDB
  (`src/db/webStore.ts`) 300 ms after each change, every 2 s if something
  changed without notifying, and when the page is hidden; it loads it from
  there at start. A tab killed within those 300 ms loses that change.
  Databases from before this lived in OPFS (`expo-sqlite/`, wa-sqlite's
  AccessHandlePoolVFS); the first start reads that file straight from the
  pool files (`src/db/legacyPool.ts`, without SQLite), moves it to
  IndexedDB and deletes the pool. If it has unfinished changes (a hot
  journal) or fails `quick_check`, the app starts empty instead: sign in
  to sync again. expo-sqlite's worker still creates an empty pool at
  start; nothing uses it. One tab at a time: a Web Lock (`pernce-db`);
  a second tab says so and takes over when the first one closes.
- **expo-sqlite 58 timeout**: a synchronous call gives up after
  1,000,000 spins (about 16 ms in Chromium), so slow queries and writes
  threw "Sync operation timeout". `metro.config.js` swaps in 58's
  `WorkerChannel.ts` with a 10-second deadline instead
  (`patches/expo-sqlite/`). The page is frozen while a call waits, so
  after a timeout every call fails at once ("The database stopped
  responding. Reload the page.") until the worker answers the stuck one.
  Remove both once expo-sqlite times out by the clock.
- **1 MB per synchronous call**: on web one call returns at most about
  1 MB (a few thousand transactions), and 58 can't raise it. Reads that
  grow with the history (the outbox, the JSON and CSV exports) go through
  `allPages()` in `src/data/db.ts`, 200 rows per call; anything new that
  can return a whole table should too.
- **Sync**: keys and session live in `localStorage` (signed in on this
  browser). The database and keys belong to the origin: on another origin
  (e.g. the old pernce-app.vercel.app) the app starts empty and signs in
  again; Argon2id comes from `libsodium-wrappers-sumo`; no background
  task, so it syncs while the page is open.
- **Wide screens**: `useLayout()` (`src/lib/layout.ts`) says which
  navigation applies and how wide the page is. `Screen` pads and caps
  wide pages (`narrow` for settings-style ones) and turns a `sheet` into a
  `Dialog`; `ChoiceSheet` becomes a choice dialog; `Actions` inside a
  dialog move to its footer; `HScroll` rails wrap. The modal routes use
  `transparentModal` on wide screens, so the page they opened from stays
  under the dialog. Hover is a `--hover` tint (`hoverTint()`), and
  keyboard focus is a `:focus-visible` ring injected by `useFocusRing()`.
- **PWA** (install on an iPhone, no 7-day sideload refresh): in Safari open
  https://pernce.vercel.app, Share, "Add to Home Screen". It then runs
  standalone with its own storage, which iOS doesn't expire after a week
  of disuse like Safari tabs. `scripts/pwa.mjs` (run by `build:app` after
  the export) adds the manifest and iOS tags (`public/manifest.webmanifest`,
  icons in `public/`) to `index.html` and writes `sw.js`, which precaches
  the whole export so the app launches offline. A new build installs in
  the background and takes over the next time the app is opened
  (`src/lib/pwa.ts` registers it and asks for persistent storage). The
  home-screen app and Safari don't share data: sign in again in the
  installed app. Production only; the dev server has no `sw.js`.
- **No app lock** (no Face ID in a browser), **no quick actions**; export
  downloads the file; `showAlert()` (`src/lib/alert.ts`) uses the browser's
  dialog because React Native Web's `Alert` does nothing.

## Layout

```
src/app/         screens (Expo Router). (tabs)/ is Home, Activity,
                 Accounts, Budgets and Analytics; the rest are stack screens
                 and modals.
src/components/  UI kit (design tokens from core), inputs, charts
                 (react-native-svg), transaction row, lock screen
src/lib/         app-side helpers: useData hook, theme, formatting,
                 app lock, share and document picker, useT
src/i18n/        UI strings: en.ts is the source, fr.ts must match its
                 shape; error translation and locale-aware dates
src/data/        the data layer: plain synchronous functions over Drizzle,
                 with no React Native imports
src/sync/        the sync client (wired in only in the personal build; see
                 Sync above), also React Native-free
src/db/          schema.ts, generated migrations.ts, and client.ts (opens
                 expo-sqlite)
drizzle/         SQL migrations generated by drizzle-kit
```

## Data rules

- **Money** is stored as integer minor units in each currency's own
  precision: cents for USD, centimes for XOF/XAF (core `toMinor` /
  `fromMinor`). Builds before 2026.10.5 stored whole francs; migration
  0002 converts a device's rows, and sync payloads and mobile backups
  without the newer marker are scaled on the way in (core
  `legacyMinorFactor`). The UI converts only at the edges: amount fields go
  through `parseAmountInput`, and display goes through `formatAmount`.
  Exchange rates are stored as TEXT.
- **Balances** are never stored. An account's balance is
  `opening_balance` plus core `balanceDeltas()` summed over its
  non-deleted transactions (`src/data/accounts.ts`).
- **Writes** go through core `resolveTransactionInput`, so the rules and
  error messages match the web app.
- **Sync-ready rows:**
  - UUID keys, generated on the device
  - an `updated_at` holding an HLC string (core `hlc.ts`)
  - a `deleted` tombstone; every read filters `deleted = 0`

## Changing the schema

Edit `src/db/schema.ts`, then:

```bash
pnpm run db:generate   # drizzle-kit generate + inline into src/db/migrations.ts
```

Commit the new `drizzle/*.sql` file, the updated `drizzle/meta/`, and
`src/db/migrations.ts`. The app applies migrations on launch, and the
tests run the same migrations.

## Tests

`pnpm test` runs `src/**/*.test.ts` with Node's test runner. The tests use
the app's own `drizzle-orm/expo-sqlite` driver and migrations on top of
Node's built-in SQLite (`src/data/test-utils.ts`), so there's no device
and no native test dependency. Keep `src/data/` and `src/sync/` free of
React Native and Expo imports so they stay testable this way.

The sync tests (`src/sync/sync.test.ts`) run several "phones", each with
its own database and keychain, against an in-memory stand-in for the
server (`src/sync/test-server.ts`). They use the real Argon2id from
`libsodium-wrappers-sumo` (a dev dependency). CI runs all of this in the
`mobile` job.

## Checking a build without a device

```bash
EXPO_OFFLINE=1 CI=1 pnpm expo export --platform android --platform ios --output-dir /tmp/pernce-export
```
