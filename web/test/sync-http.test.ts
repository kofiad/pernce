import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { formatHlc } from "@pernce/core/hlc";
import { b64, kdf, testApp } from "./helpers";

const T0 = 1_790_000_000_000;
const record = (id = randomUUID(), wall = T0) => ({
  id,
  collection: "transaction",
  hlc: formatHlc({ wall, counter: 0, node: "3f2a9c1e0b7d4e21" }),
  deleted: false,
  keyVersion: 1,
  ciphertext: b64(120),
});

/** Every sync route over HTTP: the happy path of a device's whole life, then
 * the error paths a client can hit. (The service logic is covered in depth by
 * scripts/sync-checks.ts; this checks the HTTP layer: paths, methods, status
 * codes, bodies, auth.) */
describe("sync API over HTTP", async () => {
  const t = await testApp();
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const alice = { email: "alice@example.com", authKey: b64(32), kdf: kdf(), wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) };
  let access = "";
  let refreshToken = "";
  let userId = "";

  test("prelogin: KDF params for an unknown email are stable and not an error", async () => {
    const a = await t.json("POST", "/api/sync/prelogin", { email: "ghost@example.com" });
    const b = await t.json("POST", "/api/sync/prelogin", { email: "ghost@example.com" });
    assert.equal(a.status, 200);
    const body = await a.json();
    assert.equal(body.kdf.algorithm, "argon2id");
    assert.deepEqual(body, await b.json());
  });

  test("signup: 202 {ok}, a code is emailed; signing in before verifying is 403", async () => {
    const res = await t.json("POST", "/api/sync/signup", alice, { "x-real-ip": "10.1.1.1" });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(t.lastCode(alice.email).length, 6);
    const login = await t.json("POST", "/api/sync/login", { email: alice.email, authKey: alice.authKey });
    assert.equal(login.status, 403);
    assert.equal((await login.json()).error, "email_not_verified");
  });

  test("verify: a wrong code is 400 invalid_code; the right one signs the device in", async () => {
    const code = t.lastCode(alice.email);
    const wrong = await t.json("POST", "/api/sync/verify", { email: alice.email, code: code === "000000" ? "111111" : "000000" });
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).error, "invalid_code");
    const res = await t.json("POST", "/api/sync/verify", { email: alice.email, code, deviceName: "Test" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.email, alice.email);
    assert.ok(body.accessToken && body.refreshToken && body.accessTokenExpiresAt);
    assert.equal(body.keys.keyVersion, 1);
    access = body.accessToken;
    refreshToken = body.refreshToken;
    userId = body.user.id;
  });

  test("login: wrong auth key is 401 invalid_credentials; the right one is 200", async () => {
    const bad = await t.json("POST", "/api/sync/login", { email: alice.email, authKey: b64(32) });
    assert.equal(bad.status, 401);
    assert.equal((await bad.json()).error, "invalid_credentials");
    const ok = await t.json("POST", "/api/sync/login", { email: alice.email, authKey: alice.authKey });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).user.id, userId);
  });

  test("keys: GET returns the wrapped keys, PUT stores re-wrapped ones", async () => {
    const got = await t.request("/api/sync/keys", { headers: bearer(access) });
    assert.equal(got.status, 200);
    assert.equal((await got.json()).wrappedKeyRecovery, alice.wrappedKeyRecovery);
    const next = { keyVersion: 1, wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) };
    const put = await t.json("PUT", "/api/sync/keys", next, bearer(access));
    assert.equal(put.status, 200);
    assert.equal((await put.json()).wrappedKeyPassword, next.wrappedKeyPassword);
    const conflict = await t.json("PUT", "/api/sync/keys", { ...next, keyVersion: 7 }, bearer(access));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, "key_changed");
  });

  test("push then pull: records round-trip and the cursor advances", async () => {
    const r1 = record();
    const r2 = record(randomUUID(), T0 + 1);
    const push = await t.json("POST", "/api/sync/push", { records: [r1, r2] }, bearer(access));
    assert.equal(push.status, 200);
    assert.deepEqual((await push.json()).accepted.sort(), [r1.id, r2.id].sort());
    const stale = await t.json("POST", "/api/sync/push", { records: [{ ...r1, hlc: record(r1.id, T0 - 1000).hlc }] }, bearer(access));
    assert.deepEqual((await stale.json()).stale, [r1.id]);

    const pull = await t.request("/api/sync/pull?since=0&limit=1", { headers: bearer(access) });
    assert.equal(pull.status, 200);
    const page = await pull.json();
    assert.equal(page.records.length, 1);
    assert.equal(page.hasMore, true);
    const rest = await (await t.request(`/api/sync/pull?since=${page.cursor}`, { headers: bearer(access) })).json();
    assert.equal(rest.records.length, 1);
    assert.equal(rest.hasMore, false);
  });

  test("push and pull validate their input with 400 bad_request", async () => {
    const badBody = await t.json("POST", "/api/sync/push", { records: [{ id: "nope" }] }, bearer(access));
    assert.equal(badBody.status, 400);
    assert.equal((await badBody.json()).error, "bad_request");
    const notJson = await t.request("/api/sync/push", { method: "POST", body: "{", headers: bearer(access) });
    assert.equal(notJson.status, 400);
    assert.equal((await notJson.json()).message, "Send a JSON body.");
    const badQuery = await t.request("/api/sync/pull?limit=0", { headers: bearer(access) });
    assert.equal(badQuery.status, 400);
  });

  test("refresh rotates the token; replaying the old one is 401 and ends the session", async () => {
    const res = await t.json("POST", "/api/sync/refresh", { refreshToken });
    assert.equal(res.status, 200);
    const next = await res.json();
    assert.ok(next.accessToken && next.refreshToken && next.refreshToken !== refreshToken);
    const replay = await t.json("POST", "/api/sync/refresh", { refreshToken });
    assert.equal(replay.status, 401);
    const dead = await t.json("POST", "/api/sync/refresh", { refreshToken: next.refreshToken });
    assert.equal(dead.status, 401);
  });

  test("logout: 200 {ok} and the refresh token no longer works", async () => {
    const login = await (await t.json("POST", "/api/sync/login", { email: alice.email, authKey: alice.authKey })).json();
    const out = await t.json("POST", "/api/sync/logout", { refreshToken: login.refreshToken });
    assert.equal(out.status, 200);
    assert.deepEqual(await out.json(), { ok: true });
    assert.equal((await t.json("POST", "/api/sync/refresh", { refreshToken: login.refreshToken })).status, 401);
  });

  test("records: DELETE wipes the cloud copy", async () => {
    const res = await t.request("/api/sync/records", { method: "DELETE", headers: bearer(access) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    const pull = await (await t.request("/api/sync/pull?since=0", { headers: bearer(access) })).json();
    assert.equal(pull.records.length, 0);
  });

  test("reset then reset/confirm: 202, then a new password signs this device in", async () => {
    const unknown = await t.json("POST", "/api/sync/reset", { email: "ghost@example.com" });
    assert.equal(unknown.status, 202);
    const before = t.outbox.length;
    t.clock.now += 61_000;
    const res = await t.json("POST", "/api/sync/reset", { email: alice.email });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(t.outbox.length, before + 1);
    const newAuthKey = b64(32);
    const confirm = await t.json("POST", "/api/sync/reset/confirm", {
      email: alice.email,
      code: t.lastCode(alice.email),
      authKey: newAuthKey,
      kdf: kdf(),
      wrappedKeyPassword: b64(72),
    });
    assert.equal(confirm.status, 200);
    const body = await confirm.json();
    assert.ok(body.accessToken && body.refreshToken);
    alice.authKey = newAuthKey;
    access = body.accessToken;
  });

  test("account: DELETE needs the auth key; then everything is gone", async () => {
    const wrong = await t.json("DELETE", "/api/sync/account", { authKey: b64(32) }, bearer(access));
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).error, "invalid_credentials");
    const res = await t.json("DELETE", "/api/sync/account", { authKey: alice.authKey }, bearer(access));
    assert.equal(res.status, 200);
    assert.equal((await t.request("/api/sync/keys", { headers: bearer(access) })).status, 401);
  });
});

