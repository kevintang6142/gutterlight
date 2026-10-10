// The Rime (ri_*): frozen depths under the Nave, Chandlery and Mothwood. Entered only by Molten Plunge
// (three cracked floors: Sunken Crypt, Quench Gate, Silt Roots). The up-only Ice Stair (grip) always leads home to the Nave.
// The Frozen Lake's ice wall needs Smokewing; beyond it Sable's second duel and the Seal Door.
module.exports = (R) => {
  R('ri_01', {
    name: 'The Frozen Stair', cell: [20, 22, 4, 4], kind: 'room',
    exits: [['E', 'ri_02', 12, 3], ['W', 'ri_03', 30, 3], ['S', 'ri_08', 52, 4]],
    zones: { top: ['dn_08'], main: ['ri_02', 'ri_03'], chute: ['ri_08'] },
    moves: { 'top>main': [], 'main>chute': [], 'chute>main': ['grip'] },
    content: [
      ['lore:lore_ri_1', 'main'],
      'enemy:frost_husk*2', 'enemy:shard_crawler*1',
      'landmark:a stair of frozen wax spiralling down into blue cold; waxen pilgrims stand frozen on its steps',
    ],
    notes: 'Arrival room from the Sunken Crypt (64x36). N1 (cols 12-15) is where a plunging player falls in: the shaft below it (cols 10-17, rows 0-14) has GLAZED (X) ice walls and no ledges - there is no way back up (one-way). The fall lands on an ice shelf, floor top row 15, spanning cols 8-63 to E1 (rows 12-14, to the Causeway). From the shelf\'s west end a frozen stair of 3-tile steps descends (from a ledge against the west wall it winds back east under the shelf) to the lower floor (cols 1-30, floor top row 33) at W1 (rows 30-32, to the Long Cold); it is climbable both ways without abilities. CHUTE: a 4-wide hole in the shelf (cols 52-55) opens a chute (# ice walls, grippable, no ledges; rows 16-35) straight down to S1 (cols 52-55) and the Sanctum Gate room; its bottom is barred by ri_gate1 inside ri_08 until the lever ri_lv1 is struck from below - a one-way shortcut back up from Sable\'s second duel. Dropping into the chute before that only lands on the grate (wall-jump back up with grip). Frozen pilgrim statues (decor) on the steps. lore_ri_1 (a frozen pilgrim\'s last words) at col 30 on the shelf. Two frost_husks on the stair, a shard_crawler on the walls.',
  });

  R('ri_02', {
    name: 'The Rime Causeway', cell: [24, 22, 8, 3], kind: 'corridor',
    exits: [['E', 'ri_05', 12, 3], ['S', 'ri_04', 122, 4]],
    zones: { main: ['ri_01', 'ri_05'], fall: ['ri_04'] },
    moves: { 'main>fall': [] },
    content: [
      ['lore:lore_ri_2', 'main'],
      ['geode:ri_geo1', 'main'],
      'enemy:ice_spitter*2', 'enemy:frost_husk*2', 'enemy:shard_crawler*1',
      'landmark:a long causeway over a frozen chasm, lined with waxen statues sealed in clear ice',
    ],
    notes: 'Long causeway room (128x27). Floor top row 15 (W1 and E1 rows 12-14): an ice causeway with low parapets over a frozen chasm (rows 16-26 below the causeway are open chasm in the middle part, cols 20-110; its floor top row 22 is ice with ^ ice shards on row 21 (kept in view from the causeway so the chasm reads as deadly) - a fall costs 1 health and the hazard respawn returns the player to the causeway; the chasm walls at cols 19 and 111 are GLAZED (X) on rows 17-21). Small gaps (<= 5 tiles) in the causeway for rhythm. FROZEN FALL (one-way drop, shortcut to the lake): near the east end the causeway has a 4-wide thin-ice one-way floor (cols 122-125; Down+Jump drops through, so nobody walking in from E1 falls by accident) over a chute that drops straight through S1 (cols 122-125) onto the Frozen Lake; no climbing back up it. lore_ri_2 (a pilgrims\' marker frozen fast) at col 66. ri_geo1 frozen against the west face of the parapet at col 101. Ice_spitters on the parapets, frost_husks on the causeway, a shard_crawler under the ceiling.',
  });

  R('ri_03', {
    name: 'The Long Cold', cell: [10, 24, 10, 2], kind: 'corridor',
    zones: { main: ['ri_01'], drop: ['mw_09'], shelf: [] },
    moves: { 'drop>main': [], 'main>shelf': ['wings'], 'shelf>main': [] },
    content: [
      ['geode:ri_geo2', 'main'],
      ['pickup:heartwax#ri_hw1', 'shelf'],
      'enemy:frost_husk*2', 'enemy:rime_wraith*1', 'enemy:shard_crawler*2',
      'landmark:a frozen tunnel where a whole procession of waxen pilgrims stands frozen mid-step, all walking down',
    ],
    notes: 'Long corridor (160x18) under the Mothwood. Floor top row 15 (E1 rows 12-14 to the Frozen Stair). N1 (cols 40-43): the one-way drop from the Silt Roots\' cracked floor lands here on a snow drift; the shaft above has GLAZED (X) ice walls, no ledges. The frozen procession (decor) fills the tunnel. WINGS REWARD: at the west end (cols 6-14) an ice shelf at top row 8, 7 tiles above the floor, GLAZED (X) faces and no wall within 6 tiles, holds Heartwax Shard ri_hw1. ri_geo2 in the ice at col 80. Frost_husks, a rime_wraith drifting through walls, shard_crawlers.',
  });

  R('ri_05', {
    name: 'The Icebound Stair', cell: [32, 22, 4, 3], kind: 'room',
    exits: [['E', 'ri_06', 12, 3], ['S', 'ri_04', 40, 4]],
    content: [
      ['sconce:ri_sconce_a', 'main'],
      'enemy:ice_spitter*1',
      'landmark:a frozen crossroads; a narrow ice stair climbs into the dark toward the faint sound of rain - the way home',
    ],
    notes: 'Crossroads of the Rime (64x27); every Rime entry leads here freely. Floor top row 15 (W1 and E1 rows 12-14). ri_sconce_a at col 34 (the first rest in the Rime; light). THE WAY HOME: N1 (cols 20-23) is the foot of the Reliquary\'s ice stair - one-way platforms under it with tops at rows 11, 7 and 4 (the top one directly under N1); from there the player wall-jumps (grip) up the enclosed shaft in dn_12 and drops into the Nave. Frost-rimmed steps and a faint warm draught mark it clearly. S1 (cols 40-43): a hole in the floor down to the Frozen Lake, sunk in a well (cols 37-46) with dips at top row 25 beside the hole and one-way rungs at rows 21 and 17 (the floor is 11 rows above the room bottom, so the upward boost out of ri_04 lands in the well); the climb back up is inside ri_04. One ice_spitter on a ledge.',
  });

  R('ri_06', {
    name: 'The Glacier Gallery', cell: [36, 22, 8, 2], kind: 'corridor',
    zones: { main: ['ri_05'], drop: ['ch_06'], cave: [] },
    moves: { 'drop>main': [], 'main<>cave': [] },
    content: [
      ['pickup:sigil:deep_kindle#ri_sig_deep_kindle', 'cave', { secret: 'breakable wall (B) of packed snow at the east end' }],
      'enemy:rime_wraith*2', 'enemy:shard_crawler*2',
      'landmark:a gallery cut through a glacier; the ice is so clear that drowned forges can be seen frozen inside it',
    ],
    notes: 'Corridor (128x18) under the Chandlery. Floor top row 15 (W1 rows 12-14 to the Icebound Stair). N1 (cols 78-81): the one-way drop from the Quench Gate\'s cracked floor lands here; the shaft above has GLAZED (X) ice walls and no ledges. Frozen forges and moldlings visible inside the ice (decor). SECRET: at the east end a B wall of packed snow (cols 112-113, rows 12-14) hides an ice cave (cols 114-126, rows 10-14, floor top 15) with the Deep Kindle sigil beside a frozen waxen who died kindling. Two rime_wraiths, two shard_crawlers.',
  });

  R('ri_04', {
    name: 'The Frozen Lake', cell: [30, 25, 6, 4], kind: 'landmark',
    exits: [['W', 'ri_07', 30, 3]],
    zones: { shore: ['ri_05'], fall: ['ri_02'], far: ['ri_07'] },
    moves: { 'shore<>far': ['wings'], 'fall>shore': [] },
    content: [
      ['npc:wren:4', 'shore'],
      ['lanternway:rime', 'shore'],
      ['lore:lore_ri_4', 'shore'],
      ['sconce:ri_sconce_b', 'far'],
      'enemy:rime_wraith*2', 'enemy:frost_husk*1',
      'landmark:THE FROZEN LAKE - a vast sheet of ice under a cavern sky of icicles; a lone small figure sits at its edge by a hole in the ice; beyond, a sheer wall of ice hides the way down',
    ],
    notes: 'Landmark (96x36). N2 (cols 72-75) from the Icebound Stair: one-way platforms tops rows 20, 16, 12, 8, 4 (the top one directly under N2) climb back up. N1 (cols 26-29) is the bottom of the Frozen Fall from the Causeway: players drop in onto the lake (one-way; nothing to climb back) down a hollow GLAZED column (X walls at cols 25 and 30, rows 0-17) so a dash cannot carry a falling player onto the wings-wall top. EAST SHORE: the frozen lake - a flat ice floor top row 24 across cols 23-95 (solid ice, no liquid). Wren (stage 4, nearly cold) sits at the lake edge at col 56 by a fishing hole (decor); Lanternway post rime at col 84; lore_ri_4 (Sable\'s note to her mother, scratched in black wax on the ice; she guards the next room) at col 66. WINGS GATE: at the lake\'s west end a sheer ice wall (cols 15-22, GLAZED X on every face) rises to top row 17 - exactly 7 tiles above the lake - with no ledges and no grippable surface within 6 tiles; only Smokewing reaches its top. West of it the ground falls away to the FAR SHORE (cols 1-14, floor top row 33) at W1 (rows 30-32, to Sable\'s second duel). Going back east needs Smokewing too: two GLAZED (X) ice pillars on the far shore - ledge A (cols 1-6, top row 27, the lintel over W1, attached to the west wall) and pillar B (cols 9-14, top row 21), each 6 rows above the last - lead back to the wall top (row 17, a 4-row hop from pillar B). ri_sconce_b on the far shore at col 8 at the foot of the pillars (the rest before Sable). Rime_wraiths over the lake, a frost_husk on the shore.',
  });

  R('ri_07', {
    name: 'The Last Guard', cell: [26, 27, 4, 2], kind: 'arena',
    exits: [['W', 'ri_08', 12, 3]],
    zones: { east: ['ri_04'], west: ['ri_08'] },
    moves: { 'east<>west': ['boss:sable2'] },
    content: [
      ['arena:sable2', 'east'],
      'gate:ri_gate9?boss:sable2',
      'landmark:a frozen hall before the Sanctum stair; the black-wax duelist stands in falling snow, scarf frozen stiff',
    ],
    notes: 'BOSS ARENA - SABLE, Last Guard of the Heart (64x18). Floor top row 15 flat across cols 1-62 (rows 15-17 solid; plain ice, no spikes). Ceiling solid rows 0-1; keep rows 2-14 open across the width for her frost-smoke dives. Two one-way ice platforms (=, top row 10) at cols 12-18 and 45-51. W1 and E1 rows 12-14 with solid lintels at row 10 above each door. arena_gate (w1,h4) at col 61 rows 11-14 (east, behind the player); gate ri_gate9 (w1,h4, opens boss:sable2) at col 2 rows 11-14 (west, toward the Seal Door, shut until she yields) - both closed during the duel. arena entity: boss sable2, bx=12, by=14 (she waits before the west door), trigger cols 24-40 rows 6-14. After she yields, both gates open and she reappears at the Sanctum gate (npc sable stage 2 in ri_08).',
  });

  R('ri_08', {
    name: 'The Sanctum Gate', cell: [22, 26, 4, 4], kind: 'gate',
    exits: [['S', 'hs_01', 2, 4]],
    zones: { gate: ['ri_07'], door: ['hs_01'], up: ['ri_01'] },
    moves: { 'gate<>door': ['seals>=3'], 'gate<>up': ['lever:ri_lv1'] },
    content: [
      ['lever:ri_lv1', 'gate'],
      'gate:ri_gate1?lever:ri_lv1',
      ['npc:sable:2', 'gate'],
      ['lore:lore_ri_3', 'gate'],
      ['sealdoor', ['gate', 'door']],   // the door is used from both sides (from S1 its back is in reach)
      'landmark:THE SEAL DOOR - a door of gold and black glass with three empty sockets (a bell, a kiln, a wing); light leaks around its edges',
    ],
    notes: 'The way down to the Sanctum (64x36). E1 (rows 21-23) from Sable\'s arena; floor top row 24 across cols 10-62. THE SEAL DOOR (sealdoor entity, about 3 wide x 6 tall) stands across the floor at cols 7-9, rows 18-23, in a solid gold-and-glass frame (cols 6-10 solid from row 0 to row 17 above it); it opens when the player holds all three Warden Seals (seals>=3). Behind it (cols 1-6) the floor at top row 24 has the S1 shaft (cols 2-5) going straight down (rows 24-35, # walls) into the Sanctum; dropping in is free, and the climb back needs no grip: three niches in the east wall (col 6: rows 30-32 over floor top 33, rows 26-28 over 29, row 24 over 25) are the footholds. ONE-WAY SHORTCUT: N1 (cols 20-23) leads up into the Frozen Stair\'s chute; ri_gate1 is a horizontal grate (w4, h1, opens lever:ri_lv1) at row 2, cols 20-23, framed by solid tiles at cols 18-19 and 24-25 (rows 0-2). Under it one-way platforms with tops at rows 20, 16, 12, 8 and 4 (the top one is split into cols 20-23 under the grate and cols 26-28, so the player fits under the frame); lever ri_lv1 stands on the top platform at col 27 - struck after the duel it opens the way straight back up to the Frozen Stair (grip climb in the chute). npc sable stage 2 (requires boss:sable2) stands aside near the door at col 30. lore_ri_3 (the three Wardens\' oath, BELL. FORGE. WING.) carved beside the sockets at col 36. No enemies.',
  });
};
