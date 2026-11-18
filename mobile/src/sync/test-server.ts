// Test-only: an in-memory stand-in for the sync server (web/src/sync),
// reached through a fake `fetch`. It keeps the rules the client depends on
// — last writer wins by HLC then key version, server_seq cursors, key
// versions, rotating refresh tokens with replay detection, 6-digit email
// codes — and none of the storage. The real server has its own tests
// (web/scripts/verify-sync.ts).
import { randomBytes as nodeRandomBytes, randomUUID } from "node:crypto";
import sodium, { ready as sodiumReady } from "libsodium-wrappers-sumo";
import type { PulledRecord, SyncKdf, SyncKeys, SyncRecord } from "@pernce/core";
import { DEFAULT_KDF_PARAMS } from "@pernce/core";
import { SyncApi } from "./api";
import type { SecretStore, SyncContext } from "./context";
import { setCryptoProvider } from "./crypto";
import type { DB } from "../data/db";
import { setSyncState } from "./state";

export async function installTestCrypto() {
  await sodiumReady;
  setCryptoProvider({
    argon2id: (password, salt, opsLimit, memLimit) =>
      sodium.crypto_pwhash(32, password, salt, opsLimit, memLimit, sodium.crypto_pwhash_ALG_ARGON2ID13),
    randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)),
  });
}

