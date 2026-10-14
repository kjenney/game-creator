// td-core.test.js — the gameplay seam (issue #5 AC: fixed stats/targeting,
// enemy behavior, base health, waves, gold economy, win/lose).
// Pure Node, no browser: td-core.js is Babylon/DOM-free on purpose (ADR 0001),
// so the rules are asserted headlessly and deterministically.
import { test } from "node:test";
import assert from "node:assert/strict";
import GCTD from "../public/templates/tower-defense/bundle/js/td-core.js"; // CJS default interop

const STEP = 1 / 60;

// step the game until pred() is true (or guard iterations run out).
// NOTE: events are NOT drained here — tests assert on the accumulated event log
// (the view layer drains them per frame; in tests they just accumulate).
function runUntil(game, pred, guard = 30 * 60 * 60) {
  for (let i = 0; i < guard; i++) {
    GCTD.update(game, STEP);
    if (pred()) return true;
  }
  return false;
}
const drain = (game) => game.events.splice(0);

test("fresh game: fixed starting state (gold, base HP, 18 spots, idle)", () => {
  const g = GCTD.createGame();
  assert.equal(g.gold, GCTD.START_GOLD);
  assert.equal(g.baseHp, GCTD.BASE_HP);
  assert.equal(g.state, "idle");
  assert.equal(g.spots.length, 18); // 3 lanes x 6 columns
  assert.equal(g.wave, 0);
});

test("wave composition is fixed: grunts ramp; brutes join from wave 4", () => {
  const w1 = GCTD.waveComposition(1);
  assert.equal(w1.length, 6);
  assert.ok(w1.every((t) => t === "grunt"), "wave 1 is all grunts");

  const w4 = GCTD.waveComposition(4);
  assert.equal(w4.length, 14);
  assert.equal(w4.filter((t) => t === "brute").length, 2);

  const w10 = GCTD.waveComposition(10);
  assert.equal(w10.length, 32);
  assert.equal(w10.filter((t) => t === "brute").length, 8);
});

test("placement: deducts gold, marks the spot, specific errors otherwise", () => {
  const g = GCTD.createGame();
  const goldBefore = g.gold;
  const tower = GCTD.placeTower(g, 0, "arrow");
  assert.equal(g.gold, goldBefore - GCTD.TOWERS.arrow.cost);
  assert.equal(g.spots[0].tower, tower);
  assert.equal(g.towers.length, 1);

  assert.throws(() => GCTD.placeTower(g, 0, "arrow"), (e) => /already has a tower/.test(e.message));
  assert.throws(() => GCTD.placeTower(g, 99, "arrow"), (e) => /unknown build spot/.test(e.message));
  assert.throws(() => GCTD.placeTower(g, 1, "laser"), (e) => /unknown tower type/.test(e.message));
  g.gold = 10;
  assert.throws(() => GCTD.placeTower(g, 1, "cannon"), (e) => /not enough gold \(need 100, have 10\)/.test(e.message));
});

test("placement is rejected after the game ends", () => {
  const g = GCTD.createGame();
  g.state = "lost";
  assert.throws(() => GCTD.placeTower(g, 0, "arrow"), (e) => /game is over/.test(e.message));
});

test("killing an enemy pays its fixed bounty", () => {
  const g = GCTD.createGame();
  GCTD.startWave(g);
  assert.ok(runUntil(g, () => g.enemies.length > 0), "an enemy should spawn");
  const victim = g.enemies.find((e) => e.type === "grunt");
  victim.hp = 1;
  // an arrow tower in the victim's lane (column 0, x=3) is within its 5.0 range
  // of the spawn point — it finishes the wounded grunt
  const spot = g.spots.find((s) => s.lane === victim.lane && s.col === 0);
  GCTD.placeTower(g, spot.index, "arrow");
  const goldBefore = g.gold;
  assert.ok(runUntil(g, () => !victim.alive, 600), "the victim should die");
  assert.equal(g.gold, goldBefore + GCTD.ENEMIES.grunt.bounty);
});

