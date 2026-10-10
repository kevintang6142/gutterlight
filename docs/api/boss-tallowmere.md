# ABBOT TALLOWMERE — Warden of the Bell (module: boss-tallowmere)

Files: `src/entities/bosses/tallowmere.js` (boss, minion, projectiles, room events, sfx),
`tools/gen/arena_tallowmere.js` → `src/data/arenas/tallowmere.js` (arena room dn_07 "The Great Belfry"),
`test-output/boss-tallowmere/test.js` (fairness & robustness tests + contact sheets).

## Arena dn_07 (64×27, region nave)
- Single entrance W1 (col 0, rows 21-23) → dn_06.E1. Floor top row 24 flat across cols 1-62; vault rows 0-2 with four
  dead-end notches (rows 1-2) where the rain comes through. West wall cols 0-2 above the door; `arena_gate` **dn_ag1**
  at col 2, rows 20-23 (bottom-left anchor (2,23), `side:'right'`) under the wall's lintel (row 19).
- Choir lofts: one-way platforms cols 12-19 and 44-51 at **row 20** (4 tiles up), hung from the vault on chains.
  *Deviation:* the plan says row 18 = 6 tiles above the floor, out of reach of a full jump (4.4-4.8 tiles) for a player
  without Smokewing (which comes after this Warden).
- `arena`: boss `tallowmere`, **bx 38**, by 23 (boss feet at y 960, centre x 1540), trigger **cols 17-30** rows 14-23.
  *QA deviation:* the plan's bx 46 lies under the east loft (its deck cut through the kneeling Abbot) and with the
  plan's trigger from col 10 he was off screen through his intro lines, card and first attacks. He now kneels just
  east of his bell, clear of both lofts; the trigger is a subset of the plan's.
- Events: `tallowmere_bell` (the great bronze bell on its yoke, chains from the vault at row 3, bell body cols 28-35
  rows 6-11 — hung lower than the plan's rows 3-8 so its lip shows at the top of the fight view; it swings and flashes
  when he tolls, cracks and stills after the defeat; it also draws the **praying Abbot** at the spawn point before the
  fight and his **remains** after it) and `tallowmere_flood` (shallow flood film over the floor + ripples from steps,
  rings, drips, the slam; purely visual, the floor stays a clean solid floor). No tile hazards, no respawn markers.
- Validate 0 errors (1 warning: dn_06 not built yet), reach 0 errors.

## The fight (HP 560, expected Brand L1-2: 63 / 44 Brand hits; stagger every 120 dmg for 1.6 s)
Phase 2 at 50 % (forced `awaken`). All damage 1 except the phase-2 belly slam's body (2). Telegraph ≥ 0.45 s for every
attack (visual pose + glint + own sfx); area denial uses `warnZone`s for its full warning time.

