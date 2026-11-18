import { defineConfig } from "tsup";

// Builds the published package (GitHub Packages). The apps in this repo
// import src/ directly and never use this output. Every module is its own
// entry so subpath imports like "@pernce/core/format" keep working.
export default defineConfig({
  entry: ["src/*.ts", "!src/*.test.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  outDir: "dist",
  target: "es2020",
});
