# Engine API — `G.*` runtime core (module: engine)

Implements TECH_SPEC §4–12 and §16. Everything here is **live and tested**:
`node tools/motor_metrics.js` (48 motor checks), `node tools/engine_selftest.js` (46 checks: Node
loader + scripted headless play in the dev rooms). Read TECH_SPEC first; this file documents the exact
behaviour, the extensions, and how to plug in.

Files: `src/core/{namespace,util,input,save}.js`, `src/engine/{physics,world,room,entity,combat,camera,
particles,lighting,render,game,debug}.js`, `src/player/motor.js`, `src/data/regions/_regions.js`,
`src/data/test_rooms.js`, `src/main.js`, `tools/lib/node_loader.js`, `tools/motor_metrics.js`,
`tools/engine_selftest.js`.

Contents: 1 Quick start · 2 Core · 3 Input · 4 Save & settings · 5 World & rooms · 6 Entities ·
7 Physics · 8 Player motor · 9 Combat · 10 Camera · 11 Particles · 12 Lighting · 13 Render ·
14 Game · 15 Contracts the engine expects (Player, UI, Audio, Art) · 16 Debug & testing · 17 Dev rooms

---

## 1. Quick start

```js
// src/entities/example.js — a tiny glowing enemy
(function () {
  'use strict';
  const G = globalThis.G;
  class Glowbug extends G.Entity {
    constructor(props) {
      super(props);                 // props from room data: {type, kind, tx, ty, ...}
      this.w = 30; this.h = 24;
      this.anchor = 'center';       // marker tile → centered on the tile (flyers)
      this.team = 'enemy'; this.hurtable = true; this.contactDamage = 1;
      this.hp = 20;
    }
    update(dt) {
      this.vx = Math.sin(this.t * 2) * 80;
      this.move(this.vx * dt, 0);                  // G.Physics.move against tiles + solids
      G.lighting.add({ x: this.cx, y: this.cy, r: 90, color: '#ffd080', intensity: 0.6 });
    }
    onHit(hit) {                                     // hit = {damage, kind, dir:{x,y}, source, pogo}
      this.hp -= hit.damage;
      G.fx.burst('spark', this.cx, this.cy, { count: 6 });
      if (this.hp <= 0) { G.dropCinders(this.room, this.cx, this.cy, 5); G.events.emit('enemyKilled', { enemy: this }); this.remove(); }
      return true;                                   // the hit connected (ember, recoil, sfx for the attacker)
    }
    draw(ctx, t) {                                   // world space; ctx is saved/restored around this call
      G.fx.glowAt(ctx, this.cx, this.cy, 40, '#ffd080', 0.5);
      ctx.fillStyle = '#2a2018'; ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }
  G.registerEntity('glowbug', Glowbug);
})();
```
Room data: `legend: { b: { type: 'glowbug' } }` and a `b` in the tile rows, or
`entities: [{ type: 'glowbug', x: 12, y: 7 }]` (x/y = column/row). Test it:
`node tools/shot.js --query "test=1&paused=1&room=dev_01&tx=12&ty=15" --eval "G.debug.spawn({type:'glowbug', tx:16, ty:12})" --eval "G.debug.step(60)" --out test-output/<module>/bug.png`

---

## 2. Core (`namespace.js`, `util.js`)

| Name | Description |
|---|---|
| `G.CONST` | `{TILE:40, VIEW_W:1280, VIEW_H:720, CELL_W:16, CELL_H:9, DT:1/60, PLAYER_W:26, PLAYER_H:54, GRAVITY:2600, MAX_FALL:960}` |
| `G.T`, `G.TILE_CHARS` | tile codes / char → code (§7.3) |
| `G.VERSION` | `'1.0.0'` |
| `G.ready` | `true` after `main.js` boot (also set if boot threw — check errors) |
| `G.params` | URL query as `{key: string}` (`{}` in Node). `G.test` = `?test=1` |
| `G.reportError(err, where)` | logs once per unique `[where] message`; collected in `G._errors` (=== `G.debug.errors`) |
| `G.warnOnce(key, text)` | `console.warn` once per key (missing content during development) |
| `G.events.on/off/once/emit/clear` | event bus; listener exceptions are caught and reported |
| `G.Events` | registry for `event` entities: `G.Events[script] = {init, update, draw?}` |
| `G.sfx(name, opts)` | safe `G.Audio.sfx` (no-op if audio is missing) |
| `G.sfxAt(name, worldX, opts)` | same, auto-panned by the x position relative to the camera and faded by the distance from the view (`G.sfxGain`): full inside the view, smoothly to `G.SFX_FALLOFF.floor` (0.2) at one view width/height outside, silent (not played) from `G.SFX_FALLOFF.far` (1.5) views. Pass `opts.y` (world y) for vertical falloff. Exempt: `opts.global`, names in `G.SFX_GLOBAL` (boss_roar/stagger/hit/die, gate_open/close, door), and everything during an active arena fight |

**Events emitted by the engine** (payloads):
`roomEnter {room}` · `regionEnter {region, first}` · `playerHurt {amount, source}` · `playerDied {}` ·
`respawn {}` · `itemGet {item}` (spec string) · `abilityGet {id, isNew}` · `bossDefeated {id}` ·
`rest {sconce}` · `save {slot, ok, persistent}` · `newGame {slot}` · `continue {slot}` · `cinders {amount, total}` ·
`emberFull {}` · `sigilsChanged {}` · `tilesHit {room, comp}` · `tilesBroken {room, comp, kind}` ·
`gamepadLost {wasActive}` (G.input: the pad vanished; `lastDevice` falls back to `'keyboard'`; main.js pauses if it was in use).
Other modules emit: `enemyKilled {enemy}`, `bossStart {id}` (enemies/bosses).

`G.U`: `clamp lerp clamp01 invLerp remap approach(cur,target,delta) damp(cur,target,rate,dt) sign
smoothstep fract wrap rand(a,b) randInt(a,b) choose(arr) hash(str)→uint32 dist angle lerpAngle
aabb(a,b) pointInRect(px,py,r) ease.{linear,inQuad,outQuad,inOutQuad,inCubic,outCubic,inOutCubic,
inSine,outSine,inOutSine,inBack,outBack,outElastic,outBounce} hexToRgb rgbToHex rgba(hex,a) mix(a,b,t)
shade(hex,amt) makeCanvas(w,h)→{canvas,ctx} now() formatTime(sec)→'m:ss'|'h:mm:ss'`.
`rgba` and `hexToRgb` are cached (cheap per frame).

