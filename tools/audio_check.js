#!/usr/bin/env node
// Headless audio QA: renders every music track, stinger, sfx and ambience bed through an
// OfflineAudioContext (G.Audio.renderOffline) in headless Chromium and checks levels.
//
//   node tools/audio_check.js                      # everything (tracks: intro + one full loop)
//   node tools/audio_check.js --only tracks --id title --wav
//   node tools/audio_check.js --only sfx,stingers  # kinds: tracks stingers sfx ambience instruments
//   node tools/audio_check.js --id slash,jump      # filter by id (comma list; works for every kind)
//   node tools/audio_check.js --seconds 30         # cap track renders to 30 s (quick iteration)
//   node tools/audio_check.js --loops 2            # render tracks with two passes of the loop (seam check)
//   node tools/audio_check.js --layer 1            # render tracks at musicLayer(1)
//   node tools/audio_check.js --wav                # also write 16-bit WAVs to test-output/audio/
//   node tools/audio_check.js --png                # spectrogram sheets -> test-output/audio/spectro_<kind>.png
//   node tools/audio_check.js --verbose            # per-item envelope / band details
//   node tools/audio_check.js --json               # machine-readable report on stdout
//
// Columns: dur (s) | peak = sample peak (dBFS) | rms = RMS of the whole render (dBFS, mean of
// channels) | active = RMS of the non-silent span | LUFS = K-weighted, ungated loudness of the active
// span (BS.1770 stereo sum; ~ rms + 2.3 dB for wide-band material) | max = loudest 100 ms (LUFS scale) |
// span = first..last non-silent 50 ms window | render time | seam = RMS of +-1 s around the loop point.
//
// Checks (exit code 1 on any FAIL):
//   all      : no NaN/Inf samples, not silent (peak > -60 dBFS), sample peak <= -1 dBFS
//   tracks   : RMS (whole render) within -22..-14 dBFS (target ~ -18); loop seam not silent
//   stingers : RMS of the active part within -26..-12 dBFS
//   sfx      : active RMS reported (no hard range: sfx are mixed by ear against music)
//   ambience : RMS within -42..-20 dBFS (beds sit well under the music)
//   registry : every required sfx / stinger / ambience id is defined; track files load without
//              console errors (a defineTrack validation error is a FAIL)
// Undefined tracks (composer stubs) are listed as "not defined yet" and do not fail the run.
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll, ROOT } = require('./lib/browser');

// ---------------------------------------------------------------------------- args
function parseArgs(argv) {
  const a = { only: null, ids: null, seconds: 0, loops: 1, layer: 0, wav: false, png: false, verbose: false, json: false, sr: 48000 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--only') { a.only = v.split(',').map((s) => s.trim()); i++; }
    else if (k === '--id') { a.ids = v.split(',').map((s) => s.trim()); i++; }
    else if (k === '--seconds') { a.seconds = parseFloat(v); i++; }
    else if (k === '--loops') { a.loops = Math.max(1, parseInt(v, 10)); i++; }
    else if (k === '--layer') { a.layer = parseFloat(v); i++; }
    else if (k === '--sr') { a.sr = parseInt(v, 10); i++; }
    else if (k === '--wav') a.wav = true;
    else if (k === '--png') a.png = true;
    else if (k === '--verbose' || k === '-v') a.verbose = true;
    else if (k === '--json') a.json = true;
    else if (k === '--help' || k === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 32).join('\n')); process.exit(0); }
    else { console.error('unknown arg', k); process.exit(2); }
  }
  const kinds = ['tracks', 'stingers', 'sfx', 'ambience', 'instruments'];
  for (const k of a.only || []) if (kinds.indexOf(k) < 0) { console.error(`--only: unknown kind '${k}' (${kinds.join(', ')})`); process.exit(2); }
  return a;
}

