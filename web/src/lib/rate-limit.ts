type Bucket = { count: number; resetAt: number };

declare global {
  var __pernce_login_attempts__: Map<string, Bucket> | undefined;
}

// Used by src/sync/accounts.ts for the sign-in limiters. The store lives on
// globalThis, so it survives hot reloads in dev and warm invocations of a
// serverless instance, and is lost on a cold start. Each instance (or
// Worker isolate) throttles independently, so this is a modest brake rather
// than a hard limit: on Vercel it still raises the cost of a brute-force run
// with no extra infrastructure, but on Workers it is weak (see
// docs/web-deployment.md, "Rate limiting on Workers").
const attempts = globalThis.__pernce_login_attempts__ ?? new Map<string, Bucket>();
globalThis.__pernce_login_attempts__ = attempts;

export type RateLimiter = {
  /** True once `key` has used up its attempts for the current window. */
  isLimited(key: string): boolean;
  /** Counts one attempt against `key`. */
  hit(key: string): void;
  clear(key: string): void;
};

/** A fixed-window counter. `name` keeps limiters with different rules from
 * sharing buckets for the same key. */
export function createRateLimiter(name: string, { windowMs, max }: { windowMs: number; max: number }): RateLimiter {
  const id = (key: string) => `${name}:${key}`;
  return {
    isLimited(key) {
      const bucket = attempts.get(id(key));
      if (!bucket) return false;
      if (Date.now() > bucket.resetAt) {
        attempts.delete(id(key));
        return false;
      }
      return bucket.count >= max;
    },
    hit(key) {
      const now = Date.now();
      const bucket = attempts.get(id(key));
      if (!bucket || now > bucket.resetAt) {
        attempts.set(id(key), { count: 1, resetAt: now + windowMs });
        return;
      }
      bucket.count++;
    },
    clear(key) {
      attempts.delete(id(key));
    },
  };
}
