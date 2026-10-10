# GUTTERLIGHT — project status

**Release state: 1.0 release candidate, packaged (module qa-package, 2026-10-10).** Content-complete (81/81 rooms, 10
regions, 8 bosses, 16 music tracks), all automated verification green on the final tree, single-file build
`dist/Gutterlight.html` verified, player `README.md` at the project root. **Not yet done: a human play-through and a
listen (§3 item 1)** — every result below is automated (headless Chromium).

History: foundation phase (engine, audio, art, world plan, text, player, UI, interactables/NPCs, enemy + boss framework,
tools), integration, **content wave 1** (Ashen Shore + Lastlight, the Guttered Ways, the Effigy, early music), **content
wave 2** (Meltbloom Gardens, the Sootflue, Sable's two duels, the Soot Matron, the mid-game music), **content waves 3 + 4**
(the Drowned Nave, the Chandlery, the Mothwood, the Rime, the Heartwick Sanctum, Tallowmere, the Kiln Mother,
Vespertine, Lucerne + both endings, the battle and late music) and their post-wave integrations, then the **baseline QA
pass** (§1e), **QA round 1** (§1f), **QA round 2** (§1g) and **release packaging** (§0). Change log of every
cross-module fix: `docs/INTEGRATION_LOG.md` (#1-#65).

**One command verifies everything:** `node tools/test_all.js` (23 steps, ~22-35 min incl. the ~7-12 min `playthrough` and the audio step; `--quick` ~3 min, skips them).
It must print `ALL PASS` before and after every content change.

---

## 0. Release (module qa-package)

### 0.1 How to ship / play
- Ship **`dist/Gutterlight.html`** (one self-contained file: 104 scripts inlined, 3 488 353 bytes, 876 668 bytes gzipped;
  no external requests). `index.html` + `src/` is the same game unbundled. Both run from `file://` in a modern browser.
- Player documentation: `README.md` (project root): how to run, controls (both key sets + gamepad, checked against the
  in-game Controls screen `test-output/qa-package/controls.png`), spoiler-free tips, saves, credits, developer section.
- Rebuild: `node tools/build.js` (always after any `src/` change; the build verifies that it boots).

### 0.2 Final verification (all on the final tree, 2026-10-10)
| Command | Result | Log |
|---|---|---|
| `node tools/test_all.js` (full, 23 steps) | **ALL PASS (23 steps) in 1091 s**, exit 0 | `test-output/qa-package/test_all_1.txt`, per step `test-output/test_all/<step>.log` |
| ↳ step results | audit 5/5 · text 0/0 · motor 48 · engine 46 · player 35 · ui 78 · interact 26 · enemies 50 · audio 89 renders · art no errors · plan_check 0/0 · validate 0/0 · tools 62/62 · reach_fx 0 err (1 deliberate fixture warning) · reach_plan_fx 0/0 · reach 0 err, 2 warnings (benign gw_12 one-way, §1) · reach_margin 0/0 · smoke no errors · e2e 40 · playthrough 36/36 (375 s) · build boots OK · e2e_dist 40 | |
| `node tools/build.js` (in test_all) | `dist/Gutterlight.html` written and boot-verified | `test-output/test_all/build.log` |
| `node tools/e2e.js --file dist/Gutterlight.html` (test_all `e2e_dist`) | ALL PASS (40 checks) | `test-output/test_all/e2e_dist.log` |
| `node tools/playthrough.js --file dist/Gutterlight.html` | **ALL PASS (36 steps)**, 377 s: 114 room exits, 71 rooms, 14 rests, 8 travels, both endings, **0 console warnings**, 101 383 game frames — identical to the source run in test_all | `test-output/qa-package/playthrough_dist.txt` (source: `playthrough_src.txt`) |
| `node tools/validate.js --complete` | 0 errors, 0 warnings; 81/81 rooms; lore 38 · sparks 6 · lanternways 7 · sconces 17 · arenas 8 · enemy kinds 30/30 | — |
| `node test-output/qa-package/release_check.js [dist/Gutterlight.html \| index.html]` (new) | ALL PASS on both: a plain run (no params) logs **zero console messages**, makes no network requests, starts on the title, `G.test` false, the debug overlay is off and stays off after `` ` `` / F3; `?god=1&room=gw_05&abilities=all` without `test=1` is ignored (title, god off); `?debug=1` shows the overlay (F3 toggles); `?test=1&god=1` still works for the tools | `release_check_dist.txt`, `release_check_src.txt` |

### 0.3 Release cleanup done
- **No stray debug output:** `src/` has no `console.log/info/debug/trace` and no `debugger`; the 10 `console.warn/error`
  calls are the error/warn reporters (`G.reportError`, `G.warnOnce`, audio/art/world loaders), silent in a normal run
  (release_check, playthrough 0 warnings). No `TODO/FIXME/HACK`, no `alert`.
- **Debug overlay only with `?debug=1`** (or `?test=1` for tools; QA r2 fix, re-checked on dist).
- **Test-only URL params harmless:** `room tx ty abilities testrooms wake` already required `test=1`; **`god=1` now
  does too** (log #63; it previously made a real save slot invulnerable without `test=1`). `test=1` itself = in-memory
  saves (never touches localStorage). The remaining params are inert conveniences: `mute=1`, `seed=<n>` (seeds
  `Math.random` for cosmetics), `paused=1` (no RAF loop; the tools drive frames), `region=<id>` (only re-skins dev rooms),
  `debug=1`. The dev test rooms (`src/data/test_rooms.js`, region `test`) ship in the build but are reachable only with
  `test=1&room=`/`testrooms=1`.
- 14 stray QA screenshots removed from the project root (moved to `test-output/qa-package/stray_root_pngs/`, log #65).

### 0.4 Stats (final tree)
| | |
|---|---|
| World | **81 rooms** in **10 regions** (Ashen Shore 4, Lastlight 3, Guttered Ways 12, Meltbloom Gardens 10, Sootflue 9, Drowned Nave 12, Chandlery 10, Mothwood 10, Rime 8, Heartwick Sanctum 3; incl. 8 arenas), 214 openings, 17 sconces, 7 Lanternway posts |
| Enemies | **30 enemy kinds**, ≈ 194 placed (baseline QA count, `qa-baseline/economy.js`) |
| Bosses | **8 fights**: the Effigy, Sable (2 duels), the Soot Matron, Abbot Tallowmere, the Kiln Mother, Duchess Vespertine, Lucerne (2 forms) + 2 endings |
| Collectibles | 6 abilities, 8 heartwax shards, 2 ember urns, 3 kiln glass (Brand L1-L4), 6 sparks, 3 seals, 14 sigils, 3 extra notches, 38 lore carvings, 27 geodes |
| Audio | **16 music tracks**, 59 sfx, 10 ambience beds, 6 stingers (all synthesised) |
| Code | `src/`: **60 408 lines** in 104 JS files (55 095 non-blank, non-comment; generated room data `src/data/regions` + `arenas` 2 474 of them); `tools/`: 19 211 lines in 66 files (excl. `node_modules`); docs: 6 777 lines of Markdown |
| Build | `dist/Gutterlight.html` 3.49 MB (877 KB gzipped) |

---

## 1. What works (verified)

| Area | State | Verified by |
|---|---|---|
| Boot / title | Title gate ("press any key") → `G.Audio.init` → title music; menu; 3 save slots with erase; options; controls | `tools/e2e.js`, `tools/ui_selftest.js` |
| New game | Intro verse (skippable) → start room → **wake-up cinematic** (lying on the ash → flame ignites → stands) → control | e2e; content pre-flight (§5) |
| The Wickling | Real `G.Player` (not `G.DebugPlayer`): run, variable jump, coyote/buffer, dash, grip/wall-jump, Smokewing, swim (Oilcloak), Molten Plunge, Brand side/up/down + pogo, Ember Bolt, Kindle, all 14 sigils, hurt/i-frames/knockback, hazards, death melt | `tools/motor_metrics.js` (48), `tools/player_selftest.js` (35), `tools/engine_selftest.js` (46) |
| World | rooms, transitions on all 4 sides (upward boost), breakable `B` / dive `D` (persist), liquids, one-way platforms, glazed walls, `?region=` art preview of the dev rooms; **secret pockets auto-veiled** (`G.World.hiddenPockets`: drawn as rock, off the map, until the B/D next to them breaks) | engine self-test, smoke, `test-output/integration/w1/veil/` |
| Combat | real `ash_crawler` / `ash_fly`: telegraphs, contact damage, hit flash, melt + puddle, cinder drops, +11 Ember per Brand hit | `tools/enemy_selftest.js` (50), e2e, pre-flight |
| Bosses | `G.Boss` framework, arena controller + arena gates (`arenaStart` / `arenaEnd`), title card, boss music, stagger, phases, defeat sequence, reward cinders, `boss_defeated` stinger, **Warden Seal reward** (new, see log #6), placeholder `boss_test` under the real id | enemy self-test (`--boss test`), integration seal test |
| Interactables / NPCs | sconce (rest, respawn, sigil equip), lanternway (light/travel; refuses with a hostile within 12 tiles or after being hurt/attacked < 3 s ago), lore, shrines + ability card, pickups + item cards, geodes, levers, gates (vertical + horizontal grates), seal door, lights, decor, scripted events, all NPCs (talk selection per text.md), Gutterwisp | `tools/interact_selftest.js` (26), e2e |
| Death loop | death → wisp holding the cinders (Ember capacity −33) → respawn seated at the last sconce → 3 hits on the wisp reclaim | e2e |
| Save | save on rest / transitions / items / bosses / quit; quit to title → Continue restores flags and cinders at the sconce; memory-only in `?test=1` | e2e, smoke, engine self-test |
| UI | HUD, pause, options, controls, map (hidden pockets stay off it until revealed), inventory + sigils, dialogue, lore, spark memory, 3 shops, Lanternway, area/boss cards, ability/item cards, toasts, prompts, intro, both endings + credits; keyboard and gamepad labels | `tools/ui_selftest.js` (78), e2e, screenshots |
| Ending | `G.game.finishGame()` → ending (by sparks) → credits → title, slot marked complete; played for real after Lucerne's defeat in hs_03 (both endings) | integration test (log #13), `test-output/integration/w34/ending.js` |
| Audio | 59 sfx, 10 ambience beds, 6 stingers, mixer, sequencer, the `title` track; every audio name used in code exists | `tools/audio_check.js`, `tools/audit.js`, e2e (runtime record: zero unknown names) |
| Art | all 10 region themes (sky, parallax, terrain, decor, liquids, weather, fog, foreground), props, character helpers, lighting; `:` back walls (render bug fixed in wave 1), sky-room deck stilts, `theme.landmark:false` | `tools/art_lab.js`, screenshots in `test-output/integration/regions_*.png`, `test-output/integration/w1/art/` |
| Text | all narrative + UI text; every `G.Text` key used in code exists | `tools/text_check.js`, `tools/audit.js` |
| Tools | validate, reach (parallel, cached; gates hold against the maximal pre-ability set; `--margin`: no near-exact moves), smoke, build (single-file `dist/Gutterlight.html`), plan check/render, audit, e2e, test_all | `tools/fixtures/selftest.js` (62), test_all |
| **Playthrough** | `tools/playthrough.js`: the whole critical path played in the real game by a bot — real title → New Game → intro → wake → 6 shrines (Up) → 8 bosses (arena gates close, boss music, debug damage after the intro, flags, gates reopen, rewards 200/300 cinders + Warden Seals) → 3 levers struck with the Brand → 14 sconce rests → 7 Lanternway posts lit + 8 travels → a death (real hurt) + wisp reclaimed with 3 Brand hits → pause menu Quit → Continue → Seal Door → ending `undying` → credits → title (slot complete) → title Continue on the finished save (rewound to the hs_02 sconce, Lucerne alive, slot card still complete) → 6 sparks → ending `gutterlight` → credits → title. 36 steps, ~7 min, 114 room transitions, 71 rooms visited, 0 console errors/warnings; identical (101 383 frames since the r2 dialogue input guards; 99 838 before) on `--file dist/Gutterlight.html`. Every one of the 417 executed macros has a start window ≥ 8 px (the bot prefers tolerant take-offs, like a human; windows logged). Movement: `tools/lib/nav.js` plans with reach_core from the player's exact motor state + live tiles/solids, replays frame by frame, re-plans after every macro; `--from <step>` resumes from `test-output/qa-playthrough/checkpoints/` | `node tools/playthrough.js` (test_all step `playthrough`, slow); log `test-output/qa-playthrough/playthrough_log.txt` |
| Build | `dist/Gutterlight.html` (104 scripts inlined, ~3.49 MB / 877 KB gz) boots and passes the full e2e flow | `tools/build.js`, `tools/e2e.js --file dist/Gutterlight.html` |

Every run is clean: no console errors, no console warnings in the real flow, no `undefined` / `NaN` /
`[object` / `null` text drawn (e2e checks every `fillText`).

### Last full run (`node tools/test_all.js`)
`audit text motor engine player ui interact enemies audio art plan_check plan_render validate tools reach_fx
reach_plan_fx reach reach_margin smoke e2e playthrough build e2e_dist` → **ALL PASS** (23 steps, 1091 s, release packaging,
module qa-package, on the final tree: `test-output/qa-package/test_all_1.txt`; details §0.2). Previous: QA round 2
(`test-output/qa-reverify-r2/test_all_3.txt`, 1097 s; one earlier run there failed only the flaky crawler-cinder check
fixed in log #62). Logs per step: `test-output/test_all/<step>.log`. Expected
warnings: reach 2 (gw_12 S1→E1/W1 one-way, benign — gw_12's S1 cannot be reached from gw_02; `reach --global` adds both
traversals and plan_check still passes), reach_fx 1 (the deliberate `fx_order` GATE LEAK fixture). `validate`:
0 errors, 0 warnings; `reach --margin`: 0 errors, 0 warnings; `plan_check`: 0/0; `build`: OK; playthrough 36/36,
101 383 frames, 0 console warnings (also on `--file dist/Gutterlight.html`: identical, `qa-package/playthrough_dist.txt`).
Self-test counts: motor 48, engine 46, player 35, ui 78, interact 26, enemies 50, e2e 40, tools 62.

### Performance (headless Chromium, 1280×720, `test-output/integration/perf.js`)
| Scene | CPU per frame (step + render submission) | of which game logic | software raster (headless only) |
|---|---|---|---|
| dev_01, typical (5 entities, player, lights) | **4.7 ms** (step 0.5 + render 4.2) | ~1 ms | ~15 ms |
| dev_01 busy: 24 enemies, 12 projectiles, ~250 particles, slashes | **7.8 ms** (0.8 + 6.9); mothwood theme 8.6 ms | ~2 ms | ~19–22 ms |

The CPU target (< 8 ms) is met for normal rooms and just met/borderline for the stress scene. Headless
Chromium rasterizes in software (SwiftShader), which costs another 15–22 ms per frame that a real GPU does
in parallel. The largest CPU items are two offscreen-canvas syncs that SwiftShader makes expensive: the
darkness map (640×360 → screen, ~1.4 ms) and the player's offscreen body (~0.7 ms). Not yet measured: a
real browser with a GPU (expected well under budget). `tools/smoke.js` reports per-room timings for every built room.

---

## 1b. Content built and verified (wave 1)

| Content | Files | State | Verified by |
|---|---|---|---|
| **Ashen Shore** sh_01–sh_04 (tutorial strip, start mound, 3 carvings, first sconce, grip/wings/dash promises) | `tools/gen/shore.js` → `src/data/regions/shore.js`; enemies `src/entities/enemies/shore.js` | built to plan; New Game starts on the sh_01 mound with the wake-up cinematic | validate 0 errors, reach all OK, smoke, wake-up checked on the real mound (`test-output/integration/w1/wake_*.png`), QA report |
| **Lastlight** ll_01–ll_03 (gate + Quill, square with the Last Brazier, Thrum, Pell, home sconce, Lanternway, the Well; Wickwright's Row + Bramm) | `tools/gen/lastlight.js` → `src/data/regions/lastlight.js` | built to plan; ll_03 E1 seam to sf_01 checked against the plan only (sf_01 unbuilt) | as above; screenshots `test-output/integration/w1/art/room_ll_*.png` |
| **The Guttered Ways** gw_01–gw_04, gw_06–gw_12 (4 enemy kinds, Bolt shrine, Lanternway hub, Broken Bridge dash gate, grip gate, secrets, Alcove + Wax Notch) | `tools/gen/guttered.js` → `src/data/regions/guttered.js`; `src/entities/enemies/guttered.js` (+ event scripts `gw_tent gw_mural gw_waxwall gw_abyss`) | built to plan; gw_06 gap now 9 tiles | validate, reach (2 benign one-way warnings in gw_12), enemy self-test, QA route/fight/hazard scripts (`test-output/qa-region-guttered/`) |
| **The Effigy** (boss) + arena gw_05 | `src/entities/bosses/effigy.js`, `tools/gen/arena_effigy.js` → `src/data/arenas/effigy.js` | complete (2 phases, gate `gw_gate1` opens on defeat) | `test-output/boss-effigy/test.js` (36 checks), enemy self-test `--boss effigy`, QA |
| **Music**: `title`, `shore`, `lastlight`, `guttered`, `meltbloom` | `src/audio/tracks/*.js` | composed; the other 11 tracks are stubs (silence + one warning) | `tools/audio_check.js` (levels, NaN, loop seam); not checked by ear |

World coverage after wave 1: 19/81 rooms (see §1c for the current totals).

## 1c. Content built and verified (wave 2)

| Content | Files | State | Verified by |
|---|---|---|---|
| **Meltbloom Gardens** mb_01–mb_06, mb_08–mb_10 (Garden Gate, Bloom Atrium with THE Meltbloom, Pollen Terraces, Overgrown Cloister, Petal Bridge (9-tile dash gap), Shrine of the Flare → **dash** after Sable 1, Thornwalk, Root Hollows, Weeping Arbor) | `tools/gen/meltbloom.js` → `src/data/regions/meltbloom.js`; enemies `bloom_spitter thorn_hopper pollen_moth vine_lurker` + set-piece event scripts (`docs/api/enemies-meltbloom.md`) in `src/entities/enemies/meltbloom.js` | built to plan | validate 0 errors, reach all OK, smoke, enemy self-test, builder + QA route/gap/hazard scripts (`test-output/region-meltbloom/`, `test-output/qa-region-meltbloom/`) |
| **The Sootflue** sf_01–sf_04, sf_06–sf_09 (Chimney Tops with the one-way lever shortcut to Lastlight, Great Flue shaft, Soot Lofts, Bellows Hall, Ember Shaft, Pipeworks, Shrine of the Wax Grip → **grip** after the Matron, Ashpit) | `tools/gen/flue.js` → `src/data/regions/flue.js`; enemies `soot_sprite chimney_crawler stoker ash_bat` + set pieces in `src/entities/enemies/flue.js` | built to plan; sf_08 E1 → ch_10 waits for the Chandlery | as above (`test-output/region-flue/`, `test-output/qa-region-flue/`) |
| **Sable** duel 1 (mb_07 The Moonlit Lawn, gate `mb_gate9`) and duel 2 (ri_07 The Last Guard, gate `ri_gate9`; built ahead of the rime rooms) | `src/entities/bosses/sable.js`, `tools/gen/arena_sable.js` → `src/data/arenas/sable1.js`, `sable2.js` | complete, `defeatStyle:'yield'`; duel-2 openings to ri_04/ri_08 unchecked until rime exists | enemy self-test `--boss sable1/sable2`, builder + QA bot fights |
| **The Soot Matron** (sf_05 The Matron's Den, gate `sf_gate9`) | `src/entities/bosses/matron.js`, `tools/gen/arena_matron.js` → `src/data/arenas/matron.js` | complete; summons `soot_sprite`s | enemy self-test `--boss matron`, QA bot fights |
| **Music**: `flue`, `nave`, `chandlery`, `mothwood` | `src/audio/tracks/*.js` | composed (9 of 16 tracks now real) | `tools/audio_check.js` (levels, NaN, loop seam); not checked by ear |
| **Seams** ll_03 ↔ sf_01, gw_06 ↔ sf_02, gw_05 ↔ mb_01 | — | played with real inputs (integration `test-output/integration/w2/seams.js`): the closed `sf_gate1` stops the player coming from Lastlight at col 5; striking `sf_lv1` from the east opens it for good and the player walks to ll_03 and back; gw_06 E1 ↔ sf_02 W1 both ways (landing on the floor); `gw_gate1` holds until `boss:effigy`, then gw_05 ↔ mb_01 both ways | `seams_sheet.png` |

World coverage after wave 2: **39/81 rooms** (shore 4/4, lastlight 3/3, guttered 12/12, meltbloom 10/10, flue 9/9 incl. arenas,
rime arena ri_07 only), lore 18/38, sparks 3/6, Lanternway posts 3/7, arenas 4/8, heartwax 4/6, kiln glass 1/3,
sigil sources 10/14, enemy kinds placed 14/30 (`node tools/validate.js` totals).

---

## 1d. Content built and verified (waves 3 + 4)

| Content | Files | State | Verified by |
|---|---|---|---|
| **The Drowned Nave** dn_01–dn_06, dn_08–dn_12 (Lanternway hub dn_03, Ice Stair dn_12 up from the Rime, plunge gate dn_08 → ri_01, flooded tunnel dn_10 ↔ mw_01) | `src/data/regions/nave.js`; enemies `src/entities/enemies/nave.js` (`docs/api/enemies-nave.md`, `region-nave.md`) | built to plan | validate/reach 0 errors, smoke, builder + QA scripts (`test-output/qa-region-nave/`) |
| **The Chandlery** ch_01–ch_08, ch_10 (Lanternway ch_02, Crucible Wall grip climb ch_04, plunge floor ch_06 → ri_06) | `src/data/regions/chandlery.js`; enemies `src/entities/enemies/chandlery.js` | built to plan | as above (`test-output/qa-region-chandlery/`) |
| **The Mothwood** mw_01–mw_03, mw_05–mw_10 (hub mw_02 wings ladder, Mothward Gate mw_03 under mb_09, wings shrine mw_10, plunge floor mw_09 → ri_03) | `tools/gen/mothwood.js` → `src/data/regions/mothwood.js`; enemies `src/entities/enemies/mothwood.js` | built to plan (as-built notes in the plan) | as above (`test-output/qa-region-mothwood/`) |
| **The Rime** ri_01–ri_06, ri_08 and **the Heartwick Sanctum** hs_01, hs_02 (Frozen Lake wings wall, Seal Door, lever chute ri_lv1, last sconces) | `tools/gen/rime.js`, `tools/gen/sanctum.js` → `src/data/regions/rime.js`, `sanctum.js`; enemies `src/entities/enemies/rime_sanctum.js` | built to plan (as-built notes in the plan) | as above (`test-output/qa-region-rime_sanctum/`) |
| **Abbot Tallowmere** (dn_07), **the Kiln Mother** (ch_09), **Duchess Vespertine** (mw_04) — the three Wardens, seals bell/kiln/wing | `src/entities/bosses/{tallowmere,kilnmother,vespertine}.js`, `src/data/arenas/*.js` | complete | enemy self-test `--boss`, builder + QA bot fights (`docs/api/boss-*.md`) |
| **Lucerne, the Everlantern** (hs_03) + endings `gutterlight` (6 sparks) / `undying` | `src/entities/bosses/lucerne.js`, `src/data/arenas/lucerne.js` | complete | builder + QA suites; integration real flow (below) |
| **Music**: `boss sable keeper lucerne ending rime sanctum` | `src/audio/tracks/*.js` | composed — all 16 tracks real | `tools/audio_check.js`; not heard by ear |
| **Seams** (integration, real inputs: `test-output/integration/w34/seams.js`, 21/21 PASS) | — | ch_06 plunge → ri_06 (lands at col 79.5, no damage; no way back up); mb_09 → mw_03 lands on the closed `mw_gate1` (row 2), `mw_lv1` struck from below opens it, a full jump (no wings) and a wings jump both return to mb_09's dips; dn_10 ↔ mw_01 swim both ways with Oilcloak (without it the water only hurts/respawns); mw_09 plunge → ri_03; ri_05 → dn_12 Ice Stair climbed with grip (impossible without), dropping back lands in ri_05; ri_07 → ri_08 after `boss:sable2`; the Seal Door holds with 0 seals (also jumping), opens with 3 → S1 drop → hs_01 → hs_02 → hs_03; hs_01 → ri_08 climb back; `ri_lv1` opens `ri_gate1` and the grip chute reaches ri_01 | `seams_sheet.png`, `grate_sheet.png` |
| **Ending flow** (integration, `test-output/integration/w34/ending.js`) | — | real hs_03 fight (god mode, chip damage, dialogue advanced with Confirm): form 1 → form 2 → defeat → `finishGame('gutterlight')` with 6 sparks / `'undying'` with 3 → ending screens → credits → title in ~133 s; save slot `completed: true`, `ending` set | no console errors |

World coverage: **81/81 rooms**; totals lore 38/38 · sparks 6/6 · lanternways 7/7 · arenas 8/8 · heartwax 6/6 · urn 1/1 ·
kiln glass 3/3 · notch 1/1 · sigil sources 14/14 · enemy kinds placed 30/30 (`node tools/validate.js --complete`: 0 errors,
0 warnings). `node tools/reach.js --global`: 0 errors, 2 warnings (gw_12 S1→E1/W1 one-way, benign).

## 1e. Baseline QA (global verification, module qa-baseline)

Scripts: `test-output/qa-baseline/` (`notes.md`). Everything below ran on the complete world.

| Check | Result | How |
|---|---|---|
| Whole battery | `test_all` ALL PASS before (21 steps, 920 s) and after (22 steps, 924 s); `validate --complete` 0/0; `reach --all` and `--global` 0 errors (2 benign gw_12 warnings, see above); `plan_check` 0/0; `smoke` every room 0 errors; `e2e` + `e2e --file dist/Gutterlight.html` ALL PASS | `test_all_initial.txt`, `test_all_final.txt` |
| **Margin check** (new, `reach --margin`) | every plan path/spot of all 81 rooms still works with a handicapped motor (12 px shorter runs/dashes, 4 px lower jumps, no coyote time, jumps ≥ 8 px inside ledge edges); 0 errors / 0 warnings after two fixes (gw_10, ri_08 — log #46/#47) | `tools/reach.js --margin`, test_all step `reach_margin`; fixture `tools/fixtures/margin_rooms.js` |
| Upward transitions | every bottom opening simulated with the real exit boost: every planned upward entry now lands with ≥ 44 px to spare (gw_10 and ri_08 cleared their lips by 3.3 px — fixed); gw_12 S1 3.4 px (not a planned upward route) | `upscan.js` |
| Entries | all 214 openings: falling in from every x of a top opening never touches a hazard; side entries start in free space with 3 hazard-free tiles; only the three plunge-floor S openings (dn_08, ch_06, mw_09; one-way down, unreachable from below — reach) rise into their unbroken D tiles | `entryscan.js` |
| Rooms (runtime) | all 81 rooms entered twice: region music + ambience as data says (10 regions), area card on every region change (big on the first visit only), no errors | `world.js rooms` |
| Sconces | all 17: interact → lit, rest (respawn point, full health), stand up | `world.js sconces` |
| Lanternway | all 7 posts lit by interaction; 42 trips land on free ground beside the destination post; the real menu travels; no hostile within 12 tiles at any arrival (after log #49) | `world.js lantern`, `hub.js` |
| Lore | all 38 carvings open their lore screen with text | `world.js lore` |
| Geodes | all 27 break with the Brand | `world.js geodes` |
| Collectibles → 100 % | fresh game: 25 world pickups by touch, 6 shrines by interaction, 7 bosses through their arena flow (rewards, 3 seals), Wren's and Thrum's gifts, every Pell/Bramm/Quill row bought through the real shop UI → `completion()` **100 %** (abilities 6, heartwax 8, urns 2, Brand L3, sparks 6, seals 3, sigils 14, notches 6, bosses 8) | `world.js items` (also on `dist/Gutterlight.html`: `world_dist.txt` ALL PASS 11) |
| Map | the map opens with the whole world visited and charted | `world.js map` (`world/map_full.png`) |
| NPC stages | Wren 1 → 2 → 3 → 4 and Sable 1 → 2 appear in plan order; Wren 1 now leaves once met in the Nave (log #48) | static review + `world.js` |
| Cinder economy | guaranteed ≈ 4 765 (bosses 1 100 + 27 geodes 2 255 + one clear of the 194 placed enemies ≈ 1 410) vs 5 000 for every Pell/Bramm purchase (+ 710 for charts): 100 % needs a little farming (enemies respawn on re-entry) | `economy.js` |
| Lucerne | form 2 retuned (log #50): the reactive no-god bot (9 masks, Brand L2, no Kindle) now wins 2 of 3 fights; god-mode form 2 830 s → 345-416 s; QA suite ALL PASS 49 | `lux/lux.js`, `docs/api/boss-lucerne.md` |
| Slowest rooms (smoke, headless incl. software raster) | hs_03 24.6 ms render, mb_02 24.0, dn_03 21.0, mw_03 19.4, dn_09 19.4 (update ≤ 0.23 ms/step everywhere) | `test-output/test_all/smoke.log` |

The end-to-end **playthrough bot** (`tools/playthrough.js` + `tools/lib/nav.js`) is being built in parallel by module
qa-playthrough (it replays reach macros in the real game from the exact motor state); see its own report.

---

## 1f. QA round 1: fixes integrated and re-verified (module qa-reverify-r1)

Finder reports: `test-output/qa-find-*-r1/`; fixer reports/regressions: `test-output/qa-fix-*-r1/`; re-verification
outputs: `test-output/qa-reverify-r1/`. Integration changes: `docs/INTEGRATION_LOG.md` #55-#59. Every repro below was
re-run on the integrated tree.

| Finding (severity) | Fix (owner) | Re-verified by (result) |
|---|---|---|
| **Post-game softlock**: a save that saw `undying` could never reach `gutterlight` (major) | engine: `finishGame` keeps the finished state + `endingsSeen`; Continue rewinds to before Lucerne (`rewindFinishedRun`), slot card stays complete. boss-lucerne: defensive hall `rematchDue/rearm` (now a fallback, see log #55) | `qa-find-softlock-r1/postgame.js` (continue → hs_02, not completed, `endingId` gutterlight, hall `wait` → `fight`); playthrough step `postgame` now uses the real path (log #56); `qa-fix-engine-r1/regress.js` 14/14; Lucerne suite 62/62 |
| **Frame pacing** at 60 Hz (irregular 1/2-step frames) and 144 Hz over-rendering (major) | engine `game.frame` snapping + half-step clock, draw only after a step | `pacing2.js` 0 % irregular in all 6 phase/rate cases; `hz144.js` 60 steps / 61 renders; real rAF loop: 2-step frames only where the headless browser itself delivered 33 ms gaps |
| **X (attack) skipped the intro/ending and closed the map** (major) | ui `UI.pressedBack`; 2-press skip on the ending | `introskip.js`, `xskip.js` (stay open); `qa-fix-ui-r1/regress.js` ALL PASS |
| Auto-pause on blur/hidden tab/gamepad loss (incl. while dead/transitioning) | engine `requestAutoPause` | both `blur.js`, `pad.js` → `ui ["pause"]`, device keyboard |
| Save write failures silent; bad save types → black screen; art cache leak; ch_04 edge rounding | engine/save | engine regress (toast now uses `G.Text.ui.saveFailed`, log #57) |
| Ember gained on blocked hits | engine `combat.attack` | `shield_ember.js` +0 blocked / +11 damaging |
| Death stinger missing; Lucerne track fade cut by region restore; seal + `boss_defeated` stingers overlapping | engine, boss-lucerne, enemyfw | `death_audio.js`; `boss_audio.js` (Lucerne defeat: only `musicLayer(0)`, `music(null,{fade:3})`, ambience; 3 seal bosses: only `seal`; effigy/matron: one `boss_defeated`) |
| Music notes dropped during cold room transitions; oscillators above Nyquist | audio (`FADE_AHEAD` during system fades, frequency clamps) | `qa-fix-audio-r1/stall.js`: fade+stall drops 0 on all 8 tracks; audio step PASS |
| Wall-break hitch (perf) + dn_04 spike "jaw" (visual) | art `terrain.js` (windowed rebuild, spikeOrient) | `brk_equiv.js` 28/28 pixel-exact, `spike_scan.js` only dn_04 c19 changed |
| Floating props: Guttered (gw_02/03/04/07/08/11/12), Rime (ri_03/06/08), gw_05 chains | region fixers (+ generator foot checks); gw_05 by integration (log #58) | `floatcheck.js`: no gw_ entries left; `props_support.js`: only ri_02 spires on spikes (intended) |
| Ending ambience kept playing; "The End" cut the ending track; chart revealed gw_12; Heartwax at a Sconce left an empty mask; title cards over inventory/shop | ui | ui regress |
| Wren in several rooms at once; wisp hint never shown; Sable 1 after Sable 2 | interact | `wren.js` (only ri_04), `sable.js` (none in gw_07), `wisphint.js` (both toasts fit: 451/205 px) |
| Wren lines vs dead bosses, Quill's tunnel line, seal name (now "Seal of the Forge"), Thrum's dash line | text | `qa-fix-text-r1/check.js` PASS; `text_check` 0/0 |

Still open from this round (none blocking; owners in brackets):
- [ui] no permanent title/slot-screen notice when storage is unavailable (`G.Save.memoryOnly`); only a toast in play.
- [ui] "The End" holds ≈ 47 s with no input until the ending track resolves (intended; Continue hint after 7 s);
  timing verified only with a stubbed audio clock — needs a real-browser listen.
- [ui/input] `KeyX` is bound to both `cancel` and `attack` (`src/core/input.js`); handled per screen with
  `UI.pressedBack`. Any new screen where attack/spell acts must use it.
- [ui] toasts are one line capped at 560 px (long strings are ellipsised); the wisp hint is split into two toasts.
- [engine] `game.equip/unequip` do not refill/save themselves (the inventory does); no save on `pagehide`; at
  59.94 Hz game time runs 0.1 % fast (frame snapping, deliberate); no render interpolation.
- [art] a wall break still costs ≈ 17 ms median (≤ 44 ms) + a 25-52 ms next frame headless; small rooms fall back to
  the full shading rebuild; far chunks catch up within ≤ 17 frames.
- [audio] no general rule against overlapping stingers (`Engine.playStinger`); seal bosses have ~1.4 s without a
  victory cue before the seal card.
- [text] `s1_watch` (`text.js`) can never show; Wren's room `requires` strings are now redundant with `Wren.present()`.
- [visual, not confirmed as defects] `floatcheck.js` still lists back-layer meltbloom vines/drips, chandlery shaft
  chains from row 0 and dn_07 stained windows (wall/backdrop kinds) — reviewed by the visual finder, not in scope.
- [tools] the fixers' regressions live in `test-output/qa-fix-*-r1/` (engine, ui, art, text) and are not wired into
  `test_all` (enemies + interact ones are).

## 1g. QA round 2: fixes integrated and re-verified (module qa-reverify-r2)

Finder reports: `test-output/qa-find-*-r2/` (audio, balance, perf, robust, softlock, story, ui, visual); fixers:
`test-output/qa-fix-*-r2/` (interact, region-meltbloom, ui, engine, text); re-verification: `test-output/qa-reverify-r2/`
(`repros.sh` re-runs every repro + regression, logs in `repro/`). Integration changes: `docs/INTEGRATION_LOG.md` #60-#62 (conflict-toast text key, TECH_SPEC condition grammar, a flaky
enemy self-test check).
No finding this round was recorded as critical or major (the severities given were minor or polish); all were re-run
anyway. Finders with no defect: perf (no leak, no outlier room), softlock
(reach/fuzz/arena checks clean), audio (apart from the off-screen fade).

| Finding (severity) | Fix (owner) | Re-verified by (result) |
|---|---|---|
| Cinder Geode re-farm: partial hits not saved, a geode paid its full amount again on every re-entry (balance) | interact: per-hit count in flag `geodeHits:<id>`, replayed on rebuild; break clears it | `qa-find-balance-r2/geode_farm.js sh_01 sh_02 3`: 15 / 30 / 0 = 45 = amount, stays broken; `ll_03`: breaks on cycle 2; interact self-test 26/26 (new check) |
| Off-screen positional sfx at full volume (sf_03 Stoker steps 0.5 from 1482 px off-screen) (minor, audio/engine) | engine: `G.sfxAt` fades with distance from the view (`G.sfxGain`), silent beyond 1.5 views; global/boss/arena exempt | `qa-fix-engine-r2/engine_r2_check.js` 23/23 (source + dist); independent probe `qa-reverify-r2/sf03_gain.js` (wraps `G.sfx`): far steps 0.057-0.062, ≈0.4 view out ≤ 0.415 |
| Key labels QWERTY on every layout (ui) | engine `input.js`: printed-key table from `getLayoutMap` + `e.key` | engine_r2_check (AZERTY jump 'W', QWERTZ 'Y', US unchanged) |
| A second tab overwrites newer progress (minor, robust) | engine `save.js` slot stamps + `storage` listener, stale session refuses to save, toast | `twotabs_check.js` ALL PASS (source + dist); `qa-find-robust-r2/twotabs.js`: fresh Continue 4100 cinders + dash |
| Only the first gamepad read (minor, robust) | engine `pollGamepad`: most recently active pad drives | `twopads.js` 330 / 330 |
| `` ` ``/F3 dev overlay in the release build (minor, robust) | engine `debug.js`: toggle only with `?debug=1`/`?test=1` | `backquote.js` on dist: overlay never shown |
| Map: text through title/legend, "Traveler" markers where no NPC stands, widest zoom clipped, legend/hints incomplete (ui, story, visual; legend/hints polish) | ui `map.js` (masked content layer, markers via each NPC's `present()`, overview framing, two-row footer) | `qa-fix-ui-r2/mapcheck.js` OK; `qa-find-ui-r2/mapnpc2.js` markers == NPCs present (ll_02 ri_04 ri_08); story `mapnpc.js` only ri_04 |
| Area/boss cards bleed through / expire under Pause etc. (ui) | ui `UI.blockCover`, cards wait | `cardcheck.js`, `cardbleed.js` |
| Boss lines skipped by Attack mashing in 0.5-0.8 s (ui) | ui `dialogue.js` input guards (0.45 s open, 0.25 s page, 0.4 s complete page) | `mash.js` 1.80 / 1.87 / 2.20 s, each page fully shown ≥ 30 frames |
| Ending 'Skip?' / 'Continue' hidden with hints off (polish, ui) | ui `ending.js` | `endcheck.js` OK |
| Wren 2 assumes Wren 1 met; Pell pitches an owned Waymoth; Thrum's grip line; credits dash (story: Wren minor, rest polish) | text `text.js` (`w2_first`, `w3_first` variants, `sigil:waymoth`) | `qa-fix-text-r2/check.js` PASS (+ r1 check PASS); `wren2.js` → `w2_first`; `pell.js` → `idle_early`; `typo.js` no spaced-hyphen dash |
| Meltbloom vine leaf mats in mid-air + floating mushroom/reeds/statue (visual) | region-meltbloom generator `settleDecor` + hand fixes (decor only) | `floatcheck.js` 0 `mb_` entries (33 left, all known back-layer kinds in other regions); `vinecov.js` 0 / 64 |

Still open from this round (none blocking; owners in brackets):
- [entities/audio] the vertical part of the sfx fade needs `opts.y`; enemy/boss/player/interactable `G.sfxAt` calls pass
  only x, so a source straight above/below the view in a tall room is not faded (helpers: `enemy_base.js`, `boss_base.js`).
- [audio] faint positional sfx within 1.5 views still take their name's 30 ms rate-limit slot (`SFX_RATE_LIMIT`).
- [input] labels stay QWERTY until a key is pressed where `navigator.keyboard.getLayoutMap` is missing (Firefox, Safari).
- [ui/npcs] map markers call each NPC class's `present()` on a stand-in object (no shared `G.NPCs.presentFor`); a
  `present()` reading live-room state would need the map updated.
- [ui] dialogue guards also slow NPC talk: after a press completes a page the next press turns it only 0.4 s later.
- [text] Wren stage 4 has no first-meeting variant (a second `give` would count `long_brand` twice in validate); with
  Wren 1 met and Wren 2 skipped, `w3_meet` opens with "...Blue-flame?" (a nickname she never gave).
- [art] `vine_curtain` always draws its flat leaf mat (mothwood/nave placements unchecked); meltbloom's support check
  runs only in its generator, not in `test_all`.
- [balance] a geode's partial-hit replay uses the current `amount` (only matters if room data changes between versions).
- [tools] the r2 regressions (`qa-fix-engine-r2/engine_r2_check.js`, `twotabs_check.js`, `qa-fix-ui-r2/*check.js`,
  `qa-fix-text-r2/check.js`) are not wired into `test_all` (interact's is, via its self-test).

---

## 2. What does not exist yet

Nothing planned is missing. Open work is polish, human playtesting and listening (§3).

---

## 3. Known issues and open work (most severe first; owner in brackets)

1. **Not verified by humans (highest priority before release):** a continuous play-through now exists, but by a bot
   (`tools/playthrough.js`, §1: New Game → both endings in the real build, real inputs for all movement) — no human has
   played it end to end. The bot neutralises regular enemies (god mode + `G.debug.killAll`, 204 kills), defeats bosses with
   debug damage (each boss fight's difficulty is only bot-estimated, see 2-3) and tops up Ember for 7 plunges (it gains
   none from combat). Audio has never been heard (all tests muted or rendered offline;
   boss intensity layers `musicLayer(1)` only checked by intercepting the calls). No physical gamepad, no browser other
   than Chromium, no real-GPU frame times.
2. **[boss-lucerne] difficulty: tuned, still human-unverified.** Baseline QA retuned form 2 (idle heart 500 px up so
   jump + double jump + up-slash reaches it from the floor; longer rests; fewer pulses — log #50). The reactive no-god bot
   (9 masks, Brand L2, floor only, no Kindle) now wins 2 of 3 fights (227 s / 482 s); god-mode form 2 345-416 s for that
   bot. HP stays 1400 (DESIGN). A human playtest with 7-9 masks + Kindle is still the real test. The builder's own
   `test-output/boss-lucerne/test.js` god-mode `defeat` check (480 s cap) can still time out (the QA copy uses 1200 s;
   not part of `test_all`).
3. **[bosses] bot-estimated only:** Tallowmere (hugging him is comparatively safe; acolyte contact is the main damage),
   the Kiln Mother (phase 2 ≈ 8.5 masks for a 6-frame-lag bot), Vespertine (finite jump windows 0.05–0.36 s; punishes
   jumping under her), Sable 2 hard / Sable 1 gentle, the Matron's 0.44 s phase-2 stab, the Effigy's phase 2.
4. **[tools] margin check added** (`reach --margin`, test_all `reach_margin`; log #45): 0 errors / 0 warnings on the
   world at its default (12 px horizontal, 4 px vertical, no coyote time, 8 px edge inset) and at 24 px. Known limits:
   start positions in the middle of a floor are not perturbed (only ledge edges); at a stricter 40,8 the rooms whose N exit
   is reached by a full jump straight up from a platform at row 5 (dn_03 ch_03 ch_06 ch_07 ch_08 mw_03 mw_07, ~10 px of
   height to spare; deterministic, not a precision move; the plan convention says the last platform at row 3-4) are
   flagged — owners: nave, chandlery, mothwood (optional polish). reach still does not model pogo, knockback,
   enemy-assisted movement or levers pulled inside the same room (required paths must never depend on a pogo).
   Found by the playthrough (log #52-#53, fixed): reach merged a low wall cling into any higher cling node on the same
   face (optimistic by up to the wall height) and named the wrong macro on paths to touch spots. Still open (low):
   **(a)** reach's `arena:<boss>` spot = the body overlapping the trigger, the game starts the fight when the body's
   CENTRE is inside it (ch_09: reach's touch at x 381 did not start the Kiln Mother; one more step in does) — every arena
   was entered fine; **(b)** one reach edge in mb_02 (row-27 deck → W1 side, `jump L dash@30 dj@42 L` from x=1294) works
   only from reach's exact sample (not from ±1 walk frame); the bot met it and took the robust route over the decks (rows
   23 → 17 → 15) — a human has that route too, so no room change.
5. **[text] optional lines:** the Effigy and the Soot Matron have no spoken lines; the Kiln Mother has no `phase2`
   line (her builder suggested `G.Text.bosses.kilnmother.phase2` + `speak('phase2')` in her `grate` transition).
   Writer's call — not invented at integration.
6. **[composer] polish:** the `rime` track's spectrum is dark (little above 2 kHz; may sound dull on small speakers);
   the master compressor flattens section loudness (layer 1 changes texture more than level); battle tracks ≈ 1.5–1.75
   min loops.
7. **[art] visual polish (minor):** dn_09's colossal saint reads as a draped block; dn_10's tunnel band is very dark;
   the rime background draws a band of icicle silhouettes at the top of panoramas/camera windows even without a ceiling,
   and its auto-decor grey `stalagmite` cones can stand on walking floors (ri_02, ri_03, ri_06, ri_08; only via `bgSeed`
   today — a rule option to keep them off narrow ledges is wanted); ri_04's upper cavern and the dark rock under the lake
   are bare; ri_06's drowned forges stand on the floor rather than inside the ice; the resting `ice_spitter` resembles
   the decor crystals; mothwood decor cocoons resemble `cocoon_spawner`s, its rooms are very dark (0.7) and thin silk
   ledges far from lights are faint, mw_07's perch reads squarish, mw_10's chrysalis is only suggested, a few one-way
   ledges lack visible supports (mw_07 west, mw_09 shelves); the chandlery background's tilted ladles pour thin streams
   that resemble the Kiln Mother's stream; the framework's enemy/boss hit flash is a large opaque white silhouette
   (consider subtler for big bosses); Vespertine's gust streaks are plain dashes and a wing tip dips ≈ 40 px under the
   floor line in the blade dash; Lucerne's crown is clipped at the top of the screen during the pulse; Tallowmere's face
   is a glowing mask; sh_03's candle reads as a glossy ridge; lava pools read flat; `boss_test`'s card shows `test`; a
   horizontal grate without a solid frame has floating brackets; the rest pose sinks a few px; `ash_fly` can perch on the
   player's head. Pickup/lamp glows inside a veiled pocket are now fully hidden (log #44) — the cracks are the hint.
8. **[art] Wax and ice one-way platforms have no ceiling hangers / wall brackets** (`PLAT.wax`/`PLAT.ice` don't call
   `platSupports`); built rooms cover it with decor. The art module's auto front decor can draw over enemies.
9. **Performance headroom is thin in stress scenes** (§1). Keep a room's live enemies + projectiles ≲ 25; 4 brutes cost
   ≈ 5.5 ms headless (rooms place ≤ 1). Boss drawing is per-frame paths (Tallowmere ≈ 4–5 ms headless on screen).
   Rooms with secret pockets spend 45–110 ms at load building veil sprites (behind the fade).
10. **Region-level feel notes (accepted by their QAs):** dn_06 — a player arriving from dn_11 who stands still in the
   west dip is hit by the acolyte after ≈ 2.75 s (readable wind-up); acolytes guard lore_dn_2/5/6 (reading is safe);
   ch_03 — walking off the west grate can respawn the player on the east grate (a respawn box touched mid-air; safe);
   ch_04 — the planned ^ strips on the Crucible Wall were left out; ri_08 — releasing left exactly at the Seal Door lip
   drops one row into the top niche before the shaft; mw_02 — the west cocoon's mothlings can come within 10 tiles of
   the sconce (they only hatch with the player within 7 tiles of the cocoon); mw_01's floodwater landmark is decor only;
   meltbloom/flue feel notes from wave 2 (mb_02 Atrium hop, mb_05 thorn bed out of view, flue single palette, sf_09
   faint sacks) still stand; gw_01 secret doorway: strike the wall while holding toward it.
11. **Design notes inherited from modules:** Sable stage 1 uses flag `sable_glimpse_after` if `boss:sable1` is already
   set; Kiln Glass shows the count held; the Lanternway refuses while a hostile (incl. a Gutterwisp) is within 12 tiles
   or the player was hurt/attacked < 3 s ago; no enemy attacks a player standing in a doorway (nave, flue), though a
   travelling bell wave can still reach one; mothlings already out keep fighting after their cocoon dies; the moth knight
   never leaves its patrol range; Lucerne's beams pass through one-way decks; her First Flame uses a local warm-white
   palette; Lucerne replays the ending on re-entry if the game was quit mid-ending.
12. **Engine behaviour to design around:** a flyer whose dive crosses a one-way platform stops on it; crawlers take no
   knockback; a `drip_slime` hung from a `B` tile would float after the tile breaks (guide: never do that); a
   `shard_crawler` placed inside an exit zone or between hazard tiles 1 apart jitters (guide: don't).
13. ~~[enemies-nave] acolyte fling cooldown wart~~ fixed by the baseline QA (log #51).
14. **[engine] debug-only placement:** `G.game.enterRoom('mw_09', {})` (no `place`) puts the player inside solid rock —
   the room has no start/respawn/sconce, so the fallback is the room centre and `freeSpot` does not find air there.
   No gameplay path calls `enterRoom` without a place for that room (respawn = sconce rooms, travel = posts, transitions
   = positions); dev URLs `room=mw_09` without `tx/ty` are affected.
15. **[guttered] gw_12 S1 landing lip** clears the exit boost by 3.4 px (like the fixed gw_10/ri_08), but S1 is not a
   planned upward route and cannot be reached from gw_02 (reach). Optional: lower its lip one row like gw_10.
16. **[lastlight] ll_geo2 on the forge-chimney cap** has 30 px of floor beside it: striking it from the side, the Brand's
   recoil pushes the player off the 10-tile grip column after 2-3 hits. Standing on the geode (it is not solid) works
   (4 hits, `world.js geodes`). Feel note.
17. **[design] cinder economy for 100 %:** guaranteed income (≈ 4 765) is just below the 5 000 needed for every
   Pell/Bramm purchase (+ 710 for Quill's charts); enemies respawn, so it is a short farm — a design call.
18. **[release] browser/platform coverage:** every automated run uses headless Chromium (Playwright) on Linux; Firefox,
   Safari, Edge, Windows/macOS and `file://` storage behaviour outside Chromium are untested. Saves live in the browser's
   localStorage for the page's origin: some browsers give each `file://` path its own storage, so `index.html` and a
   copied `dist/Gutterlight.html` may not share save slots (stated in `README.md`). No mobile/touch support (by design).
19. **[tools] `test-output/qa-package/release_check.js`** (release hygiene: zero console output, overlay gating, test
   params ignored without `test=1`, no network requests) is not wired into `test_all`; run it on `dist/Gutterlight.html`
   after every build that ships.

---

## 4. Guidance for content builders

Read first: `docs/DESIGN.md`, `docs/TECH_SPEC.md`, then the API doc for what you build. Never edit files you
do not own; feature-detect anything missing and report it.

### 4.1 Region rooms (`src/data/regions/<region>.js`)
- Source of truth: `design/world_plan.json` / `design/world_plan.md` / `design/world_map.png`
  (`docs/api/world_plan.md` explains every field). `node tools/lib/roomkit.js --region <region>` lists your
  rooms; `node tools/lib/roomkit.js <roomId>` prints exits (exact cells), paths, spots, contents and notes.
- Write a generator `tools/gen/<region>.js` with `tools/lib/roomkit.js` (`docs/api/roomkit.md`) and emit with
  `RK.emit('<region>', defs, 'src/data/regions/<region>.js')`. Never hand-edit the emitted file. Worked examples:
  `tools/gen/shore.js`, `tools/gen/lastlight.js`, `tools/gen/guttered.js` (wave 1), `tools/gen/meltbloom.js`,
  `tools/gen/flue.js` (wave 2) and `tools/gen/arena_effigy.js`, `arena_sable.js`, `arena_matron.js`.
  roomkit's `put()` throws if a marker would overwrite another marker or a tile (carve first or pass `force`).
- Arena rooms (`gw_05 mb_07 sf_05 dn_07 ch_09 mw_04 ri_07 hs_03`; all built) are **not** yours: they live in
  `src/data/arenas/<boss>.js` (boss builders). Until they exist, `validate` reports them as a warning only.
- Entity props: TECH_SPEC §9.1 + `docs/api/interact.md` (gates are anchored at their bottom-LEFT tile; the
  seal door is centred, 3×6) + `docs/api/enemies.md` (enemy placement). Ground-standers: marker in the empty
  tile directly above the floor. `sh_01` must contain exactly one `{type:'start'}`.
- Motor rules (TECH_SPEC §8.2, `METRICS`): climb ≤ 4 tiles, gaps ≤ 6 without abilities; **dash gates: 9 tiles on
  the critical path / any required traversal (take-off window ≈ 2 tiles), 10 only for optional rewards**;
  grip gates ≥ 6 sheer (use `X` where a wall must not be climbable); wings gates 6–7 up with nothing
  grippable near; oilcloak ≥ 13-wide water or ≤ 3 tiles of air; plunge = `D`. Never require a pogo.
- **Gates must hold against everything a player can own before the gated ability** (reach checks it):
  grip gates even with dash; oilcloak gates even with dash + grip + plunge; wings gates even with
  dash + grip + oilcloak + plunge; plunge gates even with dash + grip + oilcloak + wings.
- **Secrets are veiled automatically**: carve the pocket behind a `B` wall / under a `D` floor and connect it to
  nothing else — the engine draws it as rock (and keeps it off the map) until the B/D breaks. No veil entity. A
  doorway behind a cracked wall that leads into a `secret` plan room is veiled too (roomkit marks the room). Check
  it: the pocket must not show in `test-output/rooms/<id>.png` (smoke) before breaking. Lights/glows inside are hidden
  with the veil; for a glow hint put a small light outside the wall at the cracks.
- Enclosed air in sky rooms (cellars, culverts) shows open sky: back it with `:` tiles (a dim recessed wall).
  One-way decks in sky rooms get stilts automatically (`theme.posts`). If a real landmark prop duplicates the
  region's background motif, set `theme.landmark: false`.
- Lanternway hubs may contain enemies: travel is refused only with a hostile within 12 tiles of the player
  (or < 3 s after being hurt/attacked). Keep hub enemies ≥ 12 tiles from the post or leashed away from it.
- Art: `theme` hints per room (`docs/ART_GUIDE.md` §3), `bgSeed` to vary backgrounds, `dark` overrides.

### 4.2 Enemies (`src/entities/enemies/<region>.js`)
- `G.registerEnemy(kind, cfg/class)` per `docs/api/enemies.md` (behaviour toolkit, telegraph ≥ 0.35 s,
  contact damage 1, HP and cinders per region, drawing with `G.Art.char`). Kinds are fixed (TECH_SPEC §19).
- Lab: `node tools/enemy_selftest.js --kinds a,b,c --region <region> --out test-output/<you>` until ALL PASS;
  look at the pose sheet and in-game shots it writes.

### 4.3 Bosses (`src/entities/bosses/<boss>.js`) and arenas (`src/data/arenas/<boss>.js`)
- `G.Boss.register('<id>', Class)` (`docs/api/enemies.md` §10). Intro/defeat lines, title card, music
  (`effigy/matron → boss`, `sable1/sable2 → sable`, Wardens → `keeper`, `lucerne`), reward cinders, the
  `boss_defeated` stinger and the **Warden Seal** (tallowmere/kilnmother/vespertine) are automatic — do not
  give seals yourself. Sable: `defeatStyle: 'yield'`. Lucerne: `arena.setBoss(next)` before removing a body,
  `stinger: false`, and call `G.game.finishGame()` after the final defeat.
- Arena room: build it with roomkit from the plan notes (floor, platforms, gate columns, `bx/by`, trigger);
  `{type:'arena', boss, bx, by, trigger}` + `arena_gate`s (+ `gw_gate1` for the Effigy).
- Lab: `node tools/enemy_selftest.js --boss <id> [--room <arenaRoom>] --out test-output/<you>` (full arena
  flow with ~40 s of random play, attacks/phases/staggers recorded).

### 4.4 Music tracks (`src/audio/tracks/<id>.js`)
- Format: `docs/AUDIO_FORMAT.md` (§13 composer checklist); reference implementation `src/audio/tracks/title.js`.
  Leitmotif and track roles: DESIGN §8. Boss tracks may define an intensity layer (`G.Audio.musicLayer`).
- Test: `node tools/audio_check.js --only tracks --id <id> [--loops 2] [--layer 1] [--wav]` (levels, NaN,
  loop seam); listen in `tools/audio_lab.html`.

### 4.5 Art polish (`src/art/regions/<region>.js`)
- `docs/ART_GUIDE.md` + `docs/api/art.md`. Preview: `node tools/art_lab.js --regions <region> [--perf]`, or
  in game: `node tools/shot.js --query "test=1&paused=1&room=dev_01&region=<region>" --frames 90 --out test-output/<you>/x.png`.
  Never use `shadowBlur`/`filter` per frame (`tools/audit.js` enforces it).

### 4.6 Content builder checklist (exact commands)

**After every generator run, per room** (replace `<id>`):
```sh
node tools/gen/<region>.js                          # your generator → src/data/regions/<region>.js
node tools/validate.js --room <id>                  # 0 errors (warnings: read them)
node tools/reach.js --room <id> [--overlay]         # 0 errors AND no GATE LEAK warnings; gates are checked against
                                                    # the maximal pre-ability set (header line of the output)
node tools/smoke.js --rooms-only --room <id>        # no errors; look at test-output/rooms/<id>.png (secrets hidden?)
```
**Per region** (all its rooms built):
```sh
node tools/validate.js                              # world: openings matched, ids unique, plan coverage
node tools/reach.js                                 # every built room (cached)
node tools/enemy_selftest.js --kinds <your kinds> --region <region> --out test-output/<you>
node tools/smoke.js                                 # every room toured + new game / continue
node tools/test_all.js --quick                      # nothing else broke
```
**Per boss**:
```sh
node tools/validate.js --room <arenaRoom> && node tools/reach.js --room <arenaRoom>
node tools/enemy_selftest.js --boss <id> --room <arenaRoom> --out test-output/<you>
node tools/test_all.js --quick
```
**Per music track**:
```sh
node tools/audio_check.js --only tracks --id <id> --loops 2     # + --layer 1 for layered boss tracks
node tools/audit.js                                              # every name used in code exists
```
**Before handing off anything:** `node tools/test_all.js` → `ALL PASS`, then `node tools/build.js`.
When the whole world exists: `node tools/validate.js --complete` and `node tools/reach.js --global`.

---

## 5. Content pre-flight (integration, proven before content production; superseded by the real wave-1 rooms)

The real plan room `sh_01` "Ashfall Strand" was built with roomkit by a throwaway generator
(`test-output/integration/preflight/gen_sh01.js`: start mound at col 10, carving `lore_sh_1` at col 18,
1- and 2-tile steps and a 4-tile ledge, a `B` wall hiding the `sh_geo1` geode pocket, an `ash_crawler` at
col 50), emitted to a scratch file and loaded by a test page (`index_sh01.html` = index.html + the scratch
file). Results: `validate --room sh_01` 0 errors (1 warning: neighbour `sh_02` not built); `reach --room sh_01`
3/3 OK; real boot → title → New Game → intro → **sh_01 at the start marker** → wake-up cinematic → control →
walk, read the carving, full jump onto the 4-tile ledge, kill the crawler with the Brand (+22 Ember), break
the `B` wall and burst the geode; no errors (`play_sh01.js`, ALL PASS; screenshots in the same folder).
Nothing was wired into `src/` (the region files remain stubs). A temporary real `sh_01` in `shore.js` (since
removed) exposed a fixture collision in the tools self-test, fixed with `--data-only` (log #7).

## 6. Useful URLs and helpers
- `index.html?test=1&paused=1&room=<id>&tx=&ty=&abilities=all&god=1&mute=1&debug=1&region=<id>&wake=1`
  (`wake=1` plays the wake-up in test mode — on New Game only: `G.game.newGame(0)`, not on a direct `room=`).
  `G.debug.*` per TECH_SPEC §16 / `docs/api/engine.md` §16.
- Secret pockets of a room: `G.World.hiddenPockets('<id>')` (pure, also in Node via `tools/lib/game_data.js`);
  veil state in the browser: `G.game.room.artCache.veil.alpha`.
- Wave-1 integration scratch scripts: `test-output/integration/w1/` (`veil.js` hidden/revealed screenshots,
  `mapveil.js`, `gapsweep9.js` gw_06 take-off sweep, `bgwall.js`, `artshots.js`).
- Screenshots of this integration pass: `test-output/integration/` (`regions_a.png`, `regions_b.png`,
  `poses_sheet.png`, `ui_sheet.png`, `preflight_sheet.png`, `e2e` shots in `test-output/e2e/`).
- Waves-3+4 integration scripts: `test-output/integration/w34/` (`seams.js` real-input seams, `ending.js [sparks]` the real
  ending flow, `veil.js` hidden-pocket crops, `clip.js` 1:1 crop around a tile, `pockets.js` entities inside hidden
  pockets, `decordump.js` auto-decor layout dump, `tiles.js <room> [c0 c1 r0 r1] [--ents]`).