describe("sync API auth and routing errors", async () => {
  const t = await testApp();

  test("protected endpoints without or with a bad token are 401 unauthorized", async () => {
    for (const [method, path] of [
      ["GET", "/api/sync/keys"],
      ["PUT", "/api/sync/keys"],
      ["GET", "/api/sync/pull"],
      ["POST", "/api/sync/push"],
      ["DELETE", "/api/sync/records"],
      ["DELETE", "/api/sync/account"],
      ["GET", "/api/sync/anything-else"],
    ]) {
      for (const headers of [{} as Record<string, string>, { authorization: "Bearer not.a.jwt" }, { authorization: "Basic abc" }]) {
        const res = await t.request(path, { method, headers });
        assert.equal(res.status, 401, `${method} ${path}`);
        assert.deepEqual(await res.json(), { error: "unauthorized", message: "Sign in again." });
      }
    }
  });

  test("a token signed with another secret, or an expired one, is 401", async () => {
    const { createAccessToken, deriveSecret } = await import("../src/sync/tokens");
    const { SignJWT } = await import("jose");
    const forged = (await createAccessToken("another-secret", randomUUID())).token;
    assert.equal((await t.request("/api/sync/keys", { headers: { authorization: `Bearer ${forged}` } })).status, 401);
    const expired = await new SignJWT({})
      .setSubject(randomUUID())
      .setAudience("pernce-sync")
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(deriveSecret("test-session-secret", "sync-access-token"));
    assert.equal((await t.request("/api/sync/keys", { headers: { authorization: `Bearer ${expired}` } })).status, 401);
  });

  test("a valid token for an account that doesn't exist is 401", async () => {
    const { createAccessToken } = await import("../src/sync/tokens");
    const { token } = await createAccessToken("test-session-secret", randomUUID());
    const res = await t.request("/api/sync/keys", { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 401);
  });

  test("public endpoints don't need a token but validate the body", async () => {
    for (const path of ["prelogin", "signup", "verify", "login", "refresh", "logout", "reset", "reset/confirm"]) {
      const res = await t.json("POST", `/api/sync/${path}`, {});
      assert.equal(res.status, 400, path);
      assert.equal((await res.json()).error, "bad_request", path);
    }
  });

  test("a wrong method on a known path is 405 with Allow", async () => {
    const res = await t.request("/api/sync/login");
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST, OPTIONS");
    const del = await t.request("/api/sync/keys", { method: "DELETE", headers: { authorization: "Bearer x" } });
    assert.equal(del.status, 401); // auth comes first, as in the old proxy
  });

  test("an unknown sync path is a JSON 404 once authenticated", async () => {
    const { createAccessToken } = await import("../src/sync/tokens");
    const { token } = await createAccessToken("test-session-secret", randomUUID());
    const res = await t.request("/api/sync/nope", { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 404);
  });

  test("signing up past the per-address limit is 429 rate_limited", async () => {
    const body = (n: number) => ({ email: `u${n}@example.com`, authKey: b64(32), kdf: kdf(), wrappedKeyPassword: b64(72), wrappedKeyRecovery: b64(72) });
    const results: number[] = [];
    for (let i = 0; i < 6; i++) results.push((await t.json("POST", "/api/sync/signup", body(i), { "x-real-ip": "10.9.9.9" })).status);
    assert.deepEqual(results, [202, 202, 202, 202, 202, 429]);
    // another address is not affected, and Vercel's x-real-ip is what counts
    assert.equal((await t.json("POST", "/api/sync/signup", body(9), { "x-real-ip": "10.9.9.8" })).status, 202);
  });
});
