// src/audio/tracks/title.js — "Gutterlight Theme" (title screen). Reference track for composers:
// it shows every common feature of the song format (docs/AUDIO_FORMAT.md): step strings, chord
// symbols with arpeggio patterns, pedal, legato, velocity markers, accents, ramps, an intro played
// once, per-part reverb/delay sends and reusable phrase constants. Owner: audio.
//
// Form (64 bpm, 4/4, 8th-note grid; body loops seamlessly, ~2:15):
//   intro (2 bars, once) -> A (solo piano) -> A2 (cello sings, piano flows) -> B (bridge, hope)
//   -> A3 (climax: piano in octaves, full strings) -> coda (4 bars, winds down) -> back to A
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  // The leitmotif (DESIGN §8), one 8-step bar per '|'. '-' holds the previous note one 8th.
  // '^' starts a new bow/breath in legato parts (the cello slurs within each two-bar phrase).
  const THEME =
    'A4 - D5 - C5 A4 F4 - | G4 - - A4 Bb4 - A4 - | F4^ - E4 F4 D4 - - - | C4 - D4 E4 A3 - - - |' +
    'A4^ - D5 - E5 F5 E5 - | D5 - - C5 Bb4 - A4 - | G4^ - Bb4 A4 F4 - E4 - | D4 - - - - - - -';
  // Same melody with gentle phrasing: @NN = velocity in percent, ! = accent (phrase peaks).
  const THEME_SHAPED =
    'A4@56 - D5@66 - C5 A4 F4 - | G4@58 - - A4 Bb4@68 - A4 - | F4 - E4 F4 D4@54 - - - | C4@52 - D4 E4 A3@48 - - - |' +
    'A4@60 - D5@68 - E5 F5! E5 - | D5@70 - - C5 Bb4 - A4 - | G4@62 - Bb4 A4 F4 - E4 - | D4@50 - - - - - - -';

  const HARM_A = 'Dm | Gm | Dm | Am | Dm | Bb | Gm A7 | Dm';                     // as in DESIGN §8
  const HARM_A2 = 'Dm | Gm/Bb | Dm/A | Am7 | Bbmaj7 C | Gm7 | Em7b5 A7 | Dm';    // re-harmonised

  G.Audio.defineTrack('title', {
    title: 'Gutterlight Theme', key: 'D minor',
    bpm: 64, meter: '4/4', grid: '8n',
    reverb: 0.4, volume: 1.4,
    humanize: { time: 0.01, vel: 0.06 },
    delay: { beats: 0.75, feedback: 0.3, tone: 3200, level: 0.8 },   // dotted-8th echo (celesta send)
    parts: {
      piano:   { inst: 'felt_piano', vol: 1, pan: 0.05, reverb: 0.35, vel: 0.62 },
      pianoHi: { inst: 'felt_piano', vol: 0.5, pan: 0.15, reverb: 0.4, vel: 0.5 },
      // left hand: broken chords from the section's chord symbols. b = bass note, 0/1/2 = chord tones
      // from the bottom, '-' = let ring; pedal holds every note until the chord changes.
      lh:      { inst: 'felt_piano', vol: 0.75, pan: -0.12, reverb: 0.35, vel: 0.42, pedal: true,
                 chord: { style: 'arp', pattern: 'b 0 1 2 - 1 0 -', reset: 'chord', octave: 3, bass: 2 } },
      cello:   { inst: 'cello', vol: 0.62, pan: -0.2, reverb: 0.4, legato: true, vel: 0.62 },
      strings: { inst: 'strings', vol: 0.36, reverb: 0.5, chord: { style: 'pad', octave: 4, vel: 0.4 } },
      basses:  { inst: 'strings', vol: 0.34, reverb: 0.4, chord: { style: 'bass', octave: 2, vel: 0.45 } },
      celesta: { inst: 'celesta', vol: 0.5, pan: 0.3, reverb: 0.55, delay: 0.35, vel: 0.5 },
      swell:   { inst: 'cymbal_swell', vol: 0.32, reverb: 0.5, humanize: false },
    },
    sections: {
      intro: {
        chords: 'Dm | Bbmaj7',
        strings: { style: 'pad', octave: 4, vel: 0.36, ramp: [0.7, 1] },
        lh: { style: 'arp', pattern: 'b - - - 1 - - -', octave: 3, bass: 2 },
        celesta: '. . . . A5 - - - | . . . . . . D6 -',
      },
      A: {
        chords: HARM_A,
        piano: THEME_SHAPED,
        lh: true,                                             // `true` = use the part's chord defaults
        strings: { style: 'pad', octave: 4, vel: 0.3, chords: '. | . | . | . | Dm | Bb | Gm A7 | Dm' },
        celesta: '. | . | . . . . . A5 - - | . . . . . E5 - - | . | . | . | . . . . A5 - D6 -',
      },
      A2: {
        chords: HARM_A2,
        cello: { notes: THEME, octave: -1 },                  // the theme one octave down, legato
        // right-hand piano ripples above the cello (8ths, open voicing, softer off-beats automatically)
        pianoHi: { style: 'arp', pattern: '0 1 2 1 0 1 2 1', octave: 4, voicing: 'open', pedal: true },
        lh: { style: 'arp', pattern: 'b - - - 0 - - -', reset: 'chord', octave: 3, bass: 2 },
        strings: { style: 'pad', octave: 4, vel: 0.34 },
        basses: true,
        celesta: '. | . | . | . | . . . . . . F6 - | . | . | . . . . A6 - D7 -',
      },
      B: {
        chords: 'Bb | F | Gm | Dm | Bb | F/A | Gm7 | Asus4 A',
        piano: {
          notes: 'F4 - Bb4 - A4 Bb4 D5 - | C5 - - Bb4 A4 - F4 - | G4 - Bb4 - A4 Bb4 D5 - | D5 - - C5 A4 - - - |' +
                 'F4 - Bb4 - C5 D5 F5 - | A5! - - G5 F5 - C5 - | D5 - - Bb4 G4 - F4 - | D5 - - - C#5 - - -',
          ramp: [0.9, 1.12],                                  // gradual crescendo over the section
        },
        cello: 'F3 | F3 - - - E3 - - - | D3^ | F3 - - - E3 - - - | D3^ | C3 | Bb2^ | A2',
        lh: true,
        strings: { style: 'pad', octave: 4, vel: 0.42, ramp: [0.85, 1.2] },
        basses: true,
        celesta: '. | . | . | . . . . . . F5 A5 | . | . | . | . . . . . . . .',
        swell: '. | . | . | . | . | . | . | C4',                 // reverse cymbal into the climax
      },
      A3: {
        chords: HARM_A2,
        piano: { notes: THEME_SHAPED, vel: 0.7 },
        pianoHi: { notes: THEME, octave: 1, vel: 0.42 },     // doubled an octave up
        cello: { notes: THEME, octave: -1, vel: 0.7 },
        lh: true,
        strings: { style: 'pad', octave: 4, vel: 0.5 },
        basses: { style: 'bass', octave: 2, vel: 0.52 },
        celesta: '. | . | . | . | A5 - D6 - E6 F6 E6 - | . | . | . . . . . . . .',
      },
      coda: {
        chords: 'Dm | Bbmaj7 | Gm6 | A7sus4 A7',
        piano: "A4@52 - D5@58 - - - - - | C5@54 - A4@48 - - - - - | Bb4@50 - - - G4@44 - - - | A4@46 - - - G4@42 - E4@40 -",
        lh: { style: 'arp', pattern: 'b - 0 - 1 - 2 -', reset: 'chord', octave: 3, bass: 2, vel: 0.36 },
        strings: { style: 'pad', octave: 4, vel: 0.3, ramp: [1, 0.7] },
        celesta: '. | . . . . . . D6 - | . | . . . . . . . .',
      },
    },
    intro: ['intro'],
    order: ['A', 'A2', 'B', 'A3', 'coda'],
  });
})();
