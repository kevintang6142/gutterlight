// src/audio/tracks/nave.js — "Rain on the Nave" (The Drowned Nave, exploration). Owner: music-mid.
//
// Sacred, sorrowful, wet. A ruined cathedral where rain still falls through the vault. A pipe organ holds
// G minor under a slow bell (a funeral toll on the downbeats), a hushed "oo" choir hums the harmony, and
// scattered high ticks and celesta drops are the rain. A single "ah" choir line (the Lament) sings over it;
// the middle of the piece lifts to Bb major like light through a rose window, then the organ falls silent and
// only rain, a lone piano and the distant choir remain. The Lament returns with a violin descant above it.
//
// Form (60 bpm, 4/4, 8th grid, 16th grid for the rain; intro once, then 5 x 8 bars = 40 bars = 2:40, loops):
//   intro  2 bars   rain begins, the first toll
//   A  "Vigil"       organ + bell + humming choir; the Lament is only hinted (bars 5-8, "oo")
//   B  "Lament"      the choir sings the tune in G minor
//   C  "Window"      Bb major: higher, brighter; strings swell, the bell rings every bar
//   D  "Rain"        organ gone: rain, a lone piano, celesta drops, distant "oo" choir
//   B2 "Lament II"   full: the tune again, with a violin descant; ends on D major which leads back to A
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  const bars = (...b) => b.join(' | ');
  const E8 = '. . . . . . . .';
  const E16 = '. . . . . . . . . . . . . . . .';
  const hold = (note, n) => bars(note + ' - - - - - - -', ...new Array(n - 1).fill('- - - - - - - -'));
  const bow = (s, every = 2) => s.split('|').map((b, i) => (i % every === 0 ? b.replace(/([A-G][#b]?\d)/, '$1^') : b)).join('|');

  // Rain: deterministic scattered drops on a 16th grid (the same every play). density = chance per step.
  const rain = (n, density, seed, lo = 40, hi = 62) => {
    let s = seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const pitches = ['C6', 'D6', 'Eb6', 'F6', 'G6', 'Bb6', 'C7', 'D7'];
    const out = [];
    for (let b = 0; b < n; b++) {
      const steps = [];
      for (let i = 0; i < 16; i++) {
        if (rnd() < density) {
          const p = pitches[Math.floor(rnd() * pitches.length)];
          const v = Math.round(lo + rnd() * (hi - lo));
          steps.push(p + '@' + v);
        } else steps.push('.');
      }
      out.push(steps.join(' '));
    }
    return out.join(' | ');
  };

  // ---- the Lament (G minor), one bar per '|'; chords Gm | Eb | Cm | D | Gm | Bb Eb | Cm D | Gm D
  const LAMENT =
    'D5@62 - - - Bb4 - A4 - | G4 - - - - - Bb4 - | C5 - - - Eb5@68 - D5 - | C5 - - - A4 - F#4@58 - |' +
    'Bb4@60 - - - D5 - - Eb5@66 | F5@70 - - - G5! - Eb5 - | Eb5 - D5 - C5 - A4 - | Bb4@60 - - - A4@54 - - -';
  // Window (Bb major), chords Bb | F/A | Gm | Eb | Cm7 | Gm/Bb | Eb | D7sus4 D7
  const WINDOW =
    'D5@66 - - - F5 - - - | C5 - - - F5 - E5 F5 | G5@72 - - - D5 - Bb4 - | Eb5 - G5 - Bb5@76 - - - |' +
    'G5@70 - - - Eb5 - C5 - | Bb4 - D5 - G5! - - F5 | Eb5@66 - - - Bb4 - - - | A4@60 - - - - - F#4@56 - ';
  // Rain piano (D): the Lament's shape, alone. Chords Cm | Gm/Bb | Eb | Bb/D | Cm | Fm/Ab | D | D7
  const PIANO_D =
    'Eb5@52 - - - D5 - C5 - | Bb4 - - - D5 - - - | Eb5@54 - - - Bb4 - G4 - | F4 - - - D4 - F4 - |' +
    'Eb5@56 - G5 - F5 - Eb5 - | C5 - - - Ab4 - C5 - | A4@52 - - - F#4 - A4 - | C5@50 - - - A4 - - -';

  G.Audio.defineTrack('nave', {
    title: 'Rain on the Nave', key: 'G minor',
    bpm: 60, meter: '4/4', grid: '8n',
    reverb: 0.6, volume: 1.4,
    humanize: { time: 0.012, vel: 0.06 },
    delay: { beats: 1.5, feedback: 0.35, tone: 2600, level: 0.6 },
    parts: {
      organ:    { inst: 'organ', vol: 0.5, reverb: 0.55, vel: 0.45, chord: { style: 'pad', octave: 3, vel: 0.42, voices: 3 }, params: { attack: 0.6, release: 1.6 } },
      pedal:    { inst: 'organ', vol: 0.55, reverb: 0.35, vel: 0.5, chord: { style: 'bass', octave: 2, rhythm: '1 - - - - - - -' }, params: { attack: 0.5, release: 1.5 } },
      hum:      { inst: 'choir_oo', vol: 0.42, pan: -0.1, reverb: 0.65, vel: 0.4, chord: { style: 'pad', octave: 4, vel: 0.4, voices: 3, voicing: 'root' }, params: { attack: 1.6, release: 2.4 } },
      lament:   { inst: 'choir', vol: 0.62, pan: 0.05, reverb: 0.62, vel: 0.58, legato: true, glide: 0.08, params: { attack: 0.5, release: 1.4 } },
      ghost:    { inst: 'choir_oo', vol: 0.5, pan: 0.2, reverb: 0.7, vel: 0.46, legato: true, glide: 0.08, params: { attack: 0.8, release: 2.2 } },
      bell:     { inst: 'bell', vol: 0.55, pan: -0.15, reverb: 0.6, vel: 0.6, delay: 0.2 },
      strings:  { inst: 'strings', vol: 0.3, reverb: 0.6, chord: { style: 'pad', octave: 3, vel: 0.32, voices: 3 }, params: { attack: 1.8, release: 2.6, bright: 0.55 } },
      violin:   { inst: 'violin', vol: 0.5, pan: 0.25, reverb: 0.55, vel: 0.5, legato: true, params: { attack: 0.3, release: 1.0, vibrato: 1.1 } },
      piano:    { inst: 'felt_piano', vol: 0.8, pan: 0.1, reverb: 0.55, vel: 0.5, delay: 0.1 },
      rain:     { inst: 'tick', vol: 0.45, pan: 0.35, reverb: 0.45, vel: 0.4, grid: '16n', humanize: false },
      rain2:    { inst: 'tick', vol: 0.4, pan: -0.45, reverb: 0.5, vel: 0.4, grid: '16n', humanize: false },
      celesta:  { inst: 'celesta', vol: 0.4, pan: 0.3, reverb: 0.6, vel: 0.4, delay: 0.5 },
    },
    sections: {
      // ------------------------------------------------------------------------ intro
      intro: {
        chords: 'Gm | Gm',
        rain: rain(2, 0.1, 11),
        rain2: rain(2, 0.08, 12),
        bell: bars('G3@58 - - - - - - -', E8),
        hum: { style: 'pad', octave: 4, vel: 0.3, ramp: [0.5, 1] },
        pedal: hold('G2', 2),
      },
      // ------------------------------------------------------------------------ A  Vigil
      A: {
        chords: 'Gm | Eb | Cm | D | Gm | Eb | Cm | D',
        organ: true,
        pedal: { style: 'bass', octave: 2, rhythm: '1 - - - - - - -' },
        hum: true,
        bell: bars('G3 - - - - - - -', E8, 'C3@54 - - - - - - -', E8, 'G3 - - - - - - -', E8, 'C3@54 - - - - - - -', 'D3@58 - - - - - - -'),
        ghost: bars(E8, E8, E8, E8, 'Bb4@44 - - - D5 - - Eb5', 'F5@48 - - - G5 - Eb5 -', 'Eb5 - D5 - C5 - A4 -', 'Bb4@44 - - - A4@40 - - -'),
        rain: rain(8, 0.14, 21),
        rain2: rain(8, 0.1, 22),
        celesta: bars(E8, E8, E8, 'D6@40 . . . . . . .', E8, E8, E8, '. . . . G6@38 . . .'),
      },
      // ------------------------------------------------------------------------ B  Lament
      B: {
        chords: 'Gm | Eb | Cm | D | Gm | Bb Eb | Cm D | Gm D',
        organ: true,
        pedal: { style: 'bass', octave: 2, rhythm: '1 - - - - - - -' },
        hum: { style: 'pad', octave: 4, vel: 0.36 },
        lament: bow(LAMENT),
        bell: bars('G3 - - - - - - -', E8, 'C3@54 - - - - - - -', E8, 'G3 - - - - - - -', E8, 'C3@54 - - - D3@58 - - -', E8),
        rain: rain(8, 0.16, 31),
        rain2: rain(8, 0.12, 32),
        celesta: bars(E8, E8, E8, E8, E8, E8, E8, 'G6@38 . . . . . . .'),
      },
      // ------------------------------------------------------------------------ C  Window
      C: {
        chords: 'Bb | F/A | Gm | Eb | Cm7 | Gm/Bb | Eb | D7sus4 D7',
        organ: { style: 'pad', octave: 3, vel: 0.46, voices: 3 },
        pedal: { style: 'bass', octave: 2, rhythm: '1 - - - 5 - - -' },
        hum: { style: 'pad', octave: 4, vel: 0.36 },
        strings: { style: 'pad', octave: 3, vel: 0.34, ramp: [0.7, 1.3] },
        lament: bow(WINDOW),
        bell: bars('Bb3 - - - - - - -', 'F4@50 - - - - - - -', 'G3 - - - - - - -', 'Eb4@54 - - - - - - -', 'C4 - - - - - - -', 'G3@54 - - - - - - -', 'Eb4@56 - - - - - - -', 'D3@62 - - - D4@50 - - -'),
        rain: rain(8, 0.08, 41, 32, 50),
        rain2: rain(8, 0.06, 42, 32, 50),
        celesta: bars('F6@40 . . . . . . .', E8, 'D6@38 . . . . . . .', E8, 'Bb6@40 . . . . . . .', E8, 'G6@38 . . . . . . .', 'A6@42 . . . . . . .'),
      },
      // ------------------------------------------------------------------------ D  Rain
      D: {
        chords: 'Cm | Gm/Bb | Eb | Bb/D | Cm | Fm/Ab | D | D7',
        pedal: { style: 'bass', octave: 2, rhythm: '1 - - - - - - -', vel: 0.38 },
        hum: { style: 'pad', octave: 4, vel: 0.32, voices: 3, chords: 'Cm | Gm | Eb | Bb | Cm | Fm | D | D' },
        piano: PIANO_D,
        ghost: bars(E8, E8, E8, E8, E8, 'C5@40 - - - - - - -', E8, 'F#4@38 - - - - - - -'),
        bell: bars(E8, 'G3@46 - - - - - - -', E8, 'D4@46 - - - - - - -', E8, 'Ab3@46 - - - - - - -', E8, 'D3@52 - - - - - - -'),
        rain: rain(8, 0.3, 51, 42, 70),
        rain2: rain(8, 0.26, 52, 40, 66),
        celesta: bars('G6@46 . . . . . . D7@38', E8, 'Bb6@44 . . . . . . .', E8, 'C7@46 . . . G6@40 . . .', E8, 'A6@44 . . . . . . .', 'F#6@42 . . . . . . .'),
      },
      // ------------------------------------------------------------------------ B2  Lament II
      B2: {
        chords: 'Gm | Eb | Cm | D | Gm | Bb Eb | Cm D | Gm D',
        organ: { style: 'pad', octave: 3, vel: 0.46, voices: 3 },
        pedal: { style: 'bass', octave: 2, rhythm: '1 - - - 5 - - -' },
        hum: { style: 'pad', octave: 4, vel: 0.38 },
        strings: { style: 'pad', octave: 3, vel: 0.3, ramp: [0.8, 1.2] },
        lament: bow(LAMENT),
        violin: { notes: bars(E8, E8, E8, E8, 'Bb5@50 - - - D6 - - Eb6', 'F6@56 - - - G6 - Eb6 -', 'Eb6 - D6 - C6 - A5 -', 'D6@52 - - - - - - -'), octave: 0 },
        bell: bars('G3 - - - - - - -', 'Eb4@52 - - - - - - -', 'C3@58 - - - - - - -', 'D3@58 - - - - - - -', 'G3 - - - - - - -', 'Bb3@52 - - - Eb4@52 - - -', 'C3@58 - - - D3@62 - - -', 'G3 - - - D3@62 - - -'),
        rain: rain(8, 0.14, 61),
        rain2: rain(8, 0.1, 62),
        celesta: bars(E8, E8, E8, E8, E8, E8, E8, '. . . . D6@40 . . .'),
      },
    },
    intro: ['intro'],
    order: ['A', 'B', 'C', 'D', 'B2'],
  });
})();
