// Turns the web export into an installable, offline-capable PWA. Run after
// `expo export -p web` with the export directory (web/public):
//   node scripts/pwa.mjs ../web/public
//   node scripts/pwa.mjs ../web/public-store/app /app   # served under /app
//
// The optional second argument is the path the export is served under (the
// export itself was made with WEB_BASE_URL=/app, so Expo already prefixed its
// own URLs). With it, everything this script adds is under that path too: the
// links, the manifest (start_url, scope, icons), the precache list and the
// navigation key, and the cache is named pernce-app-<hash> so the retire
// worker at the site root (web/site/sw.js) can tell it from the old
// root-scoped pernce-<hash> caches. Without it the output is what it always
// was.
//
// - Renames assets/node_modules/ to assets/vendor/, and any node_modules or
//   .pnpm directory below it to modules and pnpm (and every reference to
//   them in the export). Expo puts fonts and package images under
//   assets/node_modules/.pnpm/pkg/node_modules/pkg/..., and hosts skip any
//   directory named node_modules (Vercel leaves those files out of a deploy,
//   so the fonts would 404; wrangler skips them too).
// - Adds the manifest and iOS standalone tags to index.html (Expo's "single"
//   output has no custom <head> hook).
// - Writes sw.js with a precache list of everything the export produced. The
//   list is hashed into the cache name, so each build changes sw.js, which is
//   what makes browsers install the new version (src/lib/pwa.ts).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: node scripts/pwa.mjs <export dir> [base path, e.g. /app]");
const baseArg = process.argv[3];
if (baseArg !== undefined && !/^\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(baseArg)) {
  throw new Error(`The base path must look like /app (no trailing slash), got "${baseArg}".`);
}
/** "" for the site root, "/app" under /app. */
const base = baseArg ?? "";

const HEAD = `<link rel="manifest" href="${base}/manifest.webmanifest"/>
<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-title" content="Pernce"/>
<meta name="apple-mobile-web-app-status-bar-style" content="default"/>
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"/>
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"/>`;

const nodeModulesAssets = join(dir, "assets", "node_modules");
if (existsSync(nodeModulesAssets)) {
  const rename = (name) => (name === "node_modules" ? "modules" : name === ".pnpm" ? "pnpm" : name);
  // Rename directories first (deepest first), then the references to them.
  (function renameDirs(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        renameDirs(p);
        if (rename(name) !== name) renameSync(p, join(d, rename(name)));
      }
    }
  })(nodeModulesAssets);
  renameSync(nodeModulesAssets, join(dir, "assets", "vendor"));
  // A URL like /assets/node_modules/.pnpm/pkg@1/node_modules/pkg/font.ttf
  const urls = /assets\/node_modules\/[^"'`\s)\\]+/g;
  const fix = (url) => "assets/vendor/" + url.slice("assets/node_modules/".length).split("/").map(rename).join("/");
  (function rewrite(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) rewrite(p);
      else if (/\.(js|html|json|map|css|webmanifest)$/.test(name)) {
        const text = readFileSync(p, "utf8");
        if (text.includes("assets/node_modules/")) writeFileSync(p, text.replace(urls, fix));
      }
    }
  })(dir);
}

if (base) {
  // The shipped manifest is for the root; under a base, start_url, scope and
  // the icons move with the app.
  const manifestPath = join(dir, "manifest.webmanifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.start_url = `${base}/`;
  manifest.scope = `${base}/`;
  manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: base + icon.src }));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

const indexPath = join(dir, "index.html");
const html = readFileSync(indexPath, "utf8");
if (!html.includes("</head>")) throw new Error("index.html has no </head>");
// viewport-fit=cover lets the app draw under the notch in standalone mode;
// interactive-widget=resizes-content makes Android Chrome shrink the page
// for the keyboard, so the focused field scrolls into the space left
// (Safari ignores it; src/components/keyboard.tsx covers it there).
const extra = (c) => ["viewport-fit=cover", "interactive-widget=resizes-content"].filter((v) => !c.includes(v.split("=")[0]));
writeFileSync(
  indexPath,
  html
    .replace("</head>", `${HEAD}</head>`)
    .replace(/(<meta name="viewport" content="[^"]*)"/, (_m, c) => [c, ...extra(c)].join(", ") + '"'),
);

const files = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push("/" + relative(dir, p).split("\\").join("/"));
  }
})(dir);

// Everything the app needs to launch offline; sw.js itself and the source
// maps are not part of it.
const local = files.filter((f) => f !== "/sw.js" && !f.endsWith(".map")).sort();
const version = createHash("sha256")
  .update(local.map((f) => f + readFileSync(join(dir, f))).join("\n"))
  .digest("hex")
  .slice(0, 12);
const precache = local.map((f) => base + f);
const cachePrefix = base ? "pernce-app-" : "pernce-";

writeFileSync(
  join(dir, "sw.js"),
  `// Generated by scripts/pwa.mjs.
const CACHE = "${cachePrefix}${version}";
const PRECACHE = ${JSON.stringify(precache)};

// A new version installs in the background and waits (no skipWaiting), so it
// takes over the next time the app is opened, never mid-use.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Pages are client-side routes of the one index.html.
  const key = request.mode === "navigate" ? "${base}/index.html" : request;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => (await cache.match(key)) ?? fetch(request)),
  );
});
`,
);
console.log(`pwa: ${precache.length} files precached as ${cachePrefix}${version}`);
