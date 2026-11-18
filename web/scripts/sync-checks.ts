/**
 * The sync server checks (src/sync, the daily rate run): the real service
 * functions with a test SyncContext, against whatever database the runner
 * passes in with the real migrations applied: an in-memory libSQL
 * (scripts/verify-sync.ts, `pnpm run db:verify`) or a local Cloudflare D1
 * (scripts/verify-d1.ts, `pnpm run db:verify:d1`), a mailer that keeps the
 * emails, and a clock the checks move. Run each in its own process: the
 * in-memory rate limiters are module state.
 */
import { eq } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_KDF_PARAMS, SYNC_LIMITS, type SyncKdf, type SyncRecord } from "@pernce/core/sync";
import { formatHlc } from "@pernce/core/hlc";
import * as schema from "../src/db/schema";
import type { DbClient } from "../src/db/batch";
import type { SyncContext } from "../src/sync/context";
import type { EmailMessage } from "../src/sync/email";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The error code a call fails with, or "ok". */
async function outcome(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
}

const b64 = (bytes: number) => randomBytes(bytes).toString("base64");
const kdf = (): SyncKdf => ({ ...DEFAULT_KDF_PARAMS, salt: b64(16) });
const NODE = "3f2a9c1e0b7d4e21";
const hlc = (wall: number, counter = 0, node = NODE) => formatHlc({ wall, counter, node });
const T0 = 1_790_000_000_000;

function record(id: string, at: string, overrides: Partial<SyncRecord> = {}): SyncRecord {
  return { id, collection: "transaction", hlc: at, deleted: false, keyVersion: 1, ciphertext: b64(120), ...overrides };
}

const SESSION_SECRET = "verify-sync-secret";

