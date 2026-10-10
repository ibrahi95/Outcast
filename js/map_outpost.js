/* Outcast — map_outpost.js: 'Lunar Outpost' — moon base, medium */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var W = 78, H = 48;
  var g = [];
  for (var y = 0; y < H; y++) g.push(new Array(W).fill(' '));
  function rect(x, yy, w, h, ch) {
    for (var j = yy; j < yy + h; j++) {
      for (var i = x; i < x + w; i++) {
        if (i >= 0 && j >= 0 && i < W && j < H) g[j][i] = ch;
      }
    }
  }

  // ---- rooms (domes) ----
  rect(8, 6, 12, 8, '.');    // quarters
  rect(8, 20, 10, 7, '.');   // medbay
  rect(8, 32, 12, 9, '.');   // greenhouse
  rect(33, 4, 14, 9, '.');   // ops
  rect(34, 20, 12, 8, '.');  // hub (atrium)
  rect(33, 35, 13, 9, '.');  // power
  rect(60, 6, 12, 8, '.');   // lab
  rect(60, 21, 11, 7, '.');  // comms
  rect(60, 34, 12, 8, '.');  // garage
  rect(48, 6, 10, 9, '~');   // surface yard (regolith)

  // dome corner bites for a rounded feel
  rect(8, 6, 2, 1, ' '); rect(18, 6, 2, 1, ' '); rect(8, 13, 2, 1, ' '); rect(18, 13, 2, 1, ' ');
  rect(33, 4, 2, 1, ' '); rect(45, 4, 2, 1, ' '); rect(33, 12, 1, 1, ' '); rect(46, 12, 1, 1, ' ');
  rect(8, 32, 2, 1, ' '); rect(18, 40, 2, 1, ' '); rect(8, 40, 2, 1, ' '); rect(18, 32, 2, 1, ' ');
  rect(60, 6, 2, 1, ' '); rect(70, 6, 2, 1, ' '); rect(60, 13, 2, 1, ' '); rect(70, 13, 2, 1, ' ');
  rect(60, 34, 2, 1, ' '); rect(70, 41, 2, 1, ' ');

  // ---- tube corridors (3 wide) ----
  rect(20, 9, 13, 3, '.');   // quarters -> ops
  rect(18, 23, 16, 3, '.');  // medbay -> hub
  rect(20, 36, 13, 3, '.');  // greenhouse -> power
  rect(12, 14, 3, 6, '.');   // quarters -> medbay
  rect(12, 27, 3, 5, '.');   // medbay -> greenhouse
  rect(39, 13, 3, 7, '.');   // ops -> hub
  rect(39, 28, 3, 7, '.');   // hub -> power
  rect(47, 9, 1, 3, '.');    // ops -> surface yard
  rect(58, 9, 2, 3, '.');    // surface yard -> lab
  rect(46, 23, 14, 3, '.');  // hub -> comms
  rect(46, 38, 14, 3, '.');  // power -> garage
  rect(65, 14, 3, 7, '.');   // lab -> comms
  rect(65, 28, 3, 6, '.');   // comms -> garage

  // regolith patches inside yard already '~'; small dust patch in hub
  rect(37, 22, 3, 2, '~');

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
    id: 'outpost',
    name: 'Lunar Outpost',
    sizeLabel: 'Medium',
    modes: ['classic', 'hideseek', 'outbreak', 'sprint'],
    palette: {
      floor: '#4a4a52', floorAlt: '#3e3e46', wall: '#232329',
      wallEdge: '#6b6b78', accent: '#ff9d2e', bg: 'planet',
    },
    grid: out,
    rooms: [
      { id: 'quarters',   name: 'Quarters',    rects: [[8, 6, 12, 8]] },
      { id: 'medbay',     name: 'Medbay',      rects: [[8, 20, 10, 7]] },
      { id: 'greenhouse', name: 'Greenhouse',  rects: [[8, 32, 12, 9]] },
      { id: 'ops',        name: 'Ops Center',  rects: [[33, 4, 14, 9]] },
      { id: 'hub',        name: 'Atrium',      rects: [[34, 20, 12, 8]] },
      { id: 'power',      name: 'Power Plant', rects: [[33, 35, 13, 9]] },
      { id: 'lab',        name: 'Laboratory',  rects: [[60, 6, 12, 8]] },
      { id: 'comms',      name: 'Comms Dome',  rects: [[60, 21, 11, 7]] },
      { id: 'garage',     name: 'Garage',      rects: [[60, 34, 12, 8]] },
      { id: 'surface',    name: 'The Surface', rects: [[48, 6, 10, 9]] },
    ],
    spawn: { tx: 40, ty: 25 },
    vents: [
      { id: 'vo_qtr', tx: 10, ty: 7 }, { id: 'vo_hub', tx: 36, ty: 21 }, { id: 'vo_med', tx: 9, ty: 22 },
      { id: 'vo_ops', tx: 44, ty: 5 }, { id: 'vo_lab', tx: 62, ty: 7 }, { id: 'vo_srf', tx: 55, ty: 12 },
      { id: 'vo_grn', tx: 10, ty: 39 }, { id: 'vo_pow', tx: 35, ty: 42 }, { id: 'vo_gar', tx: 62, ty: 40 },
      { id: 'vo_com', tx: 68, ty: 26 }, { id: 'vo_ops2', tx: 34, ty: 11 },
    ],
    ventLinks: [
      ['vo_qtr', 'vo_hub', 'vo_med'],
      ['vo_ops', 'vo_lab', 'vo_srf'],
      ['vo_grn', 'vo_pow', 'vo_gar'],
      ['vo_com', 'vo_ops2'],
    ],
    taskSpots: [
      { id: 'os1',  task: 'wires',     room: 'quarters',   tx: 18, ty: 7 },
      { id: 'os2',  task: 'trash',     room: 'quarters',   tx: 9,  ty: 12 },
      { id: 'os3',  task: 'scan',      room: 'medbay',     tx: 12, ty: 22 },
      { id: 'os4',  task: 'shields',   room: 'medbay',     tx: 14, ty: 25 },
      { id: 'os5',  task: 'wires',     room: 'greenhouse', tx: 16, ty: 33 },
      { id: 'os6',  task: 'filter',    room: 'greenhouse', tx: 10, ty: 34 },
      { id: 'os7',  task: 'fuel',      room: 'greenhouse', tx: 17, ty: 38 },
      { id: 'os8',  task: 'upload',    room: 'ops',        tx: 36, ty: 6 },
      { id: 'os9',  task: 'swipe',     room: 'ops',        tx: 42, ty: 6 },
      { id: 'os10', task: 'chart',     room: 'ops',        tx: 44, ty: 10 },
      { id: 'os11', task: 'upload',    room: 'hub',        tx: 43, ty: 26 },
      { id: 'os12', task: 'steer',     room: 'hub',        tx: 35, ty: 26 },
      { id: 'os13', task: 'trash',     room: 'hub',        tx: 44, ty: 21 },
      { id: 'os14', task: 'fuel',      room: 'power',      tx: 36, ty: 41 },
      { id: 'os15', task: 'divert',    room: 'power',      tx: 42, ty: 41 },
      { id: 'os16', task: 'calibrate', room: 'power',      tx: 34, ty: 41 },
      { id: 'os17', task: 'unlock',    room: 'lab',        tx: 63, ty: 10 },
      { id: 'os18', task: 'calibrate', room: 'lab',        tx: 70, ty: 8 },
      { id: 'os19', task: 'upload',    room: 'comms',      tx: 68, ty: 23 },
      { id: 'os20', task: 'chart',     room: 'comms',      tx: 61, ty: 26 },
      { id: 'os21', task: 'asteroids', room: 'garage',     tx: 66, ty: 38 },
      { id: 'os22', task: 'steer',     room: 'garage',     tx: 62, ty: 36 },
      { id: 'os23', task: 'swipe',     room: 'garage',     tx: 69, ty: 40 },
      { id: 'os24', task: 'wires',     room: 'surface',    tx: 52, ty: 8 },
      { id: 'os25', task: 'divert',    room: 'surface',    tx: 55, ty: 13 },
      // sabotage consoles
      { id: 'osl1', task: 'sab_lights',  room: 'power',  tx: 33, ty: 40 },
      { id: 'osr1', task: 'sab_reactor', room: 'power',  tx: 35, ty: 37 },
      { id: 'osr2', task: 'sab_reactor', room: 'power',  tx: 43, ty: 37 },
      { id: 'oso1', task: 'sab_o2',      room: 'medbay', tx: 9,  ty: 25 },
      { id: 'oso2', task: 'sab_o2',      room: 'lab',    tx: 61, ty: 12 },
      { id: 'osc1', task: 'sab_comms',   room: 'comms',  tx: 63, ty: 24 },
    ],
    devices: [
      { kind: 'emergency', tx: 40, ty: 22, room: 'hub' },
      { kind: 'admin',     tx: 37, ty: 7,  room: 'ops' },
      { kind: 'cams',      tx: 44, ty: 8,  room: 'ops' },
      { kind: 'vitals',    tx: 66, ty: 9,  room: 'lab' },
    ],
    doors: [
      { id: 'do_qtr', room: 'quarters',   tiles: [[20, 9], [20, 10], [20, 11]] },
      { id: 'do_med', room: 'medbay',     tiles: [[18, 23], [18, 24], [18, 25]] },
      { id: 'do_ops', room: 'ops',        tiles: [[39, 13], [40, 13], [41, 13]] },
      { id: 'do_pow', room: 'power',      tiles: [[39, 34], [40, 34], [41, 34]] },
      { id: 'do_hub', room: 'hub',        tiles: [[46, 23], [46, 24], [46, 25]] },
      { id: 'do_gar', room: 'garage',     tiles: [[59, 38], [59, 39], [59, 40]] },
      { id: 'do_grn', room: 'greenhouse', tiles: [[20, 36], [20, 37], [20, 38]] },
    ],
    decor: [
      { kind: 'bed', tx: 9, ty: 7 }, { kind: 'bed', tx: 9, ty: 9 },
      { kind: 'locker', tx: 13, ty: 6 }, { kind: 'locker', tx: 15, ty: 6 }, { kind: 'rug', tx: 13, ty: 10, w: 3, h: 2 },
      { kind: 'bed', tx: 16, ty: 21 }, { kind: 'glass', tx: 12, ty: 21 }, { kind: 'console', tx: 9, ty: 20 },
      { kind: 'plant', tx: 9, ty: 33 }, { kind: 'plant', tx: 12, ty: 36 }, { kind: 'plant', tx: 15, ty: 34 },
      { kind: 'plant', tx: 18, ty: 36 }, { kind: 'barrel', tx: 9, ty: 39 },
      { kind: 'console', tx: 35, ty: 5 }, { kind: 'screen', tx: 39, ty: 4 }, { kind: 'screen', tx: 41, ty: 4 },
      { kind: 'table', tx: 39, ty: 9, w: 2, h: 1 }, { kind: 'chair', tx: 38, ty: 9 },
      { kind: 'table', tx: 38, ty: 24, w: 3, h: 2 }, { kind: 'lamp', tx: 35, ty: 20 }, { kind: 'chair', tx: 37, ty: 23 },
      { kind: 'engine', tx: 38, ty: 36, w: 2, h: 2 }, { kind: 'pipes', tx: 34, ty: 35 }, { kind: 'pipes', tx: 44, ty: 35 },
      { kind: 'barrel', tx: 44, ty: 43 },
      { kind: 'glass', tx: 65, ty: 7 }, { kind: 'screen', tx: 68, ty: 6 }, { kind: 'shelf', tx: 61, ty: 6 },
      { kind: 'console', tx: 65, ty: 22 }, { kind: 'screen', tx: 66, ty: 21 }, { kind: 'wires', tx: 61, ty: 22 },
      { kind: 'crate', tx: 62, ty: 38 }, { kind: 'crate', tx: 64, ty: 41 }, { kind: 'barrel', tx: 70, ty: 35 },
      { kind: 'engine', tx: 67, ty: 35, w: 2, h: 2 }, { kind: 'wires', tx: 61, ty: 34 },
      { kind: 'rock', tx: 50, ty: 7 }, { kind: 'rock', tx: 56, ty: 10 }, { kind: 'rock', tx: 51, ty: 12 },
      { kind: 'crystal', tx: 54, ty: 7 }, { kind: 'lamp', tx: 53, ty: 10 },
    ],
  });
})();
