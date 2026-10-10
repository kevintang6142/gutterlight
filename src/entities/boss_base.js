// src/entities/boss_base.js — G.Boss (extends G.Enemy): phases, stagger, weighted attack scheduler,
// intro (dialogue → title card → music), defeat sequence (slow-mo, flashes, explosion / yield / custom,
// G.game.defeatBoss, reward cinders); the 'arena' controller entity (TECH_SPEC §9.1); and 'boss_test',
// a complete placeholder boss used by tests and for arenas whose boss is not registered yet.
// API guide: docs/api/enemies.md §10–12.
(function () {
  'use strict';
  const G = globalThis.G;
  const TILE = G.CONST.TILE;
  const DT = G.CONST.DT;
  const GRAV = G.CONST.GRAVITY, MAX_FALL = G.CONST.MAX_FALL;
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const approach = (cur, target, d) => (cur < target ? Math.min(cur + d, target) : Math.max(cur - d, target));

  /** Music per boss id (DESIGN §8). */
  const BOSS_MUSIC = { effigy: 'boss', matron: 'boss', sable1: 'sable', sable2: 'sable', tallowmere: 'keeper', kilnmother: 'keeper', vespertine: 'keeper', lucerne: 'lucerne' };
  /** Reward cinders per boss id (DESIGN §5.3); others 0. */
  const BOSS_REWARD = { effigy: 200, tallowmere: 300, kilnmother: 300, vespertine: 300 };
  /** Warden Seal per boss id (DESIGN §5.3); read from G.Items.sealBoss (seal → boss) when available. */
  const SEAL_FALLBACK = { tallowmere: 'bell', kilnmother: 'kiln', vespertine: 'wing' };
  const SEAL_CARD_DELAY = 1.4;   // seconds after the victory is recorded before the seal card appears

  const BOSS_DEFAULTS = {
    hp: 200,
    weight: 100, knockback: 0, hitStun: 0,
    cinders: 0,                 // regular drop (bosses use `reward` instead)
    contactDamage: 1, contactInset: 6,
    z: -2,
    hitSound: 'boss_hit', deathSound: 'boss_die',
    hitstop: 0.03,
    minTelegraph: 0.25,         // bosses: big attacks >= 0.5 s, quick ones >= 0.3 s, follow-ups >= 0.2 s
    noSpawnShift: true,
    introTime: 0.9,             // s after the fight starts before the first attack is chosen
    rest: [0.45, 0.9],          // idle time between attacks (s), random in range
    phaseRest: [1, 0.85, 0.7, 0.6], // rest multiplier per phase (phase 1 → index 0)
    phases: [],                 // hp fractions where phases begin, e.g. [0.6, 0.3] → phases 1, 2, 3
    stagger: null,              // {damage, time}: damage taken since the last stagger that stuns the boss
    attacks: {},                // name → {weight, range:[min,max] px |dx|, phase, maxPhase, cooldown, repeat, uninterruptible, when(dist)}
    defeatStyle: 'explode',     // 'explode' | 'yield' (Sable) | 'custom' (onDefeatSequence)
    slowmo: 0.9,                // game seconds of half-speed after the killing blow (≈ 1.8 s real)
    introDialogue: true,        // speak G.Text.bosses[id].intro before the card (if the UI exists)
    defeatDialogue: true,       // speak G.Text.bosses[id].defeat after the slow-mo
    roar: true,                 // 'boss_roar' + shake when the fight starts
    puddleTime: 5,
    music: null, reward: null,
    stinger: 'boss_defeated',   // G.Audio stinger played when the victory is recorded (false = none; skipped when a seal card follows)
    seal: null,                 // Warden Seal granted on defeat: null = from G.Items.sealBoss, false = none, or a seal id
  };

  // =====================================================================================================
  // G.Boss
  // =====================================================================================================
  class Boss extends G.Enemy {
    constructor(props, cfg) {
      const c = Object.assign({}, BOSS_DEFAULTS, cfg || {});
      super(props, c);
      const p = this.props;
      this.bossId = p.boss || c.id || 'test';
      this.persistId = null;           // bosses persist through boss:<id>, not dead:<id>
      this.isBoss = true;
      this.cull = false;
      this.phase = 1;
      this.phaseThresholds = (c.phases || []).slice().sort((a, b) => b - a);
      this.attacks = {};
      for (const name in (c.attacks || {})) {
        this.attacks[name] = Object.assign({ weight: 1, range: null, phase: 1, maxPhase: 99, cooldown: 0, repeat: false, uninterruptible: false }, c.attacks[name]);
      }
      this.attack = null; this.lastAttack = null; this.attackCount = 0;
      this.staggerDmg = 0; this.staggers = 0; this.staggerTime = 0;
      this.uninterruptible = false;
      this.arena = p.arena || null;
      this.music = c.music || BOSS_MUSIC[this.bossId] || 'boss';
      this.reward = c.reward != null ? c.reward : (BOSS_REWARD[this.bossId] || 0);
      this.defeatStyle = c.defeatStyle || 'explode';
      this.fightStarted = false;
      this._starting = false;
      this._introStart = 0;
      this.restTime = 0.6;
      this.defeatStage = null;
      this.yielded = false;
      this.exploded = false;
      this.speaking = false;
      this.setState('intro');
    }

    get text() { return (G.Text && G.Text.bosses && G.Text.bosses[this.bossId]) || null; }

    // ---------------------------------------------------------------- fight start
    /** Called by the arena once the boss is spawned (or automatically when spawned without an arena). */
    beginFight() {
      if (this.fightStarted || this._starting) return;
      this._starting = true;
      const tx = this.text;
      const lines = tx && tx.intro;
      const UI = G.UI;
      if (this.cfg.introDialogue !== false && !Boss.skipDialogue && lines && lines.length && UI && typeof UI.dialogue === 'function') {
        this._dialogueOpen = true;
        try {
          UI.dialogue({ name: tx.name, lines, onDone: () => { this._dialogueOpen = false; this.startFight(); } });
          return;
        } catch (err) { G.reportError(err, 'boss intro dialogue'); this._dialogueOpen = false; }
      }
      this.startFight();
    }
    startFight() {
      if (this.fightStarted) return;
      this.fightStarted = true;
      this._introStart = this.stateTime;
      if (G.game && typeof G.game.startBossMusic === 'function') G.game.startBossMusic(this.music);
      if (G.UI && typeof G.UI.bossCard === 'function') { try { G.UI.bossCard(this.bossId); } catch (err) { G.reportError(err, 'UI.bossCard'); } }
      G.events.emit('bossStart', { id: this.bossId, boss: this });
      if (this.cfg.roar !== false) { G.sfxAt('boss_roar', this.cx); if (G.game) G.game.shake(6, 0.6); }
      if (typeof this.onFightStart === 'function') this.onFightStart();
    }

    // ---------------------------------------------------------------- scheduler
    think(dt) {
      switch (this.state) {
        case 'intro':
          if (!this.fightStarted && !this._starting && !this.arena && !this.props.noAutoStart) this.beginFight();
          this.introUpdate(dt);
          if (this.fightStarted && !this._dialogueOpen && this.stateTime - this._introStart >= this.cfg.introTime) this.endAttack(0.2);
          break;
        case 'idle':
          this.idleUpdate(dt);
          if (this.stateTime >= this.restTime) {
            const a = this.pickAttack();
            if (a) this.startAttack(a); else this.restTime += 0.25;
          }
          break;
        case 'stagger':
          this.staggerUpdate(dt);
          if (this.stateTime >= this.staggerTime) {
            if (typeof this.onStaggerEnd === 'function') this.onStaggerEnd();
            this.endAttack(0.3);
          }
          break;
        default: {
          const fn = this['atk_' + this.state];
          if (typeof fn === 'function') fn.call(this, dt, this.stateTime);
          else {
            G.reportError(new Error('boss ' + this.bossId + ': no handler atk_' + this.state + '()'), 'boss ' + this.bossId);
            this.endAttack();
          }
        }
      }
    }
    /** Default intro / idle: face the player and hold still (flyers hover in place). Override for flavour. */
    introUpdate(dt) { this.face(); this.idleMove(dt); }
    idleUpdate(dt) { this.face(); this.idleMove(dt); }
    idleMove(dt) {
      if (this.flying) { this.vx = approach(this.vx, 0, 900 * dt); this.vy = approach(this.vy, 0, 900 * dt); }
      else if (this.grounded) this.vx = 0;
    }
    staggerUpdate(dt) {
      if (this.flying) { this.vx = approach(this.vx, 0, 900 * dt); this.vy = approach(this.vy, 260, 900 * dt); }
      else if (this.grounded) this.vx = 0;
    }
    /** Horizontal distance to the player (attack ranges use this). */
    playerDist() { const p = this.player; return p ? Math.abs(this.dx(p)) : 0; }
    /** Weighted random among eligible attacks (phase, cooldown, when(), range; no immediate repeats). */
    pickAttack() {
      const dist = this.playerDist();
      const elig = [];
      for (const name in this.attacks) {
        const a = this.attacks[name];
        if (this.phase < a.phase || this.phase > a.maxPhase) continue;
        if (!this.ready('atk:' + name)) continue;
        if (typeof a.when === 'function') { let ok = false; try { ok = !!a.when.call(this, dist); } catch (err) { G.reportError(err, 'boss attack when ' + name); } if (!ok) continue; }
        elig.push(name);
      }
      if (!elig.length) return null;
      let pool = elig.filter((n) => { const r = this.attacks[n].range; return !r || (dist >= r[0] && dist <= r[1]); });
      if (!pool.length) pool = elig;                                   // nothing in range → any eligible
      const noRep = pool.filter((n) => n !== this.lastAttack || this.attacks[n].repeat);
      if (noRep.length) pool = noRep;
      let total = 0;
      const ws = pool.map((n) => { const w = this.attacks[n].weight; const v = Math.max(0, typeof w === 'function' ? +w.call(this, dist) || 0 : +w || 0); total += v; return v; });
      if (total <= 0) return pool[0];
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    }
    /** Start an attack state (its atk_<name>(dt, s) runs each step until endAttack()). */
    startAttack(name) {
      const a = this.attacks[name];
      this.attack = name;
      this.lastAttack = name;
      this.attackCount++;
      if (a && a.cooldown) this.cooldown('atk:' + name, a.cooldown);
      this.uninterruptible = !!(a && a.uninterruptible);
      this.setState(name);
      if (typeof this.onAttackStart === 'function') this.onAttackStart(name);
    }
    /** Finish the current attack → idle for `rest` s (default: cfg.rest × phase multiplier). */
    endAttack(rest) {
      this.attack = null;
      this.uninterruptible = false;
      this.setState('idle');
      const pr = this.cfg.phaseRest || [1];
      const mul = pr[Math.min(pr.length - 1, this.phase - 1)] || 1;
      const r = this.cfg.rest || [0.5, 0.8];
      this.restTime = rest != null ? rest : rnd(r[0], r[1]) * mul;
    }
    warnZone(o) { return G.warnZone(this.room, o); }
    /**
     * Mid-fight speech: shows G.Text.bosses[id][key] (e.g. 'phase2') via G.UI.dialogue. While it is open
     * this.speaking is true (hold still in your attack/transform state). Returns false (and calls onDone
     * at once) when there is no text, no UI or Boss.skipDialogue is set.
     */
    speak(key, onDone) {
      const tx = this.text, lines = tx && tx[key], UI = G.UI;
      const done = () => { this.speaking = false; if (typeof onDone === 'function') onDone(); };
      if (Boss.skipDialogue || !lines || !lines.length || !UI || typeof UI.dialogue !== 'function') { done(); return false; }
      this.speaking = true;
      try { UI.dialogue({ name: tx.name, lines, onDone: done }); } catch (err) { G.reportError(err, 'boss speak ' + key); done(); return false; }
      return true;
    }

    // ---------------------------------------------------------------- damage, phases, stagger
    onHit(hit) {
      const before = this.hp;
      const ok = super.onHit(hit);
      if (!ok || this.dying) return ok;
      const dmg = before - this.hp;
      if (dmg > 0) { this.checkPhase(); this.addStagger(dmg); }
      return ok;
    }
    checkPhase() {
      while (this.phase - 1 < this.phaseThresholds.length && this.hp <= this.maxHp * this.phaseThresholds[this.phase - 1]) {
        this.phase++;
        G.events.emit('bossPhase', { id: this.bossId, phase: this.phase, boss: this });
        this.onPhase(this.phase);
      }
    }
    /** Phase change feedback (override freely; e.g. startAttack('transform')). */
    onPhase(phase) {
      void phase;
      G.sfxAt('boss_roar', this.cx, { vol: 0.8 });
      if (G.game) { G.game.shake(8, 0.5); G.game.flash('rgba(255,255,255,0.35)', 0.15); }
    }
    addStagger(dmg) {
      const s = this.cfg.stagger;
      if (!s || !(s.damage > 0)) return;
      this.staggerDmg += dmg;
      if (this.staggerDmg >= s.damage && this.canStagger()) this.stagger();
    }
    canStagger() { return this.fightStarted && !this.uninterruptible && this.state !== 'intro' && this.state !== 'stagger'; }
    /** Interrupt everything and stun for cfg.stagger.time (or `time`). */
    stagger(time) {
      this.staggerDmg = 0;
      this.staggers++;
      if (this.attack && typeof this.onInterrupt === 'function') this.onInterrupt(this.attack);
      this.attack = null;
      this.uninterruptible = false;
      this.tele = null;
      this.staggerTime = time || (this.cfg.stagger && this.cfg.stagger.time) || 1.6;
      this.setState('stagger');
      if (!this.flying) this.vx = 0;
      G.sfxAt('boss_stagger', this.cx);
      if (G.game) G.game.shake(9, 0.35);
      if (G.fx) {
        G.fx.burst('smoke', this.cx, this.cy, { count: 10, color: this.colors.smoke, alpha: 0.5, size: 14 });
        G.fx.burst('spark', this.cx, this.cy, { count: 14, color: '#ffffff', speed: 520 });
      }
      G.events.emit('bossStagger', { id: this.bossId, boss: this });
      if (typeof this.onStagger === 'function') this.onStagger();
    }

    // ---------------------------------------------------------------- defeat
    die(hit) {
      if (this.dying) return;
      this.dying = true;
      this.hp = 0;
      this.hurtable = false;
      this.contactDamage = 0;
      this.tele = null;
      this.attack = null;
      this.uninterruptible = false;
      this.state = 'defeat';
      this.deathT = 0; this.flashT = 0.12; this.fade = 1;
      this.defeatStage = 'slowmo';
      this.stageT = 0;
      this.vx = 0;
      if (G.clearProjectiles) G.clearProjectiles(this.room);
      this.killMinions();
      if (G.game) { G.game.hitstop(0.2); G.game.flash('#ffffff', 0.3); G.game.shake(14, 0.7); }
      G.sfxAt('boss_hit', this.cx, { vol: 1.2, pitch: 0.7 });
      if (G.fx) G.fx.burst('spark', this.cx, this.cy, { count: 24, color: '#ffffff', speed: 700 });
      G.events.emit('bossDying', { id: this.bossId, boss: this });
      if (typeof this.onDefeatStart === 'function') this.onDefeatStart(hit);
    }
    /** Defeat timeline: slow-mo shudder → (defeat lines) → explode | yield | custom. */
    updateDeath(dt) {
      this.deathT += dt;
      this.stageT += dt;
      if (this._sealCard && (this._sealT += dt) >= SEAL_CARD_DELAY) this.showSealCard();
      if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
      this.settle(dt);
      switch (this.defeatStage) {
        case 'slowmo': {
          const dur = this.defeatStyle === 'yield' ? Math.min(0.5, this.cfg.slowmo) : this.cfg.slowmo;
          if (this.stageT < dur) {
            if (G.game) G.game.hitstop(DT); // freezes every other step → half speed
            if (this.defeatStyle !== 'yield' && G.fx && Math.floor(this.stageT / 0.12) !== Math.floor((this.stageT - dt) / 0.12)) {
              const x = this.x + Math.random() * this.w, y = this.y + Math.random() * this.h;
              G.fx.burst('smoke', x, y, { count: 3, color: this.colors.smoke, alpha: 0.5, size: 12 });
              G.fx.burst('spark', x, y, { count: 6, color: '#ffffff', speed: 420 });
              G.sfxAt('enemy_hit', x, { vol: 0.5, pitch: rnd(0.6, 0.8) });
            }
            for (const f of [0.35, 0.7]) if (this.stageT >= dur * f && this.stageT - dt < dur * f && G.game) G.game.flash('rgba(255,255,255,0.7)', 0.12);
          } else this.nextDefeatStage('speak');
          break;
        }
        case 'speak': {
          if (!this._spoke) {
            this._spoke = true;
            const tx = this.text, lines = tx && tx.defeat, UI = G.UI;
            if (this.cfg.defeatDialogue !== false && !Boss.skipDialogue && lines && lines.length && UI && typeof UI.dialogue === 'function') {
              this._dialogueOpen = true;
              if (this.defeatStyle === 'yield') this.yielded = true;
              try { UI.dialogue({ name: tx.name, lines, onDone: () => { this._dialogueOpen = false; } }); } catch (err) { G.reportError(err, 'boss defeat dialogue'); this._dialogueOpen = false; }
            }
          }
          if (!this._dialogueOpen) this.nextDefeatStage(this.defeatStyle === 'yield' ? 'yield' : this.defeatStyle === 'custom' ? 'custom' : 'explode');
          break;
        }
        case 'explode':
          if (!this.exploded) this.explode();
          if (this.stageT > this.cfg.puddleTime) this.fade = Math.max(0, 1 - (this.stageT - this.cfg.puddleTime) / 0.8);
          if (this.stageT > this.cfg.puddleTime + 0.8) this.remove();
          break;
        case 'yield':
          this.yielded = true;
          if (this.stageT >= 0.9 && !this._finished) this.vanish();
          break;
        case 'custom':
          if (typeof this.onDefeatSequence === 'function') this.onDefeatSequence(dt, this.stageT);
          else { this.explode(); this.defeatStage = 'explode'; }
          break;
        default: break;
      }
    }
    nextDefeatStage(name) { this.defeatStage = name; this.stageT = 0; }
    /** Keep the body on the floor during the defeat (flyers sink slowly). */
    settle(dt) {
      if (!this.room || this.exploded) return;
      if (this.flying) this.vy = Math.min(this.vy + 900 * dt, 360);
      else this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);
      this.vx = approach(this.vx, 0, 1200 * dt);
      const r = G.Physics.move(this, this.room, this.vx * dt, this.vy * dt);
      if (r.hitY) this.vy = 0;
    }
    /** Big burst: particles, flash, 'boss_die', then finishDefeat(). */
    explode() {
      if (this.exploded) return;
      this.exploded = true;
      const cx = this.cx, cy = this.cy;
      if (G.fx) {
        G.fx.burst('flash', cx, cy, { r: Math.max(this.w, this.h) * 2.2, color: '#ffffff', life: 0.4 });
        G.fx.burst('ring', cx, cy, { r: 320, color: '#ffffff', width: 6, life: 0.6 });
        G.fx.burst('ring', cx, cy, { r: 200, color: this.colors.hit, width: 4, life: 0.45 });
        G.fx.burst('wax', cx, cy, { count: 36, color: this.colors.body, speed: 640, spread: TAU });
        G.fx.burst('wax', cx, cy, { count: 16, color: this.colors.dark, speed: 480, spread: TAU });
        G.fx.burst('smoke', cx, cy, { count: 22, color: this.colors.smoke, alpha: 0.55, size: 20, speed: 160 });
        G.fx.burst('spark', cx, cy, { count: 30, color: '#ffffff', speed: 780, spread: TAU });
        G.fx.burst('ember', cx, cy, { count: 16, color: '#ffd8a0', speed: 160 });
      }
      if (G.game) { G.game.flash('#ffffff', 0.6); G.game.shake(18, 0.8); }
      G.sfxAt('boss_die', cx, { vol: 1 });
      this.finishDefeat();
    }
    /** Yield ending (Sable): a puff of smoke, the boss leaves, defeat is recorded. */
    vanish() {
      if (G.fx) {
        G.fx.burst('smoke', this.cx, this.cy, { count: 24, color: this.colors.smoke, alpha: 0.6, size: 18, speed: 120 });
        G.fx.burst('ember', this.cx, this.cy, { count: 10, color: '#ff8a6a' });
      }
      G.sfxAt('dash', this.cx, { vol: 0.8, pitch: 0.7 });
      this.finishDefeat();
      this.remove();
    }
    /** The Warden Seal this boss grants (cfg.seal, else G.Items.sealBoss), or null. */
    sealId() {
      const c = this.cfg.seal;
      if (c === false) return null;
      if (typeof c === 'string' && c) return c;
      const map = G.Items && G.Items.sealBoss;
      if (map) { for (const k in map) if (map[k] === this.bossId) return k; return null; }
      return SEAL_FALLBACK[this.bossId] || null;
    }
    /** Seal reward: added to progress at once (saved together with the victory, so a quit can never lose it);
     *  its card is shown SEAL_CARD_DELAY s later, or as soon as the boss leaves the room. */
    grantSeal() {
      const id = this.sealId();
      const pr = G.game && G.game.progress;
      if (!id || !pr || (pr.seals || []).indexOf(id) >= 0 || typeof G.game.giveItem !== 'function') return;
      G.game.giveItem('seal:' + id, { silent: true });
      this._sealCard = id;
      this._sealT = 0;
    }
    showSealCard() {
      const id = this._sealCard;
      if (!id) return;
      this._sealCard = null;
      if (G.UI && typeof G.UI.itemGet === 'function') { try { G.UI.itemGet('seal:' + id); } catch (err) { G.reportError(err, 'UI.itemGet seal'); } }
    }
    onRemoved() { this.showSealCard(); }
    onRoomExit() { this.showSealCard(); }
    /** Records the victory exactly once: seal, G.game.defeatBoss(id), reward cinders, onDefeated(), arena end. */
    finishDefeat() {
      if (this._finished) return;
      this._finished = true;
      this.grantSeal();
      if (G.game && typeof G.game.defeatBoss === 'function') G.game.defeatBoss(this.bossId);
      else G.events.emit('bossDefeated', { id: this.bossId });
      // One musical cue only: when a seal card follows (SEAL_CARD_DELAY s later), its 'seal' stinger is the victory
      // cue; playing cfg.stinger too would overlap two unsynchronised stingers (QA audio: boss_defeated + seal clash).
      const sealCue = !!this._sealCard && !!(G.UI && typeof G.UI.itemGet === 'function');
      if (this.cfg.stinger && !sealCue && G.Audio && typeof G.Audio.stinger === 'function') { try { G.Audio.stinger(this.cfg.stinger); } catch (err) { G.reportError(err, 'boss stinger'); } }
      if (this.reward > 0 && typeof G.dropCinders === 'function' && this.room) G.dropCinders(this.room, this.cx, Math.min(this.cy, this.y + this.h - 30), this.reward);
      if (typeof this.onDefeated === 'function') { try { this.onDefeated(); } catch (err) { G.reportError(err, 'boss onDefeated ' + this.bossId); } }
      if (this.arena && typeof this.arena.onBossDefeated === 'function') this.arena.onBossDefeated(this);
      else if (G.game && typeof G.game.endBossMusic === 'function') G.game.endBossMusic();
    }

    // ---------------------------------------------------------------- drawing
    drawDeath(ctx, t) {
      ctx.save();
      ctx.globalAlpha *= this.fade;
      if (this.exploded) {
        const fx = this.cx, fy = this.y + this.h;
        this.drawPuddle(ctx, fx, fy, Math.min(1, this.stageT / 0.5));
        const ch = G.Art && G.Art.char;
        if (ch && ch.pallSmoke) ch.pallSmoke(ctx, fx, fy - 6, t, { count: 6, height: 120, spread: this.w * 0.3, size: 10, alpha: 0.3 * this.fade, color: this.colors.smoke, seed: this.seed });
      } else if (this.defeatStyle === 'yield' || this.defeatStyle === 'custom') {
        this.drawBody(ctx, t);
      } else {
        const k = Math.min(1, this.deathT / Math.max(0.1, this.cfg.slowmo));
        ctx.translate(Math.sin(t * 80) * (2 + 4 * k), Math.cos(t * 67) * 1.5 * k);
        const flicker = Math.floor(t * 14) % 2 === 0;
        if (flicker || this.flashT > 0) this.drawFlashed(ctx, t, 0.4 + 0.6 * k); else this.drawBody(ctx, t);
      }
      ctx.restore();
    }
  }
  Boss.MUSIC = BOSS_MUSIC;
  Boss.REWARD = BOSS_REWARD;
  Boss.DEFAULTS = BOSS_DEFAULTS;
  Boss.skipDialogue = false;   // tests may set true
  /** Register a boss class as entity type 'boss_<id>'. */
  Boss.register = function (id, cls) { G.registerEntity('boss_' + id, cls); };
  G.Boss = Boss;

  // =====================================================================================================
  // Arena controller (entity 'arena'): props {boss, bx, by, trigger:[c1,r1,c2,r2], requires?, zone?:[c1,r1,c2,r2]}
  // =====================================================================================================
  const BEAT = 0.6;
  class Arena extends G.Entity {
    constructor(props) {
      super(props);
      this.type = 'arena';
      this.anchor = 'tile';
      this.w = TILE; this.h = TILE;
      this.cull = false;
      this.z = -20;
      const p = this.props;
      this.bossId = p.boss || null;
      this.bx = p.bx; this.by = p.by;
      this.requires = p.requires || '';
      this.trigger = Array.isArray(p.trigger) && p.trigger.length === 4 ? tileRect(p.trigger) : null;
      this.zone = Array.isArray(p.zone) && p.zone.length === 4 ? tileRect(p.zone) : null;
      this.state = 'wait';     // wait → beat → fight → done   ('inert' = misconfigured)
      this.active = false;     // G.game.isSafeRoom() reads this
      this.boss = null;
      this.stateT = 0;
    }
    init() {
      const room = this.room;
      if (!this.bossId) { G.reportError(new Error('arena in ' + (room && room.id) + ' has no boss id'), 'arena'); this.state = 'inert'; return; }
      if (this.bx == null) this.bx = this.props.tx != null ? +this.props.tx : Math.floor(room.cols / 2);
      if (this.by == null) this.by = this.props.ty != null ? +this.props.ty : room.rows - 3;
      if (!this.trigger) this.trigger = { x: (this.bx - 8) * TILE, y: 0, w: 17 * TILE, h: room.heightPx };
      if (G.game && G.game.bossDefeated(this.bossId)) this.state = 'done';
    }
    get defeated() { return !!(G.game && G.game.bossDefeated(this.bossId)); }
    playerInTrigger() {
      const p = this.player;
      if (!p || p.dead) return false;
      const x = p.x + p.w / 2, y = p.y + p.h / 2, r = this.trigger;
      return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    }
    update(dt) {
      this.stateT += dt;
      switch (this.state) {
        case 'wait':
          if (!G.game || G.game.mode !== 'play' || this.stateT < 0) return;
          if (this.requires && !G.game.evalCondition(this.requires)) return;
          if (this.playerInTrigger()) this.start();
          break;
        case 'beat':
          if (this.stateT >= BEAT) this.spawnBoss();
          break;
        case 'fight':
          if (this.defeated) { this.end(true); break; }
          if (!this.boss || (this.boss.dead && !this.boss._finished)) {
            G.reportError(new Error('arena ' + this.bossId + ': the boss vanished before being defeated — arena reset'), 'arena');
            this.end(false);
          }
          break;
        default: break;
      }
    }
    setState(s) { this.state = s; this.stateT = 0; }
    /** Begin the encounter: event, gates, beat, then spawn. */
    start() {
      if (this.state !== 'wait') return;
      this.setState('beat');
      this.active = true;
      G.events.emit('arenaStart', { room: this.room, boss: this.bossId, arena: this });
      this.setGates(false);
      if (this.zone && G.camera && G.camera.setZone) G.camera.setZone(this.zone);
      if (G.game) G.game.shake(3, 0.4);
    }
    spawnBoss() {
      let type = 'boss_' + this.bossId;
      if (!G.Entity.isRegistered(type)) {
        G.reportError(new Error('arena: boss type "' + type + '" is not registered — spawning the placeholder test boss'), 'arena');
        type = 'boss_test';
      }
      const b = this.room.spawn({ type, boss: this.bossId, tx: this.bx, ty: this.by, arena: this });
      if (!b) { this.end(false); return; }
      this.setBoss(b);
      this.setState('fight');
      if (typeof b.beginFight === 'function') b.beginFight();
      else {
        if (G.game) G.game.startBossMusic(Boss.MUSIC[this.bossId] || 'boss');
        if (G.UI && typeof G.UI.bossCard === 'function') G.UI.bossCard(this.bossId);
        G.events.emit('bossStart', { id: this.bossId });
      }
    }
    /** Replace the tracked boss entity (multi-body / transforming bosses). */
    setBoss(b) { this.boss = b; if (b) b.arena = this; }
    onBossDefeated() { if (this.state === 'fight' || this.state === 'beat') this.end(true); }
    /** ok = victory; false = failure reset (gates reopen, can retrigger). */
    end(ok) {
      this.active = false;
      this.setState(ok ? 'done' : 'wait');
      if (!ok) { this.stateT = -2; if (this.boss && !this.boss.dead) this.boss.remove(); }
      this.boss = ok ? this.boss : null;
      G.events.emit('arenaEnd', { room: this.room, boss: this.bossId, arena: this, victory: !!ok });
      this.setGates(true);
      if (G.game && typeof G.game.endBossMusic === 'function') G.game.endBossMusic();
      if (this.zone && G.camera && G.camera.clearZone) G.camera.clearZone();
    }
    gates() { return this.room ? this.room.findType('arena_gate') : []; }
    setGates(open) {
      for (const g of this.gates()) {
        const fn = open ? g.open : g.close;
        if (typeof fn === 'function') { try { fn.call(g); } catch (err) { G.reportError(err, 'arena_gate.' + (open ? 'open' : 'close')); } }
      }
    }
    draw(ctx) {
      if (!(G.debug && G.debug.overlayOn) || !this.trigger) return;
      ctx.save();
      ctx.strokeStyle = this.active ? 'rgba(255,90,90,0.9)' : 'rgba(255,200,80,0.7)';
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(this.trigger.x + 0.5, this.trigger.y + 0.5, this.trigger.w - 1, this.trigger.h - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,90,90,0.8)';
      ctx.fillRect((this.bx + 0.5) * TILE - 4, (this.by + 1) * TILE - 8, 8, 8);
      ctx.restore();
    }
  }
  function tileRect(a) {
    const c1 = Math.min(a[0], a[2]), c2 = Math.max(a[0], a[2]), r1 = Math.min(a[1], a[3]), r2 = Math.max(a[1], a[3]);
    return { x: c1 * TILE, y: r1 * TILE, w: (c2 - c1 + 1) * TILE, h: (r2 - r1 + 1) * TILE };
  }
  G.registerEntity('arena', Arena);
  G.Arena = Arena;

  // =====================================================================================================
  // boss_test — placeholder / reference boss: "the Hollow Dummy", a hulking Snuffed of grey wax.
  // Attacks: lunge (telegraphed charge), leap (arc onto the player → shockwaves both ways),
  // volley (phase ≥ 2: three aimed orbs), drip (phase 3: warned columns of falling globs).
  // =====================================================================================================
  class TestBoss extends Boss {
    constructor(props) {
      super(props, {
        hp: 150, w: 84, h: 118,
        phases: [0.6, 0.3],
        stagger: { damage: 45, time: 1.4 },
        colors: { body: '#8f99a8', dark: '#4a515e', hit: '#d6dce6', smoke: '#7e879a', tele: '#ffe0a0' },
        attacks: {
          lunge: { weight: 3, range: [140, 2000] },
          leap: { weight: 2, range: [0, 900], cooldown: 1.5 },
          volley: { weight: 2, phase: 2, range: [200, 2000] },
          drip: { weight: 2, phase: 3, cooldown: 4 },
        },
      });
      this.squash = 1;
    }
    atk_lunge(dt, s) {
      if (this.once('wind')) { this.face(); this.windup = this.telegraph(0.55); }
      if (s < this.windup) { this.vx = 0; this.squash = 1 - 0.1 * Math.min(1, s / this.windup); return; }
      this.squash = 1.04;
      const blocked = this.charge(560, { ledges: true });
      if (this.every(0.07) && G.fx) G.fx.burst('dust', this.cx - this.facing * this.w * 0.4, this.y + this.h, { count: 2, color: '#9a9488' });
      if (blocked || s > this.windup + 1.1) {
        if (blocked && this.wallHit) { if (G.game) G.game.shake(6, 0.25); G.sfxAt('hardland', this.cx); }
        this.vx = 0; this.squash = 1;
        this.endAttack(0.6);
      }
    }
    atk_leap(dt, s) {
      if (this.once('crouch')) { this.face(); this.windup = this.telegraph(0.45, { shake: 0.8 }); }
      if (s < this.windup) { this.vx = 0; this.squash = 1 - 0.18 * Math.min(1, s / this.windup); return; }
      const p = this.player;
      if (this.once('jump')) {
        const tx = p ? p.x + p.w / 2 : this.cx + this.facing * 200;
        this.leapTo(Math.max(this.w, Math.min(this.room.widthPx - this.w, tx)), this.y + this.h, 170, { maxVx: 700 });
        G.sfxAt('jump', this.cx, { pitch: 0.6 });
        return;
      }
      this.squash = this.grounded ? 1 : 1.08;
      if (this.grounded && s > this.windup + 0.1 && this.once('land')) {
        this.vx = 0; this.squash = 0.82;
        if (G.game) G.game.shake(10, 0.35);
        G.sfxAt('shockwave', this.cx);
        if (G.fx) { G.fx.burst('dust', this.cx, this.y + this.h, { count: 14, color: '#a49c8e', speed: 260 }); G.fx.burst('ring', this.cx, this.y + this.h, { r: 140, color: '#ffe0b0' }); }
        for (const dir of [-1, 1]) G.spawnProjectile(this.room, 'wave', { x: this.cx + dir * (this.w * 0.5 + 14), y: this.y + this.h, dir, speed: 430, owner: this });
        this.stateData.landAt = s;
      }
      if (this.stateData.landAt != null) {
        this.squash = Math.min(1, this.squash + dt * 1.2);
        if (s - this.stateData.landAt > 0.55) this.endAttack();
      } else if (s > this.windup + 2.5) this.endAttack(); // safety: never stuck airborne
    }
    atk_volley(dt, s) {
      if (this.once('wind')) { this.face(); this.windup = this.telegraph(0.5, { color: '#ffb070' }); }
      this.vx = 0;
      for (let i = 0; i < 3; i++) {
        if (this.at(this.windup + i * 0.16)) this.shootAt('orb', this.player, { speed: 300, spread: (i - 1) * 0.22, color: '#ffb070', x: this.cx + this.facing * 20, y: this.y + 30 });
      }
      if (s > this.windup + 0.9) this.endAttack();
    }
    atk_drip(dt, s) {
      this.vx = 0;
      if (this.once('roar')) {
        this.telegraph(0.4, { glint: true, shake: 2.5 });
        const p = this.player;
        const xs = [];
        const px = p ? p.x + p.w / 2 : this.cx;
        for (let i = -1; i <= 1; i++) xs.push(Math.max(30, Math.min(this.room.widthPx - 30, px + i * 170 + rnd(-30, 30))));
        for (const x of xs) {
          this.warnZone({ x: x - 26, y: 0, w: 52, h: this.y + this.h, dur: 0.85, style: 'column', color: '#ffd09a',
            onDone: (z) => G.spawnProjectile(z.room, 'glob', { x: z.cx, y: 10, vx: 0, vy: 200, owner: this, color: '#d9cdb4' }) });
        }
      }
      if (s > 1.6) this.endAttack();
    }
    onStagger() { this.squash = 0.72; }
    onStaggerEnd() { this.squash = 1; }
    drawBounds() { return { x: this.x - 70, y: this.y - 150, w: this.w + 140, h: this.h + 175 }; }
    drawBody(ctx, t) {
      const fx = this.cx, fy = this.y + this.h;
      const st = this.state === 'stagger' || this.yielded;
      const sq = st ? 0.74 : this.squash || 1;
      const ch = G.Art && G.Art.char;
      const breathe = 1 + Math.sin(t * 2.2 + this.seed) * 0.015;
      if (!ch) {
        ctx.fillStyle = '#141218'; ctx.fillRect(this.x - 2, fy - this.h * sq - 2, this.w + 4, this.h * sq + 2);
        ctx.fillStyle = this.colors.body; ctx.fillRect(this.x, fy - this.h * sq, this.w, this.h * sq);
        return;
      }
      ch.shadow(ctx, fx, fy, this.w * 0.62, 0.55);
      const lean = st ? this.facing * 10 : (this.telegraphing ? -this.facing * 6 : this.vx * 0.008);
      // stubby arms behind the body
      for (const side of [-1, 1]) {
        const ax = fx + side * this.w * 0.48, ay = fy - this.h * sq * 0.55;
        const swing = Math.sin(t * 3 + side) * 3 + (this.telegraphing ? -8 : 0);
        const arm = new Path2D();
        arm.ellipse(ax + side * 6, ay + 22 + swing * side * 0.3, 15, 30, side * (0.35 + (st ? 0.3 : 0)), 0, TAU);
        ch.shape(ctx, arm, { fill: '#7b8493', box: [ax - 20, ay - 10, ax + 26, ay + 56], light: -this.facing, shade: 0.45, lw: 2.5 });
      }
      const b = ch.waxBody(ctx, fx, fy, this.w * 1.08, this.h * breathe, { variant: 'slumped', color: this.colors.body, shade: '#20242c', hi: '#e8edf4', drips: 5, seed: 11, squash: sq, lean, light: -this.facing, rim: '#d0d8e4', lw: 2.5 });
      // cracks
      ctx.save();
      ctx.strokeStyle = 'rgba(20,18,24,0.55)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.cx - b.w * 0.2, b.top + b.h * 0.45); ctx.lineTo(b.cx - b.w * 0.12, b.top + b.h * 0.58); ctx.lineTo(b.cx - b.w * 0.22, b.top + b.h * 0.7);
      ctx.moveTo(b.cx + b.w * 0.18, b.top + b.h * 0.62); ctx.lineTo(b.cx + b.w * 0.26, b.top + b.h * 0.74);
      ctx.stroke();
      ctx.restore();
      const eyeGlow = this.telegraphing ? '#ffe9b0' : '#f4f8ff';
      ctx.fillStyle = '#16141c';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(b.cx + this.facing * b.w * 0.07 + side * 12, b.top + b.h * 0.3, 7, st ? 3 : 9, 0, 0, TAU); ctx.fill(); }
      ch.eyes(ctx, b.cx + this.facing * b.w * 0.07, b.top + b.h * 0.3, { kind: 'pinprick', size: 24, gap: 24, color: eyeGlow, blink: st ? 0.7 : ch.blinkAt(t, 5) });
      const tip = ch.wick(ctx, b.cx - this.facing * 2, b.top + 4, { len: 14, bend: -this.facing * 4, width: 3.2, curl: -this.facing * 3 });
      ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 6, height: 90, spread: 16, size: 8, alpha: 0.35, color: this.colors.smoke, seed: 3 });
    }
  }
  Boss.register('test', TestBoss);
  G.TestBoss = TestBoss;
})();
