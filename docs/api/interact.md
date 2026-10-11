# interact — world objects, pickups, NPCs, the Gutterwisp, cinders, scripted events

Files: `src/entities/interactables.js` (all object types, `G.dropCinders`, `G.Events` dispatcher,
`G.Interact` helper kit), `src/entities/npcs.js` (type `npc`), `src/entities/wisp.js` (type `wisp`).
Self-test: `node tools/interact_selftest.js [filter] [--noshots]` (22 checks; screenshots in
`test-output/interact/`: `contact_sheet.png` + `showcase_<region>_<a|b|c>.png`).

All types are placed with markers / `entities` entries per TECH_SPEC §7.5. Unless noted, an entity is a
**ground-stander**: its feet sit on the bottom of the marker tile, horizontally centred on it — put the
marker in the EMPTY tile directly above the floor.

## Entity types (room data)

| type | props | behaviour / persistence |
|---|---|---|
| `start` | — | New-game spawn. The engine reads the *spec* (`findSpec(room,'start')`), the entity itself is invisible. Only in `sh_01`. |
| `respawn` | `w`,`h` (trigger tiles, default 2×3) | While the player stands in the trigger box, hazard respawn (spikes/lava) returns to this spot. |
| `sconce` | `id` | Unlit until first rest (flag `sconce:<id>`). Prompt **Rest** → `player.resting`, `G.game.rest(this)` (heal, save, respawn). While seated, Up / inventory → `G.UI.openInventory({atSconce:true})`; any movement stands up. After death the player respawns seated. |
| `lanternway` | `id` (region id), `flip` | First use (prompt **Light**) sets `progress.lanterns[id]=true`, sfx + toast + save; then prompt **Travel** → `G.UI.openLanternway(id)` (refused while `G.game.isSafeRoom()` is false: a hostile within 12 tiles or hurt/attacked < 3 s ago). |
| `lore` | `id` (key in `G.Text.lore`); dev rooms only: `text` (show another tablet's text under a dev-only `id`) | Region-tinted carved tablet; **Read** → `G.UI.lore(text \|\| id)`, sets flag `lore:<id>`. |
| `npc` | `npc`, `stage`, `requires`, `flip`, `key`, `shop` | See *NPCs* below. |
| `shrine` | `ability`, `requires` | Pedestal + floating blue ember. If the ability is owned: empty pedestal. If `requires` fails: dormant (no ember), wakes when it passes. **Take** → `G.game.giveAbility(ability)` (shows `G.UI.abilityGet`), particles, `player.playPose('ability')` if present. |
| `pickup` | `id` (required for persistence), `item`, `sigil`, `seal`, `spark`, `amount`, `requires`, `give` | Floating glowing item, collected on touch → `G.game.giveItem(spec)` + `G.UI.itemGet` (`G.UI.sparkMemory` for sparks). Flag `item:<id>`; absent once collected. With `requires`: hidden until it passes (then appears with a ring burst). Items: `heartwax`, `urn`, `kiln_glass`, `spark` (spec `spark:<spark||id>`), `notch`, `sigil` (needs `sigil`), `seal` (needs `seal`), `cinders` (`amount`, default 50 — bursts out as cinder chips). `give` overrides the spec string. |
| `geode` | `id`, `amount` (default 60) | Ember-crystal cluster, team `neutral`, hurtable & pogoable. Each of the first 3 Brand hits drops ~12% of `amount` as cinders; the 4th hit breaks it and releases the rest (flag `geode:<id>`). |
| `lever` | `id` | Hit with the Brand (nail/spell/plunge): flips, sets `lever:<id>`, sfx `lever`, emits `leverPulled {id, lever}`. Drawn pulled when the flag is set. |
| `gate` | `id`, `opens` (condition), `w` (tiles, default 1), `h` (default 4), `hint`, `orient`, `slide` | Solid while `opens` is false (re-checked every frame, so levers / bosses / seals open it live); then opens with `gate_open` + shake, flag `gate:<id>`, emits `gateOpened {id, room, gate}`; stays open. **Anchoring: the marker is the bottom-LEFT tile of the gate rect** (`x = tx*40`, bottom = `(ty+1)*40`). Vertical gates (`h > w`) are iron bars that slide up into the header. **Horizontal grates** (`w > h`, e.g. `w:4, h:1` for `mw_gate1` / `ri_gate1`): marker at the grate's left tile (e.g. col 20, row 2 → covers cols 20-23 of row 2); the player can stand on it; it slides sideways into its frame (`slide: 'right'` default, or `'left'`). `orient: 'h'|'v'` forces the style. With `hint` (text or `ui.<key>`), a closed gate is examinable. |
| `arena_gate` | `id`, `w`, `h`, `side` | Heavier bars, **open** by default. Same anchoring as `gate`. See *Arena gate contract*. |
| `sealdoor` | `id` (use `'sealdoor'`), `w` (default 3), `h` (default 6) | Ornate door, ground-stander centred on the marker (3×6 at marker col 8 / row 23 → cols 7-9, rows 18-23 in `ri_08`). One socket lights per Warden Seal owned (`bell`, `kiln`, `wing`). Solid until `seals>=3`; with all three it starts opening (sockets flare, rumble, rises into the frame above) as soon as the player comes within ~6 tiles; flag `door:<id>`. Interacting while locked shows the hint dialogue (`G.Text.ui.sealDoorLocked` / `sealDoorCount`). The control lock `'sealdoor'` is held during the 4-s opening. |
| `light` | `r` (tiles, default 4), `color`, `intensity` (0..1), `flicker`, `flame` (kind), `size`, `glow` | Centre-anchored static light (`G.lighting.add` each frame), optional flame/glow sprite. |
| `decor` | `kind`, `flip`, `scale`, `layer` ('back' z=-20 / 'front' z=20), `z` | Draws `G.Art.drawDecorProp(kind, ...)`; top-anchored props (chains, banners) hang from the marker tile's top. |
| `event` | `script`, `id`, `once`, `w`, `h`, `anchor`, `z`, anything else | Dispatches to `G.Events[script]`. Unknown script → `G.reportError` once, entity removed. |
| `cinder` | `value` (1/5/25) | Spawned by `G.dropCinders` (not placed in rooms). |
| `wisp` | `x`,`y` (px, death centre), `cinders` | Spawned by the engine (`game.js`) when `progress.wisp.room` is the room being entered. |

Prompt strings come from `G.Text.ui.prompts.<rest|light|travel|read|talk|take|examine>` (an NPC text entry's `prompt`, e.g. 'Listen', overrides 'Talk') with English
fallbacks.

## NPCs (`type:'npc'`)
`{type:'npc', npc:'wren', stage:2}` → text key `wren_2` (falls back to `wren`; override with `key`).
- **Talk selection** (TECH_SPEC §15): the first entry of `G.Text.npcs[key].talks` whose `when` passes.
  On finishing: flag `talked:<key>:<talkId>` (and `talked:<npc>:<talkId>` when key ≠ npc) — `once`
  entries are thereby skipped next time; `setFlag` is set; `give` → `G.game.giveItem(give)`; then, if the
  entry (or props) has `shop`, `G.UI.openShop(shop)`. Emits `npcTalk {npc, key, id, entity}`.
- NPCs face the player within ~5 tiles, breathe/blink/idle per character.
- Characters: `thrum` (stooped stub, wax beard, stick), `pell` (huge pack, hanging lantern), `quill`
  (lanky, inky hands, humming note particles), `bramm` (apron, anvil, red flame, hammer), `wren`
  (snuffer-cap hat, pole; flame weaker each stage 1→4), `sable` (black wax, long red cloth scarf,
  hooked spear; never lit).
- **Sable stage 1** (glimpse, gw_07): not interactable. When the player comes within `range` tiles
  (default 8) she turns, speaks `sable_1` (if text exists; `speak:false` to skip), dissolves into
  smoke, sets flag `sable_glimpse` (or `props.flag`; `sable_glimpse_after` if `boss:sable1` is already
  done) and emits `sableGlimpse`. Absent once the flag is set, and absent once `boss:sable2` is done
  (she has yielded at the Sanctum gate).
- **Wren** is only ever in one place: stage N is absent once any later stage has been met
  (`wren_met_K`, set by her talk) or seen (`wren_seen_K`, set when the player first comes within 12
  tiles of stage K), and stages 1-3 are absent once `wren_gift` is set. `requires` still applies too.
- **Sable stage 2** (ri_08): present **only after `boss:sable2`** (and `requires`, if given, must pass
  too); talkable.
- Unknown `npc` → warning + generic waxen figure. `G.NPC` (base class) and
  `G.NPCs = {classes, pickTalk(key, npc), talkedFlag(key, id)}` are exported.

## Arena gate contract (with the enemies/boss module)
- Listens to `G.events` **`arenaStart {room}`** → `close()` and **`arenaEnd {room}`** → `open()`, for its
  own room only (`room` may be the room object or its id; an optional `gates:[ids]` array restricts the
  event to listed gate ids). Also reopens on `bossDefeated`.
- Methods: `gate.close(instant?)` (slams down: `gate_close`, shake, sparks; a player standing in the
  doorway is pushed to the arena side — `side: 'left'|'right'`, else toward the room centre) and
  `gate.open(instant?)` (slides up, `gate_open`). Both idempotent; `gate.closed` → bool.
- Listeners are detached on room exit/removal.

## Scripts & helpers
```js
G.dropCinders(room, x, y, amount, { dir, power, delay })  // → chips[] (25/5/1 denominations)
// chips burst, bounce, settle and glint; collected on touch (sfx 'cinder', rising pitch on streaks);
// with sigil 'cinder_lure' equipped they fly to the player from <= 6 tiles.

G.Events.my_script = {
  init(e) {},              // e: the event entity (e.props, e.data = {}, e.room, e.x/y/w/h)
  update(e, dt) { if (e.playerInside()) { /* ... */ e.done(); } },   // done(): flag event:<id|script> + remove
  draw(e, ctx, t) {},      // optional, world space
  exit(e) {},              // optional, on room exit
};
// room data: { type:'event', script:'my_script', id:'gw_evt1', once:true, w:3, h:4 }
// built-in: script 'toast' → { type:'event', script:'toast', text:'...' | textKey:'ui.key', once:true, w, h }
```
`G.Interact` (alias `H` inside these files) is a small kit other content code may reuse: `H.ui(name,
...args)` (feature-detected UI call), `H.cond`, `H.flag`, `H.setFlag`, `H.text(path, fallback)`,
`H.sfx(name, x, opts)`, `H.burst(kind, x, y, opts)`, `H.light(...)`, `H.playerBox()`,
`H.distToPlayer(e)`, `H.sprite(key, w, h, ax, ay, drawFn)` (cached LRU canvas), `H.flame`, `H.glow`,
`H.Interactable` (base class: `interactable`, `promptText`, `interactRect()`, `interact(player)`).
`G.Interactables` exports all classes plus `pickupSpec(props)`, `SEALS`, `GEODE_HITS`.

## Gutterwisp (`wisp.js`)
Dark smoky echo of the Wickling with a dim violet-grey flame. Idle bob at the death spot; within 8 tiles it
drifts toward the player; within ~4.5 tiles it telegraphs (0.6 s wind-up) a slow lunge. Contact = 1 damage
(`contactDamage: 1`, team `enemy`). 3 Brand hits → bursts (`wisp_die`), `G.game.reclaimWisp()` returns the
cinders (+ chip burst), `progress.wisp = null` → Ember capacity restored; emits `wispReclaimed`.
`{type:'wisp', preview:true}` draws a static preview (contact sheets).
First death: on the first `respawn` event with `progress.wisp` set, `ui.wispHint` is toasted once (one
toast per sentence) and flag `hint:wisp` is set.

### Boss deaths: `G.wispSpotFor(death)`
`death = {room, x, y, arenaActive, bossId}` (px, room-local) → `{room, x, y}` (px, the centre of a standing
player on the chosen tile — the same convention as a death spot) or `null` (keep the death spot). Called by
`game.js` wherever it creates `progress.wisp` (hardcore has no wisp). It relocates only when the death room is
the arena of a boss that is **not yet beaten** (whether the fight was running or not; `bossId` is used when it
matches the room, else the boss is looked up from the room); everything else — non-arena rooms, won arenas, dev
rooms — returns `null`. The table is `G.wispSpotFor.SPOTS` (`{arena, room, tx, ty, alt?}`; `ty` = the empty tile
above the floor). Rule: inside the arena only where its entry strip lets the wisp sit **>= 10 tiles outside
the trigger rect** (so its lunges, the 3-hit knockback and a chasing player never cross the trigger), on the
entry side and in front of any arena gate; otherwise in the room before, near the door to the arena, on safe
floor away from hazards and enemies, on the way from that room's sconce.

| boss | wisp spot | why |
|---|---|---|
| effigy (gw_05) | gw_04 (8,14) | The entry strip east of the trigger is only 12 tiles. gw_04 (Kindled Bolt shrine) has no enemies; the spot is by the door, west of the S1 drop, so the wisp is met after crossing it on the way from `gw_sconce_a`. |
| sable1 (mb_07) | mb_07 (53,14) | 22-tile strip east of the trigger: inside the Lawn, 12.5 tiles clear of it, 10 tiles in from the door (`mb_sconce_b` is just outside). The Thornwalk itself has thorns, hedges and hoppers. |
| matron (sf_05) | sf_02 (25,77) | The only non-trigger ground in the den is the 5-tile west ledge above it (a knock-back off it lands in the trigger). Great Flue floor between `sf_sconce_b` and the E4 door; nearest enemy 15 tiles up the shaft. |
| tallowmere (dn_07) | dn_07 (6,23) | 14-tile strip west of the trigger: inside the Belfry past the (open) arena gate, 10.5 tiles clear of the trigger, on the clean floor (the flood and drips exist only in the fight). |
| kilnmother (ch_09) | ch_08 (58,14) | Only 7 tiles before the trigger. The upper ledge by the furnace door (E1): 9 tiles above the ladle brute's floor, reached by the steps the player climbs anyway. |
| vespertine (mw_04) | mw_06 (58,23); (44,23) while the moth knight `mw_u1` lives | Only 7 tiles before the trigger. By the bower door once the persistent knight is slain; while it lives, just east of `mw_sconce_b` and outside its engage range (|x − home| < 9 tiles), so the reclaim never pulls it in. |
| sable2 (ri_07) | ri_07 (53,14) | Same layout as mb_07: inside, 12.5 tiles clear of the trigger; `ri_sconce_b` is right outside the door. |
| lucerne (hs_03) | hs_02 (33,14) | Only 9 tiles before the trigger. The Vestibule's open hall (no enemies), before the low passage to the Heartwick, on the way from `hs_sconce_a`. |

Verified headless by `node test-output/wisp-placement/test.js` (real fight start by walking into the trigger,
real death in phase 1 and phase 2, real respawn, walk from the sconce, 3 real Brand hits, arena never leaves
`wait`; plus deaths outside arenas / in won arenas keep their spot).

## Flags written (all in `progress.flags`)
`sconce:<id>`, `item:<pickupId>`, `geode:<id>`, `lever:<id>`, `gate:<id>`, `door:<id>`,
`talked:<key>:<talkId>`, NPC `setFlag`s, `sable_glimpse`, `wren_seen_<stage>`, `hint:wisp`, `event:<id|script>`. Lanterns use
`progress.lanterns[id]`.

## Events emitted
`leverPulled {id, lever}`, `gateOpened {id, room, gate}`, `npcTalk {npc, key, id, entity}`,
`sableGlimpse {entity}`, `wispReclaimed {cinders, room}`.
