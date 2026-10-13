// Contract module (shared between creator, tests, and the exported game).
// Seams under test: the value validators and the portable base64 codec —
// public behavior only (NOTES §4, spec §Testing).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import GameGC from "../src/shared/contract.js"; // CJS default interop (NOTES D7)

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
