// e2e/reset.spec.js — issue #10 (US17: reset any field back to the game's
// original value) through the REAL creator UI: every slot renders a reset
// control; clicking it restores the field — text clears, the accent picker
// reverts to the manifest default (the case issue #10 calls out: previously
// the color could not be reverted at all), file uploads clear. And a fully
// customized form that is reset back to the original exports a bundle
// byte-identical to an untouched form's — which still passes the smoke test
// with the game's original values. The headless seam coverage for the same
// contract lives in tests/contract.test.js (resetValue) and
// tests/export.test.js (the T6 reset section).
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import GameGC from "../src/shared/contract.js";
import { loadTemplate } from "../tests/helpers.js";
import { exportViaUI, assertSmoke } from "./helpers.js";

const MANIFEST = JSON.parse(fs.readFileSync("public/templates/tower-defense/manifest.json", "utf8"));
const MODELS = MANIFEST.slots.filter((s) => s.kind === "model3d");
const TEXTURES = MANIFEST.slots.filter((s) => s.kind === "texture");
const ACCENT = MANIFEST.slots.filter((s) => s.kind === "color")[0];
const INPUT_ID = (slotId) => "slot-" + slotId.replace(/[^a-zA-Z0-9_-]/g, "-");
const RESET_ID = (slotId) => "reset-" + slotId.replace(/[^a-zA-Z0-9_-]/g, "-");
const TOWER_FIX = "tests/fixtures/glb/valid-tower.glb";
const TEX_FIX = "tests/fixtures/textures/ground.png";
const CUSTOM_ACCENT = "#0b66ff";

// dir → { relPath: Buffer } — the unzipped export, Node-side
function walk(dir, base = dir, out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out[path.relative(base, full)] = fs.readFileSync(full);
  }
  return out;
}

test("every Option slot renders a reset control", async ({ page }) => {
  // spec: the TD ships exactly 11 Option slots — each needs a way to undo a customization
  expect(MANIFEST.slots.length).toBe(11);

  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  for (const s of MANIFEST.slots) {
    const reset = page.locator("#" + RESET_ID(s.id));
    await expect(reset).toBeVisible();
    await expect(reset).toHaveAttribute("type", "button"); // type=button: it must not submit anything
  }
  await expect(page.locator(".slot-reset")).toHaveCount(11);
});

test("resetting each kind restores the field to the game's original value", async ({ page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  // text: customize, then reset back to blank (blank = keep the game's default title)
  const title = page.locator("#slot-game-title");
  await title.fill("Custom Title");
  await page.locator("#reset-game-title").click();
  await expect(title).toHaveValue("");

  // color: the issue's case — customize the accent, then reset it back to the manifest default
  const accent = page.locator("#" + INPUT_ID(ACCENT.id));
  await accent.evaluate((el, v) => (el.value = v), CUSTOM_ACCENT);
  await page.locator("#" + RESET_ID(ACCENT.id)).click();
  await expect(accent).toHaveValue(ACCENT.default); // #e8a33d — the Template's own accent

  // file: upload a model, then reset back to no file (the Template's default art is kept)
  const model = page.locator("#" + INPUT_ID("tower.cannon.model"));
  await model.setInputFiles(TOWER_FIX);
  await page.locator("#reset-tower-cannon-model").click();
  await expect(model).toHaveValue("");
});

test("fully customized → reset every field → the export is identical to an untouched form's, and it still plays", async ({ browser, page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  // customize the WHOLE surface (all 11 slots)
  await page.locator("#slot-game-title").fill("Custom Title");
  await page.locator("#slot-game-commander").fill("Custom Commander");
  await page.locator("#" + INPUT_ID(ACCENT.id)).evaluate((el, v) => (el.value = v), CUSTOM_ACCENT);
  for (const s of MODELS) await page.locator("#" + INPUT_ID(s.id)).setInputFiles(TOWER_FIX);
  for (const s of TEXTURES) await page.locator("#" + INPUT_ID(s.id)).setInputFiles(TEX_FIX);

  // the customizations are really in the form — the reset has something to undo
  await expect(page.locator("#slot-game-title")).toHaveValue("Custom Title");
  await expect(page.locator("#" + INPUT_ID(ACCENT.id))).toHaveValue(CUSTOM_ACCENT);
  for (const s of MODELS) await expect(page.locator("#" + INPUT_ID(s.id))).not.toHaveValue("");
  for (const s of TEXTURES) await expect(page.locator("#" + INPUT_ID(s.id))).not.toHaveValue("");

  // reset EVERY field back to the game's original value
  for (const s of MANIFEST.slots) await page.locator("#" + RESET_ID(s.id)).click();

  // every field is back to the original: text blank, accent = the manifest default, uploads cleared
  await expect(page.locator("#slot-game-title")).toHaveValue("");
  await expect(page.locator("#slot-game-commander")).toHaveValue("");
  await expect(page.locator("#" + INPUT_ID(ACCENT.id))).toHaveValue(ACCENT.default);
  for (const s of MODELS) await expect(page.locator("#" + INPUT_ID(s.id))).toHaveValue("");
  for (const s of TEXTURES) await expect(page.locator("#" + INPUT_ID(s.id))).toHaveValue("");

  // export through the real UI → the bundle a user unzips
  const outDir = await exportViaUI(page);

  // Node-side: byte-identical to what an UNTOUCHED form exports (same seam).
  // The untouched form collects text/file fields empty (omitted) and the color
  // picker at the manifest default (a color input always has a value).
  const template = loadTemplate();
  const untouchedOptions = {};
  for (const s of template.manifest) untouchedOptions[s.id] = s.kind === "color" ? s.default : null;
  const untouched = GameGC.buildBundle(template, { options: untouchedOptions, assets: {} });

  const exported = walk(outDir);
  const asBuf = (v) => (v instanceof Uint8Array || Buffer.isBuffer(v) ? Buffer.from(v) : Buffer.from(String(v), "utf8"));
  expect(Object.keys(exported).sort()).toEqual(Object.keys(untouched.files).sort(), "same bundle structure");
  for (const p of Object.keys(untouched.files).sort()) {
    expect(exported[p].equals(asBuf(untouched.files[p])), p + " byte-identical to the untouched export").toBe(true);
  }

  // and it still RUNS from file:// (smoke test) with the game's ORIGINAL values:
  // the Template's own title (not "Custom Title"), the original accent, no commander
  const bundlePage = await browser.newPage();
  await assertSmoke(bundlePage, outDir, { title: "Tower Defense", commander: "" });
  const [cssAccent, gcAccent] = await bundlePage.evaluate(() => [
    getComputedStyle(document.documentElement).getPropertyValue("--gc-accent").trim(),
    window.GC_OPTIONS["theme.accent"],
  ]);
  expect(cssAccent).toBe(ACCENT.default); // the original accent applied to the UI
  expect(gcAccent).toBe(ACCENT.default); // the original accent where the game reads it
  await bundlePage.close();
});
