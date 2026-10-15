// Contract module (shared between creator, tests, and the exported game).
// Seams under test: the value validators, the portable base64 codec, and the
// pre-export summary — public behavior only (NOTES §4, spec §Testing).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import GameGC from "../src/shared/contract.js"; // CJS default interop (NOTES D7)
import { loadTemplate } from "./helpers.js";

const titleSlot = { id: "game.title", label: "Game title", kind: "text" };
const accentSlot = { id: "theme.accent", label: "Accent color", kind: "color" };
const cannonSlot = {
  id: "tower.cannon.model",
  label: "Cannon tower model",
  kind: "model3d",
  requirements: { format: "glb", requiredNodes: ["barrel"], pivot: "origin", targetScale: 1.0, maxBytes: 2097152 },
  assetPath: "assets/models/tower_cannon.glb",
};
const groundSlot = {
  id: "ground.texture",
  label: "Ground texture",
  kind: "texture",
  requirements: { maxBytes: 8388608 },
  assetPath: "assets/textures/ground.png",
};

// ---- portable base64 (no btoa/Buffer in shared code — NOTES T2.3) ----

test("toBase64/fromBase64 round-trips arbitrary bytes", () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x89, 0xff, 0xfe, 0x02, 0x67, 0x6c, 0x54, 0x46]);
  const b64 = GameGC.toBase64(bytes);
  assert.equal(typeof b64, "string");
  assert.equal(b64, "AAGJ//4CZ2xURg=="); // reference encoding from Buffer.toString("base64")
  assert.deepEqual(GameGC.fromBase64(b64), bytes);
});

test("toBase64 emits standard padding for 1- and 2-byte inputs", () => {
  assert.equal(GameGC.toBase64(new Uint8Array([0x42])), "Qg==");
  assert.equal(GameGC.toBase64(new Uint8Array([0x42, 0x43])), "QkM=");
});

test("fromBase64 decodes a known base64 string", () => {
  assert.deepEqual(GameGC.fromBase64("QkM="), new Uint8Array([0x42, 0x43]));
});

// ---- text ----

test("validateText accepts a non-empty string", () => {
  assert.equal(GameGC.validateText(titleSlot, "Ken's Game"), true);
});

test("validateText rejects empty, whitespace-only, and non-string values with the slot id", () => {
  for (const bad of ["", "   ", 42, null, undefined]) {
    assert.throws(
      () => GameGC.validateText(titleSlot, bad),
      (e) => e.name === "ValidationError" && e.slotId === "game.title" && /required/i.test(e.message),
    );
  }
});

test("validateText rejects over-length values (max 120) with a specific reason", () => {
  assert.throws(
    () => GameGC.validateText(titleSlot, "x".repeat(121)),
    (e) => e.name === "ValidationError" && /120/.test(e.message),
  );
});

// ---- color ----

test("validateColor accepts #rrggbb and #rrggbbaa", () => {
  assert.equal(GameGC.validateColor(accentSlot, "#12AB34"), true);
  assert.equal(GameGC.validateColor(accentSlot, "#12ab34ff"), true);
});

test("validateColor rejects non-hex, 3-digit, and named colors with a specific reason", () => {
  for (const bad of ["red", "#123", "#12ab3g", "12ab34", "#12ab345", ""]) {
    assert.throws(
      () => GameGC.validateColor(accentSlot, bad),
      (e) => e.name === "ValidationError" && e.slotId === "theme.accent" && /#rrggbb/.test(e.message),
    );
  }
});

// ---- GLB (hand-rolled reader; failure modes per NOTES T2.2) ----

test("readGlb parses the fixtures: valid tower, missing node, truncated", () => {
  const valid = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  const parsed = GameGC.readGlb(valid);
  assert.ok(parsed.json, "valid-tower.glb should parse");
  assert.ok(parsed.json.nodes.some((n) => n.name === "barrel"), "fixture declares a 'barrel' node");

  const missing = GameGC.readGlb(new Uint8Array(fs.readFileSync("tests/fixtures/glb/missing-node.glb")));
  assert.ok(missing.json, "missing-node.glb should still parse as GLB");
  assert.ok(!missing.json.nodes.some((n) => n.name === "barrel"), "fixture has no 'barrel' node");

  const truncated = GameGC.readGlb(new Uint8Array(fs.readFileSync("tests/fixtures/glb/truncated.glb")));
  assert.equal(truncated.error, "not a GLB (file too small)");
});

