import { and, asc, eq, gt } from "drizzle-orm";
import {
  ACCOUNT_TYPES,
  csvToObjects,
  isColorValue,
  currencyDecimals,
  fromMinor,
  legacyMinorFactor,
  toCSV,
  toMinor,
} from "@pernce/core";
import {
  accounts,
  budgets,
  categories,
  fxRates,
  meta,
  profile,
  rateOverrides,
  transactions,
  type Account,
  type Category,
} from "../db/schema";
import { ledgerTotals } from "./accounts";
import { listCategories } from "./categories";
import { notifyChange } from "./changes";
import { allPages, type DB } from "./db";
import { newId } from "./ids";
import { isIcon } from "./look";
import { newRowStamps, stamp } from "./meta";
import { getProfile, isSupportedCurrency } from "./profile";
import { setRateOverride } from "./rates";
import { isISODate, resolveDraft, type TransactionDraft } from "./transactions";

export const BACKUP_FORMAT = "pernce-mobile-backup";
/** What backups were called before the rename to Pernce; still imported. */
const LEGACY_BACKUP_FORMAT = "perance-mobile-backup";
/** 2 since XOF/XAF have 2 decimals; version 1 files hold whole francs
 * (still imported, scaled by core legacyMinorFactor). */
export const BACKUP_VERSION = 2;

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/** Every live (non-deleted) row of a synced table, in pages (allPages). */
function liveRows<T extends typeof accounts | typeof categories | typeof transactions | typeof budgets>(db: DB, t: T) {
  return allPages((afterId, limit) =>
    db
      .select()
      .from(t as typeof accounts)
      .where(and(eq(t.deleted, false), afterId === null ? undefined : gt(t.id, afterId)))
      .orderBy(asc(t.id))
      .limit(limit)
      .all(),
  ) as T["$inferSelect"][];
}

/** Full JSON backup of live (non-deleted) rows. Money is integer minor
 * units in each row's currency, as stored; `importBackup` restores it
 * exactly. */
export function exportBackup(db: DB) {
  const strip = <T extends { deleted: boolean }>(rows: T[]) => rows.map(({ deleted: _deleted, ...r }) => r);
  const p = getProfile(db);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    money: "integer minor units per currency",
    exportedAt: new Date().toISOString(),
    profile: p ? { name: p.name, baseCurrency: p.baseCurrency, color: p.color, icon: p.icon } : null,
    accounts: strip(liveRows(db, accounts)),
    categories: strip(liveRows(db, categories)),
    transactions: strip(liveRows(db, transactions)),
    budgets: strip(liveRows(db, budgets)),
    rateOverrides: db
      .select({ currency: rateOverrides.currency, rateToUsd: rateOverrides.rateToUsd })
      .from(rateOverrides)
      .where(eq(rateOverrides.deleted, false))
      .all(),
  };
}

export type MobileBackup = ReturnType<typeof exportBackup>;

function majorString(minor: number | null, currency: string | null) {
  if (minor === null || !currency) return null;
  return fromMinor(minor, currency).toFixed(currencyDecimals(currency));
}

/** Transactions CSV with the web app's columns, so either app can import
 * the other's export. Amounts are written in the currency's own
 * precision. */
