# LUCERNE, the Everlantern — final boss + endings (module: boss-lucerne)

Files: `src/entities/bosses/lucerne.js` (boss, both forms, projectile, panes, FX layer, room script, sfx),
`tools/gen/arena_lucerne.js` → `src/data/arenas/lucerne.js` (arena room hs_03 "The Heartwick"),
`test-output/boss-lucerne/test.js` (fairness & robustness tests + contact sheets; `crop.js` / `compose.js` are
sheet helpers).

## Arena hs_03 (64×36, region sanctum) — exactly per plan
- Single entrance W1 (col 0, rows 30-32) → hs_02.E1. Floor top row 33 (rows 33-35 solid) flat across cols 1-62; ceiling
  rows 0-1; east wall col 63. `arena_gate` **hs_ag3** (w1 h4, `side:'right'`) at col 2 rows 29-32 under the solid lintel
  at row 28.
- One-way decks (plan rows/cols): row 27 cols 8-15 and 48-55 (on crystal stilts), row 21 cols 20-27 and 36-43 and
  row 15 cols 28-35 (hung on gold chains from the cage). Supports are drawn by the room script.
- `arena`: boss `lucerne`, bx 44, by 32, trigger cols 12-36 rows 22-32. No reward pickup: victory plays the ending.
- Event `lucerne_heart` (z −12): the Everlantern (gold cage rows 2-12 around the white First Flame), deck supports,
  the praying queen before the fight, the phase-2 chain, ending FX on the cage and the after-state (shattered cage +
  free white flame for `gutterlight`, the cage around a blue flame for `undying`).
- Dressing on the back layer only (windows, candelabra, candle clusters, statues, banners) + lights. The floor crystal
  decor of the first draft was removed: it read exactly like her crystal-spike attack.
- `node tools/validate.js --room hs_03`: 0 errors (1 warning: hs_02 not built yet); `node tools/reach.js --room hs_03`: OK.

## The fight — HP 1400 (one bar across both forms), expected Brand L2-3
Hits to kill: L2 (13 dmg) 54 + 54 = **108 hits**, L3 (17) 42 + 42 = **84**, L1 (9) 156 (spells 15 help). Form 1 cannot
drop below 700 HP (`modifyDamage` clamp), so the split is always exact. Stagger: form 1 every 210 dmg for 2.1 s (she
kneels on the floor), form 2 every 230 dmg for 2.6 s (the heart's chain slackens and it crashes to the floor — hittable
from the ground). All damage 1, except the form-2 sweep lasers (2). Every attack has a pose/face tell + its own sfx +
an on-screen telegraph (≥ 0.5 s).

### Form 1 — Queen Lucerne (60×136 box, hovers 34 px above the floor)
| attack | telegraph | active | dodge | punish |
|---|---|---|---|---|
| `beam` | glides to 300-430 px away, staff aims; a thin guide line tracks the player (0.85 s first / 0.6 s next), locks 0.45 s before firing (`lucerne_lock` + bright line) | 0.38 s lance (32 px wide) along the locked line; late (≤ 78 % HP): 2 lances | move/dash out of the locked line (toward her for slanted lines) | 0.7 s recovery |
| `motes` | arm raised, crown gathers light (0.7 s) | 4 (late 5) `lucerne_mote`s fan out, home for ~1.35 s (290 px/s, slower than the Wickling), then fly straight; destroyable | outrun them while they home, then jump / step out of the straight line, or pop them with the Brand | 0.75 s |
| `spikes` | staff raised (0.55 s), then **cracks**: dark glowing fissures + crystal tips + the lit column, 0.75 s | crystal spikes 128 px tall under the player (on any surface) + 2 (late 3) on the floor nearby | step out of the fissure | she hovers still |
| `nova` (only when the player is within 175 px) | gathers light, dashed circle of the blast radius (0.6 s) | radius-165 burst around her | dash/run out of the circle | 0.7 s |
| `dive` | blinks out (0.3 s), reappears high above the player (feet ≥ 90 px above their head, never inside a player on a deck; harmless by touch until apart); a light column tracks the player (280 px/s), locks 0.5 s before the fall (0.9 s total) | falls; 180×92 impact + two floor waves (470 px/s, 42 px tall) | leave the column; jump the waves | kneels 1 s on the floor |
| `ascend` (forced at 50 %) | reels, rises to the cage (player locked, the camera tilts up to the Everlantern), phase-2 lines, white-out fusion | → form 2 (`arena.setBoss(next)` before the old body is removed) | — | — |

