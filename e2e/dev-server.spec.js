// e2e/dev-server.spec.js — the creator app must also work under `vite dev`
// (port 5173), not just the production build that `vite preview` serves.
//
// Why this file exists: every other e2e test runs against the built app
// (webServer `npm run preview`, baseURL 4173). Rollup interops the shared
// contract.js (CJS/UMD) into an ES default export in the build, but `vite dev`
// serves app-source CJS files to the browser VERBATIM with no interop — so an
// `import GameGC from "../shared/contract.js"` that links fine in the build
// throws at module-link time in dev, halting main.js before it renders anything
// and leaving the template list empty. This is the only coverage of the dev
// server, and the regression guard for that whole class of dev-only link bug.
import { test, expect } from "@playwright/test";

const DEV = "http://localhost:5173/";

test("creator app renders and is selectable under `vite dev` (no module-link errors)", async ({ browser }) => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(DEV, { waitUntil: "networkidle" });

  // The user-facing step that regressed: a selectable template must be present.
  // Before the fix the module graph failed to link, so main.js never ran and
  // #template-list was empty — this assertion is the direct guard for that.
  const card = page.locator("#template-list .template-card").first();
  await expect(card).toBeVisible();

  // Selecting it drives the manifest → form → summary path, where the shared
  // contract is consumed (through the ESM seam) in the dev context. A broken
  // seam would let the list render but throw the moment the form/summary run.
  await card.click();
  await expect(page.locator("#form-section .slot").first()).toBeVisible();
  await expect(page.locator("#summary-section .summary-row").first()).toBeVisible();

  if (errors.length) throw new Error("uncaught errors under `vite dev`:\n" + errors.join("\n"));
  await page.close();
});
