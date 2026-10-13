// e2e/smoke.spec.js — the spec's manual Babylon smoke test, automated
// (ADR 0004): a bundle built through the export seam is opened directly at
// file:// (no server) and must run, render a frame, and display the title.
import { test } from "@playwright/test";
import { buildBundleDir, assertSmoke } from "./helpers.js";

test("exported bundle runs from file:// and displays the user's Options (smoke test)", async ({ browser }) => {
  const dir = buildBundleDir();
  const page = await browser.newPage();
  await assertSmoke(page, dir);
  await page.close();
});
