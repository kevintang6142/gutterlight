# The Rime enemies (and the Heartwick Sanctum): placement guide (module: enemies-rime_sanctum)

File: `src/entities/enemies/rime.js`. It holds the 4 kinds, the projectiles `frost_spikes`, `icicle` and `rime_shard`,
and these sfx: `husk_groan husk_slam ice_spikes spitter_charge icicle_shot ice_shatter wraith_shimmer wraith_slash
wraith_blink crawler_bristle shard_volley`. Each sfx is defined only when the audio module does not already have it.
Test hooks: `G.RimeEnemies = { FrostHusk, IceSpitter, RimeWraith, ShardCrawler, FrostSpikes, Icicle, RimeShard, RI,
MOUNTS, SHARDS, exitZones, inZone }`.

**The Heartwick Sanctum (hs_01, hs_02) and the Sanctum Gate (ri_08) have no enemies**, by design (solemn, quiet,
the last sconce before Lucerne).

```sh
node tools/enemy_selftest.js --kinds frost_husk,ice_spitter,rime_wraith,shard_crawler --region rime --out test-output/enemies-rime_sanctum
node test-output/enemies-rime_sanctum/fight.js    # aggression, Brand kills L0-L2, husk spikes + timed jump, wall/ceiling spitters, doorway, pit, beat, leash, slab crawler
node test-output/enemies-rime_sanctum/hazard.js   # spike tiles: crawlers/husks never overlap a hazard; husk on a 3-wide block never falls
node test-output/enemies-rime_sanctum/soak.js     # 45 s random play with all kinds at once (stuck states, bounds, errors)
node test-output/enemies-rime_sanctum/sheet.js    # pose contact sheet -> enemies.png
node test-output/enemies-rime_sanctum/ingame.js   # in-game telegraph/attack moments at 1x -> ingame.png
```

## Kinds at a glance

| kind | body | hp | Brand hits L0/L1/L2/L3 | cinders | box (px / tiles) | anchor | attacks (telegraph) |
|---|---|---|---|---|---|---|---|
| `frost_husk` | ground, heavy (3), slow (26 px/s) | 80 | 16/9/7/5 | [14, 20] | 54×86 / 1.35×2.15 | feet on the marker row's bottom | **raise** 0.6 s (both ice fists heaved overhead, ice creaks, eyes warm) → **slam**: the fists hit the floor right in front (2 damage, about 1.9 tiles from its centre, 1.15 tiles tall), and a **line of ice spikes** (`frost_spikes`, 1 damage, 340 px/s, about 1 tile tall, reach = `reach` − 2 tiles) erupts along the floor toward the Wickling. Jump it. The line stops at walls, ledges, floor gaps and exit zones. Then **stuck** 0.85 s + pull 0.4 s, the punish window. Turns slowly (0.45 s) when the Wickling gets behind it |
| `ice_spitter` | fixed growth (floor/wall/ceiling), immovable (12) | 50 | 10/6/4/3 | [6, 9] | 36×36 / 0.9 | flush on its surface | **aim** 0.7 s (the great crystal tracks the Wickling for 0.45 s, then locks, glints and fills with light) → **2 icicles** along the locked line, 0.2 s apart (`icicle`, 360 px/s, straight, destroyable) → 0.6 s recovery (the tip regrows). It only fires into the half-space in front of its surface (up to 86° off the surface normal), with a cooldown of 2.2–3 s |
| `rime_wraith` | flying ghost, light (0.8), passes through terrain | 60 | 12/7/5/4 | [8, 14] | 34×50 / 0.85×1.25 | centre of the tile | **stalks** ~3.4 tiles beside and above the Wickling. **fade** 0.28 s → **shimmer** 0.6 s at a free spot 1.5 tiles beside the Wickling (frost gathers and its outline forms there with talons raised; it cannot be hit and deals no contact damage while forming) → **slash** (1 damage, about 1.85×1.55 tiles in front) → **linger** 0.55 s, the punish window → **vanish**, then reforms 4–5 tiles away. Blink cooldown 2.2–3.1 s |
| `shard_crawler` | crawler (floors, walls, ceilings), 38 px/s | 55 | 11/7/5/4 | [8, 12] | 34×34 / 0.85 | flush on its surface | **bristle** 0.55 s (stops, the shards rise and glow, the body shivers) → **3 shards** fanned out from its back, away from its surface (`rime_shard`, 300 px/s, light gravity, destroyable) → 0.6 s spent, then the shards regrow. Engages within 6.5 tiles with line of sight, Wickling in front of its surface; cooldown 2.6–3.4 s |

- Every attack has a telegraph of at least 0.55 s and a recovery of at least 0.55 s. Contact damage is 1 for all four
  kinds. Only the husk's fists deal 2.
