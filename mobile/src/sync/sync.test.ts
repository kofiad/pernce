import assert from "node:assert/strict";
import { before, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { DEFAULT_CATEGORIES } from "@pernce/core";
import * as schema from "../db/schema";
import { createAccount, getAccountWithBalance, listAccounts, updateAccount } from "../data/accounts";
import { budgetsForMonth, setBudget } from "../data/budgets";
import { listCategories, updateCategory } from "../data/categories";
import { PAGE_ROWS, type DB } from "../data/db";
import { getProfile, setupProfile } from "../data/profile";
import { setRateOverride, getRatesMap } from "../data/rates";
import { createTestDb } from "../data/test-utils";
import { createTransaction, deleteTransaction, getTransaction, listTransactions, updateTransaction } from "../data/transactions";
import {
  confirmPasswordReset,
  deleteCloudAccount,
  dropOrphanedSyncState,
  finishSignup,
  newRecoveryKey,
  recoverWithKey,
  requestPasswordReset,
  retryKey,
  signIn,
  signOut,
  startOver,
  startSignup,
  unlockWithPassword,
  verifyAndSignIn,
} from "./account";
import { COLLECTION_BY_NAME, toPayload } from "./collections";
import type { SyncContext } from "./context";
import {
  decryptRecord,
  derivePasswordKeys,
  encryptRecord,
  formatRecoveryKey,
  fromBase64,
  newKdf,
  parseRecoveryKey,
  randomKey,
  toBase64,
  unwrapDataKey,
  utf8Decode,
  utf8Encode,
  wrapDataKey,
} from "./crypto";
import { SyncApi } from "./api";
import { runSync } from "./engine";
import { collectOutbox, countOutbox, hasOutbox } from "./outbox";
import { getCursor, getSyncStatus, recordSyncResult, repullIfCurrenciesChanged, setCursor, setSyncState, syncNotice } from "./state";
import { LEGACY_SECRET_KEYS, SECRET_KEYS } from "./secretKeys";
import { FakeSyncServer, installTestCrypto, testDevice } from "./test-server";

const EMAIL = "ama@example.com";
const PASSWORD = "correct horse battery";

before(installTestCrypto);

async function device(server: FakeSyncServer, name: string, base?: string) {
  const db = await createTestDb();
  if (base) setupProfile(db, { name, baseCurrency: base });
  return testDevice(db, server, name);
}

/** Signs up on `ctx` and returns the recovery key. */
async function signUp(server: FakeSyncServer, ctx: SyncContext) {
  const pending = await startSignup(ctx, EMAIL, PASSWORD);
  const result = await finishSignup(ctx, pending, server.codes.get(EMAIL)!);
  assert.equal(result.state, "on");
  return pending.recoveryKey;
}

async function sync(...devices: SyncContext[]) {
  for (const d of devices) {
    const r = await runSync(d);
    assert.ok(r.ok, `sync failed on ${d.deviceName}: ${!r.ok && r.error}`);
  }
}

/** Everything a user can see, by id, for comparing two devices. */
function snapshot(db: DB) {
  return {
    profile: getProfile(db),
    accounts: listAccounts(db, { includeArchived: true }).map((a) => ({ id: a.id, name: a.name, balance: a.balance })),
    categories: listCategories(db, { includeArchived: true }).map((c) => ({ id: c.id, name: c.name, color: c.color })),
    transactions: listTransactions(db).map(({ updatedAt: _u, ...t }) => t),
    budgets: budgetsForMonth(db, new Date(2026, 9, 1)).map((b) => ({ id: b.id, categoryId: b.categoryId, amount: b.amount })),
    rates: getRatesMap(db),
  };
}

const catId = (db: DB, name: string) => listCategories(db).find((c) => c.name === name)!.id;

// ---- crypto ----

test("base64 matches Node's, both ways", () => {
  for (let n = 0; n < 40; n++) {
    const bytes = new Uint8Array(Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + n) & 255)));
    assert.equal(toBase64(bytes), Buffer.from(bytes).toString("base64"));
    assert.deepEqual(fromBase64(Buffer.from(bytes).toString("base64")), bytes);
  }
  assert.throws(() => fromBase64("abc"), /Invalid base64/);
});

