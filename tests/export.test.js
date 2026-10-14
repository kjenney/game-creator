// THE seam (NOTES §5, spec §Testing): (Template, Option values, uploads) → output bundle.
// Run headless in Node; asserts the produced bundle, not implementation.
// T1 covers the thin path: title injection + bundle structure.
// T2 (issue #3) covers the model3d Option: a conforming GLB is accepted and
// placed at the slot's assetPath, and each failing requirement is rejected
// with its specific reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import GameGC from "../src/shared/contract.js"; // CJS default interop (NOTES D7)
import { loadTemplate } from "./helpers.js";

const text = (v) => (typeof v === "string" ? v : Buffer.from(v).toString("utf8"));
const gcOptions = (out) => JSON.parse(text(out.files["js/generated-options.js"]).replace("window.GC_OPTIONS = ", "").replace(";\n", ""));
const gcAssets = (out) => JSON.parse(text(out.files["js/generated-assets.js"]).replace("window.GC_ASSETS = ", "").replace(";\n", ""));

test("thin path: title injected where the game reads it", () => {
  const out = GameGC.buildBundle(loadTemplate(), { options: { "game.title": "Ken's Game" }, assets: {} });
  const generated = text(out.files["js/generated-options.js"]);
  assert.match(generated, /"game\.title":\s*"Ken's Game"/);
  assert.equal(gcOptions(out)["game.title"], "Ken's Game");
  // the game reads the title from GC_OPTIONS — index.html must load the generated file
  assert.ok(text(out.files["index.html"]).includes("js/generated-options.js"), "index.html loads js/generated-options.js");
  assert.ok(!text(out.files["index.html"]).includes('type="module"'), "no ES modules (file:// rule)");
});

test("exported bundle has the required structure (index.html + js/ + assets layout)", () => {
  const out = GameGC.buildBundle(loadTemplate(), { options: {}, assets: {} });
  for (const p of [
    "index.html",
    "js/vendor/babylon.js",
    "js/gc-contract.js",
    "js/generated-options.js",
    "js/generated-assets.js",
    "js/assets.js",
    "js/td-core.js",
    "js/td-audio.js",
    "js/game.js",
  ]) {
    assert.ok(out.files[p], "bundle missing " + p);
  }
  // default art ships in the export (T4: default art for towers/enemies/base/bg/ground)
  for (const p of [
    "assets/models/tower_arrow.glb",
    "assets/models/tower_cannon.glb",
    "assets/models/tower_frost.glb",
    "assets/models/enemy_grunt.glb",
    "assets/models/enemy_brute.glb",
    "assets/models/base_castle.glb",
    "assets/textures/ground.png",
    "assets/textures/skybox.png",
  ]) {
    assert.ok(out.files[p], "bundle missing " + p);
  }
  // game scripts are classic + relative (file:// rules, NOTES §3)
  const html = text(out.files["index.html"]);
  const order = [
    "js/vendor/babylon.js",
    "js/gc-contract.js",
    "js/generated-options.js",
    "js/generated-assets.js",
    "js/assets.js",
    "js/td-core.js",
    "js/td-audio.js",
    "js/game.js",
  ];
  // script tags are present, in the NOTES §3 order
  let prev = -1;
  for (const tag of order) {
    const i = html.indexOf('src="' + tag + '"');
    assert.ok(i >= 0, "index.html references " + tag);
    assert.ok(i > prev, "script order violation at " + tag);
    prev = i;
  }
});

test("default art + audio are embedded in GC_ASSETS (game loads them by bytes, never URL)", () => {
  const out = GameGC.buildBundle(loadTemplate(), { options: {}, assets: {} });
  const embedded = gcAssets(out);
  for (const p of [
    "assets/models/tower_cannon.glb",
    "assets/models/enemy_brute.glb",
    "assets/models/base_castle.glb",
    "assets/textures/ground.png",
    "assets/textures/skybox.png",
    "assets/audio/win.wav",
  ]) {
    assert.ok(typeof embedded[p] === "string" && embedded[p].length > 0, "GC_ASSETS missing " + p);
  }
});

test("unspecified Options keep their defaults (empty GC_OPTIONS; Template art embedded)", () => {
  const out = GameGC.buildBundle(loadTemplate(), {});
  assert.deepEqual(gcOptions(out), {});
  // T4: the Template's default art + audio ride along so the game plays with defaults
  const embedded = gcAssets(out);
  assert.ok(Object.keys(embedded).length >= 18, "default assets embedded in GC_ASSETS");
});

