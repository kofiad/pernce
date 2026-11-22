# Built with Claude Code

Pernce was built with Claude Code as a main collaborator, and I'd rather say so than have you guess. I didn't want to spend hours on tutorials. I had a real need, a way to track money across several currencies while I travel for work, so the question became: how do I use the tools available to solve it? Pernce is the answer, and learning Claude Code was part of the point.

The fair question is whether the result is AI slop. This page doesn't ask you to take my word for it: it lists what the repo itself shows about how the agent is steered and checked, so you can verify each claim.

## How the repo steers the agent

The agent starts every session from instructions checked into the repo. You can read them and judge them.

- **Root [`CLAUDE.md`](../CLAUDE.md)** describes the three packages (`web/`, `core/`, `mobile/`), the commands, the architecture, and a "Rules" section. Rules that stand out:
  - Ask clarifying questions up front, in one batch, before writing code, unless the request leaves nothing open.
  - Never commit or push without explicit approval, every time; approval for one commit does not carry over to the next.
  - Keep work local: ask before creating, publishing or uploading anything to an external service.
  - Versions are bumped only with `pnpm run version:set`, never by hand.
  - Builds must stay warning-free (see "Keeping builds warning-free" in `docs/development.md`).
  - `docs/design/` is the single source of truth for design; when code and the docs disagree, the docs win. Design work happens in place there.
  - `mobile/src/data/` and `mobile/src/sync/` must stay free of React Native and Expo imports so their tests run in plain Node.
- **[`web/AGENTS.md`](../web/AGENTS.md)** (`web/CLAUDE.md` just includes it) holds the server rules: D1 compatibility (no interactive transactions, all-or-nothing writes through `runBatch()`, inserts under 100 bound parameters), no globals for config or the database, the same API on both hosts, and which dependencies must be production dependencies.
- **[`mobile/AGENTS.md`](../mobile/AGENTS.md)** tells the agent not to trust its training data for Expo APIs and to read the versioned docs first, to use `pnpm expo install` rather than `pnpm add`, never to hand-edit the generated `ios/` and `android/` folders, and to run lint and typecheck before declaring a task done.

The Claude Code features I leaned on most were plan mode, subagents, skills and MCP servers. Skills and `CLAUDE.md` together are what made Claude do what I needed, when and how I needed it.

## Guardrails

Instructions are only requests. These are the checks that don't depend on the agent remembering them.

**CI** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs on every pull request and on pushes to `main`, and a release tag runs it again before releasing. The `verify` job runs `pnpm audit`, core tests, lint, the web typecheck and build, the web tests, `db:verify` (in-memory libSQL), `db:verify:d1` (a local Cloudflare D1), the Worker dry-run bundle, and the core build. It also checks that package versions match the tag and that the CHANGELOG has a section for it. The `mobile` job runs typecheck, lint, tests, and builds both web exports, failing if the store (offline-only) export contains the personal variant marker.

**Tests**, counted by grepping `it(`/`test(` calls and `check(` calls in the files below:

| Package | Where | Count |
| --- | --- | --- |
| core | `core/src/*.test.ts` (one file per module) | 31 tests |
| web | `web/test/*.test.ts` (HTTP tests, Worker handlers on local D1) | 62 tests |
| web | `web/scripts/sync-checks.ts` (run on libSQL and on D1) | 87 `check(...)` calls |
| mobile | `mobile/src/**/*.test.ts` (7 files, on `node:sqlite`) | 69 tests |

These are counts of test declarations, not a coverage figure.

**Lint rules that encode architecture**, so a violation fails the build rather than relying on review:

- `web/eslint.config.mjs` bans `.transaction(` calls: "D1 has no interactive transactions: use runBatch() from src/db/batch.ts."
- `mobile/eslint.config.js` restricts imports of the sync wiring and its native modules: "Personal build only: reach the sync wiring through syncApp() (src/lib/syncFeature.ts)." This keeps the store build, which ships offline-only, from linking sync.

**Release cadence.** [`CHANGELOG.md`](../CHANGELOG.md) has six releases from 2026.10.0 (2026-09-30) to 2026.11.0 (2026-11-19), each with its own section.

## What I learned

**Who did what.** I made most of the product decisions myself. Claude did most of the execution, and I reviewed the work it did.

**How a feature went.** Plan first, then build. Because I planned before executing, and `CLAUDE.md` makes Claude ask its clarifying questions up front, there was very little back and forth: three rounds at most.

**What went wrong.** Sometimes Claude went off on a tangent and did things I hadn't asked for. That's why the guardrails exist: ask first, no commit or push without my approval each time, keep work local, and the architecture rules that lint enforces.

**How I check the work.** All of it: I read the diffs, the tests and CI run on every change, and I use the app myself every day. So far it hasn't cost me any money beyond registering the domain, and the guardrails kept my data safe.

**What surprised me.** How good the code Claude Code writes is. The quality impressed me.

**What I'd do differently.** Plan in even more detail up front, to cut the back and forth further.

**My advice.** Read the code and understand what's going on. Don't trust the AI blindly.

**For the record.** The first release, 2026.10.0, shipped on 2026-09-30. I've used Pernce daily since September 2026, and the repo went public in November 2026. Hosting runs on free tiers (Vercel Hobby, Turso, Cloudflare), so the only cost has been the domain.

## Try it yourself

The most reusable part of this repo is not the app, it is [`CLAUDE.md`](../CLAUDE.md). Copy it and keep what applies: the "Rules" section (clarifying questions, approval before commits, keeping work local) works in any repository, and the architecture rules that lint can enforce are better encoded as lint, as `web/eslint.config.mjs` does for D1. If you find something in this repo that looks like unreviewed generated code, please open an issue.
