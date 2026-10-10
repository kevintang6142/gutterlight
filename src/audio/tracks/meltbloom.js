// src/audio/tracks/meltbloom.js — "Wax Garden" (Meltbloom Gardens). Owner: music-early.
//
// Gentle, verdant, bittersweet. A harp rains arpeggios over a D-dorian vamp (Dm9 - G - Fmaj7 - Cadd9: the
// raised sixth B and the major IV are what make the garden hopeful), a breathy flute sings, a celesta glints
// like dew on wax petals. The middle of the piece slips into the relative F major (the bloom) and then into
// B-flat (the thorn under the flower), before the flute finds the way back.
//
// Form (80 bpm, 4/4, 8th grid; intro once, then 5 x 8 bars = 40 bars = 2:00, loops seamlessly):
//   intro  2 bars   rising harp, a single dew drop
//   A      "Dew"    flute sings the garden tune (M1) over the dorian vamp, harp alone beneath
//   B      "Bloom"  F major: a wider, warmer tune (M2); the harp ripples in 16ths, a pad opens
//   A2     "Dew II" the celesta carries M1 an octave up, the flute weaves a slow descant below
//   C      "Thorn"  B-flat / G minor: long plaintive flute notes, the celesta answers; ends on C
//   B2     "Bloom II" M2 again, flute and celesta in octaves, fullest harp; C -> back to Dm9 (A)
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  // Re-bow / re-breath marks (^) on the first note of every `every`-th bar of a legato line.
  const bow = (s, every = 2) => s.split('|').map((b, i) => (i % every === 0 ? b.replace(/([A-G][#b]?\d)/, '$1^') : b)).join('|');

  const DORIAN = 'Dm9 | G6 | Fmaj7 | Cadd9 | Dm9 | G6 | Fmaj7 | Cadd9';
  const BLOOM = 'Fmaj7 | Am7 | Bbmaj7 | C | Fmaj7 | Dm7 | Gm7 | C';
  const THORN = 'Bbmaj7 | Gm7 | Dm/F | Gm7/Bb | Bbmaj7 | Gm7 | Am7 | C';

  // M1 - the garden tune (flute pitch). Rhythm per bar: 3+2+3 lilt, answered by falling thirds.
  const M1 =
    'D5 - - F5 - A5 - - | B5 - - A5 - G5 - - | A5 - C6 - A5 - F5 - | E5 - - - D5 - - - |' +
    'D5 - - F5 - A5 - C6 | D6 - - B5 - - G5 - | A5 - - G5 - F5 - - | E5 - - - D5 - - -';
  // M2 - the bloom tune (flute pitch): wider leaps, longer notes.
  const M2 =
    'C5 - - - F5 - A5 - | G5 - - - E5 - - - | F5 - - A5 - C6 - - | E6 - D6 - C6 - - - |' +
    'C5 - F5 - A5 - C6 - | D6 - - C6 - A5 - F5 | G5 - - Bb5 - A5 - G5 | E5 - - - D5 - C5 -';
  // The flute's slow descant under the celesta in A2.
  const DESCANT =
    'F5 - - - - - E5 - | G5 - - - - - - - | C5 - - - - - D5 - | G5 - - - - - - - |' +
    'F5 - - - - - A5 - | B4 - - - - - D5 - | C5 - - - - - A4 - | G4 - - - - - - -';

  G.Audio.defineTrack('meltbloom', {
    title: 'Wax Garden', key: 'D dorian / F major',
    bpm: 80, meter: '4/4', grid: '8n',
    reverb: 0.42, volume: 1.5,
    humanize: { time: 0.01, vel: 0.07 },
    delay: { beats: 0.75, feedback: 0.3, tone: 3000, level: 0.8 },
    parts: {
      harp:    { inst: 'harp', vol: 0.55, pan: -0.15, reverb: 0.4, vel: 0.5, pedal: true,
                 chord: { style: 'arp', pattern: 'b 1 2 3 2 1 2 3', octave: 3, bass: 2, voices: 4 } },
      flute:   { inst: 'flute', vol: 0.62, pan: 0.1, reverb: 0.45, vel: 0.58, legato: true },
      celesta: { inst: 'celesta', vol: 0.48, pan: 0.3, reverb: 0.55, delay: 0.35, vel: 0.5 },
      pad:     { inst: 'warm_pad', vol: 0.3, reverb: 0.55, chord: { style: 'pad', octave: 3, vel: 0.34 } },
    },
    sections: {
      intro: {
        chords: 'Dm9 | Cadd9',
        harp: { style: 'arp', pattern: 'b 1 2 3 4 3 2 1', octave: 3, bass: 2, voices: 5, vel: 0.42 },
        celesta: '. . . . . . . . | . . . . E6 - D6 -',
        pad: { style: 'pad', octave: 3, vel: 0.3, ramp: [0.7, 1] },
      },
      A: {
        chords: DORIAN,
        flute: bow(M1),
        harp: true,
        pad: { style: 'pad', octave: 3, vel: 0.26 },
      },
      B: {
        chords: BLOOM,
        flute: bow(M2),
        harp: { style: 'arp', pattern: 'b 1 2 3 2 1 2 3 b 1 2 3 2 1 2 3', grid: '16n', octave: 3, bass: 2, voices: 4, vel: 0.42 },
        celesta: '. | . | . | . . . . . . . E6 | . | . | . | . . . . . . . .',
        pad: { style: 'pad', octave: 3, vel: 0.34 },
      },
      A2: {
        chords: DORIAN,
        celesta: { notes: M1, octave: 1 },
        flute: bow(DESCANT),
        harp: true,
        pad: { style: 'pad', octave: 3, vel: 0.28 },
      },
      C: {
        chords: THORN,
        flute: { vel: 0.5, notes: bow('F5 - - - - - D5 - | G5 - - - F5 - - - | A5 - - - - - - - | Bb5 - - - A5 - - - |' +
               'D6 - - - C6 - Bb5 - | A5 - - - G5 - - - | G5 - - - E5 - - - | E5 - - - G5 - - -') },
        celesta: '. | . . . . . . D6 - | . | . . . . . . . . | . | . . . . . . . . | . | . . . . C6 - - -',
        harp: { style: 'arp', pattern: 'b - 1 - 2 - 3 -', octave: 3, bass: 2, voices: 4, vel: 0.4 },
        pad: { style: 'pad', octave: 3, vel: 0.32, ramp: [1, 0.8] },
      },
      B2: {
        chords: BLOOM,
        flute: { notes: bow(M2), vel: 0.66 },
        celesta: { notes: M2, octave: 1, vel: 0.4 },
        harp: { style: 'arp', pattern: 'b 1 2 3 2 1 2 3 b 1 2 3 2 1 2 3', grid: '16n', octave: 3, bass: 2, voices: 4, vel: 0.46 },
        pad: { style: 'pad', octave: 3, vel: 0.38 },
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'A2', 'C', 'B2'],
  });
})();
