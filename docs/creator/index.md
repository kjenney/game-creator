# Creator app

The creator is the authoring-time app: pick a Template, customize its Options,
export a zip. It's a static Vite app — `index.html` loads
`/src/creator/main.js` as an ES module — and it is **data-driven**: every
screen is rendered from the Template's `manifest.json`, never hardcoded (spec
US4). There is one renderer per Option kind, so a new slot kind costs one
small renderer, not a new form.

## Module map

| Module | Responsibility |
|---|---|
| [main.js](main.md) | Bootstrap: template list → manifest-driven form → summary → export button; status line |
| [registry.js](registry.md) | The Template list and manifest loading |
| [form.js](form.md) | Renders one field per declared slot, with a Reset control each |
| [collector.js](collector.md) | Reads the form DOM back into `{ options, files }` |
| [export.js](export.md) | Fetches the bundle, runs the shared `buildBundle` seam, downloads a zip |
| [summary.js](summary.md) | Live pre-export review: which slots are Customized vs Default |

The DOM contract between modules is the `.slot` element: `form.js` writes
`data-slot` / `data-kind` attributes and one `<input>` per slot; `collector.js`
reads exactly that back. Nothing else crosses module boundaries except the
`{ options, files }` object and the `GameGC` contract API.

## User flow

1. `renderTemplateList()` builds a card per entry in `TEMPLATES`.
2. Clicking a card fetches the manifest, renders the form and the summary, and
   enables **Export my …**.
3. Every form edit re-renders the summary live (issue #11 / US18): what the
   user confirms is computed from the same `collect()` output the export
   consumes — the review can't drift from what ships.
4. **Export** runs the shared seam and downloads `<template-id>.zip`.
   `ValidationError`s surface as "That value won't work: …".

## Files

- `index.html` — app shell: header, template list, form, summary, export
  section, status line (`role="status"`).
- `src/styles.css` — creator styles (cards, slots, summary rows, badges).
