import type { Handler, Hono } from "hono";
import type { HonoEnv } from "../types";

type Method = "GET" | "POST" | "PUT" | "DELETE";

/** Registers a path's handlers by method and answers any other method like
 * the old Next.js route handlers did: OPTIONS with 204 and 405 for the rest,
 * both with an Allow header. (HEAD is answered by Hono from GET.) */
export function methods(app: Hono<HonoEnv>, path: string, handlers: Partial<Record<Method, Handler<HonoEnv>>>) {
  const allowed = Object.keys(handlers) as Method[];
  for (const method of allowed) app.on(method, path, handlers[method]!);
  const allow = [...allowed, ...(allowed.includes("GET") ? ["HEAD"] : []), "OPTIONS"].join(", ");
  app.all(path, (c) =>
    c.body(null, c.req.method === "OPTIONS" ? 204 : 405, { Allow: allow }),
  );
}