`new G.RNG(seed)` (number or string): `next() range(a,b) int(a,b) pick(arr) chance(p) sign() shuffle(arr)`.
Seed procedural art from `G.U.hash(room.id)`.

## 3. Input (`G.input`)

Exactly TECH_SPEC §6: `update() down(a) pressed(a) released(a) consume(a) anyPressed() lastDevice
label(a) setVirtual(state) clearVirtual()` plus:
- `consumeAll()` — clear every pressed edge (use after closing a screen so the press doesn't leak).
- `reset()` — drop all held/pressed state.
- `GAME_ACTIONS` = the 12 rebindable actions `left right up down jump attack dash spell interact map inventory pause`;
  `ACTIONS` = those + the derived menu actions `confirm cancel`.

**Bindings (rebindable).** Every gameplay action has 3 slots: `[primary, secondary, gamepad]`; slots 0/1 take
keyboard/mouse inputs, slot 2 (`PAD_SLOT`) pad inputs; each holds a typed id or `null`:
`'key:<KeyboardEvent.code>'` (Shift/Control/Alt/Meta merged: `'key:Shift'`), `'mouse:<button>'` (0 LMB, 1 MMB,
2 RMB, 3 Mouse 4/back, 4 Mouse 5/forward), `'pad:<standard button>'`, `'axis:<index>-'|'+'`.
Defaults = TECH_SPEC §6 (left ←/A/D-pad ←, … jump Z/Space/A, attack X/J/X, dash C/Shift/RB, spell V/L/B,
interact ↑/W/D-pad ↑, map Tab/M/Back, inventory I/—/LB, pause Esc/P/Start). Dash's other defaults (K, RT) don't fit
the slots: they are "extras" (`getExtras()`), active until the player edits that column group of Dash (any keyboard
slot drops K, the pad slot drops RT), binds them elsewhere, or resets.
- `getBindings()` → `{action: [s0, s1, s2]}` (copy); `defaultBindings()`; `getExtras()`.
- `setBinding(action, slot, id)` → `{ok, moved:[{action, slot, input}], swapped, reason, action}`. The input is
  removed from any other gameplay action (up and interact may share). If that would leave the other action with no
  binding at all, it receives this slot's previous input (`swapped`); with nothing to swap the call is refused
  (`reason:'last'`). Other reasons: `'kind'` (wrong slot kind), `'reserved'` (Escape — only pause may hold it —,
  Backspace, Delete, Enter, NumpadEnter), `'os'` (Meta/Win/Cmd), `'input'`, `'action'`, `'slot'`. `reason:'last'` with
  `device:'gamepad'`: Pause would be left without a pad input (a rebind that takes Pause's pad button swaps that
  action's old pad input into Pause, or is refused). On success `warning:'ctrlCombos'` when Ctrl is bound together
  with W/T/N (the browser always handles Ctrl+W/T/N).
- `clearBinding(action, slot)` → `{ok}`; refused (`reason:'last'`) when it is the action's last input.
- `resetBindings()`. Every change bumps `labelsVersion` and persists (`G.settings.bindings` + `G.Save.saveSettings()`).
- `loadBindings(raw)` (validates: wrong version / non-object → defaults; a corrupt entry → that slot's default;
  duplicates → first owner keeps it; an action left empty → the whole table resets) and `serializeBindings()` →
  `{v:1, slots, extra}` — used by `G.Save`. `sanitizeBindings(raw)` = the validator alone.
- `activeInputs(action, menu)` — every id the action reacts to now (bindings + extras + implicit + fallbacks).
- Implicit inputs (only while not bound to another action): the left stick moves (`axis:0-/0+/1-/1+`, stick up = up
  + interact) and Start pauses.
- **Lockout protection**: Escape always pauses and cancels; `confirm` = Enter / NumpadEnter / pad A + jump's
  keyboard/mouse inputs (+ J while Attack still has it); `cancel` = Escape / Backspace / pad B (+ X while Attack
  still has it). While a menu has the input (`G.game.mode !== 'play'` or `G.game.uiBlocking()`; `forceMenu`
  true/false overrides) the arrow keys, D-pad and left stick also drive up/down/left/right, whatever the bindings.
- **Mouse**: listeners on the init target (window): presses count only on the canvas / page body, releases
  anywhere. Only bound buttons have their default prevented (no selection, middle-click scroll, back/forward
  navigation on Mouse 4/5); the canvas keeps keyboard focus. While any mouse button is bound the browser context
  menu is suppressed on the game. Unbound clicks are never actions (and never `anyPressed`). A mouse press sets
  `lastDevice = 'keyboard'`.
- **Capture** (Controls screen): `beginCapture(cb)` waits for the next key / mouse button (on the game) / pad button
  or stick push (> 0.6 from rest, any connected pad) and calls `cb` once from `update()` with `{input: id}`,
  `{clear: true}` (Backspace/Delete) or `{cancel: true[, timeout: true]}` (Escape, or 10 s without input — pads
  have no Esc). No action is reported while capturing and the ending input is swallowed until released.
  `cancelCapture()`, `capturing`, `captureTime`.
- `rawDown(id)`, `rawPressed(id)` — the physical state of one typed id this step, independent of bindings.
- Labels: `label(a)` (prompts, last-used device; pad movement shows arrows; an action with no pad binding shows its
  keyboard label), `keyLabels(a)` → `['Z','Space']`, `padLabels(a)` → `['A']`, `labelOf(id)` (`'LMB'`, `'Mouse 4'`,
  `'LS ←'`, `'Num 5'`, …), `keyLabel(code)`. `KEYMAP` / `PADMAP` remain as read-only views (codes / buttons per
  action rebuilt from the current bindings).
- Keys are physical positions (`KeyboardEvent.code`); labels name the key PRINTED there: filled from `navigator.keyboard.getLayoutMap()` (when available) and learned from `e.key` on every key press (AZERTY: jump shows `W`, up shows `Z`). `labelsVersion` bumps on every label or binding change (`UI.layoutRich` caches key on it); `refreshLabels()` re-reads the layout map. Without either source the labels are QWERTY.
- Several gamepads: only the pad with the most recent activity (new button press, or a stick leaving its resting range) drives the game; until then the first `standard`-mapping pad. Axes already outside the deadzone when a pad appears (pedals) are not activity.
- Sub-frame taps are latched: a key / mouse button pressed and released between two steps still counts as one press.
- `interact` defaults to the same inputs as `up` (keyboard, D-pad and stick). `setVirtual({up:true})` also sets `interact`.

The engine calls `G.input.update()` once per fixed step before `G.UI.update`. UI code should
`consume()` the actions it handles.

## 4. Save & settings (`G.Save`, `G.settings`)

`G.Save.load(slot)→progress|null`, `save(slot, progress)→bool`, `remove(slot)`, `exists(slot)`,
`claim(slot)` (New Game: start tracking a slot without loading it), `isStale(slot)`. Multi-window safety: every slot write stores a unique `_stamp` (stripped on load); a save is refused (`false`, slot marked stale, event `saveConflict {slot, first}`) when the stored stamp differs from the one this session loaded/claimed/last wrote, and a `storage` event from another window marks the slot stale at once. `game.saveNow` then stops saving and toasts `saveConflict` ('This save was changed in another window - return to the title'); Continue/New Game clears it.
`summary(slot)→{slot, exists, regionId, regionName, playTime, playTimeText, completion, completed,
ending, health, maxHealth, cinders}`, `list()` (3 summaries), `SLOTS = 3`, `memoryOnly`, `lastWriteOk` (false after a failed localStorage write — the
newest value is then kept and read from memory), `persistent`. `summary.completed` is true once any ending was seen
(`completed` or `endingsSeen`); `summary.ending` = current or last seen ending. If a save does not persist, `saveNow`
shows a one-time toast (failed write / storage unavailable; outside `?test=1`).
`G.settings = {masterVolume, musicVolume, sfxVolume, ambienceVolume, shake (0..1), hints (bool), bindings}`
(`bindings` = `{v, slots, extra}` from `G.input.serializeBindings()`, shared by all save slots; loaded and validated
through `G.input.loadBindings`, written from `G.input` on every save — G.input is the source of truth);
after changing call `G.Save.saveSettings()` (persists + pushes volumes to `G.Audio`).
`?test=1` → memory only, localStorage is never touched. localStorage failure → silent memory fallback.

## 5. World & rooms (`G.World`, `G.Room`)

```js
G.World.defineRegion({ id, name, prefix, music, ambience, dark, mapColor })   // _regions.js defines all 11
G.World.defineRoom(def)          // §7.2; returns def or null. Never throws.
```
`defineRoom` warns (console + `G.World.warnings[]`) but keeps going on: bad id format / prefix,
unknown region, gx/gy not on the 16×9 grid, width/height not multiples (≥ 32×18), ragged rows
(normalized to the most common width), unknown tile chars, markers without a legend entry, legend keys
that are not `a-z0-9` or lack `type`, an `id` marker used more than once, overlapping rooms, duplicates.

Lookup: `getRoom(id)→def`, `roomInfo(id)→{cols,rows,gx,gy}`, `roomAtGlobal(gtx,gty)→def|null`
(fractional tiles ok), `listRooms({dev?, region?})→ids`, `roomsInRegion(id)`, `firstDevRoom()`,
`openingsOf(defOrId)→[{side:'W'|'E'|'N'|'S', pos, size}]`, `entitySpecsOf(def)→[{props, tx, ty, marker?}]`,
`findEntitySpecs(pred(props, spec, roomId))→[{roomId, props, tx, ty}]` (e.g. find the room of a sconce),
`regions` (id → region), `rooms` (id → def), `REGION_IDS` (the 10 real regions, in world order).
Tests only: `removeRoom(id)→bool` forgets a registered room (e.g. `tools/ui_selftest.js` removes the shipped
rooms before it builds its synthetic world).

Runtime rooms: `G.World.instantiate(id, opts)` / `createRoom(def, opts)` → `G.Room` in the browser
(`G.World.TileRoom` in Node or with `opts.tileOnly`). `opts.flags` = progress flags (broken components
start broken), `opts.regionId` = render a **dev** room as another region (`?region=` does this
automatically). The game creates rooms; content code reads `G.game.room`.

`G.Room` fields (§7.3b): `id def regionId region cols rows widthPx heightPx gx gy tiles dark components
openings entities solids artCache time entitySpecs`. Methods: `tileAt(c,r)` (out of bounds → SOLID,
EMPTY across openings), `setTile(c,r,code)`, `inBounds(c,r)`, `componentAt(c,r)`,
`breakComponentAt(c,r,kind)`, `add(entity)` (sets `entity.room`, calls `init()`; init throwing →
reported, entity dropped), `spawn(props)` (create + add), `find(pred)`, `findAll(pred)`,
`findType(type)→[]`, `findById(id)`, `enemiesAlive()`, `rebuildSolids()`, `removeDead()`.
Components: `{id:'<room>:<minCol>,<minRow>', code, tiles:[[c,r]...], broken, hits, c0, r0, c1, r1}`.

Entity spawning on room load: every legend marker / `entities[]` item → `G.Entity.create(props + {tx, ty})`.
Unregistered types are skipped with ONE warning per type. `persistent: true` + `id` + flag
`dead:<id>` → not spawned. The wisp entity (`type:'wisp'`) is spawned by the engine from
`progress.wisp` when that room loads (`{type:'wisp', x, y, cinders}`, x/y = world px of the death spot center).

## 6. Entities (`G.Entity`)

Fields set by the base constructor (override in yours): `props type x y w=32 h=32 vx vy room dead
z=0 team='neutral' hurtable=false solid=false noGrip=false contactDamage=0 persistId=props.id||null
anchor='ground' facing=1 t (age s, advanced by the engine) cull=true`.

| Member | Notes |
|---|---|
| `init()` | after `room.add` (room is set) |
| `update(dt)` | fixed step; skipped during hitstop/pause/UI-blocking |
| `draw(ctx, t)` | world space; `ctx.save/restore` around it; culled when off-screen (`cull=false` to always draw) |
| `onHit(hit)` | return `true` if the hit connected |
| `remove()` | sets `dead`; removed at the end of the step (`onRemoved()` hook called) |
| `onRoomExit()` | optional, called on every entity when the player leaves the room |
| `hurtRect()` | optional custom hurtbox (default = own box) |
| `contactRect()` | optional custom contact-damage box |
| `getSolidRect()` | for `solid = true` entities; default own box `{x,y,w,h,owner,noGrip,oneWay}` |
| `interactable, promptText, interactRect(), interact(player)` | §9.2 interactables |
| `pogoable` | enemies are pogo-able unless `false`; neutral entities only if `true` |
| `noEmber` | enemy hits give no ember (e.g. projectiles that are hurtable) |
| `placeAtTile(tx, ty, anchor)` | anchors: `'ground'` (feet on the tile bottom, centered), `'center'`, `'top'`, `'tile'` (top-left) |
| `cx cy bottom right`, `move(dx,dy)`, `onGround()`, `overlaps(o)`, `distTo(o)`, `player` (getter), `markDead()` | helpers; `markDead()` sets `dead:<id>` for persistent entities |

`G.registerEntity(type, Class)`; `G.registerEntityFactory(type, fn(props)→entity|null)` for types that
dispatch on props (e.g. enemies by `kind`). `G.Entity.create(props)`: unknown type or a throwing
constructor → `reportError` + `null`; positions from `props.tx/ty` using `this.anchor` set in your
constructor, or from `props.cx/cy` (center px), or `props.x/y` (px, read by the base constructor).
`G.Entity.isRegistered(type)`, `G.Entity.types()`.

Robustness: an exception in `update`/`draw` is reported and the entity removed (the player is never removed).

Solid entities: `solid = true` → collected into `room.solids` every step (after entity updates).
`oneWay: true` on the rect = jump-through moving platform; `noGrip = true` = cannot be wall-gripped.

Cinders: `G.dropCinders(room, x, y, amount)` spawns bouncing `cinder` entities (25/5/1 denominations;
collected on touch; Cinder Lure attraction handled).

## 7. Physics (`G.Physics`) — Node-loadable

`tileAt(room,tx,ty)`, `rawTileAt`, `isSolidTile(code)`, `isLiquidTile`, `isHazardTile`,
`move(body, room, dx, dy)→{hitX, hitY}` (swept per axis: tiles, one-way platforms (when moving down,
previous bottom ≤ top, and not `body.dropThrough`), `room.solids` except the body's own rect),
`sweepX/sweepY(body, room, d)→allowed d`, `rectSolid(room,x,y,w,h)`, `overlapTiles(room,x,y,w,h,code)→count`,
`onGround(room, body)`, `groundInfo(room, body)→{tiles[], platform, entity, unsafe}`,
`wallContact(room, body, dir)→0|1 grippable|2 not grippable`, `liquidSurface(room,tx,ty)→y|null`,
`liquidDepth(room, body, code)→{depth, surface}`, `raycast(room,x0,y0,x1,y1)→{hit,x,y,tx,ty}`,
`breakAt(room,tx,ty,kind)`. Typical ground enemy:
```js
this.vy = Math.min(this.vy + 2600 * dt, 960);
const r = this.move(this.vx * dt, this.vy * dt);
if (r.hitY > 0) this.vy = 0;          // landed
if (r.hitX) this.vx = -this.vx;       // turn at walls
```

## 8. Player motor (`G.PlayerMotor`) — Node-loadable, the ground truth for level design

API per TECH_SPEC §8.2: `create(x,y)`, `step(s, inp, ctx)`, `startPlunge(s)`, `pogo(s)`,
`knockback(s, dirX)`, `recoil(s, dirX, vertical)`, `clone(s)`, plus `exitUpBoost(s)`,
`isSafeGround(room, s, abilities)`, `C` (tuned constants), `METRICS`.
`inp = {left,right,up,down,jump,jumpPressed,dashPressed}`, `ctx = {room, dt, abilities, mods:{noKnockback}}`.
`s.events` per step: `jump doublejump walljump land hardland dash grip pogo plunge plungeLand splash swim
hazard:spikes|hazard:lava|hazard:water`. `s.hazard` (string) freezes the motor until cleared
(the engine does this). `s.locked = true` → no control, physics continues.

Measured (`METRICS`, tiles): run 8.25 t/s · jump apex 4.5 · tap hop 0.36 · running jump 7.29 ·
max ledge 4 (7 with wings, +3.32) · max gap 8 without dash, 11 with dash · dash 3.38 t in 0.18 s ·
max fall 24 t/s · wall slide 4 t/s · coyote 0.07 s · buffer 0.12 s · upward exit rise 3.03 ·
swim float 60 % above the surface at 0.65× speed · plunge 35 t/s.
Design rules: climb ≤ 4, gaps ≤ 6 without abilities; dash gates 9–10; impossible ≥ 12 even with dash.
The 9-tile dash gap is crossed by jumping at the edge and dashing **at or after the apex** (dashing
during the rise wastes height — HK behaviour). `lastSafe` (hazard respawn) only records firm ground:
plain terrain under the body's center, ≥ 1 tile from any hazard tile.

## 9. Combat (`G.Combat`)

```js
const res = G.Combat.attack({ owner, team, rect, damage, kind, dir, pogo, id });
// res: [{target, hit}] for connected hits, plus flags:
//   res.pogo (struck something pogo-able, only if opts.pogo), res.wall (rect touches solid terrain),
//   res.spikes, res.breakable (hit a B/D component), res.broke (one shattered)
```
- Each target is hit at most once per attack `id` (use one id per swing; omit for single checks).
- `team:'player'` hits enemies and `neutral` hurtables (levers, geodes), damages `B` walls
  (nail/spell/plunge/trail; 3 hits; one hit per component per attack id) and breaks `D` floors (plunge
  only). Breaking sets flag `broken:<compId>`, calls `G.Art.onTilesChanged(room, c0, r0, c1, r1)`,
  plays `break_wall`, shakes, emits `tilesBroken`. The motor's plunge breaks `D` on contact by itself.
- Ember: +11 per connected *nail* hit on an enemy (+6 with `ember_thirst`) — automatic, do not add it yourself.
  A blocked hit (connected but the target's `hp` unchanged, or `hit.deflected = true`) pays no Ember.
- `team:'enemy'` attacks also test the player (→ `hurtPlayer`).
- `G.Combat.hurtPlayer(amount, source)` → `player.hurt(...)` if mode is `play` and not god; emits
  `playerHurt` when it returns true. Enemy projectiles call this.
- Contact damage: every step the engine hurts the player on overlap with any entity that has
  `contactDamage > 0` and `team !== 'player'` (`contactRect()` if defined).
- `G.Combat.hazardPlayer(kind)` (engine calls it when `motor.hazard` is set): 1 damage via
  `player.hurt(1, {hazard: kind, x, y})` unless invulnerable, lock `'hazard'`, fade out 0.22 s, place
  at `motor.lastSafe`, fade in 0.3 s, unlock. `G.Combat.hazardActive` while running.
- `G.Combat.breakTilesInRect(room, rect, kind, attackId)` — explicit terrain hits (spells, boss slams).

## 10. Camera (`G.camera`)

`{x, y, w:1280, h:720, shakeX, shakeY}`; `follow(entity)`, `snap()`, `update(dt)` (look-ahead 70 px,
vertical deadzone, look-down when falling fast, clamped to the room), `setZone(rect)` / `clearZone()`
(clamp to a sub-rect, e.g. a boss arena; cleared on room change), `shake(px, sec)` (raw — prefer
`G.game.shake`, which respects `G.settings.shake`), `stopShake()`, `worldToScreen(x,y)`,
`screenToWorld(x,y)`, `visible(x,y,w,h,margin)`.

## 11. Particles (`G.fx`) — pooled, 650 max

`G.fx.burst(kind, x, y, opts)` — kinds `spark ember smoke dust drip shard wax ring slash flash splash
bubble snow ash pollen`. opts: `count color speed angle spread size life vx vy gravity r width additive alpha`
(`r` = radius for ring/flash/slash; `angle`/`span` for slash). `G.fx.spawn({x,y,vx,vy,life,size,size2,
color,alpha,gravity,drag,rot,vrot,add,shape:'circle'|'line'|'tri'|'ring'|'arc'|'glow'|'drop'|'bubble'|'rect'})`.
`G.fx.glowAt(ctx, x, y, r, color, alpha)` — additive cached radial glow (use instead of shadowBlur);
`G.fx.glowSprite(color)` → cached canvas. `update/draw/clear` are engine-driven; cleared on room change.

## 12. Lighting (`G.lighting`)

`G.lighting.add({x, y, r, color, intensity=1, flicker=false, glow=true})` (world px). Call it every
step from `update` **or** every frame from `draw` — both work (update lights persist while the game is
frozen by hitstop/pause). Darkness = `room.dark` (room override ?? region), half-resolution map with
soft holes, then subtle additive colored glows (`glow:false` = hole only). Static lights come from
`G.Art.staticLights(room)` (cached per room). The player light is automatic (r 260, `#79c4ff`);
the player may set `lightRadius`, `lightColor`, or `noAutoLight = true`.

## 13. Render (`G.Render`)

Pipeline exactly TECH_SPEC §12. Every `G.Art` stage is optional and wrapped: a stage that is missing
falls back to the built-in renderer (background, terrain, breakables, liquids, vignette); a stage that
throws is reported and disabled after 3 failures. `G.Render.useArt = false` forces the fallback
(debug/perf). Entities with `z < -10` are drawn before terrain. `p.hidden = true` hides the player.
`G.Render.palette(room)` = art palette (or fallback derived from `region.mapColor`).
Screen overlays drawn by the engine: flash (`G.game.flash`) then black fades (`G.game.fade` and the
engine's own transition fades), then `G.UI.draw(ctx)`, then the debug overlay.

## 14. Game (`G.game`)

Modes (engine state, `G.game.mode`, a string): `'boot' 'title' 'play' 'transition' 'dead' 'ending' 'gameover'`.
The run's **difficulty** is a different thing, read with `G.game.difficulty()` (see §14.1). State: `progress room player region t
slot god mode fadeAlpha flashAlpha hitstopTime deathTime`. Constants: `ABILITIES BOSSES SIGIL_COSTS`,
`defaultProgress(slot)` (schema §11.1; `sconce: null` and `lastRoom: null` before first use).

**Fixed step** (`G.game.step()`, 60 Hz; `G.game.frame(elapsed)` accumulates real time, max 4 steps per
frame, gaps clamped to 0.25 s; an elapsed within 1 ms of k·DT counts as exactly k steps and the accumulator is
seeded at DT/2 by `resetClock()` so 60 Hz displays get exactly one step per frame; it renders only after ≥ 1 step or
after `requestRender()`): `input.update` → `UI.update(dt)` → fades/flash → if mode `play` and
not UI-blocking: menu keys (pause/map/inventory) → [hitstop: only camera/fx/atmosphere] → player →
hazard check → entities → contact damage → remove dead → rebuild solids → camera → fx →
`Art.updateAtmosphere` → transition check. `transition`: only camera/fx. `dead`: entities + fx, then
respawn. `playTime` accumulates in play/transition/dead unless UI-blocking.

| API | Behaviour |
|---|---|
| `newGame(slot, mode?)` | fresh progress with `progress.mode` = `mode` if valid, else `?mode=` (URL), else `'easy'` in test mode / `'standard'` in a release run; `G.UI.playIntro(begin)` if present (skipped in test mode); start = `sh_01` `start` entity, else the first dev room (`def.spawn`). Like `continueGame` and `quitToTitle`, it first resets the session, which also closes every UI screen (`G.UI.closeAll(false)`) and clears overlays |
| `continueGame(slot)→bool` | load (missing fields filled), full health, respawn at sconce (or start); no save → newGame. A **broken hardcore save is refused**: returns `false`, emits `continueRefused {slot, reason:'broken'}` and (if not already there) reopens the title |
| `quitToTitle()` | saves (keeps a pending wisp — through `G.wispSpotFor`; never for a broken run), resets the session, `openTitle()`. Nothing is saved from the `ending`/`gameover` modes |
| `openTitle()` | `G.UI.openTitle()` or the built-in "press any key" title (any key → continue slot 0 / new game) |
| `saveNow()` | writes progress (lastRoom updated); emits `save` |
| `enterRoom(id, place)` | place: `{tx,ty}` (feet on tile) · `{x,y}` px · `{sconce:id}` · `{lanternway:id}` · `{}` (start/spawn/respawn/sconce/center). Clears fx/zone/hitstop/boss music, spawns entities + wisp, `Art.prepareRoom`, camera snap, room audio, area card on region change, emits `regionEnter`/`roomEnter`, calls `player.onRoomEnter(room)` |
| `hitstop(sec)` | freeze player + entities (max 0.5 s; longest wins) |
| `flash(color, sec)` | full-screen color flash (quadratic fade) |
| `shake(px, sec)` | camera shake × `G.settings.shake` |
| `fade(toAlpha, sec, onDone)` | public black overlay (cutscenes); a new fade completes the previous one's callback immediately (and any fade that callback starts on the same fader is completed too, so no callback is ever dropped) |
| `lockPlayer(reason)` / `unlockPlayer(reason)` | stackable (counted per reason); `isLocked()`, `lockReasons()`, `clearLocks()` |
| `rest(sconce)` | heal to max, set respawn `{room, id}` (id = `persistId`/`props.id`), save, emit `rest` |
| `playerDied()` | mode `dead`: burst + sfx + shake; after 1.1 s fade 0.7 s → `progress.wisp = {room, x, y, cinders}` (replaces any old wisp; the spot goes through `G.wispSpotFor`, §14.1), cinders 0, ember 0, full health, `player.respawn()` (or a new player), enter sconce room (or start), save, fade in, emit `respawn`. Hazard deaths leave the wisp at `lastSafe`. **Hardcore**: see §14.1 (broken + saved at once, no wisp, game over) |
| `hasAbility(id)`, `giveAbility(id, {silent, onDone})` | sets + saves + `abilityGet` event + `G.UI.abilityGet` card unless silent |
| `getFlag(k)`, `setFlag(k, v=true)`, `clearFlag(k)` | progress flags |
| `addCinders(n)`, `spendCinders(n)→bool` | clamped 0..99999; `cinders` event |
| `addEmber(n)`, `spendEmber(n)→bool`, `emberMax()` | `99 + 33·urns − 33 if wisp`; `emberFull` event |
| `maxHealth()`, `heal(n=1)` | `maxHealth()` includes the heartwax sigil |
| `giveItem(spec, {silent, onDone, pickupId})` | `heartwax` (2 shards → +1 max health & full heal) `urn kiln_glass notch brand spark:<id> seal:<id> sigil:<id> cinders:<n> chart:<region>`; `pickupId` sets `item:<id>`; major items save; shows `G.UI.sparkMemory` (sparks) / `G.UI.itemGet` unless silent |
| `sigilCost(id)`, `isEquipped(id)`, `canEquip(id)`, `equip(id)→bool`, `unequip(id)`, `notchesUsed()` | costs from `G.Items.sigils` (fallback table) |
| `evalCondition(str)→bool` | see below |
| `bossDefeated(id)`, `defeatBoss(id)` | sets `bosses[id]` + flag `boss:<id>`, saves, emits `bossDefeated` |
| `startBossMusic(track='boss')`, `endBossMusic()` | override region music until ended or the room changes |
| `travel(lanternwayId)` | lock, fade, enter the room holding that lanternway (player beside it), save, fade in, unlock |
| `lightLantern(id)`, `reclaimWisp()→cinders` | helpers for interactables / the wisp |
| `completion()`, `completionOf(progress)` | DESIGN §9 (abilities 6, heartwax 8, urns 2, brand 3, sparks 6, seals 3, sigils 14, extra notches 3, bosses 8 — each item equal) |
| `endingId()` | `'gutterlight'` with 6 sparks else `'undying'`; `finishGame(endingId?)` marks complete (`completed`, `ending`, adds to `endingsSeen`), saves, plays `G.UI.playEnding`, back to title. **Continue on a finished save** rewinds it to just before the final fight (migrate: `completed`/`ending` cleared, `boss:lucerne` + `bosses.lucerne` removed, respawn at the last sconce) so the other ending stays reachable; `endingsSeen` keeps the slot marked complete and Lucerne counted in the completion % |
| `requestAutoPause(reason)`, `cancelAutoPause(reason?)` | pause now if in play and no blocking UI, else keep the request pending (modes play/transition/dead) and open the pause on the first step play can pause; main.js: window blur, tab hidden, `gamepadLost`; focus cancels `blur`/`hidden` requests |
| `isSafeRoom()` | no `arena` entity with `active`, no live hostile enemy (team `enemy`, hurtable) within `SAFE_RADIUS` (12 tiles, centre to centre) of the player, and the player was not hurt or attacked (an enemy attack/contact overlapping them, even through i-frames) in the last `SAFE_COOLDOWN` (3 s). Used by the Lanternway and shops. Helpers: `hostileNear(radius?)` → count, `noteThreat()` (sets `lastThreatT`; called on `playerHurt` and by `G.Combat`) |
| `uiBlocking()`, `isLocked()` | current blocking / lock state |

**Conditions**: terms joined by `&`, each optionally `!`-prefixed: `ability:<id> boss:<id> flag:<name>
item:<pickupId> visited:<roomId> region:<regionId> sigil:<id> equipped:<id> spark:<id> seal:<id>
lantern:<id> chart:<region>`, counters `seals sparks cinders health maxhealth heartwax urns notches brand
kilnglass bosses sigils abilities` with `>= <= > < == = !=`, `true`/`false`, and any other `a:b[:c]`
term is a raw flag lookup (`lever:<id>`, `talked:<npc>:<id>`, `broken:<comp>`, `dead:<id>`).
Empty/undefined → true.

**Flags written by the engine**: `item:<pickupId>`, `broken:<compId>`, `boss:<id>`, `region:<id>`
(first visit; drives the big area card), `dead:<id>` (via `markDead`). Others (`lever:<id>`,
`talked:<npc>:<id>`) are set by their modules with `G.game.setFlag`.

**Saving**: rest, ability, major item, boss defeat, quit to title, every room transition, respawn.
Position is never saved (always respawn at the sconce).

**Transitions** (§7.4): when the player's center leaves the room rect the engine finds the neighbour via
`roomAtGlobal`, fades 0.18 s, loads, places the player at the same global position nudged inside
(velocity + facing kept; upward exits apply `exitUpBoost`; hazard `lastSafe` reset to the entry spot or
the ground below it), saves, fades in 0.18 s. No neighbour → held at the boundary + one warning.

**Audio cues**: room entry → `G.Audio.music(room music ?? region.music)` (unless boss music is
active) and `G.Audio.ambience(...)`; region change → `G.UI.areaCard(regionId, firstVisit)` (not for
the test region).


### 14.1 Difficulty modes, hardcore permadeath, wisp hook

`progress.mode` ∈ `'easy' | 'standard' | 'hardcore'`; `progress.broken` (bool). A save without `mode` predates the
modes and migrates to `'easy'` (an invalid value too); only a hardcore save can be broken (migrate clears `broken`
otherwise, and drops the wisp of a broken save). The mode is chosen at New Game (title mode chooser, default cursor
Standard) and never changes during a run (the pause menu shows it read-only).

| API | Behaviour |
|---|---|
| `difficulty()` (alias `runMode()`) | the run's mode (`progress.mode`); without progress: `?mode=` if valid, else `'easy'` with `?test=1`, else `'standard'`. **Note:** the shared contract named this `G.game.mode()`, but `G.game.mode` already is the engine state string (used in ~170 places), so the difficulty getter is `difficulty()` |
| `telegraphs()` | `true` only in `'easy'`: entity code draws EXPLICIT telegraphs only then — `const tele = !(G.game && G.game.telegraphs) \|\| G.game.telegraphs();` |
| `isHardcore()`, `isBroken()` | `difficulty() === 'hardcore'`; current progress is a broken run |
| `MODES` | `['easy', 'standard', 'hardcore']` |
| URL `?mode=easy\|standard\|hardcore` | the mode of NEW progress when the caller passes none (test boot, debug `teleport` without a session, the no-UI fallback title). It does not override a loaded save. `?test=1` without it → `'easy'`, so existing tests keep their behaviour |

**Hardcore permadeath (Steel Soul).** At the instant of death (`playerDied`, every death path goes through it:
`player.hurt`, hazards, the debug fallback player) the progress gets `broken = true`, `wisp = null`, `diedIn = <room id>`,
`health = 0` and is **saved immediately**, then `runBroken {slot, room, bossId}` is emitted. After the death animation
(1.1 s) a slower fade (1.6 s) leads to `gameOver()`: the session is reset (room/player released), mode `gameover`,
music/ambience stop, `gameOver {slot, room, regionId, playTime, completion}` is emitted and
`G.UI.playGameOver(info, done)` plays (src/ui/ending.js; built-in black "Your flame is spent." fallback without UI);
`done` → `quitToTitle()` (nothing saved). No path resumes a broken save: `respawn()` turns into `gameOver()` for a
broken run, `quitToTitle()` mid-death saves it broken and leaves no wisp, a reload finds it broken (it was written at
the death instant), `continueGame` refuses it, the title disables Continue on it, the no-UI fallback title starts a
new game instead, `G.debug.teleport` refuses while the run is broken or in `gameover`, and `G.debug.setMode` never
un-breaks it. Erasing the slot works as for any save. (Limit: if another window owns the slot — `G.Save.isStale` —
this window's saves are refused, the broken mark included; the other window's copy then wins.)
`G.Save.summary(slot)` adds `mode` and `broken` (and, for a broken run, uses `diedIn` for the region).

**Wisp hook.** Wherever a wisp is created (respawn after death, quit to title mid-death) the engine calls
`G.wispSpotFor({room, x, y, arenaActive, bossId})` (src/entities/wisp.js) when defined: `room/x/y` = the death spot
(px, room-local; `lastSafe` for hazard deaths); `arenaActive` = an arena controller in that room was active (beat or
fight) or a live, undefeated `boss_*` entity was there at the instant of death; `bossId` = that boss, else the boss of
an undefeated (idle) arena in that room (died before triggering it), else `null`. A returned `{room, x, y}` naming a
known room with finite coordinates replaces the spot; `null` keeps it; anything else is reported and ignored. Both
states are captured at the instant of death. (`G.game._internal.arenaInfo(room)`, `_wispFor(deathInfo, cinders)`
for tests.)

## 15. Contracts the engine expects from other modules

**Player** (`G.registerEntity('player', Player)`; when absent the engine uses `G.DebugPlayer`):
`motor` (PlayerMotor state; keep `x/y` mirrored to `motor.x/y` each update), `w/h` (26×54), `facing`,
`invuln`, `resting`, `busy()`, `placeAt(x, y)` (teleport, zero velocity, clear `motor.hazard`),
`onRoomEnter(room)`, `respawn()` (reset transient state after death; the engine then places you),
`hurt(amount, source)` → bool (handle i-frames/knockback; `source.hazard` = hazard damage: no
knockback; call `G.game.playerDied()` when health reaches 0; never decrement health twice).
Each update: set `motor.locked = G.game.isLocked() || <own reasons>`; do **not** handle
`motor.hazard` yourself — the engine calls `G.Combat.hazardPlayer` (which calls your `hurt` and
`placeAt`). Optional: `hidden`, `noAutoLight`, `lightRadius`, `lightColor`, `lastEvents`.
`G.DebugPlayer` (src/engine/debug.js) is a compact reference implementation of this contract.

**UI** (all optional, feature-detected): `update(dt)`, `draw(ctx)`, `isBlocking()`, `openTitle()`,
`playIntro(onDone)`, `openPause()`, `openMap()`, `openInventory({atSconce})`, `areaCard(regionId, big)`,
`abilityGet(id, onDone)`, `itemGet(spec, onDone)`, `sparkMemory(id, onDone)`, `playEnding(id, onDone)`,
`prompt(x, y, text)`, optional `init(canvas)` (called once at boot) and `screenNames()→[names]`
(shown in `G.debug.state().ui`). The engine opens pause/map/inventory on `pause/map/inventory`
presses in play mode (map/inventory not while locked) and consumes the press.
Without `G.UI` the engine draws a minimal HUD, a "press any key" title and a pause veil.

**Audio**: `init()` (called on the first key/pointer/touch), `music(id, {fade})`, `ambience(id)`,
`sfx(name, opts)` (via `G.sfx`/`G.sfxAt`), `setVolume(bus, v)` (via settings). `?mute=1` is read by audio.

**Art**: every §12 stage + `prepareRoom` (each room entry), `onTilesChanged`, `updateAtmosphere`,
`staticLights`, `palette` (also used for crack/shard colors and the darkness tint `palette.darkness`),
optional `init()` at boot.

## 16. Debug & testing (`G.debug`)

URL params: `test=1` (skip title; new in-memory game), `paused=1` (no RAF loop; drive with
`G.debug.step`), `room=<id>&tx=&ty=`, `testrooms=1` (start in `dev_01`), `abilities=all|dash,grip`
(these three apply with `test=1`), `region=<id>` (dev rooms render as that region), `god=1` (with `test=1` only; a release run ignores it), `mute=1`, `debug=1` (overlay on; F3 or ` toggles it — the toggle key only works with `debug=1` or `test=1`, never in a normal/release run),
`seed=<n>` (seeds `Math.random` for reproducible cosmetics).

| Call | Behaviour |
|---|---|
| `step(n=1)` | n fixed steps then one render; returns `{mode, room, x, y, errors}` |
| `render()` | render one frame |
| `state()` | `{mode, room, region, t, player:{type,x,y,vx,vy,tx,ty,health,maxHealth,ember,cinders,onGround,wall,swimming,inWater,plunging,dashing,facing,hazard,invuln,events}, entities:[{type,kind,id,x,y}], ui:[...], difficulty, broken, locks, fade, errors}` |
| `teleport(roomId, tx, ty)` | other room → `enterRoom` (no fade); same room → place (feet on tile `ty`). Returns `false` (does nothing) while the run is a broken hardcore run or in `gameover` |
| `setMode(mode)` | tests/debug: set the current run's difficulty; never un-breaks a broken run; returns `difficulty()` |
| `give(spec)` | `'all'` (6 abilities), `'everything'` (all collectibles → 100 %), an ability id, or any `giveItem` spec; silent (no cards) |
| `god(on=true)` | invulnerable (`G.game.god`) |
| `setInput(state, frames)` | hold virtual input for `frames` steps then auto-clear (omit frames = hold until changed); `clearInput()` |
| `spawn(props)` | `room.spawn(props)` in the current room (`tx/ty` or `x/y` px) |
| `killAll()` | kills hurtable enemies (`kill()`/`die()` if defined, else a huge `onHit`) |
| `listRooms(opts)`, `player()`, `room()`, `errors` | — |

```bash
node tools/shot.js --query "test=1&paused=1&room=dev_02&tx=8&ty=15&debug=1" \
  --eval "G.debug.setInput({right:true}, 40)" --eval "G.debug.step(40)" --out test-output/<module>/run.png
node tools/engine_selftest.js            # everything; or a filter: node tools/engine_selftest.js swim
node tools/motor_metrics.js              # motor vs TECH_SPEC targets
```
Precise per-frame scripting inside `page.evaluate` (what the self-test does):
```js
for (let i = 0; i < 60; i++) { G.input.setVirtual({ right: true, jump: i < 20 }); G.game.step(); }
G.input.clearVirtual(); G.debug.render();
```
Node: `const { loadGame } = require('./tools/lib/node_loader'); const G = loadGame();` loads the
Node-loadable files (core, physics, world, motor, `src/data/**`) in index.html order;
`loadGame({extra:['src/engine/room.js']})`, `{query:'region=nave'}`, `{quiet:true}`;
`G.__loader.errors` lists files that threw. `G.World.instantiate(id, {tileOnly:true})` gives a TileRoom.

## 17. Dev rooms (`src/data/test_rooms.js`, region `test`, `dev: true`, gy ≥ 900)

```
                 [ dev_shaft 32x36 ]
 [ dev_water ]   [ dev_01    80x18 ]   [ dev_02 96x27 ]
                 [ dev_below 80x18 ]
```
| Room | Contents (tile coords; floor surface row in brackets) |
|---|---|
| `dev_01` [16] | spawn (12,15); one-way platform ladder rows 12/8/4 (cols 2–9) to the N exit (cols 4–7); markers: sconce `dev_sconce` (14,15), lore `lore_sh_1` (18), npc thrum (22), shrine dash (25), enemy ash_crawler (76), pickup heartwax `dev_hw1` on the 7-ledge; ledges 1..7 tiles high at cols 28+6(h−1) (3 wide; h ≥ 3 are floating slabs); S pit cols 70–73; W/E exits rows 13–15 |
| `dev_02` [16] | gaps 4/6/9/12 at cols 10/20/32/47 with spike pits; one-way shelves rows 12/9/6 and floor spikes cols 68–78 (pogo practice); enemy (90) |
| `dev_water` [16] | lava pool cols 50–53; 18-wide water pool cols 28–45; water tunnel cols 8–24 with only 2 tiles of air under the ceiling (cols 10–22); pickup urn `dev_urn` (4) |
| `dev_shaft` | floor row 35 beside the S entry (cols 4–7); grippable pillar cols 14–15 rows 6–34; glazed `X` pillar cols 22–23; one-way shelves in the east bay |
| `dev_below` [16] | breakable `B` wall cols 58–59; floating shelf row 10 with a `D` floor cols 26–33; lever `dev_lv1` (44), gate `dev_gate1` (48, opens `lever:dev_lv1`), enemy (52); platform ladder under the N entry |

Markers for types not registered yet are skipped with one warning each. Art previews:
`?test=1&paused=1&room=dev_01&region=mothwood`.