| attack | telegraph | active | dodge | punish |
|---|---|---|---|---|
| `toll` Bell Toll | crozier raised overhead, hand-bell glows, rising hum (0.72 s / P2 0.62) | crozier slammed down: a `tallow_ring` runs along the floor both ways (400 px/s; P2 a 2nd toll re-raised 0.45 s later, 470 px/s) | jump each ring / stand on a loft | 0.8 s recovery |
| `vigil` Molten Vigil | arms raised, hands glow, chant (0.62 s) | 4 waves (2 / P2 3 drops, 0.58 / 0.48 s apart) of `tallow_drip`: a drop swells on the vault (or the great bell's lip) over a warned molten column + floor mark for 0.78 / 0.72 s, then falls; the first wave (every wave in P2) aims at the player; never over his own body | step out of the marked column | he stands still the whole time; standing next to him is safe |
| `slam` Belly Slam (only vs a grounded player >= 200-230 px away: never a hop-in-place onto a cornered player) | crouch, belly sags, groan (0.64 / 0.55 s) | a leap onto the player's spot (apex 210-360 px, higher for farther hops; beyond his reach (~820 px) he lands short): the landing shadow + warm ring mark the exact landing spot (the flight is steered onto it); belly-flop 1 (P2 2) dmg; P2: two small rings 0.3 s after the impact | run/dash out of the marked zone (to the far side), then jump the P2 rings | 1.05 / 0.85 s on his belly |
| `sweep` Crozier Sweep (close, grounded player) | crozier drawn back low, creak + jingle (0.5 s) | floor-level sweep 240 px in front (96 px tall) with a crescent; P2 a 2nd sweep after turning (0.55 s re-wind, 0.95 s apart) | jump / step back | 0.62 s |
| `hush` Lullaby | hands cupped to the hood, breath + glass notes (0.55 s) | 3 (P2 5) `tallow_hush` motes, 180 px/s, curve toward the player for ~0.75 s then drift straight; destroyable | outrun / sidestep / jump / pop with the Brand | 0.6 s |
| `summon` (P2, when no acolyte lives) | arms spread, chant, the flood boils at two east spots (`warnZone` + bubbles, 0.7 s) | 2 `tallowmere_acolyte`s rise (0.9 s harmless) | stay off the spots; acolytes: 0.5 s wind-up lunge | acolytes 30 HP (4 L1 hits) |
| `awaken` (forced at 50 %, uninterruptible) | reels, raises the crozier (0.6 s) | the great bell tolls by itself (flash, shake, `musicLayer(1)`), hood tears, flame turns white; first 2 acolytes rise at the east (warned 0.75 s) | — | hurtable |

Hit areas (QA): Brand hits land on the whole drawn robe + hood (`hurtRect` ±94 x 224 px from the feet); contact damage
follows the robe's taper (`contactRect` half-width 86/78/70/58/40 px by the height of the player's feet, up to 206 px);
the physics box stays 150x160. Camera (QA): when the arena spawns him the view pans to him for 1 s (player held and
protected), then his lines open, then he rises with the toll; during the fight the camera follows a stand-in for the
player leaning toward him (<= 420 px) so he stays in view; it settles back once the victory is recorded.
Idle: faces the player, waddles toward a grounded player (> 330 px); shuffles out from under a player perched on a loft
(so the vigil/hush can reach the lofts; drips are allowed over him when they end on a loft).
Defeat (`defeatStyle:'custom'`): slow-mo shudder → defeat lines → kneels, the crozier falls → the great bell's last
toll (0.8 s) → the flame gutters out (2.1 s) → he melts into the flood → `finishDefeat()` at 3.2 s (Seal of the Bell
+ 300 cinders + flag + stinger + gate reopens — all from `G.Boss`) → removed at 4.8 s; flags `tallowmere_rest_x/_y/_f`
keep his remains in place for later visits. Fight start: `roar:false`, a toll of the bell + chant instead.

## Registered
- `G.Boss.register('tallowmere', Tallowmere)` → entity `boss_tallowmere`; music `keeper` (default map).
- `G.registerEnemy('tallowmere_acolyte', Acolyte)` — boss-only minion (not a TECH_SPEC kind; never placed in rooms).
- Projectiles `tallow_ring` (ground ring; keeps going after a hit), `tallow_drip` (hanging → falling; bursts on
  floors and one-way platforms), `tallow_hush` (destroyable mote).
- Events `tallowmere_bell`, `tallowmere_flood`; event `tallowmereAwaken` `{boss}` on `G.events`.
- Sfx `tallow_toll_wind tallow_toll tallow_chant tallow_glint tallow_hiss tallow_grunt tallow_splash tallow_sweep_wind
  tallow_swish tallow_hush tallow_mote tallow_rise tallow_awaken acolyte_wind` (+ engine `bell shockwave jump hardland
  step boss_stagger enemy_die`).
- `G.Tallowmere = {POSES, PAL, HP, BW, BH, STAGGER, drawAbbot, drawRemains, staffGeom, buildGeom, ceilingAt,
  surfaceBelow, BELL, RIPPLES, Tallowmere, Acolyte, ACO}` (tests, contact sheets).

## Tests
```sh
node tools/gen/arena_tallowmere.js && node tools/validate.js --room dn_07 && node tools/reach.js --room dn_07
node tools/enemy_selftest.js --boss tallowmere --room dn_07 --out test-output/boss-tallowmere/lab
node test-output/boss-tallowmere/test.js            # sheet hit dodge defeat chaos flow (or any subset)
```
Contact sheets: `test-output/boss-tallowmere/sheet_poses.png`, `sheet_attacks_1.png`, `sheet_attacks_2.png`,
`sheet_story.png` (walk-in, rise, hit flash, stagger, defeat stages, remains), `flow_after.png`.
