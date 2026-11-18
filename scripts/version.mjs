// Keeps the one Pernce release version in sync everywhere it's recorded:
// the repo root, the web app, @pernce/core, the Expo app's package.json, and app.json
// (which becomes the store-facing version). Releases use CalVer:
// YYYY.MM.PATCH, e.g. 2026.10.0, tagged as v2026.10.0.
//
//   node scripts/version.mjs set 2026.10.1   # bump everything
//   node scripts/version.mjs check v2026.10.1 # CI: fail unless all match
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CALVER = /^(\d{4})\.(1[0-2]|[1-9])\.(0|[1-9]\d*)$/;

const readJson = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
const writeJson = (file, data) => writeFileSync(join(root, file), `${JSON.stringify(data, null, 2)}\n`);

function versions() {
  return {
    "package.json": readJson("package.json").version,
    "web/package.json": readJson("web/package.json").version,
    "core/package.json": readJson("core/package.json").version,
    "mobile/package.json": readJson("mobile/package.json").version,
    "mobile/app.json": readJson("mobile/app.json").expo.version,
  };
}

function set(version) {
  // pnpm lockfiles don't record workspace or linked package versions, so
  // only the manifests change.
  for (const file of ["package.json", "web/package.json", "core/package.json", "mobile/package.json"]) {
    writeJson(file, { ...readJson(file), version });
  }

  const app = readJson("mobile/app.json");
  app.expo.version = version;
  writeJson("mobile/app.json", app);
}

const [command, raw] = process.argv.slice(2);
const version = raw?.replace(/^v/, "");
if (!["set", "check"].includes(command) || !version) {
  console.error("usage: node scripts/version.mjs <set|check> <YYYY.MM.PATCH>");
  process.exit(2);
}
if (!CALVER.test(version)) {
  console.error(`"${version}" isn't CalVer YYYY.MM.PATCH (e.g. 2026.10.0).`);
  process.exit(2);
}

if (command === "set") set(version);

const mismatched = Object.entries(versions()).filter(([, v]) => v !== version);
if (mismatched.length > 0) {
  for (const [file, v] of mismatched) console.error(`${file}: ${v} (expected ${version})`);
  process.exit(1);
}
console.log(`All packages are at ${version}.`);
