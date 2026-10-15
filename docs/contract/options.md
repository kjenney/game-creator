# Option slots & validation

## Slot kinds

Five kinds exist; three take a value, two take a file upload:

| Kind | Takes | `BINARY_KINDS` |
|---|---|---|
| `text` | a string | no |
| `color` | a hex string | no |
| `texture` | an image file | yes |
| `image2d` | an image file | yes |
| `model3d` | a `.glb` file | yes |

A slot declaration (in a manifest) looks like:

```json
{
  "id": "tower.arrow.model",
  "label": "Arrow tower model",
  "kind": "model3d",
  "requirements": {
    "format": "glb",
    "requiredNodes": ["barrel"],
    "pivot": "origin",
    "targetScale": 1.0,
    "maxBytes": 2097152
  },
  "assetPath": "assets/models/tower_arrow.glb"
}
```

- `id` — stable, namespaced key read by the game from `GC_OPTIONS` / matched
  in `GC_ASSETS` uploads.
- `label` — human text in the form and summary.
- `requirements` — the slot's compatibility contract. `maxBytes` is enforced;
  the rest are documented to the user and, for models, `requiredNodes` is
  enforced. `pivot` / `targetScale` describe how the game will place the model.
- `assetPath` — where the upload (and the Template's default) lives in the
  bundle's `assets/` tree.
- `default` — color slots carry the game's original accent; it's the Reset
  target and the "customized" comparison baseline.

## Validation

All validators throw `ValidationError` — an `Error` with `name =
"ValidationError"`, `slotId`, and `reason` — carrying the specific reason so
the creator can display it:

- **`validateText(slot, value)`** — must be a non-blank string; max 120
  characters. (The form's `maxLength=120` mirrors this; the contract is the
  enforcement.)
- **`validateColor(slot, value)`** — must match `^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`
  — `#rrggbb` or `#rrggbbaa`. 3-digit and named colors are rejected.
- **`validateAsset(slot, bytes)`** — order is deliberate:
  **size → format → required nodes**.
  - `model3d`: `maxBytes` check, then GLB parse, then required-node check.
    A GLB is accepted if the required node appears in `nodes` *or* `meshes`
    (lenient — some tools name the mesh instead of the node).
  - `texture` / `image2d`: `maxBytes` (default 8 MB if the slot doesn't set
    one), then magic-byte check: PNG (`89 50`), JPEG (`FF D8`), or WebP
    (`RIFF……WEBP`).

### GLB reader (`readGlb`)

Hand-rolled against the Khronos binary glTF layout (D5) — no glTF library in
shared code. Checks:

1. ≥ 12 bytes,
2. magic `0x46546C67` ("glTF"),
3. version `2`,
4. `totalLength` matches the payload,
5. walks chunks to the JSON chunk (`0x4E4F534A`) and parses it — skipping BIN
   chunks — so validation needs only the JSON, not the binary buffers.

Returns `{ json }` or `{ error: "reason" }`; the reasons ("not a GLB (bad
magic)", "GLB has no JSON chunk", …) surface verbatim to the user.

## `resetValue(slot)` — restoring the game's original (US17)

Returns the field value that, through the collector's normalization plus
`buildBundle`, reproduces the Template's original state:

| Kind | Reset value | Why it restores the original |
|---|---|---|
| `text` | `""` | blank → collector omits it → default text stays |
| `color` | `slot.default` | the manifest's own accent; throws if the slot has no default (no well-defined original) |
| binary | `null` | no file → collector omits it → default art stays embedded |

A malformed color default or an unknown kind throws `ValidationError` — a
reset with no defined original is a bug worth surfacing.

## `summarize(manifest, collected)` — customized vs default (US18)

Input is exactly what the collector hands the export:

```js
{ options: { [slotId]: string | null }, files: { [slotId]: { name } } }
```

Output:

```js
{
  slots: [ { id, label, kind, status: "customized" | "default", value: string | null } ],
  customized: number,
  total: number
}
```

- One row per manifest slot, in manifest order (the form's order).
- `text`: customized iff a non-blank value was set; `value` is the text.
- `color`: customized iff it differs from the manifest default
  (case-insensitive hex); a slot with *no* default is customized for any
  value; `value` is the hex.
- binary: customized iff a file was uploaded; `value` is the filename.
- Entries in `collected` for unknown slots are ignored; an unknown *slot*
  kind throws.

Because the summary and the export both consume the same `collect()` output
through the same contract, the review the user confirms cannot drift from
what `buildBundle` does with it.
