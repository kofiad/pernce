// Synthetic demo data for the README screenshots: writes
// docs/demo/pernce-demo-backup.json, a normal Pernce backup of an invented
// person ("Demo"). Everything goes through the app's own data layer
// (src/data/*) on an in-memory database, then exportBackup(); nothing here
// is real.
//
// Run from mobile/:
//   node --experimental-sqlite --no-warnings=ExperimentalWarning --import tsx scripts/make-demo-backup.ts
//
// Deterministic: a fixed-seed PRNG, a seeded UUID generator (setUuidGenerator)
// and a fake clock. The data layer reads Date directly (createdAt, HLC
// stamps), so the script swaps in a Date whose "now" is the date of the row
// being written; the final "now" is 2026-11-20T12:00:00Z, which is also the
// backup's exportedAt. Output is byte-identical across runs.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { toMinor } from "@pernce/core";
import { createAccount, type AccountInput } from "../src/data/accounts";
import { exportBackup } from "../src/data/backup";
import { periodOf, budgetsForMonth, setBudget } from "../src/data/budgets";
import { listCategories } from "../src/data/categories";
import { setUuidGenerator } from "../src/data/ids";
import { setRateOverride } from "../src/data/rates";
import { netWorth } from "../src/data/reports";
import { setupProfile } from "../src/data/profile";
import { createTransaction } from "../src/data/transactions";
import { createTestDb } from "../src/data/test-utils";

/* ---- fake clock ------------------------------------------------------ */

const RealDate = Date;
let clock = RealDate.UTC(2026, 8, 1, 9, 0, 0); // advances 1 ms per read
class FakeDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(clock++);
    else super(...(args as [number]));
  }
  static now() {
    return clock++;
  }
}
globalThis.Date = FakeDate as DateConstructor;
const setClock = (iso: string) => {
  clock = RealDate.parse(iso);
};
const NOW = "2026-11-20T12:00:00Z";

/* ---- seeded randomness ----------------------------------------------- */

