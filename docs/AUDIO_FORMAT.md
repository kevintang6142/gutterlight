# GUTTERLIGHT — Music Track Format

How to write a music track for `G.Audio`. Every track is one file `src/audio/tracks/<id>.js` that
calls `G.Audio.defineTrack(id, data)` once. The data is validated when the file loads: mistakes are
printed as `[audio] track '<id>' > section 'A' > part 'lead': bar 3: expected 8 steps, got 7 (...)`
console errors, and `tools/audio_check.js` fails on them.

The reference track is **`src/audio/tracks/title.js`** — read it first; it uses nearly every feature
below in a real arrangement. Engine API (sfx, ambience, stingers, runtime calls): `docs/api/audio.md`.

Contents: 1 Template · 2 Track options · 3 Parts · 4 Sections & arrangement · 5 Note strings ·
6 Chord parts (harmony shorthand) · 7 Dynamics & feel · 8 Intensity layers · 9 Instruments ·
10 Mixing guidance · 11 Testing · 12 Complete examples · 13 Checklist

---

## 1. File template

```js
// src/audio/tracks/guttered.js — The Guttered Ways (exploration). Owner: <composer>.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineTrack) return;

  G.Audio.defineTrack('guttered', {
    title: 'The Guttered Ways', key: 'D minor',      // informational
    bpm: 70, meter: '4/4', grid: '8n',               // grid: 8n = 8 steps per 4/4 bar
    parts: {
      piano: { inst: 'felt_piano', vol: 0.9 },
      pad:   { inst: 'strings', vol: 0.4, chord: { style: 'pad', octave: 4 } },
    },
    sections: {
      A: {
        chords: 'Dm | Bb | Gm | A7',
        piano: 'A4 - D5 - C5 A4 F4 - | G4 - - A4 Bb4 - A4 - | F4 - E4 F4 D4 - - - | E4 - - - C#4 - - -',
        pad: true,                                    // play the section's chords with the part's chord defaults
      },
    },
    order: ['A'],                                     // loops forever (loop: true is the default)
  });
})();
```
Rules: classic script (no `import`), no DOM access, no other globals. Use `const` strings to reuse
phrases (see `THEME` in title.js). Only `G.Audio.defineTrack` is called — nothing runs at play time.

---

## 2. Track options

| Key | Type / default | Meaning |
|---|---|---|
| `bpm` | number 20..320, **required** | Quarter-note tempo. Sections may override. |
| `meter` | `'4/4'` (or `[3,4]`, `'6/8'`, `'5/4'`…) | Time signature: `beats/unit`, unit ∈ 1 2 4 8 16. Sections may override. |
| `grid` | `'8n'` (= 2) | Step length of note strings: `'4n'`=1, `'8n'`=2, `'8t'`=3 (8th triplets), `'16n'`=4, `'16t'`=6, `'32n'`=8 steps per quarter (or that number). Steps per bar = quarters per bar × grid; it must be whole (e.g. 5/8 with `'4n'` = 2.5 steps is an error; 6/8 with `'8n'` = 6 steps is fine). |
| `swing` | 0..0.75, 0 | Delays every odd step by this fraction of a step (needs an even grid). |
| `humanize` | `{ time: 0.008, vel: 0.06 }` | Deterministic random timing delay (s, ≤ 0.05) and ± velocity fraction (≤ 0.5). `false` = robotic. Same output every play. |
| `parts` | object, **required** | Instrument channels (§3). |
| `sections` | object, **required** | Named blocks of music (§4). |
| `order` | array of section names, **required** | Arrangement of the looping body. Sections may repeat: `['A','A','B','A']`. |
| `intro` | array of section names | Played once before `order` (not repeated by the loop). |
| `loop` | `true` | `false` = play intro + order once, then stop (endings, cues). |
| `tail` | seconds 0..30, 4 | Non-looping tracks: time after the last bar for notes and reverb to ring out. |
| `volume` | 0..4, 1 | Track gain. Use it to hit the loudness target (§10). |
| `reverb` | 0..1, 0.3 | Default reverb send for every part (the global dark hall, ~2.9 s RT60). |
| `delay` | `{ beats: 0.75, feedback: 0.35, tone: 3200, level: 1 }` | Optional stereo ping-pong echo for this track; parts opt in with `delay: <send>`. `beats` in quarter notes (0.75 = dotted 8th), `tone` = low-pass Hz on the repeats. |
| `layerFade` | seconds, 2 | Fade time of intensity layers (§8). |
| `duck` | 0..1, 0.65 | Only for stingers: how far other music ducks while it plays. |
| `title`, `key`, `comment` | string | Informational. |

