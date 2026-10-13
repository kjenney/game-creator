// registry.js — Template registry (NOTES §2). v1 ships one Template;
// the shape accepts more. manifestUrl is relative to the app origin —
// public/ is served in dev and copied to dist/ unchanged (D10).
export const TEMPLATES = [
  {
    id: "tower-defense",
    name: "Tower Defense",
    manifestUrl: "templates/tower-defense/manifest.json",
  },
];

export async function loadManifest(template) {
  const res = await fetch(template.manifestUrl);
  if (!res.ok) throw new Error("failed to load manifest for " + template.id + " (HTTP " + res.status + ")");
  return { ...template, manifest: await res.json() };
}
