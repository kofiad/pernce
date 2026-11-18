import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseDatabaseName, directoryUri } from "./databaseName";

test("an existing perance.db is kept; fresh installs use pernce.db", () => {
  assert.equal(chooseDatabaseName(true), "perance.db");
  assert.equal(chooseDatabaseName(false), "pernce.db");
});

test("when looking for perance.db fails: pernce.db if it exists, else perance.db", () => {
  assert.equal(chooseDatabaseName(null, true), "pernce.db");
  assert.equal(chooseDatabaseName(null, false), "perance.db");
  assert.equal(chooseDatabaseName(null, null), "perance.db", "neither look worked");
  assert.equal(chooseDatabaseName(true, true), "perance.db", "the legacy file wins");
});

test("a database directory path becomes a file URI once", () => {
  assert.equal(directoryUri("/data/user/0/app/files/SQLite"), "file:///data/user/0/app/files/SQLite");
  assert.equal(directoryUri("file:///var/mobile/Documents/SQLite"), "file:///var/mobile/Documents/SQLite");
});