Unknown keys are reported as warnings with a "did you mean" hint (typos never silently pass).

---

## 3. Parts

```js
parts: {
  lead:  { inst: 'cello', vol: 0.6, pan: -0.2, legato: true, reverb: 0.4 },
  arp:   { inst: 'harp', vol: 0.5, pan: 0.3, delay: 0.3, pedal: true,
           chord: { style: 'arp', pattern: 'up', octave: 4 } },
  drums: { inst: 'low_drum', vol: 0.7, humanize: false, layer: 0.5 },
}
```

| Key | Default | Meaning |
|---|---|---|
| `inst` | **required** | Instrument name (§9). |
| `vol` | 0.7 | Fader 0..2 (linear). |
| `pan` | 0 | −1 (left) .. 1 (right). Many instruments also spread notes across the stereo field by pitch. |
| `reverb` | track `reverb` | Reverb send 0..1. Pads/choir/bells 0.45–0.7; bass, drums 0.1–0.25. |
| `delay` | 0 | Send into the track `delay` (only if the track defines one). |
| `octave` | 0 | Shift every note of this part by whole octaves (−4..4). |
| `transpose` | 0 | Shift every note by semitones (−36..36). |
| `vel` | 0.75 (chord pads 0.6) | Default velocity 0.05..1 for notes without a marker. |
| `legato` | false | Adjacent single notes glide into each other on one voice (strings, flute, choir leads). New articulation on accents `!`, re-bows `^`, repeated pitches and after rests. |
| `glide` | instrument default (~0.03–0.06 s) | Portamento time for legato/slurred notes. |
| `gate` | 1 | Multiplies every note duration (0.5 = detached). |
| `pedal` | false | `true`/`'chord'`: every note rings until the chord changes (needs section `chords`; else to the bar end). `'bar'`: rings to the bar end. Piano, harp, music box. |
| `params` | — | Instrument parameter overrides, e.g. `{ attack: 0.8, release: 2, bright: 0.7 }` (§9). |
| `grid`, `swing`, `humanize` | track values | Per-part overrides (e.g. a `'16n'` arp in an `'8n'` track). |
| `chord` | — | Defaults for chord parts (§6); lets sections say just `part: true`. |
| `chordOctave` | 4 | Register for `[Chord]` tokens inside note strings (§5). |
| `layer`, `layerMax` | 0, 2 | Intensity layer window (§8). |

---

## 4. Sections & arrangement

```js
sections: {
  A: { chords: 'Dm | Bb | Gm | A7', piano: '...', pad: true },
  B: { bpm: 76, meter: '3/4', transpose: 2, lead: '...', bass: '...' },
  rest: { bars: 2 },                       // two silent bars
},
intro: ['rest'],
order: ['A', 'A', 'B'],
```
- A section's keys are part names plus: `chords` (progression, §6), `bars` (explicit length —
  needed only when nothing else defines it), `bpm`, `meter`, `transpose` (semitones for all parts),
  `comment`.
