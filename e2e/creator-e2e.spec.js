// e2e/creator-e2e.spec.js — the thin end-to-end path through the REAL
// creator UI: pick the Template, set the title, click Export, capture the
// zip download, unzip it Node-side (jszip, already a dependency), and run
// the smoke test on the actual export artifact. Exercises collect(), the
// JSZip path, and the manifest fetch — the loop parts the seam alone
// never touches.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { test, expect } from "@playwright/test";
import { assertSmoke, SMOKE_TITLE, SMOKE_COMMANDER } from "./helpers.js";

test("creator: pick template, set title, export — and the export runs (end-to-end)", async ({ browser, page }) => {
  await page.goto("/");

  // Template list is rendered from the registry; picking one loads its manifest
  const card = page.locator(".template-card", { hasText: "Tower Defense" });
  await expect(card).toBeVisible();
  await card.click();

  // Form is generated from the manifest (not hardcoded): the declared
  // text slots for title and commander are present and fillable
  const titleInput = page.locator("#slot-game-title");
  const commanderInput = page.locator("#slot-game-commander");
  await expect(titleInput).toBeVisible();
  await titleInput.fill(SMOKE_TITLE);
  await commanderInput.fill(SMOKE_COMMANDER);

  // Export → zip download (JSZip blob → anchor click)
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-btn").click(),
  ]);
  const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gc-e2e-zip-")), await download.suggestedFilename());
  await download.saveAs(zipPath);
  await expect(page.locator("#export-status")).toHaveText(/Done/);

  // Keep a copy where CI can publish it as the "exported game" artifact
  fs.mkdirSync("artifacts", { recursive: true });
  fs.copyFileSync(zipPath, path.join("artifacts", await download.suggestedFilename()));

  // Unzip Node-side: the bundle a user would get after unzipping the download
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-e2e-unzip-"));
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const full = path.join(outDir, entry.name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, await entry.async("nodebuffer"));
  }

  // The exported artifact must pass the smoke test
  const bundlePage = await browser.newPage();
  await assertSmoke(bundlePage, outDir);
  await bundlePage.close();
});
