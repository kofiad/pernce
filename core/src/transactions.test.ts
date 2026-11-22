import assert from "node:assert/strict";
import { test } from "node:test";
import { roundToCurrency } from "./money";
import { balanceDeltas, resolveTransactionInput, type TransactionInput } from "./transactions";

const usd = { id: "a-usd", currency: "USD" };
const usd2 = { id: "a-usd2", currency: "USD" };
const ghs = { id: "a-ghs", currency: "GHS" };

function tx(overrides: Partial<TransactionInput>): TransactionInput {
  return { accountId: usd.id, type: "expense", amount: 10, currency: "USD", occurredAt: "2026-09-01", ...overrides };
}

test("resolve: validates account, amount and transfer inputs with clear errors", () => {
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

test("resolve: fee must be zero or positive, and an amount received that rounds to zero is rejected", () => {
  assert.throws(() => resolveTransactionInput(tx({ type: "transfer", transferAccountId: usd2.id, fee: -1 }), usd, usd2), /Fee must be zero or a positive number/);
  assert.throws(() => resolveTransactionInput(tx({ type: "transfer", transferAccountId: usd2.id, fee: NaN }), usd, usd2), /Fee must be/);
  assert.throws(
    () => resolveTransactionInput(tx({ amount: 0.01, type: "transfer", transferAccountId: ghs.id, exchangeRate: 0.01 }), usd, ghs),
    /rounds to zero/,
  );
});

test("resolve: cross-currency transfer with both amount and rate stores them as given", () => {
  const r = resolveTransactionInput(
    tx({ type: "transfer", transferAccountId: ghs.id, transferAmount: 119, exchangeRate: 12, fee: 2 }),
    usd,
    ghs,
  );
  assert.equal(r.transferAmount, 119);
  assert.equal(r.exchangeRate, 12);
  assert.equal(r.fee, 2);
  assert.deepEqual(balanceDeltas(r), [
    { accountId: usd.id, delta: -12 },
    { accountId: ghs.id, delta: 119 },
  ]);
});

test("resolve: income and expense drop any transfer fields", () => {
  const r = resolveTransactionInput(
    tx({ type: "expense", categoryId: "food", transferAccountId: "x", transferAmount: 5, exchangeRate: 2, fee: 3 }),
    usd,
    null,
  );
  assert.equal(r.categoryId, "food");
  assert.equal(r.transferAccountId, null);
  assert.equal(r.transferAmount, null);
  assert.equal(r.transferCurrency, null);
  assert.equal(r.exchangeRate, null);
  assert.equal(r.fee, 0);
});

test("balanceDeltas: a transfer with no resolved amount received moves nothing", () => {
  assert.deepEqual(
    balanceDeltas({ type: "transfer", accountId: "a", transferAccountId: "b", amount: 5, fee: 0, transferAmount: null }),
    [],
  );
});
