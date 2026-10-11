# The Sootflue enemies — placement guide (module: enemies-flue)

File: `src/entities/enemies/flue.js` (4 kinds + projectiles `crawler_ash`, `stoker_coal` + sfx `soot_puff ash_spit
shovel_swing shovel_slam coal_hiss bat_screech`, each defined only if the audio module lacks it). Test hooks:
`G.FlueEnemies = { SootSprite, ChimneyCrawler, Stoker, AshBat, CrawlerAsh, StokerCoal, POSE }`.

```sh
node tools/enemy_selftest.js --kinds soot_sprite,chimney_crawler,stoker,ash_bat --region flue --out test-output/enemies-flue
node test-output/enemies-flue/fight.js     # aggression vs a standing player, real Brand kills (L1/L2), doorway, pit, beat, swing
node test-output/enemies-flue/soak.js      # ceiling/wall crawler, bat roost cycle, summoned sprites, 40 s random-play soak
node test-output/enemies-flue/sheet.js     # pose contact sheet -> test-output/enemies-flue/enemies.png
node test-output/enemies-flue/ingame.js    # in-game telegraph/attack moments at 1x -> test-output/enemies-flue/ingame.png
```

## Kinds at a glance

| kind | body | hp | Brand hits L0/L1/L2/L3 | cinders | box (px / tiles) | anchor | attacks (telegraph) |
|---|---|---|---|---|---|---|---|
| `soot_sprite` | flying, light (0.5) | 10 | 2/2/1/1 | [3, 5] | 22×22 / 0.55 | centre of tile | jittery chase; **puff** 0.42 s (swells, glows) → **dart** ~3 tiles (contact) → 0.55 s sag |
| `chimney_crawler` | surface crawler (manual physics, no knockback) | 26 | 6/3/2/2 | [5, 8] | 30×30 / 0.75 | slides onto `surface` | contact; **inflate** 0.55 s (mortar glows, pot smokes) → ash ball 255 px/s at the Wickling → 0.55 s recovery; every 2.8–3.6 s |
| `stoker` | ground, heavy (2.6) | 40 | 8/5/4/3 | [8, 13] | 48×70 / 1.2×1.75 | feet on marker row's bottom | **scoop** 0.55 s (crouch, coals glow on the blade) → 2–3 burning coals lobbed in arcs (≤ 10 tiles) → 0.6 s; **raise** 0.62 s (shovel high behind the head) → slam 2.4 tiles in front → 0.85 s stuck |
| `ash_bat` | flying, light (0.6) | 18 | 4/2/2/2 | [3, 5] | 30×26 / 0.75×0.65 | centre (then snaps to the ceiling) | **wake/aim** screech 0.45/0.42 s (wings flare, mouth opens) → swoop arc through the Wickling's position → 1–1.8 s flutter above it → again |

All attacks deal 1 damage; every attack has a telegraph ≥ 0.42 s and a recovery ≥ 0.55 s. Both projectiles are
destroyable (the Brand pops them). Regular enemies respawn on every room load; for a unique one use
`id: 'sf_u<n>', persistent: true` and 2–3× cinders.

## Placement props

| prop | kinds | default | meaning |
|---|---|---|---|
| `facing` | all | random | `'left' / 'right'` start facing (crawler: start crawl direction) |
| `range` | stoker | 5 | beat: tiles left/right of the spawn it patrols and may step toward the Wickling (it never leaves it) |
| `range` | chimney_crawler | none | beat: max tiles from the spawn on **either axis** (turns around at the limit). Use it on long walls/ceilings |
| `surface` | chimney_crawler | auto (floor first) | `'floor' / 'left' / 'right' / 'ceiling'`: the marker sits in the air tile next to that surface (slides ≤ 1 tile onto it) |
| `speed` | chimney_crawler | 44 | crawl speed px/s |
| `leash` | soot_sprite | 10 | tiles from the spawn before it gives up the chase and drifts home |
| `leash` | ash_bat | 14 | same for the bat (tall shafts: fine as is) |
| `perch` | ash_bat | `'auto'` | `'auto'`: hangs asleep from a ceiling ≤ 12 tiles above the marker, else circles the marker; `'ceiling'`: search 20 tiles up; `'air'`: never roosts, circles its spot (sky rooms, mid-shaft) |
| `aggro` | soot_sprite | false | chases at once and ignores its leash (boss minions: `boss.summon('soot_sprite', x, y, { aggro: true })`, drops nothing) |
| `hp`, `cinders`, `noDrops`, `id`+`persistent` | all | | generic, see docs/api/enemies.md §2 |

