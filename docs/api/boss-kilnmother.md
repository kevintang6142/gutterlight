# THE KILN MOTHER — Warden of the Forge (module `boss-kilnmother`)

Second Warden (Chandlery). A colossal furnace-bodied waxen rooted at her forge: an iron kiln for a body, a molten core
behind a riveted chest grate, a mantle of poured tallow, an iron crucible-hood with ember eyes and a lit wick, ladles
for hands and a flue pipe smoking on her back. She cannot stop pouring: before the fight she stands with her head
bowed, pouring a thin molten stream at her feet. Arena `ch_09` "The Kiln Heart". Her defeat (`boss:kilnmother`) grants
the Seal of the Forge + 300 cinders (both automatic, `G.Boss`), opens the arena gate and leaves her cold husk at the forge.

| File | What |
|---|---|
| `src/entities/bosses/kilnmother.js` | boss class (`G.Boss.register('kilnmother', …)` → `boss_kilnmother`), minion kind `kiln_moldling`, projectiles `kiln_wave` / `kiln_slag`, hazard entity `kiln_heat`, room script `kiln_forge`, 21 sfx (`kiln_*`, `mold_*`), test hooks `G.KilnMother` |
| `src/data/arenas/kilnmother.js` | room `ch_09` — **generated**, do not edit by hand |
| `tools/gen/arena_kilnmother.js` | the generator (`node tools/gen/arena_kilnmother.js [--print]`) |
| `test-output/boss-kilnmother/test.js` | fairness & robustness tests + contact sheets (`dev.js`: pose sheets) |

## Numbers

| | |
|---|---|
| HP | 620 (DESIGN). Expected Brand level **2** (13 dmg): 48 body hits, ~40 when phase-2 hits land on the open core; L1 (9): 69 / ~58. Measured (dodge-and-strike bot with 0.2 s reactions, 6 masks, no god mode, 2 runs of 4): L2 8/8 won in 82–150 s with ~40 hits (13–17 on the core), 0–3 masks lost; L1 8/8 won in 149–207 s with ~62 hits, 1–4 masks lost |
| Phases | phase 2 at 50 %: `grate` transition (uninterruptible, 2.1 s): she clutches her chest, the grate bursts open (flash, `kiln_grate`, `G.Audio.musicLayer(1)`), roar. Then: the core is exposed, rests ×0.74, faster wind-ups, doubled waves / sweeps, 5 gobs, two heat sets, 2 moldlings per call, new attack `breath` |
| Core | Brand/bolt hits whose rect overlaps the core (chest porthole, 104×104 around it) deal **×1.5** while the grate is open (phase 2) or while she is staggered. White-hot spark ring + `kiln_core` sfx on a core hit |
| Stagger | after 150 damage (not during `grate`): she slumps forward on her ladles for 2.3 s, the core sinks within reach of a standing slash |
| Damage | 1 for everything (body contact, waves, stream, gobs, heat, sweep, slam, jet, moldlings) |
| Body | 220×300 px, rooted: never moves (front face at x 2040 in ch_09, 40 px past the east deck's end). Contact = the furnace and skirt (box inset 12, top 60 px excluded); her head (hurtbox +20 px up) can be pogoed. She turns (0.35 s shudder) if the player gets behind her |
| Rest | 0.5–0.95 s between attacks (×0.74 in phase 2) |
| Music / reward | `keeper` (automatic), 300 cinders + Seal of the Forge (automatic), stinger `boss_defeated` |
| Moldlings | `kiln_moldling`: HP 9 (one Brand hit from L1), contact 1, no drops, cap **3** alive. Spat from the vents hanging from the vault over her back in an arc over her shoulders onto a **ringed spot** in front of her (deck or floor, harmless in flight and while forming 0.5 s), crawl at 74–92 px/s, lunge after a swelling gurgle (0.45 s, 280 px/s hop), harmless for 0.4 s while slumped after a lunge, walk off a deck (committed to the nearer end, or the end toward the player) when the player is below |

## Attacks (wind-ups ≥ 0.48 s; combo follow-ups ≥ 0.45 s)

| Attack | When | Telegraph | Active | Dodge | Punish |
|---|---|---|---|---|---|
| `pour` | any range (favoured > 260 px) | great ladle raised high + furnace gurgle, 0.64 s (P2 0.55) | ladle tips: a molten stream falls 260–295 px in front of her (burns while pouring), a molten wave (50×60, 380 px/s; P2 430) rolls out along the floor; P2: a second wave 0.95 s later | jump the wave (or be on a deck); stand clear of the stream column; between her front and the stream the waves cannot reach you | ~0.6 s sag |
| `lob` | any (favoured > 300 px) | ladle dipped to her chest, scoop 0.58 s (P2 0.5) | 3 (P2 5) slag gobs 150 px apart around the player (one on them), ~1 s flight; each spot shows a glowing ring from the throw; gobs are harmless in flight, the splash (60×36) burns | step into a gap between rings (75 px from each) | ~0.5 s |
| `heat` | open floor in front ≥ 352 px; cooldown 5.5 s | stokes the furnace (mouth blazes, rising drone) 0.5 s, stamps | 160-px floor sections every 320 px (one on the player) glow 0.95 s (P2 0.82) then flare 0.5 s, 104 px high (below the decks); P2: the complementary set warns 1.05 s, starting 0.95 s later | walk to a dark section / onto a deck; P2: wait for the first flare to end, then move into its burnt-out section | her whole stamp + sag |
| `sweep` | player on the floor < 250 px from her front | ladle drawn back behind her, grinding scrape, 0.56 s (P2 0.52) | ladle skims the floor in front (270 px, 84 px high) with a fan of molten spray; P2: re-raise 0.55 s and a return sweep 1.0 s after the first | jump it (or back off past 270 px) | ~0.6 s |
| `slam` | player < 252 px in front (weight ×3.5 when on the east deck) | ladle heaved overhead, iron creak, 0.72 s (P2 0.66) | the ladle chops down 40–262 px in front of her, 240 px high (east deck end + floor below); P2: + a molten wave along the floor | run/dash out past 262 px — or hug her front (< 40 px, under her arm) | 1.15 s (ladle stuck) |
| `brood` | < 3 moldlings; cooldown 11 s | back ladle raised to the vents, low groan, vents glow, 0.6 s | bangs the furnace: 1 (P2 2) moldlings spat from the vents onto ringed spots in front of her | leave the rings; kill them (one hit) or jump their lunge | ~0.5 s |
| `breath` | P2, player in front < 660 px (×3.5 when the player is high) | rears back, arms flung up, core white-hot, roaring intake, a shimmering heat band marks the jet's line, 0.72 s | jet of fire from the core at chest height (460 px, y 388–468 in ch_09) for 0.7 s | stay on the floor (a standing player's head is 100 px below the jet); drop off the deck (Down+Jump); don't jump | 0.75 s, open core |
| `grate` | phase-2 transition | clutches her chest, sparks | grate bursts open | — | — (hurtable) |

