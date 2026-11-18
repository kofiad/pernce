// Learn more: https://docs.expo.dev/guides/customizing-metro/
const http = require("http");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @pernce/core is linked in with a link: dependency (a symlink to
// ../core) rather than the root pnpm workspace, so this app keeps its own
// React version separate from the web app's. Metro only sees files under
// the project root unless told otherwise, so watch core explicitly. Core has
// no dependencies of its own, so nothing needs resolving from outside
// mobile/node_modules.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../core")];

// The app config (app.config.ts) is baked into the bundle, and Metro's cache
// doesn't notice when it changes: without this, switching APP_VARIANT or
// SYNC_URL can reuse the other variant's config.
config.cacheVersion = [config.cacheVersion, process.env.APP_VARIANT ?? "store", process.env.SYNC_URL ?? ""].join(":");

// Web: expo-sqlite runs SQLite as WebAssembly, and its synchronous API
// needs SharedArrayBuffer, which browsers only allow on cross-origin
// isolated pages. The hosted site sends the same headers (vercel.json).
// The dev server has no setting for response headers (Expo serves the HTML
// before Metro's middleware), so they're added to every response this
// process sends. require-corp rather than credentialless: Safari only
// supports require-corp.
config.resolver.assetExts.push("wasm");
const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  if (!this.headersSent) {
    this.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    this.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  }
  return writeHead.apply(this, args);
};

// expo-sqlite 58's synchronous web calls time out after ~16 ms of spinning;
// use its WorkerChannel with a 10 s deadline instead (patches/expo-sqlite/).
const sqliteWeb = path.join("node_modules", "expo-sqlite", "web");
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "./WorkerChannel" && context.originModulePath.includes(sqliteWeb)) {
    return { type: "sourceFile", filePath: path.resolve(__dirname, "patches/expo-sqlite/WorkerChannel.ts") };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
