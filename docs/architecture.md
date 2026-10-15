# Architecture

game-creator is two applications that share one pure function.

1. **The creator app** — a static Vite web app (ES modules, `src/creator/*`)
   where the user picks a Template, customizes its Options, and exports a zip.
   It exists only at authoring time.
2. **The Generated game** — a self-contained copy of the Template bundle
   (`public/templates/<genre>/bundle/`) with the user's Option values
   injected. It runs from `file://` in a plain browser tab, with no creator,
   no server, no network.

Between them sits **the seam**: `buildBundle` in
[`src/shared/contract.js`](contract/index.md) — a pure, dependency-free
transform `(template, options, uploads) → output bundle`. The browser export
calls it; the Node test suites call it; the Playwright suites call it. One
code path for the transform everywhere.

```
                        creator app (authoring time)
   ┌────────────────────────────────────────────────────────────┐
   │ index.html → main.js                                       │
   │   registry.js  fetch templates/<id>/manifest.json          │
   │   form.js      render one field per declared Option slot   │
   │   collector.js form DOM → { options, files }               │
   │   summary.js   live pre-export review                      │
   │   export.js    fetch bundle bytes ──┐                       │
   └─────────────────────────────────────┼───────────────────────┘
                                         ▼
                    ┌─────────────────────────────────────┐
                    │  GameGC.buildBundle (the seam)      │
                    │  src/shared/contract.js (UMD-lite)  │
                    │  validate → embed → generate files   │
                    └───────────────┬─────────────────────┘
                                    ▼
                       zip: index.html + js/ + assets/
                    (Generated game — runs from file://)
```

## The `file://` rules

The exported bundle must open as a plain local file in any browser. That
constraint (NOTES §3) drives most of the design:

- **Classic scripts only** — no ES modules, no build step at export time.
  `index.html` loads nine `<script>` tags in a fixed order:
  vendor → contract → generated options → generated assets → asset loader →
  core → audio → game.
- **No external resources** — everything the game needs is in the zip.
- **Binary assets are never fetched by URL.** Every GLB/PNG/WAV is embedded
  as base64 in `window.GC_ASSETS` (decision D4) and loaded from bytes:
  models via a `data:` URL, textures via Babylon's buffer parameter, WAVs
  decoded straight from the embedded bytes.
- **Relative paths only** — the bundle works from any directory on any disk.

## Why a self-contained bundle per genre

ADR 0002 chose "parameterized self-contained app" over a shared data-driven
engine: one real, debuggable Babylon.js game per genre, with Options as a
thin **content-only** layer on top (ADR 0001). Genres don't share a runtime —
the cost is duplicated scaffolding, the benefit is that each game is designed
and tuned independently.

## Why there is no backend

ADR 0003: the only output is the exported zip. No hosted play, no saved
projects, no re-edit. Uploaded images live in the browser for the duration of
the session and are embedded into the export.

## How generation works

`buildBundle` is the single transform; see
[buildBundle](contract/build-bundle.md) for the full spec. In short:

1. Copy the Template's bundle files as the base.
2. Validate and inject the user's text/color values into
   `js/generated-options.js` (`window.GC_OPTIONS`).
3. Validate each uploaded asset, place it at the slot's `assetPath`, and embed
   it (plus **every** default binary asset) base64-encoded into
   `js/generated-assets.js` (`window.GC_ASSETS`).
4. Keep `js/gc-contract.js` verbatim so the game has the same helpers it was
   built against.

The game's own code (`td-core.js`, `game.js`, `assets.js`, `td-audio.js`) is
**identical** in every export — only the two generated files change. That's
what makes "customization" a content-injection step: the Template owns all
rules, balance, and behavior; Options only fill content slots
([template anatomy](template/index.md)).

## Key invariants

- **Content-only Options** (ADR 0001): a value never changes rules or balance;
  different gameplay means a different Template.
- **One source of truth per behavior** (US33): reset values, customized/default
  calls, and validation all live in the shared contract, never duplicated in
  the UI or the game.
- **Deterministic core**: `td-core.js` has no `Math.random`, no timestamps —
  the browser passes clamped real time, Node tests pass fixed steps, and the
  same input sequence always yields the same game.
- **The export is the artifact**: a Generated game exists only as the exported
  bundle (ADR 0003).

## Where each concern lives

| Concern | Lives in |
|---|---|
| Template list & manifest loading | [creator/registry.js](creator/registry.md) |
| Authoring form (data-driven from manifest) | [creator/form.js](creator/form.md) |
| Form → options/files | [creator/collector.js](creator/collector.md) |
| Pre-export summary | [creator/summary.js](creator/summary.md) |
| Export flow (fetch → seam → zip) | [creator/export.js](creator/export.md) |
| Option kinds, validation, reset, summarize, `buildBundle` | [contract](contract/index.md) |
| Rules, balance, state (pure) | [td-core.js](template/td-core.md) |
| Rendering, input, FX, HUD (Babylon) | [game.js](template/game-view.md) |
| Asset & audio loading from embedded bytes | [assets.js & td-audio.js](template/assets-audio.md) |
| CI gates | [CI](testing/ci.md) (ADR 0004) |