Fight flow: the player enters at the west door (W1). Reaching cols 10–30 (rows 6–14) shuts the arena gate `ch_ag9`;
the camera glides to her (player held 1.5 s) as she stops pouring and lifts her head, speaks her intro lines, roars
(card, `keeper` music, `bossStart`). During the fight the camera leans toward her so her front stays in view while the
player is ≥ 200 px inside the screen (she is fully off-screen only when the player is west of col ~23; her ranged
attacks carry their own warnings there: rolling waves, landing rings, glowing floor). Defeat (custom style): slow-mo
shudder → defeat lines → camera on her, she slumps, the ladles clang down, the kiln cools from molten orange to cold
grey over 2.6 s with steam, the flame gutters → ember burst, victory recorded (seal + cinders + stinger), gate opens.
Her husk stays: the entity until the room is left, then the `kiln_forge` script (flag `boss:kilnmother`; facing in
flag `kiln_rest_f`).

## Telegraphs by mode (difficulty modes)

`teleOn()` (top of `kilnmother.js`) = `G.telegraphsOn()` (falls back to `G.game.telegraphs()`, default easy). It is read
**only at draw time** (plus purely cosmetic particle emission): every hitbox, timing, wind-up length and RNG draw that
affects gameplay is identical in all modes. **Easy** looks and plays exactly as before. **Standard / hardcore** below
(hardcore = standard's telegraphs).

| Attack | Easy (explicit, as before) | Standard / hardcore | Diegetic tell (all modes; lead time) |
|---|---|---|---|
| `pour` | — (no marker) | unchanged | great ladle raised high + `kiln_gurgle` + shake, 0.64 s (P2 0.55; 2nd pour re-raise 0.5 s); the stream and the rolling wave are visible in flight |
| `lob` | glowing landing ring + fill + glow on each spot for the whole ~1 s flight | **kept-subtle**: a thin (2 px) faint ring, no fill / glow, only over the last 0.55 s of each gob's fall (`LOB_RING_STD`). *Why*: 3–5 high simultaneous arcs (they rise toward the vault, often above the view) land 150 px apart with 60-px splashes — the 90-px safe gaps are narrower than a dash and cannot be read from the arcs alone in time | ladle dipped to the chest, scoop 0.58 s (P2 0.5) + `kiln_fling`; gobs visible in flight |
| `heat` | tall pulsing gradient (84–104 px), pop flash, 6-px hot strip, end brackets, seams, motes | **kept-subtle** (`KilnHeat.drawWarnSubtle`): no brackets, no pop flash, a short 44-px glow + 5-px strip of the floor plates heating, glowing plate seams, fewer motes. *Why*: the flare rises out of the floor with no visible source, and the phase-2 complementary set's safe sections cannot be read otherwise | she stokes the furnace (mouth blazes, rising drone `kiln_heat`) 0.5 s, stamps (`kiln_slam` + shake) — then 0.95 s (P2 0.82 / 1.25 s) of heating plates + floor light |
| `sweep` | floor strip (gradient, hot line, white line) + end bracket + light, through each wind-up | **removed** (`drawSweepTell` instead) | ladle drawn back + `kiln_scrape` + shake, 0.56 s (P2 0.52; return 0.55 s); **added (standard)**: the drawn-back bowl glows white-hot, lights the floor and sheds sparks + molten drips (from `atk_sweep`, every 0.05 s of each wind-up) |
| `slam` | — | unchanged | ladle heaved overhead + iron creak, 0.72 s (P2 0.66) |
| `brood` | landing ring under each falling moldling | **removed** (a moldling is harmless while it lands and forms, 0.5 s) | back ladle to the vents, low groan, vents glow 0.6 s; the gob is visible in flight |
| moldling lunge | — | unchanged | swelling gurgle 0.45 s (`telegraph`: swell, white eyes, glow, `mold_gurgle`) |
| `breath` | shimmering heat band + wavering edge lines along the jet's line | **removed** (`drawBreathTell` instead) | rears back, arms flung up, core white-hot, roaring intake `kiln_inhale` + shake, 0.72 s; **added (standard)**: the core's glow swells (white heart) and embers are drawn into it from around her chest — the jet's source/height |
| `grate` | — | unchanged | (transition, no damage) |

Verified (module tele-bosses2, `test-output/tele-bosses2/`): contact sheets easy vs standard (`cmp_k_*.png`);
`qa-boss-kilnmother/test.js hit dodge flow` copy run with `?mode=standard` and `?mode=easy`: ALL PASS (79) each;
`enemy_selftest --boss kilnmother` in both modes: ALL PASS (11). (The original `boss-kilnmother/test.js` fails `hit:slam floor P1/P2` in every mode — stale since the QA slam-underside fix; use the QA copy.)

## Room `ch_09` (per the plan notes)

64×18, floor top row 15 (rows 15–17) flat across cols 1–62 (no lava tiles), ceiling rows 0–2 with a flue throat at
cols 52–53 (rows 1–2); **cols 57–62 are solid from row 3 to 14** (the forge wall at her back — QA: no alcove behind her). W1 doorway cols 0–1 rows 12–14; `arena_gate` `ch_ag9` (col 2, rows 11–14,
`side: 'right'`) under the solid lintel at row 10. One-way iron decks cols 14–21 and 42–49 at **row 11** (see
deviation). `arena {boss:'kilnmother', bx:48, by:14, trigger:[10,6,30,14]}`; event `kiln_forge` (the furnace arch
behind her, the flue hood, the moldling vents hanging from the vault over her back, her dormant figure / cold husk). Back-layer dressing:
chains, a hanging ladle, deck stanchions, mold stacks, anvil, gear, rubble, a brazier by the door, lights.
`theme {bg:'interior', decor:0.5, fg:0.6}`, `bgSeed 9`, `dark 0.42`.

`validate --room ch_09`: 0 errors, 0 warnings. `reach --room ch_09`: 1 ok, 0 errors, 0 warnings.

**Deviation:** the plan puts the decks at row 10 (5 tiles above the floor top); the motor's maximum ledge is 4 and
`reach` confirmed they were unreachable without Smokewing (no walls nearby for grip). They are at row 11 (4 tiles up,
reachable with a plain jump). Suggested plan note: "top row 11". Her spawn tile stays the plan's `bx 48`; the boss
places itself at her station (front face 40 px past the east deck's end, computed from the tiles).

## QA changes (qa-boss-kilnmother, after the tables above were written)

1. **Forge wall**: ch_09 cols 57–62 rows 3–14 are solid (no alcove behind her; the old 58–62 throat is gone); her
   contact box has no back inset; she turns only if ≥ 120 px of floor lies on that side; the vents hang from the vault
   over her back.
2. **Slam** hitbox stops at the east deck's underside (feetY − 122 px): the floor under the deck is no longer hit
   invisibly; slam weight 0.4 when the player is low.
3. **Sweep** reach follows the ladle bowl (+44 px) and is active t0+0.03…0.27 s (was the full 270 px from frame 1);
   phase-2 wind-up 0.52 s (was 0.48); a floor-strip tell (gradient, hot line, end bracket, light) in every wind-up;
   the return sweep comes 1.0 s after the first (`SWEEP_GAP`, was 0.85) with a 0.55 s wind-up (`SWEEP_TELE2`, was 0.45).
4. **Waves** are harmless for their first 0.1 s (`WAVE_RISE`, matches the drawn rise); the phase-2 second pour is
   announced (ladle re-raised 0.5 s before, 0.42 s telegraph, re-tip); the stream burns only while pouring.
5. **Moldlings** hold their lunge (and stop within 130 px) while she breathes, heats the floor, opens the grate or a heat
   section is live; a lunge wind-up in progress is cancelled then.
6. **Heat** warning is louder (pop flash, 84 px gradient, 6 px strip, brackets, motes, brighter light); flares collapse
   to an ember bed in 0.12 s (was a 0.45 s shrink that looked lethal); phase-2 second set warns 1.25 s (`HEAT_WARN2`).

Measured after the fixes (QA bots): L2 6/6 wins (~0.7 masks lost), L1 6/6 (~1.3); a 6-frame-lag "human-ish" bot
loses ~1 mask in phase 1 and ~8.5 in phase 2 per fight. Seam ch_08 → ch_09 and death → ch_08 sconce checked.

## Testing

```sh
node tools/gen/arena_kilnmother.js && node tools/validate.js --room ch_09 && node tools/reach.js --room ch_09
node tools/enemy_selftest.js --boss kilnmother --room ch_09 --out test-output/boss-kilnmother/lab
node test-output/boss-kilnmother/test.js [sheet story details hit dodge defeat chaos flow]
node test-output/boss-kilnmother/dev.js fig|fig2        # pose sheets (dev_fig.png, dev_fig2.png)
```
`test.js` (96 checks, real arena, real player motor, dash + grip): (a) every attack in both phases hurts an idle
player for 1 (15 cases); (b) a reactive scripted dodge avoids every attack (53 configurations: jump waves/sweeps,
step into ring gaps, leave glowing sections, run/dash or hug for the slam, drop off the deck for the breath, kill the
moldlings); (c) hits-to-kill arithmetic + dodge-and-strike bot fights without god mode (L2 need 3/4, L1 need 1/4);
(d) 3 minutes of random input (god mode, gate shut, chipped through both phases, re-fought after each defeat): no
errors, she never moves, no state > 6 s, moldlings ≤ 3 and inside the room, no lock/camera leak; (e) arena flow from
the door: gates, intro lines, card, `keeper` music, phase 2 grate, defeat lines, flag + seal + 300 cinders, gates
open, music back, cold husk, re-entry inert. Player death mid-fight was checked separately: respawn unlocked, camera
on the player, arena back to `wait`. Contact sheets: `sheet_attacks1.png`, `sheet_attacks2.png`, `sheet_story.png`,
`sheet_details.png`.

## Notes for other modules

- **[text]** `G.Text.bosses.kilnmother` has `intro` and `defeat`; she speaks nothing mid-fight. A `phase2` line (e.g.
  as the grate bursts: "Look, then. Look what he made of me.") would need a `this.speak('phase2')` call in `atk_grate`
  — not added (the framework would pause the fight for the dialogue).
- **[world plan]** decks at row 11, not row 10 (see deviation).
- Tests can drive her with `G.KilnMother` (`POSES`, `pose`, `skeleton`, `drawFigure(ctx, x, feetY, facing, pose,
  {t, cool, grate})`, `arenaGeom(room, spawnCx, w)`, `surfaceAt`, `NUM`) and the instance helpers `front`, `bowl()`,
  `coreRect()`, `slamRect()`, `breathRect()`, `startAttack(name)`.
- Performance: the heavy shaded shapes (skirt, furnace, mantle, hood) are cached sprites (per cooling step);
  `drawFigure` ≈ 2.5–4.5 ms headless software raster (the Matron ≈ 3–3.5 ms).
