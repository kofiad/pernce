import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CATEGORIES, parseAmountInput } from "@pernce/core";
import { createCategory, listCategories } from "../data/categories";
import { changeVersion } from "../data/changes";
import { getAppearance, languageFor, setAppearance } from "../data/preferences";
import { setupProfile } from "../data/profile";
import { createTestDb } from "../data/test-utils";
import { MESSAGES, currencyName, currencyRows, dateLabel, dayHeading, monthYear, translateError, updatedAt } from ".";

const { en, fr } = MESSAGES;
const NB = " ";

test("appearance is a device pref; the language is the phone's", async () => {
  const db = await createTestDb();
  assert.equal(getAppearance(db), "system");
  const v = changeVersion();
  setAppearance(db, "dark");
  assert.equal(getAppearance(db), "dark");
  assert.ok(changeVersion() > v, "a change re-renders the app");
  setAppearance(db, "system");
  assert.equal(getAppearance(db), "system");

  // English for any language the app doesn't speak.
  assert.equal(languageFor("fr-CA"), "fr");
  assert.equal(languageFor("FR"), "fr");
  assert.equal(languageFor("en-US"), "en");
  assert.equal(languageFor("de-DE"), "en");
});

test("first run seeds the default categories in the app's language", async () => {
  const db = await createTestDb();
  setupProfile(db, { name: "Awa", baseCurrency: "XOF" }, fr.defaultCategories);
  const names = listCategories(db).map((c) => c.name);
  assert.ok(names.includes("Courses") && names.includes("Salaire"));
  assert.ok(!names.includes("Groceries"));
  // Every default has a French name.
  for (const c of DEFAULT_CATEGORIES) assert.ok(fr.defaultCategories[c.name], `no French name for "${c.name}"`);
});

test("errors from core and the data layer are translated, values kept", async () => {
  assert.equal(translateError(parseAmountInput("", "USD").error, fr), "Saisissez un montant");
  assert.equal(translateError(parseAmountInput("1.505", "XOF").error, fr), "XOF accepte au plus 2 décimales");
  assert.equal(translateError(parseAmountInput("1.555", "USD").error, fr), "USD accepte au plus 2 décimales");

  const db = await createTestDb();
  setupProfile(db, { baseCurrency: "USD" });
  const clash = () => createCategory(db, { name: "Groceries", kind: "expense", color: "accent-teal", icon: "bag", spendingType: null });
  assert.throws(clash, (e: unknown) => translateError(e, fr) === `Une catégorie de dépenses «${NB}Groceries${NB}» existe déjà`);

  // English and unknown messages pass through.
  assert.equal(translateError(new Error("Enter an amount"), en), "Enter an amount");
  assert.equal(translateError(new Error("Something new"), fr), "Something new");
});

test("dates follow the language", () => {
  const now = new Date(2026, 8, 14, 12);
  assert.equal(dateLabel("2026-09-14", en, now), "Today, Sep 14");
  assert.equal(dateLabel("2026-09-13", fr, now), "Hier, 13 sept.");
  assert.equal(dayHeading("2025-12-31", fr, now), "31 déc. 2025");
  assert.equal(monthYear(new Date(2026, 8, 1), fr), "Septembre 2026");
  assert.equal(monthYear(new Date(2026, 8, 1), en), "September 2026");
  assert.equal(updatedAt(new Date(2026, 8, 14, 6, 0).toISOString(), fr, now), "Mis à jour aujourd’hui à 06:00");
  assert.equal(updatedAt(new Date(2026, 8, 12, 6, 0).toISOString(), en, now), "Updated Sep 12 at 06:00");
});

test("currency names are translated, with core's name as the fallback", () => {
  assert.equal(currencyName("USD", fr), "Dollar américain");
  assert.equal(currencyName("ZZZ", fr), "ZZZ");
  // Not in the catalogue: the platform's name in the catalogue's language.
  assert.match(currencyName("ZAR", fr), /rand/i);
  assert.match(currencyName("ZAR", MESSAGES.en), /rand/i);
});

test("currency picker rows: featured first, then A-Z; search matches code or name", () => {
  const rows = currencyRows("", MESSAGES.en);
  assert.deepEqual(rows.slice(0, 9).map((r) => r.code), ["USD", "GHS", "XOF", "XAF", "CAD", "EUR", "GBP", "NGN", "ZAR"]);
  const rest = rows.slice(9).map((r) => r.name);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, "en-US")));
  assert.deepEqual(currencyRows("zar", MESSAGES.en).map((r) => r.code), ["ZAR"]);
  assert.ok(currencyRows("rand", MESSAGES.en).some((r) => r.code === "ZAR"));
  assert.deepEqual(currencyRows("zzzz", MESSAGES.en), []);
});
