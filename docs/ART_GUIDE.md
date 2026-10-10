# GUTTERLIGHT — Art Guide ("candle-noir")

For **level builders, enemy/boss/NPC builders and the UI**: how the procedural art works, what you
can ask it for, and the rules that keep ~80 rooms looking like one hand-made game.
API reference (signatures): `docs/api/art.md`. Contact sheets: `test-output/art/props.png`,
`test-output/art/characters.png`. Per-region lab renders: `test-output/art/<region>_<n>.png`
(`node tools/art_lab.js`).

---

## 1. Style rules

1. **Value structure first.** Far = light, hazy, low-contrast; near = dark, crisp. Gameplay
   terrain is the darkest mass with a **lit rim** on walkable tops. Nothing in the background may
   be as dark *and* as crisp as terrain, and nothing decorative may look like a ledge.
2. **Small warm lights in big darkness.** Every region has one accent light colour (amber, gold,
   ember, violet, cyan). Use it sparingly: windows, flames, glowing flowers, cocoons, grates.
3. **Silhouettes over detail.** Characters and props read as a strong shape with a dark outline
   (`Art.char.shape`, `outlineFill`) and a single rim on the lit side. Interior detail is subtle.
4. **Wax everywhere.** Drips on ceilings and bodies, melted rims, pooled puddles, candle stubs —
   the world is made of tallow.
5. **Motion is gentle.** Sway, flicker, drift, slow parallax. Fast motion is reserved for
   gameplay (slashes, sparks, enemies), which is what the player must read.
6. **Trust what you see.** Collision = tiles. The art keeps walkable edges within ~4 px of the
   tile edge; hazards (`^`, `%`, `~` without Oilcloak) always look dangerous; `X` glazed walls
   look glossy/smooth (no grip); `B` walls show cracks; `D` floors show glowing fissures.
7. **No `shadowBlur`/`filter` per frame, no allocation in hot loops** (TECH_SPEC §3). Glows come
   from `G.Art.glow` (cached sprite, additive).

## 2. Region palettes & map colours

`G.Art.palette(regionId)` returns these keys (plus derived ones: `outline darkness glaze glazeDeep
bgwall water waterDeep waterHi lava lavaHot lavaDeep crack fissure`). `darkness` is the tint the
engine's lighting uses for the darkness map. `G.Art.mapColor(id)` = `mapColor` (identical to the engine's `_regions.js` values).

| region | skyTop | skyBottom | far | mid | near | fill | edge | highlight | accent | light | fog | particle | mapColor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `shore` | `#121824` | `#6e788c` | `#56607a` | `#3a4254` | `#222833` | `#151a22` | `#6a7486` | `#e0dbcf` | `#ece2c6` | `#ffd9a0` | `#7c8598` | `#e0ddd4` | `#8a94a6` |
| `lastlight` | `#140d18` | `#8a5450` | `#4c3442` | `#33232e` | `#1d141b` | `#181116` | `#76545c` | `#ecc8a8` | `#ffb35c` | `#ffb868` | `#6e4a54` | `#f2caa0` | `#a8806e` |
| `guttered` | `#0a0705` | `#2e2016` | `#5a4430` | `#3c2d1f` | `#241a11` | `#17110c` | `#6e5236` | `#d8ae78` | `#eaa84a` | `#ffb45a` | `#6a5034` | `#ecd29c` | `#b08850` |
| `meltbloom` | `#090f0c` | `#3c4c3a` | `#56664e` | `#3a4836` | `#222b20` | `#141a12` | `#70845e` | `#ebe6c6` | `#f2c860` | `#ffd880` | `#5c6c50` | `#f6e2a2` | `#94ad7e` |
| `flue` | `#090505` | `#3a1a10` | `#3c2824` | `#2a1b18` | `#170f0d` | `#141010` | `#5e443a` | `#e0a882` | `#ff6a2a` | `#ff8a40` | `#4c2c22` | `#ffa060` | `#b8513c` |
| `nave` | `#05090e` | `#1a3440` | `#2a4450` | `#1c303a` | `#101c23` | `#0e161b` | `#4c6c76` | `#cadcd8` | `#ecc878` | `#f2d890` | `#2c4a54` | `#a8c8d4` | `#4f8fa3` |
| `chandlery` | `#090504` | `#3c2214` | `#4a3226` | `#33221a` | `#1e1410` | `#17110e` | `#7c5238` | `#f2b482` | `#ff8a20` | `#ffa040` | `#5a3420` | `#ffb868` | `#d0863a` |
| `mothwood` | `#07050c` | `#251b3a` | `#30264a` | `#221a36` | `#140f22` | `#100c18` | `#5c4c7e` | `#d6caee` | `#b890ff` | `#c8a8ff` | `#3a2c56` | `#dacaf2` | `#7b6ab4` |
| `rime` | `#060a10` | `#3a5268` | `#4a627a` | `#30445a` | `#1a2634` | `#121a24` | `#6a8aa4` | `#eaf6ff` | `#9ae0ff` | `#c8f0ff` | `#5a7490` | `#f0f8ff` | `#9fd2e4` |
| `sanctum` | `#030203` | `#1c150a` | `#2c2412` | `#1c170c` | `#0e0b06` | `#0d0b08` | `#8c7646` | `#fff4d8` | `#ffd870` | `#ffe8a8` | `#3a2e16` | `#fff0c4` | `#e2c46c` |

