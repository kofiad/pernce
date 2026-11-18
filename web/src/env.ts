import type { Context } from "hono";
import type { AppEnv } from "./types";

/** The request's settings: the host's bindings (`c.env`: a Worker's vars,
 * secrets and D1 binding, or whatever a test passes to `app.request()`),
 * then process.env. Node and Vercel have only process.env, which Hono's own
 * env() helper returns whole on those hosts; reading `c.env` first keeps
 * tests (and Workers with process.env populated) from depending on it. A key is read when
 * asked for, per request, never at import time. */
export function readEnv(c: Context): AppEnv {
  const bindings = (c.env ?? {}) as Record<string, unknown>;
  const processEnv: Record<string, unknown> = typeof process === "undefined" ? {} : process.env;
  return new Proxy({} as AppEnv, {
    get: (_, key) => (typeof key === "string" ? (bindings[key] ?? processEnv[key]) : undefined),
  });
}
