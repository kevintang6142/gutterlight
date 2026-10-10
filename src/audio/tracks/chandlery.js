// src/audio/tracks/chandlery.js — "Tallow and Anvil" (The Chandlery, exploration). Owner: music-mid.
//
// Industrial and rhythmic. The old candle works still run: a syncopated plucked-bass ostinato is the
// machine's heartbeat, anvils clang on the backbeat in a few different pitches (a rack of struck metal),
// a low drum kicks, tiny ticks are the wick-winders, and low brass punches chord roots. Over it a cello
// states the HOOK (a stubborn, angular E minor figure ending on the Phrygian-dominant B7), a violin sings
// the CHORUS (a wider, brighter tune through C - G - D), and between them the machine cools down to
// ostinato, glass and celesta. Exploration-weight: the groove always leaves air between the hits.
//
// Form (100 bpm, 4/4, 16th grid; intro once, then 7 x 8 bars = 56 bars = 2:14, loops):
//   intro  2 bars   ostinato wakes, one anvil
//   A  "Wick"      ostinato, ticks, sparse anvil; celesta hints the hook late
//   B  "Mould"     kick + backbeat anvil + brass punches; the cello's HOOK
//   C  "Pour"      full: the violin's CHORUS over C - G - D, cello doubles an octave down, brass swells
//   D  "Cooling"   no drums: ostinato, glass pad, a celesta tune over Am - C - Em - Bm
//   B2 "Mould II"  groove back; the violin takes the hook an octave up, cello counters in long notes
//   C2 "Pour II"   chorus again with brass doubling the harmony, double-time anvil
//   E  "Snuff"     thinning; the hook in the celesta; a riser on B7 pulls back to A
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const rep = (b, n) => new Array(n).fill(b).join(' | ');
  const E = '. . . . . . . . . . . . . . . .';
  const hold = (note, n) => bars(note + ' - - - - - - - - - - - - - - -', ...new Array(n - 1).fill('- - - - - - - - - - - - - - - -'));

  // ---- patterns (16 steps per bar)
  const OST = '1 . 1 . . 1 . 5 . 1 . . 3 . 5 .';                 // bass degrees; follows the chords
  const KICK = 'X . . . . . . x? . . X . . . . .';
  const KICK_FILL = 'X . . . . . . x? . . X . x x X X';
  const ANV = '. . . . E5 . . . . . . . B5 . . E5@50';           // backbeat on 2 and 4, a ghost pickup
  const ANV_B = '. . . . E5 . . . . . . . G5 . . B5@50';
  const FRAME = '. . x? . . . x? . . . x? . . x? . x?';
  const TICK = 'x@44 x?@28 x?@34 x?@28 x@42 x?@28 x?@34 x?@28 x@44 x?@28 x?@34 x?@28 x@42 x?@28 x?@34 x?@28';
  const TICK_SPARSE = 'x?@38 . . . . . . . x?@34 . . . . . . .';

  // ---- the HOOK (E minor): chords Em | Em | C | D | Em | Em | Am | B7
  const HOOK =
    'E4@66 . . E4 . . G4 . B4 . . . A4 . G4 . | F#4 . . . E4 . D4 . E4 - - - . . . . | C5@68 . . C5 . . B4 . G4 . . . E4 . G4 . | A4 . . . F#4 . . . D4 . . . F#4 . A4 . |' +
    'E4@66 . . E4 . . G4 . B4 . . B4 . D5 . B4 | C5@70 . . . B4 . . . G4 . . . E4 . . . | A4@68 . . A4 . . C5 . E5 . . . D5 . C5 . | B4@66 . . . D#5 . . . F#5 . . . D#5 . B4 .';
  // ---- the CHORUS: chords Em | C | G | D | Em | C | D | B7
  const CHORUS =
    'B4@70 . . B4 . . E5 . . . G5 . F#5 . E5 . | E5 . . . C5 . . . G4 . . . C5 . E5 . | D5@72 . . D5 . . G5 . B5 . . . A5 . G5 . | F#5 . . . A5 . . . F#5 . . . D5 . . . |' +
    'B4@72 . . B4 . . E5 . . . G5 . B5 . G5 . | C6@76 . . . B5 . . . G5 . . . E5 . . . | D5@72 . . D5 . . F#5 . A5 . . . F#5 . D5 . | D#5@70 . . . F#5 . . . B5 - - - . . . .';
  // ---- Cooling (D) tune: chords Am | C | Em | Bm | Am | C | D | B7
  const COOL =
    'C5@52 . . . . . E5 . . . D5 . . . C5 . | B4 . . . . . G4 . . . . . E4 . . . | G4@50 . . . B4 . . . E5 . . . D5 . B4 . | D5 . . . . . F#5 . . . E5 . . . D5 . |' +
    'C5@54 . . . E5 . . . A5 . . . G5 . E5 . | E5 . . . . . D5 . . . C5 . . . G4 . | F#4@50 . . . A4 . . . D5 . . . F#5 . A5 . | D#5@50 . . . . . . . F#5 - - - . . . .';
  const bow = (s, every = 2) => s.split('|').map((b, i) => (i % every === 0 ? b.replace(/([A-G][#b]?\d)/, '$1^') : b)).join('|');

  G.Audio.defineTrack('chandlery', {
    title: 'Tallow and Anvil', key: 'E minor',
    bpm: 100, meter: '4/4', grid: '16n',
    reverb: 0.25, volume: 1.4,
    humanize: { time: 0.006, vel: 0.06 },
    delay: { beats: 0.75, feedback: 0.3, tone: 2600, level: 0.6 },
    parts: {
      bass:   { inst: 'pluck_bass', vol: 0.78, pan: -0.05, reverb: 0.12, vel: 0.62, chord: { style: 'bass', octave: 2, rhythm: OST }, params: { release: 0.5 } },
      kick:   { inst: 'low_drum', vol: 0.42, reverb: 0.15, vel: 0.7, humanize: { time: 0.004, vel: 0.04 } },
      frame:  { inst: 'frame_drum', vol: 0.5, pan: -0.2, reverb: 0.2, vel: 0.5, humanize: { time: 0.004, vel: 0.06 } },
      anvil:  { inst: 'anvil', vol: 0.5, pan: 0.2, reverb: 0.35, vel: 0.66, delay: 0.2 },
      tick:   { inst: 'tick', vol: 0.5, pan: 0.4, reverb: 0.1, vel: 0.5, humanize: { time: 0.003, vel: 0.08 } },
      punch:  { inst: 'brass', vol: 0.55, pan: 0.05, reverb: 0.25, vel: 0.72, gate: 0.4, params: { attack: 0.04, release: 0.3, bright: 0.9 } },
      swell:  { inst: 'brass', vol: 0.42, pan: -0.05, reverb: 0.4, vel: 0.6, params: { attack: 1.0, release: 1.8, bright: 0.8 } },
      cello:  { inst: 'cello', vol: 0.85, pan: -0.2, reverb: 0.3, vel: 0.62, gate: 0.9 },
      cello2: { inst: 'cello', vol: 0.55, pan: -0.3, reverb: 0.4, vel: 0.52, legato: true },
      violin: { inst: 'violin', vol: 0.8, pan: 0.15, reverb: 0.35, vel: 0.64, legato: true, params: { vibrato: 1.1 } },
      pad:    { inst: 'strings', vol: 0.3, reverb: 0.45, chord: { style: 'pad', octave: 3, vel: 0.3, voices: 3 }, params: { attack: 1.0, release: 1.6, bright: 0.55 } },
      glass:  { inst: 'glass_pad', vol: 0.34, reverb: 0.55, chord: { style: 'pad', octave: 4, vel: 0.3, voices: 3 }, params: { attack: 1.4, release: 2.2 } },
      celesta:{ inst: 'celesta', vol: 0.5, pan: 0.3, reverb: 0.45, vel: 0.46, delay: 0.35 },
      cym:    { inst: 'cymbal', vol: 0.4, reverb: 0.4, vel: 0.5, humanize: false },
      riser:  { inst: 'noise_riser', vol: 0.3, reverb: 0.4, vel: 0.5, humanize: false },
    },
    sections: {
      // ------------------------------------------------------------------------ intro
      intro: {
        chords: 'Em | Em',
        bass: { style: 'bass', octave: 2, rhythm: OST, ramp: [0.6, 0.9] },
        tick: bars(E, TICK_SPARSE),
        anvil: bars(E, '. . . . . . . . . . . . E5@52 . . .'),
        pad: { style: 'pad', octave: 3, vel: 0.24, ramp: [0.6, 1] },
      },
      // ------------------------------------------------------------------------ A  Wick
      A: {
        chords: 'Em | Em | C | D | Em | Em | Am | B7',
        bass: true,
        frame: bars(E, E, E, E, rep(FRAME, 3), '. . . . . . x? . . . x? . x? x? x x'),
        tick: bars(rep(TICK_SPARSE, 4), rep(TICK, 4)),
        anvil: bars(E, '. . . . E5@56 . . . . . . . . . . .', E, '. . . . B5@56 . . . . . . . . . . .', E, '. . . . G5@56 . . . . . . . B5@50 . . .', E, '. . . . E5@58 . . . . . . . B5@60 . . E5@50'),
        celesta: bars(E, E, E, E, 'E5@36 . . E5@32 . . G5@34 . B5@34 . . B5@30 . D6@32 . B5@30', E, 'A5@36 . . A5@32 . . C6@34 . E6@34 . . . D6@32 . C6@30 .', 'B5@34 . . . D#6@34 . . . F#6@36 . . . . . . .'),
        pad: { style: 'pad', octave: 3, vel: 0.28 },
        swell: bars(E, E, E, E, E, E, 'A1+E2+C3@50 - - - - - - - - - - - - - - -', 'B1+F#2+A2@56 - - - - - - - - - - - - - - -'),
        riser: bars(E, E, E, E, E, E, E, 'C6 - - - - - - - - - - - - - - -'),
      },
      // ------------------------------------------------------------------------ B  Mould
      B: {
        chords: 'Em | Em | C | D | Em | Em | Am | B7',
        bass: true,
        kick: bars(rep(KICK, 7), KICK_FILL),
        frame: bars(rep(FRAME, 7), '. . x? . . . x? . . . x? . x x X X'),
        tick: bars(rep(TICK, 8)),
        anvil: bars(rep(ANV, 3), ANV_B, rep(ANV, 3), '. . . . E5 . . . . . E5 . B5 . E6 B5'),
        punch: { style: 'block', octave: 2, voicing: 'root', voices: 2, rhythm: '. . . . . . . . . . . . x . . .' },
        cello: bow(HOOK),
        celesta: { notes: bars(E, E, E, E, E, E, E, E), vel: 0.4 },
        pad: { style: 'pad', octave: 3, vel: 0.3 },
        cym: bars('C4', rep(E, 7)),
        riser: bars(rep(E, 6), E, 'C6 - - - - - - - - - - - - - - -'),
      },
      // ------------------------------------------------------------------------ C  Pour
      C: {
        chords: 'Em | C | G | D | Em | C | D | B7',
        bass: { style: 'bass', octave: 2, rhythm: '1 . 1 . . 1 . 5 . 1 . 1 3 . 5 .' },
        kick: bars(rep(KICK, 7), KICK_FILL),
        frame: bars(rep(FRAME, 8)),
        tick: bars(rep(TICK, 8)),
        anvil: bars(rep(ANV, 3), ANV_B, rep(ANV, 3), '. . . . E5 . . . . . E5 . B5 . E6 B5'),
        punch: { style: 'block', octave: 2, voicing: 'root', voices: 2, rhythm: 'x . . . . . . . . . x . . . . .' },
        swell: { style: 'pad', octave: 2, voicing: 'root', voices: 2, vel: 0.5, ramp: [0.8, 1.2] },
        violin: bow(CHORUS),
        cello2: { notes: CHORUS, octave: -1, vel: 0.46 },
        pad: { style: 'pad', octave: 3, vel: 0.34, ramp: [0.9, 1.2] },
        cym: bars('C4', rep(E, 3), 'C4@40', rep(E, 3)),
      },
      // ------------------------------------------------------------------------ D  Cooling
      D: {
        chords: 'Am | C | Em | Bm | Am | C | D | B7',
        bass: { style: 'bass', octave: 2, rhythm: OST, vel: 0.48 },
        frame: bars(rep(E, 4), rep('. . . . . . . . . . x?@30 . . . . .', 4)),
        tick: bars(rep(TICK_SPARSE, 8)),
        anvil: bars('. . . . . . . . . . . . E6@44 . . .', E, E, E, '. . . . . . . . . . . . E6@44 . . .', E, E, '. . . . . . . . . . . . B5@46 . . .'),
        glass: { style: 'pad', octave: 4, vel: 0.32, ramp: [0.9, 1.1] },
        celesta: COOL,
        cello2: bars(hold('A2', 1), hold('G2', 1), hold('E2', 1), hold('B2', 1), hold('A2', 1), hold('G2', 1), hold('D3', 1), 'F#3@40 - - - - - - - - - - - - - - -'),
        pad: { style: 'pad', octave: 3, vel: 0.22 },
      },
      // ------------------------------------------------------------------------ B2  Mould II
      B2: {
        chords: 'Em | Em | C | D | Em | Em | Am | B7',
        bass: true,
        kick: bars(rep(KICK, 7), KICK_FILL),
        frame: bars(rep(FRAME, 7), '. . x? . . . x? . . . x? . x x X X'),
        tick: bars(rep(TICK, 8)),
        anvil: bars(rep(ANV_B, 3), ANV, rep(ANV_B, 3), '. . . . E5 . . E5 . . E5 . B5 . E6 B5'),
        punch: { style: 'block', octave: 2, voicing: 'root', voices: 2, rhythm: 'x . . . . . . . . . . . x . . .' },
        violin: { notes: bow(HOOK), octave: 1, vel: 0.56 },
        cello: { notes: bars(rep(E, 8)) },
        cello2: bars(hold('E3', 2), hold('C3', 1), hold('D3', 1), hold('E3', 2), hold('A3', 1), 'B3@60 - - - - - - - - - - - - - - -'),
        pad: { style: 'pad', octave: 3, vel: 0.3 },
        riser: bars(rep(E, 7), 'C6 - - - - - - - - - - - - - - -'),
      },
      // ------------------------------------------------------------------------ C2  Pour II
      C2: {
        chords: 'Em | C | G | D | Em | C | D | B7',
        bass: { style: 'bass', octave: 2, rhythm: '1 . 1 . . 1 . 5 . 1 . 1 3 . 5 .' },
        kick: bars(rep(KICK, 7), KICK_FILL),
        frame: bars(rep(FRAME, 8)),
        tick: bars(rep(TICK, 8)),
        anvil: bars(rep('. . E5 . E5 . . E5 . . B5 . B5 . . E5@50', 3), '. . G5 . G5 . . G5 . . B5 . D6 . B5 .', rep('. . E5 . E5 . . E5 . . B5 . B5 . . E5@50', 3), '. . . . E5 . . . . . E5 . B5 . E6 B5'),
        punch: { style: 'block', octave: 2, voicing: 'root', voices: 2, rhythm: 'x . . x . . . . . . x . . . . .' },
        swell: { style: 'pad', octave: 2, voicing: 'root', voices: 2, vel: 0.55 },
        violin: bow(CHORUS),
        cello2: { notes: CHORUS, octave: -1, vel: 0.48 },
        celesta: { notes: CHORUS, octave: 1, vel: 0.3 },
        pad: { style: 'pad', octave: 3, vel: 0.36 },
        cym: bars('C4', rep(E, 3), 'C4@40', rep(E, 3)),
      },
      // ------------------------------------------------------------------------ E  Snuff
      E: {
        chords: 'Em | Em | C | D | Em | Am | D | B7',
        bass: { style: 'bass', octave: 2, rhythm: OST, ramp: [0.9, 0.6] },
        kick: bars(KICK, KICK, KICK, KICK, E, E, E, E),
        frame: bars(rep(FRAME, 4), rep('. . . . . . x?@34 . . . . . . . . .', 4)),
        tick: bars(rep(TICK, 4), rep(TICK_SPARSE, 4)),
        anvil: bars(rep(ANV, 2), E, '. . . . B5 . . . . . . . . . . .', E, E, E, '. . . . . . . . . . . . G5@50 . . .'),
        celesta: bars('E5@44 . . E5 . . G5 . B5 . . . A5 . G5 .', 'F#5 . . . E5 . D5 . E5 - - - . . . .', 'C6@44 . . C6 . . B5 . G5 . . . E5 . G5 .', 'A5 . . . F#5 . . . D5 . . . F#5 . A5 .', E, E, E, E),
        pad: { style: 'pad', octave: 3, vel: 0.26, ramp: [1, 0.7] },
        swell: bars(E, E, E, E, E, E, 'D2+A2+F#3@48 - - - - - - - - - - - - - - -', 'B1+F#2+A2@56 - - - - - - - - - - - - - - -'),
        riser: bars(rep(E, 7), 'C6 - - - - - - - - - - - - - - -'),
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'C', 'D', 'B2', 'C2', 'E'],
  });
})();
