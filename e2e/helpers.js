// e2e/helpers.js — shared pieces for the browser stage:
// build a bundle via the export seam (same code path as the creator's export)
// and run the SMOKE TEST (GLOSSARY): open the exported Generated game at
// file:// and verify it runs and displays the user's Options.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { expect } from "@playwright/test";
import GameGC from "../src/shared/contract.js";
import { loadTemplate } from "../tests/helpers.js";

export const SMOKE_TITLE = "Ken's CI Game";
export const SMOKE_COMMANDER = "Ken";

// Bundle via the pure seam (the same transform the browser export uses),
// written to a fresh temp dir — the shape a user would unzip.
export function buildBundleDir(options = {}) {
  const { title = SMOKE_TITLE, commander = SMOKE_COMMANDER } = options;
  const out = GameGC.buildBundle(loadTemplate(), {
    options: { "game.title": title, "game.commander": commander },
    assets: {},
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-e2e-bundle-"));
  for (const [p, v] of Object.entries(out.files)) {
    const full = path.join(dir, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from(v));
  }
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true }); // standard layout
  return dir;
}

// Drive the REAL creator UI: click Export, capture the zip download, and unzip
// it Node-side into a fresh dir — the exact bundle a user gets after unzipping.
// (Shared by the full-surface tests; the per-kind UI tests keep their own inline
// copies so a regression in one stays isolated.)
export async function exportViaUI(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-btn").click(),
  ]);
  const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gc-full-zip-")), await download.suggestedFilename());
  await download.saveAs(zipPath);
  await expect(page.locator("#export-status")).toHaveText(/Done/);

  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-full-unzip-"));
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const full = path.join(outDir, entry.name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, await entry.async("nodebuffer"));
  }
  return outDir;
}

// The smoke test proper: no server, no console/page errors, engine + scene
// live, FIRST FRAME RENDERED (WebGL), and the user's Options displayed.
export async function assertSmoke(page, dir, options = {}) {
  const { title = SMOKE_TITLE, commander = SMOKE_COMMANDER } = options;
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(pathToFileURL(path.join(dir, "index.html")).href);

  await expect
    .poll(() => page.evaluate(() => Boolean(window.__GC_ENGINE && window.__GC_SCENE)), { timeout: 15_000 })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__GC_RENDER_OK === true), { timeout: 15_000 })
    .toBe(true);

  await expect(page.locator("#gc-title")).toHaveText(title);
  await expect(page.locator("#gc-commander")).toHaveText("Commander: " + commander);

  if (errors.length) throw new Error("page errors during smoke run:\n" + errors.join("\n"));
}
