# Getting started

## Prerequisites

- **Node.js ≥ 22** (`package.json` `engines`; CI runs Node 24)
- npm

## Install

```sh
npm install
```

## Run the creator

```sh
npm run dev
```

Vite serves the creator at <http://localhost:5173/>. The Template manifests and
bundles under `public/templates/` are served from the same origin — that's how
the creator loads them in dev (see [Architecture](architecture.md)).

## Export a game from the browser

1. Pick the **Tower Defense** template.
2. Customize any slots (title, commander, colors, textures, models) — or none.
3. Click **Export my Tower Defense…**.
4. A `tower-defense.zip` downloads. Unzip it and open `index.html` **directly in
   your browser** (double-click — no server needed). That's the Generated game.

## Manual smoke test

The [smoke test](glossary.md) has a scripted form:

```sh
node scripts/smoke-export.mjs [outdir] ["title"] ["commander"]
# defaults: /tmp/gc-smoke-export  "Ken's Smoke Game"  "Ken"
```

It runs the real export seam (`buildBundle`) and writes the bundle to a
directory. Open `<outdir>/index.html` in a browser: the game must run and show
your title/commander.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server for the creator app |
| `npm run build` | Production build of the creator into `dist/` |
| `npm test` | Node unit suites: contract, export seam, gameplay rules |
| `npm run e2e` | Playwright browser suites (Chromium; needs `npx playwright install chromium`) |
| `npm run preview` | Serve the production build (used by the e2e webServer) |
| `npm run vendor` | Rebuild the vendored Babylon bundle from `package.json` |
| `npm run art` | Regenerate the Tower Defense default art (GLB/PNG/WAV) |

## Repository layout

```
index.html                     creator app shell (Vite entry, module script)
src/creator/                   authoring UI (ES modules) — see Creator app
src/shared/contract.js         the shared Option/asset contract (UMD-lite)
src/styles.css                 creator app styles
public/templates/tower-defense/  the one Template v1 ships
  manifest.json                Option slot declarations
  bundle/                      self-contained game: index.html + js/ + assets/
scripts/build-vendor.mjs       esbuild the Babylon vendor bundle (committed)
scripts/vendor-entry.mjs       vendor entry: core + glTF loader
scripts/make-default-art.mjs   deterministic default art generator
scripts/smoke-export.mjs       write a real export for the manual smoke test
tests/                         Node unit suites (node --test) + fixtures
e2e/                           Playwright suites + shared helpers
.github/workflows/ci.yml       CI: test / build (+ vendor drift) / browser
docs/                          this documentation (mkdocs)
```