## Built-in safety (no extra work for the rooms builder)

- **Exit zones**: every side opening's run (±1 tile) and 3.5 tiles inward is off limits. Crawlers and stokers turn
  around at its edge; flyers steer at least ~0.75 tile clear of it; sprites stop a dart before entering it; bats
  abort a swoop into it. Nobody starts an attack (dart, spit, coal lob, swoop) while the **Wickling stands in an exit
  zone** — a player entering the room always gets room to react. Wide **S openings (pits)** count as zones, so nothing
  wanders over a chasm; wide **N openings (> 8 tiles, open sky)** do not.
- Stokers never walk off ledges, into hazard tiles or past their beat; crawlers never crawl onto hazard tiles.
- Flyers stay inside the room (base) and are pushed out of each other (sprites).

## Placement advice

- Keep markers **≥ 8 tiles from side entrances** and away from sconces/Lanternway posts (hostiles within 12 tiles
  make a post refuse travel).
- **soot_sprite** — groups of 2–3, markers 1–2 tiles apart, ≥ 2 tiles from walls, 2–5 tiles above the floor. Sight
  7 tiles: they come to the Wickling; leave a few tiles of open air around them (they orbit ~2 tiles off).
- **chimney_crawler** — on floors, walls, ceilings, pipe runs (solid tiles). It shoots only into the half-space in front
  of its surface (never through its own wall), sight 9 tiles with line of sight. On a long shaft wall give it a
  `range` of 3–6 so it holds a stretch instead of climbing out of reach; keep it ≥ 2 tiles off the shaft's
  one-way rungs if you do not want it crossing them (it walks on top of one-way platforms but climbs past their ends). The ash ball flies straight
  (255 px/s), so a wall crawler above a stair is fair; avoid stacking two crawlers that can fire at the same spot.
- **stoker** — needs a flat floor run of ≥ 6 tiles (its beat) and **≥ 3 tiles of headroom** (4 looks best: the raised
  shovel rises ~2.7 tiles above its feet; the art may overlap a low ceiling but nothing breaks). Lobs reach 10 tiles,
  so put cover or distance between it and a doorway. On rafters with gaps (sf_09) give it `range` ≤ the rafter it
  stands on — it turns at ledges anyway, the beat keeps it calm. Do not place two stokers within 6 tiles.
- **ash_bat** — roosting: put the marker 1–4 tiles below a solid ceiling (it snaps up and hangs, 0.65 tile tall) over a
  route the Wickling walks under; it wakes when the Wickling passes within ~3 tiles horizontally anywhere below
  (≤ 14 tiles, line of sight) or comes within 2.6 tiles. The swoop dives to the Wickling's height and rises 2–4 tiles
  beyond it, so leave ~5 tiles of clear air on both sides of where the player stands. Sky rooms and open shafts:
  `perch: 'air'`, ≥ 2 tiles from walls/stacks, ≥ 5 tiles below an open top; it circles 1.6 tiles around the marker
  and attacks when the Wickling is within 6.5 tiles.

### Plan rooms (contents from the world plan)

