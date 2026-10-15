# assets.js & td-audio.js — loading from embedded bytes

Two small modules close the loop on the `file://` rule D4: every binary asset
the game needs arrives as base64 in `window.GC_ASSETS` (written by
[buildBundle](../contract/build-bundle.md)), and these modules turn those
bytes into Babylon models/textures and Web Audio buffers — **never a URL
fetch**.

## assets.js — `GCAssets`

```js
window.GCAssets = {
  assetBytes(path),   // GC_ASSETS[path] → Uint8Array (throws if missing)
  loadModel(path),    // → BABYLON AssetContainer (async)
  loadTexture(path),  // → BABYLON.Texture
  findNode(container, name),  // walk the tree for a node by name
  setScene(scene)     // game.js calls before any load
};
```

### `loadModel` — the v9 data-URL quirk

Babylon 9's glTF plugin `directLoad` accepts a `data:` URL whose payload
starts with the GLB magic: it base64-decodes and parses the binary inline.
The raw-`ArrayBuffer` path needs a pluginExtension lookup that resolves to
the wrong plugin in this bundle, so models go through the URL form:

```js
var url = "data:model/gltf-binary;base64," + GameGC.toBase64(assetBytes(path));
return BABYLON.LoadAssetContainerAsync(url, scene);
```

### `loadTexture` — the buffer-parameter quirk

Babylon 9's `Texture` constructor calls `.substring` on the `url` parameter,
so it must stay a string (here `null`); the bytes go in the 8th positional
`buffer` parameter:

```js
return new BABYLON.Texture(null, scene, false, false, 0, null, null, assetBytes(path));
```

### `findNode`

Babylon 9's `AssetContainer` has no `getNodeByName` — this walks
`rootNodes` → `getChildMeshes`/`getChildren` (stack-based DFS). Used to
locate the tower's `barrel` node for aiming; a missing node returns `null`
and the tower simply doesn't aim.

## td-audio.js — `GCAudio`

Fixed game audio (T4): **not** an Option (spec: "fixed audio") — just content
the game plays. Web Audio only, no Babylon: the WAV bytes are decoded from
`GC_ASSETS` into `AudioBuffer`s.

```js
window.GCAudio = { play(name, volume), unlock() };
```

Sound names (all in `assets/audio/`, all in `defaultAssets`): `place`,
`shoot_arrow`, `shoot_cannon`, `shoot_frost`, `hit`, `kill`, `leak`, `wave`,
`win`, `lose`.

### Headless / autoplay-safe

- The `AudioContext` is **created lazily** and resumed on the first user
  gesture (`pointerdown` / `keydown` / `touchstart` → `unlock`) — autoplay
  policy can't block the first frame.
- `decodeAudioData` detaches its buffer, so each sound is decoded exactly
  once (`decoding` guard).
- Every call is wrapped so an audio problem **never throws into the page or
  breaks the game** — audio is best-effort: a decode failure skips that
  sound, a missing context is a no-op.

### Why WAV, not MP3/OGG

`decodeAudioData` decodes WAV natively in every target browser (including
headless Chromium under SwiftShader), so the fixed audio works in the smoke
test without codec dependencies. The default WAVs are synthesized by
[make-default-art.mjs](../authoring/art.md).
