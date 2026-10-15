# Vendoring Babylon — `scripts/build-vendor.mjs`

The exported game runs from `file://` with no network, so Babylon.js is
**vendored into the bundle** and committed (decision D2):
`public/templates/tower-defense/bundle/js/vendor/babylon.js`.

## The build

```sh
npm run vendor
```

`scripts/build-vendor.mjs` runs **esbuild** over
`scripts/vendor-entry.mjs`:

```js
import "@babylonjs/loaders/glTF";   // side effect: registers the GLTF plugin
export * from "@babylonjs/core";    // the core namespace becomes the bundle's return
```

```js
esbuild.build({
  bundle: true, format: "iife",
  globalName: "BABYLON",
  outfile: "…/bundle/js/vendor/babylon.js",
  minify: true, target: "es2020",
});
```

The IIFE's return value is assigned to `global.BABYLON`. Two subtleties in
the entry:

- **`export *` matters** — a side-effect-only import would make the IIFE
  return `undefined`, leaving `global.BABYLON` unset. `export *` makes the
  IIFE return the core namespace.
- **Import the loaders *index*, not `…/glTFFileLoader` directly** — the
  index pulls in the 1.0/2.0 loader modules whose side effect sets
  `GLTFFileLoader._CreateGLTF1Loader` / `_CreateGLTF2Loader`. Without it,
  parsing any glTF fails with "Unsupported version".

## Bumping Babylon

1. Update `@babylonjs/core` / `@babylonjs/loaders` / `@babylonjs/serializers`
   in `package.json`.
2. `npm run vendor` — this rewrites the committed `babylon.js`.
3. **Verify the bundle still parses glTF and the smoke test passes** — the
   [e2e suite](../testing/e2e.md) loads the default models from embedded
   bytes, so a loader regression fails the build.
4. Re-verify the Babylon v9 API notes in [assets.js](../template/assets-audio.md)
   and [game.js](../template/game-view.md) — the data-URL model load, the
   texture buffer parameter, and the missing `getRay` are v9-specific
   behaviors.

## CI drift check

The [CI build job](../testing/ci.md) runs `npm run vendor` and then
`git diff --exit-code -- …/vendor/babylon.js`. The committed bundle **must**
match what `package.json` produces — a version bump that skips `npm run
vendor` fails the build, so the export can never ship a stale vendor.
