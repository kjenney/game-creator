# Shared contract

`src/shared/contract.js` is the shared Option/asset contract (NOTES §4):
every rule that must hold whether the code runs in the creator's browser, in
Node tests, or inside the exported game. It is the project's single source of
truth for what an Option may be, what a valid upload is, what "reset" means,
and how a bundle is built.

## One file, three contexts (UMD-lite)

```js
(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object")
    module.exports = factory();                    // Node tests, Vite
  else
    Object.assign(global.GameGC = global.GameGC || {}, factory());  // file:// classic script
})(typeof self !== "undefined" ? self : this, function () { … });
```

- **Creator app**: imported as an ES module (`import GameGC from
  "../shared/contract.js"`) — the CJS branch.
- **Node tests**: `import` of the same file — CJS default interop (NOTES D7).
- **Exported game**: shipped *verbatim* as
  `bundle/js/gc-contract.js`; the classic-script branch merges the API onto
  `global.GameGC`.

Zero dependencies, no transpile (D3): it uses `atob`/`TextDecoder`/`DataView`
— all available in both a `file://` classic-script page and Node — and a
hand-rolled base64 codec so no `btoa`/`Buffer` is required.

## API surface

| Member | Purpose | Documented in |
|---|---|---|
| `KINDS` / `BINARY_KINDS` | The five Option kinds; which of them take files | [Option slots](options.md) |
| `ValidationError` | Error with `slotId` + specific `reason` | [Option slots](options.md) |
| `toBase64` / `fromBase64` | Portable `Uint8Array` ↔ base64 (no btoa/Buffer) | [Option slots](options.md) |
| `validateText(slot, value)` | Non-blank string, ≤ 120 chars | [Option slots](options.md) |
| `validateColor(slot, value)` | `#rrggbb` or `#rrggbbaa` | [Option slots](options.md) |
| `validateAsset(slot, bytes)` | Size → format → required nodes | [Option slots](options.md) |
| `readGlb(bytes)` | Hand-rolled GLB parser (magic, version, JSON chunk) | [Option slots](options.md) |
| `resetValue(slot)` | The field value that restores the game's original state (US17) | [Option slots](options.md) |
| `summarize(manifest, collected)` | Customized/Default per slot, for the pre-export review (US18) | [Option slots](options.md) |
| `buildBundle(template, inputs)` | **The pure export transform** — the automated seam (D8) | [buildBundle](build-bundle.md) |

## Design rules

- **Content-only**: the contract only moves *content* — text, colors,
  images, models — into slots a Template declares (ADR 0001). It never
  touches rules or balance.
- **One source of truth** (US33): the form's Reset, the summary's
  customized/Default badges, and the export's validation all call the same
  functions, so the UI can't drift from the artifact.
- **Specific errors**: every rejection is a `ValidationError` carrying the
  slot id and the exact reason (e.g. `missing required node "barrel"`), so
  the creator can tell the user *what* is wrong and *where*.