test("UTF-8 matches Node's", () => {
  for (const text of ["", "Market", "Café crème", "₵ 50 · ₦ 20", "Ama 👩🏾‍💻", "\u0000x"]) {
    assert.deepEqual(utf8Encode(text), new Uint8Array(Buffer.from(text, "utf8")));
    assert.equal(utf8Decode(utf8Encode(text)), text);
  }
});

test("recovery keys round-trip and forgive look-alike characters", () => {
  const key = randomKey();
  const text = formatRecoveryKey(key);
  assert.match(text, /^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.deepEqual(parseRecoveryKey(text), key);
  assert.deepEqual(parseRecoveryKey(` ${text.toLowerCase().replace(/-/g, " ")} `), key);
  assert.deepEqual(parseRecoveryKey(text.replace(/0/g, "O").replace(/1/g, "l")), key);
  assert.equal(parseRecoveryKey(text.slice(5)), null);
  assert.equal(parseRecoveryKey(text.replace(/^./, "U")), null);
});

test("password keys follow the core contract and wrap the data key", () => {
  const kdf = { ...newKdf(), opsLimit: 1, memLimit: 8 * 1024 * 1024 };
  const a = derivePasswordKeys(PASSWORD, kdf);
  const b = derivePasswordKeys(PASSWORD.normalize("NFD"), kdf);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.authKey, a.wrapKey);
  assert.notDeepEqual(derivePasswordKeys("another password", kdf).wrapKey, a.wrapKey);

  const dataKey = randomKey();
  const wrapped = wrapDataKey(a.wrapKey, dataKey);
  assert.deepEqual(unwrapDataKey(a.wrapKey, wrapped), dataKey);
  assert.equal(unwrapDataKey(randomKey(), wrapped), null);
});

test("a record's ciphertext only opens as that record", () => {
  const key = randomKey();
  const id = "5b0c1a52-7c1e-4c8e-9d1e-3f5a2b6c7d8e";
  const ct = encryptRecord(key, "account", id, { name: "Checking" });
  assert.ok(ct.length >= 56);
  assert.deepEqual(decryptRecord(key, "account", id, ct), { name: "Checking" });
  assert.throws(() => decryptRecord(key, "account", "11111111-1111-4111-8111-111111111111", ct));
  assert.throws(() => decryptRecord(key, "category", id, ct));
  assert.throws(() => decryptRecord(randomKey(), "account", id, ct));
});

// ---- sync ----

test("offline data from one phone reaches a new phone, encrypted on the way", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "GHS");
  const usd = createAccount(a.db, { name: "Checking", type: "bank", currency: "USD", color: "primary", openingBalance: 100_00 });
  const xof = createAccount(a.db, { name: "Wave", type: "mobile_money", currency: "XOF", color: "accent-cyan", openingBalance: 5000_00 });
  createTransaction(a.db, { type: "expense", accountId: usd, categoryId: catId(a.db, "Groceries"), amount: 12_50, note: "Market", occurredAt: "2026-10-01" });
  createTransaction(a.db, { type: "transfer", accountId: usd, transferAccountId: xof, amount: 10_00, exchangeRate: 600, fee: 1_00, occurredAt: "2026-10-01" });
  setRateOverride(a.db, "GHS", 0.08);

  await signUp(server, a);
  assert.equal(hasOutbox(a.db), true);
  await sync(a);
  assert.equal(hasOutbox(a.db), false);

  // The server holds ciphertext only.
  const stored = [...[...server.users.values()][0].records.values()];
  assert.equal(stored.length, 2 + 2 + DEFAULT_CATEGORIES.length + 1 + 1);
  for (const r of stored) assert.ok(r.ciphertext && !/Checking|Market|Groceries/.test(r.ciphertext));

  // A fresh install signs in without onboarding first.
  const b = await device(server, "B");
  assert.deepEqual(await signIn(b, EMAIL, PASSWORD), { state: "on" });
  await sync(b);
  assert.deepEqual(snapshot(b.db), snapshot(a.db));
  assert.equal(getAccountWithBalance(b.db, xof)!.balance, 5000_00 + 6000_00);
  assert.equal(hasOutbox(b.db), false, "pulled rows aren't pushed back");
});

