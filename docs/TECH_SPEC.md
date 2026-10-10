# GUTTERLIGHT — Technical Specification

The technical contract between all modules. Read `docs/DESIGN.md` first for *what* the game is.
Module authors: implement exactly these interfaces. If you must deviate or extend, keep backward
compatibility and document it in your module's API doc `docs/api/<module>.md` (each module owns
its own file there — never edit another module's doc) and in your final report.

---

## 1. Principles
- **Zero dependencies, fully offline.** Vanilla JavaScript (ES2020), Canvas 2D, Web Audio, Gamepad
  API, localStorage. No frameworks, no external assets (no image/audio/font files). Everything is
  drawn and synthesized by code.
- **Runs from `file://`.** `index.html` loads classic `<script src>` tags in a fixed order (no ES
  modules, no fetch/XHR). `tools/build.js` inlines everything into `dist/Gutterlight.html`.
- **One global namespace `G`.** Every file is an IIFE that reads `const G = globalThis.G;` and
  attaches its exports to `G`. Only `src/core/namespace.js` creates `G`.
- **Node-loadable logic/data.** These files must load in Node's `vm` with only `globalThis` (no
  `window`, `document`, `AudioContext`, canvas): `src/core/namespace.js`, `src/core/util.js`,
  `src/engine/physics.js`, `src/engine/world.js`, `src/player/motor.js`, `src/data/**/*.js`.
  All other files must not touch the DOM at load time (only inside functions called after boot).
- **Fixed timestep** 60 Hz simulation (`G.CONST.DT = 1/60`), decoupled rendering.
- **Robustness.** The engine wraps each entity's `update`/`draw` in try/catch; errors are reported
  via `G.reportError(err, where)` (logs once per unique message; in test mode also pushed to
  `G.debug.errors`). A bad entity is removed rather than crashing the game.

## 2. File layout, ownership & load order

`index.html` lists the scripts in exactly this order (it is the single source of truth for the
build). Every listed file must exist (stubs are fine) — a missing file is a test failure.

```
src/core/namespace.js        G, G.CONST, G.reportError, G.events            [engine]
src/core/util.js             G.U (math/color/easing helpers), G.RNG         [engine]
src/core/input.js            G.input                                        [engine]
src/core/save.js             G.Save, G.settings                             [engine]
src/audio/audio.js           G.Audio core: context, buses, reverb, synths, sequencer  [audio]
src/audio/sfx.js             SFX definitions                                [audio]
src/audio/tracks/<id>.js     one file per music track (16 files, see §14)   [composers]
src/art/art.js               G.Art core API, palettes, glow cache, helpers  [art]
src/art/terrain.js           terrain beautifier & prerender                 [art]
src/art/background.js        parallax backgrounds, foreground, atmosphere   [art]
src/art/characters.js        shared character drawing helpers               [art]
src/art/props.js             decor prop catalog (G.Art.drawDecorProp)       [art]
src/art/regions/<region>.js  per-region theme: palette, bg/decor generators [art → region builders]
src/engine/physics.js        G.Physics                                      [engine]
src/engine/world.js          G.World (regions, rooms, parsing, lookup)      [engine]
src/engine/room.js           G.Room runtime                                 [engine]
src/engine/entity.js         G.Entity, registry, spawn                      [engine]
src/engine/combat.js         G.Combat                                       [engine]
src/engine/camera.js         G.camera                                       [engine]
src/engine/particles.js      G.fx                                           [engine]
src/engine/lighting.js       G.lighting                                     [engine]
src/engine/render.js         G.Render (frame pipeline)                      [engine]
src/engine/game.js           G.game (state machine, progress API, flow)     [engine]
src/engine/debug.js          G.debug (test API, overlay)                    [engine]
src/player/motor.js          G.PlayerMotor (pure movement physics)          [engine]
src/player/player.js         G.Player entity (controller, combat, abilities)[player]
src/player/player_draw.js    Wickling drawing & animation                   [player]
src/ui/ui.js                 G.UI core: screen stack, widgets, fonts        [ui]
src/ui/hud.js                HUD                                            [ui]
src/ui/title.js              title & save-slot screens                      [ui]
src/ui/menus.js              pause / options / controls                     [ui]
src/ui/map.js                map screen                                     [ui]
src/ui/inventory.js          inventory & sigils                             [ui]
src/ui/dialogue.js           dialogue, lore, memory text                    [ui]
src/ui/shop.js               shops (Pell, Quill, Bramm), Lanternway menu    [ui]
src/ui/cards.js              area/boss cards, ability/item get, toasts, prompts [ui]
src/ui/ending.js             intro verse, endings, credits                  [ui]
src/entities/enemy_base.js   G.Enemy base + behaviors + G.registerEnemy     [enemies]
src/entities/boss_base.js    G.Boss base + arena controller                 [enemies]
src/entities/interactables.js sconce, lanternway, lore, shrine, pickup, geode, lever, gate, arena_gate, sealdoor, light, decor, respawn, start, event  [interact]
src/entities/npcs.js         NPC base + all NPCs                            [interact]
src/entities/wisp.js         Gutterwisp                                     [interact]
src/entities/enemies/<region>.js   shore guttered meltbloom flue nave chandlery mothwood rime  [region builders]
src/entities/bosses/<boss>.js      effigy sable matron tallowmere kilnmother vespertine lucerne [boss builders]
src/data/text.js             G.Text (all narrative/UI text)                 [writer]
src/data/items.js            G.Items (items, sigils, shops, prices)         [writer]
src/data/regions/_regions.js G.World.defineRegion × 10                      [engine]
src/data/regions/<region>.js rooms per region (10 files)                    [region builders]
src/data/arenas/<boss>.js    boss arena rooms (8 files; sable1 & sable2 separate) [boss builders]
src/data/test_rooms.js       dev test rooms (region 'test', dev:true)       [engine]
src/main.js                  boot                                           [engine]
```
Track files: `title shore lastlight guttered meltbloom flue nave chandlery mothwood rime sanctum boss sable keeper lucerne ending`.
Region files: `shore lastlight guttered meltbloom flue nave chandlery mothwood rime sanctum`.
Arena files: `effigy sable1 matron tallowmere kilnmother vespertine sable2 lucerne`.

