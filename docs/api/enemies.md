# Enemies & bosses — API guide (module: enemies)

Files: `src/entities/enemy_base.js` (`G.Enemy`, behaviour toolkit, `G.registerEnemy`, entity type
`enemy`, `G.Projectile` + `projectile`, `G.warnZone` + `telegraph`), `src/entities/boss_base.js`
(`G.Boss`, entity type `arena`, placeholder boss `boss_test`), `src/entities/enemies/shore.js`
(`ash_crawler`, `ash_fly`: reference implementations), `tools/enemy_selftest.js` (self-test + **lab
mode for your own enemies/bosses**, §11).

Load order (index.html): `enemy_base.js` → `boss_base.js` → … → `enemies/<region>.js` →
`bosses/<boss>.js`. Region and boss files may therefore use `G.Enemy`/`G.Boss` at load time (still
guard with `if (!G.Enemy) return;` so a broken base never cascades).

Contents: 1 Quick start · 2 Placement · 3 Config · 4 Lifecycle & hooks · 5 Behaviour toolkit ·
6 Projectiles & warning zones · 7 Drawing · 8 Design rules (telegraphs, HP, damage, cinders) ·
9 Complete example enemies · 10 Bosses (+ complete example) · 11 Arena controller · 12 Events ·
13 Testing (lab mode) · 14 Checklist & pitfalls.

All the code in §9 and §10.7 is executed by `node tools/enemy_selftest.js` (check "docs: …"), so it
is known to work — copy it.

---

## 1. Quick start

```js
// src/entities/enemies/guttered.js
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G.Enemy) return;
  const TILE = G.CONST.TILE;                 // 40 px

  class SnuffedWalker extends G.Enemy {
    constructor(props) {
      super(props, { hp: 18, w: 34, h: 56, cinders: [3, 6] });   // config (§3); everything else defaulted
    }
    init() { super.init(); this.setState('walk'); }               // always call super.init()
    think(dt) {                                                   // AI, every step unless stunned/dying
      this.patrol(55);                                            // turns at walls, ledges, hazards
    }
    drawBody(ctx, t) { /* art, world space; see §7 */ }
  }
  G.registerEnemy('snuffed_walker', SnuffedWalker);
})();
```

The base class does the rest: gravity + collisions (`G.Physics.move`), knockback, white hit flash,
hit-stun, sparks/wax particles, `enemy_hit`, hitstop on nail hits, contact damage, death (wax melt →
puddle, Pall smoke, `enemy_die`, cinders, `enemyKilled`), unique-enemy persistence, spawn safety
and room-bounds safety.

---

## 2. Placement (room data)

```js
{ type: 'enemy', kind: 'snuffed_walker', x: 20, y: 14 }                 // x/y = tile col/row in room data
{ type: 'enemy', kind: 'snuffed_lancer', x: 31, y: 9, facing: 'left' }  // facing: 'left'|'right'|1|-1 (default random)
{ type: 'enemy', kind: 'moth_knight', x: 40, y: 14, id: 'mw_u1', persistent: true }  // unique: stays dead
{ type: 'enemy', kind: 'wick_crawler', x: 12, y: 3, surface: 'ceiling' }           // crawler start surface
{ type: 'enemy', kind: 'drip_fly', x: 25, y: 6, hp: 30, cinders: [8, 12] }          // per-placement overrides
```

- **Anchoring** (TECH_SPEC §7.5): ground enemies stand with their feet on the bottom edge of the
  marker tile, horizontally centred; flyers (`flying: true`) are centred on the tile. Put ground
  markers on the row **directly above** the floor. Override with `cfg.anchor` (`'ground' | 'center'
  | 'top' | 'tile'`).
- Generic props the base reads: `kind`, `facing` / `flip`, `id` + `persistent`, `hp`, `cinders`,
  `noDrops`, `surface` (crawlers: `'floor' | 'left' | 'right' | 'ceiling'`, slides the body up to one
  tile onto that surface). Anything else is yours: read `this.props.<name>` (e.g. `range`, `speed`).
- **Unique enemies**: `id: '<prefix>_u<n>'` + `persistent: true` → on death the flag
  `dead:<id>` is set and the room never spawns it again. Regular enemies respawn on every room load.
- Unknown `kind` → `G.reportError` once (per kind) and nothing spawns.
- From code: `G.Enemy.spawn(room, kind, tx, ty, props)` or
  `room.spawn({type:'enemy', kind, tx, ty})`. Tests: `G.debug.spawn({type:'enemy', kind, tx, ty})`.

---

## 3. Config (second argument of `super(props, cfg)`)

