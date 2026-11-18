import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currencyDecimals,
  legacyMinorFactor,
  fromMinor,
  minorToInput,
  parseAmountInput,
  roundToCurrency,
  sanitizeAmountInput,
  toMinor,
} from "./money";
import { formatHlc, parseHlc, tickHlc } from "./hlc";
import { formatAmount } from "./format";
import { hlcAfter, isSyncHlc } from "./sync";
import { parseUsdQuotes } from "./fx";
import { CATEGORY_ICONS, ICON_PATHS } from "./icons";
import { balanceDeltas, resolveTransactionInput, type TransactionInput } from "./transactions";
import { budgetProgress, categorySpend, monthlySeries, netWorthTrend, summarizeNetWorth } from "./reports";
import { DEFAULT_CATEGORIES } from "./categories";
import { colors, isColorValue, resolveColor } from "./tokens";
import { ACCOUNT_COLORS, CURRENCIES, FEATURED_CURRENCIES, RETIRED_CURRENCIES, VOLATILE_CURRENCIES } from "./currency";

const usd = { id: "a-usd", currency: "USD" };
const usd2 = { id: "a-usd2", currency: "USD" };
const ghs = { id: "a-ghs", currency: "GHS" };
const rates = { USD: 1, GHS: 0.08, XOF: 0.0016 };

function tx(overrides: Partial<TransactionInput>): TransactionInput {
  return { accountId: usd.id, type: "expense", amount: 10, currency: "USD", occurredAt: "2026-09-01", ...overrides };
}

test("money: per-currency precision round-trips", () => {
  assert.equal(currencyDecimals("USD"), 2);
  assert.equal(currencyDecimals("XOF"), 2);
  assert.equal(currencyDecimals("XAF"), 2);
  assert.equal(currencyDecimals("NGN"), 2);
  assert.equal(toMinor("12.34", "USD"), 1234);
  assert.equal(toMinor(0.1 + 0.2, "USD"), 30);
  assert.equal(toMinor(1500.6, "XOF"), 150060);
  assert.equal(fromMinor(1234, "USD"), 12.34);
  assert.equal(roundToCurrency(1234.567, "XAF"), 1234.57);
  assert.equal(legacyMinorFactor("XOF"), 100);
  assert.equal(legacyMinorFactor("XAF"), 100);
  assert.equal(legacyMinorFactor("USD"), 1);
  assert.equal(legacyMinorFactor(null), 1);
  assert.ok(Object.is(toMinor(-0.001, "USD"), 0));
  assert.throws(() => toMinor("abc", "USD"));
});

test("resolve: rejects what the web app rejects, with the same messages", () => {
  assert.throws(() => resolveTransactionInput(tx({}), null, null), /Account not found/);
  assert.throws(() => resolveTransactionInput(tx({ currency: "GHS" }), usd, null), /does not match account currency/);
  assert.throws(() => resolveTransactionInput(tx({ amount: 0 }), usd, null), /positive number/);
  assert.throws(() => resolveTransactionInput(tx({ type: "transfer" }), usd, null), /destination account is required/);
  assert.throws(
    () => resolveTransactionInput(tx({ type: "transfer", transferAccountId: usd.id }), usd, usd),
    /same account/,
  );
  assert.throws(
    () => resolveTransactionInput(tx({ type: "transfer", transferAccountId: "missing" }), usd, null),
    /destination account not found/,
  );
  assert.throws(
    () => resolveTransactionInput(tx({ type: "transfer", transferAccountId: ghs.id }), usd, ghs),
    /needs the amount received or the exchange rate/,
  );
});

test("resolve: same-currency transfer forces transferAmount = amount and clears category", () => {
  const r = resolveTransactionInput(
    tx({ type: "transfer", transferAccountId: usd2.id, categoryId: "c1", transferAmount: 999, fee: 1 }),
    usd,
    usd2,
  );
  assert.equal(r.transferAmount, 10);
  assert.equal(r.exchangeRate, null);
  assert.equal(r.categoryId, null);
  assert.equal(r.transferCurrency, "USD");
});

test("resolve: cross-currency derives whichever of amount/rate is missing", () => {
  const byRate = resolveTransactionInput(
    tx({ type: "transfer", transferAccountId: ghs.id, exchangeRate: 12.345 }),
    usd,
    ghs,
  );
  assert.equal(byRate.transferAmount, 123.45);
  assert.equal(byRate.transferCurrency, "GHS");
  const byAmount = resolveTransactionInput(
    tx({ type: "transfer", transferAccountId: ghs.id, transferAmount: 120 }),
    usd,
    ghs,
  );
  assert.equal(byAmount.exchangeRate, 12);
});

