# Testing

Three stages, each proving what the previous one can't:

| Stage | Runs | Proves |
|---|---|---|
| **Unit (Node)** — `npm test` | `node --test` on `tests/*.test.js` | the shared contract, the export seam, and the pure rules engine — deterministically, headlessly |
| **E2E (browser)** — `npm run e2e` | Playwright, headless Chromium (SwiftShader WebGL) | that an exported Generated game **runs from `file://`** and displays the user's Options — plus the full creator loop |
| **CI** — [.github/workflows/ci.yml](ci.md) | all of the above on every PR and on `main` | that a green merge means a playable game (ADR 0004) |

## The seam principle

The suites assert **public behavior at the seams**, not implementation:

- The **contract** suite tests the validators, the base64 codec, reset, and
  summarize — the API [src/shared/contract.js](../contract/index.md) exposes.
- The **export** suite drives `buildBundle` end-to-end (Template → inputs →
  output bundle) and asserts on the *produced bundle*, not internals.
- The **td-core** suite drives `createGame` / `placeTower` / `startWave` /
  `update` with fixed `dt` steps and asserts on state and the event log.
- The **e2e** suite drives the real creator UI and the real exported bundle.

Because `buildBundle` and `td-core.js` are pure (no DOM, no network, no
`Math.random`, no `Date`), the same code that ships in the browser is what
the Node tests exercise.

## The smoke test

The project's definition of "it works" ([glossary](../glossary.md)):
run an exported Generated game — the bundle opened **directly in a browser,
no server** — and verify it runs and displays the user's Options. It has a
scripted form ([`scripts/smoke-export.mjs`](../getting-started.md#manual-smoke-test))
and an automated form (the e2e `smoke.spec.js`), and it's the gate CI uses
(ADR 0004).

## Suites

- [Unit suite (Node)](unit.md) — contract, export seam, gameplay rules.
- [E2E suite (Playwright)](e2e.md) — smoke test + creator end-to-end +
  per-surface (full/model/texture-color/reset/summary/play) coverage.
- [CI](ci.md) — the three jobs and what each gates.
