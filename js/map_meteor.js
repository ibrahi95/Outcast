/* Outcast — map_meteor.js: 'Meteor' — small FFA arena for Bomb Tag */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var W = 38, H = 28;
  var g = [];
  for (var y = 0; y < H; y++) { g.push(new Array(W).fill(' ')); }

  function rect(x, y, w, h, ch) {
    for (var j = y; j < y + h; j++) {
      for (var i = x; i < x + w; i++) {
        if (i >= 0 && j >= 0 && i < W && j < H) g[j][i] = ch;
      }
    }
  }

  // main arena floor with clipped corners for an asteroid-chunk silhouette
  rect(3, 3, 32, 22, '.');
  rect(3, 3, 4, 2, ' '); rect(3, 3, 2, 4, ' ');            // NW bite
  rect(31, 3, 4, 3, ' '); rect(33, 3, 2, 5, ' ');          // NE bite
  rect(3, 22, 5, 3, ' '); rect(3, 20, 2, 5, ' ');          // SW bite
  rect(32, 21, 3, 4, ' '); rect(34, 19, 1, 6, ' ');        // SE bite

  // regolith patches (alt floor)
  rect(9, 5, 6, 3, '~'); rect(23, 19, 6, 3, '~'); rect(27, 8, 4, 3, '~'); rect(7, 17, 4, 3, '~');

  // rock formations (obstacles) — leave the center open for bomb chaos
  rect(10, 9, 3, 2, '#');
  rect(25, 6, 3, 3, '#');
  rect(13, 18, 4, 2, '#');
  rect(24, 14, 2, 4, '#');
  rect(18, 6, 2, 2, '#');
  rect(6, 12, 2, 3, '#');
  rect(30, 12, 2, 2, '#');
  rect(17, 12, 2, 2, '#'); // small center pillar to orbit around

  // enclose: any void 8-adjacent to floor becomes wall
  var out = [];
  for (var yy = 0; yy < H; yy++) {
    var row = '';
    for (var xx = 0; xx < W; xx++) {
      var ch = g[yy][xx];
      if (ch === ' ') {
        var nearFloor = false;
        for (var dy = -1; dy <= 1 && !nearFloor; dy++) {
          for (var dx = -1; dx <= 1 && !nearFloor; dx++) {
            var nx = xx + dx, ny = yy + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
              var nc = g[ny][nx];
              if (nc === '.' || nc === '~') nearFloor = true;
            }
          }
        }
        if (nearFloor) ch = '#';
      }
      row += ch;
    }
    out.push(row);
  }

  AL.maps.register({
    id: 'meteor',
    name: 'Meteor',
    sizeLabel: 'Small',
    modes: ['bombtag'],
    palette: {
      floor: '#4d4038', floorAlt: '#413630', wall: '#241c17',
      wallEdge: '#7a6353', accent: '#ffd23e', bg: 'space',
    },
    grid: out,
    rooms: [
      { id: 'arena', name: 'The Meteor', rects: [[3, 3, 32, 22]] },
    ],
    spawn: { tx: 20, ty: 11 },
    vents: [],
    ventLinks: [],
    taskSpots: [],
    devices: [],
    doors: [],
    decor: [
      { kind: 'rock', tx: 8, ty: 6 }, { kind: 'rock', tx: 29, ty: 18 },
      { kind: 'rock', tx: 21, ty: 21 }, { kind: 'rock', tx: 12, ty: 14 },
      { kind: 'crystal', tx: 27, ty: 11 }, { kind: 'crystal', tx: 9, ty: 20 },
      { kind: 'crystal', tx: 19, ty: 4 }, { kind: 'crystal', tx: 31, ty: 16 },
      { kind: 'crate', tx: 15, ty: 6 }, { kind: 'crate', tx: 22, ty: 17 },
      { kind: 'barrel', tx: 6, ty: 9 }, { kind: 'lamp', tx: 17, ty: 15 },
      { kind: 'lamp', tx: 26, ty: 5 }, { kind: 'rock', tx: 33, ty: 9 },
    ],
  });
})();
