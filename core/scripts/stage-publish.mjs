// Writes dist/package.json so `npm publish dist` ships the built JS instead of
// the raw TypeScript the workspace consumes. The in-repo name (@pernce/core)
// stays as is; GitHub Packages requires the owner's scope, so the published
// name defaults to @kofiad/pernce-core (override with PUBLISH_NAME).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
if (!existsSync(join(dist, "index.d.ts"))) {
  console.error("dist/ is missing; run `pnpm run build` first.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const entry = (name) => ({
  types: `./${name}.d.ts`,
  import: `./${name}.mjs`,
  require: `./${name}.js`,
});

const published = {
  name: process.env.PUBLISH_NAME ?? "@kofiad/pernce-core",
  version: pkg.version,
  description: pkg.description,
  license: pkg.license,
  repository: pkg.repository,
  sideEffects: false,
  main: "./index.js",
  module: "./index.mjs",
  types: "./index.d.ts",
  exports: { ".": entry("index"), "./*": entry("*") },
  publishConfig: { registry: "https://npm.pkg.github.com" },
};

writeFileSync(join(dist, "package.json"), `${JSON.stringify(published, null, 2)}\n`);
copyFileSync(join(root, "README.md"), join(dist, "README.md"));
// Apache-2.0 asks that redistributions carry the license and NOTICE.
for (const f of ["LICENSE", "NOTICE"]) copyFileSync(join(root, "..", f), join(dist, f));
console.log(`Staged ${published.name}@${published.version} in dist/`);
