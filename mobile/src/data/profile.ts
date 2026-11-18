import { eq } from "drizzle-orm";
import { CURRENCIES } from "@pernce/core";
import { profile, type Profile } from "../db/schema";
import { notifyChange } from "./changes";
import type { DB } from "./db";
import { newId } from "./ids";
import { checkColor, checkIconOrNull } from "./look";
import { newRowStamps, stamp } from "./meta";
import { seedDefaultCategories } from "./categories";

export function isSupportedCurrency(code: string) {
  return CURRENCIES.some((c) => c.code === code);
}

function assertCurrency(code: string) {
  if (!isSupportedCurrency(code)) throw new Error(`Unsupported currency "${code}"`);
}

export function getProfile(db: DB): Profile | null {
  return db.select().from(profile).where(eq(profile.deleted, false)).get() ?? null;
}

/** First run ("use offline"): creates the profile and seeds the default
 * categories, named in the app's language. Safe to call twice; the
 * second call just updates. */
export function setupProfile(
  db: DB,
  input: { name?: string; baseCurrency: string },
  categoryNames: Record<string, string> = {},
): Profile {
  assertCurrency(input.baseCurrency);
  const result = db.transaction((tx) => {
    const existing = getProfile(tx);
    if (existing) {
      updateProfile(tx, input);
    } else {
      tx.insert(profile)
        .values({ id: newId(), ...newRowStamps(tx), name: input.name?.trim() ?? "", baseCurrency: input.baseCurrency })
        .run();
    }
    seedDefaultCategories(tx, categoryNames);
    return getProfile(tx)!;
  });
  notifyChange();
  return result;
}

export function updateProfile(
  db: DB,
  patch: { name?: string; baseCurrency?: string; color?: string; icon?: string | null },
) {
  const existing = getProfile(db);
  if (!existing) throw new Error("Profile not set up");
  if (patch.baseCurrency !== undefined) assertCurrency(patch.baseCurrency);
  db.update(profile)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.baseCurrency !== undefined ? { baseCurrency: patch.baseCurrency } : {}),
      ...(patch.color !== undefined ? { color: checkColor(patch.color) } : {}),
      // null goes back to initials.
      ...(patch.icon !== undefined ? { icon: checkIconOrNull(patch.icon) } : {}),
      updatedAt: stamp(db),
    })
    .where(eq(profile.id, existing.id))
    .run();
  notifyChange();
}

export function baseCurrencyOf(db: DB): string {
  return getProfile(db)?.baseCurrency ?? "USD";
}