test("payloads from builds before CFA centimes are read as whole francs", async () => {
  const db = await createTestDb();
  setupProfile(db, { baseCurrency: "USD" });
  const account = COLLECTION_BY_NAME.get("account")!;
  const raw = { createdAt: "2026-09-01T00:00:00.000Z", name: "Wave", type: "mobile_money", institution: null, color: "primary", icon: null, archived: false };
  assert.equal(account.parse(db, { ...raw, currency: "XOF", openingBalance: 5000 }).openingBalance, 5000_00);
  assert.equal(account.parse(db, { ...raw, currency: "XAF", openingBalance: 5000 }).openingBalance, 5000_00);
  assert.equal(account.parse(db, { ...raw, currency: "USD", openingBalance: 5000 }).openingBalance, 5000);
  // What this build pushes says so, and reads back unchanged.
  const pushed = toPayload({ id: "a", updatedAt: "x", deleted: false, ...raw, currency: "XOF", openingBalance: 5000_00 });
  assert.equal(pushed.cfaCentimes, true);
  assert.equal(account.parse(db, pushed).openingBalance, 5000_00);

  const budget = COLLECTION_BY_NAME.get("budget")!;
  const b = { createdAt: "2026-09-01T00:00:00.000Z", categoryId: catId(db, "Groceries"), period: "2026-09-01", currency: "XAF", color: null, icon: null };
  assert.equal(budget.parse(db, { ...b, amount: 200 }).amount, 200_00);
  assert.equal(budget.parse(db, { ...b, amount: 200_00, cfaCentimes: true }).amount, 200_00);
});

test("offline edits on two phones merge; balances agree; tombstones win over older edits", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  const acc = createAccount(a.db, { name: "Checking", type: "bank", currency: "USD", color: "primary", openingBalance: 0 });
  const t1 = createTransaction(a.db, { type: "income", accountId: acc, amount: 500_00, occurredAt: "2026-10-01" });
  const t2 = createTransaction(a.db, { type: "expense", accountId: acc, amount: 20_00, occurredAt: "2026-10-01" });
  await signUp(server, a);
  const b = await device(server, "B");
  await signIn(b, EMAIL, PASSWORD);
  await sync(a, b);

  // Both offline: A edits t1 and deletes t2 after B edits it; B adds one.
  updateTransaction(b.db, t2, { type: "expense", accountId: acc, amount: 25_00, occurredAt: "2026-10-01" });
  await new Promise((r) => setTimeout(r, 2));
  deleteTransaction(a.db, t2);
  updateTransaction(a.db, t1, { type: "income", accountId: acc, amount: 600_00, occurredAt: "2026-10-01" });
  createTransaction(b.db, { type: "expense", accountId: acc, amount: 5_00, occurredAt: "2026-10-02" });
  updateAccount(b.db, acc, { name: "Main", type: "bank", currency: "USD", color: "primary", openingBalance: 10_00 });

  await sync(a, b, a);
  assert.deepEqual(snapshot(a.db), snapshot(b.db));
  assert.equal(getTransaction(a.db, t2), null, "the later delete beat the earlier edit");
  assert.equal(getAccountWithBalance(a.db, acc)!.balance, 10_00 + 600_00 - 5_00);
  assert.equal(getAccountWithBalance(a.db, acc)!.name, "Main");
  // B keeps the tombstone (with its last data), not a hard delete.
  assert.equal(b.db.select().from(schema.transactions).where(eq(schema.transactions.id, t2)).get()!.deleted, true);
});

