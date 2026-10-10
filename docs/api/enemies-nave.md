# The Drowned Nave enemies — placement guide (module: enemies-nave)

File: `src/entities/enemies/nave.js` (4 kinds + projectiles `acolyte_flame`, `jelly_drop`, `bell_wave` + sfx
`lantern_swing flame_fling flame_hiss jelly_swell jelly_burst drip_splat sentry_bell shield_clang knight_stab`, each
defined only if the audio module lacks it). Test hooks: `G.NaveEnemies = { DrownedAcolyte, RainJelly, BellSentry,
DrownedKnight, AcolyteFlame, JellyDrop, BellWave, APOSE, HPOSE, KPOSE }`.

```sh
node tools/enemy_selftest.js --kinds drowned_acolyte,rain_jelly,bell_sentry,drowned_knight --region nave --out test-output/enemies-nave
node test-output/enemies-nave/fight.js     # aggression, real Brand kills (L1/L2), knight shield, sentry wave + timed jump, doorway, pit, beat, leash
node test-output/enemies-nave/soak.js      # 45 s random play with all four kinds at once (stuck states, bounds, errors)
node test-output/enemies-nave/sheet.js     # pose contact sheet -> test-output/enemies-nave/enemies.png
node test-output/enemies-nave/ingame.js    # in-game telegraph/attack moments at 1x -> test-output/enemies-nave/ingame.png
```

## Kinds at a glance

| kind | body | hp | Brand hits L0/L1/L2/L3 | cinders | box (px / tiles) | anchor | attacks (telegraph) |
|---|---|---|---|---|---|---|---|
| `drowned_acolyte` | ground, normal (1) | 38 | 8/5/3/3 | [6, 10] | 30×58 / 0.75×1.45 | feet on marker row's bottom | **raise** 0.5 s (lantern hoisted high behind the hood, glint on the lantern) → wide burning **sweep** in front (2.3 tiles wide, 2 tiles tall) → 0.6 s recovery; **wind** 0.55 s (lantern swung back low, flame swells) → **lantern-flame** lobbed at the Wickling (2.4–9 tiles, arcs, destroyable) every 3.6–5 s |
| `rain_jelly` | flying, light (0.6) | 30 | 6/4/3/2 | [4, 6] | 34×34 / 0.85 | centre of tile | contact; **swell** 0.62 s (inflates, glows, 8 droplets bead on its rim exactly where they will fly) → **ring of 8 droplets** (165 px/s, slight fall, ~10 tiles, destroyable; each ring is rotated half a step from the last) → 0.75 s deflate; every 3–4 s |
| `bell_sentry` | ground, immovable (12) | 45 | 9/5/4/3 | [6, 10] | 44×76 / 1.1×1.9 | feet on marker row's bottom | **raise** 0.62 s (mallet heaved high over its bell head, bell hums gold) → **toll**: two ground shockwaves along the floor, one each way (300 px/s, 40 px tall — jump them; they stop at walls and ledges) → ~1 s dazed (punish) |
| `drowned_knight` | ground, heavy (3) | 54 | 11/6/5/4 (unshielded hits) | [10, 16] | 40×68 / 1×1.7 | feet on marker row's bottom | **windup** 0.55 s (sword raised by the helm, point forward, shield swung aside, eyes flare) → 2–3 lunging **stabs** (2.1 tiles from its centre at chest height, ~0.85-tile lunge each; each follow-up is pulled back 0.36 s first) → 0.85 s **recovery** (point in the floor, shield down) |

All attacks deal 1 damage; every attack has a telegraph ≥ 0.36 s and a recovery ≥ 0.6 s. Contact damage 1 for all.
Regular enemies respawn on every room load; for a unique one use `id: 'dn_u<n>', persistent: true` and 2–3× cinders.

### The knight's shield

- While it **guards** (patrol / notice / engage) a Brand blow (`kind: 'nail'`) struck at its **front** from within reach
  (attacker centre ≤ 4 tiles away, on the side it faces, not above its helm) is **blocked**: no damage, a clang
  (`shield_clang`), sparks and a shield flash, and the Wickling recoils (also with Steadfast / on up-slashes).
