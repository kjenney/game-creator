// Vendor entry (NOTES D2): Babylon core + glTF file loader in one bundle.
// `export *` makes the IIFE return the core namespace, so the global BABYLON
// is the library itself (a side-effect-only import would return undefined).
// The loader import registers the GLTF plugin on the same core instance.
// Use the package index (not .../glTFFileLoader directly): the index pulls in
// the 1.0/2.0 loader modules whose side effect sets
// GLTFFileLoader._CreateGLTF1Loader/_CreateGLTF2Loader — without it, parsing
// any glTF fails with "Unsupported version".
import "@babylonjs/loaders/glTF";
export * from "@babylonjs/core";