- Brand hits are measured with the in-game bot (`fight.js`) at L0, L1 and L2. The Rime is reached late (expect L1–L2).
- Regular enemies respawn on every room load. For a unique one, use `id: 'ri_u<n>', persistent: true` and 2–3× the cinders.

## Placement props

| prop | kinds | default | meaning |
|---|---|---|---|
| `facing` | all | random | `'left'` / `'right'` start facing (for a crawler this is also its first crawl direction) |
| `range` | frost_husk | 3 | beat: tiles left and right of the spawn that it patrols. It steps toward the Wickling only inside the beat |
| `reach` | frost_husk | 9 | how far ahead it notices the Wickling (tiles; vertical window 2.6 above / 1.2 below its feet). The spike line runs `reach − 2` tiles |
| `speed` | frost_husk, shard_crawler | 26 / 38 | px/s |
| `surface` | ice_spitter | auto | `'floor' / 'ceiling' / 'left' / 'right'` (`left` = the wall is on its left and it grows rightward). When omitted it picks the first solid side in the order floor, ceiling, left, right of its tile, then sits flush on it |
| `surface` | shard_crawler | auto | `'floor' / 'left' / 'right' / 'ceiling'` snaps it onto that surface (up to 1 tile away). It then crawls around every surface it reaches |
| `range` | shard_crawler | none | optional box: it never crawls more than `range` tiles from its spawn on either axis (it turns back at the edge) |
| `leash` | rime_wraith | 8 | tiles from its spawn it may roam (×0.6 vertically). It engages only while the Wickling is within leash + 3 tiles (horizontal) of its spawn |
| `hp`, `cinders`, `noDrops`, `id`+`persistent` | all | | generic, see docs/api/enemies.md §2 |

## Built-in safety (no extra work for the rooms builder)

- **Exit zones**: each opening's run (±1 tile) plus 3.5 tiles inward is off limits. S openings count as zones;
  wide N openings (> 8 tiles) do not.
  - Husks stop at the zone's edge, crawlers turn back at it, and the wraith never steers or blinks into it.
  - The husk's spike line stops at it.
  - **No attack starts while the Wickling stands in an exit zone**, so a player entering through a door always gets
    room to react. Verified for each kind: the player stood in the W door for 15 s with the enemy nearby, and there were no
    strikes and no projectiles.
- **Ledges and hazards**: husks never walk off ledges or into hazard tiles and never leave their beat. Crawlers never
  crawl onto or into hazard tiles (they look half a body ahead and turn). Verified with spike tiles on the floor and
  on a slab top.
- The wraith stays inside the room and its leash. Its blink spots are checked to be free of terrain, inside the room
  (≥ 0.6 tile margin), outside exit zones, and in line of sight of the Wickling. With no such spot it simply reforms
  where it is.
- Wall and ceiling spitters break off when killed, fall to the floor and melt.

## Placement advice

- **General spacing**
  - Keep markers **≥ 8 tiles from side entrances and from one-way drop landing spots** (the plunge and fall landings
    in ri_01, ri_03, ri_04 and ri_06). A player who has just fallen in must land in peace.
  - Keep hostiles **≥ 12 tiles from sconces and Lanternway posts** (a post refuses travel while a hostile is near the
    player).
  - Keep hostiles **≥ 10 tiles from NPCs** (Wren in ri_04, Sable in ri_08).
- **frost_husk**
  - Needs a flat floor run ≥ 2 × `range` + 2 tiles. It works on a 3-wide stair step with `range: 1`: it stops at the
    step's lips, and its spikes fizzle at the lip.
  - Headroom ≥ 3.5 tiles. The raised fists reach about 3.1 tiles above its feet; this is art only, but they would
    clip into a low ceiling.
  - Give the player ≥ 5 tiles of air above the floor where it stands so it can be jumped over. Getting behind it, or
    jumping the spike line and punishing the stuck fists, is the intended answer.
  - In pairs, ≥ 8 tiles apart.
  - Never on a segment shorter than 4 tiles. Never where the floor in front ends at a deadly pit that the player must
    cross while it slams.
- **ice_spitter**
  - Put the marker in the tile directly against its surface: the floor tile above the ground, the tile under a
    ceiling, or the tile beside a wall. Set `surface` explicitly when the tile touches two solids.
  - It needs line of sight and fires up to ~9 tiles. A floor spitter cannot shoot down at a player below its ledge.
    A ceiling spitter covers the floor below it in a wide cone.
  - Keep its firing line off a forced jump over a deadly gap. Covering the approach to a gap is fine; icicles are
    destroyable with the Brand.
