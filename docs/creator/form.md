# form.js — the data-driven authoring form

`src/creator/form.js` renders the authoring form from a Template's Option
declarations — one `<div class="slot" data-slot=<id>>` per declared slot. It
is never hardcoded per Template (spec US4): the manifest's `slots` array is
the single source of truth for what the form contains and in what order.

## The DOM contract

Each slot renders as:

```html
<div class="slot" data-slot="game.title" data-kind="text">
  <label class="slot-label" for="slot-game-title">Game title</label>
  <input type="text" id="slot-game-title" maxlength="120"
         placeholder="Leave blank to keep the default">
  <button type="button" class="slot-reset" id="reset-game-title"
          title="Restore the game's original value">Reset</button>
  <p class="slot-requirements">Format: GLB · Required node(s): barrel · …</p>  <!-- binary slots -->
  <p class="slot-hint">Leave empty to keep the game's default art.</p>          <!-- binary slots -->
</div>
```

[collector.js](collector.md) reads values back by `data-slot`; e2e tests
locate fields the same way. Field ids are sanitized
(`slot-<id with non-alphanumerics → "-">`).

## Per-kind renderers

`RENDERERS = { text, color, texture, image2d, model3d }` — an unknown kind
throws `no form renderer for kind <kind> (slot <id>)` rather than silently
skipping a slot.

| Kind | Field | Notes |
|---|---|---|
| `text` | `<input type="text">` | `maxLength=120` (mirrors the contract's `validateText` limit); blank means "keep the default" |
| `color` | `<input type="color">` | Initialized to the slot's manifest `default` (the Template's own accent) |
| `texture` / `image2d` | `<input type="file">` | `accept="image/png,image/jpeg,image/webp"` |
| `model3d` | `<input type="file">` | `accept=".glb"` |

### Requirements line

`requirementsText(slot)` renders the slot's `requirements` object as a single
line: `Format: GLB · Required node(s): barrel · Pivot: origin · Scale: 1.0× ·
Max size: 2 MB`. The user sees the slot's compatibility contract before
uploading ([contract validation](../contract/options.md) enforces the same
rules at export with specific reasons).

## The Reset control (issue #10 / US17)

Every slot gets a **Reset** button that restores the field to *the game's
original value*. Per-kind WHAT that value is is not decided here — it's
`GameGC.resetValue(slot)` in the shared contract (US33: one source of truth):

- `text` → `""` (blank = keep the default)
- `color` → the manifest `default`
- binary → `null` (clears the file input → default art)

After setting the value, the button dispatches a bubbling `input` event. A
reset *is* a field change: this makes the live [summary](summary.md) update
exactly as it would for a user edit, and flips the slot's row back to
**Default**.
