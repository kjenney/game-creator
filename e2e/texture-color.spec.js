// e2e/texture-color.spec.js — issue #4 (color, texture, 2D-image Options) through
// the REAL creator UI: the form renders the accent color picker and the
// skybox/ground texture file inputs with each slot's requirements; the chosen
// color and uploaded textures are exported and reflected in the game (UI accent,
// background, ground). The headless seam tests for the same contract live in
// tests/export.test.js and tests/contract.test.js.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { test, expect } from "@playwright/test";
import { assertSmoke, SMOKE_TITLE, SMOKE_COMMANDER } from "./helpers.js";

const MANIFEST = JSON.parse(fs.readFileSync("public/templates/tower-defense/manifest.json", "utf8"));
const TEXTURE_SLOTS = MANIFEST.slots.filter((s) => s.kind === "texture");
const ACCENT_SLOT = MANIFEST.slots.filter((s) => s.kind === "color")[0];
const INPUT_ID = (slotId) => "slot-" + slotId.replace(/[^a-zA-Z0-9_-]/g, "-");

test("form renders the accent color picker and the skybox/ground texture file inputs", async ({ page }) => {
  // spec: the TD ships 2 texture Options (Skybox/background, Ground) + 1 color (Accent/UI)
  expect(TEXTURE_SLOTS.length).toBe(2);
  expect(ACCENT_SLOT).toBeTruthy();

  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  // the accent picker is a native color input seeded with the Template's own accent
  const colorInput = page.locator("#" + INPUT_ID(ACCENT_SLOT.id));
  await expect(colorInput).toHaveAttribute("type", "color");
  await expect(colorInput).toHaveValue(ACCENT_SLOT.default);

  for (const slot of TEXTURE_SLOTS) {
    const input = page.locator("#" + INPUT_ID(slot.id));
    await expect(input).toHaveAttribute("type", "file");
    await expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");

    const requirements = input.locator("xpath=..").locator(".slot-requirements");
    await expect(requirements).toContainText("Format: PNG, JPG, WEBP");
    await expect(requirements).toContainText("Max size: " + Math.round(slot.requirements.maxBytes / (1024 * 1024)) + " MB");
    // leave-empty hint: the game's default art is the fallback
    await expect(input.locator("xpath=..").locator(".slot-hint")).toContainText("default");
  }
});

test("the chosen accent + uploaded texture are exported and reflected in the game", async ({ browser, page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();
  await page.locator("#slot-game-title").fill(SMOKE_TITLE);
  await page.locator("#slot-game-commander").fill(SMOKE_COMMANDER);

  const accent = "#12ab34";
  await page.locator("#" + INPUT_ID(ACCENT_SLOT.id)).evaluate((el, v) => (el.value = v), accent);

  const upload = fs.readFileSync("tests/fixtures/textures/ground.png");
  await page.locator("#" + INPUT_ID("ground.texture")).setInputFiles("tests/fixtures/textures/ground.png");

  // Export → zip download (JSZip blob → anchor click)
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-btn").click(),
  ]);
  const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gc-tex-zip-")), await download.suggestedFilename());
  await download.saveAs(zipPath);
  await expect(page.locator("#export-status")).toHaveText(/Done/);

  // Unzip Node-side: the bundle a user would get after unzipping the download
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-tex-unzip-"));
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const full = path.join(outDir, entry.name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, await entry.async("nodebuffer"));
  }

  // placed at the expected asset path — with the uploaded bytes, not the default's
  expect(fs.readFileSync(path.join(outDir, "assets/textures/ground.png")).equals(upload)).toBe(true);
  // the skybox was not uploaded — it keeps the Template's default art
  const defaultSkybox = fs.readFileSync("public/templates/tower-defense/bundle/assets/textures/skybox.png");
  expect(fs.readFileSync(path.join(outDir, "assets/textures/skybox.png")).equals(defaultSkybox)).toBe(true);

  // the exported game runs (smoke baseline) and reflects both customizations
  const bundlePage = await browser.newPage();
  await assertSmoke(bundlePage, outDir);
  const [cssAccent, gcAccent, embeddedGround] = await bundlePage.evaluate(() => [
    getComputedStyle(document.documentElement).getPropertyValue("--gc-accent").trim(),
    window.GC_OPTIONS["theme.accent"],
    window.GC_ASSETS["assets/textures/ground.png"],
  ]);
  // the game reads the accent from GC_OPTIONS and applies it to the UI
  expect(gcAccent).toBe(accent);
  expect(cssAccent).toBe(accent);
  // and the uploaded texture rides in GC_ASSETS (file:// rule: the game reads by bytes)
  expect(embeddedGround).toBe(upload.toString("base64"));
  await bundlePage.close();
});

test("a texture upload failing format or size is rejected in the form with the specific reason", async ({ page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();
  const input = page.locator("#" + INPUT_ID("ground.texture"));

  const groundSlot = MANIFEST.slots.filter((s) => s.id === "ground.texture")[0];
  const tooBig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gc-tex-big-")), "big.png");
  const ok = fs.readFileSync("tests/fixtures/textures/ground.png");
  fs.writeFileSync(tooBig, Buffer.concat([ok, Buffer.alloc(groundSlot.requirements.maxBytes + 1)]));

  // size → format: each failure surfaces its own reason
  for (const [file, re] of [
    [tooBig, /too large/],
    ["tests/fixtures/glb/bad.txt", /unsupported image format/],
  ]) {
    await input.setInputFiles(file);
    await page.locator("#export-btn").click();
    await expect(page.locator("#export-status")).toHaveText(re);
    // a rejection is not an export: no download happened, button is usable again
    await expect(page.locator("#export-btn")).toBeEnabled();
  }
});
