// e2e/model-slot.spec.js — issue #3 (3D-model Option) through the REAL
// creator UI: the form renders each model slot with a GLB file input and that
// slot's compatibility requirements; a conforming GLB is accepted and the
// exported game loads it in place of the default model; a GLB failing a
// requirement is rejected with the specific reason. The headless seam tests
// for the same contract live in tests/export.test.js and tests/contract.test.js.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { test, expect } from "@playwright/test";
import { assertSmoke, SMOKE_TITLE, SMOKE_COMMANDER } from "./helpers.js";

const MANIFEST = JSON.parse(fs.readFileSync("public/templates/tower-defense/manifest.json", "utf8"));
const MODEL_SLOTS = MANIFEST.slots.filter((s) => s.kind === "model3d");
const CANNON_SLOT = MODEL_SLOTS.filter((s) => s.id === "tower.cannon.model")[0];
const INPUT_ID = (slotId) => "slot-" + slotId.replace(/[^a-zA-Z0-9_-]/g, "-");

test("form renders each model slot with a GLB file input and the slot's compatibility requirements", async ({ page }) => {
  // spec: the TD ships 6 model Options (3 tower, 2 enemy, 1 base)
  expect(MODEL_SLOTS.length).toBe(6);

  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  for (const slot of MODEL_SLOTS) {
    const input = page.locator("#" + INPUT_ID(slot.id));
    await expect(input).toHaveAttribute("type", "file");
    await expect(input).toHaveAttribute("accept", ".glb");

    const requirements = input.locator("xpath=..").locator(".slot-requirements");
    await expect(requirements).toContainText("Format: GLB");
    await expect(requirements).toContainText("Pivot: " + slot.requirements.pivot);
    await expect(requirements).toContainText("Max size: " + Math.round(slot.requirements.maxBytes / (1024 * 1024)) + " MB");
    if (slot.requirements.requiredNodes.length) {
      await expect(requirements).toContainText("Required node(s): " + slot.requirements.requiredNodes.join(", "));
    } else {
      await expect(requirements).not.toContainText("Required node(s)");
    }
    // leave-empty hint: the game's default art is the fallback
    await expect(input.locator("xpath=..").locator(".slot-hint")).toContainText("default");
  }
});

test("a conforming GLB is accepted; the exported game loads it in place of the default model", async ({ browser, page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();
  await page.locator("#slot-game-title").fill(SMOKE_TITLE);
  await page.locator("#slot-game-commander").fill(SMOKE_COMMANDER);

  const upload = fs.readFileSync("tests/fixtures/glb/valid-tower.glb");
  await page.locator("#" + INPUT_ID(CANNON_SLOT.id)).setInputFiles("tests/fixtures/glb/valid-tower.glb");

  // Export → zip download (JSZip blob → anchor click)
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-btn").click(),
  ]);
  const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gc-model-zip-")), await download.suggestedFilename());
  await download.saveAs(zipPath);
  await expect(page.locator("#export-status")).toHaveText(/Done/);

  // Unzip Node-side: the bundle a user would get after unzipping the download
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-model-unzip-"));
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const full = path.join(outDir, entry.name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, await entry.async("nodebuffer"));
  }

  // placed at the expected asset path, with the uploaded bytes (not the default's)
  expect(fs.readFileSync(path.join(outDir, CANNON_SLOT.assetPath)).equals(upload)).toBe(true);

  // the exported game runs (smoke baseline) and loads the CUSTOM model through
  // the game's own loader: the fixture has a "barrel" node and NO "body" node,
  // while the default cannon has both — so a "body" here would mean the default
  const bundlePage = await browser.newPage();
  await assertSmoke(bundlePage, outDir);
  const nodes = await bundlePage.evaluate(async () => {
    const container = await GCAssets.loadModel("assets/models/tower_cannon.glb");
    const names = new Set();
    const stack = container.rootNodes.slice();
    while (stack.length) {
      const n = stack.pop();
      names.add(n.name);
      if (n.getChildMeshes) stack.push(...n.getChildMeshes());
      if (n.getChildren) stack.push(...n.getChildren());
    }
    container.dispose();
    return [...names];
  });
  expect(nodes).toContain("barrel");
  expect(nodes).not.toContain("body");

  // and the embedded bytes are exactly the upload (file:// rule: the game reads
  // this path from GC_ASSETS, never by URL)
  const embedded = await bundlePage.evaluate(() => window.GC_ASSETS["assets/models/tower_cannon.glb"]);
  expect(embedded).toBe(upload.toString("base64"));
  await bundlePage.close();
});

test("a GLB failing each requirement is rejected in the form with the specific reason", async ({ page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();
  const input = page.locator("#" + INPUT_ID(CANNON_SLOT.id));

  const tooBig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gc-model-big-")), "big.glb");
  const ok = fs.readFileSync("tests/fixtures/glb/valid-tower.glb");
  fs.writeFileSync(tooBig, Buffer.concat([ok, Buffer.alloc(CANNON_SLOT.requirements.maxBytes + 1)]));

  // size → format → required nodes: each failure surfaces its own reason
  for (const [file, re] of [
    [tooBig, /too large/],
    ["tests/fixtures/glb/bad.txt", /not a GLB/],
    ["tests/fixtures/glb/missing-node.glb", /missing required node "barrel"/],
  ]) {
    await input.setInputFiles(file);
    await page.locator("#export-btn").click();
    await expect(page.locator("#export-status")).toHaveText(re);
    // a rejection is not an export: no download happened, button is usable again
    await expect(page.locator("#export-btn")).toBeEnabled();
  }
});
