// assets.js — game asset loader (NOTES §4 pattern): GC_ASSETS → bytes → Babylon.
// file:// rule D4: every binary asset is loaded from embedded bytes, never by URL fetch.
// T1 defines the loader; T2/T3 slots + T4 game consume it.
(function () {
  "use strict";
  var scene = null; // set by game.js before any load call

  function assetBytes(path) {
    var b64 = window.GC_ASSETS && window.GC_ASSETS[path];
    if (!b64) throw new Error("asset missing from GC_ASSETS: " + path);
    return GameGC.fromBase64(b64);
  }
  function loadModel(path) {
    // v9: LoadAssetContainerAsync(source, scene); source may be bytes (D4)
    return BABYLON.SceneLoader.LoadAssetContainerAsync(assetBytes(path), scene);
  }
  function loadTexture(path) {
    // v9 createTexture accepts a buffer; if a raw Uint8Array is rejected at runtime,
    // wrap with new BABYLON.Buffer(bytes) (NOTES open question 3 — one-line fix).
    return new BABYLON.Texture(assetBytes(path), scene);
  }
  // v9 AssetContainer has NO getNodeByName — walk the tree (NOTES T2.4)
  function findNode(container, name) {
    var stack = container.rootNodes.slice(), n;
    while (stack.length) {
      n = stack.pop();
      if (n.name === name) return n;
      if (n.getChildMeshes) stack.push.apply(stack, n.getChildMeshes());
      if (n.getChildren) stack.push.apply(stack, n.getChildren());
    }
    return null;
  }

  window.GCAssets = { assetBytes: assetBytes, loadModel: loadModel, loadTexture: loadTexture, findNode: findNode, setScene: function (s) { scene = s; } };
})();
