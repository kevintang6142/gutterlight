# Shore of Last Light enemies: telegraphs by mode (module: tele-enemies)

Source: `src/entities/enemies/shore.js` (ash_crawler, ash_fly: the framework's reference implementations, see
`docs/api/enemies.md`). Placement is in `docs/api/region-shore_lastlight.md`. This file holds only the per-mode
telegraph table.

## Telegraphs by mode (easy / standard / hardcore)

The difficulty modes (`G.game.difficulty()`; `G.telegraphsOn()` is true only in Easy) change only **explicit** telegraphs: drawn geometry that outlines where or
when damage lands (floor zones, landing marks, aim/trajectory lines, hitbox previews, danger tints). Those draw only
while `G.game.telegraphs()` (alias `G.telegraphsOn()` in enemy_base) is true, which means easy mode only. The
telegraph audit (module tele-enemies) found **no explicit marker on any of these enemies**. Every tell below is
**diegetic**: the attacker's own wind-up pose, a glow or glint on its body or weapon (`telegraph()` anchors it on the
body, weapon tip, lantern, bell or pot), its sound cue, the wind-up shake, particles it emits, or projectiles forming on
it and visible in flight. So all three modes look and play the same, with the same timing. Nothing was removed and
nothing was kept-subtle. Verified: `test-output/tele-enemies/sheet_shore_lastlight.png` shows easy and standard side by side
with seeded randomness and 0.00 % pixel difference at every wind-up. The lab self-test passes in all three modes
(`test-output/tele-enemies/run_all.sh`). **Rule for new attacks:** gate any explicit marker at draw time with
`G.telegraphsOn()` (or keep it with `keep: true` and document why), and keep a diegetic tell of at least 0.35 s.

| attack | easy | standard / hardcore | diegetic tell (lead time) |
|---|---|---|---|
| ash_crawler: contact only | no explicit marker | same as easy (nothing to remove) | no attack wind-up: walks its ledge and hurts on touch |
| ash_fly: contact chase | no explicit marker | same as easy (nothing to remove) | **notice**: a startled flutter upward before it drifts in (contact only, slow) |
