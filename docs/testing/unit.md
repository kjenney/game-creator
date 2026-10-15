# Unit suite (Node)

`npm test` runs `node --test "tests/**/*.test.js"`. No browser, no build —
the suites import the shared contract and the Template's core logic directly,
plus a small helper to load a Template from disk.

## `tests/helpers.js`

`loadTemplate(name = "tower-defense")` reads
`public/templates/<name>/manifest.json` and every `bundleFiles` entry into
the exact shape `buildBundle` consumes — binary extensions as `Uint8Array`,
the rest as UTF-8 strings:

```js
{ manifest: manifest.slots, defaultAssets: manifest.defaultAssets, files: { [relPath]: … } }
```

This is the Node-side stand-in for the browser's fetches — same inputs, same
seam.

## Fixtures

- `tests/fixtures/glb/` — hand-built GLB payloads: `valid-tower.glb` (has a
  `barrel` node), `missing-node.glb`, `truncated.glb`, `bad.txt` (not a GLB).
- `tests/fixtures/textures/ground.png` — a real PNG for format checks.

## `contract.test.js` — the contract API

Tests the public behavior of [src/shared/contract.js](../contract/index.md):

- **base64** — `toBase64`/`fromBase64` round-trip arbitrary bytes; standard
  padding for 1- and 2-byte inputs; decode a known string. (Reference values
  cross-checked against `Buffer.toString("base64"`).)
- **text / color validators** — accept valid values; reject empty,
  whitespace-only, non-string, over-length (120), 3-digit, named, and
  malformed values — each with the slot id and a specific reason.
- **GLB reader** — parses the fixtures: valid tower, missing node, truncated.
- **`validateAsset(model3d)`** — accepts a conforming GLB; rejects a missing
  required node (node name in the reason), oversized, and non-GLB payloads.
- **`validateAsset(texture)`** — accepts PNG; rejects non-image bytes.
- **`resetValue`** — returns the game-original field value per kind; rejects
  a color slot with no manifest default, a malformed default, and an unknown
  kind.
- **`summarize`** — lists every manifest slot in order (all default on an
  empty form); marks text customized iff non-blank; color customized only
  when it differs from the default; binary customized iff a file was
  uploaded (showing the filename); counts across kinds; ignores unknown-slot
  entries; tolerates a missing `collected`; rejects an unknown kind.

## `export.test.js` — the export seam

Drives `GameGC.buildBundle` end-to-end and asserts on the **produced
bundle** (the [buildBundle](../contract/build-bundle.md) spec):

- **thin path** — title injected where the game reads it; `index.html` loads
  `js/generated-options.js`; no ES modules.
- **structure** — the required `index.html + js/ + assets` layout is present;
  default art + audio embedded in `GC_ASSETS` (loaded by bytes, never URL);
  scripts in the manifest's declared order.
- **defaults** — unspecified Options keep their defaults (empty
  `GC_OPTIONS`; Template art embedded).
- **rejection** — invalid text; an asset upload on a text slot; an unknown
  slot id — each with slot id + specific reason.
- **model3d** — a conforming GLB is accepted and placed at `assetPath`,
  replacing the default; each failing requirement (size, format, missing
  node) is rejected specifically.
- **accent + textures** — the accent is injected where the game reads it; an
  invalid accent is rejected; uploaded textures are placed at their
  `assetPath` with the uploaded bytes, embedded in place of the defaults;
  failing format/size is rejected.
- **full surface** — the manifest declares the full 11-slot surface; all 11
  values + assets produce a correct, self-contained bundle; each of the 6
  model slots rejects an invalid GLB with its own slot id + reason.
- **reset (issue #10)** — resetting a text/color/model/texture slot restores
  the game's original value; resetting the **whole surface** exports exactly
  what an untouched form would (byte-identical to no customization).

## `td-core.test.js` — the gameplay seam

Drives the [pure rules engine](../template/td-core.md) headlessly with fixed
`dt` steps (`1/60`), asserting on state and the accumulated event log:

- fresh game: fixed starting state (gold, base HP, 18 spots, idle);
- wave composition is fixed (grunts ramp; brutes join from wave 4);
- placement deducts gold, marks the spot, and throws specific errors
  (unknown spot/type, occupied, not enough gold, game over);
- killing an enemy pays its fixed bounty; a cleared wave pays the fixed
  bonus and returns to idle;
- targeting: a tower fires at the most-advanced enemy in range;
- cannon splash: enemies near the impact point all take the hit;
- frost slow: enemy speed is reduced while slowed, then restored;
- leaks damage the base; base at 0 HP loses the game;
- **autoplay**: a fixed build wins all 10 waves (winnable balance; win state
  reached);
- **determinism**: identical input sequences produce identical games.
