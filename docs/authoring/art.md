# Default art — `scripts/make-default-art.mjs`

`npm run art` generates the Tower Defense Template's default art into
`public/templates/tower-defense/bundle/assets/`:

- **6 GLB models** — three towers (arrow, cannon, frost, each with a `barrel`
  node for aiming), two enemies (grunt, brute), one base castle.
- **2 PNG textures** — ground and skybox.
- **10 WAV sounds** — `place`, `shoot_arrow`, `shoot_cannon`, `shoot_frost`,
  `hit`, `kill`, `leak`, `wave`, `win`, `lose`.

## Why generated

The art is **default** — simple, recognizable primitives the user is expected
to replace via the model/texture Options (issue #6). Keeping it script-
generated means:

- the bundle ships **no hand-authored binaries** — the exact asset set is
  reproducible from source;
- it's **deterministic**: no `Math.random` (a small hash function stands in),
  so `npm run art` is **byte-stable** and CI can diff it;
- zero dependencies — it writes GLB (hand-rolled glTF binary), PNG (hand-
  rolled with `zlib`), and WAV (PCM) from scratch.

## GLB geometry

Models are built from primitive geometry (boxes, cylinders, spheres) with
explicit positions/normals/indices — y-up, right-handed, CCW front faces per
glTF. Each tower includes a `barrel` node at the origin, which is what the
manifest's `requiredNodes: ["barrel"]` requirement enforces on user uploads
and what [game.js](../template/game-view.md) rotates to aim.

## Regenerating

```sh
npm run art
git diff --stat public/templates/tower-defense/bundle/assets/
```

If the diff is non-empty, the script or its inputs changed — review before
committing, because the default art is part of the export surface (every
export embeds it unless the user replaces it).
