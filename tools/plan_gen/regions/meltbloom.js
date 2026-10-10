// Meltbloom Gardens (mb_*): west of the Guttered Ways, entered through the Effigy's hall.
// Spine: Garden Gate -> Bloom Atrium (hub) -> Thornwalk -> Sable's lawn (arena) -> Flare shrine.
// Loops: Gate/Terraces/Atrium; Gate/Arbor/Thornwalk/Atrium (drop); post-duel Petal Bridge back to the Atrium.
module.exports = (R) => {
  R('mb_01', {
    name: 'Garden Gate', cell: [10, 5, 4, 2], kind: 'room',
    exits: [['W', 'mb_02', 12, 3], ['N', 'mb_03', 48, 4], ['S', 'mb_10', 8, 4]],
    content: [
      ['lore:lore_mb_1', 'main'],
      'enemy:pollen_moth*2', 'enemy:bloom_spitter*1',
      'landmark:the brick of the Guttered Ways gives way to cream wax soil and the first giant wax flower, its petals glowing gold',
    ],
    notes: 'First room of the gardens (64x18), entered from the Effigy\'s hall at E1 (rows 12-14). Floor top row 15 across; W1 rows 12-14 opens onto the Atrium\'s east terrace. N1 (cols 48-51) is a gap in the ceiling up to the Pollen Terraces: one-way platforms (=) under it with tops at rows 12, 8 and 4 (the last spanning cols 47-52, directly under N1). S1 (cols 8-11) is a hole in the floor down to the Weeping Arbor; around it the floor dips to top row 16 for 3 cols on each side (landing ledge for players rising out of mb_10). lore_mb_1 (a gardener\'s sign: "tend, and be tended") at col 26. One bloom_spitter rooted on the floor near col 36, two pollen_moths drifting under the ceiling. Warm gold light from a giant wax flower in the background at col 40.',
  });

  R('mb_02', {
    name: 'The Bloom Atrium', cell: [4, 3, 6, 6], kind: 'hub',
    exits: [['E', 'mb_03', 12, 3], ['W', 'mb_04', 12, 3], ['W', 'mb_05', 39, 3], ['S', 'mb_08', 74, 4]],
    zones: { canopy: ['mb_03', 'mb_04'], floor: ['mb_01', 'mb_05', 'mb_08'] },
    moves: { 'canopy<>floor': [] },
    content: [
      ['lanternway:meltbloom', 'floor'],
      ['sconce:mb_sconce_a', 'floor'],
      ['lore:lore_mb_2', 'floor'],
      'enemy:pollen_moth*3', 'enemy:thorn_hopper*2', 'enemy:bloom_spitter*1',
      'landmark:THE MELTBLOOM - a wax flower as tall as a cathedral grows up the middle of a vast glass-roofed atrium; its cup glows like a lamp',
    ],
    notes: 'REGION HUB and landmark (96x54). Four levels, all linked by the giant flower: (1) CANOPY walkway, floor top row 15, at W1 (rows 12-14, cols 0-20) and E1 (rows 12-14, cols 75-95), joined across the middle by the rim of the flower\'s cup (cols 30-65, top row 15-17, shallow bowl). (2) EAST TERRACE floor top row 33 (cols 72-95) at E2 (rows 30-32) from the Garden Gate. (3) WEST TERRACE floor top row 42 (cols 0-24) at W2 (rows 39-41) toward the Petal Bridge. (4) GROUND FLOOR top row 51 (rows 51-53 solid) across the whole width. The flower\'s stem (cols 42-53) carries broad leaf platforms (=) alternating sides with tops at rows 47, 43, 39, 35, 31, 27, 23, 19 (never more than 4 rows apart) that join every level - the Atrium must be fully climbable without abilities. S1 (cols 74-77) is a hole in the ground floor, fenced by 1-tile lips: a ONE-WAY DROP into the Thornwalk (no way back up from below; the return is through the Weeping Arbor and the Garden Gate). Lanternway post meltbloom on the ground floor at col 24; mb_sconce_a at col 58 under the flower (big warm light); lore_mb_2 carved into the flower\'s pot at col 40. Enemies: pollen_moths in the air, thorn_hoppers on the terraces, a bloom_spitter on the east terrace. Glass roof (rows 0-3) with gold light shafts.',
  });

  R('mb_03', {
    name: 'Pollen Terraces', cell: [10, 3, 4, 2], kind: 'room',
    zones: { main: ['mb_02', 'mb_01'], pod: [] },
    moves: { 'main>pod': ['wings'], 'pod>main': [] },
    content: [
      ['geode:mb_geo1', 'pod'],
      'enemy:pollen_moth*2', 'enemy:bloom_spitter*1',
      'landmark:terraced flower beds under a golden haze of drifting pollen',
    ],
    notes: 'Upper loop between the Atrium canopy (W1 rows 12-14) and the Garden Gate below (S1 cols 48-51). Floor top row 15 with raised planter beds (1-2 tile bumps). Around S1 the floor dips to top row 16 for 3 cols on each side (landing ledge for players rising out of mb_01). WINGS REWARD: a hanging seed-pod platform (cols 24-30, top row 8) 7 tiles above the floor, GLAZED (X) faces, no wall within 6 tiles; mb_geo1 sits in the pod. One bloom_spitter in a bed at col 40, two pollen_moths.',
  });

  R('mb_04', {
    name: 'Overgrown Cloister', cell: [0, 3, 4, 3], kind: 'room',
    zones: { main: ['mb_02'], crypt: [], nook: [] },
    moves: { 'main>crypt': ['plunge'], 'crypt>main': [], 'main<>nook': [] },
    content: [
      ['lore:lore_mb_3', 'main'],
      ['pickup:spark#spark_mb', 'crypt'],
      ['geode:mb_geo3', 'nook', { secret: 'breakable wall (B) at the west end of the courtyard' }],
      'enemy:vine_lurker*2', 'enemy:thorn_hopper*1',
      'landmark:a collapsed cloister of the old gardeners; wax vines have swallowed the arcades and a cracked reliquary slab lies in the courtyard',
    ],
    notes: 'Optional dead-end branch off the Atrium canopy (64x27). E1 (rows 12-14) enters onto an east gallery (floor top row 15, cols 40-63) that steps down in 3-tile steps to a courtyard (floor top row 18, cols 4-39; rows 18-26 solid below except the crypt). lore_mb_3 on a fallen arcade pillar at col 30. PLUNGE REWARD: a cracked reliquary slab - D floor at cols 20-25, rows 18-19; beneath it a crypt (cols 12-36, air rows 20-23, floor top row 24) holding Chandler\'s Spark spark_mb on a bier. Exit: a one-way platform (=, top row 21, cols 17-19) right beside the broken hole (crypt floor 24 -> platform 21 -> courtyard 18). SECRET: a B wall (cols 6-7, rows 15-17) hides a pocket (cols 1-5, rows 15-17) with mb_geo3. Vine_lurkers hang from the arcades; one thorn_hopper in the courtyard.',
  });

  R('mb_05', {
    name: 'The Petal Bridge', cell: [0, 6, 4, 3], kind: 'gate',
    exits: [['S', 'mb_06', 10, 4]],
    zones: { east: ['mb_02'], west: ['mb_06'] },
    moves: { 'east<>west': [['dash'], ['wings']] },
    content: [
      'enemy:pollen_moth*2',
      'landmark:a bridge of enormous fallen petals over a thorn-choked ravine; half of it has fallen away',
    ],
    notes: 'DASH GATE and post-duel shortcut (64x27). E1 (rows 12-14) from the Atrium\'s west terrace. Petal deck top row 15 on both sides: east deck cols 35-63, west deck cols 2-25. The middle has fallen away: a 9-tile gap at equal height (cols 26-34; critical-path dash gaps are 9 tiles, 10 only for optional rewards) with nothing to stand on. The ravine below drops 9 tiles to a thorn bed (^ at row 24 over solid rows 25-26) - too deep to pogo back up; a fall costs 1 health and respawns on the near deck. Ravine walls (cols 25 and 35 from row 15 down) are GLAZED (X) so grip cannot climb out on the far side. S1 (cols 10-13): a shaft from the west deck straight down to the Shrine of the Flare; one-way platforms across the shaft with tops at rows 25, 21 and 18 (a player rising out of mb_06 lands on row 25, then climbs to the deck). From the shrine side this is the fast way back to the Atrium once you have Flare Dash (teaches the dash immediately); before that the west side is unreachable except through the arena. Two pollen_moths over the ravine (pogo-able, never required).',
  });

  R('mb_06', {
    name: 'Shrine of the Flare', cell: [0, 9, 4, 2], kind: 'shrine',
    exits: [['E', 'mb_07', 12, 3], ['S', 'mb_09', 40, 4]],
    content: [
      ['shrine:dash?boss:sable1', 'main'],
      ['lore:lore_mb_4', 'main'],
      'landmark:a chapel of white wax petals; on the pedestal a blue ember flickers, waiting for whoever walks out of the duel',
    ],
    notes: 'Quiet room beyond Sable\'s lawn (64x18), no enemies. Floor top row 15. E1 (rows 12-14) is the arena\'s west door. Flare Dash shrine pedestal at col 30 (shrine requires boss:sable1 - before that the ember is dormant; the room is not reachable before the duel anyway). lore_mb_4 on a petal plinth at col 46. N1 (cols 10-13) up to the Petal Bridge: one-way platforms tops rows 12, 8, 4 (last directly under N1). S1 (cols 40-43): hole down to the Root Hollows; floor dips to top row 16 for 3 cols on each side (landing ledge for players rising out of mb_09).',
  });

  R('mb_07', {
    name: 'The Moonlit Lawn', cell: [4, 9, 4, 2], kind: 'arena',
    exits: [['E', 'mb_08', 12, 3]],
    zones: { east: ['mb_08'], west: ['mb_06'] },
    moves: { 'east<>west': ['boss:sable1'] },
    content: [
      ['arena:sable1', 'east'],
      'gate:mb_gate9?boss:sable1',
      'landmark:a round lawn of pale wax grass under a cracked glass dome; a black-wax duelist with a red scarf waits at the far end',
    ],
    notes: 'BOSS ARENA - SABLE, duel 1 (64x18). Floor top row 15 flat across cols 1-62 (rows 15-17 solid). Ceiling solid rows 0-1 (cracked glass dome look); keep rows 2-14 open across the whole width for her aerial dive and the boomerang hook. Two thin one-way petal platforms (=, top row 10) at cols 14-19 and 44-49 give the player dodge options; nothing else, no hazards. W1 and E1 rows 12-14; above each door a solid lintel at row 10 (cols 0-3 and 60-63) frames the gates. arena_gate (w1,h4) at col 61 rows 11-14 (east, shuts behind the player during the duel); gate mb_gate9 (w1,h4, opens boss:sable1) at col 2 rows 11-14 (west, shut until she is beaten). Both open on victory. arena entity: boss sable1, bx=12, by=14 (she waits at the west end, facing east), trigger cols 24-40 rows 6-14 (the player walks in from the east). The player cannot pass west without winning (the west gate leads to the Flare Dash shrine). Sconce mb_sconce_b is just east in the Thornwalk.',
  });

  R('mb_08', {
    name: 'The Thornwalk', cell: [8, 9, 6, 2], kind: 'corridor',
    exits: [['N', 'mb_10', 76, 4]],
    zones: { main: ['mb_07', 'mb_10'], drop: ['mb_02'] },
    moves: { 'drop>main': [] },
    content: [
      ['sconce:mb_sconce_b', 'main'],
      ['pickup:sigil:thorned_wax#mb_sig_thorned_wax', 'main', { secret: 'breakable hedge wall (B) at the east end' }],
      'enemy:thorn_hopper*2', 'enemy:bloom_spitter*2', 'enemy:vine_lurker*1',
      'landmark:a corridor of black thorn hedges taller than houses, opening west onto a moonlit lawn',
    ],
    notes: 'Corridor (96x18) toward the duel. Floor top row 15; W1 (rows 12-14) is the lawn\'s east door. N1 (cols 10-13): the ONE-WAY drop from the Atrium lands here on a moss mound; the shaft above it is lined with GLAZED (X) wax and has no platforms (no way back up). N2 (cols 76-79): up to the Weeping Arbor - one-way platforms tops rows 12, 8, 4 under it (last directly under N2). Two thorn beds (^ in 1-deep troughs, 5 wide) at cols 30-34 and 52-56 to jump or pogo over; thorn_hoppers between them, bloom_spitters on the hedges, a vine_lurker hanging at col 44. mb_sconce_b at col 6 just before the lawn (the rest before the duel; warm light). SECRET: the east end is a dense hedge block (solid, cols 84-95, rows 4-14; it does not touch N2) whose west face (cols 84-85, rows 12-14) is B; behind it a niche (cols 86-93, rows 12-14, floor top 15) holds the Thorned Wax sigil on a thorn-wreathed stand.',
  });

  R('mb_09', {
    name: 'Root Hollows', cell: [0, 11, 8, 2], kind: 'corridor',
    exits: [['S', 'mw_03', 20, 4]],
    zones: { main: ['mb_06', 'mw_03'], grotto: [] },
    moves: { 'main<>grotto': ['oilcloak'] },
    content: [
      ['geode:mb_geo2', 'grotto'],
      'enemy:vine_lurker*2', 'enemy:thorn_hopper*1', 'enemy:pollen_moth*1',
      'landmark:a long tunnel through the garden\'s root mat; far below, through a barred shaft, violet moth-light glimmers',
    ],
    notes: 'Long root tunnel (128x18) under the shrine. Floor top row 15. N1 (cols 40-43) from the shrine: one-way platforms tops rows 12, 8, 4 under it for the climb back. S1 (cols 20-23): a shaft down to the Mothward Gate; it is barred by mw_gate1 (inside mw_03, a horizontal grate just below the opening) which is opened only by lever mw_lv1 on the Mothwood side - the player sees the bars and the moth-light below long before reaching the Mothwood. Around S1 the floor dips to top row 16 for 3 cols on each side (landing ledge for players rising out of mw_03 once the gate is open). OILCLOAK REWARD: at cols 76-97 the floor sinks into a basin of meltwater (surface top row 15, liquid rows 15-16, basin floor row 17), 22 wide; the root ceiling hangs down to row 12 over the whole basin (3 tiles of air) so it cannot be jumped or dashed; beyond it a dry grotto (cols 98-124, floor top 15, sealed at the east end) holds mb_geo2. Vine_lurkers hang from the roots; one thorn_hopper and one pollen_moth patrol the dry stretch.',
  });

  R('mb_10', {
    name: 'Weeping Arbor', cell: [10, 7, 4, 2], kind: 'room',
    zones: { main: ['mb_01', 'mb_08'], trunk: [] },
    moves: { 'main>trunk': ['grip'], 'trunk>main': [] },
    content: [
      ['pickup:heartwax#mb_hw1', 'trunk'],
      'enemy:vine_lurker*2', 'enemy:pollen_moth*1',
      'landmark:weeping wax trees let long pale strands hang to the ground like curtains',
    ],
    notes: 'Link between the Garden Gate (N1, cols 8-11) and the Thornwalk (S1, cols 44-47); 64x18. Floor top row 15. Under N1: one-way platforms tops rows 12, 8, 4 (last directly under N1) for the climb back to mb_01. Around S1 the floor dips to top row 16 for 3 cols on each side (landing ledge for players rising from the Thornwalk). GRIP REWARD: at the east end a sheer trunk (cols 56-58, plain #, no knots or footholds) rises from the floor to top row 6 (9 tiles; out of Smokewing reach); a hollow in its crown (cols 56-61, rows 3-5) holds Heartwax Shard mb_hw1. Vine_lurkers hang in the strands; one pollen_moth.',
  });
};
