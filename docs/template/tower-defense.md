# Tower Defense — the v1 Template

A lane-based tower defense: hold 10 waves of grunts and brutes across three
lanes with three tower types. The rules and balance live entirely in
[td-core.js](td-core.md); the 3D view, input, and audio live in
[game.js](game-view.md), [assets.js](assets-audio.md), and [td-audio.js](assets-audio.md).

## The Option surface (11 slots)

Declared in `public/templates/tower-defense/manifest.json` and rendered
one-to-one by the creator form:

| Slot id | Label | Kind | Requirements | `assetPath` |
|---|---|---|---|---|
| `game.title` | Game title | `text` | ≤ 120 chars | — |
| `game.commander` | Commander name | `text` | ≤ 120 chars | — |
| `tower.arrow.model` | Arrow tower model | `model3d` | GLB, node `barrel`, ≤ 2 MB | `assets/models/tower_arrow.glb` |
| `tower.cannon.model` | Cannon tower model | `model3d` | GLB, node `barrel`, ≤ 2 MB | `assets/models/tower_cannon.glb` |
| `tower.frost.model` | Frost tower model | `model3d` | GLB, node `barrel`, ≤ 2 MB | `assets/models/tower_frost.glb` |
| `enemy.grunt.model` | Grunt enemy model | `model3d` | GLB, ≤ 2 MB | `assets/models/enemy_grunt.glb` |
| `enemy.brute.model` | Brute enemy model | `model3d` | GLB, ≤ 2 MB | `assets/models/enemy_brute.glb` |
| `base.castle.model` | Base castle model | `model3d` | GLB, ≤ 2 MB | `assets/models/base_castle.glb` |
| `skybox.texture` | Skybox / background | `texture` | PNG/JPEG/WebP, ≤ 8 MB | `assets/textures/skybox.png` |
| `ground.texture` | Ground texture | `texture` | PNG/JPEG/WebP, ≤ 8 MB | `assets/textures/ground.png` |
| `theme.accent` | Accent / UI color | `color` | `#rrggbb[/aa]`, default `#e8a33d` | — |

All model slots declare `pivot: origin`, `targetScale: 1.0` — the game places
your model at the build spot's origin at its authored scale. Tower slots
require a `barrel` node: the view rotates it to aim; a model without one still
works, it just doesn't aim (content/behavior decoupling, ADR 0001).

### Fixed content (not Options)

Per ADR 0001, these are the Template's own content, not user-customizable:
the ten audio files (`place`, `shoot_arrow`, `shoot_cannon`, `shoot_frost`,
`hit`, `kill`, `leak`, `wave`, `win`, `lose`), all gameplay numbers, and the
tower/enemy set. They're embedded in every export via `defaultAssets`.

## How it plays

- **Goal**: repel all 10 waves. The base has 20 HP; every enemy that reaches
  the end leaks damage (grunts 1, brutes 3).
- **Economy**: start with 200 gold. Kills pay bounties (grunt 8, brute 20);
  clearing a wave pays a bonus (`15 + 5×wave`).
- **Towers**:
  - **Arrow** — 50g, fast, single target (6 dmg / 0.5s).
  - **Cannon** — 100g, slow, splash damage (14 dmg in a 2.0 radius / 1.2s).
  - **Frost** — 75g, slows enemies 45% for 2s (3 dmg / 0.8s).
- **Waves**: grunts ramp every wave (`4 + 2×wave`); brutes join from wave 4.
- **Controls**:
  - Click a tower card (or press **1**/**2**/**3**) to arm a tower type, then
    click a marked build spot. **Esc** cancels.
  - **Space** starts the next wave when idle.
  - Drag to orbit the camera (constrained); wheel to zoom.
- **HUD**: gold, wave `n/10`, base HP (warns under a quarter).

## Files

| File | Role |
|---|---|
| `manifest.json` | Option surface, default assets, bundle file list |
| `bundle/index.html` | DOM shell: canvas, HUD, palette, toasts, end overlay, error bar; fixed script order |
| `bundle/js/gc-contract.js` | The shared contract, verbatim (see [Shared contract](../contract/index.md)) |
| `bundle/js/generated-options.js` | Placeholder → `window.GC_OPTIONS` |
| `bundle/js/generated-assets.js` | Placeholder → `window.GC_ASSETS` (base64) |
| `bundle/js/assets.js` | `GCAssets` — embedded bytes → Babylon models/textures |
| `bundle/js/td-core.js` | Pure game logic (state, rules, balance, events) |
| `bundle/js/td-audio.js` | `GCAudio` — Web Audio playback of the embedded WAVs |
| `bundle/js/game.js` | View layer: scene, camera, picking, FX, HUD wiring |
| `bundle/js/vendor/babylon.js` | Vendored Babylon + glTF loader (esbuild IIFE, committed) |