type User = {
  id: string;
  email: string;
  authKey: string;
  verified: boolean;
  kdf: SyncKdf;
  keys: Omit<SyncKeys, "kdf">;
  seq: number;
  records: Map<string, PulledRecord>;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export class FakeSyncServer {
  users = new Map<string, User>();
  /** The last code emailed to each address. */
  codes = new Map<string, string>();
  /** refresh token -> user id; `used` remembers rotated-out tokens. */
  private refresh = new Map<string, string>();
  private used = new Map<string, string>();
  private access = new Map<string, { userId: string; expiresAt: number }>();
  now = Date.now();
  accessTtlMs = 15 * 60 * 1000;
  requests: string[] = [];

  private byEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email);
  }

  private session(user: User) {
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    this.access.set(accessToken, { userId: user.id, expiresAt: this.now + this.accessTtlMs });
    this.refresh.set(refreshToken, user.id);
    return { accessToken, accessTokenExpiresAt: this.now + this.accessTtlMs, refreshToken };
  }

  private login(user: User) {
    const { kdf, keys } = user;
    return { ...this.session(user), user: { id: user.id, email: user.email }, keys: { kdf, ...keys } };
  }

  private sendCode(email: string) {
    this.codes.set(email, String(Math.floor(100000 + Math.random() * 900000)));
  }

  private authed(headers: Record<string, string>): User {
    const token = headers.authorization?.replace(/^Bearer /, "") ?? "";
    const a = this.access.get(token);
    if (!a || a.expiresAt < this.now) throw new HttpError(401, "unauthorized");
    const user = this.users.get(a.userId);
    if (!user) throw new HttpError(401, "unauthorized");
    return user;
  }

  /** Signs every device of `email` out, as a password reset does. */
  endSessions(userId: string) {
    for (const [t, id] of this.refresh) if (id === userId) this.refresh.delete(t);
    for (const [t, a] of this.access) if (a.userId === userId) this.access.delete(t);
  }

  private handle(method: string, path: string, query: URLSearchParams, headers: Record<string, string>, body: any): unknown {
    const route = `${method} ${path}`;
    switch (route) {
      case "POST prelogin":
        return { kdf: this.byEmail(body.email)?.kdf ?? { ...DEFAULT_KDF_PARAMS, salt: "AAAAAAAAAAAAAAAAAAAAAA==" } };
      case "POST signup": {
        const existing = this.byEmail(body.email);
        if (existing?.verified) return { ok: true };
        const user: User = existing ?? {
          id: randomUUID(),
          email: body.email,
          verified: false,
          seq: 0,
          records: new Map(),
          authKey: "",
          kdf: body.kdf,
          keys: { wrappedKeyPassword: null, wrappedKeyRecovery: "", keyVersion: 1 },
        };
        Object.assign(user, { authKey: body.authKey, kdf: body.kdf });
        user.keys = { wrappedKeyPassword: body.wrappedKeyPassword, wrappedKeyRecovery: body.wrappedKeyRecovery, keyVersion: 1 };
        this.users.set(user.id, user);
        this.sendCode(user.email);
        return { ok: true };
      }
      case "POST verify": {
        const user = this.byEmail(body.email);
        if (!user || this.codes.get(user.email) !== body.code) throw new HttpError(400, "invalid_code");
        this.codes.delete(user.email);
        user.verified = true;
        return this.login(user);
      }
      case "POST login": {
        const user = this.byEmail(body.email);
        if (!user || user.authKey !== body.authKey) throw new HttpError(401, "invalid_credentials");
        if (!user.verified) {
          this.sendCode(user.email);
          throw new HttpError(403, "email_not_verified");
        }
        return this.login(user);
      }
      case "POST refresh": {
        const userId = this.refresh.get(body.refreshToken);
        if (!userId) {
          // Replay of a rotated token: end that session.
          const replayed = this.used.get(body.refreshToken);
          if (replayed) this.refresh.delete(replayed);
          throw new HttpError(401, "unauthorized");
        }
        this.refresh.delete(body.refreshToken);
        const next = this.session(this.users.get(userId)!);
        this.used.set(body.refreshToken, next.refreshToken);
        return next;
      }
      case "POST logout":
        this.refresh.delete(body.refreshToken);
        return { ok: true };
      case "POST reset": {
        if (this.byEmail(body.email)) this.sendCode(body.email);
        return { ok: true };
      }
      case "POST reset/confirm": {
        const user = this.byEmail(body.email);
        if (!user || this.codes.get(user.email) !== body.code) throw new HttpError(400, "invalid_code");
        this.codes.delete(user.email);
        Object.assign(user, { authKey: body.authKey, kdf: body.kdf, verified: true });
        user.keys.wrappedKeyPassword = body.wrappedKeyPassword;
        if (body.wrappedKeyRecovery) user.keys.wrappedKeyRecovery = body.wrappedKeyRecovery;
        this.endSessions(user.id);
        return this.login(user);
      }
      case "GET keys": {
        const user = this.authed(headers);
        return { kdf: user.kdf, ...user.keys };
      }
      case "PUT keys": {
        const user = this.authed(headers);
        if (body.keyVersion !== user.keys.keyVersion && body.keyVersion !== user.keys.keyVersion + 1) {
          throw new HttpError(409, "key_changed");
        }
        user.keys = { ...body };
        return { kdf: user.kdf, ...user.keys };
      }
      case "POST push": {
        const user = this.authed(headers);
        const records = body.records as SyncRecord[];
        if (records.length > 200) throw new HttpError(400, "bad_request");
        if (records.some((r) => r.keyVersion !== user.keys.keyVersion)) throw new HttpError(409, "key_changed");
        const accepted: string[] = [];
        const stale: string[] = [];
        for (const r of records) {
          if (!/^[0-9a-f-]{36}$/.test(r.id) || (!r.deleted && !r.ciphertext)) throw new HttpError(400, "bad_request");
          const cur = user.records.get(r.id);
          if (cur && !(r.hlc > cur.hlc || (r.hlc === cur.hlc && r.keyVersion > cur.keyVersion))) {
            stale.push(r.id);
            continue;
          }
          user.records.set(r.id, { ...r, serverSeq: ++user.seq });
          accepted.push(r.id);
        }
        return { accepted, stale };
      }
      case "GET pull": {
        const user = this.authed(headers);
        const since = Number(query.get("since") ?? 0);
        const limit = Number(query.get("limit") ?? 500);
        const changed = [...user.records.values()].filter((r) => r.serverSeq > since).sort((a, b) => a.serverSeq - b.serverSeq);
        const records = changed.slice(0, Math.min(limit, this.pageSize));
        return {
          records,
          cursor: records.at(-1)?.serverSeq ?? since,
          hasMore: changed.length > records.length,
          keyVersion: user.keys.keyVersion,
        };
      }
      case "DELETE records": {
        this.authed(headers).records.clear();
        return { ok: true };
      }
      case "DELETE account": {
        const user = this.authed(headers);
        if (user.authKey !== body.authKey) throw new HttpError(401, "invalid_credentials");
        this.endSessions(user.id);
        this.users.delete(user.id);
        return { ok: true };
      }
    }
    throw new HttpError(404, "bad_request");
  }

  /** Records per pull page, small in tests to exercise paging. */
  pageSize = 500;

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/sync\//, "");
    const method = init?.method ?? "GET";
    this.requests.push(`${method} ${path}`);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    try {
      const result = this.handle(method, path, url.searchParams, headers, body);
      return new Response(JSON.stringify(result), { status: 200 });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      return new Response(JSON.stringify({ error: e.code, message: e.code }), { status: e.status });
    }
  };
}

export function memorySecrets(): SecretStore & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  const get = <T>(k: string) => async () => (values.get(k) as T | undefined) ?? null;
  const set = (k: string) => async (v: unknown) => {
    if (v === null) values.delete(k);
    else values.set(k, v);
  };
  return {
    values,
    getSession: get("session"),
    setSession: set("session"),
    getDataKey: get("dataKey"),
    setDataKey: set("dataKey"),
    getWrapKey: get("wrapKey"),
    setWrapKey: set("wrapKey"),
  };
}

/** A device: its own database and keychain, talking to `server`. */
export function testDevice(
  db: DB,
  server: FakeSyncServer,
  name: string,
): SyncContext & { secrets: ReturnType<typeof memorySecrets> } {
  const secrets = memorySecrets();
  const api = new SyncApi({
    baseUrl: () => "https://sync.test",
    sessions: secrets,
    fetch: server.fetch,
    now: () => server.now,
    onSessionEnded: () => setSyncState(db, "signed_out"),
  });
  return { db, api, secrets, deviceName: name };
}
