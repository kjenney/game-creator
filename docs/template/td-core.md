# td-core.js — the rules engine

`bundle/js/td-core.js` is the tower-defense game logic: **pure, zero
Babylon, zero DOM** (T4). It's UMD-lite like the contract — CJS in Node
(headless gameplay tests), `global.GCTD` in the `file://` page. The Template
owns **all** rules and balance here (ADR 0001); the view in `game.js` is a
skin on this state, so swapping models changes appearance, never gameplay.

**Deterministic**: no `Math.random`, no timestamps. `update(game, dt)` is the
only mutator — the browser passes clamped real time, Node tests pass fixed
steps, and identical input sequences produce identical games (asserted by the
suite).

## API

```js
GCTD.createGame()                    // fresh state
GCTD.placeTower(game, spotIndex, type)
GCTD.startWave(game)
GCTD.update(game, dt)                // the tick
GCTD.waveComposition(wave)           // fixed spawn sequence for a wave
GCTD.waveBonus(wave)                 // gold bonus for clearing a wave
// read-only fixed design:
GCTD.LANES, GCTD.LANE_Z, GCTD.COLS, GCTD.COL_X, GCTD.SPOTS,
GCTD.LANE_START_X, GCTD.LANE_END_X, GCTD.BASE_X,
GCTD.BASE_HP, GCTD.START_GOLD, GCTD.TOTAL_WAVES, GCTD.SPAWN_INTERVAL,
GCTD.TOWERS, GCTD.ENEMIES
```

## The fixed design

| Constant | Value |
|---|---|
| Lanes | 3 (z = −2.5, 0, +2.5) |
| Build columns | 6 (x = 3, 6, 9, 12, 15, 18) → **18 spots** |
| Enemy path | x = −1.5 (spawn) → x = 23.5 (leak) |
| Base | x = 25, 20 HP |
| Starting gold | 200 |
| Total waves | 10 |
| Spawn interval | 1.1 s (first spawn after 0.3 s), round-robin across lanes |

**Towers** (targeting: the most-advanced enemy in range, i.e. max x):

| Type | Cost | Range | Cooldown | Damage | Special |
|---|---|---|---|---|---|
| Arrow | 50 | 5.0 | 0.5 s | 6 | — |
| Cannon | 100 | 4.5 | 1.2 s | 14 | splash radius 2.0 |
| Frost | 75 | 4.5 | 0.8 s | 3 | 45% slow for 2.0 s |

**Enemies**:

| Type | HP | Speed | Bounty | Leak damage |
|---|---|---|---|---|
| Grunt | 25 | 2.0 | 8 | 1 |
| Brute | 120 | 1.1 | 20 | 3 |

**Waves**: `waveComposition(wave)` — `4 + 2×wave` grunts plus `wave − 2`
brutes (from wave 4), interleaved with one brute every third spawn slot. The
total is fixed up front so the spawn bound can't shrink mid-wave.

## State shape (`createGame`)

```js
{
  state: "idle" | "wave" | "won" | "lost",
  wave, waveNumber,
  gold, baseHp,
  spots: [ { index, col, lane, x, z, tower } ],   // 18; the hitboxes
  towers: [], enemies: [], projectiles: [],
  spawnQueue: [], spawnTimer, spawnCount,
  events: [],        // the view's input queue (drained per frame by game.js)
  time, nextId
}
```

Build spots are **fixed world coordinates — hitboxes, never the models'
geometry**. Swapping a model Option never moves a hitbox.

## `update(game, dt)` — the tick, in order

1. **Spawn** queued enemies (round-robin lanes) while the wave is active.
2. **Advance** enemies (Frost-slowed ones move at `speed × (1 − slow)`); an
   enemy reaching x ≥ 23.5 leaks: base takes its damage, and at 0 HP the game
   is `lost`.
3. **Fire**: each off-cooldown tower acquires the most-advanced in-range
   enemy, sets its aim angle, and spawns a homing projectile.
4. **Projectiles** home in on their target (falling back to the target's last
   known position if it dies in flight); on arrival they deal single-target
   or splash damage, apply slows, and emit an `impact`.
5. **Sweep** the dead.
6. **Wave end**: when the queue is empty and no enemies remain — award the
   bonus, return to `idle`, or `won` at wave 10.

Mutations push to `game.events`; they don't call into the view.

## Event log

The view layer drains `game.events` each frame and reacts to:

| Event | Carries | View response |
|---|---|---|
| `place` | towerId, towerType, x, z | spawn tower model, dust puff, `place` sound, HUD refresh |
| `wave_start` | wave | `wave` sound, HUD/start refresh |
| `shoot` | towerId, towerType, targetId | `shoot_<type>` sound |
| `impact` | x, z, radius | puff / splash ring, `hit` sound (splash) |
| `kill` | enemyId, enemyType, x, z | death puff, `kill` sound, bounty HUD refresh |
| `leak` | enemyId, damage, x, z | red ring, `leak` sound, base HUD refresh |
| `wave_clear` | wave, bonus | toast, `wave` sound, HUD refresh |
| `win` | gold | victory overlay, `win` sound |
| `lose` | baseHp | defeat overlay, `lose` sound |

## Tests

The `td-core.test.js` suite (see [testing/unit.md](../testing/unit.md))
asserts the rules
headlessly: fixed starting state, fixed wave composition, placement errors,
bounties and wave bonuses, most-advanced targeting, cannon splash, frost
slow, leak/lose, a full **win** on a fixed build (winnable balance), and
determinism under identical input.
