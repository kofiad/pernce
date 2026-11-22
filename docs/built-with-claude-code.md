<!-- DRAFT: not linked from README until the OWNER placeholders are filled. -->

# Built with Claude Code

Pernce was built with Claude Code as a main collaborator, and I'd rather say so than have you guess. <!-- OWNER: One or two sentences in your own words: why you built Pernce this way, and that learning Claude Code was part of the goal. e.g. "I wanted to learn Claude Code on something real, not a toy, so I picked a project I would use myself." -->

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

<!-- OWNER: Which Claude Code features did you use (plan mode, subagents, skills, hooks, MCP servers, /code-review)? e.g. "Plan mode for anything touching the sync protocol; a skill for design work." -->

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

<!-- OWNER: What did you do yourself, and what did you delegate to Claude Code? e.g. "I made the product and data-model decisions; Claude wrote most of the first drafts of screens and tests." -->

<!-- OWNER: Walk through one typical feature from idea to merged. e.g. "Idea, clarifying questions, plan, implementation, tests, my review of the diff, approved commit." -->

<!-- OWNER: What did Claude get wrong, what did you have to correct, and which CLAUDE.md or AGENTS.md rules grew out of those corrections? e.g. "The Expo warning in mobile/AGENTS.md exists because it suggested APIs that had been renamed." -->

<!-- OWNER: How do you verify AI-written code before trusting it? e.g. "Read every diff, run the full CI command list locally, test on a device." -->

<!-- OWNER: What surprised you? -->

<!-- OWNER: What would you do differently? -->

<!-- OWNER: What advice would you give someone starting with Claude Code? -->

## Try it yourself

The most reusable part of this repo is not the app, it is [`CLAUDE.md`](../CLAUDE.md). Copy it and keep what applies: the "Rules" section (clarifying questions, approval before commits, keeping work local) works in any repository, and the architecture rules that lint can enforce are better encoded as lint, as `web/eslint.config.mjs` does for D1. If you find something in this repo that looks like unreviewed generated code, please open an issue.
