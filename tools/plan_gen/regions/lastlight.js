module.exports = (R) => {
  R('ll_01', {
    name: 'Lastlight Gate', cell: [18, 1, 4, 2], kind: 'village',
    exits: [['E', 'll_02', 11, 3]],
    zones: { main: ['sh_04', 'll_02'], cellar: [] },
    moves: { 'main<>cellar': [] },
    content: [
      ['npc:quill', 'main'],
      ['lore:lore_ll_1', 'main'],
      ['geode:ll_geo1', 'cellar', { secret: 'breakable wall (B) under the gatehouse stair, east side' }],
      'landmark:two leaning candle-stub towers flank the village gate, their windows glowing amber',
    ],
    notes: 'Village edge, safe room (no enemies). Ground top row 14. Two candle-stub tower silhouettes frame a wooden gate arch at cols 8-12 (decor, walk-through). Quill sits at a map table under a lamppost at col 22 with ink pots (her stall). lore_ll_1 = the founding stone of Lastlight at col 34. SECRET: the gatehouse stair (solid block cols 44-50, rows 11-13 with steps) has a B face at col 50 rows 12-13 opening into a 2-tall crawlspace cellar (cols 51-58) with ll_geo1. Warm window lights.',
  });

  R('ll_02', {
    name: 'The Last Brazier', cell: [22, 0, 6, 3], kind: 'hub',
    exits: [['E', 'll_03', 20, 3], ['S', 'gw_01', 14, 4]],
    zones: { main: ['ll_01', 'll_03', 'gw_01'] },
    content: [
      ['sconce:ll_sconce_a', 'main'],
      ['lanternway:lastlight', 'main'],
      ['npc:thrum', 'main'],
      ['npc:pell', 'main'],
      'landmark:the Last Brazier - a great iron brazier in the village square holding the last weak orange fire of Tallowdeep',
      'landmark:the Well - a round stone well-mouth with a broken winch, the way down into the dark',
    ],
    notes: 'EMOTIONAL HUB, safe, music lastlight. 96x27, dusk sky above rows 0-12, village floor top row 23 (W1/E1 rows 20-22). Huddled candle-stub houses with warm windows in the background, a few on platforms (=) as rooftops reachable for fun. THE WELL (S1, cols 14-17): stone rim; the square floor dips into a 2-deep ring around the hole (ring floor top at row 25 for cols 10-13 and 18-21; the hole cols 14-17 open through rows 23-26) so a player rising out of the Well (exit boost ~3 tiles) lands on the ring, then hops 2 tiles up to the square. The Last Brazier stands at the centre (cols 44-51, big warm light r~8). Old Thrum beside it (col 41); ll_sconce_a right of it (col 55) - this is the Lastlight sconce (home respawn). Pell with his huge pack at col 64 under an awning. Lanternway post lastlight at col 78 near the east road. No enemies, no hazards.',
  });

  R('ll_03', {
    name: "Wickwright's Row", cell: [28, 1, 4, 2], kind: 'village',
    exits: [['E', 'sf_01', 11, 3]],
    zones: { main: ['ll_02', 'sf_01'], chimney: [] },
    moves: { 'main>chimney': ['grip'], 'chimney>main': [] },
    content: [
      ['npc:bramm', 'main'],
      ['lore:lore_ll_2', 'main'],
      ['geode:ll_geo2', 'chimney'],
      "landmark:Bramm's open forge - an anvil under a lean-to, red forge glow and hanging tools",
    ],
    notes: 'East end of the village, safe. Ground top row 14. Bramm at his anvil (col 20), forge glow light. lore_ll_2 on a smith-guild plaque (col 30). GRIP REWARD: the forge chimney, a sheer brick column at cols 36-38 rising from the floor to row 4 (10 tiles, no ledges), ll_geo2 sits on its cap. East end (cols 56-63): the road continues toward the chimney-tops; the Flue shortcut gate stands just inside sf_01 (players see bars and a lever beyond). E1 is the opening at rows 11-13 (floor top row 14); keep the road\'s interior 4 tiles tall (air rows 10-13) toward the east edge so it matches the gate passage just inside sf_01.',
  });
};
