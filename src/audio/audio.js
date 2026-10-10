// src/audio/audio.js — G.Audio core: AudioContext, mixer (buses, reverb, delay, compressor/limiter),
// procedural instruments (Web Audio node synths + JS-rendered sample banks), music sequencer and
// track compiler/validator, ambience engine, sfx toolkit and offline rendering.
// Track format: docs/AUDIO_FORMAT.md. Public API: docs/api/audio.md. No assets: all sound is code.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G) return; // src/core/namespace.js must load first

  // ===========================================================================
  // 1. Constants & helpers
  // ===========================================================================
  const LOOKAHEAD_MS = 25;       // scheduler timer period (realtime)
  const SCHEDULE_AHEAD = 0.15;   // seconds of audio scheduled ahead of the clock
  const FADE_AHEAD = 0.8;        // look-ahead while a system fade (room transition, travel, respawn) is up: the
                                 // room load at black stalls the main thread for up to ~0.7 s on a cold art cache,
                                 // and notes already on the AudioContext clock play through the stall
  const PREFILL_MAX = 2;         // cap for G.Audio.prefill(sec)
  const MAX_VOICES = 64;         // global voice cap (music + sfx + ambience events)
  const SFX_RATE_LIMIT = 0.03;   // identical sfx closer than this are dropped
  const MUSIC_FADE = 1.5;        // default music crossfade (s)
  const AMB_FADE = 2.5;          // default ambience crossfade (s)
  const LAYER_FADE = 2.0;        // default intensity-layer fade (s)
  const DEFAULT_VEL = 0.75;      // default note velocity
  const MUSIC_MAKEUP = 2;        // +6 dB on every track/stinger player: a typical 6-8 part arrangement at
                                 // volume 1 lands near the -18 dBFS RMS music target (tools/audio_check.js)

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const num = (v, d) => (isNum(v) ? v : d);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const dbToGain = (db) => Math.pow(10, db / 20);
  const velAmp = (v) => Math.pow(clamp(v, 0, 1.25), 1.4); // velocity -> amplitude

  function hash32(str) { // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function makeRng(seed) { // mulberry32 -> [0,1)
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let liveSeed = (Date.now() ^ 0x5bd1e995) >>> 0; // per-play variation seeds (cosmetic)
  const nextSeed = () => (liveSeed = (Math.imul(liveSeed, 1664525) + 1013904223) >>> 0);

  const warned = new Set();
  function warnOnce(key, msg) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn('[audio] ' + msg);
  }
  function reportOnce(err, where) {
    const msg = (err && err.message) || String(err);
    const key = 'E:' + where + ':' + msg;
    if (warned.has(key)) return;
    warned.add(key);
    if (typeof G.reportError === 'function') {
      try { G.reportError(err, 'audio:' + where); return; } catch (e) { /* fall through */ }
    }
    console.error('[audio] ' + where + ': ' + msg);
  }
  function didYouMean(key, list) {
    let best = null, bestD = 3;
    for (const k of list) {
      const d = editDistance(key.toLowerCase(), k.toLowerCase());
      if (d < bestD) { bestD = d; best = k; }
    }
    return best ? ` (did you mean '${best}'?)` : '';
  }
  function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  // ===========================================================================
  // 2. Notes, chords, grids
  // ===========================================================================
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACC = { '': 0, '#': 1, '##': 2, 'b': -1, 'bb': -2 };
  const NOTE_RE = /^([A-G])(##|#|bb|b)?(-?\d)$/;
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  /** 'C4' -> 60, 'Bb3' -> 58, 'F#5' -> 78. NaN if malformed. */
  function noteToMidi(s) {
    if (isNum(s)) return s;
    const m = NOTE_RE.exec(String(s));
    if (!m) return NaN;
    return (parseInt(m[3], 10) + 1) * 12 + PC[m[1]] + ACC[m[2] || ''];
  }
  function midiToNote(m) {
    m = Math.round(m);
    return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }

  // Chord qualities: intervals in semitones above the root (extensions keep their octave).
  const QUALITIES = {
    '': [0, 4, 7], 'maj': [0, 4, 7], 'M': [0, 4, 7],
    'm': [0, 3, 7], 'min': [0, 3, 7],
    'dim': [0, 3, 6], 'o': [0, 3, 6],
    'aug': [0, 4, 8], '+': [0, 4, 8],
    'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'sus': [0, 5, 7],
    '5': [0, 7],
    '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9],
    '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'M7': [0, 4, 7, 11],
    'm7': [0, 3, 7, 10], 'min7': [0, 3, 7, 10], 'mM7': [0, 3, 7, 11], 'mmaj7': [0, 3, 7, 11],
    'dim7': [0, 3, 6, 9], 'o7': [0, 3, 6, 9], 'm7b5': [0, 3, 6, 10], 'ø': [0, 3, 6, 10], 'ø7': [0, 3, 6, 10],
    '7sus4': [0, 5, 7, 10], '7sus': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10],
    'aug7': [0, 4, 8, 10], '7#5': [0, 4, 8, 10], '+7': [0, 4, 8, 10], '7b5': [0, 4, 6, 10],
    'add9': [0, 4, 7, 14], 'madd9': [0, 3, 7, 14], 'add2': [0, 2, 4, 7], 'madd2': [0, 2, 3, 7],
    '9': [0, 4, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], 'm9': [0, 3, 7, 10, 14],
    '6/9': [0, 4, 7, 9, 14], '69': [0, 4, 7, 9, 14], 'm6/9': [0, 3, 7, 9, 14], 'm69': [0, 3, 7, 9, 14],
    '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15],
    '11': [0, 7, 10, 14, 17], 'm11': [0, 3, 7, 10, 14, 17],
    '13': [0, 4, 7, 10, 14, 21], 'maj13': [0, 4, 7, 11, 14, 21],
  };
  const CHORD_RE = /^([A-G])(#|b)?(.*)$/;
  const BASS_RE = /^([A-G])(#|b)?$/;

  /** 'Gm/Bb' -> { sym, root: 7, ints: [0,3,7], bass: 10 }; null if not a chord symbol. */
  function parseChord(sym) {
    const m = CHORD_RE.exec(String(sym));
    if (!m) return null;
    const root = (PC[m[1]] + ACC[m[2] || ''] + 12) % 12;
    let q = m[3], bass = null;
    if (!has(QUALITIES, q)) {
      const i = q.lastIndexOf('/');
      if (i < 0) return null;
      const b = BASS_RE.exec(q.slice(i + 1));
      if (!b) return null;
      bass = (PC[b[1]] + ACC[b[2] || ''] + 12) % 12;
      q = q.slice(0, i);
      if (!has(QUALITIES, q)) return null;
    }
    return { sym: String(sym), root, ints: QUALITIES[q], bass };
  }

  const GRID_ALIASES = { '1n': 0.25, '2n': 0.5, '2t': 0.75, '4n': 1, '4t': 1.5, '8n': 2, '8t': 3, '16n': 4, '16t': 6, '32n': 8 };
  /** grid = steps per quarter note (2 = 8ths). Accepts numbers or '8n'/'16n'/'8t'... */
  function parseGrid(g) {
    if (isNum(g) && g > 0 && g <= 16) return g;
    if (typeof g === 'string' && has(GRID_ALIASES, g)) return GRID_ALIASES[g];
    return NaN;
  }
  /** [3,4] or '3/4' -> [3,4]; null if invalid. */
  function parseMeter(m) {
    let a = m;
    if (typeof m === 'string') a = m.split('/').map((x) => parseInt(x, 10));
    if (!Array.isArray(a) || a.length !== 2) return null;
    const n = a[0], d = a[1];
    if (!Number.isInteger(n) || n < 1 || n > 32 || [1, 2, 4, 8, 16].indexOf(d) < 0) return null;
    return [n, d];
  }

  // Voicing ------------------------------------------------------------------
  function reduceVoices(ints, n, bassPlaysRoot) {
    const out = ints.slice();
    while (out.length > n) {
      let i = out.indexOf(7);
      if (i < 0 && bassPlaysRoot) i = out.indexOf(0);
      if (i < 0) i = out.length - 1; // drop the highest extension
      out.splice(i, 1);
    }
    return out;
  }
  function voicingDistance(a, b) {
    let d = 0;
    for (const x of a) { let m = 99; for (const y of b) m = Math.min(m, Math.abs(x - y)); d += m; }
    for (const y of b) { let m = 99; for (const x of a) m = Math.min(m, Math.abs(x - y)); d += m; }
    return d;
  }
  /** Voice-leading cost of muddy spacing: adjacent semitones (e.g. A3-Bb3 in Bbmaj7) and low seconds. */
  function clusterPenalty(notes) {
    let p = 0;
    for (let i = 1; i < notes.length; i++) {
      const iv = notes[i] - notes[i - 1];
      if (iv === 1) p += 4;
      else if (iv === 2 && notes[i - 1] < 52) p += 1.5;
    }
    return p;
  }
  /**
   * Voice a parsed chord. o: { octave (register of the lowest voice, default 4), voicing:
   * 'close'|'open'|'root', voices (max notes), lead (voice-lead from prev), bassPlaysRoot }.
   * Returns ascending MIDI notes.
   */
  function voiceChord(ch, o, prev) {
    const base = 12 * (num(o.octave, 4) + 1);
    let ints = ch.ints;
    if (o.voices && o.voices < ints.length) ints = reduceVoices(ints, o.voices, !!o.bassPlaysRoot);
    const style = o.voicing || 'close';
    if (style === 'root' || style === 'open' || style === 'spread') {
      let notes = ints.map((i) => base + ch.root + i).sort((x, y) => x - y);
      if (style !== 'root' && notes.length >= 3) {
        notes = notes.map((n, i) => (i % 2 === 1 ? n + 12 : n)).sort((x, y) => x - y);
      }
      if (ch.bass !== null && !o.bassPlaysRoot) {
        let b = base + ch.bass;
        while (b >= notes[0]) b -= 12;
        notes.unshift(b);
      }
      return notes;
    }
    // close position: one candidate per inversion, lowest note kept within [base-5, base+6]
    const pcs = [];
    for (const i of ints) { const pc = (ch.root + i) % 12; if (pcs.indexOf(pc) < 0) pcs.push(pc); }
    const cands = [];
    for (let k = 0; k < pcs.length; k++) {
      const rot = pcs.slice(k).concat(pcs.slice(0, k));
      let low = base - 5 + (((rot[0] - (base - 5)) % 12) + 12) % 12;
      const notes = [low];
      for (let j = 1; j < rot.length; j++) {
        let n = notes[j - 1] + ((((rot[j] - notes[j - 1]) % 12) + 12) % 12 || 12);
        notes.push(n);
      }
      cands.push({ notes, lowPc: rot[0] });
    }
    let pool = cands;
    if (ch.bass !== null && !o.bassPlaysRoot) {
      const withBass = cands.filter((c) => c.lowPc === ch.bass);
      if (withBass.length) pool = withBass;
      else {
        // slash note outside the chord: add it below the root-position voicing
        const rootPos = cands.find((c) => c.lowPc === ch.root) || cands[0];
        let b = base - 5 + (((ch.bass - (base - 5)) % 12) + 12) % 12;
        while (b >= rootPos.notes[0]) b -= 12;
        return [b].concat(rootPos.notes);
      }
    }
    let best = null;
    if (prev && prev.length && o.lead !== false) {
      let bestD = Infinity;
      const center = base + 4;
      for (const c of pool) {
        const avg = c.notes.reduce((s, x) => s + x, 0) / c.notes.length;
        const d = voicingDistance(c.notes, prev) + Math.abs(avg - center) * 0.05 + clusterPenalty(c.notes);
        if (d < bestD) { bestD = d; best = c; }
      }
    } else {
      best = pool.find((c) => c.lowPc === ch.root) || pool[0];
    }
    return best.notes.slice();
  }

  // ===========================================================================
  // 3. Track compiler & validator (format spec: docs/AUDIO_FORMAT.md)
  // ===========================================================================
  const TRACK_KEYS = ['bpm', 'meter', 'grid', 'swing', 'loop', 'intro', 'order', 'tail', 'volume', 'reverb',
    'delay', 'humanize', 'parts', 'sections', 'layerFade', 'duck', 'key', 'title', 'comment'];
  const PART_KEYS = ['inst', 'vol', 'pan', 'reverb', 'delay', 'octave', 'transpose', 'layer', 'layerMax',
    'legato', 'glide', 'params', 'gate', 'vel', 'grid', 'swing', 'humanize', 'chord', 'chordOctave', 'pedal', 'comment'];
  const SECTION_KEYS = ['bars', 'chords', 'bpm', 'meter', 'transpose', 'comment'];
  const NOTE_KEYS = ['notes', 'grid', 'vel', 'octave', 'transpose', 'swing', 'pedal', 'gate', 'ramp',
    'chordOctave', 'humanize', 'comment'];
  const CHORD_KEYS = ['style', 'chords', 'octave', 'voicing', 'voices', 'bass', 'pattern', 'rhythm', 'grid', 'vel',
    'pedal', 'strum', 'reset', 'span', 'lead', 'hold', 'transpose', 'swing', 'gate', 'ramp', 'humanize', 'comment'];
  const STYLES = ['pad', 'block', 'strum', 'arp', 'bass'];
  const VOICINGS = ['close', 'open', 'spread', 'root'];
  const NAMED_PATTERNS = ['up', 'down', 'updown', 'downup', 'alberti', 'random'];
  const DEFAULT_HUMANIZE = { time: 0.008, vel: 0.06 };

  function checkKeys(obj, allowed, w, warn) {
    for (const k of Object.keys(obj)) {
      if (allowed.indexOf(k) < 0) warn(w, `unknown key '${k}'${didYouMean(k, allowed)} (ignored)`);
    }
  }
  function optNum(v, lo, hi, def, w, name, err, intOnly) {
    if (v === undefined) return def;
    if (!isNum(v) || v < lo || v > hi || (intOnly && !Number.isInteger(v))) {
      err(w, `${name} must be ${intOnly ? 'an integer' : 'a number'} in ${lo}..${hi} (got ${JSON.stringify(v)})`);
      return def;
    }
    return v;
  }
  function resolveHumanize(h, def) {
    if (h === undefined) return def;
    if (h === false || h === 0) return { time: 0, vel: 0 };
    if (isObj(h)) return { time: clamp(num(h.time, def.time), 0, 0.05), vel: clamp(num(h.vel, def.vel), 0, 0.5) };
    return def;
  }

  /** Split a step string into bars of tokens. Handles '%' (repeat bar) and 1-token whole bars. */
  function parseSteps(str, spb, err) {
    const raw = str.split('|');
    if (raw.length && raw[0].trim() === '') raw.shift();
    if (raw.length && raw[raw.length - 1].trim() === '') raw.pop();
    if (!raw.length) { err('step string is empty'); return null; }
    const tokens = [];
    let prev = null;
    for (let b = 0; b < raw.length; b++) {
      let toks = raw[b].trim().split(/\s+/).filter(Boolean);
      if (!toks.length) { err(`bar ${b + 1} is empty (use '.' for a rest bar)`); toks = ['.']; }
      if (toks.length === 1 && toks[0] === '%') {
        if (!prev) { err(`bar ${b + 1}: '%' (repeat previous bar) needs a previous bar`); toks = ['.']; }
        else toks = prev.slice();
      }
      if (toks.length === 1 && spb > 1) {
        const t = toks[0];
        toks = [t];
        for (let i = 1; i < spb; i++) toks.push(t === '.' ? '.' : '-');
      } else if (toks.length !== spb) {
        err(`bar ${b + 1}: expected ${spb} steps, got ${toks.length} ("${raw[b].trim()}")`);
        toks = toks.slice(0, spb);
        while (toks.length < spb) toks.push('.');
      }
      prev = toks;
      for (const t of toks) tokens.push(t);
    }
    return { tokens, bars: raw.length };
  }

  /** Parse one note token: 'A4', 'C4+E4+G4', '[Dm7]', 'x', 'X', with modifiers ! ' ? ~ ^ @NN. */
  function parseToken(tok) {
    let head, mods;
    if (tok[0] === '[') {
      const j = tok.indexOf(']');
      if (j < 0) return { error: `missing ']' in '${tok}'` };
      head = tok.slice(0, j + 1); mods = tok.slice(j + 1);
    } else {
      const m = /^([^!'?~^@]+)(.*)$/.exec(tok);
      if (!m) return { error: `bad token '${tok}'` };
      head = m[1]; mods = m[2];
    }
    const r = { hit: false, chord: null, notes: null, acc: false, stac: false, ghost: false, slur: false, reart: false, vel: null };
    if (head === 'x' || head === 'X') { r.hit = true; r.acc = head === 'X'; }
    else if (head[0] === '[') {
      r.chord = head.slice(1, -1);
      if (!parseChord(r.chord)) return { error: `unknown chord symbol '${r.chord}' in '${tok}'` };
    } else {
      r.notes = [];
      for (const s of head.split('+')) {
        const n = noteToMidi(s);
        if (!isNum(n)) return { error: `bad note '${s}' in '${tok}' (write e.g. C4, F#3, Bb5; '.' rest, '-' hold)` };
        r.notes.push(n);
      }
    }
    for (let k = 0; k < mods.length;) {
      const ch = mods[k];
      if (ch === '!') r.acc = true;
      else if (ch === "'") r.stac = true;
      else if (ch === '?') r.ghost = true;
      else if (ch === '~') r.slur = true;
      else if (ch === '^') r.reart = true;
      else if (ch === '@') {
        const m2 = /^@(\d{1,3})/.exec(mods.slice(k));
        if (!m2) return { error: `'@' must be followed by a velocity 1..100 in '${tok}'` };
        const v = parseInt(m2[1], 10);
        if (v < 1 || v > 100) return { error: `velocity must be 1..100 in '${tok}'` };
        r.vel = v / 100; k += m2[0].length; continue;
      } else return { error: `bad modifier '${ch}' in '${tok}' (allowed: ! ' ? ~ ^ @NN)` };
      k++;
    }
    return r;
  }

  /** Chord progression: 'Dm | Gm - A7 - | % | .' -> { bars, segs: [{chord|null, q0, q1}] } (quarters). */
  function parseProgression(str, barQ, err) {
    if (typeof str !== 'string') { err('chords must be a string like "Dm | Gm A7 | Dm"'); return null; }
    const raw = str.split('|');
    if (raw.length && raw[0].trim() === '') raw.shift();
    if (raw.length && raw[raw.length - 1].trim() === '') raw.pop();
    if (!raw.length) { err('chord progression is empty'); return null; }
    const segs = [];
    let prev = null;
    for (let b = 0; b < raw.length; b++) {
      let toks = raw[b].trim().split(/\s+/).filter(Boolean);
      if (!toks.length) { err(`chords bar ${b + 1} is empty (use '.' for no chord)`); toks = ['.']; }
      if (toks.length === 1 && toks[0] === '%') {
        if (!prev) { err(`chords bar ${b + 1}: '%' needs a previous bar`); toks = ['.']; } else toks = prev.slice();
      }
      prev = toks;
      const slot = barQ / toks.length;
      toks.forEach((tok, j) => {
        const q0 = b * barQ + j * slot, q1 = q0 + slot;
        if (tok === '-') {
          if (segs.length) segs[segs.length - 1].q1 = q1;
          else { err(`chords bar ${b + 1}: '-' has no chord to extend`); segs.push({ chord: null, q0, q1 }); }
        } else if (tok === '.') segs.push({ chord: null, q0, q1 });
        else {
          const ch = parseChord(tok);
          if (!ch) err(`chords bar ${b + 1}: unknown chord '${tok}'`);
          segs.push({ chord: ch, q0, q1 });
        }
      });
    }
    return { bars: raw.length, segs };
  }

  /** Arp/rhythm pattern string -> tokens [{k:'rest'|'hold'|'all'|'bass'|'idx'|'fifth'|'oct', i, acc}]. */
  function parsePattern(str, err) {
    const out = [];
    for (const raw of String(str).split(/\s+/)) {
      if (!raw || raw === '|') continue;
      const acc = raw.length > 1 && raw[raw.length - 1] === '!';
      const t = acc ? raw.slice(0, -1) : raw;
      if (t === '.') out.push({ k: 'rest' });
      else if (t === '-') out.push({ k: 'hold' });
      else if (t === 'x' || t === 'X') out.push({ k: 'all', acc: acc || t === 'X' });
      else if (t === 'b' || t === 'B') out.push({ k: 'bass', acc: acc || t === 'B' });
      else if (/^\d{1,2}$/.test(t)) out.push({ k: 'idx', i: parseInt(t, 10), acc });
      else { err(`bad pattern token '${raw}' (use 0-31 chord-tone index, b bass, x all, '-' hold, '.' rest, '!' accent)`); out.push({ k: 'rest' }); }
    }
    if (!out.length) { err('pattern is empty'); return null; }
    return out;
  }
  function namedPatternIndex(name, pos, n, span, R) {
    const len = n * span;
    switch (name) {
      case 'up': return pos % len;
      case 'down': return len - 1 - (pos % len);
      case 'updown': { const c = Math.max(1, 2 * len - 2); const p = pos % c; return p < len ? p : c - p; }
      case 'downup': { const c = Math.max(1, 2 * len - 2); const p = pos % c; return len - 1 - (p < len ? p : c - p); }
      case 'alberti': { const seq = [0, n - 1, Math.floor(n / 2), n - 1]; return seq[pos % 4]; }
      case 'random': return Math.floor(R() * len);
      default: return 0;
    }
  }

  /** Compile track data -> { track, errors, warnings }. kind: 'track' | 'stinger'. */
  function compileTrack(id, data, kind) {
    kind = kind || 'track';
    const errors = [], warnings = [];
    const pre = `${kind} '${id}'`;
    const err = (w, m) => errors.push(`${pre}${w ? ' > ' + w : ''}: ${m}`);
    const warn = (w, m) => warnings.push(`${pre}${w ? ' > ' + w : ''}: ${m}`);
    if (!isObj(data)) { err('', 'track data must be an object'); return { track: null, errors, warnings }; }
    checkKeys(data, TRACK_KEYS, '', warn);

    const T = { id, err, warn };
    T.bpm = data.bpm;
    if (!isNum(T.bpm) || T.bpm < 20 || T.bpm > 320) { err('', `bpm must be a number 20..320 (got ${JSON.stringify(data.bpm)})`); T.bpm = 90; }
    T.meter = data.meter === undefined ? [4, 4] : parseMeter(data.meter);
    if (!T.meter) { err('', `meter must be [beats, unit] or 'beats/unit' (got ${JSON.stringify(data.meter)})`); T.meter = [4, 4]; }
    T.grid = data.grid === undefined ? 2 : parseGrid(data.grid);
    if (!isNum(T.grid)) { err('', `grid must be steps per quarter note (1,2,3,4,6,8) or '4n','8n','8t','16n','16t' (got ${JSON.stringify(data.grid)})`); T.grid = 2; }
    T.swing = optNum(data.swing, 0, 0.75, 0, '', 'swing', err);
    T.humanize = resolveHumanize(data.humanize, DEFAULT_HUMANIZE);
    const loop = data.loop === undefined ? true : !!data.loop;
    const tail = optNum(data.tail, 0, 30, 4, '', 'tail', err);
    const volume = optNum(data.volume, 0, 4, 1, '', 'volume', err);
    const reverb = optNum(data.reverb, 0, 1, 0.3, '', 'reverb', err);
    const layerFade = optNum(data.layerFade, 0.05, 20, LAYER_FADE, '', 'layerFade', err);
    const duck = optNum(data.duck, 0, 1, 0.65, '', 'duck', err);
    let delay = null;
    if (data.delay !== undefined && data.delay !== null && data.delay !== false) {
      if (!isObj(data.delay)) err('', 'delay must be an object { beats, feedback, tone, level }');
      else {
        checkKeys(data.delay, ['beats', 'feedback', 'tone', 'level'], 'delay', warn);
        delay = {
          beats: optNum(data.delay.beats, 0.0625, 4, 0.75, 'delay', 'beats', err),
          feedback: optNum(data.delay.feedback, 0, 0.85, 0.35, 'delay', 'feedback', err),
          tone: optNum(data.delay.tone, 300, 16000, 3200, 'delay', 'tone', err),
          level: optNum(data.delay.level, 0, 2, 1, 'delay', 'level', err),
        };
      }
    }

    // ---- parts
    const parts = [];
    T.partIndex = {};
    T.badParts = new Set(); // parts that failed validation (already reported; sections skip them quietly)
    if (!isObj(data.parts) || !Object.keys(data.parts).length) err('', 'parts must be an object with at least one part');
    else {
      for (const name of Object.keys(data.parts)) {
        const p = data.parts[name], w = `part '${name}'`;
        if (!isObj(p)) { err(w, 'must be an object like { inst: "felt_piano", vol: 0.7 }'); T.badParts.add(name); continue; }
        checkKeys(p, PART_KEYS, w, warn);
        const inst = has(INSTRUMENTS, p.inst) ? INSTRUMENTS[p.inst] : null;
        if (!inst) { err(w, `unknown instrument '${p.inst}'${didYouMean(String(p.inst), Object.keys(INSTRUMENTS))}`); T.badParts.add(name); continue; }
        const P = {
          name, idx: parts.length, inst: p.inst,
          vol: optNum(p.vol, 0, 2, 0.7, w, 'vol', err),
          pan: optNum(p.pan, -1, 1, 0, w, 'pan', err),
          reverb: optNum(p.reverb, 0, 1, reverb, w, 'reverb', err),
          delay: optNum(p.delay, 0, 1, 0, w, 'delay', err),
          octave: optNum(p.octave, -4, 4, 0, w, 'octave', err, true),
          transpose: optNum(p.transpose, -36, 36, 0, w, 'transpose', err, true),
          layer: optNum(p.layer, 0, 1, 0, w, 'layer', err),
          layerMax: optNum(p.layerMax, 0, 2, 2, w, 'layerMax', err),
          legato: !!p.legato,
          glide: optNum(p.glide, 0, 1, inst.glide || 0.06, w, 'glide', err),
          gate: optNum(p.gate, 0.05, 1, 1, w, 'gate', err),
          vel: optNum(p.vel, 0.05, 1, undefined, w, 'vel', err),
          grid: p.grid,
          swing: p.swing === undefined ? undefined : optNum(p.swing, 0, 0.75, 0, w, 'swing', err),
          humanize: resolveHumanize(p.humanize, T.humanize),
          chord: p.chord,
          chordOctave: optNum(p.chordOctave, 0, 8, 4, w, 'chordOctave', err, true),
          pedal: p.pedal,
          params: {},
        };
        if (p.grid !== undefined && !isNum(parseGrid(p.grid))) err(w, `bad grid ${JSON.stringify(p.grid)}`);
        if (P.layerMax <= P.layer) err(w, 'layerMax must be greater than layer');
        if (p.params !== undefined) {
          if (!isObj(p.params)) err(w, 'params must be an object');
          else {
            const allowed = Object.keys(inst.params || {});
            for (const k of Object.keys(p.params)) {
              if (allowed.indexOf(k) < 0) warn(w, `instrument '${p.inst}' has no param '${k}'${didYouMean(k, allowed)} (allowed: ${allowed.join(', ') || 'none'})`);
              else if (!isNum(p.params[k])) err(w, `param '${k}' must be a number`);
              else P.params[k] = p.params[k];
            }
          }
        }
        if (p.chord !== undefined && !isObj(p.chord)) err(w, 'chord must be an object of chord-part defaults');
        if (p.pedal !== undefined && [true, false, 'chord', 'bar'].indexOf(p.pedal) < 0) err(w, "pedal must be true, false, 'chord' or 'bar'");
        parts.push(P);
        T.partIndex[name] = P;
      }
    }

    // ---- sections
    const sections = {};
    if (!isObj(data.sections) || !Object.keys(data.sections).length) err('', 'sections must be an object with at least one section');
    else for (const sname of Object.keys(data.sections)) sections[sname] = compileSection(sname, data.sections[sname], T);

    // ---- arrangement
    const seq = (list, label, required) => {
      if (list === undefined || list === null) { if (required) err('', `${label} is required (array of section names)`); return []; }
      if (typeof list === 'string') list = [list];
      if (!Array.isArray(list)) { err('', `${label} must be an array of section names`); return []; }
      const out = [];
      for (const s of list) {
        if (!has(sections, s)) err('', `${label} references unknown section '${s}'${didYouMean(String(s), Object.keys(sections))}`);
        else if (sections[s]) out.push(sections[s]);
      }
      if (required && !list.length) err('', `${label} must not be empty`);
      return out;
    };
    const introSecs = seq(data.intro, 'intro', false);
    const orderSecs = seq(data.order, 'order', true);
    const join = (secs) => {
      const events = [], timeline = [];
      let t = 0;
      for (const s of secs) {
        timeline.push({ name: s.name, start: t, len: s.len });
        for (const ev of s.events) events.push(Object.assign({}, ev, { t: ev.t + t }));
        t += s.len;
      }
      events.sort((a, b) => a.t - b.t || a.p - b.p);
      return { events, len: t, timeline };
    };
    const intro = join(introSecs), body = join(orderSecs);
    if (body.len <= 0 && !errors.length) err('', 'order has zero length');
    const used = new Set([].concat(data.intro || [], data.order || []));
    for (const name of Object.keys(sections)) {
      if (!used.has(name)) warn(`section '${name}'`, 'is never used in intro/order');
    }
    const usage = {};
    for (const list of [intro.events, body.events]) {
      for (const ev of list) {
        const inst = parts[ev.p].inst;
        (usage[inst] || (usage[inst] = new Set())).add(ev.m);
        if (ev.g) for (const gl of ev.g) usage[inst].add(gl.m);
      }
    }
    // range warnings (once per part)
    for (const P of parts) {
      const inst = INSTRUMENTS[P.inst];
      if (!usage[P.inst]) continue;
      let lo = 999, hi = -1;
      for (const list of [intro.events, body.events]) for (const ev of list) if (ev.p === P.idx) { lo = Math.min(lo, ev.m); hi = Math.max(hi, ev.m); }
      if (hi >= 0 && (lo < inst.range[0] || hi > inst.range[1])) {
        warn(`part '${P.name}'`, `notes ${midiToNote(lo)}..${midiToNote(hi)} leave the ${P.inst} range ${midiToNote(inst.range[0])}..${midiToNote(inst.range[1])}`);
      }
    }
    const track = {
      id, kind, bpm: T.bpm, meter: T.meter, loop, tail, volume, reverb, delay, layerFade, duck,
      parts, intro, body, usage, sections: Object.keys(sections),
      title: typeof data.title === 'string' ? data.title : id,
    };
    return { track, errors, warnings };
  }

  function compileSection(sname, sec, T) {
    const { err, warn } = T;
    const w = `section '${sname}'`;
    if (!isObj(sec)) { err(w, 'must be an object'); return null; }
    let meter = T.meter;
    if (sec.meter !== undefined) { meter = parseMeter(sec.meter); if (!meter) { err(w, 'bad meter'); meter = T.meter; } }
    const bpm = optNum(sec.bpm, 20, 320, T.bpm, w, 'bpm', err);
    const qSec = 60 / bpm, barQ = meter[0] * 4 / meter[1], barSec = barQ * qSec;
    let bars = sec.bars === undefined ? null : optNum(sec.bars, 1, 512, null, w, 'bars', err, true);
    const S = {
      T, w, err, warn, meter, bpm, qSec, barQ, barSec, prog: null,
      transpose: optNum(sec.transpose, -24, 24, 0, w, 'transpose', err, true),
    };
    if (sec.chords !== undefined) {
      S.prog = parseProgression(sec.chords, barQ, (m) => err(w + ' > chords', m));
      if (S.prog) {
        if (bars === null) bars = S.prog.bars;
        else if (S.prog.bars !== bars) err(w + ' > chords', `has ${S.prog.bars} bar(s) but the section has ${bars}`);
      }
    }
    const events = [];
    let skipped = false;
    for (const pk of Object.keys(sec)) {
      if (SECTION_KEYS.indexOf(pk) >= 0) continue;
      const P = T.partIndex[pk];
      if (!P && T.badParts.has(pk)) { skipped = true; continue; }
      if (!P) {
        err(w, `unknown part '${pk}'${didYouMean(pk, Object.keys(T.partIndex).concat(SECTION_KEYS))} (section keys are part names or ${SECTION_KEYS.join('/')})`);
        continue;
      }
      let spec = sec[pk];
      if (spec === null || spec === false || spec === undefined) continue;
      const pw = `${w} > part '${pk}'`;
      let res = null;
      if (spec === true) {
        if (!isObj(P.chord)) { err(pw, '`true` requires `chord: {...}` defaults on the part'); continue; }
        res = compileChordPart(Object.assign({}, P.chord), P, S, pw);
      } else if (typeof spec === 'string') res = compileNotePart({ notes: spec }, P, S, pw);
      else if (isObj(spec)) {
        const chordish = spec.style !== undefined || spec.pattern !== undefined || spec.rhythm !== undefined || spec.chords !== undefined;
        if (spec.notes !== undefined && chordish) { err(pw, 'use either `notes` (a step string) or chord options (style/pattern/rhythm/chords), not both'); continue; }
        if (spec.notes !== undefined) res = compileNotePart(spec, P, S, pw);
        else res = compileChordPart(Object.assign({}, isObj(P.chord) ? P.chord : {}, spec), P, S, pw);
      } else { err(pw, 'must be a step string, an object, true or null'); continue; }
      if (!res) continue;
      if (bars === null) bars = res.bars;
      else if (res.bars !== bars) { err(pw, `has ${res.bars} bar(s) but the section has ${bars}`); }
      for (const ev of res.events) events.push(ev);
    }
    if (bars === null) { if (!skipped) err(w, 'has no parts, no chords and no `bars` count'); bars = 1; }
    const len = bars * barSec;
    // clip anything that would start after the section end (defensive; lengths are validated)
    const kept = events.filter((ev) => ev.t < len - 1e-6);
    kept.sort((a, b) => a.t - b.t || a.p - b.p);
    return { name: sname, len, bars, events: kept, bpm, meter };
  }

  function stepClock(S, grid, swing) {
    const spb = Math.round(S.barQ * grid);
    const stepSec = S.qSec / grid;
    const sw = (swing > 0 && Number.isInteger(grid) && grid % 2 === 0) ? swing * stepSec : 0;
    return {
      spb, stepSec,
      at(i) {
        const bar = Math.floor(i / spb), pos = i - bar * spb;
        return bar * S.barSec + pos * stepSec + ((pos & 1) ? sw : 0);
      },
    };
  }
  function resolveGrid(spec, P, S, pw) {
    const raw = spec.grid !== undefined ? spec.grid : P.grid;
    const grid = raw === undefined ? S.T.grid : parseGrid(raw);
    if (!isNum(grid)) { S.err(pw, `bad grid ${JSON.stringify(raw)}`); return NaN; }
    const spbF = S.barQ * grid;
    if (Math.abs(spbF - Math.round(spbF)) > 1e-9 || spbF < 1) {
      S.err(pw, `grid ${raw === undefined ? S.T.grid : JSON.stringify(raw)} does not divide a ${S.meter[0]}/${S.meter[1]} bar into whole steps`);
      return NaN;
    }
    return grid;
  }
  function pedalEndFn(mode, S, prog) {
    if (!mode) return null;
    return (t) => {
      const barEnd = (Math.floor(t / S.barSec + 1e-9) + 1) * S.barSec;
      if (mode === 'bar' || !prog) return barEnd;
      const q = t / S.qSec + 1e-9;
      for (const sg of prog.segs) if (q >= sg.q0 && q < sg.q1) return sg.q1 * S.qSec;
      return barEnd;
    };
  }
  /** Turn raw notes [{t0,t1,m,vel,acc,glides}] into events with humanize, ramp and range checks. */
  function emitEvents(raw, P, S, spec, pw, seedKey, bars) {
    const hum = spec.humanize !== undefined ? resolveHumanize(spec.humanize, P.humanize) : P.humanize;
    const R = makeRng(hash32(seedKey));
    const len = bars * S.barSec;
    let ramp = null;
    if (spec.ramp !== undefined) {
      if (!Array.isArray(spec.ramp) || spec.ramp.length !== 2 || !isNum(spec.ramp[0]) || !isNum(spec.ramp[1])) S.err(pw, 'ramp must be [fromMul, toMul]');
      else ramp = spec.ramp;
    }
    const out = [];
    let badRange = false;
    for (const n of raw) {
      let v = n.vel;
      if (ramp) v *= lerp(ramp[0], ramp[1], clamp(n.t0 / len, 0, 1));
      const dt = hum.time > 0 ? R() * hum.time : 0;
      if (hum.vel > 0) v *= 1 + (R() * 2 - 1) * hum.vel;
      if (n.m < 0 || n.m > 127) { badRange = true; continue; }
      const d = Math.max(0.02, n.t1 - n.t0);
      out.push({ t: n.t0 + dt, p: P.idx, m: n.m, d, v: clamp(v, 0.02, 1), a: n.acc ? 1 : 0, g: n.glides && n.glides.length ? n.glides : null });
    }
    if (badRange) S.err(pw, 'notes outside MIDI range 0..127 after octave/transpose');
    return out;
  }

  function compileNotePart(spec, P, S, pw) {
    const { err, warn } = S;
    checkKeys(spec, NOTE_KEYS, pw, warn);
    if (typeof spec.notes !== 'string') { err(pw, '`notes` must be a step string'); return null; }
    const grid = resolveGrid(spec, P, S, pw);
    if (!isNum(grid)) return null;
    const swing = spec.swing !== undefined ? clamp(num(spec.swing, 0), 0, 0.75) : (P.swing !== undefined ? P.swing : S.T.swing);
    const clk = stepClock(S, grid, swing);
    const parsed = parseSteps(spec.notes, clk.spb, (m) => err(pw, m));
    if (!parsed) return null;
    const { tokens, bars } = parsed;
    const inst = INSTRUMENTS[P.inst];
    const baseVel = num(spec.vel, num(P.vel, DEFAULT_VEL));
    const shift = 12 * (P.octave + num(spec.octave, 0)) + P.transpose + num(spec.transpose, 0) + S.transpose;
    const chordOct = num(spec.chordOctave, P.chordOctave);
    const gate = num(spec.gate, P.gate);
    const pedalMode = spec.pedal !== undefined ? spec.pedal : P.pedal;
    const pedalEnd = pedalEndFn(pedalMode, S, S.prog);
    const groups = [];
    let cur = null, prevVoicing = null, warnedHold = false;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok === '.') { cur = null; continue; }
      if (tok === '-') {
        if (cur) cur.s1 = i + 1;
        else if (i === 0 && !warnedHold) { warnedHold = true; warn(pw, "'-' at the start of a section holds nothing (treated as a rest)"); }
        continue;
      }
      const where = `bar ${Math.floor(i / clk.spb) + 1}, step ${(i % clk.spb) + 1}`;
      const p = parseToken(tok);
      if (p.error) { err(pw, `${where}: ${p.error}`); cur = null; continue; }
      let notes;
      if (p.hit) notes = [inst.def];
      else if (p.chord) {
        notes = voiceChord(parseChord(p.chord), { octave: chordOct }, prevVoicing);
        prevVoicing = notes;
        notes = notes.map((n) => n + shift);
      } else notes = p.notes.map((n) => n + shift);
      let vel = p.vel !== null ? p.vel : baseVel;
      if (p.ghost) vel *= 0.55;
      if (p.acc) vel = Math.min(1, vel + 0.15);
      cur = { s0: i, s1: i + 1, notes, vel, acc: p.acc, stac: p.stac, slur: p.slur, reart: p.reart, hit: p.hit };
      groups.push(cur);
    }
    // legato chains -> raw notes
    const raw = [];
    let chain = null, prev = null;
    for (const g of groups) {
      const t0 = clk.at(g.s0), t1 = clk.at(g.s1);
      // legato: glide into the next note unless it is accented, marked '^' (new bow/breath) or a repeat
      const connect = chain && prev && prev.s1 === g.s0 && g.notes.length === 1 && prev.notes.length === 1 &&
        !g.hit && !prev.hit && !g.reart && g.notes[0] !== prev.notes[0] && (g.slur || (P.legato && !g.acc));
      if (connect) {
        chain.glides.push({ at: t0 - chain.t0, m: g.notes[0], v: g.vel });
        chain.t1 = t1; chain.multi = true;
      } else {
        chain = { t0, t1, notes: g.notes, vel: g.vel, acc: g.acc, stac: g.stac, glides: [] };
        raw.push(chain);
      }
      prev = g;
    }
    const notes = [];
    for (const c of raw) {
      let d = c.t1 - c.t0;
      if (c.stac && !c.glides.length) d = Math.max(0.04, Math.min(d, clk.stepSec) * 0.45);
      d *= gate;
      if (pedalEnd && !c.glides.length) { const pe = pedalEnd(c.t0); if (pe > c.t0 + d) d = pe - c.t0; }
      for (const m of c.notes) notes.push({ t0: c.t0, t1: c.t0 + d, m, vel: c.vel, acc: c.acc, glides: c.glides });
    }
    return { bars, events: emitEvents(notes, P, S, spec, pw, `${S.T.id}|${S.w}|${P.name}`, bars) };
  }

  /** Bass-line degree above the bass note: 1 bass, 3 third, 5 fifth, 7 seventh, 8 octave. */
  function bassDegree(sg, deg, shift) {
    if (deg === 8) return sg.bass + 12;
    const pick = { 3: [3, 4, 2, 5], 5: [7, 6, 8], 7: [10, 11, 9] }[deg];
    if (!pick) return sg.bass;
    let iv = null;
    for (const c of pick) if (sg.ch.ints.indexOf(c) >= 0) { iv = c; break; }
    if (iv === null) iv = deg === 3 ? 4 : deg === 5 ? 7 : 10;
    const pc = (((sg.ch.root + iv + shift) % 12) + 12) % 12;
    return sg.bass + ((((pc - sg.bass) % 12) + 12) % 12 || 12);
  }
  function compileChordPart(spec, P, S, pw) {
    const { err, warn } = S;
    checkKeys(spec, CHORD_KEYS, pw, warn);
    const style = spec.style || 'pad';
    if (STYLES.indexOf(style) < 0) { err(pw, `style must be one of ${STYLES.join(', ')} (got '${style}')`); return null; }
    if (spec.voicing !== undefined && VOICINGS.indexOf(spec.voicing) < 0) err(pw, `voicing must be one of ${VOICINGS.join(', ')}`);
    let prog = S.prog;
    if (spec.chords !== undefined) prog = parseProgression(spec.chords, S.barQ, (m) => err(pw + ' > chords', m));
    if (!prog) { err(pw, 'needs chords: set `chords` on the section (or on this part)'); return null; }
    const bars = prog.bars;
    const grid = resolveGrid(spec, P, S, pw);
    if (!isNum(grid)) return null;
    const swing = spec.swing !== undefined ? clamp(num(spec.swing, 0), 0, 0.75) : (P.swing !== undefined ? P.swing : S.T.swing);
    const clk = stepClock(S, grid, swing);
    const octave = optNum(spec.octave, 0, 8, style === 'bass' ? 2 : 4, pw, 'octave', err, true);
    const defBassOct = style === 'bass' ? octave : octave - 1;
    const bassOct = isNum(spec.bass) ? optNum(spec.bass, 0, 8, defBassOct, pw, 'bass', err, true) : defBassOct;
    if (spec.bass !== undefined && typeof spec.bass !== 'boolean' && !isNum(spec.bass)) err(pw, 'bass must be true/false or an octave number');
    const wantBass = spec.bass !== undefined && spec.bass !== false;
    const vo = { octave, voicing: spec.voicing || 'close', voices: optNum(spec.voices, 1, 8, 0, pw, 'voices', err, true),
      lead: spec.lead !== false, bassPlaysRoot: wantBass };
    const shift = 12 * P.octave + P.transpose + num(spec.transpose, 0) + S.transpose;
    const baseVel = num(spec.vel, num(P.vel, style === 'pad' ? 0.6 : DEFAULT_VEL));
    const gate = num(spec.gate, P.gate);
    const pedalMode = spec.pedal !== undefined ? spec.pedal : P.pedal;
    const pedalEnd = pedalEndFn(pedalMode === true ? 'chord' : pedalMode, S, prog);
    const strum = optNum(spec.strum, -0.2, 0.2, style === 'strum' ? 0.03 : 0, pw, 'strum', err);
    // voice every segment (voice-leading across the section)
    let prevV = null;
    const segs = prog.segs.map((sg) => {
      const o = { t0: sg.q0 * S.qSec, t1: sg.q1 * S.qSec, q0: sg.q0, q1: sg.q1, notes: null, bass: null, ch: sg.chord };
      if (sg.chord) {
        o.notes = voiceChord(sg.chord, vo, prevV).map((n) => n + shift);
        prevV = o.notes.map((n) => n - shift);
        o.bass = 12 * (bassOct + 1) + (sg.chord.bass !== null ? sg.chord.bass : sg.chord.root) + shift;
      }
      return o;
    });
    const segAtStep = (i) => {
      const q = i / grid + 1e-9;
      for (const sg of segs) if (q >= sg.q0 && q < sg.q1) return sg;
      return null;
    };
    const raw = [];
    const R = makeRng(hash32(`${S.T.id}|${S.w}|${P.name}|pattern`));
    const chordNotes = (sg) => (style === 'bass' ? [sg.bass] : wantBass ? [sg.bass].concat(sg.notes) : sg.notes);
    const pushChord = (sg, t0, t1, vel, acc) => {
      const list = chordNotes(sg);
      const order = strum < 0 ? list.slice().reverse() : list;
      order.forEach((m, k) => {
        const s = t0 + Math.abs(strum) * k;
        if (s < t1 - 0.01) raw.push({ t0: s, t1, m, vel, acc });
      });
    };

    if (style === 'pad' || ((style === 'block' || style === 'strum' || style === 'bass') && spec.rhythm === undefined)) {
      const held = new Map();
      for (const sg of segs) {
        if (!sg.notes) { held.clear(); continue; }
        if (style === 'pad' && spec.hold !== false && !strum) {
          const next = new Map();
          for (const m of chordNotes(sg)) {
            const open = held.get(m);
            if (open && Math.abs(open.t1 - sg.t0) < 1e-6) { open.t1 = sg.t1; next.set(m, open); continue; }
            const n = { t0: sg.t0, t1: sg.t1, m, vel: baseVel, acc: false };
            raw.push(n); next.set(m, n);
          }
          held.clear();
          next.forEach((v, k) => held.set(k, v));
        } else pushChord(sg, sg.t0, sg.t1, baseVel, false);
      }
    } else {
      const isArp = style === 'arp';
      let pat = null, named = null;
      const src = isArp ? spec.pattern : spec.rhythm;
      if (src === undefined) { err(pw, isArp ? "arp needs `pattern` (e.g. 'up' or '0 1 2 1')" : 'needs `rhythm`'); return null; }
      if (isArp && NAMED_PATTERNS.indexOf(src) >= 0) named = src;
      else pat = parsePattern(src, (m) => err(pw, m));
      if (!named && !pat) return null;
      const span = optNum(spec.span, 1, 4, 1, pw, 'span', err, true);
      const reset = spec.reset === 'chord' ? 'chord' : 'bar';
      if (spec.reset !== undefined && spec.reset !== 'chord' && spec.reset !== 'bar') err(pw, "reset must be 'bar' or 'chord'");
      const total = bars * clk.spb;
      let open = [];       // currently sounding notes (not yet closed)
      let openSeg = null;
      const close = (t) => { for (const n of open) n.t1 = Math.max(n.t0 + 0.02, t); open = []; };
      const pushChordOpen = (sg, t, vel, acc) => {
        const list = chordNotes(sg);
        const order = strum < 0 ? list.slice().reverse() : list;
        order.forEach((m, k) => {
          const nn = { t0: t + Math.abs(strum) * k, t1: sg.t1, m, vel, acc };
          raw.push(nn); open.push(nn);
        });
        openSeg = sg;
      };
      let segStart = 0, lastSeg = null;
      for (let i = 0; i < total; i++) {
        const sg = segAtStep(i), t = clk.at(i);
        if (sg !== lastSeg) { segStart = i; lastSeg = sg; }
        if (!sg || !sg.notes) { close(t); openSeg = null; continue; }
        const pos = reset === 'chord' ? i - segStart : i % clk.spb;
        let tk;
        if (named) {
          tk = { k: 'idx', i: namedPatternIndex(named, pos, sg.notes.length, span, R) };
        } else tk = pat[pos % pat.length];
        const onBeat = (i % clk.spb) % Math.max(1, Math.round(grid)) === 0;
        const vel = baseVel * (isArp && !onBeat ? 0.9 : 1) + (tk.acc ? 0.15 : 0);
        if (tk.k === 'rest') { close(t); continue; }
        if (tk.k === 'hold') {
          if (openSeg && openSeg !== sg && open.length) {
            // chord changed under a held note: re-strike the new chord
            close(t);
            if (!isArp) { pushChordOpen(sg, t, vel, false); }
          }
          continue;
        }
        close(t);
        if (isArp) {
          let ms = [];
          if (tk.k === 'all') ms = sg.notes.slice();
          else if (tk.k === 'bass') ms = [sg.bass];
          else { const n = sg.notes.length; ms = [sg.notes[tk.i % n] + 12 * Math.floor(tk.i / n)]; }
          for (const m of ms) { const nn = { t0: t, t1: sg.t1, m, vel, acc: !!tk.acc }; raw.push(nn); open.push(nn); }
        } else if (style === 'bass') {
          let m = sg.bass;
          if (tk.k === 'idx') m = bassDegree(sg, tk.i, shift);
          const nn = { t0: t, t1: sg.t1, m, vel, acc: !!tk.acc }; raw.push(nn); open.push(nn);
        } else pushChordOpen(sg, t, vel, !!tk.acc);
        openSeg = sg;
      }
      close(bars * S.barSec);
      // pedal: notes ring to the end of their chord (or bar)
      if (pedalEnd) for (const n of raw) { const pe = pedalEnd(n.t0); if (pe > n.t1) n.t1 = pe; }
    }
    if (gate < 1) for (const n of raw) n.t1 = n.t0 + (n.t1 - n.t0) * gate;
    return { bars, events: emitEvents(raw, P, S, spec, pw, `${S.T.id}|${S.w}|${P.name}`, bars) };
  }

  // ===========================================================================
  // 4. DSP resources (buffers are context-independent; cached per sample rate)
  // ===========================================================================
  const RES = new Map(); // `${sr}|${key}` -> AudioBuffer
  const TAU = Math.PI * 2;

  function newBuffer(ctx, chans, sr) {
    const list = Array.isArray(chans) ? chans : [chans];
    let buf = null;
    try { buf = new AudioBuffer({ numberOfChannels: list.length, length: list[0].length, sampleRate: sr }); }
    catch (e) { buf = ctx.createBuffer(list.length, list[0].length, sr); }
    for (let i = 0; i < list.length; i++) {
      if (buf.copyToChannel) buf.copyToChannel(list[i], i); else buf.getChannelData(i).set(list[i]);
    }
    return buf;
  }
  function cachedBuffer(ctx, key, gen) {
    const sr = ctx.sampleRate, k = sr + '|' + key;
    let b = RES.get(k);
    if (!b) { b = newBuffer(ctx, gen(sr), sr); RES.set(k, b); }
    return b;
  }
  function hasBuffer(ctx, key) { return RES.has(ctx.sampleRate + '|' + key); }

  /** Crossfade the tail into the head so the buffer loops seamlessly; returns the shortened array. */
  function makeLoopable(a, fade) {
    const n = a.length;
    for (let i = 0; i < fade; i++) {
      const w = i / fade;
      a[i] = a[i] * Math.sqrt(w) + a[n - fade + i] * Math.sqrt(1 - w);
    }
    return a.slice(0, n - fade);
  }
  function normRms(a, target, from, to) {
    let s = 0, n = 0;
    const i1 = Math.min(a.length, to || a.length);
    for (let i = from || 0; i < i1; i++) { s += a[i] * a[i]; n++; }
    const rms = Math.sqrt(s / Math.max(1, n));
    if (rms > 1e-9) { const k = target / rms; for (let i = 0; i < a.length; i++) a[i] *= k; }
    return a;
  }
  function normPeak(a, target) {
    let p = 0;
    for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; }
    if (p > 1e-9) { const k = target / p; for (let i = 0; i < a.length; i++) a[i] *= k; }
    return a;
  }
  function fadeEdges(a, sr, inSec, outSec) {
    const ni = Math.floor(inSec * sr), no = Math.floor(outSec * sr), n = a.length;
    for (let i = 0; i < ni && i < n; i++) a[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / ni);
    for (let i = 0; i < no && i < n; i++) a[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / no);
    return a;
  }

  function noiseData(color, sr, seconds, seed) {
    const n = Math.floor(sr * seconds), R = makeRng(seed), out = new Float32Array(n);
    if (color === 'pink') { // Paul Kellet's refined filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = R() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
    } else if (color === 'brown') {
      let last = 0;
      for (let i = 0; i < n; i++) { last = (last + 0.02 * (R() * 2 - 1)) / 1.02; out[i] = last; }
    } else for (let i = 0; i < n; i++) out[i] = R() * 2 - 1;
    // DC removal (brown/pink drift)
    let mean = 0;
    for (let i = 0; i < n; i++) mean += out[i];
    mean /= n;
    for (let i = 0; i < n; i++) out[i] -= mean;
    return normRms(makeLoopable(out, Math.floor(sr * 0.08)), 0.3);
  }
  function noiseBuffer(ctx, color) {
    return cachedBuffer(ctx, 'noise:' + color, (sr) => [noiseData(color, sr, 4.1, 1234 + color.length), noiseData(color, sr, 4.1, 987 + color.length * 7)]);
  }

  /** Dark stereo hall impulse: decaying noise whose lowpass cutoff falls over time. */
  function reverbIR(ctx) {
    return cachedBuffer(ctx, 'ir:hall', (sr) => {
      const rt60 = 2.9, seconds = 3.3, pre = Math.floor(0.021 * sr);
      const n = Math.floor(seconds * sr) + pre;
      const chans = [];
      for (let ch = 0; ch < 2; ch++) {
        const R = makeRng(0xa11ce + ch * 7919), out = new Float32Array(n);
        let y1 = 0, y2 = 0, a = 0;
        const dk = Math.exp(-6.9078 / (rt60 * sr));
        let env = 1;
        for (let i = 0; i < n - pre; i++) {
          if ((i & 63) === 0) {
            const t = i / sr;
            const fc = 7500 * Math.pow(1100 / 7500, Math.min(1, t / 2.2));
            a = 1 - Math.exp(-TAU * fc / sr);
          }
          y1 += a * ((R() * 2 - 1) - y1);
          y2 += a * (y1 - y2);
          const t = i / sr;
          const onset = t < 0.018 ? t / 0.018 : 1;
          const early = 1 + 1.2 * Math.exp(-t / 0.06);
          out[pre + i] = y2 * env * onset * early;
          env *= dk;
        }
        chans.push(fadeEdges(out, sr, 0, 0.25));
      }
      // normalise to unit energy (sum of squares) averaged over channels
      let e = 0;
      for (const c of chans) for (let i = 0; i < c.length; i++) e += c[i] * c[i];
      const k = 1 / Math.sqrt(e / 2);
      for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= k;
      return chans;
    });
  }

  // ---- additive / physical sample generators ---------------------------------
  /** Add amp*(mix*e^-t/tau1 + (1-mix)*e^-t/tau2)*sin(2πft+ph) using a recursive oscillator. */
  function addSine(out, sr, f, amp, tau1, tau2, mix, ph, start) {
    if (!(f > 0) || f >= sr * 0.47 || !(amp > 0)) return;
    const w = TAU * f / sr, k = 2 * Math.cos(w);
    let y1 = Math.sin(ph - w), y2 = Math.sin(ph - 2 * w);
    const d1 = Math.exp(-1 / (Math.max(1e-4, tau1) * sr)), d2 = Math.exp(-1 / (Math.max(1e-4, tau2) * sr));
    let e1 = amp * mix, e2 = amp * (1 - mix);
    const thr = amp * 1e-5, n = out.length;
    for (let i = start || 0; i < n; i++) {
      const y = k * y1 - y2; y2 = y1; y1 = y;
      const e = e1 + e2;
      out[i] += y * e;
      e1 *= d1; e2 *= d2;
      if (e < thr) break;
    }
  }
  /** Sine with exponential pitch glide f*(1+gl*e^-t/gtau) and single decay. */
  function addSineGlide(out, sr, f, gl, gtau, amp, tau, ph) {
    const w0 = TAU * f / sr, dg = Math.exp(-1 / (gtau * sr)), de = Math.exp(-1 / (tau * sr));
    let p = ph, g = gl, e = amp;
    const thr = amp * 1e-5;
    for (let i = 0; i < out.length; i++) {
      out[i] += Math.sin(p) * e;
      p += w0 * (1 + g); g *= dg; e *= de;
      if (e < thr) break;
    }
  }
  /** Filtered noise burst with linear attack and exponential decay. */
  function addNoise(out, sr, R, amp, attack, tau, lpHz, hpHz, start) {
    const a = lpHz ? 1 - Math.exp(-TAU * lpHz / sr) : 1;
    const hb = hpHz ? Math.exp(-TAU * hpHz / sr) : 0;
    const na = Math.max(1, Math.floor(attack * sr)), de = Math.exp(-1 / (tau * sr));
    let lp = 0, lp2 = 0, hpPrevIn = 0, hpOut = 0, e = amp;
    for (let i = start || 0, j = 0; i < out.length; i++, j++) {
      const w = R() * 2 - 1;
      lp += a * (w - lp); lp2 += a * (lp - lp2);
      let x = lp2;
      if (hpHz) { hpOut = hb * (hpOut + x - hpPrevIn); hpPrevIn = x; x = hpOut; }
      const env = j < na ? amp * (j / na) : e;
      if (j >= na) e *= de;
      out[i] += x * env;
      if (j > na && e < amp * 1e-4) break;
    }
  }

  function genFeltPiano(f, sr, R) {
    const dur = clamp(9 * Math.pow(110 / f, 0.45), 2, 10);
    const n = Math.floor(dur * sr), out = new Float32Array(n);
    const B = clamp(0.00016 * Math.pow(f / 110, 1.1), 0.00006, 0.003);
    const maxF = Math.min(sr * 0.45, 7000);
    const tauLong = clamp(2.6 * Math.pow(262 / f, 0.62), 0.45, 8);
    const strike = 0.12;
    for (let k = 1; k <= 40; k++) {
      const fk = k * f * Math.sqrt(1 + B * k * k);
      if (fk > maxF) break;
      const felt = 1 / (1 + Math.pow(fk / 2200, 2));
      const amp = Math.pow(k, -1.1) * (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * k * strike))) * felt;
      const tLong = tauLong / (1 + 0.42 * (k - 1));
      const tShort = Math.max(0.03, tLong * 0.14);
      const ph = R() * TAU;
      if (k <= 8) {
        const det = (0.08 + R() * 0.14) * (1 + k * 0.35);
        addSine(out, sr, fk - det * 0.25, amp * 0.78, tShort, tLong, 0.6, ph);
        addSine(out, sr, fk + det * 0.75, amp * 0.22, tShort * 1.1, tLong * 0.85, 0.6, ph);
      } else addSine(out, sr, fk, amp, tShort, tLong, 0.65, ph);
    }
    // felt thump + soundboard knock
    addNoise(out, sr, R, 0.05, 0.002, 0.01, 1100, 80);
    addSine(out, sr, 95 + R() * 20, 0.025, 0.03, 0.03, 1, 0);
    fadeEdges(out, sr, 0.0035, 0.12);
    return normRms(out, 0.2, 0, Math.floor(0.3 * sr));
  }

  /** Karplus-Strong plucked string with fractional-delay tuning. */
  function ksString(f, sr, R, dur, t60, bright, excite) {
    const n = Math.floor(dur * sr), out = new Float32Array(n);
    const D = sr / f - 0.5, L = Math.max(2, Math.floor(D)), frac = D - L;
    const C = (1 - frac) / (1 + frac);
    const buf = new Float32Array(L);
    let lp = 0;
    const ea = clamp(bright, 0.05, 1);
    for (let i = 0; i < L; i++) {
      const x = i / L;
      const shape = x < excite ? x / excite : (1 - x) / (1 - excite);
      lp += ea * ((R() * 2 - 1) - lp);
      buf[i] = 0.75 * (shape - 0.5) + 0.6 * lp;
    }
    let mean = 0;
    for (let i = 0; i < L; i++) mean += buf[i];
    mean /= L;
    for (let i = 0; i < L; i++) buf[i] -= mean;
    const rho = Math.pow(0.001, 1 / (f * t60));
    const s = 0.5 - 0.35 * (bright - 0.5) * 0.5; // averaging weight: lower = brighter
    let idx = 0, prev = 0, ax = 0, ay = 0;
    for (let i = 0; i < n; i++) {
      const cur = buf[idx];
      const avg = (1 - s) * cur + s * prev;
      prev = cur;
      const ap = C * avg + ax - C * ay; ax = avg; ay = ap;
      buf[idx] = ap * rho;
      if (++idx >= L) idx = 0;
      out[i] = cur;
    }
    return out;
  }
  function genHarp(f, sr, R) {
    const dur = clamp(6.5 * Math.pow(196 / f, 0.5), 1.4, 8);
    const out = ksString(f, sr, R, dur, dur * 0.7, 0.55, 0.22);
    // gentle body: one-pole lowpass + dc block
    const a = 1 - Math.exp(-TAU * Math.min(6000, f * 9) / sr);
    let y = 0, px = 0, py = 0;
    for (let i = 0; i < out.length; i++) {
      y += a * (out[i] - y);
      const hp = y - px + 0.995 * py; px = y; py = hp;
      out[i] = hp;
    }
    addNoise(out, sr, R, 0.04, 0.0005, 0.004, 4000, 500);
    fadeEdges(out, sr, 0.0008, 0.08);
    return normRms(out, 0.2, 0, Math.floor(0.25 * sr));
  }
  function genPluckBass(f, sr, R) {
    const dur = clamp(3.4 * Math.pow(82 / f, 0.3), 1.5, 4.5);
    const out = ksString(f, sr, R, dur, 2.2, 0.18, 0.15);
    const a = 1 - Math.exp(-TAU * Math.min(2200, f * 7) / sr);
    let y = 0, y2 = 0;
    for (let i = 0; i < out.length; i++) { y += a * (out[i] - y); y2 += a * (y - y2); out[i] = y2; }
    normRms(out, 0.2, 0, Math.floor(0.25 * sr));
    addSine(out, sr, f, 0.22, 0.25, 1.4, 0.4, 0);          // round fundamental
    addNoise(out, sr, R, 0.06, 0.001, 0.012, 900, 60);      // finger thump
    fadeEdges(out, sr, 0.0015, 0.1);
    return normRms(out, 0.22, 0, Math.floor(0.3 * sr));
  }
  function genMusicBox(f, sr, R) {
    const dur = clamp(3.2 * Math.pow(523 / f, 0.35), 1.2, 4.5);
    const out = new Float32Array(Math.floor(dur * sr));
    const tau = clamp(0.95 * Math.pow(523 / f, 0.55), 0.3, 2.2);
    addSine(out, sr, f, 1, tau * 0.25, tau, 0.25, R() * TAU);
    addSine(out, sr, f * 2.0, 0.08, tau * 0.3, tau * 0.5, 0.5, R() * TAU);
    addSine(out, sr, f * 3.0, 0.035, tau * 0.2, tau * 0.35, 0.5, R() * TAU);
    addSine(out, sr, f * 5.93, 0.2, 0.05, 0.14, 0.6, R() * TAU);
    addSine(out, sr, f * 16.8, 0.05, 0.012, 0.03, 0.7, R() * TAU);
    addNoise(out, sr, R, 0.12, 0.0003, 0.0025, 9000, 2500);
    fadeEdges(out, sr, 0.0004, 0.06);
    return normPeak(out, 0.85);
  }
  function genCelesta(f, sr, R) {
    const dur = clamp(3.4 * Math.pow(523 / f, 0.35), 1.2, 5);
    const out = new Float32Array(Math.floor(dur * sr));
    const tau = clamp(1.25 * Math.pow(523 / f, 0.45), 0.35, 2.6);
    addSine(out, sr, f, 1, tau * 0.3, tau, 0.3, R() * TAU);
    addSine(out, sr, f * 2.0, 0.07, 0.15, tau * 0.4, 0.5, R() * TAU);
    addSine(out, sr, f * 3.98, 0.2, 0.08, 0.26, 0.5, R() * TAU);
    addSine(out, sr, f * 8.92, 0.06, 0.02, 0.06, 0.6, R() * TAU);
    addNoise(out, sr, R, 0.05, 0.0008, 0.006, 3000, 400);
    fadeEdges(out, sr, 0.0012, 0.08);
    return normPeak(out, 0.85);
  }
  const BELL_PARTIALS = [ // [ratio to strike note, amp, decay scale]
    [0.5, 0.5, 1.0], [1.0, 0.75, 0.72], [1.19, 0.55, 0.55], [1.5, 0.28, 0.42], [2.0, 0.8, 0.46],
    [2.51, 0.26, 0.3], [2.66, 0.2, 0.26], [3.01, 0.22, 0.2], [4.07, 0.14, 0.13], [5.2, 0.08, 0.08], [6.35, 0.05, 0.05],
  ];
  function genBell(f, sr, R) {
    const tauBase = clamp(6.5 * Math.pow(147 / f, 0.5), 1.2, 9);
    const dur = clamp(tauBase * 2.4, 2.5, 14);
    const out = new Float32Array(Math.floor(dur * sr));
    for (const [ratio, amp, ts] of BELL_PARTIALS) {
      const fp = f * ratio, tau = tauBase * ts, beat = 0.25 + R() * 0.9;
      const ph = R() * TAU;
      addSine(out, sr, fp - beat * 0.3, amp * 0.68, tau * 0.25, tau, 0.25, ph);
      addSine(out, sr, fp + beat * 0.7, amp * 0.32, tau * 0.22, tau * 0.93, 0.25, ph);
    }
    for (const r of [7.4, 9.13, 11.3]) addSine(out, sr, f * r, 0.05, 0.015, 0.03, 0.6, R() * TAU);
    addNoise(out, sr, R, 0.18, 0.0005, 0.008, 6000, 1500);
    fadeEdges(out, sr, 0.0008, 0.3);
    return normPeak(out, 0.85);
  }
  const TIMP_MODES = [[1.0, 1.0, 1.0], [1.5, 0.5, 0.75], [1.98, 0.32, 0.55], [2.44, 0.2, 0.42], [2.9, 0.12, 0.33], [3.35, 0.08, 0.26]];
  function genTimpani(f, sr, R) {
    const out = new Float32Array(Math.floor(4.5 * sr));
    const tau = clamp(1.5 * Math.pow(98 / f, 0.3), 0.8, 2.4);
    for (const [ratio, amp, ts] of TIMP_MODES) addSineGlide(out, sr, f * ratio, 0.018, 0.07, amp, tau * ts, R() * TAU);
    addSineGlide(out, sr, f * 0.62, 0.08, 0.03, 0.7, 0.07, 0);
    addNoise(out, sr, R, 0.3, 0.001, 0.016, 700, 40);
    fadeEdges(out, sr, 0.001, 0.2);
    return normPeak(out, 0.85);
  }
  function genLowDrum(f, sr, R) {
    const out = new Float32Array(Math.floor(2.2 * sr));
    addSineGlide(out, sr, f, 1.3, 0.028, 1.0, 0.55, 0);
    addSineGlide(out, sr, f * 1.58, 0.6, 0.02, 0.25, 0.12, 1.1);
    addNoise(out, sr, R, 0.35, 0.0008, 0.014, 900, 30);
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 1.6) / Math.tanh(1.6);
    fadeEdges(out, sr, 0.0006, 0.2);
    return normPeak(out, 0.9);
  }
  const MEMBRANE = [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16, 3.5];
  function genFrameDrum(f, sr, R) {
    const out = new Float32Array(Math.floor(1.3 * sr));
    MEMBRANE.forEach((r, i) => addSineGlide(out, sr, f * r, 0.03, 0.04, i === 0 ? 1 : 0.55 / (i + 0.5), (i === 0 ? 0.32 : 0.16 / (1 + i * 0.3)), R() * TAU));
    addNoise(out, sr, R, 0.35, 0.0006, 0.009, 2500, 200);
    fadeEdges(out, sr, 0.0005, 0.15);
    return normPeak(out, 0.85);
  }
  function genBrush(f, sr, R) {
    const n = Math.floor(0.9 * sr), out = new Float32Array(n);
    // swish: slow-attack band noise; wires: brighter decaying noise; body: soft tone
    addNoise(out, sr, R, 0.5, 0.012, 0.11, 7000, 450);
    addNoise(out, sr, R, 0.22, 0.002, 0.06, 9000, 2500);
    addSine(out, sr, f, 0.12, 0.04, 0.06, 0.7, 0);
    fadeEdges(out, sr, 0.0005, 0.2);
    return normPeak(out, 0.8);
  }
  function genTick(f, sr, R) {
    const out = new Float32Array(Math.floor(0.25 * sr));
    addSine(out, sr, f, 0.7, 0.012, 0.03, 0.85, 0);
    addSine(out, sr, f * 2.71, 0.25, 0.006, 0.012, 0.9, 1);
    addNoise(out, sr, R, 0.4, 0.0002, 0.0018, 9000, 1800);
    fadeEdges(out, sr, 0.0002, 0.05);
    return normPeak(out, 0.8);
  }
  const ANVIL_MODES = [[1, 1, 1], [2.76, 0.55, 0.6], [5.4, 0.38, 0.35], [8.93, 0.22, 0.2], [13.34, 0.12, 0.12]];
  function genAnvil(f, sr, R) {
    const out = new Float32Array(Math.floor(3.5 * sr));
    const tau = clamp(1.4 * Math.pow(880 / f, 0.4), 0.4, 2.5);
    for (const [r, a, ts] of ANVIL_MODES) {
      const beat = 0.8 + R() * 2.5;
      const ph = R() * TAU;
      addSine(out, sr, f * r - beat * 0.3, a * 0.7, 0.05, tau * ts, 0.35, ph);
      addSine(out, sr, f * r + beat * 0.7, a * 0.3, 0.05, tau * ts * 0.9, 0.35, ph);
    }
    addNoise(out, sr, R, 0.6, 0.0002, 0.006, 12000, 2500);
    addNoise(out, sr, R, 0.25, 0.0004, 0.02, 800, 60);
    fadeEdges(out, sr, 0.0002, 0.2);
    return normPeak(out, 0.85);
  }
  /** Metallic cymbal texture: many inharmonic partials + bright noise. */
  function cymbalData(sr, R, seconds, tau) {
    const out = new Float32Array(Math.floor(seconds * sr));
    for (let i = 0; i < 70; i++) {
      const fr = 2800 * Math.pow(4.5, R());
      addSine(out, sr, fr, 0.02 + R() * 0.03, tau * (0.5 + R()), tau * (0.6 + R()), 0.5, R() * TAU);
    }
    addNoise(out, sr, R, 0.3, 0.001, tau * 0.8, 14000, 3500);
    return out;
  }
  function genCymbal(f, sr, R) {
    const out = cymbalData(sr, R, 5, 1.4);
    addNoise(out, sr, R, 0.4, 0.0005, 0.03, 9000, 1200);
    fadeEdges(out, sr, 0.0005, 0.3);
    return normPeak(out, 0.8);
  }
  function genCymbalLoop(f, sr, R) {
    const out = cymbalData(sr, R, 3.2, 1e6);
    return normRms(makeLoopable(out, Math.floor(0.2 * sr)), 0.25);
  }

  // ===========================================================================
  // 5. Instruments
  // ===========================================================================
  // Each instrument: { name, desc, range:[lo,hi] (MIDI), def (MIDI for 'x' hits), kind, params
  // (overridable numbers), chain (per-part insert effects), glide, play(e, dest, t, m, dur, vel, o) }.
  // play() returns a voice record (see Engine.addVoice) or null. o: { params, acc, glides, glideTime, pitch }.
  const INSTRUMENTS = {};
  function defInst(name, spec) {
    spec.name = name;
    spec.range = spec.range.map(noteToMidi);
    spec.def = noteToMidi(spec.def);
    spec.params = Object.assign({ gain: 1 }, spec.params || {});
    INSTRUMENTS[name] = spec;
    return spec;
  }
  function mkGain(c, v) { const n = c.createGain(); n.gain.value = v; return n; }
  function mkFilter(c, type, f, Q, gainDb) {
    const n = c.createBiquadFilter();
    n.type = type; n.frequency.value = f;
    if (Q !== undefined) n.Q.value = Q;
    if (gainDb !== undefined) n.gain.value = gainDb;
    return n;
  }
  function mkOsc(c, type, f, det) {
    const o = c.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    const ny = c.sampleRate * 0.49; // above Nyquist the browser clamps (and Chrome logs a warning); inaudible anyway
    o.frequency.value = isNum(f) ? clamp(f, -ny, ny) : f;
    if (det) o.detune.value = det;
    return o;
  }
  /** Linear attack, exponential decay to sustain, exponential release. Returns silent time. */
  function adsr(p, t, dur, a, d, s, r, peak) {
    const off = t + Math.max(0.01, dur);
    a = Math.max(0.002, a);
    p.setValueAtTime(0, t);
    if (off <= t + a) p.linearRampToValueAtTime(peak * (off - t) / a, off);
    else {
      p.linearRampToValueAtTime(peak, t + a);
      if (s < 0.999) p.setTargetAtTime(peak * s, t + a, Math.max(0.01, d / 3));
    }
    const tau = Math.max(0.006, r / 4.6);
    p.setTargetAtTime(0, off, tau);
    return off + tau * 7;
  }
  function lfoTo(e, params, t, end, rate, depth, delay, rise) {
    const c = e.ctx;
    const lfo = mkOsc(c, 'sine', rate * e.rr(0.94, 1.06));
    const dg = mkGain(c, 0);
    lfo.connect(dg);
    for (const p of params) dg.connect(p);
    dg.gain.setValueAtTime(0, t);
    if (delay > 0) dg.gain.setValueAtTime(0, t + delay);
    dg.gain.linearRampToValueAtTime(depth, t + (delay || 0) + Math.max(0.01, rise || 0.01));
    return lfo;
  }
  function applyGlides(freqs, t, glides, m0, gt, envParam, v0, sustain) {
    let prevF = mtof(m0);
    const a0 = velAmp(v0);
    for (const gl of glides) {
      const t1 = t + gl.at, f = mtof(gl.m);
      for (const fp of freqs) {
        fp.p.setValueAtTime(prevF * fp.mul, t1);
        fp.p.exponentialRampToValueAtTime(f * fp.mul, t1 + gt);
      }
      if (envParam && a0 > 0) envParam.setTargetAtTime(sustain * velAmp(gl.v) / a0, t1, gt);
      prevF = f;
    }
  }

  const VOWELS = { // alto-ish formant resonances [freq, Q, gain dB] (series peaking filters)
    ah: [[800, 3, 12], [1150, 4, 10], [2800, 5, 6]],
    oo: [[350, 3, 12], [700, 4, 6], [2600, 5, 0]],
  };
  const WAVES = {
    organ: [1, 0.6, 0.32, 0.42, 0.08, 0.18, 0.03, 0.14, 0.02, 0.05, 0.01, 0.06, 0, 0.02, 0, 0.03],
    glass: [1, 0, 0.32, 0, 0.13, 0, 0.06, 0, 0.025],
    reed: [1, 0.85, 0.62, 0.5, 0.4, 0.33, 0.27, 0.22, 0.18, 0.15, 0.12, 0.1, 0.08, 0.06],
  };

  /** Generic subtractive/additive voice driven by a recipe R (see instrument definitions below). */
  function synthVoice(e, dest, t, m, d, v, o, R) {
    const c = e.ctx, P = o.params;
    const f = mtof(m) * (o.pitch || 1);
    const srcs = [], freqs = [], detunes = [];
    const stereo = R.oscs.some((s) => s.side);
    const sum = stereo ? c.createChannelMerger(2) : mkGain(c, 1);
    const route = (node, side) => {
      if (!stereo) { node.connect(sum); return; }
      if (side < 0) node.connect(sum, 0, 0);
      else if (side > 0) node.connect(sum, 0, 1);
      else { node.connect(sum, 0, 0); node.connect(sum, 0, 1); }
    };
    for (const s of R.oscs) {
      const x = mkOsc(c, s.wave ? e.wave(s.wave) : (s.type || 'sawtooth'), f * (s.ratio || 1),
        (s.det || 0) + (s.rnd ? e.rr(-s.rnd, s.rnd) : 0));
      let out = x;
      if (s.gain !== undefined && s.gain !== 1) { out = mkGain(c, s.gain); x.connect(out); }
      route(out, s.side || 0);
      srcs.push(x); freqs.push({ p: x.frequency, mul: s.ratio || 1 }); detunes.push(x.detune);
    }
    const noises = [];
    const addNoiseSrc = (N, burst) => {
      const ns = c.createBufferSource();
      ns.buffer = noiseBuffer(c, N.color || 'white'); ns.loop = true;
      const nf = mkFilter(c, N.type || 'bandpass', N.f || f * (N.ratio || 2), N.Q || 1);
      const ng = mkGain(c, burst ? 0 : N.gain * num(P.breath, 1));
      ns.connect(nf); nf.connect(ng); route(ng, 0);
      if (burst) {
        ng.gain.setValueAtTime(0, t);
        ng.gain.linearRampToValueAtTime(N.gain * (o.acc ? 1.5 : 1), t + 0.004);
        ng.gain.setTargetAtTime(0, t + 0.004, N.time / 3);
      }
      noises.push(ns);
    };
    if (R.noise) addNoiseSrc(R.noise, false);
    if (R.chiff) addNoiseSrc(R.chiff, true);
    let node = sum;
    if (R.formants) {
      const vw = clamp(num(P.vowel, R.vowel || 0), 0, 1);
      const scale = m < 52 ? 0.86 : m < 60 ? 0.93 : 1;
      const lp = mkFilter(c, 'lowpass', lerp(3600, 1700, vw), 0.6);
      node.connect(lp); node = lp;
      for (let i = 0; i < 3; i++) {
        const A = VOWELS.ah[i], B = VOWELS.oo[i];
        const pk = mkFilter(c, 'peaking', lerp(A[0], B[0], vw) * scale, lerp(A[1], B[1], vw), lerp(A[2], B[2], vw));
        node.connect(pk); node = pk;
      }
    }
    let filt = null;
    if (R.filter) {
      const F = R.filter;
      const fc = clamp(f * (F.kf + (F.vel || 0) * v) * num(P.bright, 1) * (o.acc ? 1.15 : 1), F.min || 60, F.max || 16000);
      filt = mkFilter(c, F.type || 'lowpass', fc, F.Q || 0.707);
      node.connect(filt); node = filt;
      if (F.env) {
        filt.frequency.setValueAtTime(fc * F.env.from, t);
        if (F.env.peak) {
          filt.frequency.linearRampToValueAtTime(fc * F.env.peak, t + F.env.time);
          filt.frequency.setTargetAtTime(fc, t + F.env.time, F.env.time * 2);
        } else filt.frequency.setTargetAtTime(fc, t, F.env.time);
      }
    }
    if (R.hp) { const hp = mkFilter(c, 'highpass', R.hp, 0.6); node.connect(hp); node = hp; }
    const env = mkGain(c, 0);
    const vca = mkGain(c, velAmp(v) * R.gain * num(P.gain, 1));
    node.connect(env);
    let tail = env;
    const lfos = [];
    if (R.trem) {
      const tg = mkGain(c, 1 - R.trem.depth / 2);
      env.connect(tg); tail = tg;
      const lfo = mkOsc(c, 'sine', R.trem.rate * e.rr(0.9, 1.1));
      const lg = mkGain(c, R.trem.depth / 2);
      lfo.connect(lg); lg.connect(tg.gain); lfos.push(lfo);
    }
    tail.connect(vca); vca.connect(dest);
    const A = R.amp;
    const atk = num(P.attack, A.a) * (o.acc ? 0.6 : 1) * (R.velAttack ? lerp(1.3, 0.8, v) : 1);
    const sus = num(A.s, 1);
    const end = adsr(env.gain, t, d, atk, A.d || 0.3, sus, num(P.release, A.r), 1);
    if (R.vib) {
      const depth = R.vib.depth * num(P.vibrato, 1);
      if (depth > 0) lfos.push(lfoTo(e, detunes, t, end, R.vib.rate, depth, R.vib.delay, R.vib.rise));
    }
    if (R.drift) lfos.push(lfoTo(e, detunes.filter((_, i) => i % 2 === 0), t, end, e.rr(0.13, 0.31), R.drift, 0, 0.5));
    if (R.filterLfo && filt) {
      for (const rate of R.filterLfo.rates) lfos.push(lfoTo(e, [filt.detune], t, end, rate, R.filterLfo.cents, 0, 1));
    }
    if (o.glides) applyGlides(filt && !R.filter.env ? freqs.concat([{ p: filt.frequency, mul: filt.frequency.value / f }]) : freqs,
      t, o.glides, m, o.glideTime || R.glide || 0.06, env.gain, v, sus);
    for (const x of srcs) { x.start(t); x.stop(end + 0.02); }
    for (const x of lfos) { x.start(t); x.stop(end + 0.02); }
    for (const x of noises) { x.start(t, e.rr(0, 3.5)); x.stop(end + 0.02); }
    return e.addVoice(t, end, vca, srcs.concat(lfos, noises), 1);
  }

  /** Sample-bank voice: JS-rendered one-shot played with pitch shift, velocity filter, envelope. */
  function sampledVoice(e, dest, t, m, d, v, o, S) {
    const c = e.ctx, P = o.params;
    const slot = S.fixed !== undefined ? S.fixed : Math.round(m / S.step) * S.step;
    const buf = e.sample(S.name, slot, S.gen);
    if (!buf) return null;
    const rate = Math.pow(2, (m - slot) / 12) * (o.pitch || 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let node = src;
    if (S.cutoff) {
      const fc = clamp(S.cutoff(m, v) * num(P.bright, 1) * (o.acc ? 1.3 : 1), 80, 20000);
      if (fc < 19000) { const lp = mkFilter(c, 'lowpass', fc, 0.5); src.connect(lp); node = lp; }
    }
    const env = mkGain(c, 0);
    const vca = mkGain(c, velAmp(v) * S.gain * num(P.gain, 1) * (S.keyGain ? S.keyGain(m) : 1));
    node.connect(env); env.connect(vca);
    if (S.spread) {
      const pn = c.createStereoPanner();
      pn.pan.value = clamp((m - 64) / 30, -1, 1) * S.spread;
      vca.connect(pn); pn.connect(dest);
    } else vca.connect(dest);
    const atk = num(P.attack, S.attack || 0.002);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + atk);
    const bufEnd = t + buf.duration / rate;
    let end = bufEnd;
    if (!S.oneShot) {
      const off = Math.max(t + atk + 0.005, t + d);
      const tau = Math.max(0.01, num(P.release, S.release) / 4.6);
      env.gain.setTargetAtTime(0, off, tau);
      end = Math.min(bufEnd, off + tau * 7);
    }
    src.start(t);
    src.stop(end + 0.01);
    return e.addVoice(t, end, vca, [src], 1);
  }
  function defSampled(name, spec) {
    const S = spec.sample;
    S.name = name;
    if (S.fixed !== undefined) S.fixed = noteToMidi(S.fixed);
    spec.kind = spec.kind || 'sampled';
    spec.play = (e, dest, t, m, d, v, o) => sampledVoice(e, dest, t, m, d, v, o, S);
    spec.slotOf = (m) => (S.fixed !== undefined ? S.fixed : Math.round(m / S.step) * S.step);
    return defInst(name, spec);
  }
  function defSynth(name, spec) {
    const R = spec.recipe;
    spec.kind = spec.kind || 'synth';
    spec.glide = R.glide;
    spec.play = (e, dest, t, m, d, v, o) => synthVoice(e, dest, t, m, d, v, o, R);
    return defInst(name, spec);
  }

  // ---- sampled (JS-rendered) instruments ------------------------------------
  defSampled('felt_piano', {
    range: ['A0', 'C8'], def: 'C4', desc: 'Soft felt piano: muted hammer, warm, intimate; long natural decay.',
    params: { release: 0.35, bright: 1, attack: 0.002 },
    sample: { step: 3, gen: genFeltPiano, gain: 0.55, release: 0.35, spread: 0.35,
      cutoff: (m, v) => mtof(m) * (3 + 12 * v * v) + 900 * v, keyGain: (m) => clamp(1 + (60 - m) * 0.004, 0.85, 1.15) },
  });
  defSampled('music_box', {
    range: ['C4', 'C8'], def: 'C6', desc: 'Music-box comb: tiny bright tines, quick ping, ~2 s decay.',
    params: { release: 0.6 },
    sample: { step: 3, gen: genMusicBox, gain: 0.4, release: 0.6, spread: 0.3 },
  });
  defSampled('celesta', {
    range: ['C4', 'C8'], def: 'C6', desc: 'Celesta (struck steel bars): soft bell sparkle with a short shimmer.',
    params: { release: 0.7, bright: 1 },
    sample: { step: 3, gen: genCelesta, gain: 0.34, release: 0.7, spread: 0.35, cutoff: (m, v) => 2500 + 9000 * v },
  });
  defSampled('bell', {
    range: ['C2', 'C6'], def: 'D3', desc: 'Large church bell: hum, tierce and nominal partials; very long ring.',
    params: { release: 2.5 },
    sample: { step: 3, gen: genBell, gain: 0.42, release: 2.5, spread: 0.15, cutoff: (m, v) => 1800 + 9000 * v * v },
  });
  defSampled('harp', {
    range: ['C2', 'C7'], def: 'C4', desc: 'Concert harp pluck (Karplus-Strong): round, ringing.',
    params: { release: 0.5, bright: 1 },
    sample: { step: 3, gen: genHarp, gain: 0.65, release: 0.5, spread: 0.4, cutoff: (m, v) => mtof(m) * (3 + 10 * v) + 600 },
  });
  defSampled('pluck_bass', {
    range: ['E1', 'G3'], def: 'D2', desc: 'Plucked upright-style bass: soft thump, round body.',
    params: { release: 0.12, bright: 1 },
    sample: { step: 3, gen: genPluckBass, gain: 0.6, release: 0.12, cutoff: (m, v) => 500 + 1800 * v },
  });
  defSampled('timpani', {
    range: ['C2', 'C4'], def: 'D2', desc: 'Timpani: tuned kettle drum with felt mallet; booming.',
    params: { release: 1.2 },
    sample: { step: 2, gen: genTimpani, gain: 0.35, release: 1.2, cutoff: (m, v) => 500 + 5000 * v * v },
  });
  defSampled('low_drum', {
    range: ['C1', 'C3'], def: 'G1', desc: 'Big low drum (taiko-like): deep pitch-drop boom.',
    kind: 'perc', sample: { fixed: 'G1', gen: genLowDrum, gain: 0.42, oneShot: true, cutoff: (m, v) => 600 + 6000 * v * v },
  });
  defSampled('frame_drum', {
    range: ['C2', 'C4'], def: 'A2', desc: 'Frame drum / hand drum: warm thump with a skin slap.',
    kind: 'perc', sample: { fixed: 'A2', gen: genFrameDrum, gain: 0.55, oneShot: true, cutoff: (m, v) => 900 + 9000 * v * v },
  });
  defSampled('snare_brush', {
    range: ['C3', 'C5'], def: 'G3', desc: 'Brushed snare: soft swish with wire hiss.',
    kind: 'perc', sample: { fixed: 'G3', gen: genBrush, gain: 0.45, oneShot: true, cutoff: (m, v) => 3000 + 10000 * v },
  });
  defSampled('tick', {
    range: ['C5', 'C8'], def: 'C7', desc: 'Tiny woody/clock tick for pulses.',
    kind: 'perc', sample: { fixed: 'C7', gen: genTick, gain: 0.6, oneShot: true },
  });
  defSampled('anvil', {
    range: ['C4', 'C7'], def: 'A5', desc: 'Struck anvil / metal bar: bright clang, shimmering ring.',
    kind: 'perc', sample: { step: 3, gen: genAnvil, gain: 0.5, oneShot: true, spread: 0.2, cutoff: (m, v) => 2500 + 14000 * v * v },
  });
  defSampled('cymbal', {
    range: ['C3', 'C6'], def: 'C4', desc: 'Suspended cymbal crash: soft mallet roll-hit with long wash.',
    kind: 'perc', sample: { fixed: 'C4', gen: genCymbal, gain: 0.3, oneShot: true, cutoff: (m, v) => 4000 + 12000 * v },
  });

  // ---- synth (node graph) instruments ---------------------------------------
  defSynth('strings', {
    range: ['C2', 'C7'], def: 'D4', desc: 'String ensemble pad: 4 detuned saws, stereo, slow bow attack.',
    params: { attack: 0.35, release: 0.9, bright: 1 },
    chain: [{ t: 'peaking', f: 380, q: 1, g: 1.5 }, { t: 'highshelf', f: 4200, g: -6 }, { t: 'chorus', mix: 0.35, rate: 0.6, depth: 2.5 }],
    recipe: {
      gain: 0.14, glide: 0.05, drift: 4,
      oscs: [{ type: 'sawtooth', det: -11, side: -1, rnd: 2 }, { type: 'sawtooth', det: -3, side: 1, rnd: 2 },
        { type: 'sawtooth', det: 5, side: -1, rnd: 2 }, { type: 'sawtooth', det: 12, side: 1, rnd: 2 }],
      filter: { kf: 3, vel: 3, min: 700, max: 8000, Q: 0.6, env: { from: 0.5, time: 0.25 } },
      amp: { a: 0.35, d: 0.5, s: 0.92, r: 0.9 }, velAttack: true,
    },
  });
  defSynth('cello', {
    range: ['C2', 'A5'], def: 'D3', desc: 'Solo cello: warm legato lead with delayed vibrato and bow noise.',
    params: { attack: 0.12, release: 0.3, vibrato: 1, bright: 1, breath: 1 },
    chain: [{ t: 'peaking', f: 260, q: 1.1, g: 3 }, { t: 'peaking', f: 1400, q: 1.2, g: 1.5 }, { t: 'highshelf', f: 3500, g: -7 }],
    recipe: {
      gain: 0.11, glide: 0.035, hp: 55,
      oscs: [{ type: 'sawtooth' }, { wave: 'reed', gain: 0.45 }],
      noise: { color: 'white', type: 'bandpass', f: 2600, Q: 0.8, gain: 0.02 },
      filter: { kf: 5, vel: 3, min: 700, max: 3600, Q: 0.9, env: { from: 0.6, time: 0.08 } },
      amp: { a: 0.12, d: 0.6, s: 0.85, r: 0.3 }, velAttack: true,
      vib: { rate: 5.2, depth: 13, delay: 0.25, rise: 0.45 },
    },
  });
  defSynth('violin', {
    range: ['G3', 'E7'], def: 'A4', desc: 'Solo violin: singing, slightly bright, expressive vibrato.',
    params: { attack: 0.09, release: 0.25, vibrato: 1, bright: 1, breath: 1 },
    chain: [{ t: 'peaking', f: 2800, q: 1.4, g: 2 }, { t: 'highshelf', f: 6000, g: -8 }],
    recipe: {
      gain: 0.12, glide: 0.03, hp: 180,
      oscs: [{ type: 'sawtooth' }, { wave: 'reed', gain: 0.35 }],
      noise: { color: 'white', type: 'bandpass', f: 4000, Q: 0.8, gain: 0.015 },
      filter: { kf: 5.5, vel: 3, min: 1500, max: 7000, Q: 0.8, env: { from: 0.6, time: 0.07 } },
      amp: { a: 0.09, d: 0.5, s: 0.88, r: 0.25 }, velAttack: true,
      vib: { rate: 5.8, depth: 16, delay: 0.2, rise: 0.35 },
    },
  });
  defSynth('choir', {
    range: ['C3', 'C6'], def: 'A4', desc: "Choir 'ah' (formant-filtered saws); param vowel 0=ah..1=oo.",
    params: { attack: 0.5, release: 1.2, vowel: 0, vibrato: 1 },
    chain: [{ t: 'chorus', mix: 0.4, rate: 0.45, depth: 3 }],
    recipe: {
      gain: 0.09, glide: 0.05, vowel: 0, drift: 6,
      oscs: [{ type: 'sawtooth', det: -7, side: -1, rnd: 3 }, { type: 'sawtooth', det: 7, side: 1, rnd: 3 }, { type: 'sawtooth', gain: 0.6, rnd: 2 }],
      noise: { color: 'white', type: 'highpass', f: 3500, Q: 0.7, gain: 0.025 },
      formants: true, hp: 140,
      amp: { a: 0.5, d: 0.6, s: 0.9, r: 1.2 },
      vib: { rate: 4.8, depth: 9, delay: 0.3, rise: 0.8 },
    },
  });
  defSynth('choir_oo', {
    range: ['C3', 'C6'], def: 'A4', desc: "Choir 'oo': darker, hushed formant voices.",
    params: { attack: 0.6, release: 1.4, vowel: 1, vibrato: 1 },
    chain: [{ t: 'chorus', mix: 0.4, rate: 0.45, depth: 3 }],
    recipe: {
      gain: 0.12, glide: 0.05, vowel: 1, drift: 6,
      oscs: [{ type: 'sawtooth', det: -7, side: -1, rnd: 3 }, { type: 'sawtooth', det: 7, side: 1, rnd: 3 }, { type: 'sawtooth', gain: 0.6, rnd: 2 }],
      noise: { color: 'white', type: 'highpass', f: 3000, Q: 0.7, gain: 0.02 },
      formants: true, hp: 120,
      amp: { a: 0.6, d: 0.6, s: 0.9, r: 1.4 },
      vib: { rate: 4.6, depth: 8, delay: 0.35, rise: 0.9 },
    },
  });
  defSynth('organ', {
    range: ['C2', 'C7'], def: 'C4', desc: 'Soft pipe organ (flue stops + 16ft sub) with a breathy chiff.',
    params: { attack: 0.05, release: 0.22 },
    recipe: {
      gain: 0.11,
      oscs: [{ wave: 'organ' }, { wave: 'organ', det: 3, gain: 0.7 }, { type: 'sine', ratio: 0.5, gain: 0.35 }],
      chiff: { color: 'white', type: 'bandpass', ratio: 3, Q: 2, gain: 0.08, time: 0.04 },
      filter: { kf: 8, min: 2000, max: 9000, Q: 0.5 },
      amp: { a: 0.05, d: 0.2, s: 1, r: 0.22 },
    },
  });
  defSynth('flute', {
    range: ['C4', 'C7'], def: 'D5', desc: 'Breathy wooden flute: soft chiff, airy tone, gentle vibrato.',
    params: { attack: 0.07, release: 0.18, vibrato: 1, breath: 1 },
    recipe: {
      gain: 0.15, glide: 0.022,
      oscs: [{ type: 'triangle' }, { type: 'sine', ratio: 2, gain: 0.12 }],
      noise: { color: 'white', type: 'bandpass', ratio: 2, Q: 2.5, gain: 0.05 },
      chiff: { color: 'white', type: 'bandpass', ratio: 3, Q: 1.5, gain: 0.12, time: 0.035 },
      filter: { kf: 4, min: 1500, max: 7000, Q: 0.5 },
      amp: { a: 0.07, d: 0.3, s: 0.9, r: 0.18 }, velAttack: true,
      vib: { rate: 5, depth: 9, delay: 0.3, rise: 0.4 }, trem: { rate: 5, depth: 0.06 },
    },
  });
  defSynth('warm_pad', {
    range: ['C2', 'C6'], def: 'D3', desc: 'Warm analog pad: soft saws through a dark filter; slow swell.',
    params: { attack: 1.2, release: 2, bright: 1 },
    chain: [{ t: 'chorus', mix: 0.4, rate: 0.35, depth: 3.5 }],
    recipe: {
      gain: 0.14, drift: 5,
      oscs: [{ type: 'sawtooth', det: -8, side: -1, rnd: 2 }, { type: 'sawtooth', det: 8, side: 1, rnd: 2 }, { type: 'triangle', ratio: 0.5, gain: 0.5 }],
      filter: { kf: 3, vel: 1.5, min: 300, max: 2200, Q: 0.7, env: { from: 0.4, time: 0.8 } },
      amp: { a: 1.2, d: 1, s: 0.9, r: 2.0 },
    },
  });
  defSynth('glass_pad', {
    range: ['C3', 'C7'], def: 'A4', desc: 'Glass pad: hollow, shimmering, crystalline sustain.',
    params: { attack: 0.9, release: 1.8, bright: 1 },
    chain: [{ t: 'chorus', mix: 0.45, rate: 0.5, depth: 2 }],
    recipe: {
      gain: 0.12, drift: 3,
      oscs: [{ wave: 'glass', det: -6, side: -1 }, { wave: 'glass', det: 6, side: 1 }, { type: 'sine', ratio: 2, gain: 0.25 }],
      filter: { kf: 8, min: 2500, max: 9000, Q: 0.5 },
      amp: { a: 0.9, d: 1, s: 0.85, r: 1.8 }, trem: { rate: 3.7, depth: 0.12 },
    },
  });
  defSynth('brass', {
    range: ['E1', 'F4'], def: 'D2', desc: 'Low brass swell (horns/trombones): dark, rises with velocity.',
    params: { attack: 0.18, release: 0.35, vibrato: 1, bright: 1 },
    chain: [{ t: 'peaking', f: 500, q: 1, g: 2.5 }, { t: 'lowpass', f: 3200, q: 0.6 }],
    recipe: {
      gain: 0.12, glide: 0.04,
      oscs: [{ type: 'sawtooth', det: -3 }, { type: 'sawtooth', det: 3 }, { wave: 'reed', gain: 0.5 }],
      filter: { kf: 2.4, vel: 3, min: 250, max: 3200, Q: 1.2, env: { from: 0.35, time: 0.18, peak: 1.25 } },
      amp: { a: 0.18, d: 0.6, s: 0.85, r: 0.35 }, velAttack: true,
      vib: { rate: 4.6, depth: 6, delay: 0.5, rise: 0.6 },
    },
  });
  defSynth('sub_bass', {
    range: ['C0', 'C3'], def: 'D1', desc: 'Sub bass: clean sine weight with a hint of harmonic.',
    params: { attack: 0.015, release: 0.18 },
    recipe: {
      gain: 0.17, glide: 0.03,
      oscs: [{ type: 'sine' }, { type: 'sine', ratio: 2, gain: 0.12 }],
      filter: { kf: 4, min: 120, max: 400, Q: 0.5 },
      amp: { a: 0.015, d: 0.3, s: 1, r: 0.18 },
    },
  });
  defSynth('drone', {
    range: ['C1', 'C4'], def: 'D2', desc: 'Evolving drone: detuned saws through a slowly wandering filter.',
    params: { attack: 2.5, release: 3, bright: 1 },
    recipe: {
      gain: 0.13, drift: 6,
      oscs: [{ type: 'sawtooth', det: -6, side: -1 }, { type: 'sawtooth', det: 6, side: 1 },
        { type: 'sawtooth', ratio: 0.5, det: 2, gain: 0.6 }, { type: 'sine', ratio: 0.5, gain: 0.5 }],
      filter: { kf: 2, min: 150, max: 1500, Q: 1.6 },
      filterLfo: { rates: [0.031, 0.047], cents: 700 },
      amp: { a: 2.5, d: 2, s: 0.9, r: 3.0 },
    },
  });

  // ---- special (custom) voices ----------------------------------------------
  defInst('cymbal_swell', {
    range: ['C3', 'C6'], def: 'C4', kind: 'perc',
    desc: 'Reverse-cymbal swell: rises over the note length and cuts off at its end.',
    params: { release: 0.25 },
    play(e, dest, t, m, d, v, o) {
      const c = e.ctx;
      const buf = e.sample('cymbal_loop', 60, genCymbalLoop);
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.playbackRate.value = clamp(Math.pow(2, (m - 60) / 12), 0.5, 2) * (o.pitch || 1);
      const lp = mkFilter(c, 'lowpass', 2500, 0.6);
      const env = mkGain(c, 0), vca = mkGain(c, velAmp(v) * 0.3 * num(o.params.gain, 1));
      src.connect(lp); lp.connect(env); env.connect(vca); vca.connect(dest);
      const dur = Math.max(0.2, d);
      lp.frequency.setValueAtTime(2200, t);
      lp.frequency.exponentialRampToValueAtTime(14000, t + dur);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1, t + dur);
      const tau = Math.max(0.01, num(o.params.release, 0.25) / 4.6);
      env.gain.setTargetAtTime(0, t + dur, tau);
      const end = t + dur + tau * 7;
      src.start(t, e.rr(0, 2)); src.stop(end + 0.01);
      return e.addVoice(t, end, vca, [src], 1);
    },
  });
  defInst('noise_riser', {
    range: ['C5', 'C8'], def: 'C7', kind: 'perc',
    desc: 'Filtered-noise riser: sweeps up over the note length (transitions, builds).',
    params: { release: 0.15 },
    play(e, dest, t, m, d, v, o) {
      const c = e.ctx;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c, 'white'); src.loop = true;
      const bp = mkFilter(c, 'bandpass', 200, 1.8), lp = mkFilter(c, 'lowpass', 400, 0.5);
      const env = mkGain(c, 0), vca = mkGain(c, velAmp(v) * 0.55 * num(o.params.gain, 1));
      src.connect(bp); bp.connect(lp); lp.connect(env); env.connect(vca); vca.connect(dest);
      const dur = Math.max(0.2, d), top = clamp(mtof(m) * 3, 1500, 14000);
      bp.frequency.setValueAtTime(180, t); bp.frequency.exponentialRampToValueAtTime(top, t + dur);
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(Math.min(18000, top * 2), t + dur);
      env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(1, t + dur);
      const tau = Math.max(0.01, num(o.params.release, 0.15) / 4.6);
      env.gain.setTargetAtTime(0, t + dur, tau);
      const end = t + dur + tau * 7;
      src.start(t, e.rr(0, 3)); src.stop(end + 0.01);
      return e.addVoice(t, end, vca, [src], 1);
    },
  });

  // ===========================================================================
  // 6. Engine — one per AudioContext (the realtime context or an OfflineAudioContext)
  // ===========================================================================
  const BUS_NAMES = ['music', 'sfx', 'ambience'];
  const REVERB_RETURN = 0.55;  // wet return level of the hall
  const MASTER_TRIM_DB = -3.16; // measured: cancels the DynamicsCompressor's automatic makeup gain (unity below threshold)
  const TRACKS = Object.create(null);
  const STINGERS = Object.create(null);
  const SFX = Object.create(null);
  const AMBIENCE = Object.create(null);

  function softClipCurve() {
    const n = 4097, curve = new Float32Array(n), knee = 0.75, ceil = 0.89;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 4 - 2; // input domain -2..2 (a 0.5 pre-gain maps it onto -1..1)
      const ax = Math.abs(x);
      const y = ax <= knee ? ax : knee + (ceil - knee) * Math.tanh((ax - knee) / (ceil - knee));
      curve[i] = x < 0 ? -y : y;
    }
    return curve;
  }
  function holdParam(p, t) {
    if (p.cancelAndHoldAtTime) { try { p.cancelAndHoldAtTime(t); return; } catch (e) { /* fall back */ } }
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }

  class Engine {
    constructor(ctx, opts) {
      opts = opts || {};
      this.ctx = ctx;
      this.offline = !!opts.offline;
      this.R = makeRng(opts.seed !== undefined ? opts.seed : nextSeed());
      this.voices = [];
      this.players = [];
      this.ambs = [];
      this.waves = {};
      this.muted = false;
      this.duckLevel = 0;
      this.duckUntil = 0;
      this.lateDrops = 0;            // music notes skipped because the scheduler ran late (main-thread stall)
      this._build();
    }
    rr(a, b) { return a + (b - a) * this.R(); }
    now() { return this.ctx.currentTime; }
    wave(name) {
      if (this.waves[name]) return this.waves[name];
      const amps = WAVES[name] || [1];
      const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1);
      for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
      return (this.waves[name] = this.ctx.createPeriodicWave(real, imag));
    }
    sample(name, slot, gen) {
      return cachedBuffer(this.ctx, 'smp:' + name + ':' + slot, (sr) => gen(mtof(slot), sr, makeRng(hash32(name + ':' + slot))));
    }
    _build() {
      const c = this.ctx;
      this.master = mkGain(c, 1);
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 5;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      const trim = mkGain(c, dbToGain(MASTER_TRIM_DB));
      const pre = mkGain(c, 0.5);
      const clip = c.createWaveShaper();
      clip.curve = softClipCurve(); clip.oversample = 'none';
      this.master.connect(comp); comp.connect(trim); trim.connect(pre); pre.connect(clip); clip.connect(c.destination);
      this.comp = comp; this.trim = trim;
      // global hall reverb
      this.reverbIn = mkGain(c, 1);
      const rhp = mkFilter(c, 'highpass', 150, 0.6), rlp = mkFilter(c, 'lowpass', 6500, 0.5);
      const conv = c.createConvolver();
      conv.normalize = false;
      conv.buffer = reverbIR(c);
      this.reverbOut = mkGain(c, REVERB_RETURN);
      this.reverbIn.connect(rhp); rhp.connect(rlp); rlp.connect(conv); conv.connect(this.reverbOut); this.reverbOut.connect(this.master);
      // buses (dry + wet paths share one user volume)
      this.bus = {};
      for (const name of BUS_NAMES) {
        const b = { in: mkGain(c, 1), wet: mkGain(c, 1), vol: mkGain(c, 1), wetVol: mkGain(c, 1) };
        b.in.connect(b.vol); b.vol.connect(this.master);
        b.wet.connect(b.wetVol); b.wetVol.connect(this.reverbIn);
        this.bus[name] = b;
      }
      // duck stages: music players and ambience go through these; stingers & sfx do not
      this.musicIn = mkGain(c, 1); this.musicWet = mkGain(c, 1);
      this.musicIn.connect(this.bus.music.in); this.musicWet.connect(this.bus.music.wet);
      this.ambIn = mkGain(c, 1); this.ambWet = mkGain(c, 1);
      this.ambIn.connect(this.bus.ambience.in); this.ambWet.connect(this.bus.ambience.wet);
      this.duckNodes = [this.musicIn, this.musicWet, this.ambIn, this.ambWet];
    }
    setBusVolume(name, g, tau) {
      const b = this.bus[name], now = this.ctx.currentTime;
      if (!b) return;
      for (const n of [b.vol, b.wetVol]) {
        n.gain.cancelScheduledValues(now);
        n.gain.setTargetAtTime(g, now, tau || 0.03);
      }
    }
    setMaster(g, tau) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(g, now, tau || 0.03);
    }
    duck(amount, sec) {
      const now = this.ctx.currentTime;
      amount = clamp(num(amount, 0.5), 0, 1);
      sec = clamp(num(sec, 1), 0.05, 60);
      const active = now < this.duckUntil;
      const level = active ? Math.max(this.duckLevel, amount) : amount;
      const until = Math.max(active ? this.duckUntil : 0, now + sec);
      this.duckLevel = level; this.duckUntil = until;
      for (const n of this.duckNodes) {
        holdParam(n.gain, now);
        n.gain.setTargetAtTime(1 - level, now, 0.05);
        n.gain.setTargetAtTime(1, until, 0.25);
      }
    }

    // ---- voices: global cap with stealing ------------------------------------
    addVoice(t, end, vca, srcs, prio) {
      const vs = this.voices;
      let w = 0, count = 0;
      for (let i = 0; i < vs.length; i++) {
        const x = vs[i];
        if (x.end > t) { vs[w++] = x; if (!x.killed && x.start <= t + 1e-3) count++; }
      }
      vs.length = w;
      if (count >= MAX_VOICES) this._steal(t, prio);
      const rec = { start: t, end, vca, srcs, prio, killed: false };
      vs.push(rec);
      return rec;
    }
    _steal(t, prio) {
      let victim = null, best = Infinity;
      for (const x of this.voices) {
        if (x.killed || x.start > t + 1e-3) continue;
        const score = x.prio * 1000 + Math.min(999, x.end - t);
        if (score < best) { best = score; victim = x; }
      }
      if (victim && victim.prio <= prio + 1) this.kill(victim, t, 0.01);
    }
    kill(x, t, tau) {
      if (!x || x.killed) return;
      x.killed = true;
      t = Math.max(t, this.ctx.currentTime);
      try { holdParam(x.vca.gain, t); x.vca.gain.setTargetAtTime(0, t, tau || 0.01); } catch (e) { /* ignore */ }
      const stopAt = t + (tau || 0.01) * 8 + 0.01;
      for (const s of x.srcs) { try { s.stop(stopAt); } catch (e) { /* already stopped */ } }
      x.end = Math.min(x.end, stopAt);
    }
    activeVoices() {
      const now = this.ctx.currentTime;
      let n = 0;
      for (const x of this.voices) if (!x.killed && x.start <= now && x.end > now) n++;
      return n;
    }

    // ---- scheduling ------------------------------------------------------------
    pump(until) {
      const now = this.ctx.currentTime;
      for (const p of this.players) p.pump(until, now);
      for (const a of this.ambs) a.pump(until, now);
      if (!this.offline) {
        if (this.players.some((p) => p.isDone(now))) this.players = this.players.filter((p) => (p.isDone(now) ? (p.dispose(), false) : true));
        if (this.ambs.some((a) => a.isDone(now))) this.ambs = this.ambs.filter((a) => (a.isDone(now) ? (a.dispose(), false) : true));
      }
    }
    setMusic(track, fade, layer) {
      const now = this.ctx.currentTime;
      let keep = null;
      if (track) {
        keep = this.players.find((p) => p.kind === 'music' && p.track === track && !p.disposed && now < p.stopAt);
        if (keep) keep.revive(now, fade);
      }
      for (const p of this.players) if (p.kind === 'music' && p !== keep && p.stopAt === Infinity) p.fadeOut(now, fade);
      if (track && !keep) {
        // give the idle generator a head start on missing sample banks (no hitch at region changes)
        const missing = this.prewarm(track, true);
        const delay = this.offline ? 0.06 : Math.min(0.6, 0.06 + 0.04 * missing);
        const p = new TrackPlayer(this, track, { start: now + delay, fade, layer, kind: 'music' });
        this.players.push(p);
      }
    }
    setLayer(level) {
      const now = this.ctx.currentTime;
      for (const p of this.players) if (p.kind === 'music') p.setLayer(level, now);
    }
    playStinger(track, opts) {
      const now = this.ctx.currentTime;
      const p = new TrackPlayer(this, track, { start: now + 0.03, fade: 0, kind: 'stinger', vol: num(opts && opts.vol, 1),
        dest: this.bus.music.in, destWet: this.bus.music.wet });
      this.players.push(p);
      const len = track.intro.len + track.body.len;
      if (track.duck > 0) this.duck(track.duck, len + 0.3);
      return p;
    }
    setAmbience(def, id, fade) {
      const now = this.ctx.currentTime;
      let keep = null;
      if (def) {
        keep = this.ambs.find((a) => a.id === id && !a.disposed && now < a.stopAt);
        if (keep) keep.revive(now, fade);
      }
      for (const a of this.ambs) if (a !== keep && a.stopAt === Infinity) a.fadeOut(now, fade);
      if (def && !keep) this.ambs.push(new AmbiencePlayer(this, id, def, { start: now + 0.05, fade }));
    }
    playSfx(name, opts, t) {
      const def = SFX[name];
      if (!def) return null;
      opts = opts || {};
      const kit = new Kit(this, num(t, this.ctx.currentTime) + Math.max(0, num(opts.delay, 0)), this.bus.sfx.in, this.bus.sfx.wet, {
        vol: num(def.vol, 1) * clamp(num(opts.vol, 1), 0, 4), pan: opts.pan, pitch: clamp(num(opts.pitch, 1), 0.25, 4),
        reverb: num(def.reverb, 0.12),
      });
      def.play(kit, opts);
      return this.addVoice(kit.t, kit.end, kit.vca, kit.srcs, num(def.prio, 2));
    }
    /**
     * Queue the sample banks a track needs, in order of first use (realtime only; offline renders
     * generate lazily). front = jump the queue. Returns how many banks are still missing.
     */
    prewarm(track, front) {
      if (this.offline || !track) return 0;
      const jobs = [];
      const seen = new Set();
      for (const list of [track.intro.events, track.body.events]) {
        for (const ev of list) {
          const I = INSTRUMENTS[track.parts[ev.p].inst];
          if (!I || !I.sample) continue;
          const slot = I.slotOf(ev.m), key = I.name + ':' + slot;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!hasBuffer(this.ctx, 'smp:' + key)) jobs.push([I, slot]);
        }
      }
      if (front) jobs.reverse();
      for (const [I, slot] of jobs) queueSample(this, I, slot, front);
      return jobs.length;
    }
  }

  // Idle-time generation of sample banks / noise / ambience textures (avoids frame hitches when a
  // track, sfx or bed first needs them). Jobs are atomic; a slice runs jobs for up to ~8 ms.
  const genQueue = [];
  let genTimer = null;
  function queueJob(key, ctx, fn, front) {
    if (hasBuffer(ctx, key) || genQueue.some((j) => j.key === key && j.ctx === ctx)) return;
    const job = { key, ctx, fn };
    if (front) genQueue.unshift(job); else genQueue.push(job);
    if (!genTimer && typeof setTimeout === 'function') genTimer = setTimeout(runQueue, 30);
  }
  function queueSample(e, I, slot, front) {
    queueJob('smp:' + I.name + ':' + slot, e.ctx, () => e.sample(I.name, slot, I.sample.gen), front);
  }
  function runQueue() {
    genTimer = null;
    const t0 = Date.now();
    while (genQueue.length && Date.now() - t0 < 8) {
      const job = genQueue.shift();
      if (hasBuffer(job.ctx, job.key)) continue;
      try { job.fn(); } catch (err) { reportOnce(err, 'prewarm:' + job.key); }
    }
    if (genQueue.length) genTimer = setTimeout(runQueue, 40);
  }
  /** Kit stand-in that only records which instrument samples a sound would use (for prewarming). */
  function probeKit(e) {
    const noop = () => null;
    return {
      t: 0, p: 1, R: () => 0.5, r: (a, b) => (a + b) / 2, pick: (arr) => arr[0], reverb() { return this; },
      tone: noop, noise: noop, play: noop, buffer: noop,
      inst(name, note) {
        const I = INSTRUMENTS[name];
        const m = typeof note === 'string' ? noteToMidi(note) : note;
        if (I && I.sample && isNum(m)) queueSample(e, I, I.slotOf(m));
        return null;
      },
    };
  }
  /** Queue everything sfx / stingers / ambience need, cheapest-to-hitch first. */
  function prewarmAll(e) {
    const c = e.ctx;
    for (const color of ['white', 'pink', 'brown']) queueJob('noise:' + color, c, () => noiseBuffer(c, color));
    const kit = probeKit(e);
    for (const name of Object.keys(SFX)) { try { SFX[name].play(kit, {}); } catch (err) { /* probing only */ } }
    for (const id of Object.keys(AMBIENCE)) {
      const def = AMBIENCE[id];
      for (const L of def.layers || []) {
        if (L.gen) { const key = 'amb:' + (L.key || id); queueJob(key, c, () => cachedBuffer(c, key, (sr) => L.gen(sr, makeRng(hash32(key))))); }
      }
      for (const ev of def.events || []) { try { ev.play(kit); } catch (err) { /* probing only */ } }
    }
    for (const name of Object.keys(STINGERS)) e.prewarm(STINGERS[name]);
  }

  function makeChorus(c, mix, rate, depthMs) {
    const input = mkGain(c, 1), output = mkGain(c, 1);
    const dry = mkGain(c, 1);
    input.connect(dry); dry.connect(output);
    const merger = c.createChannelMerger(2);
    const lfos = [];
    for (let ch = 0; ch < 2; ch++) {
      const dl = c.createDelay(0.1);
      dl.delayTime.value = 0.013 + ch * 0.0067;
      const lfo = mkOsc(c, 'sine', rate * (ch ? 1.13 : 0.89));
      const lg = mkGain(c, depthMs / 1000);
      lfo.connect(lg); lg.connect(dl.delayTime);
      const wg = mkGain(c, mix);
      input.connect(dl); dl.connect(wg); wg.connect(merger, 0, ch);
      lfos.push(lfo);
    }
    merger.connect(output);
    return { input, output, lfos };
  }

  // ===========================================================================
  // 7. TrackPlayer — sample-accurate sequencer for one compiled track instance
  // ===========================================================================
  class TrackPlayer {
    constructor(e, track, opts) {
      const c = e.ctx;
      this.e = e; this.track = track; this.kind = opts.kind || 'music';
      this.t0 = num(opts.start, c.currentTime + 0.06);
      this.level = num(opts.layer, 0);
      this.stopAt = Infinity; this.endAt = Infinity; this.disposed = false;
      this.vol = track.volume * num(opts.vol, 1) * MUSIC_MAKEUP;
      this.dry = mkGain(c, 0); this.wet = mkGain(c, 0);
      this.dry.connect(opts.dest || e.musicIn); this.wet.connect(opts.destWet || e.musicWet);
      this.lfos = [];
      this.myVoices = [];
      this.delayIn = null;
      if (track.delay) this._buildDelay(track.delay);
      this.chans = track.parts.map((p) => this._channel(p));
      this.lastVoice = track.parts.map(() => new Map());
      this.phase = track.intro.len > 0 ? 'intro' : 'body';
      this.iter = 0; this.idx = 0;
      const fade = Math.max(0, num(opts.fade, 0));
      for (const gn of [this.dry, this.wet]) {
        gn.gain.setValueAtTime(fade > 0 ? 0 : this.vol, this.t0);
        if (fade > 0) gn.gain.linearRampToValueAtTime(this.vol, this.t0 + fade);
      }
      for (const l of this.lfos) l.start(this.t0);
    }
    _audible(p) { return this.level >= p.layer - 1e-9 && this.level < p.layerMax; }
    _channel(p) {
      const c = this.e.ctx, inst = INSTRUMENTS[p.inst];
      const input = mkGain(c, p.vol);
      let node = input;
      for (const fx of inst.chain || []) {
        if (fx.t === 'chorus') {
          const ch = makeChorus(c, fx.mix, fx.rate, fx.depth);
          node.connect(ch.input); node = ch.output;
          for (const l of ch.lfos) this.lfos.push(l);
        } else {
          const f = mkFilter(c, fx.t, fx.f, fx.q !== undefined ? fx.q : 0.7, fx.g);
          node.connect(f); node = f;
        }
      }
      const on = this._audible(p);
      const layer = mkGain(c, on ? 1 : 0);
      const pan = c.createStereoPanner();
      pan.pan.value = p.pan;
      node.connect(layer); layer.connect(pan); pan.connect(this.dry);
      if (p.reverb > 0) { const s = mkGain(c, p.reverb); pan.connect(s); s.connect(this.wet); }
      if (p.delay > 0 && this.delayIn) { const s = mkGain(c, p.delay); pan.connect(s); s.connect(this.delayIn); }
      return { p, inst, input, layer, on, offAt: on ? Infinity : -1 };
    }
    _buildDelay(D) {
      const c = this.e.ctx;
      const time = clamp(D.beats * 60 / this.track.bpm, 0.03, 2.9);
      const inp = mkGain(c, 1);
      const dl = c.createDelay(3), dr = c.createDelay(3);
      dl.delayTime.value = time; dr.delayTime.value = time;
      const tone = mkFilter(c, 'lowpass', D.tone, 0.5), hp = mkFilter(c, 'highpass', 220, 0.5);
      const loopLp = mkFilter(c, 'lowpass', D.tone * 0.8, 0.5);
      const fb1 = mkGain(c, D.feedback), fb2 = mkGain(c, D.feedback);
      inp.connect(hp); hp.connect(tone); tone.connect(dl);
      dl.connect(loopLp); loopLp.connect(fb1); fb1.connect(dr); dr.connect(fb2); fb2.connect(dl);
      const merger = c.createChannelMerger(2);
      dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
      const out = mkGain(c, D.level * 0.55);
      merger.connect(out); out.connect(this.dry);
      const toWet = mkGain(c, 0.3);
      out.connect(toWet); toWet.connect(this.wet);
      this.delayIn = inp;
    }
    setLayer(level, now) {
      this.level = level;
      const fade = this.track.layerFade;
      for (const ch of this.chans) {
        const on = this._audible(ch.p);
        if (on === ch.on) continue;
        ch.on = on;
        holdParam(ch.layer.gain, now);
        ch.layer.gain.setTargetAtTime(on ? 1 : 0, now, fade / 3);
        ch.offAt = on ? Infinity : now + fade * 1.6;
      }
    }
    fadeOut(now, sec) {
      sec = Math.max(0.02, sec);
      for (const gn of [this.dry, this.wet]) {
        holdParam(gn.gain, now);
        gn.gain.linearRampToValueAtTime(0, now + sec);
      }
      this.stopAt = now + sec;
      this.endAt = Math.min(this.endAt, now + sec + 0.1);
    }
    revive(now, sec) {
      if (this.stopAt === Infinity) return;
      for (const gn of [this.dry, this.wet]) {
        holdParam(gn.gain, now);
        gn.gain.linearRampToValueAtTime(this.vol, now + Math.max(0.05, sec));
      }
      this.stopAt = Infinity; this.endAt = Infinity;
      if (this.phase === 'done' && !this.track.loop) this.endAt = this.doneAt || Infinity;
    }
    isDone(now) { return this.disposed || now > this.endAt; }
    pump(until, now) {
      if (this.disposed || this.phase === 'done') return;
      const T = this.track;
      const limit = Math.min(until, this.stopAt);
      for (let guard = 0; guard < 100000; guard++) {
        const intro = this.phase === 'intro';
        const list = intro ? T.intro.events : T.body.events;
        const base = intro ? this.t0 : this.t0 + T.intro.len + this.iter * T.body.len;
        if (this.idx < list.length) {
          const ev = list[this.idx];
          const at = base + ev.t;
          if (at >= limit) return;
          this.idx++;
          this._play(ev, at, now);
          continue;
        }
        if (intro) { this.phase = 'body'; this.idx = 0; continue; }
        if (!T.loop) {
          this.phase = 'done';
          this.doneAt = base + T.body.len + T.tail;
          this.endAt = Math.min(this.endAt, this.doneAt);
          return;
        }
        if (T.body.len <= 0 || base + T.body.len >= limit) return;
        this.iter++; this.idx = 0;
      }
    }
    _play(ev, at, now) {
      const ch = this.chans[ev.p];
      if (!ch.on && now > ch.offAt) return;   // faded-out intensity layer
      if (this.e.muted) return;
      let d = ev.d, glides = ev.g;
      if (at < now - 0.04) {                    // timer ran late: drop short notes, join long ones
        if (this.e.offline || d < 0.5 || glides || at + d < now + 0.15) { this.e.lateDrops++; return; }
        const late = now + 0.01 - at;
        at += late; d -= late;
      }
      const lv = this.lastVoice[ev.p];
      const prev = lv.get(ev.m);
      if (prev && !prev.killed && prev.end > at && prev.start < at - 1e-3) this.e.kill(prev, at, 0.03);
      let v = null;
      try {
        v = ch.inst.play(this.e, ch.input, at, ev.m, d, ev.v,
          { params: ch.p.params, acc: !!ev.a, glides, glideTime: ch.p.glide });
      } catch (err) { reportOnce(err, `play:${this.track.id}:${ch.p.inst}`); }
      if (v) {
        lv.set(ev.m, v);
        this.myVoices.push(v);
        if (this.myVoices.length > 256) this.myVoices = this.myVoices.filter((x) => x.end > now && !x.killed);
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const now = this.e.ctx.currentTime;
      for (const v of this.myVoices) if (v.end > now) this.e.kill(v, now, 0.02);
      this.myVoices = [];
      for (const l of this.lfos) { try { l.stop(now + 0.1); } catch (e) { /* ignore */ } }
      const dry = this.dry, wet = this.wet;
      setTimeoutSafe(() => { try { dry.disconnect(); wet.disconnect(); } catch (e) { /* ignore */ } }, 300);
    }
  }
  function setTimeoutSafe(fn, ms) { if (typeof setTimeout === 'function') setTimeout(fn, ms); }

  // ===========================================================================
  // 8. AmbiencePlayer — continuous noise/tone beds + sparse random events
  // ===========================================================================
  class AmbiencePlayer {
    constructor(e, id, def, opts) {
      const c = e.ctx;
      this.e = e; this.id = id; this.def = def;
      this.t0 = num(opts.start, c.currentTime + 0.05);
      this.vol = num(def.gain, 1);
      this.stopAt = Infinity; this.endAt = Infinity; this.disposed = false;
      this.R = makeRng(opts.seed !== undefined ? opts.seed : nextSeed());
      this.out = mkGain(c, 0); this.wet = mkGain(c, 0);
      this.out.connect(opts.dest || e.ambIn); this.wet.connect(opts.destWet || e.ambWet);
      this.srcs = [];
      this.voices = [];
      for (const L of def.layers || []) {
        try { this._layer(L); } catch (err) { reportOnce(err, 'ambience:' + id); }
      }
      this.events = (def.events || []).map((ev) => ({ ev, next: this.t0 + this._interval(ev) * num(ev.first, 0.5) }));
      const fade = Math.max(0, num(opts.fade, 0));
      for (const gn of [this.out, this.wet]) {
        gn.gain.setValueAtTime(fade > 0 ? 0 : this.vol, this.t0);
        if (fade > 0) gn.gain.linearRampToValueAtTime(this.vol, this.t0 + fade);
      }
    }
    _rand(a, b) { return a + (b - a) * this.R(); }
    _interval(ev) { const ev2 = ev.every || [5, 10]; return this._rand(ev2[0], ev2[1]); }
    _layer(L) {
      const c = this.e.ctx, t = this.t0;
      const g = mkGain(c, L.gain !== undefined ? L.gain : 0.1);
      let head;
      if (L.noise || L.gen) {
        const s = c.createBufferSource();
        const key = 'amb:' + (L.key || this.id);
        s.buffer = L.gen ? cachedBuffer(c, key, (sr) => L.gen(sr, makeRng(hash32(key)))) : noiseBuffer(c, L.noise);
        s.loop = true;
        if (L.rate) s.playbackRate.value = L.rate;
        s.start(t, this._rand(0, Math.max(0, s.buffer.duration - 0.1)));
        this.srcs.push(s); head = s;
      } else if (L.tones) {
        head = mkGain(c, 1);
        for (const T of L.tones) {
          const o = mkOsc(c, T.wave ? this.e.wave(T.wave) : (T.type || 'sine'), T.f, T.det || 0);
          const og = mkGain(c, T.gain !== undefined ? T.gain : 1);
          o.connect(og); og.connect(head); o.start(t); this.srcs.push(o);
        }
      } else return;
      let node = head;
      const filters = [];
      for (const F of L.filters || []) {
        const f = mkFilter(c, F.type, F.f, F.Q !== undefined ? F.Q : 0.7, F.gain);
        node.connect(f); node = f; filters.push(f);
      }
      node.connect(g);
      const pan = c.createStereoPanner();
      pan.pan.value = L.pan || 0;
      g.connect(pan); pan.connect(this.out);
      if (L.reverb) { const s = mkGain(c, L.reverb); pan.connect(s); s.connect(this.wet); }
      for (const M of L.lfo || []) {
        let target = null, depth = M.depth;
        if (M.target === 'gain') { target = g.gain; depth = M.depth * g.gain.value; }
        else if (M.target === 'pan') target = pan.pan;
        else if (M.target === 'freq' && filters[M.filter || 0]) target = filters[M.filter || 0].frequency;
        else if (M.target === 'sweep' && filters[M.filter || 0]) target = filters[M.filter || 0].detune;
        if (!target) continue;
        const lfo = mkOsc(c, M.type || 'sine', M.rate * this._rand(0.9, 1.1));
        const lg = mkGain(c, depth);
        lfo.connect(lg); lg.connect(target); lfo.start(t); this.srcs.push(lfo);
      }
    }
    pump(until, now) {
      if (this.disposed) return;
      const limit = Math.min(until, this.stopAt);
      for (const s of this.events) {
        for (let guard = 0; s.next < limit && guard < 64; guard++) {
          if (s.next >= now - 0.05 && !this.e.muted) this._fire(s.ev, s.next);
          s.next += Math.max(0.05, this._interval(s.ev));
        }
      }
    }
    _fire(ev, t) {
      const pr = ev.pan || [-0.8, 0.8], vr = ev.vol || [0.7, 1];
      const kit = new Kit(this.e, t, this.out, this.wet, {
        vol: this._rand(vr[0], vr[1]), pan: this._rand(pr[0], pr[1]), reverb: num(ev.reverb, 0.45),
        pitch: ev.pitch ? this._rand(ev.pitch[0], ev.pitch[1]) : 1, seed: (this.R() * 4294967296) >>> 0,
      });
      try { ev.play(kit); } catch (err) { reportOnce(err, 'ambience-event:' + this.id); return; }
      const v = this.e.addVoice(kit.t, kit.end, kit.vca, kit.srcs, 0);
      this.voices.push(v);
      if (this.voices.length > 64) this.voices = this.voices.filter((x) => x.end > t);
    }
    fadeOut(now, sec) {
      sec = Math.max(0.02, sec);
      for (const gn of [this.out, this.wet]) { holdParam(gn.gain, now); gn.gain.linearRampToValueAtTime(0, now + sec); }
      this.stopAt = now + sec; this.endAt = now + sec + 0.1;
    }
    revive(now, sec) {
      if (this.stopAt === Infinity) return;
      for (const gn of [this.out, this.wet]) { holdParam(gn.gain, now); gn.gain.linearRampToValueAtTime(this.vol, now + Math.max(0.05, sec)); }
      this.stopAt = Infinity; this.endAt = Infinity;
    }
    isDone(now) { return this.disposed || now > this.endAt; }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const now = this.e.ctx.currentTime;
      for (const s of this.srcs) { try { s.stop(now + 0.05); } catch (e) { /* ignore */ } }
      for (const v of this.voices) this.e.kill(v, now, 0.02);
      const out = this.out, wet = this.wet;
      setTimeoutSafe(() => { try { out.disconnect(); wet.disconnect(); } catch (e) { /* ignore */ } }, 300);
    }
  }

  // ===========================================================================
  // 9. Kit — sound-design toolkit passed to sfx / ambience-event definitions
  // ===========================================================================
  const FILTER_TYPES = { lp: 'lowpass', hp: 'highpass', bp: 'bandpass', notch: 'notch', peak: 'peaking' };
  class Kit {
    constructor(e, t, dest, wetDest, o) {
      const c = e.ctx;
      this.e = e; this.c = c; this.t = t;
      this.p = num(o.pitch, 1);
      this.R = makeRng(o.seed !== undefined ? o.seed : nextSeed());
      this.end = t + 0.05;
      this.srcs = [];
      this.vca = mkGain(c, num(o.vol, 1));
      this.panner = c.createStereoPanner();
      this.panner.pan.value = clamp(num(o.pan, 0), -1, 1);
      this.vca.connect(this.panner); this.panner.connect(dest);
      this.send = mkGain(c, num(o.reverb, 0.12));
      this.panner.connect(this.send); this.send.connect(wetDest);
      this.out = this.vca;
    }
    /** Random number in [a, b) — per-play variation. */
    r(a, b) { return a + (b - a) * this.R(); }
    pick(arr) { return arr[Math.floor(this.R() * arr.length)]; }
    reverb(v) { this.send.gain.value = v; return this; }
    _track(src, stopT) { this.srcs.push(src); if (stopT > this.end) this.end = stopT; }
    _filters(node, o, t, dur) {
      for (const k of Object.keys(FILTER_TYPES)) {
        if (o[k] === undefined) continue;
        const scale = o.track === false ? 1 : this.p;
        const f0 = clamp(o[k] * scale, 20, 20000);
        const Q = o[k + 'Q'] !== undefined ? o[k + 'Q'] : (o.Q !== undefined ? o.Q : (k === 'bp' ? 1.5 : 0.7));
        const fl = mkFilter(this.c, FILTER_TYPES[k], f0, Q, o.gain);
        if (o[k + '1'] !== undefined) {
          fl.frequency.setValueAtTime(f0, t);
          fl.frequency.exponentialRampToValueAtTime(clamp(o[k + '1'] * scale, 20, 20000), t + (o.sweep !== undefined ? o.sweep : dur));
        }
        node.connect(fl); node = fl;
      }
      return node;
    }
    _env(node, o, t) {
      const g = mkGain(this.c, 0);
      const peak = o.g !== undefined ? o.g : 0.5;
      const a = Math.max(0.0008, o.a !== undefined ? o.a : 0.002);
      const hold = Math.max(0, o.hold || 0);
      const d = Math.max(0.005, o.d !== undefined ? o.d : 0.2);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      if (hold) g.gain.setValueAtTime(peak, t + a + hold);
      const t2 = t + a + hold;
      let end;
      if (o.curve === 'lin') { g.gain.linearRampToValueAtTime(0, t2 + d); end = t2 + d + 0.01; }
      else { g.gain.setTargetAtTime(0, t2, d / 6.9); end = t2 + d + 0.02; }
      node.connect(g); g.connect(o.dest || this.out);
      return { end, gain: g };
    }
    /**
     * Oscillator blip. o: { type|wave, f, f1 (glide target), glide (s), pts [[dt,f],...], at (offset s),
     * a (attack), hold, d (decay to -60 dB), g (peak gain), curve:'lin', det (cents),
     * vib {rate, depth}, fm {ratio, index, index1, d}, lp/hp/bp/notch(+1 sweep target, +Q) }.
     */
    tone(o) {
      const c = this.c, t = this.t + (o.at || 0);
      const ny = c.sampleRate * 0.49, fq = (v) => clamp(v, 1, ny); // keep oscillator targets below Nyquist
      const f = o.f * this.p;
      const dur = (o.a || 0.002) + (o.hold || 0) + (o.d !== undefined ? o.d : 0.2);
      const x = mkOsc(c, o.wave ? this.e.wave(o.wave) : (o.type || 'sine'), f, o.det || 0);
      if (o.f1 !== undefined) {
        const gt = o.glide !== undefined ? o.glide : dur;
        x.frequency.setValueAtTime(fq(f), t);
        if (o.curve === 'lin') x.frequency.linearRampToValueAtTime(fq(o.f1 * this.p), t + gt);
        else x.frequency.exponentialRampToValueAtTime(fq(o.f1 * this.p), t + gt);
      } else if (o.pts) {
        x.frequency.setValueAtTime(fq(f), t);
        for (const [dt, fv] of o.pts) x.frequency.exponentialRampToValueAtTime(fq(fv * this.p), t + dt);
      }
      const node = this._filters(x, o, t, dur);
      const { end } = this._env(node, o, t);
      if (o.vib) {
        const l = mkOsc(c, 'sine', o.vib.rate), lg = mkGain(c, o.vib.depth);
        l.connect(lg); lg.connect(x.detune); l.start(t); l.stop(end); this._track(l, end);
      }
      if (o.fm) {
        const mo = mkOsc(c, 'sine', f * o.fm.ratio), mg = mkGain(c, f * o.fm.index);
        if (o.fm.index1 !== undefined) {
          mg.gain.setValueAtTime(f * o.fm.index, t);
          mg.gain.exponentialRampToValueAtTime(Math.max(0.01, f * o.fm.index1), t + (o.fm.d || dur));
        }
        mo.connect(mg); mg.connect(x.frequency); mo.start(t); mo.stop(end); this._track(mo, end);
      }
      x.start(t); x.stop(end); this._track(x, end);
      return x;
    }
    /** Filtered noise burst. o: { color:'white'|'pink'|'brown', rate, at, a, hold, d, g, curve, lp/hp/bp/notch... } */
    noise(o) {
      const c = this.c, t = this.t + (o.at || 0);
      const dur = (o.a || 0.002) + (o.hold || 0) + (o.d !== undefined ? o.d : 0.2);
      const s = c.createBufferSource();
      s.buffer = noiseBuffer(c, o.color || 'white');
      s.loop = true;
      if (o.rate) s.playbackRate.value = o.rate;
      const node = this._filters(s, o, t, dur);
      const { end } = this._env(node, o, t);
      s.start(t, this.r(0, 3.5)); s.stop(end); this._track(s, end);
      return s;
    }
    /** Play a buffer (e.g. from kit.buffer) with an envelope. */
    play(buf, o) {
      const c = this.c, t = this.t + (o.at || 0);
      const dur = (o.a || 0.002) + (o.hold || 0) + (o.d !== undefined ? o.d : buf.duration);
      const s = c.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = num(o.rate, 1) * this.p;
      if (o.loop) s.loop = true;
      const node = this._filters(s, o, t, dur);
      const { end } = this._env(node, o, t);
      s.start(t, o.offset || 0); s.stop(end); this._track(s, end);
      return s;
    }
    /** Play a music instrument note inside this sound. note: 'C5' or MIDI. */
    inst(name, note, dur, vel, params) {
      const I = INSTRUMENTS[name];
      if (!I) { warnOnce('kit-inst:' + name, `kit.inst: unknown instrument '${name}'`); return null; }
      const m = (typeof note === 'string' ? noteToMidi(note) : note) + 12 * Math.log2(this.p);
      const at = (params && params.at) || 0;
      const v = I.play(this.e, this.out, this.t + at, m, dur, clamp(vel === undefined ? 0.8 : vel, 0.02, 1.2), {
        params: Object.assign({}, I.params, params || {}), pitch: 1,
      });
      if (v) { this.srcs.push.apply(this.srcs, v.srcs); if (v.end > this.end) this.end = v.end; }
      return v;
    }
    /** Cached generated buffer (per sample rate): gen(sr, rng) -> Float32Array | [L, R]. */
    buffer(key, gen) {
      return cachedBuffer(this.c, 'kit:' + key, (sr) => gen(sr, makeRng(hash32(key))));
    }
  }

  // ===========================================================================
  // 10. Public API — G.Audio (every call is a safe no-op before init / without Web Audio)
  // ===========================================================================
  const REQUIRED_SFX = ('jump doublejump land hardland walljump grip dash slash slash_hit slash_wall pogo enemy_hit ' +
    'enemy_die player_hurt player_die hazard bolt bolt_hit plunge plunge_land kindle kindle_done ember_full cinder item ' +
    'ability rest save lever gate_open gate_close break_wall geode_hit geode_break splash swim shrine wisp wisp_die door ' +
    'boss_roar boss_hit boss_die boss_stagger shockwave projectile bell menu_move menu_select menu_back dialogue_blip ' +
    'map_open shop_buy deny area_card lanternway step').split(' ');
  const TRACK_IDS = 'title shore lastlight guttered meltbloom flue nave chandlery mothwood rime sanctum boss sable keeper lucerne ending'.split(' ');
  const AMBIENCE_IDS = 'wind village cave garden fire rain forge forest ice sanctum'.split(' ');
  const STINGER_IDS = 'ability item boss_defeated death spark seal'.split(' ');
  // G.settings field names per bus (both the short spec names and the save module's long names)
  const SETTING_KEYS = { master: ['masterVol', 'masterVolume'], music: ['musicVol', 'musicVolume'],
    sfx: ['sfxVol', 'sfxVolume'], ambience: ['ambVol', 'ambienceVolume'] };
  const GESTURES = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];

  const S = {
    engine: null, timer: null,
    available: typeof globalThis.AudioContext === 'function' || typeof globalThis.webkitAudioContext === 'function',
    muted: false, layer: 0,
    vols: { master: 1, music: 1, sfx: 1, ambience: 1 }, seen: {},
    music: null, musicFade: MUSIC_FADE, amb: null, ambFade: AMB_FADE,
    gestureHandler: null, sfxLast: Object.create(null),
  };
  try {
    if (typeof location !== 'undefined' && /[?&]mute=1(?:&|$)/.test(String(location.search || ''))) S.muted = true;
  } catch (e) { /* no location (node) */ }

  const taper = (v) => v * v; // perceptual volume taper for 0..1 sliders

  function running() { return !!S.engine && S.engine.ctx.state === 'running'; }
  function armGesture() {
    if (S.gestureHandler || !S.available || typeof window === 'undefined' || !window.addEventListener) return;
    S.gestureHandler = () => {
      init();
      if (running()) {
        for (const ev of GESTURES) window.removeEventListener(ev, S.gestureHandler, true);
        S.gestureHandler = null;
      }
    };
    for (const ev of GESTURES) window.addEventListener(ev, S.gestureHandler, true);
  }
  function applyVolumes() {
    const e = S.engine;
    if (!e) return;
    e.muted = S.muted;
    e.setMaster(S.muted ? 0 : taper(S.vols.master), 0.02);
    for (const b of BUS_NAMES) e.setBusVolume(b, taper(S.vols[b]), 0.03);
  }
  function pollSettings() {
    const s = G.settings;
    if (!s || typeof s !== 'object') return;
    let changed = false;
    for (const bus of Object.keys(SETTING_KEYS)) {
      let v;
      for (const k of SETTING_KEYS[bus]) if (isNum(s[k])) { v = s[k]; break; }
      if (v !== undefined && v !== S.seen[bus]) { S.seen[bus] = v; S.vols[bus] = clamp(v, 0, 1); changed = true; }
    }
    if (changed) applyVolumes();
  }
  function tick() {
    const e = S.engine;
    if (!e) return;
    try {
      pollSettings();
      const g = G.game;
      const fading = !!g && isNum(g.sysFadeAlpha) && g.sysFadeAlpha > 0;
      e.pump(e.ctx.currentTime + (fading ? FADE_AHEAD : SCHEDULE_AHEAD));
    } catch (err) { reportOnce(err, 'tick'); }
  }
  /** Schedule music/ambience `sec` seconds ahead now (default FADE_AHEAD), so a known upcoming main-thread stall
   *  (e.g. a synchronous room load) cannot starve the scheduler. The tick does this by itself during system fades. */
  function prefill(sec) {
    const e = S.engine;
    if (!e) return false;
    try {
      e.pump(e.ctx.currentTime + clamp(num(sec, FADE_AHEAD), SCHEDULE_AHEAD, PREFILL_MAX));
      return true;
    } catch (err) { reportOnce(err, 'prefill'); return false; }
  }

  /** Create the AudioContext (call from a user gesture). Idempotent; resumes a suspended context. */
  function init() {
    if (!S.available) return false;
    try {
      if (!S.engine) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        let ctx;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
        S.engine = new Engine(ctx, {});
        prewarmAll(S.engine);
        pollSettings();
        applyVolumes();
        S.timer = setInterval(tick, LOOKAHEAD_MS);
        if (S.music && has(TRACKS, S.music)) S.engine.setMusic(TRACKS[S.music], Math.min(S.musicFade, 1.5), S.layer);
        if (S.amb && has(AMBIENCE, S.amb)) S.engine.setAmbience(AMBIENCE[S.amb], S.amb, Math.min(S.ambFade, 2));
      }
      const ctx = S.engine.ctx;
      if (ctx.state !== 'running' && ctx.resume) {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
        armGesture();
      }
      return true;
    } catch (err) {
      reportOnce(err, 'init');
      S.available = false;
      S.engine = null;
      return false;
    }
  }

  function panAt(x) {
    const cam = G.camera, w = (G.CONST && G.CONST.VIEW_W) || 1280;
    if (!cam || !isNum(x)) return 0;
    return clamp(((x - num(cam.x, 0)) / w - 0.5) * 1.3, -0.75, 0.75);
  }
  function makeHandle(e, v) {
    return {
      stop(fade) { e.kill(v, e.ctx.currentTime, Math.max(0.004, num(fade, 0.08) / 4)); },
      get playing() { return !v.killed && v.end > e.ctx.currentTime; },
    };
  }

  /** Play a sound effect. opts: { vol, pitch, pan, x (world px -> pan), delay, force }. Returns {stop(fade)} or null. */
  function sfx(name, opts) {
    try {
      if (!has(SFX, name)) { warnOnce('sfx:' + name, `sfx: unknown sound '${name}'`); return null; }
      const e = S.engine;
      if (!e) { armGesture(); return null; }
      if (S.muted || e.ctx.state !== 'running') return null;
      opts = opts || {};
      const now = e.ctx.currentTime;
      if (!opts.force) {
        const last = S.sfxLast[name];
        if (last !== undefined && now - last < SFX_RATE_LIMIT && now >= last) return null;
        S.sfxLast[name] = now;
      }
      if (opts.pan === undefined && opts.x !== undefined) opts = Object.assign({}, opts, { pan: panAt(opts.x) });
      const v = e.playSfx(name, opts);
      return v ? makeHandle(e, v) : null;
    } catch (err) { reportOnce(err, 'sfx:' + name); return null; }
  }

  /** Crossfade to a music track (null = silence). Same id = no-op. opts: { fade=1.5, layer=0, restart } */
  function music(id, opts) {
    try {
      opts = opts || {};
      id = id || null;
      if (id !== null && !has(TRACKS, id)) warnOnce('track:' + id, `music: track '${id}' is not defined (playing silence)`);
      if (id === S.music && !opts.restart) return;
      S.music = id;
      S.musicFade = clamp(num(opts.fade, MUSIC_FADE), 0, 30);
      S.layer = clamp(num(opts.layer, 0), 0, 1);
      const e = S.engine;
      if (!e) { armGesture(); return; }
      if (opts.restart) e.setMusic(null, S.musicFade, S.layer);
      e.setMusic(id && has(TRACKS, id) ? TRACKS[id] : null, S.musicFade, S.layer);
    } catch (err) { reportOnce(err, 'music'); }
  }
  /** Intensity 0..1: parts with layer <= level < layerMax fade in, others fade out. */
  function musicLayer(level) {
    try {
      S.layer = clamp(num(level, 0), 0, 1);
      if (S.engine) S.engine.setLayer(S.layer);
    } catch (err) { reportOnce(err, 'musicLayer'); }
  }
  /** Crossfade to an ambience bed (null = none). Same id = no-op. opts: { fade=2.5 } */
  function ambience(id, opts) {
    try {
      opts = opts || {};
      id = id || null;
      if (id !== null && !has(AMBIENCE, id)) warnOnce('amb:' + id, `ambience: '${id}' is not defined`);
      if (id === S.amb) return;
      S.amb = id;
      S.ambFade = clamp(num(opts.fade, AMB_FADE), 0, 30);
      const e = S.engine;
      if (!e) { armGesture(); return; }
      e.setAmbience(id && has(AMBIENCE, id) ? AMBIENCE[id] : null, id, S.ambFade);
    } catch (err) { reportOnce(err, 'ambience'); }
  }
  function setVolume(bus, v) {
    if (!has(S.vols, bus)) { warnOnce('vol:' + bus, `setVolume: unknown bus '${bus}' (master|music|sfx|ambience)`); return; }
    S.vols[bus] = clamp(num(v, 1), 0, 1);
    try { applyVolumes(); } catch (err) { reportOnce(err, 'setVolume'); }
  }
  function getVolume(bus) { return has(S.vols, bus) ? S.vols[bus] : undefined; }
  /** Temporarily lower music + ambience by `amount` (0..1) for `sec` seconds. */
  function duck(amount, sec) {
    try { if (S.engine) S.engine.duck(amount, sec); } catch (err) { reportOnce(err, 'duck'); }
  }
  /** Short musical cue on the music bus (ducks the current music). */
  function stinger(name, opts) {
    try {
      if (!has(STINGERS, name)) { warnOnce('stinger:' + name, `stinger: unknown '${name}'`); return; }
      if (!running() || S.muted) return;
      S.engine.playStinger(STINGERS[name], opts || {});
    } catch (err) { reportOnce(err, 'stinger:' + name); }
  }

  // ---- definitions -------------------------------------------------------------
  function report(res) {
    for (const w of res.warnings) console.warn('[audio] ' + w);
    for (const er of res.errors) console.error('[audio] ' + er);
  }
  /** Validate + compile + register a music track (format: docs/AUDIO_FORMAT.md). */
  function defineTrack(id, data) {
    let res;
    try { res = compileTrack(String(id), data, 'track'); } catch (err) {
      res = { track: null, errors: [`track '${id}': internal compiler error: ${err && err.message}`], warnings: [] };
    }
    report(res);
    if (res.track && res.track.body.len > 0) TRACKS[id] = res.track;
    return { ok: res.errors.length === 0, errors: res.errors, warnings: res.warnings };
  }
  /** Validate without registering. */
  function validateTrack(id, data) {
    try {
      const res = compileTrack(String(id), data, 'track');
      return { ok: res.errors.length === 0, errors: res.errors, warnings: res.warnings };
    } catch (err) { return { ok: false, errors: [String(err && err.message)], warnings: [] }; }
  }
  function defineStinger(name, data) {
    let res;
    try { res = compileTrack(String(name), Object.assign({ loop: false, tail: 3 }, data), 'stinger'); } catch (err) {
      res = { track: null, errors: [`stinger '${name}': internal compiler error: ${err && err.message}`], warnings: [] };
    }
    report(res);
    if (res.track && res.track.body.len > 0) { res.track.loop = false; STINGERS[name] = res.track; }
    return { ok: res.errors.length === 0, errors: res.errors, warnings: res.warnings };
  }
  /** def: function(kit, opts) or { play(kit, opts), vol, reverb, prio } */
  function defineSfx(name, def) {
    if (typeof def === 'function') def = { play: def };
    if (!def || typeof def.play !== 'function') { console.error(`[audio] defineSfx('${name}'): needs a play(kit) function`); return; }
    SFX[name] = def;
  }
  /** def: { gain, layers: [...], events: [{ every:[min,max], play(kit), pan, vol, pitch, reverb, first }] } */
  function defineAmbience(id, def) {
    if (!isObj(def)) { console.error(`[audio] defineAmbience('${id}'): def must be an object`); return; }
    AMBIENCE[id] = def;
  }

  // ---- offline rendering & tooling ------------------------------------------
  /** Wrap any AudioContext (e.g. an OfflineAudioContext) in a fresh engine. */
  function createEngine(ctx, opts) {
    opts = opts || {};
    const e = new Engine(ctx, { offline: typeof ctx.startRendering === 'function', seed: opts.seed });
    const api = {
      engine: e, ctx,
      playTrack(id, o) {
        o = o || {};
        const tr = has(TRACKS, id) ? TRACKS[id] : null;
        if (!tr) throw new Error(`track '${id}' is not defined`);
        const p = new TrackPlayer(e, tr, { start: num(o.start, 0), fade: num(o.fade, 0), layer: num(o.layer, 0), kind: 'music' });
        e.players.push(p);
        return p;
      },
      playStinger(name, o) {
        o = o || {};
        const tr = has(STINGERS, name) ? STINGERS[name] : null;
        if (!tr) throw new Error(`stinger '${name}' is not defined`);
        const p = new TrackPlayer(e, tr, { start: num(o.start, 0), fade: 0, kind: 'stinger', dest: e.bus.music.in, destWet: e.bus.music.wet });
        e.players.push(p);
        return p;
      },
      sfx(name, o, t) {
        if (!has(SFX, name)) throw new Error(`sfx '${name}' is not defined`);
        return e.playSfx(name, o || {}, num(t, 0));
      },
      ambience(id, o) {
        o = o || {};
        if (!has(AMBIENCE, id)) throw new Error(`ambience '${id}' is not defined`);
        const a = new AmbiencePlayer(e, id, AMBIENCE[id], { start: num(o.start, 0), fade: num(o.fade, 0), seed: o.seed });
        e.ambs.push(a);
        return a;
      },
      note(inst, note, o) {
        o = o || {};
        const I = has(INSTRUMENTS, inst) ? INSTRUMENTS[inst] : null;
        if (!I) throw new Error(`instrument '${inst}' is not defined`);
        const dest = e.bus.music.in;
        return I.play(e, dest, num(o.start, 0), noteToMidi(note), num(o.dur, 1), num(o.vel, 0.8),
          { params: Object.assign({}, I.params, o.params || {}), acc: !!o.acc });
      },
      setLayer(level, t) { for (const p of e.players) if (p.kind === 'music') p.setLayer(level, num(t, 0)); },
      duck(amount, sec) { e.duck(amount, sec); },
      pump(until) { e.pump(until); },
    };
    return api;
  }
  /** Render something into a new OfflineAudioContext -> Promise<AudioBuffer>.
   *  spec: { kind:'track'|'sfx'|'stinger'|'ambience'|'note', id, seconds, sampleRate=48000, layer, loops=1,
   *          opts (sfx opts / note {dur, vel, params}), note, seed } */
  function renderOffline(spec) {
    try {
      spec = spec || {};
      const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
      if (!OAC) return Promise.reject(new Error('OfflineAudioContext unavailable'));
      const sr = num(spec.sampleRate, 48000), kind = spec.kind || 'track';
      let seconds = num(spec.seconds, 0);
      if (kind === 'track' || kind === 'stinger') {
        const tr = kind === 'track' ? TRACKS[spec.id] : STINGERS[spec.id];
        if (!tr) return Promise.reject(new Error(`${kind} '${spec.id}' is not defined`));
        if (!seconds) seconds = tr.intro.len + tr.body.len * Math.max(1, num(spec.loops, 1)) + (tr.loop ? 0 : tr.tail);
      } else if (!seconds) seconds = kind === 'ambience' ? 20 : 4;
      const ctx = new OAC(2, Math.max(1, Math.ceil(seconds * sr)), sr);
      const E = createEngine(ctx, { seed: spec.seed !== undefined ? spec.seed : 12345 });
      const o = spec.opts || {};
      if (kind === 'track') E.playTrack(spec.id, { start: 0, layer: num(spec.layer, 0) });
      else if (kind === 'stinger') E.playStinger(spec.id, { start: 0 });
      else if (kind === 'sfx') E.sfx(spec.id, o, 0.01);
      else if (kind === 'ambience') E.ambience(spec.id, { start: 0, seed: spec.seed });
      else if (kind === 'note') E.note(spec.id, spec.note || INSTRUMENTS[spec.id] && midiToNote(INSTRUMENTS[spec.id].def), Object.assign({ start: 0.01 }, o));
      else return Promise.reject(new Error(`renderOffline: unknown kind '${kind}'`));
      if (isNum(spec.layerAt) && isNum(spec.layerTo)) E.setLayer(spec.layerTo, spec.layerAt);
      // Schedule incrementally like the realtime clock does (suspend every CHUNK seconds): creating
      // every node up front would make the renderer process thousands of idle nodes per quantum.
      const CHUNK = 0.5;
      if (typeof ctx.suspend === 'function' && seconds > CHUNK * 2) {
        E.pump(CHUNK + SCHEDULE_AHEAD);
        for (let t = CHUNK; t < seconds; t += CHUNK) {
          const at = t;
          ctx.suspend(at).then(() => {
            try { E.pump(at + CHUNK + SCHEDULE_AHEAD); } catch (err) { reportOnce(err, 'renderOffline'); }
            ctx.resume();
          });
        }
      } else E.pump(seconds + 1);
      return ctx.startRendering();
    } catch (err) { return Promise.reject(err); }
  }
  function instrumentInfo() {
    const out = {};
    for (const k of Object.keys(INSTRUMENTS)) {
      const I = INSTRUMENTS[k];
      out[k] = { range: [midiToNote(I.range[0]), midiToNote(I.range[1])], def: midiToNote(I.def), kind: I.kind,
        desc: I.desc, params: Object.assign({}, I.params), chain: (I.chain || []).map((c) => c.t) };
    }
    return out;
  }
  /** Play a single instrument note now (debug / audition). */
  function playNote(inst, note, opts) {
    try {
      if (!running()) return null;
      const I = INSTRUMENTS[inst];
      if (!I) { warnOnce('note:' + inst, `playNote: unknown instrument '${inst}'`); return null; }
      opts = opts || {};
      const e = S.engine;
      return I.play(e, e.bus.music.in, e.ctx.currentTime + 0.02, noteToMidi(note), num(opts.dur, 1), num(opts.vel, 0.8),
        { params: Object.assign({}, I.params, opts.params || {}), acc: !!opts.acc });
    } catch (err) { reportOnce(err, 'playNote'); return null; }
  }
  function stateInfo() {
    const e = S.engine;
    return {
      available: S.available, ready: !!e, ctxState: e ? e.ctx.state : 'none', sampleRate: e ? e.ctx.sampleRate : 0,
      muted: S.muted, music: S.music, ambience: S.amb, layer: S.layer, volumes: Object.assign({}, S.vols),
      voices: e ? e.activeVoices() : 0, lateDrops: e ? e.lateDrops : 0,
      players: e ? e.players.filter((p) => !p.disposed).map((p) => ({ id: p.track.id, kind: p.kind, fading: p.stopAt !== Infinity })) : [],
      ambiences: e ? e.ambs.filter((a) => !a.disposed).map((a) => ({ id: a.id, fading: a.stopAt !== Infinity })) : [],
      time: e ? e.ctx.currentTime : 0,
    };
  }

  const Audio = {
    init, sfx, music, musicLayer, ambience, setVolume, getVolume, duck, stinger, prefill,
    defineTrack, validateTrack, defineStinger, defineSfx, defineAmbience,
    renderOffline, createEngine, playNote, panAt, state: stateInfo,
    instruments: instrumentInfo,
    trackIds: () => Object.keys(TRACKS), sfxNames: () => Object.keys(SFX),
    ambienceIds: () => Object.keys(AMBIENCE), stingerNames: () => Object.keys(STINGERS),
    getTrack: (id) => (has(TRACKS, id) ? TRACKS[id] : has(STINGERS, id) ? STINGERS[id] : null),
    noteToMidi, midiToNote, parseChord: (s) => parseChord(s),
    REQUIRED_SFX, TRACK_IDS, AMBIENCE_IDS, STINGER_IDS,
  };
  Object.defineProperties(Audio, {
    muted: {
      enumerable: true,
      get() { return S.muted; },
      set(v) { S.muted = !!v; try { applyVolumes(); } catch (err) { reportOnce(err, 'muted'); } },
    },
    ctx: { enumerable: true, get() { return S.engine ? S.engine.ctx : null; } },
    ready: { enumerable: true, get() { return running(); } },
    available: { enumerable: true, get() { return S.available; } },
    currentMusic: { enumerable: true, get() { return S.music; } },
    currentAmbience: { enumerable: true, get() { return S.amb; } },
  });
  G.Audio = Audio;
})();
