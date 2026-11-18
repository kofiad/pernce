# Contributing to Pernce

Thanks for helping. Pernce is a small, offline-first, multi-currency
finance app, so changes are judged on correctness first (money must add
up), then simplicity.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Found a security problem? Don't open an issue; see [SECURITY.md](SECURITY.md).

## Before you start

- **Bugs**: open an issue with steps to reproduce, unless it's a small,
  obvious fix you can send straight as a PR.
- **Features, UI changes, schema or sync changes**: open an issue first and
  agree the approach before writing code. It saves you redoing work.
- **Design changes** start in [`docs/design/`](docs/design/): the design
  doc and the artboard are the source of truth for colours, type, spacing
  and components on every platform. Code ports them; when they disagree,
  the docs win.

## Setup

You need Node 22 and pnpm (the version in `packageManager`; `corepack
enable` picks it up). The repo has three packages; see the
[README](README.md) for the full tour.

```bash
pnpm install              # root workspace: core + web
cd mobile && pnpm install # mobile is its own workspace with its own lockfile
```

Read the package guide before touching a package:
[`web/AGENTS.md`](web/AGENTS.md), [`mobile/AGENTS.md`](mobile/AGENTS.md)
and [`mobile/README.md`](mobile/README.md). They're written for people
and for coding agents alike.

## Checks

CI runs all of these on every PR; please run the ones for what you
changed before pushing.

```bash
# from the repo root
pnpm test                            # core
pnpm run lint
pnpm --filter @pernce/web typecheck
pnpm --filter @pernce/web build
pnpm run test:web                    # server HTTP tests (and Worker on local D1)
pnpm run db:verify                   # sync server checks (libSQL)
pnpm run db:verify:d1                # the same on local D1

# from mobile/
pnpm run typecheck
pnpm run lint
pnpm test
```

Add or update tests with your change: core logic in `core/src/*.test.ts`,
the mobile data and sync layers in `mobile/src/**/*.test.ts` (plain Node,
on `node:sqlite`), the server in `web/test/`.

## Rules worth knowing

These come up most in review. The full list is in the package guides.

- **Money is integer minor units** per currency (`toMinor` / `fromMinor` in
  `core`). Convert only at the UI edges; never do money maths in floats.
- **Mobile balances are never stored**: they're derived from the opening
  balance and the transactions. Every read filters out `deleted` rows, and
  writes go through core's `resolveTransactionInput`.
- **Keep `mobile/src/data/` and `mobile/src/sync/` free of React Native and
  Expo imports**; their tests run in plain Node.
- **Sync stays out of the store build.** App code reaches it only through
  `syncApp()` in `mobile/src/lib/syncFeature.ts` (ESLint enforces it).
- **The server schema must stay D1-compatible**: no `.transaction(` (use
  `runBatch()`), and keep inserts under 100 bound parameters (`chunkRows()`).
- **Dependencies**: in `mobile/`, add them with `pnpm expo install <pkg>`,
  never plain `pnpm add`. Declare every package a file imports in that
  package's own `package.json` (pnpm doesn't hoist). Anything the server
  needs at runtime or to build goes in `web`'s `dependencies`.
- **Builds stay warning-free**; see "Keeping builds warning-free" in the
  README.
- **Schema changes**: after editing a schema, run `pnpm run db:generate` in
  that package and commit the generated migrations.
- **`mobile/ios` and `mobile/android` are generated**; configure native
  behaviour through `app.json` plugins.
- **UI text**: add strings to both `mobile/src/i18n/en.ts` and `fr.ts`, and
  use `showAlert()` rather than `Alert.alert` so messages show on the web.

## Pull requests

- Branch from `main` and keep each PR to one change.
- Start the title with the area it touches, as in the history:
  `mobile: …`, `web: …`, `core: …`, `design: …`, `docs: …`, `ci: …` (or
  several, `core, mobile: …`).
- Add a line to `CHANGELOG.md` under **Unreleased** for anything users or
  self-hosters will notice. Write it for them, not for developers.
- **Don't bump versions**; maintainers do that when releasing
  (`pnpm run version:set`).
- UI changes: include screenshots in light and dark mode (and a wide web
  screenshot if the web layout changes).
- Fill in the PR template's checklist.

## License

Pernce is licensed under the [Apache License 2.0](LICENSE). Unless you say
otherwise, anything you submit for inclusion is licensed under the same
terms, as section 5 of the license describes; you don't need to sign
anything. Make sure you have the right to contribute what you send, and
mark anything that comes from somewhere else, with its license.

The Pernce name and icon aren't covered by the code license; see
[TRADEMARKS.md](TRADEMARKS.md).
