// Default Vite config: publicDir is the default "public", so
// public/templates/… is served in dev and copied verbatim into dist/ (NOTES D10).
// CJS form: package.json intentionally has no "type" field so the shared
// contract.js loads as CJS in Node (D3/D7); this keeps the config warning-free
// under both loaders.
module.exports = {};
