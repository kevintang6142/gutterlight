// The Heartwick Sanctum (hs_*): below the Seal Door. A falling shaft of light, a glass vestibule with the last sconce,
// and the Heartwick, where Queen Lucerne guards the Everlantern.
module.exports = (R) => {
  R('hs_01', {
    name: 'The Descent of Light', cell: [22, 30, 2, 4], kind: 'shaft',
    exits: [['E', 'hs_02', 30, 3]],
    zones: { top: ['ri_08'], bottom: ['hs_02'] },
    moves: { 'top>bottom': [], 'bottom>top': ['grip'] },
    content: [
      ['lore:lore_hs_1', 'bottom'],
      ['geode:hs_geo1', 'bottom'],
      'landmark:a shaft of crystal through which golden light falls like slow rain',
    ],
    notes: 'Shaft (32x36) below the Seal Door. N1 (cols 2-5) at the top; the player falls through golden light shafts to the floor (top row 33). Walls are crystal-faced but plain # (grippable): the climb back to the Rime is a wall-jump climb (grip); no ledges. E1 (rows 30-32) to the Vestibule. lore_hs_1 (the Queen\'s decree, in gold) at col 8. hs_geo1 is a crystal cluster at col 22 on the floor. No enemies (the Sanctum has none).',
  });

  R('hs_02', {
    name: 'The Vestibule of Glass', cell: [24, 32, 4, 2], kind: 'room',
    exits: [['E', 'hs_03', 12, 3]],
    zones: { main: ['hs_01', 'hs_03'], alcove: [] },
    moves: { 'main<>alcove': [] },
    content: [
      ['sconce:hs_sconce_a', 'main'],
      ['lore:lore_hs_2', 'main'],
      ['geode:hs_geo2', 'alcove', { secret: 'breakable crystal wall (B) on the north side' }],
      'landmark:a vestibule of golden glass; through the far wall, the white heart-light of the Everlantern pulses',
    ],
    notes: 'Room (64x18) before the final arena. Floor top row 15 (W1 and E1 rows 12-14). hs_sconce_a at col 20 (the last rest; strong warm light). lore_hs_2 (Lucerne\'s own words to her daughter) at col 36. SECRET: a raised crystal ledge (cols 40-48, top row 12, a 3-tile step from the floor) ends at a B crystal wall (cols 49-50, rows 9-11) hiding an alcove (cols 51-58, rows 9-11, floor top 12) with hs_geo2. E1 is the arch into the Heartwick; east of the ledge the way dips under a crystal pier (sunken walk, floor top row 17, cols 40-60, backed by a recessed : wall) so the alcove floor does not block the corridor. No enemies.',
  });

  R('hs_03', {
    name: 'The Heartwick', cell: [28, 30, 4, 4], kind: 'arena',
    content: [
      ['arena:lucerne', 'main'],
      'landmark:THE EVERLANTERN - a cage of gold and glass the size of a cathedral around the white First Flame; the Lamplight Queen waits before it',
    ],
    notes: 'FINAL BOSS ARENA - LUCERNE, the Everlantern (64x36). Single entrance W1 (rows 30-32). Floor top row 33 (rows 33-35 solid) flat across cols 1-62 (crystal spikes from the floor are her attack, not tiles). Phase 2 platforms (static one-way crystal platforms, =): tops at row 27 (cols 8-15, 48-55), row 21 (cols 20-27, 36-43) and row 15 (cols 28-35) - used to dodge sweeping lasers. The Everlantern cage (decor) fills the upper center (rows 2-12, cols 20-43); ceiling solid rows 0-1. arena_gate (w1,h4) at col 2 rows 29-32 under a solid lintel at row 28. arena entity: boss lucerne, bx=44, by=32, trigger cols 12-36 rows 22-32. After victory the ending plays (depends on sparks); no exit needed beyond W1.',
  });
};
