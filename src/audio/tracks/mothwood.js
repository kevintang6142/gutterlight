// src/audio/tracks/mothwood.js — "Lanterns for the Moths" (The Mothwood, exploration). Owner: music-mid.
//
// Eerie and enchanting. A slow 3/4 sway around an A drone. The harmony keeps slipping between A minor and
// the whole-tone scale (augmented triads, 7b5 chords): colours with no floor beneath them, like wings
// brushing the edge of a lantern. A solo violin sings a wandering tune (E-D-C-A: falling by whole steps,
// then a leap of a minor third), glass pads glow, a celesta twinkles and runs up and down the whole-tone
// scale (A B C# D# F G), a harp rocks arpeggios in the brighter section, and in the middle the harmony
// loses its tonal centre entirely and only the high violin and glass remain. At the end the key comes
// home (A minor - F - Dm - E7) and the last E7#5 pulls back to the beginning.
//
// Form (72 bpm, 3/4, 8th grid; intro once, then 6 x 8 bars = 48 bars = 2:00, loops):
//   intro  2 bars   glass swells, celesta drops
//   A  "Dusk"        drone, glass, twinkling celesta arp; the violin's tune (bars 1-8, quiet)
//   B  "Lanterns"    brighter: harp rocks, violin climbs a new tune, celesta whole-tone runs
//   C  "Mothwings"   no tonal centre: aug chords, high violin, choir hum, celesta fluttering
//   A2 "Dusk II"    the tune returns with a cello answer underneath and a denser celesta
//   B2 "Lanterns II" the second tune an octave up; harp, choir and strings
//   D  "Moonrise"    tonal and warm: Am - F - Dm - E7; violin and cello duet, strings; E7#5 leads home
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const E6 = '. . . . . .';
  const hold = (note, n) => bars(note + ' - - - - -', ...new Array(n - 1).fill('- - - - - -'));
  const bow = (s, every = 2) => s.split('|').map((b, i) => (i % every === 0 ? b.replace(/([A-G][#b]?\d)/, '$1^') : b)).join('|');
  const RUN_UP = 'A5 B5 C#6 D#6 F6 G6';
  const RUN_DN = 'A6 G6 F6 D#6 C#6 B5';

  // T1 (A, A2): chords Am | Aaug | Fmaj7 | Baug | Am | Dm/F | E7#5 | Aaug
  const T1 =
    'E5@58 - - D5 - C5 | C#5 - - - A4 - | A4@56 - - C5 - E5 | D#5 - - - B4 - |' +
    'E5@62 - - G5 - E5 | F5@64 - - E5 - D5 | G#4@58 - B4 - D5 - | C#5@54 - - - - -';
  // T2 (B, B2): chords Dm | Baug | Am/C | Aaug | Fmaj7 | E7#5 | Am | A7b5
  const T2 =
    'D5@62 - F5 - A5 - | G5@66 - - F5 - D#5 | E5@64 - - C5 - A4 | C#5 - - - F5 - |' +
    'A5@70 - - G5 - E5 | D5@64 - - B4 - G#4 | A4@60 - C5 - E5 - | G5@62 - - - - -';
  // T3 (C, no tonal centre): chords Aaug | Baug | Aaug | A7b5 | Baug | Aaug | A7b5 | E7#5
  const T3 =
    'A5@48 - - C#6 - - | D#6 - - - B5 - | F6@50 - - - C#6 - | G6 - - D#6 - C#6 |' +
    'B5@48 - D#6 - G6 - | F6 - - C#6 - A5 | G5@46 - - - - - | G#5@50 - - - B5 -';
  // T4 (D): chords Am | F | Dm | E7 | Am | Fmaj7 | Baug | E7#5
  const T4 =
    'E5@64 - - A5 - G5 | F5@62 - - - C5 - | D5@62 - F5 - A5 - | G#5@66 - - B5 - D6 |' +
    'C6@72 - - B5 - A5 | G5@64 - - F5 - E5 | D#5@60 - - G5 - B5 | C6@62 - - - G#5 -';
  const CELLO_D = 'A2@52 - - - E3 - | F2 - - - C3 - | D3 - - - F3 - | E3 - - - G#3 - | A3 - - - C4 - | F3 - - - A3 - | B2 - - - D#3 - | E3 - - G#3 - -';
  // A2: cello answer to T1, long notes
  const CELLO_A2 = 'A2@50 - - - - - | A2 - - - - - | F2 - - - - - | B2 - - - - - | A2 - - - - - | D3 - - - - - | E3 - - - - - | A2 - - - - -';

  G.Audio.defineTrack('mothwood', {
    title: 'Lanterns for the Moths', key: 'A minor / whole-tone',
    bpm: 72, meter: '3/4', grid: '8n',
    reverb: 0.5, volume: 1.4,
    humanize: { time: 0.01, vel: 0.06 },
    delay: { beats: 1.5, feedback: 0.35, tone: 3000, level: 0.7 },
    parts: {
      drone:   { inst: 'drone', vol: 0.5, reverb: 0.3, vel: 0.55, params: { attack: 2.5, release: 3 } },
      glass:   { inst: 'glass_pad', vol: 0.34, reverb: 0.6, chord: { style: 'pad', octave: 4, vel: 0.34, voices: 3 }, params: { attack: 1.4, release: 2.2 } },
      choir:   { inst: 'choir_oo', vol: 0.3, pan: -0.1, reverb: 0.65, chord: { style: 'pad', octave: 4, vel: 0.34, voices: 3 }, params: { attack: 1.8, release: 2.4 } },
      strings: { inst: 'strings', vol: 0.28, reverb: 0.55, chord: { style: 'pad', octave: 3, vel: 0.3, voices: 3 }, params: { attack: 1.6, release: 2.4, bright: 0.55 } },
      violin:  { inst: 'violin', vol: 0.72, pan: 0.1, reverb: 0.45, vel: 0.6, legato: true, delay: 0.15, params: { vibrato: 1.0, attack: 0.15, release: 0.8 } },
      cello:   { inst: 'cello', vol: 0.7, pan: -0.2, reverb: 0.45, vel: 0.55, legato: true },
      celesta: { inst: 'celesta', vol: 0.42, pan: 0.3, reverb: 0.5, vel: 0.42, delay: 0.5 },
      twinkle: { inst: 'celesta', vol: 0.34, pan: -0.3, reverb: 0.55, vel: 0.38, delay: 0.4, pedal: true,
                 chord: { style: 'arp', pattern: '. 0 . 2 . 1', octave: 5 } },
      harp:    { inst: 'harp', vol: 0.5, pan: -0.15, reverb: 0.5, vel: 0.46, pedal: true, delay: 0.25,
                 chord: { style: 'arp', pattern: 'b 0 1 2 1 0', octave: 3, bass: 2 } },
      riser:   { inst: 'noise_riser', vol: 0.26, reverb: 0.5, vel: 0.45, humanize: false },
    },
    sections: {
      // ------------------------------------------------------------------------ intro
      intro: {
        chords: 'Am | Aaug',
        drone: hold('A1', 2),
        glass: { style: 'pad', octave: 4, vel: 0.3, ramp: [0.5, 1] },
        celesta: bars('E6@36 . . . . .', '. . . C#6@32 . .'),
      },
      // ------------------------------------------------------------------------ A  Dusk
      A: {
        chords: 'Am | Aaug | Fmaj7 | Baug | Am | Dm/F | E7#5 | Aaug',
        drone: hold('A1', 8),
        glass: true,
        twinkle: true,
        violin: bow(T1),
        celesta: bars(E6, E6, E6, E6, E6, E6, E6, 'E6@34 . . . . .'),
      },
      // ------------------------------------------------------------------------ B  Lanterns
      B: {
        chords: 'Dm | Baug | Am/C | Aaug | Fmaj7 | E7#5 | Am | A7b5',
        drone: hold('A1', 8),
        glass: true,
        harp: true,
        violin: bow(T2),
        celesta: bars(E6, E6, E6, RUN_UP + '@44', E6, E6, E6, RUN_DN + '@42'),
        strings: { style: 'pad', octave: 3, vel: 0.26, ramp: [0.7, 1] },
        riser: bars(E6, E6, E6, E6, E6, E6, E6, 'C6 - - - - -'),
      },
      // ------------------------------------------------------------------------ C  Mothwings
      C: {
        chords: 'Aaug | Baug | Aaug | A7b5 | Baug | Aaug | A7b5 | E7#5',
        drone: bars(hold('A1', 7), hold('E1', 1)),
        glass: { style: 'pad', octave: 4, vel: 0.36, ramp: [0.9, 1.15] },
        choir: true,
        violin: { notes: bow(T3), vel: 0.5 },
        celesta: bars(E6, 'C#7@38 . . D#7@30 . .', E6, 'F6@36 D#6 C#6 B5 . .', E6, 'G6@38 . . D#6@30 . .', E6, RUN_DN + '@40'),
        twinkle: { style: 'arp', pattern: '2 . 0 . 1 .', octave: 5, vel: 0.3 },
      },
      // ------------------------------------------------------------------------ A2  Dusk II
      A2: {
        chords: 'Am | Aaug | Fmaj7 | Baug | Am | Dm/F | E7#5 | Aaug',
        drone: hold('A1', 8),
        glass: true,
        twinkle: { style: 'arp', pattern: '0 . 2 1 . 2', octave: 5 },
        violin: bow(T1),
        cello: CELLO_A2,
        celesta: bars(E6, E6, E6, E6, 'E6@34 . . . C6@30 .', E6, 'G#6@34 . B6@30 . . .', E6),
      },
      // ------------------------------------------------------------------------ B2  Lanterns II
      B2: {
        chords: 'Dm | Baug | Am/C | Aaug | Fmaj7 | E7#5 | Am | A7b5',
        drone: hold('A1', 8),
        glass: true,
        harp: true,
        choir: { style: 'pad', octave: 4, vel: 0.32, ramp: [0.8, 1.1] },
        strings: { style: 'pad', octave: 3, vel: 0.28, ramp: [0.8, 1.2] },
        violin: { notes: bow(T2), octave: 1, vel: 0.54 },
        cello: bars(hold('D3', 1), hold('D#3', 1), hold('C3', 1), hold('C#3', 1), hold('F3', 1), hold('G#2', 1), hold('A2', 1), 'G2@52 - - - - -'),
        celesta: bars(E6, E6, E6, RUN_UP + '@44', E6, E6, E6, RUN_DN + '@42'),
        riser: bars(E6, E6, E6, E6, E6, E6, E6, 'C6 - - - - -'),
      },
      // ------------------------------------------------------------------------ D  Moonrise
      D: {
        chords: 'Am | F | Dm | E7 | Am | Fmaj7 | Baug | E7#5',
        drone: hold('A1', 8),
        glass: true,
        strings: { style: 'pad', octave: 3, vel: 0.32, ramp: [0.8, 1.2] },
        harp: { style: 'arp', pattern: 'b 0 1 2 1 0', octave: 3, bass: 2, vel: 0.4 },
        violin: bow(T4),
        cello: CELLO_D,
        celesta: bars(E6, E6, E6, E6, E6, E6, E6, 'B6@34 . G#6@30 . E6@30 .'),
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'C', 'A2', 'B2', 'D'],
  });
})();
