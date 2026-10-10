# Audio module API (`G.Audio`) — owner: audio

Files: `src/audio/audio.js` (engine, mixer, instruments, sequencer, compiler), `src/audio/sfx.js`
(all sound effects, ambience beds, stingers), `src/audio/tracks/<id>.js` (music, one file per
track). Song format for composers: **`docs/AUDIO_FORMAT.md`**. QA tool: `tools/audio_check.js`.
Audition page: `tools/audio_lab.html` (open in a browser, click to play anything).

Everything is synthesized at runtime (Web Audio); there are no audio assets.

## 1. Runtime API (TECH_SPEC §14)

Every call is a **safe no-op** before `init()`, when Web Audio is unavailable (Node, old browsers)
or when muted. Calls made before the first user gesture are remembered: `music()`/`ambience()`
start as soon as the context exists, and the module arms one-shot `pointerdown/keydown/touchstart`
listeners that call `init()` automatically.

```js
G.Audio.init()                          // create/resume the AudioContext (call from a user gesture). Idempotent → bool
G.Audio.sfx(name, { vol, pitch, pan, x, delay, force })   // → handle { stop(fade=0.08), playing } | null
G.Audio.music(trackId | null, { fade = 1.5, layer = 0, restart = false })
G.Audio.musicLayer(level)               // 0..1 intensity (TECH_SPEC; see AUDIO_FORMAT §8)
G.Audio.ambience(id | null, { fade = 2.5 })
G.Audio.setVolume(bus, v)               // bus: 'master' | 'music' | 'sfx' | 'ambience'; v 0..1
G.Audio.getVolume(bus)                  // → 0..1
G.Audio.duck(amount, sec)               // lower music + ambience by amount (0..1) for sec seconds
G.Audio.stinger(name, { vol })          // 'ability' 'item' 'boss_defeated' 'death' 'spark' 'seal'
G.Audio.defineTrack(id, data)           // → { ok, errors, warnings } (format: docs/AUDIO_FORMAT.md)
G.Audio.muted                           // get/set; ?mute=1 in the URL sets true at load
```

Details:
- **`sfx`**: `vol` 0..4 (default 1), `pitch` playback-rate multiplier 0.25..4 (1 = normal; scales
  every oscillator and filter), `pan` −1..1, or `x` = world-x in px (pan derived from `G.camera`),
  `delay` seconds. Every sound already varies slightly per play (pitch/filter/timing randomness).
  Identical names within **30 ms** are dropped (rate limit) unless `force: true`. Unknown names warn
  once and return `null`. The returned handle can stop long sounds early:
  `const h = G.Audio.sfx('kindle'); … if (h) h.stop(0.1);`
- **`music`**: same id = no-op (the track keeps playing; a fading-out instance of it is revived).
  `null` fades to silence. Crossfades are equal-length fade-out/fade-in. Tracks loop seamlessly;
  `ending` is non-looping. Changing the track resets the intensity layer to `opts.layer` (default 0).
  An undefined track id warns once and plays silence (composer stubs are safe).
- **`ambience`**: crossfades between beds (default 2.5 s). Ids: `wind village cave garden fire rain
  forge forest ice sanctum` (TECH_SPEC §7.1 mapping). Beds are continuous noise/tone layers plus
  sparse random events (drips, crackles, gusts, distant bells, chimes, hammer strikes…).
- **`duck(amount, sec)`**: smooth dip of music and ambience (sfx untouched). Overlapping ducks keep the
  deepest amount and the latest end. Use for dialogue (`duck(0.4, 3)`), big cards, boss roars.
- **`stinger(name)`**: short synthesized musical cue on the music bus (unaffected by duck); it ducks
  the current music for its length automatically. Suggested calls:
  `ability` (ability card), `item` (heartwax/urn/kiln glass/notch/sigil card), `spark` (Chandler's
  Spark memory), `seal` (seal obtained), `boss_defeated` (boss dies), `death` (player death).
  The sfx `item`/`ability` are shorter pickup sounds; play either the sfx (small pickups) or the
  stinger (full-screen card), not both.