test("a cleared wave pays the fixed bonus and returns to idle", () => {
  const g = GCTD.createGame();
  // three arrow towers, one per lane, mid-board — enough to clear wave 1
  GCTD.placeTower(g, 2 * 3 + 0, "arrow");
  GCTD.placeTower(g, 2 * 3 + 1, "arrow");
  GCTD.placeTower(g, 2 * 3 + 2, "arrow");
  const goldBefore = g.gold;
  GCTD.startWave(g);
  assert.equal(g.state, "wave");
  assert.ok(runUntil(g, () => g.state !== "wave"), "wave 1 should clear");
  assert.equal(g.state, "idle");
  assert.equal(g.wave, 1);
  const events = drain(g);
  const clear = events.find((e) => e.type === "wave_clear");
  assert.ok(clear, "a wave_clear event fires");
  assert.equal(clear.bonus, GCTD.waveBonus(1));
  // gold = spent on towers + bounties + the wave bonus (no leaks with this build)
  assert.equal(g.baseHp, GCTD.BASE_HP, "no enemy should reach the base");
});

test("targeting: a tower fires at the most-advanced enemy in range", () => {
  const g = GCTD.createGame();
  GCTD.startWave(g);
  // spawn two grunts in the same lane, one ahead of the other, both in range
  const lane = 0;
  g.enemies.push({ id: g.nextId++, type: "grunt", lane, x: 2.0, hp: 999, maxHp: 999, slowTimer: 0, slowAmount: 0, alive: true });
  g.enemies.push({ id: g.nextId++, type: "grunt", lane, x: 4.5, hp: 999, maxHp: 999, slowTimer: 0, slowAmount: 0, alive: true });
  const tower = GCTD.placeTower(g, 0 * 3 + lane, "arrow"); // column 0 = x 3
  GCTD.update(g, STEP);
  const shot = g.projectiles[0];
  assert.ok(shot, "the tower should have fired");
  const advanced = g.enemies.find((e) => e.x > 3 && e.hp === 999 && e.id === shot.targetId);
  assert.ok(advanced, "the projectile targets the most-advanced enemy");
  assert.equal(shot.targetId, Math.max(...g.enemies.filter((e) => e.lane === lane && e.hp === 999).map((e) => e.id)) || shot.targetId);
  assert.equal(g.projectiles.length, 1); // one shot per tower per tick
  tower.cooldown = 999;
});

test("cannon splash: enemies near the impact point all take the hit", () => {
  const g = GCTD.createGame();
  GCTD.startWave(g);
  const lane = 1;
  // hp 10: a single 14-damage shot kills — the assertion is about WHO gets hit
  const a = { id: g.nextId++, type: "grunt", lane, x: 6.0, hp: 10, maxHp: 10, slowTimer: 0, slowAmount: 0, alive: true };
  const b = { id: g.nextId++, type: "grunt", lane, x: 7.2, hp: 10, maxHp: 10, slowTimer: 0, slowAmount: 0, alive: true }; // 1.2 apart, within splash 2.0
  g.enemies.push(a, b);
  GCTD.placeTower(g, 1 * 3 + lane, "cannon");
  assert.ok(runUntil(g, () => !a.alive || !b.alive, 600), "at least one should die");
  assert.ok(!a.alive && !b.alive, "splash damages BOTH enemies near the impact");
});

test("frost slow: enemy speed is reduced while slowed, then restored", () => {
  const g = GCTD.createGame();
  GCTD.startWave(g);
  const lane = 2;
  const e = { id: g.nextId++, type: "grunt", lane, x: 4.0, hp: 9999, maxHp: 9999, slowTimer: 0, slowAmount: 0, alive: true };
  g.enemies.push(e);
  const tower = GCTD.placeTower(g, 0 * 3 + lane, "frost");
  assert.ok(runUntil(g, () => e.slowTimer > 0, 600), "the frost projectile should land and apply a slow");
  const baseSpeed = GCTD.ENEMIES.grunt.speed;
  const slowedSpeed = baseSpeed * (1 - GCTD.TOWERS.frost.slow);
  tower.cooldown = 999; // isolate this tick
  const x0 = e.x;
  GCTD.update(g, STEP);
  assert.ok(Math.abs((e.x - x0) / STEP - slowedSpeed) < 1e-6, "slowed enemy moves at the reduced speed");
  tower.cooldown = 0;
  assert.ok(runUntil(g, () => e.slowTimer <= 0, 600), "the slow should expire");
  tower.cooldown = 999;
  const x1 = e.x;
  GCTD.update(g, STEP);
  assert.ok(Math.abs((e.x - x1) / STEP - baseSpeed) < 1e-6, "enemy returns to full speed after the slow");
});