test("validateAsset(model3d) accepts a GLB with the required node within maxBytes", () => {
  const bytes = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  assert.equal(GameGC.validateAsset(cannonSlot, bytes), true);
});

test("validateAsset(model3d) rejects a GLB missing a required node with the node name in the reason", () => {
  const bytes = new Uint8Array(fs.readFileSync("tests/fixtures/glb/missing-node.glb"));
  assert.throws(
    () => GameGC.validateAsset(cannonSlot, bytes),
    (e) => e.name === "ValidationError" && e.slotId === "tower.cannon.model" && /missing required node "barrel"/.test(e.message),
  );
});

test("validateAsset(model3d) rejects oversized and non-GLB payloads with specific reasons", () => {
  const oversized = { ...cannonSlot, requirements: { ...cannonSlot.requirements, maxBytes: 4 } };
  const bytes = new Uint8Array(fs.readFileSync("tests/fixtures/glb/valid-tower.glb"));
  assert.throws(() => GameGC.validateAsset(oversized, bytes), (e) => e.name === "ValidationError" && /too large/.test(e.message));

  const notGlb = new Uint8Array(fs.readFileSync("tests/fixtures/glb/bad.txt"));
  assert.throws(() => GameGC.validateAsset(cannonSlot, notGlb), (e) => e.name === "ValidationError" && /not a GLB/.test(e.message));
});

// ---- texture ----

test("validateAsset(texture) accepts PNG bytes and rejects non-image bytes with a specific reason", () => {
  const png = new Uint8Array(fs.readFileSync("tests/fixtures/textures/ground.png"));
  assert.equal(GameGC.validateAsset(groundSlot, png), true);

  const txt = new Uint8Array(fs.readFileSync("tests/fixtures/glb/bad.txt"));
  assert.throws(
    () => GameGC.validateAsset(groundSlot, txt),
    (e) => e.name === "ValidationError" && /unsupported image format/.test(e.message),
  );
});

// ---- resetValue (issue #10 / US17): the field value that restores the game's original state ----
// The form applies this to the field on Reset (creator/form.js); the collector
// then normalizes it (empty/absent → omitted) so buildBundle reproduces the
// Template's original state. The value per kind is the contract's to decide.

test("resetValue returns the game-original field value per kind", () => {
  assert.equal(GameGC.resetValue(titleSlot), ""); // text: blank = keep the game's default
  assert.equal(GameGC.resetValue({ ...accentSlot, default: "#e8a33d" }), "#e8a33d"); // color: the manifest's own accent
  assert.equal(GameGC.resetValue(cannonSlot), null); // model3d: no file → the Template's default art
  assert.equal(GameGC.resetValue(groundSlot), null); // texture: same
});

test("resetValue rejects a color slot with no manifest default — the reset has no original to restore", () => {
  assert.throws(
    () => GameGC.resetValue(accentSlot), // accentSlot above declares no default
    (e) => e.name === "ValidationError" && e.slotId === "theme.accent" && /no manifest default/.test(e.message),
  );
});

test("resetValue rejects a malformed manifest default and an unknown kind with the slot id + reason", () => {
  assert.throws(
    () => GameGC.resetValue({ ...accentSlot, default: "red" }),
    (e) => e.name === "ValidationError" && e.slotId === "theme.accent" && /#rrggbb/.test(e.message),
  );
  assert.throws(
    () => GameGC.resetValue({ id: "x.y", label: "X", kind: "sound" }),
    (e) => e.name === "ValidationError" && e.slotId === "x.y" && /unknown kind/.test(e.message),
  );
});

// ---- summarize (issue #11 / US18): customized vs default per slot, pre-export ----
// The creator's summary section renders these rows (creator/summary.js) from
// the same collected data the export consumes; the customized/default call
// per kind is the contract's to decide (US33) so the review the user confirms
// can't drift from what buildBundle does with the very same input.

