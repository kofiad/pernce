# Sync design

Pernce's optional cloud sync is end-to-end encrypted: the server stores
ciphertext it cannot read, and every device encrypts, decrypts and merges
for itself. This page describes how it works today. The wire types and
limits live in `core/src/sync.ts`; the server in `web/src/sync/` and
`web/src/routes/sync.ts`; the client in `mobile/src/sync/`.

Sync exists only in the **personal build** (`APP_VARIANT=personal`,
`mobile/app.config.ts`). The store build ships offline-only and doesn't link
sync's native modules; app code reaches sync only through `syncApp()` in
`mobile/src/lib/syncFeature.ts`. See `mobile/README.md`, "Sync".

## Threat model and what the server sees

The design protects the **contents** of your data (amounts, names, notes,
dates, and the relations between rows) from the server operator, a database
leak and anyone reading the network. It does not hide that you use sync, how
much, or when.

What the server stores (`web/src/db/schema.ts`):

- Per account (`sync_users`): email, a hash of the auth key (see "Keys"), the
  KDF parameters and salt, the two wrapped copies of the data key, the key
  version, a sequence counter, the stored byte total, the creation time and
  whether the email is verified.
- Per record (`sync_records`): the row's UUID, its collection name
  (`account`, `transaction`, `budget`, `category`, `rate_override`,
  `profile`), the HLC timestamp, the tombstone flag, a server sequence
  number, the key version, the ciphertext, its length, and a server-side
  `updated_at`.
- Per signed-in device (`sync_sessions`): a SHA-256 of the refresh token,
  the previous token's hash, an optional device name sent by the app,
  creation, last-used and expiry times.
- Pending emailed codes (`email_tokens`): an HMAC of the code, attempt count,
  expiry.

