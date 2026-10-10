/* Outcast - map_vessel.js: 'The Vessel', the flagship large ship map.
   Classic Skeld-style flow: central cafeteria, west engine wing, south-east comms,
   east navigation, north-east weapons. Grid is assembled procedurally from room and
   corridor rects so the registered room rects always match the walkable floor. */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var W = 96, H = 54;

  /* ---- rooms (tile rects [x, y, w, h]) ---- */
  var ROOMS = [
    { id: 'cafeteria',  name: 'Cafeteria',    rect: [36, 3, 22, 13] },
    { id: 'weapons',    name: 'Weapons',      rect: [66, 3, 11, 8] },
    { id: 'o2',         name: 'O2',           rect: [61, 13, 7, 6] },
    { id: 'navigation', name: 'Navigation',   rect: [84, 17, 9, 11] },
    { id: 'shields',    name: 'Shields',      rect: [66, 31, 10, 8] },
    { id: 'comms',      name: 'Comms',        rect: [52, 42, 10, 8] },
    { id: 'storage',    name: 'Storage',      rect: [38, 32, 12, 15] },
    { id: 'admin',      name: 'Admin',        rect: [53, 20, 10, 8] },
    { id: 'electrical', name: 'Electrical',   rect: [24, 31, 10, 8] },
    { id: 'lowereng',   name: 'Lower Engine', rect: [4, 36, 10, 11] },
    { id: 'uppereng',   name: 'Upper Engine', rect: [4, 4, 10, 11] },
    { id: 'reactor',    name: 'Reactor',      rect: [3, 19, 9, 12] },
    { id: 'security',   name: 'Security',     rect: [19, 20, 6, 8] },
    { id: 'medbay',     name: 'MedBay',       rect: [26, 17, 9, 9] },
  ];

  /* ---- corridors (alt-tinted floor) ---- */
  var HALLS = [
    [58, 5, 8, 3],    // cafeteria east -> weapons
    [70, 11, 3, 10],  // weapons south spine
    [68, 14, 2, 3],   // o2 -> spine
    [70, 21, 14, 3],  // spine east -> navigation
    [80, 24, 3, 7],   // navigation-side drop toward shields
    [76, 31, 8, 3],   // -> shields east door
    [69, 39, 3, 3],   // shields south stub
    [62, 42, 10, 3],  // -> comms east door
    [50, 43, 2, 3],   // comms -> storage
    [54, 16, 3, 4],   // cafeteria south -> admin
    [41, 16, 3, 16],  // cafeteria south long hall -> storage
    [44, 25, 9, 3],   // long hall -> admin west door
    [14, 8, 22, 3],   // cafeteria west -> upper engine
    [29, 11, 3, 6],   // west hall -> medbay
    [14, 12, 3, 26],  // west spine: upper engine -> lower engine
    [12, 23, 2, 3],   // spine -> reactor
    [17, 22, 2, 3],   // spine -> security
    [14, 40, 24, 3],  // lower engine -> storage (past electrical)
    [28, 39, 3, 1],   // electrical doorway onto south hall
  ];

  /* ---- build the ascii grid ---- */
  var cells = [];
  var x, y, i;
  for (y = 0; y < H; y++) {
    var row = [];
    for (x = 0; x < W; x++) row.push(' ');
    cells.push(row);
  }
  function carve(r, ch) {
    for (var yy = r[1]; yy < r[1] + r[3]; yy++) {
      for (var xx = r[0]; xx < r[0] + r[2]; xx++) cells[yy][xx] = ch;
    }
  }
  for (i = 0; i < ROOMS.length; i++) carve(ROOMS[i].rect, '.');
  for (i = 0; i < HALLS.length; i++) carve(HALLS[i], '~');

  // decorative alt-floor accents (still walkable floor)
  for (y = 3; y < 16; y++) {           // cafeteria central platform ring
    for (x = 36; x < 58; x++) {
      var dx = x + 0.5 - 46.5, dy = y + 0.5 - 9.5;
      if (dx * dx + dy * dy <= 6.8) cells[y][x] = '~';
    }
  }
  carve([6, 6, 4, 3], '~');            // upper engine pad
  carve([6, 40, 4, 3], '~');           // lower engine pad
  carve([5, 22, 5, 5], '~');           // reactor core pad

  // auto-wall: every void tile touching floor (8-neighborhood) becomes hull wall
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      if (cells[y][x] !== ' ') continue;
      var near = false;
      for (var oy = -1; oy <= 1 && !near; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var ty = y + oy, tx = x + ox;
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          var c = cells[ty][tx];
          if (c === '.' || c === '~') { near = true; break; }
        }
      }
      if (near) cells[y][x] = '#';
    }
  }
  var grid = [];
  for (y = 0; y < H; y++) grid.push(cells[y].join(''));

  /* ---- register ---- */
  AL.maps.register({
    id: 'vessel',
    name: 'The Vessel',
    sizeLabel: 'Large',
    modes: ['classic', 'hideseek', 'outbreak', 'sprint'],
    palette: {
      floor: '#3b4668', floorAlt: '#333d5c',
      wall: '#1b2033', wallEdge: '#525f8f',
      accent: '#35e0ff', bg: 'space',
    },
    grid: grid,
    rooms: ROOMS.map(function (r) { return { id: r.id, name: r.name, rects: [r.rect] }; }),
    spawn: { tx: 46, ty: 9 },

    vents: [
      { id: 'v_reactor',    tx: 5,  ty: 21 },
      { id: 'v_uppereng',   tx: 6,  ty: 13 },
      { id: 'v_lowereng',   tx: 6,  ty: 37 },
      { id: 'v_medbay',     tx: 33, ty: 24 },
      { id: 'v_security',   tx: 23, ty: 26 },
      { id: 'v_electrical', tx: 32, ty: 37 },
      { id: 'v_cafeteria',  tx: 56, ty: 4 },
      { id: 'v_admin',      tx: 61, ty: 26 },
      { id: 'v_storage',    tx: 48, ty: 45 },
      { id: 'v_weapons',    tx: 75, ty: 4 },
      { id: 'v_nav_n',      tx: 91, ty: 18 },
      { id: 'v_nav_s',      tx: 91, ty: 26 },
      { id: 'v_shields',    tx: 74, ty: 37 },
    ],
    ventLinks: [
      ['v_reactor', 'v_uppereng', 'v_lowereng'],
      ['v_medbay', 'v_security', 'v_electrical'],
      ['v_cafeteria', 'v_admin', 'v_storage'],
      ['v_weapons', 'v_nav_n'],
      ['v_shields', 'v_nav_s'],
    ],

    taskSpots: [
      // wires (common) x4
      { id: 'ts_wires_elec',    task: 'wires',    room: 'electrical', tx: 25, ty: 34 },
      { id: 'ts_wires_storage', task: 'wires',    room: 'storage',    tx: 39, ty: 33 },
      { id: 'ts_wires_sec',     task: 'wires',    room: 'security',   tx: 20, ty: 21 },
      { id: 'ts_wires_caf',     task: 'wires',    room: 'cafeteria',  tx: 37, ty: 4 },
      // upload (long) x4
      { id: 'ts_upload_admin',  task: 'upload',   room: 'admin',      tx: 58, ty: 21 },
      { id: 'ts_upload_comms',  task: 'upload',   room: 'comms',      tx: 53, ty: 44 },
      { id: 'ts_upload_weap',   task: 'upload',   room: 'weapons',    tx: 67, ty: 4 },
      { id: 'ts_upload_nav',    task: 'upload',   room: 'navigation', tx: 85, ty: 19 },
      // the one visual scan
      { id: 'ts_scan',          task: 'scan',     room: 'medbay',     tx: 30, ty: 21 },
      // spread of everything else
      { id: 'ts_swipe_admin',   task: 'swipe',    room: 'admin',      tx: 60, ty: 25 },
      { id: 'ts_asteroids',     task: 'asteroids', room: 'weapons',   tx: 71, ty: 6 },
      { id: 'ts_shields',       task: 'shields',  room: 'shields',    tx: 70, ty: 34 },
      { id: 'ts_calib_upper',   task: 'calibrate', room: 'uppereng',  tx: 11, ty: 6 },
      { id: 'ts_calib_lower',   task: 'calibrate', room: 'lowereng',  tx: 11, ty: 45 },
      { id: 'ts_chart_nav',     task: 'chart',    room: 'navigation', tx: 89, ty: 22 },
      { id: 'ts_steer_nav',     task: 'steer',    room: 'navigation', tx: 87, ty: 26 },
      { id: 'ts_filter_o2',     task: 'filter',   room: 'o2',         tx: 62, ty: 14 },
      { id: 'ts_fuel_upper',    task: 'fuel',     room: 'uppereng',   tx: 5,  ty: 10 },
      { id: 'ts_fuel_lower',    task: 'fuel',     room: 'lowereng',   tx: 5,  ty: 44 },
      { id: 'ts_divert_elec',   task: 'divert',   room: 'electrical', tx: 30, ty: 32 },
      { id: 'ts_divert_react',  task: 'divert',   room: 'reactor',    tx: 9,  ty: 29 },
      { id: 'ts_unlock_react',  task: 'unlock',   room: 'reactor',    tx: 9,  ty: 20 },
      { id: 'ts_unlock_comms',  task: 'unlock',   room: 'comms',      tx: 59, ty: 48 },
      { id: 'ts_trash_storage', task: 'trash',    room: 'storage',    tx: 44, ty: 46 },
      { id: 'ts_trash_caf',     task: 'trash',    room: 'cafeteria',  tx: 56, ty: 14 },
      // sabotage-fix consoles
      { id: 'ss_lights',        task: 'sab_lights',  room: 'electrical', tx: 28, ty: 37 },
      { id: 'ss_comms',         task: 'sab_comms',   room: 'comms',      tx: 57, ty: 43 },
      { id: 'ss_reactor_a',     task: 'sab_reactor', room: 'reactor',    tx: 4,  ty: 22 },
      { id: 'ss_reactor_b',     task: 'sab_reactor', room: 'reactor',    tx: 4,  ty: 27 },
      { id: 'ss_o2_a',          task: 'sab_o2',      room: 'o2',         tx: 66, ty: 17 },
      { id: 'ss_o2_b',          task: 'sab_o2',      room: 'admin',      tx: 54, ty: 26 },
    ],

    devices: [
      { kind: 'emergency', tx: 46, ty: 9,  room: 'cafeteria' },
      { kind: 'admin',     tx: 57, ty: 23, room: 'admin' },
      { kind: 'cams',      tx: 21, ty: 23, room: 'security' },
      { kind: 'vitals',    tx: 27, ty: 18, room: 'medbay' },
    ],

    doors: [
      { id: 'd_caf_e',      room: 'cafeteria',  tiles: [[58, 5], [58, 6], [58, 7]] },
      { id: 'd_caf_w',      room: 'cafeteria',  tiles: [[35, 8], [35, 9], [35, 10]] },
      { id: 'd_caf_s',      room: 'cafeteria',  tiles: [[41, 16], [42, 16], [43, 16]] },
      { id: 'd_admin',      room: 'admin',      tiles: [[54, 19], [55, 19], [56, 19]] },
      { id: 'd_medbay',     room: 'medbay',     tiles: [[29, 16], [30, 16], [31, 16]] },
      { id: 'd_security',   room: 'security',   tiles: [[18, 22], [18, 23], [18, 24]] },
      { id: 'd_reactor',    room: 'reactor',    tiles: [[12, 23], [12, 24], [12, 25]] },
      { id: 'd_uppereng_e', room: 'uppereng',   tiles: [[14, 8], [14, 9], [14, 10]] },
      { id: 'd_uppereng_s', room: 'uppereng',   tiles: [[14, 12], [15, 12], [16, 12]] },
      { id: 'd_lowereng_e', room: 'lowereng',   tiles: [[14, 40], [14, 41], [14, 42]] },
      { id: 'd_lowereng_n', room: 'lowereng',   tiles: [[14, 36], [15, 36], [16, 36]] },
      { id: 'd_electrical', room: 'electrical', tiles: [[28, 39], [29, 39], [30, 39]] },
      { id: 'd_storage',    room: 'storage',    tiles: [[41, 31], [42, 31], [43, 31]] },
      { id: 'd_comms',      room: 'comms',      tiles: [[62, 42], [62, 43], [62, 44]] },
    ],

    decor: [
      // cafeteria: dining tables, chairs, central rug under the button
      { kind: 'table', tx: 39, ty: 5, w: 2, h: 2 },
      { kind: 'table', tx: 51, ty: 5, w: 2, h: 2 },
      { kind: 'table', tx: 39, ty: 12, w: 2, h: 2 },
      { kind: 'table', tx: 51, ty: 12, w: 2, h: 2 },
      { kind: 'chair', tx: 38, ty: 6 }, { kind: 'chair', tx: 41, ty: 6 },
      { kind: 'chair', tx: 50, ty: 6 }, { kind: 'chair', tx: 53, ty: 6 },
      { kind: 'chair', tx: 38, ty: 13 }, { kind: 'chair', tx: 41, ty: 13 },
      { kind: 'chair', tx: 50, ty: 13 }, { kind: 'chair', tx: 53, ty: 13 },
      { kind: 'rug', tx: 45, ty: 8, w: 3, h: 3 },
      { kind: 'window', tx: 44, ty: 3, w: 6, h: 1 },
      { kind: 'plant', tx: 36, ty: 3 }, { kind: 'plant', tx: 57, ty: 3 },
      { kind: 'lamp', tx: 36, ty: 15 }, { kind: 'lamp', tx: 57, ty: 15 },
      // medbay: beds + scanner glass + vitals wall
      { kind: 'glass', tx: 29, ty: 20, w: 3, h: 3 },
      { kind: 'bed', tx: 31, ty: 17, w: 2, h: 1 },
      { kind: 'bed', tx: 31, ty: 19, w: 2, h: 1 },
      { kind: 'screen', tx: 26, ty: 17 },
      { kind: 'console', tx: 26, ty: 18 },
      { kind: 'shelf', tx: 26, ty: 25, w: 2, h: 1 },
      { kind: 'plant', tx: 34, ty: 17 },
      // electrical: wire runs, consoles, lockers
      { kind: 'wires', tx: 24, ty: 31, w: 3, h: 1 },
      { kind: 'wires', tx: 31, ty: 31, w: 3, h: 1 },
      { kind: 'console', tx: 29, ty: 31 },
      { kind: 'console', tx: 28, ty: 38 },
      { kind: 'locker', tx: 24, ty: 38 }, { kind: 'locker', tx: 25, ty: 38 },
      { kind: 'crate', tx: 33, ty: 38 },
      // reactor: big core, pipes, twin hold-consoles
      { kind: 'engine', tx: 5, ty: 23, w: 4, h: 4 },
      { kind: 'pipes', tx: 3, ty: 19, w: 4, h: 1 },
      { kind: 'pipes', tx: 8, ty: 30, w: 4, h: 1 },
      { kind: 'console', tx: 4, ty: 22 }, { kind: 'console', tx: 4, ty: 27 },
      { kind: 'lamp', tx: 10, ty: 19 }, { kind: 'barrel', tx: 3, ty: 30 },
      // security: monitor wall + chair
      { kind: 'screen', tx: 19, ty: 20, w: 3, h: 1 },
      { kind: 'console', tx: 21, ty: 22 },
      { kind: 'chair', tx: 21, ty: 24 },
      { kind: 'locker', tx: 24, ty: 20 }, { kind: 'plant', tx: 24, ty: 27 },
      // upper engine
      { kind: 'engine', tx: 6, ty: 6, w: 4, h: 3 },
      { kind: 'pipes', tx: 4, ty: 4, w: 4, h: 1 },
      { kind: 'pipes', tx: 10, ty: 14, w: 4, h: 1 },
      { kind: 'barrel', tx: 12, ty: 12 }, { kind: 'crate', tx: 13, ty: 4 },
      { kind: 'lamp', tx: 4, ty: 14 },
      // lower engine
      { kind: 'engine', tx: 6, ty: 40, w: 4, h: 3 },
      { kind: 'pipes', tx: 4, ty: 36, w: 4, h: 1 },
      { kind: 'pipes', tx: 10, ty: 46, w: 4, h: 1 },
      { kind: 'barrel', tx: 12, ty: 37 }, { kind: 'crate', tx: 12, ty: 44 },
      { kind: 'lamp', tx: 4, ty: 46 },
      // storage: crates and barrels everywhere
      { kind: 'shelf', tx: 38, ty: 32, w: 3, h: 1 },
      { kind: 'crate', tx: 39, ty: 35, w: 2, h: 2 },
      { kind: 'crate', tx: 46, ty: 33, w: 2, h: 2 },
      { kind: 'crate', tx: 39, ty: 42, w: 2, h: 2 },
      { kind: 'barrel', tx: 47, ty: 41 }, { kind: 'barrel', tx: 48, ty: 42 },
      { kind: 'plant', tx: 48, ty: 32 },
      // admin: console table + wall systems
      { kind: 'table', tx: 55, ty: 22, w: 4, h: 2 },
      { kind: 'console', tx: 53, ty: 20, w: 1, h: 2 },
      { kind: 'screen', tx: 58, ty: 20, w: 3, h: 1 },
      { kind: 'console', tx: 54, ty: 26 },
      { kind: 'plant', tx: 62, ty: 20 }, { kind: 'plant', tx: 62, ty: 27 },
      // o2: greenery + filtration
      { kind: 'plant', tx: 61, ty: 13 }, { kind: 'plant', tx: 67, ty: 18 },
      { kind: 'pipes', tx: 64, ty: 13, w: 3, h: 1 },
      { kind: 'console', tx: 66, ty: 17 },
      { kind: 'barrel', tx: 61, ty: 18 },
      // weapons: gunner cockpit + big window
      { kind: 'window', tx: 69, ty: 3, w: 4, h: 1 },
      { kind: 'console', tx: 71, ty: 5 },
      { kind: 'chair', tx: 71, ty: 7 },
      { kind: 'screen', tx: 66, ty: 3, w: 2, h: 1 },
      { kind: 'locker', tx: 76, ty: 10 }, { kind: 'crate', tx: 66, ty: 10 },
      // navigation: helm consoles + starboard window
      { kind: 'window', tx: 92, ty: 19, w: 1, h: 4 },
      { kind: 'console', tx: 88, ty: 21, w: 3, h: 1 },
      { kind: 'console', tx: 86, ty: 25, w: 3, h: 1 },
      { kind: 'console', tx: 85, ty: 18 },
      { kind: 'chair', tx: 89, ty: 23 }, { kind: 'chair', tx: 87, ty: 27 },
      { kind: 'plant', tx: 84, ty: 17 }, { kind: 'screen', tx: 84, ty: 27 },
      // shields
      { kind: 'console', tx: 70, ty: 33 },
      { kind: 'screen', tx: 73, ty: 31, w: 2, h: 1 },
      { kind: 'lamp', tx: 66, ty: 31 },
      { kind: 'crate', tx: 66, ty: 38 }, { kind: 'barrel', tx: 67, ty: 38 },
      // comms: radio wall
      { kind: 'screen', tx: 52, ty: 42, w: 2, h: 1 },
      { kind: 'screen', tx: 54, ty: 42, w: 2, h: 1 },
      { kind: 'console', tx: 57, ty: 43 },
      { kind: 'chair', tx: 58, ty: 45 },
      { kind: 'shelf', tx: 61, ty: 49 }, { kind: 'locker', tx: 52, ty: 49 },
      { kind: 'plant', tx: 61, ty: 42 },
      // corridor dressing
      { kind: 'lamp', tx: 34, ty: 9 },
      { kind: 'lamp', tx: 42, ty: 24 },
      { kind: 'lamp', tx: 71, ty: 15 },
      { kind: 'lamp', tx: 65, ty: 43 },
      { kind: 'lamp', tx: 15, ty: 20 },
      { kind: 'plant', tx: 77, ty: 32 },
      { kind: 'plant', tx: 34, ty: 41 },
      { kind: 'plant', tx: 44, ty: 26 },
    ],
  });
})();
