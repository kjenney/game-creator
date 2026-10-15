// e2e/summary.spec.js — issue #11 (US18: see a summary of my customizations
// before exporting) through the REAL creator UI: every slot is listed with
// its status (Customized / Default) and — when customized — the value that
// will be exported; the list updates live as the form changes (including
// after a Reset, issue #10); and — the AC — what the summary says is exactly
// what the export produces, so confirming it confirms the bundle. The
// headless seam coverage for the same contract lives in
// tests/contract.test.js (the summarize section).
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loadTemplate } from "../tests/helpers.js";
import { exportViaUI, assertSmoke } from "./helpers.js";

const MANIFEST = JSON.parse(fs.readFileSync("public/templates/tower-defense/manifest.json", "utf8"));
const ACCENT = MANIFEST.slots.filter((s) => s.kind === "color")[0];
const INPUT_ID = (slotId) => "slot-" + slotId.replace(/[^a-zA-Z0-9_-]/g, "-");
const TOWER_FIX = "tests/fixtures/glb/valid-tower.glb";
const TEX_FIX = "tests/fixtures/textures/ground.png";

// summary DOM: one .summary-row per slot (data-slot + data-status on the row),
// .summary-value holds the shown value, .summary-count the header line
const row = (page, slotId) => page.locator(`.summary-row[data-slot="${slotId}"]`);
const status = (page, slotId) => row(page, slotId).getAttribute("data-status");
const shownValue = (page, slotId) => row(page, slotId).locator(".summary-value").textContent();
const countLine = (page) => page.locator(".summary-count").textContent();

// simulate the native color picker: set the value AND fire the input event
// (a plain .value assignment fires nothing — the picker always does)
async function setAccent(page, hex) {
  await page.locator("#" + INPUT_ID(ACCENT.id)).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, hex);
}

test("the summary is hidden until a Template is picked, then lists every slot as Default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#summary-section")).toBeHidden();

  await page.locator(".template-card", { hasText: "Tower Defense" }).click();
  await expect(page.locator("#summary-section")).toBeVisible();

  // an untouched form: every one of the 11 slots is at the game's original value
  await expect(page.locator(".summary-row")).toHaveCount(11);
  for (const s of MANIFEST.slots) {
    await expect(row(page, s.id)).toHaveAttribute("data-status", "default");
    await expect(row(page, s.id).locator(".summary-label")).toHaveText(s.label); // user-facing, from the manifest
  }
  await expect(page.locator(".summary-count")).toHaveText(/No customizations yet/);
});

