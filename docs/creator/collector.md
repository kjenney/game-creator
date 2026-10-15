# collector.js — form DOM → export input

`src/creator/collector.js` is the single reader of the form. It converts the
`.slot` DOM (written by [form.js](form.md)) into the exact shape the export
seam and the summary consume:

```js
collect(formEl) → { options: { [slotId]: string | null }, files: { [slotId]: File } }
```

## Normalization rules

| Kind | Field state | Collected value | Meaning |
|---|---|---|---|
| `text` / `color` | non-blank | the raw value (text is trimmed for the emptiness check) | user customized this slot |
| `text` / `color` | blank | `null` | keep the game's default |
| `texture` / `image2d` / `model3d` | file selected | the `File` | user uploaded an asset |
| `texture` / `image2d` / `model3d` | empty | *(absent from `files`)* | keep the game's default art |

The omission matters: `buildBundle` only injects values the user actually set,
so an untouched slot never appears in `GC_OPTIONS` and the Template's own
default art stays in `GC_ASSETS` — an exported game with no customizations is
byte-for-byte the Template's original state.

## Who calls it

- [main.js](main.md) on the Export click → `exportBundle(active, collected)`.
- [summary.js](summary.md) on every `input` event → `GameGC.summarize(manifest.slots, collect(formEl))`.

The same call, the same output: the pre-export review and the export can't
disagree about which slots are customized.
