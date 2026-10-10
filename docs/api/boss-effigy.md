# THE EFFIGY — Husk of the Old Guard (module `boss-effigy`)

First boss (Guttered Ways). A hollow giant statue of a royal guard: a cracked white wax shell leaking Pall
smoke, swinging an iron snuffer-cap hammer. Arena `gw_05` "The Old Guard's Hall"; its defeat opens the west gate
`gw_gate1` (`opens: 'boss:effigy'`) to Meltbloom and drops 200 cinders.

| File | What |
|---|---|
| `src/entities/bosses/effigy.js` | boss class (`G.Boss.register('effigy', Effigy)` → entity `boss_effigy`, also `G.Effigy`), projectiles `effigy_wave` / `effigy_debris`, 9 sfx `effigy_*`, room event script `effigy_statue` |
| `src/data/arenas/effigy.js` | room `gw_05` — **generated**, do not edit by hand |
| `tools/gen/arena_effigy.js` | the generator (`node tools/gen/arena_effigy.js [--print]`) |
| `test-output/boss-effigy/test.js` | fairness & robustness tests + contact sheets |

## Numbers

| | |
|---|---|
| HP | 200 (DESIGN §5.3). Expected Brand level **0** (5 dmg): 40 plain hits, **37 measured** with the core bonus (L1 23, L2 16, L3 12 plain). Ember Bolt (15) works normally |
| Phases | phase 2 at 50 % HP (`awaken` transition: the shell bursts, eyes turn ember, `G.Audio.musicLayer(1)`) |
| Stagger | after 70 damage (35 %) taken outside a stagger: collapses for 2.5 s, chest opens, the smoke core takes **×1.5** (L0: 8 per hit). Core damage does not count toward the next stagger. A stagger never cuts the hammer throw or the phase transition (it is applied when they end) |
| Damage | 1 for everything (contact, hammer, shockwaves, rocks) |
| Body | 108×168 px, contact inset 10; no contact damage while waking or staggered |
| Rest between attacks | 0.6–1.05 s (×0.82 in phase 2) |
| Music / reward | `boss` (automatic), 200 cinders (automatic), stinger `boss_defeated` |

## Attacks (all telegraphs ≥ 0.45 s except combo follow-ups)

| Attack | Phase | Telegraph | Active | Dodge (no dash needed) | Punish |
|---|---|---|---|---|---|
| `slam` | 1+ (2: twice) | hammer hauled overhead 0.7 s (0.62 s; follow-up 0.5 s), glow + `effigy_raise`; **floor mark** where the head lands | head impact + two shockwaves rolling both ways (410 / 440 px/s); the follow-up's step (≤ 30 px) stops 20 px short of a player in front | step out of the mark, jump the wave (jump at the impact if close to it) | 0.8 s after the impact |
| `leap` | 1+ (2: twice) | crouch 0.62 s (0.52 s; follow-up 0.45 s) + `effigy_grind`; landing spot marked during the flight | lands on the marked spot (apex 170–215 px: you can run under it) → shockwaves both ways (400 / 430 px/s) | run out of the mark (under the boss if cornered), jump the waves | 0.7 s |
| `combo` | 1+ (never with < 320 px between its centre and the wall toward the player) | low wind-up 0.6 s (0.55 s), hammer trailing behind | low sweep around the body (lunge ≤ 42 px, stopping 30 px short of a player in front) → chop wind-up 0.42 s (0.36 s) with a floor mark → chop; phase 2 adds a forward shockwave (430 px/s) | jump the sweep in place when hugging it (window 0.37 s / 0.33 s), or back off; drift away from the chop mark, jump the wave | 0.95 s + 0.5 s rest (longest opening) |
| `debris` | 2 | roar + stamp 0.6 s | 3 stamps, 5/4/4 warned columns (0.8 s each, one aimed at the player; each lane has lit edges, a cracking glow at the vault, falling grit and the floor seam); rocks keep a floor shadow while falling; later stamps never land within 125 px of an earlier column | walk out of the columns | ~2.9 s total (the boss stands still) |
| `hurl` | 2 (needs room behind the player) | hammer cocked back 0.66 s | hammer skims out low past the player, hangs, returns high to the hand | jump the low pass, **stay down** for the return | unarmed for ~1.5 s |
| `awaken` | transition | — | shell bursts, roar, slam (no wave) | — | — |

Fight flow: the statue kneels as a landmark (`effigy_statue` event). Entering the trigger (cols 26–50, from the
east door) closes the arena gate; the boss spawns over the statue and **wakes** (≈2.3 s: eyes, rises, raises
the hammer, slams); if it is off screen the camera pans to it and the player is locked until the boss card.
The first attack is always the leap when the player is far. Defeat (custom style): slow-mo shudder → the shell
kneels and splits, the Pall pours out and a pale flame drifts away → burst, reward, gates open; the broken shell
stays in the hall for good (flags `effigy_rest_x` / `effigy_rest_f` remember where it fell).

