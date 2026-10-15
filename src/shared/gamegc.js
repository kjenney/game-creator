// gamegc.js — the ESM seam for the shared contract in the browser app.
//
// contract.js is "UMD-lite" (NOTES §4): in Node it is CJS (module.exports),
// and in the Generated game a verbatim copy runs as a file:// classic <script>
// that publishes global.GameGC. It deliberately carries NO ES `export` so it
// can be a classic script. But `vite dev` serves app-source CJS files verbatim
// to the browser as a native ES module — with NO CJS interop — so
// `import GameGC from "./contract.js"` fails there, even though it works in
// `vite build` (Rollup interops module.exports into a default export).
//
// This module gives the app's ES modules one reliable default import in BOTH
// modes: importing contract.js runs its IIFE for its side effect, and we then
// hand back the API whether it landed on the default export (build) or on the
// global (dev). Node tests import contract.js directly and are unaffected.
import * as contract from "./contract.js";

export default (contract && contract.default) || globalThis.GameGC;