test("invalid text Option rejected with slot id + reason (ValidationError)", () => {
  assert.throws(
    () => GameGC.buildBundle(loadTemplate(), { options: { "game.title": "   " }, assets: {} }),
    (e) => e.name === "ValidationError" && e.slotId === "game.title",
  );
});

test("asset upload on a text-kind slot is rejected with a specific reason", () => {
  assert.throws(
    () => GameGC.buildBundle(loadTemplate(), { options: {}, assets: { "game.title": new Uint8Array([1, 2, 3]) } }),
    (e) => e.name === "ValidationError" && /takes a value, not an asset/.test(e.message),
  );
});

test("unknown slot id as an asset upload is rejected", () => {
  // (NOTES §4: option values are read per manifest slot; asset uploads must name a declared slot)
  assert.throws(
    () => GameGC.buildBundle(loadTemplate(), { options: {}, assets: { "nope.slot": new Uint8Array([1]) } }),
    (e) => e.name === "ValidationError" && /unknown option slot/.test(e.message),
  );
});

// ---- T2 (issue #3): the model3d Option through the export seam ----

const modelSlot = (template, id) => template.manifest.filter((s) => s.id === id)[0];

test("a conforming GLB is accepted and placed at the slot's assetPath, replacing the default", () => {
  const template = loadTemplate();
  const slot = modelSlot(template, "tower.cannon.model");
  assert.ok(slot && slot.kind === "model3d", "manifest declares a model3d cannon slot");

  const upload = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  const out = GameGC.buildBundle(template, { options: {}, assets: { "tower.cannon.model": upload } });

  // placed at the expected asset path — with the uploaded bytes, not the default's
  assert.ok(out.files[slot.assetPath], "bundle has the model at " + slot.assetPath);
  assert.deepEqual(out.files[slot.assetPath], upload);
  assert.notDeepEqual(out.files[slot.assetPath], template.files[slot.assetPath]);

  // embedded in GC_ASSETS (file:// rule D4): the game loads it by bytes,
  // in place of the default model
  assert.equal(gcAssets(out)[slot.assetPath], GameGC.toBase64(upload));
});

test("an upload failing each model requirement is rejected with the specific reason", () => {
  const template = loadTemplate();
  const slot = modelSlot(template, "tower.cannon.model");
  assert.ok(slot, "manifest declares a model3d cannon slot");
  const ok = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  // size is checked first (NOTES T2.2), so padding past maxBytes wins over the
  // now-bogus GLB totalLength (note: TypedArray.set returns undefined — assign first)
  const tooBig = new Uint8Array(ok.byteLength + slot.requirements.maxBytes + 1);
  tooBig.set(ok);
  const cases = [
    ["too large", tooBig, /too large/],
    ["wrong format", new Uint8Array(fs.readFileSync("tests/fixtures/glb/bad.txt")), /not a GLB/],
    ["missing required node", new Uint8Array(fs.readFileSync("tests/fixtures/glb/missing-node.glb")), /missing required node "barrel"/],
  ];
  for (const [label, bytes, re] of cases) {
    assert.throws(
      () => GameGC.buildBundle(template, { options: {}, assets: { "tower.cannon.model": bytes } }),
      (e) => e.name === "ValidationError" && e.slotId === "tower.cannon.model" && re.test(e.message),
      label + " must be rejected with the specific reason",
    );
  }
});

// ---- T3 (issue #4): color + texture/2D-image Options through the export seam ----

const slotById = (template, id) => template.manifest.filter((s) => s.id === id)[0];

test("the TD manifest declares the accent color and skybox/ground texture slots", () => {
  const template = loadTemplate();
  const accent = slotById(template, "theme.accent");
  assert.ok(accent && accent.kind === "color", "manifest declares a color accent slot");

  for (const [id, assetPath] of [
    ["skybox.texture", "assets/textures/skybox.png"],
    ["ground.texture", "assets/textures/ground.png"],
  ]) {
    const slot = slotById(template, id);
    assert.ok(slot && slot.kind === "texture", "manifest declares texture slot " + id);
    assert.equal(slot.assetPath, assetPath, "slot " + id + " maps to its expected asset path");
    assert.ok(slot.requirements && slot.requirements.maxBytes > 0, "texture slot declares a maxBytes requirement");
  }
});

