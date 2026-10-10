// The Sootflue (sf_*): vertical chimney region east of the Guttered Ways, reached over the Broken Bridge (dash).
// Spine: Great Flue gantry -> down the shaft -> Soot Matron's den -> Grip shrine -> Ashpit -> Chandlery.
// With grip: climb the Great Flue to the Chimney Tops and pull the lever that opens the shortcut to Lastlight.
module.exports = (R) => {
  R('sf_01', {
    name: 'The Chimney Tops', cell: [32, 1, 8, 2], kind: 'surface',
    exits: [['S', 'sf_02', 110, 4]],
    zones: { west: ['ll_03'], east: ['sf_02'], stack: [] },
    moves: { 'west<>east': ['lever:sf_lv1'], 'east>stack': ['wings'], 'stack>east': [] },
    content: [
      ['lever:sf_lv1', 'east'],
      'gate:sf_gate1?lever:sf_lv1',
      ['lore:lore_sf_1', 'east'],
      ['geode:sf_geo1', 'stack'],
      'enemy:ash_bat*2', 'enemy:soot_sprite*2',
      'landmark:Ash Ridge - a field of ruined brick chimney stacks smoking against the dusk, east of the village; one giant crown breathes red light',
    ],
    notes: 'Surface room (128x18) above the Sootflue, east of Lastlight. W1 (rows 11-13, floor top row 14) from Wickwright\'s Row. ONE-WAY SHORTCUT: sf_gate1 (iron portcullis, w1 h4, opens lever:sf_lv1) stands at col 6, rows 10-13, with a solid lintel above it; from the village side the player sees the bars and, beyond them, the lever. sf_lv1 is at col 10 on the east side of the gate - it can only be struck from the Flue side. Once open, Lastlight <-> Great Flue is a quick route (drop down the flue, climb up with grip). East zone: ash-crusted roofs, floor top row 14 with 1-3 tile chimney stubs to hop. S1 (cols 110-113) is the mouth of the Great Flue, set in a huge chimney crown (decor ring around it, red glow and smoke rising); the floor around the mouth dips to top row 15 for 3 cols each side (landing ledge for a player climbing out of the flue). lore_sf_1 (a chimney-sweep\'s plaque) at col 92. WINGS REWARD: the tallest stack (cols 60-63, faces of GLAZED (X) tiles, no wall within 6 tiles) has a flat top at row 7 (7 tiles above the roof) with sf_geo1 on it. Ash_bats circle the stacks, soot_sprites bob over the roofs.',
  });

  R('sf_02', {
    name: 'The Great Flue', cell: [38, 3, 2, 9], kind: 'shaft',
    exits: [['E', 'sf_09', 12, 3], ['E', 'sf_03', 30, 3], ['E', 'sf_07', 48, 3], ['E', 'sf_05', 75, 3]],
    zones: { crown: ['sf_01'], loft: ['sf_09'], gantry: ['gw_06', 'sf_03'], bottom: ['sf_07', 'sf_05'] },
    moves: {
      'crown>loft': [], 'loft>crown': ['grip'],
      'crown>gantry': [], 'loft>gantry': [], 'gantry>loft': ['grip'],
      'gantry<>bottom': [],
    },
    content: [
      ['lore:lore_sf_2', 'gantry'],
      ['sconce:sf_sconce_b', 'bottom'],
      'enemy:chimney_crawler*3', 'enemy:ash_bat*2',
      'landmark:THE GREAT FLUE - a colossal brick chimney, 80 tiles tall, crossed by a single iron gantry; red embers stream upward past the player',
    ],
    notes: 'Landmark vertical shaft (32x81), the spine of the region. GANTRY: an iron catwalk, floor top row 33, spans the shaft from W1 (rows 30-32, from the Broken Bridge) to E2 (rows 30-32, Bellows Hall); a 4-wide gap in its middle (cols 14-17, fenced by lips) lets the player drop down. ABOVE THE GANTRY (grip gate): sheer brick walls (# grippable) with NO footholds, platforms or pogo targets from row 32 up to the crown; the only ledge is the loft landing (cols 23-30, floor top row 15) at E1 (rows 12-14) and the crown at N1 (cols 14-17, row 0). Without Wax Grip the upper flue is unreachable; with it the player wall-jumps up, either into the Soot Lofts (E1) or out through N1 to the Chimney Tops. Dropping back down is always free. BELOW THE GANTRY: iron rungs - one-way platforms (=) 4-6 wide alternating sides with tops never more than 4 rows apart (rows 37, 41, 45, 49 ... down to the floor top row 78) so the bottom is reachable and climbable without abilities. E3 (rows 48-50) opens onto an east ledge (cols 22-30, floor top row 51) on that stair. E4 (rows 75-77) at the floor (top row 78) leads straight into the Soot Matron\'s den. sf_sconce_b on the shaft floor at col 8 (the rest before the Matron; a light). lore_sf_2 (a stoker\'s oath) on the gantry rail at col 6. Chimney_crawlers on the walls below the gantry, ash_bats in the air.',
  });

  R('sf_09', {
    name: 'The Soot Lofts', cell: [40, 3, 6, 2], kind: 'room',
    exits: [['E', 'sf_04', 12, 3]],
    content: [
      ['pickup:kiln_glass#sf_kg', 'main'],
      'enemy:soot_sprite*3', 'enemy:stoker*1',
      'landmark:dusty rafters hung with soot-sacks above the bellows; a pane of kiln glass glints on a cooling rack',
    ],
    notes: 'Hidden-ish upper room (96x18), reachable only by wall-climbing the Great Flue (W1 rows 12-14) or the Ember Shaft (E1 rows 12-14). Floor top row 15 of old rafters (gaps of 2-3 tiles to hop, no hazards beneath beyond the floor below at row 17). Kiln Glass sf_kg on a cooling rack at col 50 (glow). Soot_sprites among the sacks, one stoker shovelling at col 70.',
  });

  R('sf_03', {
    name: 'Bellows Hall', cell: [40, 5, 6, 2], kind: 'hall',
    exits: [['E', 'sf_04', 12, 3]],
    zones: { main: ['sf_02', 'sf_04'], smithy: [] },
    moves: { 'main<>smithy': [] },
    content: [
      ['sconce:sf_sconce_a', 'main'],
      ['lore:lore_sf_3', 'main'],
      ['pickup:sigil:swift_brand#sf_sig_swift_brand', 'smithy', { secret: 'breakable brickwork (B) in the low ceiling, reached from a raised shelf' }],
      'enemy:stoker*2', 'enemy:soot_sprite*1',
      'landmark:a pair of giant leather bellows, still heaving, pump air into the flue',
    ],
    notes: 'Long hall (96x18) east of the gantry; floor top row 15 (W1 and E1 rows 12-14). The giant bellows (animated decor) fill the background at cols 40-56. sf_sconce_a at col 18 (first rest in the Flue; light). lore_sf_3 (a bellows-keeper\'s tally) at col 30. Ceiling: rows 0-2 solid in general, but between cols 37 and 60 the brickwork hangs low (solid rows 0-8, hall air rows 9-14). SECRET: a brick shelf (cols 28-34, top row 9) reached from the floor via a crate (top row 12, cols 31-33); from the shelf, the low ceiling\'s west face (cols 37-38, rows 6-8) is B; behind it a cramped smithy (cols 39-46, rows 6-8, floor top row 9) holds the Quickwick sigil on an anvil. Two stokers patrol the floor; one soot_sprite.',
  });

  R('sf_04', {
    name: 'The Ember Shaft', cell: [46, 4, 2, 6], kind: 'shaft',
    zones: { top: ['sf_09'], mid: ['sf_03'], low: ['sf_07'], cache: [], vault: [] },
    moves: { 'top>mid': [], 'mid>top': ['grip'], 'mid<>low': [], 'top<>cache': [], 'low>vault': ['plunge'], 'vault>low': [] },
    content: [
      ['pickup:spark#spark_sf', 'cache', { secret: 'breakable wall (B) on the top landing' }],
      ['pickup:heartwax#sf_hw1', 'vault'],
      'enemy:ash_bat*2', 'enemy:chimney_crawler*1',
      'landmark:a narrow shaft where embers rise in a steady glowing stream',
    ],
    notes: 'Narrow shaft (32x54) east of the hall. W2 (rows 21-23) from Bellows Hall opens onto a landing (cols 1-10, floor top row 24). From there down to W3 (rows 39-41, floor top row 42) one-way platforms (=) zig-zag with tops at rows 27, 30, 34, 38 (free both ways). ABOVE W2 (grip gate): sheer # brick for 18 tiles, no footholds; at the top a landing (cols 1-30, floor top row 6) at W1 (rows 3-5, to the Soot Lofts). On that top landing a B partition (cols 22-23, rows 3-5) hides a cubby (cols 24-30, rows 3-5) holding Chandler\'s Spark spark_sf. PLUNGE REWARD: the shaft floor at row 42 has a cracked section - D floor at cols 8-15, rows 42-43; below it a sealed vault (cols 4-26, air rows 44-50, floor top row 51) holds Heartwax Shard sf_hw1; one-way platforms (tops rows 48 and 45, cols 16-19) next to the broken hole let the player climb back out (51 -> 48 -> 45 -> 42). Ash_bats in the updraft, a chimney_crawler on the walls.',
  });

  R('sf_07', {
    name: 'The Pipeworks', cell: [40, 7, 6, 3], kind: 'room',
    exits: [['E', 'sf_04', 12, 3]],
    zones: { main: ['sf_02', 'sf_04'], cistern: [] },
    moves: { 'main<>cistern': ['oilcloak'] },
    content: [
      ['geode:sf_geo2', 'cistern'],
      'enemy:chimney_crawler*2', 'enemy:stoker*1', 'enemy:ash_bat*1',
      'landmark:a tangle of iron pipes and valves venting steam; below the walkway a cooling cistern of meltwater lies under a huge pipe',
    ],
    notes: 'Two-level room (96x27). Upper walkway floor top row 15 links W1 (rows 12-14, from the Great Flue\'s east ledge) and E1 (rows 12-14, to the Ember Shaft); pipes along the ceiling, steam vents (decor). A stair of 3-tile steps at cols 6-12 leads down to the lower cistern level (floor top row 24, cols 4-30). OILCLOAK REWARD: east of the stair the lower level is a cooling cistern - meltwater 16 wide (cols 31-46, surface top row 22, liquid rows 22-23, basin floor row 24) under a giant horizontal pipe whose underside is at row 19 (3 tiles of air above the water), so it can be neither jumped nor dashed; past it a dry valve room (cols 47-58, floor top row 24, walled off above by the walkway) holds sf_geo2. The upper walkway must stay continuous over the cistern (rows 15-18 solid there). Chimney_crawlers on the pipes, one stoker on the walkway, an ash_bat.',
  });

  R('sf_05', {
    name: "The Matron's Den", cell: [40, 10, 3, 3], kind: 'arena',
    exits: [['E', 'sf_06', 21, 3]],
    zones: { west: ['sf_02'], east: ['sf_06'] },
    moves: { 'west<>east': ['boss:matron'] },
    content: [
      ['arena:matron', 'west'],
      'gate:sf_gate9?boss:matron',
      'landmark:a soot-black nest at the bottom of the chimneys, its walls crusted with egg-sacs that glow like coals',
    ],
    notes: 'BOSS ARENA - THE SOOT MATRON (48x27, with platforms). Floor top row 24 (rows 24-26 solid) across cols 1-46. W1 (rows 12-14) enters onto a west ledge (cols 1-5, floor top row 15) high above the den; a stair leads down: a solid step (cols 6-9, top row 18) and a one-way platform (cols 10-14, top row 21) - this stair is also the way back out (24 -> 21 -> 18 -> 15). Other platforms for her wall/platform leaps: center one-way platform (cols 20-28, top row 17) and east one-way platform (cols 33-38, top row 21). Both side walls are plain # (she clings to them). E1 (rows 21-23) at floor level on the east wall. Gates: arena_gate (w1,h4) at col 1 rows 11-14 (on the west ledge, under a solid lintel at row 10; shuts behind the player) and gate sf_gate9 (w1,h4, opens boss:matron) at col 46 rows 20-23 (lintel at row 19; the way east to the grip shrine, shut until she falls). arena entity: boss matron, bx=30, by=6 (she hangs from the ceiling, then drops), trigger cols 10-38 rows 16-23 (fires when the player reaches the den floor). No tile hazards (ash-fall and soot balls are her attacks). After victory both gates open; the Grip shrine is through E1.',
  });

  R('sf_06', {
    name: 'Shrine of the Wax Grip', cell: [43, 10, 3, 3], kind: 'shrine',
    exits: [['S', 'sf_08', 36, 4]],
    zones: { shrine: ['sf_05'], chute: ['sf_08'] },
    moves: { 'shrine<>chute': ['grip'] },
    content: [
      ['shrine:grip?boss:matron', 'shrine'],
      ['lore:lore_sf_4', 'shrine'],
      'landmark:a soot-streaked chapel; a sheer wall of brick beyond the pedestal, and over it, the red glow of the Ashpit',
    ],
    notes: 'Room after the Matron (48x27), no enemies. Floor top row 24 (W1 rows 21-23). Wax Grip shrine pedestal at col 12 (requires boss:matron). lore_sf_4 at col 6. GRIP LESSON / GATE: east of the shrine a sheer brick wall (cols 22-25, plain #, no footholds) rises 8 tiles from the floor to top row 16. Beyond it the chute (cols 26-46): its floor is also at top row 24 with the S1 opening (cols 36-39) in it, dropping into the Ashpit. The wall is 8 tiles high on both faces, so crossing it in either direction needs Wax Grip (wings alone cannot clear 8). A player rising out of the Ashpit through S1 lands on the chute floor beside the hole (chute floor dips to top row 25 for 3 cols each side).',
  });

  R('sf_08', {
    name: 'The Ashpit', cell: [44, 13, 4, 2], kind: 'room',
    exits: [['E', 'ch_10', 12, 3]],
    zones: { main: ['sf_06', 'ch_10'], niche: [] },
    moves: { 'main<>niche': [] },
    content: [
      ['geode:sf_geo3', 'niche', { secret: 'breakable wall (B) of compacted ash at the west end' }],
      'enemy:chimney_crawler*2', 'enemy:ash_bat*1',
      'landmark:a bed of warm ash where the soot of every chimney settles; to the east an iron door glows with the heat of the Chandlery',
    ],
    notes: 'Bottom of the Flue (64x18), the way down to the Chandlery. Floor top row 15 of deep ash. N1 (cols 20-23) up into the Grip shrine\'s chute: one-way platforms tops rows 12, 8, 4 under it. E1 (rows 12-14) leads into the Chandlery\'s Slag Gate through a heavy iron door frame (decor). SECRET: at the west end a B wall of compacted ash (cols 6-7, rows 12-14) hides a niche (cols 1-5, rows 12-14) with sf_geo3. Chimney_crawlers, one ash_bat.',
  });
};
