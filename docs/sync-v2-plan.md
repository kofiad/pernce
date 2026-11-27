# Sync v2: linked devices instead of a shared password

Status: **feature proposal, paused** (2026-11-27). Revised after four
reviews; decisions D1 to D10 are settled (section 10). Nothing here is
built yet. `docs/sync.md` still describes the code as it is.

## 1. Summary

Sync today asks for the same password on every device. The password does
two jobs: it authenticates the device to the server (`authKey`), and it
unlocks the data key (`wrapKey`). Every new device means typing it again,
changing it means re-entering it everywhere else, and devices can't be
seen or signed out one by one.

v2 replaces the password with **linked devices**, the model WhatsApp uses
for its companion devices. Each device has **its own key pair**. A new
device joins by being **approved by a device that is already in** (scan a
QR code), and the approving device sends it the encryption keys, end to
end. The server only stores a list of devices and ciphertext it can't read.

What users get:

- **No password.** Nothing to choose, remember, type on each new device,
  or keep in step across devices.
- **Add a device by scanning a QR code**, in either direction: whichever of
  the two devices has a camera scans the other's code. The new device
  confirms which account it is joining before it uploads anything.
- **A list of linked devices** (Settings → Sync → Linked devices), with
  name, platform and last active, and **Log out** for any one of them.
- **Logging out a device locks it out of new data**: the keys rotate, so it
  can't read anything written after it was removed.
- **Notices by email** when a device is linked or removed, or the recovery
  key changes.
- **If every device is lost:** email code plus recovery key, as today's
  recovery key and WhatsApp's 64-digit backup key. Recovery can log out
  every other device at once.

How it works, in short:

- **Each device has an identity key pair** (Ed25519 to sign, X25519 to
  receive keys). The device proves who it is to the server by signing, not
  with a password or refresh token.
- **Linking by QR code.** The approving device seals the account keys to
  the new device. The QR code carries a full 32-byte secret that
  authenticates both directions of the exchange.
- **A signed, versioned device list.** The account key signs the list of
  devices. The server can't add a device, or keep a removed one, without a
  signature it can't make.
- **Removing a device rotates the keys**: right after the removal when a device
  removes another one, and at the next foreground sync after a device logs
  itself out or is replaced during a link. New writes use the new key; old
  records keep the key they were written with (a **keyring**), so nothing
  is re-encrypted. Old keys can't be used to write records dated after a
  removal: each rotation fixes a cutoff that records under older keys must
  stay below (a backdated gap remains until phase 6, 4.5).
- **Records, push/pull, HLC merge, quotas and limits stay as they are.**
  Identity, authentication and key distribution change, and the record
  AAD gains `keyVersion`, `hlc` and `deleted` (4.10), since the migration
  wipes every record anyway. That also closes an integrity gap in today's
  format (4.9).

**Cost.** About 6 to 8 weeks of focused work (section 11), for a sync that
has one user today. That is why the plan is paused: it is worth building
when sync goes public, or when the password becomes a real burden.

## 2. Background: the password-reset sign-in bug (resolved separately)

The idea for v2 came from a reported bug: after a password reset on one
device, the other devices answered "Wrong email or password" to the new
password. It was diagnosed on 2026-11-27 and **is not a reason for v2**:

- **Cause:** the password manager filled in the old password. Typed by
  hand, the new password signed in. The server's reset logic and Argon2id
  agree across platforms (a fixed test vector matched libsodium on the web
  and an independent implementation).
