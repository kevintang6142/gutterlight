// src/audio/tracks/ending.js — "The Undying Light" (ending + credits). Owner: music-late.
// The full Gutterlight theme, felt piano + strings, resolving D minor -> D major. Non-looping, 60 bpm,
// 42 bars (~2:48) + tail.
//   intro (2) fragments -> A (8, solo piano, D minor) -> A2 (8, cello sings, piano ripples)
//   -> B (8, the bridge: hope, build, timpani + cymbal swell) -> A3 (8, climax, still D minor, strings full)
//   -> A4 (8, the theme turned to D major: C# and F#, violin descant) -> final chord rings into the tail.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const THEME =
    'A4 - D5 - C5 A4 F4 - | G4 - - A4 Bb4 - A4 - | F4^ - E4 F4 D4 - - - | C4 - D4 E4 A3 - - - |' +
    'A4^ - D5 - E5 F5 E5 - | D5 - - C5 Bb4 - A4 - | G4^ - Bb4 A4 F4 - E4 - | D4 - - - - - - -';
  const THEME_SHAPED =
    'A4@56 - D5@66 - C5 A4 F4 - | G4@58 - - A4 Bb4@68 - A4 - | F4 - E4 F4 D4@54 - - - | C4@52 - D4 E4 A3@48 - - - |' +
    'A4@60 - D5@68 - E5 F5! E5 - | D5@70 - - C5 Bb4 - A4 - | G4@62 - Bb4 A4 F4 - E4 - | D4@50 - - - - - - -';
  // The same eight bars turned to the major: F -> F#, C -> C#, Bb -> B. The last bar lands on D major.
  const THEME_MAJOR =
    'A4@64 - D5@72 - C#5 A4 F#4 - | G4@62 - - A4 B4@72 - A4 - | F#4 - E4 F#4 D4@60 - - - | C#4@58 - D4 E4 A3@54 - - - |' +
    'A4@68 - D5@76 - E5 F#5! E5 - | D5@78 - - C#5 B4 - A4 - | G4@70 - B4 A4 F#4 - E4 - | D4+A4+D5+F#5@70 - - - - - - -';
  const THEME_MAJOR_LOW =
    'A4 - D5 - C#5 A4 F#4 - | G4 - - A4 B4 - A4 - | F#4^ - E4 F#4 D4 - - - | C#4 - D4 E4 A3 - - - |' +
    'A4^ - D5 - E5 F#5 E5 - | D5 - - C#5 B4 - A4 - | G4^ - B4 A4 F#4 - E4 - | D4 - - - - - - -';

  const HARM_A = 'Dm | Gm | Dm | Am | Dm | Bb | Gm A7 | Dm';
  const HARM_A2 = 'Dm | Gm/Bb | Dm/A | Am7 | Bbmaj7 C | Gm7 | Em7b5 A7 | Dm';
  const HARM_MAJ = 'D | G | D | A | D | Bm | G A7 | D';

  G.Audio.defineTrack('ending', {
    title: 'The Undying Light', key: 'D minor -> D major',
    bpm: 60, meter: '4/4', grid: '8n',
    loop: false, tail: 10,
    reverb: 0.42, volume: 1.5,
    humanize: { time: 0.014, vel: 0.07 },
    delay: { beats: 0.75, feedback: 0.3, tone: 3200, level: 0.8 },
    parts: {
      piano:   { inst: 'felt_piano', vol: 1, pan: 0.05, reverb: 0.38, vel: 0.62, humanize: { time: 0.018, vel: 0.08 } },
      pianoHi: { inst: 'felt_piano', vol: 0.5, pan: 0.15, reverb: 0.42, vel: 0.5 },
      lh:      { inst: 'felt_piano', vol: 0.75, pan: -0.12, reverb: 0.38, vel: 0.42, pedal: true,
                 chord: { style: 'arp', pattern: 'b 0 1 2 - 1 0 -', reset: 'chord', octave: 3, bass: 2 } },
      cello:   { inst: 'cello', vol: 0.62, pan: -0.2, reverb: 0.42, legato: true, vel: 0.62 },
      violin:  { inst: 'violin', vol: 0.45, pan: 0.22, reverb: 0.5, legato: true, vel: 0.6 },
      strings: { inst: 'strings', vol: 0.36, reverb: 0.5, chord: { style: 'pad', octave: 4, vel: 0.4 } },
      basses:  { inst: 'strings', vol: 0.34, reverb: 0.4, chord: { style: 'bass', octave: 2, vel: 0.45 } },
      celesta: { inst: 'celesta', vol: 0.5, pan: 0.3, reverb: 0.55, delay: 0.35, vel: 0.5 },
      timp:    { inst: 'timpani', vol: 0.45, reverb: 0.4, humanize: false },
      swell:   { inst: 'cymbal_swell', vol: 0.32, reverb: 0.5, humanize: false },
      cym:     { inst: 'cymbal', vol: 0.3, reverb: 0.5, humanize: false },
    },
    sections: {
      intro: {
        chords: 'Dm | Bbmaj7',
        strings: { style: 'pad', octave: 4, vel: 0.32, ramp: [0.6, 1] },
        piano: '. . . . A4@40 - - - | . . . . . . D5@44 -',
        celesta: '. | . . . . . . . .',
      },
      A: {
        chords: HARM_A,
        piano: THEME_SHAPED, lh: true,
        strings: { style: 'pad', octave: 4, vel: 0.3, chords: '. | . | . | . | Dm | Bb | Gm A7 | Dm' },
        celesta: '. | . | . | . . . . . A5 - - | . | . | . | . . . . A5 - D6 -',
      },
      A2: {
        chords: HARM_A2,
        cello: { notes: THEME, octave: -1 },
        pianoHi: { style: 'arp', pattern: '0 1 2 1 0 1 2 1', octave: 4, voicing: 'open', pedal: true },
        lh: { style: 'arp', pattern: 'b - - - 0 - - -', reset: 'chord', octave: 3, bass: 2 },
        strings: { style: 'pad', octave: 4, vel: 0.36 }, basses: true,
        celesta: '. | . | . | . | . . . . . . F6 - | . | . | . . . . A6 - D7 -',
      },
      B: {
        chords: 'Bb | F | Gm | Dm | Bb | F/A | Gm7 | Asus4 A',
        piano: { notes: 'F4 - Bb4 - A4 Bb4 D5 - | C5 - - Bb4 A4 - F4 - | G4 - Bb4 - A4 Bb4 D5 - | D5 - - C5 A4 - - - |' +
                        'F4 - Bb4 - C5 D5 F5 - | A5! - - G5 F5 - C5 - | D5 - - Bb4 G4 - F4 - | D5 - - - C#5 - - -', ramp: [0.9, 1.15] },
        cello: 'F3 | F3 - - - E3 - - - | D3^ | F3 - - - E3 - - - | D3^ | C3 | Bb2^ | A2',
        lh: true,
        strings: { style: 'pad', octave: 4, vel: 0.42, ramp: [0.85, 1.25] }, basses: true,
        timp: '. | . | . | . | . | D2 - - - . . . . | G2 G2 G2 G2 G2 G2 G2! G2! | A2',
        swell: '. | . | . | . | . | . | . | C4',
      },
      A3: {
        chords: HARM_A2,
        piano: { notes: THEME_SHAPED, vel: 0.72 },
        pianoHi: { notes: THEME, octave: 1, vel: 0.44 },
        cello: { notes: THEME, octave: -1, vel: 0.72 },
        violin: { notes: THEME, octave: 1, vel: 0.5 },
        lh: true,
        strings: { style: 'pad', octave: 4, vel: 0.54 }, basses: { style: 'bass', octave: 2, vel: 0.55 },
        timp: 'D2 | . | D2 | . | D2 | . | D2 D2 D2 D2 A2 A2 A2! A2! | A2',
        cym: 'D4 | . | . | . | . | . | . | .',
        celesta: '. | . | . | . | A5 - D6 - E6 F6 E6 - | . | . | . . . . . . . .',
      },
      A4: {
        chords: HARM_MAJ,
        piano: { notes: THEME_MAJOR, vel: 0.66 },
        pianoHi: { notes: THEME_MAJOR_LOW, octave: 1, vel: 0.42 },
        cello: { notes: THEME_MAJOR_LOW, octave: -1, vel: 0.6 },
        violin: { notes: 'A5@60 - - - F#5 - - - | D6 - - - B5 - - - | A5 - - - F#5 - - - | E5 - - - A5 - - - | ' +
                         'D6 - - - F#6 - E6 - | A6 - - - F#6 - D6 - | B5 - D6 - C#6 - - - | D6 - - - - - - -', vel: 0.55 },
        lh: { style: 'arp', pattern: 'b - 0 1 2 - 1 -', reset: 'chord', octave: 3, bass: 2, vel: 0.42 },
        strings: { style: 'pad', octave: 4, vel: 0.44, ramp: [1, 0.8] }, basses: { style: 'bass', octave: 2, vel: 0.45 },
        timp: 'D2 | . | . | . | . | . | . | D2',
        celesta: '. | . . . . . . F#6 - | . | . . . . . . A6 - | . | . | . | . . . . A6 - D7 -',
        cym: '. | . | . | . | . | . | . | D4',
      },
    },
    intro: ['intro'],
    order: ['A', 'A2', 'B', 'A3', 'A4'],
  });
})();