- Open: from **behind** (it needs 0.45 s to turn when the Wickling crosses over; 0.3 s after being struck from
  behind), from **above** (down-slash/pogo), **spells/plunge** (any non-nail hit), and in front during the windup,
  the stabs and the recovery. Two blocked blows in quick succession make it riposte (starts its combo at once).
- `tools/enemy_selftest.js` strikes from 28 tiles away, so the shield does not engage in the lab's hits-to-kill
  check (by design: no real Brand reaches that far); the shield itself is verified in `fight.js` (`test: 'shield'`).

## Placement props

| prop | kinds | default | meaning |
|---|---|---|---|
| `facing` | all | random | `'left' / 'right'` start facing |
| `range` | drowned_acolyte, drowned_knight | 5 / 4 | beat: tiles left/right of the spawn it patrols and may step toward the Wickling (never leaves it) |
| `range` | bell_sentry | 7.5 | horizontal trigger distance (tiles) from its centre; vertical window 3.5 above / 2.5 below; needs line of sight |
| `leash` | rain_jelly | 7 | tiles from the spawn it may follow the Wickling (both axes; ×0.6 vertically) before drifting home |
| `hp`, `cinders`, `noDrops`, `id`+`persistent` | all | | generic, see docs/api/enemies.md §2 |

## Built-in safety (no extra work for the rooms builder)

- **Exit zones**: every side opening's run (±1 tile) and 3.5 tiles inward is off limits. Walkers stop/turn at its
  edge, jellies steer clear of it. Nobody **starts** an attack (sweep, fling, ring, toll, stab) while the Wickling
  stands in an exit zone — a player entering the room always gets room to react. S openings (holes/pits) count as
  zones, so walkers never step into a floor hole; wide N openings (> 8 tiles, open sky) do not.
- Walkers never walk off ledges, into hazard tiles (spikes, **water** — the meltwater is a hazard here) or past their
  beat. The sentry never moves (no knockback). Jellies stay inside the room and within their leash.
- Waves (`bell_wave`) run along the floor and die at walls, ledges and floor gaps.

## Placement advice

- Keep markers **≥ 8 tiles from side entrances**, and hostiles ≥ 12 tiles from sconces/Lanternway posts (a post refuses
  travel with a hostile within 12 tiles).
