# summary.js — the pre-export review

`src/creator/summary.js` is the review panel (issue #11 / US18): before the
download, the user sees **every** slot of the active Template marked
**Customized** (with the value that will be exported) or **Default**, so they
can confirm they set everything they intended.

## Data-driven, same source as the export

`renderSummary(container, manifest, formEl)` computes the rows as:

```js
GameGC.summarize(manifest.slots, collect(formEl))
```

- One row per manifest slot, in manifest order (the form's order) — never
  hardcoded (US32).
- The customized/default call per kind is the shared contract's `summarize`
  (US33): text is customized iff a non-blank value was set; color iff it
  differs from the manifest default (case-insensitive hex); binary iff a file
  was uploaded.
- The input is the **same `collect()` output the export consumes** — what the
  user confirms here is what ships.

## Rendering

- A count line: `N of M slots customized — the rest keep the game's original
  values.`, or `No customizations yet — the exported game will be the
  Template as-is.`
- One `<li class="summary-row customized|default" data-slot data-status>` per
  slot with:
  - the slot label,
  - a **Customized**/**Default** badge,
  - the value — the text, the hex, or the uploaded filename; for `color`,
    the swatch color is set via the `--swatch` CSS variable next to the hex.
  - Default rows read `the game's original`.

## Live updates

[main.js](main.md) re-renders this panel on every `input` event from the form
(including the synthetic one the Reset control dispatches — see
[form.js](form.md)). So typing, uploading, and resetting all flip rows
instantly, which the e2e suite asserts (see `summary.spec.js` in
[testing/e2e.md](../testing/e2e.md)).
