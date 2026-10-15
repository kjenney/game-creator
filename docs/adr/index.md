# Architecture Decision Records

The project's ADRs, in decision order. Each records a decision, its rationale,
and its consequences.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-options-customize-content-only.md) | Options customize content, not behavior | accepted |
| [0002](0002-self-contained-template-bundle.md) | Each Template is a self-contained bundle | accepted |
| [0003](0003-export-only-no-backend.md) | Output is export-only; the app has no backend | accepted |
| [0004](0004-ci-gates-on-automated-smoke-test.md) | CI gates merges on the automated `file://` smoke test | accepted |

These four decisions are load-bearing for the [architecture](../architecture.md):
content-only Options bound what a Template must support; the self-contained
bundle is what makes the export a playable game with no server; export-only
is what keeps the app backend-free; and the automated smoke test is what
makes "green CI" mean "playable game".
