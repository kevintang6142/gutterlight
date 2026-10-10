// src/audio/tracks/shore.js — "Ash Tide" (Ashen Shore). Owner: music-early.
//
// Desolate, windswept, almost empty: a low D drone, glass pads that change colour once every two
// bars, a distant celesta that remembers the Gutterlight theme (DESIGN §8) one broken phrase at a time,
// and a far-off bell like the great fallen candle settling in the ash.
//
// Form (56 bpm, 4/4, 8th grid; 32 bars, ~2:17, loops seamlessly):
//   A "Ash"        the call: only the first two notes of the theme (A-D), the rest of the head much later
//   B "Hollow"     bars 1-2 of the theme in 4x augmentation over Bb / F / Gm, the bell tolls once
//   C "Wind"       the falling sigh of bars 3-4 (F E F D / C D E A) over a ghostly Em7b5; pads climb
//   D "Remembered" bars 5-8 in 2x augmentation, sung by the glass pad itself; ends on a long D that is
//                  the drone of A again (the loop is a circle)
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const EMPTY = '. . . . . . . .';
  // `note` (or a written chord 'D3+A3+E4') held for `bars` 8-step bars, '|' between bars.
  const hold = (note, bars) => {
    const out = [note + ' - - - - - - -'];
    for (let i = 1; i < bars; i++) out.push('- - - - - - - -');
    return out.join(' | ');
  };
  const join = (...bars) => bars.join(' | ');

  G.Audio.defineTrack('shore', {
    title: 'Ash Tide', key: 'D minor (modal)',
    bpm: 56, meter: '4/4', grid: '8n',
    reverb: 0.5, volume: 1.6,
    humanize: { time: 0.02, vel: 0.08 },
    delay: { beats: 1.5, feedback: 0.42, tone: 2300, level: 0.9 },     // long, dark ping-pong echoes
    parts: {
      drone:   { inst: 'drone', vol: 0.46, reverb: 0.3, vel: 0.55, params: { attack: 3, release: 4 } },
      pad:     { inst: 'glass_pad', vol: 0.5, pan: -0.1, reverb: 0.65, vel: 0.34, params: { attack: 2.4, release: 4.5 } },
      voice:   { inst: 'glass_pad', vol: 0.55, pan: 0.1, reverb: 0.7, vel: 0.5, params: { attack: 0.6, release: 4 } },
      wind:    { inst: 'glass_pad', vol: 0.6, pan: 0.45, reverb: 0.8, vel: 0.3, params: { attack: 3.5, release: 5, bright: 0.8 } },
      celesta: { inst: 'celesta', vol: 0.62, pan: 0.28, reverb: 0.7, delay: 0.55, vel: 0.46, params: { release: 1.6 } },
      bell:    { inst: 'bell', vol: 0.62, pan: -0.3, reverb: 0.85, vel: 0.4, params: { release: 6 } },
    },
    sections: {
      // ---------------------------------------------------------------- A: Ash (D drone, almost nothing)
      A: {
        comment: 'Dsus2 | Bb(maj7) | Gm | Dm Asus4 over a D drone',
        drone: hold('D2', 8),
        pad: { vel: 0.27, notes: join(
          hold('D3+A3+E4', 2),
          hold('Bb3+F4+A4', 2),
          hold('G3+D4+Bb4', 2),
          hold('D3+A3+F4', 1),
          hold('A3+D4+E4', 1)) },
        celesta: join(
          EMPTY,
          '. . A5 - D6 - . .',                       // the call: just A... D
          EMPTY, EMPTY, EMPTY,
          '. . . . C6 - . .',
          '. . A5 - . . . .',
          '. . . . F5 - - -'),                       // ...C A F, the head finished, trailing off
        wind: join(EMPTY, EMPTY, EMPTY, hold('A6', 2), EMPTY, EMPTY, EMPTY),   // a thin whistle on the wind
      },
      // ---------------------------------------------------------------- B: Hollow (theme, augmented)
      B: {
        comment: 'Bb(maj7) | Fsus2 | Gm9 | Asus4 A',
        drone: join(hold('Bb1', 6), hold('A1', 2)),
        pad: { vel: 0.31, notes: join(
          hold('Bb3+D4+A4', 2),
          hold('F3+C4+G4', 2),
          hold('G3+Bb3+F4+A4', 2),
          hold('A3+D4+E4', 1),
          hold('A3+E4+C#5', 1)) },
        celesta: join(
          'A5 - - - D6 - - -',
          'C6 - - - A5 - - -',
          'F5 - - - - - - -',
          EMPTY,
          'G5 - - - A5 - - -',
          'Bb5 - - - A5 - - -',
          EMPTY, EMPTY),
        bell: join('Bb2 - - - - - - -', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY),
        wind: join(EMPTY, EMPTY, hold('E6', 2), EMPTY, EMPTY, EMPTY, EMPTY),
      },
      // ---------------------------------------------------------------- C: Wind (the sigh)
      C: {
        comment: 'Dm | Em7b5 | Bbmaj7 | Asus4 A over a D drone',
        drone: hold('D2', 8),
        pad: { vel: 0.34, notes: join(
          hold('A3+D4+F4+A4', 2),
          hold('E4+G4+Bb4+D5', 2),
          hold('Bb3+F4+A4+D5', 2),
          hold('A3+D4+E4+A4', 1),
          hold('A3+E4+A4+C#5', 1)) },
        celesta: join(
          'F5 - - - E5 - F5 -',                      // bars 3-4 of the theme, loosely
          'D5 - - - - - - -',
          'C5 - - - D5 - E5 -',
          'A4 - - - - - - -',
          EMPTY, EMPTY,
          '. . . . . . D6 -',
          EMPTY),
        wind: join(EMPTY, EMPTY, EMPTY, EMPTY, hold('F6', 2), EMPTY, EMPTY),
      },
      // ---------------------------------------------------------------- D: Remembered
      D: {
        comment: 'Dm | Bb | Gm A7 | Dm',
        drone: hold('D2', 8),
        pad: { vel: 0.36, notes: join(
          hold('D3+A3+F4', 2),
          hold('F3+Bb3+D4', 2),
          hold('G3+Bb3+D4', 1),
          hold('A3+C#4+G4', 1),
          hold('D3+A3+D4+F4', 2)) },
        voice: join(                                 // bars 5-8 of the theme, twice as slow
          'A4 - - - D5 - - -',
          'E5 - F5 - E5 - - -',
          'D5 - - - - - C5 -',
          'Bb4 - - - A4 - - -',
          'G4 - - - Bb4 - A4 -',
          'F4 - - - E4 - - -',
          hold('D4', 2)),
        celesta: join(
          EMPTY, EMPTY,
          'D6 - - - - - - -',
          '. . . . A5 - - -',
          EMPTY, EMPTY, EMPTY, EMPTY),
        bell: join('D3 - - - - - - -', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY),
      },
    },
    order: ['A', 'B', 'C', 'D'],
  });
})();