test("two phones that each set up offline merge their default categories and budgets", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  const b = await device(server, "B", "USD");
  const accA = createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 0 });
  createTransaction(a.db, { type: "expense", accountId: accA, categoryId: catId(a.db, "Groceries"), amount: 9_00, occurredAt: "2026-10-03" });
  setBudget(a.db, { categoryId: catId(a.db, "Groceries"), period: "2026-10-01", amount: 300_00, currency: "USD" });
  setBudget(b.db, { categoryId: catId(b.db, "Groceries"), period: "2026-10-01", amount: 250_00, currency: "USD" });
  updateCategory(b.db, catId(b.db, "Transport"), { name: "Transport", color: "accent-pink", icon: "car", spendingType: "essential" });
  setRateOverride(a.db, "GHS", 0.08);
  setRateOverride(b.db, "GHS", 0.09);

  await signUp(server, a);
  await signIn(b, EMAIL, PASSWORD);
  await sync(a, b, a);

  const sa = snapshot(a.db);
  assert.deepEqual(sa, snapshot(b.db));
  assert.equal(sa.categories.length, DEFAULT_CATEGORIES.length, "one of each default");
  assert.equal(listCategories(a.db).filter((c) => c.name === "Groceries").length, 1);
  assert.equal(sa.budgets.length, 1, "one Groceries budget for October");
  assert.equal(sa.budgets[0].categoryId, catId(a.db, "Groceries"));
  assert.equal(sa.transactions[0].categoryId, catId(a.db, "Groceries"), "references moved to the winner");
  assert.ok(sa.profile, "one profile");
  assert.equal(a.db.select().from(schema.profile).where(eq(schema.profile.deleted, false)).all().length, 1);
  assert.equal(
    a.db.select().from(schema.rateOverrides).where(and(eq(schema.rateOverrides.deleted, false), eq(schema.rateOverrides.currency, "GHS"))).all().length,
    1,
  );
  assert.equal(hasOutbox(a.db), false);
  assert.equal(hasOutbox(b.db), false);
});

test("pulls page through the cursor and resume where they stopped", async () => {
  const server = new FakeSyncServer();
  server.pageSize = 7;
  const a = await device(server, "A", "USD");
  const acc = createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 0 });
  for (let i = 1; i <= 30; i++) createTransaction(a.db, { type: "income", accountId: acc, amount: i, occurredAt: "2026-10-01" });
  await signUp(server, a);
  await sync(a);
  const b = await device(server, "B");
  await signIn(b, EMAIL, PASSWORD);
  await sync(b);
  assert.equal(getAccountWithBalance(b.db, acc)!.balance, (30 * 31) / 2);
  const pulls = server.requests.filter((r) => r === "GET pull").length;
  assert.ok(pulls > 6, `paged (${pulls} pulls)`);
});

test("rows that break the money rules are rejected, not applied", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  const acc = createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 0 });
  await signUp(server, a);
  await sync(a);
  const dataKey = (await a.secrets.getDataKey())!;
  const user = [...server.users.values()][0];
  const forge = (id: string, payload: object) =>
    user.records.set(id, {
      id,
      collection: "transaction",
      hlc: "9999999999999-0000-evil",
      deleted: false,
      keyVersion: 1,
      ciphertext: encryptRecord(dataKey, "transaction", id, payload),
      serverSeq: ++user.seq,
    });
  const base = { createdAt: "x", accountId: acc, categoryId: null, transferAccountId: null, type: "income", currency: "USD", transferAmount: null, transferCurrency: null, exchangeRate: null, fee: 0, note: null, occurredAt: "2026-10-01" };
  forge("aaaaaaaa-0000-4000-8000-000000000001", { ...base, amount: 100, currency: "GHS" }); // wrong currency for the account
  forge("aaaaaaaa-0000-4000-8000-000000000002", { ...base, amount: -5 });
  forge("aaaaaaaa-0000-4000-8000-000000000003", { ...base, amount: 1.5 });
  forge("aaaaaaaa-0000-4000-8000-000000000004", { ...base, amount: 100 }); // fine
  const result = await runSync(a);
  assert.ok(result.ok && result.rejected === 3);
  assert.equal(getAccountWithBalance(a.db, acc)!.balance, 100);
  assert.equal(getSyncStatus(a.db).rejected, 3);
});