test("balanceDeltas: income, expense, transfer with fee", () => {
  const income = resolveTransactionInput(tx({ type: "income" }), usd, null);
  assert.deepEqual(balanceDeltas(income), [{ accountId: usd.id, delta: 10 }]);
  const expense = resolveTransactionInput(tx({}), usd, null);
  assert.deepEqual(balanceDeltas(expense), [{ accountId: usd.id, delta: -10 }]);
  const transfer = resolveTransactionInput(
    tx({ type: "transfer", transferAccountId: ghs.id, transferAmount: 120, fee: 0.5 }),
    usd,
    ghs,
  );
  assert.deepEqual(balanceDeltas(transfer), [
    { accountId: usd.id, delta: -10.5 },
    { accountId: ghs.id, delta: 120 },
  ]);
});

test("reports: net worth, budgets, category spend", () => {
  const nw = summarizeNetWorth(
    [
      { currency: "USD", balance: 100 },
      { currency: "GHS", balance: 1000 },
    ],
    "USD",
    rates,
  );
  assert.equal(nw.totalBase, 180);

  const spend = [
    { categoryId: "food", currency: "USD", total: 30 },
    { categoryId: "food", currency: "GHS", total: 250 },
    { categoryId: "rent", currency: "USD", total: 500 },
  ];
  const b = budgetProgress({ categoryId: "food", amount: 40, currency: "USD" }, spend, rates);
  assert.equal(b.spent, 50);
  assert.deepEqual(b.convertedFrom, ["GHS"]);
  assert.equal(b.over, true);

  const cs = categorySpend(spend, [{ id: "food" }, { id: "rent" }], "USD", rates);
  assert.deepEqual(
    cs.map((c) => c.category?.id),
    ["rent", "food"],
  );
});

test("reports: monthly series counts transfer fees as spend and fills empty months", () => {
  const now = new Date(2026, 8, 15);
  const series = monthlySeries(
    [
      { month: "2026-09", type: "income", currency: "USD", total: 100, fees: 0 },
      { month: "2026-09", type: "transfer", currency: "USD", total: 50, fees: 2 },
      { month: "2026-07", type: "expense", currency: "GHS", total: 125, fees: 0 },
    ],
    3,
    "USD",
    rates,
    now,
  );
  assert.deepEqual(
    series.map((s) => [s.month.getMonth(), s.income, s.expense]),
    [
      [6, 0, 10],
      [7, 0, 0],
      [8, 100, 2],
    ],
  );
  assert.deepEqual(
    netWorthTrend(series, 500).map((p) => p.value),
    [402, 402, 500],
  );
});

test("tokens: every category and account color resolves", () => {
  for (const c of DEFAULT_CATEGORIES) assert.ok(c.color in colors, c.color);
  for (const c of ACCOUNT_COLORS) assert.ok(c in colors, c);
});

test("tokens: stored colors are a token or a lowercase #rrggbb", () => {
  assert.ok(isColorValue("accent-teal"));
  assert.ok(isColorValue("#2f8f6b"));
  for (const bad of ["#2F8F6B", "#fff", "2f8f6b", "red", "", null, 1]) assert.equal(isColorValue(bad), false, String(bad));
  assert.equal(resolveColor("#2f8f6b"), "#2f8f6b");
  assert.equal(resolveColor("accent-teal"), colors["accent-teal"]);
  assert.equal(resolveColor("nope"), colors.stone);
});

test("money: amount inputs respect each currency's decimals", () => {
  assert.equal(sanitizeAmountInput("1,234.567", "USD"), "1234.56");
  assert.equal(sanitizeAmountInput("1500.567", "XOF"), "1500.56");
  assert.equal(sanitizeAmountInput("1.2.3", "USD"), "1.23");
  assert.equal(sanitizeAmountInput("-12", "USD"), "12");
  assert.equal(sanitizeAmountInput("-12", "USD", { allowNegative: true }), "-12");

  assert.deepEqual(parseAmountInput("12.34", "USD"), { minor: 1234, error: null });
  assert.deepEqual(parseAmountInput("1500", "XOF"), { minor: 150000, error: null });
  assert.deepEqual(parseAmountInput("1500.5", "XAF"), { minor: 150050, error: null });
  assert.match(parseAmountInput("1500.505", "XOF").error!, /at most 2 decimal places/);
  assert.match(parseAmountInput("1.234", "GHS").error!, /at most 2 decimal places/);
  assert.match(parseAmountInput("0", "USD").error!, /positive/);
  assert.deepEqual(parseAmountInput("0", "USD", { allowZero: true }), { minor: 0, error: null });
  assert.match(parseAmountInput("-5", "USD").error!, /Not a valid amount/);
  assert.deepEqual(parseAmountInput("-5.5", "USD", { allowNegative: true }), { minor: -550, error: null });
  assert.match(parseAmountInput("", "USD").error!, /Enter an amount/);
  assert.match(parseAmountInput(".", "USD").error!, /Not a valid amount/);

  assert.equal(minorToInput(123450, "USD"), "1234.5");
  assert.equal(minorToInput(150000, "USD"), "1500");
  assert.equal(minorToInput(150050, "XOF"), "1500.5");
  assert.equal(minorToInput(-5, "USD"), "-0.05");
});

