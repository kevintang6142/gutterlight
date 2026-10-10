// src/audio/tracks/rime.js — "The Rime" (frozen depths). Owner: music-late.
// B minor, 50 bpm, 4/4, 8th grid. Glass pad, celesta, bells, sparse felt piano and a faint drone.
// Form (loops, 32 bars ~ 2:34): A (stillness, celesta calls) -> B (D-major thaw, higher glass)
// -> A2 (piano carries the call, celesta answers) -> C (dark: BmM7 / bell tolls, ends on F#7 -> A).
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  G.Audio.defineTrack('rime', {
    title: 'The Rime', key: 'B minor',
    bpm: 50, meter: '4/4', grid: '8n',
    reverb: 0.5, volume: 1.8,
    humanize: { time: 0.012, vel: 0.07 },
    delay: { beats: 1.5, feedback: 0.4, tone: 2600, level: 0.8 },
    parts: {
      pad:     { inst: 'glass_pad', vol: 0.42, pan: 0.05, reverb: 0.65, vel: 0.4,
                 chord: { style: 'pad', octave: 4, vel: 0.4 } },
      drone:   { inst: 'drone', vol: 0.5, reverb: 0.4, vel: 0.4,
                 chord: { style: 'pad', octave: 2, voices: 1, vel: 0.4 } },
      celesta: { inst: 'celesta', vol: 0.6, pan: 0.3, reverb: 0.6, delay: 0.4, vel: 0.5 },
      bell:    { inst: 'bell', vol: 0.5, pan: -0.25, reverb: 0.6, vel: 0.5, delay: 0.15 },
      piano:   { inst: 'felt_piano', vol: 0.85, pan: -0.05, reverb: 0.5, vel: 0.5,
                 humanize: { time: 0.02, vel: 0.08 } },
      lh:      { inst: 'felt_piano', vol: 0.6, pan: -0.15, reverb: 0.5, vel: 0.34, pedal: true,
                 chord: { style: 'arp', pattern: 'b - - - 1 - - -', reset: 'chord', octave: 3, bass: 2 } },
    },
    sections: {
      A: {
        chords: 'Bm | Gmaj7 | Bm/D | Em7 | Bm | Gmaj7 | D/F# Em7 | F#sus4 F#',
        pad: true, drone: true, lh: true,
        celesta: 'B5 - - - D6 - - - | . . . . C#6 - - - | D6 - - - F#6 - E6 - | . . . . B5 - - - | ' +
                 'B5 - - - D6 - - - | . . . . E6 - D6 - | C#6 - - - . . . . | . . . . . . . .',
        bell: 'B3 | . | . | . | F#4 | . | . | .',
        piano: '. | . | . | . | . | . | . | . . . . . . F#4@40 -',
      },
      B: {
        chords: 'D | A/C# | Bm | Gmaj7 | D/F# | A | Gmaj7 Em7 | F#sus4 F#',
        pad: { style: 'pad', octave: 4, vel: 0.46, ramp: [0.9, 1.1] }, drone: true, lh: true,
        celesta: 'F#6 - - - A6 - - - | . . . . E6 - - - | D6 - - - F#6 - E6 - | D6 - - - B5 - - - | ' +
                 'A5 - D6 - F#6 - - - | E6 - - - C#6 - - - | B5 - D6 - E6 - - - | . . . . . . . .',
        bell: 'D4 | . | B3 | . | . | A3 | . | .',
        piano: '. | . | F#4 - - - D4 - - - | . | . | . | . | . . . . . . F#4 -',
      },
      A2: {
        chords: 'Bm9 | Gmaj7 | Bm/D | Em7 | Bm | Gmaj7 | D/F# Em7 | F#sus4 F#',
        pad: true, drone: true, lh: { style: 'arp', pattern: 'b - 0 - 1 - 2 -', reset: 'chord', octave: 3, bass: 2, vel: 0.3 },
        piano: 'B4@58 - - - D5 - - - | C#5@52 - - - B4 - - - | D5@60 - - - F#5 - E5 - | D5@54 - - - B4 - - - | ' +
               'B4@56 - - - D5 - - - | E5@62 - - - D5 - B4 - | C#5@54 - A4 - F#4 - - - | . . . . . . . .',
        celesta: '. | . . . . . . F#6 - | . | . . . . . . . . | . | . . . . . . B6 - | . | A#5 - - - . . . .',
        bell: 'B3 | . | . | . | F#4 | . | . | .',
      },
      C: {
        chords: 'Bm | BmM7 | Gmaj7 | Em7 | Bm/F# | G | Em7 | F#7sus4 F#7',
        pad: { style: 'pad', octave: 4, vel: 0.36, ramp: [1, 0.85] }, drone: true,
        lh: { style: 'arp', pattern: 'b - - - - - - -', reset: 'chord', octave: 3, bass: 2, vel: 0.3 },
        celesta: 'F#5 - - - - - - - | A#5 - - - . . . . | B5 - - - D6 - - - | G5 - - - . . . . | ' +
                 'F#5 - - - A5 - - - | D6 - - - B5 - - - | G5 - B5 - E6 - - - | A#5 - - - . . . .',
        bell: 'B3 | . | G3 | . | F#3 | . | E3 | F#3',
        piano: '. | . | . | . | . | . | . | . . . . . . . .',
      },
    },
    order: ['A', 'B', 'A2', 'C'],
  });
})();
