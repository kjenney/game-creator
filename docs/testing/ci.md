# CI

`.github/workflows/ci.yml` runs three independent checks on every PR and on
`main` (ADR 0004): the Node export-seam suite, the creator build (+ committed
vendor drift), and the browser stage that runs an exported Generated game in
headless Chromium end-to-end.

```
on: pull_request | push: main
jobs:
  test      → npm ci && npm test
  build     → npm ci && npm run build
              + vendor drift check
  browser   → npm ci && playwright install chromium
              && npm run build
              && npx playwright test
              + upload the exported-game artifact
```

All jobs use Node 24 with npm caching.

## `test` — the Node suites

`npm test` — the [contract, export-seam, and gameplay
suites](unit.md). Fast, deterministic, no browser.

## `build` — creator build + vendor drift

1. `npm run build` — the production creator build (`dist/`).
2. **Vendor drift check** (the [committed Babylon
   bundle](../authoring/vendor.md) must match `package.json`):

   ```sh
   npm run vendor
   git diff --exit-code -- public/templates/tower-defense/bundle/js/vendor/babylon.js
   ```

   A Babylon version bump that skipped `npm run vendor` fails the build —
   the export can never ship a stale vendor.

## `browser` — the automated smoke test (ADR 0004)

1. `npx playwright install --with-deps chromium` — headless Chromium with
   SwiftShader WebGL.
2. `npm run build` — the creator app served by `vite preview`.
3. `npx playwright test` — the [e2e
   suites](e2e.md), including the smoke test and the full creator loop.
4. **Artifact**: the exported game zip from the end-to-end run is uploaded as
   `exported-game` (`if: always()`, `if-no-files-found: warn`) — a green run
   leaves a playable artifact to inspect.

## Why the browser stage gates merges

The spec named the Babylon smoke test as *manual*. ADR 0004 decided CI may
gate on an automated version, because the `file://` runtime is the project's
central risk and "the export runs from `file://` and displays the title" was
the one thing no other check could prove. The first run of this pipeline
caught a real defect a manual pass had missed — `game.js` threw
(`barrelMat` undeclared) *after* the title was painted, so the canvas never
rendered a frame. **A green merge should mean a playable game, not a titled
blank canvas.**

Known trade-off (ADR 0004): CI now carries a browser dependency, and
SwiftShader ≠ a real GPU — a manual real-browser spot-check remains for
anything graphics-sensitive. `retries: 0` deliberately; add retry logic only
if CI flakiness proves necessary.
