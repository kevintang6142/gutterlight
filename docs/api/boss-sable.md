# SABLE, the Unlit — two duels (module `boss-sable`)

Queen Lucerne's daughter: tall, slender, jet-black wax, long red scarf (verlet cloth), hooked snuffer-spear, never lit
(two small white eye-points, a dead black wick). One class, two duels.

| File | What |
|---|---|
| `src/entities/bosses/sable.js` | boss class `G.Sable` registered as `boss_sable1` and `boss_sable2` (`G.Boss.register`), projectiles `sable_hook` (the whirling spear and its smoke copies) and `sable_frost` (ground frost line), 14 sfx `sable_*`, room event script `sable_wait` |
| `src/data/arenas/sable1.js` | room `mb_07` "The Moonlit Lawn" — **generated**, do not edit by hand |
| `src/data/arenas/sable2.js` | room `ri_07` "The Last Guard" — **generated** |
| `tools/gen/arena_sable.js` | the generator (`node tools/gen/arena_sable.js [--print]`) |
| `test-output/boss-sable/test.js` | fairness & robustness tests + contact sheets (`diag.js`: jump-timing sweep for one attack) |

## Numbers

| | Duel 1 `sable1` (Meltbloom) | Duel 2 `sable2` (the Rime) |
|---|---|---|
| Expected player | Brand L0–1, 5 health, Ember Bolt, **no dash** | Brand L2–3, all movement abilities |
| HP | 230 → **46 hits at L0**, 26 at L1 (18 / 14 at L2 / L3) | 800 → **62 hits at L2**, 48 at L3 |
| Phases | 2 at 50 % | 2 at 60 %, 3 at 30 % |
| Stagger | after 60 damage: 1.3 s | after 130 damage: 1.2 s |
| Rest between attacks | 0.5–0.9 s (×0.78 in phase 2) | 0.45–0.8 s (×0.88 / ×0.76); **strings**: follow-ups after 0.22 s with shortened wind-ups (≥ 0.3 s; lunge ≥ 0.42, whirl ≥ 0.45), then a real pause |
| Damage | 1 for everything | 1; the dive (fall + impact) deals **2** (signature heavy attack) |
| Body | 30×100 px hurtbox; contact box lowered while she lunges/crouches; no contact before the fight starts or while dying | same |
| Music / reward | `sable` (automatic, `musicLayer(1)` at phase 2), no cinders; `boss:sable1` unlocks the Flare Dash shrine in `mb_06` (region builder) | `sable`; `boss:sable2` → npc `sable` stage 2 in `ri_08` (interact module) |

## Attacks (telegraph = wind-up pose + `telegraph()` glint at the hook + own sfx)