- **Volumes**: if `G.settings` exists, `masterVolume musicVolume sfxVolume ambienceVolume` (or the
  short names `masterVol musicVol sfxVol ambVol`), 0..1, are polled every 25 ms and applied when they
  change (perceptual taper v²). `setVolume(bus, v)` sets a bus directly (`G.Save.applySettings` does).
- Mixer: `music`/`sfx`/`ambience` buses → master → compressor (−10 dB, 5:1) → trim → soft-clip
  limiter → output. One shared convolution hall (generated stereo IR, RT60 ≈ 2.9 s, dark) with
  per-voice sends; optional per-track ping-pong delay. Global voice cap 64 with priority stealing
  (UI > sfx > music > ambience events).

## 2. Sound effects (all names from TECH_SPEC §14)

| Group | Names (character) |
|---|---|
| Movement | `step` (very soft scuff — call per footfall), `jump` (airy whoosh), `doublejump` (two smoky wing beats), `land`, `hardland` (heavy thump + debris), `walljump`, `grip` (waxy squeak), `dash` (fiery whoosh), `swim` (soft paddle), `splash` |
| Combat | `slash` (nail swing), `slash_hit` (connects with an enemy), `slash_wall` (metallic ping off terrain/spikes), `pogo`, `enemy_hit` (heavy body hit), `enemy_die`, `player_hurt` (sharp crack + low thud), `player_die`, `hazard` (spikes/lava/water), `bolt` (spell cast), `bolt_hit`, `plunge` (dive start), `plunge_land` (huge impact), `kindle` (~0.9 s heal charge; stop the handle if cancelled), `kindle_done`, `ember_full`, `cinder` (pentatonic tink, randomised), `projectile` (enemy shot), `shockwave` |
| Bosses | `boss_roar` (~1.5 s), `boss_hit`, `boss_stagger`, `boss_die` (~4 s with bell), `bell` (Tallowmere's great bell) |
| World | `break_wall`, `geode_hit`, `geode_break`, `lever`, `gate_open` (~1.8 s), `gate_close`, `door` (Seal Door, ~4 s), `shrine`, `wisp` (Gutterwisp appears/hit), `wisp_die` |
| Pickups / rest | `item`, `ability`, `rest` (sconce), `save` (soft two-note chime), `lanternway` (travel), `area_card` |
| UI | `menu_move`, `menu_select`, `menu_back`, `dialogue_blip` (call per few characters; rate-limited), `map_open`, `shop_buy`, `deny` |

Levels are calibrated with `tools/audio_check.js` (mixing-desk table `MIX` at the top of `sfx.js`):
UI and footsteps quiet, hits and hurt clearly above the music; the loudest sounds (roar, door, boss death) peak around −6 dBFS at `vol` 1.

## 3. Extending: custom sfx, ambience, stingers

```js
// A new sfx (content modules may add their own, e.g. a boss attack). `k` is the sound-design kit.
G.Audio.defineSfx('lucerne_beam', { reverb: 0.3, vol: 1, prio: 2, play(k, opts) {
  const v = k.r(0.95, 1.05);                                     // per-play variation
  k.tone({ f: 880 * v, f1: 1760 * v, glide: 0.4, type: 'sawtooth', lp: 3000, a: 0.05, hold: 0.3, d: 0.5, g: 0.1 });
  k.noise({ color: 'pink', bp: 2000, bp1: 6000, Q: 1.2, a: 0.02, d: 0.6, g: 0.2, sweep: 0.5 });
  k.inst('bell', 'D4', 2, 0.5, { at: 0.1 });                     // any instrument, offset 0.1 s
} });
```
Kit (`k`): `k.t` start time, `k.p` pitch multiplier, `k.r(a, b)` random in [a, b), `k.pick(arr)`,
`k.reverb(send)`,
- `k.tone({ f, f1, glide, pts:[[dt,f],…], type: 'sine'|'triangle'|'square'|'sawtooth', wave: 'organ'|'glass'|'reed', det (cents), vib: {rate, depth (cents)}, fm: {ratio, index, index1, d}, a, hold, d, g, curve: 'lin', at, lp|hp|bp|notch|peak (+ lp1… sweep target, sweep s, Q / lpQ…, gain), track: false })`
- `k.noise({ color: 'white'|'pink'|'brown', rate, a, hold, d, g, at, curve, filters as above })`
- `k.play(buffer, { rate, loop, offset, a, hold, d, g, at, filters })`, `k.buffer(key, gen(sr, rng) → Float32Array | [L, R])` (cached)
- `k.inst(name, note, dur, vel, { at, ...instrument params })`
Envelope: `a` attack, `hold`, `d` = decay time to −60 dB, `g` = peak gain (≈ 0.05 quiet … 0.5 loud).
Filter frequencies follow `pitch` unless `track: false`.

```js
G.Audio.defineAmbience('my_bed', {
  gain: 1,
  layers: [   // continuous loops
    { noise: 'pink', filters: [{ type: 'lowpass', f: 600 }], gain: 0.2, pan: 0, reverb: 0.2,
      lfo: [{ target: 'gain', rate: 0.07, depth: 0.4 }, { target: 'sweep', filter: 0, rate: 0.05, depth: 600 }] },
    { tones: [{ f: 55 }, { f: 82.5, gain: 0.4 }], gain: 0.02 },
    { gen: (sr, R) => myLoop(sr, R), key: 'my_loop', gain: 0.3 },   // custom generated loop buffer
  ],
  events: [   // sparse random one-shots (kit as above)
    { every: [2, 6], first: 0.5, pan: [-0.8, 0.8], vol: [0.6, 1], pitch: [0.9, 1.1], reverb: 0.5, play(k) { /* ... */ } },
  ],
});
G.Audio.defineStinger('my_cue', { bpm: 80, duck: 0.6, parts: {...}, sections: {...}, order: ['A'] });
```
LFO targets: `gain` (depth = fraction), `pan`, `freq` (Hz), `sweep` (filter detune in cents).

## 4. Tooling & introspection

```js
G.Audio.validateTrack(id, data)        // → { ok, errors, warnings } without registering
G.Audio.renderOffline({ kind: 'track'|'stinger'|'sfx'|'ambience'|'note', id, seconds, sampleRate = 48000,
                        layer, loops = 1, opts, note, seed, layerAt, layerTo })   // → Promise<AudioBuffer>
G.Audio.createEngine(ctx, { seed })    // wrap any (Offline)AudioContext: { playTrack, playStinger, sfx, ambience, note, setLayer, duck, pump }
G.Audio.playNote(inst, note, { dur, vel, params })   // audition one note (after init)
G.Audio.state()                        // { ready, ctxState, muted, music, ambience, layer, volumes, voices, players, ambiences, time }
G.Audio.instruments()                  // { name: { range, def, kind, desc, params } }
G.Audio.trackIds() / sfxNames() / ambienceIds() / stingerNames()
G.Audio.getTrack(id)                   // compiled track (intro/body events, timeline with section start times)
G.Audio.noteToMidi('A4') / midiToNote(69) / parseChord('Gm/Bb')
G.Audio.REQUIRED_SFX / TRACK_IDS / AMBIENCE_IDS / STINGER_IDS
G.Audio.ctx / ready / available / currentMusic / currentAmbience   // read-only
```
`node tools/audio_check.js` renders everything offline and checks NaN, silence, peaks (≤ −1 dBFS)
and loudness (music RMS −22..−14 dBFS); `--wav` writes WAVs, `--png` spectrograms (see its header).

## 5. Integration notes for other modules
- Engine/UI: call `G.Audio.init()` in the first key/pointer handler (title screen "press any key").
  Region changes: `G.Audio.music(region.music)`, `G.Audio.ambience(region.ambience)`; room
  overrides `music: null` → `G.Audio.music(null)`.
- Bosses: `G.Audio.music('boss')` (or `sable`, `keeper`, `lucerne`) on start, `musicLayer(1)` for
  a final phase, `stinger('boss_defeated')` + `music(region.music)` on defeat.
- Pass `{ x: entity.cx }` to spatialise world sounds; use `pitch` for size (big enemy 0.8, small 1.2).
- Dialogue: `G.Audio.duck(0.35, seconds)` while text is open; `dialogue_blip` every 2–3 characters.
- Nothing in the audio module touches the DOM at load time; `G.settings` and `G.camera` are optional.
