# E2E suite (Playwright)

`npm run e2e` runs the browser stage: headless Chromium validates what the
Node suite can't — that an exported Generated game **actually runs from
`file://`** and displays the user's Options (the spec's manual smoke test,
automated), plus the full creator loop end-to-end.

## `playwright.config.js`

```js
testDir: "./e2e",
timeout: 60_000,
expect: { timeout: 15_000 },   // render-hook waits (SwiftShader first frame)
retries: 0,                    // v1: no retry logic (ADR 0004)
use: { headless: true, baseURL: "http://localhost:4173/" },
webServer: { command: "npm run preview", url: "http://localhost:4173/",
              reuseExistingServer: !process.env.CI, timeout: 30_000 }
```

The creator app under test is the **production build** (`dist/`) served by
`vite preview` — like a real deploy. The exported game under test is opened
at `file://`, no server.

## `e2e/helpers.js`

Three shared pieces (the [smoke test](../glossary.md) lives here):

- **`buildBundleDir(options)`** — builds a bundle via the export seam (the
  same transform the browser export uses) and writes it to a fresh temp dir —
  the shape a user would unzip.
- **`exportViaUI(page)`** — drives the **real** creator UI: clicks Export,
  captures the zip download, unzips it Node-side into a fresh dir — the exact
  bundle a user gets after unzipping.
- **`assertSmoke(page, dir, options)`** — the smoke test proper:
  - no page errors / console errors during the run,
  - engine + scene are live (`window.__GC_ENGINE` / `__GC_SCENE`),
  - **first frame rendered** (`window.__GC_RENDER_OK === true` — WebGL under SwiftShader),
  - the user's Options are displayed (`#gc-title`, `#gc-commander`).

`SMOKE_TITLE` / `SMOKE_COMMANDER` ("Ken's CI Game" / "Ken") are the canonical
customization used across the suites.

## Spec files

| Spec | Covers |
|---|---|
| `smoke.spec.js` | **the smoke test**: exported bundle runs from `file://` and displays the user's Options |
| `creator-e2e.spec.js` | the full creator loop: pick Template → set title → export → **and the export runs** (end-to-end) |
| `play.spec.js` | gameplay through the UI: a wave runs, a tower is placed via the palette, the economy responds |
| `full-surface.spec.js` | the form renders **all 11 Option slots** (2 text, 6 model, 2 texture, 1 color); a fully-customized export — every customization visible in the game, and it still plays |
| `model-slot.spec.js` | the form renders each model slot with a GLB input + the slot's requirements; a conforming GLB is accepted and loaded in place of the default; a GLB failing each requirement is rejected in the form with the specific reason |
| `texture-color.spec.js` | the form renders the accent picker + skybox/ground inputs; the chosen accent + uploaded texture are exported and reflected in the game; failing format/size is rejected specifically |
| `reset.spec.js` | every slot renders a Reset control; resetting each kind restores the field to the game's original value; fully-customized → reset everything → the export is identical to an untouched form's (issue #10) |
| `summary.spec.js` | the summary is hidden until a Template is picked, then lists every slot as Default; updates live as the form changes; a reset flips the row back to Default; **AC: what the summary says is exactly what the export produces** |

## What this stage proves (and can't)

- Proves: the `file://` runtime works end-to-end (ADR 0002's central risk),
  the exported bundle is playable, and the creator's review matches its
  artifact.
- Can't: SwiftShader ≠ a real GPU. A manual real-browser spot-check remains
  for anything graphics-sensitive (ADR 0004).
