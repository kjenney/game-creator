// export.js — browser export flow (NOTES §5):
// fetch bundle bytes → buildBundle (the pure seam, shared with Node tests)
// → JSZip → blob download. One code path for the transform in browser and Node.
import GameGC from "../shared/contract.js";
import JSZip from "jszip";

export async function exportBundle(template, collected) {
  const base = template.manifestUrl.slice(0, template.manifestUrl.lastIndexOf("/") + 1) + "bundle/";
  const files = {};
  for (const rel of template.manifest.bundleFiles) {
    const res = await fetch(base + rel);
    if (!res.ok) throw new Error("failed to load bundle file " + rel + " (HTTP " + res.status + ")");
    files[rel] = new Uint8Array(await res.arrayBuffer());
  }

  const assets = {};
  for (const [slotId, file] of Object.entries(collected.files)) {
    assets[slotId] = new Uint8Array(await file.arrayBuffer());
  }

  const out = GameGC.buildBundle({ manifest: template.manifest.slots, files }, { options: collected.options, assets: assets });

  const zip = new JSZip();
  Object.entries(out.files).forEach(([p, v]) => zip.file(p, v));
  if (!Object.keys(out.files).some((p) => p.startsWith("assets/"))) zip.file("assets/", ""); // standard layout: index.html + js/ + assets/
  const blob = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = template.id + ".zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