- Parts not mentioned in a section are silent there. A part value is a **note string**, a
  **note object** `{ notes: '...', vel, octave, ... }`, a **chord object** `{ style, pattern, ... }`,
  `true` (chord part with the part's `chord` defaults) or `null`.
- **Every part (and `chords`) of a section must have the same number of bars.** Mismatches are errors.
- Notes ring past the end of a section into the next one (natural decays/releases); timing is exact.
- The loop is seamless: the bar after the last section of `order` is the first bar of `order`
  (the intro is not repeated). Write the last bar so it leads back to the first (e.g. end on the
  dominant, or let a held chord resolve).
- `loop: false` tracks stop after the last section; `tail` seconds later the player is released.

---

## 5. Note strings (tracker-style steps)

One token per grid step, separated by spaces; bars are separated by `|`. With `grid: '8n'` in 4/4
every bar has 8 tokens.

```
'A4 - D5 - C5 A4 F4 - | G4 - - A4 Bb4 - A4 - | D4 | % | . | C4+E4+G4 - - - [Am7] - - -'
```

| Token | Meaning |
|---|---|
| `A4`, `F#3`, `Bb5`, `C##4`, `Ebb3` | A note (scientific pitch: C4 = middle C = MIDI 60; octave −1..9). |
| `-` | Hold: the previous note lasts one more step (also across bar lines). |
| `.` | Rest (also ends the previous note). |
| `C4+E4+G4` | Several notes at once (a written chord). |
| `[Dm7]`, `[Gm/Bb]` | A chord symbol, voiced automatically near octave `chordOctave` (part or note object, default 4) with smooth voice-leading. |
| `x` / `X` | A hit on the instrument's default note (drums; `X` = accented). |
| `%` (whole bar) | Repeat the previous bar. |
| one token in a bar | Fills the whole bar: `D3` = D3 held for the bar, `.` = rest bar, `[Dm]` = chord held for the bar. |

**Modifiers** follow the note (any order): `!` accent (+0.15 velocity, harder/brighter attack),
`'` staccato (short), `?` ghost (×0.55 velocity), `~` slur (glide from the previous note even
without `legato`), `^` re-articulate (new bow/breath in a legato line; no glide), `@NN` velocity in
percent 1..100 (replaces the part velocity). Example: `D5!@80`, `A4'`, `F4~`, `G4^`, `x?`.

**Note object** (instead of a plain string): `{ notes, vel, octave, transpose, grid, swing, gate,
pedal, ramp: [fromMul, toMul], chordOctave, humanize }`. `octave`/`transpose` add to the part's
values. `ramp` multiplies velocities from the first to the last bar (crescendo `[0.6, 1.1]`).

A `-` at the very start of a section holds nothing (warning) — notes do not tie across sections;
write the note again.

---

## 6. Chord parts (harmony shorthand)

Write the progression once on the section and let pads, arpeggios and basses follow it.

```js
A: {
  chords: 'Dm | Gm/Bb | Dm/A A7 | Bbmaj7 - C - | Dm',    // one bar per '|'
  pad:  { style: 'pad', octave: 4 },
  arp:  { style: 'arp', pattern: 'b 0 1 2 - 1 0 -', octave: 3, bass: 2, pedal: true },
  bass: { style: 'bass', rhythm: '1 - - 5 8 - 5 -' },
}
```

**Progression syntax** — tokens in a bar split it evenly: `Dm` = whole bar, `Gm A7` = two halves,
`Bbmaj7 - C -` = four beats (Bbmaj7 for 2, C for 2), `-` extends the previous chord, `.` = no
chord (silence for chord parts), `%` = repeat the previous bar. A part may also carry its own
`chords` string (same bar count as the section).

**Chord symbols**: root `A`–`G` with optional `#`/`b`, then a quality, optionally `/bass`:
`C Cmaj CM` major · `m min` minor · `dim o` · `aug +` · `sus2 sus4 sus` · `5` (power) ·
`6 m6 7 maj7 M7 m7 min7 mM7 mmaj7 dim7 o7 m7b5 ø ø7 7sus4 7sus 7sus2 aug7 7#5 +7 7b5` ·
`add9 madd9 add2 madd2 9 maj9 m9 6/9 69 m6/9 m69 7b9 7#9 11 m11 13 maj13`. Slash bass:
`Gm/Bb`, `C/E`, `F/A`, `D/C` (bass outside the chord is added below).

| Chord-part key | Default | Meaning |
|---|---|---|
| `style` | `'pad'` | `pad`: sustained chords; notes common to consecutive chords are tied (no re-attack; `hold: false` re-strikes). `block`: one strike per chord (or per `rhythm` hit). `strum`: like block with the notes rolled (`strum` s apart, negative = downward). `arp`: one note per step from `pattern`. `bass`: bass line from `rhythm`. |
| `octave` | 4 (`bass` style: 2) | Register of the voicing (lowest voice near this octave). |
| `voicing` | `'close'` | `close`: compact, voice-led from chord to chord (avoids semitone clusters). `open`/`spread`: alternate voices raised an octave (wider, orchestral). `root`: root position stacked from the root. |
| `voices` | all | Max notes per chord (drops the 5th first, then the root when `bass` plays it, then the highest extension). |
| `lead` | true | `false` disables voice-leading (root position every chord). |
| `bass` | off | `true` adds the bass note (root or slash bass) an octave below `octave`; a number sets its octave. |
| `pattern` (arp) | **required for arp** | Named: `up down updown downup alberti random` (+ `span: 1..4` octaves), or tokens per step: `0 1 2 3…` chord tone from the bottom (indices ≥ chord size continue an octave higher), `b` bass note, `x` whole chord, `-` let the note ring, `.` silence, suffix `!` accent. Repeats every bar (`reset: 'chord'` restarts it at each chord change). |
| `rhythm` (block/strum/bass) | one hit per chord | Tokens per step: `x` hit (`X`/`x!` accented), `-` hold, `.` silence; bass style also takes degrees `1 3 5 7 8` (root, third, fifth, seventh, octave above the bass) and `b`. |
| `strum` | 0 (strum style 0.03) | Seconds between rolled notes (−0.2..0.2). |
| `pedal` | part `pedal` | Notes ring until the chord changes. |
| `grid`, `vel`, `transpose`, `swing`, `gate`, `ramp`, `humanize` | as note objects | |

Arpeggio steps that fall between beats are played at 90% velocity automatically; `!`/`X` accents add 0.15.

---

## 7. Dynamics & feel

- Velocity (0..1) shapes loudness *and* tone (filters open, attacks sharpen). Typical: pp 0.3,
  p 0.45, mp 0.6, mf 0.72, f 0.85, ff 1.
- Phrase with `@NN` on phrase starts/peaks, `!` on climaxes, `?` for ghost notes, and `ramp` for
  crescendos over a section.
- `humanize` is on by default (8 ms, ±6%). Turn it off for drums that must lock (`humanize: false`)
  or raise it for rubato piano (`{ time: 0.015, vel: 0.08 }`).
- Legato lines: set `legato: true` on cello/violin/flute/choir leads; mark breaths/bow changes with
  `^` every 1–2 bars, otherwise a phrase is one continuous bow.
- Piano, harp and music box sound best with `pedal: true` on chord/arp parts and no pedal on the
  melody (so passing notes don't blur).

---

## 8. Intensity layers (`G.Audio.musicLayer(level)`)

The game calls `G.Audio.musicLayer(level)` with 0..1 (e.g. boss phase 2 → 1). A part is audible
while `layer <= level < layerMax` and fades in/out over the track's `layerFade` seconds. Parts
without `layer` are always on. Every part keeps playing in sync (only its gain changes), so layers
can enter and leave anywhere.

```js
parts: {
  strings: { inst: 'strings', vol: 0.4 },                       // always
  calm:    { inst: 'flute', vol: 0.5, layerMax: 0.5 },          // only below 0.5
  drums:   { inst: 'low_drum', vol: 0.7, layer: 0.5 },          // from 0.5 up
  brass:   { inst: 'brass', vol: 0.5, layer: 1 },               // only at full intensity
},
```
Starting a new track resets the level to 0 unless `G.Audio.music(id, { layer })` says otherwise.

---

## 9. Instruments

`range` = comfortable range (notes outside produce a validation warning). "Loud" = single-note
loudness at velocity 0.8 relative to `felt_piano` (positive = louder) — compensate with part `vol`.
Common `params`: `attack`, `release` (s), `bright` (filter multiplier, 0.5 dark .. 1.5 bright),
`gain`; leads also `vibrato` (depth multiplier, 0 = none) and `breath` (bow/air noise multiplier);
choir `vowel` (0 = "ah" .. 1 = "oo").

| Instrument | Range | Loud | Character / suggested use | Params |
|---|---|---|---|---|
| `felt_piano` | A0–C8 | 0 | Soft felt piano, warm, long decay. Melodies, broken chords. The leitmotif's home. | release, bright, attack |
| `music_box` | C4–C8 | +3 | Tiny bright comb tines, ~2 s ring. Lastlight's lullaby, memories. | release |
| `celesta` | C4–C8 | +2 | Struck steel bars, soft sparkle. Sparse high answers, doubling. | release, bright |
| `bell` | C2–C6 | +1 | Large church bell (hum/tierce/nominal), very long ring. Nave, the Abbot, tolls on downbeats. | release |
| `harp` | C2–C7 | +1 | Concert harp pluck, round. Arpeggios (Meltbloom), glissandi via fast arps. | release, bright |
| `pluck_bass` | E1–G3 | +3 | Plucked upright bass, soft thump. Ostinatos (Chandlery), walking lines. | release, bright |
| `timpani` | C2–C4 | +2 | Tuned kettle drum. Downbeats, rolls (`16n` repeated notes), boss builds. | release |
| `low_drum` | C1–C3 | +7 | Taiko-like boom. Boss pulse, war drums. Use `x`. | — |
| `frame_drum` | C2–C4 | +4 | Hand drum: thump + skin slap. Flue/forge grooves. | — |
| `snare_brush` | C3–C5 | −1 | Brushed snare swish. Soft time-keeping. | — |
| `tick` | C5–C8 | −7 | Tiny wooden/clock tick. Pulses, clockwork. | — |
| `anvil` | C4–C7 | −1 | Struck metal: clang + ring. Chandlery rhythm, accents. | — |
| `cymbal` | C3–C6 | +1 | Suspended cymbal mallet hit, long wash. Section starts. | — |
| `cymbal_swell` | C3–C6 | +2 | Reverse cymbal rising over the note length, cut at its end. Hold it for the bar *before* a climax. | release |
| `noise_riser` | C5–C8 | +1 | Filtered noise sweep upward over the note length. Builds, transitions. | release |
| `strings` | C2–C7 | +3 | String ensemble pad (4 detuned saws, chorus). Pads, basses (`style: 'bass'`), swells. | attack, release, bright |
| `cello` | C2–A5 | −2 | Solo cello, warm, delayed vibrato. Legato leads, countermelodies. | attack, release, vibrato, bright, breath |
| `violin` | G3–E7 | 0 | Solo violin, singing. Sable's rival motif, high descants. | attack, release, vibrato, bright, breath |
| `choir` | C3–C6 | +4 | Choir "ah" (formant voices). Sanctum, Keepers, sacred moments. | attack, release, vowel, vibrato |
| `choir_oo` | C3–C6 | +5 | Choir "oo": darker, hushed. Grief, mystery, distant voices. | attack, release, vowel, vibrato |
| `organ` | C2–C7 | +2 | Soft pipe organ (flue stops + 16'). Nave, Lucerne's court. | attack, release |
| `flute` | C4–C7 | +1 | Breathy wooden flute, gentle vibrato. Meltbloom melodies. | attack, release, vibrato, breath |
| `warm_pad` | C2–C6 | 0 | Warm dark analog pad, slow swell. Beds, Lastlight warmth. | attack, release, bright |
| `glass_pad` | C3–C7 | +3 | Hollow shimmering glass. Rime, Mothwood, the Sanctum's crystal. | attack, release, bright |
| `brass` | E1–F4 | +2 | Low horns/trombones swell, rises with velocity. Boss weight, Keepers. | attack, release, vibrato, bright |
| `sub_bass` | C0–C3 | −2* | Clean sine sub. Foundation under boss/forge tracks (*mostly felt, not heard). | attack, release |
| `drone` | C1–C4 | −3 | Evolving saw drone with wandering filter, 2.5 s attack. Flue, Rime, tension beds. | attack, release, bright |

`G.Audio.instruments()` returns this list at runtime (ranges, defaults, descriptions, params).

---

## 10. Mixing guidance

- **Target loudness:** music RMS about **−18 dBFS** (accepted −22..−14; `audio_check` reports it;
  ≈ −16 LUFS). Quiet exploration tracks may sit at −20, boss tracks at −16. Peaks must stay
  ≤ −1 dBFS (the master has a gentle compressor and soft limiter, but don't lean on them).
- Set relative balance with part `vol`, then hit the target with the track `volume`. A typical
  title-like arrangement (piano + pad + bass + lead) lands near −18 with `volume` 1–1.5.
- Leave space: melancholy lives in the gaps. One lead at a time; pads at `vol` 0.3–0.45 and
  velocity 0.3–0.5; celesta/bells sparse.
- Low end: one bass voice (basses *or* `pluck_bass` *or* `sub_bass`), roots in octave 1–2. Keep
  pads above C3, arpeggios above the bass.
- Reverb: the hall is shared and dark. Pads/choir/bells 0.45–0.7, leads 0.3–0.45, bass/drums
  0.1–0.25. Delay sends only on sparse plucks/bells.
- Sound effects are mixed to sit over music at this level; ambience beds sit ~10 dB under it.
  Stingers (`G.Audio.stinger`) duck the music automatically.

---

## 11. Testing a track

```bash
node tools/audio_check.js --only tracks --id guttered            # validate + render intro+loop, print levels
node tools/audio_check.js --only tracks --id guttered --wav       # also write test-output/audio/tracks_guttered.wav
node tools/audio_check.js --only tracks --id guttered --loops 2  # render the loop twice (listen to the seam)
node tools/audio_check.js --only tracks --id lucerne --layer 1   # render at full intensity
node tools/audio_check.js --only tracks --id guttered --seconds 30 --png   # quick 30 s render + spectrogram
node tools/audio_check.js                                        # everything (run before you finish)
```
Output columns: duration, sample peak (dBFS), RMS (dBFS), active RMS, LUFS, loudest 100 ms, and the
non-silent span. A line starting with `FAIL` explains what is wrong (validation errors, NaN,
silence, peak > −1 dBFS, RMS outside −22..−14, a silent loop seam). Validation warnings (unknown
keys, notes outside an instrument's range, unused sections) are printed under the summary — fix them.

In the browser (game or `tools/audio_lab.html`), after any key press:
`G.Audio.music('guttered')`, `G.Audio.musicLayer(1)`, `G.Audio.music(null)`,
`G.Audio.validateTrack('x', data)` (returns `{ ok, errors, warnings }` without registering),
`G.Audio.getTrack('guttered').body.timeline` (section start times in seconds).

---

## 12. Complete examples

All examples below validate cleanly (`G.Audio.validateTrack`) — copy them as starting points.

### 12.1 Exploration loop in 3/4 with intro, arpeggio and pad
```js
G.Audio.defineTrack('lastlight', {
  bpm: 66, meter: '3/4', grid: '8n',                       // 6 steps per bar
  reverb: 0.45, delay: { beats: 1.5, feedback: 0.25, tone: 2800 },
  parts: {
    box:  { inst: 'music_box', vol: 0.6, delay: 0.25 },
    harp: { inst: 'harp', vol: 0.5, pedal: true,
            chord: { style: 'arp', pattern: 'b 0 1 2 1 0', octave: 3, bass: 2 } },
    pad:  { inst: 'warm_pad', vol: 0.35, chord: { style: 'pad', octave: 3 } },
  },
  sections: {
    intro: { chords: 'Dm | Dm', pad: true },
    A: {
      chords: 'Dm | Gm | Bb | A7',
      box: 'A5 - D6 - C6 A5 | G5 - - A5 Bb5 - | F5 - E5 F5 D5 - | E5 - - - C#5 -',
      harp: true, pad: true,
    },
    B: {
      chords: 'Bb | F/A | Gm | A7sus4 A7',
      box: 'D6 - - - C6 - | C6 - A5 - F5 - | Bb5 - A5 - G5 - | E5 - - - . .',
      harp: { style: 'arp', pattern: 'updown', span: 2, octave: 3 },   // named pattern over 2 octaves
      pad: true,
    },
  },
  intro: ['intro'],
  order: ['A', 'A', 'B'],
});
```

### 12.2 Boss track with an intensity layer (16th grid)
```js
G.Audio.defineTrack('boss', {
  bpm: 132, grid: '16n', humanize: { time: 0.004, vel: 0.05 },
  parts: {
    ost:   { inst: 'strings', vol: 0.5, params: { attack: 0.02, release: 0.15 } },
    bass:  { inst: 'pluck_bass', vol: 0.7 },
    drum:  { inst: 'low_drum', vol: 0.6, humanize: false },
    timp:  { inst: 'timpani', vol: 0.5, humanize: false, layer: 0.5 },   // phase 2 only
    brass: { inst: 'brass', vol: 0.55, layer: 0.5 },                     // phase 2 only
  },
  sections: {
    A: {
      chords: 'Cm | Ab | Fm | G7',
      ost: { style: 'arp', pattern: '0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1', octave: 4, gate: 0.6 },
      bass: { style: 'bass', rhythm: '1 . 1 . 5 . 1 . 3 . 1 . 5 . 1 .', octave: 2 },
      drum: 'X . . x . . x . X . . x . x x . | % | % | X . . x . . x . X . x x X x x x',
      timp: '. | . | . | G2 G2 G2 G2 G2 G2 G2 G2 G2 G2 G2 G2 G2 G2 G2! .',
      brass: { style: 'block', octave: 2, voicing: 'root', vel: 0.8 },
    },
  },
  order: ['A'],
});
```
The game raises the layer with `G.Audio.musicLayer(1)`; timpani and brass fade in over 2 s.

### 12.3 Non-looping ending with a tail
```js
G.Audio.defineTrack('ending', {
  bpm: 60, loop: false, tail: 8,
  parts: {
    piano: { inst: 'felt_piano', vol: 0.9 },
    str:   { inst: 'strings', vol: 0.4, chord: { style: 'pad', octave: 4 } },
  },
  sections: {
    last: {
      chords: 'Dm | Bb | Gm A7 | D',
      piano: 'A4 - D5 - C5 A4 F4 - | D5 - - C5 Bb4 - A4 - | G4 - Bb4 A4 F4 - E4 - | D4+F#4+A4+D5',
      str: true,
    },
  },
  order: ['last'],
});
```
The last bar is a single token, so the D major chord fills the whole bar; 8 s of tail let it ring.

### 12.4 Stingers (short cues)
`G.Audio.defineStinger(name, data)` uses the same format (non-looping, `tail` default 3, `duck`
default 0.65). The six game stingers live in `src/audio/sfx.js`.

## 13. Composer checklist
1. File calls `defineTrack` once with the exact track id from TECH_SPEC §14.
2. `node tools/audio_check.js --only tracks --id <id>` passes with no warnings.
3. RMS between −20 and −16 dBFS unless the brief says otherwise; peak ≤ −1 dBFS.
4. Loop (`--loops 2 --wav`) has no bump, gap or harmonic jolt at the seam.
5. Every instrument stays in range; no part buries the lead; low end has one owner.
6. Leitmotif quotes follow DESIGN §8 (D minor, 8 bars, 8th grid) where the brief asks for them.
