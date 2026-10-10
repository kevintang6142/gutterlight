// src/audio/tracks/guttered.js — "The Dead Sconces" (The Guttered Ways, exploration). Owner: music-early.
//
// Melancholic, patient, amber. Felt piano and solo cello over a low string pad, in D minor. The Ways have a
// pulse of their own - a 3+3+2 lilt in the left hand and in the cello's tune ("the drip") - and the
// Gutterlight theme (DESIGN §8) surfaces out of it as a memory, then turns warm, then is hunted through
// a falling sequence before the halls swallow it again.
//
// Form (70 bpm, 4/4, 8th grid; 5 x 8 bars = 40 bars, ~2:17, loops seamlessly):
//   I   "Halls"     the cello's own tune (A-D-F, rising 3+3+2) over a slow lament bass, piano joins at bar 3
//   II  "Quote"     the theme: piano plays bars 1-4, cello answers with bars 5-8 an octave down
//   III "Amber"     the theme's second half transposed to B-flat major (hope), tilting back to D minor
//   IV  "Chase"     the theme's head as a canon (piano, cello a bar later) in falling thirds over a
//                   stepwise-descending bass; strings and timpani build to an A7 peak
//   V   "Return"    the Halls again, thinning to a few notes, ending on the dominant that opens I
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  // Re-bow / re-breath marks (^) on the first note of every `every`-th bar of a legato line.
  const bow = (s, every = 2) => s.split('|').map((b, i) => (i % every === 0 ? b.replace(/([A-G][#b]?\d)/, '$1^') : b)).join('|');

  // The leitmotif, bar by bar, shaped (see title.js). '^' = new bow in the cello.
  const T1 = 'A4@58 - D5@66 - C5 A4 F4 - | G4@58 - - A4 Bb4@68 - A4 - | F4 - E4 F4 D4@54 - - - | C4@52 - D4 E4 A3@48 - - - ';
  const T2 = 'A4^ - D5 - E5 F5 E5 - | D5 - - C5 Bb4 - A4 - | G4^ - Bb4 A4 F4 - E4 - | D4 - - - - - - -';

  G.Audio.defineTrack('guttered', {
    title: 'The Dead Sconces', key: 'D minor',
    bpm: 70, meter: '4/4', grid: '8n',
    reverb: 0.42, volume: 1.5,
    humanize: { time: 0.012, vel: 0.07 },
    delay: { beats: 0.75, feedback: 0.3, tone: 2800, level: 0.7 },
    parts: {
      piano:   { inst: 'felt_piano', vol: 1, pan: 0.05, reverb: 0.38, vel: 0.6 },
      lh:      { inst: 'felt_piano', vol: 0.72, pan: -0.12, reverb: 0.35, vel: 0.4, pedal: true,
                 chord: { style: 'arp', pattern: 'b - - 1 - - 2 -', octave: 3, bass: 2 } },
      cello:   { inst: 'cello', vol: 0.66, pan: -0.2, reverb: 0.42, legato: true, vel: 0.6 },
      strings: { inst: 'strings', vol: 0.34, reverb: 0.55, chord: { style: 'pad', octave: 3, vel: 0.36 } },
      basses:  { inst: 'strings', vol: 0.32, reverb: 0.4, chord: { style: 'bass', octave: 2, vel: 0.45 } },
      timp:    { inst: 'timpani', vol: 0.5, pan: -0.1, reverb: 0.5, vel: 0.5, humanize: false },
    },
    sections: {
      // ------------------------------------------------------------------------ I Halls
      I: {
        chords: 'Dm | Dm/C | Bb | A7 | Dm | Dm/C | Gm | A7',
        cello: bow('A3@50 - - D4 - - F4 - | A4 - - G4 - - F4 - | D4 - F4 - Bb4 - - - | A4 - - G4 - - E4 - |' +
               'F4 - - A4 - - D5 - | C5 - - Bb4 - - A4 - | G4 - Bb4 - D5 - - - | C#5 - - - - - - -'),
        lh: { style: 'arp', pattern: 'b - - 1 - - 2 -', octave: 3, bass: 2, chords: '. | . | Bb | A7 | Dm | Dm/C | Gm | A7' },
        strings: { style: 'pad', octave: 3, vel: 0.3, chords: '. | . | . | . | Dm | Dm/C | Gm | A7' },
        basses: true,
      },
      // ------------------------------------------------------------------------ II Quote
      II: {
        chords: 'Dm | Gm | Dm | Am | Dm | Bb | Gm A7 | Dm',
        piano: T1 + '| . | . | . | .',
        cello: { notes: '. | . | . | . | ' + T2, octave: -1 },
        lh: { style: 'arp', pattern: 'b - - - 0 - - -', reset: 'chord', octave: 3, bass: 2, vel: 0.36 },
        strings: { style: 'pad', octave: 3, vel: 0.32 },
        basses: true,
      },
      // ------------------------------------------------------------------------ III Amber
      III: {
        chords: 'Bbmaj7 | Gm7 | Ebmaj7 | Bb/D | Bbmaj7 | Gm7 | Gm A7 | Dm',
        piano: 'F4@60 - Bb4@66 - C5 D5 C5 - | Bb4@62 - - A4 G4 - F4 - | Eb4 - G4 F4 D4@58 - C4 - | Bb3@52 - - - - - - - |' +
               'F5@66 - Bb5@72 - C6 D6! C6 - | Bb5@66 - - A5 G5 - F5 - | G5@62 - Bb5 A5 F5 - E5 - | D5@56 - - - - - - -',
        cello: '. | . | . | . | ' +
               'F4 - Bb4 - C5 D5 C5 - | Bb4^ - - A4 G4 - F4 - | G4^ - Bb4 A4 F4 - E4 - | D4 - - - - - - -',
        lh: { style: 'arp', pattern: 'b - 0 - 1 - 2 -', reset: 'chord', octave: 3, bass: 2, vel: 0.38 },
        strings: { style: 'pad', octave: 3, vel: 0.34, ramp: [0.9, 1.25] },
        basses: true,
      },
      // ------------------------------------------------------------------------ IV Chase
      IV: {
        chords: 'Dm | Dm/C | Bb | Bb/A | Gm | Gm/F | Em7b5 | A7',
        piano: 'A4@62 - D5 - C5 A4 F4 - | D5@50 - - - - - - - | F4@64 - Bb4 - A4 F4 D4 - | Bb4@50 - - - - - - - |' +
               'D4@66 - G4 - F4 D4 Bb3 - | G4@50 - - - - - - - | E4@70 - G4 - Bb4 - D5 - | C#5@76 - E5 - A5! - - -',
        cello: { notes: '. | A3@62 - D4 - C4 A3 F3 - | . | F3@64 - Bb3 - A3 F3 D3 - | . | D3@66 - G3 - F3 D3 Bb2 - | E3@70 - G3 - Bb3 - D4 - | C#4@76 - E4 - A4 - - -',
                 vel: 0.6 },
        lh: { style: 'arp', pattern: 'b - - 1 - - 2 -', octave: 3, bass: 2, vel: 0.38 },
        strings: { style: 'pad', octave: 3, vel: 0.36, ramp: [0.9, 1.45] },
        basses: { style: 'bass', octave: 2, vel: 0.5, ramp: [1, 1.2] },
        timp: 'D3@62 - - - - - - - | . | Bb2@60 - - - - - - - | . | G2@66 - - - - - - - | . | E2@72 - - - . . . . | A2@82 - - - - - - -',
      },
      // ------------------------------------------------------------------------ V Return
      V: {
        chords: 'Dm | Dm/C | Bb | A7 | Dm | Dm/C | Bb | A7sus4 A7',
        piano: 'A4@52 - - D5 - - F5 - | A5@50 - - G5 - - F5 - | D5@48 - F5 - Bb4 - - - | A4@46 - - G4 - - E4 - | . | . | Bb4@50 - - - A4 - - - | E4@48 - - - C#4@44 - - -',
        cello: 'D3 - - - - - - - | . | . | . | . | . | . | . ',
        lh: { style: 'arp', pattern: 'b - - 1 - - 2 -', octave: 3, bass: 2, vel: 0.36, ramp: [1, 0.85] },
        strings: { style: 'pad', octave: 3, vel: 0.3, ramp: [1, 0.85] },
        basses: { style: 'bass', octave: 2, vel: 0.42, ramp: [1, 0.85] },
      },
    },
    order: ['I', 'II', 'III', 'IV', 'V'],
  });
})();
