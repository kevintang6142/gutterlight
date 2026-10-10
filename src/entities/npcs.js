// src/entities/npcs.js — NPC base (talk selection per TECH_SPEC §15 / docs/api/text.md, flags, gifts, shops,
// facing, idle animation) and the six characters with procedural art: Thrum, Pell, Quill, Bramm, Wren, Sable.
// Entity type 'npc' with props {npc, stage?, requires?, flip?, key?}. Depends on G.Interact (interactables.js).
(function () {
  'use strict';
  const G = globalThis.G;
  const H = G.Interact;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const OUT = H.OUT;
  const C = () => (G.Art && G.Art.char) || null;
  const FACE_RANGE = 7 * TILE;

  // =====================================================================================================
  // Talk selection (exactly the semantics documented in docs/api/text.md §3)
  // =====================================================================================================
  function talkedFlag(key, id) { return 'talked:' + key + ':' + id; }
  function hasTalked(key, npc, id) { return H.flag(talkedFlag(key, id)) || (npc !== key && H.flag(talkedFlag(npc, id))); }
  /** First entry whose `when` passes and which is not a spent `once`. */
  function pickTalk(key, npc) {
    const entry = G.Text && G.Text.npcs && G.Text.npcs[key];
    if (!entry || !Array.isArray(entry.talks)) return null;
    for (const t of entry.talks) {
      if (!t) continue;
      if (t.when && !H.cond(t.when)) continue;
      if (t.once && hasTalked(key, npc || key, t.id)) continue;
      return t;
    }
    return null;
  }

  // =====================================================================================================
  // NPC base
  // =====================================================================================================
  class NPC extends H.Interactable {
    constructor(props) {
      super(props);
      this.npc = props.npc || 'thrum';
      this.stage = props.stage != null && props.stage !== '' ? (props.stage | 0) : 0;
      this.z = -2;
      this.facing = props.flip ? -1 : 1;
      this.baseFacing = this.facing;
      this.turnX = this.facing;       // smoothed facing (-1..1), drawn as a horizontal squash while turning
      this.talking = false;
      this.talkToken = 0;
      this.talkIdle = 0;
      this.w = 30; this.h = 50;
      this.faceRange = FACE_RANGE;
      this.setup();   // subclasses set their size here (before marker anchoring in G.Entity.create)
    }
    get textKey() {
      if (this.props.key) return this.props.key;
      const npcs = (G.Text && G.Text.npcs) || {};
      const staged = this.stage ? this.npc + '_' + this.stage : null;
      if (staged && npcs[staged]) return staged;
      if (npcs[this.npc]) return this.npc;
      return staged || this.npc;
    }
    get textEntry() { return (G.Text && G.Text.npcs && G.Text.npcs[this.textKey]) || null; }
    get displayName() { const e = this.textEntry; return (e && e.name) || this.npc; }
    /** Whether this NPC exists right now (props.requires + per-character rules). */
    present() { return H.cond(this.props.requires); }
    init() {
      super.init();
      if (!this.present()) { this.remove(); return; }
      const e = this.textEntry;
      if (!e) G.warnOnce('npctext:' + this.textKey, 'npc text "' + this.textKey + '" not found in G.Text.npcs');
      const pk = e && e.prompt ? String(e.prompt).toLowerCase() : 'talk';
      this.promptText = (e && e.prompt) ? H.prompt(pk, e.prompt) : H.prompt('talk', 'Talk');
    }
    setup() {}
    interactRect() { return { x: this.x - 26, y: this.y - 10, w: this.w + 52, h: this.h + 10 }; }

    // ---- talking ----
    interact(player) {
      if (this.talking) return;
      const key = this.textKey;
      const talk = pickTalk(key, this.npc);
      const p = player || H.player();
      if (p) this.facePoint(p.x + (p.w || 26) / 2, true);
      if (!talk) { H.toast(this.displayName); return; }
      this.talking = true;
      this.talkIdle = 0;
      const token = ++this.talkToken;
      this.onTalkStart(talk);
      G.events.emit('npcTalk', { npc: this.npc, key, id: talk.id, entity: this });
      const lines = Array.isArray(talk.lines) ? talk.lines : [];
      const ok = lines.length && H.ui('dialogue', { name: this.displayName, lines, onDone: () => this.finishTalk(token, talk) });
      if (!ok) this.finishTalk(token, talk);
    }
    finishTalk(token, talk) {
      if (token !== this.talkToken || !this.talking) return;
      this.talking = false;
      const key = this.textKey;
      H.setFlag(talkedFlag(key, talk.id));
      if (key !== this.npc) H.setFlag(talkedFlag(this.npc, talk.id));
      if (talk.setFlag) H.setFlag(talk.setFlag);
      const entry = this.textEntry;
      const shop = this.props.shop || (entry && entry.shop);
      const openShop = () => { if (shop) H.ui('openShop', shop, () => {}); };
      this.onTalkEnd(talk);
      if (talk.give && G.game) G.game.giveItem(talk.give, { onDone: openShop });
      else { if (talk.setFlag || talk.once) H.save(); openShop(); }
    }
    onTalkStart() {}
    onTalkEnd() {}

    // ---- facing ----
    facePoint(px, instant) {
      const f = px < this.cx ? -1 : 1;
      this.facing = f;
      if (instant) this.turnX = f * Math.max(0.2, Math.abs(this.turnX));
    }
    wantsToFacePlayer() { return true; }
    updateFacing(dt) {
      const pc = H.playerCenter();
      if (pc && (this.talking || (this.wantsToFacePlayer() && Math.hypot(pc.x - this.cx, pc.y - this.cy) < this.faceRange))) this.facePoint(pc.x, false);
      else if (!this.talking) this.facing = this.idleFacing();
      this.turnX = G.U.approach(this.turnX, this.facing, dt * 9);
    }
    idleFacing() { return this.baseFacing; }

    update(dt) {
      if (this.talking) {
        // safety: the dialogue closed without calling back (should not happen) → finish once
        this.talkIdle += dt;
        if (this.talkIdle > 1.0 && !(G.UI && G.UI.isBlocking && G.UI.isBlocking())) {
          const talk = pickTalk(this.textKey, this.npc);
          if (talk) this.finishTalk(this.talkToken, talk); else this.talking = false;
        }
      }
      this.updateFacing(dt);
      this.tick(dt);
      const f = this.flameInfo(this.t);
      if (f && f.light > 0) {
        const sx = this.turnX;
        H.light(this.cx + f.x * sx, this.bottom + f.y, f.light, f.lightColor || H.FLAME_COLORS[f.kind] || '#ffb060', f.intensity == null ? 0.7 : f.intensity, true);
      }
    }
    tick() {}
    /** Flame in local coords (feet origin, facing right): {x, y, size, kind, light, intensity}. */
    flameInfo() { return null; }

    draw(ctx, t) {
      const x = Math.round(this.cx), y = Math.round(this.bottom);
      this.drawWorldBack(ctx, t);
      H.shadow(ctx, x, y, this.w * 0.62, 0.5);
      ctx.save();
      ctx.translate(x, y);
      const sx = Math.abs(this.turnX) < 0.12 ? 0.12 * Math.sign(this.turnX || 1) : this.turnX;
      ctx.scale(sx, 1);
      this.drawBody(ctx, t);
      ctx.restore();
      this.drawWorldFront(ctx, t);
    }
    drawWorldBack() {}
    drawWorldFront() {}
    drawBody(ctx) {
      ctx.fillStyle = '#d8cfb8';
      ctx.fillRect(-this.w / 2, -this.h, this.w, this.h);
    }
    breath(t, rate, amt) { return 1 + Math.sin(t * (rate || 1.6) + this.seed) * (amt || 0.015) + (this.talking ? Math.sin(t * 13) * 0.012 : 0); }
    blink(t, extra) {
      const c = C();
      const b = c ? c.blinkAt(t, this.seed) : 0;
      return clamp(Math.max(b, extra || 0), 0, 1);
    }
  }

  // ---- small shared bits ----
  function legs(ctx, spread, len, color) {
    for (const s of [-1, 1]) {
      H.shaded(ctx, H.rrect(s * spread - 3, -len - 1, 6, len + 1, 2.5), color || '#1c1820', [s * spread - 3, -len, s * spread + 3, 0], { lw: 1.2 });
    }
  }
  function body(ctx, x, y, w, h, o) {
    const c = C();
    if (c) return c.waxBody(ctx, x, y, w, h, o);
    const p = H.rrect(x - w / 2, y - h, w, h, w * 0.3);
    H.shaded(ctx, p, o.color || '#d8cfb8', [x - w / 2, y - h, x + w / 2, y]);
    return { top: y - h, topW: w, cx: x, w, h, path: p };
  }
  function eyes(ctx, x, y, o) { const c = C(); if (c) c.eyes(ctx, x, y, o); }
  function wick(ctx, x, y, o) {
    const c = C();
    if (c) return c.wick(ctx, x, y, o);
    H.line(ctx, [x, y, x + (o.bend || 0), y - (o.len || 7)], '#141016', 2);
    return [x + (o.bend || 0), y - (o.len || 7)];
  }
  function arm(ctx, pts, color, w) { H.stroke2(ctx, pts, color, w || 4); }
  function hand(ctx, x, y, r, color) { H.shaded(ctx, H.ellipse(x, y, r, r * 0.9), color, [x - r, y - r, x + r, y + r], { lw: 1.3, light: 0.3 }); }

  // =====================================================================================================
  // Old Thrum — stooped elder burned to a stub, wax-drip beard, walking stick, dim orange flame
  // =====================================================================================================
  class Thrum extends NPC {
    setup() { this.w = 38; this.h = 50; }
    flameInfo(t) {
      const sway = Math.sin(t * 0.9 + this.seed) * 1.2;
      return { x: 8 + sway * 0.6, y: -50, size: 9, kind: 'orange', light: 150, intensity: 0.6 };
    }
    drawBody(ctx, t) {
      const sway = Math.sin(t * 0.9 + this.seed) * 1.2;
      const sq = this.breath(t, 1.3, 0.018);
      // walking stick (far hand) behind the body
      H.stroke2(ctx, [26, 0, 25.5, -20, 24, -36], '#6a4a2e', 3.2);
      H.shaded(ctx, H.ellipse(24, -37.5, 3.8, 3.2), '#7a5a3a', [20, -41, 28, -34], { lw: 1.2 });
      legs(ctx, 6, 5);
      const b = body(ctx, -1, -4, 36, 35, { variant: 'stub', color: '#dccfae', shade: '#3a2a18', drips: 4, seed: this.seed, lean: 6 + sway, squash: sq, melt: 1, rim: '#ffd8a0', rimAlpha: 0.35 });
      const fx = b.cx + 3, top = b.top;
      // drooping wax brows over tired eyes
      ctx.strokeStyle = '#b8aa88'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx - 7, top + 8.5); ctx.quadraticCurveTo(fx - 4, top + 6.5, fx - 1, top + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx + 3, top + 8); ctx.quadraticCurveTo(fx + 6, top + 6.5, fx + 9, top + 8.5); ctx.stroke();
      eyes(ctx, fx + 1, top + 12, { kind: 'slit', size: 8, gap: 10, blink: this.blink(t, 0.3), shine: false });
      // the beard: a fringe of thin wax drips hanging from under the face
      const y0 = top + 17.5;
      const drips = [[fx + 9, 6, 1.5], [fx + 6, 10, 1.8], [fx + 3, 14, 2], [fx, 11, 1.9], [fx - 3, 15, 2], [fx - 6, 9, 1.7]];
      const beardCol = '#e9dfc6';
      ctx.fillStyle = beardCol;
      ctx.beginPath(); ctx.ellipse(fx + 1.5, y0, 10, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      for (const [dx, len, w] of drips) {
        const L = len + Math.sin(t * 1.1 + dx) * 0.5;
        const d = new Path2D();
        d.moveTo(dx - w, y0); d.lineTo(dx - w * 0.8, y0 + L - w); d.arc(dx, y0 + L - w, w * 0.9, Math.PI, 0, true); d.lineTo(dx + w, y0); d.closePath();
        ctx.strokeStyle = 'rgba(40,30,20,0.55)'; ctx.lineWidth = 1; ctx.stroke(d);
        ctx.fillStyle = beardCol; ctx.fill(d);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(dx - w * 0.4, y0 + 1, 0.8, L * 0.5);
      }
      ctx.fillStyle = beardCol;
      ctx.beginPath(); ctx.ellipse(fx + 1.5, y0 + 0.4, 9.5, 2, 0, 0, Math.PI * 2); ctx.fill();
      // near hand on the stick
      arm(ctx, [b.cx + 12, -12, 19, -17, 23.5, -24], '#cbbd9c', 3.4);
      hand(ctx, 24, -25, 3.4, '#d8cba8');
      const tip = wick(ctx, b.cx + 1, top + 2, { len: 6, bend: 2.5, width: 2.2 });
      H.flame(ctx, tip[0], tip[1] + 1, 9 + Math.sin(t * 3 + this.seed) * 0.5, 'orange', t, this.seed, { glow: 0.55 });
    }
  }

  // =====================================================================================================
  // Pell — round, cheerful peddler; a huge pack of trinkets with a lantern on a crook
  // =====================================================================================================
  class Pell extends NPC {
    setup() { this.w = 40; this.h = 52; this.lanternSwing = 0; this.lanternV = 0; }
    tick(dt) {
      this.lanternV += (-this.lanternSwing * 10 - this.lanternV * 1.2) * dt + Math.sin(this.t * 1.7 + this.seed) * 0.6 * dt;
      this.lanternSwing += this.lanternV * dt;
    }
    rock(t) { return Math.sin(t * 2.2 + this.seed) * (this.talking ? 1.8 : 1.1); }
    lanternLocal(t) { return { x: -30 + this.rock(t) * 0.4, y: -86 }; }
    flameInfo(t) {
      const L = this.lanternLocal(t);
      return { x: L.x, y: L.y + 18, size: 8, kind: 'gold', light: 190, intensity: 0.75, lightColor: '#ffd080' };
    }
    drawBody(ctx, t) {
      const rock = this.rock(t);
      const sq = this.breath(t, 2.2, 0.02);
      const L = this.lanternLocal(t);
      // crook pole rising from the pack, lantern hanging from it
      H.stroke2(ctx, [-16, -40, -21, -70, -24 + rock * 0.3, -88], '#6a4a2e', 3);
      ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-24 + rock * 0.3, -88); ctx.quadraticCurveTo(-27, -95, -31, -91); ctx.stroke();
      ctx.strokeStyle = '#6a4a2e'; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(-24 + rock * 0.3, -88); ctx.quadraticCurveTo(-27, -95, -31, -91); ctx.stroke();
      ctx.save();
      ctx.translate(L.x - 1, L.y - 4);
      ctx.rotate(this.lanternSwing * 0.3);
      H.line(ctx, [0, 0, 0, 6], '#2a2a30', 1.3);
      H.shaded(ctx, H.poly([-5, 9, 5, 9, 3, 5, -3, 5]), '#3a3640', [-5, 5, 5, 9], { lw: 1.1 });
      const g = H.rrect(-5, 9, 10, 13, 2);
      ctx.fillStyle = '#ffd890'; ctx.fill(g);
      H.flame(ctx, 0, 20, 7, 'gold', t, this.seed + 3, { glow: 0.6 });
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.stroke(g);
      ctx.strokeStyle = '#3a3640'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, 22); ctx.stroke();
      H.shaded(ctx, H.poly([-5, 22, 5, 22, 2, 25, -2, 25]), '#3a3640', [-5, 22, 5, 25], { lw: 1.1 });
      ctx.restore();
      // the pack: a big lumpy sack with trinkets
      ctx.save();
      ctx.translate(rock * 0.5, 0);
      const sack = new Path2D();
      sack.moveTo(-6, -10); sack.bezierCurveTo(-30, -8, -36, -36, -28, -56); sack.bezierCurveTo(-20, -70, 2, -68, 6, -52);
      sack.bezierCurveTo(10, -38, 6, -18, -6, -10); sack.closePath();
      H.shaded(ctx, sack, '#7a5636', [-34, -68, 8, -10], { light: 0.2, shadow: 0.5, lw: 1.8 });
      ctx.save(); ctx.clip(sack);
      ctx.strokeStyle = 'rgba(40,24,12,0.5)'; ctx.lineWidth = 1;
      for (const yy of [-24, -40]) { ctx.beginPath(); ctx.moveTo(-34, yy); ctx.quadraticCurveTo(-14, yy + 5, 8, yy - 2); ctx.stroke(); }
      ctx.fillStyle = '#8e3a2a'; ctx.fillRect(-26, -34, 8, 7); // a patch
      ctx.strokeStyle = 'rgba(255,220,180,0.35)'; ctx.setLineDash([2, 2]); ctx.strokeRect(-26, -34, 8, 7); ctx.setLineDash([]);
      ctx.restore();
      // trinkets: rolled map, a pot, a bottle, a bell
      ctx.save(); ctx.translate(-10, -64); ctx.rotate(-0.5);
      H.shaded(ctx, H.rrect(-3, -12, 6, 16, 2), '#e8dcb8', [-3, -12, 3, 4], { lw: 1.2 });
      H.line(ctx, [-3, -8, 3, -8], '#a03a2a', 1.2);
      ctx.restore();
      H.shaded(ctx, H.ellipse(-30, -26, 5.5, 5), '#5a6a7a', [-35, -31, -25, -21], { lw: 1.3 });
      H.shaded(ctx, H.rrect(-31.5, -33, 3, 3, 1), '#5a6a7a', [-32, -33, -28, -30], { lw: 1 });
      H.shaded(ctx, H.rrect(-24, -66, 5, 9, 2), '#4a8a6a', [-24, -66, -19, -57], { lw: 1.1 });
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-23, -64, 1, 5);
      H.shaded(ctx, H.ellipse(-18, -12, 3.5, 3.5), '#c8a040', [-21, -15, -15, -9], { lw: 1.1 });
      ctx.restore();
      legs(ctx, 7, 5);
      const b = body(ctx, 2, -4, 34, 34, { variant: 'round', color: '#ece1c6', shade: '#3a2a18', drips: 2, seed: this.seed, lean: rock * 0.6, squash: sq, rim: '#ffd8a0', rimAlpha: 0.4 });
      // pack straps over the shoulders
      ctx.save(); ctx.clip(b.path);
      H.line(ctx, [b.cx - 12, b.top + 3, b.cx + 4, -10], '#5a3a22', 3.4);
      ctx.restore();
      const fx = b.cx + 4, top = b.top;
      // rosy cheeks and a smile
      ctx.fillStyle = 'rgba(230,120,100,0.35)';
      ctx.beginPath(); ctx.ellipse(fx - 7, top + 15, 3.4, 2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx + 9, top + 15, 3.4, 2, 0, 0, TAU); ctx.fill();
      eyes(ctx, fx + 1, top + 10, { kind: 'round', size: 8, gap: 11, blink: this.blink(t) });
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(fx + 1.5, top + 15, this.talking ? 3.5 + Math.abs(Math.sin(t * 12)) * 1.2 : 3.4, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      // stubby arm at the side, thumb hooked in the strap
      arm(ctx, [b.cx + 14, -27, b.cx + 18, -19], '#d8cba8', 4);
      hand(ctx, b.cx + 18, -17.5, 3.3, '#e2d6b6');
      const tip = wick(ctx, b.cx, top + 2, { len: 6, bend: -1.5, width: 2.2, curl: 1.5 });
      H.flame(ctx, tip[0], tip[1] + 1, 12, 'orange', t, this.seed, { glow: 0.7 });
    }
  }

  // =====================================================================================================
  // Quill — tall lanky cartographer; ink-black hands, a quill tucked by her wick, hums (note particles)
  // =====================================================================================================
  class Quill extends NPC {
    setup() { this.w = 26; this.h = 80; this.notes = []; this.noteT = 0.5; }
    humming() { return !this.talking; }
    tick(dt) {
      if (this.humming()) {
        this.noteT -= dt;
        if (this.noteT <= 0 && this.notes.length < 6) {
          this.noteT = 0.7 + Math.random() * 0.8;
          const f = this.flameInfo(this.t);
          this.notes.push({ x: this.cx + 6 * this.turnX, y: this.bottom + f.y + 26, vx: (Math.random() * 14 + 10) * (this.turnX >= 0 ? 1 : -1), vy: -26 - Math.random() * 12, age: 0, life: 2.4 + Math.random(), kind: Math.random() < 0.5 ? 0 : 1, ph: Math.random() * TAU });
        }
      }
      for (const n of this.notes) { n.age += dt; n.x += (n.vx + Math.sin(n.age * 3 + n.ph) * 14) * dt; n.y += n.vy * dt; }
      this.notes = this.notes.filter((n) => n.age < n.life);
    }
    flameInfo(t) { return { x: 3 + Math.sin(t * 1.1 + this.seed) * 0.8, y: -86, size: 10, kind: 'gold', light: 160, intensity: 0.65 }; }
    drawBody(ctx, t) {
      const sway = Math.sin(t * 1.1 + this.seed) * 1.4;
      const sq = this.breath(t, 1.4, 0.012);
      const hum = this.humming();
      // satchel of charts (behind)
      H.shaded(ctx, H.rrect(-17, -40, 14, 13, 3), '#5a4030', [-17, -40, -3, -27], { lw: 1.4 });
      for (const [dx, h] of [[-15, 8], [-11, 11], [-7, 7]]) H.shaded(ctx, H.rrect(dx, -40 - h, 3.4, h + 2, 1.5), '#ece0c0', [dx, -40 - h, dx + 3.4, -38], { lw: 1 });
      // long thin legs
      for (const s of [-1, 1]) H.shaded(ctx, H.rrect(s * 4 - 2.5, -9, 5, 9, 2), '#1c1820', [s * 4 - 2.5, -9, s * 4 + 2.5, 0], { lw: 1.1 });
      // far arm (ink hand on the hip)
      arm(ctx, [-6, -58, -11, -44, -7, -35], '#d8cdb8', 3);
      hand(ctx, -7, -34, 2.8, '#141018');
      const b = body(ctx, 0, -8, 21, 66, { variant: 'taper', color: '#e8dfcc', shade: '#2a2430', drips: 3, seed: this.seed, lean: sway, squash: sq, rim: '#ffe0b0', rimAlpha: 0.35 });
      // satchel strap across the body + ink smudges
      ctx.save(); ctx.clip(b.path);
      H.line(ctx, [b.cx + 9, b.top + 10, b.cx - 10, -36], '#5a4030', 2.8);
      ctx.fillStyle = 'rgba(20,16,24,0.55)';
      ctx.beginPath(); ctx.ellipse(6, -40, 2.2, 1.4, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-4, -28, 1.6, 1.1, 0, 0, TAU); ctx.fill();
      ctx.restore();
      const fx = b.cx + 2, top = b.top;
      // eyes closed while humming (soft arcs), open otherwise
      if (hum) {
        ctx.strokeStyle = '#141018'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(fx + s * 4, top + 11, 2.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
        ctx.beginPath(); ctx.ellipse(fx + 1, top + 17, 1.2, 1.2 + Math.abs(Math.sin(t * 2.6)) * 0.6, 0, 0, TAU); ctx.fillStyle = '#2a1e1e'; ctx.fill();
      } else eyes(ctx, fx, top + 11, { kind: 'slit', size: 7, gap: 8, blink: this.blink(t) });
      // near arm: ink-black hand raised a little, as if conducting the tune
      const wave = hum ? Math.sin(t * 2.6 + this.seed) * 3 : 0;
      arm(ctx, [b.cx + 7, -56, b.cx + 13, -44, b.cx + 13 + wave * 0.4, -36 - wave], '#d8cdb8', 3);
      hand(ctx, b.cx + 13 + wave * 0.4, -35 - wave, 3, '#141018');
      ctx.fillStyle = '#141018'; ctx.beginPath(); ctx.ellipse(b.cx + 13.5 + wave * 0.4, -30.5 - wave, 0.9, 1.6, 0, 0, TAU); ctx.fill(); // an ink drip
      const tip = wick(ctx, b.cx + 1, top + 2, { len: 7, bend: 1.5, width: 2 });
      // the quill tucked beside the wick
      ctx.save();
      ctx.translate(b.cx - 4, top + 4);
      ctx.rotate(-0.55);
      const feather = new Path2D();
      feather.moveTo(0, 2); feather.quadraticCurveTo(-4.5, -9, -1, -21); feather.quadraticCurveTo(4, -10, 0, 2); feather.closePath();
      H.shaded(ctx, feather, '#e8e4dc', [-5, -21, 4, 2], { lw: 1.2, light: 0.3 });
      H.line(ctx, [0, 3, -0.6, -18], '#8a8478', 0.9);
      H.line(ctx, [0, 3, 0, 7], '#141018', 1.4);
      ctx.restore();
      H.flame(ctx, tip[0], tip[1] + 1, 10, 'gold', t, this.seed, { glow: 0.6 });
    }
    drawWorldFront(ctx) {
      for (const n of this.notes) {
        const a = Math.sin(clamp(n.age / n.life, 0, 1) * Math.PI);
        ctx.save();
        ctx.globalAlpha *= a * 0.9;
        H.glow(ctx, n.x, n.y, 10, '#ffd890', 0.4);
        ctx.fillStyle = '#ffe8b8'; ctx.strokeStyle = '#ffe8b8'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(n.x, n.y, 2.6, 1.9, -0.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(n.x + 2.2, n.y - 0.5); ctx.lineTo(n.x + 2.2, n.y - 10); ctx.stroke();
        if (n.kind) { ctx.beginPath(); ctx.moveTo(n.x + 2.2, n.y - 10); ctx.quadraticCurveTo(n.x + 6, n.y - 8, n.x + 5, n.y - 5); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  // =====================================================================================================
  // Bramm the Wickwright — broad, leather apron, anvil, red flame; hammers while nobody needs him
  // =====================================================================================================
  class Bramm extends NPC {
    setup() {
      this.w = 46; this.h = 60;
      this.anvilSide = this.baseFacing;
      this.hammerT = Math.random() * 2;
      this.strikeFlash = 0;
      this.faceRange = 3.5 * TILE;
    }
    working() { return !this.talking && Math.sign(this.turnX) === this.anvilSide && H.distToPlayer(this) > 3.5 * TILE; }
    idleFacing() { return this.anvilSide; }
    anvilPos() { return { x: this.cx + this.anvilSide * 46, y: this.bottom }; }
    tick(dt) {
      if (this.strikeFlash > 0) this.strikeFlash = Math.max(0, this.strikeFlash - dt * 4);
      if (!this.working()) { this.hammerT = 0; return; }
      const prev = this.hammerT;
      this.hammerT = (this.hammerT + dt) % 2.2;
      if (prev < 1.55 && this.hammerT >= 1.55) { // the strike
        const a = this.anvilPos();
        this.strikeFlash = 1;
        H.burst('spark', a.x - this.anvilSide * 4, a.y - 30, { count: 9, color: '#ffb060', speed: 340, angle: -Math.PI / 2, spread: 2.2 });
        if (H.distToPlayer(this) < 12 * TILE) H.sfx('slash_wall', a.x, { vol: 0.22, pitch: 1.35 + Math.random() * 0.1 });
      }
    }
    hammerAngle() {
      if (!this.working()) return -0.4;
      const k = this.hammerT;
      if (k < 1.2) return -0.4 - (k / 1.2) * 1.5;          // slow raise
      if (k < 1.55) return -1.9 + ((k - 1.2) / 0.35) ** 2 * 2.6; // fast swing down
      return 0.7 - ((k - 1.55) / 0.65) * 1.1;               // settle back
    }
    flameInfo(t) { return { x: 4, y: -67 + Math.sin(t * 1.6) * 0.5, size: 14, kind: 'red', light: 190, intensity: 0.75, lightColor: '#ff6a40' }; }
    drawWorldBack(ctx) {
      // the anvil stays where it is when he turns
      const a = this.anvilPos();
      if (G.Art && G.Art.drawDecorProp && G.Art.propInfo && G.Art.propInfo('anvil')) {
        G.Art.drawDecorProp(ctx, 'anvil', a.x, a.y, { region: H.regionId(this), seed: this.seed, flip: this.anvilSide < 0 }, this.t);
      } else {
        const iron = '#3a3a44';
        H.shaded(ctx, H.rrect(a.x - 9, a.y - 14, 18, 14, 2), iron, [a.x - 9, a.y - 14, a.x + 9, a.y]);
        H.shaded(ctx, H.poly([a.x - 22, a.y - 26, a.x + 18, a.y - 26, a.x + 12, a.y - 16, a.x - 12, a.y - 16]), iron, [a.x - 22, a.y - 26, a.x + 18, a.y - 16]);
      }
      if (this.strikeFlash > 0) H.glow(ctx, a.x - this.anvilSide * 4, a.y - 30, 50, '#ff9040', this.strikeFlash * 0.8);
    }
    drawBody(ctx, t) {
      const sq = this.breath(t, 1.2, 0.012);
      const ha = this.hammerAngle();
      legs(ctx, 10, 7, '#1a1614');
      const b = body(ctx, 0, -6, 44, 50, { variant: 'pillar', color: '#d8c9aa', shade: '#2a1a10', drips: 3, seed: this.seed, squash: sq, lean: Math.sin(ha) * 1.5, rim: '#ff9a70', rimAlpha: 0.4 });
      // leather apron with stitching, a pocket and a neck strap
      ctx.save(); ctx.clip(b.path);
      const ap = new Path2D();
      ap.moveTo(b.cx - 13, b.top + 26); ap.lineTo(b.cx + 15, b.top + 26); ap.lineTo(20, -6); ap.lineTo(-16, -6); ap.closePath();
      H.shaded(ctx, ap, '#5a3a24', [-16, b.top + 26, 20, -6], { light: 0.15, shadow: 0.45, lw: 1.4 });
      ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(230,200,150,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.cx - 11, b.top + 28.5); ctx.lineTo(b.cx + 13, b.top + 28.5); ctx.stroke();
      ctx.setLineDash([]);
      H.shaded(ctx, H.rrect(2, -26, 11, 8, 2), '#4a2e1c', [2, -26, 13, -18], { lw: 1 });
      H.line(ctx, [b.cx - 12, b.top + 26, b.cx - 20, b.top + 14], '#4a2e1c', 2.6);
      H.line(ctx, [b.cx + 14, b.top + 26, b.cx + 22, b.top + 14], '#4a2e1c', 2.6);
      ctx.restore();
      const fx = b.cx + 5, top = b.top;
      ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx - 10, top + 8); ctx.lineTo(fx - 1, top + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx + 3, top + 10); ctx.lineTo(fx + 12, top + 8); ctx.stroke();
      eyes(ctx, fx + 1, top + 14, { kind: 'slit', size: 9, gap: 13, blink: this.blink(t) });
      H.line(ctx, [fx - 3, top + 20.5, fx + 5, top + 20.5], '#3a2a1e', 1.6);
      // hammer arm (pivot at the shoulder)
      ctx.save();
      ctx.translate(b.cx + 16, -40);
      ctx.rotate(ha);
      arm(ctx, [0, 0, 10, 4, 18, 2], '#d0c09e', 6);
      hand(ctx, 19, 2, 4.4, '#d8caa8');
      H.stroke2(ctx, [19, 2, 19, -18], '#6a4a2e', 3);
      H.shaded(ctx, H.rrect(12, -26, 15, 9, 2), '#3c3c46', [12, -26, 27, -17], { lw: 1.4 });
      H.line(ctx, [13, -24.5, 26, -24.5], 'rgba(200,200,220,0.4)', 1);
      ctx.restore();
      const tip = wick(ctx, b.cx + 1, top + 2, { len: 6, bend: 1, width: 2.6 });
      H.flame(ctx, tip[0], tip[1] + 1, 14, 'red', t, this.seed, { glow: 0.75 });
    }
  }

  // =====================================================================================================
  // Wren — small traveler under a snuffer-cap hat, walking pole; her flame weakens every meeting
  // =====================================================================================================
  const WREN_FLAME = [1, 1, 0.72, 0.48, 0.26];
  const WREN_SEEN_RANGE = 12 * TILE;   // ~on screen: the player has come across her at this stage
  class Wren extends NPC {
    setup() { this.w = 26; this.h = this.stage >= 4 ? 30 : 40; this.seenSet = false; }
    wrenStage() { return clamp(this.stage || 1, 1, 4); }
    // She travels on and is only ever in one place: a stage is gone once any later stage has been met or
    // seen (wren_met_N from her *_meet talk, wren_seen_N on first sight), and every earlier stage is gone
    // once she has given the Longbrand (wren_gift). props.requires still applies on top.
    present() {
      if (!super.present()) return false;
      if (this.props.preview === true) return true;
      const st = this.wrenStage();
      if (st < 4 && H.flag('wren_gift')) return false;
      for (let k = st + 1; k <= 4; k++) if (H.flag('wren_met_' + k) || H.flag('wren_seen_' + k)) return false;
      return true;
    }
    tick() {
      if (this.seenSet || this.props.preview === true || !H.playable()) return;
      if (H.distToPlayer(this) < WREN_SEEN_RANGE) { this.seenSet = true; H.setFlag('wren_seen_' + this.wrenStage()); }
    }
    strength() { return WREN_FLAME[clamp(this.stage || 1, 1, 4)]; }
    sitting() { return (this.stage || 1) >= 4; }
    flameInfo(t) {
      const s = this.strength();
      const sit = this.sitting();
      const fl = 0.85 + 0.15 * Math.sin(t * (sit ? 0.9 : 2) + this.seed) * (sit ? 2 : 1);
      return { x: sit ? 3 : 2, y: sit ? -44 : -55, size: 11 * s * fl, kind: s < 0.4 ? 'pale' : 'orange', light: 60 + 100 * s, intensity: 0.35 + 0.35 * s };
    }
    drawBody(ctx, t) {
      const s = this.strength();
      const sit = this.sitting();
      const wax = H.mix('#e4d8c0', '#9aa4b0', (1 - s) * 0.7);
      const sq = this.breath(t, sit ? 0.7 : 1.8, sit ? 0.01 : 0.02);
      // walking pole (leaning on her shoulder when sitting) with a tied bundle
      const pole = sit ? [14, 0, 6, -48] : [12, 0, 13, -56];
      H.stroke2(ctx, pole, '#7a5a3a', 2.6);
      ctx.save(); ctx.translate(pole[2], pole[3] + 4);
      H.shaded(ctx, H.ellipse(-3, 4, 5, 4), '#6a5a48', [-8, 0, 2, 8], { lw: 1.2 });
      ctx.restore();
      // bedroll on her back
      H.shaded(ctx, H.rrect(-15, sit ? -24 : -34, 8, 18, 3.5), '#6a4a3a', [-15, -34, -7, -16], { lw: 1.3 });
      H.line(ctx, [-15, sit ? -18 : -28, -7, sit ? -18 : -28], '#3a2a1e', 1.2);
      if (sit) {
        // legs stretched forward
        H.shaded(ctx, H.rrect(-2, -6, 16, 5.5, 2.5), '#1c1820', [-2, -6, 14, 0], { lw: 1.2 });
      } else legs(ctx, 5, 5);
      const b = body(ctx, 0, sit ? -2 : -4, 22, sit ? 24 : 27, { variant: 'candle', color: wax, shade: '#28303a', drips: 3, seed: this.seed, squash: sq, lean: sit ? -2 : 0, rim: s > 0.5 ? '#ffd8a0' : '#c8d8f0', rimAlpha: 0.35 });
      if (sit) { // frost creeping up the wax
        ctx.save(); ctx.clip(b.path);
        const fr = ctx.createLinearGradient(0, -16, 0, 0);
        fr.addColorStop(0, 'rgba(200,230,255,0)'); fr.addColorStop(1, 'rgba(210,236,255,0.45)');
        ctx.fillStyle = fr; ctx.fillRect(-14, -16, 28, 16);
        ctx.fillStyle = 'rgba(240,250,255,0.85)';
        for (const [x0, y0] of [[-8, -4], [-3, -8], [4, -3], [8, -9]]) { ctx.fillRect(x0 - 0.5, y0 - 1.5, 1, 3); ctx.fillRect(x0 - 1.5, y0 - 0.5, 3, 1); }
        ctx.restore();
      }
      const top = b.top;
      eyes(ctx, b.cx + 2, top + 9, { kind: 'slit', size: 7, gap: 8, blink: this.blink(t, sit ? 0.55 : 0.1) });
      // the snuffer-cap hat: a wide brim and an iron bell, flame peeking through its vent
      const hx = b.cx + (sit ? -1 : 0), hy = top + 4;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(sit ? -0.12 : -0.05);
      H.shaded(ctx, H.ellipse(0, 0, 18, 3.6), '#3a3a44', [-18, -4, 18, 4], { lw: 1.4 });
      const cap = new Path2D();
      cap.moveTo(-9, -1); cap.quadraticCurveTo(-9, -13, -2.5, -15); cap.lineTo(2.5, -15); cap.quadraticCurveTo(9, -13, 9, -1); cap.closePath();
      H.shaded(ctx, cap, '#4a4a56', [-9, -15, 9, -1], { light: 0.25, lw: 1.4 });
      H.line(ctx, [-8, -4, 8, -4], '#7a6a4a', 1.6); // band
      H.line(ctx, [-6, -11, -3, -13.5], 'rgba(220,220,240,0.35)', 1);
      ctx.restore();
      H.flame(ctx, hx + (sit ? 1.5 : 0.6), hy - 14, 11 * s * (0.85 + 0.15 * Math.sin(t * 2 + this.seed)), s < 0.4 ? 'pale' : 'orange', t, this.seed, { glow: 0.3 + 0.5 * s });
      // near hand on the pole
      if (!sit) { arm(ctx, [b.cx + 7, -20, 12, -24], H.mix(wax, '#000000', 0.08), 3); hand(ctx, 12.5, -24.5, 2.6, wax); }
      else { arm(ctx, [b.cx + 6, -14, 9, -10], H.mix(wax, '#000000', 0.08), 3); hand(ctx, 10, -9.5, 2.6, wax); }
    }
    flameWorld() { const f = this.flameInfo(this.t); return { x: this.cx + f.x * this.turnX, y: this.bottom + f.y }; }
  }

  // =====================================================================================================
  // Sable (non-combat) — tall black wax, long red scarf, hooked snuffer-spear; never lit.
  //   stage 1: a glimpse on a ledge: turns when the player comes within ~8 tiles, speaks once, dissolves
  //            into smoke; sets flag `sable_glimpse` (or props.flag). Not interactable.
  //   stage 2: stands aside at the Sanctum gate; talkable; present only after boss:sable2.
  // =====================================================================================================
  class Sable extends NPC {
    setup() {
      this.w = 28; this.h = 94;
      this.scarf = null;
      this.mode = 'idle';      // idle | turning | speaking | dissolving
      this.modeT = 0;
      this.alpha = 1;
      this.glimpseRange = (+this.props.range || 8) * TILE;
      if ((this.stage || 1) === 1) this.interactable = false;
      this.ensureScarf();
    }
    glimpseFlag() { return this.props.flag || (H.cond('boss:sable1') ? 'sable_glimpse_after' : 'sable_glimpse'); }
    present() {
      if (!super.present()) return false;
      // stage 2 is strictly post-duel (props.requires, if any, must pass as well — checked above)
      if ((this.stage || 1) >= 2) return H.cond('boss:sable2') || this.props.preview === true;
      // no more glimpses once she has yielded at the Sanctum gate (stage 2): she is done shadowing the player
      if (H.cond('boss:sable2')) return false;
      return !H.flag(this.glimpseFlag());
    }
    wantsToFacePlayer() { return (this.stage || 1) >= 2 || this.mode !== 'idle'; }
    ensureScarf() {
      const c = C();
      if (c && c.cloth && !this.scarf) this.scarf = c.cloth.create(7, 10);
    }
    neckWorld() { return { x: this.cx - 6 * this.turnX, y: this.bottom - 65 }; }
    tick(dt) {
      const c = C();
      if (this.scarf && c) {
        const n = this.neckWorld();
        const wind = -this.turnX * 700 + Math.sin(this.t * 1.7 + this.seed) * 300 + (this.mode === 'dissolving' ? -this.turnX * 500 : 0);
        c.cloth.update(this.scarf, n.x, n.y, dt, { wind, gravity: 90, damping: 0.95, lift: 30 });
      }
      if ((this.stage || 1) >= 2) return;
      this.modeT += dt;
      if (this.mode === 'idle') {
        if (H.playable() && H.distToPlayer(this) < this.glimpseRange) {
          this.mode = 'turning'; this.modeT = 0;
          H.setFlag(this.glimpseFlag());
          H.sfx('wisp', this.cx, { vol: 0.35, pitch: 0.7 });
          G.events.emit('sableGlimpse', { entity: this });
        }
      } else if (this.mode === 'turning') {
        if (this.modeT > 0.6) this.speak();
      } else if (this.mode === 'speaking') {
        // dialogue is modal; once it's gone (or there was none), vanish
        if (!this.talking && this.modeT > 0.5) this.startDissolve();
      } else if (this.mode === 'dissolving') {
        this.alpha = clamp(1 - this.modeT / 0.9, 0, 1);
        if (Math.random() < dt * 40) H.burst('smoke', this.cx + (Math.random() - 0.5) * 24, this.bottom - Math.random() * this.h, { count: 1, color: '#2a2630', alpha: 0.55, speed: 30 });
        if (this.modeT >= 0.9) this.remove();
      }
    }
    speak() {
      this.mode = 'speaking'; this.modeT = 0;
      if (this.props.speak === false) return;
      const talk = pickTalk(this.textKey, this.npc);
      if (talk) { this.interact(H.player()); }
    }
    startDissolve() {
      this.mode = 'dissolving'; this.modeT = 0;
      H.burst('smoke', this.cx, this.bottom - this.h * 0.5, { count: 14, color: '#2a2630', alpha: 0.6, speed: 80, size: 12 });
      H.burst('ember', this.cx, this.bottom - this.h * 0.7, { count: 6, color: '#c03030', speed: 60 });
      H.sfx('dash', this.cx, { vol: 0.4, pitch: 0.6 });
    }
    flameInfo() { return { x: 0, y: -88, size: 0, kind: 'pale', light: 70, intensity: 0.14, lightColor: '#a898c8' }; }
    draw(ctx, t) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha *= this.alpha;
      super.draw(ctx, t);
      ctx.restore();
    }
    drawWorldBack(ctx) {
      const c = C();
      if (this.scarf && c) c.cloth.draw(ctx, this.scarf, { width: 8, tip: 0.55, color: '#a8222a', shadeColor: '#2a0408', lw: 1.8, wave: 2 });
    }
    drawBody(ctx, t) {
      const st = this.stage || 1;
      const sq = this.breath(t, 1.0, 0.01);
      const sway = Math.sin(t * 0.8 + this.seed) * 1;
      // the hooked snuffer-spear: held upright beside her (resting on the ground at the gate)
      const sx = st >= 2 ? -15 : 15;
      H.stroke2(ctx, [sx, 2, sx, -114], '#24222a', 2.8);
      H.line(ctx, [sx - 0.7, 0, sx - 0.7, -112], 'rgba(160,150,190,0.35)', 0.9);
      ctx.save(); ctx.translate(sx, -114);
      const capP = new Path2D();
      capP.moveTo(-4.5, 4); capP.quadraticCurveTo(-4.5, -5, 0, -7); capP.quadraticCurveTo(4.5, -5, 4.5, 4); capP.closePath();
      H.shaded(ctx, capP, '#2e2c36', [-4.5, -7, 4.5, 4], { lw: 1.3, light: 0.3 });
      ctx.strokeStyle = OUT; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(1, -16, 9, -17); ctx.quadraticCurveTo(15, -16, 13, -9); ctx.stroke();
      ctx.strokeStyle = '#3a3846'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(1, -16, 9, -17); ctx.quadraticCurveTo(15, -16, 13, -9); ctx.stroke();
      ctx.restore();
      // thin dark legs under the coat
      for (const s2 of [-1, 1]) H.shaded(ctx, H.rrect(s2 * 4 - 2.2, -14, 4.4, 14, 2), '#0e0c12', [s2 * 4 - 2.2, -14, s2 * 4 + 2.2, 0], { lw: 1.1 });
      // long coat of black wax: narrow shoulders, flaring to a ragged hem
      const hemY = -11, shY = -66, top = -90 * sq;
      const coat = new Path2D();
      coat.moveTo(-8, shY);
      coat.bezierCurveTo(-10, -48, -14 - sway, -26, -17 - sway, hemY);
      const hem = [[-17, 0], [-12, 4], [-7, -1], [-2, 5], [3, 0], [8, 4], [13, -1], [17, 3]];
      for (const [hx, hy] of hem) coat.lineTo(hx - sway * (1 - (hx + 17) / 34), hemY + hy);
      coat.bezierCurveTo(14 - sway, -26, 10, -48, 8, shY);
      coat.closePath();
      H.shaded(ctx, coat, '#24212b', [-17, shY, 17, hemY + 4], { light: 0.12, shadow: 0.5, lw: 1.8, oc: '#050408' });
      ctx.save(); ctx.clip(coat);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
      for (const fx0 of [-5, 4]) { ctx.beginPath(); ctx.moveTo(fx0 * 0.6, shY + 8); ctx.quadraticCurveTo(fx0 * 1.4, -34, fx0 * 2.4 - sway, hemY + 2); ctx.stroke(); }
      ctx.restore();
      // rim light on the lit edge of the coat so the silhouette reads in the dark
      const cC = C();
      if (cC) cC.rim(ctx, coat, { color: '#b8a8d8', box: [-17, shY, 17, hemY], light: -1, width: 1.6, alpha: 0.7 });
      // head & neck: the candle top
      const b = body(ctx, 0, shY + 4, 16, (shY + 4) - top, { variant: 'pillar', color: '#2b2832', hi: '#9a90b8', shade: '#000000', shadeAmt: 0.5, drips: 2, seed: this.seed, rim: '#b8a8d8', rimAlpha: 0.75, rimWidth: 1.5, outline: '#06050a' });
      // far arm to the spear
      arm(ctx, [-5, shY + 3, sx < 0 ? -12 : 6, -50, sx, -45], '#23202a', 3.4);
      hand(ctx, sx, -45, 3, '#2b2832');
      const fx = b.cx + 2.5;
      eyes(ctx, fx, b.top + 10, { kind: 'slit', size: 9, gap: 8.5, color: '#efe8ff', shine: false, blink: this.blink(t) });
      H.glow(ctx, fx, b.top + 10, 14, '#c8b8ff', 0.2);
      // the scarf wrapped at the neck (its long tail streams behind, drawn in world space)
      H.shaded(ctx, H.rrect(-10, shY - 3, 20, 8, 3.5), '#b0242c', [-10, shY - 3, 10, shY + 5], { lw: 1.3, light: 0.3 });
      H.line(ctx, [-7, shY + 1, 7, shY], 'rgba(60,0,10,0.5)', 1);
      // the cold black wick: never lit
      wick(ctx, b.cx, b.top + 2, { len: 8, bend: -2.5, width: 2.2, color: '#08070a', curl: -1.5 });
    }
  }

  // =====================================================================================================
  // Registration: one entity type 'npc' dispatching on props.npc
  // =====================================================================================================
  const CLASSES = { thrum: Thrum, pell: Pell, quill: Quill, bramm: Bramm, wren: Wren, sable: Sable };
  G.registerEntityFactory('npc', (props) => {
    const name = String(props.npc || '').toLowerCase();
    const Cls = CLASSES[name];
    if (!Cls) {
      G.warnOnce('npc:' + name, 'unknown npc "' + props.npc + '" — drawn as a generic waxen');
      return new NPC(props);
    }
    return new Cls(props);
  });
  G.NPC = NPC;
  G.NPCs = { classes: CLASSES, pickTalk, talkedFlag };
})();