export function exportTransactionsCsv(db: DB) {
  const accs = new Map(db.select().from(accounts).all().map((a) => [a.id, a.name]));
  const cats = new Map(db.select().from(categories).all().map((c) => [c.id, c.name]));
  // Newest first like listTransactions, sorted here because the rows are
  // read in id order, in pages. Plain string comparison, as SQLite's.
  const desc = (x: string, y: string) => (x < y ? 1 : x > y ? -1 : 0);
  const rows = liveRows(db, transactions).sort(
    (a, b) => desc(a.occurredAt, b.occurredAt) || desc(a.createdAt, b.createdAt) || desc(a.id, b.id),
  );
  return toCSV(
    rows.map((t) => ({
      date: t.occurredAt,
      type: t.type,
      account: accs.get(t.accountId) ?? "",
      category: t.categoryId ? (cats.get(t.categoryId) ?? "") : "",
      amount: majorString(t.amount, t.currency),
      currency: t.currency,
      note: t.note,
      to_account: t.transferAccountId ? (accs.get(t.transferAccountId) ?? "") : "",
      received_amount: majorString(t.transferAmount, t.transferCurrency),
      received_currency: t.transferCurrency,
      exchange_rate: t.exchangeRate,
      fee: t.type === "transfer" ? majorString(t.fee, t.currency) : null,
    })),
    [
      "date",
      "type",
      "account",
      "category",
      "amount",
      "currency",
      "note",
      "to_account",
      "received_amount",
      "received_currency",
      "exchange_rate",
      "fee",
    ],
  );
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export type ImportReport = {
  kind: "mobile-backup" | "web-backup" | "csv";
  counts: { accounts: number; categories: number; transactions: number; budgets: number; rates: number };
  /** Values that were changed to fit, e.g. rounded to a currency's precision. */
  adjusted: string[];
  /** Rows that weren't imported, and why. */
  skipped: string[];
};

function emptyReport(kind: ImportReport["kind"]): ImportReport {
  return { kind, counts: { accounts: 0, categories: 0, transactions: 0, budgets: 0, rates: 0 }, adjusted: [], skipped: [] };
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A major-unit amount (number or numeric string) to minor units of
 * `currency`, recording in `adjusted` when that had to round, e.g. a web
 * backup's "1500.50" XOF becomes 1501. Returns null for anything that
 * isn't a finite number. */
function majorToMinorReported(
  value: unknown,
  currency: string,
  label: string,
  adjusted: string[],
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  const minor = toMinor(n, currency);
  const back = fromMinor(minor, currency);
  if (Math.abs(back - n) > 1e-9) {
    adjusted.push(`${label}: ${n} ${currency} rounded to ${back.toFixed(currencyDecimals(currency))} ${currency}`);
  }
  return minor;
}

/** Minor units from a mobile backup: should already be an integer. */
function minorReported(value: unknown, currency: string, label: string, adjusted: string[]): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Number.isInteger(value)) return value;
  const minor = Math.round(value);
  adjusted.push(`${label}: ${value} minor units of ${currency} rounded to ${minor}`);
  return minor;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** Imports a JSON backup: either this app's own (exportBackup) or the web
 * app's (`getFullSnapshot`). Rows keep their ids, so importing the same
 * file twice updates rather than duplicates. Everything runs in one
 * SQLite transaction. */
export function importBackup(db: DB, json: unknown): ImportReport {
  if (!isObj(json)) throw new Error("This file isn't a Pernce backup");
  let report: ImportReport;
  if (json.format === BACKUP_FORMAT || json.format === LEGACY_BACKUP_FORMAT) {
    if (json.version !== BACKUP_VERSION && json.version !== 1) throw new Error(`Unsupported backup version ${String(json.version)}`);
    report = db.transaction((tx) => importRows(tx, json, "mobile-backup"));
  } else if (Array.isArray(json.accounts) && Array.isArray(json.transactions)) {
    report = db.transaction((tx) => importRows(tx, json, "web-backup"));
  } else {
    throw new Error("This file isn't a Pernce backup");
  }
  notifyChange();
  return report;
}

function importRows(db: DB, json: Record<string, unknown>, kind: "mobile-backup" | "web-backup"): ImportReport {
  const web = kind === "web-backup";
  const report = emptyReport(kind);
  const { adjusted, skipped } = report;
  /** Minor units from a mobile backup, in today's precision. */
  const stored = (value: unknown, currency: string, label: string) => {
    const minor = minorReported(value, currency, label, adjusted);
    return minor === null || json.version !== 1 ? minor : minor * legacyMinorFactor(currency);
  };

  // --- Categories: matched by id, then by name + kind (so a backup's
  // "Groceries" lands on the "Groceries" this device seeded with a
  // different UUID), else created with the backup's id.
  const categoryIdMap = new Map<string, string>();
  const liveCategories = () => listCategories(db, { includeArchived: true });
  for (const c of arr(json.categories)) {
    const id = str(c.id);
    const name = str(c.name)?.trim();
    const kindValue: Category["kind"] | null = c.kind === "income" || c.kind === "expense" ? c.kind : null;
    if (!id || !name || !kindValue) {
      skipped.push(`Category ${JSON.stringify(c.name ?? c.id ?? "?")}: missing id, name or kind`);
      continue;
    }
    const color = isColorValue(c.color) ? c.color : "stone";
    const icon = isIcon(c.icon) ? c.icon : "more";
    const spendingType: Category["spendingType"] =
      kindValue === "expense" && (c.spendingType === "essential" || c.spendingType === "discretionary")
        ? c.spendingType
        : null;
    const sortOrder = Number.isFinite(Number(c.sortOrder)) ? Math.round(Number(c.sortOrder)) : 0;
    const values = {
      name,
      kind: kindValue,
      color,
      icon,
      spendingType,
      sortOrder,
      archived: web ? false : c.archived === true,
    };

    const all = liveCategories();
    const byId = all.find((x) => x.id === id);
    const byName = all.find((x) => x.kind === kindValue && x.name.toLowerCase() === name.toLowerCase());
    const target: Category | undefined = byId ?? byName;
    const tombstone = !target && db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).get();
    if (target) {
      // The web app's categories are its shared defaults, so a match keeps
      // this device's own styling; a mobile backup restores everything.
      if (!web) {
        db.update(categories).set({ ...values, updatedAt: stamp(db) }).where(eq(categories.id, target.id)).run();
      }
      categoryIdMap.set(id, target.id);
    } else if (tombstone) {
      // Deleted here since the backup was made: restoring brings it back.
      db.update(categories).set({ ...values, deleted: false, updatedAt: stamp(db) }).where(eq(categories.id, id)).run();
      categoryIdMap.set(id, id);
    } else {
      db.insert(categories).values({ id, ...newRowStamps(db), ...values }).run();
      categoryIdMap.set(id, id);
    }
    report.counts.categories++;
  }

  // --- Accounts: upsert by id. A web account's stored running balance is
  // turned into an opening balance once its transactions are in (below).
  const importedCurrencies = new Map<string, string>();
  const webBalances = new Map<string, number>();
  for (const a of arr(json.accounts)) {
    const id = str(a.id);
    const name = str(a.name)?.trim();
    const currency = str(a.currency);
    const label = `Account "${name ?? id ?? "?"}"`;
    if (!id || !name || !currency) {
      skipped.push(`${label}: missing id, name or currency`);
      continue;
    }
    if (!isSupportedCurrency(currency)) {
      skipped.push(`${label}: unsupported currency ${currency}`);
      continue;
    }
    let openingBalance = 0;
    if (web) {
      const balance = majorToMinorReported(a.balance, currency, `${label} balance`, adjusted);
      if (balance === null) {
        skipped.push(`${label}: balance isn't a number`);
        continue;
      }
      webBalances.set(id, balance);
    } else {
      const ob = stored(a.openingBalance, currency, `${label} opening balance`);
      if (ob === null) {
        skipped.push(`${label}: opening balance isn't a number`);
        continue;
      }
      openingBalance = ob;
    }
    const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (existing && !existing.deleted && existing.currency !== currency) {
      skipped.push(`${label}: already exists here in ${existing.currency}`);
      continue;
    }
    const values = {
      name,
      type: ACCOUNT_TYPES.some((t) => t.value === a.type) ? (a.type as Account["type"]) : "other",
      institution: str(a.institution)?.trim() || null,
      currency,
      color: isColorValue(a.color) ? a.color : "primary",
      icon: isIcon(a.icon) ? a.icon : null,
      openingBalance,
      archived: a.archived === true,
    };
    if (existing) {
      db.update(accounts)
        .set({ ...values, deleted: false, updatedAt: stamp(db) })
        .where(eq(accounts.id, id))
        .run();
    } else {
      db.insert(accounts)
        .values({ id, ...newRowStamps(db), ...values })
        .run();
    }
    importedCurrencies.set(id, currency);
    report.counts.accounts++;
  }

  // --- Transactions: every row is re-validated with core's rules
  // (resolveDraft) exactly as if typed in, then upserted by id.
  const accountCurrency = (id: string) =>
    importedCurrencies.get(id) ??
    db.select({ currency: accounts.currency }).from(accounts).where(and(eq(accounts.id, id), eq(accounts.deleted, false))).get()?.currency ??
    null;
  for (const t of arr(json.transactions)) {
    const id = str(t.id);
    const date = str(t.occurredAt);
    const label = `Transaction ${date ?? "?"}${t.note ? ` "${String(t.note)}"` : ""}`;
    const type = t.type === "income" || t.type === "expense" || t.type === "transfer" ? t.type : null;
    const accountId = str(t.accountId);
    if (!id || !type || !accountId || !date) {
      skipped.push(`${label}: missing id, type, account or date`);
      continue;
    }
    const currency = accountCurrency(accountId);
    if (!currency) {
      skipped.push(`${label}: its account isn't in the backup`);
      continue;
    }
    const txCurrency = str(t.currency) ?? currency;
    const transferAccountId = type === "transfer" ? str(t.transferAccountId) : null;
    const destCurrency = transferAccountId ? accountCurrency(transferAccountId) : null;
    if (type === "transfer" && transferAccountId && !destCurrency) {
      skipped.push(`${label}: its destination account isn't in the backup`);
      continue;
    }

    const toMinorAmount = (v: unknown, cur: string, what: string) =>
      web ? majorToMinorReported(v, cur, `${label} ${what}`, adjusted) : stored(v, cur, `${label} ${what}`);
    const amount = toMinorAmount(t.amount, txCurrency, "amount");
    if (amount === null || amount <= 0) {
      skipped.push(`${label}: amount must be a positive number`);
      continue;
    }
    const fee = type === "transfer" ? (toMinorAmount(t.fee, txCurrency, "fee") ?? 0) : 0;
    // Older web transfers have no transfer_amount; they were same-currency,
    // so the destination got `amount`.
    let transferAmount: number | null = null;
    if (type === "transfer" && destCurrency) {
      transferAmount =
        t.transferAmount === null || t.transferAmount === undefined
          ? destCurrency === txCurrency
            ? amount
            : null
          : toMinorAmount(t.transferAmount, destCurrency, "amount received");
    }
    const rate = t.exchangeRate === null || t.exchangeRate === undefined ? null : Number(t.exchangeRate);

    let categoryId = str(t.categoryId) ? (categoryIdMap.get(str(t.categoryId)!) ?? str(t.categoryId)) : null;
    if (categoryId && type !== "transfer") {
      const cat = db.select().from(categories).where(and(eq(categories.id, categoryId), eq(categories.deleted, false))).get();
      if (!cat || cat.kind !== type) {
        adjusted.push(`${label}: category ${cat ? `"${cat.name}" is for ${cat.kind}` : "not found"}, left uncategorized`);
        categoryId = null;
      }
    }

    const draft: TransactionDraft = {
      type,
      accountId,
      categoryId,
      transferAccountId,
      amount,
      currency: txCurrency,
      transferAmount,
      exchangeRate: rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null,
      fee,
      note: str(t.note),
      occurredAt: date.slice(0, 10),
    };
    let values;
    try {
      values = resolveDraft(db, draft);
    } catch (e) {
      skipped.push(`${label}: ${errorMessage(e)}`);
      continue;
    }
    const createdAt = str(t.createdAt) ?? new Date().toISOString();
    const existing = db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, id)).get();
    if (existing) {
      db.update(transactions)
        .set({ ...values, createdAt, deleted: false, updatedAt: stamp(db) })
        .where(eq(transactions.id, id))
        .run();
    } else {
      db.insert(transactions)
        .values({ id, ...newRowStamps(db), createdAt, ...values })
        .run();
    }
    report.counts.transactions++;
  }

  // --- Web balances -> opening balances: whatever the imported ledger
  // doesn't explain was there before it, so the derived balance comes out
  // equal to the web app's (rounded to the currency's precision).
  if (web) {
    const totals = ledgerTotals(db);
    for (const [id, balance] of webBalances) {
      db.update(accounts)
        .set({ openingBalance: balance - (totals.get(id) ?? 0), updatedAt: stamp(db) })
        .where(eq(accounts.id, id))
        .run();
    }
  }

  // --- Budgets: one per category and month, so match on that.
  for (const b of arr(json.budgets)) {
    const period = str(b.period)?.slice(0, 10);
    const currency = str(b.currency);
    const rawCategory = str(b.categoryId);
    const categoryId = rawCategory ? (categoryIdMap.get(rawCategory) ?? rawCategory) : null;
    const label = `Budget ${period ?? "?"}`;
    if (!period || !isISODate(period) || !period.endsWith("-01") || !currency || !categoryId) {
      skipped.push(`${label}: missing or invalid period, currency or category`);
      continue;
    }
    if (!isSupportedCurrency(currency)) {
      skipped.push(`${label}: unsupported currency ${currency}`);
      continue;
    }
    const cat = db.select().from(categories).where(and(eq(categories.id, categoryId), eq(categories.deleted, false))).get();
    if (!cat || cat.kind !== "expense") {
      skipped.push(`${label}: its category isn't an expense category here`);
      continue;
    }
    const amount = web
      ? majorToMinorReported(b.amount, currency, `${label} (${cat.name})`, adjusted)
      : stored(b.amount, currency, `${label} (${cat.name})`);
    if (amount === null || amount <= 0) {
      skipped.push(`${label} (${cat.name}): amount must be a positive number`);
      continue;
    }
    const live = db
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.deleted, false), eq(budgets.categoryId, categoryId), eq(budgets.period, period)))
      .get();
    const id = str(b.id) ?? newId();
    const look = { color: isColorValue(b.color) ? b.color : null, icon: isIcon(b.icon) ? b.icon : null };
    // The backup's id may survive here as a tombstone (budget deleted since
    // the backup): revive that row rather than inserting a duplicate key.
    const sameId = live ? null : db.select({ id: budgets.id }).from(budgets).where(eq(budgets.id, id)).get();
    if (live) {
      db.update(budgets).set({ amount, currency, ...look, updatedAt: stamp(db) }).where(eq(budgets.id, live.id)).run();
    } else if (sameId) {
      db.update(budgets)
        .set({ categoryId, period, amount, currency, ...look, deleted: false, updatedAt: stamp(db) })
        .where(eq(budgets.id, id))
        .run();
    } else {
      db.insert(budgets)
        .values({ id, ...newRowStamps(db), categoryId, period, amount, currency, ...look })
        .run();
    }
    report.counts.budgets++;
  }

  // --- Rates. A mobile backup's overrides are the user's own and come
  // back as overrides. The web app's exchange_rates are market rates, so
  // they only fill in currencies this device has no fetched rate for yet.
  if (web) {
    const have = new Set(db.select({ c: fxRates.currency }).from(fxRates).all().map((r) => r.c));
    for (const r of arr(json.exchangeRates)) {
      const currency = str(r.currency);
      const rate = Number(r.rateToUsd);
      if (!currency || currency === "USD" || have.has(currency) || !isSupportedCurrency(currency)) continue;
      if (!Number.isFinite(rate) || rate <= 0) continue;
      db.insert(fxRates)
        .values({
          currency,
          rateToUsd: String(rate),
          source: `${str(r.source) ?? "web"} (imported)`,
          fetchedAt: str(r.updatedAt) ?? new Date().toISOString(),
        })
        .run();
      report.counts.rates++;
    }
  } else {
    for (const r of arr(json.rateOverrides)) {
      try {
        setRateOverride(db, String(r.currency), Number(r.rateToUsd));
        report.counts.rates++;
      } catch (e) {
        skipped.push(`Rate ${String(r.currency)}: ${errorMessage(e)}`);
      }
    }
  }

  // --- Profile: name and base currency, if this device has a profile.
  if (isObj(json.profile)) {
    const p = getProfile(db);
    const baseCurrency = str(json.profile.baseCurrency);
    if (p) {
      db.update(profile)
        .set({
          ...(typeof json.profile.name === "string" ? { name: json.profile.name.trim() } : {}),
          ...(baseCurrency && isSupportedCurrency(baseCurrency) ? { baseCurrency } : {}),
          ...(isColorValue(json.profile.color) ? { color: json.profile.color } : {}),
          ...(json.profile.icon === null || isIcon(json.profile.icon) ? { icon: json.profile.icon } : {}),
          updatedAt: stamp(db),
        })
        .where(eq(profile.id, p.id))
        .run();
    }
  }

  return report;
}

