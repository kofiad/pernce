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

test("money: every currency, including CFA francs, uses 2 decimals (no 0- or 3-decimal currencies)", () => {
  for (const c of ["JPY", "KWD", "BHD", "XOF", "XAF", "USD", "UNKNOWN"]) assert.equal(currencyDecimals(c), 2, c);
  assert.equal(toMinor(1500, "JPY"), 150000);
  assert.equal(toMinor(1.234, "KWD"), 123);
  assert.equal(fromMinor(123, "KWD"), 1.23);
});

test("money: toMinor and fromMinor round-trip, including negatives and zero", () => {
  for (const minor of [0, 1, 5, 99, 100, 1234, -1, -5, -1234, 999_999_999]) {
    assert.equal(toMinor(fromMinor(minor, "USD"), "USD"), minor, String(minor));
  }
  assert.equal(toMinor(-12.34, "USD"), -1234);
  assert.equal(toMinor("-12.34", "USD"), -1234);
  assert.equal(fromMinor(-1234, "USD"), -12.34);
  assert.equal(fromMinor(0, "USD"), 0);
  assert.throws(() => toMinor(NaN, "USD"), /Not a valid amount/);
  assert.throws(() => toMinor(Infinity, "USD"), /Not a valid amount/);
});

test("money: half-way amounts round with Math.round (towards +infinity), on the binary value", () => {
  assert.equal(toMinor(0.125, "USD"), 13);
  assert.equal(toMinor(0.124, "USD"), 12);
  assert.equal(toMinor(-0.125, "USD"), -12);
  assert.equal(toMinor(-0.126, "USD"), -13);
  assert.equal(toMinor(0.005, "USD"), 1);
  assert.equal(toMinor(0.004, "USD"), 0);
  assert.equal(roundToCurrency(2.675, "USD"), 2.68);
  assert.equal(roundToCurrency(1234.567, "USD"), 1234.57);
  assert.equal(roundToCurrency(-1234.567, "USD"), -1234.57);
});