- **rime_wraith**
  - Spawn it in open air (≥ 2 tiles from solid ground on most sides), 3–6 tiles above the floor. It drifts through
    ice and stone while hovering and stalking, half-faded inside terrain.
  - Its blink needs a free 1-tile-wide pocket beside the Wickling, so it suits corridors ≥ 4 tiles tall and open
    caverns.
  - Use `leash: 4–6` to keep it out of NPC, sconce and landing areas. Its engagement area is the spawn ± (leash + 3)
    tiles.
  - Two wraiths should be ≥ 10 tiles apart, so that only one blinks at a time.
- **shard_crawler**
  - Put it on a floor, a wall face (`surface: 'left'`/`'right'`) or under a ceiling (`surface: 'ceiling'`). Floating
    slabs make good loops.
  - Shards fly away from the surface it stands on: up and outward from a floor, down and outward from a ceiling, into
    the room from a wall.
  - Keep it off walls the player must grip-climb (the ri_01 chute, the ri_08 shaft). Use `range` there or a different
    surface.
  - On long corridor floors give it `range: 5–6` so it does not wander the whole room.

### Plan rooms (contents from the world plan)

| room | plan contents | suggestion |
|---|---|---|
| ri_01 The Frozen Stair (64×36) | frost_husk ×2, shard_crawler ×1 | Husks on two different 3-tile stair steps, `range: 1`, at least 2 steps apart. Not on the shelf under the plunge landing (cols 8–20). Not on the bottom step next to W1 (exit zone cols 1–4). Crawler on the west wall beside the stair (`surface: 'left'`, `range: 4`). Nothing on the chute walls (cols 51–56). |
| ri_02 The Rime Causeway (128×27) | ice_spitter ×2, frost_husk ×2, shard_crawler ×1 | Spitters on parapet tops (floor-mounted) at cols ~45 and ~90, each ≥ 3 tiles from a causeway gap lip. Husks on the longest causeway segments (≥ 8 tiles), `range: 2–3`, ≥ 10 tiles from W1/E1 and ≥ 3 tiles from the respawn points. Crawler `surface: 'ceiling'` above the middle of the causeway (col ~70), `range: 6`. |
| ri_03 The Long Cold (160×18) | frost_husk ×2, rime_wraith ×1, shard_crawler ×2 | Husks at cols ~60 and ~115, `range: 3` (≥ 12 tiles from the N1 landing at cols 40–43). Wraith at col ~90, row 11, `leash: 6`. Crawlers on the floor at col ~25 (`range: 5`, below the wings shelf, never on the shelf itself) and on the ceiling at col ~135 (`range: 6`; E1's exit zone keeps it clear of the door). |
| ri_04 The Frozen Lake (96×36) | rime_wraith ×2, frost_husk ×1 | Wren sits at col 56, lore at col 66, and the Lanternway post at col 84, so keep the east shore calm. Husk on the lake floor (row 24) at col ~40, `range: 3` (sight 9 tiles: the Frozen Fall landing at cols 26–29 and Wren stay out of reach). Wraiths over the western lake at cols ~32 and ~44, rows 17–20, `leash: 4`. Nothing on the far shore (sconce at col 8, the rest before Sable) and nothing on the N2 platform climb (cols 70–77). |
| ri_05 The Icebound Stair (64×27) | ice_spitter ×1 | The sconce is at col 34 and the way home (N1 platforms) at cols 20–23, so put it on a ledge in the east part (col ≥ 48), floor- or wall-mounted. Keep it off the line to the N1 platforms. |
| ri_06 The Glacier Gallery (128×18) | rime_wraith ×2, shard_crawler ×2 | Wraiths at cols ~40 and ~100, rows 10–12, `leash: 5` (the N1 landing at cols 78–81 stays ≥ 8 tiles outside their engagement areas). Crawlers on the floor at col ~25 (`range: 5`) and on the ceiling at col ~60 (`range: 6`). None in the secret ice cave (cols 114–126). |
| ri_08, hs_01, hs_02 | none | no enemies |

## Art notes

- Palette (`RI`): ice blues (`#a6d6ea` / `#74abc6` / `#3e6a86`) with near-white highlights, waxen Snuffed greys
  (`#7c889a`), dark blue-black outlines (`#0a1018`). Telegraphs use a warm gold (`#ffe6b0`), the region's only warm
  colour, so they read instantly against the cold.
- Every body is drawn procedurally with Canvas paths (`G.Art.char` shape/eyes helpers when present).
  - The husk's art is shifted 4 px so its hurtbox covers the bulk of the body. Its crystals and raised fists extend
    up to ~1.5 tiles beyond the box.
  - Deaths: the husk and the crawler melt into puddles. The spitter shatters (wall and ceiling spitters break off and
    fall first). The wraith unravels upward into frost smoke with drifting motes and leaves no puddle.
