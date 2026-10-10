/* Outcast — render.js: world rendering, lighting, particles, backgrounds */
(function () {
  'use strict';
  window.AL = window.AL || {};
  var U = AL.util;

  var canvas = null, g = null;
  var darkCv = null, darkG = null;
  var particles = [];
  var flashes = [];
  var lastT = 0;
  var roomTileCache = {}; // mapId -> Uint8Array tile->roomIdx+1
  var thumbCache = {};
  var TILE = 64;

  function hexRgb(h) {
    h = (h || '#888888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function shade(hex, f) {
    var c = hexRgb(hex);
    return 'rgb(' + Math.round(U.clamp(c[0] * f, 0, 255)) + ',' + Math.round(U.clamp(c[1] * f, 0, 255)) + ',' + Math.round(U.clamp(c[2] * f, 0, 255)) + ')';
  }
  function srand(a, b) { // deterministic per-instance variation
    var h = (a * 374761393 + b * 668265263) >>> 0;
    h = (h ^ (h >> 13)) * 1274126177 >>> 0;
    return ((h ^ (h >> 16)) % 1000) / 1000;
  }

  /* ================= decor ================= */

  var DECOR = {
    table: function (c, w, h, p, r) {
      c.fillStyle = shade(p.wall, 2.2); rr(c, 4, 8, w - 8, h - 14, 8); c.fill();
      c.fillStyle = shade(p.wall, 2.7); rr(c, 4, 4, w - 8, h - 18, 8); c.fill();
      c.strokeStyle = shade(p.wallEdge, 1.1); c.lineWidth = 2; c.stroke();
    },
    chair: function (c, w, h, p) {
      c.fillStyle = shade(p.wall, 1.9); rr(c, w * 0.25, h * 0.3, w * 0.5, h * 0.45, 5); c.fill();
      c.fillStyle = shade(p.wall, 2.3); rr(c, w * 0.25, h * 0.18, w * 0.5, h * 0.16, 4); c.fill();
    },
    crate: function (c, w, h, p, r) {
      c.fillStyle = shade('#8a6d3f', 0.9 + r * 0.3); rr(c, 6, 6, w - 12, h - 12, 4); c.fill();
      c.strokeStyle = shade('#8a6d3f', 0.55); c.lineWidth = 3;
      c.strokeRect(9, 9, w - 18, h - 18);
      c.beginPath(); c.moveTo(9, 9); c.lineTo(w - 9, h - 9); c.moveTo(w - 9, 9); c.lineTo(9, h - 9); c.stroke();
    },
    barrel: function (c, w, h, p, r) {
      c.fillStyle = shade('#4a6a8a', 0.85 + r * 0.4);
      c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.34, h * 0.4, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3;
      c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.34, h * 0.4, 0, 0, 7); c.stroke();
      c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.2, h * 0.24, 0, 0, 7); c.stroke();
    },
    plant: function (c, w, h, p, r) {
      c.fillStyle = '#7a5230'; c.beginPath(); c.ellipse(w / 2, h * 0.78, w * 0.22, h * 0.14, 0, 0, 7); c.fill();
      c.strokeStyle = '#3ea05f'; c.lineWidth = 4; c.lineCap = 'round';
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + (i - 2) * 0.35 + r * 0.2;
        c.beginPath(); c.moveTo(w / 2, h * 0.72);
        c.quadraticCurveTo(w / 2 + Math.cos(a) * w * 0.3, h * 0.4, w / 2 + Math.cos(a) * w * 0.42, h * (0.25 + r * 0.1));
        c.stroke();
      }
    },
    console: function (c, w, h, p) {
      c.fillStyle = shade(p.wall, 1.8); rr(c, 4, h * 0.3, w - 8, h * 0.6, 6); c.fill();
      c.fillStyle = '#0a1420'; rr(c, 8, h * 0.12, w - 16, h * 0.34, 4); c.fill();
      c.fillStyle = p.accent; c.globalAlpha = 0.8;
      c.fillRect(12, h * 0.18, w * 0.3, 3); c.fillRect(12, h * 0.26, w * 0.45, 3); c.fillRect(12, h * 0.34, w * 0.2, 3);
      c.globalAlpha = 1;
      c.fillStyle = '#ff3860'; c.beginPath(); c.arc(w - 16, h * 0.7, 3, 0, 7); c.fill();
      c.fillStyle = '#3ee06f'; c.beginPath(); c.arc(w - 26, h * 0.7, 3, 0, 7); c.fill();
    },
    screen: function (c, w, h, p) {
      c.fillStyle = '#05070f'; rr(c, 4, 4, w - 8, h * 0.66, 4); c.fill();
      c.strokeStyle = shade(p.wallEdge, 1); c.lineWidth = 2; rr(c, 4, 4, w - 8, h * 0.66, 4); c.stroke();
      c.strokeStyle = p.accent; c.globalAlpha = 0.75; c.lineWidth = 2;
      c.beginPath();
      for (var x = 8; x < w - 8; x += 4) c.lineTo(x, h * 0.36 + Math.sin(x * 0.4) * h * 0.12);
      c.stroke(); c.globalAlpha = 1;
      c.fillStyle = shade(p.wall, 1.6); c.fillRect(w * 0.42, h * 0.7, w * 0.16, h * 0.2);
    },
    pipes: function (c, w, h, p) {
      c.strokeStyle = shade(p.wallEdge, 0.85); c.lineWidth = 7; c.lineCap = 'round';
      c.beginPath(); c.moveTo(6, h * 0.3); c.lineTo(w - 6, h * 0.3); c.stroke();
      c.beginPath(); c.moveTo(6, h * 0.62); c.lineTo(w * 0.6, h * 0.62); c.lineTo(w * 0.6, h * 0.9); c.stroke();
      c.fillStyle = shade(p.wallEdge, 1.15);
      c.fillRect(w * 0.2, h * 0.22, 6, 16); c.fillRect(w * 0.7, h * 0.22, 6, 16);
    },
    wires: function (c, w, h, p) {
      var cols = ['#ff3860', '#35e0ff', '#ffd23e'];
      c.lineWidth = 3; c.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        c.strokeStyle = cols[i];
        c.beginPath(); c.moveTo(4, h * 0.3 + i * 8);
        c.bezierCurveTo(w * 0.4, h * 0.2 + i * 12, w * 0.6, h * 0.5 + i * 6, w - 4, h * 0.35 + i * 9);
        c.stroke();
      }
    },
    bed: function (c, w, h, p) {
      c.fillStyle = shade(p.wall, 1.9); rr(c, 4, 4, w - 8, h - 8, 6); c.fill();
      c.fillStyle = '#c9d4f5'; rr(c, 7, 7, w * 0.3, h - 14, 4); c.fill();
      c.fillStyle = '#5a79c9'; rr(c, w * 0.34, 7, w - w * 0.34 - 7, h - 14, 4); c.fill();
    },
    locker: function (c, w, h, p, r) {
      c.fillStyle = shade(p.wall, 1.7 + r * 0.3); rr(c, 8, 2, w - 16, h - 6, 3); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(w / 2, 4); c.lineTo(w / 2, h - 6); c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(w / 2 - 8, h * 0.4, 4, 8); c.fillRect(w / 2 + 4, h * 0.4, 4, 8);
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(10, 6, w - 20, 5);
    },
    rock: function (c, w, h, p, r) {
      c.fillStyle = shade(p.wall, 2 + r);
      c.beginPath();
      for (var i = 0; i < 7; i++) {
        var a = i / 7 * Math.PI * 2;
        var rad = (w / 2 - 6) * (0.75 + 0.3 * srand(i, Math.floor(r * 99)));
        var x = w / 2 + Math.cos(a) * rad, y = h / 2 + Math.sin(a) * rad * 0.8;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.beginPath(); c.ellipse(w * 0.4, h * 0.35, w * 0.16, h * 0.1, 0, 0, 7); c.fill();
    },
    crystal: function (c, w, h, p, r) {
      var col = p.accent;
      c.fillStyle = col; c.globalAlpha = 0.85;
      function shard(x, y, s, tilt) {
        c.save(); c.translate(x, y); c.rotate(tilt);
        c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.4, 0); c.lineTo(0, s * 0.3); c.lineTo(-s * 0.4, 0); c.closePath(); c.fill();
        c.restore();
      }
      shard(w * 0.5, h * 0.55, h * 0.4, -0.1 + r * 0.2);
      shard(w * 0.32, h * 0.68, h * 0.24, -0.4);
      shard(w * 0.68, h * 0.66, h * 0.2, 0.35);
      c.globalAlpha = 0.35; c.fillStyle = '#fff';
      shard(w * 0.5, h * 0.55, h * 0.18, -0.1);
      c.globalAlpha = 1;
    },
    coral: function (c, w, h, p, r) {
      c.strokeStyle = '#ff7a9c'; c.lineWidth = 5; c.lineCap = 'round';
      for (var i = 0; i < 4; i++) {
        var a = -Math.PI / 2 + (i - 1.5) * 0.4;
        c.beginPath(); c.moveTo(w / 2, h * 0.85);
        c.quadraticCurveTo(w / 2 + Math.cos(a) * 10, h * 0.5, w / 2 + Math.cos(a) * w * 0.32, h * (0.28 + srand(i, 3) * 0.15));
        c.stroke();
      }
      c.fillStyle = '#ff9db8';
      c.beginPath(); c.arc(w * 0.35, h * 0.32, 4, 0, 7); c.fill();
      c.beginPath(); c.arc(w * 0.62, h * 0.28, 4, 0, 7); c.fill();
    },
    seaweed: function (c, w, h, p, r) {
      c.strokeStyle = '#3ea05f'; c.lineWidth = 4; c.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        c.beginPath(); c.moveTo(w * (0.3 + i * 0.2), h * 0.9);
        c.bezierCurveTo(w * (0.2 + i * 0.2), h * 0.6, w * (0.45 + i * 0.2), h * 0.45, w * (0.3 + i * 0.2 + r * 0.1), h * 0.15);
        c.stroke();
      }
    },
    glass: function (c, w, h, p) {
      c.fillStyle = 'rgba(120,220,255,0.16)'; rr(c, 4, 4, w - 8, h - 8, 10); c.fill();
      c.strokeStyle = 'rgba(160,230,255,0.6)'; c.lineWidth = 2.5; rr(c, 4, 4, w - 8, h - 8, 10); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.moveTo(10, h - 12); c.lineTo(w - 12, 10); c.stroke();
    },
    lamp: function (c, w, h, p) {
      c.fillStyle = shade(p.wallEdge, 0.9); c.fillRect(w / 2 - 3, h * 0.3, 6, h * 0.55);
      c.fillStyle = '#ffe9a3';
      c.beginPath(); c.arc(w / 2, h * 0.24, 8, 0, 7); c.fill();
      var gr = c.createRadialGradient(w / 2, h * 0.24, 2, w / 2, h * 0.24, 26);
      gr.addColorStop(0, 'rgba(255,233,163,0.5)'); gr.addColorStop(1, 'rgba(255,233,163,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(w / 2, h * 0.24, 26, 0, 7); c.fill();
    },
    rug: function (c, w, h, p) {
      c.fillStyle = shade(p.accent, 0.35); c.globalAlpha = 0.5; rr(c, 3, 3, w - 6, h - 6, 8); c.fill();
      c.globalAlpha = 0.8; c.strokeStyle = shade(p.accent, 0.7); c.lineWidth = 2; rr(c, 8, 8, w - 16, h - 16, 6); c.stroke();
      c.globalAlpha = 1;
    },
    shelf: function (c, w, h, p, r) {
      c.fillStyle = shade(p.wall, 1.8); rr(c, 4, 2, w - 8, h - 6, 3); c.fill();
      for (var i = 0; i < 2; i++) {
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(8, 8 + i * (h / 2 - 6), w - 16, h / 3 - 6);
        for (var b = 0; b < 3; b++) {
          c.fillStyle = ['#c96b6b', '#6bc9a8', '#c9b86b', '#6b8ac9'][Math.floor(srand(i * 3 + b, r * 90) * 4)];
          c.fillRect(11 + b * ((w - 24) / 3), 10 + i * (h / 2 - 6), (w - 30) / 3, h / 3 - 10);
        }
      }
    },
    engine: function (c, w, h, p) {
      c.fillStyle = shade(p.wall, 1.9); rr(c, 4, h * 0.15, w - 8, h * 0.7, 10); c.fill();
      c.strokeStyle = shade(p.wallEdge, 1); c.lineWidth = 2; rr(c, 4, h * 0.15, w - 8, h * 0.7, 10); c.stroke();
      c.fillStyle = shade(p.wallEdge, 0.8);
      c.beginPath(); c.arc(w * 0.32, h / 2, Math.min(w, h) * 0.18, 0, 7); c.fill();
      c.fillStyle = p.accent; c.globalAlpha = 0.7;
      c.beginPath(); c.arc(w * 0.32, h / 2, Math.min(w, h) * 0.09, 0, 7); c.fill(); c.globalAlpha = 1;
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(w * 0.55, h * 0.28, w * 0.3, 6); c.fillRect(w * 0.55, h * 0.46, w * 0.3, 6); c.fillRect(w * 0.55, h * 0.64, w * 0.3, 6);
    },
    window: function (c, w, h, p) {
      c.fillStyle = '#05070f'; rr(c, 4, 4, w - 8, h - 8, 12); c.fill();
      c.fillStyle = '#eaf0ff';
      c.fillRect(w * 0.3, h * 0.3, 2, 2); c.fillRect(w * 0.6, h * 0.5, 2, 2); c.fillRect(w * 0.45, h * 0.7, 2, 2);
      c.strokeStyle = shade(p.wallEdge, 1.2); c.lineWidth = 3; rr(c, 4, 4, w - 8, h - 8, 12); c.stroke();
    },
  };

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ================= world drawing ================= */

  function roomTiles(map) {
    if (roomTileCache[map.id]) return roomTileCache[map.id];
    var arr = new Uint8Array(map.W * map.H);
    for (var i = 0; i < map.rooms.length; i++) {
      var rects = map.rooms[i].rects;
      for (var j = 0; j < rects.length; j++) {
        var rc = rects[j];
        for (var y = rc[1]; y < rc[1] + rc[3]; y++) {
          for (var x = rc[0]; x < rc[0] + rc[2]; x++) {
            if (x >= 0 && y >= 0 && x < map.W && y < map.H) arr[y * map.W + x] = i + 1;
          }
        }
      }
    }
    roomTileCache[map.id] = arr;
    return arr;
  }

  // draws floors/walls/decor/vents for world-space rect [x0,y0,x1,y1] into ctx (already transformed)
  function drawWorld(c, map, x0, y0, x1, y1, t) {
    var p = map.palette;
    var tx0 = Math.max(0, Math.floor(x0 / TILE)), ty0 = Math.max(0, Math.floor(y0 / TILE));
    var tx1 = Math.min(map.W - 1, Math.ceil(x1 / TILE)), ty1 = Math.min(map.H - 1, Math.ceil(y1 / TILE));
    var rt = roomTiles(map);
    // floors
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        var fk = map.floorKind(tx, ty);
        if (!fk) continue;
        var x = tx * TILE, y = ty * TILE;
        c.fillStyle = fk === 2 ? p.floorAlt : p.floor;
        c.fillRect(x, y, TILE, TILE);
        // subtle checker + room tint
        var ri = rt[ty * map.W + tx];
        if ((tx + ty) % 2 === 0) { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(x, y, TILE, TILE); }
        if (ri) { c.fillStyle = 'rgba(255,255,255,' + (0.015 * (ri % 3)) + ')'; c.fillRect(x, y, TILE, TILE); }
        // panel seams
        c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 1;
        c.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
    // wall drop shadows onto floor (south of walls)
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (var ty2 = ty0; ty2 <= ty1; ty2++) {
      for (var tx2 = tx0; tx2 <= tx1; tx2++) {
        if (map.floorKind(tx2, ty2) && map.isWallTile(tx2, ty2 - 1)) {
          c.fillRect(tx2 * TILE, ty2 * TILE, TILE, 10);
        }
      }
    }
    // walls
    for (var ty3 = ty0; ty3 <= ty1; ty3++) {
      for (var tx3 = tx0; tx3 <= tx1; tx3++) {
        if (!map.isWallTile(tx3, ty3)) continue;
        var wx = tx3 * TILE, wy = ty3 * TILE;
        c.fillStyle = p.wall;
        c.fillRect(wx, wy, TILE, TILE);
        // front face if floor below
        if (map.floorKind(tx3, ty3 + 1)) {
          c.fillStyle = shade(p.wall, 1.5);
          c.fillRect(wx, wy + TILE - 14, TILE, 14);
        }
        // edge highlights facing floor
        c.strokeStyle = p.wallEdge; c.lineWidth = 2.5;
        c.beginPath();
        if (map.floorKind(tx3, ty3 + 1)) { c.moveTo(wx, wy + TILE - 1); c.lineTo(wx + TILE, wy + TILE - 1); }
        if (map.floorKind(tx3, ty3 - 1)) { c.moveTo(wx, wy + 1); c.lineTo(wx + TILE, wy + 1); }
        if (map.floorKind(tx3 - 1, ty3)) { c.moveTo(wx + 1, wy); c.lineTo(wx + 1, wy + TILE); }
        if (map.floorKind(tx3 + 1, ty3)) { c.moveTo(wx + TILE - 1, wy); c.lineTo(wx + TILE - 1, wy + TILE); }
        c.stroke();
      }
    }
    // decor
    for (var d = 0; d < map.decor.length; d++) {
      var dec = map.decor[d];
      var dw = (dec.w || 1) * TILE, dh = (dec.h || 1) * TILE;
      var dx = dec.tx * TILE, dy = dec.ty * TILE;
      if (dx > x1 || dy > y1 || dx + dw < x0 || dy + dh < y0) continue;
      var fn = DECOR[dec.kind];
      if (!fn) continue;
      c.save();
      c.translate(dx, dy);
      fn(c, dw, dh, p, srand(dec.tx, dec.ty));
      c.restore();
    }
    // vents
    for (var v = 0; v < map.vents.length; v++) {
      var vt = map.vents[v];
      if (vt.x < x0 - TILE || vt.x > x1 + TILE || vt.y < y0 - TILE || vt.y > y1 + TILE) continue;
      c.save();
      c.translate(vt.x, vt.y);
      c.fillStyle = shade(p.wall, 1.4);
      rr(c, -22, -16, 44, 32, 8); c.fill();
      c.strokeStyle = shade(p.wallEdge, 0.9); c.lineWidth = 2; rr(c, -22, -16, 44, 32, 8); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-14, -8); c.lineTo(14, -8);
      c.moveTo(-14, 0); c.lineTo(14, 0);
      c.moveTo(-14, 8); c.lineTo(14, 8);
      c.stroke();
      c.restore();
    }
    // door frames + closed doors
    Object.keys(map.doors).forEach(function (id) {
      var door = map.doors[id];
      for (var i = 0; i < door.tiles.length; i++) {
        var dtx = door.tiles[i][0], dty = door.tiles[i][1];
        var ddx = dtx * TILE, ddy = dty * TILE;
        if (ddx > x1 || ddy > y1 || ddx + TILE < x0 || ddy + TILE < y0) continue;
        if (door.closed) {
          c.fillStyle = shade(p.wall, 1.7);
          c.fillRect(ddx + 2, ddy + 2, TILE - 4, TILE - 4);
          c.strokeStyle = '#ff3860'; c.lineWidth = 3;
          c.strokeRect(ddx + 5, ddy + 5, TILE - 10, TILE - 10);
          c.beginPath(); c.moveTo(ddx + TILE / 2, ddy + 8); c.lineTo(ddx + TILE / 2, ddy + TILE - 8); c.stroke();
        } else {
          c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 4;
          c.strokeRect(ddx + 3, ddy + 3, TILE - 6, TILE - 6);
        }
      }
    });
  }

  /* ================= backgrounds ================= */

  function drawBg(c, w, h, theme, camX, camY, t) {
    if (theme === 'ocean') {
      var gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#0a2e3d'); gr.addColorStop(1, '#03141c');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      // light rays
      c.save();
      c.globalAlpha = 0.06;
      c.fillStyle = '#9fe8ff';
      for (var i = 0; i < 4; i++) {
        var rx = ((i * 331 - camX * 0.1 + t * 6) % (w + 300)) - 150;
        c.beginPath();
        c.moveTo(rx, -20); c.lineTo(rx + 130, -20); c.lineTo(rx + 40, h + 20); c.lineTo(rx - 50, h + 20);
        c.closePath(); c.fill();
      }
      c.restore();
      // bubbles
      c.fillStyle = 'rgba(159,232,255,0.25)';
      for (var b = 0; b < 14; b++) {
        var bx = (b * 227 - camX * 0.2) % w; if (bx < 0) bx += w;
        var by = h - ((t * (14 + b % 5) + b * 149) % (h + 40));
        c.beginPath(); c.arc(bx, by, 2 + b % 3, 0, 7); c.fill();
      }
      return;
    }
    // space / planet
    c.fillStyle = '#04060f'; c.fillRect(0, 0, w, h);
    for (var s = 0; s < 90; s++) {
      var lx = (s * 173 - camX * (0.05 + (s % 3) * 0.03)) % w; if (lx < 0) lx += w;
      var ly = (s * 97 - camY * (0.05 + (s % 3) * 0.03)) % h; if (ly < 0) ly += h;
      var tw = 0.35 + 0.65 * ((Math.sin(t * (0.5 + (s % 7) * 0.3) + s) + 1) / 2);
      c.fillStyle = 'rgba(234,240,255,' + (0.25 + 0.5 * tw * ((s % 3) / 2)) + ')';
      c.fillRect(lx, ly, s % 5 === 0 ? 2 : 1.5, s % 5 === 0 ? 2 : 1.5);
    }
    if (theme === 'planet') {
      // distant earth
      var ex = w * 0.82 - camX * 0.02, ey = h * 0.2 - camY * 0.02;
      var egr = c.createRadialGradient(ex - 10, ey - 10, 4, ex, ey, 34);
      egr.addColorStop(0, '#7ec8ff'); egr.addColorStop(0.6, '#2a6bb5'); egr.addColorStop(1, '#173a63');
      c.fillStyle = egr; c.beginPath(); c.arc(ex, ey, 34, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.ellipse(ex - 8, ey - 4, 12, 6, 0.5, 0, 7); c.fill();
      c.beginPath(); c.ellipse(ex + 10, ey + 10, 9, 5, -0.4, 0, 7); c.fill();
    } else {
      // ringed planet
      var px = w * 0.15 - camX * 0.015, py = h * 0.75 - camY * 0.015;
      var pgr = c.createRadialGradient(px - 8, py - 8, 4, px, py, 28);
      pgr.addColorStop(0, '#c98ae0'); pgr.addColorStop(1, '#5a3a80');
      c.fillStyle = pgr; c.beginPath(); c.arc(px, py, 28, 0, 7); c.fill();
      c.strokeStyle = 'rgba(200,160,230,0.5)'; c.lineWidth = 4;
      c.beginPath(); c.ellipse(px, py, 46, 12, -0.35, 0, 7); c.stroke();
    }
    // occasional shooting star
    var cyc = t % 7;
    if (cyc < 0.5) {
      var sx = w * 0.2 + (t % 97) * 8 + cyc * w * 1.2, sy = h * 0.15 + cyc * h * 0.5;
      c.strokeStyle = 'rgba(234,240,255,' + (0.7 * (1 - cyc * 2)) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - 46, sy - 20); c.stroke();
    }
  }

  /* ================= particles ================= */

  var PKINDS = {
    poof: { n: 8, spd: 90, life: 0.6, size: 7, col: ['#c9d4f5', '#8b96c9'], grav: -30, fade: true },
    spark: { n: 10, spd: 160, life: 0.4, size: 3, col: ['#ffd23e', '#ffedb0'], grav: 160, fade: true },
    ecto: { n: 14, spd: 120, life: 0.8, size: 6, col: ['#3ef0d0', '#35e0ff', '#9ffce8'], grav: -50, fade: true },
    confetti: { n: 26, spd: 200, life: 1.6, size: 5, col: ['#ff3860', '#35e0ff', '#ffd23e', '#3ee06f', '#d06bff'], grav: 220, fade: false },
    smoke: { n: 6, spd: 40, life: 1.1, size: 12, col: ['rgba(140,150,180,0.5)'], grav: -60, fade: true },
    bubbles: { n: 8, spd: 50, life: 1.2, size: 4, col: ['rgba(159,232,255,0.7)'], grav: -120, fade: true },
    dust: { n: 5, spd: 30, life: 0.7, size: 4, col: ['#8a8a92'], grav: -10, fade: true },
    shieldBreak: { n: 16, spd: 190, life: 0.6, size: 5, col: ['#3ef0d0', '#c9fff2'], grav: 90, fade: true },
    explosion: { n: 30, spd: 260, life: 0.9, size: 8, col: ['#ffd23e', '#ff9d2e', '#ff3860', '#5a5a62'], grav: 60, fade: true },
    blood_teal: { n: 12, spd: 110, life: 0.9, size: 6, col: ['#3ef0d0', '#2aa890'], grav: 240, fade: true },
  };

  function spawnParticles(kind, x, y, opts) {
    var k = PKINDS[kind] || PKINDS.poof;
    opts = opts || {};
    var n = opts.n || k.n;
    for (var i = 0; i < n; i++) {
      if (particles.length > 600) particles.shift();
      var a = Math.random() * Math.PI * 2;
      var sp = k.spd * (0.4 + Math.random() * 0.8);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (k.grav < 0 ? 0 : 40),
        life: k.life * (0.7 + Math.random() * 0.6), max: k.life,
        size: k.size * (0.6 + Math.random() * 0.8),
        col: k.col[Math.floor(Math.random() * k.col.length)],
        grav: k.grav, fade: k.fade, spin: (Math.random() - 0.5) * 8, rot: Math.random() * 7,
      });
    }
  }

  function drawParticles(c, dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.rot += p.spin * dt;
      var a = p.fade ? U.clamp(p.life / p.max, 0, 1) : 1;
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.col;
      c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      c.restore();
    }
  }

  /* ================= vision / lighting ================= */

  function raySeg(px, py, dx, dy, x1, y1, x2, y2) {
    var sx = x2 - x1, sy = y2 - y1;
    var denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-9) return Infinity;
    var t = ((x1 - px) * sy - (y1 - py) * sx) / denom;
    var u = ((x1 - px) * dy - (y1 - py) * dx) / denom;
    if (t > 0 && u >= 0 && u <= 1) return t;
    return Infinity;
  }

  function visPoly(px, py, segs, maxR) {
    // filter segments near the player
    var near = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var mnx = Math.min(s[0], s[2]) - px, mxx = Math.max(s[0], s[2]) - px;
      var mny = Math.min(s[1], s[3]) - py, mxy = Math.max(s[1], s[3]) - py;
      var ddx = mnx > 0 ? mnx : (mxx < 0 ? -mxx : 0);
      var ddy = mny > 0 ? mny : (mxy < 0 ? -mxy : 0);
      if (ddx * ddx + ddy * ddy < maxR * maxR) near.push(s);
    }
    var angles = [];
    for (var j = 0; j < near.length; j++) {
      var sg = near[j];
      angles.push(Math.atan2(sg[1] - py, sg[0] - px));
      angles.push(Math.atan2(sg[3] - py, sg[2] - px));
    }
    for (var k = 0; k < 24; k++) angles.push(k / 24 * Math.PI * 2);
    var pts = [];
    for (var a = 0; a < angles.length; a++) {
      for (var e = -1; e <= 1; e += 2) {
        var ang = angles[a] + e * 0.0006;
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var best = maxR;
        for (var n2 = 0; n2 < near.length; n2++) {
          var sg2 = near[n2];
          var t = raySeg(px, py, dx, dy, sg2[0], sg2[1], sg2[2], sg2[3]);
          if (t < best) best = t;
        }
        pts.push([ang, px + dx * best, py + dy * best]);
      }
    }
    pts.sort(function (m, n) { return m[0] - n[0]; });
    return pts;
  }

  function drawVision(frame, w, h, dpr) {
    var me = frame.me;
    if (!me || me.dead) return; // ghosts see everything
    if (!darkCv) { darkCv = document.createElement('canvas'); darkG = darkCv.getContext('2d'); }
    if (darkCv.width !== canvas.width || darkCv.height !== canvas.height) {
      darkCv.width = canvas.width; darkCv.height = canvas.height;
    }
    var dc = darkG;
    dc.setTransform(1, 0, 0, 1, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, darkCv.width, darkCv.height);
    var darkA = 0.93;
    dc.fillStyle = 'rgba(3,5,12,' + darkA + ')';
    dc.fillRect(0, 0, darkCv.width, darkCv.height);
    // punch visibility polygon w/ radial falloff
    AL.engine.applyCamera(dc);
    dc.globalCompositeOperation = 'destination-out';
    var r = frame.vision.r;
    var pts = visPoly(me.x, me.y, frame.map.getSegments(), r * 1.06);
    if (pts.length > 2) {
      var grd = dc.createRadialGradient(me.x, me.y, r * 0.22, me.x, me.y, r);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.72, 'rgba(255,255,255,0.85)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      dc.fillStyle = grd;
      dc.beginPath();
      dc.moveTo(pts[0][1], pts[0][2]);
      for (var i = 1; i < pts.length; i++) dc.lineTo(pts[i][1], pts[i][2]);
      dc.closePath();
      dc.fill();
    }
    dc.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(darkCv, 0, 0);
  }

  /* ================= main draw ================= */

  var menuCamT = 0;

  function draw(frame) {
    if (!g) return;
    var t = U.now() / 1000;
    var dt = Math.min(0.05, t - lastT || 0.016);
    lastT = t;
    var size = AL.engine.canvasSize();
    var w = size.w, h = size.h;

    if (!frame || !frame.map) {
      // menu: ambient starfield
      AL.engine.resetCamera(g);
      menuCamT += dt * 20;
      drawBg(g, w, h, 'space', menuCamT, 0, t);
      flashesDraw(w, h, dt);
      return;
    }

    var map = frame.map, me = frame.me;
    if (me) AL.engine.camera.follow(me.x, me.y, dt);

    AL.engine.resetCamera(g);
    drawBg(g, w, h, map.palette.bg, AL.engine.camera.x, AL.engine.camera.y, t);

    AL.engine.applyCamera(g);
    var tl = AL.engine.worldFromScreen(0, 0);
    var br = AL.engine.worldFromScreen(w, h);
    drawWorld(g, map, tl.x - TILE, tl.y - TILE, br.x + TILE, br.y + TILE, t);

    // task markers
    if (frame.taskSpotsMine && frame.taskSpotsMine.length && !(frame.sab && frame.sab.kind === 'comms')) {
      for (var m = 0; m < map.taskSpots.length; m++) {
        var sp = map.taskSpots[m];
        if (frame.taskSpotsMine.indexOf(sp.id) < 0) continue;
        var pl = 0.6 + 0.4 * Math.sin(t * 4 + m);
        g.strokeStyle = 'rgba(255,210,62,' + pl + ')';
        g.lineWidth = 3.5;
        rr(g, sp.x - 26, sp.y - 26, 52, 52, 10); g.stroke();
        g.fillStyle = 'rgba(255,210,62,' + pl + ')';
        AL.tasks && AL.tasks.icon(sp.task, g, sp.x, sp.y - 40, 18);
      }
    }
    // sabotage consoles flashing
    if (frame.sab && frame.sab.kind) {
      var sabTask = 'sab_' + frame.sab.kind;
      for (var sc = 0; sc < map.taskSpots.length; sc++) {
        var spc = map.taskSpots[sc];
        if (spc.task !== sabTask) continue;
        var fl = Math.sin(t * 7) > 0 ? 0.9 : 0.3;
        g.strokeStyle = 'rgba(255,56,96,' + fl + ')';
        g.lineWidth = 4;
        rr(g, spc.x - 28, spc.y - 28, 56, 56, 10); g.stroke();
      }
    }

    // bodies
    if (frame.bodies) {
      for (var b = 0; b < frame.bodies.length; b++) {
        var bd = frame.bodies[b];
        AL.chars.drawBody(g, { x: bd.x, y: bd.y, color: bd.color, t: t * 1000 });
      }
    }

    // players y-sorted
    var ps = (frame.players || []).filter(function (p) { return !p.inVent && !(p.alpha != null && p.alpha <= 0.01); });
    ps.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      g.save();
      if (p.alpha != null && p.alpha < 1) g.globalAlpha = p.alpha;
      AL.chars.draw(g, {
        x: p.x, y: p.y, color: p.color, hat: p.hat, skin: p.skin,
        dir: p.dir || 1, moving: p.moving, dead: p.dead, ghost: p.dead,
        t: t * 1000 + (p.id ? U.hashStr(String(p.id)) % 977 : 0),
        morphColor: p.morphColor != null ? p.morphColor : null,
        scale: 1, alpha: 1,
      });
      if (p.pet && p.pet !== 'none' && !p.dead) {
        AL.chars.drawPet(g, { x: p.petX != null ? p.petX : p.x - 34 * (p.dir || 1), y: p.petY != null ? p.petY : p.y + 4, kind: p.pet, color: p.color, dir: p.dir || 1, moving: p.moving, t: t * 1000 });
      }
      g.restore();
      // scanning rings
      if (p.scanning) {
        var ringP = (t % 1);
        g.strokeStyle = 'rgba(62,224,111,' + (0.7 - ringP * 0.6) + ')';
        g.lineWidth = 3;
        g.beginPath(); g.ellipse(p.x, p.y + 4, 30 * (0.5 + ringP), 12 * (0.5 + ringP), 0, 0, 7); g.stroke();
      }
      // bomb over holder
      if (frame.bomb && frame.bomb.holderId === p.id) {
        var bt = Math.max(0, (frame.bomb.endsAt - Date.now()) / 1000);
        var pulse = bt < 5 ? Math.sin(t * 12) * 4 : Math.sin(t * 5) * 2;
        g.fillStyle = '#1d1d22';
        g.beginPath(); g.arc(p.x, p.y - 78, 13 + pulse * 0.4, 0, 7); g.fill();
        g.strokeStyle = bt < 5 ? '#ff3860' : '#ffd23e'; g.lineWidth = 2.5; g.stroke();
        g.strokeStyle = '#8b96c9';
        g.beginPath(); g.moveTo(p.x + 6, p.y - 88); g.quadraticCurveTo(p.x + 12, p.y - 96, p.x + 8, p.y - 100); g.stroke();
        g.fillStyle = '#ffd23e';
        g.beginPath(); g.arc(p.x + 8, p.y - 101, 2.5 + (Math.sin(t * 16) + 1), 0, 7); g.fill();
      }
      // nameplate
      if (p.name) {
        var ny = p.y - AL.chars.height - 16;
        g.font = '800 13px "Trebuchet MS", sans-serif';
        g.textAlign = 'center';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        var nm = p.name + (p.roleTag ? ' [' + p.roleTag + ']' : '');
        g.strokeText(nm, p.x, ny);
        g.fillStyle = p.dead ? 'rgba(160,170,200,0.75)' : (p.roleTag && p.roleTagColor ? p.roleTagColor : '#ffffff');
        g.fillText(nm, p.x, ny);
      }
    }

    drawParticles(g, dt);

    // vision darkness (skips ghosts)
    if (frame.vision && frame.vision.r && !(me && me.dead)) {
      drawVision(frame, w, h);
    }

    // screen-space overlays
    AL.engine.resetCamera(g);
    // sabotage vignettes
    if (frame.sab && (frame.sab.kind === 'reactor' || frame.sab.kind === 'o2')) {
      var pulseA = 0.16 + 0.12 * Math.sin(t * 5);
      var vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
      vg.addColorStop(0, 'rgba(255,56,96,0)');
      vg.addColorStop(1, 'rgba(255,56,96,' + pulseA + ')');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
    }
    // base vignette
    var vg2 = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg2.addColorStop(0, 'rgba(0,0,0,0)');
    vg2.addColorStop(1, 'rgba(0,0,0,0.32)');
    g.fillStyle = vg2;
    g.fillRect(0, 0, w, h);

    if (AL.engine.drawTouchUI) AL.engine.drawTouchUI(g);
    flashesDraw(w, h, dt);
  }

  function flashesDraw(w, h, dt) {
    for (var i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i];
      f.life -= dt * 1000;
      if (f.life <= 0) { flashes.splice(i, 1); continue; }
      var reduced = AL.ui && AL.ui.options && AL.ui.options.reducedFlash;
      g.globalAlpha = (f.life / f.max) * (reduced ? 0.12 : 0.34);
      g.fillStyle = f.color;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
  }

  /* ================= aux views ================= */

  function drawRegionTo(ctx2, map, cx, cy, wPx, hPx, zoom, frame) {
    ctx2.save();
    ctx2.fillStyle = '#04060f';
    ctx2.fillRect(0, 0, wPx, hPx);
    ctx2.translate(wPx / 2, hPx / 2);
    ctx2.scale(zoom, zoom);
    ctx2.translate(-cx, -cy);
    var x0 = cx - wPx / 2 / zoom, y0 = cy - hPx / 2 / zoom;
    var x1 = cx + wPx / 2 / zoom, y1 = cy + hPx / 2 / zoom;
    drawWorld(ctx2, map, x0, y0, x1, y1, U.now() / 1000);
    if (frame) {
      var t = U.now() / 1000;
      (frame.bodies || []).forEach(function (bd) {
        if (bd.x > x0 && bd.x < x1 && bd.y > y0 && bd.y < y1) AL.chars.drawBody(ctx2, { x: bd.x, y: bd.y, color: bd.color, t: t * 1000 });
      });
      (frame.players || []).forEach(function (p) {
        if (p.inVent || p.dead) return;
        if (p.alpha != null && p.alpha < 0.5) return;
        if (p.x > x0 - 40 && p.x < x1 + 40 && p.y > y0 - 60 && p.y < y1 + 40) {
          AL.chars.draw(ctx2, { x: p.x, y: p.y, color: p.color, hat: p.hat, skin: p.skin, dir: p.dir || 1, moving: p.moving, dead: false, t: t * 1000, morphColor: p.morphColor });
        }
      });
    }
    ctx2.restore();
  }

  function drawMinimap(ctx2, map, w, h, blips) {
    var scale = Math.min(w / map.worldW, h / map.worldH);
    var ox = (w - map.worldW * scale) / 2, oy = (h - map.worldH * scale) / 2;
    ctx2.save();
    ctx2.fillStyle = 'rgba(5,7,15,0.6)';
    ctx2.fillRect(0, 0, w, h);
    ctx2.translate(ox, oy);
    ctx2.scale(scale, scale);
    // simplified: floors as light blocks
    var p = map.palette;
    for (var ty = 0; ty < map.H; ty++) {
      for (var tx = 0; tx < map.W; tx++) {
        var fk = map.floorKind(tx, ty);
        if (!fk) continue;
        ctx2.fillStyle = fk === 2 ? shade(p.floor, 1.35) : shade(p.floor, 1.55);
        ctx2.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // room labels
    ctx2.fillStyle = 'rgba(234,240,255,0.85)';
    ctx2.font = '800 ' + Math.round(TILE * 2.2) + 'px "Trebuchet MS", sans-serif';
    ctx2.textAlign = 'center';
    map.rooms.forEach(function (rm) {
      var rc = rm.rects[0];
      ctx2.fillText(rm.name.toUpperCase(), (rc[0] + rc[2] / 2) * TILE, (rc[1] + rc[3] / 2) * TILE);
    });
    ctx2.restore();
    // blips in screen coords
    (blips || []).forEach(function (bl) {
      var bx = ox + bl.x * scale, by = oy + bl.y * scale;
      var t = U.now() / 1000;
      if (bl.kind === 'you') {
        ctx2.fillStyle = '#ffffff';
        ctx2.beginPath(); ctx2.arc(bx, by, 6, 0, 7); ctx2.fill();
        ctx2.strokeStyle = bl.color || '#35e0ff'; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(bx, by, 8 + Math.sin(t * 5) * 2, 0, 7); ctx2.stroke();
      } else if (bl.kind === 'task') {
        ctx2.fillStyle = '#ffd23e';
        ctx2.beginPath(); ctx2.arc(bx, by, 5, 0, 7); ctx2.fill();
      } else if (bl.kind === 'sab') {
        if (Math.sin(t * 8) > -0.2) {
          ctx2.fillStyle = '#ff3860';
          ctx2.beginPath(); ctx2.arc(bx, by, 7, 0, 7); ctx2.fill();
        }
      } else if (bl.kind === 'body') {
        ctx2.fillStyle = bl.color || '#c51111';
        ctx2.fillRect(bx - 4, by - 2, 8, 5);
      } else {
        ctx2.fillStyle = bl.color || '#eaf0ff';
        ctx2.beginPath(); ctx2.arc(bx, by, 4.5, 0, 7); ctx2.fill();
      }
    });
  }

  function getMapThumb(mapId, w, h) {
    var key = mapId + '_' + w + 'x' + h;
    if (thumbCache[key]) return thumbCache[key];
    var map = AL.maps.load(mapId);
    if (!map) return null;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c2 = cv.getContext('2d');
    drawBg(c2, w, h, map.palette.bg, 0, 0, 2.5);
    var scale = Math.min(w / map.worldW, h / map.worldH) * 0.92;
    c2.save();
    c2.translate((w - map.worldW * scale) / 2, (h - map.worldH * scale) / 2);
    c2.scale(scale, scale);
    drawWorld(c2, map, 0, 0, map.worldW, map.worldH, 0);
    c2.restore();
    thumbCache[key] = cv;
    return cv;
  }

  /* ================= public ================= */

  AL.render = {
    init: function (cv) {
      canvas = cv;
      g = cv.getContext('2d');
      AL.bus.on('game:kill', function (e) {
        if (!e) return;
        spawnParticles('ecto', e.x, e.y);
        spawnParticles('poof', e.x, e.y, { n: 5 });
        if (AL.engine && AL.engine.camera) {
          var d = U.dist(AL.engine.camera.x, AL.engine.camera.y, e.x, e.y);
          if (d < 500) AL.engine.camera.shake(U.clamp(1 - d / 500, 0.2, 1) * 14);
        }
      });
    },
    draw: function (frame) {
      try { draw(frame); } catch (e) { console.warn('[render]', e); }
    },
    spawnParticles: spawnParticles,
    flash: function (color, ms) { flashes.push({ color: color || '#ffffff', life: ms || 200, max: ms || 200 }); },
    drawRegionTo: drawRegionTo,
    drawMinimap: drawMinimap,
    getMapThumb: getMapThumb,
  };
})();
