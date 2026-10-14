// e2e/full-surface.spec.js — issue #6: the TD's FULL customization surface
// (11 Option slots) wired together. The prior e2e specs proved each kind in
// isolation (#3 model, #4 color/texture, #5 play); these prove the whole
// surface at once: the form renders all 11 slots, a user can set every one of
// them and export, and the resulting Generated game shows ALL of the
// customizations and still plays (mechanics/waves/balance unchanged, ADR 0001).
// The headless seam coverage for the same contract lives in tests/export.test.js
// (the T5 full-surface section).
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { assertSmoke, exportViaUI, SMOKE_TITLE, SMOKE_COMMANDER } from "./helpers.js";

const MANIFEST = JSON.parse(fs.readFileSync("public/templates/tower-defense/manifest.json", "utf8"));
const INPUT_ID = (slotId) => "slot-" + slotId.replace(/[^a-zA-Z0-9_-]/g, "-");
const MODELS = MANIFEST.slots.filter((s) => s.kind === "model3d");
const TEXTURES = MANIFEST.slots.filter((s) => s.kind === "texture");
const TOWER_FIX = "tests/fixtures/glb/valid-tower.glb";
const TEX_FIX = "tests/fixtures/textures/ground.png";
const FULL_ACCENT = "#0b66ff";

test("the form renders all 11 Option slots (2 text, 6 model, 2 texture, 1 color)", async ({ page }) => {
  // spec: the TD ships exactly 11 Option slots
  expect(MANIFEST.slots.length).toBe(11);
  expect(MODELS.length).toBe(6);
  expect(TEXTURES.length).toBe(2);

  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  // every declared slot is present in the rendered form, keyed by slot id
  for (const s of MANIFEST.slots) {
    await expect(page.locator("#" + INPUT_ID(s.id))).toBeVisible();
  }
  // and each kind renders its proper control
  await expect(page.locator(".slot input[type=text]")).toHaveCount(2); // title, commander
  await expect(page.locator(".slot input[type=color]")).toHaveCount(1); // accent
  await expect(page.locator(".slot input[type=file]")).toHaveCount(8); // 6 model + 2 texture
});

test("fully-customized export: every customization is visible in the game and it still plays", async ({ browser, page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  // rename + retheme (the 2 text + 1 color slots)
  await page.locator("#slot-game-title").fill(SMOKE_TITLE);
  await page.locator("#slot-game-commander").fill(SMOKE_COMMANDER);
  await page.locator("#" + INPUT_ID("theme.accent")).evaluate((el, v) => (el.value = v), FULL_ACCENT);

  // swap all 6 models + both textures (a conforming GLB works for every model slot)
  for (const s of MODELS) await page.locator("#" + INPUT_ID(s.id)).setInputFiles(TOWER_FIX);
  for (const s of TEXTURES) await page.locator("#" + INPUT_ID(s.id)).setInputFiles(TEX_FIX);

  // export through the real UI → the bundle a user unzips
  const outDir = await exportViaUI(page);

  const uploadTower = fs.readFileSync(TOWER_FIX);
  const uploadTex = fs.readFileSync(TEX_FIX);

  const bundlePage = await browser.newPage();
  const errors = [];
  bundlePage.on("pageerror", (e) => errors.push(String(e)));
  bundlePage.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // the smoke baseline: engine + scene live, first frame rendered, title/commander shown
  await assertSmoke(bundlePage, outDir, { title: SMOKE_TITLE, commander: SMOKE_COMMANDER });

  // EVERY customization is present exactly where the game reads it:
  //  - the accent applied to the UI
  //  - each of the 6 models placed at its assetPath with the upload bytes, and
  //    the game's own loader parsing the CUSTOM geometry (not the default's)
  //  - both textures placed with the upload bytes
  const checks = await bundlePage.evaluate(async ({ modelMap, texMap, accent, towerB64, texB64 }) => {
    const models = {}, textures = {};
    for (const p of Object.values(modelMap)) models[p] = window.GC_ASSETS[p] === towerB64;
    for (const p of Object.values(texMap)) textures[p] = window.GC_ASSETS[p] === texB64;

    // the game's loader returns the custom model (fixture has a "barrel" node and
    // NO "body" node; the defaults all have "body") — proven for every slot
    let allCustom = true;
    for (const p of Object.values(modelMap)) {
      const c = await GCAssets.loadModel(p);
      if (!GCAssets.findNode(c, "barrel") || GCAssets.findNode(c, "body")) allCustom = false;
      c.dispose();
    }
    return {
      accent: getComputedStyle(document.documentElement).getPropertyValue("--gc-accent").trim(),
      models, textures, allCustom,
    };
  }, {
    modelMap: Object.fromEntries(MODELS.map((s) => [s.id, s.assetPath])),
    texMap: Object.fromEntries(TEXTURES.map((s) => [s.id, s.assetPath])),
    accent: FULL_ACCENT,
    towerB64: uploadTower.toString("base64"),
    texB64: uploadTex.toString("base64"),
  });

  expect(checks.accent).toBe(FULL_ACCENT);
  expect(checks.allCustom).toBe(true);
  for (const s of MODELS) expect(checks.models[s.assetPath], s.id + " custom model in place").toBe(true);
  for (const s of TEXTURES) expect(checks.textures[s.assetPath], s.id + " custom texture in place").toBe(true);

  // the game STILL PLAYS with the full customization (ADR 0001: mechanics unchanged) —
  // place a tower, run a wave, and the economy responds exactly as with defaults
  await bundlePage.locator("#gc-tower-arrow").click();
  const pos = await bundlePage.evaluate(() => window.__GC_TD.screenPos(4));
  await bundlePage.mouse.click(pos.x, pos.y);
  await expect
    .poll(async () => bundlePage.evaluate(() => (window.__GC_TD.game.spots[4].tower ? window.__GC_TD.game.gold : null)), {
      timeout: 5000,
    })
    .toBe(150); // 200 − 50 (Arrow cost), identical to the default-bundle play test

  await bundlePage.locator("#gc-start").click();
  await expect.poll(async () => bundlePage.evaluate(() => window.__GC_TD.game.state), { timeout: 5000 }).toBe("wave");
  await expect
    .poll(
      async () =>
        await bundlePage.evaluate(() => {
          const g = window.__GC_TD.game;
          return g.enemies.length > 0 && Math.max(...g.enemies.map((e) => e.x)) > -1.0;
        }),
      { timeout: 10_000 },
    )
    .toBe(true); // a wave runs with the custom models/enemies

  // the custom Arrow model (the fixture, which has no "body") loaded during play —
  // a load failure would have surfaced as a page/console error (fail() → console.error)
  if (errors.length) throw new Error("page errors during fully-customized play:\n" + errors.join("\n"));

  await bundlePage.close();
});
