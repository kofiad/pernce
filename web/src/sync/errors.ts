import type { SyncErrorCode } from "@pernce/core/sync";

/** An error the client is meant to see: route handlers turn it into
 * `{ error, message }` with this status (src/sync/http.ts). */
export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: SyncErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new SyncHttpError(401, "unauthorized", "Sign in again.");
export const rateLimited = () =>
  new SyncHttpError(429, "rate_limited", "Too many attempts. Wait a few minutes and try again.");
export const invalidCode = () =>
  new SyncHttpError(400, "invalid_code", "That code is wrong or has expired. Request a new one.");
export const invalidCredentials = () =>
  new SyncHttpError(401, "invalid_credentials", "Wrong email or password.");