| Attack | Duels / phase | Telegraph | Active | Dodge | Punish |
|---|---|---|---|---|---|
| `lunge` | both | spear drawn back, deep crouch 0.56 s (sable2 0.48; combo ≥ 0.42), `sable_draw` | a thrust across the hall (980 / 1060 px/s) to 150 px past the player (max 560 / 640 px, stops at walls); phase 2 a second lunge after turning (0.38 / 0.36 s wind-up); sable2 phase 3 sometimes a third | **jump over her** (measured window ≈ 16 frames at 420 px; at close range jump during the wind-up) | stretched out 0.5 / 0.42 s |
| `hook` | both (needs ≥ 230 px behind the player and ≥ 200 px distance) | spear cocked over the shoulder 0.56 s (0.5), `sable_cock` | the spear whirls out **low** (centre 34 px above the player's ground), turns 175 px beyond the player, rises and comes back **high** (142 px) to her raised hand; sable2 phase 2+: two smoke copies follow (high at +0.8 s, low at +1.4 s — spaced so a full jump over the low pass lands before the high one; they dissipate at the far end, the real spear waits for them) | jump the low pass(es), stay down for high ones | **unarmed** until the catch (~1.5–2.5 s) |
| `dive` | both | deep crouch 0.52 s (0.46), `sable_leap` | leaps to the vault above the player, hangs 0.44 s (0.36; combo 0.32; +0.12 s when the mark is within 140 px of a wall — a cornered player can only leave one way) while the landing spot is **marked** (dark ring, white chevrons, dashed line), dives along the line (≥ 42° steep, through one-way petals); sable2 phase 2+: frost lines run out both ways 0.32 s after the impact | walk out of the mark, jump the frost lines | spear stuck in the floor 0.6 / 0.46 s |
| `whirl` | both (player within 300 px, not high above) | spear spun up overhead 0.62 s (p2 0.56, sable2 0.52; combo ≥ 0.45) with a dashed ring showing the reach, `sable_smoke` | smoke disc r 116–145 px for 1.0 / 1.15 s, drifting after the player (85–170 px/s) but **never closer than r + 60 px to the wall behind the player** | back away (or dash) | dizzy 0.62 / 0.45 s |
| `frost` | sable2 | spear raised point-down 0.55 s, cold mist, `sable_chill` | driven into the floor: a frost line races at the player (560 / 620 px/s); phase 3 both ways | jump it | 0.55 s |
| `rising` | sable2 (player above her, within 170 px) | low crouch, spear up, 0.46 s | straight leap with the spear overhead (anti-air / anti-pogo) | step out of her column | landing 0.42 s |
| `evade` | both (player within 120 px) | — (harmless) | back-hop away (footwork); in sable2 often chains into a lunge/hook/frost | — | — |
| `flourish` | phase changes (uninterruptible) | — | spear spun overhead, the butt struck down (smoke ring, flash); Rime phase 2: the frost cracks off her scarf (it flows again), eyes turn ice-blue; phase 3: frost aura | — | — |

Strings (sable2): after `lunge` → dive/hook/whirl/frost, `dive` → lunge/frost/dive, `frost` → dive/lunge, `whirl` →
lunge/frost, `rising` → dive/lunge, `evade` → lunge/hook/frost. Chance 40 % / 65 % / 85 % per phase, up to 2 follow-ups
in phase 3. Follow-ups re-check eligibility (hook room, player height).

## Fight flow

- Before the duel the event `sable_wait` draws her at her spot (spear upright, scarf in the wind; frozen stiff in the
  Rime) — hidden while the live boss exists, gone once `boss:<id>` is set.
- Trigger (cols 24–40) → arena gates shut (east `arena_gate`; the west `gate` is shut until the victory anyway) → she
  spawns on her waiting figure → the camera pans to her (player locked) → intro lines (`G.Text.bosses.sable1/2.intro`)
  → spear flourish, boss card, music → control returns 0.65 s later.
- Defeat (`defeatStyle: 'custom'`): slow-mo shudder →
  - **sable1**: half-kneel, defeat lines, rises, turns away, springs up into the dome and vanishes in smoke and red
    embers; the victory is recorded then (gates open, stinger).
  - **sable2**: kneels with the spear planted (no lines — her yield is `npcs.sable_2` in `ri_08`); the victory is
    recorded at once; after ~2.7 s she rises, head bowed, and withdraws into the snow.
- Player death mid-fight: the room is rebuilt (arena `wait`, she waits again).

## Rooms (per the plan notes)

Both 64×18: floor surface row 15 (cols 1–62), ceiling rows 0–1, hall cols 4–59 open rows 2–14, door alcoves rows 11–14
under solid lintels (row 10, cols 0–3 / 60–63). West gate `mb_gate9` / `ri_gate9` (`gate`, col 2, `opens:
boss:sable1|2`), east `arena_gate` `mb_ag2` / `ri_ag2` (col 61, side left). `arena {boss, bx:12, by:14, trigger:[24,6,40,14]}`,
event `sable_wait` at (12,14). Platforms (`=`): `mb_07` cols 14–19 and 44–49, **top row 11** (deviation, see below);
`ri_07` cols 12–18 and 45–51, top row 10. Dressing back-layer only (giant wax flowers, fountain, vines, statues,
grass / frozen waxen, broken columns, ice spires, crystals, drips) + lights. No hazards.

- `validate --room mb_07,ri_07`: 0 errors (warnings: unbuilt neighbours, `plan-content unplanned gate:<id>9`).
- `reach --room mb_07,ri_07`: 7 ok each, 0 warnings.

**Deviations.** (1) `mb_07` petal platforms top on row 11 instead of 10: at duel 1 the player has no dash/wings and the
motor's maximum ledge is 4 tiles, so a row-10 platform (5 up) could never be the "dodge option" the notes ask for.
(2) The west door uses a boss `gate` (like the Effigy's `gw_gate1`) instead of an `arena_gate`: an open `arena_gate`
made `reach` report boss-token GATE LEAKs (the way west is meant to be shut until she is beaten); now reach is clean and
validate shows one `plan-content` warning per room instead.

## Testing

```sh
node tools/gen/arena_sable.js && node tools/validate.js --room mb_07,ri_07 && node tools/reach.js --room mb_07,ri_07
node tools/enemy_selftest.js --boss sable1 --room mb_07 --out test-output/boss-sable/lab
node tools/enemy_selftest.js --boss sable2 --room ri_07 --out test-output/boss-sable/lab
node test-output/boss-sable/test.js [sheet attacks story hit dodge defeat chaos flow]
node test-output/boss-sable/diag.js sable1 lunge 1 420 22 16      # which jump frames avoid one attack
```
`test.js` checks (real arenas, real player motor): (a) every attack in each phase variant hurts an idle player (evade is
harmless); (b) a reactive bot (0.2 s reaction to her wind-up, 0.15 s to marks / the whirl ring; left/right/jump, plus dash in
duel 2) avoids every attack from 6 player offsets × 4 boss spots (duel 2 also with combo-length wind-ups), only where the
scheduler would actually pick that attack; (c) hits-to-kill table and full fights by a dodge-and-strike bot without god
mode (L0, L1, L2, L3); (d) 90 s of random input per duel (god mode, HP chipped through every phase): no errors, she stays
inside the hall, no state lasts > 8 s; (e) arena flow: waiting figure, trigger, gates, camera, lines, card, music,
Brand kill, defeat lines / kneel, flag, gates open, music back, stinger, inert re-entry.
Contact sheets: `sheet_poses.png`, `sheet_attacks_sable1.png`, `sheet_attacks_sable2.png`, `sheet_story.png`.

## Notes for other modules

- `G.Sable.POSES`, `G.Sable.drawSable(ctx, pose, opts)`, `G.Sable.drawScarf`, `G.Sable.rig` can draw her anywhere
  (e.g. cutscenes), in the local frame (feet at 0,0, facing right).
- The bot is a lower bound on difficulty (perfect information); human difficulty is not measured.

## QA (module `qa-boss-sable`)

`node test-output/qa-boss-sable/qa.js [views staggerhook phasestagger alcove death killstates chains perf]` — stagger while
the spear is out, a phase change and a stagger on the same hit, the door alcoves are no safe spot, death → respawn →
re-fight, the killing blow in every attack state, sable2 strings vs a reactive bot, frame cost. Timing sweeps (jump
windows / reaction budgets): `hooksweep.js`, `hooktl.js` (triple-hook timeline), `lungesweep.js`, `lunge2sweep.js`,
`wavesweep.js`, `divex.js` (dive lands on its mark). Fixes made in QA are listed in `test-output/qa-boss-sable/notes.md`.

## Telegraphs by mode (difficulty modes; framework: docs/api/enemies.md §6.1)

Easy draws everything exactly as before. Standard / hardcore hide the explicit markers (draw-time `G.telegraphsOn()`;
timing identical in all modes). No kept exceptions: in both arenas (mb_07, ri_07) she stays in view at the vault.

| attack | easy | standard / hardcore | diegetic tell (all modes unless noted) |
|---|---|---|---|
| `dive` | landing ring, white chevrons, dashed dive line | removed | deep crouch 0.52 / 0.46 s + `sable_leap`; the leap to the vault; **standard only (new)**: while she hangs (0.32–0.56 s) she flares — a halo around her + the hook's hot glint — replacing the mark; `sable_dive` as she drops; she dives at where the player stood when she started hanging |
| `whirl` | dashed reach ring during the wind-up | removed | spear raised and spun up 0.62–0.45 s, `sable_smoke`, smoke gathering around her at the whirl's radius (particles) |
| `lunge`, `hook`, `frost`, `rising`, `evade`, `flourish` | — (no explicit marker) | unchanged | wind-up pose + `telegraph()` glint + own sfx; hooks / frost lines visible in flight |
