import type { MiddlewareHandler } from "hono";
import { readEnv } from "../env";
import type { AppEnv } from "../types";

// The API can be called from a browser app on another origin (the public
// web app at pernce.com talking to api.pernce.com; in development the
// app's own server, expo start --web on http://localhost:8081).
// ALLOWED_ORIGINS lists those origins, comma-separated; nothing is allowed
// unless it is set, so the personal Vercel instance, whose web app is
// same-origin, sends no CORS headers at all. Auth is a bearer token, never
// a cookie, so no credentials are allowed.
export function allowedOrigins(env: AppEnv): Set<string> {
  return new Set(
    `${env.ALLOWED_ORIGINS ?? ""},${env.WEB_APP_ORIGINS ?? ""}`
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  );
}

/** CORS for the endpoints apps call: the sync API and /api/fx (the cron
 * routes are for the scheduler, not browsers). Answers preflights itself,
 * before authentication. */
export const cors: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = origin ? allowedOrigins(readEnv(c)).has(origin) : false;
  const addHeaders = () => {
    if (!origin || !allowed) return;
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    c.header("Access-Control-Max-Age", "86400");
    c.header("Vary", "Origin", { append: true });
  };
  if (c.req.method === "OPTIONS") {
    addHeaders();
    return c.body(null, 204);
  }
  await next();
  addHeaders();
};
