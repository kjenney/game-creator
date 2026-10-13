# CI gates merges on the automated file:// smoke test

The spec's Testing Decisions named the Babylon smoke test as *manual*. We decided CI may gate merges on an automated version of it: an exported Generated game is opened at `file://` in headless Chromium (SwiftShader WebGL) and must run, render a frame, and display the user's Options — plus the full creator loop end-to-end (pick Template, set title, export, and the export passes the smoke test).

**Why:** The `file://` runtime is the project's central risk (ADR 0002), and T1's acceptance criterion "the export runs from `file://` and displays the title" was the one thing no automated check could prove. The first run of this pipeline immediately caught a real defect a manual pass had missed — `game.js` threw (`barrelMat` undeclared) *after* the title was painted, so the canvas never rendered a single frame. A green merge should mean a playable game, not a titled blank canvas.

**Consequences:** CI now carries a browser dependency (Playwright/Chromium) and SwiftShader ≠ real GPU — a manual real-browser spot-check remains for anything graphics-sensitive. `retries: 0` deliberately; add retry logic only if CI flakiness proves necessary, and say so here.
