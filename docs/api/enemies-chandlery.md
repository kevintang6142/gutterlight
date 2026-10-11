# The Chandlery enemies — placement guide (module: enemies-chandlery)

File: `src/entities/enemies/chandlery.js` (4 kinds + projectiles `ladle_blob`, `ladle_puddle` + sfx `mold_squelch
mold_splat ladle_scoop ladle_fling wax_sizzle slime_gurgle wisp_flare wisp_dash`, each defined only if the audio module
lacks it). Test hooks: `G.ChandleryEnemies = { Moldling, DripSlime, ForgeWisp, LadleBrute, LadleBlob, LadlePuddle,
BPOSE, findLanding, exitZones, inZone }`.

```sh
node tools/enemy_selftest.js --kinds moldling,drip_slime,forge_wisp,ladle_brute --region chandlery --out test-output/enemies-chandlery
node test-output/enemies-chandlery/fight.js    # aggression vs a standing player, Brand kills L0/L1/L2, ceiling drop, knocked-loose drop,
                                               # no drop over lava, doorway, pit, lava, beat/leash, shove, blob -> puddle, puddle damage
node test-output/enemies-chandlery/soak.js     # 30-40 s random play in dev_02 (spike pits) / dev_water (lava) + aggro (boss-summoned) moldlings
node test-output/enemies-chandlery/sheet.js    # pose contact sheet -> test-output/enemies-chandlery/enemies.png
node test-output/enemies-chandlery/ingame.js   # in-game telegraph/attack moments at 1x -> test-output/enemies-chandlery/ingame.png
```

## Kinds at a glance

| kind | body | hp | Brand hits L0/L1/L2/L3 | cinders | box (px / tiles) | anchor | attacks (telegraph) |
|---|---|---|---|---|---|---|---|
| `moldling` | ground, light (0.8) | 30 | 6/4/3/2 | [5, 8] | 38×34 / 0.95×0.85 | feet on the marker row's bottom | short travel hops toward the Wickling (contact); within ~3.8 tiles: **wind-up** 0.45 s (crouches, molten light cracks through its skin, mouth gapes) → belly-flop onto/just past the Wickling → 0.62 s splatted (punishable) |
| `drip_slime` | ground (hangs from a ceiling until it drops), 0.9 | 35 | 7/4/3/3 | [5, 8] | 34×26 / 0.85×0.65 | snaps up to the ceiling above the marker (≤ `reach` tiles), else feet on the marker row | hanging: **tremble** 0.5 s (shivers, the droplet under it stretches, gurgle) when the Wickling passes below → drops → 0.55 s splat; on the floor it crawls and **rears** 0.45 s → low lunge 1.2–2.8 tiles → 0.5 s splat |
| `forge_wisp` | flying, light (0.6) | 32 | 7/4/3/2 | [7, 12] | 28×28 / 0.7 | centre of the tile | circles the Wickling at ~3.6 tiles; **flare** 0.5 s (stops, white-hot, rays, roar) → straight dash (600 px/s, ≤ 8 tiles, aimed at where the Wickling was when the flare ended) → 0.62 s guttering (dim, punishable) |
| `ladle_brute` | ground, heavy (3) | 65 | 13/8/5/4 | [12, 18] | 52×76 / 1.3×1.9 | feet on the marker row's bottom | **scoop** 0.6 s (reaches over its shoulder into the crucible on its back, the vat flares) → swings the ladle overhead and flings 1 (near) or 2 (far, ±0.75 tile) molten blobs in arcs (≤ 10 tiles) → 0.8 s; **brace** 0.48 s (hunches behind the bowl) → shove 2.3 tiles in front (lunges ~1 tile) → 0.95 s |

All attacks deal 1 damage; every attack has a telegraph ≥ 0.45 s and a recovery ≥ 0.5 s; contact damage 1 on all bodies.
`ladle_blob` is destroyable (the Brand pops it). Where a blob lands on flat floor it leaves a **burning puddle**
(`ladle_puddle`, ~1.5 s, 1.3 tiles wide, 0.3 tile tall hitbox; harmless for its first 0.1 s and its last 0.35 s while it
crusts over; never spawned on lava/water/spikes or inside a doorway zone). A **knocked-loose** drip slime (hit while
hanging) falls harmlessly and stays harmless for 0.35 s after landing. Regular enemies respawn on every room load; for a
unique one use `id: 'ch_u<n>', persistent: true` and 2–3× cinders.

