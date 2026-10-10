// src/entities/enemies/guttered.js — The Guttered Ways enemies (region builder: region-guttered):
//   snuffed_walker — the basic Snuffed husk: slumped grey-blue wax, dead wick trailing Pall smoke. Shambles
//                    on its beat; when the Wickling is close in front it rears up (0.45 s) and lunges ~4 tiles.
//   snuffed_lancer — an Old Guard husk under a snuffer-cap helm with a long iron candle-lance. Marches slowly,
//                    turns slowly; levels the lance, plants (0.5 s glint) and thrusts a long way (stops at walls
//                    and ledges). Get behind it while it recovers.
//   drip_fly       — a hovering drip of tallow on frail wings; drifts above the Wickling's head and, when
//                    roughly overhead, swells (0.5 s) and lets fall a hot wax drip (projectile 'wax_drip').
//   wick_crawler   — a crawling tangle of braided wick that follows floors, walls and ceilings (contact only).
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G.Enemy) return;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const h01 = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------------ sfx (defined only if the audio module lacks them)
  (function defineSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    if (have.indexOf('wax_sizzle') < 0) {
      A.defineSfx('wax_sizzle', {   // a hot drip of wax hitting cold stone: short hiss + tick
        vol: 3.2, reverb: 0.15,
        play(k) {
          const v = k.r(0.92, 1.08);
          k.noise({ bp: 4200 * v, bp1: 2600 * v, Q: 1.2, a: 0.004, d: 0.28, g: 0.1, sweep: 0.28 });
          k.tone({ f: 900 * v, f1: 420 * v, glide: 0.05, a: 0.001, d: 0.06, g: 0.05, type: 'triangle' });
        },
      });
    }
    if (have.indexOf('lance_thrust') < 0) {
      A.defineSfx('lance_thrust', {  // heavy forward rush: low whoosh + iron scrape
        vol: 3.6, reverb: 0.12,
        play(k) {
          const v = k.r(0.94, 1.05);
          k.noise({ bp: 380 * v, bp1: 1500 * v, Q: 1.3, a: 0.02, d: 0.3, g: 0.16, sweep: 0.3 });
          k.noise({ bp: 3100 * v, Q: 6, a: 0.005, d: 0.18, g: 0.05, at: 0.03 });
          k.tone({ f: 110 * v, f1: 70 * v, glide: 0.2, a: 0.004, d: 0.22, g: 0.12 });
        },
      });
    }
  })();

  // Shared colours: the Snuffed are cold grey-blue wax with white pinprick eyes (ART_GUIDE §6/§7).
  const SN = { body: '#8e98a8', shade: '#262b36', hi: '#e2e8f2', dark: '#3d4452', rim: '#b9c7dc', limb: '#22222a', outline: '#141218', smoke: '#7e879a', puddle: '#7c8596' };
  const TELE = '#ffe2a8';

  /** Thick limb stroke with an outline (wax arm / leg). pts = [x0,y0, cx,cy, x1,y1] quadratic. */
  function limb(ctx, x0, y0, cx, cy, x1, y1, width, color) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.strokeStyle = SN.outline; ctx.lineWidth = width + 3; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  // =====================================================================================================
  // snuffed_walker
  // =====================================================================================================
  class SnuffedWalker extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 18, w: 34, h: 50,
        cinders: [3, 6],
        weight: 1,
        sight: 7 * TILE,
        colors: { body: SN.body, dark: SN.dark, hit: '#dfe4ec', smoke: SN.smoke, puddle: SN.puddle, tele: TELE },
        puddleW: 26,
      });
      this.speed = props.speed || 40;
      this.walk = Math.random() * TAU;
      this.rear = 0; this.lungeK = 0; this.slump = 0; this.hurtT = 0;
      this.stepAcc = 0;
      this.var = h01(3, (this.seed * 7) | 0);  // per-instance body variation
    }
    init() { super.init(); this.setState('patrol'); }

    /** The Wickling is close, in front, on roughly the same level and visible. */
    spots(p) {
      if (!this.targetable(p)) return false;
      const dx = this.dx(p), dy = this.dy(p);
      return (dx > 0 ? 1 : -1) === this.facing && Math.abs(dx) < 4.6 * TILE && Math.abs(dy) < 1.6 * TILE && this.canSee(p, 5 * TILE);
    }
    think(dt) {
      const p = this.player;
      if (this.hurtT > 0) this.hurtT -= dt;
      switch (this.state) {
        case 'patrol':
          this.patrol(this.speed, { pause: 0.7 });
          if (this.ready('lunge') && this.grounded && this.spots(p)) this.setState('rear');
          break;
        case 'rear':                                          // TELEGRAPH: rears up, claws raised, eyes flare
          this.stop();
          if (this.once('tele')) this.stateData.w = this.telegraph(0.45, { shake: 1.2, vol: 0.7 });
          if (this.stateTime >= this.stateData.w) this.setState('lunge');
          break;
        case 'lunge': {
          if (this.once('go')) G.sfxAt('dash', this.cx, { vol: 0.45, pitch: 0.55 });
          const blocked = this.charge(430);
          this.strike(this.clawRect());
          if (G.fx && this.every(0.05)) G.fx.burst('dust', this.cx - this.facing * 10, this.bottom, { count: 1, color: '#7a6a58' });
          if (blocked || this.stateTime > 0.36) this.setState('recover');
          break;
        }
        case 'recover':                                       // punish window: slumped, panting smoke
          this.stop(1500);
          if (this.stateTime > 0.75) { this.cooldown('lunge', 1.0); this.setState('patrol'); }
          break;
        default: this.setState('patrol');
      }
      // animation blends
      const r = this.is('rear') ? 1 : 0, l = this.is('lunge') ? 1 : 0, s = this.is('recover') ? 1 : 0;
      this.rear = toward(this.rear, r, dt * (r ? 3.2 : 7));
      this.lungeK = toward(this.lungeK, l, dt * 12);
      this.slump = toward(this.slump, s, dt * (s ? 6 : 2.5));
      this.walk += Math.abs(this.vx) * dt * 0.16;
      if (this.is('patrol') && Math.abs(this.vx) > 1) this.footsteps(dt);
    }
    footsteps(dt) {
      this.stepAcc += dt;
      if (this.stepAcc < 0.62) return;
      this.stepAcc = 0;
      const p = this.player;
      if (p && Math.abs(this.dx(p)) < 7 * TILE && Math.abs(this.dy(p)) < 3 * TILE) G.sfxAt('step', this.cx, { vol: 0.16, pitch: rnd(0.42, 0.5) });
    }
    clawRect() { return { x: this.facing > 0 ? this.right - 6 : this.x - 22, y: this.y + 6, w: 28, h: this.h * 0.62 }; }
    onHurt(hit) {
      this.hurtT = 0.22;
      if (this.is('patrol') && hit && hit.source) this.face(hit.source);   // struck from behind: turn and face
    }
    drawBounds() { return { x: this.x - 34, y: this.y - 70, w: this.w + 68, h: this.h + 78 }; }
    drawBody(ctx, t) {
      drawWalker(ctx, this.cx, this.y + this.h, this.facing, t, {
        walk: this.walk, rear: this.rear, lunge: this.lungeK, slump: this.slump, hurt: this.hurtT, seed: this.seed,
        v: this.var, tele: this.telegraphing, dead: !!this.dying,
      });
    }
  }

  // Walker silhouette keyframes (facing right, feet-relative px; y up is negative). Each pose: start point,
  // five cubic segments (c1, c2, end) tracing back → drooping head → brow → chest → belly, plus anchors.
  const WALK_POSES = {
    hunch: { pts: [-17, 0, -21, -16, -17, -32, -6, -40, 0, -45, 10, -45, 14, -38, 17, -33, 15, -27, 11, -26, 9, -22, 12, -14, 15, -8, 17, -4, 17, -1, 15, 0],
      eye: [8, -30], wick: [3, -44], sh: [5, -24], far: [-6, -26] },
    rear: { pts: [-15, 0, -19, -18, -17, -38, -10, -50, -6, -57, 5, -58, 9, -51, 12, -46, 12, -41, 9, -39, 12, -30, 17, -18, 17, -9, 18, -4, 17, -1, 15, 0],
      eye: [5, -45], wick: [0, -57], sh: [4, -36], far: [-7, -37] },
    lunge: { pts: [-18, 0, -20, -12, -12, -26, 0, -32, 8, -36, 18, -36, 22, -29, 24, -24, 21, -20, 17, -20, 15, -16, 18, -10, 19, -6, 20, -3, 19, -1, 16, 0],
      eye: [16, -26], wick: [9, -35], sh: [12, -21], far: [1, -23] },
    slump: { pts: [-18, 0, -22, -14, -17, -27, -5, -34, 2, -38, 12, -37, 16, -30, 19, -25, 16, -20, 12, -20, 10, -17, 13, -11, 16, -6, 18, -3, 18, -1, 16, 0],
      eye: [10, -23], wick: [4, -37], sh: [6, -18], far: [-5, -20] },
  };
  const _wp = { pts: new Array(32).fill(0), eye: [0, 0], wick: [0, 0], sh: [0, 0], far: [0, 0] };
  function blendWalker(kh, kr, kl, ks) {
    const P = WALK_POSES, o = _wp;
    for (let i = 0; i < 32; i++) o.pts[i] = P.hunch.pts[i] * kh + P.rear.pts[i] * kr + P.lunge.pts[i] * kl + P.slump.pts[i] * ks;
    for (const k of ['eye', 'wick', 'sh', 'far']) for (let i = 0; i < 2; i++) o[k][i] = P.hunch[k][i] * kh + P.rear[k][i] * kr + P.lunge[k][i] * kl + P.slump[k][i] * ks;
    return o;
  }

  /** Walker art; feet centre (fx, fy). s: {walk, rear, lunge, slump, hurt, seed, v, tele, dead}. */
  function drawWalker(ctx, fx, fy, f, t, s) {
    const ch = G.Art && G.Art.char;
    const dead = !!s.dead;
    const rear = s.rear || 0, lunge = s.lunge || 0, slump = s.slump || 0, hurt = s.hurt > 0 ? s.hurt / 0.22 : 0;
    const legH = 7;
    if (!ch) { ctx.fillStyle = SN.body; ctx.fillRect(fx - 17, fy - 48, 34, 48); return; }
    ch.shadow(ctx, fx, fy, 22, 0.5);
    const ph = s.walk || 0;
    // legs: two stubby dark legs, alternating while walking, planted wide when rearing
    for (const side of [-1, 1]) {
      const stride = dead ? 0 : Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 5 * (1 - rear);
      const lift = dead ? 0 : Math.max(0, Math.cos(ph + (side > 0 ? 0 : Math.PI))) * 2.5 * (1 - rear);
      const hx = fx + side * 6, footX = fx + side * (6 + rear * 4 + lunge * 3) + f * stride;
      ctx.globalAlpha = side === -f ? 0.8 : 1;
      limb(ctx, hx, fy - legH - 2, (hx + footX) / 2, fy - legH * 0.4, footX, fy - 1.5 - lift, 5, SN.limb);
    }
    ctx.globalAlpha = 1;
    // pose blend
    const sum = rear + lunge + slump, kh = Math.max(0, 1 - sum), n = Math.max(1, sum + kh);
    const P = blendWalker(kh / n, rear / n, lunge / n, slump / n);
    const v = s.v || 0;
    const bob = dead ? 0 : -Math.abs(Math.sin(ph)) * 1.4 * (1 - rear);
    const sy = (1 + (v - 0.5) * 0.1) * (1 - hurt * 0.08), sx = 1 + hurt * 0.06;
    const by = fy - legH + 2 + bob;
    const X = (x) => fx + f * x * sx - f * hurt * 3 * (1 - (x + 20) / 40), Y = (y) => by + y * sy;
    const armPose = (dir, sh) => {
      const sway = dead ? 0 : Math.sin(ph * 0.5 + dir) * 2;
      const idle = [6 + sway * 0.5, 20], up = [7, -26], fwd = [22, -2], sl = [9, 18];
      return [sh[0] + idle[0] * kh / n + up[0] * rear / n + fwd[0] * lunge / n + sl[0] * slump / n,
              sh[1] + idle[1] * kh / n + up[1] * rear / n + fwd[1] * lunge / n + sl[1] * slump / n];
    };
    // far arm (behind the body, dimmer)
    {
      const [hx, hy] = armPose(1.7, P.far);
      ctx.globalAlpha = 0.9;
      limb(ctx, X(P.far[0]), Y(P.far[1]), X((P.far[0] + hx) / 2 + 3), Y((P.far[1] + hy) / 2 + 2), X(hx), Y(hy), 3.8, '#5d6676');
      claws(ctx, X(hx), Y(hy), f * (hx - P.far[0]), hy - P.far[1], '#2a2a33');
      ctx.globalAlpha = 1;
    }
    // body silhouette
    const p = P.pts;
    const body = new Path2D();
    body.moveTo(X(p[0]), Y(p[1]));
    for (let i = 2; i < 32; i += 6) body.bezierCurveTo(X(p[i]), Y(p[i + 1]), X(p[i + 2]), Y(p[i + 3]), X(p[i + 4]), Y(p[i + 5]));
    body.closePath();
    let top = 0; for (let i = 1; i < 32; i += 2) top = Math.min(top, p[i]);
    const box = [fx - 22, Y(top), fx + 22, by];
    ch.shape(ctx, body, { fill: SN.body, box, light: -1, shade: 0.5, hi: 0.26, lw: 2, rim: SN.rim, rimWidth: 1.8 });
    ctx.save();
    ctx.clip(body);
    // sagging folds of melted wax across the back and the shadowed face recess under the drooping brow
    ctx.strokeStyle = 'rgba(30,34,44,0.38)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(p[4] + 2), Y(p[5] - 2)); ctx.quadraticCurveTo(X(p[6] + 8), Y(p[7] + 9), X(P.sh[0] + 3), Y(P.sh[1] + 3));
    ctx.moveTo(X(p[2] + 3), Y(p[3] + 4)); ctx.quadraticCurveTo(X(0), Y(p[3] + 9), X(P.sh[0] + 5), Y(P.sh[1] + 14));
    ctx.stroke();
    ctx.fillStyle = 'rgba(12,12,18,0.5)';
    ctx.beginPath(); ctx.ellipse(X(P.eye[0] + 1), Y(P.eye[1] + 1), 8, 5.5, 0, 0, TAU); ctx.fill();
    // pale drips running down from the brow
    ctx.fillStyle = 'rgba(214,222,234,0.55)';
    for (let i = 0; i < 3; i++) {
      const dx = X(P.eye[0] - 6 + i * 6), dy = Y(P.eye[1] + 5 + (i % 2) * 2), dl = 6 + h01(i, 4) * 7 + slump * 4;
      ctx.beginPath(); ctx.moveTo(dx - 1.6, dy); ctx.quadraticCurveTo(dx - 2, dy + dl * 0.7, dx, dy + dl); ctx.quadraticCurveTo(dx + 2, dy + dl * 0.7, dx + 1.6, dy); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // near arm (in front): long, thin, dangling — raised on the wind-up, thrown forward on the lunge
    {
      const [hx, hy] = armPose(0, P.sh);
      limb(ctx, X(P.sh[0]), Y(P.sh[1]), X((P.sh[0] + hx) / 2 + 4), Y((P.sh[1] + hy) / 2 + 1), X(hx), Y(hy), 4.4, '#9aa4b4');
      claws(ctx, X(hx), Y(hy), f * (hx - P.sh[0]), hy - P.sh[1], '#2a2a33');
    }
    // face: pinprick eyes in the shadow of the brow (flare warm on the wind-up), a gaping mouth when rearing
    const ex = X(P.eye[0]), ey = Y(P.eye[1]);
    if (!dead) {
      ch.eyes(ctx, ex, ey, { kind: 'pinprick', size: 9, gap: 7, glow: true, color: s.tele || rear > 0.5 ? '#ffe9b0' : undefined, blink: rear > 0.1 || lunge > 0.1 ? 0 : ch.blinkAt(t, s.seed | 0, 4.5) });
      const mouth = Math.max(rear, lunge * 0.7);
      if (mouth > 0.05) {
        ctx.fillStyle = '#16141c';
        ctx.beginPath(); ctx.ellipse(ex - f * 1, ey + 7, 3.6, 0.8 + 3.4 * mouth, 0, 0, TAU); ctx.fill();
      }
    } else {
      ctx.strokeStyle = '#1a1820'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - 5, ey); ctx.lineTo(ex - 2, ey + 1); ctx.moveTo(ex + 2, ey + 1); ctx.lineTo(ex + 5, ey); ctx.stroke();
    }
    // dead wick from the crown, bent back, trailing Pall smoke
    const tip = ch.wick(ctx, X(P.wick[0]), Y(P.wick[1]) + 2, { len: 10, bend: -f * (5 + lunge * 4), width: 2.6, curl: -f * 3 });
    if (!dead) ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 5, height: 50 + slump * 14, spread: 9, size: 4.5, alpha: 0.32 + slump * 0.1, seed: s.seed, drift: -f * (8 + lunge * 20) });
  }
  function claws(ctx, x, y, ax, ay, color) {
    const a = Math.atan2(ay, ax || 0.001);
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const aa = a + i * 0.45;
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(aa) * 5.5, y + Math.sin(aa) * 5.5);
    }
    ctx.stroke();
  }

  G.registerEnemy('snuffed_walker', SnuffedWalker);

  // =====================================================================================================
  // snuffed_lancer
  // =====================================================================================================
  const LN = { body: '#8a94a4', helm: '#34343e', helmHi: '#9094a2', tabard: '#4a3828', tabardHi: '#6c5238', sigil: '#c08a42', shaft: '#4a4038', shaftHi: '#8c7a62', iron: '#3a3a44', point: '#cdd2da' };
  const UPRIGHT = -1.42, LEVEL = -0.06;

  class SnuffedLancer extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 22, w: 32, h: 60,
        cinders: [4, 7],
        weight: 1.6,                                         // a planted guard: short knockback, no hit-stun
        sight: 7 * TILE,
        colors: { body: LN.body, dark: SN.dark, hit: '#dfe4ec', smoke: SN.smoke, puddle: SN.puddle, tele: TELE },
        puddleW: 26,
      });
      this.speed = props.speed || 30;
      this.range = props.range != null ? +props.range * TILE : 5 * TILE;
      this.walk = Math.random() * TAU;
      this.lanceA = UPRIGHT; this.reach = 0; this.plant = 0; this.turnK = 0; this.hurtT = 0;
    }
    init() { super.init(); this.setState('march'); }

    sees(p, front) {
      if (!this.targetable(p)) return false;
      const dx = this.dx(p), dy = this.dy(p);
      const inFront = (dx > 0 ? 1 : -1) === this.facing;
      if (front !== inFront) return false;
      return Math.abs(dx) < (front ? 6.2 : 4.5) * TILE && Math.abs(dy) < 1.7 * TILE && this.canSee(p, 7 * TILE);
    }
    think(dt) {
      const p = this.player;
      if (this.hurtT > 0) this.hurtT -= dt;
      switch (this.state) {
        case 'march':                                        // walks its beat, lance upright
          this.patrol(this.speed, { pause: 1.1, range: this.range });
          if (this.ready('thrust') && this.grounded) {
            if (this.sees(p, true)) this.setState('level');
            else if (this.sees(p, false)) this.setState('turn');
          }
          break;
        case 'turn':                                         // turns SLOWLY: the opening for getting behind it
          this.stop();
          if (this.at(0.6)) this.facing = -this.facing;
          if (this.stateTime > 0.85) this.setState(this.sees(p, true) && this.ready('thrust') ? 'level' : 'march');
          break;
        case 'level':                                        // lowers the lance (readable from afar)
          this.stop();
          if (this.stateTime > 0.3) this.setState('plant');
          break;
        case 'plant': {                                      // TELEGRAPH: feet planted, lance drawn back, tip glints
          this.stop();
          if (this.once('tele')) {
            const tp = this.tipPos();
            this.stateData.w = this.telegraph(0.5, { x: tp.x, y: tp.y, shake: 1.0 });
          }
          if (this.stateTime >= this.stateData.w) this.setState('thrust');
          break;
        }
        case 'thrust': {
          if (this.once('go')) { G.sfxAt('lance_thrust', this.cx, { vol: 0.9 }); if (G.game && G.game.shake) G.game.shake(2, 0.12); }
          const blocked = this.charge(560);
          this.strike(this.lanceRect());
          if (G.fx && this.every(0.04)) G.fx.burst('dust', this.cx - this.facing * 14, this.bottom, { count: 2, color: '#7a6a58' });
          if (blocked || this.stateTime > 0.82) {
            if (blocked && G.fx) G.fx.burst('spark', this.tipPos().x, this.tipPos().y, { count: 6, color: '#ffd9a0', speed: 220 });
            this.setState('recover');
          }
          break;
        }
        case 'recover':                                      // over-extended: lance tip dips, punishable
          this.stop(1800);
          if (this.stateTime > 0.95) { this.cooldown('thrust', 0.9); this.setState('march'); }
          break;
        default: this.setState('march');
      }
      // animation blends
      const st = this.state;
      const wantA = st === 'march' || st === 'turn' ? UPRIGHT : st === 'recover' ? 0.32 : LEVEL;
      this.lanceA = toward(this.lanceA, wantA, dt * (st === 'level' ? 6 : st === 'recover' ? 3 : 4));
      this.reach = toward(this.reach, st === 'thrust' ? 1 : st === 'plant' ? -0.6 : 0, dt * (st === 'thrust' ? 14 : 4));
      this.plant = toward(this.plant, st === 'plant' || st === 'thrust' ? 1 : st === 'recover' ? 0.5 : 0, dt * 6);
      this.turnK = st === 'turn' ? Math.sin(clamp(this.stateTime / 0.85, 0, 1) * Math.PI) : toward(this.turnK, 0, dt * 6);
      this.walk += Math.abs(this.vx) * dt * 0.14;
    }
    /** World position of the lance point (used for the telegraph glint and sparks). */
    tipPos() {
      const g = this.lanceGeom(this.cx, this.y + this.h, this.facing);
      return { x: g.tipX, y: g.tipY };
    }
    lanceGeom(fx, fy, f) {
      const hh = 44 * (1 - 0.1 * this.plant);
      const px = fx + f * (9 + this.reach * 10), py = fy - 12 - hh * 0.5;
      const dx = f * Math.cos(this.lanceA), dy = Math.sin(this.lanceA);
      const L = 66;
      return { px, py, dx, dy, tipX: px + dx * (L + 16), tipY: py + dy * (L + 16), L };
    }
    lanceRect() {
      const f = this.facing, len = 64;
      return { x: f > 0 ? this.right - 4 : this.x - len + 4, y: this.y + this.h * 0.32, w: len, h: 18 };
    }
    onHurt() { this.hurtT = 0.2; }
    drawBounds() { return { x: this.x - 100, y: this.y - 80, w: this.w + 200, h: this.h + 88 }; }
    drawBody(ctx, t) {
      const g = this.lanceGeom(this.cx, this.y + this.h, this.facing);
      drawLancer(ctx, this.cx, this.y + this.h, this.facing, t, {
        walk: this.walk, plant: this.plant, reach: this.reach, turn: this.turnK, hurt: this.hurtT, seed: this.seed,
        tele: this.telegraphing, dead: !!this.dying, g,
      });
    }
  }

  /** Lancer art; feet centre (fx, fy). s.g = lance geometry {px, py, dx, dy, L}. */
  function drawLancer(ctx, fx, fy, f, t, s) {
    const ch = G.Art && G.Art.char;
    const dead = !!s.dead, plant = s.plant || 0, hurt = s.hurt > 0 ? s.hurt / 0.2 : 0;
    const legH = 12;
    if (!ch) { ctx.fillStyle = LN.body; ctx.fillRect(fx - 16, fy - 60, 32, 60); return; }
    ch.shadow(ctx, fx, fy, 24, 0.5);
    // legs: long and dark; planted wide for the thrust
    const ph = s.walk || 0;
    for (const side of [-1, 1]) {
      const stride = dead ? 0 : Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 5 * (1 - plant);
      const lift = dead ? 0 : Math.max(0, Math.cos(ph + (side > 0 ? 0 : Math.PI))) * 2.2 * (1 - plant);
      const hx = fx + side * 5, footX = fx + side * (5 + plant * 7) + f * stride;
      ctx.globalAlpha = side === -f ? 0.8 : 1;
      limb(ctx, hx, fy - legH - 3, (hx + footX) / 2 - f * plant * 2, fy - legH * 0.45, footX, fy - 1.5 - lift, 5, SN.limb);
    }
    ctx.globalAlpha = 1;
    const hh = 44 * (1 - 0.1 * plant) * (1 - hurt * 0.05);
    const lean = f * (2 + 9 * Math.max(0, s.reach) - 4 * Math.max(0, -s.reach) - hurt * 4) ;
    const sq = 1 - (s.turn || 0) * 0.06;
    // tattered cloak behind the body
    {
      const bx = fx + lean * 0.4, top = fy - legH - hh + 8;
      const cl = new Path2D();
      cl.moveTo(bx - f * 2, top);
      cl.quadraticCurveTo(bx - f * 22, top + hh * 0.4, bx - f * (20 + plant * 4), top + hh * 0.86);
      for (let i = 0; i < 4; i++) cl.lineTo(bx - f * (16 - i * 4.5), top + hh * (0.8 + (i % 2) * 0.1) + Math.sin(t * 2 + i) * 1.2);
      cl.lineTo(bx + f * 2, top + hh * 0.5);
      cl.closePath();
      ch.shape(ctx, cl, { fill: '#3a2c22', box: [bx - 24, top, bx + 24, top + hh], light: -1, shade: 0.3, lw: 1.6 });
    }
    const b = ch.waxBody(ctx, fx + lean * 0.2, fy - legH + 2, 30, hh * sq, {
      variant: 'candle', color: LN.body, shade: SN.shade, hi: SN.hi, drips: 3, seed: 23, lean, light: -1, rim: SN.rim,
    });
    // tabard of the Old Guard: dark cloth with a faded flame sigil, ragged hem
    {
      const top = b.top + hh * 0.3, bot = b.top + hh * 0.9, cx = b.cx + lean * 0.35, wt = b.w * 0.36, wb = b.w * 0.46;
      const tb = new Path2D();
      tb.moveTo(cx - wt, top);
      tb.lineTo(cx + wt, top);
      tb.lineTo(cx + wb, bot - 3);
      const n = 5;
      for (let i = 0; i <= n; i++) tb.lineTo(cx + wb - (2 * wb * i) / n, bot + (i % 2 ? 4 : -1) + h01(i, 5) * 2);
      tb.closePath();
      ch.shape(ctx, tb, { fill: LN.tabard, box: [cx - wb, top, cx + wb, bot], light: -1, shade: 0.35, lw: 1.6, rim: LN.tabardHi, rimWidth: 1.2 });
      // flame sigil (faded amber)
      const sx = cx + f * 1, sy = top + (bot - top) * 0.42;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = LN.sigil;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 7); ctx.quadraticCurveTo(sx + 4.5, sy - 1, sx + 2.5, sy + 4);
      ctx.quadraticCurveTo(sx, sy + 6, sx - 2.5, sy + 4); ctx.quadraticCurveTo(sx - 4.5, sy - 1, sx, sy - 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // snuffer-cap helm (a candle snuffer worn as a helmet), a ring at its peak; Pall leaks from the ring
    const hx = b.cx + lean * 0.9, brimY = b.top + hh * 0.17;
    {
      const hw = b.topW * 0.6 + 3, peakX = hx - f * 3, peakY = brimY - 17;
      const hp = new Path2D();
      hp.moveTo(hx - hw, brimY + 1);
      hp.quadraticCurveTo(hx - hw * 0.7, brimY - 12, peakX - 2.5, peakY + 2);
      hp.lineTo(peakX + 2.5, peakY + 2);
      hp.quadraticCurveTo(hx + hw * 0.7, brimY - 12, hx + hw, brimY + 1);
      hp.quadraticCurveTo(hx, brimY + 5, hx - hw, brimY + 1);
      hp.closePath();
      ch.shape(ctx, hp, { fill: LN.helm, box: [hx - hw, peakY, hx + hw, brimY + 4], light: -1, shade: 0.45, hi: 0.3, lw: 2, rim: LN.helmHi, rimWidth: 1.6 });
      ctx.strokeStyle = SN.outline; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.arc(peakX, peakY - 3, 3.4, 0, TAU); ctx.stroke();
      ctx.strokeStyle = LN.helmHi; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(peakX, peakY - 3, 3.4, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
      if (!dead) ch.pallSmoke(ctx, peakX, peakY - 6, t, { count: 4, height: 46, spread: 7, size: 4, alpha: 0.28, seed: s.seed, drift: -f * 7 });
      // eyes in the shadow under the brim
      ctx.fillStyle = 'rgba(14,12,18,0.55)';
      ctx.beginPath(); ctx.ellipse(hx + f * 2, brimY + 5, hw * 0.8, 4, 0, 0, TAU); ctx.fill();
      if (!dead) ch.eyes(ctx, hx + f * b.w * 0.14, brimY + 5.5, { kind: 'pinprick', size: 8, gap: 7, glow: true, color: s.tele ? '#ffe9b0' : undefined, blink: s.tele ? 0 : ch.blinkAt(t, (s.seed | 0) + 3, 5) });
    }
    // the candle-lance: shaft, a drip-pan collar and a long pricket point (held at the near hand)
    const g = s.g;
    if (g) {
      const bx0 = g.px - g.dx * 30, by0 = g.py - g.dy * 30, tx = g.px + g.dx * g.L, ty = g.py + g.dy * g.L;
      ctx.lineCap = 'round';
      ctx.strokeStyle = SN.outline; ctx.lineWidth = 6.5;
      ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = LN.shaft; ctx.lineWidth = 3.6; ctx.stroke();
      ctx.strokeStyle = LN.shaftHi; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(bx0 - g.dy * 1, by0 + g.dx * 1 * f); ctx.lineTo(tx - g.dy * 1, ty + g.dx * f); ctx.stroke();
      ctx.globalAlpha = 1;
      // drip-pan collar (perpendicular dish) with old wax on it
      const nx = -g.dy, ny = g.dx;
      ctx.strokeStyle = SN.outline; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(tx + nx * 8, ty + ny * 8); ctx.lineTo(tx - nx * 8, ty - ny * 8); ctx.stroke();
      ctx.strokeStyle = LN.iron; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#cfc6b0';
      ctx.beginPath(); ctx.ellipse(tx + nx * 3 - g.dx * 2, ty + ny * 3 - g.dy * 2, 3, 2, Math.atan2(g.dy, g.dx), 0, TAU); ctx.fill();
      // the point
      const L2 = 18, W2 = 4.2;
      const pt = new Path2D();
      pt.moveTo(tx + g.dx * L2, ty + g.dy * L2);
      pt.lineTo(tx + nx * W2, ty + ny * W2);
      pt.lineTo(tx - nx * W2, ty - ny * W2);
      pt.closePath();
      ctx.lineJoin = 'round'; ctx.strokeStyle = SN.outline; ctx.lineWidth = 3; ctx.stroke(pt);
      ctx.fillStyle = s.tele ? '#fff4d8' : LN.point; ctx.fill(pt);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx + nx * 1.5, ty + ny * 1.5); ctx.lineTo(tx + g.dx * (L2 - 3), ty + g.dy * (L2 - 3)); ctx.stroke();
      if (s.tele && G.Art.glow) G.Art.glow(ctx, tx + g.dx * L2, ty + g.dy * L2, 22, '#ffe2a8', 0.5 + 0.3 * Math.sin(t * 30));
      // near arm gripping the shaft
      const sx = b.cx + lean * 0.6 + f * b.w * 0.2, sy = b.top + hh * 0.36;
      limb(ctx, sx, sy, (sx + g.px) / 2 + f * 2, (sy + g.py) / 2 + 6, g.px, g.py, 4.6, '#98a2b2');
      ctx.fillStyle = '#9aa4b4'; ctx.strokeStyle = SN.outline; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(g.px, g.py, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }

  G.registerEnemy('snuffed_lancer', SnuffedLancer);

  // =====================================================================================================
  // drip_fly  (+ projectile 'wax_drip')
  // =====================================================================================================
  const DF = { body: '#cbbfa2', shade: '#5b4f3e', hi: '#fff3d8', wing: 'rgba(226,220,204,0.42)', wingEdge: 'rgba(60,52,44,0.65)', vein: 'rgba(80,70,58,0.55)', hot: '#ffb45a', hotCore: '#fff0c0', puddle: '#b8ac90' };

  class DripFly extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 12, w: 28, h: 30,
        flying: true,
        cinders: [2, 4],
        weight: 0.6,
        sight: 8 * TILE,
        colors: { body: DF.body, dark: DF.shade, hit: '#fff2dc', smoke: '#8a8070', puddle: DF.puddle, tele: DF.hot },
        light: { r: 54, color: DF.hot, intensity: 0.38, dy: 10, flicker: true },
        puddleW: 15,
      });
      this.flap = Math.random() * TAU;
      this.swell = 0;
      this.lostT = 0;
      this.side = Math.random() < 0.5 ? -1 : 1;
    }
    init() { super.init(); this.setState('hover'); }
    think(dt) {
      this.flap += dt * 46;
      const p = this.player;
      switch (this.state) {
        case 'hover':
          this.hover(null, null, dt, { amp: 12, freq: 0.4, speed: 50, accel: 220 });
          if (this.stateTime > 0.4 && this.canSee(p)) this.setState('stalk');
          break;
        case 'stalk': {                                       // drift to a spot above the Wickling's head
          if (!this.targetable(p)) { this.setState('return'); break; }
          this.face(p);
          const px = p.x + p.w / 2, ty = p.y - 2.7 * TILE + this.bob(9, 0.7);
          const dx = px - this.cx;
          this.flyTo(px + clamp(-dx * 0.15, -18, 18), ty, 92, dt, { accel: 240, arrive: 50, look: 46 });
          if (this.canSee(p, this.sight * 1.5)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 2.5) { this.setState('return'); break; }
          const above = p.y - this.bottom;                  // gap between my underside and its head
          if (this.ready('drip') && Math.abs(dx) < 0.75 * TILE && above > 0.8 * TILE && above < 6 * TILE && this.canSee(p)) this.setState('swell');
          break;
        }
        case 'swell': {                                       // TELEGRAPH: body squeezes, a hot drop swells beneath
          if (this.once('tele')) this.stateData.w = this.telegraph(0.5, { x: this.cx, y: this.bottom + 6, shake: 1.3, color: DF.hot, vol: 0.6 });
          this.vx = toward(this.vx, 0, 500 * dt); this.vy = toward(this.vy, 0, 500 * dt);
          if (this.targetable(p)) this.vx = clamp((p.x + p.w / 2 - this.cx) * 1.2, -26, 26);
          if (this.stateTime >= this.stateData.w) {
            this.fire('wax_drip', { x: this.cx, y: this.bottom + 5, vx: 0, vy: 60, sound: false, destroyable: true });
            G.sfxAt('splash', this.cx, { vol: 0.25, pitch: 1.9 });
            this.vy = -70;                                   // recoil upward as the weight lets go
            this.cooldown('drip', 1.7);
            this.setState('stalk');
          }
          break;
        }
        case 'return': {
          const d = this.flyTo(this.home.x, this.home.y, 70, dt, { accel: 220, arrive: 50 });
          if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
          if (this.stateTime > 0.6 && this.canSee(p)) this.setState('stalk');
          else if (d < 12 || this.stateTime > 6) this.setState('hover');
          break;
        }
        default: this.setState('hover');
      }
      this.swell = toward(this.swell, this.is('swell') ? 1 : 0, dt * (this.is('swell') ? 2 : 9));
      if (G.fx && Math.random() < dt * 0.8) G.fx.burst('drip', this.cx + rnd(-3, 3), this.bottom, { count: 1, color: DF.hot });
    }
    whileStunned() { this.flap += G.CONST.DT * 28; }
    drawBounds() { return { x: this.x - 34, y: this.y - 30, w: this.w + 68, h: this.h + 56 }; }
    drawBody(ctx, t) { drawDripFly(ctx, this.cx, this.cy, this.facing, t, { flap: this.flap, swell: this.swell, seed: this.seed, lean: clamp(this.vx / 300, -0.3, 0.3) }); }
    drawCorpse(ctx, t) { drawDripFly(ctx, this.cx, this.cy, this.facing, t, { flap: 1.1, swell: 0, seed: this.seed, dead: true }); }
  }

  let WING = null;
  function wingPath() {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(6, -9, 19, -13, 25, -8);
    p.quadraticCurveTo(28, -3, 21, 0);
    p.bezierCurveTo(14, 3, 6, 2, 0, 0);
    p.closePath();
    return p;
  }
  /** Drip-fly art centred at (x, y). s: {flap, swell, seed, lean, dead}. */
  function drawDripFly(ctx, x, y, f, t, s) {
    const ch = G.Art && G.Art.char;
    if (!WING) WING = wingPath();
    const dead = !!s.dead, sw = s.swell || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((s.lean || 0) * f * 0.5);
    // frail wings: two pairs, fast blur-flap (membranes are translucent)
    const beat = dead ? 0.4 : Math.sin(s.flap);
    for (const pair of [1, 0]) {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 3, -10 + pair * 3);
        ctx.scale(side * (pair ? 0.8 : 1), 1);
        ctx.rotate(-0.55 - beat * 0.6 + pair * 0.5);
        ctx.scale(1, dead ? 0.6 : 0.45 + 0.55 * Math.abs(beat));
        ctx.fillStyle = DF.wing; ctx.fill(WING);
        ctx.strokeStyle = DF.wingEdge; ctx.lineWidth = 1.1; ctx.stroke(WING);
        ctx.strokeStyle = DF.vein; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(1, 0); ctx.quadraticCurveTo(10, -6, 22, -7); ctx.moveTo(4, 0); ctx.quadraticCurveTo(12, -1, 19, -2); ctx.stroke();
        ctx.restore();
      }
    }
    // body: an upside-down drop of tallow — narrow neck at the wings, heavy bulb below (squeezed while swelling)
    const bw = 12 * (1 + sw * 0.12), bh = 1 - sw * 0.1;
    const body = new Path2D();
    body.moveTo(0, -15 * bh);
    body.bezierCurveTo(4, -12 * bh, bw, -2, bw, 5);
    body.arc(0, 5, bw, 0, Math.PI, false);
    body.bezierCurveTo(-bw, -2, -4, -12 * bh, 0, -15 * bh);
    body.closePath();
    // hot core seen through the wax
    if (ch) {
      ch.shape(ctx, body, { fill: DF.body, box: [-bw, -15, bw, 17], light: -1, shade: 0.42, hi: 0.3, lw: 1.8, rim: DF.hi, rimWidth: 1.2 });
    } else { ctx.fillStyle = DF.body; ctx.fill(body); }
    ctx.save();
    ctx.clip(body);
    if (G.Art && G.Art.glow) G.Art.glow(ctx, 0, 9, 13 + sw * 5, DF.hot, (dead ? 0.15 : 0.45) + sw * 0.4);
    // rings of old drips around the bulb
    ctx.strokeStyle = 'rgba(70,58,44,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, -3, bw * 0.75, 2.2, 0, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 2, bw * 0.95, 2.6, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
    // eyes high on the bulb
    if (!dead) {
      if (ch) ch.eyes(ctx, f * 3, -3, { kind: 'pinprick', size: 7, gap: 6, glow: true, color: sw > 0.3 ? '#fff0c0' : undefined, blink: ch.blinkAt(t, (s.seed | 0) + 1, 3.8) });
    } else {
      ctx.strokeStyle = '#1a1820'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(f * 3 - 5, -3); ctx.lineTo(f * 3 - 1, -2); ctx.moveTo(f * 3 + 1, -2); ctx.lineTo(f * 3 + 5, -3); ctx.stroke();
    }
    // the hanging hot drop: always a bead, swelling into a fat drop on the wind-up
    if (!dead) {
      const r = 2.4 + sw * 4.2, dy = 17 + sw * 5;
      if (G.Art && G.Art.glow) G.Art.glow(ctx, 0, dy, 8 + r * 2.4, DF.hot, 0.35 + sw * 0.4);
      ctx.fillStyle = '#3a2410';
      ctx.beginPath(); ctx.moveTo(-r * 0.5, 15); ctx.quadraticCurveTo(-r - 1, dy, 0, dy + r + 1); ctx.quadraticCurveTo(r + 1, dy, r * 0.5, 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = DF.hot;
      ctx.beginPath(); ctx.moveTo(-r * 0.4, 15); ctx.quadraticCurveTo(-r, dy, 0, dy + r); ctx.quadraticCurveTo(r, dy, r * 0.4, 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = DF.hotCore;
      ctx.beginPath(); ctx.arc(-r * 0.25, dy - r * 0.1, r * 0.35, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /** Hot wax drip: falls, glows, splashes and sizzles. The Brand can pop it. */
  class WaxDrip extends G.Projectile {
    draw(ctx, t) {
      const glow = G.Art && G.Art.glow;
      const tr = this.trail;
      for (let i = 0; i < tr.length; i += 2) if (glow) glow(ctx, tr[i], tr[i + 1], this.r * (0.8 + i / tr.length), this.color, 0.06 + 0.14 * i / tr.length);
      if (glow) glow(ctx, this.cx, this.cy, this.r * 3.6, this.color, 0.5);
      const st = clamp(this.vy / 900, 0, 1);        // stretch with speed
      const r = this.r, L = r * (1.2 + st * 1.4);
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.fillStyle = '#2c1a0a';
      ctx.beginPath(); ctx.moveTo(0, -L - 2); ctx.quadraticCurveTo(r + 2, -r * 0.2, r + 1.5, r * 0.3); ctx.arc(0, r * 0.3, r + 1.5, 0, Math.PI); ctx.quadraticCurveTo(-r - 2, -r * 0.2, 0, -L - 2); ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.moveTo(0, -L); ctx.quadraticCurveTo(r, -r * 0.2, r, r * 0.3); ctx.arc(0, r * 0.3, r, 0, Math.PI); ctx.quadraticCurveTo(-r, -r * 0.2, 0, -L); ctx.fill();
      ctx.fillStyle = DF.hotCore;
      ctx.beginPath(); ctx.ellipse(-r * 0.25, r * 0.1, r * 0.35, r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      void t;
    }
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'expire') return super.burstFx(why);
      G.fx.burst('wax', this.cx, this.cy, { count: 9, color: this.color, speed: 220, angle: -Math.PI / 2, spread: 2.4 });
      G.fx.burst('flash', this.cx, this.cy, { r: this.r * 3, color: this.color, life: 0.12 });
      G.fx.burst('smoke', this.cx, this.cy - 4, { count: 2, color: '#8a8070', alpha: 0.3 });
      G.sfxAt('wax_sizzle', this.cx, { vol: 0.55 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('wax_drip', WaxDrip, { r: 6, gravity: 1500, life: 3, color: DF.hot, damage: 1, destroyable: true });

  G.registerEnemy('drip_fly', DripFly);

  // =====================================================================================================
  // wick_crawler
  // =====================================================================================================
  const WC = { cotton: '#d4c9ae', cottonShade: '#8f8470', char: '#1e1a18', twist: 'rgba(96,86,70,0.75)', ember: '#ff9a48', puddle: '#b4a98f' };

  class WickCrawler extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 15, w: 30, h: 30,
        physics: 'manual',
        cinders: [2, 4],
        weight: 1,
        colors: { body: WC.cotton, dark: '#4a4238', hit: '#fff6e4', smoke: SN.smoke, puddle: WC.puddle, tele: TELE },
        puddleW: 18,
      });
      this.speed = props.speed || 62;
      this.walk = Math.random() * TAU;
      this.hurtT = 0;
    }
    init() { super.init(); this.crawlDir = this.facing; this.setState('crawl'); }
    think(dt) {
      if (this.hurtT > 0) this.hurtT -= dt;
      const px = this.x, py = this.y, ps = this.surf, was = this.surf ? this.offLimits() : true;
      this.crawl(this.speed, dt);
      // leash: never crawl into a doorway (it would sit where the Wickling enters the room) nor onto spikes/lava;
      // step back and turn around instead (skipped while falling or if it was placed off-limits)
      if (!was && this.surf && ps && this.offLimits()) {
        this.x = px; this.y = py; this.surf = ps; this.crawlDir = -this.crawlDir;
        this.facing = this.localFacing();
      }
      this.walk += this.speed * dt * 0.3;
    }
    /** Body centre inside an exit zone (open boundary run + 3.5 tiles inward, 1 tile to each side), beyond its
     *  optional beat (props.range, tiles from home) or on a hazard tile. */
    offLimits() {
      const room = this.room;
      if (!room) return false;
      if (!this._zones) {
        const W = room.widthPx, H = room.heightPx, D = 3.5 * TILE;
        this._zones = (room.openings || []).map((o) => {
          const a = (o.pos - 1) * TILE, b = (o.pos + o.size + 1) * TILE;
          if (o.side === 'W') return [0, a, D, b];
          if (o.side === 'E') return [W - D, a, W, b];
          if (o.side === 'N') return [a, 0, b, D];
          return [a, H - D, b, H];
        });
      }
      const cx = this.cx, cy = this.cy;
      for (const z of this._zones) if (cx > z[0] && cx < z[2] && cy > z[1] && cy < z[3]) return true;
      const rg = +this.props.range;                       // optional beat: tiles left/right of the spawn point
      if (rg > 0 && this.home && Math.abs(cx - this.home.x) > rg * TILE) return true;
      return G.Physics.isHazardTile(room.tileAt(Math.floor(cx / TILE), Math.floor(cy / TILE)));
    }
    onHurt() { this.hurtT = 0.2; }
    drawBounds() { return { x: this.x - 30, y: this.y - 60, w: this.w + 60, h: this.h + 90 }; }
    drawBody(ctx, t) {
      ctx.save();
      const c = this.crawlTransform(ctx);
      const tip = drawCrawler(ctx, this.facing, t, { walk: this.walk, hurt: this.hurtT, seed: this.seed, dead: !!this.dying });
      ctx.restore();
      // Pall smoke rises in WORLD space from the charred tuft, whatever surface we cling to
      if (!this.dying && tip && G.Art && G.Art.char) {
        const a = this.crawlAngle, ca = Math.cos(a), sa = Math.sin(a);
        G.Art.char.pallSmoke(ctx, c.x + tip[0] * ca - tip[1] * sa, c.y + tip[0] * sa + tip[1] * ca, t, { count: 3, height: 34, spread: 6, size: 3.5, alpha: 0.26, seed: this.seed, drift: 0 });
      }
    }
  }

  /** Crawler art in its local frame: centre (0,0), local floor at +15, facing f along +x. Returns the smoke tip [x,y]. */
  function drawCrawler(ctx, f, t, s) {
    const ch = G.Art && G.Art.char;
    const dead = !!s.dead, hurt = s.hurt > 0 ? s.hurt / 0.2 : 0;
    const w = s.walk || 0;
    if (ch) ch.shadow(ctx, 0, 15, 17, 0.45);
    // legs: frayed charred fibres, three per side, rowing
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      for (const side of [0, 1]) {
        const ph = w * 2 + i * 2.1 + side * Math.PI;
        const lift = dead ? 0 : Math.max(0, Math.sin(ph)) * 3;
        const swing = dead ? 0 : Math.cos(ph) * 4;
        const lx = (-9 + i * 9) * f;
        ctx.globalAlpha = side ? 0.6 : 1;
        ctx.strokeStyle = WC.char; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(lx, 6); ctx.quadraticCurveTo(lx + f * (swing + 5) + (side ? -2 : 2), 7 - lift, lx + f * swing + (side ? -3 : 3), 15 - lift); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // body: a knot of braided wick — rope strands (outline, cotton, braid twist, sheen) over a dark core
    const sq = 1 - hurt * 0.18;
    const wob = (i) => (dead ? 0 : Math.sin(w * 1.6 + i * 1.9) * 1.3);
    const X = (x) => x * f, Y = (y) => y * sq;
    ctx.fillStyle = '#1d1916';
    ctx.beginPath(); ctx.ellipse(0, Y(2), 14, 10.5 * sq, 0, 0, TAU); ctx.fill();
    const strands = [
      [-4, 12, -8, -2, -6, -9, -13, -4],                        // back loop
      [-15, 9, -12, -16 + wob(0), 9, -15 + wob(1), 14, 5],      // the big arch over the top
      [-11, 1, -6, -12 + wob(2), 2, 10, 9, -3],                 // a twisted loop through the middle
      [9, -3, 12, -9 + wob(3), 2, -12, -2, -5],
    ];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const off = dead ? 0 : -w * 2.2;
    for (let i = 0; i < strands.length; i++) {
      const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = strands[i];
      ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.bezierCurveTo(X(c1x), Y(c1y), X(c2x), Y(c2y), X(x1), Y(y1));
      ctx.strokeStyle = WC.char; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = i === 0 ? WC.cottonShade : WC.cotton; ctx.lineWidth = 6; ctx.stroke();
      ctx.setLineDash([2.2, 2.6]); ctx.lineDashOffset = off * (i % 2 ? 1 : -1);
      ctx.strokeStyle = WC.twist; ctx.lineWidth = 6; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.save(); ctx.translate(-0.8, -1.6);
      ctx.strokeStyle = i === 0 ? 'rgba(255,248,230,0.18)' : 'rgba(255,248,230,0.5)'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.restore();
    }
    // charred tufts: frayed black ends, one still holding a dying ember
    const tuft = (x0, y0, ang, len) => {
      ctx.strokeStyle = WC.char; ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) { const a = ang + k * 0.35; ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + Math.cos(a) * len * 0.5, y0 + Math.sin(a) * len * 0.5 - 2, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); }
      ctx.stroke();
      return [x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len];
    };
    const sway = dead ? 0 : Math.sin(t * 3 + s.seed) * 0.15;
    const tip = tuft(-f * 8, -8, -Math.PI / 2 - f * (0.55 + sway), 11);
    tuft(-f * 13, -2, Math.PI + (f > 0 ? 0.35 : -0.35) * -1, 8);
    if (!dead) {
      const glow = 0.5 + 0.5 * Math.sin(t * 5 + s.seed);
      if (G.Art && G.Art.glow) G.Art.glow(ctx, tip[0], tip[1], 9, WC.ember, 0.35 + glow * 0.3);
      ctx.fillStyle = WC.ember; ctx.beginPath(); ctx.arc(tip[0], tip[1], 1.6, 0, TAU); ctx.fill();
    }
    // face: a dark hollow at the front with two pinprick eyes
    const fxp = f * 9.5, fyp = 1;
    ctx.fillStyle = '#16131a';
    ctx.beginPath(); ctx.ellipse(fxp, fyp, 5.5, 4.2, 0, 0, TAU); ctx.fill();
    if (!dead) {
      if (ch) ch.eyes(ctx, fxp + f * 0.8, fyp, { kind: 'pinprick', size: 7, gap: 5, glow: true, blink: ch.blinkAt(t, (s.seed | 0) + 2, 4) });
    }
    return tip;
  }

  G.registerEnemy('wick_crawler', WickCrawler);

  // =====================================================================================================
  // Region set pieces drawn by code (event scripts used by src/data/regions/guttered.js):
  //   gw_tent  — Wren's patched traveller's tent (gw_09), a rag pennant on its pole stirring in the draught.
  //   gw_mural — the faded fresco of the many-handed maker pouring small candles (gw_12, the Chandler's Alcove).
  // Both are pre-rendered once into cached canvases (first draw, never at load time) and blitted.
  // =====================================================================================================
  const sprites = new Map();
  function sprite(key, w, h, fn) {
    let c = sprites.get(key);
    if (!c) { const mc = G.U.makeCanvas(w, h); fn(mc.ctx, w, h); c = mc.canvas; sprites.set(key, c); }
    return c;
  }

  function paintTent(x, w, h) {
    const ch = G.Art && G.Art.char;
    const gx = w / 2, gy = h - 6;                       // ground centre
    // guy ropes and stakes
    x.strokeStyle = 'rgba(40,30,22,0.9)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(gx - 50, gy - 62); x.lineTo(gx - 96, gy); x.moveTo(gx + 50, gy - 62); x.lineTo(gx + 96, gy); x.stroke();
    x.fillStyle = '#2a2018'; x.fillRect(gx - 99, gy - 8, 4, 9); x.fillRect(gx + 95, gy - 8, 4, 9);
    // canvas body: an A-frame of patched cloth
    const body = new Path2D();
    body.moveTo(gx - 80, gy);
    body.quadraticCurveTo(gx - 46, gy - 50, gx - 4, gy - 92);
    body.lineTo(gx + 4, gy - 92);
    body.quadraticCurveTo(gx + 46, gy - 50, gx + 80, gy);
    body.closePath();
    if (ch) ch.shape(x, body, { fill: '#6b4a34', box: [gx - 80, gy - 92, gx + 80, gy], light: -1, shade: 0.5, hi: 0.2, lw: 2, rim: '#c89a68', rimWidth: 1.6 });
    else { x.fillStyle = '#6b4a34'; x.fill(body); }
    x.save(); x.clip(body);
    const patches = [[-52, -22, 26, 18, '#7c5a3a'], [18, -54, 22, 20, '#5a3e2c'], [34, -18, 30, 16, '#806040'], [-26, -60, 18, 16, '#74523a']];
    for (const [px, py, pw, ph, col] of patches) {
      x.fillStyle = col; x.fillRect(gx + px, gy + py, pw, ph);
      x.strokeStyle = 'rgba(230,200,150,0.35)'; x.setLineDash([2, 3]); x.lineWidth = 1; x.strokeRect(gx + px + 1.5, gy + py + 1.5, pw - 3, ph - 3); x.setLineDash([]);
    }
    x.strokeStyle = 'rgba(30,20,14,0.35)'; x.lineWidth = 1.2;     // cloth folds
    for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(gx + i * 4, gy - 88); x.quadraticCurveTo(gx + i * 14, gy - 40, gx + i * 22, gy); x.stroke(); }
    x.restore();
    // open front flap: dark interior, a rolled blanket and a pack
    const door = new Path2D();
    door.moveTo(gx - 26, gy); door.quadraticCurveTo(gx - 12, gy - 40, gx + 2, gy - 66); door.quadraticCurveTo(gx + 8, gy - 30, gx + 30, gy); door.closePath();
    x.fillStyle = '#140e0a'; x.fill(door);
    x.fillStyle = '#5d6a74'; x.beginPath(); x.ellipse(gx + 2, gy - 6, 16, 6, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#7a5838'; x.beginPath(); x.ellipse(gx - 10, gy - 12, 7, 9, -0.2, 0, Math.PI * 2); x.fill();
    const flap = new Path2D();
    flap.moveTo(gx + 2, gy - 66); flap.quadraticCurveTo(gx + 30, gy - 34, gx + 52, gy - 12); flap.lineTo(gx + 36, gy - 4); flap.quadraticCurveTo(gx + 20, gy - 30, gx + 2, gy - 66);
    if (ch) ch.shape(x, flap, { fill: '#8a6444', box: [gx, gy - 66, gx + 52, gy], light: -1, shade: 0.4, lw: 1.6 });
    // the pole and its snuffer-cap finial
    x.strokeStyle = '#2a2018'; x.lineWidth = 3; x.beginPath(); x.moveTo(gx, gy - 90); x.lineTo(gx, gy - 118); x.stroke();
    x.fillStyle = '#3a3a44'; x.beginPath(); x.moveTo(gx - 6, gy - 116); x.lineTo(gx, gy - 128); x.lineTo(gx + 6, gy - 116); x.closePath(); x.fill();
  }

  G.Events = G.Events || {};
  G.Events.gw_tent = G.Events.gw_tent || {
    init(e) { e.data.t = 0; },
    draw(e, ctx, t) {
      const W = 220, Hh = 150;
      const img = sprite('gw_tent', W, Hh, paintTent);
      const x = e.cx - W / 2, y = e.bottom - Hh + 6;
      ctx.drawImage(img, x, y);
      // rag pennant on the pole
      const px = e.cx, py = y + Hh - 6 - 112;
      const sway = Math.sin(t * 1.7 + 1) * 3, sway2 = Math.sin(t * 2.3) * 2;
      ctx.fillStyle = '#9a4a3a';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 10, py + 2 + sway2, px + 22 + sway, py + 4 + sway2);
      ctx.lineTo(px + 18 + sway, py + 9); ctx.quadraticCurveTo(px + 9, py + 10 + sway2, px, py + 9); ctx.closePath(); ctx.fill();
    },
  };

  function paintMural(x, w, h) {
    const rnd2 = (i, k) => h01(i * 3.7 + k, 17.3);
    // plaster panel with a ragged edge
    const panel = new Path2D();
    const N = 40;
    for (let i = 0; i <= N; i++) { const a = i / N; const px = 14 + a * (w - 28), py = 10 + rnd2(i, 1) * 8; if (i) panel.lineTo(px, py); else panel.moveTo(px, py); }
    for (let i = 0; i <= N / 2; i++) { const a = i / (N / 2); panel.lineTo(w - 10 - rnd2(i, 2) * 8, 14 + a * (h - 28)); }
    for (let i = N; i >= 0; i--) { const a = i / N; panel.lineTo(14 + a * (w - 28), h - 10 - rnd2(i, 3) * 8); }
    for (let i = N / 2; i >= 0; i--) { const a = i / (N / 2); panel.lineTo(10 + rnd2(i, 4) * 8, 14 + a * (h - 28)); }
    panel.closePath();
    x.fillStyle = '#4a3828'; x.fill(panel);
    x.save(); x.clip(panel);
    const g = x.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, w * 0.55);
    g.addColorStop(0, 'rgba(150,110,70,0.55)'); g.addColorStop(1, 'rgba(40,28,18,0.2)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const cx = w / 2, top = 46;
    // the maker: a vast hooded figure, robe flowing to the ground line
    x.globalAlpha = 0.62;
    const robe = new Path2D();
    robe.moveTo(cx - 34, top + 30);
    robe.quadraticCurveTo(cx - 40, top - 22, cx, top - 28);
    robe.quadraticCurveTo(cx + 40, top - 22, cx + 34, top + 30);
    robe.quadraticCurveTo(cx + 70, top + 150, cx + 92, h - 64);
    robe.lineTo(cx - 92, h - 64);
    robe.quadraticCurveTo(cx - 70, top + 150, cx - 34, top + 30);
    robe.closePath();
    x.fillStyle = '#2c2018'; x.fill(robe);
    x.strokeStyle = '#d8b07a'; x.lineWidth = 2; x.stroke(robe);
    // the empty hood
    x.fillStyle = '#120c08'; x.beginPath(); x.ellipse(cx, top + 4, 17, 22, 0, 0, Math.PI * 2); x.fill();
    // many arms fanning out, each hand pouring a thread of wax into a small candle below
    const arms = 8;
    for (let i = 0; i < arms; i++) {
      const side = i < arms / 2 ? -1 : 1, k = (i % (arms / 2)) / (arms / 2 - 1);
      const sx = cx + side * 26, sy = top + 50 + k * 30;
      const hx = cx + side * (78 + k * 130), hy = top + 10 + k * 70 + (k > 0.5 ? 20 : 0);
      x.strokeStyle = '#d8b07a'; x.lineWidth = 7; x.lineCap = 'round';
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo((sx + hx) / 2, Math.min(sy, hy) - 34 + k * 16, hx, hy); x.stroke();
      x.strokeStyle = '#3a2a1c'; x.lineWidth = 3.5; x.stroke();
      // open hand
      x.fillStyle = '#d8b07a'; x.beginPath(); x.ellipse(hx + side * 3, hy + 2, 7, 4.5, side * 0.6, 0, Math.PI * 2); x.fill();
      // pouring thread and the little candle it fills
      const by = h - 70;
      x.strokeStyle = 'rgba(240,220,180,0.75)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(hx + side * 6, hy + 5); x.lineTo(hx + side * 6, by - 22); x.stroke();
      x.fillStyle = '#e8dcc0'; x.fillRect(hx + side * 6 - 5, by - 20, 10, 20);
      x.fillStyle = '#1a120c'; x.fillRect(hx + side * 6 - 3, by - 14, 2, 4); x.fillRect(hx + side * 6 + 1, by - 14, 2, 4);
    }
    // the hidden blue spark at its heart
    x.globalAlpha = 0.9;
    const bg = x.createRadialGradient(cx, top + 70, 0, cx, top + 70, 26);
    bg.addColorStop(0, 'rgba(190,230,255,0.95)'); bg.addColorStop(0.3, 'rgba(110,180,255,0.55)'); bg.addColorStop(1, 'rgba(60,120,255,0)');
    x.fillStyle = bg; x.beginPath(); x.arc(cx, top + 70, 26, 0, Math.PI * 2); x.fill();
    // ground line of poured candles
    x.globalAlpha = 0.55;
    x.strokeStyle = '#d8b07a'; x.lineWidth = 2; x.beginPath(); x.moveTo(30, h - 68); x.lineTo(w - 30, h - 68); x.stroke();
    // border ornament
    x.strokeStyle = 'rgba(216,176,122,0.5)'; x.lineWidth = 2; x.strokeRect(24, 22, w - 48, h - 44);
    x.globalAlpha = 1;
    // age: flaked-off plaster and hairline cracks
    for (let i = 0; i < 140; i++) {
      const px = rnd2(i, 5) * w, py = rnd2(i, 6) * h, r = 2 + rnd2(i, 7) * 9;
      x.fillStyle = rnd2(i, 8) < 0.6 ? 'rgba(52,40,28,0.85)' : 'rgba(26,18,12,0.6)';
      x.beginPath(); x.ellipse(px, py, r, r * (0.4 + rnd2(i, 9) * 0.6), rnd2(i, 10) * 3, 0, Math.PI * 2); x.fill();
    }
    x.strokeStyle = 'rgba(20,14,10,0.7)'; x.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      let px = rnd2(i, 11) * w, py = rnd2(i, 12) * h;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (rnd2(i * 7 + k, 13) - 0.5) * 50; py += rnd2(i * 7 + k, 14) * 30; x.lineTo(px, py); }
      x.stroke();
    }
    x.restore();
    x.strokeStyle = 'rgba(18,12,8,0.9)'; x.lineWidth = 3; x.stroke(panel);
  }

  G.Events.gw_mural = G.Events.gw_mural || {
    draw(e, ctx, t) {
      const W = 560, Hh = 330;
      const img = sprite('gw_mural', W, Hh, paintMural);
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.drawImage(img, e.cx - W / 2, e.bottom - Hh + 10);
      ctx.restore();
      if (G.Art && G.Art.glow) G.Art.glow(ctx, e.cx, e.bottom - Hh + 10 + 116, 30 + Math.sin(t * 1.3) * 3, '#8fd0ff', 0.18);
    },
  };

  // gw_waxwall — the Descent Lip's landmark (gw_10): old candle-wax poured over the plateau rim in a thick lip and
  // long ribbed runnels down its sheer west face (matte and lumpy - it reads as climbable stone under wax, never as
  // the glossy X glaze), with a few beads of fresh wax glistening as they creep down. Event props: w (face→east, tiles),
  // h (rim→floor, tiles); the marker sits in the air tile at the foot of the face (west of it).
  function paintWaxwall(x, w, h, o) {
    const F = o.pad;                                    // x of the face line inside the sprite
    const rimY = o.pad;                                 // y of the plateau top inside the sprite
    const r2 = (i, k) => h01(i * 5.13 + k, 41.7);
    const wax = '#cdb28a', waxMid = '#9c8462', waxDark = '#5c4a36', waxHi = 'rgba(255,240,210,0.55)';
    // 1. runnels down the face: tapered tongues hanging from the rim, staggered lengths, slightly bulging tips
    const runs = [];
    for (let i = 0; i < 11; i++) {
      const len = (i === 0 ? 0.97 : 0.2 + r2(i, 1) * 0.72) * (h - rimY - 4);
      const wid = 14 + r2(i, 2) * 18;
      const off = -5 - r2(i, 3) * 7;                    // how far it bulges out west of the face
      runs.push({ y0: rimY - 2 + i * 0.5, len, wid, off, x: F - 2 + r2(i, 4) * 3 });
    }
    runs.sort((a, b) => b.len - a.len);
    for (const [k, rn] of runs.entries()) {
      const p = new Path2D();
      const xL = rn.x + rn.off, yB = rn.y0 + rn.len;
      p.moveTo(F + 4, rn.y0);
      p.bezierCurveTo(xL - 2, rn.y0 + rn.len * 0.2, xL + 1, rn.y0 + rn.len * 0.7, xL - 1.5, yB - 6);
      p.quadraticCurveTo(xL - 3, yB + 2, xL + 2.5, yB + 2.5);              // the bulb at the tip
      p.quadraticCurveTo(xL + 7, yB, xL + 5, yB - 7);
      p.bezierCurveTo(F + 2, rn.y0 + rn.len * 0.6, F + rn.wid * 0.6, rn.y0 + rn.len * 0.3, F + rn.wid, rn.y0);
      p.closePath();
      const g = x.createLinearGradient(xL - 3, 0, F + rn.wid, 0);
      g.addColorStop(0, waxMid); g.addColorStop(0.3, k % 2 ? '#e0c79c' : wax); g.addColorStop(0.75, waxMid); g.addColorStop(1, waxDark);
      x.fillStyle = g; x.fill(p);
      x.strokeStyle = 'rgba(20,14,9,0.85)'; x.lineWidth = 1.4; x.stroke(p);
      // ribbing (lumpy rings) - the hand-holds
      x.strokeStyle = 'rgba(40,30,20,0.55)'; x.lineWidth = 1;
      for (let yy = rn.y0 + 10 + r2(k, 9) * 8; yy < yB - 10; yy += 11 + r2(k + yy, 8) * 9) {
        x.beginPath(); x.moveTo(xL + 0.5, yy); x.quadraticCurveTo(F, yy + 3, F + 4, yy + 1); x.stroke();
      }
      // a thin dull highlight on the lit (west) side
      x.strokeStyle = 'rgba(255,238,205,0.5)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(xL + 1.5, rn.y0 + 8); x.bezierCurveTo(xL + 0.5, rn.y0 + rn.len * 0.4, xL + 1.5, rn.y0 + rn.len * 0.7, xL + 1, yB - 7); x.stroke();
    }
    // the run that reached the floor has pooled into a low mound at the foot of the face
    { const fy = h - 1, mx = F - 4; const m = new Path2D();
      m.moveTo(mx - 30, fy); m.bezierCurveTo(mx - 22, fy - 9, mx - 6, fy - 14, F + 6, fy - 16); m.lineTo(F + 6, fy); m.closePath();
      const mg = x.createLinearGradient(0, fy - 16, 0, fy); mg.addColorStop(0, '#e0c79c'); mg.addColorStop(1, waxDark);
      x.fillStyle = mg; x.fill(m); x.strokeStyle = 'rgba(20,14,9,0.85)'; x.lineWidth = 1.4; x.stroke(m);
      x.strokeStyle = waxHi; x.lineWidth = 1; x.beginPath(); x.moveTo(mx - 20, fy - 6); x.quadraticCurveTo(mx - 8, fy - 12, F - 2, fy - 13); x.stroke(); }
    // 2. the lip along the rim: a lumpy crust of overflowed wax over the plateau top
    const lip = new Path2D();
    lip.moveTo(F - 8, rimY + 8);
    let lx = F - 8;
    for (let i = 0; lx < w - 6; i++) { const step = 10 + r2(i, 5) * 16; lx = Math.min(w - 6, lx + step); lip.quadraticCurveTo(lx - step / 2, rimY - 5 - r2(i, 6) * 5, lx, rimY - 1); }
    lip.lineTo(w - 6, rimY + 6);
    for (let i = 0; lx > F + 2; i++) { const step = 14 + r2(i, 7) * 18; lx = Math.max(F + 2, lx - step); lip.quadraticCurveTo(lx + step / 2, rimY + 9 + r2(i, 10) * 6, lx, rimY + 6); }
    lip.quadraticCurveTo(F - 2, rimY + 18, F - 8, rimY + 8);
    lip.closePath();
    const lg = x.createLinearGradient(0, rimY - 10, 0, rimY + 16);
    lg.addColorStop(0, '#e2c9a0'); lg.addColorStop(0.45, wax); lg.addColorStop(1, '#3a2e22');
    x.fillStyle = lg; x.fill(lip);
    x.strokeStyle = 'rgba(20,14,9,0.85)'; x.lineWidth = 1.5; x.stroke(lip);
    x.strokeStyle = waxHi; x.lineWidth = 1;
    x.beginPath(); x.moveTo(F - 4, rimY + 3); x.quadraticCurveTo(w * 0.4, rimY - 4, w - 12, rimY + 1); x.stroke();
    // 3. faint pour-streaks soaking into the dark face behind the runnels
    x.globalAlpha = 0.16; x.strokeStyle = wax; x.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const sx = F + 10 + r2(i, 11) * (w - F - 30), len = 20 + r2(i, 12) * (h - rimY) * 0.45;
      x.beginPath(); x.moveTo(sx, rimY + 10); x.lineTo(sx + (r2(i, 13) - 0.5) * 6, rimY + 10 + len); x.stroke();
    }
    x.globalAlpha = 1;
  }

  G.Events.gw_waxwall = G.Events.gw_waxwall || {
    draw(e, ctx, t) {
      const p = e.props || {};
      const wT = p.faceW || 10, hT = p.faceH || 10, pad = 40;
      const W = wT * TILE + pad, Hh = hT * TILE + pad;
      const img = sprite('gw_waxwall:' + wT + 'x' + hT, W, Hh, (x, w, h) => paintWaxwall(x, w, h, { pad }));
      const faceX = e.x + TILE, rimY = e.bottom - hT * TILE;
      ctx.drawImage(img, faceX - pad, rimY - pad);
      // fresh beads creeping down the runnels, catching the light
      for (let i = 0; i < 3; i++) {
        const per = 7 + i * 2.3, k = ((t + i * 3.1) % per) / per;
        const y = rimY + 6 + k * k * (hT * TILE * (0.45 + 0.15 * i));
        const x = faceX - 4 - h01(i, 3) * 4;
        const a = k < 0.85 ? 1 : (1 - k) / 0.15;
        ctx.globalAlpha = 0.85 * a;
        ctx.fillStyle = '#e8d2a8'; ctx.beginPath(); ctx.ellipse(x, y, 2.4, 3.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,248,230,0.95)'; ctx.fillRect(x - 1.2, y - 2, 1, 1.4);
      }
      ctx.globalAlpha = 1;
    },
  };

  // (gw_veil, the former per-room secret veil, is now automatic for every room: G.World.hiddenPockets + G.Art
  // terrain veils, docs/api/art.md "Secret pockets".)

  // gw_abyss — a deadly chasm reads as a black void: a vertical gradient over the background (drawn before the
  // terrain, z < -10) from clear at row r0 to near-black at row r1, across cols c0..c1 (inclusive). Without it the
  // parallax arcades show through the Broken Bridge's chasm and Wren's crack and the drop looks like a walkable
  // lower floor, while the spike bed sits below the camera's view from the lip. Props: c0 c1 r0 r1, alpha (0.92).
  G.Events.gw_abyss = G.Events.gw_abyss || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
    },
    draw(e, ctx) {
      const r = e.data.r;
      if (G.camera && G.camera.visible && !G.camera.visible(r.x, r.y, r.w, r.h + TILE * 4, 8)) return;
      if (!e.data.g) {
        const a = e.props.alpha != null ? +e.props.alpha : 0.92;
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, 'rgba(4,3,2,0)');
        g.addColorStop(0.45, 'rgba(4,3,2,' + (a * 0.55).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(4,3,2,' + a + ')');
        e.data.g = g;                                     // world-space gradient, built once
      }
      ctx.fillStyle = e.data.g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(4,3,2,' + (e.props.alpha != null ? +e.props.alpha : 0.92) + ')';
      ctx.fillRect(r.x, r.y + r.h, r.w, TILE * 4);         // and solid below (down to the hazard bed)
    },
  };

  G.GutteredEnemies = { SnuffedWalker, SnuffedLancer, DripFly, WickCrawler, WaxDrip, drawWalker, drawLancer, drawDripFly, drawCrawler };
})();
