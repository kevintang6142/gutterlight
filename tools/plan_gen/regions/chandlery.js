// The Chandlery (ch_*): the pouring-forges east of the Nave and below the Sootflue.
// Entries: Slag Gate from the Ashpit (flue, grip) and Gallery Gate from the Gallery of Saints (nave, grip+dash).
// Hub: the Great Foundry. Plunge shrine at the top of the Crucible Climb (grip+dash). Kiln Mother in the Kiln Heart.
module.exports = (R) => {
  R('ch_10', {
    name: 'The Slag Gate', cell: [48, 13, 4, 2], kind: 'room',
    exits: [['S', 'ch_03', 8, 4]],
    zones: { main: ['sf_08', 'ch_03'], store: [] },
    moves: { 'main<>store': [] },
    content: [
      ['lore:lore_ch_1', 'main'],
      ['pickup:kiln_glass#ch_kg', 'store', { secret: 'breakable wall (B) of slag bricks at the east end' }],
      'enemy:moldling*2', 'enemy:forge_wisp*1',
      'landmark:a gate of riveted iron plates crusted with old slag; beyond it the roar of the forges',
    ],
    notes: 'Upper entrance from the Sootflue (64x18). Floor top row 15 (W1 rows 12-14 from the Ashpit). S1 (cols 8-11) is a hole down to the Pouring Floor; one-way platforms in ch_03 below it for the climb back; around S1 the floor dips to top row 16 for 3 cols each side. lore_ch_1 (a foundry work-order) on the gate at col 20. SECRET: the east wall area is a slag-brick store: a B wall (cols 50-51, rows 12-14) hides a storeroom (cols 52-62, rows 11-14, floor top 15) with Kiln Glass ch_kg on a rack. Two moldlings, one forge_wisp.',
  });

  R('ch_03', {
    name: 'The Pouring Floor', cell: [46, 15, 4, 3], kind: 'room',
    exits: [['W', 'ch_02', 21, 3], ['E', 'ch_04', 21, 3]],
    content: [
      ['geode:ch_geo2', 'main'],
      'enemy:moldling*3', 'enemy:ladle_brute*1',
      'landmark:rows of giant ladles tip molten wax into candle molds along a channel of glowing lava',
    ],
    notes: 'Room (64x27). N1 (cols 40-43) from the Slag Gate: one-way platforms (tops rows 21, 17, 13, 9, 5) under it. Floor top row 24 (W1 and E1 rows 21-23). A molten channel (% lava, 2 deep, flat surface at row 24) runs along the floor at cols 22-30 (9 wide): it is crossed by two iron grates (one-way platforms top row 21, cols 21-24 and 28-31) - a normal jump suffices, never dash. Big ladles (decor) tip glowing streams in the background. ch_geo2 on a mold rack at col 52, top row 18 (a 3-tile step from a crate). Three moldlings, one ladle_brute guarding the east door (E1 -> the Crucible Climb).',
  });

  R('ch_04', {
    name: 'The Crucible Climb', cell: [50, 15, 4, 4], kind: 'shrine',
    zones: { foot: ['ch_03'], shrine: [] },
    moves: { 'foot>shrine': [['grip', 'dash'], ['grip', 'wings']], 'shrine>foot': [['plunge'], ['dash'], ['wings']] },
    content: [
      ['shrine:plunge', 'shrine'],
      'enemy:forge_wisp*2',
      'landmark:a towering crucible chimney; at its brim, high above lakes of molten wax, a blue ember hovers over a dented anvil',
    ],
    notes: 'PLUNGE SHRINE behind a GRIP + DASH challenge (64x36). W1 (rows 21-23) enters on the foot ledge (cols 1-10, floor top row 24, solid below). The rest of the room bottom is a lake of molten wax (% lava, surface row 32, liquid rows 32-34, cols 11-62) - falling in = hazard respawn on the last safe ledge. Solid stepping blocks (top row 24) at cols 15-18 and 24-27 (gaps <= 5) lead east to THE CRUCIBLE WALL (cols 30-33): its upper part rises from row 20 to a top at row 10 (10 tiles, plain # face on the west, no footholds; built without ^ strips) - wall-climb it (grip). Under it a tunnel (rows 21-23, floor top 24) passes through to the east ledge (cols 34-52, top row 24) - a dead end without abilities. From the wall top a 9-tile gap at equal height (cols 34-42) leads to the brim (a solid shelf, cols 43-62, rows 10-12, GLAZED (X) faces and underside) - dash (or Smokewing). The Molten Plunge shrine stands on the brim at col 56. Way back: dash back over the gap, or (teaching the new spell) plunge through the D patch in the brim (cols 46-49, rows 10-12) and land on the east ledge, then walk west through the tunnel. Two forge_wisps drift over the lava (pogo-able, never required).',
  });

  R('ch_02', {
    name: 'The Great Foundry', cell: [40, 15, 6, 4], kind: 'hub',
    exits: [['W', 'ch_01', 3, 3], ['W', 'ch_07', 30, 3], ['S', 'ch_06', 20, 4], ['S', 'ch_08', 80, 4]],
    content: [
      ['sconce:ch_sconce_a', 'main'],
      ['lanternway:chandlery', 'main'],
      ['lore:lore_ch_2', 'main'],
      'enemy:ladle_brute*1', 'enemy:moldling*2', 'enemy:drip_slime*2',
      'landmark:THE GREAT FOUNDRY - a cavern of chains and gantries above a river of molten wax; a colossal empty mold in the shape of a knight hangs from the ceiling',
    ],
    notes: 'REGION HUB and landmark (96x36). Three levels: (1) upper gantry, floor top row 6, from W1 (rows 3-5, from the Gallery Gate) east to col 40; (2) middle walkway, floor top row 24, joining E1 (rows 21-23, Pouring Floor) across most of the width; (3) lower floor, top row 33, joining W2 (rows 30-32, Mold Racks), S1 (cols 20-23, down to the Quench Gate ch_06) and S2 (cols 80-83, down to the Kiln Antechamber ch_08). The levels are linked by chain-hung one-way platforms and iron stairs, never more than 4 rows apart, so the whole hub is free to move through without abilities. Molten wax appears only in the background art (falls and a glowing river in the parallax); no lava tiles on any route here. Around S1 and S2 the lower floor dips to top row 34 for 3 cols each side. ch_sconce_a at col 30 on the middle walkway; Lanternway post chandlery at col 62 on the middle walkway; lore_ch_2 (the Kiln Mother\'s decree) on a mold plaque at col 12 on the lower floor. A colossal hanging knight-mold (decor) in the center. A ladle_brute on the middle walkway, moldlings and drip_slimes on the lower floor.',
  });

  R('ch_01', {
    name: 'The Gallery Gate', cell: [36, 14, 4, 2], kind: 'room',
    exits: [['S', 'ch_07', 20, 4]],
    content: [
      ['geode:ch_geo1', 'main'],
      'enemy:moldling*2', 'enemy:drip_slime*1',
      'landmark:where the cathedral\'s stone gives way to the riveted iron of the forges',
    ],
    notes: 'Western entrance (64x18) from the Gallery of Saints (W1 rows 12-14). Floor top row 15. E1 (rows 12-14) onto the Foundry\'s upper gantry. S1 (cols 20-23) a hole down to the Mold Racks; one-way platforms in ch_07 under it for the climb back; around S1 the floor dips to top row 16 for 3 cols each side. ch_geo1 in a slag heap at col 44. Two moldlings, one drip_slime on the ceiling.',
  });

  R('ch_07', {
    name: 'The Mold Racks', cell: [36, 16, 4, 3], kind: 'room',
    exits: [['S', 'ch_05', 40, 4]],
    zones: { main: ['ch_01', 'ch_02', 'ch_05'], vault: [] },
    moves: { 'main>vault': ['plunge'], 'vault>main': [] },
    content: [
      ['lore:lore_ch_3', 'main'],
      ['pickup:spark#spark_ch', 'vault'],
      'enemy:moldling*3', 'enemy:drip_slime*1',
      'landmark:racks of half-formed wax soldiers in their molds, row upon row, none of them lit',
    ],
    notes: 'Room (64x27). N1 (cols 20-23) from the Gallery Gate: one-way platforms tops rows 21, 17, 13, 9, 5 under it (the floor is at row 24). Floor top row 24; E1 (rows 21-23) to the Foundry\'s lower floor. S1 (cols 40-43) is a hole down to the Cooling Cellar; around it the floor dips to top row 25 for 3 cols each side (cols 37-39 and 44-46). Racks of soldier molds (decor) in tiers, with one-way platforms (tops 20 and 16) for fun. lore_ch_3 (a mold-maker\'s tally of soldiers poured) at col 10. PLUNGE REWARD: at the east end a raised casting block (solid, cols 50-62, top row 18, reached by a 3-tile step at cols 47-49, top row 21). A cracked floor - D at cols 54-58, rows 18-19 - covers a sealed casting pit inside the block (cols 51-61, air rows 20-23, floor top row 24) holding Chandler\'s Spark spark_ch. Climb out: a one-way platform (top row 21, cols 59-61) beside the broken hole (24 -> 21 -> 18). Three moldlings stagger off the racks, one drip_slime.',
  });

  R('ch_05', {
    name: 'The Cooling Cellar', cell: [36, 19, 4, 2], kind: 'room',
    exits: [['E', 'ch_06', 12, 3]],
    zones: { main: ['ch_07', 'ch_06'], vault: [] },
    moves: { 'main<>vault': [['dash'], ['wings']] },
    content: [
      ['pickup:urn#ch_urn', 'vault', { secret: 'breakable wall (B) of stacked cold molds, then a dash over a quench trough' }],
      'enemy:drip_slime*2', 'enemy:moldling*1',
      'landmark:a cellar of cooling racks where fresh candles harden in rows; steam rises from quenching troughs',
    ],
    notes: 'Room (64x18). N1 (cols 40-43) from the Mold Racks: one-way platforms tops rows 12, 8, 4 under it. Floor top row 15; E1 (rows 12-14) to the Quench Gate. SECRET + DASH: the west part of the room is walled off by stacked cold molds - a B wall (cols 22-23, rows 4-14, floor to ceiling). Behind it the floor ends at col 21 at a quench trough of molten wax 10 wide (cols 11-20; % lava with its surface flush with the floor, top row 15, liquid rows 15-16, row 17 solid) - too wide to jump (lava cannot be pogo-ed), crossed with Flare Dash (or Smokewing). The far ledge (cols 1-10, floor top row 15; its face toward the trough is GLAZED X) holds the Ember Urn ch_urn. Drip_slimes on the ceiling, one moldling.',
  });

  R('ch_06', {
    name: 'The Quench Gate', cell: [40, 19, 4, 3], kind: 'room',
    exits: [['E', 'ch_08', 21, 3], ['S', 'ri_06', 14, 4]],
    zones: { main: ['ch_02', 'ch_05', 'ch_08'], hole: ['ri_06'], ledge: [] },
    moves: { 'main>hole': ['plunge'], 'main<>ledge': [['dash'], ['wings']] },
    content: [
      ['pickup:sigil:flare_trail#ch_sig_flare_trail', 'ledge'],
      'enemy:forge_wisp*2', 'enemy:moldling*1',
      'landmark:a quenching hall where molten wax meets ice water; the floor is cracked and frost breathes up through it',
    ],
    notes: 'Room (64x27). N1 (cols 20-23) from the Foundry: one-way platforms tops rows 21, 17, 13, 9, 5 under it (cols 19-24). Floor top row 24. W1 (rows 12-14) is a raised doorway: a ledge (cols 1-8, floor top row 15) reached by 3-tile steps (cols 9-11, tops 21 and 18). E1 (rows 21-23) at floor level to the Kiln Antechamber. PLUNGE GATE (one-way into the Rime): a frosted cracked floor - D tiles at cols 12-19, rows 24-25 - over the S1 opening (cols 14-17, row 26 open) drops the player into the Glacier Gallery; no way back up through it. DASH REWARD: a stepped pillar (solid, cols 34-39, tops 21, 18, 15 on its west side, flat top row 12) faces, across a 10-tile gap at equal height (cols 40-49), a high ledge (cols 50-58, top row 12, GLAZED X faces, no wall within reach) where the Flare Trail sigil rests. Two forge_wisps, one moldling.',
  });

  R('ch_08', {
    name: 'The Kiln Antechamber', cell: [44, 19, 4, 3], kind: 'room',
    exits: [['E', 'ch_09', 12, 3]],
    zones: { main: ['ch_02', 'ch_06', 'ch_09'], perch: [] },
    moves: { 'main>perch': ['wings'], 'perch>main': [] },
    content: [
      ['sconce:ch_sconce_b', 'main'],
      ['lore:lore_ch_4', 'main'],
      ['geode:ch_geo3', 'perch'],
      'enemy:ladle_brute*1', 'enemy:forge_wisp*1',
      'landmark:a scorched antechamber before a huge round furnace door that glows from within like a heart',
    ],
    notes: 'Room (64x27) before the Kiln Mother. N1 (cols 16-19) from the Foundry: one-way platforms tops rows 21, 17, 13, 9, 5 under it. Floor top row 24 (W1 rows 21-23 from ch_06). E1 (rows 12-14) is the furnace door to the Kiln Heart, on a raised ledge (cols 50-63, floor top row 15) reached by 3-tile steps (tops 21, 18, 15). ch_sconce_b at col 27 (rest before the Warden; warm light). lore_ch_4 (scratched by a soldier: "she cannot stop") at col 22. WINGS REWARD: a chain-hung cage perch (cols 6-11, top row 17), 7 tiles above the floor, GLAZED (X) bars, no wall within 6 tiles, with ch_geo3. One ladle_brute, one forge_wisp.',
  });

  R('ch_09', {
    name: 'The Kiln Heart', cell: [48, 19, 4, 2], kind: 'arena',
    content: [
      ['arena:kilnmother', 'main'],
      'landmark:the heart of the forges - a round furnace chamber; the Kiln Mother\'s molten core glows behind her grate',
    ],
    notes: 'BOSS ARENA - THE KILN MOTHER, Warden of the Forge (64x18). Single entrance W1 (rows 12-14). Floor top row 15 (rows 15-17 solid) flat across cols 1-62: her molten floor waves and heated floor sections are attacks (telegraphed glow), so the tiles stay plain solid - no lava tiles. Ceiling solid rows 0-2; two one-way decks (=, top row 11) at cols 14-21 and 42-49 to escape floor waves. arena_gate (w1,h4) at col 2 rows 11-14 under a solid lintel at row 10. arena entity: boss kilnmother, bx=48, by=14 (her bulk fills the east third), trigger cols 10-30 rows 6-14. The east corner (cols 57-62) is solid wall behind her; the moldlings she spawns pour from ceiling vents over her back (cols 52-53, rows 1-2). Reward: Seal of the Kiln (+300 cinders).',
  });
};
