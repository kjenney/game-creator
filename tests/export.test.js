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

// ---- T5 (issue #6): the full customization surface (all 11 Option slots) ----
// The prior issues built each kind (#3 model, #4 color/texture, #5 TD game);
// this wires the whole surface together: every slot at once, in one bundle.

const FULL_MODEL_SLOTS = [
  "tower.arrow.model",
  "tower.cannon.model",
  "tower.frost.model",
  "enemy.grunt.model",
  "enemy.brute.model",
  "base.castle.model",
];

test("the TD manifest declares the full 11-slot surface (2 text, 6 model, 2 texture, 1 color)", () => {
  const template = loadTemplate();
  assert.equal(template.manifest.length, 11, "11 Option slots in total");

  const byKind = (k) => template.manifest.filter((s) => s.kind === k);
  assert.equal(byKind("text").length, 2, "2 text slots");
  assert.equal(byKind("model3d").length, 6, "6 model slots (3 tower, 2 enemy, 1 base)");
  assert.equal(byKind("texture").length, 2, "2 texture slots (skybox, ground)");
  assert.equal(byKind("color").length, 1, "1 color slot (accent)");

  // every model slot carries its own per-slot requirements + a model asset path
  byKind("model3d").forEach((s) => {
    assert.ok(s.requirements && s.requirements.format === "glb" && s.requirements.maxBytes > 0,
      s.id + " declares glb requirements (format + maxBytes)");
    assert.ok(s.assetPath && s.assetPath.startsWith("assets/models/"), s.id + " maps to a model asset path");
  });
});

test("full customization: all 11 Option values + assets produce a correct, self-contained bundle", () => {
  const template = loadTemplate();
  const tower = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  const tex = new Uint8Array(fs.readFileSync("tests/fixtures/textures/ground.png"));

  // set every slot: 2 text + 1 color as values, all 6 models + 2 textures as uploads
  const options = {
    "game.title": "Ken's Full Game",
    "game.commander": "Ken",
    "theme.accent": "#0b66ff",
  };
  const assets = {};
  for (const s of template.manifest) {
    if (s.kind === "model3d") assets[s.id] = tower;
    else if (s.kind === "texture") assets[s.id] = tex;
  }

  const out = GameGC.buildBundle(template, { options, assets });

  // all text + color injected exactly where the game reads them (GC_OPTIONS)
  const gcOpts = gcOptions(out);
  assert.equal(gcOpts["game.title"], "Ken's Full Game");
  assert.equal(gcOpts["game.commander"], "Ken");
  assert.equal(gcOpts["theme.accent"], "#0b66ff");
  assert.equal(Object.keys(gcOpts).length, 3, "exactly the value Options — no binary kinds leaked in");

  // every model placed at its own assetPath with the upload bytes (not the default's),
  // and embedded in GC_ASSETS (file:// rule D4) so the game loads it by bytes
  const gcAs = gcAssets(out);
  for (const s of template.manifest.filter((x) => x.kind === "model3d")) {
    assert.deepEqual(out.files[s.assetPath], tower, s.id + " placed with the upload bytes");
    assert.notDeepEqual(out.files[s.assetPath], template.files[s.assetPath], s.id + " differs from the default model");
    assert.equal(gcAs[s.assetPath], GameGC.toBase64(tower), s.id + " embedded in GC_ASSETS");
  }
  // both textures placed + embedded
  for (const s of template.manifest.filter((x) => x.kind === "texture")) {
    assert.deepEqual(out.files[s.assetPath], tex, s.id + " placed with the upload bytes");
    assert.equal(gcAs[s.assetPath], GameGC.toBase64(tex), s.id + " embedded in GC_ASSETS");
  }

  // the bundle is still self-contained and file://-safe
  const html = text(out.files["index.html"]);
  assert.ok(html.includes("js/generated-options.js") && html.includes("js/generated-assets.js"),
    "index.html loads the generated options + assets");
  assert.ok(!html.includes('type="module"'), "no ES modules (file:// rule)");
});

test("each of the 6 model slots rejects an invalid GLB with its own slot id + specific reason", () => {
  const template = loadTemplate();
  const bad = new Uint8Array(fs.readFileSync("tests/fixtures/glb/bad.txt"));
  for (const id of FULL_MODEL_SLOTS) {
    assert.throws(
      () => GameGC.buildBundle(template, { options: {}, assets: { [id]: bad } }),
      (e) => e.name === "ValidationError" && e.slotId === id && /not a GLB/.test(e.message),
      id + " rejects a non-GLB upload with its own slot id",
    );
  }
});

// ---- T6 (issue #10 / US17): reset any field back to the game's original value ----
// Product contract: a customized field, once reset, exports exactly what an
// UNTOUCHED form would — the game's original value, where the game reads it.
// Reset is field-level (form.js applies the shared contract's resetValue to
// the field); the collector then normalizes it (empty/absent → omitted,
// creator/collector.js). What an untouched form collects: text/file fields
// empty (omitted), the color picker seeded at the manifest default (a color
// input always has a value, so the untouched export carries it — equal to the
// game's original accent).

const untouchedOptions = (template) => {
  const options = {};
  for (const s of template.manifest) options[s.id] = s.kind === "color" ? s.default : null;
  return options;
};

// the collector's normalization of a reset field value (collector.js)
const resetOption = (slot) => {
  const v = GameGC.resetValue(slot);
  return v == null || v === "" ? null : v;
};

