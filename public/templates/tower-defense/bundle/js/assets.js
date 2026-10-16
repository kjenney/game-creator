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
    // v9: the glTF plugin's directLoad accepts a data: URL whose payload
    // starts with the GLB magic — it base64-decodes and parses the binary
    // inline (no fetch, D4-satisfied). The raw-ArrayBuffer path needs a
    // pluginExtension lookup that resolves to the wrong plugin in this
    // bundle, so we go through the URL form.
    var b64 = GameGC.toBase64(assetBytes(path));
    var url = "data:model/gltf-binary;base64," + b64;
    return BABYLON.LoadAssetContainerAsync(url, scene);
  }
  function loadTexture(path) {
    // v9 engine.createTexture decodes the `buffer` param ONLY when the url is a
    // data: URL (`if (isDataUrl && buffer) …else _loadFile(url)`). A relative or
    // file:// url makes it fetch the url — CORS-blocked under file:// — and a
    // null url makes the Texture ctor early-return before the buffer is touched.
    // So hand it a data: url (the same pattern loadModel uses) plus the raw
    // bytes; the buffer is decoded directly, with no network fetch (D4-satisfied).
    var bytes = assetBytes(path);
    var url = "data:image/png;base64," + GameGC.toBase64(bytes);
    return new BABYLON.Texture(url, scene, false, false, 0, null, null, bytes);
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