test("accent color is injected where the game reads it (GC_OPTIONS)", () => {
  const out = GameGC.buildBundle(loadTemplate(), { options: { "theme.accent": "#12ab34" }, assets: {} });
  assert.match(text(out.files["js/generated-options.js"]), /"theme\.accent":\s*"#12ab34"/);
  assert.equal(gcOptions(out)["theme.accent"], "#12ab34");
  // the game applies it to the UI (index.html's --gc-accent, read in game.js)
  const game = text(out.files["js/game.js"]);
  assert.ok(game.includes('"theme.accent"') && game.includes("--gc-accent"), "game.js reads the accent and sets --gc-accent");
});

test("an invalid accent color is rejected with the slot id + specific reason", () => {
  assert.throws(
    () => GameGC.buildBundle(loadTemplate(), { options: { "theme.accent": "red" }, assets: {} }),
    (e) => e.name === "ValidationError" && e.slotId === "theme.accent" && /#rrggbb/.test(e.message),
  );
});

test("uploaded textures are placed at their assetPath with the uploaded bytes, embedded in place of the defaults", () => {
  const template = loadTemplate();
  const upload = new Uint8Array(fs.readFileSync("tests/fixtures/textures/ground.png"));
  for (const id of ["skybox.texture", "ground.texture"]) {
    const slot = slotById(template, id);
    const out = GameGC.buildBundle(template, { options: {}, assets: { [id]: upload } });

    // placed at the expected asset path — with the uploaded bytes, not the default's
    assert.ok(out.files[slot.assetPath], "bundle has the texture at " + slot.assetPath);
    assert.deepEqual(out.files[slot.assetPath], upload);
    assert.notDeepEqual(out.files[slot.assetPath], template.files[slot.assetPath]);

    // embedded in GC_ASSETS (file:// rule D4): the game loads it by bytes
    assert.equal(gcAssets(out)[slot.assetPath], GameGC.toBase64(upload));
  }
});

test("a texture upload failing format or size is rejected with the specific reason", () => {
  const template = loadTemplate();
  const slot = slotById(template, "ground.texture");
  const png = new Uint8Array(fs.readFileSync("tests/fixtures/textures/ground.png"));
  // size is checked before format (NOTES T2.2), so padding past maxBytes wins
  const tooBig = new Uint8Array(png.byteLength + slot.requirements.maxBytes + 1);
  tooBig.set(png);
  const cases = [
    ["too large", tooBig, /too large/],
    ["unsupported format", new Uint8Array(fs.readFileSync("tests/fixtures/glb/bad.txt")), /unsupported image format/],
  ];
  for (const [label, bytes, re] of cases) {
    assert.throws(
      () => GameGC.buildBundle(template, { options: {}, assets: { "ground.texture": bytes } }),
      (e) => e.name === "ValidationError" && e.slotId === "ground.texture" && re.test(e.message),
      label + " must be rejected with the specific reason",
    );
  }
});

test("image2d uploads are validated and placed at the slot assetPath (shared contract kind)", () => {
  // the TD template ships no image2d slot, so exercise the kind with a manifest
  // declaring one — the contract must handle it like any binary slot
  const slot = { id: "ui.icon", label: "Icon", kind: "image2d", requirements: { maxBytes: 1048576 }, assetPath: "assets/ui/icon.png" };
  const template = {
    manifest: [slot],
    defaultAssets: [],
    files: { "index.html": "<html></html>", "assets/ui/icon.png": new Uint8Array([1, 2, 3]) },
  };
  const upload = new Uint8Array(fs.readFileSync("tests/fixtures/textures/ground.png"));
  const out = GameGC.buildBundle(template, { options: {}, assets: { "ui.icon": upload } });
  assert.deepEqual(out.files[slot.assetPath], upload);
  assert.equal(gcAssets(out)[slot.assetPath], GameGC.toBase64(upload));
  assert.throws(
    () => GameGC.buildBundle(template, { options: {}, assets: { "ui.icon": new Uint8Array([1, 2, 3]) } }),
    (e) => e.name === "ValidationError" && e.slotId === "ui.icon" && /unsupported image format/.test(e.message),
  );
});
