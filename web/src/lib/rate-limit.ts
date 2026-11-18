type Bucket = { count: number; resetAt: number };

declare global {
  var __pernce_login_attempts__: Map<string, Bucket> | undefined;
}

// Same warm-instance caching trick as src/db/index.ts - survives hot
// reloads in dev / across warm serverless invocations, gone on a cold
// start. That's a real limitation for a multi-instance deployment (each
// instance throttles independently), but this app serves a handful of
// people: a per-instance limiter still meaningfully raises the cost of a
// brute-force run, with no extra infrastructure (Redis, etc.) required.
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

const loginLimiter = createRateLimiter("login", { windowMs: 10 * 60 * 1000, max: 8 });

/** Keyed by normalized email, not IP - keeps the check symmetric whether or
 * not the email actually exists, which is what preserves the anti-
 * enumeration property loginAction already relies on (a dummy-hash compare
 * that costs the same either way). */
export function isRateLimited(key: string): boolean {
  return loginLimiter.isLimited(key);
}

export function recordFailedAttempt(key: string) {
  loginLimiter.hit(key);
}

export function clearAttempts(key: string) {
  loginLimiter.clear(key);
}
