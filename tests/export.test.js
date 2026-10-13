// THE seam (NOTES §5, spec §Testing): (Template, Option values, uploads) → output bundle.
// Run headless in Node; asserts the produced bundle, not implementation.
// T1 covers the thin path: title injection + bundle structure. (T2/T3 add GLB/texture slots and tests.)
import { test } from "node:test";
import assert from "node:assert/strict";
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
    "js/game.js",
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

test("unspecified Options keep their defaults (empty GC_OPTIONS, game falls back)", () => {
  const out = GameGC.buildBundle(loadTemplate(), {});
  assert.deepEqual(gcOptions(out), {});
  assert.deepEqual(gcAssets(out), {}); // T1 manifest has no binary slots
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