| room | plan contents | suggestion |
|---|---|---|
| sf_01 Chimney Tops (sky) | ash_bat ×2, soot_sprite ×2 | bats `perch:'air'` between stacks, rows 6–9, not over the S1 mouth; sprites in a pair over the roofs, ≥ 8 tiles from W1 and from the lever/gate |
| sf_02 Great Flue (shaft) | chimney_crawler ×3, ash_bat ×2 | crawlers on the brick walls **below the gantry** (`surface:'left'/'right'`, `range: 4–6`), not on the rungs' row ends; bats roosting under the gantry's underside (auto perch finds it) or `perch:'air'` mid-shaft. None near sf_sconce_b on the floor or the E4 den door |
| sf_09 Soot Lofts | soot_sprite ×3, stoker ×1 | sprites among the sacks (2–3 tiles above the rafters); stoker at col 70 with `range` = its rafter span |
| sf_03 Bellows Hall | stoker ×2, soot_sprite ×1 | stokers on the floor, ≥ 12 tiles from sf_sconce_a (col 18) and ≥ 6 tiles apart (e.g. cols 50 and 72, `range: 5`); under the low ceiling (cols 37–60, air rows 9–14 = 6 tiles) is fine; sprite near the bellows |
| sf_04 Ember Shaft | ash_bat ×2, chimney_crawler ×1 | bats `perch:'air'` in the updraft between the zig-zag platforms (rows 26–38); crawler on the east wall below W2 with `range: 4` |
| sf_07 Pipeworks | chimney_crawler ×2, stoker ×1, ash_bat ×1 | crawlers on the ceiling pipes / walkway underside (`surface:'ceiling'`); stoker on the upper walkway away from W1/E1; bat roosting under the walkway's ceiling |
| sf_08 Ashpit | chimney_crawler ×2, ash_bat ×1 | crawlers on the ash floor (`range: 5`), not under N1's one-way stack nor near the E1 door; bat roosting mid-room |

## Art notes

Palette: soot black + ember orange; each kind reads against the charcoal flue by a different value: sprites by their
glowing slanted eyes and ember underglow, crawlers by brick red with a warm rim and a glowing chimney pot, stokers by
pale soot-stained wax with an ember-lit front rim, glowing coals and furnace-slit eyes, bats by pale ash fur. Deaths:
sprites and bats burst into ash and leave a small ash heap with dying embers; crawlers crumble into a heap with
bricks and the broken pot; stokers melt into a dark wax puddle. Telegraph glow colour `#ffb060`.

## Telegraphs by mode (easy / standard / hardcore)

The difficulty modes (`G.game.difficulty()`; `G.telegraphsOn()` is true only in Easy) change only **explicit** telegraphs: drawn geometry that outlines where or
when damage lands (floor zones, landing marks, aim/trajectory lines, hitbox previews, danger tints). Those draw only
while `G.game.telegraphs()` (alias `G.telegraphsOn()` in enemy_base) is true, which means easy mode only. The
telegraph audit (module tele-enemies) found **no explicit marker on any of these enemies**. Every tell below is
**diegetic**: the attacker's own wind-up pose, a glow or glint on its body or weapon (`telegraph()` anchors it on the
body, weapon tip, lantern, bell or pot), its sound cue, the wind-up shake, particles it emits, or projectiles forming on
it and visible in flight. So all three modes look and play the same, with the same timing. Nothing was removed and
nothing was kept-subtle. Verified: `test-output/tele-enemies/sheet_flue.png` shows easy and standard side by side
with seeded randomness and 0.00 % pixel difference at every wind-up. The lab self-test passes in all three modes
(`test-output/tele-enemies/run_all.sh`). **Rule for new attacks:** gate any explicit marker at draw time with
`G.telegraphsOn()` (or keep it with `keep: true` and document why), and keep a diegetic tell of at least 0.35 s.

| attack | easy | standard / hardcore | diegetic tell (lead time) |
|---|---|---|---|
| soot_sprite: dart | no explicit marker | same as easy (nothing to remove) | **puff** 0.42 s: swells, embers glow through the soot, glint, shake |
| chimney_crawler: ash ball | no explicit marker | same as easy (nothing to remove) | **inflate** 0.55 s: stops, mortar glows, the shell swells, the pot smokes, glint at the pot mouth |
| stoker: coal lob | no explicit marker | same as easy (nothing to remove) | **scoop** 0.55 s: crouches, digs the blade in, coals glow on the blade (glint there) and embers rise from it; the coals are visible in flight |
| stoker: shovel slam | no explicit marker | same as easy (nothing to remove) | **swing** 0.62 s: heaves the shovel high behind its head, eyes flare, heavy shake |
| ash_bat: first swoop | no explicit marker | same as easy (nothing to remove) | **wake** 0.45 s (0.38 s when woken by a hit): eyes snap open, wings unfurl, `bat_screech` |
| ash_bat: swoop | no explicit marker | same as easy (nothing to remove) | **aim** 0.42 s: rears back, wings high, mouth open, `bat_screech` |