let seed = 20261120;
function rand() {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (lo: number, hi: number, step = 1) => Math.round((lo + rand() * (hi - lo)) / step) * step;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");
// Separate stream for ids so changing the data doesn't reshuffle every id.
setUuidGenerator(() => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`);

/* ---- build ------------------------------------------------------------ */

async function main() {
  const db = await createTestDb();
  setClock("2026-09-01T09:00:00Z");
  setupProfile(db, { name: "Demo", baseCurrency: "USD" }); // seeds the default categories

  const cat = new Map(listCategories(db).map((c) => [c.name, c.id]));
  const catId = (name: string) => {
    const id = cat.get(name);
    if (!id) throw new Error(`No default category "${name}"`);
    return id;
  };

  function account(name: string, type: AccountInput["type"], currency: string, color: string, opening: number) {
    return createAccount(db, { name, type, currency, color, openingBalance: toMinor(opening, currency) });
  }
  const usd = account("Chase Checking", "bank", "USD", "primary", 4200);
  const eur = account("Revolut EUR", "bank", "EUR", "accent-violet", 650);
  const gbp = account("Monzo", "bank", "GBP", "accent-pink", 380);
  const ghs = account("MTN MoMo", "mobile_money", "GHS", "accent-yellow", 800);
  const cad = account("Wise CAD", "bank", "CAD", "accent-teal", 950);

  const cur = new Map([
    [usd, "USD"],
    [eur, "EUR"],
    [gbp, "GBP"],
    [ghs, "GHS"],
    [cad, "CAD"],
  ]);

  type Tx = { date: string; account: string; kind: "income" | "expense"; category: string; amount: number; note: string };
  type Transfer = { date: string; from: string; to: string; amount: number; rate: number; fee: number; note: string };
  const txs: Tx[] = [];
  const transfers: Transfer[] = [];
  const spend = (date: string, account: string, category: string, amount: number, note: string) =>
    txs.push({ date, account, kind: "expense", category, amount, note });
  const earn = (date: string, account: string, category: string, amount: number, note: string) =>
    txs.push({ date, account, kind: "income", category, amount, note });
  const day = (m: number, d: number) => `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Monthly rhythm in USD, September to November (November stops at the 20th).
  for (const m of [9, 10, 11]) {
    const last = m === 11 ? 20 : 30;
    earn(day(m, 16), usd, "Salary & Wages", 6400, "Monthly salary");
    spend(day(m, 2), usd, "Rent & Mortgage", 1850, "Rent");
    spend(day(m, 3), usd, "Utilities", between(82, 104, 0.5), "Electricity and water");
    spend(day(m, 4), usd, "Phone & Internet", 55, "Mobile plan");
    spend(day(m, 5), usd, "Subscriptions", 15.49, "Netflix");
    spend(day(m, 5), usd, "Subscriptions", 11.99, "Music streaming");
    for (let d = 3; d <= last; d += 7) spend(day(m, d + 1), usd, "Groceries", between(54, 118, 0.01), pick(["Groceries", "Weekly groceries", "Farmers market"]));
    for (let i = 0; i < (m === 11 ? 3 : 4); i++) spend(day(m, between(2, last, 1)), usd, "Transport", between(9, 27, 0.01), pick(["Uber", "Metro card", "Taxi"]));
    for (let i = 0; i < (m === 11 ? 4 : 3); i++) spend(day(m, between(2, last, 1)), usd, "Dining Out", between(22, 58, 0.01), pick(["Dinner out", "Lunch with friends", "Coffee and brunch", "Takeaway"]));
    spend(day(m, between(8, 18, 1)), usd, "Entertainment", between(18, 46, 0.01), pick(["Cinema", "Concert tickets", "Museum"]));
    spend(day(m, between(10, last, 1)), usd, "Shopping", between(35, 120, 0.01), pick(["Clothes", "Home goods", "Books"]));
  }
  earn(day(9, 24), usd, "Freelance & Side Gigs", 450, "Freelance project");
  earn(day(10, 14), usd, "Interest & Dividends", 12.4, "Savings interest");
  spend(day(10, 9), usd, "Health & Medical", 65, "Pharmacy");
  spend(day(11, 12), usd, "Gifts & Donations", 40, "Birthday gift");
  earn(day(11, 9), usd, "Refunds & Reimbursements", 38.5, "Returned order");

  // September in Toronto (Canadian dollar account).
const toronto: [number, string, string, number, string][] = [
  [12, cad, "Transport", 34.5, "Airport train"],
  [12, cad, "Dining Out", 28.4, "Poutine"],
  [13, cad, "Dining Out", 46.2, "Dinner"],
  [13, cad, "Entertainment", 38, "Museum tickets"],
  [14, cad, "Shopping", 64.9, "Souvenirs"],
  [15, cad, "Dining Out", 52.3, "Brunch"],
  [16, cad, "Travel", 285, "Hotel, three nights"],
  [18, cad, "Transport", 27.8, "Train to the airport"],
];
for (const [d, a, c, amt, note] of toronto) spend(day(9, d), a, c, amt, note);
spend(day(11, 7), cad, "Subscriptions", 9.99, "Language app");

// Funding transfers, with fees (source currency).
  transfers.push({ date: day(9, 5), from: usd, to: ghs, amount: 500, rate: 10.82, fee: 5, note: "Top up mobile money" });
  transfers.push({ date: day(10, 3), from: usd, to: eur, amount: 1200, rate: 0.8625, fee: 3.5, note: "Lisbon trip funds" });
  transfers.push({ date: day(10, 20), from: eur, to: gbp, amount: 400, rate: 0.8712, fee: 1.5, note: "London weekend" });
  transfers.push({ date: day(11, 4), from: usd, to: ghs, amount: 600, rate: 10.91, fee: 6, note: "Top up mobile money" });
  transfers.push({ date: day(11, 6), from: usd, to: eur, amount: 500, rate: 0.8601, fee: 2.5, note: "Euro spending money" });

  // October in Lisbon (euro account).
  const lisbon: [number, string, number, string][] = [
    [10, "Travel", 540, "Hotel, six nights"],
    [10, "Transport", 24, "Airport taxi"],
    [11, "Dining Out", 38.5, "Seafood dinner"],
    [11, "Entertainment", 22, "Castle tickets"],
      [12, "Transport", 12.6, "Tram day pass"],
    [13, "Shopping", 46, "Ceramics"],
    [13, "Dining Out", 41, "Dinner"],
      [15, "Entertainment", 35, "Day trip"],
    [15, "Dining Out", 29.5, "Lunch"],
    [16, "Transport", 28, "Airport taxi"],
  ];
  for (const [d, c, amt, note] of lisbon) spend(day(10, d), eur, c, amt, note);
  spend(day(11, 8), eur, "Subscriptions", 9.99, "Video streaming");
  spend(day(11, 13), eur, "Dining Out", 36.8, "Dinner out");
  spend(day(11, 17), eur, "Shopping", 52, "Clothes");

  // London weekend (pound account) and a few daily ones.
  spend(day(10, 24), gbp, "Travel", 112, "Hotel, two nights");
  spend(day(10, 24), gbp, "Transport", 18.4, "Tube");
  spend(day(10, 25), gbp, "Dining Out", 34.5, "Pub dinner");
  spend(day(10, 25), gbp, "Entertainment", 27, "Theatre");
  spend(day(10, 26), gbp, "Dining Out", 8.9, "Coffee and breakfast");
  spend(day(10, 26), gbp, "Shopping", 31.2, "Books");
  spend(day(11, 10), gbp, "Subscriptions", 7.99, "Podcast app");
  spend(day(11, 15), gbp, "Groceries", 23.6, "Groceries");

  // Day to day in cedis (mobile money).
  for (const m of [9, 10, 11]) {
    const last = m === 11 ? 20 : 30;
    spend(day(m, 7), ghs, "Family Support", 600, "Monthly support");
    spend(day(m, 8), ghs, "Phone & Internet", between(40, 70, 1), "Airtime and data");
    for (let i = 0; i < 2; i++) spend(day(m, between(9, last, 1)), ghs, "Groceries", between(70, 190, 1), pick(["Market", "Groceries", "Supermarket"]));
    for (let i = 0; i < 2; i++) spend(day(m, between(9, last, 1)), ghs, "Transport", between(15, 60, 1), pick(["Taxi", "Ride-hailing"]));
    spend(day(m, between(14, last, 1)), ghs, "Dining Out", between(60, 140, 1), "Lunch out");
  }

  // Write in date order, with the clock on each row's day, like real entries.
  type Entry = { date: string; run: () => void };
  const entries: Entry[] = [
    ...transfers.map((t) => ({
      date: t.date,
      run: () =>
        createTransaction(db, {
          type: "transfer",
          accountId: t.from,
          transferAccountId: t.to,
          amount: toMinor(t.amount, cur.get(t.from)!),
          exchangeRate: t.rate,
          fee: toMinor(t.fee, cur.get(t.from)!),
          note: t.note,
          occurredAt: t.date,
        }),
    })),
    ...txs.map((t) => ({
      date: t.date,
      run: () =>
        createTransaction(db, {
          type: t.kind,
          accountId: t.account,
          categoryId: catId(t.category),
          amount: toMinor(t.amount, cur.get(t.account)!),
          note: t.note,
          occurredAt: t.date,
        }),
    })),
  ];
  // Stable sort: ties keep insertion order (transfers are listed first).
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Transfers fund accounts before the day's spending, so no balance dips.
  entries.forEach((e, i) => {
    setClock(`${e.date}T${String(8 + (i % 10)).padStart(2, "0")}:00:00Z`);
    e.run();
  });

  // Manual rates (1 unit = x USD) so net worth converts; backups carry overrides.
  setClock("2026-11-01T09:00:00Z");
  setRateOverride(db, "EUR", 1.162);
  setRateOverride(db, "GBP", 1.329);
  setRateOverride(db, "GHS", 0.0917);
  setRateOverride(db, "CAD", 0.7135);

  // Budgets for November: size each from the month's real spend, so the
  // percentages are exactly what the screenshots should show.
  const period = periodOf(new FakeDate(2026, 10, 15));
  const wanted: [string, number][] = [
    ["Groceries", 0.62],
    ["Dining Out", 1.18], // over budget
    ["Transport", 0.91], // near the limit
    ["Subscriptions", 0.6],
    ["Entertainment", 0.45],
  ];
  for (const [name] of wanted) setBudget(db, { categoryId: catId(name), period, amount: toMinor(10000, "USD"), currency: "USD" });
  const spent = new Map(budgetsForMonth(db, new FakeDate(2026, 10, 15)).map((b) => [b.categoryId, b.spent]));
  for (const [name, pct] of wanted) {
    const amount = Math.max(10, Math.round(spent.get(catId(name))! / pct / 10) * 10);
    setBudget(db, { categoryId: catId(name), period, amount: toMinor(amount, "USD"), currency: "USD" });
  }

  setClock(NOW);
  const backup = exportBackup(db);
  const out = resolve(__dirname, "../../docs/demo/pernce-demo-backup.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(backup, null, 2) + "\n");

  const nw = netWorth(db);
  console.log(
    `wrote ${out}\n${backup.accounts.length} accounts, ${backup.transactions.length} transactions, ` +
      `${backup.budgets.length} budgets; net worth ${JSON.stringify(nw)}`,
  );
  for (const b of budgetsForMonth(db, new FakeDate(2026, 10, 15))) {
    console.log(`  ${b.spent.toFixed(2)} / ${(b.amount / 100).toFixed(2)} (${Math.round(b.pct)}%)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
