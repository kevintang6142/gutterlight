# Player API: `G.Player` (the Wickling), module `player`

Files: `src/player/player.js` (controller, combat, spells, damage, interaction, cinematics, plus the
`player_bolt` and `flare_trail` entities) and `src/player/player_draw.js` (`G.PlayerDraw`: procedural look
and animation). All movement physics comes from `G.PlayerMotor` (engine). Test with
`node tools/player_selftest.js` (35 scripted checks plus contact sheets in `test-output/player/poses*.png`).

## 1. Engine contract (TECH_SPEC §9.2, engine.md §15)

The engine creates the player with `G.Entity.create({type:'player'})`. It is one instance per session and is
not stored in `room.entities`.

| Member | Notes |
|---|---|
| `motor` | `G.PlayerMotor` state. Position lives here; `x/y` mirror it after every update |
| `w, h` | 26 × 54 |
| `facing` | `1 \| -1` (mirrors `motor.facing`) |
| `invuln` | seconds of invulnerability left (hurt i-frames, plunge landing, etc.) |
| `resting` | `true` while seated at a sconce |
| `busy()` | `true` while attacking, casting, holding Spell, kindling, plunging, in a cinematic, dying or standing up. Interaction is refused while busy |
| `hurt(amount, source)` → bool | called by `G.Combat.hurtPlayer` / `hazardPlayer`. See §3 |
| `placeAt(x, y)` | teleport (top-left px); zeroes velocity, clears `motor.hazard`, cancels swings and Kindle, resets the scarf |
| `onRoomEnter(room)` | clears the swing, seat and dash trail |
| `respawn()` | after death: fresh motor at the same spot, all transient state reset, flame re-ignites |
| `lastEvents` | motor events of the last step (copied; used by `G.debug.state()`) |
| `noAutoLight = true` | the player adds its own light from `draw()` (r 260, `#79c4ff`, flickers, grows while kindling, fades on death) |
| `hidden` | engine-standard: not drawn |
| `slash` | active swing `{dir:'side'\|'up'\|'down', t, rect, facing, ...}`. `rect` is set only during the 0.09 s active window, so the `?debug=1` overlay can draw it |

Each update sets `motor.locked = G.game.isLocked() || resting || cinematic || kindling || standing up`.
`motor.hazard` is left to the engine.

## 2. Controls → actions

| Input | Result |
|---|---|
| Attack | Brand slash: **up** held → up-slash; **down** held while airborne (not on a wall/swimming) → down-slash (pogo); else horizontal. Presses are buffered 0.1 s |
| Spell tap (< 0.2 s) | Ember Bolt (needs ability `bolt`, 33 Ember). With full health (or when Kindle is impossible) it casts on **press**, so there is no delay |
| Spell + Down while airborne | Molten Plunge (ability `plunge`, 33 Ember) |
| Spell hold (grounded, still, health < max, Ember ≥ 33) | Kindle: heals after 0.9 s counted from the press, then chains while held |
| Up (grounded, not busy) | `interact(player)` on the nearest overlapping interactable |
| Left/Right/Jump/Down/Dash/Attack/Spell press while resting | stand up (the press is consumed) |

Out of Ember → a smoke fizzle + `deny` sfx. Locked (dialogue, cutscenes, hazard fades) → no actions, and
buffers are cleared.

## 3. Combat numbers (all sigils implemented here)

| Thing | Value |
|---|---|
| Slash boxes | side 80×56 in front (bottom edge 2 px above the feet so floors never "clang"), up 60×80 above, down 60×80 below; `long_brand` ×1.35 reach (`G.Items.sigils.long_brand.reachMult`) |
| Active window / cooldown | 0.09 s / 0.38 s (`swift_brand` ×0.7) |
| Damage | `G.Items.brandDamage[brandLevel]` (fallback `[5,9,13,17]`), ×1.75 (rounded) with `last_light` at 1 health |
| Ember | +11 per connecting nail hit on an enemy (+6 `ember_thirst`). **Granted by `G.Combat`**, not by the player |
| On connect | hit sparks, `slash_hit`, hitstop 0.045 s (enemies) / 0.02 s (neutral), small shake, recoil for side slashes (not with `steadfast`) |
| Down-slash | `G.PlayerMotor.pogo` when `G.Combat` reports `res.pogo` (enemies, spikes, `pogoable` entities); `pogo` sfx |
| Terrain | side/up slash into a wall → sparks at the contact point + `slash_wall` + recoil. B walls crack via `G.Combat` (3 hits) |
| Ember Bolt | entity `player_bolt`: 1000 px/s, 1.1 s life, 40×28, pierces (one hit per target), 15 dmg (×1.5 `bright_bolt` → 23), kind `'spell'`, bursts on walls and damages B walls there, lights r 190 |
| Molten Plunge | `G.PlayerMotor.startPlunge`; invulnerable while plunging; on `plungeLand`: `G.Combat.attack` kind `'plunge'` 15 dmg (×1.5) in a 240×96 box (radius 3 tiles) + `breakTilesInRect(kind 'plunge')` under the feet, shake 11, hitstop 0.06, ring/dust/sparks, 0.3 s i-frames |
| Kindle | 0.9 s (`kindle_haste` ×0.6, `deep_kindle` ×1.65 and heals 2), spends 33 when complete, then chains. Interrupted by damage, release, leaving the ground or a lock. Sfx `kindle` (stopped on interrupt) / `kindle_done` |
| Hurt | i-frames 1.0 s (`smolder_shell` ×1.6), knockback (not with `steadfast`, not for hazards), hitstop 0.12, shake 9, screen flash, white body flash, `player_hurt`; `thorned_wax` → 12 dmg kind `'thorns'` in a 3-tile radius |
| Flare Trail | `flare_trail` sigil: dash lays `flare_trail` segments (46×34, 0.6 s). All segments of one dash share a damage clock (8 dmg per 0.25 s per target, kind `'trail'`) |
| Death | health 0 → melt animation + `G.game.playerDied()` (the engine runs the wisp/respawn flow) |