### Form 2 — the Everlantern (150×172 glass heart on a chain; phase 3 at 20 % HP)
`G.Audio.musicLayer(1)` on the fusion. Golden **panes** (`lucerne_pane`, one-way, 120 px) fade in (dashed outline 0.6 s,
not solid) at ±560 px / 320 px up and ±400 px / 600 px up, last 5.2 s, blink 0.85 s, then shatter — extra footholds.
| attack | telegraph | active | dodge | punish |
|---|---|---|---|---|
| `sweep` (mode chosen by where the player is) | heart moves to its spot, dashed wedge of the swept area + guide line (1.05 s; 2nd sweep 0.8 s) | **down** (heart 360 px up): two lasers fan from straight down to ±60° (1.45 s); **up** (heart 160 px up): they fan upward; dmg 2; P3: down+up / up+down | down: leave the middle (|x−mid| > ~650) or climb above the heart; up: drop to the floor (the heart is low: up-slash it from below) | 1 s |
| `pulse` | the heart moves to 560 px above the floor (stays on screen), darkness falls (room dark 0.9), it inhales (1.0 s); the **lanes** (dashed gap lines) of the next ring are always shown | 2 (P3 3) light rings, 520 px/s, 1.25 s apart, each with 3 gaps (0.48 rad). `planRings()` plans one gap per ring as a span of floor x: ring 1's span starts 30-280 px from the player (never on them); each next span is reachable from ANY point of the previous span within 230 px and leaves ≥ 50 px of it unsafe; the other gaps never overlap the previous planned gap. Harmless by touch for the whole pulse (players on the row-15 deck drop past it) | move into the shown gap of each ring | 0.9 s |
| `beam` | as form 1 (0.8 s first, 0.65 / P3 0.6 s next; lock 0.45 s) | 3 (P3 4) lances from the heart | as form 1 | 0.7 s |
| `motes` | the face's mouth opens, light gathers (0.7 s) | 6 (P3 8) motes | as form 1 | 0.75 s |
| `spikes` | (0.5 s) + cracks 0.75 s | under the player + 4 (P3 6) on the floor | as form 1 | 0.55 s |
Contact: the heart is harmless by touch while it relocates for a sweep/pulse, during its descent after the fusion, while
staggered (it crashes to the floor) and afterwards until the player is apart from it.
Idle: the heart hangs ~500 px above the floor (baseline QA; was 460), drifting toward the player (60 %): hittable from the row-21 decks, the
panes, or with wings + up-slash from the floor.

