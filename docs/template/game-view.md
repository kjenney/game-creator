# game.js — the view layer

`bundle/js/game.js` is the tower-defense game's view + UI + render loop (T4):
a **skin on `td-core.js` (GCTD)**. It reads core state, draws entities from
`GC_ASSETS` bytes, plays fixed audio, and wires the HUD/palette. ADR 0001 —
the models are content; the rules, hitboxes, and balance live in
[td-core.js](td-core.md).

Classic script, no modules, no external resources (the `file://` rules). The
Babylon v9 APIs used are verified against the vendored bundle — notably there
is no `camera.getRay` in this build, so picking is hand-unprojected.

## Applying Options (content only)

```js
var options = window.GC_OPTIONS || {};
var title = options["game.title"] || "Tower Defense";   // → document.title + #gc-title
var commander = options["game.commander"] || "";        // → "Commander: …" in the overlay
var accent = options["theme.accent"];                   // → documentElement style --gc-accent
```

The accent feeds the CSS custom property `--gc-accent` that `index.html`'s
stylesheet uses for title underline, HUD numbers, selected card, and buttons.
Binary Options arrive as bytes in `GC_ASSETS` at their `assetPath` (see
[assets.js](assets-audio.md)).

## Engine, camera, lights

- `BABYLON.Engine` + `Scene` on `#gc-canvas`; `GCAssets.setScene(scene)`.
- `ArcRotateCamera` in a 3/4 view over the lanes; orbit/zoom constrained
  (radius 12–45, beta 0.55–1.45, alpha ±0.4 rad); panning disabled.
- Hemispheric + directional lights.

## Fixed structural geometry

Drawn from `GCTD` constants so the view can't drift from the rules:

- Ground plane with the ground texture (`GCAssets.loadTexture`).
- Skybox as the scene environment texture (IBL).
- One lane strip per `GCTD.LANE_Z`.
- One disc per `GCTD.SPOTS` entry — the build-spot markers (the hitboxes).
- Shared hover disc + range disc, moved per frame.

## Entity views

All views are keyed by core-state ids and synced each frame by `syncView()`:

- **Towers** — `towerViews[towerId] = { root, barrel }`. The model loads from
  `GC_ASSETS`; the `barrel` node (when present) is rotated to the tower's
  `aim` each frame. A missing `barrel` is fine — the tower still works.
- **Enemies** — `enemyViews[enemyId] = { root, baseY, barY, hpBg, hpFg, … }`.
  A colored sphere placeholder makes the enemy visible the instant it spawns,
  even if the GLB is still loading or fails — the game never stops for art.
  The HP bar shows only while damaged.
- **Projectiles** — spheres styled per tower type (size/color/arc); the arc
  height is estimated from the first-tick distance to the target and rendered
  as `y = 0.4 + sin(progress·π) × arc`.
- **FX** — puffs and impact rings (`spawnFx`), capped at 40 live so a burst
  can never stall a frame.

## Input

- **Tower selection**: palette card click or keys **1/2/3**; **Esc** cancels.
- **Placement**: `pointerdown`/`pointerup` — a pointer that moved > 8px is a
  camera drag, not a click. A click unprojects to the y=0 plane and finds the
  nearest spot within 1.4 units, then calls `GCTD.placeTower` — errors (no
  spot, occupied, not enough gold) surface as toasts.
- **`groundPoint`**: hand-unprojection — `BABYLON.Vector3.Unproject` at depth
  0 and 1, then ray/line-plane intersection (this build has no `getRay`).
- **Hover**: `pointermove` tracks the nearest spot; the hover disc turns green
  (affordable + free) or red, and the range disc shows the tower's range.
- **Start wave**: the **Start** button or **Space** (idle only) →
  `GCTD.startWave`.

## Event handling

`handleEvent(ev)` maps the [core event log](td-core.md#event-log) to sounds
(`GCAudio.play`), FX, toasts, HUD/refresh, and the end overlay. The end panel
uses the commander Option: `Victory, <name>!` / `The castle has fallen`.
**Play again** reloads the page (the bundle is immutable — replay is a fresh
instance).

## Render loop

```js
engine.runRenderLoop(function () {
  var dt = Math.min(engine.getDeltaTime() / 1000, 0.1); // clamp tab-switch jumps
  GCTD.update(game, dt);   // advance the core
  syncView();              // core state → views
  updateFx(dt);            // FX aging
  updateHover();           // hover/range discs
  drain game.events → handleEvent(…)
  scene.render();
  window.__GC_RENDER_OK = true;
});
```

## E2E hooks

The exported bundle is driven through global hooks (not page-specific DOM
selectors where avoidable):

- `window.__GC_ENGINE`, `window.__GC_SCENE` — engine/scene liveness (smoke test).
- `window.__GC_RENDER_OK` — set each successful frame (first-frame proof under SwiftShader).
- `window.__GC_TD.game` — the live core state.
- `window.__GC_TD.screenPos(spotIndex)` — a build spot projected to CSS pixels (for `page.mouse.click`).
- `window.__GC_TD.place(spotIndex, type)` — placement through the real API.