Region signatures (what each region file implements):

| region | backgrounds (parallax motifs) | terrain treatment | spikes / platforms | liquids | weather |
|---|---|---|---|---|---|
| shore | slate dusk sky, pale moon, ash dunes, **colossal fallen candle** on the horizon, broken pillars, grave stakes, a toppled statue | ash strata, pale ash drifts on floors, dead grass | ash shards / wood | grey-blue meltwater | falling ash |
| lastlight | dusk purple-brown sky, distant upper town, **the Last Brazier** on its mound, belltower, candle-stub houses with warm windows, pennant lines, lamp posts; cellars/well (`interior`/`shaft`) | cobbles, dusky grass, candle stubs, roots | iron fence spikes / wood | violet-grey | ash + a few embers |
| guttered | colossal aqueduct arches in amber haze, fluted pillars, ruined arcades with keystones, rows of **dead sconces**, stalactites, light shafts | fractured rock with courses, amber moss tufts, wax drips | iron / wood | murky green | dust motes |
| meltbloom | groves of **giant wax flowers** with glowing gold hearts, fronds, trellis arch, vine curtains, golden shafts | waxy soil, moss, grass, tiny wax flowers, leafy roots, wall vines | thorns / wax shelves | sage green | pollen + motes |
| flue | colossal **chimneys** with ember mouths & smoke plumes, pipe runs, brick piers with glowing **grates**, valve pipes, chains | sooty brick, soot-ash drifts with ember specks, soot streaks | iron (hot tips) / iron truss | dark slate; lava | embers + soot |
| nave | the **drowned cathedral** (spires, rose window), pointed **arcades** with pale-gold lancets, clerestory, near columns, a drowned bell, vault ribs, gold shafts | ashlar blocks, teal moss, water drips, long water stains | iron / stone | teal | **rain + splashes**, gold motes |
| chandlery | foundry: **vats**, furnaces with glowing mouths, gantry truss, **ladles pouring molten wax**, gears, mold racks, chains | riveted plates, spilled-wax drifts, glowing slag, rivets | iron (hot tips) / iron truss (molten glow) | **molten wax** (lava) | embers + heat motes |
| mothwood | endless **wick-reed** forest, a **giant resting moth** with eye-spots, glowing cocoons, silk threads | fibrous grain, lavender wick-fibres, violet glowing fungus, silk threads | thorns / silk-bound branches | dark violet | silk scales + violet motes |
| rime | **aurora** across the vault, ice-spire fields, **waxen frozen in ice**, broken columns, crystal clusters, icicle curtains | glassy ice with cracks, snow drifts, crystals, long icicles, frost | ice shards / icicle ledges | icy cyan | snow |
| sanctum | the **Everlantern's golden cage** around a radiant heart, crystal columns with gold collars, crystal arches, golden bars, radiant shafts | crystal facets, gold crystals floor & ceiling | crystal (glowing) / gold | liquid light (gold) | rising light motes |

## 3. Theme hints (`room.def.theme`)

Optional per-room object; anything omitted uses the region default. Changing the theme changes the
art cache key (rooms re-render).

