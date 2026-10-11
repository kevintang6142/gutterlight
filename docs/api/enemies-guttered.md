# The Guttered Ward enemies: telegraphs by mode (module: tele-enemies)

Source: `src/entities/enemies/guttered.js` (snuffed_walker, snuffed_lancer, drip_fly, wick_crawler). See
`docs/api/enemies.md` (framework, §9 example enemies) and `docs/api/region-guttered.md` (placement). This file holds
only the per-mode telegraph table.

## Telegraphs by mode (easy / standard / hardcore)

The difficulty modes (`G.game.difficulty()`; `G.telegraphsOn()` is true only in Easy) change only **explicit** telegraphs: drawn geometry that outlines where or
when damage lands (floor zones, landing marks, aim/trajectory lines, hitbox previews, danger tints). Those draw only
while `G.game.telegraphs()` (alias `G.telegraphsOn()` in enemy_base) is true, which means easy mode only. The
telegraph audit (module tele-enemies) found **no explicit marker on any of these enemies**. Every tell below is
**diegetic**: the attacker's own wind-up pose, a glow or glint on its body or weapon (`telegraph()` anchors it on the
body, weapon tip, lantern, bell or pot), its sound cue, the wind-up shake, particles it emits, or projectiles forming on
it and visible in flight. So all three modes look and play the same, with the same timing. Nothing was removed and
nothing was kept-subtle. Verified: `test-output/tele-enemies/sheet_guttered.png` shows easy and standard side by side
with seeded randomness and 0.00 % pixel difference at every wind-up. The lab self-test passes in all three modes
(`test-output/tele-enemies/run_all.sh`). **Rule for new attacks:** gate any explicit marker at draw time with
`G.telegraphsOn()` (or keep it with `keep: true` and document why), and keep a diegetic tell of at least 0.35 s.

| attack | easy | standard / hardcore | diegetic tell (lead time) |
|---|---|---|---|
| snuffed_walker: lunge | no explicit marker | same as easy (nothing to remove) | **rear** 0.45 s: rears up with claws raised, eyes flare, glint, shake |
| snuffed_lancer: thrust | no explicit marker | same as easy (nothing to remove) | **level** (the lance lowers, readable from afar), then **plant** 0.50 s: feet planted, lance drawn back, glint at the lance tip |
| drip_fly: wax drip | no explicit marker | same as easy (nothing to remove) | **swell** 0.50 s: the body squeezes and a hot drop swells under it (glint on the drop), shake; the drop is visible as it falls |
| wick_crawler: contact only | no explicit marker | same as easy (nothing to remove) | no attack wind-up: a slow crawler that hurts on touch, always visible |
