// game.js — T1 thin-path game: proves file:// + classic scripts + vendored Babylon
// + Option injection. Renders a simple scene and displays the creator's title.
// The full TD game (waves, towers, enemies, economy) lands in T4 — it replaces
// this file and keeps reading GC_OPTIONS/GC_ASSETS only (NOTES T4.4 structure).
(function () {
  "use strict";

  var options = window.GC_OPTIONS || {};
  var title = options["game.title"] || "Tower Defense";
  var commander = options["game.commander"] || "";

  document.title = title;
  document.getElementById("gc-title").textContent = title;
  if (commander) document.getElementById("gc-commander").textContent = "Commander: " + commander;

  function fail(msg) {
    var el = document.getElementById("gc-error");
    el.textContent = msg;
    el.style.display = "block";
  }

  var canvas = document.getElementById("gc-canvas");
  var engine = new BABYLON.Engine(canvas, true); // WebGL2 preferred, WebGL1 fallback
  var scene = new BABYLON.Scene(engine);
  window.__GC_ENGINE = engine; // manual smoke/debug hooks (headless envs lack rAF)
  window.__GC_SCENE = scene;
  scene.clearColor = new BABYLON.Color4(0.06, 0.08, 0.11, 1);
  GCAssets.setScene(scene); // asset loader ready for T2/T3/T4

  var camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2.6, 12, new BABYLON.Vector3(0, 1.5, 0), scene);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 20;

  var hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  var dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.5, -1, -0.3), scene);
  dir.intensity = 0.7;

  // ground
  var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 30, height: 30 }, scene);
  ground.material = new BABYLON.StandardMaterial("groundMat", scene);
  ground.material.diffuseColor = new BABYLON.Color3(0.16, 0.22, 0.18);
  ground.material.specularColor = new BABYLON.Color3(0, 0, 0);

  // a placeholder "tower" on a lane — T4 replaces with GLB models from GC_ASSETS
  var base = BABYLON.MeshBuilder.CreateCylinder("base", { diameter: 1.2, height: 1.2 }, scene);
  base.position.y = 0.6;
  var barrel = BABYLON.MeshBuilder.CreateCylinder("barrel", { diameter: 0.4, height: 1.4 }, scene);
  barrel.position.set(0, 2.0, 0);
  var accentMat = new BABYLON.StandardMaterial("accentMat", scene);
  accentMat.diffuseColor = new BABYLON.Color3(0.91, 0.64, 0.24);
  base.material = accentMat;
  barrel.material = new BABYLON.StandardMaterial("barrelMat", scene);
  barrelMat.diffuseColor = new BABYLON.Color3(0.8, 0.82, 0.85);
  barrelMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);

  engine.runRenderLoop(function () {
    barrel.rotation.y += 0.02; // idle spin so the scene is visibly alive
    scene.render();
    if (!window.__GC_RENDER_OK) window.__GC_RENDER_OK = true; // manual smoke hook: first frame rendered
  });
  window.addEventListener("resize", function () { engine.resize(); });
})();