| key | values | effect |
|---|---|---|
| `bg` | `'open'` (default for caverns) · `'interior'` · `'shaft'` · `'sky'` · `'none'` | background recipe. `open` = big cavern with deep parallax; `interior` = a back wall close behind (rooms, cellars, cathedral nave walls, greenhouse trellis, brick halls); `shaft` = vertical motifs (full-height pillars/chimneys/reeds, no ground horizon); `sky` = open sky (shore & lastlight have dedicated sky recipes and use it by default; flue drops its ceiling haze; other regions use their `open` recipe or a generic sky); `none` = flat gradient only (cutscene/boss rooms that draw their own backdrop). |
| `openTop` | bool (default: true when `bg:'sky'`) | top-row solid "lid" tiles over air are not drawn, so the sky shows. |
| `fg` | `false` · number (density ×) | foreground framing silhouettes off / scaled. Use `false` in boss arenas if they distract. |
| `decor` | `false` · number (density ×) | procedural decor off / scaled (hand-placed `decor` entities are unaffected). |
| `dressing` | `false` · `0` | no surface dressing (grass, drips, vines…) on terrain. |
| `weather` | `'none'` · `false` · kind string · array of specs | override weather. Kinds: `ash motes pollen embers rain silk snow light soot`; spec: `{kind, count, color}`. |
| `weatherDensity` | number | multiplies particle counts (e.g. `0.5` in tight tunnels, `1.5` for a storm). |
| `fog` | number | multiplies the region's fog-band alpha. |
| `vignette` | number 0..1 | vignette strength override. |
| `landmark` | `false` | leave out the region's signature background landmark (lastlight: the parallax Last Brazier on its mound; shore: the fallen candle on the horizon) in rooms that show the real one or stand next to it (`ll_01 ll_02 ll_03 sh_03`). Region recipes with a signature motif must honour `info.theme.landmark === false`. |
| `posts` | bool (default: true when `bg:'sky'` or `openTop`) | draw stilts under free one-way-platform ends that have no ceiling to hang from: a post down to the ground or a lower deck (≤ 10 tiles), knee braces. Region default: `terrain.platform.posts`. |

Examples:
```js
theme: { bg: 'shaft' }                         // the Well, Flue chimneys, vertical descents
theme: { bg: 'interior', weather: 'none' }     // Pell's shop interior / a dry cellar
theme: { bg: 'sky' }                           // Lastlight village, Shore, Ash Ridge
theme: { fg: false, decor: 0.5 }               // a busy boss arena
```
`bgSeed` (room def) varies all procedural art for the room deterministically.

## 4. Tiles → what the art draws

| tile | look |
|---|---|
| `#` solid | smoothed organic contour, deep dark fill with region texture, inner gradient/AO, lit rim on tops, faint edge lines, region dressing (moss, drips, vines, frost, rivets…) |
| `X` glazed | glossy sheen bands + bright specular line — reads as smooth, ungrippable |
| `=` platform | thin region ledge (wood, iron truss, stone, wax shelf, ice with icicles, silk-bound branch, gold) with ropes/chains to the ceiling or brackets into walls (sky rooms: stilts down to the ground, see `posts`); bright top lip |
| `^` spikes | region style (iron, thorns, ice, crystal, shards) auto-oriented away from the supporting solid |
| `~` water | translucent, region-tinted body, animated surface, shimmer, caustics |
| `%` lava | molten wax: hot gradient, drifting crust plates with glowing seams, bubbles, glow on nearby terrain, static lights |
| `B` breakable | matches the terrain but with visible crack networks and chips (attentive players spot it) |
| `D` dive floor | cracked floor with glowing fissures |
| `:` bg wall | dim interior back wall behind the play space (region texture; also in sky rooms, where it shows a cellar/culvert wall instead of open sky) |

