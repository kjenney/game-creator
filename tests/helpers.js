// tests/helpers.js — load a Template (manifest + bundle files) from disk
// into the shape buildBundle consumes: { manifest: OptionSlot[], files: {relPath: string|Uint8Array} }.
import fs from "node:fs";
import path from "node:path";

const BINARY_EXT = new Set([".glb", ".png", ".jpg", ".jpeg", ".webp", ".mp3", ".ogg"]);

export function loadTemplate(name = "tower-defense") {
  const dir = path.join("public", "templates", name);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const files = {};
  for (const rel of manifest.bundleFiles) {
    const bytes = fs.readFileSync(path.join(dir, "bundle", rel));
    const ext = path.extname(rel).toLowerCase();
    files[rel] = BINARY_EXT.has(ext) ? new Uint8Array(bytes) : bytes.toString("utf8");
  }
  return { manifest: manifest.slots, files };
}
