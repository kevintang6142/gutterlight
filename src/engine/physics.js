// src/engine/physics.js — G.Physics: tile/AABB collision, swept moves (no tunneling), ground/wall/liquid queries.
// Node-loadable: pure logic over a room object ({cols, rows, tiles, tileAt?, solids?}).
(function () {
  'use strict';
  const G = globalThis.G;
  const T = G.T;
  const TILE = G.CONST.TILE;
  const SKIN = 0.01; // touching surfaces do not count as overlapping

  // ---- tiles ----
  function isSolidTile(code) {
    return code === T.SOLID || code === T.GLAZED || code === T.BREAKABLE || code === T.DIVEFLOOR;
  }
  const isLiquidTile = (code) => code === T.WATER || code === T.LAVA;
  const isHazardTile = (code) => code === T.SPIKES || code === T.LAVA || code === T.WATER;

  // Generic tile lookup for plain room objects (G.Room / TileRoom provide a faster own tileAt).
  // Outside the room is SOLID, except across openings (boundary tile not #/X) where it is EMPTY.
  function rawTileAt(room, c, r) {
    const cols = room.cols, rows = room.rows;
    if (c >= 0 && r >= 0 && c < cols && r < rows) return room.tiles[r * cols + c];
    let bc, br;
    if (c < 0 || c >= cols) {
      if (r < 0 || r >= rows) return T.SOLID; // diagonal: corners are never openings
      bc = c < 0 ? 0 : cols - 1; br = r;
    } else {
      bc = c; br = r < 0 ? 0 : rows - 1;
    }
    const b = room.tiles[br * cols + bc];
    return (b === T.SOLID || b === T.GLAZED) ? T.SOLID : T.EMPTY;
  }
  function tileAt(room, tx, ty) {
    return room.tileAt ? room.tileAt(tx, ty) : rawTileAt(room, tx, ty);
  }

  // Is the platform tile at row r ignored by this body (drop-through)?
  // body.dropThrough: true = ignore all platforms; number = ignore platforms whose top y <= that value.
  function platformIgnored(body, r) {
    const d = body.dropThrough;
    if (!d) return false;
    if (d === true) return true;
    return r * TILE <= d + 1;
  }

  // ---- swept axis moves: return the allowed displacement ----
  function sweepX(body, room, dx) {
    if (!dx) return 0;
    const top = body.y + SKIN, bot = body.y + body.h - SKIN;
    const r0 = Math.floor(top / TILE), r1 = Math.floor(bot / TILE);
    let allowed = dx;
    if (dx > 0) {
      const right = body.x + body.w;
      const cS = Math.ceil((right - SKIN) / TILE), cE = Math.floor((right + dx - SKIN) / TILE);
      outer: for (let c = cS; c <= cE; c++) {
        for (let r = r0; r <= r1; r++) {
          if (isSolidTile(tileAt(room, c, r))) { allowed = Math.min(allowed, Math.max(0, c * TILE - right)); break outer; }
        }
      }
      const sol = room.solids;
      if (sol && !body.ignoreSolids) {
        for (let i = 0; i < sol.length; i++) {
          const s = sol[i];
          if (s.owner === body || s.oneWay) continue;
          if (s.y < bot && s.y + s.h > top && s.x >= right - SKIN && s.x < right + allowed) allowed = Math.max(0, s.x - right);
        }
      }
    } else {
      const left = body.x;
      const cS = Math.floor((left + SKIN) / TILE) - 1, cE = Math.floor((left + dx + SKIN) / TILE);
      outer2: for (let c = cS; c >= cE; c--) {
        for (let r = r0; r <= r1; r++) {
          if (isSolidTile(tileAt(room, c, r))) { allowed = Math.max(allowed, Math.min(0, (c + 1) * TILE - left)); break outer2; }
        }
      }
      const sol = room.solids;
      if (sol && !body.ignoreSolids) {
        for (let i = 0; i < sol.length; i++) {
          const s = sol[i];
          if (s.owner === body || s.oneWay) continue;
          const sr = s.x + s.w;
          if (s.y < bot && s.y + s.h > top && sr <= left + SKIN && sr > left + allowed) allowed = Math.min(0, sr - left);
        }
      }
    }
    return allowed;
  }

  function sweepY(body, room, dy) {
    if (!dy) return 0;
    const lft = body.x + SKIN, rgt = body.x + body.w - SKIN;
    const c0 = Math.floor(lft / TILE), c1 = Math.floor(rgt / TILE);
    let allowed = dy;
    if (dy > 0) {
      const bottom = body.y + body.h;
      const rS = Math.ceil((bottom - SKIN) / TILE), rE = Math.floor((bottom + dy - SKIN) / TILE);
      outer: for (let r = rS; r <= rE; r++) {
        for (let c = c0; c <= c1; c++) {
          const code = tileAt(room, c, r);
          if (isSolidTile(code) || (code === T.PLATFORM && !platformIgnored(body, r))) {
            allowed = Math.min(allowed, Math.max(0, r * TILE - bottom));
            break outer;
          }
        }
      }
      const sol = room.solids;
      if (sol && !body.ignoreSolids) {
        for (let i = 0; i < sol.length; i++) {
          const s = sol[i];
          if (s.owner === body) continue;
          if (s.oneWay && body.dropThrough) continue;
          if (s.x < rgt && s.x + s.w > lft && s.y >= bottom - SKIN && s.y < bottom + allowed) allowed = Math.max(0, s.y - bottom);
        }
      }
    } else {
      const top = body.y;
      const rS = Math.floor((top + SKIN) / TILE) - 1, rE = Math.floor((top + dy + SKIN) / TILE);
      outer2: for (let r = rS; r >= rE; r--) {
        for (let c = c0; c <= c1; c++) {
          if (isSolidTile(tileAt(room, c, r))) { allowed = Math.max(allowed, Math.min(0, (r + 1) * TILE - top)); break outer2; }
        }
      }
      const sol = room.solids;
      if (sol && !body.ignoreSolids) {
        for (let i = 0; i < sol.length; i++) {
          const s = sol[i];
          if (s.owner === body || s.oneWay) continue;
          const sb = s.y + s.h;
          if (s.x < rgt && s.x + s.w > lft && sb <= top + SKIN && sb > top + allowed) allowed = Math.min(0, sb - top);
        }
      }
    }
    return allowed;
  }

  // Move an AABB body {x,y,w,h,dropThrough?} by (dx, dy): X axis first, then Y.
  function move(body, room, dx, dy) {
    const res = { hitX: 0, hitY: 0 };
    if (dx) {
      const a = sweepX(body, room, dx);
      body.x += a;
      if (Math.abs(a - dx) > 1e-9) res.hitX = dx > 0 ? 1 : -1;
    }
    if (dy) {
      const a = sweepY(body, room, dy);
      body.y += a;
      if (Math.abs(a - dy) > 1e-9) res.hitY = dy > 0 ? 1 : -1;
    }
    return res;
  }

  function rectSolid(room, x, y, w, h) {
    const c0 = Math.floor((x + SKIN) / TILE), c1 = Math.floor((x + w - SKIN) / TILE);
    const r0 = Math.floor((y + SKIN) / TILE), r1 = Math.floor((y + h - SKIN) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolidTile(tileAt(room, c, r))) return true;
    const sol = room.solids;
    if (sol) {
      for (let i = 0; i < sol.length; i++) {
        const s = sol[i];
        if (s.oneWay) continue;
        if (s.x < x + w - SKIN && s.x + s.w > x + SKIN && s.y < y + h - SKIN && s.y + s.h > y + SKIN) return true;
      }
    }
    return false;
  }

  function overlapTiles(room, x, y, w, h, code) {
    const c0 = Math.floor((x + SKIN) / TILE), c1 = Math.floor((x + w - SKIN) / TILE);
    const r0 = Math.floor((y + SKIN) / TILE), r1 = Math.floor((y + h - SKIN) / TILE);
    let n = 0;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileAt(room, c, r) === code) n++;
    return n;
  }

  // Standing on a solid tile / platform / solid entity (within 1 px below the feet)?
  function onGround(room, body) {
    return sweepY(body, room, 1) < 1 - 1e-6;
  }

  // What is directly under the body's feet? → {solid, platform, entity, codes:Set}
  function groundInfo(room, body) {
    const bottom = body.y + body.h;
    const r = Math.round(bottom / TILE);
    const out = { tiles: [], platform: false, entity: false, unsafe: false };
    if (Math.abs(r * TILE - bottom) < 1.01) {
      const c0 = Math.floor((body.x + SKIN) / TILE), c1 = Math.floor((body.x + body.w - SKIN) / TILE);
      for (let c = c0; c <= c1; c++) {
        const code = tileAt(room, c, r);
        if (code !== T.EMPTY && code !== T.BGWALL) out.tiles.push(code);
        if (code === T.PLATFORM) out.platform = true;
        if (code === T.BREAKABLE || code === T.DIVEFLOOR) out.unsafe = true;
      }
    }
    const sol = room.solids;
    if (sol) {
      for (let i = 0; i < sol.length; i++) {
        const s = sol[i];
        if (s.owner === body) continue;
        if (s.x < body.x + body.w - SKIN && s.x + s.w > body.x + SKIN && Math.abs(s.y - bottom) < 1.01) out.entity = true;
      }
    }
    return out;
  }

  // Wall contact on side dir (±1): 0 = none, 1 = grippable, 2 = present but not grippable (glazed / noGrip).
  function wallContact(room, body, dir) {
    if (!dir) return 0;
    const px = dir > 0 ? body.x + body.w : body.x - 2;
    const y0 = body.y + 6, y1 = body.y + body.h - 14;
    const c0 = Math.floor((px + SKIN) / TILE), c1 = Math.floor((px + 2 - SKIN) / TILE);
    const r0 = Math.floor(y0 / TILE), r1 = Math.floor(y1 / TILE);
    let grip = false, glazed = false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const code = tileAt(room, c, r);
        if (code === T.GLAZED) glazed = true;
        else if (isSolidTile(code)) grip = true;
      }
    }
    const sol = room.solids;
    if (sol) {
      for (let i = 0; i < sol.length; i++) {
        const s = sol[i];
        if (s.owner === body || s.oneWay) continue;
        if (s.x < px + 2 && s.x + s.w > px && s.y < y1 && s.y + s.h > y0) { if (s.noGrip) glazed = true; else grip = true; }
      }
    }
    if (glazed) return 2;
    return grip ? 1 : 0;
  }

  // Top surface y (px) of the liquid pool containing tile (tx, ty); null if that tile is not liquid.
  function liquidSurface(room, tx, ty) {
    const code = tileAt(room, tx, ty);
    if (!isLiquidTile(code)) return null;
    let r = ty;
    while (r > -1 && tileAt(room, tx, r - 1) === code) r--;
    return r * TILE;
  }

  // Deepest vertical penetration (px) of the body into liquid `code`, sampled at 3 columns.
  // Returns {depth, surface} (surface = y of the liquid top at the deepest sample, or null).
  function liquidDepth(room, body, code) {
    let best = 0, surf = null;
    const xs = [body.x + 4, body.x + body.w * 0.5, body.x + body.w - 4];
    const r0 = Math.floor((body.y + SKIN) / TILE), r1 = Math.floor((body.y + body.h - SKIN) / TILE);
    for (let i = 0; i < 3; i++) {
      const c = Math.floor(xs[i] / TILE);
      for (let r = r0; r <= r1; r++) {
        if (tileAt(room, c, r) !== code) continue;
        const s = liquidSurface(room, c, r);
        let rb = r;
        while (rb <= r1 && tileAt(room, c, rb + 1) === code) rb++;
        const depth = Math.min(body.y + body.h, (rb + 1) * TILE) - Math.max(body.y, s);
        if (depth > best) { best = depth; surf = s; }
        break;
      }
    }
    return { depth: best, surface: surf };
  }

  // Ray against solid tiles (DDA). → {hit, x, y, tx, ty}
  function raycast(room, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
    if (isSolidTile(tileAt(room, tx, ty))) return { hit: true, x: x0, y: y0, tx, ty };
    if (len < 1e-9) return { hit: false, x: x1, y: y1, tx, ty };
    const ux = dx / len, uy = dy / len;
    const stepX = ux > 0 ? 1 : -1, stepY = uy > 0 ? 1 : -1;
    const tDeltaX = ux !== 0 ? Math.abs(TILE / ux) : Infinity;
    const tDeltaY = uy !== 0 ? Math.abs(TILE / uy) : Infinity;
    let tMaxX = ux !== 0 ? ((ux > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(ux)) : Infinity;
    let tMaxY = uy !== 0 ? ((uy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(uy)) : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      let t;
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; } else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; }
      if (t > len) break;
      if (isSolidTile(tileAt(room, tx, ty))) return { hit: true, x: x0 + ux * t, y: y0 + uy * t, tx, ty };
    }
    return { hit: false, x: x1, y: y1, tx, ty };
  }

  // Break the breakable/dive component containing tile (tx, ty). Uses room.breakComponentAt when available
  // (G.Room: persistence + effects); otherwise clears the connected tiles directly (headless tools).
  function breakAt(room, tx, ty, kind) {
    if (room.breakComponentAt) return room.breakComponentAt(tx, ty, kind);
    const code = tileAt(room, tx, ty);
    if (code !== T.BREAKABLE && code !== T.DIVEFLOOR) return false;
    const stack = [[tx, ty]];
    while (stack.length) {
      const [c, r] = stack.pop();
      if (c < 0 || r < 0 || c >= room.cols || r >= room.rows) continue;
      if (room.tiles[r * room.cols + c] !== code) continue;
      room.tiles[r * room.cols + c] = T.EMPTY;
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return true;
  }

  G.Physics = {
    SKIN,
    tileAt, rawTileAt, isSolidTile, isLiquidTile, isHazardTile,
    move, sweepX, sweepY, rectSolid, overlapTiles, onGround, groundInfo,
    wallContact, liquidSurface, liquidDepth, raycast, breakAt,
  };
})();