Never edit a file you do not own unless your task says so. If you need something from another
module that does not exist yet, code defensively (`if (G.Art && G.Art.foo)`) and report it.

## 3. Coding conventions
```js
// src/engine/example.js — one-line purpose
(function () {
  'use strict';
  const G = globalThis.G;
  // ...
  G.Example = { /* exports */ };
})();
```
- `const`/`let`, classes, arrow functions OK. No `import`/`export`, no top-level `await`.
- Units: pixels and seconds unless named otherwise (`tx`,`ty` = tile coords; `gx`,`gy` = global tile coords).
- Never use `ctx.shadowBlur` or `ctx.filter` in per-frame drawing (slow). Pre-render glows into
  cached canvases (`G.Art.glow`). Avoid per-frame allocation in hot loops. Cap particles (~600).
- `Math.random()` is fine for cosmetic effects; use `G.RNG` (seeded) for anything that must be
  reproducible (procedural art per room: seed from `G.U.hash(room.id)`).
- Canvas creation: `G.U.makeCanvas(w, h)` (returns `{canvas, ctx}`; uses `document.createElement`
  in browsers, and is never called in Node-loadable files at load time).
- Comments: brief, explain *why*. Keep functions small and named.

## 4. Constants & coordinates
```js
G.CONST = {
  TILE: 40,            // px per tile
  VIEW_W: 1280, VIEW_H: 720,   // logical canvas size (32 × 18 tiles)
  CELL_W: 16, CELL_H: 9,       // map cell in tiles (half a screen); room sizes/positions are multiples
  DT: 1/60,
  PLAYER_W: 26, PLAYER_H: 54,
  GRAVITY: 2600, MAX_FALL: 960,   // tuned in motor; these are the authoritative values
}
```
- Room-local pixel space: origin at the room's top-left. Room width = `cols*TILE`.
- Global tile coords: room `gx, gy` + local tile. Rooms tile the global grid without overlap.
- Entity `x, y` = **top-left of its collision box** in room-local px; `w, h` = box size.
  Helpers on `G.Entity`: `cx`, `cy` (center), `bottom`, `right`.
- Canvas: one `<canvas>` with internal size 1280×720, CSS-scaled to fit the window with letterboxing,
  `image-rendering` auto (smooth). Optional `devicePixelRatio` upscale is NOT used (keep 1280×720).

## 5. Core (`namespace.js`, `util.js`)
```js
G.CONST                       // §4
G.VERSION = '1.0.0'
G.ready                       // true after main.js boot completes (test harness waits for it)
G.reportError(err, where)
G.events.on(name, fn) / off(name, fn) / emit(name, payload)
// Events emitted by the engine (others may add): 'roomEnter' {room}, 'regionEnter' {region, first},
// 'enemyKilled' {enemy}, 'playerHurt' {amount}, 'playerDied', 'itemGet' {item}, 'abilityGet' {id},
// 'bossStart' {id}, 'bossDefeated' {id}, 'rest' {sconce}, 'save'
G.U = { clamp, lerp, invLerp, approach(cur, target, delta), sign, rand(a,b), randInt(a,b), choose(arr),
        hash(str) → uint32, dist, angle, aabb(a,b) → bool, ease: {inOutSine, outCubic, outBack, inQuad, ...},
        hexToRgb, rgba(hex, a) → 'rgba(...)', mix(hexA, hexB, t) → hex, shade(hex, amt) → hex,
        makeCanvas(w,h) → {canvas, ctx}, now() }
G.RNG = class { constructor(seed); next() /*[0,1)*/; range(a,b); int(a,b); pick(arr); chance(p) }
```

## 6. Input (`G.input`)
Actions: `left right up down jump attack dash spell interact map inventory pause confirm cancel`.
```js
G.input.update()            // called once per fixed step by the engine BEFORE game logic
G.input.down(action)        // held this step
G.input.pressed(action)     // went down this step (edge)
G.input.released(action)    // went up this step
G.input.consume(action)     // clear the pressed edge (so UI and game don't both act on one press)
G.input.anyPressed()        // any key/button this step (title screen, skipping text)
G.input.lastDevice          // 'keyboard' | 'gamepad' (for button prompts)
G.input.label(action)       // e.g. 'Z' or 'A' — for on-screen prompts, based on lastDevice
G.input.setVirtual(state)   // test injection: {left:true, jump:true, ...} merged into real input
G.input.clearVirtual()
```
Keyboard map (both sets simultaneously): left ←/A, right →/D, up ↑/W, down ↓/S, jump Z/Space,
attack X/J, dash C/K/Shift, spell V/L, interact = up, map Tab/M, inventory I, pause Esc/P,
confirm Enter/Z/Space/J, cancel Esc/X/Backspace. `Tab` must `preventDefault`.
Gamepad (standard mapping): stick/D-pad move (deadzone 0.35), A(0) jump+confirm, B(1) spell+cancel,
X(2) attack, Y(3) — unused, LB(4) inventory, RB(5)/RT(7) dash, Back(8) map, Start(9) pause.
Key events are captured on `window`; the browser must not scroll on arrows/space.

## 7. World & room data (`G.World`, `src/data/regions/*.js`)

### 7.1 Regions
```js
G.World.defineRegion({ id:'guttered', name:'The Guttered Ways', prefix:'gw', music:'guttered',
  ambience:'cave', dark:0.55, mapColor:'#b08850' });
```
Default `dark` (darkness overlay strength 0..1): shore .2, lastlight .3, guttered .55, meltbloom .35,
flue .6, nave .45, chandlery .4, mothwood .7, rime .45, sanctum .3, test .3.
Ambience ids: shore `wind`, lastlight `village`, guttered `cave`, meltbloom `garden`, flue `fire`,
nave `rain`, chandlery `forge`, mothwood `forest`, rime `ice`, sanctum `sanctum`.