test("records skipped for an unknown currency are applied after an update, not before", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  await signUp(server, a);
  await sync(a);
  const dataKey = (await a.secrets.getDataKey())!;
  const user = [...server.users.values()][0];
  const id = "bbbbbbbb-0000-4000-8000-000000000001";
  const account = (currency: string) => ({
    createdAt: "x",
    name: "Rand",
    type: "cash",
    institution: null,
    currency,
    color: "primary",
    icon: null,
    openingBalance: 50000,
    archived: false,
  });
  const store = (currency: string, seq: number) =>
    user.records.set(id, {
      id,
      collection: "account",
      hlc: "9999999999999-0000-newer",
      deleted: false,
      keyVersion: 1,
      ciphertext: encryptRecord(dataKey, "account", id, account(currency)),
      serverSeq: seq,
    });

  // A build that doesn't know the currency skips the record, and its pull
  // cursor moves on.
  store("QQQ", ++user.seq);
  const first = await runSync(a);
  assert.ok(first.ok && first.rejected === 1);
  assert.equal(listAccounts(a.db).length, 0);

  // The same record, now readable (as after an update): the cursor is past
  // it, so with the same set of currencies it stays skipped...
  store("ZAR", user.seq);
  await sync(a);
  assert.equal(listAccounts(a.db).length, 0);

  // ...and a changed set pulls everything again and applies it.
  a.currencySignature = "after-update";
  await sync(a);
  assert.deepEqual(listAccounts(a.db).map((x) => x.currency), ["ZAR"]);
  assert.equal(getSyncStatus(a.db).rejected, 0);
});

test("a pull that can't be saved shows why, counts the failures, and recovers", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  const acc = createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 0 });
  await signUp(server, a);
  await sync(a);
  const b = await device(server, "B");
  await signIn(b, EMAIL, PASSWORD);
  // A transaction left open, as when a failed write's rollback fails too
  // (Safari's web database): every later transaction fails at "begin".
  b.db.run(sql`begin`);
  const failed = await runSync(b);
  assert.ok(!failed.ok);
  assert.match(failed.error, /^Couldn't save downloaded changes: Failed to run the query 'begin': .*transaction within a transaction/);
  const status = getSyncStatus(b.db);
  assert.equal(status.lastError, failed.error);
  assert.equal(status.failures, 1);
  assert.ok(status.failingSince);
  // The leftover transaction was rolled back, so the next run applies it.
  await sync(b);
  assert.equal(getAccountWithBalance(b.db, acc)?.name, "Cash");
  assert.deepEqual(
    (({ lastError, failures, failingSince }) => ({ lastError, failures, failingSince }))(getSyncStatus(b.db)),
    { lastError: null, failures: 0, failingSince: null },
  );
});

test("expired access tokens refresh; a replayed refresh token ends the session", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  await signUp(server, a);
  await sync(a);
  const before = (await a.secrets.getSession())!;
  server.now += 16 * 60 * 1000;
  await sync(a);
  const after = (await a.secrets.getSession())!;
  assert.notEqual(after.refreshToken, before.refreshToken);

  // Someone else replays the old token: the server ends the session.
  await server.fetch("https://sync.test/api/sync/refresh", { method: "POST", body: JSON.stringify({ refreshToken: before.refreshToken }) });
  server.now += 16 * 60 * 1000;
  const r = await runSync(a);
  assert.equal(r.ok, false);
  assert.equal(getSyncStatus(a.db).state, "signed_out");
  assert.equal(await a.secrets.getSession(), null);
  assert.ok(await a.secrets.getDataKey(), "keeps the data key so a later sign-in can re-wrap it");
});