/** Runs every check on `db` and returns how many failed. */
export async function runSyncChecks(db: DbClient): Promise<number> {
  const accounts = await import("../src/sync/accounts");
  const records = await import("../src/sync/records");
  const { verifyAccessToken } = await import("../src/sync/tokens");
  const { pushSchema, signupSchema } = await import("../src/sync/schemas");

  const outbox: { to: string; message: EmailMessage }[] = [];
  let now = T0;
  const ctx: SyncContext = {
    db,
    mail: async (to, message) => {
      outbox.push({ to, message });
    },
    now: () => now,
    config: { maxUsers: 5, quotaBytes: 4000, sessionSecret: SESSION_SECRET },
  };
  const lastCode = (to: string) => {
    const mail = outbox.filter((m) => m.to === to).at(-1);
    return /\b(\d{6})\b/.exec(mail?.message.text ?? "")?.[1] ?? "";
  };
  let ipCounter = 0;
  const ip = () => `10.0.0.${++ipCounter}`;

  console.log("\nTest 1: sign-up sends a code; the account can't sign in until it's verified");
  const alice = { email: "alice@example.com", authKey: b64(32), kdf: kdf(), wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) };
  await accounts.signup(alice, ip(), ctx);
  const code1 = lastCode(alice.email);
  check("A 6-digit code was emailed", code1.length === 6);
  check(
    "Signing in before verifying is refused with email_not_verified",
    (await outcome(() => accounts.login({ email: alice.email, authKey: alice.authKey }, ctx))) === "email_not_verified",
  );
  check("...and that didn't send a second code within a minute", lastCode(alice.email) === code1 && outbox.length === 1);

  console.log("\nTest 2: wrong codes count against the code, and five wrong guesses kill it");
  const wrong = code1 === "000000" ? "111111" : "000000";
  check(
    "A wrong code is rejected",
    (await outcome(() => accounts.verifyEmail({ email: alice.email, code: wrong }, ctx))) === "invalid_code",
  );
  for (let i = 0; i < 4; i++) await outcome(() => accounts.verifyEmail({ email: alice.email, code: wrong }, ctx));
  check(
    "After 5 wrong guesses even the right code fails",
    (await outcome(() => accounts.verifyEmail({ email: alice.email, code: code1 }, ctx))) === "invalid_code",
  );
  now += 61_000;
  await accounts.signup(alice, ip(), ctx);
  const code2 = lastCode(alice.email);
  check("Signing up again a minute later sends a new code", outbox.length === 2 && code2.length === 6);
  now += 16 * 60_000;
  check(
    "A code is dead after 15 minutes",
    (await outcome(() => accounts.verifyEmail({ email: alice.email, code: code2 }, ctx))) === "invalid_code",
  );
  now += 60_000;
  await accounts.signup(alice, ip(), ctx);
  const aliceSession = await accounts.verifyEmail({ email: alice.email, code: lastCode(alice.email), deviceName: "Pixel" }, ctx);
  check("The right code signs the device in", aliceSession.user.email === alice.email && !!aliceSession.refreshToken);
  check("The access token names the user", (await verifyAccessToken(SESSION_SECRET, aliceSession.accessToken)) === aliceSession.user.id);
  check(
    "The wrapped keys and KDF come back as uploaded",
    aliceSession.keys.wrappedKeyPassword === alice.wrappedKeyPassword &&
      aliceSession.keys.wrappedKeyRecovery === alice.wrappedKeyRecovery &&
      aliceSession.keys.kdf.salt === alice.kdf.salt &&
      aliceSession.keys.keyVersion === 1,
  );
  check(
    "A used code can't be used again",
    (await outcome(() => accounts.verifyEmail({ email: alice.email, code: lastCode(alice.email) }, ctx))) === "invalid_code",
  );
  const aliceId = aliceSession.user.id;

  console.log("\nTest 3: prelogin and sign-up don't reveal whether an email has an account");
  const realKdf = await accounts.prelogin(alice.email, ctx);
  const fake1 = await accounts.prelogin("nobody@example.com", ctx);
  const fake2 = await accounts.prelogin("nobody@example.com", ctx);
  check("A real account gets its own salt", realKdf.salt === alice.kdf.salt);
  check(
    "An unknown email gets the default parameters with a stable salt",
    fake1.salt === fake2.salt && fake1.opsLimit === DEFAULT_KDF_PARAMS.opsLimit && Buffer.from(fake1.salt, "base64").length === 16,
  );
  const mailsBefore = outbox.length;
  const hijack = { ...alice, authKey: b64(32), wrappedKeyPassword: b64(72) };
  check("Signing up with a verified email 'succeeds'", (await outcome(() => accounts.signup(hijack, ip(), ctx))) === "ok");
  check(
    "...but only emails the owner a notice, and changes nothing",
    outbox.length === mailsBefore + 1 &&
      outbox.at(-1)!.message.subject.includes("already have") &&
      (await accounts.getKeys(aliceId, ctx)).wrappedKeyPassword === alice.wrappedKeyPassword,
  );

  console.log("\nTest 4: sign-in");
  check(
    "A wrong auth key is rejected",
    (await outcome(() => accounts.login({ email: alice.email, authKey: b64(32) }, ctx))) === "invalid_credentials",
  );
  check(
    "An unknown email gets the same answer",
    (await outcome(() => accounts.login({ email: "nobody@example.com", authKey: b64(32) }, ctx))) === "invalid_credentials",
  );
  const aliceLaptop = await accounts.login({ email: alice.email, authKey: alice.authKey, deviceName: "iPhone" }, ctx);
  check("The right auth key signs in", aliceLaptop.user.id === aliceId);

  console.log("\nTest 5: refresh tokens rotate, and a replayed one ends the session");
  const r1 = await accounts.refresh(aliceLaptop.refreshToken, ctx);
  check("Refreshing returns a new refresh token", r1.refreshToken !== aliceLaptop.refreshToken && !!r1.accessToken);
  const r2 = await accounts.refresh(r1.refreshToken, ctx);
  check("The new one works once", !!r2.refreshToken);
  check(
    "Replaying an already-used token is refused",
    (await outcome(() => accounts.refresh(r1.refreshToken, ctx))) === "unauthorized",
  );
  check(
    "...and the replay also killed the current token",
    (await outcome(() => accounts.refresh(r2.refreshToken, ctx))) === "unauthorized",
  );
  check("Other devices' sessions are untouched", (await outcome(() => accounts.refresh(aliceSession.refreshToken, ctx))) === "ok");
  const phone = await accounts.login({ email: alice.email, authKey: alice.authKey }, ctx);
  await accounts.logout(phone.refreshToken, ctx);
  check("Signing out ends that session", (await outcome(() => accounts.refresh(phone.refreshToken, ctx))) === "unauthorized");
  const expiring = await accounts.login({ email: alice.email, authKey: alice.authKey }, ctx);
  now += 61 * 24 * 60 * 60_000;
  check("A session unused for 60 days expires", (await outcome(() => accounts.refresh(expiring.refreshToken, ctx))) === "unauthorized");

  console.log("\nTest 6: push and pull");
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
  const p1 = await records.push(aliceId, [record(a, hlc(T0)), record(b, hlc(T0 + 1)), record(c, hlc(T0 + 2))], ctx);
  check("New records are accepted", p1.accepted.length === 3 && p1.stale.length === 0);
  const all = await records.pull(aliceId, 0, 100, ctx);
  check(
    "Pull returns them in server order with increasing seqs",
    all.records.length === 3 && all.records.every((r, i) => i === 0 || r.serverSeq > all.records[i - 1].serverSeq),
  );
  check("The cursor is the last seq and nothing more is waiting", all.cursor === all.records[2].serverSeq && !all.hasMore);
  const nothing = await records.pull(aliceId, all.cursor, 100, ctx);
  check("Pulling from the cursor returns nothing new", nothing.records.length === 0 && nothing.cursor === all.cursor);

  console.log("\nTest 7: last writer wins by HLC");
  const older = await records.push(aliceId, [record(a, hlc(T0 - 5_000))], ctx);
  check("An older write is reported stale and not stored", older.stale.includes(a) && older.accepted.length === 0);
  const sameHlc = await records.push(aliceId, [record(a, hlc(T0))], ctx);
  check("A write with the same HLC is stale too", sameHlc.stale.includes(a));
  const newerCipher = b64(120);
  const newer = await records.push(aliceId, [record(a, hlc(T0 + 10_000), { ciphertext: newerCipher })], ctx);
  const afterNewer = await records.pull(aliceId, all.cursor, 100, ctx);
  check("A later write replaces the row", newer.accepted.includes(a) && afterNewer.records[0]?.ciphertext === newerCipher);
  check("...and comes back on the next pull with a new seq", afterNewer.records.length === 1 && afterNewer.cursor > all.cursor);
  const batch = await records.push(
    aliceId,
    [record(b, hlc(T0 + 30_000), { ciphertext: "A".repeat(80) }), record(b, hlc(T0 + 20_000)), record(b, hlc(T0 + 25_000))],
    ctx,
  );
  const [rowB] = await db.select().from(schema.syncRecords).where(eq(schema.syncRecords.id, b));
  check("Within one push, the latest write to a row wins", batch.accepted.length === 1 && rowB.hlc === hlc(T0 + 30_000));
  check(
    "A later counter beats an earlier one in the same millisecond",
    (await records.push(aliceId, [record(b, hlc(T0 + 30_000, 1))], ctx)).accepted.length === 1,
  );

  console.log("\nTest 8: tombstones and the storage quota");
  const [userBefore] = await db.select().from(schema.syncUsers).where(eq(schema.syncUsers.id, aliceId));
  const tomb = await records.push(aliceId, [record(c, hlc(T0 + 40_000), { deleted: true, ciphertext: null })], ctx);
  const [userAfter] = await db.select().from(schema.syncUsers).where(eq(schema.syncUsers.id, aliceId));
  const pulledTomb = (await records.pull(aliceId, 0, 100, ctx)).records.find((r) => r.id === c);
  check("A tombstone is accepted and pulled as deleted", tomb.accepted.includes(c) && pulledTomb?.deleted === true && pulledTomb.ciphertext === null);
  check("...and frees its storage", userAfter.storageBytes === userBefore.storageBytes - 160, `${userBefore.storageBytes} -> ${userAfter.storageBytes}`);
  const big = Array.from({ length: 30 }, (_, i) => record(randomUUID(), hlc(T0 + 50_000 + i)));
  check("A push that would exceed the quota is refused", (await outcome(() => records.push(aliceId, big, ctx))) === "quota_exceeded");
  const [userQuota] = await db.select().from(schema.syncUsers).where(eq(schema.syncUsers.id, aliceId));
  check("...and stores nothing", userQuota.storageBytes === userAfter.storageBytes && userQuota.seq === userAfter.seq);
  const storedSize = (await db.select().from(schema.syncRecords).where(eq(schema.syncRecords.userId, aliceId))).reduce(
    (n, r) => n + r.size,
    0,
  );
  check("storage_bytes matches the stored ciphertext", storedSize === userQuota.storageBytes, `${storedSize} vs ${userQuota.storageBytes}`);

  console.log("\nTest 9: pages");
  for (let i = 0; i < 3; i++) await records.push(aliceId, [record(randomUUID(), hlc(T0 + 60_000 + i), { ciphertext: b64(60) })], ctx);
  const page1 = await records.pull(aliceId, 0, 2, ctx);
  const page2 = await records.pull(aliceId, page1.cursor, 2, ctx);
  check("A limited pull says there's more", page1.records.length === 2 && page1.hasMore);
  check("The next page carries on from the cursor", page2.records[0].serverSeq > page1.cursor);
  let cursor = 0;
  let seen = 0;
  for (let more = true; more; ) {
    const page = await records.pull(aliceId, cursor, 2, ctx);
    seen += page.records.length;
    cursor = page.cursor;
    more = page.hasMore;
  }
  const stored = await db.select().from(schema.syncRecords).where(eq(schema.syncRecords.userId, aliceId));
  check("Paging to the end returns every stored record exactly once", seen === stored.length, `${seen} vs ${stored.length}`);

  console.log("\nTest 10: users are isolated");
  const bob = { email: "bob@example.com", authKey: b64(32), kdf: kdf(), wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) };
  await accounts.signup(bob, ip(), ctx);
  const bobSession = await accounts.verifyEmail({ email: bob.email, code: lastCode(bob.email) }, ctx);
  const bobId = bobSession.user.id;
  const bobPush = await records.push(bobId, [record(a, hlc(T0 - 99_000))], ctx);
  check("Bob can use the same record id as Alice (ids are per user)", bobPush.accepted.includes(a));
  const alicesA = (await records.pull(aliceId, 0, 100, ctx)).records.find((r) => r.id === a);
  check("...without touching Alice's row", alicesA?.ciphertext === newerCipher);
  const bobAll = await records.pull(bobId, 0, 100, ctx);
  check("Bob pulls only his own record, from seq 1", bobAll.records.length === 1 && bobAll.records[0].serverSeq === 1);

  console.log("\nTest 11: concurrent pushes get distinct, gap-free seqs");
  const [{ seq: seqBefore }] = await db.select().from(schema.syncUsers).where(eq(schema.syncUsers.id, bobId));
  await Promise.all(
    Array.from({ length: 5 }, (_, i) => records.push(bobId, [record(randomUUID(), hlc(T0 + i)), record(randomUUID(), hlc(T0 + i))], ctx)),
  );
  const bobSeqs = (await records.pull(bobId, seqBefore, 100, ctx)).records.map((r) => r.serverSeq);
  check(
    "10 records, seqs consecutive",
    bobSeqs.length === 10 && bobSeqs.every((s, i) => s === seqBefore + 1 + i),
    bobSeqs.join(","),
  );

  console.log("\nTest 12: keys and key versions");
  check(
    "A record encrypted under another key version is refused",
    (await outcome(() => records.push(aliceId, [record(randomUUID(), hlc(T0 + 70_000), { keyVersion: 2 })], ctx))) === "key_changed",
  );
  check(
    "Skipping a key version is refused",
    (await outcome(() => accounts.putKeys(aliceId, { keyVersion: 3, wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) }, ctx))) ===
      "key_changed",
  );
  const rotated = await accounts.putKeys(aliceId, { keyVersion: 2, wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) }, ctx);
  check("Moving to the next key version works", rotated.keyVersion === 2);
  check(
    "Old-version records are now refused",
    (await outcome(() => records.push(aliceId, [record(randomUUID(), hlc(T0 + 70_000))], ctx))) === "key_changed",
  );
  const reencrypted = await records.push(aliceId, [record(a, hlc(T0 + 10_000), { keyVersion: 2 })], ctx);
  check("Re-encrypting a row under the new key at the same HLC replaces it", reencrypted.accepted.includes(a));
  check("The pull reports the current key version", (await records.pull(aliceId, 0, 1, ctx)).keyVersion === 2);

  console.log("\nTest 13: password reset");
  const deviceBeforeReset = await accounts.login({ email: alice.email, authKey: alice.authKey }, ctx);
  await accounts.requestPasswordReset(alice.email, ctx);
  const resetCode = lastCode(alice.email);
  check("A reset code was emailed", outbox.at(-1)!.message.subject.includes("reset") && resetCode.length === 6);
  const mailsBeforeUnknown = outbox.length;
  await accounts.requestPasswordReset("nobody@example.com", ctx);
  check("Resetting an unknown email sends nothing (and doesn't say so)", outbox.length === mailsBeforeUnknown);
  check(
    "A verify code can't be used as a reset code",
    (await outcome(() =>
      accounts.confirmPasswordReset(
        { email: bob.email, code: lastCode(bob.email), authKey: b64(32), kdf: kdf(), wrappedKeyPassword: null },
        ctx,
      ),
    )) === "invalid_code",
  );
  const newAuthKey = b64(32);
  const newKdf = kdf();
  const afterReset = await accounts.confirmPasswordReset(
    { email: alice.email, code: resetCode, authKey: newAuthKey, kdf: newKdf, wrappedKeyPassword: null },
    ctx,
  );
  check(
    "Reset signs in, clears the password-wrapped key, keeps the recovery one",
    afterReset.keys.wrappedKeyPassword === null && afterReset.keys.wrappedKeyRecovery === rotated.wrappedKeyRecovery,
  );
  check("Every earlier session is signed out", (await outcome(() => accounts.refresh(deviceBeforeReset.refreshToken, ctx))) === "unauthorized");
  check("The old auth key no longer works", (await outcome(() => accounts.login({ email: alice.email, authKey: alice.authKey }, ctx))) === "invalid_credentials");
  check("The new one does", (await outcome(() => accounts.login({ email: alice.email, authKey: newAuthKey }, ctx))) === "ok");
  check("prelogin now returns the new salt", (await accounts.prelogin(alice.email, ctx)).salt === newKdf.salt);
  const rewrapped = await accounts.putKeys(aliceId, { keyVersion: 2, wrappedKeyPassword: b64(72), wrappedKeyRecovery: rotated.wrappedKeyRecovery }, ctx);
  check("A device holding the data key can re-wrap it afterwards", rewrapped.wrappedKeyPassword !== null && rewrapped.keyVersion === 2);
  check("Records survive a reset", (await records.pull(aliceId, 0, 100, ctx)).records.length === stored.length);

  console.log("\nTest 14: wiping the cloud copy and deleting the account");
  await records.wipeRecords(aliceId, ctx);
  const [wiped] = await db.select().from(schema.syncUsers).where(eq(schema.syncUsers.id, aliceId));
  check(
    "Wiping deletes every record and zeroes storage, but keeps the seq counter",
    (await records.pull(aliceId, 0, 100, ctx)).records.length === 0 && wiped.storageBytes === 0 && wiped.seq > 0,
  );
  check(
    "Deleting the account needs the auth key",
    (await outcome(() => accounts.deleteAccount(bobId, b64(32), ctx))) === "invalid_credentials",
  );
  await accounts.deleteAccount(bobId, bob.authKey, ctx);
  const bobLeft = await db.select().from(schema.syncRecords).where(eq(schema.syncRecords.userId, bobId));
  const bobSessions = await db.select().from(schema.syncSessions).where(eq(schema.syncSessions.userId, bobId));
  check("Deleting the account removes its records and sessions", bobLeft.length === 0 && bobSessions.length === 0);
  check("A still-valid access token for it no longer works", (await outcome(() => records.pull(bobId, 0, 10, ctx))) === "unauthorized");

  console.log("\nTest 15: abuse limits and cleanup");
  const signupAs = (email: string, from = ip()) =>
    outcome(() => accounts.signup({ ...alice, email, kdf: kdf() }, from, ctx));
  check("Sign-ups from one address are throttled", await (async () => {
    const shared = ip();
    for (let i = 0; i < 5; i++) await signupAs(`throttle${i}@example.com`, shared);
    return (await signupAs("throttle5@example.com", shared)) === "rate_limited";
  })());
  // maxUsers is 5: alice + throttle0..3 filled it, so throttle4 was already refused
  check("Sign-ups stop at the configured user cap", (await signupAs("late@example.com")) === "signups_closed");
  check("...but an unverified sign-up can still be redone", (await signupAs("throttle0@example.com")) === "ok");
  await accounts.login({ email: alice.email, authKey: newAuthKey }, ctx);
  now += 61 * 24 * 60 * 60_000;
  const pruned = await records.pruneSyncData(ctx);
  const left = await db.select({ email: schema.syncUsers.email }).from(schema.syncUsers);
  check(
    "Pruning removes week-old unverified sign-ups and expired sessions/codes, and keeps verified users",
    pruned.unverifiedUsers === 4 && pruned.sessions >= 1 && left.length === 1 && left[0].email === alice.email,
    JSON.stringify(pruned),
  );
  const loginFailures: string[] = [];
  for (let i = 0; i < 9; i++) loginFailures.push(await outcome(() => accounts.login({ email: alice.email, authKey: b64(32) }, ctx)));
  check("The 9th wrong sign-in in a row is throttled", loginFailures.at(-1) === "rate_limited" && loginFailures[7] === "invalid_credentials");
  check("...even with the right auth key", (await outcome(() => accounts.login({ email: alice.email, authKey: newAuthKey }, ctx))) === "rate_limited");
  const parallel = await Promise.all(
    Array.from({ length: 12 }, () => outcome(() => accounts.login({ email: "carol@example.com", authKey: b64(32) }, ctx))),
  );
  check(
    "Parallel guesses can't slip past the limit",
    parallel.filter((o) => o === "invalid_credentials").length === 8,
    parallel.join(","),
  );

  console.log("\nTest 16: request validation");
  const goodRecord = record(randomUUID(), hlc(T0));
  check("A well-formed push parses", pushSchema.safeParse({ records: [goodRecord] }).success);
  check("A malformed HLC is rejected", !pushSchema.safeParse({ records: [{ ...goodRecord, hlc: "yesterday" }] }).success);
  check("A live record without ciphertext is rejected", !pushSchema.safeParse({ records: [{ ...goodRecord, ciphertext: null }] }).success);
  check("An unknown collection is rejected", !pushSchema.safeParse({ records: [{ ...goodRecord, collection: "users" }] }).success);
  check(
    "Ciphertext over the size limit is rejected",
    !pushSchema.safeParse({ records: [{ ...goodRecord, ciphertext: "A".repeat(SYNC_LIMITS.recordCiphertext + 4) }] }).success,
  );
  check(
    "More records than the push limit are rejected",
    !pushSchema.safeParse({ records: Array.from({ length: SYNC_LIMITS.pushRecords + 1 }, () => goodRecord) }).success,
  );
  check("An auth key that isn't 32 bytes is rejected", !signupSchema.safeParse({ ...alice, authKey: b64(31) }).success);
  const parsedEmail = signupSchema.safeParse({ ...alice, email: "  Alice@Example.COM " });
  check("Emails are trimmed and lower-cased", parsedEmail.success && parsedEmail.data.email === "alice@example.com");
  check("Weak KDF settings are rejected", !signupSchema.safeParse({ ...alice, kdf: { ...alice.kdf, memLimit: 1024 } }).success);

  console.log("\nTest 16: the daily rate run tracks core's currencies, prunes retired ones, and is repeatable");
  const { refreshAllRates } = await import("../src/lib/fx");
  const { CURRENCIES } = await import("@pernce/core/currency");
  await db.insert(schema.currencies).values({ code: "BGN", name: "Bulgarian Lev", symbol: "лв" });
  await db.insert(schema.exchangeRates).values({ currency: "BGN", rateToUsd: "0.57", source: "old", updatedAt: new Date() });
  const quotes = { usd: Object.fromEntries(CURRENCIES.map((c) => [c.code.toLowerCase(), 4])) };
  const updated = await refreshAllRates({ db, quotes });
  const trackedAfter = (await db.select().from(schema.currencies)).map((c) => c.code).sort();
  const ratesAfter = await db.select().from(schema.exchangeRates);
  check("Every core currency is tracked and the retired one is gone", JSON.stringify(trackedAfter) === JSON.stringify(CURRENCIES.map((c) => c.code).sort()));
  check("The retired currency's cached rate is gone too", !ratesAfter.some((r) => r.currency === "BGN"));
  check("A rate is stored for every currency but USD, inverted to 1 unit -> USD", updated.length === CURRENCIES.length - 1 && ratesAfter.length === updated.length && ratesAfter.find((r) => r.currency === "ZAR")?.rateToUsd === "0.25");
  await refreshAllRates({ db, quotes: { usd: Object.fromEntries(CURRENCIES.map((c) => [c.code.toLowerCase(), 5])) } });
  check("A second run updates in place", (await db.select().from(schema.exchangeRates)).length === ratesAfter.length && (await db.select().from(schema.exchangeRates).where(eq(schema.exchangeRates.currency, "ZAR")))[0].rateToUsd === "0.2");

  console.log(`\n${passed} passed, ${failed} failed.`);
  return failed;
}