### 7.2 Rooms
```js
G.World.defineRoom({
  id: 'gw_03',                 // '<prefix>_<nn>' (two digits) — unique
  region: 'guttered',
  gx: 384, gy: 72,             // global tile coords of top-left; gx % 16 == 0, gy % 9 == 0
  tiles: [ '################################', /* ... */ ],  // equal-length strings
  legend: { a: { type: 'enemy', kind: 'snuffed_walker' }, s: { type: 'sconce', id: 'gw_sconce_a' } },
  entities: [ { type: 'lore', id: 'lore_gw_2', x: 12, y: 30 } ],  // x = column, y = row (tile coords)
  dark: 0.6,                   // optional override
  music: 'guttered',           // optional override; null = silence
  ambience: 'cave',            // optional override
  bgSeed: 7,                   // optional: varies procedural background
  theme: {},                   // optional art hints (documented by the art module in docs/ART_GUIDE.md)
  name: 'Hall of Dead Sconces',// optional (map tooltip/debug)
  dev: false                   // true only for test rooms (excluded from map/validation)
});
```
Width (columns) must be a multiple of 16 and ≥ 32; height (rows) a multiple of 9 and ≥ 18.

### 7.3 Tile legend
| Char | Code | Meaning |
|---|---|---|
| `.` | 0 EMPTY | air |
| `#` | 1 SOLID | terrain (grippable) |
| `X` | 2 GLAZED | terrain that **cannot be gripped** (smooth glazed wax / glass) |
| `=` | 3 PLATFORM | one-way platform: solid from above only; Down+Jump drops through |
| `^` | 4 SPIKES | hazard (thorns/spikes/shards — art varies by region); pogo-able |
| `~` | 5 WATER | meltwater: hazard without Oilcloak; swimmable surface with it |
| `%` | 6 LAVA | molten wax / hazard liquid; always a hazard |
| `B` | 7 BREAKABLE | solid until hit 3 times by the Brand (or spell/plunge); stays broken |
| `D` | 8 DIVEFLOOR | solid until Molten Plunge lands on it; stays broken |
| `:` | 9 BGWALL | non-solid decorative back wall (rendered as dim interior) |
| `a-z`,`0-9` | 0 EMPTY | entity marker → spawns `legend[char]` at this tile |

Tile codes are exposed as `G.T = { EMPTY:0, SOLID:1, GLAZED:2, PLATFORM:3, SPIKES:4, WATER:5,
LAVA:6, BREAKABLE:7, DIVEFLOOR:8, BGWALL:9 }` (defined in `namespace.js`) and `G.TILE_CHARS`
(char → code).

Liquids (`~`, `%`) must form pools with a flat top surface and air above (no floating liquid).
Breakable/dive tiles are tracked as connected components; component id =
`<roomId>:<minCol>,<minRow>`; broken state stored in progress flag `broken:<componentId>`.

### 7.3b Runtime room object (`G.Room`, created by `G.World.instantiate(id)` / the game)
Fields every module may rely on: `id`, `def` (the original definition object), `regionId`,
`region` (region object), `cols`, `rows`, `widthPx`, `heightPx`, `gx`, `gy`,
`tiles` (`Uint8Array(cols*rows)`, row-major, current state — broken breakables become EMPTY),
`tileAt(c, r)` (out of bounds → SOLID except across openings → EMPTY), `setTile(c, r, code)`,
`entities` (array), `solids` (array of rects rebuilt each step), `dark` (resolved darkness),
`components` (breakable components: `[{id, code, tiles:[[c,r],...], broken, hits}]`),
`add(entity)`, `find(pred)`, `findType(type)`, `artCache` (reserved for `G.Art`).

### 7.4 Openings, exits & transitions
- The outermost rows/columns are the room boundary. Any boundary tile that is not `#`/`X` is an
  **opening**. Openings must not be at corners. Every opening tile must face an opening tile of the
  neighboring room at the same global position (the validator enforces this).
- Horizontal exits (left/right) should be ≥ 3 tiles tall with solid floor beneath on both sides.
  Vertical exits (top/bottom) should be ≥ 3 tiles wide.
- Transition: when the player's center leaves the room rect, the engine finds the room containing
  that global point (`G.World.roomAtGlobal(gtx, gty)`), fades out (0.18 s), loads it, places the
  player at the same global position (nudged fully inside), fades in (0.18 s). Leaving through the
  **top** gives an upward boost (`EXIT_UP_VY`) so the player rises ~3 tiles into the room above;
  **level designers must provide a ledge within reach beside every upward exit.**
  Player velocity and facing are preserved horizontally.
- If no room is found (should never happen), the player is blocked by the boundary.

### 7.5 Entity placement
Marker at (col,row): `props.tx = col, props.ty = row`; the entity is created with
`G.Entity.create(props)` and positions itself: ground-standers put their feet at
`(row+1)*TILE` centered at `(col+0.5)*TILE`; flyers center on the tile center. A marker with an
`id` must appear only once. `entities: [...]` items use `x`/`y` for col/row and the same anchoring.

## 8. Physics (`G.Physics`) & the player motor (`G.PlayerMotor`)

### 8.1 Physics
```js
G.Physics.tileAt(room, tx, ty)          // tile code; out of bounds → SOLID (except at openings: EMPTY)
G.Physics.isSolidTile(code)             // SOLID, GLAZED, BREAKABLE(unbroken), DIVEFLOOR(unbroken)
G.Physics.move(body, room, dx, dy)      // move AABB with collisions; returns {hitX:-1|0|1, hitY:-1|0|1}
   // body: {x,y,w,h, dropThrough?:bool}. Collides with solid tiles, one-way platforms (only when
   // moving down, body's previous bottom <= platform top, and !dropThrough), and room.solids
   // (rects from solid entities such as closed gates). Sub-steps so no tunneling at any speed.
G.Physics.rectSolid(room, x, y, w, h)   // any solid overlap?
G.Physics.overlapTiles(room, x, y, w, h, code) // count of overlapping tiles of that code
G.Physics.onGround(room, body)          // standing on solid/platform/solid-entity?
G.Physics.raycast(room, x0, y0, x1, y1) // → {hit:bool, x, y, tx, ty}  (solid tiles only)
G.Physics.liquidSurface(room, tx, ty)   // y (px) of the top surface of the liquid pool containing tile
```
Room boundary: outside the room is solid **except** across openings (so the player can walk out).