/** Imports a bank-export style CSV (the web app's transactions CSV works
 * too). Rows name their account and category; those are matched
 * case-insensitively against what exists, and nothing is created. Each
 * row is validated like a hand-entered transaction. Columns: date
 * (YYYY-MM-DD), type, account, category, amount, currency, note, and for
 * transfers to_account plus optional received_amount, exchange_rate, fee. */
export function importTransactionsCsv(db: DB, text: string): ImportReport {
  const report = emptyReport("csv");
  const { adjusted, skipped } = report;
  const rows = csvToObjects(text.replace(/^﻿/, ""));
  if (rows.length === 0) throw new Error("The CSV has no rows");
  const header = Object.keys(rows[0]).map((h) => h.toLowerCase());
  for (const col of ["date", "type", "account", "amount"]) {
    if (!header.includes(col)) throw new Error(`The CSV needs a "${col}" column`);
  }

  const accs = db.select().from(accounts).where(eq(accounts.deleted, false)).all();
  const cats = listCategories(db, { includeArchived: true });
  const findAccount = (name?: string) =>
    name?.trim() ? accs.find((a) => a.name.toLowerCase() === name.trim().toLowerCase()) : undefined;

  db.transaction((tx) => {
    rows.forEach((raw, i) => {
      // Header names are matched case-insensitively.
      const r: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) r[k.trim().toLowerCase()] = v ?? "";
      const rowLabel = `Row ${i + 2}`;
      const type = r.type.trim().toLowerCase();
      if (type !== "income" && type !== "expense" && type !== "transfer") {
        skipped.push(`${rowLabel}: unknown type "${r.type}"`);
        return;
      }
      const account = findAccount(r.account);
      if (!account) {
        skipped.push(`${rowLabel}: unknown account "${r.account}"`);
        return;
      }
      const date = r.date.trim();
      if (!isISODate(date)) {
        skipped.push(`${rowLabel}: date "${r.date}" isn't YYYY-MM-DD`);
        return;
      }
      const currency = r.currency?.trim() || account.currency;
      if (currency !== account.currency) {
        skipped.push(`${rowLabel}: currency ${currency} doesn't match "${account.name}" (${account.currency})`);
        return;
      }
      // Bank exports often sign expenses negative; the type says which way.
      const rawAmount = Number(r.amount.replace(/,/g, "").trim());
      const amount = majorToMinorReported(Math.abs(rawAmount), currency, `${rowLabel} amount`, adjusted);
      if (!r.amount.trim() || amount === null || amount <= 0) {
        skipped.push(`${rowLabel}: invalid amount "${r.amount}"`);
        return;
      }

      let categoryId: string | null = null;
      const categoryName = r.category?.trim();
      if (categoryName && type !== "transfer") {
        const cat = cats.find((c) => c.kind === type && c.name.toLowerCase() === categoryName.toLowerCase());
        if (cat) categoryId = cat.id;
        else adjusted.push(`${rowLabel}: no ${type} category "${categoryName}", left uncategorized`);
      }

      let transferAccountId: string | null = null;
      let transferAmount: number | null = null;
      let exchangeRate: number | null = null;
      let fee = 0;
      if (type === "transfer") {
        const dest = findAccount(r.to_account);
        if (!dest) {
          skipped.push(`${rowLabel}: transfer needs a known to_account (got "${r.to_account ?? ""}")`);
          return;
        }
        transferAccountId = dest.id;
        transferAmount = majorToMinorReported(r.received_amount, dest.currency, `${rowLabel} amount received`, adjusted);
        const rate = Number(r.exchange_rate);
        exchangeRate = r.exchange_rate?.trim() && Number.isFinite(rate) && rate > 0 ? rate : null;
        fee = majorToMinorReported(r.fee, currency, `${rowLabel} fee`, adjusted) ?? 0;
      }

      try {
        const values = resolveDraft(tx, {
          type,
          accountId: account.id,
          categoryId,
          transferAccountId,
          amount,
          currency,
          transferAmount,
          exchangeRate,
          fee,
          note: r.note,
          occurredAt: date,
        });
        tx.insert(transactions)
          .values({ id: newId(), ...newRowStamps(tx), ...values })
          .run();
        report.counts.transactions++;
      } catch (e) {
        skipped.push(`${rowLabel}: ${errorMessage(e)}`);
      }
    });
  });
  notifyChange();
  return report;
}

/** Settings -> Delete local data: wipes every table, including device
 * settings, so the app starts over at onboarding. */
export function deleteAllLocalData(db: DB) {
  db.transaction((tx) => {
    for (const table of [transactions, budgets, accounts, categories, rateOverrides, fxRates, profile, meta]) {
      tx.delete(table).run();
    }
  });
  notifyChange();
}
