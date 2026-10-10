// The Drowned Nave (dn_*): the great rain-soaked cathedral-city below the Guttered Ways (entered with grip).
// Spine: Long Descent -> Flooded Aisle -> the Drowned Nave (hub) -> Choir Loft -> Tallowmere's belfry.
// Branches: Bell Tower climb (grip) -> Oilcloak shrine; Flooded Tunnel (oilcloak) -> Mothwood;
// Gallery of Saints (grip+dash) -> Chandlery; Sunken Crypt (plunge) -> Rime; the Reliquary's up-only ice stair <- Rime.
module.exports = (R) => {
  R('dn_01', {
    name: 'The Long Descent', cell: [28, 12, 2, 4], kind: 'shaft',
    exits: [['W', 'dn_02', 30, 3], ['E', 'dn_09', 30, 3]],
    zones: { top: ['gw_10'], bottom: ['dn_02', 'dn_09'] },
    moves: { 'top>bottom': [], 'bottom>top': ['grip'] },
    content: [
      ['lore:lore_dn_1', 'bottom'],
      'enemy:rain_jelly*2',
      'landmark:a deep wet shaft where the rain begins; water sheets down the walls and the sound of a far bell rises from below',
    ],
    notes: 'Entry shaft from the Guttered Ways (32x36). N1 (cols 12-15) is where the player drops in from the Descent Lip. The fall is long: floor top row 33 at the bottom (W1 and E1 rows 30-32, to the Flooded Aisle and the Gallery of Saints). The shaft walls are plain # (grippable) with NO ledges, platforms or pogo targets anywhere above the floor: climbing back to the Guttered Ways needs Wax Grip (wall-jump up the walls, rise out through N1 into the pit of gw_10). Water streams down the walls (decor only, no liquid tiles). lore_dn_1 (a pilgrim\'s scratched prayer) at the bottom, col 8. Two rain_jellies drift in the lower half (never placed where they block the wall climb).',
  });

  R('dn_02', {
    name: 'The Flooded Aisle', cell: [20, 14, 8, 2], kind: 'corridor',
    exits: [['W', 'dn_04', 12, 3], ['S', 'dn_03', 40, 4]],
    content: [
      ['npc:wren:2', 'main'],
      ['lore:lore_dn_2', 'main'],
      ['geode:dn_geo1', 'main'],
      'enemy:drowned_acolyte*3', 'enemy:rain_jelly*2',
      'landmark:a long side aisle of the cathedral under broken clerestory windows; rain falls in silver curtains',
    ],
    notes: 'Corridor (128x18). Floor top row 15 (E1 rows 12-14 from the Long Descent, W1 rows 12-14 into the Bell Tower). Puddles are decor only (no ~ tiles on the walkway). S1 (cols 40-43) is a broken floor opening down into the great nave; around it the floor dips to top row 16 for 3 cols each side (landing ledge for players climbing up from dn_03). Wren (stage 2) shelters under a dry arch at col 84 (her flame is lower now). lore_dn_2 (a list of the drowned) on a column at col 60. dn_geo1 in a collapsed pew alcove at col 104. Three drowned_acolytes along the aisle, two rain_jellies under the windows.',
  });

  R('dn_03', {
    name: 'The Drowned Nave', cell: [20, 16, 6, 4], kind: 'hub',
    exits: [['W', 'dn_10', 30, 3], ['E', 'dn_06', 21, 3], ['S', 'dn_08', 60, 4]],
    content: [
      ['sconce:dn_sconce_a', 'main'],
      ['lanternway:nave', 'main'],
      ['lore:lore_dn_3', 'main'],
      'enemy:drowned_knight*1', 'enemy:drowned_acolyte*2', 'enemy:bell_sentry*1',
      'landmark:THE DROWNED NAVE - a vast cathedral hall, its rose window of pale-gold glass still glowing; rain pours through the shattered vault onto rows of drowned pews',
    ],
    notes: 'REGION HUB and landmark (96x36). Main floor top row 33 (rows 33-35 solid) with drowned pews (decor; no ~ tiles on the floor). W1 (rows 30-32) at the floor to the Flooded Tunnel. A raised choir step at the east (cols 70-95, floor top row 24) reached by 3-tile steps; E1 (rows 21-23) there leads to the Choir Loft. N1 (cols 40-43) is the opening from the aisle above: a column of one-way platforms (=) with tops at rows 29, 25, 21, 17, 13, 9, 5 (alternating slightly left/right of cols 38-45) climbs to it. S1 (cols 60-63) is a hole in the floor down to the Sunken Crypt; around it the floor dips to top row 34 for 3 cols each side. dn_sconce_a at col 28 under the rose window; Lanternway post nave at col 52; lore_dn_3 on the lectern at col 46. The rose window (decor) dominates the back wall; light shafts and rain. One drowned_knight on the floor, two acolytes, a bell_sentry on the choir step.',
  });

  R('dn_04', {
    name: 'The Bell Tower', cell: [18, 12, 2, 6], kind: 'shaft',
    exits: [['W', 'dn_05', 12, 3], ['S', 'dn_10', 14, 4]],
    zones: { base: ['dn_02', 'dn_10'], top: ['dn_05'], belfry: [] },
    moves: { 'base>top': ['grip'], 'top>base': [], 'top<>belfry': [] },
    content: [
      ['geode:dn_geo3', 'belfry', { secret: 'breakable wall (B) behind the bell frame on the east ledge at the top of the climb' }],
      'enemy:bell_sentry*1', 'enemy:rain_jelly*2',
      'landmark:the hollow bell tower, its great bell long fallen; rain hisses down its throat',
    ],
    notes: 'WALL-CLIMBING CHALLENGE to the Oilcloak (32x54). E1 (rows 30-32) enters onto the base floor (floor top row 33). A hole in the base floor (cols 14-17) drops 20 tiles down the lower shaft to S1 (cols 14-17, bottom row) into the Flooded Tunnel; one-way platforms in the lower shaft (tops rows 50, 46, 42, 38) let the player climb back up to the base. THE CLIMB (grip only): the shaft interior (cols 6-25) rises 18 tiles from the base floor (33) to the top. Two ledges jut from the walls at top row 15: the west landing (cols 1-12) at W1 (rows 12-14) and the east ledge (cols 19-30), leaving a 6-wide throat (cols 13-18) through which the climber emerges. The climb is pure wall-jumping between the two # wall faces (cols 5 and 26) with short ^ spike strips on alternating wall sections and a few GLAZED (X) stretches that force wall switches with timing; no ledges, platforms or pogo targets anywhere between rows 16 and 32 (Smokewing alone must not suffice). SECRET: on the east ledge, behind the hanging bell frame (decor), a B wall (cols 24-25, rows 12-14) hides a niche (cols 26-30, rows 12-14) with dn_geo3. A bell_sentry on the west landing, rain_jellies in the shaft (placed so they can be pogo-ed but never required).',
  });

  R('dn_05', {
    name: 'Shrine of the Oilcloak', cell: [16, 12, 2, 2], kind: 'shrine',
    content: [
      ['shrine:oilcloak', 'main'],
      ['lore:lore_dn_4', 'main'],
      'landmark:a tiny chapel at the top of the tower; a basin of still meltwater reflects a floating blue ember',
    ],
    notes: 'Dead-end chapel (32x18) off the top of the Bell Tower (E1 rows 12-14). Floor top row 15. Oilcloak shrine pedestal at col 18. West of the shrine (cols 3-9) a small practice basin of meltwater (surface top row 15, liquid rows 15-16, 7 wide) to try floating right away - it must lie WEST of the shrine so it never blocks the way to it. lore_dn_4 (a vow of the bell-ringers) at col 26. No enemies.',
  });

  R('dn_06', {
    name: 'The Choir Loft', cell: [26, 16, 4, 3], kind: 'room',
    exits: [['E', 'dn_07', 21, 3], ['S', 'dn_11', 20, 4]],
    content: [
      ['sconce:dn_sconce_b', 'main'],
      ['lore:lore_dn_5', 'main'],
      'enemy:bell_sentry*1', 'enemy:drowned_acolyte*2',
      'landmark:tiers of drowned choir stalls beneath silent organ pipes; a great bronze door to the east hums with the tone of a bell',
    ],
    notes: 'Room (64x27) before the Abbot. Floor top row 24 (W1 and E1 rows 21-23); tiered stalls step up along the back (decor and 1-3 tile platforms). S1 (cols 20-23) is a hole down to the Baptistery; around it the floor dips to top row 25 for 3 cols each side. dn_sconce_b at col 42 next to the belfry door (E1 -> Tallowmere). lore_dn_5 (a hymn sheet) at col 30. A bell_sentry and two acolytes guard the stalls.',
  });

  R('dn_07', {
    name: 'The Great Belfry', cell: [30, 16, 4, 3], kind: 'arena',
    content: [
      ['arena:tallowmere', 'main'],
      'landmark:a flooded belfry under a broken roof; a colossal bronze bell hangs over a drowned floor',
    ],
    notes: 'BOSS ARENA - ABBOT TALLOWMERE, Warden of the Bell (64x27). Single entrance W1 (rows 21-23). Floor top row 24 (rows 24-26 solid) flat across cols 1-62 - keep it clean for the bell shockwave rings. Two one-way choir lofts (=, top row 20 - 4 tiles above the floor, reachable without Smokewing) at cols 12-19 and 44-51 to hop rings and dodge the belly slam. Ceiling solid rows 0-2; the giant bell (decor) hangs at cols 28-35, rows 6-11, on chains from the vault at row 3 (not solid; its lip shows at the top of the fight view). No tile hazards (molten drips are his attack). arena_gate (w1,h4) at col 2 rows 20-23 under a solid lintel at row 19. arena entity: boss tallowmere, bx=38, by=23, trigger cols 17-30 rows 14-23. Phase 2 acolytes enter from the east side (cols 55-60). Reward: Seal of the Bell (+300 cinders), then the gate reopens.',
  });

  R('dn_08', {
    name: 'The Sunken Crypt', cell: [20, 20, 6, 2], kind: 'room',
    exits: [['E', 'dn_11', 3, 3], ['S', 'ri_01', 12, 4]],
    zones: { main: ['dn_03', 'dn_11'], hole: ['ri_01'], niche: [] },
    moves: { 'main>hole': ['plunge'], 'main<>niche': [] },
    content: [
      ['pickup:sigil:bright_bolt#dn_sig_bright_bolt', 'niche', { secret: 'breakable wall (B) of a burial niche at the west end' }],
      'enemy:drowned_knight*1', 'enemy:drowned_acolyte*2',
      'landmark:a crypt beneath the nave; the floor is cracked and frost creeps up through the cracks from far below',
    ],
    notes: 'Crypt (96x18) under the great nave. Floor top row 15. N1 (cols 60-63): one-way platforms tops rows 12, 8, 4 under it (climb back into the nave). E1 (rows 3-5) is a high doorway on the east wall, floor top row 6 on a ledge (cols 84-95) reached by 3-tile steps (tops rows 12, 9, 6) from the crypt floor. PLUNGE GATE (one-way into the Rime): a frosted cracked floor - D tiles at cols 10-17, rows 15-16 - sits over the S1 opening (cols 12-15, row 17 open) so a Molten Plunge breaks through and the player falls into the Rime (no way back up through this hole; the return from the Rime is the Reliquary stair). Frost decor around the cracks so the promise is visible early. SECRET: a B wall (cols 6-7, rows 12-14) at the west end hides a burial niche (cols 1-5, rows 12-14) with the White-hot Core sigil. One drowned_knight, two acolytes.',
  });

  R('dn_09', {
    name: 'Gallery of Saints', cell: [30, 14, 6, 2], kind: 'gate',
    exits: [['E', 'ch_01', 12, 3]],
    zones: { west: ['dn_01'], east: ['ch_01'], statue: [] },
    moves: { 'west>east': [['grip', 'dash'], ['grip', 'wings']], 'east>west': [], 'west>statue': ['wings'], 'statue>west': [] },
    content: [
      ['pickup:heartwax#dn_hw1', 'statue'],
      'enemy:drowned_knight*1', 'enemy:rain_jelly*2',
      'landmark:a gallery of colossal saint statues with worn faces; at its end a sheer wall and a broken span toward a red forge-glow',
    ],
    notes: 'GRIP + DASH GATE toward the Chandlery (96x18). W1 (rows 12-14) from the Long Descent; floor top row 15 across cols 1-57 (the west floor). At cols 41-48 a sheer # pillar rises 8 tiles from the floor to a near ledge (top row 7, cols 41-48) - wall-jump up (grip). From its east lip a 9-tile gap at equal height (cols 49-57; critical-path dash gaps are 9 tiles, 10 only for optional rewards) to the far ledge (top row 7, cols 58-70). The far ledge is the top of a solid mass (cols 58-95) whose WEST FACE IS GLAZED (X) from row 7 down to the floor, so a player who falls into the gap lands on the west floor and cannot climb the far side. From the far ledge the path steps down east (tops 10, 13, 15) to E1 (rows 12-14). Going back west is free: drop off the far ledge\'s lip into the gap. WINGS REWARD: the tallest saint statue (cols 18-23) has a flat head at top row 8 (7 above the floor), GLAZED (X) faces, no wall within 6 tiles; Heartwax Shard dn_hw1 rests in its open hands. One drowned_knight on the west floor, rain_jellies under the vault.',
  });

  R('dn_10', {
    name: 'The Flooded Tunnel', cell: [14, 18, 6, 2], kind: 'gate',
    exits: [['W', 'mw_01', 12, 3]],
    zones: { east: ['dn_03', 'dn_04'], west: ['mw_01'] },
    moves: { 'east<>west': ['oilcloak'] },
    content: [
      ['geode:dn_geo2', 'east'],
      'enemy:rain_jelly*2',
      'landmark:the drain of the Nave - a long tunnel where the floodwater runs west into darkness under a low vault',
    ],
    notes: 'OILCLOAK GATE to the Mothwood (96x18). East part (cols 60-95) dry, floor top row 15 (E1 rows 12-14 from the great nave). N1 (cols 78-81) is the bottom of the Bell Tower shaft: one-way platforms tops rows 12, 8, 4 under it. dn_geo2 at col 66. From col 59 westward the tunnel floods: meltwater from col 8 to col 58 (51 wide; surface top row 15, liquid rows 15-16, basin floor row 17) under a low vault whose ceiling is at row 11 (solid rows 0-11; 3 tiles of air above the water) all the way to the west bank (cols 1-7, floor top row 15) and W1 (rows 12-14). Without Oilcloak the water is a hazard; with it the player swims through. Rain_jellies hover in the dry part.',
  });

  R('dn_11', {
    name: 'The Baptistery', cell: [26, 19, 4, 2], kind: 'room',
    exits: [['E', 'dn_12', 12, 3]],
    content: [
      ['lore:lore_dn_6', 'main'],
      'enemy:drowned_acolyte*2', 'enemy:rain_jelly*1',
      'landmark:a round baptistery; the font is frozen over and a cold draught rises from the east',
    ],
    notes: 'Room (64x18) below the Choir Loft. Floor top row 15. N1 (cols 20-23): one-way platforms tops rows 12, 8, 4 under it (climb back to the loft). W1 (rows 12-14) to the high east doorway of the Sunken Crypt; E1 (rows 12-14) to the Reliquary. The round font (decor) at col 34, rimmed with frost. lore_dn_6 (the Abbot\'s sermon on mercy) at col 44. Two acolytes, one rain_jelly.',
  });

  R('dn_12', {
    name: 'The Reliquary', cell: [30, 19, 4, 3], kind: 'room',
    exits: [['S', 'ri_05', 52, 4]],
    zones: { main: ['dn_11'], stair: ['ri_05'], vault: [] },
    moves: { 'stair>main': ['grip'], 'main>vault': ['plunge'], 'vault>main': [] },
    content: [
      ['pickup:spark#spark_dn', 'vault'],
      'enemy:drowned_knight*1',
      'landmark:shelves of reliquaries in a cold vault; an ice-choked stairwell descends into blue light',
    ],
    notes: 'Room (64x27) at the edge of the Rime. Hall floor top row 15 across cols 1-49 (W1 rows 12-14); tall reliquary shelves along the back (decor, a few one-way platforms for fun, none higher than row 9 and none east of col 36). THE ICE STAIR (up-only shortcut from the Rime): S1 (cols 52-55) is the bottom of a shaft enclosed inside a solid ice pillar (cols 50-57, rows 6-26; inner shaft walls plain # so grip can climb them, no ledges). The shaft emerges at the top onto a high ledge (top row 5, rows 5-6 thick) that spans cols 40-57 and overhangs the hall; from its west lip (col 40) the player simply drops 10 tiles to the hall floor. From the hall the ledge can never be reached: it is 10 tiles up (beyond Smokewing), the pillar faces, the ledge\'s lip and underside are GLAZED (X), and nothing climbable stands within 6 tiles - so the Nave cannot be used to enter the Rime without plunging, while a player coming up from the Rime always gets home. PLUNGE REWARD: in the west half a cracked reliquary floor - D at cols 8-13, rows 15-16 - covers a sealed vault (cols 4-24, air rows 17-21, floor top row 22) where Chandler\'s Spark spark_dn lies in an open reliquary; climb out by a one-way platform (top row 19, cols 14-16) beside the broken hole (22 -> 19 -> 15). One drowned_knight guards the shelves.',
  });
};
