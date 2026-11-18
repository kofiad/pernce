// Prints the CHANGELOG.md section for one version, for the GitHub release body.
//   node scripts/release-notes.mjs 2026.10.0
import { readFileSync } from "node:fs";

const version = process.argv[2]?.replace(/^v/, "");
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const start = changelog.indexOf(`## [${version}]`);
if (!version || start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section.`);
  process.exit(1);
}
const body = changelog.slice(changelog.indexOf("\n", start) + 1);
const end = body.search(/^## \[|^\[[^\]]+\]: /m);
console.log((end === -1 ? body : body.slice(0, end)).trim());
