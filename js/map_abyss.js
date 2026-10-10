/* Outcast — map_abyss.js: 'Abyss Station' — deep-sea research base, medium-large */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var W = 80, H = 50;
  var g = [];
  for (var y = 0; y < H; y++) g.push(new Array(W).fill(' '));
  function rect(x, yy, w, h, ch) {
    for (var j = yy; j < yy + h; j++) {
      for (var i = x; i < x + w; i++) {
        if (i >= 0 && j >= 0 && i < W && j < H) g[j][i] = ch;
      }
    }
  }

  // ---- rooms ----
  rect(10, 6, 13, 9, '.');   // aquarium
  rect(26, 7, 6, 6, '.');    // archive
  rect(34, 5, 12, 8, '.');   // medbay
  rect(58, 6, 13, 8, '.');   // sonar
  rect(10, 20, 11, 8, '.');  // quarters
  rect(34, 20, 14, 10, '.'); // moonpool (hub)
  rect(60, 20, 12, 8, '.');  // galley
  rect(8, 32, 13, 9, '.');   // kelp cultivation
  rect(34, 37, 12, 9, '.');  // reactor
  rect(58, 34, 14, 9, '.');  // sub dock

  // the moon pool itself (water, walkable ledge visual)
  rect(38, 23, 6, 4, '~');

  // corner bites for organic hull shapes
  rect(10, 6, 2, 1, ' '); rect(21, 6, 2, 1, ' '); rect(10, 14, 2, 1, ' '); rect(21, 14, 2, 1, ' ');
  rect(58, 6, 2, 1, ' '); rect(69, 6, 2, 1, ' '); rect(58, 13, 2, 1, ' '); rect(69, 13, 2, 1, ' ');
  rect(8, 32, 2, 1, ' '); rect(19, 40, 2, 1, ' '); rect(8, 40, 2, 1, ' '); rect(19, 32, 2, 1, ' ');
  rect(58, 34, 2, 1, ' '); rect(70, 42, 2, 1, ' '); rect(58, 42, 2, 1, ' '); rect(70, 34, 2, 1, ' ');
  rect(34, 20, 1, 1, ' '); rect(47, 20, 1, 1, ' '); rect(34, 29, 1, 1, ' '); rect(47, 29, 1, 1, ' ');

  // ---- glass tube tunnels ('~' = glass walkway) ----
  rect(23, 9, 3, 3, '~');    // aquarium -> archive
  rect(32, 9, 2, 3, '~');    // archive -> medbay
  rect(46, 8, 12, 3, '~');   // medbay -> sonar
  rect(21, 23, 13, 3, '~');  // quarters -> moonpool
  rect(48, 23, 12, 3, '~');  // moonpool -> galley
  rect(39, 13, 3, 7, '~');   // medbay -> moonpool
  rect(39, 30, 3, 7, '~');   // moonpool -> reactor
  rect(14, 15, 3, 5, '~');   // aquarium -> quarters
  rect(21, 38, 13, 3, '~');  // kelp -> reactor
  rect(12, 28, 3, 4, '~');   // quarters -> kelp
  rect(64, 28, 3, 6, '~');   // galley -> sub dock
  rect(46, 38, 12, 3, '~');  // reactor -> sub dock
  rect(64, 14, 3, 6, '~');   // sonar -> galley

  // ---- enclose with walls ----
  var out = [];
  for (var yy2 = 0; yy2 < H; yy2++) {
    var row = '';
    for (var xx = 0; xx < W; xx++) {
      var ch = g[yy2][xx];
      if (ch === ' ') {
        var near = false;
        for (var dy = -1; dy <= 1 && !near; dy++) for (var dx = -1; dx <= 1 && !near; dx++) {
          var nx = xx + dx, ny = yy2 + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
            var nc = g[ny][nx];
            if (nc === '.' || nc === '~') near = true;
          }
        }
        if (near) ch = '#';
      }
      row += ch;
    }
    out.push(row);
  }

  AL.maps.register({
    id: 'abyss',
    name: 'Abyss Station',
    sizeLabel: 'Medium+',
    modes: ['classic', 'hideseek', 'outbreak', 'sprint'],
    palette: {
      floor: '#1f4550', floorAlt: '#1a3a44', wall: '#0d2229',
      wallEdge: '#3d7a8c', accent: '#3ee06f', bg: 'ocean',
    },
    grid: out,
    rooms: [
      { id: 'aquarium', name: 'Aquarium',    rects: [[10, 6, 13, 9]] },
      { id: 'archive',  name: 'Archive',     rects: [[26, 7, 6, 6]] },
      { id: 'medbay',   name: 'Medbay',      rects: [[34, 5, 12, 8]] },
      { id: 'sonar',    name: 'Sonar',       rects: [[58, 6, 13, 8]] },
      { id: 'quarters', name: 'Quarters',    rects: [[10, 20, 11, 8]] },
      { id: 'moonpool', name: 'Moon Pool',   rects: [[34, 20, 14, 10]] },
      { id: 'galley',   name: 'Galley',      rects: [[60, 20, 12, 8]] },
      { id: 'kelp',     name: 'Kelp Farm',   rects: [[8, 32, 13, 9]] },
      { id: 'reactor',  name: 'Reactor',     rects: [[34, 37, 12, 9]] },
      { id: 'subdock',  name: 'Sub Dock',    rects: [[58, 34, 14, 9]] },
    ],
    spawn: { tx: 41, ty: 27 },
    vents: [
      { id: 'va_aqu', tx: 12, ty: 8 },  { id: 'va_med', tx: 36, ty: 6 },  { id: 'va_son', tx: 60, ty: 8 },
      { id: 'va_arc', tx: 27, ty: 8 },
      { id: 'va_qtr', tx: 12, ty: 26 }, { id: 'va_pool', tx: 36, ty: 28 }, { id: 'va_kelp', tx: 10, ty: 38 },
      { id: 'va_rea', tx: 36, ty: 44 }, { id: 'va_dock', tx: 60, ty: 41 }, { id: 'va_gal', tx: 70, ty: 26 },
    ],
    ventLinks: [
      ['va_aqu', 'va_med', 'va_son', 'va_arc'],
      ['va_qtr', 'va_pool', 'va_kelp'],
      ['va_rea', 'va_dock', 'va_gal'],
    ],
    taskSpots: [
      { id: 'as1',  task: 'filter',    room: 'aquarium', tx: 12, ty: 12 },
      { id: 'as2',  task: 'wires',     room: 'aquarium', tx: 20, ty: 7 },
      { id: 'as3',  task: 'chart',     room: 'aquarium', tx: 16, ty: 6 },
      { id: 'as4',  task: 'unlock',    room: 'archive',  tx: 28, ty: 12 },
      { id: 'as5',  task: 'upload',    room: 'archive',  tx: 29, ty: 8 },
      { id: 'as6',  task: 'scan',      room: 'medbay',   tx: 37, ty: 7 },
      { id: 'as7',  task: 'swipe',     room: 'medbay',   tx: 44, ty: 11 },
      { id: 'as8',  task: 'upload',    room: 'sonar',    tx: 68, ty: 7 },
      { id: 'as9',  task: 'steer',     room: 'sonar',    tx: 66, ty: 12 },
      { id: 'as10', task: 'shields',   room: 'sonar',    tx: 60, ty: 12 },
      { id: 'as11', task: 'trash',     room: 'quarters', tx: 11, ty: 21 },
      { id: 'as12', task: 'wires',     room: 'quarters', tx: 19, ty: 26 },
      { id: 'as13', task: 'fuel',      room: 'moonpool', tx: 35, ty: 21 },
      { id: 'as14', task: 'divert',    room: 'moonpool', tx: 46, ty: 28 },
      { id: 'as15', task: 'swipe',     room: 'galley',   tx: 61, ty: 21 },
      { id: 'as16', task: 'upload',    room: 'galley',   tx: 61, ty: 26 },
      { id: 'as17', task: 'trash',     room: 'galley',   tx: 70, ty: 21 },
      { id: 'as18', task: 'wires',     room: 'kelp',     tx: 14, ty: 36 },
      { id: 'as19', task: 'filter',    room: 'kelp',     tx: 10, ty: 36 },
      { id: 'as20', task: 'fuel',      room: 'kelp',     tx: 18, ty: 39 },
      { id: 'as21', task: 'calibrate', room: 'reactor',  tx: 36, ty: 42 },
      { id: 'as22', task: 'unlock',    room: 'reactor',  tx: 43, ty: 42 },
      { id: 'as23', task: 'divert',    room: 'reactor',  tx: 44, ty: 44 },
      { id: 'as24', task: 'asteroids', room: 'subdock',  tx: 64, ty: 37 },
      { id: 'as25', task: 'steer',     room: 'subdock',  tx: 60, ty: 36 },
      { id: 'as26', task: 'calibrate', room: 'subdock',  tx: 68, ty: 40 },
      { id: 'as27', task: 'chart',     room: 'subdock',  tx: 70, ty: 37 },
      // sabotage consoles
      { id: 'asl1', task: 'sab_lights',  room: 'reactor', tx: 34, ty: 43 },
      { id: 'asr1', task: 'sab_reactor', room: 'reactor', tx: 36, ty: 39 },
      { id: 'asr2', task: 'sab_reactor', room: 'reactor', tx: 43, ty: 39 },
      { id: 'aso1', task: 'sab_o2',      room: 'medbay',  tx: 35, ty: 12 },
      { id: 'aso2', task: 'sab_o2',      room: 'subdock', tx: 69, ty: 41 },
      { id: 'asc1', task: 'sab_comms',   room: 'sonar',   tx: 62, ty: 8 },
    ],
    devices: [
      { kind: 'emergency', tx: 41, ty: 21, room: 'moonpool' },
      { kind: 'admin',     tx: 44, ty: 22, room: 'moonpool' },
      { kind: 'cams',      tx: 64, ty: 8,  room: 'sonar' },
      { kind: 'vitals',    tx: 40, ty: 6,  room: 'medbay' },
    ],
    doors: [
      { id: 'da_pool_w', room: 'moonpool', tiles: [[33, 23], [33, 24], [33, 25]] },
      { id: 'da_gal_w',  room: 'galley',   tiles: [[59, 23], [59, 24], [59, 25]] },
      { id: 'da_med_s',  room: 'medbay',   tiles: [[39, 13], [40, 13], [41, 13]] },
      { id: 'da_rea_n',  room: 'reactor',  tiles: [[39, 36], [40, 36], [41, 36]] },
      { id: 'da_rea_e',  room: 'reactor',  tiles: [[46, 38], [46, 39], [46, 40]] },
      { id: 'da_kelp_e', room: 'kelp',     tiles: [[21, 38], [21, 39], [21, 40]] },
      { id: 'da_qtr_n',  room: 'quarters', tiles: [[14, 19], [15, 19], [16, 19]] },
      { id: 'da_gal_n',  room: 'galley',   tiles: [[64, 19], [65, 19], [66, 19]] },
    ],
    decor: [
      { kind: 'glass', tx: 11, ty: 7, w: 2, h: 2 }, { kind: 'coral', tx: 21, ty: 12 },
      { kind: 'coral', tx: 13, ty: 13 }, { kind: 'seaweed', tx: 18, ty: 12 }, { kind: 'console', tx: 17, ty: 10 },
      { kind: 'shelf', tx: 27, ty: 7 }, { kind: 'shelf', tx: 30, ty: 7 }, { kind: 'lamp', tx: 30, ty: 11 },
      { kind: 'bed', tx: 35, ty: 6 }, { kind: 'glass', tx: 37, ty: 6 }, { kind: 'console', tx: 43, ty: 5 },
      { kind: 'screen', tx: 60, ty: 6 }, { kind: 'screen', tx: 62, ty: 6 }, { kind: 'console', tx: 66, ty: 10 },
      { kind: 'wires', tx: 69, ty: 12 },
      { kind: 'bed', tx: 11, ty: 22 }, { kind: 'bed', tx: 11, ty: 24 }, { kind: 'locker', tx: 17, ty: 20 },
      { kind: 'locker', tx: 19, ty: 20 }, { kind: 'rug', tx: 15, ty: 23, w: 3, h: 2 },
      { kind: 'lamp', tx: 35, ty: 20 }, { kind: 'crate', tx: 46, ty: 21 }, { kind: 'pipes', tx: 34, ty: 28 },
      { kind: 'table', tx: 62, ty: 23, w: 3, h: 2 }, { kind: 'chair', tx: 61, ty: 23 }, { kind: 'chair', tx: 65, ty: 24 },
      { kind: 'shelf', tx: 69, ty: 20 }, { kind: 'barrel', tx: 70, ty: 25 },
      { kind: 'seaweed', tx: 10, ty: 33 }, { kind: 'seaweed', tx: 13, ty: 38 }, { kind: 'seaweed', tx: 17, ty: 34 },
      { kind: 'coral', tx: 19, ty: 38 }, { kind: 'plant', tx: 15, ty: 33 }, { kind: 'barrel', tx: 9, ty: 34 },
      { kind: 'engine', tx: 38, ty: 40, w: 2, h: 2 }, { kind: 'pipes', tx: 35, ty: 38 }, { kind: 'pipes', tx: 44, ty: 38 },
      { kind: 'crystal', tx: 43, ty: 44 },
      { kind: 'engine', tx: 63, ty: 39, w: 3, h: 2 }, { kind: 'crate', tx: 59, ty: 35 }, { kind: 'crate', tx: 68, ty: 35 },
      { kind: 'barrel', tx: 71, ty: 39 }, { kind: 'wires', tx: 59, ty: 42 },
    ],
  });
})();