### Defeat and the endings
`defeatStyle:'custom'`, `stinger:false`. Killing blow → slow-mo → defeat lines → the heart sinks, the glass cracks;
at 1.9 s her track fades to silence over 3 s, then `finishDefeat()` (flag `boss:lucerne`, save, `bossDefeated`, arena end:
gate opens; the arena's region-music restore is swallowed so the finale stays silent, ambience kept). Then
the ending beat (player locked as `lucerne_end`, camera rises to the cage):
- **gutterlight** (`progress.sparks.length >= 6`, via `G.game.endingId()`): six sparks circle the Wickling, fly to the
  cage, it cracks and shatters (white-out), the First Flame burns free.
- **undying**: the Everlantern opens and draws the Wickling's blue flame in; its heart turns blue.
Then a fade and `G.game.finishGame(id)` (marks `progress.completed`/`ending`, saves, `G.UI.playEnding`, title). A guard
finishes the ending even if the fade callback never arrives. If the game is quit/closed during the ending beat (the `boss:lucerne` flag is saved at 1.9 s, before
`finishGame`), entering hs_03 again plays the ending after 1.2 s (`lucerne_heart.resumeEnding`): the world can always be
finished. Re-entering hs_03 after completion is inert (arena
`done`, gate open) and shows the after-state — except for a **rematch**: a save completed with an ending that
`G.game.endingId()` would now change (finished 'undying', has since gathered all 6 sparks) re-arms the hall
(`lucerne_heart.rearm`: this visit's arena `done` → `wait`, its `defeated` judged by this fight's boss, not the saved
flag; she waits before the white Everlantern). The save is not touched until the win (boss record and completion % stay),
and winning plays the new ending through `G.game.finishGame`, so the true ending stays reachable on that slot.
**Integration note (qa-reverify-r1):** in normal play the engine already rewinds a finished save on Continue
(`G.game` `rewindFinishedRun` in `migrate`: `completed`/`ending` cleared, `boss:lucerne` removed, respawn at the last
sconce; `endingsSeen` keeps the slot complete), so hs_03 holds a normal, un-fought Lucerne and `rematchDue()` is false.
The rematch above is a defensive fallback for a progress object that is completed without passing through `migrate`
(e.g. tests that set `G.game.progress` directly).

### Presentation
- First intro of the session: the camera tilts up to the Everlantern for 2.2 s while she prays (player locked), then
  back down as she rises; later attempts skip the tilt. Intro lines (3), phase-2 lines (2), defeat lines (2) from
  `G.Text.bosses.lucerne`.
- While any of her cinematics locks the player (intro, ascension/fusion, ending) the player is kept invulnerable
  (`shieldLocked`), e.g. against their own Gutterwisp left in the hall by an earlier attempt.
- The First Flame uses a local warm-white flame palette (`G.Art.FLAMES.lucerne_first`, added on first use); the
  shared `white` palette has blue-grey edges that read as the Wickling's blue flame.
- Camera: a proxy target keeps her in frame (`updateCam`); `'reveal'` mode for the cinematics.
- 23 sfx `lucerne_*` (charge, lock, beam, motes, release, raise, crack, spike, gather, nova, blink, dive, slam, cry,
  fuse, sweep_charge, sweep, inhale, pulse, pane, glass, shatter, pull). Music `lucerne` (G.Boss default mapping).

## Tests (`node test-output/boss-lucerne/test.js [sheet hit dodge defeat chaos flow]`)
- `hit`: 15 cases (every attack, both forms, late/P3 variants, on the floor and on decks) hurt an idle player (3 runs each).
- `dodge`: the same 15 cases avoided by a reactive bot (0.2 s reaction, only on-screen information), 4-6 start
  positions each (`DODGE_N=6`).
- `defeat`: arithmetic; god-mode fights with real Brand hits at L2 (108 hits) and L3 (84 hits) win and fire the
  ending; a no-god bot fight (info only — the bot is not a good player).
- `chaos`: 180 s random inputs + chip damage, re-fought after each defeat: no errors, never outside the hall, never stuck.
- `flow`: both endings (6 / 3 sparks) from the west door through reveal, intro, split, fusion, phase 3, defeat, ending;
  a rematch (save completed 'undying' + 6 sparks → full fight → 'gutterlight', boss record kept during the fight); the
  defeat fades her track straight to silence (music log ends `lucerne, null`); re-entry inert for both after-states
  (undying with < 6 sparks).
- Lab: `node tools/enemy_selftest.js --boss lucerne --room hs_03 --out test-output/boss-lucerne`.

## Test hooks
`G.Lucerne = { NUM, COL, QPOSES, geom, surfaceBelow, beamTouches, Lucerne, drawQueen, drawLantern }`.
Spawning a body by hand: `{type:'boss_lucerne', boss:'lucerne', form: 1|2, noAutoStart:true}`; form 2 accepts
`startHp`. Live hazards are in `boss.hz` (spikes, rings), beams in `boss.beams`, telegraph shapes in `boss.wedge /
nova / column / lanes`.

## QA pass (module qa-boss-lucerne)
Fixes applied to `src/entities/bosses/lucerne.js` (pre-QA copy: `test-output/qa-boss-lucerne/lucerne.orig.js`):
- dive: she reappears above the player's head (never on a player standing on a deck) and is harmless by touch until the fall.
- form 2: harmless by touch while relocating for the sweep/pulse, during the descent after the fusion, the whole pulse and
  the stagger crash; `_sepNoTouch` separates without damage when contact comes back on.
- beam: lock 0.36 → 0.45 s; guide 0.85/0.6 s (form 1), 0.8/0.65/0.6 s (form 2) so a 0.3 s reaction steps out.
- pulse: heart at 560 px (on screen), span-based `planRings()` (next gap ≤ 230 px from any point of the last one).
- she is shielded while her cinematics lock the player (no wisp/hazard damage on a locked player).
- `resumeEnding`: a quit mid-ending-beat (flag saved, game not completed) plays the ending on re-entry.
- First Flame uses a warm-white palette (`lucerne_first`); spike warning columns brighter; pulse lanes alpha ≥ 0.42.
QA harness: `node test-output/qa-boss-lucerne/qa.js <scenario...>` (divespawn staggerfall deathrefight seam fusiondeck
wisplock resume pulsestress pulsedecks pulsetop reachable perf godwin f2rate difficulty) + `test.js` (copy with a 0.3 s
reaction option, `REACT=`).

## Baseline QA balance pass (module qa-baseline)
Measured with the boss QA's reactive dodge-and-strike bot (`test-output/qa-baseline/lux/lux.js`: 0.2 s reaction, floor
only, never uses the decks, panes or Kindle; 9 masks, Brand L2). Before: god-mode form 2 took 830 s (the idle heart sat
where a double jump's head met its contact box, so the floor bot could only strike it during the upward sweep and the
stagger; the pulse — when the heart cannot be struck — filled ~27 % of form 2); without god mode the bot never won
(492-635 HP left). Changes (form 2 only; HP stays 1400 per DESIGN): idle height `IDLE2_H` 460 → **500** (a full jump +
full double jump + up-slash from the floor reaches the heart's bottom without touching its contact box at any bob
phase; still side-slashable from the row-21 decks); `rest` [0.6, 1.05] → **[0.8, 1.25]**; `pulse` weight 2.4 → **1.7**,
cooldown 8 → **11** s. After: god-mode form 2 345-416 s for the floor bot (a deck-using human is faster); without god
mode the same bot **won 2 of 3** fights (227 s / 482 s, 7-8 of 9 masks lost, no Kindle). QA suite
(`test-output/qa-boss-lucerne/test.js hit dodge chaos flow`) ALL PASS 49; `enemy_selftest --boss lucerne` ALL PASS.
Still unverified by a human (STATUS §3).