### 8.2 Player motor — pure movement simulation (`src/player/motor.js`)
Pure functions over a plain state object; no rendering, audio, globals (other than `G.Physics`,
`G.CONST`). Used by the in-game player AND by `tools/reach.js` (headless reachability analysis),
so its behavior is the ground truth for level design.
```js
const s = G.PlayerMotor.create(x, y)    // x,y = top-left of the 26×54 box
G.PlayerMotor.step(s, inp, ctx)
   // inp: {left,right,up,down,jump,jumpPressed,dashPressed}  (booleans; jump = held)
   // ctx: {room, dt, abilities:{dash,grip,wings,oilcloak,plunge}, mods:{noKnockback?}}
   // fills s.events (cleared at the start of each step) with strings:
   //   'jump','doublejump','walljump','land','hardland','dash','grip','plunge','plungeLand',
   //   'splash','swim','hazard:spikes'|'hazard:lava'|'hazard:water'
G.PlayerMotor.startPlunge(s)            // controller calls when the plunge spell is cast (airborne)
G.PlayerMotor.pogo(s)                   // bounce up (down-slash hit); refills air dash & double jump
G.PlayerMotor.knockback(s, dirX)        // damage knockback
G.PlayerMotor.recoil(s, dirX, vertical) // nail recoil (small push back; upward slash none)
G.PlayerMotor.clone(s)                  // deep copy (for search)
G.PlayerMotor.METRICS                   // measured design metrics in tiles (see below)
```
State fields (at least): `x y w h vx vy facing onGround coyote jumpBuffer jumpHolding airDashUsed
dashTime dashCooldown dashDir wall wallJumpLock doubleJumpUsed inWater swimming plunging
knockTime recoilTime locked hazard lastSafe{x,y} fallStartY events[]`.
`s.locked = true` freezes control (gravity still applies) — used for kindling, dialogue, cutscenes.

**Required feel/metrics (TILE = 40):**
| Quantity | Target |
|---|---|
| Run speed | 330 px/s, reached in ≤ 0.05 s; stops in ≤ 0.05 s |
| Full jump apex (feet rise) | 4.4–4.8 tiles; ledges **≤ 4 tiles** above the floor must be reliably reachable |
| Short hop (tap) | ≤ 1.6 tiles |
| Running full-jump distance (flat) | 7.2–8.2 tiles; gaps **≤ 6 tiles** reliably crossable without dash |
| Flare Dash | 750 px/s for 0.18 s (~3.4 tiles), no gravity, cooldown 0.4 s, 1 air dash per airtime |
| Dash + jump gap | gaps **≤ 9 tiles** crossable; **≥ 12 tiles** not crossable even with dash (without wings) |
| Smokewing | adds 3.2–3.8 tiles; ledges **≤ 7 tiles** reachable with wings |
| Max fall speed | 960 px/s |
| Wall slide | 160 px/s; wall-jump: 0.14 s of forced horizontal push away (330 px/s), then free steering |
| Coyote / buffer | 0.08 s / 0.12 s |
| Upward room exit boost (`EXIT_UP_VY`) | enough to rise ~3 tiles |
| Swimming (oilcloak) | float with body ~60% above the surface, 0.65× run speed, can jump out |
| Plunge | 1400 px/s straight down, invulnerable, ends on ground (event 'plungeLand') |

**Level design rules derived from the motor (builders must follow; `tools/reach.js` verifies):**
- No abilities: climb ≤ 4 tiles, cross gaps ≤ 6 tiles.
- Dash gates: gaps of 9–10 tiles at equal height (impossible without dash); required traversals / the critical path use 9 tiles (comfortable take-off window), 10 only for optional rewards.
- Grip gates: sheer climbs ≥ 6 tiles with no intermediate footholds (use `X` glazed walls where a
  wall must NOT be climbable).
- Wings gates: ledges/platforms 6–7 tiles up with no grippable wall nearby (use `X` or `=`).
- Oilcloak gates: meltwater pools ≥ 13 tiles wide, or water under a low ceiling (≤ 3 tiles of air).
- Plunge gates: `D` cracked floors.
- Corridors ≥ 3 tiles tall where jumping is expected; 2-tall crawlspaces are walkable.

### 8.3 Hazards
Touching `^` spikes or `%` lava, or entering `~` water without Oilcloak (body overlaps the liquid
≥ 25% of its height) → motor sets `s.hazard`; the Player controller deals 1 damage, fades out,
and returns the player to `s.lastSafe` (last position standing on safe solid ground at least
1 tile from any hazard tile). Down-slash on spikes pogos the player instead of hurting.

## 9. Entities (`G.Entity`)
```js
class G.Entity {
  constructor(props)          // props from room data (+ tx, ty) or code
  // fields: type, x, y, w, h, vx, vy, room, dead, z (draw order; player = 0; negative = behind),
  //         team ('player'|'enemy'|'neutral'), hurtable (bool), solid (bool: blocks bodies),
  //         persistId (props.id or null), props
  init()                      // called after being added to a room
  update(dt)
  draw(ctx, t)                // world space (camera transform already applied)
  onHit(hit)                  // receive damage (see §10); return true if the hit "connected"
  remove()                    // mark dead; room removes at end of step
  get cx(); get cy(); get bottom(); get right();
}
G.registerEntity(type, Class)             // type string → class
G.Entity.create(props) → instance         // uses props.type; unknown type → reportError + null
room.add(entity), room.entities, room.find(pred), room.findType(type)
```
Solid entities (closed gates) expose `getSolidRect()` and are collected into `room.solids` each step.
Entities may register lights each frame via `G.lighting.add(...)` inside `update` or `draw`.

