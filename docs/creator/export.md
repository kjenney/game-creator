# export.js — browser export flow

`src/creator/export.js` implements the browser side of generation (NOTES §5):

```
fetch bundle bytes → buildBundle (the pure seam, shared with Node tests)
                    → JSZip → blob download
```

One code path for the transform in browser and Node — the browser only adds
the fetches and the zip.

## `exportBundle(template, collected)`

### 1. Fetch the Template bundle

The bundle base URL is derived from the manifest URL:
`templates/<id>/manifest.json` → `templates/<id>/bundle/`. Every path listed
in `manifest.bundleFiles` is fetched as `ArrayBuffer`; a non-OK response
throws `failed to load bundle file <rel> (HTTP <status>)`.

### 2. Read the uploads

Each `File` in `collected.files` is read via `file.arrayBuffer()` into a
`Uint8Array`, keyed by slot id. (No validation here — the seam validates, so
Node tests exercise the exact same rules.)

### 3. Run the seam

```js
GameGC.buildBundle(
  { manifest: template.manifest.slots,
    defaultAssets: template.manifest.defaultAssets || [],
    files },
  { options: collected.options, assets },
)
```

See [buildBundle](../contract/build-bundle.md) for what happens inside:
validation, placement at `assetPath`, base64 embedding, and the two generated
files. Failures throw `ValidationError` with the slot id and the specific
reason; [main.js](main.md) renders them as "That value won't work: …".

### 4. Zip and download

- `JSZip` receives every output file. If the bundle somehow has no `assets/`
  entry, an empty `assets/` directory entry is added — the standard layout is
  `index.html + js/ + assets/`, and some unzip tools want the directory to
  exist explicitly.
- The zip downloads as `<template-id>.zip` (e.g. `tower-defense.zip`) via a
  temporary `<a download>` + blob URL, which is revoked immediately.

## What the user gets

A self-contained bundle that opens from `file://`: the game's `index.html`,
the classic-script `js/` tree (vendor, contract, generated options, generated
assets, loader, core, audio, game), and the `assets/` tree. No server, no
network — see [Architecture](../architecture.md) for the rules that make this
possible.
