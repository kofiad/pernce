import {
  SYNC_LIMITS,
  type SyncErrorCode,
  type SyncKdf,
  type SyncKeys,
  type SyncLoginResponse,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncRecord,
  type SyncSession,
} from "@pernce/core";

/** The sync server's HTTP API (web/src/app/api/sync, shapes in core
 * sync.ts). Access tokens last 15 minutes; this client refreshes them
 * before they expire and once more on a 401, and rotates the refresh token
 * every time (the server ends a session whose old refresh token is
 * replayed, so only one refresh may be in flight). */

export class SyncApiError extends Error {
  constructor(
    readonly status: number,
    /** `network` when the server couldn't be reached at all. */
    readonly code: SyncErrorCode | "network",
    message: string,
  ) {
    super(message);
  }
}

/** Where the session lives: the platform keychain in the app. */
export type SessionStore = {
  getSession(): Promise<SyncSession | null>;
  setSession(session: SyncSession | null): Promise<void>;
};

export type SyncApiOptions = {
  /** The server's origin, e.g. "https://pernce.example.com". */
  baseUrl: () => string | null;
  sessions: SessionStore;
  fetch?: typeof fetch;
  now?: () => number;
  /** The server refused the refresh token: the session is over. */
  onSessionEnded?: () => void;
};

/** Refresh this long before the access token actually expires. */
const EXPIRY_MARGIN_MS = 30_000;
/** Give up on a request after this long (slow links are common). */
const REQUEST_TIMEOUT_MS = 60_000;

export class SyncApi {
  private refreshing: Promise<SyncSession> | null = null;

  constructor(private readonly opts: SyncApiOptions) {}

  private async send(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
    const base = this.opts.baseUrl()?.replace(/\/+$/, "");
    if (!base) throw new SyncApiError(0, "network", "No sync server is set up.");
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    // A request that never answers (a flaky connection) would otherwise hold
    // the one running sync forever, and no later sync could start.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await (this.opts.fetch ?? fetch)(`${base}/api/sync/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal,
      });
    } catch {
      throw new SyncApiError(0, "network", "Couldn't reach the sync server. Check your connection.");
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // fall through with no body
    }
    if (res.ok) return json as T;
    const err = json as { error?: SyncErrorCode; message?: string } | null;
    throw new SyncApiError(
      res.status,
      err?.error ?? (res.status === 401 ? "unauthorized" : "internal"),
      err?.message ?? `The sync server answered ${res.status}.`,
    );
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.parse<T>(await this.send(method, path, body));
  }

  /** A request with the access token, refreshing it as needed. */
  private async authed<T>(method: string, path: string, body?: unknown): Promise<T> {
    let session = await this.opts.sessions.getSession();
    if (!session) throw new SyncApiError(401, "unauthorized", "Sign in again.");
    const now = (this.opts.now ?? Date.now)();
    if (session.accessTokenExpiresAt - EXPIRY_MARGIN_MS < now) session = await this.refresh(session);
    let res = await this.send(method, path, body, session.accessToken);
    if (res.status === 401) {
      session = await this.refresh(session);
      res = await this.send(method, path, body, session.accessToken);
    }
    return this.parse<T>(res);
  }

  private refresh(stale: SyncSession): Promise<SyncSession> {
    this.refreshing ??= (async () => {
      try {
        // Another caller may have refreshed while this one waited.
        const current = await this.opts.sessions.getSession();
        if (current && current.refreshToken !== stale.refreshToken) return current;
        if (!current) throw new SyncApiError(401, "unauthorized", "Sign in again.");
        const next = await this.call<SyncSession>("POST", "refresh", { refreshToken: current.refreshToken });
        await this.opts.sessions.setSession(next);
        return next;
      } catch (e) {
        if (e instanceof SyncApiError && e.status === 401) {
          await this.opts.sessions.setSession(null);
          this.opts.onSessionEnded?.();
        }
        throw e;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  // ---- public endpoints ----

  async prelogin(email: string): Promise<SyncKdf> {
    return (await this.call<{ kdf: SyncKdf }>("POST", "prelogin", { email })).kdf;
  }

  signup(body: { email: string; authKey: string; kdf: SyncKdf; wrappedKeyPassword: string; wrappedKeyRecovery: string }) {
    return this.call<{ ok: true }>("POST", "signup", body);
  }

  verify(body: { email: string; code: string; deviceName?: string }) {
    return this.call<SyncLoginResponse>("POST", "verify", body);
  }

  login(body: { email: string; authKey: string; deviceName?: string }) {
    return this.call<SyncLoginResponse>("POST", "login", body);
  }

  requestReset(email: string) {
    return this.call<{ ok: true }>("POST", "reset", { email });
  }

  confirmReset(body: {
    email: string;
    code: string;
    authKey: string;
    kdf: SyncKdf;
    wrappedKeyPassword: string | null;
    wrappedKeyRecovery?: string;
    deviceName?: string;
  }) {
    return this.call<SyncLoginResponse>("POST", "reset/confirm", body);
  }

  /** Ends this device's session on the server. Best effort. */
  async logout() {
    const session = await this.opts.sessions.getSession();
    if (session) await this.call("POST", "logout", { refreshToken: session.refreshToken }).catch(() => {});
  }

  // ---- signed-in endpoints ----

  getKeys() {
    return this.authed<SyncKeys>("GET", "keys");
  }

  putKeys(body: { keyVersion: number; wrappedKeyPassword: string; wrappedKeyRecovery: string }) {
    return this.authed<SyncKeys>("PUT", "keys", body);
  }

  push(records: SyncRecord[]) {
    if (records.length > SYNC_LIMITS.pushRecords) throw new Error("Too many records for one push");
    return this.authed<SyncPushResponse>("POST", "push", { records });
  }

  pull(since: number) {
    return this.authed<SyncPullResponse>("GET", `pull?since=${since}&limit=${SYNC_LIMITS.pullRecords}`);
  }

  wipeRecords() {
    return this.authed<{ ok: true }>("DELETE", "records");
  }

  deleteAccount(authKey: string) {
    return this.authed<{ ok: true }>("DELETE", "account", { authKey });
  }
}