const bundleEqual = (a, b) => {
  assert.deepEqual(Object.keys(a.files).sort(), Object.keys(b.files).sort(), "same bundle structure");
  for (const k of Object.keys(a.files).sort())
    assert.deepEqual(a.files[k], b.files[k], "identical bytes for " + k);
};

test("resetting a customized text field restores the game's original title (bundle identical to untouched)", () => {
  const template = loadTemplate();
  const slot = slotById(template, "game.title");
  const untouched = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: {} });

  // the customization is real: the title rides in GC_OPTIONS, where the game reads it
  const customized = GameGC.buildBundle(template, { options: { ...untouchedOptions(template), "game.title": "Ken's Custom" }, assets: {} });
  assert.equal(gcOptions(customized)["game.title"], "Ken's Custom");
  assert.notEqual(customized.files["js/generated-options.js"], untouched.files["js/generated-options.js"]);

  // after reset the title is omitted again — the game falls back to its own ("Tower Defense")
  const reset = GameGC.buildBundle(template, { options: { ...untouchedOptions(template), "game.title": resetOption(slot) }, assets: {} });
  assert.equal(gcOptions(reset)["game.title"], undefined, "reset title omitted — the game uses its original");
  bundleEqual(reset, untouched);
});

test("resetting the accent color restores the manifest default (the case issue #10 calls out)", () => {
  const template = loadTemplate();
  const slot = slotById(template, "theme.accent");
  const untouched = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: {} });

  // the customization is real: the custom accent rides in GC_OPTIONS
  const customized = GameGC.buildBundle(template, { options: { ...untouchedOptions(template), "theme.accent": "#0b66ff" }, assets: {} });
  assert.equal(gcOptions(customized)["theme.accent"], "#0b66ff");
  assert.notEqual(customized.files["js/generated-options.js"], untouched.files["js/generated-options.js"]);

  // after reset the accent is back to the game's original — the manifest default,
  // which matches the bundle's own --gc-accent fallback, where the game reads it
  const reset = GameGC.buildBundle(template, { options: { ...untouchedOptions(template), "theme.accent": resetOption(slot) }, assets: {} });
  assert.equal(gcOptions(reset)["theme.accent"], slot.default, "reset accent = the manifest default");
  assert.match(text(reset.files["js/generated-options.js"]), /"theme\.accent":\s*"#e8a33d"/);
  bundleEqual(reset, untouched);
});

test("resetting a model upload restores the game's default model (bytes + embedding)", () => {
  const template = loadTemplate();
  const slot = slotById(template, "tower.cannon.model");
  const upload = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  const untouched = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: {} });

  // the customization is real: the upload's bytes at the assetPath, embedded
  const customized = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: { "tower.cannon.model": upload } });
  assert.deepEqual(customized.files[slot.assetPath], upload);
  assert.equal(gcAssets(customized)[slot.assetPath], GameGC.toBase64(upload));

  // after reset (no file) the Template's default model is back at the assetPath, embedded
  const reset = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: {} });
  assert.deepEqual(reset.files[slot.assetPath], template.files[slot.assetPath], "default model bytes restored");
  assert.equal(gcAssets(reset)[slot.assetPath], GameGC.toBase64(template.files[slot.assetPath]), "default model re-embedded");
  bundleEqual(reset, untouched);
});

test("resetting a texture upload restores the game's default texture", () => {
  const template = loadTemplate();
  const slot = slotById(template, "ground.texture");
  const upload = new Uint8Array(fs.readFileSync("tests/fixtures/textures/ground.png"));
  const untouched = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: {} });

  const customized = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: { "ground.texture": upload } });
  assert.deepEqual(customized.files[slot.assetPath], upload);

  const reset = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: {} });
  assert.deepEqual(reset.files[slot.assetPath], template.files[slot.assetPath], "default texture bytes restored");
  bundleEqual(reset, untouched);
});

test("resetting the WHOLE surface (all 11 slots) exports exactly what an untouched form would", () => {
  const template = loadTemplate();
  const tower = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  const tex = new Uint8Array(fs.readFileSync("tests/fixtures/textures/ground.png"));

  // customize every slot (2 text + 1 color as values, 6 model + 2 texture as uploads)
  const options = { "game.title": "Custom Title", "game.commander": "Custom Commander", "theme.accent": "#0b66ff" };
  const assets = {};
  for (const s of template.manifest) {
    if (s.kind === "model3d") assets[s.id] = tower;
    else if (s.kind === "texture") assets[s.id] = tex;
  }
  const customized = GameGC.buildBundle(template, { options, assets });
  assert.equal(gcOptions(customized)["game.title"], "Custom Title");
  for (const s of template.manifest.filter((x) => x.kind === "model3d"))
    assert.deepEqual(customized.files[s.assetPath], tower, s.id + " customized");

  // now reset every field (contract value + collector normalization):
  // text → omitted, color → the manifest default, uploads → no file
  const resetOptions = {};
  for (const s of template.manifest) {
    const v = resetOption(s);
    if (v != null) resetOptions[s.id] = v;
  }
  const reset = GameGC.buildBundle(template, { options: resetOptions, assets: {} });

  // byte-identical to the untouched form's export — the customization is fully undone
  const untouched = GameGC.buildBundle(template, { options: untouchedOptions(template), assets: {} });
  bundleEqual(reset, untouched);
});
