# Security policy

Pernce stores people's financial records, and its optional sync is
end-to-end encrypted. Security reports are very welcome.

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion for a
vulnerability.**

Report it privately through GitHub instead:
[**Report a vulnerability**](https://github.com/kofiad/pernce/security/advisories/new)
(the repository's Security tab → "Report a vulnerability"). Only the
maintainers can see the report.

Please include:

- what is affected (app, sync server, `@pernce/core`) and which version or
  commit,
- the steps or a proof of concept to reproduce it,
- what an attacker could do with it, and any fix you'd suggest.

## What to expect

- An acknowledgement within 7 days.
- An assessment, and a plan or a fix, as soon as we can. We'll keep you
  updated in the advisory.
- Credit in the advisory and the CHANGELOG when the fix ships, unless you'd
  rather stay anonymous.

Please give us a reasonable time to release a fix before disclosing
anything publicly. We'll agree a date with you.

## Supported versions

Only the latest release (and `main`) gets security fixes. Pernce uses
calendar versions (`YYYY.MM.PATCH`); see [CHANGELOG.md](CHANGELOG.md).

## Scope

In scope:

- **Sync encryption and accounts**: anything that lets the server, or
  anyone else, read or tamper with synced data, bypass authentication,
  recover a user's keys, or take over an account (`mobile/src/sync/`,
  `web/src/sync/`, `core/src/sync.ts`; design in
  [`docs/mobile-scope.md`](docs/mobile-scope.md) §5–6).
- **The server** (`web/`): the API, crons, rate limits and quotas.
- **The app** (`mobile/`): local data exposure, the app lock, import and
  export (CSV/backup) parsing.
- **Money logic** (`core/`) bugs that silently corrupt balances.

Out of scope:

- Instances you or others host, and their configuration (secrets, TLS,
  database access); report those to whoever runs them.
- Attacks that need an already unlocked, compromised or rooted device.
- Denial of service by flooding requests, and missing best-practice headers
  with no demonstrated impact.
- Vulnerabilities in dependencies with no exploitable path in Pernce (do
  tell us if there is one).
