# Authoring

How to extend the project: adding a new Template (a new genre), adding an
Option to an existing Template, and regenerating the generated assets.

## The one rule: content only (ADR 0001)

An Option may substitute **content** — a text label, a color, a texture, a 2D
image, or a full 3D model — but **never** rules, behavior, structure, or
numeric balance. If the change you want is "harder" or "different waves",
that's a different Template, not a new Option. This keeps each Template a
stable, self-contained game and keeps "generation" a simple content-injection
step.

## Adding an Option to Tower Defense

1. **Declare the slot** in `public/templates/tower-defense/manifest.json` —
   `id`, `label`, `kind`, and for binary kinds `requirements` + `assetPath`.
2. **Consume it in the game**:
   - text/color → read `window.GC_OPTIONS["<id>"]` in `game.js` (with a
     sensible default for the uncustomized case);
   - binary → load from `GC_ASSETS` at the slot's `assetPath` via `GCAssets`
     (or `GCAudio` for a sound).
3. **Keep the default**: if the slot replaces an existing asset, that asset's
   path is already in `bundleFiles`/`defaultAssets` and `buildBundle` embeds
   it as the fallback. New non-slot assets go in `defaultAssets`.
4. **Cover it** in the suites — the "full surface" tests enumerate the
   manifest, so a new slot is exercised automatically for render, export,
   rejection, and reset-to-original.

The creator UI needs no changes: the form, summary, reset, and export are all
generated from the manifest.

## Adding a new Template (a new genre)

1. **Build the game** under `public/templates/<id>/bundle/`:
   `index.html` (shell + the fixed 9-script order), `js/` (vendor, contract
   copy, generated placeholders, loader, core, audio, game), `assets/`.
   Obey the [`file://` rules](../architecture.md#the-file-rules).
2. **Keep the contract verbatim**: copy `src/shared/contract.js` to
   `bundle/js/gc-contract.js`. `buildBundle` copies it through unchanged —
   the game and the tests must run the same code.
3. **Write the manifest**: `name`, `version`, `slots` (its Option surface),
   `defaultAssets` (every binary asset the game loads by bytes — including
   audio), `bundleFiles` (the complete export file list).
4. **Register it**: add `{ id, name, manifestUrl }` to
   `TEMPLATES` in [creator/registry.js](../creator/registry.md).
5. **Vendor & art**: the vendor bundle is shared (same
   [Babylon build](vendor.md)); default art can be
   [script-generated](art.md) like Tower Defense's.
6. **Test**: the export-seam suite loads a Template by id via
   `loadTemplate(name)` — add the manifest-driven assertions (thin path,
   structure, per-slot rejection, reset-to-original, full surface).

## Regenerating generated assets

| What | Command | Output |
|---|---|---|
| Default art (GLB/PNG/WAV) | `npm run art` | `public/templates/tower-defense/bundle/assets/` — deterministic, byte-stable |
| Vendored Babylon | `npm run vendor` | `public/templates/tower-defense/bundle/js/vendor/babylon.js` — CI diffs it against `package.json` |
