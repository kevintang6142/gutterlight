# DUCHESS VESPERTINE — Warden of the Wing (module `boss-vespertine`)

Keeper of the Mothwood. A giant, elegant moth: violet wings with four eye-spots, a pale fur mane, feathered antennae,
a small violet flame on her crown and a lavender glow. She loved the Queen's light and has guarded it "since before
your wax was warm". Before the fight she sleeps on a throne of cocoons at the east end of her bower under a slanting
moonbeam. Arena `mw_04` "The Duchess's Bower". Her defeat (`boss:vespertine`) grants the **Seal of the Wing + 300
cinders** (both automatic, `G.Boss`), opens the arena gate, and she comes apart into a swarm of small pale moths that
rise into the vault; the throne stays cold and empty afterwards.

| File | What |
|---|---|
| `src/entities/bosses/vespertine.js` | boss class (`G.Boss.register('vespertine', …)` → `boss_vespertine`), minion kind `vespertine_moth`, projectiles `vesp_roll` / `vesp_dust`, room script `vespertine_bower` (`G.Events`), 14 sfx (`vesp_*`), test hooks `G.Vespertine` (`drawMoth`, `POSES`, `TELE`, constants) |
| `src/data/arenas/vespertine.js` | room `mw_04` — **generated**, do not edit by hand |
| `tools/gen/arena_vespertine.js` | the generator (`node tools/gen/arena_vespertine.js [--print]`) |
| `test-output/boss-vespertine/test.js` | fairness & robustness tests + contact sheets; `dev.js` + `sc_*.js`: dev contact sheets |

## Numbers

| | |
|---|---|
| HP | 600. Expected Brand level **1–2**: L2 (13 dmg) **47 hits**, L1 (9 dmg) **67 hits**. Measured (dodge-and-strike bot, 0.2 s reactions, 6 masks, Kindle when low, no god mode): see *Testing* |
| Phases | phase 2 at 50 %: `ascend` transition (uninterruptible, 2.4 s + 0.5 s rest; contact off 1 s): she gathers herself above the player, wings wrapped, then flares — cry, lavender flash, rings, a 1.4 s darkness pulse, `G.Audio.musicLayer(1)`, projectiles cleared. Then: rests ×0.72, shorter wind-ups, chained swoop (second pass), double gust, 4 dust clouds, moth cap 3, new attack `dash`, a soft lavender aura, brighter eye-spots and crown flame, more shed scales |
| Stagger | after 130 damage (L2: every 10 hits): she drops to the floor, wings fallen, for 2.0 s — the best punish window; she lifts off with a 0.6 s contact grace |
| Damage | 1 for everything (body contact, swoop, dash, roll of dust, dust clouds, mothlings). No 2-damage attack |
| Body | physics box 92×116 (she flies; passes through the one-way silk platforms). Contact = 76×100 around the thorax; strike rect for swoop/dash 100×100; **hurtbox follows the wings** (half-width 80–155 px with the wing spread, 162 px tall) so a jump-slash under a wing lands. Wingspan ~410 px (art scale 0.82) |
| Rest | 0.55–1.0 s between attacks (×0.72 in phase 2) |
| Idle | hovers 360 px beside and ~230–290 px above the player (reachable by a jump-slash under a wing); repositioning never sweeps through the player (crossing within 260 px she climbs to 290 px above their centre, clear of a full jump) |
| Music / reward | `keeper` (automatic), 300 cinders + Seal of the Wing (automatic), stinger `boss_defeated` |
| Mothlings | `vespertine_moth`: HP 9 (one Brand hit), contact 1, no drops, 2 per brood, cap **2** (P1) / **3** (P2), fade after 18 s. Peel off her eye-spots, flutter to 130 px beside / ~122 px above the player's centre (well above head height), glow 0.46 s (`vesp_moth` chirp + glint); the aim **locks at 52 %** of the glow and a dashed streak shows the line; dart 600 px/s through the marked spot (+80 px, never further), then dazed 0.7 s (**harmless for the whole daze** — the punish window — drifting away from the player); a mothling left low beside the player sidesteps before it climbs back (never rises through them). **One dart at a time** (a mothling waits while a sister glows/darts/just landed), **none during the Duchess's swoop/gust/dash/ascend** (except their recovery), and **she does not start an attack while a mothling glows or darts** (waits up to 1.2 s per pause) |

## Attacks (wind-ups ≥ 0.46 s; first wind-ups ≥ 0.5 s)

