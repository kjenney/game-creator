# main.js — creator bootstrap

`src/creator/main.js` wires the app together (NOTES §2): registry → template
list → manifest-driven form → export button. It holds the only app state:
`active = { template, manifest }` for the selected Template.

## Elements it drives

| DOM id | Role |
|---|---|
| `#template-list` | Container for the template cards |
| `#form` / `#form-section` / `#form-heading` | The customization form |
| `#summary` / `#summary-section` | The pre-export review |
| `#export-btn` / `#export-status` | Export action and status line |

## Functions

### `selectTemplate(t)`

1. `loadManifest(t)` — fetch the manifest (see [registry](registry.md)).
2. Mark the clicked card `.active`.
3. `renderForm($("form"), loaded.manifest.slots)` — one field per slot.
4. Unhide the form and summary sections, enable the export button with the
   Template's display name.
5. `renderSummary(...)` — initial state: every slot Default.
6. Clear any stale status.

Failures (e.g. a missing manifest) land in the status line as errors.

### `renderTemplateList()`

One `<button class="template-card" data-id=…>` per `TEMPLATES` entry. The name
is set via `textContent` (not innerHTML interpolation). Clicking routes through
`selectTemplate` with error reporting into the status line.

### Live summary (issue #11 / US18)

```js
$("form").addEventListener("input", refreshSummary);
```

Every `input` event on the form — including the synthetic one the Reset
control dispatches (see [form.js](form.md)) — re-renders the summary from the
current form. The summary and the export both call `GameGC.summarize` /
`GameGC.buildBundle` on the same `collect(formEl)` output, so "what the user
sees right before Export is exactly what the export will receive" (the same
`collect()` output, the same contract's `summarize` call).

### Export click handler

```
disable button → status "Building your game…"
  collect($("form"))
  exportBundle(active, collected)
  status "Done — check your downloads. Unzip, then open index.html in your browser."
```

- `ValidationError` (thrown by the contract, e.g. an oversized upload) is
  rendered as `That value won't work: <message>` — the contract's message
  already carries the slot id and the specific reason.
- Any other error is shown verbatim.
- The button re-enables in `finally`, so the app is never stuck mid-flight.