test("a refresh whose reply is lost is retried with the old token, and the device stays signed in", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  await signUp(server, a);
  await sync(a);
  server.now += 16 * 60 * 1000;
  // The server rotates the token, but the reply never arrives (lost signal,
  // the app suspended mid-request).
  let drop = true;
  const lossy: typeof fetch = async (input, init) => {
    const res = await server.fetch(input, init);
    if (drop && String(input).endsWith("/refresh")) {
      drop = false;
      throw new TypeError("Network request failed");
    }
    return res;
  };
  const phone = { ...a, api: new SyncApi({ baseUrl: () => "https://sync.test", sessions: a.secrets, fetch: lossy, now: () => server.now, onSessionEnded: () => setSyncState(a.db, "signed_out") }) };
  const failed = await runSync(phone);
  assert.equal(failed.ok, false);
  assert.match(!failed.ok ? failed.error : "", /Offline/);
  assert.equal(getSyncStatus(a.db).state, "on");
  await sync(phone);
  assert.equal(getSyncStatus(a.db).state, "on");
  assert.ok(await a.secrets.getSession());
});

test("two browser tabs sharing one stored session refresh together and both stay signed in", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  await signUp(server, a);
  await sync(a);
  // A Web Locks stand-in: one holder at a time.
  let queue = Promise.resolve();
  const lock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  const tab = () => ({ ...a, api: new SyncApi({ baseUrl: () => "https://sync.test", sessions: a.secrets, fetch: server.fetch, now: () => server.now, onSessionEnded: () => setSyncState(a.db, "signed_out"), lock }) });
  const [one, two] = [tab(), tab()];
  for (let round = 0; round < 3; round++) {
    server.now += 16 * 60 * 1000;
    const results = await Promise.all([runSync(one), runSync(two)]);
    assert.ok(results.every((r) => r.ok), JSON.stringify(results));
    assert.equal(getSyncStatus(a.db).state, "on");
  }
  // Without the lock both requests can carry the same token; the second is
  // treated as a retry, so neither tab is signed out.
  const bare = () => ({ ...a, api: new SyncApi({ baseUrl: () => "https://sync.test", sessions: a.secrets, fetch: server.fetch, now: () => server.now, onSessionEnded: () => setSyncState(a.db, "signed_out") }) });
  server.now += 16 * 60 * 1000;
  const results = await Promise.all([runSync(bare()), runSync(bare())]);
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  assert.equal(getSyncStatus(a.db).state, "on");
});

test("Home's sync banner: shown when signed out, locked, or failing for a day; hidden while sync works or is off", async () => {
  const db = await createTestDb();
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-11-27T12:00:00Z");
  assert.equal(syncNotice(getSyncStatus(db), now), null);
  setSyncState(db, "on");
  recordSyncResult(db, { error: null, at: "2026-11-24T09:00:00Z" });
  assert.equal(syncNotice(getSyncStatus(db), now), null);
  recordSyncResult(db, { error: "Offline.", at: new Date(now - day + 60_000).toISOString() });
  assert.equal(syncNotice(getSyncStatus(db), now), null, "under a day of failures is not worth a banner");
  assert.deepEqual(syncNotice(getSyncStatus(db), now + 120_000), {
    title: "Sync isn’t working",
    body: "Last synced 24 Nov. Changes stay on this device.",
    action: "Details",
  });
  recordSyncResult(db, { error: null });
  assert.equal(syncNotice(getSyncStatus(db), now + 120_000), null);
  setSyncState(db, "signed_out");
  assert.equal(syncNotice(getSyncStatus(db), now)?.action, "Sign in");
  setSyncState(db, "needs_key");
  assert.equal(syncNotice(getSyncStatus(db), now)?.action, "Unlock");
});

test("forgot password with the recovery key: other phones sign in again with the new password", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 7_00 });
  const recoveryKey = await signUp(server, a);
  await sync(a);

  const c = await device(server, "C");
  await requestPasswordReset(c, EMAIL);
  const result = await confirmPasswordReset(c, { email: EMAIL, code: server.codes.get(EMAIL)!, password: "a brand new password", recoveryKey });
  assert.equal(result.state, "on");
  await sync(c);
  assert.deepEqual(snapshot(c.db), snapshot(a.db));

  // The reset signed A out; the new password works there.
  assert.equal((await runSync(a)).ok, false);
  assert.equal(getSyncStatus(a.db).state, "signed_out");
  await assert.rejects(signIn(a, EMAIL, PASSWORD), /invalid_credentials/);
  assert.deepEqual(await signIn(a, EMAIL, "a brand new password"), { state: "on" });
  await sync(a);
});

