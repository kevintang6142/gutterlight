module.exports = (R) => {
  R('gw_01', {
    name: 'The Well', cell: [22, 3, 2, 4], kind: 'shaft',
    exits: [['W', 'gw_04', 30, 3], ['E', 'gw_02', 30, 3], ['E', 'gw_12', 12, 3]],
    zones: { shaft: ['ll_02', 'gw_04', 'gw_02'], hidden: ['gw_12'] },
    moves: { 'shaft<>hidden': [] },
    content: [
      ['lore:lore_gw_1', 'shaft'],
      'enemy:drip_fly*2',
      'landmark:the bottom of the Well - a round brick chamber; daylight from Lastlight falls in a thin shaft from far above',
    ],
    notes: 'Vertical brick shaft, the way down from Lastlight; must be climbable back up with NO abilities. One-way platforms (=, 5-7 wide) zig-zag left/right with at most 4 rows between tops: rows 30, 26, 22, 18, 14 (west side, clear of the east ledge), 10, 7 and a final one at row 4 spanning cols 13-18, directly under N1 so a full jump carries the player up through the opening. Bottom chamber: floor top row 33, W1 and E1 at rows 30-32 lead to the Bolt shrine (west) and the Hall of Dead Sconces (east). lore_gw_1 (a well-keeper plaque) on the bottom wall. SECRET: on the east wall a solid ledge (top row 15, cols 22-30) sits in front of a B wall (cols 29-30, rows 12-14) that hides E2 -> The Chandler\'s Alcove. Two drip_flies in the lower half. Dim shaft of light from above.',
  });

  R('gw_02', {
    name: 'Hall of Dead Sconces', cell: [24, 5, 6, 2], kind: 'hall',
    exits: [['E', 'gw_03', 12, 3], ['S', 'gw_08', 76, 4]],
    zones: { hall: ['gw_01', 'gw_03', 'gw_08'], ceiling: ['gw_12'] },
    moves: { 'ceiling>hall': [] },
    content: [
      ['lore:lore_gw_2', 'hall'],
      ['geode:gw_geo1', 'hall'],
      'enemy:snuffed_walker*3', 'enemy:drip_fly*1',
      'landmark:a long vaulted hall lined with two rows of dead iron sconces, each holding a cold black wick',
    ],
    notes: 'Long corridor (96 wide), floor top row 15 (W1/E1 rows 12-14), vaulted ceiling around row 3 with brick arches every 12 cols; rows of dead sconces as decor along the back wall (the region\'s signature image). Three snuffed_walkers spaced along the floor, one drip_fly. N1 (cols 40-43) is a hole in the ceiling 15 tiles up - unreachable from here; it is where a player drops in from the secret Alcove (one-way). S1 (cols 76-79) is a hole in the floor down to the Drip Galleries: around it lower the floor to top row 16 for 3 cols each side (landing ledge for players rising from below). gw_geo1 in an alcove of the south wall near col 20 (no gate). lore_gw_2: the lamplighters\' roll-call carved on a pillar at col 60.',
  });

  R('gw_03', {
    name: 'Lantern Crossroads', cell: [30, 5, 4, 3], kind: 'hub',
    exits: [['W', 'gw_08', 21, 3], ['E', 'gw_06', 12, 3], ['N', 'gw_07', 6, 4], ['S', 'gw_09', 44, 4]],
    zones: { main: ['gw_02', 'gw_08', 'gw_06', 'gw_07', 'gw_09'] },
    content: [
      ['lanternway:guttered', 'main'],
      ['lore:lore_gw_3', 'main'],
      'enemy:snuffed_lancer*1', 'enemy:wick_crawler*1',
      'landmark:a four-way crossroads beneath a huge hanging iron lantern-frame, long dead; signposts point to Lastlight, the bridge and the deep',
    ],
    notes: 'HUB (64x27). Mid floor top row 15 joins W1 (rows 12-14, from the Hall) and E1 (rows 12-14, to the Broken Bridge). Lower floor top row 24 joins W2 (rows 21-23, Drip Galleries) and S1 (cols 44-47, down to Wren\'s Hollow); connect mid and lower floors with 3-4 tile steps/platforms. N1 (cols 6-9) up to Sable\'s Perch: a stair of one-way platforms on the west side (tops rows 11, 7, 4; the last directly under N1). Lanternway post guttered on the mid floor at col 30 (with a light). lore_gw_3 = the Queen\'s decree "No flame shall gutter" on a signpost stone. One snuffed_lancer on the mid floor, a wick_crawler on the lower floor. S1 hole: floor around it at top row 25 (landing ledge for players rising from below).',
  });

  R('gw_04', {
    name: 'Shrine of the Kindled Bolt', cell: [18, 5, 4, 2], kind: 'shrine',
    exits: [['W', 'gw_05', 12, 3], ['S', 'gw_11', 24, 4]],
    zones: { main: ['gw_01', 'gw_05', 'gw_11'] },
    content: [
      ['shrine:bolt', 'main'],
      ['sconce:gw_sconce_a', 'main'],
      'landmark:a small brick chapel; a pedestal holds a floating blue ember amid melted votive candles',
    ],
    notes: 'Main path, no enemies (sanctuary before the Effigy). Floor top row 15 (W1/E1 rows 12-14). Bolt shrine pedestal at col 34 under a skylight shaft; gw_sconce_a at col 46 (the sconce near the Effigy arena). The west doorway (W1) leads into the Effigy\'s hall: make it a heavy stone arch. S1 (cols 24-27) is a hole in the floor dropping into the Wickworm Tunnels (floor around it top row 16). Teaching moment: after taking the bolt, a breakable-looking crate or a dummy target is optional; do not add hazards.',
  });

  R('gw_05', {
    name: "The Old Guard's Hall", cell: [14, 5, 4, 2], kind: 'arena',
    exits: [['W', 'mb_01', 12, 3]],
    zones: { east: ['gw_04'], west: ['mb_01'] },
    moves: { 'east<>west': ['boss:effigy'] },
    content: [
      ['arena:effigy', 'east'],
      'gate:gw_gate1?boss:effigy',
      'landmark:a giant cracked statue of a royal guard kneels in the dark, an iron snuffer-cap hammer across its knees',
    ],
    notes: 'BOSS ARENA - THE EFFIGY (64x18). Flat floor top row 15 across cols 1-62 (rows 15-17 solid); ceiling rows 0-2 solid with a few cracked stalactite clusters (debris-fall spawn points along row 3). W1 and E1 at rows 12-14; just inside both, keep rows 11-14 open for 3 cols and solid ceiling at row 10 above them so gates fit. gw_gate1 (w1,h4, opens boss:effigy) at col 2 rows 11-14 - closed until the Effigy falls, it is the way west to Meltbloom. arena_gate (w1,h4) at col 61 rows 11-14 (closes behind the player during the fight). arena entity: boss effigy, spawn bx=18, by=14 (kneeling statue, west half), trigger rect cols 26-50 rows 6-14 (entering from the east). No platforms, no hazards (the hammer shockwaves need a clean floor); the room is wide enough to dodge leaps. After victory: 200 cinders burst (boss reward), both gates open.',
  });

  R('gw_06', {
    name: 'The Broken Bridge', cell: [34, 5, 4, 3], kind: 'gate',
    exits: [['E', 'sf_02', 12, 3]],
    zones: { west: ['gw_03'], east: ['sf_02'] },
    moves: { 'west<>east': [['dash'], ['wings']] },
    content: [
      'enemy:drip_fly*2',
      'landmark:a great stone bridge broken in the middle over a black chasm; the red glow of the Sootflue flickers beyond',
    ],
    notes: 'DASH GATE between the Guttered Ways and the Sootflue. Room 64x27. Bridge deck top row 15 at both ends (W1/E1 rows 12-14), deck 2 tiles thick (rows 15-16) resting on piers. The span is collapsed between cols 26 and 34: a 9-tile gap at equal height (deck ends at col 25 and resumes at col 35; critical-path dash gaps are 9 tiles, 10 only for optional rewards), no ledges, chains or walls within it. Below the gap the chasm drops 9 tiles to a spike bed (^ at row 24 over solid rows 25-26): too deep to pogo back up, so a fall costs 1 health and respawns on the near deck. The chasm walls (the deck ends and piers, cols 25 and 35 downward) are GLAZED (X) so Wax Grip cannot climb out on the far side. Ceiling high (row 4 or above) so the dash+jump arc is not blocked. Visually: broken balustrade, hanging rubble, a deep dark void, the Flue\'s ember-light from the east. Two drip_flies hover over the gap (they can be pogo-ed but must not be required).',
  });

  R('gw_07', {
    name: "Sable's Perch", cell: [28, 3, 6, 2], kind: 'room',
    zones: { main: ['gw_03'], west: ['gw_12'], heights: [] },
    moves: { 'main<>west': [], 'main>heights': ['wings'], 'heights>main': [] },
    content: [
      ['npc:sable:1', 'main'],
      ['lore:lore_gw_4', 'main'],
      ['geode:gw_geo3', 'heights'],
      'enemy:snuffed_lancer*2',
      'landmark:the broken top of an old belfry; a black-wax figure with a long red scarf watches from a high beam, then is gone',
    ],
    notes: 'Upper room (96x18) reached from the Crossroads below via S1 (cols 38-41). Floor top row 15 (broken masonry, 1-tile bumps); around the S1 hole the floor dips to top row 16 for 3 cols on each side (landing ledge for players rising out of the Crossroads). SABLE GLIMPSE: npc sable stage 1 (event) stands on a high beam (top row 4, cols 70-76, unreachable without wings) and leaves when the player comes within ~10 tiles; foreshadows her duel. lore_gw_4: a guard-captain\'s order "hold the deep ways" at col 52. Two snuffed_lancers. WINGS REWARD: a ledge at cols 84-90, top row 8, 7 tiles above the floor with GLAZED (X) faces and no wall within 6 tiles, holds gw_geo3. SECRET: a B wall (cols 2-3, rows 12-14) hides W1 -> the Chandler\'s Alcove (W1 rows 12-14 open at col 0 behind it; floor top row 15).',
  });

  R('gw_08', {
    name: 'Drip Galleries', cell: [26, 7, 4, 3], kind: 'room',
    exits: [['W', 'gw_11', 12, 3], ['E', 'gw_09', 21, 3], ['S', 'gw_10', 10, 4]],
    zones: { main: ['gw_02', 'gw_03', 'gw_11', 'gw_09', 'gw_10'], cistern: [] },
    moves: { 'main<>cistern': ['oilcloak'] },
    content: [
      ['geode:gw_geo2', 'cistern'],
      'enemy:drip_fly*2', 'enemy:wick_crawler*2',
      'landmark:a cavern of wax stalactites that drip constantly into pale pools',
    ],
    notes: 'Cave junction (64x27) with many levels, all connected without abilities. N1 (cols 44-47) from the Hall above: a one-way platform under it with top at row 4, reachable by a stair of ledges. E1 (rows 3-5, floor top row 6) is a high east ledge to the Crossroads\' lower floor. W1 (rows 12-14, floor top row 15) to the Wickworm Tunnels. E2 (rows 21-23, floor top row 24) to Wren\'s Hollow. S1 (cols 10-13) a hole in the bottom floor down to the Descent Lip (floor around it top row 25). OILCLOAK REWARD: in the bottom-west a meltwater pool (~16 wide, cols 16-31, surface row 22) runs under a low rock vault (2-3 tiles of air above the water) into a small dry pocket holding gw_geo2. Wick_crawlers on the lower floor, drip_flies in the upper air.',
  });

  R('gw_09', {
    name: "Wren's Hollow", cell: [30, 8, 4, 3], kind: 'room',
    zones: { main: ['gw_03', 'gw_08'], nook: [], niche: [] },
    moves: { 'main<>nook': [['dash'], ['wings']], 'main<>niche': [] },
    content: [
      ['npc:wren:1', 'main'],
      ['sconce:gw_sconce_b', 'main'],
      ['pickup:heartwax#gw_hw1', 'nook'],
      ['pickup:sigil:ember_thirst#gw_sig_ember_thirst', 'niche', { secret: 'breakable wall (B) behind Wren\'s tent at the west end of the lower floor' }],
      'enemy:wick_crawler*1',
      'landmark:a sheltered hollow where a small traveler with a snuffer-cap hat has pitched a tent beside a tiny fire',
    ],
    notes: 'Camp room (64x27). N1 (cols 44-47) drops in from the Crossroads: a one-way platform under it at top row 4 with ledges down to the camp. Main floor top row 15 (W1 rows 12-14 to the Drip Galleries). Wren (stage 1) sits by her fire at col 20; gw_sconce_b at col 30. SECRET: behind Wren\'s tent the west wall (cols 2-3, rows 12-14) is B -> a 6x3 niche with the Ember Thirst sigil. DASH REWARD: on the east side the floor ends at col 46 at a drop into a deep crack (spikes ^ at row 25); across a 10-tile gap (cols 47-56) a ledge at top row 15 (cols 57-61) holds gw_hw1; nothing to stand on in between and no walls within reach. The crack walls (col 46 downward and col 57 downward) are GLAZED (X) so grip cannot climb out to the ledge; the spikes are 10 tiles down (too deep to pogo back). One wick_crawler patrols near the crack.',
  });

  R('gw_10', {
    name: 'The Descent Lip', cell: [26, 10, 4, 2], kind: 'gate',
    exits: [['S', 'dn_01', 44, 4]],
    zones: { floor: ['gw_08'], lip: ['dn_01'] },
    moves: { 'floor>lip': ['grip'], 'lip>floor': [] },
    content: [
      ['lore:lore_gw_5', 'floor'],
      'enemy:snuffed_walker*1',
      'landmark:a sheer wall of glistening wax; beyond its rim a black pit breathes cold wet air and the sound of rain',
    ],
    notes: 'GRIP GATE to the Drowned Nave (the descent entrance must be unreachable without grip). N1 (cols 10-13): players drop in from the Drip Galleries; a stair of ledges leads back up (platform top row 4 under N1). West floor top row 15 (cols 1-30). At col 31 a SHEER wall rises from row 15 to a plateau top at row 5 (10 tiles; # grippable, absolutely no footholds, nothing to pogo); plateau spans cols 31-40. East of it a narrow pit (cols 41-50, walls #) drops from row 5 to S1 (cols 44-47) and on into the Long Descent. Climbing back up from the pit needs grip (wall-jumps on the pit walls), then the player drops off the plateau to the floor. lore_gw_5, a warning carved at col 20: "below, the rain never stops". One snuffed_walker on the floor.',
  });

  R('gw_11', {
    name: 'Wickworm Tunnels', cell: [16, 7, 10, 2], kind: 'corridor',
    zones: { main: ['gw_04', 'gw_08'], vault: [], shelf: [] },
    moves: { 'main>vault': ['plunge'], 'vault>main': [], 'main<>shelf': [['dash'], ['wings']] },
    content: [
      ['pickup:spark#spark_gw', 'vault'],
      ['geode:gw_geo4', 'shelf'],
      'enemy:wick_crawler*3', 'enemy:snuffed_walker*2',
      'landmark:long low tunnels bored through old wax by wickworms; the walls are ribbed with their spiral tracks',
    ],
    notes: 'Long corridor (160x18). Main floor top row 15 (E1 rows 12-14 to the Drip Galleries). N1 (cols 56-59) is the hole from the Bolt shrine above: provide one-way platforms below it (tops rows 12, 8, 4; the last directly under N1) so players can climb back up. Mild undulation, wick_crawlers on floor and ceiling, snuffed_walkers. West end (cols 1-30): the floor climbs in 3-tile steps to a raised shelf with top row 9; part of that shelf (cols 8-13, rows 9-10) is a cracked floor D. PLUNGE REWARD: under the D floor a hidden vault (cols 3-20, rows 11-15) holds Chandler\'s Spark spark_gw on a small altar; inside the vault a one-way platform (=, top row 13) right beside the hole lets the player climb back out through the broken hole (vault floor top row 16 -> platform 3 up -> shelf surface 4 up). Before plunge the D floor just looks like old cracked stone - a visible promise. DASH REWARD (gw_geo4): in the east half (cols 100-140) the tunnel ceiling opens into a wormhole gallery: a ledge at top row 9 (cols 104-108) reachable by 3-tile steps faces, across a 10-tile gap at equal height (cols 109-118, nothing to stand on, no walls in reach), a shelf at cols 119-124 (top row 9, faces GLAZED X so it cannot be gripped from the floor 6 tiles below) holding gw_geo4; the floor below stays walkable, so a failed dash just drops you back onto the tunnel floor.',
  });

  R('gw_12', {
    name: "The Chandler's Alcove", cell: [24, 3, 4, 2], kind: 'secret',
    secret: 'reached only through breakable walls (the Well, gw_01 east wall at mid height; or Sable\'s Perch, gw_07 west end); its floor hole drops into the Hall of Dead Sconces',
    exits: [['S', 'gw_02', 40, 4], ['E', 'gw_07', 12, 3]],
    zones: { main: ['gw_01', 'gw_07'], hole: ['gw_02'] },
    moves: { 'main>hole': [] },
    content: [
      ['pickup:notch#gw_notch', 'main'],
      'landmark:a hidden alcove whose walls are covered in a faded mural of a vast many-handed maker pouring small candles',
    ],
    notes: 'SECRET ROOM (64x18). Floor top row 15 (W1 and E1 rows 12-14). The mural (decor) of the Chandler on the back wall. The Wax Notch gw_notch on a little plinth at col 30 - the Guttered Ways\' hidden notch. S1 (cols 40-43) is an open hole in the floor that drops 15 tiles into the Hall of Dead Sconces (a one-way shortcut back to the main road); fence it with a low lip so players do not fall in by accident. Warm faint light (a single surviving candle).',
  });
};