| key | default | meaning |
|---|---|---|
| `hp` | 10 | health (§8.2). `this.hp`, `this.maxHp` |
| `w`, `h` | 32, 32 | body box in px = hurtbox (player hits it) and, inset, contact box. Player is 26×54 |
| `contactDamage` | 1 | damage on touch (0 = harmless body). `this.contactDamage` can change at runtime |
| `contactInset` | 3 | contact box = body box shrunk by this many px (forgiving) |
| `cinders` | `[2, 5]` | `[min, max]` (inclusive) or a number; 0 = none (§8.4) |
| `weight` | 1 | knockback divisor: 0.5 light · 1 normal · 2 heavy · ≥ 10 immovable |
| `knockback` | 320 | base knockback speed (px/s) before `/ weight` |
| `hitStun` | null | AI pause per hit (s); `null` → 0.12 s if `weight <= 1`, else 0 |
| `gravity` | 1 | × `G.CONST.GRAVITY` (2600 px/s²); 0 = floats |
| `flying` | false | no gravity, centre anchor, 2-axis knockback, corpse falls and melts on landing |
| `physics` | `'auto'` | `'auto'`: the base integrates `vx/vy` each step. `'manual'`: you move the body (crawlers, scripted movers) |
| `sight` | 8 tiles | default `canSee()` range (px) |
| `hurtable` | true | false = immune (the player's slash passes through) |
| `pogoable` | true | down-slash bounces off it |
| `hitstop` | 0.03 | freeze on connecting nail hits (s) |
| `hitSound`, `deathSound` | `'enemy_hit'`, `'enemy_die'` | sfx names |
| `colors` | grey Snuffed | `{body, dark, hit, puddle, smoke, tele}` — used by particles, puddle, telegraph glow |
| `meltTime`, `puddleTime` | 0.55, 2.6 | death: body melts (s), puddle lingers (s), then fades 0.6 s |
| `puddleW` | 0.75 × w | puddle half-width (px) |
| `light` | null | `{r, color, intensity, dx, dy, flicker}` — a light following the enemy (dx mirrors with facing) |
| `z` | -1 | draw order (player 0; negative = behind the player) |
| `minTelegraph` | 0.35 | lower clamp for `telegraph()` (bosses 0.25) |
| `noSpawnShift` | false | true = never nudged sideways when spawning on the player (contact grace only) |
| `anchor` | auto | placement anchor (§2) |

Runtime fields you will use: `x y w h vx vy cx cy bottom right facing (±1) hp maxHp state stateTime
stateData grounded landed (true on the landing step) wallHit (±1 / 0) ceilHit airborne home {x,y}
(spawn centre) t (age, s) seed (random 0..1000) player room hidden dying minions cfg colors`.

---

## 4. Lifecycle & hooks

`update(dt)` is owned by the base — **do not override it**; put AI in `think(dt)`. Per step:

1. dying → death animation only (`updateDeath`), return.
2. first step: spawn safety (never start overlapping the player: nudged up to 12 × 16 px sideways
   onto valid floor, else contact damage is suspended until the player has left).
3. timers: hit flash, `cooldown()`s, telegraph, `stateTime`.
4. `stun > 0` (hit-stun) → `whileStunned(dt)`; otherwise **`think(dt)`**.
5. `physicsStep(dt)` (unless `physics: 'manual'`): gravity, knockback, `G.Physics.move`, sets
   `grounded / landed / wallHit / ceilHit`.
6. `keepInRoom()`: never leaves through side openings; `fellOut()` (default: silent `remove()`, no
   drops) when > 60 px below the room.
7. `cfg.light` is registered.

| hook (optional) | when |
|---|---|
| `init()` | after being added to the room; call `super.init()` first (sets `home`, state `'idle'`) |
| `think(dt)` | AI each step (not while stunned / dying) |
| `whileStunned(dt)` | each step of hit-stun (e.g. keep a wing flap going) |
| `onEnter(state, prev)` / `onExit(prev, next)` | around every `setState` |
| `onTurn()` | `patrol()` turned around |
| `onHurt(hit, dmg)` | after damage was applied (before death check) |
| `modifyDamage(dmg, hit)` | return reduced damage (armour, shields); **0 = deflect** (spark + clink, the hit still "connects": player recoil, no damage) |
| `onDeath(hit)` | right after the death started (drops already spawned) |
| `fellOut()` | fell out of the room (default `remove()`) |
| `drawBody(ctx, t)` | **your art** (§7) |
| `drawCorpse(ctx, t)` | pose while dead (default `drawBody`) — use for closed eyes / limp wings |
| `drawBounds()` | world rect containing all body art (hit-flash buffer) |
| `eye()` | line-of-sight / projectile origin (default: centre x, 35 % from the top) |
| `hurtRect()` / `contactRect()` | custom hurt / contact boxes (return `null` = none) |

`hit` objects (TECH_SPEC §10): `{damage, kind: 'nail'|'spell'|'plunge'|'trail'|'thorns', dir:{x,y},
source, pogo}`. `onHit` is implemented by the base; override only to filter, and call `super.onHit(hit)`.

`kill()` = instant death (scripts, `G.debug.killAll()`). `remove()` = vanish without death/drops.

---

## 5. Behaviour toolkit

All methods are on `this`. Distances in px, speeds in px/s, times in s. Default target = the player.

### 5.1 State machine & timers
```js
this.setState('windup', { dir: 1 });  // resets stateTime, once()-keys and the melee strike id; data → this.stateData
this.is('windup')                     // state test
this.stateTime                        // seconds in the current state
this.at(0.4)                          // true on exactly ONE step: when stateTime crosses 0.4 (timelines)
this.once('fire')                     // true the first time it is asked in this state
this.every(0.25, offset)              // true each 0.25 s within the state
this.cooldown('spit', 2); this.ready('spit')   // named cooldowns (tick even while in other states)
```
A timeline in one state:
```js
case 'volley':
  this.stop();
  if (this.once('tele')) this.stateData.w = this.telegraph(0.45);
  for (let i = 0; i < 3; i++) if (this.at(this.stateData.w + i * 0.2)) this.shootAt('orb', null, { speed: 300 });
  if (this.stateTime > this.stateData.w + 0.9) this.setState('idle');
  break;
```

### 5.2 Queries
```js
this.dx() / this.dy()            // target centre − my centre
this.dist(), this.dirTo()        // distance; ±1 toward the target
this.face(target)                // turn toward it (dead zone 4 px)
this.canSee(target, range)       // range (default cfg.sight) + G.Physics.raycast from eye() to the target's centre or head
this.targetable(p)               // player exists, alive, not hidden, game in 'play' mode
this.overlapsPlayer(pad)
this.wallAhead(dir) / ledgeAhead(dir) / hazardAhead(dir)
this.blockedAhead(dir, {ledges, hazards})  // wall, room edge, ledge (unless ledges:false), spikes/lava/water (unless hazards:false)
this.solidAt(x, y), this.platformAt(x, y)
```

### 5.3 Ground movement (gravity bodies)
```js
this.patrol(speed, { pause: 0.4, range: 5 * TILE, ledges: true, hazards: true })  // → true on the turning step; calls onTurn()
this.approach(target, speed, { stop: 60, ledges: true })   // walk toward; stops at ledges/walls/within `stop`
this.flee(target, speed, { faceAway })                     // walk away; false when cornered
this.charge(speed, { dir, ledges })                         // dash; returns true (and stops) when blocked
this.stop(rate)                                             // brake (rate px/s², omitted = instant)
this.hop(vx, vy, force)                                     // jump (only when grounded unless force)
this.leapTo(x, footY, apex, { maxVx })                      // arc solver: feet land at (x, footY), apex px above the higher end → {vx, vy, t}
```
Patrollers never walk off ledges or into hazards unless you pass `ledges:false` / `hazards:false`.
`this.landed` is true on the step a fall (> 220 px/s) ends — use it for landing dust/shake.

### 5.4 Flying
```js
this.flyTo(tx, ty, speed, dt, { accel: 600, arrive: 60, look: 70, avoid: 1.4 })  // steering + arrival + 3 feeler rays (walls); → distance
this.hover(hx, hy, dt, { amp: 14, freq: 0.5, speed: 70 })  // figure-8 drift around a point (default home)
this.bob(amp, freq)                                         // sine offset, desynced per enemy (add to target y)
```
Flyers are knocked back on both axes (an up-slash pushes them up); their corpse tumbles, falls and
melts on the floor.

### 5.5 Surface crawler (floors, walls, ceilings, around corners)
```js
constructor(props) { super(props, { w: 24, h: 24, physics: 'manual', /* ... */ }); this.crawlDir = 1; }
think(dt) { this.crawl(70, dt); }                 // → 'inner' | 'outer' | 'reverse' | 'fall' | null
drawBody(ctx, t) { ctx.save(); this.crawlTransform(ctx); /* draw centred at 0,0, local floor below (+y) */ ctx.restore(); }
```
Body must be square (`w === h`). `this.surf` = unit vector toward the surface, `this.crawlDir` = ±1
(reverse it to turn around), `this.crawlAngle` = smoothed rotation. Wraps outer corners, climbs inner
corners, reverses at platform/room edges, falls and re-attaches when the surface disappears. Manual
physics → no knockback (hit-stun still applies).

### 5.6 Ambush
```js
init() { super.init(); this.hide(); this.setState('lurk'); }   // hidden: not hurtable, no contact damage
think() {
  if (this.is('lurk') && this.ambushReady(3 * TILE, { vRange: 2 * TILE, sight: true })) { this.reveal(); this.setState('burst'); }
}
drawBody(ctx, t) { if (this.hidden) { /* draw only the lure / a bump in the floor */ return; } /* ... */ }
```

### 5.7 Telegraphs & melee
```js
const w = this.telegraph(0.5, { color, shake: 1.6, glint: true, sound: 'enemy_windup', vol, x, y });
// body shake + four-point glint + pulsing glow at the eye (or x,y) + wind-up sfx; returns the duration
// actually used (clamped to >= minTelegraph unless {force:true}). Time your attack with the return value.
this.telegraphing                  // true during the wind-up (use it in drawBody: crouch, raise the weapon)
this.strike(rect, { damage: 1, dir, id })   // enemy hitbox via G.Combat.attack; ONE hit per state unless you pass id
```

### 5.8 Ranged
```js
this.shootAt('orb', target, { speed: 320, lead: 0.5, spread: 0.2, x, y, color, damage, destroyable })
this.aimAt(target, speed, { lead, x, y })   // → {vx, vy, angle}
this.lob('glob', target, { time: 0.9, gravity, x, y })   // arcs onto the target (time default from distance)
this.fire('shard', { x, y, vx, vy, ...projectileProps })  // raw spawn (owner = this, plays 'projectile' unless sound:false)
```
Origins default to `eye()`. `lead` 0..1 predicts the player's motion (0 = aim at current position).

### 5.9 Minions & room helpers
```js
this.summon('ash_fly', x, y, props)  // spawns an enemy (no drops, tracked; feet at y / centred for flyers)
this.liveMinions()                   // count alive; this.killMinions() (bosses do it on defeat)
G.Enemy.solveJump(dx, dy, g, apex), G.Enemy.solveArcTime(dx, dy, g, time), G.Enemy.aim(x, y, target, speed, lead)
G.Enemy.kinds(), G.Enemy.isKind(k), G.Enemy.classOf(k), G.Enemy.MIN_TELEGRAPH
```

---

## 6. Projectiles & warning zones

```js
G.spawnProjectile(room, kind, props) → projectile        // or this.fire / shootAt / lob
G.clearProjectiles(room)                                 // burst all enemy projectiles (phase changes)
G.registerProjectile(kind, Class, defaults)              // your own kinds
```
Ready kinds: **`orb`** (glowing ball + trail, r 9, no gravity, homing-capable), **`glob`** (arcing
wax gob, gravity 1250, splats), **`shard`** (fast pointed sliver, r 6), **`wave`** (ground
shockwave: `{x: centre x, y: floor y, dir: ±1, speed: 420, w: 30, h: 46}`; runs along the floor,
stops at walls/ledges, hurts but keeps going — jump it).

Props: `x, y` (centre px), `vx, vy`, `damage` (1), `gravity` (px/s²), `life` (s), `r` (radius),
`color`, `destroyable` (the Brand pops it, no ember), `terrain` (false = passes through walls),
`homing` (rad/s turn rate), `maxSpeed`, `light` (default true), `owner`, `onBurst(proj, why)` with
`why` ∈ `'terrain' | 'player' | 'hit' | 'expire' | 'clear'`.
Projectiles hurt the player through `G.Combat.hurtPlayer` (i-frames respected: an invulnerable
player is passed through). Custom kind:
```js
class Spore extends G.Projectile {
  draw(ctx, t) { /* world space; this.cx, this.cy, this.r, this.vx, this.vy, this.age */ }
  burstFx(why) { super.burstFx(why); /* extra particles */ }
}
G.registerProjectile('spore', Spore, { r: 7, gravity: 300, life: 5, color: '#c8e070', damage: 1 });
```

Warning zones (harmless pulsing areas: debris columns, heated floor, spike rows):
```js
G.warnZone(room, { x, y, w, h, dur: 0.8, color: '#ffcf8a', style: 'rect'|'column'|'floor'|'circle',
                   onDone: (zone) => { /* spawn the real hazard here */ } });   // bosses: this.warnZone({...})
```

### 6.1 Telegraphs by difficulty mode (easy / standard / hardcore)

`G.game.telegraphs()` is true only in **easy**. The framework wraps it as **`G.telegraphsOn()`** (feature-detects
`G.game.telegraphs`; before the engine lands it falls back to the `?mode=` URL param, then `progress.mode`,
default easy). Check it **at draw time** only — never branch gameplay timing on it.

- **EXPLICIT telegraphs** (easy only): drawn geometry that outlines WHERE/WHEN damage lands or its PATH — floor
  strips/seams/zones/columns/lanes, brackets, landing rings/markers, reticles, aim/trajectory lines, hitbox ghosts,
  impact shadows marking the exact area, danger tints, countdown pips.
- **DIEGETIC tells** (all modes): the attacker's windup pose, glow/glint ON the attacker or its weapon
  (`this.telegraph()` — unchanged in every mode), sounds, shake, particles from the attacker, natural precursors
  (ceiling dust over a falling rock, floor crumbs before an eruption, a swelling drip), projectiles in flight.
- Rule: in standard/hardcore every attack keeps ≥ 1 diegetic tell with at least the easy-mode lead time
  (bosses ≥ 0.45 s). If removing a marker would make the pattern unfair (off-screen source, no visible source,
  overlapping patterns whose safe spot can't otherwise be read), **keep** it in a subtler form and document it
  (attack + reason) in your module's doc, in a "Telegraphs by mode" table: `attack | easy | standard | diegetic tell`.

**`G.warnZone` is mode-aware automatically.** In easy it draws exactly as before. In standard/hardcore the zone
still exists, lasts `dur` and fires `onDone` identically, but draws **no geometry**; instead it emits a diegetic
cue picked from its style (override with `cue`):

| option | values | meaning |
|---|---|---|
| `cue` | `'auto'` (default) · `'dust'` · `'cracks'` · `'drip'` · `'none'` / `false` | standard/hardcore cue. auto: `column`→`dust`, `floor`→`cracks`, `circle`/`rect`→`none` |
| `cueColor` | css colour or `[pebble, dust]` | particle colour(s) (default: pale stone pebbles + grey-brown dust / crumbs; `drip` uses `color`) |
| `keep` | `false` (default) · `'subtle'` · `'full'` | also draw the zone in standard/hardcore: `'subtle'` = ~40 % alpha, no bright edge bar/outline; `'full'` = as easy. Only for documented fairness exceptions |

- `dust`: pebbles + dust motes trickle from the zone top (or the top of the view when the ceiling is off-screen)
  over the middle ~65 % of the column, building up over `dur`. Use for debris/rocks falling from above.
- `cracks`: 2–3 short dark hairline cracks at the floor line that lengthen, hopping crumbs + dust puffs inside the
  strip, one faint camera rumble (1.2 px). Use for eruptions / heated floor / spikes from below.
- `drip`: a drop of `color` swelling on the ceiling (or the top edge of the view) over the column centre, and a thin dribble of droplets falling from it (after the first ~12 %, building up). Use for
  molten/wax drops falling from above.
- `none`: nothing extra — pick it when the attacker's own motion already shows where it goes (a visible leap onto
  a landing zone, a projectile in flight), or when you draw your own diegetic cue.

Subclasses that override `draw`/`update` (e.g. the Matron's `Mark`) must gate their own geometry and may call
`this.updateCue(dt)` themselves. The placeholder `boss_test` drip columns use the automatic `dust` cue.

Zone fields: `zone.cue`, `zone.keep`, `zone.explicit` (true if the geometry draws right now). Custom markers you
draw yourself (landing rings, aim lines, seams) must be gated the same way:
```js
const tele = G.telegraphsOn ? G.telegraphsOn() : true;
if (tele) drawLandingMark(ctx, ...);          // easy only
```

---

## 7. Drawing

- Override `drawBody(ctx, t)` and draw in **world space** (`this.x/y` or `this.cx`, feet at
  `this.y + this.h`), mirrored by `this.facing`. Animate from `t`, `this.t`, `this.state`,
  `this.stateTime`, `this.vx`, `this.telegraphing`.
- The base handles the white **hit flash** (draws your body into a scratch buffer and whitens it —
  override `drawBounds()` if your art overhangs the box by more than ~0.6 × size), the **telegraph**
  glint/glow/shake, and **death** (corpse squashes and spreads into a wax puddle drawn by
  `G.Art.char.puddle`, colour `colors.puddle`). Use `drawCorpse` for a dead pose (eyes closed).
- Use the shared creature kit `G.Art.char` (docs/api/art.md, recipes in docs/ART_GUIDE.md §6):
  `waxBody`, `eyes`, `wick`, `pallSmoke`, `shape` (fill + form shade + rim + outline), `shadow`,
  `blinkAt`, `cloth`, `smokeTrail`. Always keep a cheap fallback (`if (!ch) { ...rect...; return; }`).
- **Never** use `ctx.shadowBlur` / `ctx.filter`; glows via `G.fx.glowAt(ctx, x, y, r, color, a)`.
- Heavy art (many clipped paths) → pre-render frames once into canvases (`G.U.makeCanvas`) and blit
  (see `drawFlyCached` in `enemies/shore.js`: 16 flap frames per facing at 2× resolution).
- Particles: `G.fx.burst(kind, x, y, opts)` (`spark ember smoke dust drip shard wax ring slash flash
  splash bubble snow ash pollen`). Sound: `G.sfxAt(name, this.cx, {vol, pitch})` (pitch < 1 for big).
- Style: candle-noir; the Snuffed are grey-blue cold wax, black wicks with grey Pall smoke, white
  pinprick eyes; telegraph colour warm (`#ffe2a8`), and every attack readable in silhouette.

---

## 8. Design rules

### 8.1 Telegraphs (binding)
- Every **normal enemy** attack is telegraphed **≥ 0.35 s** (visual + audio: `this.telegraph()`
  does both and enforces the minimum). Contact damage of a walking body needs no telegraph.
- **Bosses**: big/committing attacks ≥ 0.5 s, quick attacks ≥ 0.3 s, follow-ups in a combo ≥ 0.2 s
  (`force: true` is required below 0.25 s). Area denial (falling debris, heated floor, erupting
  spikes) always shows a `warnZone` ≥ 0.6 s before it becomes dangerous (the zone draws in easy; in
  standard/hardcore it emits its diegetic cue for the same time — see §6.1).
- The telegraph must read in silhouette (crouch, raise, rear back) — `this.telegraphing` in
  `drawBody` — not only through the glint.
- After an attack: a recovery window (≥ 0.4 s) in which the enemy is punishable.

### 8.2 HP per region (Brand damage 5 / 9 / 13 / 17 by upgrade level; spells 15)
| region | regular enemy HP | big / elite |
|---|---|---|
| shore | 8–12 | — |
| guttered | 15–25 | up to 35 |
| meltbloom | 20–30 | up to 45 |
| flue | 25–40 | up to 55 |
| nave | 35–60 | up to 80 |
| chandlery | 40–70 | up to 95 |
| mothwood | 40–70 | up to 95 |
| rime | 50–90 | up to 120 |

Aim for 2–5 hits at the Brand level the player will typically have in that region (shore L0,
guttered/meltbloom L0–1, flue/nave L1–2, chandlery/mothwood L2, rime L2–3). Bosses: DESIGN §5.3
(effigy 200, sable1 230, matron 320, tallowmere 560, kilnmother 620, vespertine 600, sable2 800,
lucerne 1400 total).

### 8.3 Damage
1 for everything normally (contact, projectiles, melee). **2** only for heavy late-game attacks
(rime enemies' big swings, Keeper/Sable2/Lucerne signature attacks). Hazard-like attacks still use
`G.Combat.hurtPlayer` (normal knockback), not `hazardPlayer`.

### 8.4 Cinders (DESIGN: enemies drop 2–20)
| region | small | normal | big / elite |
|---|---|---|---|
| shore | [2, 3] | [2, 4] | — |
| guttered | [2, 4] | [3, 6] | [6, 10] |
| meltbloom | [3, 5] | [4, 7] | [7, 12] |
| flue | [3, 5] | [5, 8] | [8, 13] |
| nave | [4, 6] | [6, 10] | [10, 16] |
| chandlery / mothwood | [5, 8] | [7, 12] | [12, 18] |
| rime | [6, 9] | [8, 14] | [14, 20] |

Unique (persistent) enemies: 2–3 × normal (≤ 40). Minions / summoned / endlessly spawned enemies:
`cinders: 0` (`summon()` already sets `noDrops`). Bosses: `reward` (§10.1), not `cinders`.

### 8.5 Weight & sizes
Light (moths, sprites, jellies) `weight: 0.5–0.7` (large knockback, stun); normal 1; heavy
(brutes, knights) 2–4 (short knockback, no stun); immovable ≥ 10 (turrets, rooted). Keep bodies
honest: the hurtbox is the box, so make the box match the visible body (overhanging limbs/weapons
are art only, or use `strike()` hitboxes).

---

## 9. Complete example enemies

### 9.1 Ground lancer (patrol → notice → wind-up → lunge → recover)

```js
// EXAMPLE: example_lancer
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G.Enemy) return;                       // never throw at load time
  const TILE = G.CONST.TILE;

  class ExampleLancer extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 18,                               // guttered: 15–25 → 4 hits at Brand L0, 2 at L1
        w: 34, h: 58,                         // body box = hurtbox; the spear is art + strike() hitbox
        cinders: [3, 6],
        weight: 1,                            // normal knockback + 0.12 s hit-stun
        sight: 7 * TILE,
        colors: { body: '#8d97a8', dark: '#465063', hit: '#dfe4ec', smoke: '#7e879a', tele: '#ffe2a8' },
      });
      this.speed = this.props.speed || 55;    // kind-specific placement prop
    }

    init() {
      super.init();                           // sets this.home, default state
      this.setState('patrol');
    }

    think(dt) {
      const p = this.player;
      switch (this.state) {
        case 'patrol':
          this.patrol(this.speed, { pause: 0.4 });          // turns at walls, ledges, spikes
          if (this.ready('lunge') && this.canSee(p) && Math.abs(this.dy(p)) < 2 * TILE) this.setState('alert');
          break;
        case 'alert':                                        // close in to lunge range
          this.face(p);
          if (Math.abs(this.dx(p)) > 4 * TILE) this.approach(p, this.speed * 1.8);
          else this.setState('windup');
          if (!this.canSee(p, this.sight * 1.3)) this.setState('patrol');
          break;
        case 'windup':                                       // TELEGRAPH ≥ 0.35 s: crouch + glint + sound
          this.stop();
          if (this.once('tele')) this.stateData.wind = this.telegraph(0.5);
          if (this.stateTime >= this.stateData.wind) this.setState('lunge');
          break;
        case 'lunge': {
          const blocked = this.charge(430);                   // false → keeps going; never runs off ledges
          this.strike(this.spearRect(), { damage: 1 });       // at most one hit per lunge (per state)
          if (this.every(0.06) && G.fx) G.fx.burst('dust', this.cx - this.facing * 12, this.bottom, { count: 1, color: '#8a8478' });
          if (blocked || this.stateTime > 0.42) this.setState('recover');
          break;
        }
        case 'recover':                                      // punish window
          this.stop(1600);
          if (this.stateTime > 0.6) { this.cooldown('lunge', 1.2); this.setState('patrol'); }
          break;
        default:
          this.setState('patrol');
      }
    }

    spearRect() {
      const len = 46;
      return { x: this.facing > 0 ? this.right : this.x - len, y: this.y + this.h * 0.35, w: len, h: 14 };
    }

    // Struck from behind while patrolling → turn and fight
    onHurt(hit) {
      if (this.is('patrol') && hit.source) { this.face(hit.source); this.setState('alert'); }
    }

    drawBounds() { return { x: this.x - 60, y: this.y - 40, w: this.w + 120, h: this.h + 50 }; }

    drawBody(ctx, t) {
      const ch = G.Art && G.Art.char;
      const f = this.facing, fx = this.cx, fy = this.y + this.h;
      const crouch = this.telegraphing ? 0.88 : 1;            // silhouette tell
      const lunging = this.is('lunge');
      // spear (behind the body): drawn back during the wind-up, thrust during the lunge
      const reach = lunging ? 26 : this.telegraphing ? -10 : 6;
      const sy = fy - this.h * 0.55 * crouch;
      ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx - f * (30 - reach), sy + 6); ctx.lineTo(fx + f * (30 + reach), sy - 2); ctx.stroke();
      ctx.fillStyle = '#c9ced6';
      ctx.beginPath();
      ctx.moveTo(fx + f * (44 + reach), sy - 3); ctx.lineTo(fx + f * (30 + reach), sy - 9); ctx.lineTo(fx + f * (30 + reach), sy + 4);
      ctx.closePath(); ctx.fill();
      if (!ch) {                                              // fallback without the art kit
        ctx.fillStyle = this.colors.body;
        ctx.fillRect(this.x, fy - this.h * crouch, this.w, this.h * crouch);
        return;
      }
      ch.shadow(ctx, fx, fy, this.w * 0.6, 0.5);
      const b = ch.waxBody(ctx, fx, fy, this.w * 1.1, this.h, {
        variant: 'slumped', color: this.colors.body, shade: '#20242c', drips: 3, seed: 5,
        squash: crouch, lean: lunging ? f * 7 : this.telegraphing ? -f * 4 : 0, light: -f,
      });
      ch.eyes(ctx, b.cx + f * b.w * 0.12, b.top + b.h * 0.28, {
        kind: 'pinprick', size: 10, gap: 8, color: this.telegraphing ? '#ffe9b0' : undefined, blink: ch.blinkAt(t, this.seed, 4),
      });
      const tip = ch.wick(ctx, b.cx - f * 2, b.top + 2, { len: 9, bend: -f * 3 });
      ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 4, height: 40, spread: 8, size: 4, alpha: 0.3, seed: this.seed });
    }
  }

  G.registerEnemy('example_lancer', ExampleLancer);
})();
```

### 9.2 Flying spitter (hover → keep distance → wind-up → aimed shot)

```js
// EXAMPLE: example_spitter
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G.Enemy) return;
  const TILE = G.CONST.TILE;

  class ExampleSpitter extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 14, w: 30, h: 30,
        flying: true,                         // no gravity, centred on its marker, corpse falls on death
        weight: 0.6,                          // light: big knockback on both axes
        cinders: [3, 5],
        sight: 9 * TILE,
        colors: { body: '#a39a8c', dark: '#4c4742', hit: '#efe6d6', smoke: '#8a8580', tele: '#ffb070' },
        light: { r: 60, color: '#ffb070', intensity: 0.4 },
      });
    }
    init() { super.init(); this.setState('hover'); }

    think(dt) {
      const p = this.player;
      switch (this.state) {
        case 'hover':
          this.hover(null, null, dt, { amp: 12 });           // drift around home
          if (this.ready('shot') && this.canSee(p)) this.setState('aim');
          break;
        case 'aim': {
          if (!this.targetable(p)) { this.setState('hover'); break; }
          this.face(p);
          // hold a spot ~4 tiles to the side of and 2 tiles above the player (steering avoids walls)
          this.flyTo(p.x + p.w / 2 - this.facing * 4 * TILE, p.y - 2 * TILE + this.bob(8, 0.8), 95, dt);
          if (this.at(0.5)) this.stateData.wind = this.telegraph(0.45);
          if (this.stateData.wind && this.stateTime >= 0.5 + this.stateData.wind) {
            this.shootAt('orb', p, { speed: 300, lead: 0.5, color: '#ffb070', destroyable: true });
            this.vx -= this.facing * 120;                     // recoil
            this.cooldown('shot', 1.8);
            this.setState('hover');
          }
          break;
        }
        default:
          this.setState('hover');
      }
    }

    drawBounds() { return { x: this.x - 30, y: this.y - 30, w: this.w + 60, h: this.h + 60 }; }

    drawBody(ctx, t) {
      const ch = G.Art && G.Art.char;
      const f = this.facing, x = this.cx, y = this.cy;
      const flap = Math.sin(t * 22 + this.seed);
      ctx.fillStyle = '#6f685f';
      for (const side of [-1, 1]) {                          // two flapping wing blades
        ctx.beginPath();
        ctx.ellipse(x + side * 14, y - 6 - flap * 4, 13, 5 + 3 * Math.abs(flap), side * (0.5 + flap * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!ch) { ctx.fillStyle = this.colors.body; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); return; }
      const b = ch.waxBody(ctx, x, y + 15, 30, 30, { variant: 'round', color: this.colors.body, drips: 2, seed: 3, light: -f,
        squash: this.telegraphing ? 0.85 : 1 });
      ch.eyes(ctx, b.cx + f * 4, b.top + b.h * 0.4, { kind: 'ember', size: 8, gap: 6 });
      if (this.telegraphing && G.fx) G.fx.glowAt(ctx, x + f * 10, y + 4, 18, '#ffb070', 0.5);  // mouth glow tell
    }
  }

  G.registerEnemy('example_spitter', ExampleSpitter);
})();
```

---

## 10. Bosses (`G.Boss extends G.Enemy`)

### 10.1 Config (merged over §3)
| key | default | meaning |
|---|---|---|
| `hp` | 200 | DESIGN §5.3 |
| `weight`, `knockback`, `hitStun` | 100, 0, 0 | hurt flash without knockback or stun |
| `contactDamage`, `contactInset` | 1, 6 | |
| `minTelegraph` | 0.25 | |
| `phases` | `[]` | HP fractions where phases begin: `[0.6, 0.3]` → phase 2 at 60 %, phase 3 at 30 % |
| `stagger` | null | `{damage, time}`: after `damage` taken since the last stagger the boss is interrupted and stunned `time` s (not during `intro`, `uninterruptible` attacks or another stagger) |
| `attacks` | `{}` | `name → {weight, range, phase, maxPhase, cooldown, repeat, uninterruptible, when}` (§10.2) |
| `rest` | `[0.45, 0.9]` | idle time between attacks (random in range) |
| `phaseRest` | `[1, 0.85, 0.7, 0.6]` | rest multiplier per phase (later phases are more aggressive) |
| `introTime` | 0.9 | seconds after the fight starts before the first attack |
| `introDialogue`, `defeatDialogue` | true | speak `G.Text.bosses[id].intro` / `.defeat` via `G.UI.dialogue` (if both exist) |
| `roar` | true | `boss_roar` + shake when the fight starts |
| `defeatStyle` | `'explode'` | `'explode'` · `'yield'` (Sable: smoke puff, leaves) · `'custom'` (`onDefeatSequence`) |
| `slowmo` | 0.9 | game seconds of half-speed after the killing blow |
| `music` | by id | `effigy`/`matron` → `'boss'`, `sable1`/`sable2` → `'sable'`, Keepers → `'keeper'`, `lucerne` → `'lucerne'` (`G.Boss.MUSIC`) |
| `reward` | by id | cinders dropped on defeat: effigy 200, Keepers 300, others 0 (`G.Boss.REWARD`) |
| `stinger` | `'boss_defeated'` | `G.Audio.stinger` played when the victory is recorded (false = none, e.g. Lucerne → ending); skipped when a Warden Seal card follows (its `seal` stinger is then the victory cue) |
| `seal` | by id | Warden Seal granted on defeat: from `G.Items.sealBoss` (tallowmere → `bell`, kilnmother → `kiln`, vespertine → `wing`); `false` = none, or a seal id. Added to progress together with the victory (same save), its item card appears 1.4 s later (or when the boss leaves the room). Do **not** give the seal yourself in `onDefeated`. |
| `puddleTime` | 5 | the remains linger (explode style) |

`this.bossId` = the arena's `boss` prop (so `boss_test` used as a placeholder for `effigy` still
records `boss:effigy`). Bosses never use `dead:<id>`; defeat is `G.game.defeatBoss(id)` → `boss:<id>`.

### 10.2 Attack scheduler
States `intro → idle ⇄ <attack> → … (stagger) → defeat`. In `idle`, after `rest` seconds the
scheduler picks an attack:
1. eligible: `phase <= this.phase <= maxPhase`, cooldown ready, `when.call(this, dist)` true;
2. in range: `range: [min, max]` on |horizontal distance| to the player (none in range → any eligible);
3. no immediate repeat (unless `repeat: true`);
4. weighted random (`weight` may be a function `(dist) → number`).

It then calls `startAttack(name)` → state `name`, and **your `atk_<name>(dt, s)` runs every step**
(`s` = seconds in the attack) until you call **`this.endAttack(rest?)`**. All §5 tools work inside
(`once`, `at`, `every`, `telegraph`, `leapTo`, `charge`, `shootAt`, `lob`, `summon`, `warnZone`, …).
Force a specific attack any time with `this.startAttack('name')` (e.g. from `onPhase`).
`uninterruptible: true` attacks cannot be staggered (transformations, ultimate moves).

Hooks: `onFightStart()`, `onAttackStart(name)`, `onInterrupt(name)` (stagger cut an attack),
`onStagger()`, `onStaggerEnd()`, `onPhase(phase)` (default: roar + shake + flash — call
`super.onPhase(phase)`), `introUpdate(dt)` / `idleUpdate(dt)` / `staggerUpdate(dt)` (idle motion;
default face the player and stand / hover still), `onDefeatStart(hit)`, `onDefeatSequence(dt, s)`
(custom style), `onDefeated()` (after `defeatBoss`; e.g. unlock a shrine, start the ending).
Helpers: `this.playerDist()`, `this.warnZone(o)`, `this.speak(key, onDone)` (mid-fight lines, e.g.
Lucerne's `phase2`; `this.speaking` while open), `this.phase`, `this.attack`, `this.lastAttack`,
`this.attackCount`, `this.staggers`, `this.fightStarted`, `this.arena`.

### 10.3 Fight start (automatic)
The arena spawns the boss and calls `beginFight()`: intro dialogue (if any) → `startFight()`:
`G.game.startBossMusic(music)`, `G.UI.bossCard(id)`, `bossStart` event, roar. A boss spawned
without an arena (debug) starts by itself (`noAutoStart: true` prop prevents it).

### 10.4 Defeat (automatic)
Killing blow → `die()`: projectiles cleared, minions killed, hitstop + white flash + shake,
`bossDying` → slow-motion shudder with white flashes (`slowmo`) → defeat lines → style:
- `explode`: huge particle burst (flash, rings, wax, smoke, sparks), `boss_die`, remains linger;
- `yield`: smoke puff, the boss leaves (Sable);
- `custom`: your `onDefeatSequence(dt, s)` runs each step; call `this.explode()` or
  `this.finishDefeat()` (+ `this.remove()`) when done.

`finishDefeat()` (exactly once): Warden Seal (if any, see `seal`), `G.game.defeatBoss(id)` (flag, save, `bossDefeated`), stinger,
`reward` cinders via `G.dropCinders`, `onDefeated()`, then the arena ends (gates open, region music).

### 10.5 Variants & multi-body bosses
```js
G.Boss.register('sable1', Sable);   // one class, two entity types
G.Boss.register('sable2', Sable);   // inside: const late = this.bossId === 'sable2';
```
Transforming boss (Lucerne phase 2): spawn the new body with `{type: 'boss_lucerne', boss: 'lucerne',
arena: this.arena, form: 2, ...}`, call `this.arena.setBoss(newBody)` **before** `this.remove()`,
and only the final body should reach `finishDefeat()`. (An arena whose boss disappears without being
defeated reports an error and resets.)

**The ending (Lucerne).** Nothing else starts the ending: after the final body's defeat (e.g. in
`onDefeated()`, once its own sequence is over) call `G.game.finishGame()`. It picks the ending from the
sparks held (`G.game.endingId()`: `'gutterlight'` with all 6, else `'undying'`), marks the save complete,
plays `G.UI.playEnding` (pages → credits → The End) and returns to the title. Use `stinger: false` so the
victory stinger does not clash with the ending music. (Verified end to end: `finishGame()` → ending →
credits → title, slot marked complete.)

### 10.6 Registration
```js
G.Boss.register('effigy', Effigy);   // → entity type 'boss_effigy' (spawned by the arena)
```
Reading `G.Text.bosses[id]`: `{name, sub, intro?, phase2?, defeat?}` (docs/api/text.md §5).

### 10.7 Complete example boss

```js
// EXAMPLE: boss example
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G.Boss) return;

  class ExampleBoss extends G.Boss {
    constructor(props) {
      super(props, {
        hp: 200, w: 90, h: 120,
        phases: [0.5],                              // phase 2 at 50 % HP
        stagger: { damage: 60, time: 1.5 },         // ~12 nail hits at L0 → stunned 1.5 s
        rest: [0.5, 0.9],
        reward: 50,
        colors: { body: '#9aa3b2', dark: '#474e5c', hit: '#dfe4ec', smoke: '#7e879a', tele: '#ffe0a0' },
        attacks: {
          slam:   { weight: 3, range: [0, 560] },                     // close: leap onto the player
          charge: { weight: 2, range: [220, 2000] },                  // far: run across the arena
          spit:   { weight: 2, range: [260, 2000], cooldown: 2.5 },
          summon: { weight: 1.5, phase: 2, cooldown: 9, when() { return this.liveMinions() < 2; } },
        },
      });
      this.squash = 1;
    }

    // leap onto the player → two ground shockwaves
    atk_slam(dt, s) {
      const d = this.stateData;
      if (this.once('wind')) { this.face(); d.wind = this.telegraph(0.6); }          // big attack ≥ 0.5 s
      if (s < d.wind) { this.vx = 0; this.squash = 1 - 0.15 * (s / d.wind); return; }
      if (this.once('jump')) {
        const p = this.player;
        this.leapTo(p ? p.x + p.w / 2 : this.cx, this.y + this.h, 160, { maxVx: 650 });
        this.squash = 1.08;
        G.sfxAt('jump', this.cx, { pitch: 0.6 });
        return;
      }
      if (this.grounded && s > d.wind + 0.1 && this.once('land')) {
        this.vx = 0; this.squash = 0.8;
        if (G.game) G.game.shake(10, 0.35);
        G.sfxAt('shockwave', this.cx);
        for (const dir of [-1, 1]) {
          G.spawnProjectile(this.room, 'wave', { x: this.cx + dir * (this.w / 2 + 14), y: this.y + this.h, dir, speed: 420, owner: this });
        }
        d.landT = s;
      }
      if (d.landT != null) { this.squash = Math.min(1, this.squash + dt); if (s - d.landT > 0.55) this.endAttack(); }
      else if (s > d.wind + 3) this.endAttack();                                      // safety: never stuck
    }

    // run at the player until a wall (contact damage does the hurting)
    atk_charge(dt, s) {
      const d = this.stateData;
      if (this.once('wind')) { this.face(); d.wind = this.telegraph(0.55, { shake: 2 }); }
      if (s < d.wind) { this.vx = 0; return; }
      const blocked = this.charge(this.phase >= 2 ? 620 : 540);
      if (blocked || s > d.wind + 1.4) {
        if (this.wallHit && G.game) { G.game.shake(6, 0.25); G.sfxAt('hardland', this.cx); }
        this.vx = 0;
        this.endAttack(0.7);                                                          // longer punish window
      }
    }

    // lob a fan of wax globs (more in phase 2)
    atk_spit(dt, s) {
      const d = this.stateData;
      this.vx = 0;
      if (this.once('wind')) { this.face(); d.wind = this.telegraph(0.5, { color: '#ffb070' }); d.n = this.phase >= 2 ? 5 : 3; }
      for (let i = 0; i < d.n; i++) {
        if (!this.at(d.wind + i * 0.16)) continue;
        const p = this.player;
        const off = (i - (d.n - 1) / 2) * 80;
        const target = p ? { x: p.x + off, y: p.y, w: p.w, h: p.h } : null;
        this.lob('glob', target, { time: 0.85, color: '#e0c9a0', x: this.cx + this.facing * 30, y: this.y + 30 });
      }
      if (s > d.wind + d.n * 0.16 + 0.5) this.endAttack();
    }

    // phase 2: call two ash flies
    atk_summon(dt, s) {
      const d = this.stateData;
      this.vx = 0;
      if (this.once('wind')) d.wind = this.telegraph(0.5, { shake: 2.5 });
      if (this.at(d.wind)) {
        for (const side of [-1, 1]) {
          const m = this.summon('ash_fly', this.cx + side * 120, this.y - 30);
          if (m && G.fx) G.fx.burst('smoke', m.cx, m.cy, { count: 8, color: this.colors.smoke, alpha: 0.5 });
        }
      }
      if (s > d.wind + 0.8) this.endAttack();
    }

    onPhase(phase) {
      super.onPhase(phase);                                        // roar, shake, flash
      if (phase === 2) {
        G.clearProjectiles(this.room);
        if (G.Audio && typeof G.Audio.musicLayer === 'function') G.Audio.musicLayer(1);   // intensity layer
      }
    }
    onStagger() { this.squash = 0.72; }
    onStaggerEnd() { this.squash = 1; }

    drawBounds() { return { x: this.x - 70, y: this.y - 140, w: this.w + 140, h: this.h + 165 }; }

    drawBody(ctx, t) {
      const ch = G.Art && G.Art.char;
      const f = this.facing, fx = this.cx, fy = this.y + this.h;
      const staggered = this.is('stagger') || this.yielded;
      const sq = staggered ? 0.74 : this.squash;
      if (!ch) {
        ctx.fillStyle = this.colors.body;
        ctx.fillRect(this.x, fy - this.h * sq, this.w, this.h * sq);
        return;
      }
      ch.shadow(ctx, fx, fy, this.w * 0.62, 0.55);
      const b = ch.waxBody(ctx, fx, fy, this.w * 1.05, this.h, {
        variant: 'slumped', color: this.colors.body, shade: '#20242c', hi: '#e8edf4', drips: 5, seed: 11,
        squash: sq, lean: this.telegraphing ? -f * 6 : this.vx * 0.008, light: -f, rim: '#d0d8e4', lw: 2.5,
      });
      ch.eyes(ctx, b.cx + f * b.w * 0.08, b.top + b.h * 0.3, {
        kind: this.phase >= 2 ? 'ember' : 'pinprick', size: 22, gap: 22,
        color: this.telegraphing ? '#ffe9b0' : undefined, blink: staggered ? 0.7 : ch.blinkAt(t, 5),
      });
      const tip = ch.wick(ctx, b.cx - f * 2, b.top + 4, { len: 14, bend: -f * 4, width: 3.2 });
      ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 6, height: 90, spread: 16, size: 8, alpha: 0.35, color: this.colors.smoke, seed: 3 });
    }
  }

  G.Boss.register('example', ExampleBoss);       // entity type 'boss_example'
})();
```

Room data for it: `{ type: 'arena', boss: 'example', bx: 30, by: 19, trigger: [14, 0, 38, 21], x: 1, y: 1 }`
(floor surface at row 20) plus an `{ type: 'arena_gate', id: 'xx_ag1', x: 12, y: 19, h: 4 }` in each
entrance (gate markers: `y` = the gate's bottom tile row, i.e. the row directly above the floor).

`boss_test` in `boss_base.js` ("the Hollow Dummy": lunge, leap → shockwaves, volley in phase 2,
warned glob drips in phase 3) is a second complete reference.

---

## 11. Arena controller (entity `arena`, TECH_SPEC §9.1)

```js
{ type: 'arena', boss: 'effigy', bx: 40, by: 15, trigger: [24, 0, 56, 17], requires: '', zone: [c1, r1, c2, r2], x: 40, y: 15 }
```
- `boss`: boss id; `bx, by`: boss spawn tile (ground bosses: feet on the bottom of row `by`, i.e.
  the row directly above the floor; flyers: centred); `trigger`: inclusive tile rect — the fight
  starts when the player's centre enters it; `requires`: optional condition; `zone`: optional camera
  zone (if `G.camera.setZone` exists); `x, y`: the marker itself (any tile; the controller is
  invisible except in the debug overlay, which shows the trigger and spawn point).
- Flow: `wait` → player in trigger → **`arenaStart`** `{room, boss, arena}`, arena gates close
  (`arena_gate` listens to the event; the controller also calls `gate.close()`), small shake →
  `beat` 0.6 s → spawn `boss_<id>` at (bx, by) → `fight` (boss intro, card, music) → defeat →
  **`arenaEnd`** `{room, boss, arena, victory: true}`, gates `open()`, `G.game.endBossMusic()`
  (region music) → `done`.
- `boss_<id>` not registered → `reportError` once and the placeholder `boss_test` is spawned with the
  real id (card, music, reward and `boss:<id>` flag all behave as for the real boss).
- Already defeated (`G.game.bossDefeated(id)`) → inert (`done`); gates stay open.
- Player death mid-fight: the room is rebuilt on the next load, so the arena is back to `wait`
  and the boss is fresh. `arena.active` is true during the encounter (`G.game.isSafeRoom()`).
- `arena.setBoss(entity)` re-targets the tracked boss (multi-body bosses).

---

## 12. Events (`G.events`)

| event | payload | emitted by |
|---|---|---|
| `enemyKilled` | `{enemy}` | every enemy/boss death start (`enemy.kind`, `enemy.props.id`) |
| `arenaStart` | `{room, boss, arena}` | arena trigger |
| `bossStart` | `{id, boss}` | fight start (after intro lines) |
| `bossPhase` | `{id, phase, boss}` | phase threshold crossed |
| `bossStagger` | `{id, boss}` | stagger |
| `bossDying` | `{id, boss}` | killing blow (before the slow-mo) |
| `bossDefeated` | `{id}` | `G.game.defeatBoss` (after the explosion / yield) |
| `arenaEnd` | `{room, boss, arena, victory}` | arena finished (victory) or reset (failure) |

---

## 13. Testing

```bash
node tools/enemy_selftest.js                    # framework self-test (all checks, exit 1 on failure)
node tools/enemy_selftest.js arena boss         # only checks whose names contain a word

# LAB MODE — smoke-test your own enemies (any number of kinds):
node tools/enemy_selftest.js --kinds snuffed_walker,snuffed_lancer,drip_fly,wick_crawler \
     --region guttered --out test-output/guttered
#   per kind: registered · spawns · idles 3 s · engages the player (states, telegraph lengths ≥ 0.35 s,
#   projectiles, strikes) · contact damage · hits-to-kill at Brand L0–3 · enemyKilled + cinders ·
#   melts and is removed · no errors.  Files: lab_<kinds>.png (pose sheet: idle, first states, hit
#   flash, melting, puddle), lab_<kind>_ingame.png, lab_<kind>_death.png.  --props '{"surface":"ceiling"}'
#   passes placement props to every kind.

# LAB MODE — a boss through the complete arena flow:
node tools/enemy_selftest.js --boss effigy --region guttered --seconds 40 --out test-output/effigy
node tools/enemy_selftest.js --boss effigy --room gw_12      # inside the real arena room (uses its arena entity)
#   trigger → arenaStart, gates close, boss spawns · card + music · N s of random play while chipping
#   HP (attacks used, telegraphs, phases, staggers, hurtPlayer calls) · kill → bossDefeated, arenaEnd,
#   gates open, music restored · no errors.  Files: lab_boss_<id>_<n>.png.  --dialogue keeps the intro lines.
```
LOOK at the PNGs (Read tool) and judge the art critically. Single shots:
```bash
node tools/shot.js --query "test=1&paused=1&room=dev_01&tx=12&ty=15&region=guttered" \
  --eval "G.debug.spawn({type:'enemy', kind:'snuffed_lancer', tx:20, ty:15})" --eval "G.debug.step(90)" \
  --out test-output/guttered/lancer.png
```
`debug=1` shows hitboxes, `strike()` rects (red) and arena triggers. `G.debug.killAll()` kills every
enemy (bosses included — runs the defeat sequence). `G.Boss.skipDialogue = true` skips boss lines.

---

## 14. Checklist & pitfalls

- [ ] Registered with the exact kind id from TECH_SPEC §19 (`G.registerEnemy('drip_fly', …)`).
- [ ] `super(props, cfg)` and `super.init()`; AI only in `think`; never override `update`.
- [ ] Every attack telegraphed (`this.telegraph`, ≥ 0.35 s) **and** visible in the silhouette.
- [ ] HP / cinders / damage per §8; minions `cinders: 0`.
- [ ] Art via `G.Art.char` with a fallback; no `shadowBlur`/`filter`; heavy art cached; `drawBounds`
      covers overhanging art (else the hit flash clips it).
- [ ] States can never get stuck: every attack state has a timeout (`if (s > X) endAttack()`).
- [ ] Use `this.player` defensively (`targetable(p)` before reading `p.x` in long-lived states).
- [ ] Don't move manually-integrated bodies through walls: use `G.Physics.move(this, this.room, dx, dy)`.
- [ ] Lab mode passes for every kind (`--kinds …`) / your boss (`--boss …`) with no console errors.
- Pitfall: `strike()` hits once **per state** — for multi-hit attacks pass distinct ids
  (`{ id: 'sweep' + i }`) or change state.
- Pitfall: `at(t)` only fires if the state lasts past `t`; `once()` keys reset on `setState`.
- Pitfall: setting `vx` while `grounded` is false does nothing useful for walkers — `approach()` and
  `patrol()` deliberately skip mid-air steering; use `leapTo()`/`hop()` for jumps.
- Pitfall: a boss attack that calls `endAttack()` and then keeps running code in the same step will
  run idle logic next step — `return` after `endAttack()` if more code follows.