### 9.1 Entity types (props)  — implemented by the noted module
| type | props | owner |
|---|---|---|
| `start` | — (new-game spawn point; only in `sh_01`) | interact |
| `sconce` | `id` | interact |
| `lanternway` | `id` ∈ lastlight, guttered, meltbloom, nave, chandlery, mothwood, rime | interact |
| `lore` | `id` (key into `G.Text.lore`) | interact |
| `npc` | `npc` (thrum, pell, quill, bramm, wren, sable), `stage` (optional int) | interact |
| `shrine` | `ability` (bolt, dash, grip, oilcloak, plunge, wings), `requires` (condition, optional) | interact |
| `pickup` | `id` (unique), `item` (heartwax, urn, kiln_glass, spark, notch, sigil, cinders), `sigil`, `amount`, `requires` | interact |
| `geode` | `id`, `amount` (cinders) | interact |
| `lever` | `id` | interact |
| `gate` | `id`, `opens` (condition, e.g. `lever:gw_lv1`, `boss:effigy`, `seals>=3`), `w` (tiles, default 1), `h` (tiles, default 4) | interact |
| `arena_gate` | `id`, `w`, `h` — open until an arena in this room activates; reopens on boss defeat | interact |
| `sealdoor` | `id` — big ornate door; opens with `seals>=3` | interact |
| `arena` | `boss` (boss id), `bx`, `by` (boss spawn tile), `trigger` [c1,r1,c2,r2] (tile rect), `requires` (optional) | enemies (boss_base) |
| `enemy` | `kind` (registered enemy kind), `id`/`persistent` (unique enemies), other kind-specific props | enemies |
| `light` | `r` (tiles), `color`, `intensity` (0..1), `flicker` (bool) | interact |
| `decor` | `kind` (prop from `docs/ART_GUIDE.md`), `flip`, `scale`, `layer` ('back'|'front') | interact (draws via `G.Art.drawDecorProp`) |
| `respawn` | — hazard-respawn hint | interact |
| `event` | `script` (key in `G.Events`), other props | interact (`G.Events` registry), content |

Condition strings (shared, evaluated by `G.game.evalCondition`): terms joined by ` & `; each term is
optionally prefixed by `!`: `ability:<id>`, `boss:<id>`, `flag:<name>`, `item:<pickupId>`,
`seals>=N`, `sparks>=N`, `talked:<npc>:<talkId>`, `visited:<roomId>`, `region:<regionId>`, `sigil:<id>` (owned),
`equipped:<sigilId>`, `spark:<id>`, `seal:<id>`, `lantern:<lanternId>`, `chart:<regionId>`.
Empty/undefined condition = true.

### 9.2 Player contract (`G.Player`, registered as entity type `player`)
One Player instance persists for the whole session (created on new game / continue / respawn) and
is moved between rooms (`player.room` is updated by the engine; it is not part of `room.entities`
but is updated and drawn by the engine at z = 0). Health, ember and cinders live in
`G.game.progress` (single source of truth); the Player reads/writes them there.
```js
player.motor                 // G.PlayerMotor state (position lives here: motor.x/y; entity x/y mirror it)
player.facing                // 1 | -1
player.invuln                // seconds of invulnerability remaining
player.hurt(amount, source)  // called by G.Combat.hurtPlayer; handles i-frames, knockback, death
player.placeAt(x, y)         // teleport (top-left px), resets velocity
player.onRoomEnter(room)     // engine calls after a room change
player.resting               // true while seated at a sconce
player.busy()                // true if attacking/casting/kindling (interaction not allowed)
```
Interactables: any entity with `interactable = true`, `promptText` (e.g. 'Rest', 'Read', 'Talk',
'Listen', 'Travel', 'Take'), optional `interactRect()` (default: own box inflated by 20 px), and
`interact(player)`. Each step the Player finds the nearest overlapping interactable, shows
`G.UI.prompt` above it, and on **Up pressed** (grounded, not busy) calls `interact(player)`.

