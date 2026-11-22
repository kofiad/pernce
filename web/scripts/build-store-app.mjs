// Builds pernce.com into public-store/, the Worker's assets
// (wrangler.app.jsonc): the landing page (web/site/) at the root and the STORE
// web build of the app (offline-only: no APP_VARIANT, so no sync wiring, no
// sync UI) under /app (WEB_BASE_URL=/app, so Expo prefixes every URL it
// makes and pwa.mjs does the same for the manifest and service worker). The
// personal build with sync is `pnpm run build:app`, into public/ for the
// Vercel instance, with the app at its root and no landing page; the two
// never share a directory.
//
//   pnpm --filter @pernce/web build:store-app
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobile = join(web, "..", "mobile");
const out = join(web, "public-store");
const appOut = join(out, "app");
const APP_BASE = "/app";

rmSync(out, { recursive: true, force: true });
// The store variant is the default one; make sure nothing in the environment
// turns sync on or points the build at a server.
const env = { ...process.env };
delete env.APP_VARIANT;
delete env.SYNC_URL;
env.WEB_BASE_URL = APP_BASE;
execFileSync("pnpm", ["exec", "expo", "export", "--platform", "web", "--output-dir", appOut], {
  cwd: mobile,
  env,
  stdio: "inherit",
});
execFileSync("node", ["scripts/pwa.mjs", appOut, APP_BASE], { cwd: mobile, stdio: "inherit" });
// Workers static assets read _headers from the asset directory (and don't serve it).
cpSync(join(web, "cloudflare", "_headers"), join(out, "_headers"));

// The landing page: web/site/ (plain HTML, CSS and a little JS, no build
// step of its own) into the root, its files under /site/.
const site = join(web, "site");
const root = join(web, "..");
const version = JSON.parse(readFileSync(join(web, "package.json"), "utf8")).version;
const page = readFileSync(join(site, "index.html"), "utf8");
// The CSP meta allows the one inline script (the standalone redirect) by hash.
const inline = /<script id="standalone">([\s\S]*?)<\/script>/.exec(page);
if (!inline) throw new Error("site/index.html lost its standalone redirect script.");
const hash = createHash("sha256").update(inline[1]).digest("base64");
// Each build names its own CSS, JS and images (?v=<content hash>), so a new
// index.html never renders against an older stylesheet still in a cache;
// /site/* can then be cached for a year (cloudflare/_headers). Fonts are
// excluded: site.css loads them by plain URL, and their names are versioned.
const versioned = page.replace(/(href|src)="(\/site\/(?:site\.(?:css|js)|img\/[^"?]+))"/g, (_m, attr, url) => {
  const file = join(site, url.slice("/site/".length));
  if (!existsSync(file)) throw new Error(`site/index.html references a missing file: ${url}`);
  const v = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
  return `${attr}="${url}?v=${v}"`;
});
writeFileSync(join(out, "index.html"), versioned.replaceAll("__STANDALONE_HASH__", hash).replaceAll("__VERSION__", version));
mkdirSync(join(out, "site", "fonts"), { recursive: true });
for (const f of ["site.css", "site.js"]) cpSync(join(site, f), join(out, "site", f));
cpSync(join(site, "img"), join(out, "site", "img"), { recursive: true });
// Fonts come from the @fontsource packages (SIL OFL), copied rather than committed.
const fonts = [
  ["@fontsource-variable/inter", "inter-latin-opsz-normal.woff2"],
  ["@fontsource/jetbrains-mono", "jetbrains-mono-latin-500-normal.woff2"],
];
for (const [pkg, file] of fonts) cpSync(join(web, "node_modules", pkg, "files", file), join(out, "site", "fonts", file));
cpSync(join(web, "node_modules", "@fontsource-variable", "inter", "LICENSE"), join(out, "site", "fonts", "LICENSE-Inter.txt"));
cpSync(join(web, "node_modules", "@fontsource", "jetbrains-mono", "LICENSE"), join(out, "site", "fonts", "LICENSE-JetBrainsMono.txt"));
// Root files: the retire worker (replaces the old root service worker),
// robots and sitemap, the social image and the icons.
for (const f of ["sw.js", "robots.txt", "sitemap.xml"]) cpSync(join(site, f), join(out, f));
cpSync(join(root, "docs", "screenshots", "social-preview.png"), join(out, "og.png"));
cpSync(join(root, "docs", "design", "icons", "pernce-favicon.svg"), join(out, "favicon.svg"));
cpSync(join(root, "mobile", "assets", "favicon.png"), join(out, "favicon.png"));
cpSync(join(root, "mobile", "public", "apple-touch-icon.png"), join(out, "apple-touch-icon.png"));

if (!existsSync(join(appOut, "index.html"))) throw new Error("The export has no app/index.html.");
console.log(`pernce.com (landing page at /, store web app at ${APP_BASE}) built into ${out}`);
