// e2e/play.spec.js — the issue #5 "playable" acceptance test, in a browser:
// the exported bundle at file:// runs a real wave (enemies spawn and advance),
// the player places a tower through the UI (palette → click a spot), the gold
// economy responds, and nothing throws. The game rules themselves are covered
// headlessly in tests/td-core.test.js; this proves the view + UI + loop.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test, expect } from "@playwright/test";
import { buildBundleDir, assertSmoke } from "./helpers.js";

test("play: a wave runs, a tower is placed via the UI, the economy responds", async ({ browser }) => {
  const dir = buildBundleDir();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(pathToFileURL(path.join(dir, "index.html")).href);

  // the smoke baseline: engine + scene live, first frame rendered, Options shown
  await assertSmoke(page, dir);

  const td = () => page.evaluate(() => window.__GC_TD);
  const state = () => page.evaluate(() => window.__GC_TD.game.state);

  // fixed starting state (from the core): 200 gold, 10 waves to go
  await expect
    .poll(async () => (await page.evaluate(() => window.__GC_TD.game.gold)), { timeout: 5000 })
    .toBe(200);

  // --- place an Arrow tower BEFORE the wave (economy spend side) ---
  // spot 4 = column 1, middle lane (x=6, z=0): covers the lane the grunts walk
  await page.locator("#gc-tower-arrow").click();
  const pos = await page.evaluate(() => window.__GC_TD.screenPos(4));
  await page.mouse.click(pos.x, pos.y);

  await expect
    .poll(async () => page.evaluate(() => (window.__GC_TD.game.spots[4].tower ? window.__GC_TD.game.gold : null)), {
      timeout: 5000,
    })
    .toBe(150); // 200 − 50 (Arrow cost)

  // clicking the same (now occupied) spot surfaces the core's specific error
  await page.mouse.click(pos.x, pos.y);
  await expect(page.locator("#gc-toast")).toContainText("already has a tower");

  // --- run wave 1 (enemies spawn and advance toward the base) ---
  await page.locator("#gc-start").click();
  await expect.poll(state, { timeout: 5000 }).toBe("wave");

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const g = window.__GC_TD.game;
          return g.enemies.length > 0 && Math.max(...g.enemies.map((e) => e.x)) > -1.0;
        }),
      { timeout: 10_000 },
    )
    .toBe(true); // at least one enemy has left the spawn point

  // --- the tower does its job (economy earn side: a bounty lands) ---
  await expect
    .poll(async () => page.evaluate(() => window.__GC_TD.game.gold), { timeout: 25_000 })
    .toBeGreaterThan(150); // 150 + bounty of a killed grunt (8) or more

  if (errors.length) throw new Error("page errors during play:\n" + errors.join("\n"));

  await page.close();
});
