/** Names of the sync secrets in the platform keychain (localStorage on web).
 * The app was renamed from Perance to Pernce, which renamed these; the old
 * ones are deleted once (lib/sync.ts) because the account they belonged to
 * is gone. Pure, so the lists are tested in Node. */

export const SECRET_KEYS = {
  session: "pernce.sync.session",
  dataKey: "pernce.sync.dataKey",
  wrapKey: "pernce.sync.wrapKey",
} as const;

export const LEGACY_SECRET_KEYS: readonly string[] = ["perance.sync.session", "perance.sync.dataKey", "perance.sync.wrapKey"];