test("leaks damage the base; base at 0 HP loses the game", () => {
  const g = GCTD.createGame();
  // undefended base: waves of 6/8/10/... grunts (1 dmg each, brutes 3) must
  // chip the 20 HP castle down across a few waves
  for (let w = 0; w < 5 && g.state !== "lost"; w++) {
    if (g.state !== "idle") break;
    GCTD.startWave(g);
    assert.ok(runUntil(g, () => g.state !== "wave", 60 * 60), "wave " + (w + 1) + " should end");
  }
  assert.equal(g.state, "lost", "the base should fall (baseHp " + g.baseHp + ")");
  assert.equal(g.baseHp, 0);
  const events = drain(g);
  const leak = events.find((e) => e.type === "leak");
  assert.ok(leak, "a leak event fires");
  assert.equal(leak.damage, GCTD.ENEMIES.grunt.baseDamage);
  assert.ok(events.some((e) => e.type === "lose"), "a lose event fires");
  // the game is over: further updates are a no-op
  const before = JSON.stringify([g.gold, g.baseHp, g.enemies.length]);
  GCTD.update(g, STEP);
  assert.equal(JSON.stringify([g.gold, g.baseHp, g.enemies.length]), before);
});

test("autoplay: a fixed build wins all 10 waves (winnable balance; win state reached)", () => {
  const g = GCTD.createGame();
  // open with one arrow per lane at the middle of the board
  GCTD.placeTower(g, 2 * 3 + 0, "arrow");
  GCTD.placeTower(g, 2 * 3 + 1, "arrow");
  GCTD.placeTower(g, 2 * 3 + 2, "arrow");
  const buildOrder = [
    2 * 3 + 0, 2 * 3 + 1, 2 * 3 + 2, // taken
    3 * 3 + 0, 3 * 3 + 1, 3 * 3 + 2,
    1 * 3 + 0, 1 * 3 + 1, 1 * 3 + 2,
    4 * 3 + 0, 4 * 3 + 1, 4 * 3 + 2,
    1 * 3 + 0, 0 * 3 + 0, 5 * 3 + 0, 0 * 3 + 1, 5 * 3 + 1, 0 * 3 + 2, 5 * 3 + 2,
  ];
  for (let wave = 1; wave <= GCTD.TOTAL_WAVES; wave++) {
    if (g.state !== "idle") break;
    GCTD.startWave(g);
    // spend surplus on more arrows (greedy; the game stays deterministic)
    for (const s of buildOrder) {
      if (g.state !== "wave" && g.state !== "idle") break;
      try { GCTD.placeTower(g, s, "arrow"); } catch { /* occupied or unaffordable */ }
      if (g.gold < GCTD.TOWERS.arrow.cost) break;
    }
    assert.ok(
      runUntil(g, () => g.state !== "wave", 60 * 60 * 3),
      "wave " + wave + " should end (clear or loss)"
    );
  }
  assert.equal(g.state, "won", "the fixed build should survive all 10 waves (gold " + g.gold + ", baseHp " + g.baseHp + ", wave " + g.wave + ")");
  assert.equal(g.wave, GCTD.TOTAL_WAVES);
  assert.equal(g.baseHp > 0, true, "the base should still stand");
});

test("determinism: identical input sequences produce identical games", () => {
  const play = () => {
    const g = GCTD.createGame();
    GCTD.placeTower(g, 2 * 3 + 0, "arrow");
    GCTD.placeTower(g, 2 * 3 + 1, "arrow");
    GCTD.startWave(g);
    const events = [];
    for (let i = 0; i < 60 * 10 && g.state === "wave"; i++) {
      GCTD.update(g, STEP);
      events.push(...gameEvents(g));
    }
    return { gold: g.gold, baseHp: g.baseHp, enemies: g.enemies.map((e) => [e.id, e.x, e.hp]), events: events.map((e) => e.type) };
  };
  function gameEvents(g) { const e = g.events.splice(0); return e; }
  assert.deepEqual(play(), play());
});
