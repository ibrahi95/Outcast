/* Outcast — maps.js: map registry + ASCII grid parser -> runtime map */
(function () {
  'use strict';
  window.AL = window.AL || {};
  var T = function () { return AL.C.TILE; };

  var defs = {};
  var cache = {};

  function tileCenter(tx, ty) { return { x: (tx + 0.5) * T(), y: (ty + 0.5) * T() }; }

  function parse(def) {
    var TILE = T();
    var rows = def.grid;
    var H = rows.length;
    var W = 0;
    for (var r = 0; r < H; r++) W = Math.max(W, rows[r].length);

    // kind grids: 0 void, 1 floor, 2 alt floor, 3 wall
    var kind = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      var row = rows[y];
      for (var x = 0; x < W; x++) {
        var ch = x < row.length ? row[x] : ' ';
        kind[y * W + x] = ch === '#' ? 3 : (ch === '.' ? 1 : (ch === '~' ? 2 : 0));
      }
    }

    // doors: map tile -> door id
    var doors = {};
    var doorTile = {}; // 'tx,ty' -> id
    (def.doors || []).forEach(function (d) {
      doors[d.id] = { id: d.id, room: d.room, tiles: d.tiles, closed: false, closedUntil: 0 };
      d.tiles.forEach(function (tt) { doorTile[tt[0] + ',' + tt[1]] = d.id; });
    });

    function baseSolid(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
      var k = kind[ty * W + tx];
      return k === 0 || k === 3;
    }

    var map = {
      def: def, id: def.id, W: W, H: H,
      worldW: W * TILE, worldH: H * TILE,
      palette: def.palette,
      rooms: def.rooms || [],
      doors: doors,
      decor: def.decor || [],
    };

    map.isSolid = function (tx, ty) {
      if (baseSolid(tx, ty)) return true;
      var id = doorTile[tx + ',' + ty];
      return !!(id && doors[id].closed);
    };
    map.isFloor = function (tx, ty) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      var k = kind[ty * W + tx];
      return k === 1 || k === 2;
    };
    map.floorKind = function (tx, ty) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
      var k = kind[ty * W + tx];
      return k === 3 ? 0 : k === 0 ? 0 : (k === 2 ? 2 : 1);
    };
    map.isWallTile = function (tx, ty) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      return kind[ty * W + tx] === 3;
    };
    map.doorAt = function (tx, ty) { return doorTile[tx + ',' + ty] || null; };

    var segCache = null;
    map.setDoor = function (id, closed) {
      var d = doors[id];
      if (!d || d.closed === closed) return;
      d.closed = closed;
      segCache = null;
    };

    // Build merged wall segments (edges between solid-ish and open tiles) for vision raycasting.
    function buildSegments() {
      var segs = [];
      var solidNow = function (tx, ty) { return map.isSolid(tx, ty); };
      // horizontal edges
      for (var y = 0; y <= H; y++) {
        var runStart = -1;
        for (var x = 0; x <= W; x++) {
          var edge = x < W && (solidNow(x, y - 1) !== solidNow(x, y));
          if (edge && runStart < 0) runStart = x;
          if (!edge && runStart >= 0) {
            segs.push([runStart * TILE, y * TILE, x * TILE, y * TILE]);
            runStart = -1;
          }
        }
      }
      // vertical edges
      for (var x2 = 0; x2 <= W; x2++) {
        var runStart2 = -1;
        for (var y2 = 0; y2 <= H; y2++) {
          var edge2 = y2 < H && (solidNow(x2 - 1, y2) !== solidNow(x2, y2));
          if (edge2 && runStart2 < 0) runStart2 = y2;
          if (!edge2 && runStart2 >= 0) {
            segs.push([x2 * TILE, runStart2 * TILE, x2 * TILE, y2 * TILE]);
            runStart2 = -1;
          }
        }
      }
      return segs;
    }
    map.getSegments = function () {
      if (!segCache) segCache = buildSegments();
      return segCache;
    };

    map.roomAt = function (x, y) {
      var tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      var rooms = def.rooms || [];
      for (var i = 0; i < rooms.length; i++) {
        var rects = rooms[i].rects;
        for (var j = 0; j < rects.length; j++) {
          var rc = rects[j];
          if (tx >= rc[0] && tx < rc[0] + rc[2] && ty >= rc[1] && ty < rc[1] + rc[3]) return rooms[i];
        }
      }
      return null;
    };

    // entities with world px positions
    map.vents = (def.vents || []).map(function (v) {
      var c = tileCenter(v.tx, v.ty);
      return { id: v.id, tx: v.tx, ty: v.ty, x: c.x, y: c.y };
    });
    var linkGroups = def.ventLinks || [];
    map.ventLinksOf = function (id) {
      for (var i = 0; i < linkGroups.length; i++) {
        if (linkGroups[i].indexOf(id) >= 0) {
          return linkGroups[i].filter(function (v) { return v !== id; });
        }
      }
      return [];
    };
    map.ventById = function (id) {
      for (var i = 0; i < map.vents.length; i++) if (map.vents[i].id === id) return map.vents[i];
      return null;
    };
    map.taskSpots = (def.taskSpots || []).map(function (s) {
      var c = tileCenter(s.tx, s.ty);
      return { id: s.id, task: s.task, room: s.room, tx: s.tx, ty: s.ty, x: c.x, y: c.y };
    });
    map.devices = (def.devices || []).map(function (d) {
      var c = tileCenter(d.tx, d.ty);
      return { kind: d.kind, room: d.room, tx: d.tx, ty: d.ty, x: c.x, y: c.y };
    });
    var sp = def.spawn || { tx: Math.floor(W / 2), ty: Math.floor(H / 2) };
    map.spawn = { tx: sp.tx, ty: sp.ty, x: (sp.tx + 0.5) * TILE, y: (sp.ty + 0.5) * TILE };

    // light validation (console.warn only)
    if (def.modes && def.modes.indexOf('classic') >= 0) {
      var counts = {};
      map.taskSpots.forEach(function (s) { counts[s.task] = (counts[s.task] || 0) + 1; });
      ['sab_lights', 'sab_comms'].forEach(function (t) {
        if (!counts[t]) console.warn('[maps] ' + def.id + ' missing ' + t + ' console');
      });
      if ((counts['sab_reactor'] || 0) < 2) console.warn('[maps] ' + def.id + ' needs 2 sab_reactor consoles');
      if ((counts['sab_o2'] || 0) < 2) console.warn('[maps] ' + def.id + ' needs 2 sab_o2 keypads');
      ['emergency', 'admin', 'cams', 'vitals'].forEach(function (k) {
        if (!map.devices.some(function (d) { return d.kind === k; })) {
          console.warn('[maps] ' + def.id + ' missing device ' + k);
        }
      });
    }
    if (map.isSolid(map.spawn.tx, map.spawn.ty)) console.warn('[maps] ' + def.id + ' spawn is solid!');

    return map;
  }

  AL.maps = {
    register: function (def) {
      defs[def.id] = def;
      delete cache[def.id];
    },
    list: function () {
      return Object.keys(defs).map(function (id) {
        var d = defs[id];
        return { id: d.id, name: d.name, sizeLabel: d.sizeLabel, modes: d.modes || ['all'] };
      });
    },
    getDef: function (id) { return defs[id] || null; },
    load: function (id) {
      if (!defs[id]) return null;
      if (!cache[id]) cache[id] = parse(defs[id]);
      return cache[id];
    },
    // fresh (uncached) copy — game uses this so door state doesn't leak between rounds
    loadFresh: function (id) {
      if (!defs[id]) return null;
      cache[id] = parse(defs[id]);
      return cache[id];
    },
  };
})();
