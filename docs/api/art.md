# `G.Art` — API reference (module: art)

Files: `src/art/art.js` (core, palettes, glow/flame, caches, entry points), `terrain.js`,
`background.js` (parallax, foreground, atmosphere), `characters.js` (`G.Art.char`), `props.js`
(prop catalog + procedural decor), `regions/<id>.js` (one `Art.defineRegion` per region).
Style rules, theme hints, the full prop catalog and character recipes: **`docs/ART_GUIDE.md`**.

All entry points are wrapped: they **never throw** (errors go to `G.reportError` once per message)
and always restore `ctx` state. Everything is deterministic per room (seed = hash of
`room.id + ':' + (def.bgSeed || 0)`). No file touches the DOM at load time.

## Engine interface (TECH_SPEC §12)

```js
G.Art.prepareRoom(room)                       // build caches (idempotent; LRU keeps 6 rooms / pixel budget). Returns cache or null.
G.Art.onTilesChanged(room, c0, r0, c1, r1)    // after breakables break (inclusive tile rect); rebuilds affected chunks.
                                              // (Tile edits that bypass this are detected on the next prepareRoom.)
G.Art.drawBackground(ctx, room, cam, t)       // screen space: sky, backdrop, parallax layers, light shafts
G.Art.drawBackDecor(ctx, room, cam, t)        // world: bg walls (':' tiles) + back decor
G.Art.drawTerrain(ctx, room, cam, t)          // world: prerendered 512px chunks (terrain, spikes, platforms, glazed) + secret-pocket veils
G.Art.drawBreakables(ctx, room, cam, t)       // world: live B / D components (skips broken ones)
G.Art.drawLiquids(ctx, room, cam, t)          // world: water & lava (draw after entities)
G.Art.drawFrontDecor(ctx, room, cam, t)       // world
G.Art.drawForeground(ctx, room, cam, t)       // screen: dark framing silhouettes (fade out of the centre)
G.Art.drawAtmosphere(ctx, room, cam, t)       // screen: fog bands, weather particles, rain splashes, vignette + grade
G.Art.updateAtmosphere(room, cam, dt)         // advance weather + secret-pocket veil fades (weather self-drives from drawAtmosphere if never called)
G.Art.veilAlphaAt(room, x, y) → 0..1          // veil opacity over a world point (render.js fades entities anchored there)
G.Art.staticLights(room) → [{x, y, r, color, intensity, flicker}]   // world px; read-only cached array
G.Art.palette(regionId) → { skyTop, skyBottom, far, mid, near, fill, fillDeep, edge, highlight, accent,
                            light, fog, particle, mapColor, darkness, outline, glaze, glazeDeep, bgwall,
                            water, waterDeep, waterHi, lava, lavaHot, lavaDeep, crack, fissure }
G.Art.mapColor(regionId) → '#rrggbb'
```
`cam` = `{x, y, w, h}` (top-left in room px). Unknown region ids fall back to the neutral `test`
region. `room` needs only the §7.3b fields (`id, def, regionId, cols, rows, tiles, widthPx, heightPx`).

## Secret pockets (auto-veil)

`G.World.hiddenPockets(def) → {cols, rows, index, pockets:[{id, tiles, c0, r0, c1, r1, comps}]}` (engine, pure, cached
per definition) finds the secrets: non-solid tiles connected to no opening (flood fill treats `# X B D` as walls;
openings into a room with `def.secret` — set by roomkit from the plan — do not count) that touch a `B`/`D` tile.
`G.World.pocketRevealed(pocket, room)` is true once an adjacent `B`/`D` component is broken in that live room.
The art (`terrain.js`, built at `prepareRoom`, ~40–110 ms per room with pockets, behind the transition fade) renders one
veil sprite per pocket: the area's terrain re-rendered with the pocket filled (same seed/style), kept only over rock and
the pocket (air, platforms, liquids around it are cut away), opaque within 24 px of the pocket and feathered over the
next ~`deepEnd` px into the real terrain. It is drawn right after the chunks, before breakables (their cracks stay on
top) and entities. Alpha: 1 → 0 at 1.6/s once revealed (persistent), → 0 at 4/s while the player overlaps the pocket,
back to 1 at 2.5/s when they leave; a new room instance snaps. Entities (centre), liquid surfaces and front decor
anchored in a pocket are faded by the same alpha; lights and particles are not (a faint glow is the intended hint).
`src/ui/map.js` treats unrevealed pockets as solid. Opt out: `def.veil: false`.

## Drawing helpers for entity code