## Placement props

| prop | kinds | default | meaning |
|---|---|---|---|
| `facing` | all | random | `'left' / 'right'` start facing |
| `range` | moldling | 6 | beat: tiles left/right of the spawn it hops within (a belly-flop may land ≤ 1 tile beyond) |
| `range` | ladle_brute | 5 | beat: tiles left/right of the spawn it patrols and steps toward the Wickling (a shove may carry it ≤ 1 tile beyond) |
| `range` | drip_slime | 5 | floor beat after it lands, centred on the landing spot (a lunge may land ≤ 1.5 tiles beyond) |
| `surface` | drip_slime | `'auto'` | `'auto'`/`'ceiling'`: hang from the first solid ceiling ≤ `reach` tiles above the marker (else start on the floor); `'floor'`: start crawling on the floor |
| `reach` | drip_slime | 10 | tiles searched upward for a ceiling |
| `trigger` | drip_slime | 1.5 | half-width (tiles) of the drop trigger under it (the Wickling's position + 0.3 s of its speed); the Wickling must be below it within 15 tiles with line of sight |
| `leash` | forge_wisp | 9 | tiles from the spawn: it engages only while the Wickling is within leash + 2 of its spawn, never steers beyond leash, and a dash ends at leash + 3 |
| `orbit` | forge_wisp | 3.6 | circling radius around the Wickling (tiles; drawn as a flattened ellipse, mostly above it) |
| `aggro` | moldling, forge_wisp | false | chase at once, ignore beat/leash and line of sight (boss summons: `boss.summon('moldling', x, y, { aggro: true })`, which also sets `noDrops`) |
| `hp`, `cinders`, `noDrops`, `id`+`persistent` | all | | generic, see docs/api/enemies.md §2 |

## Built-in safety (no extra work for the rooms builder)

- **Exit zones**: every side opening's run (±1 tile) and 3.5 tiles inward is off limits (flyers: plus 2 tiles of air
  around the opening). Moldlings never land in one, slimes and brutes turn at its edge, wisps steer clear and end a
  dash before it. Nobody starts an attack (belly-flop, drop, lunge, flare, scoop, shove) while the **Wickling stands in an
  exit zone** — a player entering the room always gets room to react. Wide **S openings (pits)** count as zones, so
  nothing wanders over a chasm; wide **N openings (> 8 tiles, open sky)** do not.
- **Hazards**: moldlings only land on solid/platform floor with no hazard tile at or beside the landing; slimes and
  brutes never step toward spikes/lava/water or off ledges; a drip slime never drops when the floor below it is a hazard,
  a pit or a doorway zone; wisps keep a tile of air above hazard tiles (orbit points are lifted, dashes stop short).
  Knockback never pushes the ground kinds off a ledge, onto a hazard or into an exit zone.
- Everyone stays inside the room (base) and inside its beat/leash.

## Placement advice

- Keep markers **≥ 8 tiles from side entrances** and away from sconces/Lanternway posts (a hostile within 12 tiles
  makes a post refuse travel; a brute's beat edge + 1 tile and a wisp's spawn + leash + 2 must stay ≥ 12 tiles away).
- **moldling** — on floors with ≥ 6 tiles of flat run (its beat), 2–4 tiles of headroom (the belly-flop rises ~2 tiles).
  Pairs/trios read well 3–5 tiles apart ("they stagger off the racks"). On a ledge or rack platform give it a `range`
  that fits the ledge — it never hops off, but a `range` keeps it lively in place.
- **drip_slime** — marker anywhere in the column under a **solid** ceiling (1–10 tiles below it); it hangs flush under
  the ceiling (0.65 tile + a dangling droplet, ~1.3 tiles total) and drips now and then (the hint). Put it over a floor
  route the Wickling walks, ≥ 3 tiles of drop, the floor under it flat for ~2 tiles each side (it splats and crawls
  there). Do not hang it from one-way platforms (not supported), breakable `B`/`D` tiles or over lava/pits (it simply
  never drops there — wasted). Ceiling height ≤ 14 tiles above the floor (trigger range 15).
