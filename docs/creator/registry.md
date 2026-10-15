# registry.js — Template registry

`src/creator/registry.js` is the creator's view of "what games exist". v1
ships one Template; the shape accepts more.

## `TEMPLATES`

```js
export const TEMPLATES = [
  {
    id: "tower-defense",
    name: "Tower Defense",
    manifestUrl: "templates/tower-defense/manifest.json",
  },
];
```

`manifestUrl` is relative to the app origin: `public/` is served by Vite in
dev and copied verbatim into `dist/` at build time (NOTES D10), so the same
URL works in both. `id` becomes the export filename (`<id>.zip`); `name` is
the display name used in headings and buttons.

## `loadManifest(template)`

```js
fetch(template.manifestUrl) → { ...template, manifest: <json> }
```

Non-OK responses throw `failed to load manifest for <id> (HTTP <status>)`,
which the bootstrap surfaces in the status line.

## Adding a Template

1. Create `public/templates/<id>/manifest.json` and `bundle/` (see
   [Template anatomy](../template/index.md)).
2. Add an entry to `TEMPLATES`.
3. Cover it in the test suites — the e2e "full surface" tests assert the
   creator renders whatever the manifest declares.

The registry deliberately knows nothing about slot kinds: the manifest is the
single declaration of what a Template supports, and the form is rendered from
it.
