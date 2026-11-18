// Exports the STORE web build of the app (offline-only: no APP_VARIANT, so no
// sync wiring, no sync UI) into public-store/, the public app's Worker assets
// (wrangler.app.jsonc). The personal build with sync is `pnpm run build:app`,
// into public/ for the Vercel instance; the two never share a directory.
//
//   pnpm --filter @pernce/web build:store-app
import { cpSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobile = join(web, "..", "mobile");
const out = join(web, "public-store");

rmSync(out, { recursive: true, force: true });
// The store variant is the default one; make sure nothing in the environment
// turns sync on or points the build at a server.
const env = { ...process.env };
delete env.APP_VARIANT;
delete env.SYNC_URL;
execFileSync("pnpm", ["exec", "expo", "export", "--platform", "web", "--output-dir", out], {
  cwd: mobile,
  env,
  stdio: "inherit",
});
execFileSync("node", ["scripts/pwa.mjs", out], { cwd: mobile, stdio: "inherit" });
// Workers static assets read _headers from the asset directory (and don't serve it).
cpSync(join(web, "cloudflare", "_headers"), join(out, "_headers"));
if (!existsSync(join(out, "index.html"))) throw new Error("The export has no index.html.");
console.log(`Store web app exported to ${out}`);