**Secret pockets are veiled automatically.** Non-solid tiles that no room opening reaches (flood fill through
everything except `# X B D`; openings into a room marked `secret` do not count) and that touch a `B`/`D` tile are a
*hidden pocket* (`G.World.hiddenPockets`). The terrain draws each one as solid rock in the room's own style until a
`B`/`D` component next to it breaks (then it fades out for good; broken walls persist, so revisits start revealed);
it also fades while the player is inside the pocket (e.g. arriving through a secret doorway). Entities, liquids and
front decor anchored inside fade with it; the map leaves the pocket out until it is revealed. Only the crack network
gives it away: lights, glows, flames and pickup embers anchored inside are hidden with the veil (`G.lighting` dims
them by 1 − `G.Art.veilAlphaAt`). A builder who wants a glow hint places a small light *outside* the wall, at the
cracks (mw_08 does). Builders: just carve the pocket behind the `B`/`D` — no veil
entity needed. A sealed cavity with no `B`/`D` next to it is not veiled (scenery). Opt out per room with `veil: false`
in the room definition.

Liquid pools must be flat-topped with air above (TECH_SPEC §7.3); the art assumes it.

## 5. Decor

### 5.1 Procedural decor
Each region places decor deterministically from tile context (floors, ceilings, walls, bg walls):
drips, chains, lanterns, webs, cocoons, vine curtains, candles, rubble, statues, glow-caps, flowers,
reeds, grates, vats… Rules: decor is never placed on breakables, next to hazards/platforms, or so
that it could be mistaken for a ledge; big props are dimmed (`dim`) to sit back. Lit decor
contributes to `G.Art.staticLights(room)`.

