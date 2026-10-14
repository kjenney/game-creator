// td-core.js — the tower-defense game logic (T4): PURE, zero Babylon/DOM.
// UMD-lite like gc-contract.js: CJS in Node (headless gameplay tests), else
// global.GCTD on a classic-script file:// page. The Template owns ALL rules
// and balance here (ADR 0001) — the view layer in game.js is a skin on this
// state, so swapping models changes appearance, never gameplay.
//
// Deterministic: no Math.random, no timestamps. update(game, dt) is the only
// mutator; the browser passes clamped real time, Node tests pass fixed steps.
(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") module.exports = factory();
  else Object.assign(global.GCTD = global.GCTD || {}, factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- fixed design (the Template's balance; not an Option per ADR 0001) ----
  var LANES = 3;
  var LANE_Z = [-2.5, 0, 2.5];            // world z of each lane
  var COLS = 6;                           // build columns
  var COL_X = [3, 6, 9, 12, 15, 18];      // world x of each column
  var LANE_START_X = -1.5;                // enemies spawn here
  var LANE_END_X = 23.5;                  // reaching this x = leak into the base
  var BASE_HP = 20;
  var START_GOLD = 200;
  var TOTAL_WAVES = 10;
  var SPAWN_INTERVAL = 1.1;               // seconds between enemy spawns
  var FIRST_SPAWN_DELAY = 0.3;

  // targeting (all towers): the most-advanced (max x) enemy in range
  var TOWERS = {
    arrow:  { name: "Arrow",  cost: 50,  range: 5.0, cooldown: 0.5, damage: 6,  projectileSpeed: 20, splash: 0,   slow: 0,    slowDuration: 0 },
    cannon: { name: "Cannon", cost: 100, range: 4.5, cooldown: 1.2, damage: 14, projectileSpeed: 11, splash: 2.0, slow: 0,    slowDuration: 0 },
    frost:  { name: "Frost",  cost: 75,  range: 4.5, cooldown: 0.8, damage: 3,  projectileSpeed: 14, splash: 0,   slow: 0.45, slowDuration: 2.0 }
  };
  var ENEMIES = {
    grunt: { name: "Grunt", hp: 25,  speed: 2.0, bounty: 8,  baseDamage: 1 },
    brute: { name: "Brute", hp: 120, speed: 1.1, bounty: 20, baseDamage: 3 }
  };
  var waveBonus = function (wave) { return 15 + 5 * wave; };

  // fixed wave composition: grunts ramp every wave; brutes join from wave 4.
  // one brute every third spawn slot, then the rest fill with whatever remains.
  function waveComposition(wave) {
    var grunts = 4 + 2 * wave;
    var brutes = wave >= 4 ? wave - 2 : 0;
    var seq = [], g = 0, total = grunts + brutes; // total fixed up front: the bound must not shrink
    for (var i = 0; i < total; i++) {
      if (brutes > 0 && g < grunts && i > 0 && i % 3 === 0) { seq.push("brute"); brutes--; }
      else if (g < grunts) { seq.push("grunt"); g++; }
      else { seq.push("brute"); brutes--; }
    }
    return seq;
  }

  // build spots: col * LANES + lane (fixed world coords; hitboxes are these
  // spots, never the models' geometry)
  var SPOTS = [];
  (function () {
    for (var c = 0; c < COLS; c++) {
      for (var l = 0; l < LANES; l++) SPOTS.push({ index: c * LANES + l, col: c, lane: l, x: COL_X[c], z: LANE_Z[l] });
    }
  })();

  function createGame() {
    return {
      state: "idle", // idle (between waves) | wave | won | lost
      wave: 0,       // waves completed
      waveNumber: 0, // current wave in progress (1-based)
      gold: START_GOLD,
      baseHp: BASE_HP,
      spots: SPOTS.map(function (s) { return { index: s.index, col: s.col, lane: s.lane, x: s.x, z: s.z, tower: null }; }),
      towers: [],
      enemies: [],
      projectiles: [],
      spawnQueue: [],
      spawnTimer: 0,
      spawnCount: 0,
      events: [],
      time: 0,
      nextId: 1
    };
  }

  function enemyById(game, id) {
    for (var i = 0; i < game.enemies.length; i++) if (game.enemies[i].id === id) return game.enemies[i];
    return null;
  }
  function dist(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

  // ---- placement (the economy's spend side) ----
  function placeTower(game, spotIndex, type) {
    if (game.state === "won" || game.state === "lost") throw new Error("the game is over");
    var spot = game.spots[spotIndex];
    if (!spot) throw new Error("unknown build spot " + spotIndex);
    var spec = TOWERS[type];
    if (!spec) throw new Error("unknown tower type " + type);
    if (spot.tower) throw new Error("that spot already has a tower");
    if (game.gold < spec.cost) throw new Error("not enough gold (need " + spec.cost + ", have " + game.gold + ")");
    game.gold -= spec.cost;
    var tower = {
      id: game.nextId++, type: type, spot: spot.index,
      x: spot.x, z: spot.z, lane: spot.lane,
      cooldown: 0, aim: 0
    };
    spot.tower = tower;
    game.towers.push(tower);
    game.events.push({ type: "place", towerId: tower.id, towerType: type, x: spot.x, z: spot.z });
    return tower;
  }

  // ---- waves ----
  function startWave(game) {
    if (game.state === "won" || game.state === "lost") throw new Error("the game is over");
    if (game.state === "wave") throw new Error("a wave is already underway");
    if (game.wave >= TOTAL_WAVES) throw new Error("all waves are complete");
    game.state = "wave";
    game.waveNumber = game.wave + 1;
    game.spawnQueue = waveComposition(game.waveNumber).slice();
    game.spawnTimer = FIRST_SPAWN_DELAY;
    game.spawnCount = 0;
    game.events.push({ type: "wave_start", wave: game.waveNumber });
    return game.waveNumber;
  }

  // ---- damage / economy (the earn side) ----
  function dealDamage(game, enemy, dmg) {
    if (!enemy.alive) return;
    enemy.hp -= dmg;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      game.gold += ENEMIES[enemy.type].bounty;
      game.events.push({ type: "kill", enemyId: enemy.id, enemyType: enemy.type, x: enemy.x, z: LANE_Z[enemy.lane] });
    }
  }

  // ---- the tick ----
  function update(game, dt) {
    if (game.state === "won" || game.state === "lost") return;
    game.time += dt;

    // 1. spawn queued enemies (round-robin lanes)
    if (game.state === "wave" && game.spawnQueue.length) {
      game.spawnTimer -= dt;
      while (game.spawnTimer <= 0 && game.spawnQueue.length) {
        var type = game.spawnQueue.shift();
        var lane = game.spawnCount % LANES;
        game.spawnCount++;
        var spec = ENEMIES[type];
        game.enemies.push({
          id: game.nextId++, type: type, lane: lane, x: LANE_START_X,
          hp: spec.hp, maxHp: spec.hp,
          slowTimer: 0, slowAmount: 0, alive: true
        });
        game.spawnTimer += SPAWN_INTERVAL;
      }
    }

    // 2. enemies advance (slowed by Frost); reaching the end leaks into the base
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (!e.alive) continue;
      var speed = ENEMIES[e.type].speed;
      if (e.slowTimer > 0) { e.slowTimer -= dt; speed *= (1 - e.slowAmount); }
      e.x += speed * dt;
      if (e.x >= LANE_END_X) {
        e.alive = false;
        var dmg = ENEMIES[e.type].baseDamage;
        game.baseHp -= dmg;
        game.events.push({ type: "leak", enemyId: e.id, enemyType: e.type, damage: dmg, x: LANE_END_X, z: LANE_Z[e.lane] });
        if (game.baseHp <= 0) {
          game.baseHp = 0;
          game.state = "lost";
          game.events.push({ type: "lose", baseHp: 0 });
          return;
        }
      }
    }

    // 3. towers acquire the most-advanced enemy in range and fire
    for (var t = 0; t < game.towers.length; t++) {
      var tower = game.towers[t];
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      var tspec = TOWERS[tower.type];
      var best = null;
      for (var j = 0; j < game.enemies.length; j++) {
        var en = game.enemies[j];
        if (!en.alive) continue;
        if (dist(tower.x, tower.z, en.x, LANE_Z[en.lane]) > tspec.range) continue;
        if (!best || en.x > best.x) best = en;
      }
      if (!best) continue;
      tower.cooldown = tspec.cooldown;
      tower.aim = Math.atan2(LANE_Z[best.lane] - tower.z, best.x - tower.x);
      game.projectiles.push({
        id: game.nextId++, kind: tower.type,
        x: tower.x, z: tower.z,
        targetId: best.id, lastX: best.x, lastZ: LANE_Z[best.lane],
        speed: tspec.projectileSpeed, damage: tspec.damage,
        splash: tspec.splash, slow: tspec.slow, slowDuration: tspec.slowDuration
      });
      game.events.push({ type: "shoot", towerId: tower.id, towerType: tower.type, x: tower.x, z: tower.z, targetId: best.id });
    }

    // 4. projectiles home in; on arrival: splash or single-target hit
    for (var p = game.projectiles.length - 1; p >= 0; p--) {
      var pr = game.projectiles[p];
      var target = enemyById(game, pr.targetId);
      var tx = target && target.alive ? target.x : pr.lastX;
      var tz = target && target.alive ? LANE_Z[target.lane] : pr.lastZ;
      if (target && target.alive) { pr.lastX = target.x; pr.lastZ = LANE_Z[target.lane]; }
      var d = dist(pr.x, pr.z, tx, tz);
      var step = pr.speed * dt;
      if (d <= step) {
        pr.x = tx; pr.z = tz;
        if (pr.splash > 0) {
          for (var k = 0; k < game.enemies.length; k++) {
            var victim = game.enemies[k];
            if (victim.alive && dist(tx, tz, victim.x, LANE_Z[victim.lane]) <= pr.splash) dealDamage(game, victim, pr.damage);
          }
          game.events.push({ type: "impact", x: tx, z: tz, radius: pr.splash });
        } else {
          if (target && target.alive) {
            dealDamage(game, target, pr.damage);
            if (pr.slow > 0 && target.alive) { target.slowAmount = pr.slow; target.slowTimer = pr.slowDuration; }
          }
          game.events.push({ type: "impact", x: tx, z: tz, radius: 0 });
        }
        game.projectiles.splice(p, 1);
      } else {
        pr.x += ((tx - pr.x) / d) * step;
        pr.z += ((tz - pr.z) / d) * step;
      }
    }

    // 5. sweep the dead
    game.enemies = game.enemies.filter(function (e) { return e.alive; });

    // 6. wave end → bonus, next idle, or victory
    if (game.state === "wave" && !game.spawnQueue.length && !game.enemies.length) {
      game.wave = game.waveNumber;
      var bonus = waveBonus(game.wave);
      game.gold += bonus;
      game.events.push({ type: "wave_clear", wave: game.wave, bonus: bonus });
      if (game.wave >= TOTAL_WAVES) {
        game.state = "won";
        game.events.push({ type: "win", gold: game.gold });
      } else {
        game.state = "idle";
      }
    }
  }

  return {
    // fixed design (read-only for the view/tests)
    LANES: LANES, LANE_Z: LANE_Z, COLS: COLS, COL_X: COL_X,
    LANE_START_X: LANE_START_X, LANE_END_X: LANE_END_X, BASE_X: 25,
    BASE_HP: BASE_HP, START_GOLD: START_GOLD, TOTAL_WAVES: TOTAL_WAVES,
    SPAWN_INTERVAL: SPAWN_INTERVAL,
    TOWERS: TOWERS, ENEMIES: ENEMIES, SPOTS: SPOTS,
    waveBonus: waveBonus, waveComposition: waveComposition,
    // API
    createGame: createGame, placeTower: placeTower, startWave: startWave, update: update
  };
});
