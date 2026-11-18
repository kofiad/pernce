import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { asSnapshot, chooseSnapshot, isHotJournal, POOL_HEADER_SIZE, poolFilePath, sqliteImage } from "./legacyPool";

// The digest exactly as the installed AccessHandlePoolVFS computes it, so
// an upstream change to the header format fails here.
const expoSqlite = dirname(createRequire(import.meta.url).resolve("expo-sqlite/package.json"));
const vfsSource = readFileSync(join(expoSqlite, "web/wa-sqlite/AccessHandlePoolVFS.js"), "utf8");
const body = /#computeDigest\(corpus\) \{([\s\S]*?)\n  \}/.exec(vfsSource)?.[1];
assert.ok(body, "found #computeDigest in AccessHandlePoolVFS.js");
const vfsDigest = new Function("corpus", body) as (corpus: Uint8Array) => Uint32Array;

/** A pool file as the VFS's #setAssociatedPath writes it. */
function poolFile(path: string, contents: Uint8Array, flags = 0x100 /* SQLITE_OPEN_MAIN_DB */) {
  const file = new Uint8Array(POOL_HEADER_SIZE + contents.length);
  const corpus = new Uint8Array(516);
  new TextEncoder().encodeInto(path, corpus);
  new DataView(corpus.buffer).setUint32(512, flags);
  file.set(corpus, 0);
  file.set(new Uint8Array(vfsDigest(corpus).buffer), 516);
  file.set(contents, POOL_HEADER_SIZE);
  return file;
}

function sqliteFile() {
  const path = join(mkdtempSync(join(tmpdir(), "perance-pool-")), "perance.db");
  const db = new DatabaseSync(path);
  db.exec("create table t (x); insert into t values (1), (2);");
  db.close();
  return new Uint8Array(readFileSync(path));
}

test("pool files give the SQLite path they hold; free and damaged ones give none", () => {
  const file = poolFile("/perance.db", new Uint8Array(10));
  assert.equal(poolFilePath(file.subarray(0, POOL_HEADER_SIZE)), "/perance.db");
  assert.equal(poolFilePath(poolFile("", new Uint8Array(0))), null);
  const damaged = file.slice(0, POOL_HEADER_SIZE);
  damaged[3] ^= 1;
  assert.equal(poolFilePath(damaged), null);
});

test("the database image is checked and trimmed to its page count", () => {
  const image = sqliteFile();
  assert.deepEqual(sqliteImage(image), image);
  // A pool file can be longer than the database (truncation isn't exact).
  const padded = new Uint8Array(image.length + 4096);
  padded.set(image);
  assert.deepEqual(sqliteImage(padded), image);
  assert.equal(sqliteImage(new Uint8Array(4096)), null);
  assert.equal(sqliteImage(image.subarray(0, image.length - 1)), null);
});

test("a journal with content is hot; an emptied one isn't", () => {
  assert.equal(isHotJournal(new Uint8Array(0)), false);
  assert.equal(isHotJournal(new Uint8Array(512)), false);
  const journal = new Uint8Array(512);
  journal.set([0xd9, 0xd5, 0x05, 0xf9]);
  assert.equal(isHotJournal(journal), true);
});

test("the web snapshot saved under the old name is used once, when there is no new one", () => {
  const own = new Uint8Array([1, 2]);
  const old = new Uint8Array([3]);
  assert.deepEqual(chooseSnapshot(own, old), { bytes: own, fromOldName: false });
  assert.deepEqual(chooseSnapshot(undefined, old), { bytes: old, fromOldName: true });
  assert.deepEqual(chooseSnapshot(new Uint8Array(0), old), { bytes: old, fromOldName: true });
  assert.deepEqual(chooseSnapshot(undefined, undefined), { bytes: null, fromOldName: false });
  assert.equal(asSnapshot("not bytes"), null);
});