- **forge_wisp** — open air ≥ 2 tiles from walls, ≥ 3 tiles above the floor; it needs ~4 tiles of clear air around the
  Wickling to circle (it bounces its orbit off walls). Its dash covers up to 8 tiles in a straight line, so do not
  place it where a straight dash path crosses a doorway (it stops at the zone anyway) — and keep it away from the line of
  a required dash/jump over a hazard (a hit there drops the player into lava; fair, but frustrating if mandatory).
- **ladle_brute** — needs a flat floor run of ≥ 6 tiles (its beat) and **≥ 3 tiles of headroom** (4 looks best: the
  flung ladle rises ~3 tiles above its feet; the art may overlap a low ceiling but nothing breaks). Blobs reach 10 tiles
  in arcs, so put cover or distance between it and a doorway. Do not place two brutes within 8 tiles.

### Plan rooms (contents from the world plan)

| room | plan contents | suggestion |
|---|---|---|
| ch_01 Gallery Gate (64×18, floor top 15) | moldling ×2, drip_slime ×1 | moldlings on the floor east of the S1 dip (e.g. cols 30 and 36, `range: 5`), slime under the ceiling over the W1→E1 walk around col 48 (≥ 8 tiles from E1), not over the S1 hole |
| ch_02 Great Foundry hub (96×36) | ladle_brute ×1, moldling ×2, drip_slime ×2 | brute on the **middle walkway** between the sconce (col 30) and the post (col 62): e.g. col 45, `range: 3` (stays ≥ 12 tiles from col 62 and 13 from col 30). Moldlings and slimes on the **lower floor** (row 33): moldlings around cols 40–55 (`range: 5`), slimes under the middle walkway's underside over the lower floor, ≥ 4 tiles from the S1/S2 dips; nothing within 12 tiles of the post |
| ch_03 Pouring Floor (64×27, floor top 24) | moldling ×3, ladle_brute ×1 | moldlings west of the lava channel (cols 10–18, `range: 4`) and on the east floor (cols 34–40); they may hop onto the channel grates (platforms) but never land in or get knocked into the lava. Brute guarding E1: cols 46–52 with `range: 3` (at col 52 its beat edge, col 55, is 8 tiles from E1 at col 63 and out of the exit zone) |
| ch_04 Crucible Climb (64×36) | forge_wisp ×2 | over the molten lake, `leash: 5`: one over the stepping blocks (cols 20–22, row 19), one over the east lake below the brim (cols 46–52, rows 18–20). They engage only while the Wickling is within leash + 2 of their spawn, so they leave the wall-top / 9-tile dash gap (rows 9–10) alone; the west one does harass the stepping-block jumps (a hit there can drop the Wickling into the lake → hazard respawn) — move it to row 17 or `leash: 4` if that feels unfair in play. Pogo-able, never required |
| ch_05 Cooling Cellar (64×18) | drip_slime ×2, moldling ×1 | slimes under the ceiling east of the B wall (e.g. cols 30 and 48, not over N1's platform ladder cols 39–44); moldling on the floor col 34 `range: 4` (≥ 8 tiles from E1). Nothing west of the B wall (the trough is a dash challenge) |
| ch_06 Quench Gate (64×27) | forge_wisp ×2, moldling ×1 | wisps in the hall's open air (e.g. cols 28 and 44, rows 15–17, `leash: 7`), not on the line of the 10-tile Flare-Trail dash gap at row 11 if possible (optional reward, so acceptable); moldling on the floor cols 24–32, away from the D floor (cols 12–19) |
| ch_07 Mold Racks (64×27) | moldling ×3, drip_slime ×1 | moldlings on the rack platforms (tops 20/16, `range` = platform half-width) and the floor; slime under a rack platform's solid underside or the ceiling over the floor walk; none on the casting block (cols 50–62) |
| ch_08 Kiln Antechamber (64×27) | ladle_brute ×1, forge_wisp ×1 | the sconce is at col 30: brute on the floor ≥ 13 tiles away (col 44, `range: 3`), wisp near the cage perch side (col 10, row 18, `leash: 6`, i.e. it engages only within ~8 tiles of col 10), keeping the rest spot calm. Nothing on the E1 furnace ledge |
| ch_10 Slag Gate (64×18) | moldling ×2, forge_wisp ×1 | moldlings on the floor cols 26–40 (`range: 4`), wisp at col 34 row 10 (`leash: 7`), all ≥ 8 tiles from W1 and clear of the S1 dip (cols 5–14); nothing inside the secret store |
| ch_09 Kiln Heart (arena) | — (boss) | the Kiln Mother may `summon('moldling', x, feetY, { aggro: true })` from her vents (cols 58–62): aggro moldlings chase across the arena, ignore line of sight, drop nothing |

## Art notes

Palette: rust & iron with bright molten orange. Each kind reads against the dark rust-brown by a different value:
moldlings are pale raw (never lit) wax with a mold seam, a ragged casting fin on the crown, a stub arm and lopsided
ember eyes; drip slimes are glowing amber jelly with a cooled crust, bubbles and beady black eyes; wisps are living flame
(outlined) around a charred coal heart with angry slit eyes; brutes are grimy tallow hunchbacks with a riveted bucket
helm (one slit of furnace light), a leather apron and belt, a molten crucible strapped to the back and a huge iron
ladle. Deaths: moldlings splatter (wax burst, spattered puddle, no wick); slimes sizzle into a cooling amber puddle;
wisps puff out (smoke, embers) and their coal heart drops into a smear of ash; brutes melt into a tallow puddle with the
ladle and the helm left lying in it. Telegraph glow colour `#ffc070` (wisp flare `#fff0c0`).

## Telegraphs by mode (easy / standard / hardcore)

The difficulty modes (`G.game.difficulty()`; `G.telegraphsOn()` is true only in Easy) change only **explicit** telegraphs: drawn geometry that outlines where or
when damage lands (floor zones, landing marks, aim/trajectory lines, hitbox previews, danger tints). Those draw only
while `G.game.telegraphs()` (alias `G.telegraphsOn()` in enemy_base) is true, which means easy mode only. The
telegraph audit (module tele-enemies) found **no explicit marker on any of these enemies**. Every tell below is
**diegetic**: the attacker's own wind-up pose, a glow or glint on its body or weapon (`telegraph()` anchors it on the
body, weapon tip, lantern, bell or pot), its sound cue, the wind-up shake, particles it emits, or projectiles forming on
it and visible in flight. So all three modes look and play the same, with the same timing. Nothing was removed and
nothing was kept-subtle. Verified: `test-output/tele-enemies/sheet_chandlery.png` shows easy and standard side by side
with seeded randomness and 0.00 % pixel difference at every wind-up. The lab self-test passes in all three modes
(`test-output/tele-enemies/run_all.sh`). **Rule for new attacks:** gate any explicit marker at draw time with
`G.telegraphsOn()` (or keep it with `keep: true` and document why), and keep a diegetic tell of at least 0.35 s.

| attack | easy | standard / hardcore | diegetic tell (lead time) |
|---|---|---|---|
| moldling: belly-flop | no explicit marker | same as easy (nothing to remove) | **wind-up** 0.45 s: crouches, molten light cracks through its skin, mouth gapes, shake |
| drip_slime (hanging): drop | no explicit marker | same as easy (nothing to remove) | **tremble** 0.50 s: shivers, the droplet under it stretches, gurgle, heavy shake |
| drip_slime (floor): lunge | no explicit marker | same as easy (nothing to remove) | **rear** 0.45 s: rears up tall, quivering |
| forge_wisp: dash | no explicit marker | same as easy (nothing to remove) | **flare** 0.50 s: stops and flares white-hot with rays from its own flame, `wisp_flare` |
| ladle_brute: blob fling | no explicit marker | same as easy (nothing to remove) | **scoop** 0.60 s: reaches over its shoulder into the crucible, the vat flares (glint on the vat); the blobs are visible in flight and their puddles are the hazard itself |
| ladle_brute: shove | no explicit marker | same as easy (nothing to remove) | **brace** 0.48 s: hunches low behind the bowl, heavy shake |
