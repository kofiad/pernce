import type { Context } from "hono";
import { readEnv } from "../env";
import { z } from "zod";
import type { SyncError } from "@pernce/core/sync";
import type { HonoEnv } from "../types";
import { SyncHttpError, unauthorized } from "./errors";
import { bearerToken, verifyAccessToken } from "./tokens";

type C = Context<HonoEnv>;

/** Wraps a sync route handler: a plain return value becomes a 200 JSON
 * body, a SyncHttpError becomes `{ error, message }` with its status, and
 * anything else is logged and reported as a bare 500. */
export function syncRoute(handler: (c: C) => Promise<unknown>) {
  return async (c: C) => {
    try {
      const result = await handler(c);
      return result instanceof Response ? result : c.json((result ?? { ok: true }) as object);
    } catch (err) {
      if (err instanceof SyncHttpError) return errorResponse(c, err);
      console.error(`Sync request ${c.req.method} ${c.req.path} failed:`, err);
      return c.json({ error: "internal", message: "Something went wrong on the server." } satisfies SyncError, 500);
    }
  };
}

export function errorResponse(c: C, err: SyncHttpError) {
  return c.json({ error: err.code, message: err.message } satisfies SyncError, err.status as 400);
}

export async function readBody<S extends z.ZodType>(c: C, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new SyncHttpError(400, "bad_request", "Send a JSON body.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SyncHttpError(400, "bad_request", z.prettifyError(parsed.error));
  return parsed.data;
}

export function readQuery<S extends z.ZodType>(c: C, schema: S): z.output<S> {
  const parsed = schema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) throw new SyncHttpError(400, "bad_request", z.prettifyError(parsed.error));
  return parsed.data;
}

/** The user id from `Authorization: Bearer <access token>`. The sync auth
 * middleware (src/routes/sync.ts) has already turned away requests without
 * a valid token; this is the same check again, and gives the handler the id. */
export async function requireUserId(c: C): Promise<string> {
  const userId = await verifyAccessToken(readEnv(c).SESSION_SECRET, bearerToken(c.req.header("authorization") ?? null));
  if (!userId) throw unauthorized();
  return userId;
}

/** Where the client's address comes from depends on the host: it must be a
 * header the platform sets itself, overwriting anything the client sent,
 * or the sign-up limit can be dodged by sending a fresh fake address. */
export type ClientIp = (headers: Headers) => string;

/** Vercel sets both headers itself (and Node development has no proxy). */
export const vercelClientIp: ClientIp = (headers) =>
  headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

/** Cloudflare sets CF-Connecting-IP itself. X-Forwarded-For is not used:
 * Cloudflare keeps what the client sent at its start. */
export const cloudflareClientIp: ClientIp = (headers) => headers.get("cf-connecting-ip") ?? "unknown";
