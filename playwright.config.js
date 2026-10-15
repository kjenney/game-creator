// playwright.config.js — the CI browser stage (ADR 0004): headless Chromium
// validates what the Node suite can't — that an exported Generated game
// actually runs from file:// and displays the user's Options (the spec's
// manual smoke test, automated), plus the full creator loop end-to-end.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 }, // render-hook waits (SwiftShader first frame)
  retries: 0, // v1: no retry logic — add only if CI flakiness proves necessary (ADR 0004)
  use: {
    headless: true,
    baseURL: "http://localhost:4173/",
  },
  // Creator app under test: serve BOTH the production build (dist/, like a real
  // deploy) and the dev server. Every spec except e2e/dev-server.spec.js uses
  // the production build (baseURL 4173); the dev server (5173) is covered by
  // that one spec, because `vite dev` and `vite build` handle CJS app source
  // differently (dev serves it verbatim, no interop) and must both stay usable.
  webServer: [
    {
      command: "npm run preview",
      url: "http://localhost:4173/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