- **drowned_acolyte** — flat floor run ≥ 6 tiles (its beat) and ≥ 2.5 tiles headroom (the raised lantern reaches ~2
  tiles above its feet; the sweep's hitbox is 2 tiles tall). Flings reach 9 tiles, so keep cover or distance between it
  and a doorway. In pairs, put them ≥ 6 tiles apart (they would otherwise stack their sweeps).
- **rain_jelly** — marker 2–6 tiles above the floor, ≥ 2 tiles from walls. It hovers ±0.4 tile around its spot and,
  once it sees the Wickling (8.5 tiles), keeps ~2.6 tiles to its side and ~2.8 tiles above it (clamped to its leash).
  In shafts where the player climbs the walls (dn_01, dn_04) put it in the middle with `leash: 3–4` so it never drifts
  into the wall-jump lane; it is pogo-able but never needed as a pogo target. The ring reaches ~10 tiles; avoid two
  jellies within 6 tiles of each other (overlapping rings get dense).
- **bell_sentry** — on a flat floor or ledge ≥ 4 tiles wide, **≥ 3 tiles headroom** (the mallet head rises ~2.8 tiles).
  Its waves travel the whole floor run until a wall/ledge/gap, so keep it ≥ 10 tiles from a floor-level doorway or
  put a step/ledge between (waves stop at ledges). On a raised ledge the waves simply die at the lip.
- **drowned_knight** — flat floor run ≥ 8 tiles (beat ±4 plus lunges) with ≥ 2.5 tiles headroom; leave the player
  room to jump over it (≥ 4.5 tiles of air above the floor where it stands) — getting behind it is the intended
  answer. Not on narrow ledges, not next to a water basin edge (it stops there anyway, but the player has no room).

### Plan rooms (contents from the world plan)

| room | plan contents | suggestion |
|---|---|---|
| dn_01 The Long Descent (shaft) | rain_jelly ×2 | both in the lower half, cols ~11–20, 3–6 tiles above the floor (row 33), `leash: 3`, ≥ 4 tiles apart; never near the wall faces the climber uses or under the N1 drop line |
| dn_02 The Flooded Aisle (128×18) | drowned_acolyte ×3, rain_jelly ×2 | acolytes on the aisle floor ≥ 10 tiles apart, e.g. cols 22, 62 and 104 with `range: 4`: ≥ 8 tiles from W1/E1, ≥ 4 tiles from the S1 dip (cols 37–46) and well clear of Wren's dry arch (col 84) and the lore column (col 60 — col 62 with `range: 2` is fine, or move it to col 70); jellies "under the windows" rows 8–11, not above the S1 hole |
| dn_03 The Drowned Nave (hub) | drowned_knight ×1, drowned_acolyte ×2, bell_sentry ×1 | see the dn_03 note below |
| dn_04 The Bell Tower (shaft) | bell_sentry ×1, rain_jelly ×2 | sentry on the west landing (cols 1–12, floor row 15) at col 5–7 — ≥ 3 tiles headroom; its east wave dies at the landing lip (col 12), never in the climbing throat; jellies mid-shaft (cols 12–19), `leash: 3`, rows 20–28, ≥ 6 tiles apart |
| dn_06 The Choir Loft | bell_sentry ×1, drowned_acolyte ×2 | sconce at col 42 next to E1: hostiles ≥ 12 tiles from it, i.e. cols ≤ 30; sentry on a stall tier (its waves die at the tier's lip), acolytes on the floor west of the S1 dip (cols 17–26) or between dip and col 30, `range: 3` |
| dn_08 The Sunken Crypt | drowned_knight ×1, drowned_acolyte ×2 | knight on the crypt floor mid-room (col ~40, `range: 4`), acolytes at cols ~24 and ~76 (`range: 3`), none on the D-tile plunge floor (cols 10–17) or under the N1 rungs (cols 60–63) |
| dn_09 Gallery of Saints | drowned_knight ×1, rain_jelly ×2 | knight on the west floor (col ~30, `range: 4`; ≥ 8 from W1, keeps clear of the grip pillar at col 41); jellies under the vault rows 4–9 above the west floor (cols ~14 and ~34, `leash: 4`), not over the dash gap (they would make the 9-tile dash punishing) |
| dn_10 The Flooded Tunnel | rain_jelly ×2 | in the dry east part (cols 64–90), rows 9–12, `leash: 4` (stays out of the low vault over the water) |
| dn_11 The Baptistery | drowned_acolyte ×2, rain_jelly ×1 | acolytes at cols ~12–14 and ~50 (≥ 8 from W1/E1, `range: 3`), not under N1 (cols 20–23); jelly above the font (col 34, row 9) |
| dn_12 The Reliquary | drowned_knight ×1 | on the hall floor near the shelves (col ~28, `range: 4`), not on the cracked D floor (cols 8–13) and ≥ 6 tiles from the ledge drop zone (cols 38–49) so a player dropping from the Ice Stair ledge lands in peace |

**dn_03 note** (hub): the Lanternway post (col 52) must have no hostile within 12 tiles (cols 40–64 of the main
floor are out), and the sconce (col 28) should stay calm (keep ≥ 10 tiles). That leaves the **west main floor**
(cols 4–18; W1's exit zone already keeps walkers ≥ 3.5 tiles from the door) and the **choir step** (cols 70–95, floor
row 24, 18+ tiles from the post). Suggested: `drowned_knight` col 10 (`range: 3`) and one `drowned_acolyte` col 17
(`range: 2`) on the west floor; the `bell_sentry` on the choir step at col ~74 (its west wave dies at the step's lip at
col 70, the east wave runs along the step) and the second `drowned_acolyte` on the step at col ~84 (`range: 3`, ≥ 8
tiles from E1).

## Art notes

Palette: drowned teal-slate cloth, verdigris bronze and plate, grey-blue Snuffed wax, pale-gold light. Each kind reads
against the dark teal nave differently: acolytes by the gold lantern they carry (its light follows the swinging
lantern), jellies by their glowing translucent bell and pale heart-flame, sentries by the warm bronze bell head,
knights by the pale steel helm with glowing eye slit and the gold flame device on the tower shield. Everything drips
(small water drops slide off hems, lanterns, shields). Telegraph colour `#f2d890` (nave light). Deaths: the standard
wax melt into a dark puddle (acolyte's lantern goes dark, the jelly collapses with crossed eyes).
