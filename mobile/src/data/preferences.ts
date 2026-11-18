import { notifyChange } from "./changes";
import type { DB } from "./db";
import { getMeta, setMeta } from "./meta";

/** Display preferences (M23a). Device-local like the app lock: they live
 * in `meta`, so they're never synced or exported. */

export const APPEARANCES = ["system", "light", "dark"] as const;
export type AppearancePref = (typeof APPEARANCES)[number];

export const LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

export function getAppearance(db: DB): AppearancePref {
  const stored = getMeta(db, "appearance");
  return (APPEARANCES as readonly string[]).includes(stored ?? "") ? (stored as AppearancePref) : "system";
}

export function setAppearance(db: DB, value: AppearancePref) {
  setMeta(db, "appearance", value === "system" ? null : value);
  notifyChange();
}

/** The app always speaks the phone's language when it's one the app has,
 * otherwise English; there's no in-app choice. */
export function languageFor(locale = deviceLocale()): Language {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function deviceLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "en";
  }
}