// ---------------------------------------------------------------------------- page
/** Build a test page that loads namespace.js + every src/audio script in index.html order. */
function buildPage() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [];
  const re = /<script\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === 'src/core/namespace.js' || m[1].startsWith('src/audio/')) srcs.push(m[1]);
  }
  if (!srcs.some((s) => s === 'src/audio/audio.js')) srcs.unshift('src/audio/audio.js'); // defensive
  const dir = path.join(ROOT, 'test-output', 'audio');
  fs.mkdirSync(dir, { recursive: true });
  const tags = srcs.map((s) => `<script src="../../${s}"></script>`).join('\n');
  const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>audio_check</title></head>
<body style="margin:0;background:#000"><canvas id="cv" width="1600" height="1200"></canvas>
<script>globalThis.G = globalThis.G || {};</script>
${tags}
</body></html>`;
  const file = path.join(dir, '_check.html');
  fs.writeFileSync(file, page);
  return { file: path.relative(ROOT, file), srcs };
}

// In-page analysis helpers (serialized into the page).
function installAnalysis() {
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function mono(buf) {
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const out = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) out[i] = 0.5 * (L[i] + R[i]);
    return out;
  }
  /** Levels: sample peak, RMS of the whole buffer, RMS of the active (non-silent) span, NaN count. */
  function stats(buf, opts) {
    opts = opts || {};
    const sr = buf.sampleRate, nc = buf.numberOfChannels, n = buf.length;
    let peak = 0, ss = 0, nan = 0, clip = 0;
    const win = Math.max(1, Math.floor(sr * 0.05)), nw = Math.ceil(n / win);
    const wE = new Float64Array(nw);
    for (let c = 0; c < nc; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const v = d[i];
        if (!Number.isFinite(v)) { nan++; continue; }
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        if (a >= 0.999) clip++;
        ss += v * v;
        wE[(i / win) | 0] += v * v;
      }
    }
    // active span: 50 ms windows within 40 dB of the loudest window
    let maxW = 0;
    for (let i = 0; i < nw; i++) if (wE[i] > maxW) maxW = wE[i];
    let aS = 0, aN = 0, first = -1, last = -1;
    for (let i = 0; i < nw; i++) {
      if (wE[i] > maxW * 1e-4 && wE[i] > 0) { aS += wE[i]; aN += win * nc; if (first < 0) first = i; last = i; }
    }
    const env = [];
    const envWin = opts.envWin || 0.25, ew = Math.max(1, Math.round(envWin / 0.05));
    for (let i = 0; i < nw; i += ew) {
      let s = 0; for (let j = i; j < Math.min(nw, i + ew); j++) s += wE[j];
      env.push(Math.round(db(Math.sqrt(s / (ew * win * nc))) || -120));
    }
    return {
      dur: buf.duration, peak: db(peak), rms: db(Math.sqrt(ss / Math.max(1, n * nc))),
      activeRms: aN ? db(Math.sqrt(aS / aN)) : -Infinity,
      loud: db(Math.sqrt(maxW / (win * nc))),   // short-term loudness: loudest 50 ms window (RMS)
      onset: first < 0 ? null : first * win / sr, end: last < 0 ? null : (last + 1) * win / sr,
      nan, clip, env,
    };
  }
  /** ITU-R BS.1770 K-weighting (pre-filter shelf + RLB high-pass) for any sample rate. */
  function kWeight(d, sr) {
    const out = new Float32Array(d.length);
    const biquad = (x, y, b0, b1, b2, a1, a2) => {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < x.length; i++) {
        const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
      }
    };
    let K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196;
    const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    biquad(d, out, (Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
    K = Math.tan(Math.PI * 38.13547087602444 / sr); Q = 0.5003270373238773;
    a0 = 1 + K / Q + K * K;
    const tmp = Float32Array.from(out);
    biquad(tmp, out, 1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
    return out;
  }
  /** Loudness (ungated, LUFS-like): integrated over the active span and max over 100 ms windows. */
  function loudness(buf) {
    const sr = buf.sampleRate, n = buf.length, win = Math.max(1, Math.floor(sr * 0.1)), nw = Math.ceil(n / win);
    const wE = new Float64Array(nw);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const k = kWeight(buf.getChannelData(c), sr);
      for (let i = 0; i < n; i++) wE[(i / win) | 0] += k[i] * k[i];
    }
    let mx = 0, tot = 0, cnt = 0;
    for (let i = 0; i < nw; i++) mx = Math.max(mx, wE[i]);
    for (let i = 0; i < nw; i++) if (wE[i] > mx * 1e-4) { tot += wE[i]; cnt += win; }  // ignore near-silence (-40 dB rel.)
    const L = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
    return { lufs: L(cnt ? tot / cnt : 0), lmax: L(mx / win) };
  }
  /** RMS (dBFS) of [t0, t1). */
  function rmsRange(buf, t0, t1) {
    const sr = buf.sampleRate, a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(buf.length, Math.floor(t1 * sr));
    let s = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = a; i < b; i++) { s += d[i] * d[i]; n++; }
    }
    return n ? db(Math.sqrt(s / n)) : -Infinity;
  }
  /** Energy per octave band (dB, relative to the loudest band) averaged over the buffer. */
  function bands(buf) {
    const m = mono(buf), sr = buf.sampleRate, N = 8192, edges = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const acc = new Float64Array(edges.length - 1);
    const hops = Math.max(1, Math.min(40, Math.floor(m.length / N)));
    const step = Math.max(N, Math.floor((m.length - N) / hops));
    for (let s0 = 0; s0 + N <= m.length; s0 += step) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = m[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      fft(re, im);
      for (let i = 1; i < N / 2; i++) {
        const f = i * sr / N;
        for (let b = 0; b < acc.length; b++) if (f >= edges[b] && f < edges[b + 1]) { acc[b] += re[i] * re[i] + im[i] * im[i]; break; }
      }
    }
    const mx = Math.max.apply(null, acc) || 1;
    const out = {};
    for (let b = 0; b < acc.length; b++) out[edges[b]] = Math.round(10 * Math.log10(acc[b] / mx + 1e-12));
    return out;
  }
  function spectrogram(ctx, buf, x, y, w, h, label, fmax, secs, normalize) {
    const full = mono(buf), sr = buf.sampleRate, n = 2048;
    let m = secs ? full.subarray(0, Math.min(full.length, Math.ceil(secs * sr))) : full;
    if (normalize) {
      let pk = 0; for (let i = 0; i < m.length; i++) pk = Math.max(pk, Math.abs(m[i]));
      if (pk > 0) { const g = 0.5 / pk; m = m.map((v) => v * g); }
    }
    const hop = Math.max(1, Math.floor((m.length - n) / w));
    const img = ctx.createImageData(w, h);
    fmax = fmax || 10000;
    for (let col = 0; col < w; col++) {
      const re = new Float64Array(n), im = new Float64Array(n), s0 = col * hop;
      for (let i = 0; i < n; i++) re[i] = (m[s0 + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
      fft(re, im);
      for (let row = 0; row < h; row++) {
        const f = fmax * Math.pow((h - row) / h, 2.2);
        const bin = Math.min(n / 2 - 1, Math.round(f * n / sr));
        const v = Math.max(0, Math.min(1, (20 * Math.log10(Math.hypot(re[bin], im[bin]) / (n / 4) + 1e-9) + 90) / 80));
        const k = (row * w + col) * 4;
        img.data[k] = 255 * Math.min(1, v * 1.6); img.data[k + 1] = 255 * Math.max(0, v * 1.6 - 0.5);
        img.data[k + 2] = 255 * Math.max(0, v - 0.6) * 2.4 + 40 * (1 - v); img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, x, y);
    ctx.strokeStyle = 'rgba(120,255,160,0.85)'; ctx.beginPath();
    for (let col = 0; col < w; col++) {
      let p = 0; const s0 = Math.floor(col * m.length / w), s1 = Math.floor((col + 1) * m.length / w);
      for (let i = s0; i < s1; i++) p = Math.max(p, Math.abs(m[i]));
      const yy = y + h - 2 - Math.min(1, p) * 36;
      if (col) ctx.lineTo(x + col, yy); else ctx.moveTo(x + col, yy);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(label, x + 4, y + 13);
  }
  function wav16(buf) {
    const nc = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
    const bytes = new Uint8Array(44 + n * nc * 2), dv = new DataView(bytes.buffer);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * nc * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true);
    ws(36, 'data'); dv.setUint32(40, n * nc * 2, true);
    const ch = []; for (let c = 0; c < nc; c++) ch.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
      const v = Math.max(-1, Math.min(1, ch[c][i] || 0));
      dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2;
    }
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  window.__AC = { stats, loudness, rmsRange, bands, spectrogram, wav16, buffers: {} };
}

// ---------------------------------------------------------------------------- limits
const LIMITS = {
  peakMax: -1,                       // dBFS sample peak (all kinds)
  silent: -60,                       // dBFS: quieter peak = silence
  tracks: { rms: [-22, -14] },
  stingers: { rms: [-26, -12] },     // active-span RMS
  ambience: { rms: [-42, -20] },
};
const fmt = (v, w) => (v === null || v === undefined ? '-' : !Number.isFinite(v) ? (v < 0 ? '-inf' : 'inf') : v.toFixed(1)).padStart(w || 6);

// ---------------------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  const { file, srcs } = buildPage();
  const { page, errors, logs } = await openGame({ file, waitFor: 'window.G && G.Audio && G.Audio.renderOffline', width: 1600, height: 1200, timeout: 30000 });
  await page.evaluate(`(${installAnalysis.toString()})()`);
  const want = (kind) => !args.only || args.only.indexOf(kind) >= 0;
  const pick = (ids) => (args.ids ? ids.filter((id) => args.ids.indexOf(id) >= 0) : ids);

  const reg = await page.evaluate(() => ({
    tracks: G.Audio.trackIds(), sfx: G.Audio.sfxNames(), stingers: G.Audio.stingerNames(), ambience: G.Audio.ambienceIds(),
    instruments: Object.keys(G.Audio.instruments()),
    req: { tracks: G.Audio.TRACK_IDS, sfx: G.Audio.REQUIRED_SFX, stingers: G.Audio.STINGER_IDS, ambience: G.Audio.AMBIENCE_IDS },
    info: G.Audio.TRACK_IDS.concat(G.Audio.stingerNames()).reduce((o, id) => {
      const t = G.Audio.getTrack(id);
      if (t) o[id] = { intro: t.intro.len, body: t.body.len, loop: t.loop, tail: t.tail, bpm: t.bpm, sections: t.sections, title: t.title };
      return o;
    }, {}),
  }));

  const results = [];
  const fails = [];
  const notes = [];
  const loadErrors = errors.slice();
  for (const e of loadErrors) fails.push(`load: ${e}`);
  for (const l of logs) if (/^\[warning\] \[audio\]/.test(l)) notes.push(l.replace(/^\[warning\] /, 'warn: '));

  // registry completeness
  for (const k of ['sfx', 'stingers', 'ambience']) {
    for (const id of reg.req[k]) if (reg[k].indexOf(id) < 0) fails.push(`registry: required ${k} '${id}' is not defined`);
  }
  const missingTracks = reg.req.tracks.filter((id) => reg.tracks.indexOf(id) < 0);

  const jobs = [];
  if (want('tracks')) for (const id of pick(reg.tracks)) jobs.push({ kind: 'tracks', id });
  if (want('stingers')) for (const id of pick(reg.stingers)) jobs.push({ kind: 'stingers', id });
  if (want('sfx')) for (const id of pick(reg.sfx)) jobs.push({ kind: 'sfx', id });
  if (want('ambience')) for (const id of pick(reg.ambience)) jobs.push({ kind: 'ambience', id });
  if (args.only && args.only.indexOf('instruments') >= 0) for (const id of pick(reg.instruments)) jobs.push({ kind: 'instruments', id });

  const wavDir = path.join(ROOT, 'test-output', 'audio');
  for (const job of jobs) {
    const t0 = Date.now();
    let r;
    try {
      r = await page.evaluate(async ({ job, args }) => {
        const kindMap = { tracks: 'track', stingers: 'stinger', sfx: 'sfx', ambience: 'ambience', instruments: 'note' };
        const spec = { kind: kindMap[job.kind], id: job.id, sampleRate: args.sr, seed: 12345 };
        let seam = null;
        if (job.kind === 'tracks') {
          const t = G.Audio.getTrack(job.id);
          spec.layer = args.layer; spec.loops = args.loops;
          const full = t.intro.len + t.body.len * args.loops + (t.loop ? 0 : t.tail);
          spec.seconds = args.seconds > 0 ? Math.min(args.seconds, full) : full;
          if (t.loop && args.loops > 1) seam = t.intro.len + t.body.len;
        } else if (job.kind === 'sfx') spec.seconds = 5;
        else if (job.kind === 'ambience') spec.seconds = args.seconds > 0 ? args.seconds : 30;
        else if (job.kind === 'instruments') { spec.seconds = 5; spec.opts = { dur: 2, vel: 0.8 }; }
        const buf = await G.Audio.renderOffline(spec);
        const st = window.__AC.stats(buf, { envWin: job.kind === 'sfx' ? 0.05 : 1 });
        const out = Object.assign({ sr: buf.sampleRate }, st, window.__AC.loudness(buf));
        if (seam !== null && seam < buf.duration - 1) {
          out.seam = window.__AC.rmsRange(buf, seam - 1, seam + 1);
          out.seamRef = st.rms;
        }
        if (args.verbose) out.bands = window.__AC.bands(buf);
        window.__AC.buffers[job.kind + ':' + job.id] = buf;
        if (args.wav) out.wav = window.__AC.wav16(buf);
        return out;
      }, { job, args });
    } catch (e) {
      r = { error: String(e && e.message || e) };
    }
    r.ms = Date.now() - t0;
    r.kind = job.kind; r.id = job.id;
    // ---- judge
    const f = [];
    if (r.error) f.push(`render failed: ${r.error}`);
    else {
      if (r.nan > 0) f.push(`${r.nan} NaN/Inf samples`);
      if (!(r.peak > LIMITS.silent)) f.push(`silent (peak ${fmt(r.peak, 0)} dBFS)`);
      else if (r.peak > LIMITS.peakMax) f.push(`peak ${r.peak.toFixed(2)} dBFS > ${LIMITS.peakMax}`);
      const lim = LIMITS[job.kind];
      const lvl = job.kind === 'stingers' ? r.activeRms : r.rms;
      if (lim && lim.rms && r.peak > LIMITS.silent && (lvl < lim.rms[0] || lvl > lim.rms[1])) {
        f.push(`${job.kind === 'stingers' ? 'active ' : ''}RMS ${lvl.toFixed(1)} dBFS outside ${lim.rms[0]}..${lim.rms[1]}`);
      }
      if (r.seam !== undefined && r.seam < r.seamRef - 18) f.push(`loop seam nearly silent (${r.seam.toFixed(1)} dBFS vs ${r.seamRef.toFixed(1)})`);
    }
    r.fails = f;
    for (const x of f) fails.push(`${job.kind} '${job.id}': ${x}`);
    if (r.wav) {
      fs.writeFileSync(path.join(wavDir, `${job.kind}_${job.id}.wav`), Buffer.from(r.wav, 'base64'));
      delete r.wav;
    }
    results.push(r);
    if (!args.json) {
      const head = `${(r.fails.length ? 'FAIL' : 'ok  ')} ${job.kind.padEnd(11)} ${job.id.padEnd(14)}`;
      if (r.error) console.log(`${head} ${r.error}`);
      else {
        let line = `${head} dur ${fmt(r.dur, 6)}s  peak ${fmt(r.peak)}  rms ${fmt(r.rms)}  active ${fmt(r.activeRms)}  LUFS ${fmt(r.lufs)}  max ${fmt(r.lmax)}  ` +
          `span ${fmt(r.onset, 5)}-${fmt(r.end, 5)}s  ${String(r.ms).padStart(5)}ms`;
        if (r.seam !== undefined) line += `  seam ${fmt(r.seam)}`;
        console.log(line);
        if (args.verbose) {
          console.log(`       env ${r.env.join(',')}`);
          if (r.bands) console.log(`       bands ${JSON.stringify(r.bands)}`);
        }
        for (const x of r.fails) console.log(`       -> ${x}`);
      }
    }
  }

  // ---- spectrogram sheets
  if (args.png) {
    const kinds = Array.from(new Set(jobs.map((j) => j.kind)));
    for (const kind of kinds) {
      const ids = jobs.filter((j) => j.kind === kind).map((j) => j.id);
      for (let p = 0; p * 24 < ids.length; p++) {
        const chunk = ids.slice(p * 24, p * 24 + 24);
        await page.evaluate(({ kind, chunk }) => {
          const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
          const cols = kind === 'tracks' ? 1 : 4, rows = Math.ceil(24 / cols);
          const w = Math.floor(1600 / cols) - 4, h = kind === 'tracks' ? 190 : Math.floor(1200 / rows) - 4;
          chunk.forEach((id, k) => {
            const buf = window.__AC.buffers[kind + ':' + id];
            if (!buf) return;
            // short sounds: show only the active span (+ a little tail)
            const st = window.__AC.stats(buf);
            const secs = kind === 'sfx' || kind === 'instruments' ? Math.min(buf.duration, Math.max(0.4, (st.end || 0) + 0.1)) : buf.duration;
            window.__AC.spectrogram(ctx, buf, (k % cols) * (w + 4), Math.floor(k / cols) * (h + 4), w, h,
              `${id} (${secs.toFixed(2)}s, pk ${st.peak.toFixed(0)})`, 10000, secs, kind === 'sfx' || kind === 'instruments');
          });
        }, { kind, chunk });
        const out = path.join(wavDir, `spectro_${kind}${p ? '_' + (p + 1) : ''}.png`);
        await page.screenshot({ path: out });
        if (!args.json) console.log(`spectrogram -> ${path.relative(ROOT, out)}`);
      }
    }
  }

  // late console errors (e.g. thrown while rendering)
  for (const e of errors.slice(loadErrors.length)) fails.push(`runtime: ${e}`);
  await closeAll();

  if (args.json) {
    console.log(JSON.stringify({ ok: !fails.length, fails, notes, missingTracks, registry: reg, results }, null, 2));
  } else {
    console.log('');
    console.log(`scripts: ${srcs.length} loaded (namespace + audio + tracks)`);
    console.log(`tracks defined: ${reg.tracks.join(' ') || '(none)'}`);
    if (missingTracks.length) console.log(`tracks not defined yet: ${missingTracks.join(' ')}`);
    for (const id of reg.tracks) {
      const t = reg.info[id];
      if (t) console.log(`  ${id.padEnd(10)} ${t.bpm} bpm  intro ${t.intro.toFixed(1)}s  body ${t.body.toFixed(1)}s  ${t.loop ? 'loop' : 'tail ' + t.tail + 's'}  sections ${t.sections.join(',')}`);
    }
    for (const n of notes) console.log(n);
    console.log(fails.length ? `\nFAIL (${fails.length}):\n  ` + fails.join('\n  ') : `\nPASS (${results.length} renders)`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await closeAll(); process.exit(1); });
