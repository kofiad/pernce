import assert from "node:assert/strict";
import { test } from "node:test";
import { csvToObjects, parseCSV, toCSV } from "./csv";

test("csv: toCSV quotes commas, newlines and double quotes, and parseCSV reads them back", () => {
  const rows = [
    { note: "lunch, with Ama", amount: 12.5, memo: 'said "hi"' },
    { note: "line one\nline two", amount: 3, memo: null },
    { note: "plain", amount: 0, memo: "" },
  ];
  const text = toCSV(rows, ["note", "amount", "memo"]);
  assert.equal(
    text,
    'note,amount,memo\n"lunch, with Ama",12.5,"said ""hi"""\n"line one\nline two",3,\nplain,0,',
  );
  assert.deepEqual(parseCSV(text), [
    ["note", "amount", "memo"],
    ["lunch, with Ama", "12.5", 'said "hi"'],
    ["line one\nline two", "3", ""],
    ["plain", "0", ""],
  ]);
});

test("csv: toCSV writes only the requested columns, with missing values empty", () => {
  assert.equal(toCSV([{ a: 1, b: 2 }, { a: 3 }], ["b", "a"]), "b,a\n2,1\n,3");
  assert.equal(toCSV([], ["a", "b"]), "a,b");
});

test("csv: toCSV neutralizes spreadsheet formulas by prefixing a quote", () => {
  for (const evil of ["=1+1", "+1", "-1", "@SUM(A1)", "=cmd|'/c calc'!A1"]) {
    const line = toCSV([{ note: evil }], ["note"]).split("\n")[1];
    assert.equal(line.replace(/^"|"$/g, ""), `'${evil}`, evil);
  }
  assert.equal(toCSV([{ note: "a=b" }], ["note"]), "note\na=b");
  assert.equal(toCSV([{ note: "=1,2" }], ["note"]), "note\n\"'=1,2\"");
});

test("csv: parseCSV accepts CRLF and bare CR line endings, with or without a final newline", () => {
  const expected = [["a", "b"], ["1", "2"], ["3", "4"]];
  assert.deepEqual(parseCSV("a,b\r\n1,2\r\n3,4\r\n"), expected);
  assert.deepEqual(parseCSV("a,b\r\n1,2\r\n3,4"), expected);
  assert.deepEqual(parseCSV("a,b\r1,2\r3,4"), expected);
  assert.deepEqual(parseCSV("a,b\n1,2\n3,4\n"), expected);
});

test("csv: parseCSV keeps CRLF and escaped quotes inside quoted fields", () => {
  assert.deepEqual(parseCSV('a,b\r\n"x\r\ny","he said ""no"""\r\n'), [
    ["a", "b"],
    ["x\r\ny", 'he said "no"'],
  ]);
});

test("csv: parseCSV handles empty input, blank lines and empty fields", () => {
  assert.deepEqual(parseCSV(""), []);
  assert.deepEqual(parseCSV("\n\r\n  \n"), []);
  assert.deepEqual(parseCSV("a,b,c\n\n1,,3\n"), [["a", "b", "c"], ["1", "", "3"]]);
  assert.deepEqual(parseCSV(",\n1,2"), [["1", "2"]]); // all-empty rows are dropped
});

test("csv: csvToObjects maps rows to trimmed header names, padding short rows", () => {
  assert.deepEqual(csvToObjects(" Date , Amount ,Note\n2026-09-01,12.5,\"a, b\"\n2026-09-02,3"), [
    { Date: "2026-09-01", Amount: "12.5", Note: "a, b" },
    { Date: "2026-09-02", Amount: "3", Note: "" },
  ]);
  assert.deepEqual(csvToObjects(""), []);
  assert.deepEqual(csvToObjects("a,b\n"), []);
});
