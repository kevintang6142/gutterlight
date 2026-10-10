// src/audio/tracks/flue.js — "Soot and Brass" (The Sootflue, exploration). Owner: music-mid.
//
// Oppressive, smoky, mechanical. A C drone never leaves the floor; the chimney's harmony leans on the
// Phrygian half-step (Db against C = a minor ninth of grinding weight, resolved only by the Db -> Cm sigh).
// A frame drum is the furnace's pulse, tiny wooden ticks are the clockwork of the vents, a struck anvil
// answers like a hammer far down the shaft, and low brass swells breathe through the soot. A solo cello is
// the only voice that sings: it coughs a Db-C figure, then climbs through the furnace and falls back.
//
// Form (90 bpm, 4/4, 8th grid, 16th grid for the ticks; intro once, then 6 x 8 bars = 48 bars = 2:08, loops):
//   intro   2 bars   the drone wakes, one tick, one anvil
//   A  "Soot"     drone + heartbeat; the cello's cough (bars 5-8); a steam hiss into B
//   B  "Piston"   the machine starts: a 3+3+2 frame drum, brass stabs, clock ticks, the cello's tune
//   C  "Furnace"  full: driving drum, anvil backbeat, cello climbs an octave, brass swells, strings
//   D  "Vent"     the machine stops; drone, a far anvil, the cello alone, steam, and a slow fall
//   B2 "Piston II" the groove returns with a high descant (the cello an octave up) and new brass colour
//   A2 "Soot II"  thinning back: heartbeat, a last tick, the Db that leads to the C of A
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const rep = (b, n) => new Array(n).fill(b).join(' | ');
  const E8 = '. . . . . . . .';
  const E16 = '. . . . . . . . . . . . . . . .';
  const hold = (note, n) => bars(note + ' - - - - - - -', ...new Array(n - 1).fill('- - - - - - - -'));
  // A pattern per bar with the token R replaced by that bar's root (brass stabs follow the chords).
  const riff = (roots, pat) => roots.map((r) => pat.replace(/R/g, r)).join(' | ');
  // New bow on the first note of every `every`-th bar of a legato line.
  const bow = (s, every = 2) => s.split('|').map((b, i) => (i % every === 0 ? b.replace(/([A-G][#b]?\d)/, '$1^') : b)).join('|');

  // Bar roots (octave 2) of the sections' chords, for the stabs.
  const R_A  = ['C2', 'C2', 'Db2', 'C2', 'C2', 'Bb1', 'Ab1', 'Db2'];
  const R_B  = ['C2', 'Db2', 'C2', 'Db2', 'C2', 'Bb1', 'Ab1', 'G1'];
  const R_C  = ['C2', 'Db2', 'Eb2', 'Bb1', 'F2', 'Ab1', 'Db2', 'G1'];
  const R_B2 = ['C2', 'Db2', 'C2', 'Db2', 'F2', 'Db2', 'G1', 'C2'];

  // The cello's tune over the machine (B): question, answer.
  const TUNE_B =
    'G3@62 - - Ab3 - - G3 - | Ab3 - - - - Bb3 C4 - | Eb4 - - Db4 - - C4 - | Db4 - - - - - - - |' +
    'G3@62 - - Ab3 - - Bb3 - | C4 - - - Db4 - - - | Eb4 - - - C4 - Ab3 - | Bb3 - - - Db4@58 - - -';
  // Furnace (C): the same shape an octave wider and louder.
  const TUNE_C =
    'G3@68 - C4 - Db4 - C4 - | Ab3 - Db4 - Eb4 - Db4 - | Eb4 - G4 - Bb4 - G4 - | F4 - - - Db4 - Bb3 - |' +
    'C4@70 - F4 - Ab4 - G4 - | Eb4 - Ab4 - C5! - Bb4 - | Ab4 - F4 - Db4 - - - | Bb3 - Db4 - G4@74 - - -';
  // Vent (D): the tune stripped to long notes, falling.
  const TUNE_D =
    'C5@54 - - - - - - - | Bb4 - - - Ab4 - - - | G4 - - - - - Ab4 - | G4 - - - - - - - |' +
    'F4@52 - - - - - Eb4 - | Db4 - - - - - - - | C4 - - - - - - - | Bb3 - - - - - - -';

  G.Audio.defineTrack('flue', {
    title: 'Soot and Brass', key: 'C phrygian',
    bpm: 90, meter: '4/4', grid: '8n',
    reverb: 0.3, volume: 1.4,
    humanize: { time: 0.008, vel: 0.06 },
    delay: { beats: 0.75, feedback: 0.3, tone: 2200, level: 0.7 },
    parts: {
      drone:  { inst: 'drone', vol: 0.5, reverb: 0.25, vel: 0.6, params: { attack: 2.5, release: 3 } },
      frame:  { inst: 'frame_drum', vol: 0.62, pan: -0.1, reverb: 0.2, vel: 0.68, humanize: { time: 0.005, vel: 0.05 } },
      tick:   { inst: 'tick', vol: 0.55, pan: 0.35, reverb: 0.12, vel: 0.5, grid: '16n', humanize: { time: 0.003, vel: 0.08 } },
      anvil:  { inst: 'anvil', vol: 0.55, pan: 0.2, reverb: 0.4, vel: 0.62, delay: 0.25 },
      swell:  { inst: 'brass', vol: 0.5, pan: -0.05, reverb: 0.4, vel: 0.62, params: { attack: 1.5, release: 2.4, bright: 0.8 } },
      stab:   { inst: 'brass', vol: 0.5, pan: 0.0, reverb: 0.22, vel: 0.7, gate: 0.45, params: { attack: 0.05, release: 0.35, bright: 0.9 } },
      cello:  { inst: 'cello', vol: 0.8, pan: -0.2, reverb: 0.4, vel: 0.6, legato: true },
      cello2: { inst: 'cello', vol: 0.5, pan: 0.2, reverb: 0.5, vel: 0.5, legato: true },
      pad:    { inst: 'strings', vol: 0.34, reverb: 0.5, chord: { style: 'pad', octave: 3, vel: 0.3 }, params: { attack: 1.2, release: 2, bright: 0.6 } },
      steam:  { inst: 'noise_riser', vol: 0.3, pan: 0.1, reverb: 0.5, vel: 0.5, humanize: false },
    },
    sections: {
      // ------------------------------------------------------------------------ intro
      intro: {
        chords: 'Cm | Cm',
        drone: hold('C1', 2),
        tick: bars(E16, 'x@40 . . . . . . . . . . . . . . .'),
        anvil: bars(E8, '. . . . . . . C5@44'),
        pad: { style: 'pad', octave: 3, vel: 0.26, ramp: [0.6, 1] },
      },
      // ------------------------------------------------------------------------ A  Soot
      A: {
        chords: 'Cm | Cm | Db | Cm | Cm | Bbm | Ab | Db',
        drone: hold('C1', 8),
        frame: bars(E8, E8, 'X . . . . . x? .', '%', '%', '%', '%', 'X . . . . . x? x?'),
        tick: bars(E16, E16, E16, E16, rep('x? . . . x? . . . x? . . . x? . . .', 1), '%', '%', 'x? . . . x? . . . x? . . . x? . x? x?'),
        anvil: bars(E8, E8, E8, '. . . . . . . Db5@50', E8, E8, '. . . . G5@52 . . .', E8),
        swell: bars(E8, E8, 'Db2+Ab2+F3', E8, E8, 'Bb1+F2+Db3', 'Ab1+Eb2+C3', 'Db2+Ab2+F3@72'),
        cello: bars(E8, E8, E8, E8,
          'G3@50 - - - Ab3 - G3 -', 'F3 - Eb3 - C3 - - -', 'Db3@52 - - Eb3 - F3 - -', 'Db3 - - - - - - -'),
        pad: { style: 'pad', octave: 3, vel: 0.26, chords: '. | . | Db | Cm | Cm | Bbm | Ab | Db', ramp: [0.9, 1.1] },
        steam: bars(E8, E8, E8, E8, E8, E8, E8, 'C6 - - - - - - -'),
      },
      // ------------------------------------------------------------------------ B  Piston
      B: {
        chords: 'Cm | Db | Cm | Db | Cm | Bbm | Ab | Gdim',
        drone: hold('C1', 8),
        frame: bars(rep('X . . x . . x? .', 7), 'X . . x . x x? x'),
        tick: bars(rep('x@58 . x? . x . x? . x . x? . x . x? x?', 7), 'x@58 . x? . x . x? . x x x? x x x x x'),
        anvil: bars(E8, '. . . . C5 . . .', E8, '. . . . Db5 . . .', E8, '. . . . C5 . . .', E8, '. . . . G5 . . G5@50'),
        stab: riff(R_B, 'R . . . . . R .'),
        swell: bars('C2+G2+Eb3', '-', 'C2+G2+Eb3', '-', E8, 'Bb1+F2+Db3', 'Ab1+Eb2+C3', 'G1+Db2+Bb2@72'),
        cello: TUNE_B,
        pad: { style: 'pad', octave: 3, vel: 0.28 },
      },
      // ------------------------------------------------------------------------ C  Furnace
      C: {
        chords: 'Cm | Db | Eb | Bbm | Fm | Ab | Db | Gdim',
        drone: hold('C1', 8),
        frame: bars(rep('X . x? x X . x x?', 7), 'X x? x x? X x x X'),
        tick: bars(rep('x@64 x? x? x? x@60 x? x? x? x@64 x? x? x? x@60 x? x? x?', 7), 'x@64 x? x? x? x x x x x x x x x x x x'),
        anvil: bars(rep('. . C5@70 . . . Db5@64 .', 1), '. . Db5@70 . . . Ab5@62 .', '. . Eb5@70 . . . G5@62 .', '. . Db5@70 . . . F5@62 .',
          '. . C5@70 . . . F5@62 .', '. . Eb5@70 . . . C6@62 .', '. . Db5@70 . . . Ab5@62 .', 'C5 . G5 . Db5 . G5! .'),
        stab: riff(R_C, 'R . R . . R R .'),
        swell: bars('C2+G2+Eb3', 'Db2+Ab2+F3', 'Eb2+Bb2+G3', 'Bb1+F2+Db3', 'F2+C3+Ab3', 'Ab1+Eb2+C3', 'Db2+Ab2+F3', 'G1+Db2+Bb2!'),
        cello: TUNE_C,
        cello2: { notes: TUNE_C, vel: 0.46, octave: -1 },
        pad: { style: 'pad', octave: 3, vel: 0.34, ramp: [0.9, 1.3] },
        steam: bars(E8, E8, E8, E8, E8, E8, E8, 'C6 - - - - - - -'),
      },
      // ------------------------------------------------------------------------ D  Vent
      D: {
        chords: 'Ab | Eb | Db | Cm | Ab | Bbm | Db | Gdim',
        drone: bars(hold('C1', 7), 'G1 - - - - - - -'),
        frame: bars(E8, E8, E8, E8, E8, E8, 'X@50 . . . . . . .', 'X@54 . . . . . x?@40 .'),
        tick: bars(E16, E16, 'x?@40 . . . . . . . . . . . . . . .', E16, E16, E16, 'x?@40 . . . . . . . x?@40 . . . . . . .', E16),
        anvil: bars('. . . . . . . .', '. . . . . . . .', 'Db5@46 . . . . . . .', E8, 'C5@46 . . . . . . .', E8, 'Ab5@44 . . . . . . .', E8),
        swell: bars('Ab1+Eb2+C3', '-', 'Db2+Ab2+F3', 'C2+G2+Eb3', E8, 'Bb1+F2+Db3', E8, 'G1+Db2+Bb2@70'),
        cello: bow(TUNE_D),
        pad: { style: 'pad', octave: 3, vel: 0.28, ramp: [1, 0.85] },
        steam: bars(E8, E8, E8, E8, E8, E8, E8, 'C6 - - - - - - -'),
      },
      // ------------------------------------------------------------------------ B2  Piston II
      B2: {
        chords: 'Cm | Db | Cm | Db | Fm | Db | Gdim | Cm',
        drone: hold('C1', 8),
        frame: bars(rep('X . . x . . x? .', 3), 'X . . x . x x? x', rep('X . . x . . x? .', 3), 'X . x? x X . x x'),
        tick: bars(rep('x@58 . x? . x . x? . x . x? . x . x? x?', 7), 'x@58 x? x? x? x x x x x x x x x x x x'),
        anvil: bars(E8, '. . . . C5 . . .', '. . G5@56 . . . . .', '. . . . Db5 . . .', E8, '. . . . C5 . Eb5@56 .', '. . G5@56 . Bb5@56 . . .', 'C5! . . . . . . .'),
        stab: riff(R_B2, 'R . . R . . R? .'),
        swell: bars('C2+G2+Eb3', '-', 'C2+G2+Eb3', '-', 'F2+C3+Ab3', 'Db2+Ab2+F3', 'G1+Db2+Bb2', 'C2+G2+Eb3!'),
        cello: bow(TUNE_B),
        cello2: { notes: bars(E8, E8, E8, E8, 'C5@50 - - - Db5 - - -', 'Ab4 - - - F4 - - -', 'G4 - - - Bb4 - - -', 'G4 - - - - - - -') },
        pad: { style: 'pad', octave: 3, vel: 0.3, ramp: [0.95, 1.2] },
      },
      // ------------------------------------------------------------------------ A2  Soot II
      A2: {
        chords: 'Cm | Cm | Db | Cm | Cm | Bbm | Db | Db',
        drone: hold('C1', 8),
        frame: bars('X . . . . . x? .', '%', '%', '%', 'X@60 . . . . . . .', E8, 'X@54 . . . . . . .', E8),
        tick: bars('x? . . . x? . . . x? . . . x? . . .', '%', '%', '%', 'x?@40 . . . . . . . x?@40 . . . . . . .', E16, 'x?@36 . . . . . . . . . . . . . . .', E16),
        anvil: bars(E8, E8, E8, '. . . . G5@44 . . .', E8, E8, E8, '. . . . . . . Db5@42'),
        swell: bars('C2+G2+Eb3@56', '-', 'Db2+Ab2+F3@56', E8, E8, 'Bb1+F2+Db3@52', 'Db2+Ab2+F3@56', '-'),
        cello: bars('G3@46 - - - Ab3 - G3 -', 'F3 - Eb3 - C3 - - -', 'Db3@48 - - - - - - -', E8, E8, E8, 'Db3@44 - - - - - - -', '-'),
        pad: { style: 'pad', octave: 3, vel: 0.24, ramp: [1, 0.8] },
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'C', 'D', 'B2', 'A2'],
  });
})();
