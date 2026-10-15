# buildBundle — the pure export transform

`GameGC.buildBundle` is **the** seam (D8): a pure function from
(Template, Option values, uploads) to a complete output bundle. No DOM, no
network, no `Date` — the browser, the Node tests, and the e2e suites all call
the identical code.

## Signature

```js
buildBundle(template, inputs) → { files: { [relPath]: string | Uint8Array } }
```

**`template`** — the Template as loaded from disk (Node) or fetched (browser):

```js
{
  manifest: OptionSlot[],          // the slots array
  defaultAssets?: string[],        // default binary assets (incl. non-slot assets like audio)
  files: { [relPath]: string | Uint8Array }  // the whole bundle, keyed by rel path
}
```

**`inputs`**:

```js
{
  options: { [slotId]: string | null },   // text/color values; null/absent = keep default
  assets:  { [slotId]: Uint8Array }       // uploaded binaries (already File.arrayBuffer()ed)
}
```

## The transform, step by step

1. **Copy the base.** Every `template.files[p]` goes into the output
   unchanged — the game's code (`index.html`, `js/vendor/babylon.js`,
   `gc-contract.js`, `td-core.js`, `game.js`, …) is identical in every
   export.

2. **Inject text/color options** — only values the user actually set. Each is
   validated (`validateText` / `validateColor`); a value for a binary-kind
   slot throws (`option value of kind texture must be an asset upload`).

3. **Place uploaded assets** — each `assets[slotId]` is validated
   (`validateAsset`: size → format → required nodes), written to
   `out[slot.assetPath]` (replacing the default at that path), and embedded
   as base64 in the `GC_ASSETS` map.

4. **Embed every default binary asset** (the `file://` rule D4 — the game
   loads all binary assets from `GC_ASSETS`, never by URL). Two sources,
   both embedded unless an upload already replaced them:
   - `template.defaultAssets` — assets with no Option slot at all (in Tower
     Defense: the ten audio files);
   - each binary slot's default file at `slot.assetPath`.

5. **Write the two generated files** (the template's `index.html` already has
   the `<script>` tags for them):

   ```js
   out["js/generated-options.js"] = "window.GC_OPTIONS = " + JSON.stringify(gcOptions) + ";\n";
   out["js/generated-assets.js"]  = "window.GC_ASSETS  = " + JSON.stringify(gcAssets)  + ";\n";
   out["js/gc-contract.js"]       = template.files["js/gc-contract.js"]; // stays verbatim
   ```

   The checked-in `generated-*.js` in the repo are placeholders
   (`window.GC_OPTIONS = {};` / `window.GC_ASSETS = {};`); `buildBundle`
   replaces them with the user's resolved values.

## Behavior guarantees (asserted by the test suite)

- **Untouched slots stay original.** An empty `inputs` yields a bundle where
  `GC_OPTIONS` is `{}` and every default asset is embedded — the Template
  as-is.
- **Uploads replace defaults** at `assetPath`, in the bundle *and* in
  `GC_ASSETS`.
- **Every rejection is specific**: `ValidationError` with the slot id and the
  failing requirement (`too large: … bytes (max …)`, `missing required node
  "barrel"`, `unsupported image format (use PNG, JPEG, or WebP)`, …).
- **The bundle is self-contained**: `index.html` loads
  `js/generated-options.js`, no `type="module"`, classic scripts in the
  manifest's declared order, standard `index.html + js/ + assets/` layout.

## Where it's called

| Caller | Context |
|---|---|
| [creator/export.js](../creator/export.md) | the browser export (fetches bundle bytes first, zips the result) |
| [scripts/smoke-export.mjs](../getting-started.md#manual-smoke-test) | writes a real export for the manual `file://` check |
| [tests/export.test.js](../testing/unit.md) | the export-seam suite |
| [e2e/helpers.js](../testing/e2e.md) | `buildBundleDir()` — the smoke test bundle |
