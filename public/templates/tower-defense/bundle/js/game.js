// game.js — the tower-defense game: view + UI + render loop (T4).
// A skin on td-core (GCTD): reads core state, draws entities from GC_ASSETS
// bytes, plays fixed audio, wires the HUD/palette. ADR 0001 — the models are
// content; the rules, hitboxes and balance live in td-core.js.
//
// file:// rules (NOTES §3): classic script, no modules, no external resources.
// Babylon v9 APIs used here are verified against the vendored bundle
// (LoadAssetContainerAsync → AssetContainer.createRootMesh; no getRay/
// Project in this build, so picking + screenPos are hand-unprojected).
(function () {
  "use strict";

  // ---- Options (content only — ADR 0001; slots per the manifest) ----
  var options = window.GC_OPTIONS || {};
  var title = options["game.title"] || "Tower Defense";
  var commander = options["game.commander"] || "";
  document.title = title;
  var titleEl = document.getElementById("gc-title");
  if (titleEl) titleEl.textContent = title;
  if (commander) {
    var cmdEl = document.getElementById("gc-commander");
    if (cmdEl) cmdEl.textContent = "Commander: " + commander;
  }

  function $(id) { return document.getElementById(id); }

  function fail(msg) {
    var el = $("gc-error");
    if (el) { el.textContent = msg; el.style.display = "block"; }
    console.error(msg);
  }

  // ---- engine + scene ----
  var canvas = $("gc-canvas");
  var engine = new BABYLON.Engine(canvas, true);
  var scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.1, 1);
  GCAssets.setScene(scene);
  window.__GC_ENGINE = engine;
  window.__GC_SCENE = scene;

  // 3/4 view over the lanes; the player may orbit/zoom within limits
  var camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, 1.02, 26, new BABYLON.Vector3(10, 1, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 12;
  camera.upperRadiusLimit = 45;
  camera.lowerBetaLimit = 0.55;
  camera.upperBetaLimit = 1.45;
  camera.lowerAlphaLimit = -Math.PI / 2 - 0.4;
  camera.upperAlphaLimit = -Math.PI / 2 + 0.4;
  camera.panningSensibility = 0;

  var hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  var sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.35), scene);
  sun.intensity = 0.7;

  // ---- fixed structural geometry (lanes + build spots = the hitboxes) ----
  var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 34, height: 14 }, scene);
  var groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseTexture = GCAssets.loadTexture("assets/textures/ground.png");
  groundMat.diffuseTexture.uScale = 6;
  groundMat.diffuseTexture.vScale = 2.5;
  groundMat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  ground.material = groundMat;
  ground.isPickable = false;

  // sky: equirectangular panorama as the environment (IBL) — content, by bytes
  try {
    scene.environmentTexture = GCAssets.loadTexture("assets/textures/skybox.png");
    scene.environmentIntensity = 1.0;
  } catch (e) { fail("skybox: " + e.message); }

  var laneMat = new BABYLON.StandardMaterial("laneMat", scene);
  laneMat.diffuseColor = new BABYLON.Color3(0.1, 0.12, 0.15);
  laneMat.specularColor = new BABYLON.Color3(0, 0, 0);
  for (var li = 0; li < GCTD.LANE_Z.length; li++) {
    var lane = BABYLON.MeshBuilder.CreateBox("lane" + li, { width: GCTD.LANE_END_X + 1.5, height: 0.02, depth: 1.9 }, scene);
    lane.position.set((GCTD.LANE_START_X + GCTD.LANE_END_X) / 2 - 0.5, 0.011, GCTD.LANE_Z[li]);
    lane.material = laneMat;
    lane.isPickable = false;
  }

  var spotMat = new BABYLON.StandardMaterial("spotMat", scene);
  spotMat.diffuseColor = new BABYLON.Color3(0.16, 0.18, 0.22);
  spotMat.emissiveColor = new BABYLON.Color3(0.05, 0.06, 0.09);
  spotMat.specularColor = new BABYLON.Color3(0, 0, 0);
  for (var si = 0; si < GCTD.SPOTS.length; si++) {
    var spot = GCTD.SPOTS[si];
    var disc = BABYLON.MeshBuilder.CreateCylinder("spot" + si, { diameter: 1.1, height: 0.02, tessellation: 24 }, scene);
    disc.position.set(spot.x, 0.018, spot.z);
    disc.material = spotMat;
    disc.isPickable = false;
  }

  // hover highlight + range preview (shared, moved per frame)
  var hoverDisc = BABYLON.MeshBuilder.CreateCylinder("hoverDisc", { diameter: 1.2, height: 0.03, tessellation: 24 }, scene);
  var hoverMat = new BABYLON.StandardMaterial("hoverMat", scene);
  hoverMat.diffuseColor = new BABYLON.Color3(0.4, 0.9, 0.5);
  hoverMat.emissiveColor = new BABYLON.Color3(0.1, 0.35, 0.15);
  hoverMat.alpha = 0.6;
  hoverDisc.material = hoverMat;
  hoverDisc.isPickable = false;
  hoverDisc.setEnabled(false);

  var rangeDisc = BABYLON.MeshBuilder.CreateCylinder("rangeDisc", { diameter: 1, height: 0.02, tessellation: 32 }, scene);
  var rangeMat = new BABYLON.StandardMaterial("rangeMat", scene);
  rangeMat.diffuseColor = new BABYLON.Color3(0.9, 0.7, 0.3);
  rangeMat.emissiveColor = new BABYLON.Color3(0.3, 0.22, 0.08);
  rangeMat.alpha = 0.14;
  rangeDisc.material = rangeMat;
  rangeDisc.isPickable = false;
  rangeDisc.setEnabled(false);

  // ---- entity views (a skin on GCTD state) ----
  var TOWER_MODELS = {
    arrow: "assets/models/tower_arrow.glb",
    cannon: "assets/models/tower_cannon.glb",
    frost: "assets/models/tower_frost.glb"
  };
  var ENEMY_MODELS = {
    grunt: "assets/models/enemy_grunt.glb",
    brute: "assets/models/enemy_brute.glb"
  };
  var towerViews = {}; // towerId -> { root, barrel }
  var enemyViews = {}; // enemyId -> { root, baseY, type, gone, ... }
  var projViews = {};  // projId -> { mesh, mat, arc, impactX, impactZ, total }
  var fxList = [];     // { mesh, mat, t, dur, s0, s1 }

  // load a model from GC_ASSETS bytes into the scene; returns the root mesh.
  // A missing "barrel" node is fine: the tower still works, it just doesn't
  // rotate to aim (decoupling, ADR 0001).
  function loadEntityModel(path, onReady, onFail) {
    GCAssets.loadModel(path).then(function (container) {
      var root = container.createRootMesh();
      onReady(root, container);
    }).catch(function (e) {
      if (onFail) onFail(e);
      else fail("model " + path + ": " + e.message);
    });
  }

  // the base castle (fixed position)
  loadEntityModel("assets/models/base_castle.glb", function (root) {
    root.position.set(GCTD.BASE_X, 0, 0);
  });

  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

  function spawnTowerView(tower) {
    if (towerViews[tower.id]) return;
    loadEntityModel(TOWER_MODELS[tower.type], function (root, container) {
      root.position.set(tower.x, 0, tower.z);
      towerViews[tower.id] = { root: root, barrel: GCAssets.findNode(container, "barrel") };
    });
  }

  var gruntPhMat = new BABYLON.StandardMaterial("gruntPhMat", scene);
  gruntPhMat.diffuseColor = new BABYLON.Color3(0.4, 0.6, 0.3);
  gruntPhMat.emissiveColor = new BABYLON.Color3(0.08, 0.12, 0.05);
  var brutePhMat = new BABYLON.StandardMaterial("brutePhMat", scene);
  brutePhMat.diffuseColor = new BABYLON.Color3(0.65, 0.28, 0.25);
  brutePhMat.emissiveColor = new BABYLON.Color3(0.12, 0.05, 0.04);

  var hpBgMat = new BABYLON.StandardMaterial("hpBgMat", scene);
  hpBgMat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.14);
  hpBgMat.specularColor = new BABYLON.Color3(0, 0, 0);
  var hpFgMat = new BABYLON.StandardMaterial("hpFgMat", scene);
  hpFgMat.diffuseColor = new BABYLON.Color3(0.45, 0.85, 0.4);
  hpFgMat.emissiveColor = new BABYLON.Color3(0.1, 0.25, 0.08);

  function spawnEnemyView(e) {
    var big = e.type === "brute";
    var v = { type: e.type, gone: false, root: null, baseY: big ? 0.55 : 0.35, barY: big ? 1.5 : 1.1, hpBg: null, hpFg: null };
    // placeholder so the enemy is visible the instant it spawns, even if the
    // GLB is still loading (or fails — the game must not stop for art)
    var ph = BABYLON.MeshBuilder.CreateSphere("eph" + e.id, { diameter: big ? 1.1 : 0.7, segments: 10 }, scene);
    ph.material = big ? brutePhMat : gruntPhMat;
    ph.isPickable = false;
    v.root = ph;
    // HP bar (shown only while damaged)
    var bg = BABYLON.MeshBuilder.CreateBox("hpbg" + e.id, { width: 1.1, height: 0.09, depth: 0.03 }, scene);
    bg.material = hpBgMat; bg.isPickable = false;
    var fg = BABYLON.MeshBuilder.CreateBox("hpfg" + e.id, { width: 1.1, height: 0.11, depth: 0.03 }, scene);
    fg.material = hpFgMat; fg.isPickable = false;
    v.hpBg = bg; v.hpFg = fg;
    enemyViews[e.id] = v;
    positionEnemyView(v, e);
    loadEntityModel(ENEMY_MODELS[e.type], function (root) {
      if (v.gone) { root.dispose(); return; }
      v.root.dispose();
      v.root = root;
      v.baseY = 0;
      root.position.set(e.x, 0, GCTD.LANE_Z[e.lane]);
    }, function () { /* placeholder stays; gameplay is unaffected */ });
  }

  function positionEnemyView(v, e) {
    var z = GCTD.LANE_Z[e.lane];
    v.root.position.set(e.x, v.baseY, z);
    if (e.hp < e.maxHp) {
      var frac = Math.max(0.05, e.hp / e.maxHp);
      v.hpBg.setEnabled(true);
      v.hpFg.setEnabled(true);
      v.hpFg.scaling.x = frac;
      v.hpBg.position.set(e.x, v.barY, z);
      v.hpFg.position.set(e.x - (1 - frac) * 0.55, v.barY, z);
    } else if (v.hpBg.isEnabled()) {
      v.hpBg.setEnabled(false);
      v.hpFg.setEnabled(false);
    }
  }

  function removeEnemyView(id) {
    var v = enemyViews[id];
    if (!v) return;
    v.gone = true;
    if (v.root) v.root.dispose();
    if (v.hpBg) { v.hpBg.dispose(); v.hpFg.dispose(); }
    delete enemyViews[id];
  }

  var PROJ_STYLE = {
    arrow: { diameter: 0.16, color: [0.9, 0.85, 0.6], arc: 0.25 },
    cannon: { diameter: 0.34, color: [0.3, 0.3, 0.34], arc: 0.9 },
    frost: { diameter: 0.24, color: [0.75, 0.9, 1.0], arc: 0.2 }
  };

  function syncProjectiles() {
    var alive = {};
    var i, p, v, st;
    for (i = 0; i < game.projectiles.length; i++) {
      p = game.projectiles[i];
      alive[p.id] = true;
      if (!projViews[p.id]) {
        st = PROJ_STYLE[p.kind] || PROJ_STYLE.arrow;
        var mesh = BABYLON.MeshBuilder.CreateSphere("proj" + p.id, { diameter: st.diameter, segments: 8 }, scene);
        var mat = new BABYLON.StandardMaterial("pmat" + p.id, scene);
        mat.diffuseColor = new BABYLON.Color3(st.color[0], st.color[1], st.color[2]);
        mat.emissiveColor = new BABYLON.Color3(st.color[0] * 0.7, st.color[1] * 0.7, st.color[2] * 0.7);
        mesh.material = mat;
        mesh.isPickable = false;
        // first tick: the projectile is still near the tower, so the distance
        // to the (current) target ≈ the flight length — enough for the arc
        projViews[p.id] = {
          mesh: mesh, mat: mat, arc: st.arc,
          impactX: p.lastX, impactZ: p.lastZ,
          total: Math.max(0.001, dist2(p.x, p.z, p.lastX, p.lastZ))
        };
      }
    }
    for (i = 0; i < game.projectiles.length; i++) {
      p = game.projectiles[i];
      v = projViews[p.id];
      if (!v) continue;
      var remain = dist2(p.x, p.z, v.impactX, v.impactZ);
      var prog = Math.min(1, 1 - remain / v.total);
      v.mesh.position.set(p.x, 0.4 + Math.sin(prog * Math.PI) * v.arc, p.z);
    }
    Object.keys(projViews).forEach(function (id) {
      if (!alive[id]) {
        v = projViews[id];
        v.mesh.dispose();
        v.mat.dispose();
        delete projViews[id];
      }
    });
  }

  // ---- transient FX (puffs, impact rings) ----
  function spawnFx(x, y, z, color, s0, s1, dur, flat) {
    if (fxList.length > 40) return; // a burst can never stall the frame
    var mesh = BABYLON.MeshBuilder.CreateSphere("fx", { diameter: 1, segments: 8 }, scene);
    var mat = new BABYLON.StandardMaterial("fxm", scene);
    mat.diffuseColor = new BABYLON.Color3(color[0], color[1], color[2]);
    mat.emissiveColor = new BABYLON.Color3(color[0], color[1], color[2]);
    mat.alpha = 0.85;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.position.set(x, y, z);
    fxList.push({
      mesh: mesh, mat: mat, t: 0, dur: dur,
      s0: [s0, flat ? s0 * 0.18 : s0, s0], s1: [s1, flat ? s1 * 0.18 : s1, s1]
    });
  }

  function updateFx(dt) {
    for (var i = fxList.length - 1; i >= 0; i--) {
      var f = fxList[i];
      f.t += dt;
      var k = Math.min(1, f.t / f.dur);
      f.mesh.scaling.set(f.s0[0] + (f.s1[0] - f.s0[0]) * k, f.s0[1] + (f.s1[1] - f.s0[1]) * k, f.s0[2] + (f.s1[2] - f.s0[2]) * k);
      f.mat.alpha = 0.85 * (1 - k);
      if (k >= 1) {
        f.mesh.dispose();
        f.mat.dispose();
        fxList.splice(i, 1);
      }
    }
  }

  // ---- core game + events ----
  var game = GCTD.createGame();

  var toastTimer = null;
  function toast(msg, isError, ms) {
    var el = $("gc-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? "" : "info";
    el.style.display = "block";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = "none"; }, ms || 2500);
  }

  function refreshHud() {
    var gold = $("gc-hud-gold");
    if (gold) gold.querySelector("b").textContent = game.gold;
    var wave = $("gc-hud-wave");
    if (wave) {
      var shown = game.state === "wave" ? game.waveNumber : game.wave;
      wave.querySelector("b").textContent = shown + "/" + GCTD.TOTAL_WAVES;
    }
    var base = $("gc-hud-base");
    if (base) {
      base.querySelector("b").textContent = game.baseHp;
      base.classList.toggle("warn", game.baseHp <= GCTD.BASE_HP / 4);
    }
    document.querySelectorAll(".tower-card").forEach(function (c) {
      var t = c.getAttribute("data-tower");
      c.classList.toggle("disabled", game.gold < GCTD.TOWERS[t].cost);
    });
  }

  function refreshStart() {
    var b = $("gc-start");
    if (!b) return;
    if (game.state === "idle") { b.disabled = false; b.textContent = "Start wave " + (game.wave + 1); }
    else if (game.state === "wave") { b.disabled = true; b.textContent = "Wave " + game.waveNumber + " in progress"; }
    else { b.disabled = true; b.textContent = game.state === "won" ? "Victory" : "Defeated"; }
  }

  function showEnd(won) {
    var name = commander || "Commander";
    var panel = $("gc-end-panel");
    if (panel) panel.className = "end-panel " + (won ? "win" : "lose");
    var t = $("gc-end-title");
    if (t) t.textContent = won ? "Victory, " + name + "!" : "The castle has fallen";
    var d = $("gc-end-detail");
    if (d) d.textContent = won
      ? "All " + GCTD.TOTAL_WAVES + " waves repelled with " + game.baseHp + " base HP to spare. The kingdom stands."
      : "Your base was destroyed on wave " + game.waveNumber + ". Regroup and hold the line, " + name + ".";
    $("gc-end").hidden = false;
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case "place": {
        for (var i = 0; i < game.towers.length; i++) {
          if (game.towers[i].id === ev.towerId) spawnTowerView(game.towers[i]);
        }
        spawnFx(ev.x, 0.5, ev.z, [0.6, 0.6, 0.55], 0.25, 1.5, 0.25, false);
        GCAudio.play("place", 0.5);
        refreshHud();
        refreshStart();
        break;
      }
      case "shoot":
        GCAudio.play("shoot_" + ev.towerType, 0.45);
        break;
      case "impact":
        if (ev.radius > 0) {
          spawnFx(ev.x, 0.35, ev.z, [1, 0.6, 0.25], 0.3, ev.radius * 1.05, 0.3, true);
          GCAudio.play("hit", 0.5);
        } else {
          spawnFx(ev.x, 0.5, ev.z, [1, 0.85, 0.5], 0.12, 0.55, 0.15, false);
        }
        break;
      case "kill": {
        var col = ev.enemyType === "brute" ? [0.9, 0.35, 0.3] : [0.5, 0.75, 0.4];
        spawnFx(ev.x, 0.6, ev.z, col, 0.4, 1.6, 0.3, false);
        GCAudio.play("kill", 0.5);
        refreshHud();
        break;
      }
      case "leak":
        spawnFx(ev.x, 0.5, ev.z, [1, 0.3, 0.25], 0.35, 1.8, 0.35, true);
        GCAudio.play("leak", 0.7);
        refreshHud();
        break;
      case "wave_start":
        GCAudio.play("wave", 0.6);
        refreshHud();
        refreshStart();
        break;
      case "wave_clear":
        GCAudio.play("wave", 0.4);
        toast("Wave " + ev.wave + " cleared! +" + ev.bonus + " gold", false, 2200);
        refreshHud();
        refreshStart();
        break;
      case "win":
        GCAudio.play("win", 0.7);
        showEnd(true);
        refreshHud();
        refreshStart();
        break;
      case "lose":
        GCAudio.play("lose", 0.7);
        showEnd(false);
        refreshHud();
        refreshStart();
        break;
    }
  }

  // ---- sync core state → views (every frame) ----
  function syncView() {
    var i, t, v, e;
    for (i = 0; i < game.towers.length; i++) {
      t = game.towers[i];
      v = towerViews[t.id];
      if (v && v.barrel) v.barrel.rotation.y = -t.aim;
    }
    var alive = {};
    for (i = 0; i < game.enemies.length; i++) {
      e = game.enemies[i];
      alive[e.id] = true;
      if (!enemyViews[e.id]) spawnEnemyView(e);
      else positionEnemyView(enemyViews[e.id], e);
    }
    Object.keys(enemyViews).forEach(function (id) {
      if (!alive[id]) removeEnemyView(id);
    });
    syncProjectiles();
  }

  // ---- placement input (click a spot; drag orbits the camera) ----
  var selectedType = null;
  var hoverSpot = null;

  function selectTower(type) {
    selectedType = type;
    document.querySelectorAll(".tower-card").forEach(function (c) {
      c.classList.toggle("selected", c.getAttribute("data-tower") === type);
    });
  }

  function nearestSpot(x, z, maxDist) {
    var best = null, bd = maxDist;
    for (var i = 0; i < GCTD.SPOTS.length; i++) {
      var s = GCTD.SPOTS[i];
      var d = dist2(s.x, s.z, x, z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // click → world: unproject the pixel point (this build's Unproject takes
  // (pixelX, pixelY, depth) + width/height + view + projection) and intersect
  // the y=0 plane — there is no camera.getRay here
  function groundPoint(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    var px = clientX - rect.left;
    var py = clientY - rect.top;
    var view = scene.getViewMatrix();
    var proj = scene.getProjectionMatrix();
    var I = BABYLON.Matrix.IdentityReadOnly;
    var near = BABYLON.Vector3.Unproject(new BABYLON.Vector3(px, py, 0), rect.width, rect.height, view, proj, I);
    var far = BABYLON.Vector3.Unproject(new BABYLON.Vector3(px, py, 1), rect.width, rect.height, view, proj, I);
    var dy = far.y - near.y;
    if (Math.abs(dy) < 1e-6) return null;
    var tt = -near.y / dy;
    if (tt < 0) return null;
    return { x: near.x + (far.x - near.x) * tt, z: near.z + (far.z - near.z) * tt };
  }

  var down = null;
  canvas.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointerup", function (e) {
    if (!down) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 8) return; // that was a camera drag
    if (game.state === "won" || game.state === "lost") return;
    if (!selectedType) return;
    var gp = groundPoint(e.clientX, e.clientY);
    if (!gp) return;
    var spot = nearestSpot(gp.x, gp.z, 1.4);
    if (!spot) { toast("Build on a marked spot.", true); return; }
    try {
      GCTD.placeTower(game, spot.index, selectedType);
    } catch (err) {
      toast(err.message, true);
    }
  });
  canvas.addEventListener("pointermove", function (e) {
    var gp = selectedType ? groundPoint(e.clientX, e.clientY) : null;
    hoverSpot = gp ? nearestSpot(gp.x, gp.z, 1.4) : null;
  });
  canvas.addEventListener("pointerleave", function () { hoverSpot = null; });

  function updateHover() {
    if (hoverSpot && selectedType && game.state !== "won" && game.state !== "lost") {
      var ok = !game.spots[hoverSpot.index].tower && game.gold >= GCTD.TOWERS[selectedType].cost;
      hoverDisc.setEnabled(true);
      hoverDisc.position.set(hoverSpot.x, 0.024, hoverSpot.z);
      hoverMat.diffuseColor.set(ok ? 0.4 : 0.9, ok ? 0.9 : 0.3, ok ? 0.5 : 0.25);
      rangeDisc.setEnabled(true);
      rangeDisc.position.set(hoverSpot.x, 0.015, hoverSpot.z);
      rangeDisc.scaling.setAll(GCTD.TOWERS[selectedType].range * 2);
    } else {
      hoverDisc.setEnabled(false);
      rangeDisc.setEnabled(false);
    }
  }

  // ---- UI wiring ----
  document.querySelectorAll(".tower-card").forEach(function (c) {
    c.addEventListener("click", function () {
      var t = c.getAttribute("data-tower");
      selectTower(selectedType === t ? null : t);
      if (selectedType) {
        toast("Click a marked spot to build the " + GCTD.TOWERS[selectedType].name + " (" + GCTD.TOWERS[selectedType].cost + "g). Esc to cancel.", false, 3500);
      }
    });
  });

  $("gc-start").addEventListener("click", function () {
    try { GCTD.startWave(game); } catch (e) { toast(e.message, true); }
  });

  $("gc-again").addEventListener("click", function () { window.location.reload(); });

  window.addEventListener("keydown", function (e) {
    if (e.key === "1") selectTower("arrow");
    else if (e.key === "2") selectTower("cannon");
    else if (e.key === "3") selectTower("frost");
    else if (e.key === "Escape") selectTower(null);
    else if (e.key === " " && game.state === "idle") {
      e.preventDefault();
      try { GCTD.startWave(game); } catch (err) { toast(err.message, true); }
    }
  });

  // ---- render loop: advance the core, drain events, draw ----
  engine.runRenderLoop(function () {
    var dt = Math.min(engine.getDeltaTime() / 1000, 0.1); // clamp tab-switch jumps
    GCTD.update(game, dt);
    syncView();
    updateFx(dt);
    updateHover();
    if (game.events.length) {
      var evs = game.events.splice(0, game.events.length);
      for (var i = 0; i < evs.length; i++) handleEvent(evs[i]);
    }
    scene.render();
    window.__GC_RENDER_OK = true;
  });
  window.addEventListener("resize", function () { engine.resize(); });

  // ---- e2e hooks: the exported bundle is driven through these ----
  window.__GC_TD = {
    game: game,
    // project a build spot to CSS pixels (page.mouse.click uses CSS pixels)
    screenPos: function (spotIndex) {
      var s = GCTD.SPOTS[spotIndex];
      var p = BABYLON.Vector3.Project(
        new BABYLON.Vector3(s.x, 0, s.z),
        scene.getViewMatrix(),
        scene.getProjectionMatrix(),
        { width: canvas.clientWidth, height: canvas.clientHeight, x: 0, y: 0 }
      );
      return { x: p.x, y: p.y };
    },
    // place through the real API (what a palette click does)
    place: function (spotIndex, type) {
      GCTD.placeTower(game, spotIndex, type);
    }
  };

  refreshHud();
  refreshStart();
})();