test("forgot password without the recovery key: a phone that still has the key restores access", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 7_00 });
  await signUp(server, a);
  await sync(a);

  const c = await device(server, "C");
  await requestPasswordReset(c, EMAIL);
  const reset = await confirmPasswordReset(c, { email: EMAIL, code: server.codes.get(EMAIL)!, password: "a brand new password" });
  assert.equal(reset.state, "needs_key");
  assert.equal((await runSync(c)).ok, false);
  assert.equal(await retryKey(c), false);

  // A was signed out by the reset but still holds the data key.
  await runSync(a);
  assert.deepEqual(await signIn(a, EMAIL, "a brand new password"), { state: "on" });
  assert.equal(await retryKey(c), true);
  await sync(c);
  assert.deepEqual(snapshot(c.db), snapshot(a.db));
});

test("a locked phone unlocks with the password once the key is wrapped for it", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 7_00 });
  await signUp(server, a);
  await sync(a);

  const c = await device(server, "C");
  await requestPasswordReset(c, EMAIL);
  await confirmPasswordReset(c, { email: EMAIL, code: server.codes.get(EMAIL)!, password: "a brand new password" });
  // Nobody has re-wrapped the key for the new password yet.
  await assert.rejects(unlockWithPassword(c, "a brand new password"), /recovery key/);

  await runSync(a);
  await signIn(a, EMAIL, "a brand new password");
  await assert.rejects(unlockWithPassword(c, "not the password"), /recovery key/);
  await unlockWithPassword(c, "a brand new password");
  assert.equal(getSyncStatus(c.db).state, "on");
  await sync(c);
  assert.deepEqual(snapshot(c.db), snapshot(a.db));
});

test("starting over with a new key: other phones follow it and re-upload their data", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  const acc = createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 0 });
  await signUp(server, a);
  const b = await device(server, "B");
  await signIn(b, EMAIL, PASSWORD);
  await sync(a, b);
  // B has an offline change when A starts over.
  createTransaction(b.db, { type: "income", accountId: acc, amount: 42_00, occurredAt: "2026-10-01" });

  const newKey = await startOver(a);
  assert.ok(parseRecoveryKey(newKey));
  await sync(a, b, a);
  assert.equal(getSyncStatus(b.db).state, "on");
  assert.deepEqual(snapshot(a.db), snapshot(b.db));
  assert.equal(getAccountWithBalance(a.db, acc)!.balance, 42_00);
  const user = [...server.users.values()][0];
  assert.ok([...user.records.values()].every((r) => r.keyVersion === 2));

  // The new recovery key opens the new data key; the old one doesn't.
  assert.ok(unwrapDataKey(parseRecoveryKey(newKey)!, user.keys.wrappedKeyRecovery));
});

test("a fresh recovery key replaces the old one", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  const first = await signUp(server, a);
  const second = await newRecoveryKey(a);
  const user = [...server.users.values()][0];
  assert.equal(unwrapDataKey(parseRecoveryKey(first)!, user.keys.wrappedKeyRecovery), null);
  assert.deepEqual(unwrapDataKey(parseRecoveryKey(second)!, user.keys.wrappedKeyRecovery), await a.secrets.getDataKey());
  await assert.rejects(recoverWithKey(a, first), /doesn't match/);
});

test("an interrupted sign-up finishes from sign-in with a new recovery key", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  await startSignup(a, EMAIL, PASSWORD);
  const started = await signIn(a, EMAIL, PASSWORD);
  assert.equal(started.state, "needs_code");
  if (started.state !== "needs_code") return;
  const done = await verifyAndSignIn(a, started.pending, server.codes.get(EMAIL)!);
  assert.equal(done.state, "on");
  assert.ok(done.recoveryKey && parseRecoveryKey(done.recoveryKey));
  await sync(a);
});