test("the summary updates live as the form changes, with the value that will be exported", async ({ page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  // customize 5 of the 11 slots across all three kinds
  await page.locator("#slot-game-title").fill("Custom Title");
  await page.locator("#slot-game-commander").fill("Custom Commander");
  await setAccent(page, "#0b66ff");
  await page.locator("#" + INPUT_ID("tower.cannon.model")).setInputFiles(TOWER_FIX);
  await page.locator("#" + INPUT_ID("ground.texture")).setInputFiles(TEX_FIX);

  // those 5 rows flip to Customized, each showing exactly what the export will receive
  await expect(page.locator(".summary-row.customized")).toHaveCount(5);
  await expect(row(page, "game.title")).toHaveAttribute("data-status", "customized");
  await expect(row(page, "game.title").locator(".summary-value")).toHaveText("Custom Title");
  await expect(row(page, "game.commander").locator(".summary-value")).toHaveText("Custom Commander");
  await expect(row(page, ACCENT.id).locator(".summary-value")).toHaveText("#0b66ff");
  await expect(row(page, "tower.cannon.model").locator(".summary-value")).toHaveText("valid-tower.glb");
  await expect(row(page, "ground.texture").locator(".summary-value")).toHaveText("ground.png");

  // the other 6 keep the game's original values
  await expect(page.locator(".summary-row.default")).toHaveCount(6);
  for (const s of MANIFEST.slots) {
    if (["game.title", "game.commander", ACCENT.id, "tower.cannon.model", "ground.texture"].includes(s.id)) continue;
    await expect(row(page, s.id)).toHaveAttribute("data-status", "default");
  }
  await expect(page.locator(".summary-count")).toHaveText("5 of 11 slots customized — the rest keep the game's original values.");
});

test("resetting a slot (issue #10) flips its summary row back to Default", async ({ page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  await page.locator("#slot-game-title").fill("Custom Title");
  await expect(row(page, "game.title")).toHaveAttribute("data-status", "customized");

  await page.locator("#reset-game-title").click();
  await expect(page.locator("#slot-game-title")).toHaveValue(""); // the field really is reset
  await expect(row(page, "game.title")).toHaveAttribute("data-status", "default"); // …and the review says so
  await expect(row(page, "game.title").locator(".summary-value")).toHaveText("the game's original");
  await expect(page.locator(".summary-count")).toHaveText(/No customizations yet/);
});

test("AC: what the summary says is exactly what the export produces", async ({ browser, page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Tower Defense" }).click();

  // a mix of kinds: 2 text + 1 color + 1 model + 1 texture
  const CUSTOM = {
    "game.title": "Summary Check Title",
    "game.commander": "Summary Check",
    [ACCENT.id]: "#ff2244",
  };
  await page.locator("#slot-game-title").fill(CUSTOM["game.title"]);
  await page.locator("#slot-game-commander").fill(CUSTOM["game.commander"]);
  await setAccent(page, CUSTOM[ACCENT.id]);
  await page.locator("#" + INPUT_ID("tower.frost.model")).setInputFiles(TOWER_FIX);
  await page.locator("#" + INPUT_ID("skybox.texture")).setInputFiles(TEX_FIX);

  // the user CONFIRMS this summary before exporting: read it straight from the DOM
  const summary = {};
  for (const s of MANIFEST.slots) {
    summary[s.id] = { status: await status(page, s.id), value: await shownValue(page, s.id) };
  }
  const customizedIds = MANIFEST.slots.filter((s) => summary[s.id].status === "customized").map((s) => s.id);
  expect(customizedIds.sort()).toEqual(["game.commander", "game.title", "skybox.texture", "theme.accent", "tower.frost.model"]);

  // export through the real UI → the bundle a user unzips
  const outDir = await exportViaUI(page);
  const read = (rel) => fs.readFileSync(path.join(outDir, rel));

  // text/color: GC_OPTIONS holds EXACTLY the slots the summary marked customized,
  // with the values the summary showed — nothing more, nothing less
  const gcOptions = JSON.parse(read("js/generated-options.js").toString("utf8").replace(/^window\.GC_OPTIONS = /, "").replace(/;\s*$/, ""));
  expect(Object.keys(gcOptions).sort()).toEqual(
    MANIFEST.slots.filter((s) => ["text", "color"].includes(s.kind) && summary[s.id].status === "customized").map((s) => s.id).sort(),
  );
  for (const [id, value] of Object.entries(CUSTOM)) expect(gcOptions[id], id).toBe(summary[id].value);

  // model + texture: the uploaded bytes at the slot's assetPath, where the summary
  // showed the uploaded filename
  expect(read("assets/models/tower_frost.glb").equals(fs.readFileSync(TOWER_FIX)), "frost model = the upload the summary showed").toBe(true);
  expect(read("assets/textures/skybox.png").equals(fs.readFileSync(TEX_FIX)), "skybox = the upload the summary showed").toBe(true);

  // every slot the summary marked Default keeps the game's ORIGINAL bytes
  const template = loadTemplate();
  for (const s of MANIFEST.slots.filter((x) => ["model3d", "texture"].includes(x.kind))) {
    if (summary[s.id].status === "customized") continue;
    expect(read(s.assetPath).equals(Buffer.from(template.files[s.assetPath])), s.id + " = the game's original (summary said Default)").toBe(true);
  }

  // and the confirmed bundle RUNS from file:// showing exactly those values
  const bundlePage = await browser.newPage();
  await assertSmoke(bundlePage, outDir, { title: CUSTOM["game.title"], commander: CUSTOM["game.commander"] });
  const accent = await bundlePage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gc-accent").trim());
  expect(accent).toBe(CUSTOM[ACCENT.id]);
  await bundlePage.close();
});
