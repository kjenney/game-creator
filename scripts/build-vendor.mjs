// scripts/build-vendor.mjs — esbuild IIFE (global name BABYLON) →
// public/templates/tower-defense/bundle/js/vendor/babylon.js (committed, D2).
// Run via: npm run vendor
import esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await esbuild.build({
  entryPoints: [join(root, "scripts", "vendor-entry.mjs")],
  bundle: true,
  format: "iife",
  globalName: "BABYLON",
  outfile: join(root, "public", "templates", "tower-defense", "bundle", "js", "vendor", "babylon.js"),
  minify: true,
  target: "es2020",
  logLevel: "info",
});
