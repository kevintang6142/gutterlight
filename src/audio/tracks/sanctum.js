// src/audio/tracks/sanctum.js — "The Heartwick Sanctum" (awe and grief). Owner: music-late.
// D major / D minor ambiguity, 58 bpm, 4/4, 8th grid. Choir, strings, organ, bells, a far echo of the
// Gutterlight theme (A-D-C) in the bridge. Loops, 32 bars (~2:12).
//   A (organ pedal, choir rises: F natural vs F#) -> B (grief: choir_oo + violin descant over Bm/Gm)
//   -> A2 (full: choir, strings, organ, timpani, theme echo in the cello) -> C (hush, bell, turns to major, back to A)
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  G.Audio.defineTrack('sanctum', {
    title: 'The Heartwick Sanctum', key: 'D major/minor',
    bpm: 58, meter: '4/4', grid: '8n',
    reverb: 0.55, volume: 1.4,
    humanize: { time: 0.012, vel: 0.06 },
    delay: { beats: 1.5, feedback: 0.3, tone: 2400, level: 0.7 },
    parts: {
      organ:   { inst: 'organ', vol: 0.5, reverb: 0.55, vel: 0.5, params: { attack: 0.3, release: 1.2 },
                 chord: { style: 'pad', octave: 3, vel: 0.5 } },
      pedal:   { inst: 'organ', vol: 0.55, reverb: 0.4, vel: 0.55, params: { attack: 0.4, release: 1.5 },
                 chord: { style: 'bass', octave: 2, rhythm: '1 - - - - - - -', vel: 0.55 } },
      strings: { inst: 'strings', vol: 0.34, reverb: 0.55, chord: { style: 'pad', octave: 4, voicing: 'open', vel: 0.42 } },
      choir:   { inst: 'choir', vol: 0.6, pan: -0.1, reverb: 0.65, legato: true, vel: 0.5, params: { attack: 0.5, release: 1.2 } },
      choirHi: { inst: 'choir', vol: 0.4, pan: 0.15, reverb: 0.7, legato: true, vel: 0.45, params: { attack: 0.6, release: 1.4 } },
      oo:      { inst: 'choir_oo', vol: 0.5, pan: 0.1, reverb: 0.7, legato: true, vel: 0.45, params: { attack: 0.7, release: 1.5 } },
      violin:  { inst: 'violin', vol: 0.45, pan: 0.2, reverb: 0.55, legato: true, vel: 0.55, delay: 0.1 },
      cello:   { inst: 'cello', vol: 0.55, pan: -0.25, reverb: 0.5, legato: true, vel: 0.55 },
      bell:    { inst: 'bell', vol: 0.5, pan: 0.1, reverb: 0.6, vel: 0.55, delay: 0.2 },
      glass:   { inst: 'glass_pad', vol: 0.3, reverb: 0.65, vel: 0.4, chord: { style: 'pad', octave: 5, vel: 0.35 } },
      timp:    { inst: 'timpani', vol: 0.55, reverb: 0.4, humanize: false },
    },
    sections: {
      A: {
        chords: 'D5 | Dm | Bbmaj7 | Gm6 | D5 | D/F# | Gmaj7 | Asus4 A',
        organ: true, pedal: true,
        strings: { style: 'pad', octave: 4, voicing: 'open', vel: 0.4, ramp: [0.7, 1.1] },
        choir: 'A4 - - - - - - - | F4 - - - A4 - - - | D5 - - - - - Bb4 - | G4 - - - Bb4 - - - | ' +
               'A4 - - - D5 - - - | F#4 - - - A4 - - - | B4 - - - D5 - - - | C#5 - - - . . . .',
        bell: 'D3 | . | . | . | D4 | . | . | .',
      },
      B: {
        chords: 'Bm | Gm | Bm/F# | Gm/D | Em7 | Bbmaj7 | Gm/Bb A | Asus4 A',
        organ: { style: 'pad', octave: 3, vel: 0.42 }, pedal: true,
        strings: { style: 'pad', octave: 4, voicing: 'open', vel: 0.42 },
        oo: 'D5 - - - F#5 - - - | D5 - - - Bb4 - - - | D5 - - - F#5 - - - | D5 - - - G5 - Bb5 - | ' +
            'E5 - - - G5 - - - | F5 - - - D5 - - - | D5 - Bb4 - A4 - - - | A4 - - - . . . .',
        violin: '. | . | . . . . F#5 - - - | A5 - - - - - G5 - | B5 - - - A5 - G5 - | F5 - - - D5 - - - | ' +
                'Bb4 - - - C5 - - - | E5 - - - - - . .',
        bell: '. | G3 | . | . | . | Bb3 | . | A3',
      },
      A2: {
        chords: 'D | Dm | Bbmaj7 | Gm6 | D | D/F# | Gmaj7 | Asus4 A',
        organ: { style: 'pad', octave: 3, vel: 0.58 }, pedal: { style: 'bass', octave: 2, rhythm: '1 - - - 5 - - -', vel: 0.6 },
        strings: { style: 'pad', octave: 4, voicing: 'open', vel: 0.55, ramp: [0.9, 1.15] },
        glass: true,
        choir: 'D5 - - - F5 - A5 - | A5 - - - F5 - - - | D5 - - - - - F5 - | D5 - - - G5 - Bb5 - | ' +
               'A5 - - - D6 - - - | F#5 - A5 - D6 - F#6 - | G5 - - - B5 - - - | E5 - - - C#5 - - -',
        choirHi: 'F#5 - - - - - - - | . | . | . | . | A5 - - - . . . . | . | A4 - - - - - - -',
        cello: { notes: 'A3 - D4 - C4 A3 F3 - | G3 - - A3 Bb3 - A3 - | F3^ - E3 F3 D3 - - - | C3 - D3 E3 A2 - - - | ' +
                        'A3^ - D4 - E4 F#4 E4 - | D4 - - C#4 B3 - A3 - | G3^ - B3 A3 F#3 - E3 - | D3 - - - - - - -', octave: 0, vel: 0.5 },
        timp: 'D2 | . | . | D2 | D2 | . | . | A2 - - - A2 - A2 A2',
        bell: 'D3 | . | . | . | D4 | . | . | .',
      },
      C: {
        chords: 'D | Bm | Gmaj7 | Em7 | Dm | Bb | Gm A | D5',
        organ: { style: 'pad', octave: 3, vel: 0.4, ramp: [0.9, 0.6] }, pedal: true,
        strings: { style: 'pad', octave: 4, voicing: 'open', vel: 0.34, ramp: [1, 0.7] },
        oo: 'F#5 - - - - - - - | D5 - - - - - - - | B4 - - - D5 - - - | G4 - - - B4 - - - | ' +
            'F4 - - - A4 - - - | D5 - - - F5 - - - | G4 - Bb4 - A4 - - - | A4 - - - - - - -',
        bell: 'D4 | . | B3 | . | A3 | . | G3 | D3',
      },
    },
    order: ['A', 'B', 'A2', 'C'],
  });
})();
