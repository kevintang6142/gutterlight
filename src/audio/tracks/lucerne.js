// src/audio/tracks/lucerne.js — "The Unlit Throne" (final battle: Lucerne, the sovereign lamp). Owner: music-battle.
//
// D minor, 120 bpm, 4/4, 8th-note grid (percussion and the string ostinato run on a 16th grid per part).
// The Gutterlight leitmotif (DESIGN 8) is the whole piece in two faces:
//   ORIG: the hero's theme exactly as in `title`, now charging at twice the tempo;
//   INV : the same theme mirrored diatonically around A4 (every rise becomes a fall: A phrygian-flavoured,
//         "darkened"), harmonised Dm Gm C F/Dm Am F Bb A: the tyrant's version of the same song.
// Form (48 bars, ~1:36 body + 4 bar intro):
//   intro (hush, tolling, timpani crescendo) -> A (INV in the choir over a driving ostinato)
//   -> B (ORIG in strings against INV in the choir/horns: the two faces in counterpoint)
//   -> C (hush: choir "oo", organ and cello; the grief behind the crown, ORIG as a lament)
//   -> A2 (INV returns bigger, ORIG in horns) -> D (climax: ORIG in violins and choir, INV in horns)
//   -> F (the sequence climbs on the head of INV over Dm-Bb-Gm-A) -> loops.
// Phase 2 (G.Audio.musicLayer(1)): octave violins/choir, horn stabs, cymbals, extra timpani, high ostinato.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const R8 = '. . . . . . . .';
  const R16 = '. . . . . . . . . . . . . . . .';

  // ---- the leitmotif and its inversion (8 steps/bar) ----------------------------------------------------
  const ORIG = bars(
    'A4 - D5 - C5 A4 F4 -', 'G4 - - A4 Bb4 - A4 -', 'F4 - E4 F4 D4 - - -', 'C4 - D4 E4 A3 - - -',
    'A4 - D5 - E5 F5 E5 -', 'D5 - - C5 Bb4 - A4 -', 'G4 - Bb4 A4 F4 - E4 -', 'D4 - - - - - - -');
  const ORIG_SHAPED = bars(
    'A4@70 - D5@78 - C5 A4 F4 -', 'G4@70 - - A4 Bb4@80 - A4 -', 'F4 - E4 F4 D4@66 - - -', 'C4@62 - D4 E4 A3@60 - - -',
    'A4@76 - D5@82 - E5 F5! E5 -', 'D5@84 - - C5 Bb4 - A4 -', 'G4@76 - Bb4 A4 F4 - E4 -', 'D4@70 - - - - - - -');
  const INV = bars(                                                    // diatonic mirror of ORIG about A4
    'A4@76! - E4 - F4 A4 C5 -', 'Bb4 - - A4 G4 - A4 -', 'C5 - D5 C5 E5 - - -', 'F5 - E5 D5 A5! - - -',
    'A4@80 - E4 - D4 C4 D4 -', 'E4 - - F4 G4 - A4 -', 'Bb4 - G4 A4 C5 - D5 -', 'E5! - - - - - - -');
  const CALM = bars(                                                   // C: the lament (new line in the theme's contour)
    'D5@46 - - - F5 - - -', 'C5 - - - A4 - C5 -', 'Bb4 - - - D5 - G5 -', 'F5 - - E5 D5 - - -',
    'D5@54 - F5 - Bb5 - - -', 'A5 - - G5 F5 - C5 -', 'D5 - G5 - Bb5 - - A5', 'A5@66 - - - - - - -');
  const CLIMB = bars(                                                  // F: head of INV, sequenced upward
    'A4@62 - E4 - F4 A4 C5 -', 'Bb4 - F4 - G4 Bb4 D5 -', 'D5 - A4 - Bb4 D5 F5 -', 'G5 - D5 - Bb4 D5 G5 -',
    'D5@80 - - - F5 - - -', 'Bb5 - - - A5 - G5 -', 'A5@86 - - - E5 - A5 -', 'A5! - - - - - . .');
  const CELLO_C = bars(
    'Bb2@50 - - - - - D3 -', 'A2 - - - C3 - - -', 'G2 - - - Bb2 - - -', 'D3 - - - F3 - - -',
    'Bb2 - - - D3 - F3 -', 'A2 - C3 - F3 - - -', 'G2 - Bb2 - D3 - - -', 'E3 - A3 - - - - -');

  // ---- percussion & rhythm (16 steps/bar on the 16n part grid) -------------------------------------------
  const TM = 'D2 . . D2 . . D2 . D2 . . . A2 . . .';
  const TM_SOFT = 'D2 . . . . . . . A2 . . . . . . .';
  const ROLL = (n) => Array(16).fill(n).join(' ');
  const BOOM = 'X . . . . . x . X . . . . . x .';
  const BOOM_FILL = 'X . . . x . x . X . x . X x X X';
  const OST = 'b! 0 1 0 b 0 1 0 b! 0 1 0 b 1 2 1';

  G.Audio.defineTrack('lucerne', {
    title: 'The Unlit Throne', key: 'D minor',
    bpm: 120, meter: '4/4', grid: '8n',
    reverb: 0.4, volume: 1.0,
    humanize: { time: 0.005, vel: 0.05 },
    delay: { beats: 0.75, feedback: 0.28, tone: 2800, level: 0.5 },
    parts: {
      choir:  { inst: 'choir', vol: 0.6, pan: 0.0, reverb: 0.5, legato: true, vel: 0.68,
                params: { attack: 0.1, release: 0.6 } },
      choirLo:{ inst: 'choir', vol: 0.42, pan: -0.15, reverb: 0.5, legato: true, vel: 0.62, octave: -1,
                params: { attack: 0.12, release: 0.6 } },
      choirHi:{ inst: 'choir', vol: 0.32, pan: 0.2, reverb: 0.55, legato: true, vel: 0.65, layer: 0.5,
                params: { attack: 0.1, release: 0.6, vowel: 0.45 } },
      oo:     { inst: 'choir_oo', vol: 0.52, pan: 0.1, reverb: 0.65, legato: true, vel: 0.5,
                params: { attack: 0.4, release: 1.0 } },
      organ:  { inst: 'organ', vol: 0.34, reverb: 0.45, vel: 0.6, params: { attack: 0.08, release: 0.5 },
                chord: { style: 'pad', octave: 3, voicing: 'open' } },
      strings:{ inst: 'strings', vol: 0.26, reverb: 0.5, vel: 0.5, params: { attack: 0.3, release: 0.8 },
                chord: { style: 'pad', octave: 4, voicing: 'close' } },
      lead:   { inst: 'strings', vol: 0.36, pan: -0.1, reverb: 0.4, legato: true, vel: 0.72,
                params: { attack: 0.05, release: 0.3, bright: 1.1 } },
      vln:    { inst: 'violin', vol: 0.34, pan: 0.25, reverb: 0.4, legato: true, vel: 0.75, octave: 1, layer: 0.5,
                params: { vibrato: 1.25 } },
      cello:  { inst: 'cello', vol: 0.6, pan: -0.2, reverb: 0.38, legato: true, vel: 0.65,
                params: { vibrato: 1.2, bright: 1.1 } },
      ost:    { inst: 'strings', vol: 0.3, pan: -0.15, reverb: 0.25, vel: 0.6, gate: 0.55, grid: '16n',
                params: { attack: 0.012, release: 0.1, bright: 1.05 },
                chord: { style: 'arp', pattern: OST, octave: 3, bass: 2 } },
      ostHi:  { inst: 'strings', vol: 0.22, pan: 0.2, reverb: 0.3, vel: 0.58, gate: 0.5, grid: '16n', layer: 0.5,
                params: { attack: 0.01, release: 0.1, bright: 1.15 },
                chord: { style: 'arp', pattern: OST, octave: 4, voicing: 'close' } },
      basses: { inst: 'strings', vol: 0.34, reverb: 0.15, vel: 0.75, gate: 0.7, grid: '16n',
                params: { attack: 0.02, release: 0.12, bright: 0.9 },
                chord: { style: 'bass', octave: 2, rhythm: '1 . . 1 . . 1 . 1 . . . 5 . . .' } },
      sub:    { inst: 'sub_bass', vol: 0.75, reverb: 0.05, vel: 0.72,
                chord: { style: 'bass', octave: 1, rhythm: '1 - - - - - - -' } },
      brass:  { inst: 'brass', vol: 0.48, pan: -0.05, reverb: 0.32, legato: true, vel: 0.82, octave: -2,
                params: { attack: 0.06, release: 0.3 } },
      brassHit:{ inst: 'brass', vol: 0.46, reverb: 0.3, vel: 0.9, layer: 0.5, gate: 0.5, humanize: false, grid: '16n',
                chord: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x! . . x . . x! . x! . . . . . . .' } },
      brassPad:{ inst: 'brass', vol: 0.4, reverb: 0.35, vel: 0.7, params: { attack: 0.25, release: 0.6 },
                chord: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x - - - - - - -' } },
      timp:   { inst: 'timpani', vol: 0.55, reverb: 0.3, humanize: false, grid: '16n', pan: -0.1 },
      timpHi: { inst: 'timpani', vol: 0.4, reverb: 0.3, humanize: false, grid: '16n', pan: 0.1, layer: 0.5 },
      boom:   { inst: 'low_drum', vol: 0.46, reverb: 0.2, humanize: false, grid: '16n' },
      bell:   { inst: 'bell', vol: 0.36, pan: 0.2, reverb: 0.5, delay: 0.3, humanize: false, grid: '16n' },
      anvil:  { inst: 'anvil', vol: 0.28, reverb: 0.3, humanize: false, grid: '16n', layer: 0.5, pan: 0.2 },
      cym:    { inst: 'cymbal', vol: 0.28, reverb: 0.4, humanize: false, grid: '16n' },
      swell:  { inst: 'cymbal_swell', vol: 0.32, reverb: 0.5, humanize: false, grid: '16n' },
      riser:  { inst: 'noise_riser', vol: 0.26, reverb: 0.35, humanize: false, grid: '16n' },
    },
    sections: {
      intro: {
        chords: 'Dm | Dm | Dm | A',
        organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.55, ramp: [0.6, 1.2] },
        oo: bars('D5@44 - - - - - - -', 'D5 - - - E5 - - -', 'F5 - - - - - E5 -', 'E5 - - - - - . .'),
        sub: true,
        bell: bars('D3 . . . . . . . . . . . . . . .', R16, R16, R16),
        timp: bars(R16, 'D2 . . . . . . . D2 . . . D2 . . .', 'D2 . . . D2 . . . D2 . D2 . D2 D2 D2 D2', ROLL('A2')),
        swell: bars(R16, R16, 'D4', 'D4'),
        cym: bars(R16, R16, R16, R16),
      },
      A: {
        chords: 'Dm | Gm | C | Dm/F | Am | F | Bb | A',
        choir: INV, choirLo: { notes: INV, vel: 0.55 }, choirHi: { notes: INV, vel: 0.62 },
        brass: INV,
        ost: true, ostHi: true, basses: true, sub: true, organ: true,
        timp: bars(TM, '%', '%', '%', '%', '%', '%', ROLL('A2')),
        boom: bars(BOOM, '%', '%', '%', '%', '%', '%', BOOM_FILL),
        brassHit: true,
        anvil: bars('G5 . . . . . . . . . . . . . . .', R16, R16, R16, 'G5 . . . . . . . . . . . . . . .', R16, R16, R16),
        cym: bars('x', R16, R16, R16, 'x', R16, R16, R16),
        timpHi: bars(R16, R16, R16, R16, R16, R16, R16, 'A2 . . A2 . . A2 . . A2 . . A2 . . .'),
      },
      B: {
        chords: 'Dm | Gm | Dm | Am | Dm | Bb | Gm A7 | Dm',
        lead: ORIG_SHAPED, vln: { notes: ORIG_SHAPED, vel: 0.7 },
        choirLo: { notes: INV, vel: 0.6, octave: 0 }, choirHi: { notes: INV, vel: 0.6, octave: 0 },
        brass: bars(R8, R8, R8, R8, 'A4 - E4 - D4 C4 D4 -', 'E4 - - F4 G4 - A4 -', 'Bb4 - G4 A4 C5 - D5 -', 'D4 - - - - - - -'),
        ost: true, ostHi: true, basses: true, sub: true, organ: true,
        timp: bars(TM, '%', '%', '%', '%', '%', '%', ROLL('A2')),
        boom: bars(BOOM, '%', '%', '%', '%', '%', '%', BOOM_FILL),
        brassHit: true,
        cym: bars('x', R16, R16, R16, 'x', R16, R16, 'x'),
        anvil: bars('G5 . . . . . . . . . . . . . . .', R16, R16, R16, 'G5 . . . . . . . . . . . . . . .', R16, R16, R16),
      },
      C: {
        chords: 'Bb | F | Gm | Dm | Bb | F/A | Gm | A',
        oo: CALM, cello: CELLO_C,
        organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.42 },
        strings: { style: 'pad', octave: 4, vel: 0.34, ramp: [0.8, 1.3] },
        sub: { style: 'bass', octave: 1, rhythm: '1 - - - - - - -', vel: 0.55 },
        bell: bars(R16, R16, R16, R16, 'Bb3 . . . . . . . . . . . . . . .', R16, R16, R16),
        timp: bars(R16, R16, R16, 'D2 . . . . . . . . . . . . . . .', R16, R16, 'D2 . . . D2 . . . D2 . . . D2 . . .', ROLL('A2')),
        riser: bars(R16, R16, R16, R16, R16, R16, 'C6', 'C6'),
        swell: bars(R16, R16, R16, R16, R16, R16, R16, 'A4'),
        cym: bars(R16, R16, R16, R16, R16, R16, R16, 'x'),
      },
      A2: {
        chords: 'Dm | Gm | C | Dm/F | Am | F | Bb | A',
        choir: INV, choirLo: { notes: INV, vel: 0.62 }, choirHi: { notes: INV, vel: 0.7 },
        lead: { notes: INV, octave: 1, vel: 0.7 },
        brass: ORIG,
        ost: true, ostHi: true, basses: true, sub: true, organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.68 },
        timp: bars(TM, '%', '%', '%', '%', '%', '%', ROLL('A2')),
        boom: bars(BOOM, '%', '%', '%', '%', '%', '%', BOOM_FILL),
        brassHit: true,
        anvil: bars('G5 . . . G5 . . . . . . . . . . .', '%', '%', '%', '%', '%', '%', '%'),
        cym: bars('X', R16, R16, R16, 'x', R16, R16, 'x'),
        timpHi: bars(R16, R16, R16, R16, R16, R16, R16, 'A2 . . A2 . . A2 . . A2 . . A2 . . .'),
      },
      D: {
        chords: 'Dm | Gm | Dm | Am | Dm | Bb | Gm A7 | Dm',
        choir: { notes: ORIG, vel: 0.82 }, choirLo: { notes: ORIG, vel: 0.7 }, choirHi: { notes: ORIG, vel: 0.75 },
        lead: { notes: ORIG_SHAPED, octave: 1, vel: 0.8 }, vln: { notes: ORIG_SHAPED, vel: 0.85 },
        brass: INV, cello: { notes: INV, octave: -1, vel: 0.7 },
        ost: true, ostHi: true, basses: true, sub: true, organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.72 },
        strings: { style: 'pad', octave: 4, vel: 0.5 },
        timp: bars(TM, '%', '%', '%', '%', '%', '%', ROLL('A2')),
        boom: bars(BOOM, '%', '%', '%', '%', '%', '%', BOOM_FILL),
        brassHit: true,
        bell: bars('D3 . . . . . . . . . . . . . . .', R16, 'D3 . . . . . . . . . . . . . . .', R16, 'D3 . . . . . . . . . . . . . . .', R16, 'G3 . . . . . . . A3 . . . . . . .', 'D3 . . . . . . . . . . . . . . .'),
        anvil: bars('G5 . . . G5 . . . G5 . . . G5 . . .', '%', '%', '%', '%', '%', '%', '%'),
        cym: bars('X', R16, 'x', R16, 'x', R16, 'x', R16),
        timpHi: bars(R16, R16, R16, R16, R16, R16, R16, 'A2 . . A2 . . A2 . . A2 . . A2 . . .'),
      },
      F: {
        chords: 'Dm | Bb | Gm | Gm | Bb | Bb | A | A',
        choir: CLIMB, choirLo: { notes: CLIMB, vel: 0.55 }, choirHi: { notes: CLIMB, vel: 0.65 },
        lead: { notes: CLIMB, octave: 1, vel: 0.7 },
        brass: bars(R8, R8, R8, R8, R8, R8, R8, R8),
        ost: true, ostHi: true, basses: true, sub: true,
        organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.55, ramp: [0.8, 1.3] },
        strings: { style: 'pad', octave: 4, vel: 0.4, ramp: [0.8, 1.4] },
        brassPad: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x - - - - - - -', ramp: [0.8, 1.2] },
        timp: bars(TM_SOFT, TM_SOFT, TM, TM, TM, TM, 'D2 . D2 . D2 . D2 . A2 . A2 . A2 A2 A2 A2', ROLL('A2')),
        boom: bars(BOOM, '%', '%', '%', '%', '%', BOOM_FILL, ROLL('x')),
        riser: bars(R16, R16, R16, R16, R16, R16, 'C6', 'C6'),
        swell: bars(R16, R16, R16, R16, R16, R16, 'A4', 'A4'),
        cym: bars(R16, R16, R16, R16, 'x', R16, R16, 'x'),
        anvil: bars(R16, R16, R16, R16, R16, R16, 'G5 . . . G5 . . . G5 . . . G5 . . .', R16),
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'C', 'A2', 'D', 'F'],
  });
})();