```js
G.Art.glow(ctx, x, y, radius, color, alpha)        // cached additive radial glow (respects ctx.globalAlpha)
G.Art.flame(ctx, x, y, size, kind, t, seed, opts)  // animated flame; (x,y) = base (wick tip), size ≈ height px
   // kind: 'blue'|'orange'|'red'|'white'|'violet'|'gold'|'pale'; opts {glow 0..1 (1), lean px, noGlow}
G.Art.FLAMES                                       // flame colour definitions by kind
G.Art.dotSprite(color, hard) → canvas              // 32px soft (or hard) dot for particles
G.Art.drawDecorProp(ctx, kind, x, y, opts, t)      // x,y = foot (ceiling props: hang point)
G.Art.propLights(kind, x, y, opts) → lights[]      // lights for lit props (feed to G.lighting.add each frame)
G.Art.propInfo(kind) → {kind, size:[w,h] tiles, anchor:'bottom'|'top', regions, desc, opts, lit, light} | null
G.Art.propKinds() → string[]                       // 47 kinds (see ART_GUIDE §5.2)
G.Art.defineProp(kind, { size, anchor, bounds, regions, desc, opts, lit, flame, sway, draw(ctx,o,R), anim?(ctx,o,t), light?(o) })
G.Art.materials(regionId) → { stone, stoneDark, stoneLight, wood, woodDark, woodLight, iron, ironLight, rust,
                              wax, waxShade, waxDark, cloth, clothDark, gold, goldLight, glass, leaf, leafLight,
                              bone, ice, crystal, silk, soot, ... }
```
Prop opts common to all kinds: `scale, flip, seed, dim (0..1), region, lit, flame, len`; per-kind
opts in the catalog. Props are rendered once into cached sprites keyed by their opts, so drawing is
a blit (+ cheap sway/flicker animation).

Example (decor entity):
```js
draw(ctx, t) {
  G.Art.drawDecorProp(ctx, this.props.kind, this.cx, this.bottom,
    { flip: !!this.props.flip, scale: this.props.scale || 1, seed: this.props.tx * 31 + this.props.ty }, t);
}
update() { for (const L of this.lights) G.lighting.add(L); }   // this.lights = G.Art.propLights(...) cached in init()
```

## `G.Art.char` — shared creature helpers

```js
const C = G.Art.char;
C.COLORS                // ivory/ivoryShade/ivoryHi, snuffed*, blackWax*, gold*, outline, pall, scarf, scarfShade, iron, brandHot, eye, eyeGlow
C.VARIANTS              // body variants: candle stub taper pillar slumped round
C.waxBody(ctx, x, feetY, w, h, opts) → {top, topW, cx, w, h, path}
   // opts {variant, color, shade, hi, outline, lw, drips 0..5, seed, lean px, squash, light -1|1, rim, taper, melt}
C.eyes(ctx, x, y, opts)  // {kind slit|round|pinprick|ember|hollow, size 9, gap 9, color, blink 0..1, look px, tilt, glow, alpha}
C.blinkAt(t, seed, every) → 0..1
C.wick(ctx, x, y, opts) → [tipX, tipY]   // {len 7, bend, width 2, color, ember, curl}
C.waxen(ctx, x, feetY, w, h, opts, t)    // body + eyes + wick + flame; opts = waxBody opts + {eyes|false, flame kind|null, flameSize, wickLen, facing, lit}
C.flame(...) / C.glow(...)               // aliases of G.Art.flame / G.Art.glow
C.pallSmoke(ctx, x, y, t, opts)          // stateless rising wisps {count 5, color, alpha .35, height 60, spread 14, size 6, speed .5, seed, drift}
C.smokeTrail.create(max) → tr; .emit(tr, x, y, {rise 24, life 1.2, size 5, vx, jitter 4, color, alpha}); .update(tr, dt); .draw(ctx, tr)
C.cloth.create(n, segLen) → c; .update(c, ax, ay, dt, {gravity 520, wind, damping .9, iterations 3, lift});
C.cloth.draw(ctx, c, {width 10, tip .55, color, shade, outline, lw 2, tatter, wave}); .reset(c)
C.outlineFill(ctx, path, fill, outline, lw)
C.rim(ctx, path, {color, box:[x0,y0,x1,y1], light, width 2.5, alpha .85, top .5})
C.shape(ctx, path, {fill, outline, lw 2, light -1, shade .35, rim, rimWidth, hi, box})   // fill + form shade + rim + outline
C.slash(ctx, x, y, r, angle, p, {arc 2.5, width 14, color '#8fd8ff', core '#fff', alpha, flip})
C.hitSpark(ctx, x, y, p, {size 26, color, tint, rays 7, seed, angle})
C.ring(ctx, x, y, R, p, {width 6, color '#cfe8ff', alpha, fill})
C.shadow(ctx, x, y, halfWidth, alpha)
C.puddle(ctx, x, floorY, p, {color, w 24, wick})
C.drip(ctx, x, y, len, {color})
```
Recipes and colour conventions (Wickling, Snuffed, NPCs, bosses): ART_GUIDE §6.

