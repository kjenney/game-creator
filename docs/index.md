# game-creator

A web app that turns a genre **Template** plus user **Options** into a playable
**Generated game**, rendered in the browser with Babylon.js. Pick a game, make it
yours — new title, commander, colors, textures, 3D models — and export a
self-contained zip you can open in any browser. No account, no server.

The full product spec lives in the
[GitHub issue tracker](https://github.com/kjenney/game-creator/issues/1);
source-code comments reference it as "NOTES" (e.g. `NOTES §3`, decisions `D1`–`D10`,
user stories `US17`/`US18`/`US32`/`US33`).

## What this documentation covers

- [Getting started](getting-started.md) — run the creator locally, export a game,
  try the manual smoke test.
- [Architecture](architecture.md) — the two apps, the shared export seam, and the
  `file://` rules everything obeys.
- [Glossary](glossary.md) — the project's precise language (Template, Option,
  Generated game, Smoke test).
- [Creator app](creator/index.md) — module-by-module documentation of the
  authoring UI (`src/creator/*`).
- [Shared contract](contract/index.md) — the Option/asset contract
  (`src/shared/contract.js`) that both apps and every test run against.
- [Template anatomy](template/index.md) — the manifest schema and a full tour of
  the Tower Defense template, including its pure rules engine.
- [Authoring](authoring/index.md) — how to add a Template or an Option, and how
  the generated default art and vendored Babylon bundle are produced.
- [Testing](testing/index.md) — the three-stage strategy: Node unit suites,
  Playwright browser suites, and the CI gates.
- [ADRs](adr/index.md) — the project's architecture decision records.

## Repository at a glance

```
game-creator/
├── index.html                      # creator app shell (Vite entry)
├── src/
│   ├── creator/                    # the authoring UI (ES modules, Vite)
│   └── shared/contract.js          # THE shared Option/asset contract (UMD-lite)
├── public/templates/tower-defense/ # the Tower Defense Template
│   ├── manifest.json               #   Option slot declarations
│   └── bundle/                     #   the self-contained game (classic scripts)
├── scripts/                        # vendor build, default art, smoke export
├── tests/                          # Node unit suites (node --test)
├── e2e/                            # Playwright browser suites
├── .github/workflows/ci.yml        # CI: test / build+vendor drift / browser
└── docs/                           # this documentation (mkdocs)
```
