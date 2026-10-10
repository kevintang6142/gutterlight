// src/audio/tracks/sable.js — "Knife and Candle" (both duels with Sable, the rival). Owner: music-battle.
//
// E phrygian, 140 bpm, 4/4, 16th-note grid (one 7/8 development section). A solo violin plays Sable's
// motif: three flicks on E, the half-step sting up to F, a leap down to B, and a falling hook. Everything
// else is a fencing match: a spiccato cello ostinato, plucked harp, brushed snare chatter, taiko and
// timpani, and the Andalusian fall (Am G F E) in the lyrical section where Sable's grief shows.
// Form (~1:37 body + 2 bar intro): intro -> A (motif) -> A2 (motif raised an octave, answered by cello)
//   -> B (the grief: violin sings over Am-G-F-E) -> C (stalking: sparse, ticks, rising run) -> A3 (full
//   clash) -> D (7/8 flurry) -> B2 (grief, now furious) -> loops to A.
// Phase 2 layer (G.Audio.musicLayer(1)): octave violin, string stabs, anvil clashes, extra timpani, horns.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const R = '. . . . . . . . . . . . . . . .';
  const R7 = '. . . . . . . . . . . . . .';

  // ---- Sable's motif and its development (written pitch; violin plays as written) --------------------
  const MOTIF = 'E5@88! - - E5 F5 - E5 - B4 - - . B4 C5 B4 A4';       // the rival's knife-flick
  const SA = bars(
    MOTIF,
    'F5@90! - - C5 - - A4 - F4 - A4 C5 F5 - E5 F5',
    MOTIF,
    'F5@90! - E5 - D5 - C5 - A4 - - - . . E5 F5',
    'B5@92! - - A5 G5 - F5 - E5 - - . B4 - E5 -',
    'A5@90 - - G5 F5 - E5 - D5 - - . A4 - D5 -',
    'G5@90 - - F5 E5 - D5 - C5 - - . G4 - C5 -',
    'F#5@92 - - D#5 B4 - - . . . A4 B4 D#5 F#5 A5 B5');
  const SA2 = bars(
    'E6@92! - - E6 F6 - E6 - B5 - - . B5 C6 B5 A5',
    'F6@94! - - C6 - - A5 - F5 - A5 C6 F6 - E6 F6',
    'G6@92! - - F6 E6 - D6 - E6 - - . B5 - E6 -',
    'F6@94! - E6 - D6 - C6 - A5 - - - . . E6 F6',
    'B6@96! - - A6 G6 - F6 - E6 - - . B5 - E6 -',
    'A6@94 - - G6 F6 - E6 - D6 - - . A5 - D6 -',
    'G6@94 - - F6 E6 - D6 - C6 - - . G5 - C6 -',
    'B5@96 - - D#6 F#6 - - . B6! - - - - - - -');
  const SB = bars(
    'C6@70 - - - - - - - B5 - - - A5 - - -',
    'G5 - - - - - - - B5 - - - D6 - - -',
    'C6 - - - - - A5 - F5 - - - A5 - - -',
    'B5 - - - - - G#5 - E5 - - - G#5 - B5 -',
    'A6@80 - - - - - - - G6 - - - E6 - - -',
    'D6 - - - - - - - B5 - - - G5 - D6 -',
    'A5 - - C6 - - F6 - - E6 - - C6 - A5 -',
    'G#5@86! - - - - - B5 - - E6! - - - . . .');
  const SB2 = bars(                                                  // the grief turns to rage: octave up, tremolo-ish repeats
    'C7@86 - - - - - - - B6 - - - A6 - - -',
    'G6 - - - - - - - B6 - - - D7 - - -',
    'C7 - - - - - A6 - F6 - - - A6 - - -',
    'B6 - - - - - G#6 - E6 - - - G#6 - B6 -',
    'E7@92! - - - - - - - D7 - - - C7 - - -',
    'B6 - - - - - - - G6 - - - D7 - - -',
    'A6 - - C7 - - F7? - - E7 - - C7 - A6 -',
    'G#6@92! - - - - - B6 - - E7! - - - . . .');
  const COUNTER_B = bars(                                            // cello answers between the violin's phrases
    'E4 - - - - - - - . . . . . . . .', 'D4 - - - - - - - . . . . . . . .',
    'C4 - - - - - - - . . . . . . . .', 'B3 - - - - - - - - - - - . . . .',
    'E4 - - - - - - - . . . . A3 - C4 -', 'D4 - - - - - - - . . . . G3 - B3 -',
    'C4 - - - - - - - . . . . F3 - A3 -', 'B3 - - - - - - - - - - - - - - -');
  // C: stalking — high harmonics, long silences, then a rising run that explodes into A3
  const SC = bars(
    'B5@38 - - - - - - - . . . . . . . .', '. . . . . . . . F6@40 - - - E6 - - -',
    'C6@42 - - - - - - - . . . . . . . .', '. . . . . . . . A5 - - - G5 - - -',
    'B5@46 - - - - - - - . . . . . . E5 F5', 'G5@50 - - - - - - - . . . . . . B5 C6',
    'E5@50 F5 E5 F5 G5 A5 B5 C6 D6 E6 F6 E6 F6 G6 A6 B6',
    'F#6@90! - - - - - - - - - - - . . . .');
  const SA3 = bars(
    'E5@94! - - E5 F5 - E5 - B4 - - . B4 C5 B4 A4',
    'F5@96! - - C6 - - A5 - F5 - A5 C6 F6 - E6 F6',
    'E6@96! - - E6 F6 - E6 - B5 - - . B5 C6 B5 A5',
    'F6@98! - E6 - D6 - C6 - A5 - - - A5 B5 C6 D6',
    'E6@98! - G6 - B6 - G6 - E6 - G6 - B6 - G6 -',
    'F6 - A6 - C7 - A6 - F6 - A6 - C7 - A6 -',
    'E6 - G6 - A6 - G6 - F6 - G6 - E6 - D6 -',
    'D#6@96 - F#6 - A6 - F#6 - B6! - - - - - B6 C7');
  // D (7/8, 14 steps per bar, grouped 4+4+6): the flurry
  const SD = bars(
    'E5@94! - - E5 F5 - E5 - B4 - . B4 C5 B4',
    'F5@96! - - C6 - - A5 - F5 A5 C6 F6 E6 F6',
    'E6@96! - - E6 F6 - E6 - B5 - . B5 C6 B5',
    'D6 - - C6 - - A5 - D6 - - - C6 D6',
    'C6@96! - - B5 - - A5 - C6 - . A5 B5 C6',
    'D6 - - C6 - - B5 - A5 - A5 B5 C6 D6',
    'F6@98! - - E6 - - C6 - A5 - C6 E6 F6 A6',
    'F#6@96 - D#6 - B5 - D#6 - F#6 - B6! - - -');

  // ---- rhythm patterns -------------------------------------------------------------------------------
  const LOW = 'X . . . . . x . . . X . . . . x';
  const LOW_FILL = 'X . . . x . x . X . x . x x X X';
  const FRAME = '. . . . x . . . . . . . x . . .';
  const BRUSH = 'x? . x? x x? . x? x x? . x? x x? . x? x';       // 16th chatter (ghosted off-beats)
  const TIMP = 'E2 . . . . . . . B2 . . . E2 . . .';
  const OST = 'b! 0 1 0 b 1 0 1 b! 0 1 0 b 1 0 1';
  const ROLL = (n) => Array(16).fill(n).join(' ');

  G.Audio.defineTrack('sable', {
    title: 'Knife and Candle', key: 'E phrygian',
    bpm: 140, meter: '4/4', grid: '16n',
    reverb: 0.26, volume: 1.0,
    humanize: { time: 0.004, vel: 0.05 },
    parts: {
      vln:    { inst: 'violin', vol: 0.74, pan: 0.05, reverb: 0.32, legato: true, vel: 0.78,
                params: { vibrato: 1.35, bright: 1.1 } },
      vln8:   { inst: 'violin', vol: 0.4, pan: -0.15, reverb: 0.4, legato: true, vel: 0.7, octave: 0, layer: 0.5,
                params: { vibrato: 1.2 } },
      cello:  { inst: 'cello', vol: 0.34, pan: -0.25, reverb: 0.25, vel: 0.62, gate: 0.5,
                params: { attack: 0.01, release: 0.08, bright: 1.2, vibrato: 0 },
                chord: { style: 'arp', pattern: OST, octave: 3, bass: 2 } },
      counter:{ inst: 'cello', vol: 0.5, pan: -0.25, reverb: 0.35, legato: true, vel: 0.62, params: { vibrato: 1.15 } },
      harp:   { inst: 'harp', vol: 0.34, pan: 0.3, reverb: 0.3, vel: 0.7, gate: 0.4,
                chord: { style: 'arp', pattern: '. . x . . . . . . . x . . . . .', octave: 4, voicing: 'open' } },
      pad:    { inst: 'strings', vol: 0.2, reverb: 0.5, vel: 0.5,
                params: { attack: 0.4, release: 0.8 },
                chord: { style: 'pad', octave: 3, voicing: 'open' } },
      stab:   { inst: 'strings', vol: 0.34, reverb: 0.3, vel: 0.85, layer: 0.5, gate: 0.35, humanize: false,
                params: { attack: 0.01, release: 0.1, bright: 1.2 },
                chord: { style: 'block', octave: 3, voicing: 'open', rhythm: 'x! . . x . . x . . . x! . . . x .' } },
      horn:   { inst: 'brass', vol: 0.4, reverb: 0.3, vel: 0.85, layer: 1, gate: 0.5, humanize: false,
                params: { attack: 0.04, release: 0.2 },
                chord: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x! . . . . . . . x! . . . . . . .' } },
      bass:   { inst: 'pluck_bass', vol: 0.62, reverb: 0.08, vel: 0.82, gate: 0.7,
                chord: { style: 'bass', octave: 2, rhythm: '1 . . 1 . . 5 . 1 . . 1 . 5 . 1' } },
      sub:    { inst: 'sub_bass', vol: 0.7, reverb: 0.05, vel: 0.72,
                chord: { style: 'bass', octave: 1, rhythm: '1 - - - - - - - - - - - - - - -' } },
      drum:   { inst: 'low_drum', vol: 0.46, reverb: 0.14, humanize: false },
      frame:  { inst: 'frame_drum', vol: 0.34, reverb: 0.2, pan: 0.15, humanize: { time: 0.004, vel: 0.08 } },
      brush:  { inst: 'snare_brush', vol: 0.5, reverb: 0.18, pan: -0.1, humanize: { time: 0.003, vel: 0.08 } },
      tick:   { inst: 'tick', vol: 0.45, reverb: 0.15, pan: 0.35, humanize: false },
      timp:   { inst: 'timpani', vol: 0.46, reverb: 0.22, humanize: false, pan: -0.1 },
      timpHi: { inst: 'timpani', vol: 0.4, reverb: 0.22, humanize: false, pan: 0.1, layer: 0.5 },
      anvil:  { inst: 'anvil', vol: 0.3, reverb: 0.3, humanize: false, layer: 0.5, pan: 0.2 },
      cym:    { inst: 'cymbal', vol: 0.28, reverb: 0.35, humanize: false, layer: 0.5 },
      swell:  { inst: 'cymbal_swell', vol: 0.34, reverb: 0.4, humanize: false },
      riser:  { inst: 'noise_riser', vol: 0.3, reverb: 0.3, humanize: false },
    },
    sections: {
      intro: {
        chords: 'Em | Em',
        tick: bars('C6 . C6 . C6 . C6 . C6 . C6 . C6 . C6 .', 'C6 . C6 . C6 . C6 . C6 C6 C6 C6 C6 C6 C6 C6'),
        harp: bars('E4 . . . . . E4 . . . . . . . . .', 'E4 . . . B4 . . . E5 . . . . . . .'),
        timp: bars(R, ROLL('E2')),
        vln: bars(R, '. . . . . . . . . . . . B4@70 C5 B4 A4'),
        pad: { style: 'pad', octave: 3, vel: 0.5, ramp: [0.6, 1.1] },
        swell: bars('C4', R),
      },
      A: {
        chords: 'Em | F | Em | F | Em | Dm | C | B7',
        vln: SA, cello: true, bass: true, sub: true, pad: true,
        drum: bars(LOW, '%', '%', LOW_FILL, LOW, '%', '%', LOW_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        brush: bars(BRUSH, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP, '%', '%', '%', TIMP, '%', '%', ROLL('B2')),
        vln8: { notes: SA, octave: 1, vel: 0.66 }, stab: true, horn: true,
        harp: true,
        anvil: bars('G5 . . . . . . . . . . . . . . .', R, R, R, 'G5 . . . . . . . . . . . . . . .', R, R, R),
        cym: bars('x', R, R, R, 'x', R, R, R),
      },
      A2: {
        chords: 'Em | F | Em | F | Em | Dm | C | B7',
        vln: SA2, cello: true, bass: true, sub: true, pad: true, harp: true,
        counter: bars('E3 - - - - - - - - - - - . . . .', R, 'G3 - - - - - - - - - - - . . . .', R,
                      'B3 - - - - - - - - - - - . . . .', 'A3 - - - - - - - - - - - . . . .', 'G3 - - - - - - - - - - - . . . .', 'F#3 - - - - - - - - - - - . . . .'),
        drum: bars(LOW, '%', '%', LOW_FILL, LOW, '%', '%', LOW_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        brush: bars(BRUSH, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP, '%', '%', '%', TIMP, '%', '%', ROLL('B2')),
        vln8: { notes: SA2, octave: -1, vel: 0.66 }, stab: true, horn: true,
        anvil: bars('G5 . . . . . . . . . . . . . . .', R, 'G5 . . . . . . . . . . . . . . .', R, 'G5 . . . G5 . . . G5 . . . . . . .', R, R, R),
        cym: bars('x', R, R, R, 'x', R, R, 'x'),
      },
      B: {
        chords: 'Am | G | F | E | Am | G | F | E',
        vln: SB, counter: COUNTER_B, bass: { style: 'bass', octave: 2, rhythm: '1 . . . . . 5 . 1 . . . . . . .' },
        sub: true, pad: { style: 'pad', octave: 3, voicing: 'open', vel: 0.55 },
        cello: { style: 'arp', pattern: 'b . 0 . 1 . 0 . b . 0 . 1 . 0 .', octave: 3, bass: 2, vel: 0.45, gate: 0.6 },
        harp: { style: 'arp', pattern: 'b . . 0 . 1 . . 2 . . 1 . . 0 .', octave: 3, voicing: 'open', bass: 2, pedal: true },
        drum: bars('X . . . . . . . . . . . . . . .', '%', '%', '%', '%', '%', '%', LOW_FILL),
        frame: bars('. . . . . . . . x . . . . . . .', '%', '%', '%', '%', '%', '%', '%'),
        timp: bars('E2 . . . . . . . . . . . . . . .', '%', '%', '%', '%', '%', '%', ROLL('B2')),
        brush: bars('x? . . . x? . . . x? . . . x? . . .', '%', '%', '%', '%', '%', '%', '%'),
        vln8: { notes: SB, octave: 0, vel: 0.5 },
        cym: bars('x', R, R, R, 'x', R, R, R),
      },
      C: {
        chords: 'Em | Em | F | F | Em | Em | B7sus4 | B7',
        vln: SC,
        cello: { style: 'arp', pattern: 'b . . . . . . . . . . . . . . .', octave: 3, bass: 2, vel: 0.5, gate: 1 },
        bass: { style: 'bass', octave: 2, rhythm: '1 . . . . . . . . . . . . . . .' },
        sub: true, pad: { style: 'pad', octave: 3, voicing: 'open', vel: 0.45, ramp: [0.8, 1.3] },
        harp: { style: 'arp', pattern: '0 . . . . . . . 2 . . . . . . .', octave: 4, voicing: 'open', vel: 0.5 },
        tick: bars('C7 . . . C7 . . . C7 . . . C7 . . .', '%', '%', '%',
                   'C7 . C7 . C7 . C7 . C7 . C7 . C7 . C7 .', '%', 'C7 C7 C7 C7 C7 C7 C7 C7 C7 C7 C7 C7 C7 C7 C7 C7', ROLL('C7')),
        timp: bars('E2 . . . . . . . . . . . . . . .', R, 'F2 . . . . . . . . . . . . . . .', R,
                   'E2 . . . . . . . E2 . . . . . . .', 'E2 . . . E2 . . . E2 . . . E2 . . .',
                   'B2 . . B2 . . B2 . . B2 . . B2 . B2 .', ROLL('B2')),
        drum: bars(R, R, R, R, R, R, 'x . . . x . . . x . . . x . x x', R),
        riser: bars(R, R, R, R, R, R, 'C6', 'C6'),
        swell: bars(R, R, R, R, R, R, 'C4', 'C4'),
        cym: bars(R, R, R, R, R, R, R, 'x'),
      },
      A3: {
        chords: 'Em | F | Em | F | Em | F | Dm | B7',
        vln: SA3, vln8: { notes: SA3, octave: -1, vel: 0.62 }, cello: true, bass: true, sub: true, pad: true, harp: true,
        drum: bars(LOW, '%', '%', LOW_FILL, LOW, '%', '%', LOW_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        brush: bars(BRUSH, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP, '%', '%', '%', TIMP, '%', '%', ROLL('B2')),
        stab: true, horn: true,
        anvil: bars('G5 . . . . . . . G5 . . . . . . .', '%', '%', '%', '%', '%', '%', '%'),
        cym: bars('X', R, R, R, 'x', R, R, 'x'),
      },
      D: {
        meter: '7/8',
        chords: 'Em | F | Em | Dm | C | Dm | F | B7',
        vln: SD, vln8: { notes: SD, octave: -1, vel: 0.62 },
        cello: { style: 'arp', pattern: 'b! 0 1 0 b 1 0 1 b! 0 1 0 b 1', octave: 3, bass: 2 },
        bass: { style: 'bass', octave: 2, rhythm: '1 . . 1 . . 5 . . 1 . . 5 .' },
        sub: true, pad: true,
        drum: bars('X . . . x . . . x . . x . x', '%', '%', '%', '%', '%', '%', 'X . x . X . x . X x X x X X'),
        frame: bars('. . . . x . . . . . x . . .', '%', '%', '%', '%', '%', '%', '%'),
        brush: bars('x? . x? x x? . x? x x? . x? x x? .', '%', '%', '%', '%', '%', '%', '%'),
        timp: bars('E2 . . . . . . . . . E2 . . .', '%', '%', '%', '%', '%', '%', 'B2 B2 B2 B2 B2 B2 B2 B2 B2 B2 B2 B2 B2 B2'),
        stab: { style: 'block', octave: 3, voicing: 'open', rhythm: 'x! . . x . . x . . . x! . . .' },
        horn: { style: 'block', octave: 2, voicing: 'close', voices: 3, rhythm: 'x! . . . . . . . x! . . . . .' },
        anvil: bars('G5 . . . . . . . G5 . . . . .', '%', '%', '%', '%', '%', '%', '%'),
        cym: bars('x', R7, R7, R7, 'x', R7, R7, R7),
      },
      B2: {
        chords: 'Am | G | F | E | Am | G | F | E',
        vln: SB2, vln8: { notes: SB, octave: 0, vel: 0.7 }, counter: COUNTER_B,
        bass: { style: 'bass', octave: 2, rhythm: '1 . . 1 . . 5 . 1 . . 1 . . 5 .' },
        sub: true, pad: true, cello: true, harp: true, stab: true, horn: true,
        drum: bars(LOW, '%', '%', '%', '%', '%', '%', LOW_FILL),
        frame: bars(FRAME, '%', '%', '%', '%', '%', '%', '%'),
        brush: bars(BRUSH, '%', '%', '%', '%', '%', '%', '%'),
        timp: bars(TIMP, '%', '%', '%', TIMP, '%', '%', ROLL('B2')),
        anvil: bars('G5 . . . . . . . . . . . . . . .', R, R, R, 'G5 . . . . . . . . . . . . . . .', R, R, R),
        cym: bars('x', R, R, R, 'x', R, R, 'x'),
      },
    },
    intro: ['intro'],
    order: ['A', 'A2', 'B', 'C', 'A3', 'D', 'B2'],
  });
})();