### 5.2 Hand-placed props (`decor` entity / `G.Art.drawDecorProp`)
Place with a `decor` entity: `{ type: 'decor', kind: 'brazier', flip: false, scale: 1, layer: 'back' }`
(x,y = tile; the prop's **foot** sits on the tile bottom, ceiling props hang from the tile top).
Entity builders call `G.Art.drawDecorProp(ctx, kind, footX, footY, opts, t)` and, for lit props,
register `G.Art.propLights(kind, x, y, opts)` with `G.lighting.add` each frame.

Common opts for every prop: `scale` (1), `flip` (bool), `seed` (variation), `dim` (0..1: push into
the background), `region` (palette/material source; defaults to the current room's region), `lit`,
`flame` (`blue orange red white violet gold pale`), `len` (hanging props: chain/thread length, px).
Size = footprint in tiles (w×h). "where" = anchor.

| kind | size | where | lit | best regions | description | opts |
|---|---|---|---|---|---|---|
| `statue_waxen` | 2×4 | floor |  | shore, guttered, nave, meltbloom, sanctum | Robed waxen statue on a plinth, staff raised; melted at the shoulders. | variant 0..2 (0 staff, 1 praying, 2 headless), material "stone"\|"wax"\|"gold" |
| `banner` | 1×3 | ceiling |  | guttered, nave, lastlight, sanctum | Hanging cloth banner on a rod with a candle-flame sigil; tattered hem. | len (px, default 110), color (hex), torn (bool) |
| `bell_great` | 3×3 | ceiling |  | nave, guttered | Colossal bronze bell on a yoke with a heavy clapper (the Bell-Warden's motif). | len (chain px above the yoke, default 0) |
| `bell_small` | 1×1.2 | ceiling |  | nave, lastlight, guttered | Small hand bell on a short chain. | len (chain px, default 16) |
| `brazier` | 1×1.6 | floor | yes | lastlight, guttered, flue, chandlery, nave | Iron fire bowl on a tripod; burning coals and a tall flame. | lit (default true), flame kind |
| `candelabra` | 1×2 | floor | yes | nave, sanctum, lastlight, guttered | Three-armed standing candelabrum with melting candles. | lit, flame, material "iron"\|"gold" |
| `candle_cluster` | 1×0.7 | floor | yes | guttered, lastlight, nave, shore, chandlery, sanctum | A puddle of fused candles of varied heights; some lit. | lit (all), count (3..6) |
| `sconce_dead` | 0.6×1.4 | floor |  | guttered, nave, shore, rime | A street sconce post with a snuffed candle (the Guttered Ways' rows of dead lights). | lit (default false — a lit one is a rare sign of life) |
| `cage_hanging` | 1×2 | ceiling |  | guttered, flue, chandlery, mothwood, sanctum | Domed birdcage on a chain; empty, or holding a dim ember. | len (chain px, default 30), ember (bool) |
| `chain` | 0.3×3 | ceiling |  | guttered, flue, chandlery, nave, sanctum | A hanging iron chain, optionally ending in a hook. | len (px, default 120), hook (bool) |
| `cocoon` | 1×2 | ceiling |  | mothwood | Silk cocoon hanging from a thread; a faint violet pulse inside. | len (thread px, default 22), glow (bool, default true) |
| `mold_stack` | 1.2×1.2 | floor |  | chandlery, lastlight | Stacked iron candle molds, wax-splattered. | - |
| `vat` | 3×2.5 | floor | yes | chandlery, flue | Great iron vat of molten wax with a glowing rim, riveted bands and a spout. | lit (molten glow, default true) |
| `pipe_v` | 0.8×4 | floor |  | flue, chandlery | Vertical iron pipe with flanges and a valve wheel; leaks a little steam. | len (px, default 160), steam (bool) |
| `crystal` | 1.2×1.5 | floor |  | sanctum, rime, mothwood | Cluster of faceted crystals with an inner glow. | color (hex), glow (default true) |
| `frozen_waxen` | 1.5×2.5 | floor |  | rime | A waxen frozen mid-step inside a block of ice; its wick is dark. | variant 0..1 (pose) |
| `stained_window` | 2×4 | floor | yes | nave, sanctum | Tall lancet window of pale-gold stained glass depicting a flame; glows. | lit (default true), color (glass hex) |
| `lamp_post` | 0.6×3 | floor | yes | lastlight, shore, flue, nave, rime | Iron lamp post with a caged candle lantern. | lit (default true), flame, h (px, default 118) |
| `house_stub` | 3×4 | floor | yes | lastlight | A candle-stub house: a squat melted candle hollowed into a home, with a snuffer-cap roof and warm windows. | lit (windows, default true), variant 0..2 |
| `well_frame` | 3×3 | floor |  | lastlight, shore | A stone well with a wooden crossbeam, crank and a hanging bucket (the Well down to the Guttered Ways). | - |
| `signpost` | 1×2 | floor |  | shore, lastlight, guttered, rime | Leaning wooden signpost with two arrow boards (blank runes). | - |
| `wick_grave` | 0.8×1.2 | floor |  | shore, guttered, rime, mothwood | Grave marker of the waxen: a stone slab with a snuffed iron wick-stake. | variant 0..1 |
| `flower_giant` | 2×5 | floor | yes | meltbloom | Giant wax flower on a curved stem; its heart glows gold. | lit (heart glow), h (px, default 190) |
| `vine_curtain` | 2×3 | ceiling |  | meltbloom, mothwood, nave | A curtain of hanging vines with leaves (silk strands in the Mothwood). | len (px, default 120), silk (bool) |
| `anvil` | 1.2×1 | floor |  | lastlight, chandlery, flue | Smith's anvil on a tree-stump block. | - |
| `cart` | 3×1.8 | floor |  | lastlight, chandlery, flue, guttered | Two-wheeled hand cart loaded with wax blocks. | - |
| `bookshelf` | 2×3 | floor |  | lastlight, nave, sanctum | Tall shelf of tomes, scrolls and a stray candle. | - |
| `fountain` | 3×3 | floor |  | nave, meltbloom, lastlight, sanctum | Basin fountain with a weeping waxen figure; trickles of water. | - |
| `arch` | 3×4 | floor |  | nave, guttered, sanctum, shore | Freestanding stone archway with keystone (background architecture; use layer "back"). | broken (bool) |
| `rubble` | 1.5×0.6 | floor |  | shore, guttered, nave, flue, chandlery, rime, lastlight | A low pile of broken bricks and stone. | - |
| `lantern_hanging` | 0.6×2 | ceiling | yes | lastlight, guttered, chandlery, mothwood, nave, flue | Caged lantern on a chain. | len (chain px, default 40), lit, flame |
| `grate_glow` | 1.5×1 | floor | yes | flue, chandlery | Furnace vent grate in a brick frame, ember light seeping out. | lit (default true) |
| `pew` | 3×1.2 | floor |  | nave, sanctum | Long wooden pew with a carved end. | - |
| `column_broken` | 1×3 | floor |  | shore, guttered, nave, rime, sanctum | Broken fluted column on a square base. | h (px, default 100) |
| `crate` | 1×1 | floor |  | lastlight, flue, chandlery, guttered | Wooden crate with iron corners (stack two with variant 1). | variant 0..1 |
| `reeds` | 1×2.5 | floor |  | mothwood, meltbloom, shore | Clump of tall wick-reeds with dark seed-wicks (ember tips in the Mothwood). | ember (bool) |
| `mushroom_glow` | 0.8×0.7 | floor | yes | mothwood, guttered, meltbloom, nave | Cluster of glowing wax-caps (violet in the Mothwood, amber elsewhere). | color (glow hex) |
| `grass_clump` | 0.6×0.4 | floor |  | meltbloom, shore, lastlight, mothwood, guttered, nave | Small clump of grass / wax fibers (use layer "front" for foreground sway). | color (hex), h (px) |
| `ice_spire` | 1×2.5 | floor |  | rime | Standing spire of blue ice with a pale core. | - |
| `bones` | 1.2×0.5 | floor |  | shore, guttered, mothwood, rime, flue | Remains of a guttered waxen: a melted puddle, a slumped husk and a black wick. | - |
| `stalagmite` | 0.8×1.6 | floor |  | guttered, rime, mothwood, shore | Dripping wax stalagmite rising from the floor. | h (px, default 60) |
| `web` | 1.5×1.5 | ceiling |  | mothwood, guttered, rime | Silk web strung beneath a ceiling (anchor at the ceiling). | - |
| `drip` | 0.2×2 | ceiling |  | guttered, nave, rime, chandlery, meltbloom | Animated falling drop from a ceiling (water/wax); fall distance opts.fall. | fall (px, default 120), color (hex) |
| `gear` | 2×2 | floor |  | chandlery, flue | Large cog on an iron mount (slowly turning). | spin (bool, default true) |
| `ladle` | 1×3 | ceiling |  | chandlery | Giant pouring ladle hanging from a chain, dripping molten wax. | len (chain px, default 50) |
| `cage_bars` | 2×5 | floor |  | sanctum | Section of the Everlantern's golden cage: curved bars with a ring. | - |
| `altar` | 2×1.5 | floor | yes | sanctum, nave, lastlight | Draped stone altar crowded with votive candles. | lit, flame |

```js
// in a decor/interactable entity draw():
G.Art.drawDecorProp(ctx, 'lamp_post', this.cx, this.bottom, { h: 120, flip: this.props.flip }, t);
// lights for lit props (call every frame, e.g. in update):
for (const L of G.Art.propLights('lamp_post', this.cx, this.bottom, { h: 120 })) G.lighting.add(L);
```

## 6. Character helpers (`G.Art.char`)

Use these so the Wickling, the Snuffed, NPCs and bosses share one visual language. Full signatures
in `docs/api/art.md`. All draw in the caller's (world) transform; `t` = seconds.

**Body recipe (any waxen):**
```js
const C = G.Art.char;
C.shadow(ctx, x, feetY, 20);                                 // contact shadow
const b = C.waxBody(ctx, x, feetY, 30, 46, {                 // returns {top, topW, cx, w, h, path}
  variant: 'candle',          // candle | stub | taper | pillar | slumped | round
  color: C.COLORS.ivory,      // ivory (Wickling/NPCs), snuffed (enemies), blackWax (Sable), gold (Lucerne)
  drips: 3, seed: 7, lean: vx * 0.01, squash: 1 + land * 0.15, light: -1, rim: '#bfe4ff' });
C.eyes(ctx, b.cx + facing * 2, b.top + b.h * 0.32, { kind: 'slit', size: 11, gap: 10,
  blink: C.blinkAt(t, seed), look: facing * 1.5 });
const tip = C.wick(ctx, b.cx, b.top + 2, { len: 7, bend: -facing * 1.5 });
G.Art.flame(ctx, tip[0], tip[1] + 1, 22, 'blue', t, seed, { lean: -vx * 0.02 });
```
or the one-call convenience: `C.waxen(ctx, x, feetY, w, h, { flame: 'orange', eyes: { kind: 'round' }, facing }, t)`.

**Conventions**
- Outline: `C.COLORS.outline`, `lw` 2 px at 1× (bosses 3 px). Light comes from the upper left
  (`light: -1`) unless a local light source suggests otherwise; rim colour = the light's hue.
- Eyes: Wickling `slit` (black); NPCs `round`/`slit`; the Snuffed `pinprick` (white, `glow: true`);
  moldlings/forge things `ember`; empty husks `hollow`.
- Flames: player `blue`; NPCs `orange`; Bramm `red`; Thrum dim `orange` small; Lucerne `gold`;
  moths/Vespertine `violet`; frozen/ghostly `pale`; holy/white-hot `white`. Snuffed have no flame:
  use `C.pallSmoke(ctx, tipX, tipY, t, { count: 5, height: 60 })` from a dead wick.
- Cloth/scarves (verlet): `const s = C.cloth.create(4, 9)` once; per frame
  `C.cloth.update(s, anchorX, anchorY, dt, { gravity: 420, wind: -vx * 3 })`, then
  `C.cloth.draw(ctx, s, { width: 10, color: C.COLORS.scarf })`; on teleport/room change call
  `C.cloth.reset(s)` (it re-initialises at the next anchor).
- Trails: `const tr = C.smokeTrail.create(24)`; `emit` while moving, `update(tr, dt)`, `draw(ctx, tr)`.
- Combat FX: `C.slash(ctx, x, y, r, angle, p, { arc: 2.4, width: 16 })` (white-blue crescent; p 0→1 over
  ~0.12 s), `C.hitSpark(ctx, x, y, p, { size: 28 })`, `C.ring(ctx, x, y, R, p, { width: 8 })`
  (shockwaves), `C.puddle(ctx, x, floorY, p, { wick: true })` + `C.pallSmoke` for deaths,
  `G.Art.glow(ctx, x, y, r, color, a)` for any additive halo.
- Custom silhouettes (bosses, moths): build a `Path2D` and call
  `C.shape(ctx, path, { fill, box: [x0,y0,x1,y1], rim, light: -1 })` — fill, form shading,
  rim light and outline in one call.

## 7. Do's and don'ts for content builders

**Do**
- Pick `theme.bg` per room: `shaft` for vertical rooms, `interior` for enclosed rooms, `sky` only
  where the sky is really visible (shore, lastlight, flue chimney-tops).
- Use `X` (glazed) wherever a wall must not be climbable — it is visibly glossy.
- Keep at least one light source in dark rooms (lit props, `light` entities, glowing decor); the
  player's flame alone is lonely in regions with darkness ≥ 0.6 (flue, mothwood).
- Use `bgSeed` to vary neighbouring rooms that share a shape.
- Hand-place landmark props (statues, bells, stained windows, braziers, vats) at story beats;
  let procedural decor do the clutter. Where a real landmark prop duplicates the region's background
  landmark motif, set `theme.landmark: false`.
- Hide secrets by simply walling them off with `B`/`D` (auto-veil, §4); use `:` for enclosed
  cellars/culverts in sky rooms so they don't show open sky.
- Use `dim` (0.3–0.5) for big props that should read as background.

**Don't**
- Don't place decor props (or `light` entities) where they look like a ledge or a hazard that
  isn't one; don't put solid-looking props in front of the play space (`layer: 'front'` is for
  grass, small clutter and things that are clearly in front).
- Don't draw with `shadowBlur`/`filter`, or allocate gradients/canvases per frame; cache in your
  entity (`Art.char` helpers are already cheap).
- Don't recolour terrain from entity code; ask for a theme hint or a region option instead.
- Don't use pure white or pure black fills on characters: use `C.COLORS` and the region palette.
- Don't make enemies the same value as the background: the Snuffed are cold grey-blue with
  bright pinprick eyes so they read in every region.

## 8. Performance notes

Measured in the lab (`node tools/art_lab.js --perf`; headless Chromium with SwiftShader software
rasterization, so real GPU-backed canvases are faster): per frame at 1280×720 — `drawTerrain`
≈ 0.5–0.6 ms, decor + atmosphere ≈ 1.1–1.8 ms, `drawBackground` ≈ 1.6–3.1 ms; `prepareRoom` for a
128×54 room ≈ 170–200 ms (remaining terrain chunks render lazily, one per frame, nearest first).
Static glows (backdrop, far layers, large halos) are baked into the prerendered layers; only small
near glows animate.