| Attack | When | Telegraph | Active | Dodge | Punish |
|---|---|---|---|---|---|
| `swoop` | any (favoured > 260 px); cd 1.1 s; **not when the player is cornered** (< 150 px beyond them for her climb-out, i.e. within ~230 px of a wall) | rises to 460 px beside (open side) / 290 px above the player, then wings fold back into a dart shape, small lift, `vesp_swoop`, 0.56 s (P2 0.5, second pass 0.46) | a deep arc (quadratic, slow at the ends) through the player's **standing** spot (aim locks 0.12 s before the dive; a player within 200 px of the floor is swept at standing height), bottom 0.6–0.69 s after the dive starts (dur P1 1.26–1.38 s, P2 1.2–1.3 s). Near a wall the climb-out is **compressed**: same approach and bottom, then she sweeps on low past the player and climbs steeply in the room left (≥ 80 px from the wall), never back up through a player who jumped over her. A player who ran into a corner during the wind-up gets a **cut-off arc** ending 110 px in front of them. P2: she wheels round to the open side and makes a second pass (skipped if the player is now cornered) | **jump** when she starts to drop: clean for full jumps made 0.05–0.36 s (P1) / 0.05–0.32 s (P2) after the dive starts, at every position she swoops; don't run along her path | 0.75 s low hover after the pass |
| `gust` | player low (×2.6); cd 4.5 s; **never while dust clouds are out** | hovers low 420 px beside the player, wings drawn far back and up, leaning back, air and motes drawn in under her wings, `vesp_inhale`, 0.66 s (P2 second beat 0.48) | a wing-beat: wind pushes the player away from her (300 px/s for 1.25 s, only in front of her and below her top edge; running into it still gains ground) and, for a player at floor level (feet < 200 px above the floor — not on a silk platform), a **roll of dust** (64×50, 500 px/s) runs along the floor away from her; P2: a second beat 0.6 s later. A player on a platform only gets the wind (it can blow them off, never into a roll they could not see while falling) | **jump the roll** (better: run toward her and jump it); stay behind or above her to ignore the wind | 0.75 s, wings drooped, sinking |
| `dust` | no clouds out; cd 10 s | rises above the player (240 px beside, 320 px up), wraps herself in her wings, eyes dim, humming, motes gather into her, `vesp_hum`, 0.76 s | flings her wings open (`vesp_dust`, flash): 3 (P2 4) dust clouds drift to the player's height at −300/0/+300 px (P2 + ±600), 0.5 s travel, **0.8 s pulsing warning ring**, then **3 s harmful** (radius 62, pale haze with a dark heart, dashed rim), 0.8 s harmless fade. The bower darkens (room dark 0.55 → 0.86) for ~4.7 s; her eye-spots burn brighter and she sheds extra light, so she stays readable | walk into a gap between rings (176 px wide) during the warning; don't jump into a cloud | the 0.9 s flare after the release |
| `brood` | live moths < cap; cd 9 s | hovers 360 px beside, 250 px up; wings quiver fast, eye-spots flicker, chittering `vesp_brood`, 0.62 s | 2 mothlings peel off her eye-spots (rings) | step out of each dart's line (run away from the glowing moth, or dash under it); one slash kills a mothling | 0.7 s hover |
| `dash` | phase 2; cd 2.4 s | glides level with the player 500 px away (arcs high over the player if she must cross), wings swept back into blades, an **aim line** tracks the player, then **locks white 0.34 s before** she goes (`vesp_blade`, lock chirp), 0.56 s (chained 0.48) | a straight dash at 1500 px/s, length distance + 420 px (≤ 1250); a player within 200 px of the floor is aimed at standing height, so the dash skims the floor; 2 dashes (3 below 25 % HP). **Cornered** (< 150 px past a floor-level player for her body): she checks the dash 150 px in front of them (ring + scales) instead of pinning them against the wall. Changing sides between dashes she first lifts straight up, then arcs over | **jump** at the lock flash (clean for full jumps 0.05–0.3 s after it, chained dashes included, near both walls too; or Smokewing if airborne); on a platform: drop or jump | 0.85 s, drooping, hovering low (centre 130 px over the floor: clear of a standing player's head, in reach of an up- or jump-slash) — the best phase-2 opening |
| `ascend` | phase-2 transition only | see *Phases* | — | — | — |

Every attack has a hard timeout (swoop 8 s, gust 7 s, dust 6 s, brood 5 s, dash 9 s, ascend 2.4 s).

## Telegraphs by mode (difficulty modes)

`teleOn()` (top of `vespertine.js`) = `G.telegraphsOn()` (falls back to `G.game.telegraphs()`, default easy), read only
at draw time (plus cosmetic particles): hitboxes, timings and aim locks are identical in all modes. **Easy** looks and
plays exactly as before. **Standard / hardcore**:

| Attack | Easy (explicit, as before) | Standard / hardcore | Diegetic tell (all modes; lead time) |
|---|---|---|---|
| `swoop` | — (the floor shadow is a general height cue, not a marker; kept in all modes) | unchanged | climbs beside/above, wings fold into a dart, small lift, `vesp_swoop`, 0.56 s (P2 0.5 / 0.46) |
| `gust` | — | unchanged | wings drawn back, leaning back, motes drawn in, `vesp_inhale`, 0.66 s; wind streaks; the dust roll is visible |
| `dust` | `G.warnZone` circle (0.8 s) + a pulsing dashed rim while each cloud settles; a dashed rim on the live cloud | **removed** the warning circle (`cue: 'none'`) and the warn-phase rim; **kept-subtle**: the live (harmful) cloud's rim at 75 % alpha. *Why*: the bower darkens to 0.86 for the whole pulse and the haze has a soft edge — with 3–4 clouds out, the 176-px gaps cannot be judged without the cloud's edge. (The rim marks a live hazard's edge, never a future one.) | rises, wraps herself, eyes dim, motes gather, `vesp_hum`, 0.76 s → wing flare + `vesp_dust`; each cloud drifts to its spot (0.5 s, visible) then **settles and thickens for 0.8 s** before it turns harmful (`vesp_settle`); **added (standard)**: the settling haze starts denser (0.6→1 instead of 0.35→0.8), glows faintly from within and sheds 2.4× the glittering scales |
| `brood` / mothling dart | dashed aim streak (170 px) from the lock (52 % of the glow) | **removed** | the mothling glows (0.46 s, `vesp_moth` chirp, white eyes); **added (standard)**: at the lock it turns its head along the dart line and a white glint lights on its head (≥ 0.22 s before the dart) |
| `dash` | 1400-px aim line, dashed while tracking, solid white at the lock | **removed** | glides level with the player, wings swept into blades, body rotated along the dash line, `vesp_blade` + shake 0.56 s (chained 0.48), lock chirp 0.34 s before; **added (standard)**: at the lock her head flares white and a pale aura pulses around her |
| `ascend` | — | unchanged | (transition) |

Verified (module tele-bosses2, `test-output/tele-bosses2/`): sheets easy vs standard (`cmp_v*.png`, `cmp_moth.png`);
`boss-vespertine/test.js hit dodge flow` copy with `?mode=standard` / `?mode=easy`: ALL PASS (63) each; `enemy_selftest --boss vespertine` in both modes: ALL PASS (11).

## Intro, camera, darkness, defeat

- **Intro**: the arena trigger (cols 10–30, rows 14–23) closes the gate and spawns her on the throne (46, 10) →
  intro lines (`G.Text.bosses.vespertine.intro`; the camera pans toward the throne while they are open) while she
  lifts her head and drifts down → after the lines: a wake cry (`vesp_cry`, ring, shake, scales), flare pose, then
  she glides to her station (introTime 1.6 s).
- **Camera**: during the fight the camera follows a stand-in for the player biased toward her (≤ 400 px across,
  ≤ 160 px up) so her wind-ups are on screen; released on defeat / room exit (`releaseCam`).
- **Darkness**: `room.dark` is modulated at runtime for the dust pulse (and the phase flare) and restored on removal
  / room exit (`restoreWorld`).
- **Defeat** (`defeatStyle 'custom'`): 1 s slow-mo → defeat lines → she sinks to the floor, wings fallen, and
  dissolves into ~90 small pale moths that rise into the vault (`vesp_release`); `finishDefeat()` at 1.3 s (flag, seal,
  cinders, arena end, music), removed when the dissolve is done.
- **Low passes** (swoop bottom, floor-skimming dash, stagger, dash recovery): her drawing is clipped at the floor
  line, so the wing tips pass behind the floor's front edge instead of over it.
- **Room script `vespertine_bower`** (event entity at the throne): the cocoon throne, the moonbeam and its floor pool,
  the silk ropes holding the three platforms, the sleeping Duchess before the fight, cocoon glow that rises with the
  fight and goes cold after her defeat.

## Room `mw_04` (per the plan notes)

64×27, single entrance W1 (col 0, rows 21–23) from `mw_06.E1`. Floor top row 24, flat cols 1–62; rows 3–23 open
over the whole width; vault rows 0–2. One-way silk platforms: row 18 cols 10–17 and 46–53, row 13 cols 28–35.
`arena_gate` `mw_ag1` (w1 h4, side right) at col 2 rows 20–23 under a solid lintel (cols 1–2, row 19). `arena`
entity: boss `vespertine`, bx 46, by 10, trigger [10, 14, 30, 23]. No tile hazards. Decor: hanging cocoons, webs,
silk curtains (back layer), wick-reeds, glowing wax-caps, crystals, husks of earlier challengers; lavender lights.
Her flight bounds (`geom`) treat the arena gate as a wall (west limit x 120, not the room edge at 40).
Theme: `{ fg: false, decor: 0.5, weatherDensity: 0.7, landmark: false, bg: 'shaft' }`, dark 0.55 — `bg: 'shaft'`
because the mothwood backdrop otherwise paints a giant resting moth that would double the Duchess (the mothwood theme
does not honour `landmark: false`).

## Testing

```
node test-output/boss-vespertine/test.js [sheet story hit dodge defeat chaos flow]
node tools/enemy_selftest.js --boss vespertine
node test-output/boss-vespertine/dev.js test-output/boss-vespertine/sc_full.js out.png   # dev sheets
```

Last run: **ALL PASS (78)** (`test-output/boss-vespertine/test_run.log`), zero console errors.

- **sheet / story**: `sheet_attacks1.png` / `sheet_attacks2.png` (every attack's wind-up + active frames, both
  phases), `sheet_story.png` (idle, stagger, phase-2 wrap + flare, P2 hover, defeat droop → dissolve → seal card).
- **(a) hit** (11): every attack (both phases, both sides, dash vs a player on a platform) hurts an idle player, for 1.
- **(b) dodge** (42): reactive scripted dodges — jump 0.2 s after the swoop starts its dive (also with 0.28 s / P2
  0.26 s reactions), jump each roll by time-to-contact, walk to a ring gap 0.2 s after the clouds settle, run out of
  a glowing mothling's line, jump at the dash's lock flash (also 0.28 s) — from the middle, near both walls and with
  her right above the player: all clean.
- **(c) defeat**: arithmetic L1 67 / L2 47 hits; dodge-and-strike bot (no god mode, 6 masks, heals with Kindle):
  L2 3/3 won in 90–121 s (1–3 masks lost), L1 2/2 won in 126–147 s (2–4 masks lost).
- **(d) chaos**: 3 min of random input (god mode, boss chipped through both phases, re-fought): 0 errors, never out of
  the bower, longest attack 6.2 s, ≤ 2 mothlings, 2 full defeats, darkness restored, no lock / camera leak.
- **(e) flow**: gate open + arena waiting → trigger at col 10 closes the gate → intro lines, card, `keeper` → phase 2
  → defeat lines → flag + Seal of the Wing + 300 cinders → gate open, music back, she is gone, darkness and camera
  restored → re-entry inert (arena done, no boss, cold throne).
- `tools/enemy_selftest.js --boss vespertine`: 11/11 (9 telegraphs, min 0.46 s).
- **QA suite** (`node test-output/qa-boss-vespertine/qa.js`, module qa-boss-vespertine): swoop sweep over 10 player
  positions (both walls included) × 3 start points × reactions 0.05/0.2/0.3 × both phases (plain full jump), the swoop
  still hits an idle player everywhere it is used, the cut-off arc, dash sweeps (both walls, 3-dash variant), gust
  from the floor and from the platforms, dust clouds + 3 mothlings (gap dodger, 0.3 s), death in P1 / during a P2 dust
  pulse → respawn → fresh re-fight → win, camera (no wind-up off-screen), the `mw_06` ↔ `mw_04` seam.

## Notes for other modules

- `G.Vespertine` exposes `drawMoth(ctx, x, y, pose, t, opts)` and `POSES` (e.g. for a lore tablet or the ending).
- The `vespertine_moth` kind is registered with `G.registerEnemy` and works outside the arena (it hunts any player).
- Art: the mothwood theme now honours `theme.landmark:false` too (integration w3/4); mw_04 keeps `bg: 'shaft'`, which also hides the backdrop moth.
