# The Mothwood enemies — placement guide (module: enemies-mothwood)

File: `src/entities/enemies/mothwood.js` (4 kinds + the minion kind `mothling` + projectile `moth_scale` + sfx
`dusk_rear dusk_swoop scale_shiver scale_shed cocoon_throb cocoon_hatch mothling_buzz dust_stir maw_snap maw_sink
mknight_ready mknight_slash mknight_flare mknight_lunge` (each defined only if the audio module lacks it). Test hooks:
`G.MothwoodEnemies = { DuskMoth, MothScale, CocoonSpawner, Mothling, DustMaw, MothKnight, KPOSE, drawDuskMoth,
drawCocoon, drawMaw, drawKnight, drawMothling, exitZones }`.

```sh
node tools/enemy_selftest.js --kinds dusk_moth,cocoon_spawner,dust_maw,moth_knight,mothling --region mothwood --out test-output/enemies-mothwood
node test-output/enemies-mothwood/fight.js [kinds]   # aggression, Brand kills L0/L1/L2, maw dodge, brood cap, doorway, pit, beat, chase, steps, lunge
node test-output/enemies-mothwood/sheet.js           # pose contact sheet -> test-output/enemies-mothwood/enemies.png
node test-output/enemies-mothwood/knightshot.js out.png 58   # in-game close-up (mothwood theme, unlit part of dev_01)
```

## Kinds at a glance

Brand damage 5 / 9 / 13 / 17 (L0–L3). The Wickling reaches the Mothwood with Brand L1–L2.

| kind | body | hp | Brand hits L0/L1/L2/L3 | cinders | box (px / tiles) | anchor | attacks (telegraph) |
|---|---|---|---|---|---|---|---|
| `dusk_moth` | flying, light (0.6) | 40 | 8/5/4/3 | [7, 12] | 54×40 / 1.1×0.85 | centre of tile | circles the Wickling on the upper half of a 4-tile ring, then **rear** 0.5 s (brakes, tilts back, wings hauled high, eye-spots flare) → curved **swoop** through the Wickling's chest height and out the other side (0.6–1.05 s); every 3rd attack, or when no dive path exists (Wickling level with/above it), **shiver** 0.55 s (hangs, wings tremble, glitter) → a fan of 3 **scales** (`moth_scale`, 235 px/s slowing into a fluttering fall, 3.4 s, can be cut by the Brand) |
| `cocoon_spawner` | stationary, immovable (12) | 50 | 10/6/4/3 | [7, 12] | 40×62 / 0.85×1.3 | centre of tile, then attaches (see `attach`) | none itself (contact 1); **swell** 0.6 s (bulges, heart-light flares, slit splits) → hatches 1–2 `mothling`s, never more than `max` (3) alive; 3.6–4.8 s between broods, first brood after 1.4–2 s |
| `mothling` (minion) | flying, tiny (0.5) | 6 | 2/1/1/1 | 0 | 18×16 | — (hatched) | flits around the Wickling at ~2 tiles; **buzz** 0.42 s (stops, wings blur, glow) → **dart** 330 px/s for ≤ 0.48 s; 1.7–2.7 s between darts |
| `dust_maw` | ground ambusher, immovable (12) | 52 | 11/6/4/4 | [7, 12] | 46×58 risen (hidden heap otherwise) / 1×1.2 | feet on marker row's bottom | hidden heap (no hurtbox) creeps toward the Wickling; **tremble** 0.5 s (heap shudders, spits grit, `dust_stir`) → erupts in a **bite** forward/up (2.8 tiles wide × 2.7 tall, 0.05–0.2 s) → **gape** 0.9 s (hangs open = punish window) → if the Wickling is still close, **rebite** 0.45 s → second bite; then **sinks** 0.5 s and lurks again (1.5 s) |
| `moth_knight` | ground, heavy (2.5) | 63 | 13/7/5/4 | [12, 18] | 34×64 / 0.7×1.33 | feet on marker row's bottom | **ready** 0.45 s (drops low, blade drawn back, glint) → **dash** ≤ 2.8 tiles → **slash 1** (1.7 tiles in front) → **pull** 0.36 s (blade hoisted overhead, glint) → **slash 2** (overhead arc, 1.6 wide × 2.3 tall, small step) → **recover** 0.55 s → back-**hop** 2.6 tiles; **rise** 0.55 s (wings flare wide, blade levelled) → flying **lunge** ≤ 5.2 tiles at a Wickling ≥ 1.6 tiles above it or > 4.6 tiles away (never steeply down) → **land** 0.6 s |

All attacks deal 1 damage; contact damage 1 for all. Every telegraph is ≥ 0.36 s, every attack is followed by a
recovery ≥ 0.5 s (climb 0.72 / beat 0.65 / spent 0.7 / gape 0.9 / recover 0.55 / land 0.6). Regular enemies respawn on
every room load; for a unique one use `id: 'mw_u<n>', persistent: true` and 2–3× cinders. Mothlings drop nothing.

### Behaviour notes

- **dusk_moth**: drifts around its spot until it sees the Wickling (9 tiles, line of sight) inside its leash; steering
  targets stay ≥ 1.3 tiles below ceilings and ≥ 1.6 tiles above floors. A clean Brand hit during the swoop knocks it out
  of the dive. The climb after a swoop (0.72 s, slow, heavy) is the intended punish window.
- **cocoon_spawner**: notices the Wickling within `range` tiles horizontally and 1.4× `range` vertically (line of sight
  from its body). Killing it stops new broods; mothlings already out keep fighting (they are 1–2 Brand hits each).
  It swings on its thread when struck.
- **dust_maw**: hidden = no hurtbox; the heap is still drawn (grey mound with a few teeth poking out) so an attentive
  player can spot it. It triggers within `trigger` tiles horizontally and 2.6 vertically; while lurking it creeps under
  the dust (34 px/s) toward a Wickling within 6 tiles (line of sight), inside its `range` beat. It never moves once risen.
  Backing off during the tremble dodges the bite (verified: `maw_backoff` takes 0 damage).
- **moth_knight**: a duelist — patrols its beat, salutes (0.4 s) when it notices the Wickling (line of sight, ≤ 3.5 tiles
  vertically, ≤ beat + 7 tiles horizontally), keeps ~2.3–3.4 tiles of spacing, and sometimes (35 %, 3.5 s cooldown)
  back-hops away from a Brand swing started close in front of it. It vaults up 1–2-tile steps and drops off ≤ 3-tile
  ledges toward the Wickling (only onto safe floor inside its beat), but never retreats off a ledge. It never starts a
  combo whose dash path is blocked unless the Wickling is within 1.5 tiles.

## Placement props

| prop | kinds | default | meaning |
|---|---|---|---|
| `facing` | all | random | `'left' / 'right'` start facing |
| `range` | dusk_moth | 8 | leash half-width (tiles) around the spawn (× 0.85 vertically): it never steers outside it, gives up the chase and flies home beyond ~1.15–1.4× of it |
| `range` | cocoon_spawner | 9 | notice distance (tiles) horizontally; × 1.4 vertically |
| `max` | cocoon_spawner | 3 | most mothlings alive at once (1–3) |
| `leash` | cocoon_spawner | 9 | passed to its mothlings: tiles from the nest (1 tile below the cocoon) they may follow the Wickling (× 1.4 vertically) |
| `attach` | cocoon_spawner | `'ceiling'` | `'ceiling'`: a silk thread up to the ceiling (searched ≤ 16 rows up; the thread fades out if none); `'wall'`: snaps flush to the nearest wall within 3 tiles on its row; `'left'` / `'right'`: to the wall on that side |
| `range` | dust_maw | 3 | creep beat (tiles each side of the spawn) |
| `trigger` | dust_maw | 2.5 | horizontal ambush distance (tiles) |
| `range` | moth_knight | 4 | beat: tiles left/right of the spawn it patrols, dashes, vaults and lands in (never leaves it) |
| `hp`, `cinders`, `noDrops`, `id`+`persistent` | all | | generic, see docs/api/enemies.md §2 |

## Built-in safety (no extra work for the rooms builder)

- **Exit zones**: every side opening's run (±1 tile) and 3.5 tiles inward is off limits. Walkers stop at its edge,
  flyers steer around it, swoops/lunges whose path crosses it are cancelled. Nobody **starts** an attack (swoop,
  scales, brood, bite, combo, lunge, dart) while the Wickling stands in an exit zone — entering a room always gives
  room to react. S openings (holes/pits) are zones too, so nothing walks or dives into a floor hole; wide N openings
  (> 8 tiles, open sky) are not.
- Walkers never walk off ledges higher than 3 tiles, into hazard tiles or past their beat; the knight's back-hops,
  vaults, drops and lunge landings are checked for safe floor first. The maw and cocoon never move.
- Verified in `fight.js`: doorway (player standing in the W door: nobody closer than 4.4 tiles), E door + pit
  (nothing past col 69 next to the S pit), beat (`range: 3` holds), chase (the moth returns home), steps (knight vaults
  a 1- and a 2-tile step and drops a 1-tile step and lands hits), no frames inside solid tiles, no console errors.

## Placement advice

- Keep markers **≥ 8 tiles from side entrances** and hostiles (incl. a cocoon's mothling leash) **≥ 12 tiles from
  sconces/Lanternway posts** (a post refuses travel with a hostile within 12 tiles).
- **Darkness 0.7**: every kind carries a soft violet self-light (moth/cocoon/mothling glow, knight r 100), and all read
  in unlit parts of a room (`knightshot.js`). Still give each fight a light source nearby so the floor reads.
- **dusk_moth** — marker 3–6 tiles above the floor in open air (≥ 4 tiles from walls/ceiling is ideal: it circles at
  4 tiles around the Wickling and dives through). Rooms ≥ 12 tiles tall work best; in 18-row corridors put it in the
  upper middle (row ~9–11). `range: 5–6` in tight spots or near pits/doors. Two moths ≥ 8 tiles apart.
- **cocoon_spawner** — must be hittable: hang it so its bottom is **3–5 tiles above the floor** the player stands on
  (marker 4–6 tiles above that floor; a full jump + up-slash reaches ~7 tiles), or beside a platform/ledge. Ceiling
  cocoons: put the marker under a ceiling/overhang (the thread needs something to hang from — no floating thread);
  wall cocoons: marker 1–2 tiles from a wall face with `attach: 'wall'`. In shafts keep it out of the wall-jump lane.
  Two cocoons in one room ≥ 10 tiles apart (6 mothlings at once is the hard cap; prefer `max: 2` on the second).
- **dust_maw** — flat floor ≥ 7 tiles wide (beat ±3), **≥ 3 tiles headroom** (the bite reaches 2.7 tiles up). Put it
  where the player walks (a path between roots, under a ledge they drop from) but **≥ 7 tiles from doors and landing
  spots** (trigger 2.5 + creep 3), never on a one-way platform. Mark it with a little debris/ash so it is fair.
- **moth_knight** — flat floor run ≥ 8 tiles (beat ±4, dash, back-hop) with **≥ 4.5 tiles headroom** (lunge + the
  player jumping over it). 1–2-tile steps inside its beat are fine (it vaults them). Not on narrow ledges, not on
  one-way platforms, not near the edge of a pit it could be knocked over (it never walks off, but knockback may push).
  One per room.

### Plan rooms (contents from the world plan)

| room | plan contents | suggestion |
|---|---|---|
| mw_01 The Reed Shallows (64×18) | dusk_moth ×2, dust_maw ×1 | maw on the floor mid-room (col ~22, `range: 3`), ≥ 8 tiles from W1/E1; moths at rows ~9–11, cols ~16 and ~44 (`range: 6`), the second away from the S1 hole (cols 44–47 is fine: the hole is a zone) |
| mw_02 The Wickreed Grove (hub 96×36) | cocoon_spawner ×2, dusk_moth ×2, dust_maw ×1 | sconce col 44, post col 60: keep all hostiles + mothling leash ≥ 12 tiles away — west floor (cols 6–30, `leash: 5`) and the canopy far from the post; cocoons hung from the canopy/reed caps over the west floor, maw on the west floor away from W1 and the S1 hole, moths high (rows 12–24) west or in the canopy east (≥ 12 tiles from the post) |
| mw_03 The Mothward Gate (64×27) | moth_knight ×1, dusk_moth ×1 | knight on the floor (row 24) mid-room (col ~30–34, `range: 4`), clear of the S1 hole (cols 40–43); moth by the grate climb (rows 10–16) but ≥ 3 tiles off the platform column so the climb stays fair |
| mw_05 The Cocoon Deep (64×27) | cocoon_spawner ×2, moth_knight ×1 | cocoons on the walls (`attach: 'wall'`) beside the steps / upper floor, bottoms 3–5 tiles above the floor below; knight on the lower floor (cols 44–62, `range: 3`, ≥ 8 tiles from E2), not on the D floor |
| mw_06 The Silk Galleries (64×27) | moth_knight ×1, dusk_moth ×2 | sconce_b col 40: knight ≥ 12 tiles from it (cols ≤ 26, `range: 4`, away from the S1 hole cols 18–21 — the hole is a zone); moths in the galleries' open air ≥ 12 tiles from the sconce |
| mw_07 The Cocoon Hollow (shaft 64×36) | moth_knight ×1, cocoon_spawner ×1, dust_maw ×1 | knight on the floor (row 33), maw among the roots on the floor ≥ 8 tiles from E1 and the knight; cocoon on a wall near (not in) the climb platforms (cols 36–47), `leash: 5` |
| mw_08 The Dustfall Hollow (96×18) | dust_maw ×2, dusk_moth ×2 | maws on the floor ≥ 15 tiles apart, ≥ 8 from doors and the S1 dip (cols 60–63), one below the root ledge (cols 28–32) where the player drops down; moths rows 8–10, ≥ 10 apart |
| mw_09 The Silt Roots (64×36) | moth_knight ×1, dusk_moth ×1 | knight on the upper floor (cols 40–56, `range: 3`, ≥ 8 from W1, not on the D tiles cols 38–45 — put it east of them); moth over the lower floor away from wren's camp (col 30) |
| mw_10 The Chrysalis Chapel (96×18) | dusk_moth ×2 | none within 12 tiles of the shrine (col 46): one west (col ~20, below the balcony) and one east (col ~75), `range: 6` |

## Art notes

- Palette: dusky violets and greys with pale-lilac highlights, glowing eye-spots and hearts (`#b890ff` / `#c8a8ff`),
  warm cream telegraph glints (`#ffdcb0`). Thick dark outlines (`#0c0912`) as in the rest of the cast.
- dusk_moth: big furry body, fern antennae, banded forewings, eye-spotted hind wings that flare in the telegraph.
- cocoon_spawner: silk-wrapped pupa with a beating heart-light and shadowy brood inside; splits open when it swells.
- dust_maw: grey dust mound → a hooded beak-maw with ivory teeth and two lilac eyes; dust particles while it moves.
- moth_knight: slim armoured moth duelist with a white ruff, plume-antennae, folded dusty wings (they open for hops,
  vaults and the lunge) and a pale sabre with a swing trail. Poses: guard, walk, notice, ready, dash, slash 1, pull,
  slash 2, recover, rise, lunge, hop, land, corpse.
