// scripts/smoke-export.mjs — run the real export seam and write the bundle to a
// directory, for the file:// manual smoke test (open <outdir>/index.html in a
// browser; no server).
// Usage: node scripts/smoke-export.mjs [outdir] ["title"] ["commander"]
import GameGC from "../src/shared/contract.js";
import { loadTemplate } from "../tests/helpers.js";
import fs from "node:fs";
import path from "node:path";

const outdir = process.argv[2] || path.join("/tmp", "gc-smoke-export");
const title = process.argv[3] || "Ken's Smoke Game";
const commander = process.argv[4] || "Ken";

const out = GameGC.buildBundle(loadTemplate(), { options: { "game.title": title, "game.commander": commander }, assets: {} });
for (const [p, v] of Object.entries(out.files)) {
  const full = path.join(outdir, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.from(v));
}
fs.mkdirSync(path.join(outdir, "assets"), { recursive: true });
console.log("export written to " + outdir + " (" + Object.keys(out.files).length + " files)");