test("resolve: round option rounds a derived amount received to the destination's precision", () => {
  const xof = { id: "a-xof", currency: "XOF" };
  const web = resolveTransactionInput(
    tx({ type: "transfer", transferAccountId: xof.id, exchangeRate: 600.123 }),
    usd,
    xof,
  );
  assert.equal(web.transferAmount, 6001.23);
  const mobile = resolveTransactionInput(
    tx({ type: "transfer", transferAccountId: xof.id, exchangeRate: 600.1234 }),
    usd,
    xof,
    { round: roundToCurrency },
  );
  assert.equal(mobile.transferAmount, 6001.23);
});

test("hlc: timestamps sort in write order, even when the clock goes backwards", () => {
  const a = tickHlc(null, "node-a", 1_000);
  const b = tickHlc(a, "node-a", 1_000);
  const c = tickHlc(b, "node-a", 500); // clock jumped back
  const d = tickHlc(c, "node-a", 2_000);
  assert.deepEqual([a, b, c, d], [a, b, c, d].slice().sort());
  assert.ok(a < b && b < c && c < d);
  assert.deepEqual(parseHlc(c), { wall: 1_000, counter: 2, node: "node-a" });
  assert.equal(parseHlc(formatHlc({ wall: 1_790_000_000_000, counter: 15, node: "x" })).counter, 15);
  assert.ok(tickHlc(formatHlc({ wall: 5, counter: 0xffff, node: "n" }), "n", 5) > formatHlc({ wall: 5, counter: 0xffff, node: "n" }));
  assert.throws(() => parseHlc("nope"));
});

test("fx: parses the API payload into rates to USD, skipping junk", () => {
  const rates = parseUsdQuotes({ usd: { ghs: 12.5, xof: 600, eur: 0, cad: "x" } }, ["USD", "GHS", "XOF", "EUR", "CAD", "GBP"]);
  assert.deepEqual(rates, { GHS: 0.08, XOF: 1 / 600 });
  assert.throws(() => parseUsdQuotes({ nope: 1 }, ["GHS"]));
  assert.throws(() => parseUsdQuotes(null, ["GHS"]));
});

test("icons: every default category icon and picker icon exists", () => {
  for (const c of DEFAULT_CATEGORIES) assert.ok(c.icon in ICON_PATHS, c.icon);
  for (const i of CATEGORY_ICONS) assert.ok(i in ICON_PATHS, i);
});

test("format: formatAmount uses each currency's own precision", () => {
  assert.equal(formatAmount(1234.5, "USD"), "$1,234.50");
  assert.match(formatAmount(1500, "XOF"), /^XOF\s1,500\.00$/);
  assert.equal(formatAmount(12, "GHS", { signDisplay: "always" }).startsWith("+"), true);
  assert.equal(formatAmount(-3, "USD"), "-$3.00");
});

test("sync: the server accepts HLCs the devices make, and orders them", () => {
  const node = "3f2a9c1e0b7d4e21";
  const a = tickHlc(null, node, 1_790_000_000_000);
  const b = tickHlc(a, node, 1_790_000_000_000);
  assert.ok(isSyncHlc(a) && isSyncHlc(b));
  assert.ok(hlcAfter(b, a) && !hlcAfter(a, b) && !hlcAfter(a, a));
  assert.ok(hlcAfter(tickHlc(null, "0", 1_790_000_000_001), tickHlc(null, "ffff", 1_790_000_000_000)));
  for (const bad of ["", "nope", "179000000000-0000-a", "1790000000000-000g-a", "1790000000000-0000-", "1790000000000-0000-a b", `1790000000000-0000-${"a".repeat(65)}`]) {
    assert.equal(isSyncHlc(bad), false, bad);
  }
});

test("currencies: ZAR is available, codes are unique, featured ones come first", () => {
  const codes = CURRENCIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes("ZAR"));
  assert.ok(CURRENCIES.every((c) => /^[A-Z]{3}$/.test(c.code) && c.name && c.symbol));
  assert.deepEqual(FEATURED_CURRENCIES, codes.slice(0, FEATURED_CURRENCIES.length));
  assert.equal(currencyDecimals("ZAR"), 2);
  // Retired: BGN (euro since 2026-01-01), ANG (replaced by XCG in 2025).
  assert.ok(codes.includes("XCG"));
  for (const retired of Object.keys(RETIRED_CURRENCIES)) assert.ok(!codes.includes(retired as never), `${retired} is retired`);
  for (const v of VOLATILE_CURRENCIES) assert.ok(codes.includes(v as never), `${v} must be a supported currency`);
});