Hazards: the engine calls `hurt(1, {hazard})`, so there is no knockback or hitstop. During the fade the body
pulses white. After `placeAt` the flame re-forms (0.45 s), and the remaining i-frames give brief invulnerability.

## 4. Cinematics & resting (for interact/UI/content builders)

```js
const p = G.game.player;
p.playWake(onDone);             // lying on the ash → flame ignites (1.35 s) → sits up → stands (3.4 s total)
p.playPose('ability', 1.1);     // shrine reward: Brand raised, flame flares. Also 'kneel' / 'bow', 'look_up'
p.playPose(name, sec, onDone);  // locks control (G.game.lockPlayer('pose')) for sec seconds
p.endCine();                    // end the current cinematic early (calls onDone)
p.sit(sconce);                  // seat at a sconce's foot (beside sconce.cx), facing away from it
p.standUp();
```
- **New game:** `player.js` listens to the engine's `'newGame'` event and calls `playWake()`. The engine
  emits it after `G.UI.playIntro` finishes and the player is placed at the `start` entity. In `?test=1`
  the wake is skipped (deterministic tests) unless `&wake=1`. Calling `playWake` while a wake is already
  running just adds the callback.
- **Resting:** `G.game.rest(sconce)` emits `'rest'`, and the player seats itself (`sit`). Seated pose: settled in the ash,
  eyes half-closed with slow blinks, breathing, the Brand laid across the lap with its tip in the ash, scarf pooled. On `'respawn'` /
  `'continue'` the player also sits if the respawn sconce entity is in the room. The sconce module calls
  `sit` / `standUp` too; both are idempotent. Inventory opens with `atSconce` while `resting`.
- Cinematic locks use `G.game.lockPlayer('wake' | 'pose')`. Taking damage ends a cinematic. Pressing
  Jump/Attack after the flame is lit skips the rest of the wake.

## 5. Drawing: `G.PlayerDraw`

| Call | Notes |
|---|---|
| `draw(ctx, player, t)` | world space. The body is rendered to an offscreen canvas (resolution follows the ctx scale) and composited: white flash, uniform i-frame alpha and blue dash afterimages are true silhouettes. Flame (`G.Art.flame` 'blue'), Brand tip glow, slash crescents (`G.Art.char.slash`), wings, streaks and ripples are drawn in world space |
| `update(player, dt)` | squash/stretch spring, verlet scarf (clamped above the floor), afterimages, ripples |
| `onEvent(player, name, data)` | animation triggers sent by the controller (`land hardland jump walljump doublejump pogo grip plungeLand kindleDone clang splash ripple teleport dash`) |
| `poseFrom(player, t)` | the resolved pose (`state` ∈ `idle run rise apex fall dash wall swim plunge plungeland kindle cast hurt dead rest wake pose`, plus `slash` info) |
| `drawBolt(ctx, bolt, t)`, `drawTrail(ctx, seg, t)` | used by the bolt/trail entities |
| `COLORS`, `OFF`, `toWorld(pose, lx, ly)` | palette, offscreen layout, local→world helper |

The look: an ivory wax candle body (custom path with a melted rim, raised drips and a blue rim light),
tall almond eye-slits that blink, a black wick with a blue flame, an ash-grey cowl with a swallowtail
verlet scarf, stubby dark legs with a run cycle, and the Brand (dark-iron rod, hot orange tip) on a stubby arm.
If `player_draw.js` is missing, a minimal box fallback is drawn.

## 6. Tuning & tests

`G.Player.TUNING` holds every constant (read-only by convention). Sigil multipliers are read from
`G.Items.sigils[id]` (`cooldownMult reachMult kindleTimeMult invulnMult spellMult damage damageMult heal`),
with the DESIGN values as fallbacks.

```bash
node tools/player_selftest.js              # all checks + contact sheets
node tools/player_selftest.js sheet        # only test-output/player/poses.png, poses_1x.png
node tools/player_selftest.js pogo kindle  # filtered
```
