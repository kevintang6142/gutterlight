// src/engine/combat.js — G.Combat: attacks (entity hits, breakable tiles, pogo/wall detection),
// player damage, hazards (spikes/lava/water → damage + respawn at lastSafe), contact damage.
(function () {
  'use strict';
  const G = globalThis.G;
  const T = G.T;
  const TILE = G.CONST.TILE;

  const B_HITS = 3; // breakable walls shatter on the third hit
  const attackRecords = new Map(); // attack id → {t, targets:Set, comps:Set}
  let autoId = 0, purgeCounter = 0;

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const gameTime = () => (G.game ? G.game.t : 0);

  function record(id) {
    let rec = attackRecords.get(id);
    if (!rec) { rec = { t: 0, targets: new Set(), comps: new Set() }; attackRecords.set(id, rec); }
    rec.t = gameTime();
    if (++purgeCounter > 120) {
      purgeCounter = 0;
      const now = gameTime();
      for (const [k, r] of attackRecords) if (now - r.t > 3) attackRecords.delete(k);
    }
    return rec;
  }

  // opts: {owner, team, rect:{x,y,w,h}, damage, kind, dir:{x,y}, pogo, id}
  // Returns [{target, hit}] for connected hits, with extra flags on the array:
  //   .pogo (struck something pogo-able: enemy/spikes/pogoable entity — only when opts.pogo)
  //   .wall (rect touches solid terrain), .spikes, .breakable (hit a B/D component), .broke (one shattered)
  function attack(opts) {
    const res = [];
    res.pogo = false; res.wall = false; res.spikes = false; res.breakable = false; res.broke = false;
    if (!opts || !opts.rect) return res;
    const owner = opts.owner || null;
    const room = (owner && owner.room) || (G.game && G.game.room);
    if (!room) return res;
    const team = opts.team || (owner && owner.team) || 'enemy';
    const kind = opts.kind || 'nail';
    const rect = opts.rect;
    const id = opts.id != null ? opts.id : 'auto' + (++autoId);
    const rec = record(id);
    const mkHit = () => ({ damage: opts.damage || 0, kind, dir: opts.dir || { x: 0, y: 0 }, source: owner, pogo: !!opts.pogo, team, attackId: id });

    const list = room.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || !e.hurtable || e === owner || e.team === team) continue;
      if (e.team === 'neutral' && team !== 'player') continue; // geodes/levers only react to the player
      if (rec.targets.has(e)) continue;
      let hr = e;
      try { hr = e.hurtRect ? e.hurtRect() : e; } catch (err) { G.reportError(err, 'hurtRect ' + e.type); }
      if (!hr || !overlap(rect, hr)) continue;
      rec.targets.add(e);
      const hit = mkHit();
      const hp0 = e.hp;
      let connected = false;
      try { connected = !!e.onHit(hit); } catch (err) { G.reportError(err, 'onHit ' + e.type + (e.kind ? ':' + e.kind : '')); }
      if (!connected) continue;
      // A blocked hit (armour/shield: modifyDamage → 0, the target's hp unchanged) still connects for recoil/pogo and
      // the clink, but pays no Ember (QA balance: shield swings refilled the well). `hit.deflected` may also be set.
      if (hit.deflected === undefined) hit.deflected = typeof hp0 === 'number' && e.hp === hp0;
      res.push({ target: e, hit });
      if (opts.pogo && (e.team === 'enemy' ? e.pogoable !== false : !!e.pogoable)) res.pogo = true;
      if (team === 'player' && kind === 'nail' && e.team === 'enemy' && !e.noEmber && !hit.deflected && G.game && G.game.addEmber) {
        G.game.addEmber(11 + (G.game.isEquipped('ember_thirst') ? 6 : 0));
      }
    }

    if (team !== 'player') {
      const p = G.game && G.game.player;
      if (p && !rec.targets.has(p) && overlap(rect, p)) {
        rec.targets.add(p);
        if (G.game && G.game.noteThreat) G.game.noteThreat();   // attacked (even through i-frames): not safe
        const hit = mkHit();
        if (hurtPlayer(opts.damage || 1, owner || { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })) res.push({ target: p, hit });
      }
      return res;
    }

    // terrain reactions for player attacks
    const c0 = Math.floor(rect.x / TILE), c1 = Math.floor((rect.x + rect.w - 0.01) / TILE);
    const r0 = Math.floor(rect.y / TILE), r1 = Math.floor((rect.y + rect.h - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const code = room.tileAt(c, r);
        if (code === T.SPIKES) { res.spikes = true; if (opts.pogo) res.pogo = true; }
        else if (code === T.SOLID || code === T.GLAZED || code === T.DIVEFLOOR) {
          if (room.inBounds(c, r)) res.wall = true;
        }
      }
    }
    const br = hitBreakables(room, rect, kind, rec);
    if (br.hit) { res.breakable = true; res.wall = true; }
    if (br.broke) res.broke = true;
    return res;
  }

  // One hit per attack per component. nail/spell/plunge/trail damage 'B'; only plunge breaks 'D'.
  function hitBreakables(room, rect, kind, rec) {
    const out = { hit: 0, broke: 0 };
    if (!room.components || !room.components.length) return out;
    const c0 = Math.floor(rect.x / TILE), c1 = Math.floor((rect.x + rect.w - 0.01) / TILE);
    const r0 = Math.floor(rect.y / TILE), r1 = Math.floor((rect.y + rect.h - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const comp = room.componentAt(c, r);
        if (!comp || comp.broken) continue;
        if (rec && rec.comps.has(comp.id)) continue;
        if (comp.code === T.DIVEFLOOR && kind !== 'plunge') continue;
        if (comp.code === T.BREAKABLE && kind === 'enemy') continue;
        if (rec) rec.comps.add(comp.id);
        out.hit++;
        comp.hits++;
        const breaks = comp.code === T.DIVEFLOOR || comp.hits >= B_HITS;
        if (breaks) { if (breakComponent(room, comp, kind)) out.broke++; }
        else crackFeedback(room, comp, c, r);
      }
    }
    return out;
  }

  function regionColor(room) {
    try { if (G.Art && G.Art.palette) { const p = G.Art.palette(room.regionId); if (p && p.edge) return p.edge; } } catch (e) { /* ignore */ }
    return (room.region && room.region.mapColor) || '#a09080';
  }

  function crackFeedback(room, comp, c, r) {
    const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
    if (G.fx) {
      G.fx.burst('dust', x, y, { count: 6, color: regionColor(room) });
      G.fx.burst('shard', x, y, { count: 3, color: regionColor(room) });
    }
    G.sfxAt('slash_wall', x, { vol: 0.8, pitch: 0.85 + comp.hits * 0.08, y });
    if (G.game) G.game.shake(3, 0.12);
    G.events.emit('tilesHit', { room, comp });
  }

  // Shatters a component: tiles → EMPTY, persistent flag, art refresh, effects. Returns true if it broke.
  function breakComponent(room, comp, kind) {
    if (!comp || comp.broken) return false;
    if (room._clearComponent) room._clearComponent(comp);
    else { comp.broken = true; for (const [c, r] of comp.tiles) room.setTile(c, r, T.EMPTY); }
    if (G.game && G.game.setFlag) G.game.setFlag('broken:' + comp.id, true);
    if (G.Art && typeof G.Art.onTilesChanged === 'function') {
      try { G.Art.onTilesChanged(room, comp.c0, comp.r0, comp.c1, comp.r1); } catch (err) { G.reportError(err, 'Art.onTilesChanged'); }
    }
    if (G.Render && G.Render.onTilesChanged) G.Render.onTilesChanged(room);
    const col = regionColor(room);
    if (G.fx) {
      for (const [c, r] of comp.tiles) {
        const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
        G.fx.burst('shard', x, y, { count: 4, color: col, speed: 320 });
        G.fx.burst('dust', x, y, { count: 4, color: col });
      }
    }
    const cx = (comp.c0 + comp.c1 + 1) * 0.5 * TILE;
    G.sfxAt('break_wall', cx, { vol: 1 });
    if (G.game) { G.game.shake(kind === 'plunge' ? 10 : 7, 0.25); }
    G.events.emit('tilesBroken', { room, comp, kind });
    return true;
  }

  function breakTilesInRect(room, rect, kind, attackId) {
    room = room || (G.game && G.game.room);
    if (!room || !rect) return { hit: 0, broke: 0 };
    return hitBreakables(room, rect, kind || 'nail', attackId != null ? record(attackId) : null);
  }

  // ---- player damage ----
  function hurtPlayer(amount, source) {
    const g = G.game;
    const p = g && g.player;
    if (!p || g.mode !== 'play' || g.god) return false;
    if (typeof p.hurt !== 'function') return false;
    let ok = false;
    try { ok = !!p.hurt(amount == null ? 1 : amount, source || null); } catch (err) { G.reportError(err, 'player.hurt'); }
    if (ok) G.events.emit('playerHurt', { amount: amount == null ? 1 : amount, source: source || null });
    return ok;
  }

  // Spikes/lava/water: 1 damage (unless invulnerable), fade out, back to motor.lastSafe, fade in.
  let hazardBusy = false;
  function hazardPlayer(kind) {
    const g = G.game;
    const p = g && g.player;
    if (!p || hazardBusy || g.mode !== 'play') return false;
    hazardBusy = true;
    const m = p.motor;
    const x = p.x + p.w / 2, y = p.y + p.h / 2;
    G.sfxAt('hazard', x);
    if (G.fx) {
      if (kind === 'water') G.fx.burst('splash', x, y + p.h * 0.3, { count: 14, color: '#9fd8ff' });
      else if (kind === 'lava') G.fx.burst('splash', x, y + p.h * 0.3, { count: 14, color: '#ff8a3a' });
      G.fx.burst('smoke', x, y, { count: 6 });
    }
    if (!g.god && !(p.invuln > 0) && typeof p.hurt === 'function') {
      try { p.hurt(1, { hazard: kind, x, y }); } catch (err) { G.reportError(err, 'player.hurt(hazard)'); }
      G.events.emit('playerHurt', { amount: 1, source: { hazard: kind } });
    }
    if (g.mode !== 'play') { hazardBusy = false; return true; } // died → death flow takes over
    g.lockPlayer('hazard');
    g._sysFade(1, 0.22, () => {
      if (p === g.player && m) {
        const ls = m.lastSafe || { x: m.x, y: m.y };
        if (p.placeAt) p.placeAt(ls.x, ls.y); else { m.x = ls.x; m.y = ls.y; }
        m.hazard = null;
        if (G.camera) G.camera.snap();
      }
      g._sysFade(0, 0.3, () => { g.unlockPlayer('hazard'); hazardBusy = false; });
    });
    return true;
  }
  function resetHazard() { hazardBusy = false; }

  // Enemies (team 'enemy', contactDamage > 0) hurt the player on overlap. Called by the engine each step.
  function checkContact(room, player) {
    if (!room || !player || player.dead) return;
    const list = room.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || !(e.contactDamage > 0) || e.team === 'player') continue;
      let r = e;
      try { r = e.contactRect ? e.contactRect() : (e.hurtRect ? e.hurtRect() : e); } catch (err) { G.reportError(err, 'contactRect ' + e.type); continue; }
      if (r && overlap(r, player)) {
        if (G.game && G.game.noteThreat) G.game.noteThreat();
        if (hurtPlayer(e.contactDamage, e)) return;
      }
    }
  }

  G.Combat = {
    B_HITS,
    attack, hurtPlayer, hazardPlayer, resetHazard, breakTilesInRect, breakComponent, checkContact,
    get hazardActive() { return hazardBusy; },
  };
})();
