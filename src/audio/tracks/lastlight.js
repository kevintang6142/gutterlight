// src/audio/tracks/lastlight.js — "Last Brazier Lullaby" (Lastlight, the hub village). Owner: music-early.
//
// Warm, fragile, homey. The Gutterlight theme (DESIGN §8) is the village's lullaby: a music box plays it
// in a 3/4 waltz transformation (the 16 eighth-notes of every two 4/4 bars become three 3/4 bars: same
// pitches and contour, a little more breath on the long notes; 8 bars -> 12 bars), harp rocks underneath,
// soft strings glow like the Last Brazier. In the second telling the lullaby turns to D major -
// the only place in the game where the theme is bright.
//
// Form (66 bpm, 3/4, 8th grid = 6 steps per bar; intro once, then 48 bars ~2:12, loops seamlessly):
//   intro   2 bars    harp rocking, one music-box note
//   A       12 bars   the lullaby in D minor, music box alone over the harp
//   B       8 bars    "hearth song": a new F-major tune in the strings, music box twinkling in the gaps
//   A2      12 bars   the lullaby in D MAJOR, music box + harp an octave below + strings
//   B2      8 bars    hearth song again, now sung by the music box with a fuller harp
//   C       8 bars    "embers": minor, fragments of the theme, a clock ticking by the fire, A7 -> back to A
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  // Re-bow / re-breath marks (^) on the first note of every `every`-th bar of a legato line.
  const bow = (s, every = 2) => s.split('|').map((b, i) => (i % every === 0 ? b.replace(/([A-G][#b]?\d)/, '$1^') : b)).join('|');

  // ---- the lullaby, one 6-step bar per '|' (written at music-box pitch: theme + 1 octave) -------------
  const LULLABY_MIN =
    'A5 - D6 - C6 A5 | F5 - - G5 - A5 | Bb5 - - A5 - - |' +
    'F5 - E5 F5 D5 - | - - C5 - D5 E5 | A4 - - - - - |' +
    'A5 - D6 - E6 F6 | E6 - D6 - - C6 | Bb5 - - A5 - - |' +
    'G5 - Bb5 A5 F5 - | E5 - D5 - - - | .';
  const LULLABY_MAJ =                                       // the same tune with F#, B, C# (D major)
    'A5 - D6 - C#6 A5 | F#5 - - G5 - A5 | B5 - - A5 - - |' +
    'F#5 - E5 F#5 D5 - | - - C#5 - D5 E5 | A4 - - - - - |' +
    'A5 - D6 - E6 F#6 | E6 - D6 - - C#6 | B5 - - A5 - - |' +
    'G5 - B5 A5 F#5 - | E5 - D5 - - - | F#5 - A5 - D6 -';
  const HARM_MIN = 'Dm | Gm | Gm | Dm | Am | Am | Dm | Dm | Bb | Gm | A7 Dm Dm | Dm';
  const HARM_MAJ = 'D | G | G | D | A | A | D | D | G | G | A7 D D | D';

  // ---- the hearth song (new, F major), strings voice at written pitch ---------------------------------
  const HEARTH =
    'D4 - - F4 - - | A4 - G4 F4 E4 - | G4 - - Bb4 - - | A4 - G4 - E4 - |' +
    'F4 - A4 - C5 - | D5 - - - C5 A4 | Bb4 - - A4 - G4 | E4 - - - C#4 -';
  const HEARTH_BOX =                                         // the same tune for the music box, +1 octave
    'D5 - - F5 - - | A5 - G5 F5 E5 - | G5 - - Bb5 - - | A5 - G5 - E5 - |' +
    'F5 - A5 - C6 - | D6 - - - C6 A5 | Bb5 - - A5 - G5 | E5 - - - C#5 -';
  const HARM_HEARTH = 'Bb | F/A | Gm | C | F | Dm | Gm | A7';

  G.Audio.defineTrack('lastlight', {
    title: 'Last Brazier Lullaby', key: 'D minor / D major / F major',
    bpm: 66, meter: '3/4', grid: '8n',
    reverb: 0.42, volume: 1.8,
    humanize: { time: 0.012, vel: 0.07 },
    delay: { beats: 1.5, feedback: 0.28, tone: 2800, level: 0.8 },
    parts: {
      box:     { inst: 'music_box', vol: 0.5, pan: 0.12, reverb: 0.45, delay: 0.25, vel: 0.56 },
      harp:    { inst: 'harp', vol: 0.62, pan: -0.15, reverb: 0.4, vel: 0.46, pedal: true,
                 chord: { style: 'arp', pattern: 'b - 1 - 2 -', octave: 3, bass: 2, voicing: 'open' } },
      harpM:   { inst: 'harp', vol: 0.4, pan: 0.2, reverb: 0.4, vel: 0.5, octave: -1 },
      strings: { inst: 'strings', vol: 0.4, reverb: 0.55, vel: 0.36, params: { attack: 0.9, release: 1.6 },
                 chord: { style: 'pad', octave: 3, vel: 0.36 } },
      lead:    { inst: 'strings', vol: 0.5, pan: -0.1, reverb: 0.5, vel: 0.52, legato: true, params: { attack: 0.35, release: 0.9 } },
      tick:    { inst: 'tick', vol: 0.55, pan: -0.3, reverb: 0.15, vel: 0.35, humanize: false },
    },
    sections: {
      intro: {
        chords: 'Dm | A7sus4',
        harp: { style: 'arp', pattern: 'b - 0 1 2 1', octave: 3, bass: 2, vel: 0.4 },
        strings: { style: 'pad', octave: 3, vel: 0.3, ramp: [0.7, 1] },
        box: '. | . . . . A5 -',
      },
      A: {
        chords: HARM_MIN,
        box: LULLABY_MIN,
        harp: { style: 'arp', pattern: 'b - 1 - 2 -', octave: 3, bass: 2, voicing: 'open', vel: 0.4 },
        strings: { style: 'pad', octave: 3, vel: 0.28, chords: '. | . | . | . | . | . | Dm | Dm | Bb | Gm | A7 Dm Dm | Dm' },
      },
      B: {
        chords: HARM_HEARTH,
        lead: bow(HEARTH),
        box: '. | . | . | . . . . A5 - | . | . | . | . . . . . D6',
        harp: { style: 'arp', pattern: 'b 0 1 2 1 0', octave: 3, bass: 2, voicing: 'open', vel: 0.42 },
        strings: { style: 'pad', octave: 3, vel: 0.3 },
      },
      A2: {
        chords: HARM_MAJ,
        box: LULLABY_MAJ,
        harpM: LULLABY_MAJ,                                   // octave -1 (part option): melody doubled below
        harp: { style: 'arp', pattern: 'b - 1 2 1 2', octave: 3, bass: 2, voicing: 'open', vel: 0.42 },
        strings: { style: 'pad', octave: 3, vel: 0.34, ramp: [0.9, 1.15] },
      },
      B2: {
        chords: HARM_HEARTH,
        box: HEARTH_BOX,
        harp: { style: 'arp', pattern: 'b 0 1 2 1 0', octave: 3, bass: 2, voicing: 'open', vel: 0.46 },
        strings: { style: 'pad', octave: 3, vel: 0.34 },
      },
      C: {
        chords: 'Dm | Dm/C | Bb | Gm | Dm/F | Em7b5 | A7sus4 | A7',
        box: 'A5 - D6 - . . | . | C6 - A5 - F5 - | . | F5 - E5 F5 D5 - | E5 - - - . . | A5 - . . . . | C#6 - - - . .',
        harp: { style: 'arp', pattern: 'b - - - 1 -', octave: 3, bass: 2, voicing: 'open', vel: 0.36 },
        strings: { style: 'pad', octave: 3, vel: 0.3, ramp: [1, 0.75] },
        tick: 'G6 . C6 . G6 . | C6 . G6 . C6 . | G6 . C6 . G6 . | C6 . G6 . C6 . | G6 . C6 . G6 . | C6 . G6 . C6 . | G6 . C6 . G6 . | C6 . G6 . C6 .',
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'A2', 'B2', 'C'],
  });
})();