- **Likely mechanism:** the reset screen (`SyncAuthFlow.tsx`, "Choose a
  new password") has no username field, so iCloud Keychain and Google
  Password Manager can't update the saved entry for the email; and the web
  build gives the browser no `autocomplete` hints.
- **Fix:** small and in v1, outside this plan: a username field on the
  reset screen, `autocomplete` hints on the web, and a sign-in error that
  mentions saved passwords. v2 would remove this class of problem along
  with the password, but the fix doesn't wait for it.

## 3. How WhatsApp does it (research)

Sources: [Meta engineering, "How WhatsApp enables multi-device capability"
(2021)](https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/),
[WhatsApp Security Whitepaper](https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf),
[whatsmeow `appstate` package](https://pkg.go.dev/go.mau.fi/whatsmeow/appstate),
[InfoQ summary](https://www.infoq.com/news/2021/07/WhatsApp-signal-protocol/),
[Project Whitepaper write-up](https://projectwhitepaper.substack.com/p/whatsapp-security).
The whitepaper PDF couldn't be machine-read, so details marked
*(unverified)* come only from second-hand quotes. None of them is
load-bearing for this design.

- **One identity key per device.** Since multi-device, "each device now has
  its own identity key". The server keeps the list of an account's devices.
- **Linking by QR code.** The companion shows a QR code, and the primary
  phone scans it. The primary signs the companion's key, and publishes a
  **signed device list**, so other parties can tell real devices from
  devices the server injected. Signature prefixes and the exact list format
  *(unverified)*. There is also a typed-code fallback *(unverified: length
  and how it is protected)*.
- **History sync.** On linking, the primary uploads an encrypted bundle of
  recent messages and sends its key end to end. WhatsApp needs this because
  its server doesn't keep messages.
- **App state sync ("syncd").** Settings are stored on the server as
  encrypted mutations, under app-state sync keys that devices share end to
  end. Patches carry MACs, and an LTHash over the whole state lets clients
  detect a server that drops or rolls back mutations.
- **Key rotation on device removal.** A remaining device makes new app-state
  key material and sends it to the remaining devices. New mutations use it;
  older ones catch up over time.
- **Primary and companions.** Companions are logged out after the phone is
  inactive for a while, and their number is capped *(unverified: about 14
  days, 4 companions)*.
- **No password.** The account identity is the phone number. Encrypted
  backups are opened with a password or a 64-digit key, never used to sign
  in.

### What to copy and what not to

| WhatsApp | Pernce v2 | Why |
|---|---|---|
| Per-device identity keys | **Copy** | This is the core change. It removes the shared password. |
| QR linking | **Copy, in both directions** (section 4.4) | Whichever device has a camera scans. Pernce's web app can't scan, so it must be able to show the QR code in either role. |
| Typed-code fallback | **Don't copy in v2; v3** (decision D7) | A short code under a MAC the server stores can be brute-forced offline by the server. Doing it safely needs a PAKE. |
| Signed device list | **Copy: a versioned list signed by the account key**, plus signed key transitions | Stops the server from injecting a device, keeping a removed one, or handing out keys it made itself. |
| App-state keys shared device to device, rotated on removal | **Copy, without re-encryption** (keyring) | Re-encrypting old records protects nothing against a removed device that already had them. |
| History bundle sent by the primary | **Don't copy** | Pernce's server keeps every encrypted record, so a new device just pulls. |
| Primary phone + companions | **Don't copy. All devices are peers** (D1) | Pernce has no phone-number identity, and the web app should work while the phone is away. |
| LTHash integrity over state | **Later** (phase 6) | Valuable hardening, not needed to fix sign-in. |
| Backup password / 64-digit key | **Keep the recovery key** (D2) | Used only to recover, never to sign in. |

## 4. Proposed design

### 4.1 Keys and signed objects

```text
Per device (generated on the device, private halves never leave it):
  deviceSign    Ed25519 key pair    authenticates to the server
  deviceBox     X25519 key pair     receives the account's data keys
  deviceAdmin   X25519 key pair     receives the account signing key; on
                phones its private half is released only by the OS unlock
                (D10); on the web adminPub = boxPub (no separate key)

Per account:
  keyring       { 1: dataKey_1, …, v: dataKey_v }   every data key so far
  accountSign   Ed25519 key pair for the current key version
                (the server stores the public half)
  recoveryPub   X25519 public key derived from the recovery key
  recoveryAuth  32 bytes, derived from the recovery key
  chainHead     hash of the key history so far (below)
  bundle        = enc("pernce-bundle-v1", keyVersion, chainHead,
                      recoveryPub, recoveryAuth, n,
                      for each keyring entry, by version: version, cutoffHlc, dataKey)
                  (the data part: everything except the signing key;
                  cutoffHlc is empty for the current version)
  bundleSig     = Ed25519(accountSign, enc("pernce-bundle-sig-v1", SHA-256(bundle)))
  seed          accountSign's 32-byte seed, never inside the bundle

Recovery:
  recoveryKey   32 random bytes, shown once, NEVER stored on any device
                (52 Crockford characters, format unchanged)
  recoveryBox   = X25519 key pair from HKDF(recoveryKey, "pernce-recovery-box-v1")
  recoveryAuth  = HKDF(recoveryKey, "pernce-recovery-auth-v1")
  wrappedRecovery = c || HMAC-SHA256(recoveryAuth, c),
                    c = sealTo(recoveryPub, enc("pernce-recovery-bundle-v1", bundle, seed),
                               aad enc("pernce-recovery-v1", keyVersion))
                  (recovery needs the signing key, so its wrap holds both)

Signed device list (replaces per-device certificates):
  listBytes     = enc("pernce-devices-v1", listVersion, keyVersion, n,
                      for each device, sorted by id:
                        id, name, platform, signPub, boxPub, adminPub, addedAt)
  listSig       = Ed25519(accountSign, listBytes)

Key transition (one per rotation, kept by the server as exact bytes):
  transitionBytes = enc("pernce-rotate-v1", fromVersion, toVersion,
                        accountSign_new.pub, listVersion, cutoffHlc)
  transition    = Ed25519(accountSign_old, transitionBytes)
  cutoffHlc     the rotating device's HLC right after pulling everything up
                to the server's current seq (4.5); every record under
                fromVersion or older has an HLC at or below it. Clients
                reject a transition whose cutoffHlc wall time is beyond
                their own clock + authSkewMs
  chainHead_v   = SHA-256(enc("pernce-chain-v1", chainHead_{v-1}, transitionBytes))
  chain start   chainHead_s = SHA-256(enc("pernce-chain-v1", s, accountSign_s.pub)),
                where s is the account's first key version: 1 at creation,
                or the new version after a start over (4.7)

Delivery to a device (two parts, stored together on the server):
  envelope(device) = { data: sealTo(boxPub, enc("pernce-envelope-data-v1", bundle, bundleSig),
                                    aad enc("pernce-envelope-v1", deviceId, keyVersion)),
                       seed: sealTo(adminPub, seed,
                                    aad enc("pernce-envelope-seed-v1", deviceId, keyVersion)) }
  The background task opens only `data`. `seed` is stored as it came and
  opened only for a sensitive action, so neither the device's own storage
  nor the server's copy of the envelope gives the signing key to anyone
  who lacks the admin key.

sealTo(recipientPub, plaintext, aad):
  (e, E)  = fresh X25519 key pair
  ss      = X25519(e, recipientPub)              all-zero output is rejected
  key     = HKDF-SHA256(ikm ss, salt E || recipientPub, info "pernce-seal-v1", 32 bytes)
  nonce   = 24 random bytes
  output  = E || nonce || XChaCha20-Poly1305(key, nonce, plaintext, aad)

Encoding of everything signed, MACed, sealed or hashed:
  enc(label, f1, f2, …) = the label and then each field, every one written
                          as u32 big-endian length || bytes
  label, strings        UTF-8; strings NFC-normalized (device names also
                        trimmed and capped at 64 bytes)
  integers              8 bytes, u64 big-endian (still length-prefixed)
  booleans              1 byte, 0 or 1
  absent / empty        a zero-length field
  HLCs                  the core `hlc.ts` string form, UTF-8
  keys, hashes, MACs    raw bytes
  ids                   the 16 raw bytes of the UUID
  times                 integer milliseconds since the epoch
```

There is no JSON in anything signed. The server keeps the exact
`listBytes` and `transitionBytes` it accepted (blobs), parses them to
update its tables, and never re-serializes them for a signature check. The
same goes for clients.

Rules that the rest of the design depends on:

- **`sealTo` is anonymous.** Anyone with a public key can make an envelope,
  and that includes the server. A device therefore never trusts a bundle
  just because it opened. Every path authenticates the bundle separately:
  - the first device made it itself (4.2);
  - a new device checks the link tag keyed by the QR secret (4.4);
  - an existing device checks the transition chain from the account key it
    already trusts (4.5);
  - a recovering device checks the `recoveryAuth` MAC (4.6).
- **A bundle proves itself by the account key's signature, not by a
  claim.** The data part carries `bundleSig`, made with `accountSign`. A
  device checks it against the account public key it already trusts (from
  the link tag, the transition chain, or the recovery wrap), so a forged
  data part can't be paired with the real seed part. When a device opens
  the seed part (a sensitive action, or recovery), it also **derives** the
  Ed25519 public key from the seed and checks that it equals the account
  public key. A seed that doesn't match is treated as `keys_untrusted`.
- **Ed25519: agree where it matters.** RFC 8032 allows both cofactored and
  cofactorless verification, and OpenSSL (Node), Workers, BoringSSL
  (Chrome), Safari and `@noble/curves` (lenient ZIP-215 by default) differ
  on edge cases, even for honest public keys when a key holder crafts a
  mixed-order signature. So:
  - public keys are rejected when registered (verify, link, recover,
    rotate) if they are small-order or not canonically encoded, on the
    server and on clients;
  - signatures with a non-canonical `S` are rejected everywhere (every
    verifier above already does);
  - clients call `ed25519.verify(sig, msg, pub, { zip215: false })`;
  - core's test vectors include the edge-case set from "Taming the many
    EdDSAs". Phase 2 records each verifier's answer. Agreement is
    required on the registration checks and canonical `S`. For the
    remaining cases (mixed-order `R`), only a key holder can make such a
    signature, and a disagreement means the server and a client reject
    each other's view of that holder's own message. That is denial of
    service by an insider who could do worse anyway; the plan accepts it
    and documents the recorded answers.
- **Rollback.** Each device stores the highest `listVersion` and
  `keyVersion` it has accepted, and the `chainHead` of every key version it
  has accepted. It rejects anything lower, and anything at an equal version
  whose content differs from what it accepted. The marks reset only when
  the device links again after `account_reset` (4.7).
- **Old keys can't write records dated after a removal** (4.5, 4.10). A
  pulled record under key version `w` older than the current one is
  accepted only if its HLC is at or below the **effective cutoff** of `w`:
  the smallest `cutoffHlc` among the rotations from `w` up to the current
  version. One honest rotation is enough to bound every older version,
  because it pulled everything first; an inflated cutoff set earlier by a
  device that was later removed can't widen it. A record that breaks the
  cutoff stops sync in `keys_untrusted` (no honest device can produce one).
  The backdated case (a record dated before the cutoff) stays open until
  phase 6.
- **HLCs from the future are ignored.** Core's HLC gets a drift bound:
  `observeHlc` (today `mobile/src/data/meta.ts:38`, which takes any remote
  HLC) ignores a remote HLC whose wall time is beyond `now +
  maxHlcDriftMs` (proposed: 1 hour) and reports it. The record is still
  stored by LWW, but it no longer drags every device's clock, and with it
  every later cutoff, into the future.
- **Forks can be detected, not prevented** (D9, 4.5). A removed device
  still holds the `accountSign` of the version it was removed at, so,
  working with the server, it can sign a second transition from that
  version. A device that hasn't yet seen the real one can't tell them
  apart.
- **The recovery key is never stored.** Rotation can re-seal the bundle to
  it because `recoveryPub` and `recoveryAuth` are in the bundle and the
  secret isn't needed for sealing.
- **The keyring only grows** (until a start over, 4.7). It adds 32 bytes per
  rotation.

Libraries and storage:

- Clients: **`@noble/curves`** (ed25519, x25519) next to the `@noble/ciphers`
  and `@noble/hashes` already in use. Pure TypeScript, runs on Hermes and in
  browsers, no native module. Added to `mobile` with `pnpm expo install`.
- Server: Ed25519 verification through **WebCrypto** (`crypto.subtle.verify`
  with `Ed25519`), built into Node and Workers. No new server dependency.
  The server never signs, seals or opens anything. CPU cost is measured on
  the Worker in phase 3 (method: `docs/web-deployment.md`).
- Argon2id and `react-native-libsodium` are no longer needed (D2 keeps it
  that way).
- Phones: the device keys and a 32-byte **bundle key** live in
  `expo-secure-store`, with `keychainAccessible:
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` as today (`src/lib/sync.ts`), so the
  background task can sign while the phone is locked. The bundle itself
  can't go in the keychain: SecureStore warns above 2048 bytes and may
  reject larger values, and the keyring grows with every rotation. It is
  stored in the app database, sealed with XChaCha20-Poly1305 under the
  bundle key (aad `"pernce-bundle-at-rest-v1"`). The bundle doesn't
  contain the signing key.
- Phones, the account key: the seed is what lets a device approve, remove,
  rotate and change the recovery key, so it sits behind the OS unlock
  (D10), and not only behind a confirm screen:
  - the private half of `deviceAdmin` is a SecureStore item with
    `requireAuthentication: true`, which the OS releases only after Face
    ID, fingerprint or the passcode;
  - the seed only ever reaches the device sealed to `adminPub`: in the
    envelope's seed part (link, rotation, possibly adopted by the
    background task), or, on the first device and after a recovery,
    sealed by the device itself. The device stores that ciphertext in the
    database as it came. The background task never opens it and never
    prompts;
  - a sensitive action asks the OS for the admin private key and opens the
    seed for that one action, keeping it only in memory;
  - the server's copy of the envelope is no shortcut: its seed part needs
    the same admin key. Someone who copies the device keys from the
    keychain gets the data keys, but not the signing key;
  - if the OS has invalidated the item (Android does this when biometrics
    change) the device keeps syncing but can't do sensitive actions; it
    offers "Link again", which replaces its own entry with a new admin
    key. A phone with no passcode can't create such an item: the admin key
    is then stored normally, and Settings says that sensitive actions
    aren't protected.
- Web: the device keys are **non-extractable WebCrypto keys** (Ed25519 and
  X25519) in IndexedDB from the start (phase 5, not phase 6). Next to them
  is a non-extractable AES-256-GCM **bundle key**. The bundle sits in
  `localStorage` only encrypted under it, because XChaCha20 needs the raw
  keys and the bundle can't be a WebCrypto key. Copying a browser profile's
  storage then copies neither the device identity nor the keyring and
  `accountSign`. Code running in the page can still use both (4.9).
  Browsers without WebCrypto X25519 or Ed25519 fall back to `@noble/curves`
  keys in `localStorage`, still with the AES-GCM bundle key; phase 5 checks
  which target browsers need the fallback. The web has no OS unlock to
  tie the seed to, so its `adminPub` is its `boxPub`: it keeps the seed
  part as it came and opens it with the box key when needed, without
  asking (D10).

### 4.2 Creating an account (first device)

1. The user enters an email. `POST /signup {email}` always answers 202:
   - New email: a 6-digit code is emailed (existing rate limits and code
     rules).
   - Email with a verified account: the owner gets the "you already have an
     account" email, and no code is sent.
   - Email with an unverified sign-up: it is replaced, as today.
2. The device generates its id (a random UUID), its keys (sign, box and
   admin), `accountSign`, `dataKey_1` and the recovery key, signs device
   list version 1 containing only itself, and makes its own two-part
   envelope (the seed sealed to its own `adminPub`).
3. `POST /verify {email, code, accountPublicKey, listBytes, listSig,
   wrappedRecovery, envelope}` creates the account and its first device in
   one `runBatch`. Accounts exist only once verified, so `verified_at`
   goes away. If the email already has a verified account,
   the server answers `invalid_code`, exactly like a wrong code, and changes
   nothing. A verify **never replaces an existing account**. The insert is
   conditional on the email being free, so two verifies can't race.
4. The device shows the recovery key once, as today.

### 4.3 Authenticating a device (replaces login, refresh and passwords)

- `POST /token {deviceId, ts, sig}`, where
  `sig = Ed25519(deviceSign, enc("pernce-auth-v1", audience, deviceId, ts))`
  and `ts` is in milliseconds.
  `audience` is the server's public origin (for example
  `https://pernce.vercel.app`). The server compares it with its configured
  `SYNC_PUBLIC_ORIGIN`, so a signature captured by one deployment can't be
  replayed to another.
- The server checks:
  - the device is in the account's current list;
  - the signature is valid;
  - `ts` is within ±2 minutes of server time (`clock_skew` otherwise, with
    the server's time);
  - `ts` is greater than the stored `last_auth_ts`, through one conditional
    `UPDATE … WHERE last_auth_ts < ts`. Zero rows updated answers
    `auth_replay`. This blocks replays without a challenge table.
- It returns the same 15-minute HS256 access token as today, carrying the
  device id, plus the account's current `keyVersion`, `listVersion` and
  `needs_rotation` (pull responses carry the same three, so a device learns
  of a pending rotation without calling `/keys`).
- Every request re-checks that the device row still exists, so a removal
  takes effect at once. That is a read. `last_seen_at` is written only when
  the stored value is more than an hour old, so syncing doesn't cost a D1
  write per request (the free plan allows 100,000 writes a day).
- No refresh tokens and no `sync_sessions`.

Client rules (`mobile/src/sync/api.ts`):

- **Single flight.** One signed request at a time per device (`/token`, and
  the account deletion, which uses the same `last_auth_ts`): a shared
  in-process promise, and on the web a Web Lock (`navigator.locks`) so tabs
  that share one device identity don't race.
- **`auth_replay`** (another request won anyway, for example the background
  task): retry once with `ts = max(now + offset, lastTs + 1)`.
- **`clock_skew`**: store the offset from the server's time and retry once.
- **401 on any other endpoint** means the access token expired or is
  invalid: get a new token once and retry the request. Only
  **`device_removed`** and **`account_reset`** (both 403) end sync on this
  device.

### 4.4 Linking a new device

In plain terms, adding a laptop when the phone is already set up:

1. On the laptop: Sync → **Link with another device**. The laptop shows a
   QR code.
2. On the phone: Sync → Linked devices → **Link a device**. The camera
   opens. Point it at the laptop's screen.
3. The phone asks "Link 'Chrome on Mac'?". Tap **Link**, and confirm with
   Face ID, fingerprint or the phone's passcode (D10).
4. The laptop asks "Join the account of me@example.com?". Click **Join**.
5. The laptop is in, downloads the data and uploads its own. Nobody typed a
   password.

When the approving device is the one without a camera (the web app
approving a new phone), the roles of the QR code flip: the web app shows
the QR code under Linked devices → **Link a device**, and the new phone
scans it from its own "Link with another device" screen. Both screens then
show the same 6-digit code, and the web app's confirm screen asks to link
only if they match.

| New device | Approving device | Who shows the QR code | Mode |
|---|---|---|---|
| Web or phone | Phone | New device | 1 |
| Phone | Web | Approving device | 2 |
| Phone | Phone | Either (new device by default) | 1 or 2 |
| Web | Web | Not possible in v2: link through a phone, or recover | v3 (D7) |

**Why no typed code:** the server stores (or relays) a MAC keyed by the
code. A code a person can type has at most about 50 bits, fewer after
lookup bits, and the server can test every value offline in seconds to
minutes. The 3-minute expiry doesn't stop offline guessing. With a
32-byte secret in the QR code, it can't. A typed code needs a PAKE, and is
deferred to v3 (D7).

**QR payload:** `pernce-link:?v=1&o=<base64url origin>&l=<linkId>&k=<base64url k>`,
where `linkId` is 16 random bytes made by the device that shows the code,
and `k` is 32 random bytes. The scanning device refuses a code whose origin
isn't its own sync server.

**Mode 1: the new device B shows the QR code.**

```text
 New device B                        Server                        Linked device A
 ────────────                        ──────                        ───────────────
 gen deviceId, deviceSign,
     deviceBox, deviceAdmin,
     linkId, k
 req = {deviceId, signPub, boxPub,
        adminPub, name, platform,
        replaces?}
 POST /link {linkId, req,
   mac = HMAC(k, enc("pernce-link-req-v1",
         linkId, req))}             → stores it (3 min),
                                       returns pollToken
 show QR (origin, linkId, k)
                                                                   scan QR (expo-camera)
                                     ← GET /link/:id (A's token)
                                       → req, mac
                                                                   check mac with k
                                                                   "Link 'Pixel 8 (Android)'?"
                                                                   + OS unlock (D10)
                                                                   list' = list + B
                                                                     (− replaced device), v+1
                                                                   listSig' = sign(accountSign, list')
                                                                   env = { data: sealTo(B.boxPub,
                                                                             bundle, bundleSig),
                                                                           seed: sealTo(B.adminPub,
                                                                             seed) }
                                                                   tag = HMAC(k, enc("pernce-link-ok-v1",
                                                                     linkId, B.signPub, B.boxPub,
                                                                     B.adminPub, accountPublicKey,
                                                                     listBytes', SHA-256(env.data),
                                                                     SHA-256(env.seed)))
                                     ← POST /link/:id/approve
                                       {list', listSig', env, tag}
                                       checks listSig' with the stored
                                       accountPublicKey, the version CAS,
                                       the allowed change, and that the
                                       added entry equals the stored req
                                       (id, all three keys, name,
                                       platform); creates B
 poll GET /link/:id (pollToken)     → {env, tag, accountPublicKey,
                                       list', listSig', accountEmail}
                                       (accountEmail from the server's own
                                       records, not from A)
 check tag with k; open env.data;
 bundleSig and listSig' valid under
 accountPublicKey; B in list';
 keep env.seed sealed as it came
 "Join the account of <accountEmail>?"
 only after Join: POST /token, pull,
 push local data
```

**The new device confirms which account it joins.** QR codes on a screen
can be seen by others (a screen share, a photo, someone behind you). In
mode 1, whoever sees B's code can approve it from **their own** account;
in mode 2, a new phone can be tricked into scanning someone else's code.
Either way, B would upload its local data into a stranger's account.
So B shows the account's email and pushes nothing until the user taps
**Join**. By then B is already in the signed list, so **Cancel** takes it
out properly. B gets a token (`POST /token`, as it is in the list now),
opens the seed part (on a phone, behind the OS unlock, like any sensitive
action), signs a list without itself, and sends `POST /devices/leave`
(which sets `needs_rotation`, 4.5). Then it wipes everything it received.
If any of that fails, B still
wipes its keys, and the entry stays until someone removes it. It is marked
"Never joined" in the list, because it never posted a head report. The
email comes from the server's records of the approving
account, not from A, because the threat here is another user of an honest
server. A malicious server can't forge the tag either way. Until the user
joins, B keeps its local data to itself.

**Mode 2: the approving device A shows the QR code.** A sends
`POST /link {linkId}` with its access token (an "offer"), then shows the QR
code. B scans it and sends `POST /link/:id/join {req, mac}`, unauthenticated
and accepted only while the offer is open and not yet joined (a second join
gets `link_taken`). It gets a `pollToken`. A polls `GET /link/:id`, sees
B's request, and from there the steps are those of mode 1: check the MAC,
confirm, approve with the tag. B polls and checks as in mode 1.

**Matching code (mode 2).** Anyone who sees A's QR code knows `k` and can
race to join first, under any name. So, once B has joined, both devices
show `sas = HMAC(k, enc("pernce-link-sas-v1", linkId, req))` as 6 decimal
digits (the first 4 bytes as a big-endian integer, mod 10⁶). A's confirm
screen says "Check that the other device shows 482 913". If someone else
joined first, the real B shows `link_taken` and no code, and the codes
can't match. Mode 1 doesn't need it: B posts its request before showing
the code, so nobody can join in its place, and the account confirmation
covers the other direction.

What each check stops:

- **`mac`** (A checks it): the server can't swap B's public keys
  (including `adminPub`), name, platform or `replaces` field, because it
  doesn't know `k`.
- **`tag`** (B checks it): the server can't hand B a bundle it made itself.
  `sealTo` is anonymous, and without the tag the server could seal its own
  data key to B. B would then push its local data under a key the server
  knows.
- **The signed list** (the server and every device check it): only a device
  that holds `accountSign` can add B.
- **The account confirmation** (B): stops B from uploading its data to an
  account the user didn't mean to join.
- **The matching code** (mode 2): stops someone who saw A's QR code from
  joining in B's place.

Details:

- **Approval races.** Approve is conditional on `listVersion` and
  `keyVersion`. If either moved (another link, a rotation), the server
  answers `devices_changed` or `key_changed`. A fetches the current keys and
  list and approves again. B doesn't notice.
- **One approval per link.** The approve is conditional on the link not
  being approved yet. A second approval, from the same account or another
  one, gets `link_taken`.
- **Device limit:** 10 per account. If the list is full, A's confirm screen
  asks which device to remove. The removal goes into the same `list'`, and A
  rotates right after the approval (4.5). These are two requests. If A
  crashes or goes offline between them, the approval has already set
  `needs_rotation`, so the next foreground sync of any device rotates.
- **Replacing an old entry.** A device that lost its keys but kept its
  database (a phone restored from backup: keychain items marked device-only
  don't move) sends its old device id as `replaces`. The confirm screen
  shows "Replaces 'iPhone'", and A removes the old entry in the same `list'`.
  The requester sets `replaces` itself, so a phishing request can use it to
  look familiar and get a real device removed. M33b shows it as a warning
  ("This will log out 'iPhone'. Only continue if that phone was reset or
  replaced"), with last-active for the entry being replaced. It never
  shows as a plain line of text.
- **Notices.** Linking emails the account owner ("A new device, Pixel 8, was
  linked") and shows in the device list.

### 4.5 Linked devices, removal and key rotation

**Settings → Sync → Linked devices** (new screen) shows name, platform,
linked date, last active, and "This device". Every other device has **Log
out**; this device has **Log out this device**. Devices can't be renamed in
v2: the name is part of the signed list, and no list rule allows changing
it. A device that wants a new name links again.

**Sensitive actions need the phone's own unlock** (D10): approving a link,
logging out another device, any rotation (including the automatic one
after `needs_rotation`), "New recovery key", and cancelling a link. All of
them need the seed, which reaches a phone only sealed to its admin key
(4.1), both on the phone and in the server's copy of its envelope. The OS
releases the admin key only after Face ID, fingerprint or the passcode, so
the unlock protects the key and isn't just a screen. It runs through a
platform module in `src/lib/` that is injected like the secret store, and
is personal-build only. A phone with no passcode stores the admin key
unprotected and says so. The web has no equivalent, so there these actions
rely on the notice emails. This stops someone holding an unlocked or
borrowed phone, and someone who copied the app's keychain items and
database. Such a copy still gives the data keys, and with them every
record. It doesn't stop malware that can drive the unlocked phone.

**The automatic rotation** after `needs_rotation` shouldn't turn every
removal or cancelled link into a Face ID prompt, which would teach users to
approve prompts without reading them:
- a web device does it without asking when it next syncs in the
  foreground (its seed isn't behind an unlock);
- otherwise a phone does it together with the next sensitive action the
  user takes anyway, under that one prompt;
- if neither happens within 24 hours, the next foreground sync on a phone
  asks once, with a reason ("Pernce needs to renew your sync keys after a
  device was removed"). If the user declines, it asks again a day later.

**Removing devices is two requests: remove, then rotate.**

1. `POST /devices/remove {listBytes', listSig'}`: the current list minus
   the removed devices, `listVersion + 1`, the same `keyVersion`, signed
   with the current `accountSign`. It takes effect at once: the removed
   devices' rows are deleted, so their next request fails the per-request
   device check, and they can't push any more. It sets `needs_rotation`.
2. Rotate (below), right away, from the same device.

Removing first matters because rotation needs a moment when nobody pushes
(the `seq` check). A device that is about to be removed, a thief for
example, could otherwise keep pushing and make every rotation that
removes it fail with `seq_changed`. Once it's out, only the remaining
devices can push. They are honest, and they back off, so a bounded retry
(five attempts, with a fresh pull each time) finishes. If the rotation
still doesn't go through, `needs_rotation` stays set, and the next
foreground sync tries again. The removal itself has already taken effect.

**Rotation** creates key version `v+1`. It is one request, with no record
re-encryption, so it is cheap:

1. Fetch the current keys, list and transitions; verify them (below). Open
   the seed (the OS unlock on phones).
2. **Pull everything** up to the server's current `seq`, applying it as
   usual. The HLC receive rule leaves the device's HLC at or above every
   record it pulled. `cutoffHlc` = the device's HLC after that pull.
3. Generate `dataKey_{v+1}` and `accountSign'`. `keyring' = keyring` with
   `cutoffHlc` set on version `v`, plus `{v+1: dataKey_{v+1}}`. Compute
   `chainHead_{v+1}`, build `bundle'`, and sign it (`bundleSig'`, with
   `accountSign'`).
4. `list'` = the current list (removals already done in step 1 above),
   `listVersion + 1`, `keyVersion = v+1`, signed with `accountSign'`.
5. `transition = sign(accountSign_old, enc("pernce-rotate-v1", v, v+1,
   accountSign'.pub, list'.listVersion, cutoffHlc))`.
6. `POST /rotate {fromVersion: v, pulledSeq, transitionBytes, transition,
   accountPublicKey', listBytes', listSig', envelopes: [{deviceId, data,
   seed}…], wrappedRecovery'}`: each envelope's data part sealed to that
   device's `boxPub`, its seed part to its `adminPub`.

The server checks:

- `key_version = fromVersion`, the list version, **and `seq = pulledSeq`**
  (CAS). If two devices rotate at once, the loser gets `409 key_changed`
  and adopts the winner's keys. If anything was pushed after the pull, the
  rotation gets `409 seq_changed`, and the device pulls again and retries.
  So no record under version `v` can be accepted after `cutoffHlc` was
  fixed.
- The transition signature, against the current `accountPublicKey`.
- That the transition's `fromVersion` and `toVersion` are `v` and `v+1`,
  its new public key equals `accountPublicKey'`, and its `listVersion`
  equals that of `list'`.
- `listSig'`, against `accountPublicKey'`, and `list'.keyVersion = v+1`.
- `list'` has the same devices as the current list. Removals go through
  `devices/remove` first; a rotation never adds or removes a device.
- The envelopes' device ids are exactly the devices in `list'`, one each,
  each with both parts.
- `wrappedRecovery'` is present.

Clients check the same transition and list fields when they adopt a
rotation.

It then applies everything in one `runBatch`, chunked under D1's
100-parameter limit.

`wrappedRecovery'` re-seals `bundle'` and the new seed to the same
`recoveryPub` with the same `recoveryAuth`. Nothing needs the recovery
key's secret.

**Removing another device** is a removal followed by a rotation. The
confirm screen (M34a) has **"Also make a new recovery key"**, checked by
default. A removed device knows the current `recoveryAuth` and can forge
a recovery wrap with the server's help (4.6). Making a new key closes
that, at the cost of the user saving a new key. With the box checked, the
new recovery key goes into the same rotation. The owner gets a "Device
removed" email either way.

**Log out this device:** the device signs `list'` without itself (with the
current `accountSign`), sends `POST /devices/leave {list', listSig'}`, and
deletes its keys and bundle. The server sets `needs_rotation = 1`. The next
device that syncs **in the foreground** sees the flag and rotates with
nothing removed. The rotation still matters: the departed device's keys may
have been copied earlier (a backup, a browser profile). If this is the last
device, the confirm screen says so: getting back in will need the recovery
key.

**Other devices** learn of a rotation from `key_changed` on push or a
higher `keyVersion` on a pull or token response. They call
`GET /keys?from=<keyVersion>` and receive:
- their own current envelope (both parts);
- the transitions from their `keyVersion` up to the current one, with
  their `cutoffHlc`s (inside `transitionBytes`), which the effective
  cutoff rule needs;
- the list and its signature, and the account public key;
- every device's latest **head report** (below).

They then:

1. verify each transition in turn, starting from the `accountSign` public
   key they already trust (its fields as listed above), and extend their
   `chainHead` with each one;
2. open their envelope's data part and check that `bundleSig` is valid
   under the last transition's new public key, that the bundle's
   `keyVersion` is the expected one, that its `chainHead` equals the one
   they computed, that `keyring'` contains their old keyring, that each
   version's `cutoffHlc` matches its transition, and that the list
   signature is valid. None of this needs the seed, so the background task
   can do it;
3. adopt the bundle, and store the seed part as it came. There is no
   resync and no re-upload: records keep their key versions;
4. post their own head report (`POST /devices/head`).

If the device's own id isn't in the list, the state becomes `removed`. If
any check fails, sync stops in state `keys_untrusted` ("The server sent keys
that don't check out. Sync is paused.") and nothing is pushed.

**Fork detection** (D9). Every device signs what it believes the chain is:

```text
headReport = { deviceId, keyVersion, chainHead,
               sig = Ed25519(deviceSign, enc("pernce-head-v1",
                     deviceId, keyVersion, chainHead)) }
```

A device posts it after creating an account, linking, recovering, every
rotation it makes or adopts, and on each foreground sync if it changed. A
newly linked or recovered device takes its `chainHead` from the bundle,
which the link tag or the recovery MAC authenticates. The server keeps the
latest report per device and returns them all on `GET /keys` and
`GET /devices`.

Which reports a device checks: those from **every device it has ever seen
in an accepted list**, not only the current one. A device keeps the
`signPub` of each, and the `chainHead` of every key version it has
accepted (32 bytes each). For each such report at a `keyVersion` it has
accepted, it checks the signature and that the `chainHead` equals its own
for that version. The list a forked device receives is signed by the
attacker and can simply leave out the honest devices, so checking only the
current list would let the fork through unnoticed.

Where it is caught: usually on the **honest side**. The honest devices
still list the forked device and see its report (or its records, under a
`keyVersion` their keyring holds a different key for, which don't open).
The forked device catches it only if the server still shows it an honest
device's report.

What happens then: sync stops in `keys_untrusted`, but with a way out
(M36a). The screen names the device whose report differs ("'MacBook'
disagrees about the account's keys. It may have been sent false keys
while it was offline"). It offers **Remove it, make a new recovery key,
and link it again**: a removal, then one rotation that also changes the
recovery key, after which sync resumes. Then link the device again from
scratch. Its local data is merged as on any link. Anything it pushed
under the forked key should be treated as seen by the attacker.

Records that don't open: a pulled record that should open (its
`keyVersion` is at or below the device's own) but doesn't, or one that
breaks its version's effective cutoff, also stops sync in
`keys_untrusted`. The screen shows the record's collection and id, so a
single corrupt row from a bug is told apart from a fork. A record with a
`keyVersion` **above** the device's own isn't a failure: the device fetches
the keys (`/keys`), adopts them, and pulls on.

What this does and doesn't do, stated plainly: a removed device working
with the server can still hand a fork to a device that was offline during
the removal, and that device may push records under a key the attacker
knows before anyone notices. Detection then stops further damage and
tells the user. A server that keeps the two groups of devices apart **for
good** (hiding each side's reports and records from the other) can hide
the fork. At that point it is effectively running a separate account with
the victim's device. Preventing forks outright would need a primary
device or a trusted log, which D1 rules out.

**Records:** each keeps the key version it was written with. Push still
requires the current `keyVersion` (encryption happens at push time, so
outbox entries are encrypted under the newest key). Pull decrypts with
`keyring[record.keyVersion]`, and accepts a record under an older version
`w` only if its `hlc` is at or below the effective cutoff of `w` (the
smallest `cutoffHlc` from `w` up to the current version, 4.1). A removed
device still holds the old data keys and could make valid-looking records
under them, with any HLC, tombstones included. The cutoff rejects every
such record dated after the removal (the backdated case is below), and
honest records can't be caught by it, because the `seq` check on
`/rotate` means nothing was pushed under `w` after the cutoff was fixed.
`engine.ts:133`'s "Encrypted with an old key" error becomes the
`keys_untrusted` handling above.

What rotation protects, stated plainly:

- A removed device keeps everything it could already read (its old
  keyring), and it can't authenticate any more. It needs the server's help,
  or a database leak, to get ciphertext at all.
- Rotation makes sure that, even then, it can't read records written after
  the removal, and it can't sign lists, because `accountSign` rotates along
  with the data key.
- The cutoff limits what it can write: anything it makes under its old
  keys must have an HLC from before the removal, so it loses to every
  change made after the removal. **It doesn't fully close the gap.** For a
  row nobody has changed since before the cutoff, a backdated record (HLC
  between the row's last change and the cutoff) still wins LWW, if the
  server colludes and serves it. Closing that needs the rotating device to
  commit to the set of records under the old version (a digest, phase 6).
  Until then it is a residual risk, listed in 4.9.
- Re-encrypting old records would add nothing, so the plan doesn't do it.

Limits:

- Rotation runs only in the foreground app, never in the background sync
  task.
- After a self-logout, rotation waits for another device to open the app.
  If none does, the keys don't rotate. That is accepted.
- The server can withhold things: never set `needs_rotation`, or show a
  device an old list it hasn't seen a newer one of. Cached versions limit
  rollback; withholding is an availability problem the server can always
  cause. The device that made a removal knows the removal happened, but
  the server can hide it from the others and, working with the removed
  device, fork the chain for them (fork detection above).

**New recovery key** changes `recoveryPub` and `recoveryAuth`, so it is
done as a rotation with nothing removed (or combined with a removal).
Devices that left before then don't know the new `recoveryAuth`. Any linked
device can do it, so the owner gets a "Your recovery key was changed"
email, and on phones it needs the device's unlock (D10). A device that
changes the recovery key without the owner knowing locks the owner out of
recovery: the old key stops working.

**Idle devices** (D4): no automatic removal. The daily cleanup emails the
owner once when a device hasn't been active for 90 days.

### 4.6 Recovery when no linked device is left

1. Choose "I don't have my other devices". `POST /recover {email}` emails a
   code (the request is silent whether or not the account exists).
2. `POST /recover/confirm {email, code}` returns `{wrappedRecovery,
   accountPublicKey, keyVersion, list, listSig, transitions, recoverToken}`.
   The token lasts 10 minutes and is renewed by each pull page it serves
   (below), up to 2 hours in all. It finishes exactly one recovery.
3. The user types the recovery key. The device derives `recoveryBox` and
   `recoveryAuth` and **checks the MAC first** (it rejects a wrap the server
   forged). Then it opens the wrap (bundle and seed), checks that the
   public key derived from the seed equals `accountPublicKey`, checks
   `bundleSig` and the list signature, and takes `chainHead` and the
   cutoffs from the bundle.
4. **"Log out all other devices"** is checked by default. With it:
   1. the device generates its keys and calls `POST /recover/remove
      {recoverToken, listBytes', listSig'}`: a list holding only itself,
      signed with the current `accountSign`. Every other device is out at
      once and can't push (the same reason as removal in 4.5);
   2. it **pulls everything** with the `recoverToken` (a read-only pull,
      the same pages as `/pull`), applying the records to its local
      database. Its HLC after the pull is the `cutoffHlc`;
   3. it finishes with `POST /recover/finish {recoverToken, …rotation
      fields}` (4.5, including `pulledSeq`), which also gets the `seq`
      check.

   Unchecked, it only adds itself (`list` + itself, signed with the current
   `accountSign`, through `recover/finish`), with no removal and no
   rotation. It then pulls with its own token as any linked device does.
5. The owner gets an email: "A device was added with your recovery key".

Who can do what:

| Attacker has | Result |
|---|---|
| Email only | Can't add a device to the account: that needs `accountSign`, which exists only inside bundles. **Can start over** (4.7), which wipes the cloud copy and logs out every device at once. That is an availability risk, as in v1. The data stays on the devices. A cancellable delay is added before sync goes public (D6). |
| Recovery key only | Can't get `wrappedRecovery`: that needs the email code. |
| Email and recovery key | Gets in and can log out every device. Same as today, and as WhatsApp's backup key plus phone number. |
| A stolen **locked** phone | Nothing beyond the local data the OS protects: sensitive sync actions need the account key, which only the phone's unlock releases (D10), on the phone and in the server's copy of its envelope. The owner removes it from another device. Background sync keeps it authenticating until then. |
| A copy of a phone's keychain items and database (a forensic tool, a backup extracted from a jailbroken phone) | The data keys, so every record it can get, and the device's identity until the owner removes it. **Not** the account key: that needs the admin key, which the OS only releases on unlock. So it can't approve, remove, rotate or change the recovery key. |
| A stolen **unlocked** phone, or a web app left open | Can remove the other devices, rotate, and **make a new recovery key**, which makes the owner's saved key useless. The owner gets "Device removed" and "Recovery key changed" emails. If the recovery key still works, the owner recovers with "Log out all other devices", which removes the thief. If the thief changed it, only start over is left (4.7), which also removes the thief. Either way, the thief keeps the data it already had. |
| A removed device working with the server | Knows the old `recoveryAuth`, so it could forge a `wrappedRecovery` for a later recovery. "Also make a new recovery key" (checked by default when removing) closes this. It also holds the old `accountSign`, so it can fork the key chain for devices that were offline during the removal; fork detection reports this (4.5, D9). It holds the old data keys: records it makes under them are rejected if dated after the removal (the cutoff), but a backdated change to a row untouched since before the removal can still win until phase 6 (4.5). |

### 4.7 Start over (no keys anywhere)

For an owner who has lost every device **and** the recovery key, so a new
account key is the only way forward.

1. `POST /start-over {email}` emails a code.
2. The device makes a new account key, data key and recovery key, and calls
   `POST /start-over/finish {email, code, accountPublicKey, list (version
   1, only itself), envelope (both parts), wrappedRecovery}`. It runs at once, with no
   delay (D6). The server:
   - wipes the records, transitions and devices in one `runBatch`;
   - sets `keyVersion + 1`, with **no** transition signature: the chain is
     broken on purpose, and a new one starts at this version (`chainHead_s`
     in 4.1, with `s` the new version). The list restarts at version 1;
   - emails the owner: "Your cloud copy was reset".

   The new device starts with a keyring holding only the new key, because
   the old records are gone. The key version still goes up, so that no
   ciphertext from before can be confused with the new account's.
3. A device that links again after `account_reset` first clears its
   high-water marks, chain heads and the device keys it remembered. Its
   rollback protection restarts there. That is acceptable, because the new
   link is authenticated by the QR code and the approving device, not by
   anything the server says.
4. Other devices get `account_reset` (403), not `device_removed`, and show
   "The cloud copy was reset" (state `account_reset`). The server keeps a
   `reset_at` on the account and answers `account_reset` to any device id
   it deleted in a start over (a small `sync_reset_devices` list, pruned
   after 90 days). Local data is untouched everywhere, and the devices can
   link to the new account.

No delay, because sync has one user today: the owner of the personal
instance. The cost is that whoever controls the email can wipe the cloud
copy and log out every device at once, as in v1 (the data stays on the
devices). **Before sync goes public**, add a delay that any linked device
can cancel (for example 72 hours). That item goes on the owner's checklist
in `docs/web-deployment.md` (phase 7).

### 4.8 Everyday tasks under v2

There is no password to change. What replaces the password tasks of v1:

- **Log out other devices** from the Linked devices list. Their tokens stop
  working right away, and the keys rotate.
- **Add a device back:** open Sync on it, tap "Link with another device",
  and scan or show a QR code with any device that is still linked. If none
  is left, use email code plus recovery key.
- **The recovery key leaked:** "New recovery key" (a rotation).
- **A phone restored onto new hardware:** link it again. It replaces its
  old entry.

No credential exists that has to stay in step across devices.

### 4.9 Threat model changes (for the `docs/sync.md` rewrite)

Removed:

- Weak passwords and Argon2 tuning.
- The scrypt hash of `authKey`.
- Refresh-token replay.

New:

- **Long-lived device keys.** A device key never expires, unlike today's
  60-day refresh token with reuse detection, and its theft isn't detected
  automatically.
  - Phones keep it in the keychain (device-only). The account key, which
    sensitive actions need, reaches the phone only sealed to an admin key
    that the OS releases on unlock (D10), so a copy of the keychain and
    database (or the server's copy of the envelope) gives the data keys
    but not the account key.
  - On the web, non-extractable WebCrypto keys, and the bundle encrypted
    under a non-extractable AES-GCM key, stop a copied profile from taking
    either along. But code running in the page (XSS, or a compromised
    personal server serving bad JavaScript) can use both while it runs.
    The local database on the web is plaintext, as today.
  - Mitigations: "last active" in the list, emails for new devices,
    removals and recovery-key changes, the 90-day idle email, and removal
    from any device.
- **Peers are all equal** (D1). Any linked device, including a stolen
  unlocked one, can remove the others and change the recovery key (4.6).
- **Key-chain forks.** A removed device working with the server can fork
  the chain for devices that were offline during the removal. Detected
  (head reports, usually on the honest side), not prevented (4.5, D9).
- **Backdated records under old keys.** A removed device working with the
  server can still change a row nobody has touched since before the
  removal, with a record dated before the cutoff (4.5). Anything dated
  after the removal is rejected, even if an earlier cutoff was inflated
  (effective cutoff, 4.1). Closed by the phase 6 digest.
- **A clock far in the future** on one device used to drag every device's
  HLC along with it. HLCs beyond `now + maxHlcDriftMs` are now ignored by
  the clock (4.1), so a fast clock can't inflate later cutoffs.
- **Losing every device and the recovery key** loses the cloud copy, as
  today without the password.
- **QR phishing, both ways.** Someone shows the owner a QR code and gets
  them to approve it; or someone who sees a new device's QR code links it
  into **their** account, so the device uploads its data there.
  Mitigations: the approver's confirm screen with the device's name and
  platform, the new device's "Join the account of …?" confirmation, the
  matching code in mode 2, the 3-minute expiry, and the email notice.
- **Start over by whoever controls the email** wipes the cloud copy at
  once, as in v1 (4.7). A cancellable delay is added before sync goes
  public (D6).
- **A removed device working with the server** can forge a recovery wrap
  until the next "New recovery key" (4.6).
- **What the server can no longer do on its own:**
  - add a device, because of the signed list;
  - keep a removed device after a rotation, as seen by any device that
    follows the real chain;
  - hand a device a bundle it made itself, because of the link tag, the
    transition chain and the recovery MAC, plus `bundleSig` under the
    account key they establish (and the seed's derived public key, once
    opened);
  - invent or alter a tombstone or an HLC, because both are in the record
    AAD (4.10). This needs a key it doesn't have; a removed device with old
    keys is the exception above.
- **What the server can still do:**
  - withhold, or serve stale state to a device that hasn't seen newer state
    (limited by cached versions);
  - together with a removed device: fork the key chain for devices that
    were offline during the removal, forge a recovery wrap until the next
    new recovery key, or slip in backdated records under old keys
    (detected, closed by default, or limited by the cutoff, as above);
  - drop or roll back whole records (only the phase 6 digest detects
    this);
  - delete everything.

Fixed by v2:

- **The integrity gap that exists today:** the plaintext `hlc` and
  `deleted` fields aren't in the AAD, so a server could invent a tombstone
  with a later HLC and delete a row on every device. v2's record format
  (4.10) closes it.

Unchanged:

- The personal web build serves its own encryption code.
- The metadata leak, now including device count, names and last-active
  times.

### 4.10 Record format

The migration (section 8) wipes every record on the server, so v2 changes
the record format now rather than in a later phase that would need a
per-record format flag and a downgrade check:

```text
aad        = enc("pernce-record-v2", collection, id, keyVersion, hlc, deleted)
ciphertext = seal(keyring[keyVersion], payload, aad)       live rows
ciphertext = seal(keyring[keyVersion], empty, aad)         tombstones
```

- Tombstones carry a ciphertext too, so a device accepts a delete only if
  it opens under the account's keys.
- The server still sees `hlc`, `deleted` and `keyVersion` in plaintext
  (merge order, cleanup, quotas need them). Changing any of them makes the
  record fail to open, and it is rejected like any other record that
  doesn't check out.
- A record under an older key version must also be dated at or before
  that version's `cutoffHlc` (4.5), so old keys can't be used to write
  changes dated after a removal.
- Today the AAD is only `(collection, id)` (`mobile/src/sync/crypto.ts`).

## 5. Server changes (`web/`)

Schema (`web/src/db/schema.ts`, then `pnpm run db:generate`; D1-compatible):

| Table | Change |
|---|---|
| `sync_users` | Drop `auth_hash`, `kdf`, `wrapped_key_password`, `verified_at` (accounts are created verified). Replace `wrapped_key_recovery` with `wrapped_recovery`. Add `account_public_key`, `device_list` (the exact signed `listBytes`, a blob), `device_list_sig`, `list_version`, `needs_rotation`, `reset_at`. Keep `email`, `key_version`, `seq`, `storage_bytes`. |
| `sync_devices` (new) | `id` (client UUID, primary key, unique across all accounts: a link or verify with an id that exists is rejected), `user_id`, `name`, `platform`, `sign_public_key`, `box_public_key`, `admin_public_key`, `envelope_data` and `envelope_seed` (the two parts, current version only: the keyring makes older envelopes unnecessary), `head_key_version`, `head_chain`, `head_sig`, `last_auth_ts`, `last_seen_at` (written at most hourly), `idle_notified_at`, `created_at`. Index on `user_id`. Rewritten from the signed list on every list change, in the same batch. |
| `sync_reset_devices` (new) | Device ids deleted by a start over, with `user_id` and `reset_at`, so they get `account_reset` rather than `device_removed`. Pruned after 90 days. |
| `sync_key_transitions` (new) | `(user_id, to_version)` primary key, `transition_bytes` (the exact signed bytes, a blob: from and to version, new public key, list version, `cutoffHlc`), `sig`. Small, never pruned, deleted by start over. |
| `sync_links` (new) | `id` (client-made `linkId`), `kind` (`request`/`offer`), `user_id` (for offers, and set on approval), `poll_token_hash`, the request fields and `mac`, the approval fields (`list`, `list_sig`, `envelope`, `tag`, `approved_at`; approve is conditional on `approved_at` being null), `expires_at`. Expired rows are ignored on read and pruned by `pruneSyncData`. |
| `sync_sessions` | Drop. |
| `email_tokens` | Purposes become `verify`, `recover`, `start_over`. |
| `sync_records` | Unchanged columns. Tombstones now carry a ciphertext (4.10), so `ciphertext` is no longer null for deleted rows; the record AAD itself is invisible to the server. |

Endpoints (`web/src/routes/sync.ts`, `web/src/sync/`):

| Remove | Add or keep |
|---|---|
| `prelogin`, `login`, `refresh`, `logout`, `reset`, `reset/confirm`, `PUT keys` | `signup` (email only), `verify` (creates the account and first device), `token`, `link` (POST: a request from a new device, or an offer with an access token), `link/:id` (GET: by the new device with its poll token, by the approver with an access token), `link/:id/join`, `link/:id/approve`, `devices` (GET, with head reports), `devices/remove`, `devices/leave`, `devices/head` (POST: this device's head report), `rotate`, `keys` (GET: own envelope, transitions since `?from=`, list and signature, account public key, head reports, `needs_rotation`), `recover`, `recover/confirm`, `recover/remove`, `recover/pull` (read-only, with the `recoverToken`), `recover/finish`, `start-over`, `start-over/finish`. Kept as is: `push`, `pull` (responses also carry `keyVersion`, `listVersion`, `needs_rotation`), `records` (DELETE), `account` (DELETE now needs a fresh device signature in the body, `Ed25519(deviceSign, enc("pernce-delete-account-v1", audience, deviceId, ts))`, checked with the same audience, ±2-minute and `last_auth_ts` rules as `/token`, instead of the auth key). |

- **List rules** (the core of the server's job). An accepted list must
  have `listVersion = current + 1` and a valid signature, and may differ
  from the current list only as its endpoint allows:

  | Endpoint | Allowed change | Signed with |
  |---|---|---|
  | `link/:id/approve` | add exactly the device in the stored request (same id, all three keys, name, platform), optionally remove some | current key (removals set `needs_rotation`) |
  | `devices/remove` | remove one or more other devices, never the caller, same `keyVersion` | current key (sets `needs_rotation`) |
  | `devices/leave` | remove the calling device only | current key |
  | `rotate` | no change to the devices; `keyVersion + 1`; also `seq = pulledSeq` and the transition fields of 4.5 | new key, plus the transition |
  | `recover/remove` | remove every device (the recovering device isn't in the list yet), same `keyVersion` | current key (sets `needs_rotation`) |
  | `recover/finish` | add itself (with a rotation after `recover/remove`, or without one) | new key plus transition, or the current key |
  | `start-over/finish` | a new version-1 list | new account key |

- **Signatures** are verified over the exact bytes received. New public
  keys that are small-order or not canonically encoded are rejected, as
  are signatures with a non-canonical `S`; the other edge-case answers are
  recorded, not required to match (4.1).
  Device names and platforms in a list are checked for NFC form and the
  64-byte cap.
- **New error codes:** `device_removed` (403), `account_reset` (403),
  `clock_skew`, `auth_replay`, `link_expired`, `link_taken`,
  `devices_changed`, `seq_changed`, `invalid_signature`.
  `invalid_credentials` and `email_not_verified` go
  away.
- **New environment variable** `SYNC_PUBLIC_ORIGIN` (the auth audience).
  Add it to `web/.env.example`, the Vercel project and `wrangler.jsonc`.
- **Signature checks** use WebCrypto Ed25519. Measure them in phase 3
  against the Workers free plan's CPU budget on `token`, `approve`,
  `rotate` (one check per transition and list) and `recover/finish`.
- **Rate limits:**
  - `link` and `link/:id/join` per IP (unauthenticated writes);
  - `token` per device;
  - `recover` and `start-over` the same as `reset` today;
  - `recover/pull` per `recoverToken`, with the token's 2-hour cap.

  The in-memory limiter is close to useless on Workers
  (`docs/web-deployment.md`), so these endpoints need the durable limiter
  before api.pernce.com goes public. Add that to the owner's checklist. The
  3-minute expiry and the field size limits bound how much a flood can
  store.
- **Email:** new-device notice, device-removed notice, recovery-key-changed
  notice, recovery notice, start-over request and confirmation, and the
  90-day idle notice. The idle notice is sent by the daily cleanup and
  needs `last_seen_at` and `idle_notified_at`.
- **Tests:**
  - rewrite the account half of `web/scripts/sync-checks.ts` (it runs on
    both libSQL and D1);
  - extend `web/test/sync-http.test.ts`;
  - cover: every list rule (each forbidden change rejected, including an
    approve whose added entry differs from the stored request), each
    transition-field check on `rotate`, `seq_changed` when a push lands
    between pull and rotate, a removed device's push rejected right after
    `devices/remove`, the recovery sequence (`recover/remove`,
    `recover/pull` renewing the token, `recover/finish` with the `seq`
    check), a second approve (`link_taken`), two token requests with the
    same `ts`, the Ed25519 registration and canonical-`S` checks, a
    small-order public key rejected, both envelope parts stored and
    returned, rotation chunking under the
    100-parameter limit, start over (removed devices get `account_reset`),
    a duplicate device id, head reports, the hourly `last_seen_at` write,
    and verify against an existing verified email.

## 6. Client changes (`core/`, `mobile/`)

- `core/src/sync.ts`: v2 wire types (device, list, transition, envelope,
  link, rotate, recover, start over), the new limits (`maxDevices`,
  `linkTtlMs`, `authSkewMs`), `enc()` with every label, and the
  `listBytes`/bundle encoders and parsers (the server parses lists with the
  same code). Tests in `core/src/sync.test.ts`, with fixed test vectors for
  each signed, MACed, sealed or hashed message (list, transition with
  `cutoffHlc`, chain head and chain start, head report, auth,
  delete-account, link MAC/tag/SAS, bundle with `chainHead` and cutoffs,
  `bundleSig`, both envelope parts, the recovery bundle with the seed,
  record AAD), the effective-cutoff rule, and the Ed25519 edge-case set
  (4.1) with the agreement rules and each verifier's recorded answer, so
  client and server can't drift.
- `core/src/hlc.ts`: a `maxHlcDriftMs` bound; observing a remote HLC
  beyond it is ignored and reported (`mobile/src/data/meta.ts`
  `observeHlc` uses it).
- `mobile/src/sync/crypto.ts`:
  - device key generation, `sealTo`/`openFrom` (4.1, all-zero X25519
    output rejected), list signing and verification, transition
    verification and chain heads, auth signatures, all Ed25519 checks with
    `zip215: false`, and the small-order / canonical public key check;
  - bundle and keyring encode/decode (with `chainHead` and per-version
    `cutoffHlc`), `bundleSig`, two-part envelopes (data to `boxPub`, seed
    to `adminPub`), and the "derive the account public key from the seed"
    check when a seed is opened;
  - the recovery-key derivations, the recovery MAC, the link MAC, tag and
    matching code;
  - the v2 record AAD and sealed tombstones (4.10).

  Drop `derivePasswordKeys`.
- `mobile/src/sync/account.ts`: rewritten around `createAccount`,
  `startLink`/`joinLink`/`pollLink` (new device), `offerLink`/`approveLink`
  (linked device), `listDevices`/`removeDevices` (remove, then rotate)/
  `leave`, `recover*` (with `recover/remove`, the read-only pull and the
  rotation),
  `newRecoveryKey` (a rotation), `requestStartOver`/`finishStartOver`, `deleteCloudAccount`.
- `mobile/src/sync/api.ts`: access tokens from `POST /token`, with the
  single-flight and retry rules of 4.3 (shared with account deletion). A
  401 gets a new token once. `device_removed` and `account_reset` call
  `onSessionEnded` with the reason.
- `mobile/src/sync/engine.ts`:
  - Decrypt pulled records with `keyring[record.keyVersion]`, and reject
    records under an older version dated after its effective cutoff
    (`keys_untrusted`, naming the record).
  - A record with a `keyVersion` above the device's own triggers `/keys`
    and adoption, then the pull continues. A record that should open but
    doesn't stops sync in `keys_untrusted`, naming the record.
  - Before rotating, pull up to the server's `seq` and use the HLC after
    that pull as `cutoffHlc`; on `seq_changed`, pull again and retry, up
    to five times. Removals go through `devices/remove` first.
  - Reject a transition whose `cutoffHlc` is beyond the device's clock
    plus `authSkewMs`.
  - Adopting a rotation checks `bundleSig` and stores the seed part
    unopened, so it works in the background task.
  - On a key change, verify the transition chain and adopt the new bundle
    without a resync. Keep the resync only for a start over, which wipes the
    records.
  - Rotate when `needs_rotation` is set, only when the caller says it's a
    foreground run (`runSync({ foreground: true })`), following the
    automatic-rotation rules of 4.5 (web first, then with the next
    sensitive action, then one prompt after 24 hours). The background task
    never rotates.
  - Store and enforce the highest `listVersion` and `keyVersion` seen, the
    `chainHead` of every key version accepted, and the `signPub` of every
    device seen in an accepted list. Clear all of them only when linking
    again after `account_reset`.
  - Check head reports from every device ever seen, on every `/keys` and
    `/devices` response, post this device's own, and go to `keys_untrusted`
    on a mismatch, naming the device that disagrees (4.5).
  - Read `needs_rotation`, `keyVersion` and `listVersion` from token and
    pull responses.
- `mobile/src/sync/secretKeys.ts` / `context.ts`: store the device keys,
  the bundle key, and the version high-water marks in the secret store; the
  bundle sealed under the bundle key in the database (4.1). Remove
  `wrapKey` and the session/refresh-token storage. On the web, the
  non-extractable device keys and the AES-GCM bundle key live behind a
  platform module in `mobile/src/lib/` (IndexedDB + WebCrypto), injected
  through the context, so `src/sync/` stays free of React Native, Expo and
  DOM-only imports. The same goes for the admin key (4.1): `src/sync/`
  receives `adminPub`, and `openSeed(sealedSeed, reason)`, which on phones
  reads the `requireAuthentication` SecureStore item, so the OS asks for
  Face ID, fingerprint or the passcode. On the web, `adminPub` is
  `boxPub` and `openSeed` opens it with the box key without asking.
  `expo-local-authentication` is only used to tell whether the phone has
  a passcode or biometrics at all.
- **Lost keys.** If a device finds its sync user row but no device keys (a
  restore, a cleared keychain), it goes to state `needs_link` and offers to
  link again, sending its old id as `replaces`. If only the admin key is
  gone (biometrics changed), it keeps syncing, and sensitive actions offer
  "Link again" instead.
- `mobile/src/sync/state.ts`: states `on`, `linking`, `needs_link`,
  `removed` (replaces `signed_out`: "This device was logged out from
  another device"), `account_reset`, `keys_untrusted`.
- `mobile/src/sync/test-server.ts`: move the fake server to v2. Also add
  one suite that runs the real client against the real Hono app on
  in-memory libSQL, so the client is tested against the real server and
  not only against the fake.
- QR codes:
  - **Showing:** `react-native-qrcode-svg` (on the existing
    `react-native-svg`), on phones and the web.
  - **Scanning:** `expo-camera` (barcode scanner), phones only. Add it,
    and `expo-local-authentication` (with the Face ID usage text), to the
    sync module list in `app.config.ts` and
    `plugins/withoutSyncModules.js`, together with the camera permission
    text.

  Both are personal-build only and are reached only through `syncApp()`
  (the ESLint rule). Camera and QR code live in components.

## 7. UI and design (`docs/design/` first)

New frames in `pernce-artboard.html`, following the `ms()`/`wsx()`
templates, plus rules in `pernce_design.md`, before any screen code:

- **M28** Sync intro: "Create an account" / "Link with another device" /
  "I don't have my other devices".
- **M29** Link, new device: QR code, "Open Pernce on a linked device → Sync
  → Link a device", countdown, and "The other device can't scan? Scan its
  code instead" (mode 2, opens the camera). **W29**: the web version, QR
  code only. **M29a / W29a** Join: "Join the account of me@example.com?",
  with Join and Cancel, shown before anything is uploaded. **M29b** the
  new device's matching code after joining in mode 2.
- **M33** Scan: camera viewfinder. It is used by the approving device in
  mode 1 and by the new device in mode 2.
- **M33a** Approve: "Link 'Pixel 8 (Android)'?", with Link and Cancel,
  followed by the system unlock prompt (no frame needed). **M33b**: the
  same screen when the list is full ("Choose a device to remove"), or when
  the request replaces an old entry, shown as a warning ("This will log
  out 'iPhone'. Only continue if that phone was reset or replaced", with
  its last-active time).
- **W33** Link a device from the web: shows a QR code for the new phone to
  scan (mode 2), then the confirm step with "Check that the other device
  shows 482 913".
- **M34** Linked devices list, including "Never joined" entries left by a
  cancelled link. **M34a** confirm log out, with "Also make a new recovery
  key" (checked). **M34b** log out of the last device (recovery-key
  warning). **M34c** on a phone whose admin key is gone: "This phone can't
  approve or remove devices any more. Link it again".
- **M35** Recover: email code, recovery key, and "Log out all other
  devices" (checked).
- **M36** "This device was logged out" / "The cloud copy was reset", with
  Link again. **M36a** "The server sent keys that don't check out", with
  two variants:
  - fork detected: "'MacBook' disagrees about the account's keys", with
    **Remove it, make a new recovery key, and link it again**;
  - a record that doesn't open: names the record (collection and id),
    with **Copy details** for a bug report.
- **M37** Start over: email code, then "This erases your cloud copy and
  logs out every device" with a destructive confirm.
- Retire the password fields in the sign-in, sign-up, reset and unlock
  frames (M30 recovery key and M32 unlock change).

Then implement them in `SyncAuthFlow.tsx`, `SyncScreen.tsx`,
`SyncSettings.tsx` and a new `LinkedDevices.tsx`. Use `showAlert()` rather
than `Alert.alert`. Verify the web app with Playwright (CLAUDE.md rule):
both link modes as seen from the web (W29, W29a, W33), screenshots, console
errors.

## 8. Migration

Settled (D3): **start fresh.** Sync isn't public, and the personal instance
has one account (`SYNC_MAX_USERS=1`).

Order matters, because the web app updates with the server but phones
don't:

1. **Release v1.x** (the last v1): it maps 404 on sync endpoints to "Update
   the app to keep syncing" rather than a generic error, and adds a local
   export reminder on the Sync screen.
2. **Wait until every phone runs v1.x** (with one user, checked by hand on
   each phone). Sync once from each device so nothing is left in an
   outbox.
3. **Export a local backup on every device**, the web app especially:
   browser storage can be evicted, and once the server tables are dropped
   the device is the only copy.
4. **Deploy the v2 server**, with a migration that drops the old sync
   tables and creates the new ones. The personal web app updates with it.
5. **Update the phones to v2.** On upgrade, each client clears its v1 sync
   state: session, wrap key, data key, `keyVersion` and pull cursor. It
   then **queues every local row for push** (every row's sync mark is reset
   to "not yet pushed"), so edits that never reached the server aren't
   lost. It keeps its local data and goes to the Sync intro.
6. On the device with the most complete data, create a new account. Link
   the others. Each pulls first, then pushes all its rows, and the HLC
   merge settles overlaps as it does today.

For the record, the rejected option B (an in-place upgrade through a
`POST /migrate` authenticated with a v1 session) would have needed a new
recovery key anyway, because the v1 recovery wrap covers only `dataKey`,
not the bundle.

## 9. Phases

| # | Work | Done when |
|---|---|---|
| 0 | ~~Diagnose the password-reset bug.~~ **Done 2026-11-27** (section 2): autofill, fixed in v1. | — |
| 1 | Design frames (section 7). | Frames reviewed. |
| 2 | Core: wire types, `enc()`, the list and bundle encoders, crypto (`@noble/curves`, one Ed25519 behaviour, public key checks), `sealTo`, list, transition (with `cutoffHlc`) and chain-head verification, chain start, head reports, recovery derivations, link MAC/tag/SAS, `bundleSig` and two-part envelopes, the v2 record AAD and the effective-cutoff rule, the HLC drift bound, test vectors including the Ed25519 edge cases. | `pnpm test` and mobile `pnpm test` green; every verifier agrees on the registration and canonical-`S` checks, and the other Ed25519 answers are recorded. |
| 3 | Server: schema, endpoints, list rules, `devices/remove`, the recovery endpoints (`recover/remove`, `recover/pull`), two-part envelopes, transition-field checks, the `seq` check on `rotate`, one approval per link, head reports, `account_reset`, `SYNC_PUBLIC_ORIGIN`, rate limits, prune, the new emails, hourly `last_seen_at`, checks on libSQL and D1, HTTP tests, Worker dry run and the CPU measurement. | Full CI set green (`db:verify`, `db:verify:d1`, `test:web`, `build:worker`), CPU within the free plan. |
| 4 | Client: account, linking (both modes, account confirmation, matching code, Cancel as leave), devices, two-step removal, rotation with pull-then-cutoff, keyring with effective cutoffs, fork detection against every device ever seen, the bundle sealed at rest, two-part envelopes with the seed kept sealed to the admin key, recovery with remove, read-only pull and rotation, the automatic-rotation rules, the v2 record format, engine changes, v2 fake server plus one real-server suite. | Mobile tests cover: link in both modes; remove and rotate (with and without a new recovery key); a device that keeps pushing still gets removed (remove first, then the rotation succeeds); recovery with "Log out all other devices" pulling with the `recoverToken` across a token renewal, then rotating; an inflated earlier cutoff not widening the effective cutoff; a remote HLC beyond the drift bound ignored by the clock; a transition with a far-future `cutoffHlc` rejected; adopting a rotation in the background without opening the seed; a forged data part paired with a genuine seed part rejected (`bundleSig`); an opened seed whose public key doesn't match; an offline device catching up across **two** rotations; two rotations racing; a push racing a rotation (`seq_changed`, then success); two token requests racing; recover with and without logging out the others; start over (`account_reset`, then linking again clears the marks); a device removed mid-sync; a crash between approve and rotate; Cancel at "Join the account of …?" uploads nothing and takes B out of the list; a record with a `keyVersion` above the device's own; a newly linked device checking head reports with the `chainHead` from its bundle; and rejection of: a forged envelope at link time (bad tag), a forged bundle whose seed doesn't match the account public key, a bundle whose `chainHead` doesn't match the transitions, a forged recovery wrap (bad MAC), a server re-adding a removed device, an unsigned key transition, a transition with mismatched fields, a rolled-back list, the Ed25519 edge cases, a forked chain from a removed device whose list leaves out the honest devices (caught on the honest side), a record under an old key dated after its effective cutoff (`keys_untrusted`), a tombstone or HLC changed by the server, and a second join in mode 2 (`link_taken`). |
| 5 | UI: screens, QR code and camera, the admin key behind the OS unlock (personal build only), non-extractable WebCrypto keys and the AES-GCM bundle key on the web, Playwright on the web build, device test on iOS and Android (including a biometrics change on Android invalidating the admin key). | Link phone→web (mode 1), web→phone (mode 2, matching codes), phone→phone. Remove a device, and the others keep syncing. Sensitive actions on phones can't run without the unlock, and the server's copy of a phone's envelope can't be opened into the account key with the device keys alone. Removing a device doesn't by itself cause a Face ID prompt on another phone when a web device is active. |
| 6 | Hardening: a state digest (LTHash-like) over `(id, hlc, keyVersion)` to detect dropped or rolled-back records. Each rotation also commits to the digest of the records under the old version, which closes the backdated-record gap (4.5). | Optional and separately reviewable. |
| 7 | Migration (section 8, in its order), rewrite `docs/sync.md`, update `mobile/README.md` "Sync", `docs/web-deployment.md` (owner's checklist before sync goes public: durable rate limiter, start-over delay), `CHANGELOG.md`. | Old code and tables gone, docs match the code. |

## 10. Decisions

**Settled 2026-11-27** (the recommendation for each): D1 peers, D2
recovery key only, D3 start fresh, D4 no automatic removal and an email
after 90 idle days, D5 keep email. D6 (no start-over delay in v2) and D7
(typed-code linking in v3) were added by the first review and settled the
same day. D9 (forks: document and detect) and D10 (OS unlock for sensitive
actions) were added by the second review and settled the same day; the
third review made D10 protect the account key and not only the UI.
D8 (v2 as a feature, not a bug fix) was settled once phase 0 found the
bug's cause.

- **D1. Peers or primary?** *Settled: peers.* Any linked device can approve
  or remove others. A stolen device can therefore remove the rest; recovery
  with "Log out all other devices" is the answer (4.6). The alternative was
  one "primary" device that alone approves and removes.
- **D2. Recovery password in addition to the recovery key?** *Settled:
  recovery key only for v2.* A later recovery password would wrap the
  bundle with Argon2id, and would need the same authentication as the
  recovery key (a MAC with a key derived from the password), because
  anyone can seal to a public key.
- **D3. Migration:** *Settled: start fresh* (section 8).
- **D4. Remove inactive devices automatically?** *Settled: no. Show "last
  active" and email after 90 idle days.*
- **D5. Keep email at all?** *Settled: keep.* It is used for verification,
  as the second factor for recovery, for start over, and for notices.
- **D6. Start-over delay.** A start over needs only the email code, so
  without a delay whoever controls the email can wipe the cloud copy and
  log out every device at once. *Settled: no delay in v2.* Sync has one
  user (the owner of the personal instance), and the public deployment has
  no sync users. **Revisit before sync goes public:** a delay (for example
  72 hours) that any linked device can cancel. It is on the owner's
  checklist (phase 7).
- **D7. Linking when neither device has a camera** (web to web).
  *Settled: v3.* In v2, link through a phone or recover. v3 adds a typed
  code protected by a PAKE (CPace over ristretto255, which `@noble/curves`
  provides). A typed code without a PAKE is not an option (section 4.4).
- **D8. Build v2, or fix v1?** *Settled 2026-11-27: both, separately.*
  Phase 0 found that the reported bug was autofill (section 2). It gets a
  small fix in v1. v2 is a feature, justified on its own merits (section
  1), and is paused until it is worth 6 to 8 weeks: when sync goes public,
  or when the password becomes a real burden.
- **D9. Key-chain forks.** A removed device working with the server can
  fork the chain for devices that were offline during the removal (4.5).
  *Settled: document and detect.* Devices sign head reports, compare them,
  and stop syncing on a mismatch. Forcing every device that was offline
  across a removal to link again was rejected as too heavy; doing nothing
  was rejected as too weak.
- **D10. OS unlock for sensitive actions.** *Settled: yes, in v2, on
  phones.* Approving a link, removing a device, rotating and making a new
  recovery key need Face ID, fingerprint or the passcode, personal build
  only. The unlock guards the key, not just a screen: the account key's
  seed only ever travels sealed to a separate admin key that only the OS
  releases (`requireAuthentication` in SecureStore). That holds in the
  phone's storage and in the server's copy of its envelope, whose seed
  part is sealed to `adminPub` while its data part is sealed to `boxPub`.
  The data part carries `bundleSig` so the two can't be mixed (4.1). The
  background task opens only the data part. The automatic rotation avoids
  needless prompts (4.5). The web relies on the notice emails.
  *Rejected alternative (fourth review):* a UI-only check, which is
  simpler but leaves the account key readable to anyone with the device
  keys.

## 11. Risks

- **The web can't scan.** Web→web linking waits for v3 (D7), and
  every web link needs a phone.
- **The list rules carry the security.** The server's list-change checks,
  the clients' transition and rollback checks, and `enc()` must be exactly
  right. Mitigated by fixed test vectors in core, a test for every
  forbidden change on both server backends, and the rejection tests in
  phase 4.
- **Clock-based auth.** Device clocks can be wrong. Mitigated by the
  `clock_skew` retry with the server's time.
- **WebCrypto X25519/Ed25519 support** differs between browsers. Older ones
  fall back to keys in `localStorage`, which keeps today's level of
  protection.
- **Losing the only device without the recovery key** loses the cloud copy
  (local data stays). The UI must keep pushing users to save the recovery
  key and to link a second device.
- **Forks and peers.** With all devices equal (D1), a removed or stolen
  device holds real power until every device has caught up. Fork detection
  (D9), the OS unlock (D10), the cutoff on old keys, the notice emails and
  "Also make a new recovery key" reduce the risk; they don't remove it.
  Backdated records under old keys stay possible until phase 6.
- **The `seq` check can make rotation retry.** A busy account (several
  devices pushing) can make `/rotate` lose to pushes a few times. The
  client retries with a fresh pull; with one user this shouldn't matter,
  but phase 4 tests the retry.
- **Scope.** This touches every sync file, the schema, the record format
  and the design, and adds signed lists, transitions, fork detection, two
  link modes, the OS-unlock check and the at-rest bundle key. A realistic
  estimate is **6 to 8 weeks** of focused work. Phase 4 (client) and
  phase 5 (UI, camera, devices) are the larger half.

## Appendix: changes made by the review (2026-11-27)

- The recovery key is never stored. Rotation re-seals to `recoveryPub`,
  derived from the recovery key, with a MAC from `recoveryAuth`. Before,
  rotation needed the recovery key on every device, including removed ones.
- Per-device certificates are replaced by a versioned device list signed by
  the account key, with server-side change rules. Before, a malicious
  server could keep a removed device, and the rotating device would
  re-certify it and seal the new keys to it.
- The typed 10-character code is dropped. QR codes work in both directions
  instead, and a PAKE-protected typed code moves to v3 (D7). Before, the server could
  brute-force the short code offline from the stored MAC.
- The new device checks a link tag keyed by the QR secret. Before, the
  server could seal a bundle of its own to the new device.
- Rotations are signed by the previous account key, and devices verify the
  chain. Recovery wraps carry a MAC. Both close the same "anyone can seal"
  gap on the other two paths that hand out bundles.
- The attacker table no longer claims that email alone can't take over:
  start over can. It stays immediate in v2 because sync has one user, and
  a cancellable delay goes on the checklist for before sync goes public
  (D6).
- A keyring replaces re-encryption. Rotation is one request. Records keep
  their key version, so nothing becomes unreadable after two rotations.
- Specified: single-flight token requests and the `auth_replay` retry; a
  401 gets a new token instead of ending the session; audience-bound,
  length-prefixed signatures; verify never replaces an existing account;
  recovery can log out all other devices; rotation only in the foreground;
  replacing old entries and choosing a device to remove at the limit;
  non-extractable WebCrypto keys on the web moved to phase 5; WebCrypto
  Ed25519 on the server; honest rate-limit limits on Workers.
- Made consistent: decision status, a single migration path, the D4 email
  added to the work, phase 0 as a gate, unverified WhatsApp details marked,
  the estimate revised, neutral wording.

## Appendix: changes made by the second review (2026-11-27)

- **Forks** (D9): the plan claimed the server couldn't keep a removed
  device or hand out its own bundle. Working with a removed device, it can
  still fork the chain for devices that were offline during the removal.
  The claims are corrected, and signed head reports detect forks.
- **Bundle authentication:** the bundle carries only the `accountSign`
  seed, and every check derives the public key from it. Before, a forged
  bundle could pair the real public key with a data key the server knows.
- **Linking into the wrong account:** the new device shows "Join the
  account of …?" (email from the server's records) before it uploads
  anything, and mode 2 shows a matching code on both screens.
- **Device id** added to the link request and its MAC; ids must be unique
  across all accounts.
- **Encoding:** no JSON in anything signed. The list and the bundle use
  `enc()`, whose rules are now spelled out, and the server verifies the
  exact bytes received. `sealTo` is fully specified, including the
  recovery AAD.
- **Strict Ed25519** on clients (`zip215: false`), matching WebCrypto.
- **D8** records the cheap v1 fix as an open alternative, decided after
  phase 0. v2 is argued on its own merits. Phase 0 adds an Argon2id
  test vector across the phone and the web (new candidate 4).
- **Record AAD** (`keyVersion`, `hlc`, `deleted`) and sealed tombstones
  move from phase 6 into v2 (4.10), since the migration wipes the records
  anyway.
- **Stolen device:** it can change the recovery key, so the attacker table
  is corrected. Added: OS unlock for sensitive actions on phones (D10),
  emails for device removal and recovery-key changes, and "Also make a new
  recovery key" checked by default when removing a device.
- **Storage:** the bundle is encrypted at rest on both platforms (an
  AES-GCM key on the web; a bundle key in the keychain on phones, since
  SecureStore warns above 2048 bytes and the keyring grows), and the
  keychain accessibility stays at "after first unlock" for the background
  task.
- **Migration** order spelled out (v1.x first, backups, then the server),
  and "clear outbox marks" replaced by "queue every row for push".
- **Smaller fixes:** `needs_rotation` comes back in token and pull
  responses; `account_reset` is separate from `device_removed`; the
  delete-account signature is bound to the audience and a timestamp; the
  approve rule checks the stored request; `ts` is in milliseconds;
  `verified_at` dropped; `last_seen_at` written at most hourly; no device
  renaming in v2; the crash between approve and rotate covered; estimate
  6 to 8 weeks; the unverified MITRE ID removed.

## Appendix: changes made by the third review (2026-11-27)

- **Old keys could still write.** A removed device holds the old data
  keys, and pull accepted any record whose key version was in the keyring,
  so it could make valid-looking records and tombstones with any HLC. Now
  each rotation pulls first, fixes a `cutoffHlc` in the signed transition,
  and `/rotate` fails if anything was pushed after that pull (`seq`
  check). Clients reject records under an older key dated after its
  cutoff. A backdated change to a row untouched since before the removal
  remains possible until phase 6; the plan says so.
- **`chainHead` is in the bundle**, so newly linked and recovered devices
  have one, authenticated by the link tag or the recovery MAC. The chain
  start is defined for a start over too.
- **Fork detection checks every device ever seen**, not just the current
  list (which a forked list can strip of the honest devices). It is
  usually caught on the honest side, and `keys_untrusted` now has a way
  out: remove the device that disagrees, make a new recovery key, link it
  again.
- **Cancel at "Join the account of …?"** is a signed `devices/leave` by
  B, not a call that left B in the list. A link can be approved only once.
- **The phone's unlock now protects the key (D10):** the account key's
  seed is sealed to an admin key that only the OS releases, so the
  background task never holds it. Losing the admin key (biometrics
  changed) means linking again. *(Not true as first written: the envelope
  still carried the seed under the box key. Corrected by the fourth
  review.)*
- **The server checks every transition field**, and stores the exact
  `transitionBytes`, now including the list version and `cutoffHlc`.
- **Start over** restarts the chain and the list. A device linking again
  clears its marks.
- **Records that don't open** name the record; one with a newer key
  version than the device's fetches keys instead of failing.
- **Ed25519:** one behaviour across server and clients, with public key
  checks at registration and the "Taming the many EdDSAs" edge cases as
  test vectors.
- **Smaller fixes:** the estimate is consistent (6 to 8 weeks); the summary
  says when removal rotates; `account_reset` also ends sync (4.3); account
  deletion shares the token request's single flight; `enc()` rules for
  booleans, empty fields and HLCs; the link tag covers `listBytes'`; the
  migration no longer asks v1 for a device-version screen; `replaces` shows
  as a warning on M33b.

## Appendix: changes made by the fourth review (2026-11-27)

- **The admin key didn't protect the account key.** Every envelope on the
  server still held the whole bundle, seed included, sealed to the box
  key, which the background task can read. So anyone with the device keys
  could fetch the envelope and take the seed. Now the envelope has two
  parts: the data part (keyring, chain head, recovery fields) sealed to
  `boxPub`, and the seed sealed to a new `adminPub` that is in the link
  request and the signed list. The data part carries `bundleSig` (signed
  with the account key), so a forged data part can't be paired with a
  genuine seed part. On the web, `adminPub = boxPub`. The recovery wrap
  holds both parts. Option (a) of the review; the UI-only check was
  rejected.
- **The cutoff could be stretched.** Records under an older version are
  now checked against the **effective cutoff** (the smallest cutoff from
  that version up), so a cutoff inflated by a device that was later
  removed doesn't help it. Clients reject far-future cutoffs, and core's
  HLC ignores remote HLCs beyond a drift bound, so a fast clock can't
  inflate later cutoffs. A record that breaks the cutoff stops sync in
  `keys_untrusted`.
- **Recovery's rotation had no cutoff.** Recovery with "Log out all other
  devices" is now remove (`recover/remove`), pull with the `recoverToken`
  (read-only, renewed per page up to 2 hours), then rotate with the `seq`
  check.
- **A device being removed could block its own removal** by pushing
  constantly, making every rotation fail with `seq_changed`. Removal is now
  two steps: `devices/remove` (takes effect at once, sets
  `needs_rotation`), then the rotation, which no longer changes the device
  list.
- **Ed25519:** agreement is required on the registration checks and on
  canonical `S`; for the other edge cases each verifier's answer is
  recorded, with the argument that a disagreement is only denial of
  service by a key holder. Phase 2 is no longer gated on browser
  internals.
- **Fewer Face ID prompts:** the automatic rotation after a removal is
  done by a web device if one is active, otherwise with the next sensitive
  action, and only after 24 hours by a prompt of its own.
- **Smaller fixes:** Cancel gets a token and opens the seed before its
  signed leave; `/keys` explicitly carries the cutoffs; the summary says
  "dated after a removal"; the third-review claim about the background
  task is marked as corrected; new tests for all of the above.

## Appendix: reframed as a feature (2026-11-27)

- Phase 0 found the reported bug's cause: the password manager filled in
  the old password after a reset. It gets a small v1 fix outside this plan
  (section 2).
- The plan is now a feature proposal: the summary leads with what users
  get, section 2 is background, phase 0 is done, D8 is settled, and the
  plan is paused.