So the server learns who has an account, how many records of each kind they
have and how large each is, when they change (the HLC embeds the writing
device's wall-clock time and a device node id, and `updated_at` is the
server's own), and when devices sign in. It does not see plaintext amounts,
names, notes or dates. This metadata leak is accepted; padding and batching
could reduce it later.

What it does not protect against:

- **Code the server serves.** On the personal web build the server that
  stores your ciphertext also serves the JavaScript that does the
  encryption, so a compromised server could ship code that captures your
  password. The store web build is static and has no sync. On phones the
  code comes from the app you installed.
- **A compromised device or browser profile.** The data key and wrap key are
  kept in the platform keychain (`expo-secure-store`, device-only and
  readable after first unlock, `mobile/src/lib/sync.ts`). On the web there is
  no keychain: they are stored in the browser's `localStorage`, readable by
  anyone with that browser profile.
- **A weak password.** The auth key and wrap key derive from it (Argon2id
  slows guessing but doesn't prevent it). The client only requires 10
  characters (`MIN_PASSWORD_LENGTH`, `mobile/src/sync/account.ts`); the
  server never sees the password so cannot enforce more.
- **Someone who controls your email.** They can request a reset and sign in
  with a new password. They still can't decrypt without the recovery key or a
  device that holds the data key, but they can delete the cloud copy
  (`DELETE /api/sync/records`) or replace the wrapped keys, so that is an
  availability risk.

Foreign exchange rates are not user data. They stay plaintext on the public
`GET /api/fx`; hand-edited rates are per-user `rate_override` records and are
encrypted like everything else.

## Keys

Code: `mobile/src/sync/crypto.ts` (client), `core/src/sync.ts` (contract).

```text
master     = Argon2id(NFC(password), kdf.salt, kdf.opsLimit, kdf.memLimit)  -> 32 bytes
authKey    = HMAC-SHA256(master, "pernce-sync-auth")    sent to the server
wrapKey    = HMAC-SHA256(master, "pernce-sync-wrap")    stays on the device
dataKey    = 32 random bytes, made once on sign-up
recoveryKey = 32 random bytes, shown once
wrappedKeyPassword = seal(wrapKey, dataKey)
wrappedKeyRecovery = seal(recoveryKey, dataKey)
record ciphertext  = seal(dataKey, JSON of the row)
seal(key, data)    = nonce (24 random bytes) || XChaCha20-Poly1305(key, nonce, data, aad)
```

- **Argon2id** defaults (`DEFAULT_KDF_PARAMS`): 3 passes (`opsLimit`) over
  64 MiB (`memLimit`), with a random 16-byte salt per account. The server
  accepts `opsLimit` 1 to 10 and `memLimit` 8 MiB to 1 GiB
  (`KDF_LIMITS`). It runs in native libsodium on phones
  (`react-native-libsodium`, `mobile/src/lib/syncCrypto.ts`) and in libsodium's
  WebAssembly build on the web (`syncCrypto.web.ts`). Everything else is
  pure TypeScript (`@noble/ciphers`, `@noble/hashes`).
- **Why two derived keys.** The server authenticates with `authKey`, a value
  separate from `wrapKey`, so what the server holds never unwraps the data
  key. The server doesn't store `authKey` either: it stores a scrypt hash of
  it (`web/src/lib/password.ts`, N=16384, r=8, p=1), so a leaked table is not
  directly usable to sign in.
- **Associated data.** Each record is sealed with the associated data
  `"<collection>/<id>"`, so the server can't swap one record's ciphertext
  for another's without decryption failing. Both wrapped keys use the fixed
  associated data `"pernce-data-key"`.
- **Recovery key.** The 32 random bytes are shown as 52 Crockford base32
  characters in groups of four, and used directly as the wrapping key (no
  KDF, since they are already random). The parser accepts any case, spaces or
  dashes, and the look-alikes O/0 and I/L/1. A new recovery key can be made at
  any time; the old one then stops working (`newRecoveryKey`).
- **Key versions.** `keyVersion` identifies which data key encrypted a
  record. It starts at 1 and only moves when a device "starts over" (below).

## Sign-up, verification and sign-in

Code: `web/src/sync/accounts.ts`, `web/src/routes/sync.ts`,
`mobile/src/sync/account.ts`.

1. **Sign-up** (`POST /api/sync/signup`). The device makes the keys and sends
   the email, `authKey`, KDF parameters and both wrapped keys. The server
   creates an **unverified** account and emails a 6-digit code. Nothing is
   stored on the device until the code is confirmed.
2. **Verify** (`POST /api/sync/verify`). The code is checked and consumed, the
   account becomes verified, and the response signs the device in. Codes
   expire after 15 minutes (`CODE_TTL_MS`), allow 5 guesses
   (`CODE_MAX_ATTEMPTS`; every guess counts, right or wrong), and a new one
   isn't sent while the last is under 60 seconds old. Codes are stored as
   keyed HMACs so a leaked table can't be reversed offline. Unverified accounts
   can't sign in and are deleted after 7 days by the daily cleanup
   (`pruneSyncData`).
3. **Login** (`POST /api/sync/login`) with email and `authKey`. The client
   first calls `POST /api/sync/prelogin` to get the KDF parameters, since it
   can't derive `authKey` without the account's salt. The response carries the
   wrapped keys; the client unwraps the data key with `wrapKey`.

Anti-enumeration, as far as the code goes:

- `prelogin` for an unknown email returns the default parameters with a salt
  derived by HMAC from the email and the server secret, the same on every
  call.
- Sign-up always answers 202. If the email already has a verified account,
  the owner receives an "you already have an account" email instead, and an
  unverified sign-up is replaced, so nobody can squat an address they can't
  read.
- Login runs the full scrypt hash even for an unknown email (a dummy hash) and
  answers `invalid_credentials` for both an unknown email and a wrong key.
  `email_not_verified` is only returned after the correct key.
- Password-reset requests are silent whether or not the account exists.
- One leak remains: when the account cap is reached, a sign-up for a **new**
  email gets `403 signups_closed`, while an existing one still gets 202.

## Sessions

Code: `web/src/sync/tokens.ts`, `accounts.ts`; table `sync_sessions`.

- **Access token:** an HS256 JWT, audience `pernce-sync`, valid 15 minutes
  (`ACCESS_TOKEN_TTL_SECONDS`), signed with a key derived from
  `SESSION_SECRET` by label so no other token type can pass for it. Every
  endpoint except `prelogin`, `signup`, `verify`, `login`, `refresh`,
  `logout`, `reset` and `reset/confirm` needs `Authorization: Bearer`. It
  can't be revoked, so it works for up to 15 minutes after a logout, but the
  server re-checks the user exists and is verified on every request.
- **Refresh token:** 32 random bytes, stored only as a SHA-256, valid 60
  days **sliding** (`REFRESH_TOKEN_TTL_MS`: each refresh extends it). Every
  refresh rotates it. Presenting the immediately previous token again (a
  replay, so someone else has a copy) ends that session. The client refreshes
  shortly before expiry and on a 401.
- `POST /api/sync/logout` ends one device's session. A password reset ends
  all of them.

## Password reset and the recovery key

A forgotten password and a lost data key are different problems, and
resetting the password does not recover the data.

- **Reset** (`POST /api/sync/reset`, then `/reset/confirm`): an emailed code
  proves the email. The client derives a new `authKey` and a new KDF salt, the
  server stores them, deletes **every** session, and signs this device in. (A
  reset also finishes an unverified sign-up.)
- The old `wrappedKeyPassword` can't be opened with the new password. The
  client sends `wrappedKeyPassword: null`, so the server holds no
  password-wrapped copy until a device with the data key re-wraps it.
- After the reset, the signing-in device ends up in one of these cases
  (`completeSignIn`, `confirmPasswordReset`):
  1. It entered the **recovery key**: it unwraps the data key from
     `wrappedKeyRecovery` and re-wraps it for the new password
     (`recoverWithKey`).
  2. It still **holds the data key** locally for the same account and key
     version: it re-wraps it itself.
  3. Neither: the device is signed in but in state `needs_key` and can't read
     the cloud copy. It can try again after another device has re-wrapped the
     key (`retryKey`, `unlockWithPassword`), enter the recovery key, or
     **start over**.
- **Start over** (`startOver`) is for a lost data key. It makes a new data key
  and recovery key at `keyVersion + 1`, deletes every cloud record
  (`DELETE /api/sync/records`; the account stays), and uploads from this
  device. Another device that still holds the old key notices the version
  change on its next pull, adopts the new key if its password-wrapped copy
  opens, and re-uploads its own rows under it (`adoptServerKey`). If no device
  has the data and there is no recovery key, the cloud copy is lost, which is
  why the app shows the recovery key once, right after sign-up.
- `PUT /api/sync/keys` takes re-wrapped keys at the current `keyVersion` or
  the next one, conditional on the version the server read, so two devices
  can't both advance it (`409 key_changed`).

## Records: push, pull and conflicts

Code: `web/src/sync/records.ts`, `mobile/src/sync/engine.ts`,
`mobile/src/sync/merge.ts`, `core/src/hlc.ts`.

**The record.** Each synced table has an envelope in plaintext (`id`,
HLC, tombstone flag; `collection`, `keyVersion` and a server sequence number
on the server) and every other column in the encrypted JSON payload.

**HLC.** `"<13-digit wall ms>-<4 hex counter>-<node id>"`, which sorts in time
order with a plain string compare. A device's next timestamp is the larger of
its clock and the last one it has issued or seen, so a backwards clock never
produces an older stamp. The server only checks the format and compares
strings. Because the wall time comes from the device clock, a device whose
clock is far ahead wins conflicts until the others catch up.

**Push** (`POST /api/sync/push`, up to `SYNC_LIMITS.pushRecords` = 200
records, ciphertext up to `recordCiphertext` = 16 * 1024 base64 characters
each). Per id the server keeps the record with the later HLC; at an equal HLC
the higher key version wins (so a re-encryption under a new key replaces
without a new write). Records it already has a later write for come back in
`stale`; the next pull brings them. A push whose records name a different key
version than the account's is `409 key_changed`. Pushes for one user commit in
order through a guard on the user's sequence counter, byte total and key
version (D1 has no row locks); a collision is retried up to six times, then
`503`. Tombstones are stored like any record and are not pruned.

**Pull** (`GET /api/sync/pull?since=<server_seq>&limit=<n>`). Returns records
after the cursor, oldest first, up to `SYNC_LIMITS.pullRecords` = 500 and at
most 2 MiB of ciphertext per page (at least one record, so a cursor can't
stick), with `hasMore` and the account's current `keyVersion`.

**Merging happens on the device**; the server can't read rows. A run
(`runSync`) pulls every page and merges it, then pushes the outbox, so
collisions are settled before anything is pushed.

- Last writer wins per row: a pulled record replaces the local row only if its
  HLC is later. A tombstone is just a later write.
- Pulled payloads are untrusted input and are validated with the same rules
  as a local write before they touch the database; failures are counted and
  skipped.
- Natural-key collisions (two devices each created the budget for
  "Groceries, Oct", or seeded a "Groceries" category, or more than one
  profile) are settled deterministically by keeping the row with the lowest
  UUID; the loser becomes a tombstone and references to it move to the
  winner. Those are ordinary local writes, so they are pushed like any edit.
- Balances are never synced: they are derived from the ledger, so merged
  ledgers can't produce inconsistent balances. The worst case is that one
  device's edit is overwritten by a later one.
- A record whose ciphertext is too large for the limit is skipped and reported
  as an error.

**When sync runs** (`mobile/src/lib/sync.ts`): at app start, on return to the
foreground, every 20 seconds while the app is in the foreground
(`POLL_MS`), 4 seconds after the last local write when there is something
to push (`DEBOUNCE_MS`), on the browser's `online` and `focus` events, and as a
best-effort background task on phones (`mobile/src/lib/backgroundSync.ts`; the
OS decides when it runs). Writes go to the local database and an outbox
first, so they never wait on the network.

## Limits and abuse controls

Configured through environment variables (`web/src/sync/context.ts`,
`web/.env.example`):

| Setting | Default | Meaning |
|---|---|---|
| `SYNC_MAX_USERS` | 100 | Sign-ups stop at this many accounts, verified or not. The personal instance sets 1. |
| `SYNC_QUOTA_BYTES` | 25 * 1024 * 1024 | Ciphertext (base64 characters) each user may store; a push that grows past it is `413 quota_exceeded`. Shrinking is always allowed. |

Other limits: password-hash attempts are 8 per 10 minutes per email for login
and account deletion, sign-ups 5 per hour per IP address, and emails 6 per
hour per address. These counters are in memory, per server instance
(`web/src/lib/rate-limit.ts`), so they are a modest brake, not a hard limit;
on Cloudflare Workers they are close to ineffective (see
`docs/web-deployment.md`, "Rate limiting on Workers").

**Account deletion** (`DELETE /api/sync/account`) repeats the auth key in the
body, so a stolen access token alone can't do it, and removes the account, its
records, sessions and pending codes. Deleting the cloud account leaves local
data on every device.

## Where the design came from

`docs/mobile-scope.md` is the original planning document (historical). If it
and this page disagree, this page, which follows the code, is right.
