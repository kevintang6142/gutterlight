// src/audio/tracks/keeper.js — "Wardens of the Wick" (the three Wardens: Tallowmere, Kilnmother, Vespertine). Owner: music-battle.
//
// F minor, 112 bpm, 4/4, 8th-note grid (timpani on a 16th grid). A solemn processional over a descending
// lament ground (Fm - Eb - Db - C): choir "ah" and pipe organ carry a chant, timpani walk the beat, a bell
// tolls the downbeats of the great moments. Nothing frantic: the fight is a rite, and the Wardens grieve.
// Form (48 bars, ~1:43 body + 2 bar intro):
//   intro -> A (the chant over the ground) -> B (lament: cello + choir over Ab-Eb-Bbm-Fm, timpani roll)
//   -> E (hush: choir "oo", organ and bell) -> C (the march: string pulse, horns, chant in sequence)
//   -> D (climax: chant inverted/descending, organ full, high strings, bell) -> A2 (return, quieter) -> loop.
// Layer (optional, G.Audio.musicLayer(1)): high violins, brass hits, doubled choir.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const R8 = '. . . . . . . .';
  const R16 = '. . . . . . . . . . . . . . . .';

  // ---- melodies (8 steps per bar) ------------------------------------------------------------------
  const TA = bars(                                                     // the chant, over the ground
    'C5@62 - - - F5 - - -', 'Bb4 - - - G5 - - -', 'F5 - - - Ab5 - - -', 'G5 - - - E5 - - -',
    'F5@68 - - Ab5 - - C6 -', 'Bb5 - - G5 - - Eb5 -', 'F5 - Ab5 - C6! - Bb5 -', 'Bb5 - - - G5 - E5 -');
  const TA2 = bars(                                                    // return: the chant lowered and hushed
    'C5@52 - - - F5 - - -', 'Bb4 - - - G5 - - -', 'F5 - - - Ab5 - - -', 'G5 - - - E5 - - -',
    'F5@56 - - Ab5 - - C6 -', 'Bb5 - - G5 - - Eb5 -', 'F5 - Ab5 - Db5 - C5 -', 'E5 - - - - - - -');
  const TB = bars(                                                     // lament (cello sounds it an octave lower)
    'Eb5@64 - - - C5 - Eb5 -', 'G5 - - - Bb5 - G5 -', 'F5 - - - Db5 - F5 -', 'Ab5 - - - C6 - - -',
    'Ab5@70 - F5 - Db5 - F5 -', 'C5 - Eb5 - Ab5 - C6 -', 'Bb5 - Ab5 - F5 - Db5 -', 'G5 - - - E5 - . .');
  const TE = bars(                                                     // hush
    'F5@42 - - - - - Ab5 -', 'Eb5 - - - - - C5 -', 'Db5 - - - - - F5 -', 'C5 - - - . . . .',
    'Ab5@44 - - - - - C6 -', 'G5 - - - Bb5 - - -', 'Ab5 - - - F5 - - -', 'G5 - - - - - E5 -');
  const TC = bars(                                                     // march: rising sequences
    'C5@74 - - F5 - - Ab5 -', 'F5 - - Ab5 - - C6 -', 'G5 - - Bb5 - - G5 -', 'E5 - - G5 - - C6 -',
    'C6@80 - - Ab5 - - F5 -', 'F5 - - Ab5 - - F5 -', 'F5 - - Db5 - - Bb4 -', 'C5 - E5 - G5 - C6! -');
  const TD = bars(                                                     // climax: the chant descending
    'C6@90! - - - Ab5 - F5 -', 'Bb5 - - - G5 - Eb5 -', 'Ab5 - - - F5 - Db5 -', 'E5 - - G5 - - C6 -',
    'Bb5@92 - Ab5 - F5 - Db5 -', 'C6 - - - Ab5 - C6 -', 'Ab5 - - - F5 - Ab5 -', 'G5! - - - E5 - G5 -');
  const CELLO_C = bars(                                                // counter-line in C
    'F3 - - - - - - -', 'Db3 - - - - - - -', 'Eb3 - - - - - - -', 'C3 - - - - - - -',
    'F3 - - - Ab3 - - -', 'Db3 - - - F3 - - -', 'Bb2 - - - Db3 - - -', 'C3 - - - G3 - - -');
  const CELLO_A2 = bars(
    '. . . . . . . .', 'Eb4@46 - - - - - - -', '. . . . . . . .', 'E4 - - - - - - -',
    'F4 - - - - - - -', 'G4 - - - Bb4 - - -', 'Ab4 - - - F4 - - -', 'G4 - - - . . . .');

  // ---- timpani (16 steps per bar; part grid is 16n) ---------------------------------------------------
  const TM_A = 'F2 . . . . . . . F2 . . . . . . .';
  const TM_C = 'F2 . . . F2 . . . F2 . . . F2 . F2 .';
  const ROLL = (n) => Array(16).fill(n).join(' ');
  const BELL = (n) => `${n} . . . . . . . . . . . . . . .`;

  G.Audio.defineTrack('keeper', {
    title: 'Wardens of the Wick', key: 'F minor',
    bpm: 112, meter: '4/4', grid: '8n',
    reverb: 0.4, volume: 1.0,
    humanize: { time: 0.006, vel: 0.05 },
    delay: { beats: 1.5, feedback: 0.3, tone: 2600, level: 0.6 },
    parts: {
      choir:  { inst: 'choir', vol: 0.62, pan: 0.0, reverb: 0.55, legato: true, vel: 0.6,
                params: { attack: 0.18, release: 0.7 } },
      choirLo:{ inst: 'choir', vol: 0.4, pan: -0.15, reverb: 0.55, legato: true, vel: 0.55, octave: -1,
                params: { attack: 0.2, release: 0.7 } },
      oo:     { inst: 'choir_oo', vol: 0.5, pan: 0.1, reverb: 0.65, legato: true, vel: 0.5,
                params: { attack: 0.5, release: 1.0 } },
      organ:  { inst: 'organ', vol: 0.4, reverb: 0.45, vel: 0.6, params: { attack: 0.1, release: 0.6 },
                chord: { style: 'pad', octave: 3, voicing: 'open' } },
      organHi:{ inst: 'organ', vol: 0.28, pan: 0.15, reverb: 0.5, vel: 0.55, layer: 0.5,
                params: { attack: 0.15, release: 0.6 }, chord: { style: 'pad', octave: 4, voicing: 'close' } },
      pedal:  { inst: 'organ', vol: 0.4, reverb: 0.3, vel: 0.65, params: { attack: 0.12, release: 0.5 },
                chord: { style: 'bass', octave: 2, rhythm: '1 - - - - - - -' } },
      sub:    { inst: 'sub_bass', vol: 0.7, reverb: 0.05, vel: 0.7,
                chord: { style: 'bass', octave: 1, rhythm: '1 - - - - - - -' } },
      strings:{ inst: 'strings', vol: 0.26, reverb: 0.5, vel: 0.5, params: { attack: 0.35, release: 0.8 },
                chord: { style: 'pad', octave: 4, voicing: 'close' } },
      pulse:  { inst: 'strings', vol: 0.3, pan: -0.2, reverb: 0.3, vel: 0.62, gate: 0.6,
                params: { attack: 0.012, release: 0.1, bright: 1.05 },
                chord: { style: 'arp', pattern: 'b! 0 1 0 b 0 1 0', octave: 3, bass: 2 } },
      cello:  { inst: 'cello', vol: 0.6, pan: -0.15, reverb: 0.4, legato: true, vel: 0.65, octave: -1,
                params: { vibrato: 1.2, bright: 1.1 } },
      celloB: { inst: 'cello', vol: 0.5, pan: -0.25, reverb: 0.4, legato: true, vel: 0.6,
                params: { vibrato: 1.1 } },
      vln:    { inst: 'violin', vol: 0.32, pan: 0.25, reverb: 0.45, legato: true, vel: 0.68, octave: 1, layer: 0.5,
                params: { vibrato: 1.2 } },
      hiStr:  { inst: 'strings', vol: 0.22, pan: 0.2, reverb: 0.5, legato: true, vel: 0.6, octave: 1,
                params: { attack: 0.15, release: 0.6 } },
      brass:  { inst: 'brass', vol: 0.5, reverb: 0.35, vel: 0.8, params: { attack: 0.12, release: 0.5 },
                chord: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x . . . . . . .' } },
      brassHit:{ inst: 'brass', vol: 0.44, reverb: 0.3, vel: 0.9, layer: 0.5, gate: 0.5, humanize: false,
                chord: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x! . . x . . x! .' } },
      timp:   { inst: 'timpani', vol: 0.55, reverb: 0.3, humanize: false, grid: '16n', pan: -0.1 },
      boom:   { inst: 'low_drum', vol: 0.42, reverb: 0.25, humanize: false, grid: '16n' },
      bell:   { inst: 'bell', vol: 0.38, pan: 0.2, reverb: 0.5, delay: 0.3, humanize: false, grid: '16n' },
      cym:    { inst: 'cymbal', vol: 0.26, reverb: 0.5, humanize: false, grid: '16n' },
      swell:  { inst: 'cymbal_swell', vol: 0.3, reverb: 0.5, humanize: false, grid: '16n' },
    },
    sections: {
      intro: {
        chords: 'Fm | Fm',
        organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.5, ramp: [0.6, 1.1] },
        pedal: true,
        bell: bars(BELL('F3'), R16),
        timp: bars(R16, 'F2 . . . F2 . . . F2 . F2 F2 F2 F2 F2 F2'),
        swell: bars('C4', R16),
      },
      A: {
        chords: 'Fm | Eb | Db | C | Fm | Eb | Db | C7',
        choir: TA, choirLo: { notes: TA, vel: 0.5 },
        organ: true, pedal: true, sub: true,
        strings: { style: 'pad', octave: 4, vel: 0.42, chords: '. | . | . | . | Fm | Eb | Db | C7' },
        timp: bars(TM_A, '%', '%', '%', TM_A, '%', '%', 'F2 . . . F2 . . . F2 . . . F2 . F2 F2'),
        boom: bars('X . . . . . . . . . . . . . . .', R16, R16, R16, 'X . . . . . . . . . . . . . . .', R16, R16, R16),
        bell: bars(BELL('F3'), R16, R16, R16, BELL('F3'), R16, R16, R16),
        organHi: true,
      },
      B: {
        chords: 'Ab | Eb | Bbm | Fm | Db | Ab/C | Bbm | C',
        cello: TB, choir: { notes: TB, vel: 0.5 },
        organ: true, pedal: true, sub: true,
        strings: { style: 'pad', octave: 4, vel: 0.45, ramp: [0.9, 1.25] },
        celloB: bars('Ab3 - - - - - - -', 'Eb3 - - - - - - -', 'Bb3 - - - - - - -', 'F3 - - - - - - -',
                     'Db3 - - - - - - -', 'C3 - - - - - - -', 'Bb2 - - - - - - -', 'G2 - - - - - - -'),
        timp: bars(TM_A, '%', '%', '%', TM_A, '%', '%', ROLL('C2')),
        vln: { notes: TB, vel: 0.6 }, organHi: true,
        bell: bars(R16, R16, R16, R16, BELL('Ab3'), R16, R16, R16),
      },
      E: {
        chords: 'Db | Ab | Bbm | Fm | Db | Eb | Fm | C',
        oo: TE,
        organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.38 },
        pedal: { style: 'bass', octave: 2, rhythm: '1 - - - - - - -', vel: 0.5 },
        sub: true,
        strings: { style: 'pad', octave: 4, vel: 0.3 },
        celloB: bars(R8, R8, R8, R8, 'Ab3 - - - - - - -', 'G3 - - - - - - -', 'F3 - - - - - - -', 'E3 - - - - - - -'),
        bell: bars(BELL('Db4'), R16, R16, R16, BELL('Db4'), R16, R16, 'F4 . . . . . . . . . . . C4 . . .'),
        timp: bars(R16, R16, R16, R16, R16, R16, 'F2 . . . . . . . . . . . . . . .', ROLL('C2')),
        swell: bars(R16, R16, R16, R16, R16, R16, R16, 'C4'),
      },
      C: {
        chords: 'Fm | Db | Eb | C | Fm | Db | Bbm | C',
        choir: TC, choirLo: { notes: TC, vel: 0.5 },
        cello: CELLO_C,
        pulse: true, organ: true, pedal: true, sub: true, brass: true,
        strings: { style: 'pad', octave: 4, vel: 0.4, ramp: [0.9, 1.3] },
        timp: bars(TM_C, '%', '%', '%', '%', '%', '%', ROLL('G2')),
        boom: bars('X . . . . . . . x . . . . . . .', '%', '%', '%', '%', '%', '%', 'X . . . x . . . X . . . X . X .'),
        vln: { notes: TC, vel: 0.65 }, brassHit: true, organHi: true,
        cym: bars('x', R16, R16, R16, 'x', R16, R16, R16),
      },
      D: {
        chords: 'Fm | Eb | Db | C | Bbm | Fm/Ab | Db | C',
        choir: { notes: TD, vel: 0.72 }, choirLo: { notes: TD, vel: 0.6 }, hiStr: { notes: TD, vel: 0.65 },
        pulse: true, organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.7 }, pedal: true, sub: true, brass: true,
        strings: { style: 'pad', octave: 4, vel: 0.55 },
        cello: bars('F3 - - - C4 - - -', 'Eb3 - - - Bb3 - - -', 'Db3 - - - Ab3 - - -', 'C3 - E3 - G3 - C4 -',
                    'Bb2 - - - F3 - - -', 'Ab2 - - - C3 - - -', 'Db3 - - - F3 - - -', 'G2 - - - B2 - D3 -'),
        timp: bars(TM_C, '%', '%', '%', '%', '%', '%', ROLL('G2')),
        boom: bars('X . . . x . . . X . . . x . . .', '%', '%', '%', '%', '%', '%', 'X . . . x . . . X . X . X X X X'),
        bell: bars(BELL('F3'), BELL('Eb3'), BELL('Db3'), BELL('C3'), BELL('Bb2'), BELL('Ab2'), BELL('Db3'), BELL('G3')),
        vln: { notes: TD, vel: 0.75 }, brassHit: true, organHi: true,
        cym: bars('X', R16, R16, R16, 'x', R16, R16, 'x'),
      },
      A2: {
        chords: 'Fm | Eb | Db | C | Fm | Eb | Db | C7',
        choir: { notes: TA2, vel: 0.9 }, cello: CELLO_A2,
        organ: { style: 'pad', octave: 3, voicing: 'open', vel: 0.48 }, pedal: true, sub: true,
        strings: { style: 'pad', octave: 4, vel: 0.36, ramp: [1, 0.8] },
        timp: bars(TM_A, '%', '%', '%', TM_A, '%', '%', 'F2 . . . . . . . C2 . . . . . . .'),
        bell: bars(BELL('F3'), R16, R16, R16, BELL('F3'), R16, R16, R16),
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'E', 'C', 'D', 'A2'],
  });
})();
