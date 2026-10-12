// Vendor entry (NOTES D2): Babylon core + glTF file loader in one bundle.
// `export *` makes the IIFE return the core namespace, so the global BABYLON
// is the library itself (a side-effect-only import would return undefined).
// The loader import registers the GLTF plugin on the same core instance.
import "@babylonjs/loaders/glTF/glTFFileLoader";
export * from "@babylonjs/core";
