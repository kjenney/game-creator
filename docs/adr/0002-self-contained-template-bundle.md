# Each Template is a self-contained bundle

We chose the "parameterized self-contained app" architecture over a shared data-driven engine or per-game code generation. Each Template (one per genre) is a complete, self-contained Babylon.js web app — its own scene, game loop, and assets — that declares which Options it supports and reads them at load. Generation = injecting the user's Option values into a copy of the bundle.

**Why:** It's the most maintainable and the most Babylon-idiomatic: one real, debuggable game per genre, with Options as a thin content layer on top. A shared engine (data + runtime) would be far more work and harder to make genuinely fun; per-game codegen produced code that was hard to maintain and re-edit.

**Consequences:** Genres do not share a runtime — a tower-defense Template and a racing Template are separate codebases. The benefit is that each game can be designed and tuned independently; the cost is duplicated scaffolding (loading, render loop, UI) across Templates.