test("summarize lists every manifest slot in manifest order, all default on an empty form", () => {
  // the REAL TD manifest: spec US16-25 — the TD ships exactly 11 Option slots
  const manifest = loadTemplate().manifest;
  assert.equal(manifest.length, 11);

  const result = GameGC.summarize(manifest, {});
  assert.equal(result.total, 11);
  assert.equal(result.customized, 0);
  assert.deepEqual(result.slots.map((r) => r.id), manifest.map((s) => s.id)); // form order
  assert.deepEqual(result.slots.map((r) => r.label), manifest.map((s) => s.label)); // user-facing labels
  assert.ok(result.slots.every((r) => r.status === "default" && r.value === null));
});

test("summarize marks a text slot customized iff a non-blank value was set, and shows it", () => {
  for (const v of [null, undefined, "", "   "]) {
    const r = GameGC.summarize([titleSlot], { options: { "game.title": v } });
    assert.equal(r.customized, 0, JSON.stringify(v));
    assert.equal(r.slots[0].status, "default");
    assert.equal(r.slots[0].value, null);
  }
  const set = GameGC.summarize([titleSlot], { options: { "game.title": "Ken's Game" } });
  assert.equal(set.customized, 1);
  assert.equal(set.slots[0].status, "customized");
  assert.equal(set.slots[0].value, "Ken's Game"); // the value the export will receive
});

test("summarize marks a color slot customized only when it differs from the manifest default", () => {
  const slot = { ...accentSlot, default: "#e8a33d" };
  // at the default (either case — hex comparison is case-insensitive) → default
  for (const v of ["#e8a33d", "#E8A33D"]) {
    const r = GameGC.summarize([slot], { options: { "theme.accent": v } });
    assert.equal(r.customized, 0, v);
  }
  // no value at all → the game's original accent
  assert.equal(GameGC.summarize([slot], { options: {} }).customized, 0);
  // changed → customized, with the hex shown
  const r = GameGC.summarize([slot], { options: { "theme.accent": "#0b66ff" } });
  assert.equal(r.customized, 1);
  assert.equal(r.slots[0].status, "customized");
  assert.equal(r.slots[0].value, "#0b66ff");
});

test("summarize marks a color slot with no manifest default customized for any value", () => {
  const r = GameGC.summarize([accentSlot], { options: { "theme.accent": "#112233" } }); // accentSlot declares no default
  assert.equal(r.customized, 1);
  assert.equal(r.slots[0].value, "#112233");
});

test("summarize marks binary slots customized iff a file was uploaded, and shows the filename", () => {
  const none = GameGC.summarize([cannonSlot, groundSlot], {});
  assert.equal(none.customized, 0);
  assert.ok(none.slots.every((r) => r.status === "default" && r.value === null));

  const r = GameGC.summarize([cannonSlot, groundSlot], {
    files: { "tower.cannon.model": { name: "my-tower.glb" } },
  });
  assert.equal(r.customized, 1);
  assert.equal(r.slots[0].status, "customized");
  assert.equal(r.slots[0].value, "my-tower.glb");
  assert.equal(r.slots[1].status, "default"); // a slot with no upload keeps the game's original
});

test("summarize counts customizations across kinds and ignores entries for unknown slots", () => {
  const manifest = [titleSlot, { ...accentSlot, default: "#e8a33d" }, cannonSlot];
  const r = GameGC.summarize(manifest, {
    options: { "game.title": "Ken's Game", "theme.accent": "#e8a33d", "nope.slot": "x" },
    files: { "tower.cannon.model": { name: "my-tower.glb" } },
  });
  assert.equal(r.total, 3);
  assert.equal(r.customized, 2); // title + model; accent is at the default; nope.slot isn't a slot
});

test("summarize tolerates a missing collected and rejects an unknown kind with the slot id + reason", () => {
  const r = GameGC.summarize([titleSlot]);
  assert.equal(r.total, 1);
  assert.equal(r.customized, 0);

  assert.throws(
    () => GameGC.summarize([{ id: "x.y", label: "X", kind: "sound" }]),
    (e) => e.name === "ValidationError" && e.slotId === "x.y" && /unknown kind/.test(e.message),
  );
});
