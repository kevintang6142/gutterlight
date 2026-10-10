module.exports = (R) => {
  R('sh_01', {
    name: 'Ashfall Strand', cell: [2, 1, 4, 2], kind: 'surface',
    exits: [['E', 'sh_02', 11, 3]],
    zones: { main: ['sh_02'], cave: [] },
    moves: { 'main<>cave': [] },
    content: [
      ['start', 'main'],
      ['lore:lore_sh_1', 'main'],
      ['geode:sh_geo1', 'cave', { secret: 'breakable wall (B, 3 tall) in the west cliff face at floor level' }],
      'enemy:ash_crawler*1',
      'landmark:the Wickling wakes on an ash mound at the edge of a dead grey ash sea; a broken pier juts west',
    ],
    notes: 'Surface beach, open slate sky (rows 0-8 air). Ground top at row 14 (rows 14-17 solid), gentle 1-tile dunes. West: sheer ash cliff filling cols 0-5 full height; at cols 4-5 rows 11-13 a B section hides a 3x3 pocket (cols 1-3) holding sh_geo1 - the first secret, teaches that walls can break. start marker at col 10 (feet on row 14 mound). lore_sh_1 carving at col 18: teaches {left}/{right} and {jump}; right after it a 2-tile step and a 4-tile ledge to practise a full jump. One ash_crawler near col 50. Calm, no hazards. Exit E1 at rows 11-13.',
  });

  R('sh_02', {
    name: 'Cinder Dunes', cell: [6, 1, 4, 2], kind: 'surface',
    exits: [['E', 'sh_03', 11, 3]],
    zones: { main: ['sh_01', 'sh_03'], cliff: [] },
    moves: { 'main>cliff': ['grip'], 'cliff>main': [] },
    content: [
      ['sconce:sh_sconce_a', 'main'],
      ['lore:lore_sh_2', 'main'],
      ['pickup:heartwax#sh_hw1', 'cliff'],
      'enemy:ash_crawler*2', 'enemy:ash_fly*1',
      'landmark:a half-buried stone sconce glowing faintly on a dune crest - the first rest',
    ],
    notes: 'Rolling ash dunes, ground top row 14. sh_sconce_a on a flat crest around col 20 (first save; place a light). lore_sh_2 at col 28 teaches {attack} (and that strikes fill the Ember well); two ash_crawlers after it, one ash_fly hovering near the east. GRIP GATE: at the east end (cols 52-60) a sheer petrified-ash pillar rises from the floor to row 4 (10 tiles, no footholds; its west face is plain # so grip works, no platforms). sh_hw1 sits on its flat top (row 3) - visible from the sconce. Drop back down freely. Ensure the pillar does not block the walkway to E1 (leave a 4-tall tunnel through its base or put it in the background half of the room: e.g. the walkway runs under an overhang).',
  });

  R('sh_03', {
    name: 'The Fallen Wick', cell: [10, 0, 4, 3], kind: 'landmark',
    exits: [['E', 'sh_04', 20, 3]],
    zones: { main: ['sh_02', 'sh_04'], crown: [] },
    moves: { 'main>crown': ['wings'], 'crown>main': [] },
    content: [
      ['lore:lore_sh_3', 'main'],
      ['pickup:sigil:heartwax#sh_sig_heartwax', 'crown'],
      'enemy:ash_fly*2', 'enemy:ash_crawler*1',
      'landmark:a colossal toppled candle as big as a tower lies across the dunes; its dead wick is buried in the ash',
    ],
    notes: 'Tall surface room (27 rows), ground top row 23 at both exits (rows 20-22 open). The colossal candle lies diagonally from upper-left (its flat base end, rows 8-12, cols 4-20) down to its wick buried at the lower right (col 44). Walkway: the player walks over/through the candle body (rounded wax slope of 1-tile steps). Pogo lesson: lore_sh_3 (teaches {down}+{attack} in the air to bounce) right before a 5-wide thorn pit (^) in the floor around cols 34-38 - crossable by plain jump, but the carving invites pogo practice; a second short thorn strip on the candle top. WINGS GATE: the candle base end forms a raised "crown" ledge whose top (row 8) is 7 tiles above the highest reachable candle surface (row 15) with GLAZED (X) smooth wax sides - only Smokewing reaches it. sh_sig_heartwax (Stubborn Heartwax sigil) rests in the dead wick-cup on the crown. Ash flies hover over the pit.',
  });

  R('sh_04', {
    name: 'Lastlight Road', cell: [14, 1, 4, 2], kind: 'surface',
    exits: [['E', 'll_01', 11, 3]],
    zones: { main: ['sh_03', 'll_01'], ledge: [] },
    moves: { 'main<>ledge': [['dash'], ['wings']] },
    content: [
      ['geode:sh_geo2', 'ledge'],
      'enemy:ash_crawler*2', 'enemy:ash_fly*1',
      'landmark:a road of ash-buried lamp posts leading east to the warm windows of Lastlight',
    ],
    notes: 'Road toward the village, ground top row 14, lamp posts (decor) every ~8 cols, faint warm light from the east. DASH GATE (optional): a rocky outcrop at cols 16-21 climbs from the road in two 3-tile steps to a flat top at row 8; from its east lip a 10-tile gap (cols 22-31, no footholds, road far below) separates it from a detached ash ledge at cols 32-36, also top row 8, holding sh_geo2. The ledge is 6 tiles above the road with no walls nearby and GLAZED (X) faces, so it cannot be jumped or gripped to from below (Smokewing can, which is fine); a failed dash simply drops you onto the road. Two ash_crawlers on the road, one ash_fly. E1 rows 11-13 into the village gate.',
  });
};
