// src/shared/contract.js — the shared Option/asset contract (NOTES §4).
// UMD-lite: CJS when module.exports exists (Node tests, Vite), otherwise
// merges onto global.GameGC (file:// classic script). One file, three
// contexts, zero deps, no transpile (D3).
(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") module.exports = factory();
  else Object.assign(global.GameGC = global.GameGC || {}, factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KINDS = ["text", "color", "texture", "image2d", "model3d"];
  var BINARY_KINDS = ["texture", "image2d", "model3d"];

  function ValidationError(slotId, reason) {
    var e = new Error("[" + slotId + "] " + reason);
    e.name = "ValidationError"; e.slotId = slotId; e.reason = reason;
    return e;
  }

  // ---- portable base64 (Uint8Array <-> string; NO btoa/Buffer) ----
  var B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function toBase64(bytes) {
    var out = [], i, n = bytes.byteLength;
    for (i = 0; i < n; i += 3) {
      var b1 = bytes[i], b2 = bytes[i + 1], b3 = bytes[i + 2];
      out.push(B64C[b1 >> 2]);
      out.push(B64C[((b1 & 0x03) << 4) | (b2 >> 4)]);
      out.push(b2 == null ? "=" : B64C[((b2 & 0x0f) << 2) | (b3 >> 6)]);
      out.push(b3 == null ? "=" : B64C[b3 & 0x3f]);
    }
    return out.join("");
  }
  function fromBase64(s) {
    var bin = atob(s), n = bin.length, bytes = new Uint8Array(n), i;
    for (i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // ---- value validators (text / color) ----
  function validateText(slot, value) {
    if (typeof value !== "string" || value.trim().length === 0)
      throw ValidationError(slot.id, "text value is required");
    if (value.length > 120) throw ValidationError(slot.id, "text value too long (max 120)");
    return true;
  }
  function validateColor(slot, value) {
    if (typeof value !== "string" || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value))
      throw ValidationError(slot.id, "color must be #rrggbb or #rrggbbaa");
    return true;
  }

  // ---- reset (issue #10 / US17): the field value that restores the game's original state ----
  // Returns the value the form field should hold after a reset, such that the
  // collector's normalization (empty/absent → omitted, see creator/collector.js)
  // plus buildBundle reproduce the Template's original state:
  //   text    → ""            (blank = "keep the game's default" — the collector omits it)
  //   color   → slot.default  (the manifest's own accent — the game's original)
  //   binary  → null          (no file → the Template's default art)
  function resetValue(slot) {
    if (slot.kind === "text") return "";
    if (slot.kind === "color") {
      if (slot.default == null)
        throw ValidationError(slot.id, "color slot has no manifest default to reset to");
      validateColor(slot, slot.default); // a malformed default has no well-defined original
      return slot.default;
    }
    if (BINARY_KINDS.indexOf(slot.kind) >= 0) return null;
    throw ValidationError(slot.id, "unknown kind " + slot.kind);
  }

  // ---- GLB reader (hand-rolled; Khronos binary glTF layout, D5) ----
  // header: magic u32 0x46546C67 ("glTF"), version u32, totalLength u32 (all little-endian)
  // chunks: [length u32, type u32, payload]; JSON chunk type 0x4E4F534A, BIN 0x004E4942
  function readGlb(bytes) {                       // -> { json } or { error: "reason" }
    if (bytes.byteLength < 12) return { error: "not a GLB (file too small)" };
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== 0x46546C67) return { error: "not a GLB (bad magic)" };
    if (dv.getUint32(4, true) !== 2) return { error: "not a GLB (version must be 2)" };
    if (dv.getUint32(8, true) !== bytes.byteLength) return { error: "GLB totalLength mismatch" };
    var off = 12;
    while (off + 8 <= bytes.byteLength) {
      var len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4E4F534A) {
        try { return { json: JSON.parse(new TextDecoder().decode(bytes.subarray(off + 8, off + 8 + len))) }; }
        catch (e) { return { error: "GLB JSON chunk is not valid JSON" }; }
      }
      off += 8 + len;                             // skip BIN and other chunks
    }
    return { error: "GLB has no JSON chunk" };
  }

  // ---- binary asset validator: throws ValidationError with SPECIFIC reason ----
  // (order: size → format → required nodes, NOTES T2.2)
  function validateAsset(slot, bytes) {
    if (slot.kind === "model3d") {
      var req = slot.requirements || { requiredNodes: [] };
      if (bytes.byteLength > req.maxBytes)
        throw ValidationError(slot.id, "too large: " + bytes.byteLength + " bytes (max " + req.maxBytes + ")");
      var glb = readGlb(bytes);
      if (glb.error) throw ValidationError(slot.id, glb.error);
      var names = {};
      (glb.json.nodes || []).forEach(function (n) { if (n.name) names[n.name] = true; });
      (glb.json.meshes || []).forEach(function (m) { if (m.name) names[m.name] = true; }); // lenient (T2.4)
      req.requiredNodes.forEach(function (n) {
        if (!names[n]) throw ValidationError(slot.id, "missing required node \"" + n + "\"");
      });
      return true;
    }
    if (slot.kind === "texture" || slot.kind === "image2d") {
      var max = (slot.requirements && slot.requirements.maxBytes) || 8 * 1024 * 1024;
      if (bytes.byteLength > max) throw ValidationError(slot.id, "too large (max " + max + ")");
      var ok = (bytes[0] === 0x89 && bytes[1] === 0x50) ||               // PNG
               (bytes[0] === 0xFF && bytes[1] === 0xD8) ||               // JPEG
               (bytes[0] === 0x52 && bytes[1] === 0x49 &&                // RIFF…WEBP
                bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50);
      if (!ok) throw ValidationError(slot.id, "unsupported image format (use PNG, JPEG, or WebP)");
      return true;
    }
    throw ValidationError(slot.id, "unknown kind " + slot.kind);
  }

  // ---- THE pure export transform (the automated seam, D8) ----
  // template: { manifest: OptionSlot[], defaultAssets?: string[], files: { [relPath]: string | Uint8Array } }
  //   options: { [slotId]: string | null }   text/color values; null/absent = keep default
  //   assets:  { [slotId]: Uint8Array }      uploaded binary assets (already File.arrayBuffer()ed)
  // -> { files: { [relPath]: string | Uint8Array } }   complete export bundle
  // throws ValidationError (slotId + specific reason) on any invalid value/asset
  function buildBundle(template, inputs) {
    inputs = inputs || {};
    var options = inputs.options || {}, assets = inputs.assets || {};
    var out = {};
    Object.keys(template.files).forEach(function (p) { out[p] = template.files[p]; });
    var gcOptions = {}, gcAssets = {};

    // 1. text/color options → GC_OPTIONS (only values the user actually set)
    template.manifest.forEach(function (slot) {
      var v = options[slot.id];
      if (v == null) return;
      if (slot.kind === "text") { validateText(slot, v); gcOptions[slot.id] = v; }
      else if (slot.kind === "color") { validateColor(slot, v); gcOptions[slot.id] = v; }
      else throw ValidationError(slot.id, "option value of kind " + slot.kind + " must be an asset upload");
    });

    // 2. uploaded binary assets → validate, place at slot.assetPath, embed
    Object.keys(assets).forEach(function (slotId) {
      var slot = template.manifest.filter(function (s) { return s.id === slotId; })[0];
      if (!slot) throw ValidationError(slotId, "unknown option slot");
      if (BINARY_KINDS.indexOf(slot.kind) < 0) throw ValidationError(slotId, "kind " + slot.kind + " takes a value, not an asset");
      validateAsset(slot, assets[slotId]);
      out[slot.assetPath] = assets[slotId];                       // standard assets/ layout
      gcAssets[slot.assetPath] = toBase64(assets[slotId]);
    });

    // 3. EVERY default binary asset also embedded (file:// rule D4): the game
    //    loads ALL binary assets from GC_ASSETS, never by URL. Two sources:
    //    the Template's declared defaultAssets (T4 default art/audio, not yet
    //    Option slots) and each binary slot's default file at slot.assetPath.
    (template.defaultAssets || []).forEach(function (p) {
      if (typeof template.files[p] === "object" && !gcAssets[p]) gcAssets[p] = toBase64(template.files[p]);
    });
    template.manifest.forEach(function (slot) {
      if (BINARY_KINDS.indexOf(slot.kind) >= 0 && template.files[slot.assetPath] && !gcAssets[slot.assetPath])
        gcAssets[slot.assetPath] = toBase64(template.files[slot.assetPath]);
    });

    // 4. inject the two generated files (template's index.html already has the <script> tags)
    out["js/generated-options.js"] = "window.GC_OPTIONS = " + JSON.stringify(gcOptions) + ";\n";
    out["js/generated-assets.js"] = "window.GC_ASSETS = " + JSON.stringify(gcAssets) + ";\n";
    out["js/gc-contract.js"] = template.files["js/gc-contract.js"]; // stays verbatim
    return { files: out };
  }

  return {
    KINDS: KINDS, BINARY_KINDS: BINARY_KINDS, ValidationError: ValidationError,
    toBase64: toBase64, fromBase64: fromBase64,
    validateText: validateText, validateColor: validateColor, validateAsset: validateAsset,
    resetValue: resetValue,
    readGlb: readGlb, buildBundle: buildBundle
  };
});
