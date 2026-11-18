// Bundles the Node entry (src/node-app.ts) into web/server.mjs, the file
// Vercel's zero-config Hono support runs as the function.
//
// Why: Vercel's Hono builder transpiles each TypeScript file on its own and
// leaves imports alone, which Node's ESM loader can't resolve (extensionless
// relative imports, and @pernce/core's `exports` pointing at .ts source). So
// the app, src/ and @pernce/core are bundled into one ESM file here, with
// every other dependency left external: Vercel traces node_modules from the
// imports (native libsql included), and the builder only accepts an entry
// that imports "hono" itself, which stays a literal `from "hono"`.
//
//   pnpm --filter @pernce/web build   (after the type-check)
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const web = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(web, "package.json"), "utf8"));
// Everything in `dependencies` except what is meant to be bundled, plus each
// package's subpaths (drizzle-orm/libsql, hono/adapter...).
const bundled = new Set(["@pernce/core", "esbuild", "typescript", "@types/node"]);
const external = Object.keys(pkg.dependencies)
  .filter((name) => !bundled.has(name))
  .flatMap((name) => [name, `${name}/*`]);

await build({
  absWorkingDir: web,
  entryPoints: ["src/node-app.ts"],
  outfile: "server.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external,
  logLevel: "warning",
  // Fail the build rather than ship an entry Vercel's builder rejects.
  plugins: [
    {
      name: "check-hono-import",
      setup(b) {
        b.onEnd(() => {
          const out = readFileSync(join(web, "server.mjs"), "utf8");
          if (!/(?:from|require|import)\s*(?:\(\s*)?["']hono["']/.test(out)) {
            throw new Error('server.mjs must import "hono" (Vercel\'s Hono builder looks for it)');
          }
        });
      },
    },
  ],
});
console.log("Bundled src/node-app.ts into web/server.mjs");