Marks: a stagger or the defeat puts out every floor mark (the promised blow will not come); the defeat also clears the
warned debris lanes. The framework's stagger smoke is thinned and lifted above the shell so the exposed core reads at once.

## QA (module `qa-boss-effigy`)

Independent fairness pass, `test-output/qa-boss-effigy/` (helpers in `lib.js`). Every check is an **existence search**:
for each start configuration the real game is re-run with up to 300–500 policies that use only left/right/jump and do
nothing for the first 0.25 s (reaction time): open-loop plans, plans with reactive jumps over visible waves / the low
hammer, "jump in place at T then the builder's reactive bot", and the builder's bot. A configuration fails only if none
avoids all damage.

```sh
node test-output/qa-boss-effigy/search.js [--atk=slam,combo] [--budget=400]   # boss at 9 spots × player every 70 px, both phases
node test-output/qa-boss-effigy/corner.js combo,slam,leap,hurl,debris 300     # fine grid against both walls
node test-output/qa-boss-effigy/seq.js 400                                    # every ordered pair A→B after the minimum real rest
node test-output/qa-boss-effigy/alcove.js                                     # a player in the door alcoves (cols 3 / 60)
node test-output/qa-boss-effigy/window.js combo 2 90 0                        # jump-timing window standing at a distance
node test-output/qa-boss-effigy/death_flow.js                                 # sconce gw_04 → fight → die → respawn → re-fight → win
node test-output/qa-boss-effigy/humanish.js 12                                # difficulty estimate (lagged bot)
node test-output/qa-boss-effigy/perf.js                                       # per-frame cost over every attack / stagger / defeat
```
Results after the fixes: 1119/1119 single configurations, 5430/5430 wall/corner configurations (220 combo corner cases
are no longer eligible), 858/858 attack pairs, alcoves all dodgeable (and not a safe spot). Defects found and fixed:
combo corner trap (< ~265 px from a wall), combo lunge into a hugging player (phase 2 unavoidable), untelegraphed
contact from the slam follow-up's step, stale floor marks after a stagger, faint debris lanes, smoke over the core,
phase-2 pacing (rest ×0.72 left no Kindle window).

## Room `gw_05` (per the plan notes)

64×18, floor surface row 15 (cols 1–62), ceiling rows 0–2 with cracked stalactite clusters on row 3 (a few to
row 4, ≥ 6 rows above anything standable), door alcoves rows 11–14 under a row-10 header at both exits.
`gw_gate1` at col 2 (closed until `boss:effigy`), `arena_gate` `gw_ag1` at col 61, `arena` `{boss:'effigy', bx:18,
by:14, trigger:[26,6,50,14]}`, event `effigy_statue` at (18,14). Dressing is back-layer only (banners, chains,
lesser Guard statues, broken columns, votive candles, dead sconces, braziers) + lights. No platforms, no hazards.
`validate --room gw_05`: 0 errors (1 warning: `mb_01` not built). `reach --room gw_05`: 7 ok.

## Testing

```sh
node tools/gen/arena_effigy.js && node tools/validate.js --room gw_05 && node tools/reach.js --room gw_05
node tools/enemy_selftest.js --boss effigy --room gw_05 --out test-output/boss-effigy/lab
node test-output/boss-effigy/test.js [sheet hit dodge defeat chaos flow attacks]
```
`test.js` (36 checks, real arena, real player motor, no dash/wings/grip): (a) every attack in both phases hurts an
idle player for 1; (b) a reactive bot using only left/right/jump that sees what is on screen (marks after a
0.15 s reaction, wind-up poses after 0.2 s, waves / hammer / rocks) avoids every attack in every trial;
(c) three full fights by a dodge-and-strike bot at Brand L0 without god mode (37 hits, ~45–50 s);
(d) 3 minutes of random input (half without, half with all abilities): no errors, boss stays in the hall, never
stuck; (e) arena flow from the east door through wake, card, music, defeat, gates, stinger, 200 cinders,
remains, inert re-entry. Contact sheets: `sheet_poses.png`, `sheet_attacks.png`.

## Notes for other modules

- `G.Text.bosses.effigy` has only `name`/`sub` (no `intro`/`defeat` lines): the statue is silent by design;
  if the text owner adds lines, `G.Boss` shows them automatically (intro after the wake slam).
- Tests can drive it with `G.Effigy.POSES`, `G.Effigy.drawEffigy(ctx, pose, null, opts)`, `G.Effigy.drawRemains`.
