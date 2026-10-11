# Output is export-only; the app has no backend

The only output of the creator is an exported, self-contained game the user downloads. There is no hosted play, no saved projects, no re-edit, and no in-app preview — and therefore **no backend**: no server, no accounts, no database, no image storage. Uploaded Option images live in the browser and are embedded into the export.

**Why:** Export-only keeps the entire app a static client-side web app — the simplest thing that delivers the core value ("make a custom game and take it with you"). Hosted play and save/re-edit were live alternatives and are deferred; they would require a backend we don't yet need.

**Consequences:** Nothing is persisted server-side, so a "Generated game" exists only as the exported bundle. Adding accounts, saved games, or collaboration later is additive but would introduce the backend we deliberately omitted.
