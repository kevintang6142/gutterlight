// src/audio/tracks/boss.js — "The Idol Breaks" (boss battle: the Effigy and the Soot Matron). Owner: music-battle.
//
// C minor, 132 bpm, 4/4, 16th-note grid. A driving string ostinato accented 3+3+3+3+2+2 (the "tresillo
// of dread") locks with taiko and timpani; the melody uses the same grouping so everything leans one way.
// Form (48 bars, ~1:27 body + 2 bar intro):
//   intro -> A (the idol's march) -> B (lyrical second theme, cello answers) -> C (breakdown: heartbeat,
//   the ostinato muted, a long build) -> A2 (theme returns, horns + high strings) -> B2 (second theme
//   raised, full weight) -> D (climbing sequence over the circle of thirds, ends on G7 back into A).
// Intensity layer (G.Audio.musicLayer(1), phase 2): horns, high violins, cymbals, extra taiko, doubled
// ostinato an octave up. The base layer is already a complete, driving cue.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const R = '. . . . . . . . . . . . . . . .';                       // one silent bar (16th grid)

  // ---- melodies (16 steps/bar, written for the upper register; cello plays them an octave lower) ----
  const MA = bars(
    'C5@78 - - Eb5 - - G5 - - F5 - - Eb5 - D5 -',
    'C5 - - - - - - - . . . . G4 Ab4 Bb4 C5',
    'Eb5@74 - - F5 - - G5 - - Ab5! - - G5 - F5 -',
    'D5 - - - - - - - . . . . Bb4 C5 D5 F5',
    'C5@80 - - Eb5 - - G5 - - C6! - - Bb5 - G5 -',
    'Ab5 - - G5 - - Eb5 - - F5 - - Eb5 - C5 -',
    'F5@76 - - Ab5 - - C6 - - Bb5 - - Ab5 - G5 -',
    'G5! - - - F5 - - - Eb5 - D5 - B4 - D5 -');
  // A2: same skeleton, the second half pushed upward (more urgent)
  const MA2 = bars(
    'C5@84 - - Eb5 - - G5 - - F5 - - Eb5 - D5 -',
    'C5 - - G5 - - C6 - - . . . . G5 Ab5 Bb5',
    'Eb6@82 - - D6 - - C6 - - Ab5 - - C6 - Eb6 -',
    'D6 - - - - - Bb5 - - D6 - - F6! - - -',
    'Eb6@86 - - G5 - - C6 - - Eb6 - - G6! - - F6 ',
    'Eb6 - - D6 - - C6 - - Ab5 - - C6 - Eb6 -',
    'F6@84 - - Ab5 - - C6 - - F6 - - Ab6 - G6 -',
    'G6! - - - - - D6 - - B5 - - G5 - D5 B4');
  const MB = bars(
    'Eb5@70 - - - - - C5 - - Eb5 - - Ab5 - - -',
    'D5 - - - - - F5 - - Bb5 - - A5 - G5 -',
    'G5@74 - - - - - Eb5 - - G5 - - C6 - - -',
    'Bb5 - - - - - G5 - - Bb5 - - D6 - C6 -',
    'Ab5@78 - - - - - C6 - - Ab5 - - F5 - - -',
    'F5 - - Ab5 - - Db6 - - C6 - - Ab5 - F5 -',
    'C6@80 - - - - - - - D6 - - - C6 - B5 -',
    'B5 - - D6 - - G6! - - - - - . . . .');
  const MB2 = bars(                                                 // raised, with fuller rhythm
    'Eb6@84 - - - - - C6 - - Eb6 - - Ab6! - - -',
    'F6 - - - - - D6 - - F6 - - Bb6 - A6 -',
    'G6@86 - - - - - Eb6 - - G6 - - C7 - - -',
    'Bb6 - - - - - G6 - - Bb6 - - D6 - C6 -',
    'Ab5@84 - - - - - C6 - - Ab5 - - F5 - - -',
    'F5 - - Ab5 - - Db6 - - F6 - - Ab6 - F6 -',
    'C6@86 - - - - - - - D6 - - - Eb6 - D6 -',
    'D6! - - - - - . . B5 - - D6 - - G6 -');
  const COUNTER_B = bars(
    'C4 - - - - - - - Eb4 - - - - - - -', 'D4 - - - - - - - F4 - - - - - - -',
    'Eb4 - - - - - - - G4 - - - - - - -', 'G3 - - - - - - - Bb3 - - - - - - -',
    'C4 - - - - - - - F4 - - - - - - -', 'Ab3 - - - - - - - F4 - - - - - - -',
    'G3 - - - - - - - G3 - - - - - - -', 'D4 - - - D4 - - - . . . . . . . .');
  // C (breakdown): lone cello over the muted ostinato — a slow lament that rises into the build
  const MC = bars(
    'Eb5@50 - - - - - - - - - - - - - - -', 'C5 - - - - - - - - - - - . . . .',
    'D5@52 - - - - - - - - - - - - - - -', 'Bb4 - - - - - - - - - - - . . . .',
    'F5@56 - - - - - - - - - - - Ab5 - - -', 'C6@60 - - - - - - - - - - - . . . .',
    'D6@66 - - - - - - - - - - - - - - -', 'D6@74 - - - - - - - - - - - - - - -');
  // D (finale): the first theme transposed up the circle of thirds, then a pounding descent into G7
  const MD = bars(
    'C5@86 - - Eb5 - - G5 - - C6 - - Eb6! - - -', 'D6 - - C6 - - Bb5 - - G5 - - Eb5 - - -',
    'Ab5@86 - - C6 - - Eb6 - - Ab6! - - G6 - Eb6 -', 'C6 - - - - - Ab5 - - . . . . . . .',
    'F5@88 - - Ab5 - - C6 - - F6 - - Ab6! - - -', 'G6 - - F6 - - Db6 - - Bb5 - - Ab5 - - -',
    'Bb5@90 - - D6 - - F6 - - Bb6! - - A6 - F6 -', 'G6! - - - - - - - - - - - . . . .');

  // ---- rhythm patterns (16 steps) -----------------------------------------------------------------
  const TAIKO = 'X . . x . . X . . x . . X . x .';                    // accents 3+3+3+3+2+2
  const TAIKO_FILL = 'X . . x . . X . . x . x X x X x';
  const TAIKO_HALF = 'X . . . . . . . . . x . . . . .';
  const FRAME = '. . . . x . . . . . . . x . . x';                    // backbeat 2 & 4 and a pickup
  const TIMP_A = 'C2 . . . . . . . G2 . . . C2 . . .';
  const TIMP_B = 'C2 . . C2 . . G2 . . C2 . . G2 . C2 .';
  const ROLL = (n) => Array(16).fill(n).join(' ');
  const OST_PAT = '0! 1 2 0! 1 2 0! 1 2 0! 1 2 0! 1 0! 1';
  const OST_PAT_B = '0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1';

  G.Audio.defineTrack('boss', {
    title: 'The Idol Breaks', key: 'C minor',
    bpm: 132, meter: '4/4', grid: '16n',
    reverb: 0.28, volume: 0.9,
    humanize: { time: 0.004, vel: 0.05 },
    parts: {
      ost:    { inst: 'strings', vol: 0.34, pan: -0.15, reverb: 0.25, vel: 0.6, gate: 0.6,
                params: { attack: 0.012, release: 0.12, bright: 1.05 },
                chord: { style: 'arp', pattern: OST_PAT, octave: 4, voicing: 'close' } },
      ostHi:  { inst: 'strings', vol: 0.24, pan: 0.2, reverb: 0.3, vel: 0.58, gate: 0.5, layer: 0.5,
                params: { attack: 0.01, release: 0.1, bright: 1.15 },
                chord: { style: 'arp', pattern: OST_PAT, octave: 5, voicing: 'close' } },
      pad:    { inst: 'strings', vol: 0.22, reverb: 0.5, vel: 0.5,
                params: { attack: 0.5, release: 0.8 },
                chord: { style: 'pad', octave: 3, voicing: 'open' } },
      bass:   { inst: 'pluck_bass', vol: 0.62, reverb: 0.08, vel: 0.8, gate: 0.8,
                chord: { style: 'bass', octave: 2, rhythm: '1 . . 1 . . 1 . . 1 . . 5 . 1 .' } },
      sub:    { inst: 'sub_bass', vol: 0.75, reverb: 0.05, vel: 0.75,
                chord: { style: 'bass', octave: 1, rhythm: '1 - - - - - - - - - - - - - - -' } },
      drum:   { inst: 'low_drum', vol: 0.5, reverb: 0.16, humanize: false },
      frame:  { inst: 'frame_drum', vol: 0.34, reverb: 0.2, humanize: { time: 0.004, vel: 0.08 }, pan: 0.18 },
      timp:   { inst: 'timpani', vol: 0.5, reverb: 0.22, humanize: false, pan: -0.1 },
      timpHi: { inst: 'timpani', vol: 0.4, reverb: 0.22, humanize: false, pan: 0.1, layer: 0.5 },
      cym:    { inst: 'cymbal', vol: 0.3, reverb: 0.35, humanize: false, layer: 0.5 },
      swell:  { inst: 'cymbal_swell', vol: 0.34, reverb: 0.4, humanize: false },
      riser:  { inst: 'noise_riser', vol: 0.3, reverb: 0.3, humanize: false },
      lead:   { inst: 'cello', vol: 0.66, pan: -0.1, reverb: 0.3, legato: true, vel: 0.7, octave: -1,
                params: { bright: 1.15, vibrato: 1.2 } },
      leadHi: { inst: 'strings', vol: 0.2, pan: 0.1, reverb: 0.4, legato: true, vel: 0.6,
                params: { attack: 0.06, release: 0.3 } },
      counter:{ inst: 'cello', vol: 0.4, pan: 0.2, reverb: 0.35, legato: true, vel: 0.6, params: { vibrato: 1.1 } },
      horn:   { inst: 'brass', vol: 0.5, pan: -0.05, reverb: 0.3, vel: 0.8, legato: true, octave: -2, layer: 0.5,
                params: { attack: 0.05, release: 0.25 } },
      stab:   { inst: 'brass', vol: 0.5, reverb: 0.25, vel: 0.85, layer: 0.5, gate: 0.4, humanize: false,
                chord: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x! . . x . . x . . x . . x! . . .' } },
      violin: { inst: 'violin', vol: 0.3, pan: 0.25, reverb: 0.4, legato: true, vel: 0.7, octave: 0, layer: 1,
                params: { vibrato: 1.2 } },
    },
    sections: {
      intro: {
        chords: 'Cm | G',
        timp: bars(ROLL('C2'), 'G2 . . . G2 . . . G2 . G2 G2 C2! . . .'),
        drum: bars(R, 'X . . . . . . . x . . . X . x x'),
        ost: { style: 'arp', pattern: OST_PAT_B, octave: 4, vel: 0.5, ramp: [0.5, 1] },
        pad: { style: 'pad', octave: 3, voicing: 'open', vel: 0.55, ramp: [0.6, 1.1] },
        swell: bars('C4', R),
        sub: { style: 'bass', octave: 1, rhythm: '. . . . . . . . . . . . . . . .', },
        cym: bars(R, R),
      },
      A: {
        chords: 'Cm | Cm/Eb | Ab | Bb | Cm | Ab | Fm | G7',
        ost: true, pad: true, bass: true, sub: true,
        drum: bars(TAIKO, '%', '%', '%', '%', '%', '%', TAIKO_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP_A, '%', '%', '%', TIMP_A, '%', '%', ROLL('G2')),
        lead: MA, leadHi: { notes: MA, vel: 0.55 },
        horn: { notes: MA, vel: 0.8 }, ostHi: true, stab: true,
        cym: bars('x', R, R, R, 'x', R, R, 'x'),
        timpHi: bars(R, R, R, R, R, R, R, 'G2 . . G2 . . G2 . . G2 . . G2 . . .'),
      },
      B: {
        chords: 'Ab | Bb | Cm | Eb | Fm | Db | Gsus4 | G7',
        ost: { style: 'arp', pattern: OST_PAT_B, octave: 4, vel: 0.5, gate: 0.7 },
        pad: { style: 'pad', octave: 3, voicing: 'open', vel: 0.6 },
        bass: { style: 'bass', octave: 2, rhythm: '1 . . . . . 1 . 5 . . . 1 . . .' },
        sub: true,
        drum: bars('X . . . . . . . x . . . . . . .', '%', '%', '%', '%', '%', '%', TAIKO_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP_A, '%', '%', '%', '%', '%', '%', ROLL('G2')),
        lead: MB, leadHi: { notes: MB, vel: 0.55 },
        counter: COUNTER_B,
        horn: { notes: MB, vel: 0.7, octave: -1 }, ostHi: { style: 'arp', pattern: OST_PAT_B, octave: 5, vel: 0.5, gate: 0.6 },
        cym: bars('x', R, R, R, 'x', R, R, R),
      },
      C: {
        chords: 'Ab | Ab | Bb | Bb | Fm | Fm | G | G',
        ost: { style: 'arp', pattern: '0 . . . 1 . . . 2 . . . 1 . . .', octave: 4, vel: 0.36, gate: 0.4, ramp: [0.8, 1.2] },
        pad: { style: 'pad', octave: 3, voicing: 'open', vel: 0.5, ramp: [0.8, 1.3] },
        sub: { style: 'bass', octave: 1, rhythm: '1 - - - - - - - - - - - - - - -' },
        bass: { style: 'bass', octave: 2, rhythm: '. . . . . . . . . . . . . . . .', },
        drum: bars('X . . . . . . . . . . . . . . .', '%', '%', '%',
          'X . . . . . . . x . . . x . . .', 'X . . . x . . . x . x . x . x .',
          'X . x . x . x . X . x . x . x x', ROLL('x')),
        timp: bars('C2 . . . . . . . . . . . . . . .', '%', 'G2 . . . . . . . . . . . . . . .', '%',
          'F2 . . . . . . . F2 . . . . . . .', 'F2 . . . F2 . . . F2 . . . F2 . . .',
          'G2 . . G2 . . G2 . . G2 . . G2 . G2 .', ROLL('G2')),
        lead: MC, counter: bars(R, R, R, R, R, R, R, R),
        horn: bars(R, R, R, R, R, R, 'D4 - - - - - - - - - - - - - - -', 'D4 - - - - - - - - - - - - - - -'),
        swell: bars(R, R, R, R, R, R, 'G4', 'G4'),
        riser: bars(R, R, R, R, R, R, 'C6', 'C6'),
        cym: bars(R, R, R, R, R, R, R, 'x'),
      },
      A2: {
        chords: 'Cm | Cm/Eb | Ab | Bb | Cm | Ab | Fm | G7',
        ost: true, pad: true, bass: true, sub: true,
        drum: bars('X . . x . . X . . x . . X . x x', TAIKO, TAIKO, TAIKO, TAIKO, TAIKO, TAIKO, TAIKO_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP_B, '%', '%', '%', TIMP_B, '%', '%', ROLL('G2')),
        lead: MA2, leadHi: { notes: MA2, vel: 0.62 },
        horn: { notes: MA, vel: 0.85 }, ostHi: true, stab: true,
        violin: MA2,
        cym: bars('X', R, R, R, 'x', R, R, 'x'),
        timpHi: bars(R, R, R, R, R, R, R, 'G2 . . G2 . . G2 . . G2 . . G2 . . .'),
      },
      B2: {
        chords: 'Ab | Bb | Cm | Eb | Fm | Db | Gsus4 | G7',
        ost: true, pad: true, bass: true, sub: true,
        drum: bars(TAIKO, '%', '%', '%', '%', '%', '%', TAIKO_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP_B, '%', '%', '%', '%', '%', '%', ROLL('G2')),
        lead: MB, leadHi: { notes: MB2, vel: 0.62 },
        counter: COUNTER_B, horn: { notes: MB, vel: 0.85, octave: -1 }, ostHi: true, stab: true,
        violin: MB2,
        cym: bars('x', R, R, R, 'x', R, R, 'x'),
      },
      D: {
        chords: 'Cm | Ab | Fm | G | Cm | Ab | Bb | G7',
        ost: true, pad: true, bass: true, sub: true,
        drum: bars(TAIKO, TAIKO, TAIKO, TAIKO, TAIKO, TAIKO, TAIKO, TAIKO_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP_B, '%', '%', '%', '%', '%', '%', ROLL('G2')),
        lead: { notes: MD, octave: -1 }, leadHi: { notes: MD, vel: 0.65 },
        horn: { notes: MD, vel: 0.88, octave: -1 }, ostHi: true, stab: true,
        violin: MD,
        swell: bars(R, R, R, R, R, R, R, 'G4'),
        cym: bars('X', R, 'x', R, 'x', R, 'x', R),
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'C', 'A2', 'B2', 'D'],
  });
})();