## Region definitions (for whoever adds/tunes a region)

`G.Art.defineRegion(cfg)` (called by `src/art/regions/<id>.js` at load):
```js
{ id, name,
  palette: { ...TECH_SPEC keys, darkness, water, waterDeep, lava, lavaHot, lavaDeep },
  materials: { stone, wood, iron, wax, gold, leaf, ice, crystal, silk, ... },  // prop/platform colours
  theme: { bg: 'open' },                                    // region default theme hints (incl. landmark:false, posts — ART_GUIDE §3)
  terrain: { texture: {type: noise|bricks|rock|blocks|plates|strata|fibers|facets|ice|wax|cobble, ...},
             texStrength, ramp: [[distPx, color]...], rimWidth, rim, rimSide, rimBottom, rimColor,
             floor: [dressing], ceiling: [dressing], wall: [dressing],   // types: grass tufts pebbles drift flowers crystals drips roots streaks frost rivets vines candles custom
             spikes: {type: iron|thorns|ice|crystal|shards, color, color2, tip, glow},
             platform: {type: wood|iron|stone|wax|ice|branch|gold, top, color, glow, posts},   // posts: stilts (default: sky rooms)
             glaze: {color, deep, sheen}, lavaGlow },
  liquids: { water: {top, mid, deep, alphaTop, alphaMid, alphaDeep}, lava: {hot, color, deep} },
  decor: [ { kind | [kinds], where: floor|ceiling|wall|wallL|wallR|bgwall|air, chance, gap (tiles), width, height,
             dim, layer: 'back'|'front', fitLen: [minPx, fractionOfHeadroom], opts: {} | (rng, c, r, tile) => ({}),
             test(tile, c, r, room), max, scale, jitter, lights } ],
  weather: [ {kind: ash|motes|pollen|embers|rain|silk|snow|light|soot, count, color} ],
  fog: {alpha, color}, vignette, grade: {top, topA, bottom, bottomA},
  fg: { kinds: [grass rock pillar chain vines reeds pipe icicles crystal flower beam silk], density },
  bg: { recipe(theme, info) → { sky: {top,bottom,gy,gr,glowColor,glowA} | fn(ctx,w,h,rng),
                                skyGlows: [{x,y (0..1), r, color, a}],
                                layers: [{ f (parallax), fy, lowres, haze, hazeColor, fog:{alpha,h,top,topH,color},
                                           shade:{top,bottom}, rim:{color,alpha,width}, bands:[[y0,y1]...],
                                           draw(ctx, w, h, rng, info) }],     // info.addGlow(x,y,r,color,a,flicker)
                                shafts: [{x, f, w0, w1, slant, color, alpha, after, speed, phase}] } } }
```
Silhouette kit for recipes: `G.Art.BG.kit` (`ridge ridgeY pillar arches arcade spire roseWindow house
chimney pipe chain vat reed flower frond cocoon iceSpire statue cageBars crystal stalactites shaft
glowSpot moon stars rockWall brickWall wrap grad`).

## Diagnostics

```js
G.Art.cacheOf(room)      // the room's art cache (prepares if needed); cache.timing has per-stage ms
G.Art.cacheStats()       // {rooms, megapixels, ids}
G.Art.clearCaches()      // dispose everything (e.g. quit to title)
G.Art.regionIds(), G.Art.hasRegion(id), G.Art.region(id)
```
Lab: `tools/art_lab.html` (open in a browser; keys switch region/room) and
`node tools/art_lab.js [--regions a,b] [--sheets] [--perf] [--nolight]` → `test-output/art/`.

## Performance (lab, headless Chromium + SwiftShader, 1280×720)

| stage | per frame |
|---|---|
| drawTerrain | 0.5–0.6 ms |
| drawBackDecor + drawFrontDecor + drawAtmosphere | 1.1–1.8 ms |
| drawBackground | 1.6–3.1 ms (software raster; large static glows are baked at build time) |
| drawLiquids / drawBreakables | ~0.7 / ~0.2 ms (only when on screen) |
| prepareRoom 128×54 | 168–197 ms (initial chunks within a 30 ms budget, rest lazily one per frame) |