test("sync bookkeeping whose secrets are gone is forgotten; local data stays", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 1 });
  assert.equal(await dropOrphanedSyncState(a), false, "sync is off: nothing to drop");
  await signUp(server, a);
  await sync(a);
  assert.equal(await dropOrphanedSyncState(a), false, "secrets present");
  assert.equal(getSyncStatus(a.db).state, "on");
  a.secrets.values.clear(); // as after an in-place rename: the keychain keys are different
  assert.equal(await dropOrphanedSyncState(a), true);
  assert.equal(getSyncStatus(a.db).state, "off");
  assert.equal(getSyncStatus(a.db).user, null);
  assert.equal(listAccounts(a.db).length, 1);
});

test("orphan check: a session without keys isn't dropped; no secrets while needs_key is", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  await signUp(server, a);
  const session = (await a.secrets.getSession())!;
  a.secrets.values.clear();
  await a.secrets.setSession(session);
  assert.equal(await dropOrphanedSyncState(a), false, "session present, keys missing");
  assert.equal(getSyncStatus(a.db).state, "on");
  a.secrets.values.clear();
  setSyncState(a.db, "needs_key");
  assert.equal(await dropOrphanedSyncState(a), true);
  assert.equal(getSyncStatus(a.db).state, "off");
});

test("the old secret names never overlap the current ones", () => {
  for (const key of LEGACY_SECRET_KEYS) assert.ok(!Object.values(SECRET_KEYS).includes(key as never), key);
  assert.equal(LEGACY_SECRET_KEYS.length, Object.keys(SECRET_KEYS).length);
});

test("sign-out keeps local data; deleting the cloud account needs the password", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  createAccount(a.db, { name: "Cash", type: "cash", currency: "USD", color: "primary", openingBalance: 1 });
  await signUp(server, a);
  await sync(a);
  await signOut(a);
  assert.equal(getSyncStatus(a.db).state, "off");
  assert.equal(listAccounts(a.db).length, 1);
  assert.equal(a.secrets.values.size, 0);

  await signIn(a, EMAIL, PASSWORD);
  await assert.rejects(deleteCloudAccount(a, "wrong password"), /invalid_credentials/);
  await deleteCloudAccount(a, PASSWORD);
  assert.equal(server.users.size, 0);
  assert.equal(getSyncStatus(a.db).state, "off");
  assert.equal(listAccounts(a.db).length, 1);
});

test("an outbox bigger than one read page pushes everything", async () => {
  const server = new FakeSyncServer();
  const a = await device(server, "A", "USD");
  const usd = createAccount(a.db, { name: "Checking", type: "bank", currency: "USD", color: "primary", openingBalance: 0 });
  const n = 2 * PAGE_ROWS + 5;
  for (let i = 0; i < n; i++) {
    createTransaction(a.db, { type: "expense", accountId: usd, categoryId: catId(a.db, "Groceries"), amount: 100 + i, occurredAt: "2026-10-01" });
  }

  await signUp(server, a);
  const pending = collectOutbox(a.db).rows;
  assert.equal(countOutbox(a.db), pending.length);
  assert.equal(new Set(pending.map((r) => r.row.id)).size, pending.length);
  assert.ok(pending.length >= n + 1);

  await sync(a);
  assert.equal(countOutbox(a.db), 0);
  const b = await device(server, "B");
  assert.deepEqual(await signIn(b, EMAIL, PASSWORD), { state: "on" });
  await sync(b);
  assert.equal(listTransactions(b.db).length, n);
});

test("a changed currency set pulls everything again, once", async () => {
  const db = await createTestDb();
  repullIfCurrenciesChanged(db, "USD,GHS");
  setCursor(db, 42);
  recordSyncResult(db, { error: null, rejected: 3 });
  repullIfCurrenciesChanged(db, "USD,GHS");
  assert.equal(getCursor(db), 42, "same set: nothing changes");
  assert.equal(getSyncStatus(db).rejected, 3);
  repullIfCurrenciesChanged(db, "USD,GHS,ZAR");
  assert.equal(getCursor(db), 0, "new set: start from the beginning");
  assert.equal(getSyncStatus(db).rejected, 0, "skipped records are retried, so the count restarts");
});
