// The Mothwood (mw_*): a dark violet forest of wick-reeds west of the Nave, reached through the Flooded Tunnel (oilcloak).
// Hub: the Wickreed Grove. Smokewing shrine in the Chrysalis Chapel; with wings the Grove canopy leads to Vespertine.
// Lever mw_lv1 in the Mothward Gate opens the shortcut up to Meltbloom's Root Hollows.
module.exports = (R) => {
  R('mw_01', {
    name: 'The Reed Shallows', cell: [10, 18, 4, 2], kind: 'room',
    exits: [['W', 'mw_02', 12, 3], ['S', 'mw_09', 44, 4]],
    content: [
      ['lore:lore_mw_1', 'main'],
      ['geode:mw_geo3', 'main'],
      'enemy:dusk_moth*2', 'enemy:dust_maw*1',
      'landmark:the floodwater spills out of the tunnel into shallows among the first wick-reeds; pale moths rise from the water',
    ],
    notes: 'First Mothwood room (64x18), entered from the Flooded Tunnel at E1 (rows 12-14). Floor top row 15 (shallow puddles are decor only - no ~ on the walkway). W1 (rows 12-14) into the Wickreed Grove. S1 (cols 44-47) a hole down to the Silt Roots; around it the floor dips to top row 16 for 3 cols each side; the climb back up is inside mw_09. Wick-reeds (tall thin stalks with dead wicks for heads) frame the room. lore_mw_1 (a moth-keeper\'s ward-sign) at col 30. mw_geo3 among the reed roots at col 8. Two dusk_moths, a dust_maw lurking in a mound at col 22. Very dark: use moth-glow lights sparingly.',
  });

  R('mw_02', {
    name: 'The Wickreed Grove', cell: [4, 16, 6, 4], kind: 'hub',
    exits: [['N', 'mw_06', 50, 4], ['W', 'mw_07', 30, 3], ['S', 'mw_08', 20, 4]],
    zones: { floor: ['mw_01', 'mw_07', 'mw_08'], canopy: ['mw_06'] },
    moves: { 'floor>canopy': ['wings'], 'canopy>floor': [] },
    content: [
      ['sconce:mw_sconce_a', 'floor'],
      ['lanternway:mothwood', 'floor'],
      ['lore:lore_mw_2', 'floor'],
      'enemy:cocoon_spawner*2', 'enemy:dusk_moth*2', 'enemy:dust_maw*1',
      'landmark:THE WICKREED GROVE - wick-reeds as tall as towers sway in total stillness; their dead wicks form a canopy hung with giant silver cocoons',
    ],
    notes: 'REGION HUB and landmark (96x36). Forest floor top row 33 (rows 33-35 solid) with low roots (1-2 tile bumps): E1 (rows 30-32) from the Reed Shallows, W1 (rows 30-32) to the Cocoon Hollow, S1 (cols 20-23) a hole down to the Dustfall Hollow (floor dips to top row 34 for 3 cols each side; the climb back up is inside mw_08). mw_sconce_a at col 44 under a ring of glowing cocoons; Lanternway post mothwood at col 60; lore_mw_2 on a reed-stump at col 70. WINGS GATE to the canopy: the only way up is a ladder of reed-cap platforms (one-way =, 6 wide) each 6 tiles above the last - tops at rows 27, 21, 15, 9 - carried on a GLAZED (X) reed stem hanging from the canopy (cols 45-46, rows 2-28, clear of the floor path), with no walls or other footholds within 6 tiles (the room\'s side walls are far away), so only Smokewing climbs them; the last cap at top row 4 (cols 47-54) sits directly under N1 (cols 50-53), a 5-tile hop from row 9 (jump straight up through N1 to the Silk Galleries). Coming down is a free drop. Cocoon_spawners hang from the canopy (their spawn reaches the floor), dusk_moths drift, a dust_maw in the roots.',
  });

  R('mw_03', {
    name: 'The Mothward Gate', cell: [0, 13, 4, 3], kind: 'gate',
    exits: [['S', 'mw_07', 40, 4]],
    zones: { shaft: ['mb_09'], floor: ['mw_07'] },
    moves: { 'floor<>shaft': ['lever:mw_lv1'] },
    content: [
      ['lever:mw_lv1', 'floor'],
      'gate:mw_gate1?lever:mw_lv1',
      ['geode:mw_geo1', 'floor'],
      'enemy:moth_knight*1', 'enemy:dusk_moth*1',
      'landmark:an old warded gate of moth-silk and iron; through its bars, far above, hangs the golden light of the gardens',
    ],
    notes: 'ONE-WAY SHORTCUT to Meltbloom (64x27). Floor top row 24. S1 (cols 40-43) is a hole down to the Cocoon Hollow (floor dips to top row 25 for 3 cols each side; the climb back up is inside mw_07). N1 (cols 20-23) leads up to the Root Hollows: mw_gate1 is a horizontal iron-and-silk grate (w4, h1, opens lever:mw_lv1) at row 2, cols 20-23, framed by solid tiles at cols 18-19 and 24-25 (rows 0-2). Under it one-way platforms with tops at rows 20, 16, 12 and 8, and a top ledge at row 5 (so the player fits under the frame and the closed grate) let the player climb right up to the grate; lever mw_lv1 stands on the top ledge at col 27 - struck from below, the grate swings open for good (from Meltbloom the player only ever saw the bars and a lever out of reach). mw_geo1 in a cocoon husk at col 52 on the floor. One moth_knight guards the floor, a dusk_moth flutters near the grate.',
  });

  R('mw_04', {
    name: 'The Duchess\'s Bower', cell: [10, 13, 4, 3], kind: 'arena',
    content: [
      ['arena:vespertine', 'main'],
      'landmark:a vaulted bower woven of silk and moonlight; a vast moth with eye-spotted wings rests on a throne of cocoons',
    ],
    notes: 'BOSS ARENA - DUCHESS VESPERTINE, Warden of the Wing (64x27). Single entrance W1 (rows 21-23). Floor top row 24 (rows 24-26 solid) flat across cols 1-62. She flies: keep rows 3-23 open over the whole width; ceiling solid rows 0-2 (silk vault). Three one-way silk platforms (=) give the player height to strike her: tops at row 18 (cols 10-17 and 46-53) and row 13 (cols 28-35). No tile hazards (dust clouds, gusts and moths are her attacks). arena_gate (w1,h4) at col 2 rows 20-23 under a solid lintel at row 19. arena entity: boss vespertine, bx=46, by=10 (she rests on the cocoon throne at the east end, airborne), trigger cols 10-30 rows 14-23. The player arrives with Smokewing (the room is only reachable through the canopy). Reward: Seal of the Wing (+300 cinders).',
  });

  R('mw_05', {
    name: 'The Cocoon Deep', cell: [0, 20, 4, 3], kind: 'room',
    exits: [['E', 'mw_08', 12, 3], ['E', 'mw_10', 21, 3]],
    zones: { main: ['mw_07', 'mw_08', 'mw_10'], crypt: [] },
    moves: { 'main>crypt': ['plunge'], 'crypt>main': [] },
    content: [
      ['pickup:spark#spark_mw', 'crypt'],
      'enemy:cocoon_spawner*2', 'enemy:moth_knight*1',
      'landmark:a pit packed with sealed cocoons; one, larger than the rest, is fused to the floor and cracked open like a shell',
    ],
    notes: 'Room (64x27). N1 (cols 20-23) from the Cocoon Hollow: one-way platforms tops rows 12, 8, 4 under it, rising from the upper floor (top row 15, cols 1-40) at E1 (rows 12-14, to the Dustfall Hollow). The upper floor ends at col 38; the room steps down east in 3-tile steps (cols 39-41 top 18, cols 42-44 top 21) to a lower floor top row 24 (cols 45-62); E1 is reached by a silk shelf on the east wall (top 15, cols 54-62) over ledges at tops 21 and 18 at E2 (rows 21-23, to the Chrysalis Chapel). PLUNGE REWARD: on the upper floor the giant fused cocoon is a D floor (cols 8-13, rows 15-16) over a sealed chamber (cols 4-30, air rows 17-21, floor top row 22) holding Chandler\'s Spark spark_mw; climb out by two silk rungs (tops rows 20 and 18, cols 9-12) under the broken hole (chamber floor 22 -> rungs -> upper floor 15; no Smokewing needed). Cocoon_spawners on the walls, a moth_knight on the lower floor.',
  });

  R('mw_06', {
    name: 'The Silk Galleries', cell: [6, 13, 4, 3], kind: 'room',
    exits: [['E', 'mw_04', 21, 3]],
    content: [
      ['sconce:mw_sconce_b', 'main'],
      ['lore:lore_mw_3', 'main'],
      'enemy:moth_knight*1', 'enemy:dusk_moth*2',
      'landmark:galleries of woven silk high in the canopy, hung with the Duchess\'s banners of eye-spotted wings',
    ],
    notes: 'Canopy room (64x27) above the Grove, reached only with Smokewing. S1 (cols 18-21) opens down into the Grove: around it the floor dips to top row 25 for 3 cols each side (landing ledge for players rising off the Grove\'s last reed-cap). Floor top row 24 of thick silk; the west side is a solid silk wall. E1 (rows 21-23) to the Duchess\'s Bower through a silk curtain arch. mw_sconce_b at col 40 (the rest before the Warden; moth-glow light). lore_mw_3 (the Duchess\'s oath to the Queen) woven into a banner at col 30. A moth_knight patrols; dusk_moths. Dropping back through S1 returns to the Grove floor.',
  });

  R('mw_07', {
    name: 'The Cocoon Hollow', cell: [0, 16, 4, 4], kind: 'shaft',
    exits: [['S', 'mw_05', 20, 4]],
    zones: { main: ['mw_03', 'mw_02', 'mw_05'], perch: [] },
    moves: { 'main>perch': ['wings'], 'perch>main': [] },
    content: [
      ['geode:mw_geo2', 'perch'],
      'enemy:moth_knight*1', 'enemy:cocoon_spawner*1', 'enemy:dust_maw*1',
      'landmark:a hollow trunk of one ancient reed, its inside lined with cocoons from top to bottom',
    ],
    notes: 'Vertical room (64x36) on the region\'s west edge. E1 (rows 30-32, floor top row 33) from the Grove. S1 (cols 20-23) a hole down to the Cocoon Deep (floor dips to top row 34 for 3 cols each side; the climb back up is in mw_05). N1 (cols 40-43) up to the Mothward Gate: a free climb of one-way platforms / silk ledges with tops at rows 29, 25, 21, 17, 13, 9, 5 (alternating sides of cols 36-47; the top one directly under N1). WINGS REWARD: a tall GLAZED cocoon perch (rows 12-17, top row 12) hangs from the ceiling by a glazed stalk (cols 6-7, rows 4-11), 7 tiles above the nearest reachable platform (top 19 or lower on the west side - keep the west platforms at or below row 19 and the perch GLAZED X, with no wall within 6 tiles), holding mw_geo2 (col 9). The west ledges are supported (row-25 ledge cols 3-10 touches the west wall). Moth_knight on the floor, cocoon_spawner on the wall, dust_maw in the roots.',
  });

  R('mw_08', {
    name: 'The Dustfall Hollow', cell: [4, 20, 6, 2], kind: 'corridor',
    exits: [['E', 'mw_09', 12, 3], ['S', 'mw_10', 60, 4]],
    zones: { main: ['mw_02', 'mw_05', 'mw_09', 'mw_10'], alcove: [] },
    moves: { 'main<>alcove': [] },
    content: [
      ['pickup:sigil:last_light#mw_sig_last_light', 'alcove', { secret: 'breakable wall (B) of dust-caked silk in the low ceiling, reached from a root ledge' }],
      'enemy:dust_maw*2', 'enemy:dusk_moth*2',
      'landmark:a hollow where moth-dust falls like grey snow and muffles every sound',
    ],
    notes: 'Corridor (96x18) under the Grove. Floor top row 15 (W1 and E1 rows 12-14). N1 (cols 20-23) up to the Grove: one-way platforms tops rows 12, 8, 4 under it. S1 (cols 60-63) a hole down to the Chrysalis Chapel; around it the floor dips to top row 16 for 3 cols each side (the climb back is inside mw_10). Moth-dust falls constantly (particles). SECRET: the ceiling hangs low between cols 34 and 50 (solid rows 0-8, air rows 9-14); its west face at cols 34-35 rows 6-8 is B, reached from a root ledge (cols 28-32, top row 9; 3-tile steps from the floor at tops 12 and 9): behind it an alcove (cols 36-44, rows 6-8, floor top 9) holds the Last Light sigil. Two dust_maws in the floor, two dusk_moths.',
  });

  R('mw_09', {
    name: 'The Silt Roots', cell: [10, 20, 4, 4], kind: 'room',
    exits: [['W', 'mw_10', 30, 3], ['S', 'ri_03', 40, 4]],
    zones: { main: ['mw_01', 'mw_08', 'mw_10'], hole: ['ri_03'], den: [] },
    moves: { 'main>hole': ['plunge'], 'main<>den': [] },
    content: [
      ['npc:wren:3', 'main'],
      ['pickup:kiln_glass#mw_kg', 'den', { secret: 'breakable wall (B) of silt behind Wren\'s camp' }],
      'enemy:moth_knight*1', 'enemy:dusk_moth*1',
      'landmark:roots of the great reeds plunge into frozen silt; a small traveler has made camp under them, her flame very low',
    ],
    notes: 'Vertical room (64x36). N1 (cols 44-47) from the Reed Shallows: one-way platforms tops rows 12, 8, 4 under it, reached from an upper floor (cols 30-62, floor top row 15) at W1 (rows 12-14, to the Dustfall Hollow). The room steps down west/south in 3-4 tile steps to a lower floor top row 33 at W2 (rows 30-32, to the Chrysalis Chapel). Wren (stage 3) camps on the lower floor at col 49 by a tiny fire. SECRET: behind her camp a cracked root wall (B, cols 55-56) hides a den (cols 57-62, east of the D floor) with Kiln Glass mw_kg (the west wall holds the W2 doorway). Root shelves at row 19 (cols 12-17) and row 23 (cols 20-28) touch the root masses. PLUNGE GATE (one-way into the Rime): a frozen cracked floor - D at cols 38-45, rows 33-34 - over the S1 opening (cols 40-43, row 35 open): the drop into the Long Cold; no way back up through it. Frost creeping up from the cracks shows the promise. One moth_knight on the upper floor, one dusk_moth.',
  });

  R('mw_10', {
    name: 'The Chrysalis Chapel', cell: [4, 22, 6, 2], kind: 'shrine',
    content: [
      ['shrine:wings', 'main'],
      ['lore:lore_mw_4', 'main'],
      'enemy:dusk_moth*2',
      'landmark:a chapel inside an enormous empty chrysalis; at its heart a blue ember floats among drifting grey wing-scales',
    ],
    notes: 'SMOKEWING SHRINE (96x18). Three ways in: N1 (cols 60-63) from the Dustfall Hollow, W1 (rows 3-5) from the Cocoon Deep onto a high west balcony (cols 1-14, floor top row 6), E1 (rows 12-14, floor top row 15) from the Silt Roots. Main floor top row 15. Under N1: one-way platforms tops rows 12, 8, 4 (climb back up). The west balcony steps down to the floor in 3-tile steps (tops 9, 12, 15) and can be climbed back the same way. Smokewing shrine at col 46 in the chrysalis\' heart (big pale light). lore_mw_4 (a moth-priest\'s prayer for flight) at col 30. Two dusk_moths outside the inner shell (none near the shrine).',
  });
};
