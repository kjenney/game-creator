# Template anatomy

A **Template** (one per genre) is a complete, self-contained game plus a
declaration of the Options it accepts (ADR 0002). v1 ships exactly one:
[Tower Defense](tower-defense.md).

## Directory layout

```
public/templates/<id>/
├── manifest.json            # name, slots, defaultAssets, bundleFiles
└── bundle/                  # the self-contained game — the export's base
    ├── index.html           #   shell: canvas, HUD, palette, end overlay
    ├── js/
    │   ├── vendor/babylon.js      # vendored Babylon (committed, D2)
    │   ├── gc-contract.js         # copy of src/shared/contract.js (verbatim)
    │   ├── generated-options.js   # placeholder — buildBundle replaces it
    │   ├── generated-assets.js    # placeholder — buildBundle replaces it
    │   ├── assets.js              # GCAssets: embedded-bytes → Babylon loader
    │   ├── td-core.js             # the rules: PURE, no Babylon/DOM
    │   ├── td-audio.js            # GCAudio: Web Audio from embedded WAVs
    │   └── game.js                # the view: scene, input, FX, HUD
    └── assets/
        ├── models/*.glb           # default models (script-generated)
        ├── textures/*.png         # ground + skybox
        └── audio/*.wav            # 10 synthesized sounds
```

The `bundle/` tree is what the user unzips and runs — the export is this tree
with the two `generated-*.js` placeholders replaced and any uploaded assets
swapped in.

## `manifest.json` schema

```jsonc
{
  "name": "Tower Defense",          // display name
  "version": "0.2.0",

  "slots": [                        // the Option surface — the form renders this
    {
      "id": "tower.arrow.model",    // stable key the game reads
      "label": "Arrow tower model", // human text
      "kind": "model3d",            // text | color | texture | image2d | model3d
      "requirements": {             // compatibility contract (shown in the form)
        "format": "glb",
        "requiredNodes": ["barrel"],
        "pivot": "origin",
        "targetScale": 1.0,
        "maxBytes": 2097152
      },
      "assetPath": "assets/models/tower_arrow.glb"
      // color slots instead carry "default": "#e8a33d"
    }
  ],

  "defaultAssets": [                // binary assets embedded in every export
    "assets/models/tower_arrow.glb",
    "assets/audio/place.wav",       // (audio has no Option slot — it's fixed content)
    "…                              // every GLB/PNG/WAV the game loads by bytes
  ],

  "bundleFiles": [                  // the complete export file list, in
    "index.html",                   // buildBundle's fetch order
    "js/vendor/babylon.js",
    "…"
  ]
}
```

Key relationships:

- **`slots`** is the *only* place Options are declared; the creator form and
  summary are generated from it. Adding a slot here is adding an Option.
- **`defaultAssets`** enumerates every binary asset the game loads from
  `GC_ASSETS` (the `file://` rule D4). It must include assets that have no
  slot (audio) *and* each binary slot's default file.
- **`bundleFiles`** is the complete list of files the export fetches and
  ships — it defines the bundle's surface for both the browser export and the
  Node-side loaders.

## The in-game Option read path

The game reads Options at load, in `game.js`, and nowhere else:

```js
var options = window.GC_OPTIONS || {};
var title = options["game.title"] || "Tower Defense";
var commander = options["game.commander"] || "";
var accent = options["theme.accent"];   // → sets --gc-accent CSS variable
```

Binary slots are read by `assets.js` / `td-audio.js` from `GC_ASSETS` at the
slot's `assetPath`. Because the defaults are always embedded (step 4 of
[buildBundle](../contract/build-bundle.md)), a missing customization simply
falls back to the game's original art.

## Adding a new Template

1. **Build the bundle**: a self-contained game under
   `public/templates/<id>/bundle/` obeying the [`file://` rules](../architecture.md#the-file-rules)
   — classic scripts, relative paths, binary assets embedded.
2. **Copy the contract**: `src/shared/contract.js` → `bundle/js/gc-contract.js`
   (kept verbatim by `buildBundle`).
3. **Declare the surface**: `manifest.json` with `slots`, `defaultAssets`,
   `bundleFiles`.
4. **Register it**: one entry in [creator/registry.js](../creator/registry.md).
5. **Keep the copies in lockstep**: `gc-contract.js` and
   `src/shared/contract.js` must stay identical (the game and the tests run
   the same code).
6. **Cover it**: the test suites assert the manifest's declared surface —
   full-slot-surface exports, per-slot rejection, reset-to-original.

See [Authoring](../authoring/index.md) for the authoring workflow.