### 9.3 Cinders & scripted events
`G.dropCinders(room, x, y, amount)` spawns bouncing `cinder` entities (value split into 1/5/25
denominations) that the player collects on touch (`cinder_lure` attracts them from 6 tiles).
`G.Events[script] = { init(entity), update(entity, dt), draw?(entity, ctx, t) }` — registry for
`event` entities (one-off scripted moments such as Sable's glimpse). Content files may register.

## 10. Combat (`G.Combat`)
```js
G.Combat.attack({ owner, team, rect:{x,y,w,h}, damage, kind, dir:{x,y}, pogo:bool, id })
   // Instant overlap test against hurtable entities of other teams (and breakable tiles / geodes /
   // levers for team 'player'). Each target is hit at most once per attack `id`.
   // Returns [{target, hit}] for connected hits. kind: 'nail'|'spell'|'plunge'|'trail'|'thorns'|'enemy'
G.Combat.hurtPlayer(amount, source)   // source: entity or {x,y}; respects i-frames; returns bool
G.Combat.hazardPlayer(kind)           // spikes/lava/water path (see §8.3)
G.Combat.breakTilesInRect(room, rect, kind) // nail/spell vs 'B' (3 hits), plunge vs 'D'
```
`hit` object passed to `target.onHit(hit)`: `{damage, kind, dir:{x,y}, source, pogo}`.
Enemies with `contactDamage > 0` hurt the player on overlap (handled by the engine each step).
Enemy projectiles are entities with `team:'enemy'` that call `G.Combat.hurtPlayer`.
Ember gain: +11 per *nail* hit that connects on an enemy (`ember_thirst` +6). Spells give none.

## 11. Game (`G.game`) & progress (save data)

### 11.1 Progress schema (`G.game.progress`, persisted)
```js
{
  version: 1, slot: 0, playTime: 0, completed: false, ending: null,
  sconce: { room: 'sh_02', id: 'sh_sconce' },   // respawn sconce; null before first rest → start
  lastRoom: 'sh_01',
  maxHealth: 5, health: 5, heartShards: 0,
  ember: 0, urns: 0,                 // emberMax = 99 + 33*urns (− 33 while a wisp exists)
  cinders: 0, brandLevel: 0, kilnGlass: 0, notches: 3,
  abilities: { bolt:false, dash:false, grip:false, oilcloak:false, plunge:false, wings:false },
  sigils: [], equipped: [],
  sparks: [], seals: [],             // spark ids; seal ids 'bell' | 'kiln' | 'wing'
  bosses: {},                        // bossId → true
  flags: {},                         // 'item:<id>', 'broken:<comp>', 'lever:<id>', 'talked:<npc>:<id>', custom
  visited: {}, charts: {}, lanterns: {},
  wisp: null,                        // { room, x, y, cinders }
}
```

### 11.2 API
```js
G.game.mode               // 'boot'|'title'|'play'|'transition'|'dead'|'ending'
G.game.progress, G.game.room, G.game.player, G.game.region (region object), G.game.t (seconds)
G.game.newGame(slot), continueGame(slot), quitToTitle(), saveNow()
G.game.enterRoom(roomId, place)   // place: {tx,ty} | {x,y} (px) | {sconce:id} | {lanternway:id}
G.game.hitstop(sec), flash(color, sec), shake(px, sec)   // shake respects settings
G.game.fade(toAlpha, sec, onDone)  // full-screen black fade overlay (0 = clear, 1 = black)
G.game.lockPlayer(reason) / unlockPlayer(reason)        // stackable control locks (dialogue, cutscenes)
G.game.rest(sconce)               // heal to max, refill nothing else, save, set respawn, emit 'rest'
G.game.playerDied()
G.game.hasAbility(id), giveAbility(id)          // giveAbility shows G.UI.abilityGet
G.game.getFlag(k), setFlag(k, v = true)
G.game.addCinders(n), spendCinders(n) → bool
G.game.giveItem(spec)   // 'heartwax' | 'urn' | 'kiln_glass' | 'notch' | 'spark:<id>' | 'seal:<id>' | 'sigil:<id>' | 'cinders:<n>'
G.game.isEquipped(sigilId), equip(sigilId) → bool, unequip(sigilId), notchesUsed()
G.game.maxHealth()      // progress.maxHealth + (equipped heartwax ? 1 : 0)
G.game.emberMax()
G.game.evalCondition(str) → bool
G.game.bossDefeated(id), defeatBoss(id)        // sets flag, saves, emits 'bossDefeated'
G.game.startBossMusic(trackId), endBossMusic()
G.game.travel(lanternwayId)
G.game.completion() → 0..100 (integer)
G.game.isSafeRoom()     // no active arena, no hostile within 12 tiles, not hurt/attacked for 3 s (Lanternway/shops)
```
Saving: on rest, ability/major item pickup, boss defeat, quit to title, and every room transition
(position is NOT saved — respawn is always at the sconce, HK-style).

### 11.3 Flow
- Boot → `G.UI.openTitle()` (mode 'title'). `?test=1` skips the title and starts a new game in an
  in-memory slot (no localStorage writes), optionally at `?room=<id>&tx=&ty=`.
- New game → `G.UI.playIntro()` → room `sh_01` at the `start` entity; the Wickling wakes.
- Death → 'dead' mode: death animation → fade → spawn wisp data → respawn at sconce (or start).
- Region change → `G.Audio.music(region.music)`, `G.Audio.ambience(region.ambience)`,
  `G.UI.areaCard(regionId, firstVisit)`.
- Regular enemies respawn on every room load; entities with `persistent: true` and an `id` stay
  dead (`flags['dead:<id>']`).

## 12. Rendering (`G.Render`) & Art (`G.Art`)
Frame pipeline (engine `render.js`), all at 1280×720:
```
1  G.Art.drawBackground(ctx, room, cam, t)       screen space (sky, parallax layers)
2  [world transform: translate(-cam.x + shakeX, -cam.y + shakeY)]
3  G.Art.drawBackDecor(ctx, room, cam, t)        world
4  entities with z < -10                         world (e.g. background props)
5  G.Art.drawTerrain(ctx, room, cam, t)          world (prerendered chunks incl. spikes, platforms)
6  G.Art.drawBreakables(ctx, room, cam, t)       world
7  entities (z ascending; player z = 0)          world
8  G.fx.draw(ctx)                                world (particles)
9  G.Art.drawLiquids(ctx, room, cam, t)          world (over entities so they look submerged)
10 G.Art.drawFrontDecor(ctx, room, cam, t)       world
11 [restore]
12 G.Art.drawForeground(ctx, room, cam, t)       screen (parallax fg silhouettes)
13 G.lighting.render(ctx, room, cam, t)          screen (darkness with light holes + glows)
14 G.Art.drawAtmosphere(ctx, room, cam, t)       screen (weather, fog, vignette, grade)
15 screen flash / fades                          screen
16 G.UI.draw(ctx)                                screen (HUD + screens)
```
`cam` = `G.camera` = `{x, y, w:1280, h:720}` (top-left in room px, clamped to the room).

Art API (implemented by `src/art/*`, called by the engine and by entity draw code):
```js
G.Art.palette(regionId) → { skyTop, skyBottom, far, mid, near, fill, fillDeep, edge, highlight,
                            accent, light, fog, particle, mapColor, ... }
G.Art.prepareRoom(room)          // build caches; idempotent; LRU-dispose old rooms (keep ~6)
G.Art.onTilesChanged(room, c0, r0, c1, r1)   // after breakables break
G.Art.drawBackground / drawBackDecor / drawTerrain / drawBreakables / drawLiquids /
      drawFrontDecor / drawForeground / drawAtmosphere   (signatures as in the pipeline)
G.Art.updateAtmosphere(room, cam, dt)
G.Art.staticLights(room) → [{x, y, r, color, intensity, flicker}]   // world px
G.Art.drawDecorProp(ctx, kind, x, y, opts, t)                        // x,y = foot position
G.Art.glow(ctx, x, y, radius, color, alpha)                          // cached additive glow
G.Art.flame(ctx, x, y, size, kind, t, seed)    // kind: 'blue'|'orange'|'red'|'white'|'violet'|'gold'|'pale'
G.Art.char.*                                    // shared creature helpers (see docs/ART_GUIDE.md)
G.Art.mapColor(regionId)
```
Lighting (`G.lighting`): `add({x, y, r, color, intensity})` (world px; call every frame), `render(...)`.
Darkness = `room.dark ?? region.dark`. The player always emits a blue light (r ≈ 260 px).
Particles (`G.fx`): `burst(kind, x, y, opts)`, `spawn(particle)`, `update(dt)`, `draw(ctx)`, `clear()`.
Kinds: `spark ember smoke dust drip shard wax ring slash flash splash bubble snow ash pollen`.
Camera (`G.camera`): `follow(entity)`, `snap()`, `update(dt)` (smooth follow with look-ahead and
vertical deadzone, clamped to room), `shake(px, sec)`, `worldToScreen(x, y)`.

## 13. UI (`G.UI`)
```js
G.UI.update(dt), G.UI.draw(ctx)        // engine calls each frame (update runs even when paused)
G.UI.isBlocking() → bool               // true while a modal screen is open (gameplay frozen)
G.UI.openTitle()
G.UI.playIntro(onDone)
G.UI.dialogue({ name, lines, onDone }) // lines: array of pages (strings; '\n' allowed)
G.UI.lore(loreId, onDone)
G.UI.sparkMemory(sparkId, onDone)
G.UI.openShop(shopId, onDone)          // 'pell' | 'quill' | 'bramm'
G.UI.openLanternway(currentId, onDone)
G.UI.openMap(), G.UI.openInventory({ atSconce }), G.UI.openPause()
G.UI.abilityGet(abilityId, onDone)     // big card: name, description, how-to (uses G.input.label)
G.UI.itemGet(itemSpec, onDone)         // medium card for heartwax/urn/kiln/notch/seal/sigil/spark
G.UI.toast(text)                       // small, non-blocking
G.UI.areaCard(regionId, big)           // non-blocking
G.UI.bossCard(bossId)                  // non-blocking; uses G.Text.bosses
G.UI.prompt(x, y, text)                // world-space prompt; call every frame while relevant
G.UI.playEnding(endingId, onDone)      // 'undying' | 'gutterlight' → credits → onDone
```
The HUD (top-left Ember Well + candle row + cinders) is drawn automatically in 'play' mode.

## 14. Audio (`G.Audio`)
```js
G.Audio.init()                        // create AudioContext on first user gesture; idempotent
G.Audio.sfx(name, { vol, pitch, pan })  // pitch = playback-rate-like multiplier (1 = normal)
G.Audio.music(trackId | null, { fade = 1.5 })  // crossfade; same id = no-op
G.Audio.musicLayer(level)             // 0..1 intensity layer (tracks may define layered parts)
G.Audio.ambience(id | null)
G.Audio.setVolume(bus, v)             // 'master' | 'music' | 'sfx' | 'ambience'
G.Audio.duck(amount, sec)
G.Audio.defineTrack(id, data)         // data format documented by the audio module in docs/AUDIO_FORMAT.md
G.Audio.muted                         // ?mute=1 sets true
```
Required SFX names: `jump doublejump land hardland walljump grip dash slash slash_hit slash_wall
pogo enemy_hit enemy_die player_hurt player_die hazard bolt bolt_hit plunge plunge_land kindle
kindle_done ember_full cinder item ability rest save lever gate_open gate_close break_wall
geode_hit geode_break splash swim shrine wisp wisp_die door boss_roar boss_hit boss_die
boss_stagger shockwave projectile bell menu_move menu_select menu_back dialogue_blip map_open
shop_buy deny area_card lanternway step`.
Tracks: `title shore lastlight guttered meltbloom flue nave chandlery mothwood rime sanctum boss
sable keeper lucerne ending`.
Ambience: `wind village cave garden fire rain forge forest ice sanctum`.

## 15. Text (`G.Text`, `src/data/text.js`) & items (`G.Items`, `src/data/items.js`)
```js
G.Text = {
  intro: [ 'page', ... ],
  areas: { shore: { name: 'Ashen Shore', sub: '...' }, ... },          // all 10 regions
  npcs: {                                                              // key = npc or npc_stage
    thrum: { name: 'Old Thrum', talks: [
      { id: 'meet', when: '!talked:thrum:meet', once: true, lines: ['...', '...'] },
      { id: 'notch', when: 'seals>=3 & !flag:thrum_notch', once: true, lines: [...],
        give: 'notch', setFlag: 'thrum_notch' },
      { id: 'idle', lines: [...] }                                    // fallback
    ] },
    pell: { name: 'Pell', shop: 'pell', talks: [...] },               // `shop` → opens after talk
    // quill, bramm, wren_1..wren_4, sable_1.. (non-combat), …
  },
  lore: { lore_sh_1: { title: '...', lines: ['...'] }, ... },
  sparks: { spark_gw: { lines: ['...'] }, ... },                       // 6 memories
  abilities: { bolt: { name, desc, how }, ... },                       // `how` may use {spell} {dash} {jump} {attack} {down} {up} tokens
  items: { heartwax: { name, desc }, urn, kiln_glass, notch, spark, seal_bell, seal_kiln, seal_wing, chart },
  sigils: { swift_brand: { name, desc }, ... },                        // all 14
  bosses: { effigy: { name, sub, intro?: ['line'] }, ... },            // all 8
  endings: { undying: { title, pages: [...] }, gutterlight: { title, pages: [...] } },
  credits: [ '...' ],
  shops: { pell: { greet, bought, poor, empty }, quill: {...}, bramm: {...} },
  ui: { ... }                                                          // misc UI strings
};
G.Items = {
  sigils: { swift_brand: { cost: 2 }, ... },                           // all 14 (costs per DESIGN §3.5)
  shops: { pell: [ { item: 'heartwax', id: 'shop_pell_hw1', price: 150 }, ... ],
           quill: [ { item: 'chart', region: 'guttered', price: 40 }, ... ],
           bramm: [ { level: 1, price: 250, glass: 0 }, { level: 2, price: 700, glass: 1 }, { level: 3, price: 1500, glass: 2 } ] },
  brandDamage: [5, 9, 13, 17],
  totals: { heartwax: 8, urns: 2, kilnGlass: 3, sparks: 6, seals: 3, sigils: 14, notches: 6, bosses: 8 },
};
```
Line text may contain `{jump}`, `{attack}`, `{dash}`, `{spell}`, `{map}`, `{inventory}`, `{up}`,
`{down}` tokens which the UI replaces with `G.input.label(...)`.

## 16. Debug & test API (`G.debug`, URL params)
URL params: `test=1` (skip title, new in-memory game), `paused=1` (do not start the RAF loop; the
harness drives frames via `G.debug.step`), `room=<id>&tx=&ty=` (start room/tile), `abilities=all|a,b`,
`god=1`, `mute=1`, `debug=1` (overlay: room id, FPS, hitboxes), `seed=<n>`, `testrooms=1`
(start in the dev test room if no `room`).
```js
G.debug.step(n = 1)          // run n fixed updates, then render once (works when paused)
G.debug.render()
G.debug.state()              // {mode, room, region, player:{x,y,vx,vy,health,ember,onGround,...},
                             //  entities:[{type,kind,x,y}], ui:[screen names], errors:n}
G.debug.teleport(roomId, tx, ty)
G.debug.give(spec | 'all')   // abilities / items, e.g. 'dash', 'seal:bell', 'all'
G.debug.god(on)              // invulnerable
G.debug.setInput(state, frames)  // hold virtual input for N frames (then auto-clear) — used with step
G.debug.spawn(props)         // spawn entity in current room
G.debug.killAll()
G.debug.listRooms()
G.debug.errors               // collected error strings
```
The harness `tools/shot.js` / `tools/lib/browser.js` opens `index.html` and waits for `G.ready`.

## 17. Tools (Node, `tools/`)
- `tools/shot.js` — open game headless, run JS, screenshot, report console errors (exists).
- `tools/plan_check.js` — validates `design/world_plan.json` (architect).
- `tools/validate.js` — static validation of all data: formats, dimensions, alignment to grid,
  no overlaps, every opening matched, entity props valid, ids unique, text keys exist, rooms
  conform to the world plan (exits), etc.
- `tools/reach.js` — physics-based reachability using `G.PlayerMotor`: verifies each room's
  traversal requirements from the world plan (possible with the listed abilities; impossible
  without the gating ability where the plan says it is a gate), and global completability with
  no softlocks.
- `tools/smoke.js` — headless: boot, title, new game, visit every room, step frames, screenshot
  each room to `test-output/rooms/`, fail on any error.
- `tools/build.js` — produce `dist/Gutterlight.html` (single file, all scripts inlined in
  `index.html` order).

## 18. World plan (`design/world_plan.json`)
Produced by the architect; the source of truth for room rects, exits and gating.
```json
{
  "cell": { "w": 16, "h": 9 },
  "rooms": [
    {
      "id": "gw_01", "region": "guttered", "gx": 320, "gy": 36, "w": 64, "h": 18,
      "kind": "corridor",
      "exits": [ { "id": "W1", "side": "W", "pos": 12, "size": 3, "to": "ll_03", "toExit": "E1" } ],
      "paths": [ { "from": "W1", "to": "E1", "requires": [] }, { "from": "E1", "to": "W1", "requires": ["dash"] } ],
      "spots": [ { "id": "item:gw_hw1", "from": "E1", "requires": ["grip"] } ],
      "contents": [ "sconce:gw_sconce_a", "enemy:snuffed_walker*3", "pickup:heartwax#gw_hw1", "lore:lore_gw_1" ],
      "notes": "free text for the builder"
    }
  ]
}
```
- `pos`: for W/E exits, the row of the topmost open tile; for N/S, the column of the leftmost
  open tile (room-local). `size`: number of open tiles.
- `paths`: directional traversal requirements between exits inside the room (ability ids plus
  `boss:<id>`, `lever:<id>`, `seals>=3`). `spots`: requirements to reach a content spot
  (pickup/shrine/npc/boss trigger) from an exit.

## 19. Content ID conventions (shared by architect, writer, builders)
| Thing | ID pattern | Notes |
|---|---|---|
| Rooms | `<prefix>_<nn>` | prefixes: sh ll gw mb sf dn ch mw ri hs; arenas are normal room ids |
| Lore tablets | `lore_<prefix>_<n>` | counts: sh 3, ll 2, gw 5, mb 4, sf 4, dn 6, ch 4, mw 4, ri 4, hs 2 (38). `lore_sh_1..3` are carvings that teach controls (use `{jump}` etc. tokens) with a hint of lore |
| Chandler's Sparks | `spark_gw spark_mb spark_sf spark_dn spark_ch spark_mw` | pickup `item:'spark'`, `id` = spark id |
| Sconces | `<prefix>_sconce_<a|b>` | ≥1 per region, 2 in regions with ≥ 8 rooms (sanctum: 1, before the final arena) |
| Lanternway posts | region id | `lastlight guttered meltbloom nave chandlery mothwood rime` |
| NPCs | `thrum pell quill bramm` (Lastlight), `wren` stages 1–4 (text keys `wren_1`…`wren_4`: guttered, nave, mothwood, rime), `sable` stages 1–2 (`sable_1`: glimpse on a high ledge in the Guttered Ways; `sable_2`: at the Sanctum gate after duel 2) | npc entity `{type:'npc', npc:'wren', stage:2}` → text key `wren_2` |
| Pickups (world) | heartwax `<prefix>_hw<n>`, urn `<prefix>_urn`, kiln glass `<prefix>_kg`, notch `<prefix>_notch`, sigil `<prefix>_sig_<sigilId>` | |
| Shop stock | `shop_pell_hw1 shop_pell_hw2 shop_pell_urn shop_pell_notch shop_pell_<sigilId>` | |
| Levers / gates | `<prefix>_lv<n>` / `<prefix>_gate<n>` | gate `opens: 'lever:<prefix>_lv<n>'` |
| Geodes | `<prefix>_geo<n>` | |
| Unique enemies | `<prefix>_u<n>` | with `persistent: true` |
| Bosses | `effigy sable1 matron tallowmere kilnmother vespertine sable2 lucerne` | flags `boss:<id>` |
| Seals | `bell kiln wing` | from tallowmere / kilnmother / vespertine |

**Sigil sources:** sold by Pell (5): `cinder_lure waymoth steadfast smolder_shell kindle_haste`.
Gift: `long_brand` from Wren (stage 4). Placed in the world (8): `swift_brand heartwax ember_thirst
flare_trail bright_bolt thorned_wax last_light deep_kindle` (secret rooms, optional challenges, boss
rewards — exact rooms chosen in the world plan).

**Enemy kinds (fixed ids; each region's builder implements them in `src/entities/enemies/<region>.js`):**
- shore: `ash_crawler ash_fly`
- guttered: `snuffed_walker snuffed_lancer drip_fly wick_crawler`
- meltbloom: `bloom_spitter thorn_hopper pollen_moth vine_lurker`
- flue: `soot_sprite chimney_crawler stoker ash_bat`
- nave: `drowned_acolyte rain_jelly bell_sentry drowned_knight`
- chandlery: `moldling ladle_brute drip_slime forge_wisp`
- mothwood: `dusk_moth cocoon_spawner dust_maw moth_knight`
- rime: `frost_husk ice_spitter rime_wraith shard_crawler`
Lastlight and the Sanctum have no regular enemies. Enemies may appear outside their home region
sparingly (e.g. `drip_fly` in the Nave) since all are loaded globally.
