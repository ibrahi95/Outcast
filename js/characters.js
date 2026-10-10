/* Outcast — characters.js: AL.chars
 * The signature crew look: a rounded bean astronaut with reflective visor,
 * backpack, stubby legs and a bouncy shuffle. All procedural canvas 2D.
 * Draw space: (x, y) = feet center in world px; ctx is already camera-transformed.
 */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var OUT = '#12101f';        // universal cartoon outline
  var LINE = 3;               // outline width at scale 1

  /* ------------------------------------------------------------------ */
  /* Colors — 18 hand-tuned body/shade pairs                             */
  /* ------------------------------------------------------------------ */

  var COLORS = [
    { id: 0,  name: 'Red',      body: '#c81224', shade: '#7c0a30' },
    { id: 1,  name: 'Blue',     body: '#1b3ad1', shade: '#0d1b8c' },
    { id: 2,  name: 'Green',    body: '#128035', shade: '#0a4d26' },
    { id: 3,  name: 'Pink',     body: '#ee54bb', shade: '#a62c8a' },
    { id: 4,  name: 'Orange',   body: '#f07d0d', shade: '#ad4a12' },
    { id: 5,  name: 'Yellow',   body: '#f5f558', shade: '#c9a327' },
    { id: 6,  name: 'Charcoal', body: '#485058', shade: '#242830' },
    { id: 7,  name: 'White',    body: '#d8e0ef', shade: '#8b97b8' },
    { id: 8,  name: 'Purple',   body: '#6c2fbc', shade: '#3e1878' },
    { id: 9,  name: 'Brown',    body: '#72491e', shade: '#452a12' },
    { id: 10, name: 'Cyan',     body: '#3af2dc', shade: '#1b9cb0' },
    { id: 11, name: 'Lime',     body: '#54ef3a', shade: '#26a12b' },
    { id: 12, name: 'Maroon',   body: '#762b41', shade: '#451226' },
    { id: 13, name: 'Rose',     body: '#f1b4cd', shade: '#c1738f' },
    { id: 14, name: 'Coral',    body: '#ff6d5a', shade: '#c23a45' },
    { id: 15, name: 'Mint',     body: '#79e8ae', shade: '#3aa878' },
    { id: 16, name: 'Lavender', body: '#b1a3f2', shade: '#7361c9' },
    { id: 17, name: 'Gold',     body: '#f2b23a', shade: '#a96a16' },
  ];

  function colorOf(i) {
    if (typeof i !== 'number' || !isFinite(i)) i = 0;
    i = Math.floor(i);
    i = ((i % COLORS.length) + COLORS.length) % COLORS.length;
    return COLORS[i];
  }

  /* ------------------------------------------------------------------ */
  /* Small path helpers                                                  */
  /* ------------------------------------------------------------------ */

  function rr(ctx, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    if (r < 0) r = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function ell(ctx, cx, cy, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2);
    ctx.closePath();
  }

  function spark(ctx, cx, cy, r) { // 4-point twinkle star
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.2, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.2, cy + r * 0.2, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.2, cy + r * 0.2, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.2, cx, cy - r);
    ctx.closePath();
  }

  function outline(ctx, w) {
    ctx.lineWidth = w || LINE;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }

  /* ------------------------------------------------------------------ */
  /* The bean. Local space: feet center at (0,0), facing +x, y up = -y.  */
  /* Body top ~ -52, body bottom ~ -6, legs fill -20..0.                 */
  /* ------------------------------------------------------------------ */

  function beanPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.bezierCurveTo(-17.5, -6, -18.5, -9.5, -18.5, -15);
    ctx.lineTo(-18.5, -30);
    ctx.bezierCurveTo(-18.5, -45.5, -11, -52, 0.5, -52);
    ctx.bezierCurveTo(12.5, -52, 20.5, -44.5, 20.5, -31);
    ctx.lineTo(20.5, -14);
    ctx.bezierCurveTo(20.5, -8.5, 18.5, -6, 14, -6);
    ctx.closePath();
  }

  function ghostPath(ctx, t) {
    var w1 = Math.sin(t * 0.0042) * 2.2;
    var w2 = Math.sin(t * 0.0042 + 2.1) * 2.2;
    var w3 = Math.sin(t * 0.0042 + 4.2) * 2.2;
    ctx.beginPath();
    ctx.moveTo(-18.5, -18);
    ctx.lineTo(-18.5, -30);
    ctx.bezierCurveTo(-18.5, -45.5, -11, -52, 0.5, -52);
    ctx.bezierCurveTo(12.5, -52, 20.5, -44.5, 20.5, -31);
    ctx.lineTo(20.5, -16);
    ctx.quadraticCurveTo(17.5, -5 + w1, 12.5, -11.5 + w1);
    ctx.quadraticCurveTo(7.5, -3.5 + w2, 1.5, -11.5 + w2);
    ctx.quadraticCurveTo(-4.5, -3 + w3, -10.5, -11.5 + w3);
    ctx.quadraticCurveTo(-15.5, -6 + w1, -18.5, -18);
    ctx.closePath();
  }

  function drawLeg(ctx, c, cx, lift, back) {
    var top = -20;
    var bottom = -lift;
    rr(ctx, cx - 5, top, 10, bottom - top, 5);
    ctx.fillStyle = back ? c.shade : c.body;
    ctx.fill();
    outline(ctx);
  }

  function drawLegs(ctx, c, phase, moving) {
    var s = moving ? Math.sin(phase) : 0;
    var liftF = moving ? Math.max(0, s) * 6 : 0;
    var liftB = moving ? Math.max(0, -s) * 6 : 0;
    var swing = moving ? Math.cos(phase) * 3.5 : 0;
    drawLeg(ctx, c, -8 - swing, liftB, true);
    drawLeg(ctx, c, 7 + swing, liftF, false);
  }

  function drawBackpack(ctx, c) {
    rr(ctx, -27, -41.5, 12, 25, 5.5);
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.save();
    rr(ctx, -27, -41.5, 12, 25, 5.5);
    ctx.clip();
    ctx.fillStyle = c.shade;
    ctx.fillRect(-27, -29, 12, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-25.5, -40, 3, 8);
    ctx.restore();
    rr(ctx, -27, -41.5, 12, 25, 5.5);
    outline(ctx);
  }

  function drawTorsoShape(ctx, c, skin, t) {
    beanPath(ctx);
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.save();
    beanPath(ctx);
    ctx.clip();
    // lower shading band
    ctx.fillStyle = c.shade;
    ctx.beginPath();
    ctx.moveTo(-20, -15);
    ctx.quadraticCurveTo(1, -21.5, 22, -15);
    ctx.lineTo(22, -3);
    ctx.lineTo(-20, -3);
    ctx.closePath();
    ctx.fill();
    // back rim shade
    ctx.globalAlpha *= 0.45;
    ctx.fillStyle = c.shade;
    ctx.beginPath();
    ctx.moveTo(-18.5, -6);
    ctx.lineTo(-18.5, -46);
    ctx.quadraticCurveTo(-13, -34, -13.5, -6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha /= 0.45;
    // top sheen
    ctx.fillStyle = 'rgba(255,255,255,0.17)';
    ell(ctx, -5.5, -46.5, 9.5, 4.4, 0.35);
    ctx.fill();
    // skin overlay lives under the outline, clipped to the bean
    if (skin && skin !== 'none') {
      var sf = SKIN_DRAW[skin];
      if (sf) sf(ctx, c, t);
    }
    ctx.restore();
    beanPath(ctx);
    outline(ctx);
  }

  function drawVisor(ctx, t, deadX) {
    ctx.save();
    ctx.translate(9.5, -38);
    ctx.rotate(-0.06);
    var g = ctx.createLinearGradient(-11, -8, 9, 9);
    g.addColorStop(0, '#d9f3fc');
    g.addColorStop(0.45, '#8fd4ee');
    g.addColorStop(1, '#48789f');
    ell(ctx, 0, 0, 12, 8.6);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    // inner rim shadow at bottom of the glass
    ctx.save();
    ell(ctx, 0, 0, 12, 8.6);
    ctx.clip();
    ctx.fillStyle = 'rgba(20,40,66,0.35)';
    ell(ctx, 0, 6.5, 12, 4.4);
    ctx.fill();
    // roaming highlight
    var hx = Math.sin((t || 0) * 0.0016) * 2.6;
    var hy = Math.cos((t || 0) * 0.0011) * 1.1;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ell(ctx, -3.6 + hx, -3.2 + hy, 5, 2.5, -0.38);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ell(ctx, 4.5 + hx * 0.5, 1.5, 1.7, 1.1, -0.38);
    ctx.fill();
    ctx.restore();
    if (deadX) {
      // crossed-out eyes + a hairline crack
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#20303f';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-6.5, -3.5); ctx.lineTo(-1.5, 1.5);
      ctx.moveTo(-1.5, -3.5); ctx.lineTo(-6.5, 1.5);
      ctx.moveTo(2.5, -3.5); ctx.lineTo(7.5, 1.5);
      ctx.moveTo(7.5, -3.5); ctx.lineTo(2.5, 1.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(25,45,60,0.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-10, 4);
      ctx.lineTo(-5, 1);
      ctx.lineTo(-6.5, -2.5);
      ctx.lineTo(-3, -6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Skins — torso overlays, drawn inside the bean clip                  */
  /* ------------------------------------------------------------------ */

  function skinTopEdge(ctx, y, bow) {
    // shared cartoon seam along the top of an overlay
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUT;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.quadraticCurveTo(1, y - (bow || 5.5), 22, y);
    ctx.stroke();
  }

  function overlayBase(ctx, fill, y, bow) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.quadraticCurveTo(1, y - (bow || 5.5), 22, y);
    ctx.lineTo(22, -2);
    ctx.lineTo(-20, -2);
    ctx.closePath();
    ctx.fill();
  }

  var SKIN_DRAW = {
    suit: function (ctx) {
      overlayBase(ctx, '#23242e', -23);
      // crisp shirt wedge on the chest
      ctx.fillStyle = '#f2f2f6';
      ctx.beginPath();
      ctx.moveTo(8, -26.5);
      ctx.lineTo(17.5, -25);
      ctx.lineTo(13.5, -12.5);
      ctx.closePath();
      ctx.fill();
      // bowtie
      ctx.fillStyle = '#c8102e';
      ctx.beginPath();
      ctx.moveTo(12.5, -25.5);
      ctx.lineTo(8.5, -28); ctx.lineTo(8.5, -23);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12.5, -25.5);
      ctx.lineTo(16.5, -28); ctx.lineTo(16.5, -23);
      ctx.closePath(); ctx.fill();
      ell(ctx, 12.5, -25.5, 1.4, 1.4);
      ctx.fill();
      // buttons
      ctx.fillStyle = '#0f1016';
      ell(ctx, 13.2, -10.5, 1.1, 1.1); ctx.fill();
      ell(ctx, 13.5, -6.5, 1.1, 1.1); ctx.fill();
      skinTopEdge(ctx, -23);
    },
    mechanic: function (ctx) {
      overlayBase(ctx, '#e8862e', -21);
      // shoulder strap
      ctx.strokeStyle = '#e8862e';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11, -43);
      ctx.lineTo(7, -23);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,45,10,0.4)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-11, -43);
      ctx.lineTo(7, -23);
      ctx.stroke();
      ctx.fillStyle = '#f6c15c';
      ell(ctx, 5.5, -24.5, 1.7, 1.7); ctx.fill();
      // chest pocket with wrench
      rr(ctx, 3, -18, 11, 9.5, 2);
      ctx.fillStyle = '#f4a04d'; ctx.fill();
      ctx.strokeStyle = '#a35b16'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.strokeStyle = '#5c6470'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6.5, -17); ctx.lineTo(10.5, -20.5);
      ctx.stroke();
      ell(ctx, 11, -21, 1.5, 1.5);
      ctx.strokeStyle = '#5c6470'; ctx.lineWidth = 1.4; ctx.stroke();
      skinTopEdge(ctx, -21);
    },
    captain: function (ctx) {
      overlayBase(ctx, '#2b3a68', -23);
      // gold trim along the top
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-20, -20.5);
      ctx.quadraticCurveTo(1, -26, 22, -20.5);
      ctx.stroke();
      // belt + buckle
      ctx.fillStyle = '#1d2947';
      ctx.fillRect(-20, -14.5, 42, 5);
      rr(ctx, 8.5, -15.5, 7, 7, 1.6);
      ctx.fillStyle = '#f2c94c'; ctx.fill();
      ctx.strokeStyle = '#8a6410'; ctx.lineWidth = 1.5; ctx.stroke();
      // buttons
      ctx.fillStyle = '#f2c94c';
      ell(ctx, 8, -20, 1.2, 1.2); ctx.fill();
      ell(ctx, 15, -20, 1.2, 1.2); ctx.fill();
      skinTopEdge(ctx, -23);
    },
    scientist: function (ctx) {
      overlayBase(ctx, '#edf0f6', -24.5);
      // coat opening
      ctx.strokeStyle = '#b9c2d4';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(12, -27);
      ctx.lineTo(12, -3);
      ctx.stroke();
      // lapels
      ctx.fillStyle = '#d7dde9';
      ctx.beginPath();
      ctx.moveTo(12, -27.5); ctx.lineTo(7, -25); ctx.lineTo(12, -20.5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, -27.5); ctx.lineTo(17, -25.5); ctx.lineTo(12, -20.5);
      ctx.closePath(); ctx.fill();
      // pocket + pen
      rr(ctx, -1, -15, 8.5, 8, 1.5);
      ctx.fillStyle = '#dde3ee'; ctx.fill();
      ctx.strokeStyle = '#aab4c8'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.strokeStyle = '#35a2e0'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, -18); ctx.lineTo(2, -13);
      ctx.stroke();
      ctx.fillStyle = '#7d8aa2';
      ell(ctx, 5.5, -11, 0.9, 0.9); ctx.fill();
      skinTopEdge(ctx, -24.5);
    },
    military: function (ctx) {
      overlayBase(ctx, '#5b6b3f', -22);
      // camo blobs
      ctx.fillStyle = '#47552f';
      ell(ctx, -10, -14, 4.5, 2.8, 0.4); ctx.fill();
      ell(ctx, 6, -19, 4, 2.4, -0.5); ctx.fill();
      ell(ctx, 15, -9, 3.6, 2.4, 0.3); ctx.fill();
      ctx.fillStyle = '#6d7d4c';
      ell(ctx, -2, -8, 4.5, 2.6, -0.3); ctx.fill();
      ell(ctx, 13, -17, 3, 1.9, 0.6); ctx.fill();
      // belt + pouch
      ctx.fillStyle = '#3a3327';
      ctx.fillRect(-20, -13.5, 42, 4.4);
      rr(ctx, 1, -12.5, 9, 8, 1.8);
      ctx.fillStyle = '#47552f'; ctx.fill();
      ctx.strokeStyle = '#2c3220'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#9aa06a';
      rr(ctx, 3.4, -10.4, 4.2, 2.6, 0.8); ctx.fill();
      skinTopEdge(ctx, -22);
    },
    banana: function (ctx) {
      // peel with pointy flaps
      ctx.fillStyle = '#f7d94c';
      ctx.beginPath();
      ctx.moveTo(-20, -20);
      ctx.lineTo(-12.5, -30.5);
      ctx.lineTo(-5.5, -21);
      ctx.lineTo(1.5, -31.5);
      ctx.lineTo(8.5, -21);
      ctx.lineTo(15.5, -30.5);
      ctx.lineTo(22, -20);
      ctx.lineTo(22, -2);
      ctx.lineTo(-20, -2);
      ctx.closePath();
      ctx.fill();
      // ripening streaks
      ctx.strokeStyle = 'rgba(190,150,40,0.55)';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-9, -16); ctx.quadraticCurveTo(-8, -10, -9.5, -4);
      ctx.moveTo(4, -16); ctx.quadraticCurveTo(5, -10, 4, -4);
      ctx.stroke();
      // brown freckles
      ctx.fillStyle = 'rgba(138,107,42,0.6)';
      ell(ctx, -14, -8, 1.5, 1.1, 0.4); ctx.fill();
      ell(ctx, 12, -12, 1.4, 1, -0.4); ctx.fill();
      // outline along the peel points
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = OUT;
      ctx.beginPath();
      ctx.moveTo(-20, -20);
      ctx.lineTo(-12.5, -30.5);
      ctx.lineTo(-5.5, -21);
      ctx.lineTo(1.5, -31.5);
      ctx.lineTo(8.5, -21);
      ctx.lineTo(15.5, -30.5);
      ctx.lineTo(22, -20);
      ctx.stroke();
    },
  };

  var SKIN_DEFS = [
    { id: 'none',      name: 'None' },
    { id: 'suit',      name: 'Tuxedo' },
    { id: 'mechanic',  name: 'Mechanic' },
    { id: 'captain',   name: 'Captain' },
    { id: 'scientist', name: 'Lab Coat' },
    { id: 'military',  name: 'Military' },
    { id: 'banana',    name: 'Banana' },
  ];

  /* ------------------------------------------------------------------ */
  /* Hats — drawn after the visor, in body space (they ride the bob)     */
  /* Head top is at (0.5, -52); head spans roughly x -18.5 .. 20.5       */
  /* ------------------------------------------------------------------ */

  var HAT_DRAW = {
    tophat: function (ctx) {
      ctx.fillStyle = '#23232d';
      rr(ctx, -8.5, -73, 19, 20, 3);
      ctx.fill();
      ctx.save();
      rr(ctx, -8.5, -73, 19, 20, 3);
      ctx.clip();
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(-8.5, -60.5, 19, 5.5);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(-6, -73, 3.5, 20);
      ctx.restore();
      rr(ctx, -8.5, -73, 19, 20, 3);
      outline(ctx, 2.6);
      ctx.fillStyle = '#23232d';
      rr(ctx, -14.5, -55.5, 31, 5.5, 2.7);
      ctx.fill();
      outline(ctx, 2.6);
    },
    party: function (ctx) {
      var cone = function () {
        ctx.beginPath();
        ctx.moveTo(-8, -50.5);
        ctx.quadraticCurveTo(3, -55.5, 14, -50.5);
        ctx.lineTo(4, -72);
        ctx.closePath();
      };
      cone();
      ctx.fillStyle = '#ff5d8f';
      ctx.fill();
      ctx.save();
      cone();
      ctx.clip();
      ctx.translate(3, -60);
      ctx.rotate(0.42);
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(-15, -3, 30, 4.6);
      ctx.fillRect(-15, 6.5, 30, 4.6);
      ctx.restore();
      cone();
      outline(ctx, 2.6);
      ell(ctx, 4, -72.5, 3.1, 3.1);
      ctx.fillStyle = '#8ecae6';
      ctx.fill();
      outline(ctx, 2.4);
    },
    halo: function (ctx, t) {
      var fy = Math.sin((t || 0) * 0.0025) * 1.8;
      ctx.save();
      ctx.translate(0, fy);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255,210,62,0.25)';
      ell(ctx, 1, -61.5, 12.5, 4);
      ctx.stroke();
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = '#ffd23e';
      ctx.stroke();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = '#fff3b0';
      ell(ctx, 1, -62.3, 12.5, 3.4);
      ctx.stroke();
      ctx.restore();
    },
    crown: function (ctx) {
      ctx.beginPath();
      ctx.moveTo(-9, -50);
      ctx.lineTo(-9, -62.5);
      ctx.lineTo(-3.5, -56);
      ctx.lineTo(1.5, -64.5);
      ctx.lineTo(6.5, -56);
      ctx.lineTo(12, -62.5);
      ctx.lineTo(12, -50);
      ctx.closePath();
      ctx.fillStyle = '#f6c945';
      ctx.fill();
      outline(ctx, 2.6);
      ctx.fillStyle = '#e63946';
      ell(ctx, -4.5, -53, 1.6, 1.6); ctx.fill();
      ctx.fillStyle = '#2a9d8f';
      ell(ctx, 1.5, -54, 1.6, 1.6); ctx.fill();
      ctx.fillStyle = '#457b9d';
      ell(ctx, 7.5, -53, 1.6, 1.6); ctx.fill();
      ctx.strokeStyle = 'rgba(138,90,18,0.6)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-8, -50.8);
      ctx.lineTo(11, -50.8);
      ctx.stroke();
    },
    beanie: function (ctx, t) {
      ctx.beginPath();
      ctx.ellipse(1.5, -45.5, 17.5, 11.5, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#d95763';
      ctx.fill();
      outline(ctx, 2.6);
      // knit ribs
      ctx.strokeStyle = 'rgba(120,30,45,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, -55); ctx.quadraticCurveTo(-6.5, -50, -7, -46.5);
      ctx.moveTo(1.5, -57); ctx.lineTo(1.5, -47);
      ctx.moveTo(9, -55); ctx.quadraticCurveTo(9.5, -50, 10, -46.5);
      ctx.stroke();
      // fold band
      rr(ctx, -16.5, -48, 36, 6.2, 3.1);
      ctx.fillStyle = '#b23a48';
      ctx.fill();
      outline(ctx, 2.6);
      // pom
      var pb = Math.sin((t || 0) * 0.006) * 0.6;
      ell(ctx, 1.5, -58.5 + pb, 4, 4);
      ctx.fillStyle = '#f2e9e4';
      ctx.fill();
      outline(ctx, 2.4);
    },
    chef: function (ctx) {
      ctx.fillStyle = '#f4f2ec';
      ell(ctx, -6.5, -59, 6.2, 6); ctx.fill(); outline(ctx, 2.6);
      ell(ctx, 9.5, -59, 6.2, 6); ctx.fill(); outline(ctx, 2.6);
      ell(ctx, 1.5, -62.5, 7, 6.6); ctx.fill(); outline(ctx, 2.6);
      rr(ctx, -10.5, -56, 24, 8, 2.5);
      ctx.fillStyle = '#e7e3da';
      ctx.fill();
      outline(ctx, 2.6);
      ctx.strokeStyle = 'rgba(120,110,95,0.4)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-9, -50.5);
      ctx.lineTo(12, -50.5);
      ctx.stroke();
    },
    cowboy: function (ctx) {
      ctx.fillStyle = '#9c6b31';
      rr(ctx, -7.5, -66, 19, 14, 6);
      ctx.fill();
      outline(ctx, 2.6);
      ctx.strokeStyle = 'rgba(70,42,12,0.55)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(2, -65);
      ctx.quadraticCurveTo(1.5, -60, 2, -56);
      ctx.stroke();
      ell(ctx, 2, -52.5, 20, 5.4);
      ctx.fillStyle = '#9c6b31';
      ctx.fill();
      outline(ctx, 2.6);
      ctx.fillStyle = '#5e3d18';
      ctx.fillRect(-7.5, -56, 19, 3.8);
    },
    viking: function (ctx) {
      // horns first
      ctx.fillStyle = '#efe6d3';
      ctx.beginPath();
      ctx.moveTo(-11, -45);
      ctx.bezierCurveTo(-20, -47, -25, -56, -23.5, -65);
      ctx.bezierCurveTo(-19, -59, -14.5, -53, -10, -49.5);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 2.4);
      ctx.beginPath();
      ctx.moveTo(15, -45);
      ctx.bezierCurveTo(24, -47, 29, -56, 27.5, -65);
      ctx.bezierCurveTo(23, -59, 18.5, -53, 14, -49.5);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 2.4);
      // metal cap
      ctx.beginPath();
      ctx.ellipse(2, -46.5, 17, 9.5, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#8d99a6';
      ctx.fill();
      outline(ctx, 2.6);
      ctx.strokeStyle = 'rgba(50,58,68,0.6)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(2, -56);
      ctx.lineTo(2, -47);
      ctx.stroke();
      ctx.fillStyle = '#5f6b78';
      ell(ctx, -8, -49, 1.2, 1.2); ctx.fill();
      ell(ctx, 12, -49, 1.2, 1.2); ctx.fill();
    },
    headphones: function (ctx, t) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2b2f3a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-15.5, -42);
      ctx.bezierCurveTo(-13, -62, 17, -62, 18.5, -42);
      ctx.stroke();
      ctx.strokeStyle = '#454c5e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-14.5, -43);
      ctx.bezierCurveTo(-12, -60.5, 16, -60.5, 17.5, -43);
      ctx.stroke();
      rr(ctx, -20.5, -48, 8, 13, 3.6);
      ctx.fillStyle = '#2b2f3a';
      ctx.fill();
      outline(ctx, 2.4);
      rr(ctx, 15, -48, 8, 13, 3.6);
      ctx.fill();
      outline(ctx, 2.4);
      var pulse = 0.55 + 0.45 * Math.sin((t || 0) * 0.008);
      ctx.fillStyle = 'rgba(53,224,255,' + pulse.toFixed(3) + ')';
      ell(ctx, -16.5, -41.5, 1.7, 1.7); ctx.fill();
      ell(ctx, 19, -41.5, 1.7, 1.7); ctx.fill();
    },
    flower: function (ctx, t) {
      ctx.save();
      ctx.translate(1, -51);
      ctx.rotate(Math.sin((t || 0) * 0.0022) * 0.09);
      ctx.strokeStyle = '#3f8f4f';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.quadraticCurveTo(1.5, -3, 0, -7);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (var k = 0; k < 6; k++) {
        var a = (k / 6) * Math.PI * 2;
        ell(ctx, Math.cos(a) * 5, -11 + Math.sin(a) * 5, 3, 4.6, a + Math.PI / 2);
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(30,30,50,0.55)';
        ctx.stroke();
      }
      ell(ctx, 0, -11, 3.2, 3.2);
      ctx.fillStyle = '#ffd23e';
      ctx.fill();
      outline(ctx, 2);
      ctx.restore();
    },
    antenna: function (ctx, t) {
      ctx.strokeStyle = '#5a637a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(1, -51);
      ctx.quadraticCurveTo(3.5, -58, 1.5, -63.5);
      ctx.stroke();
      var pulse = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin((t || 0) * 0.008));
      ctx.fillStyle = 'rgba(255,56,96,' + pulse.toFixed(3) + ')';
      ell(ctx, 1.5, -66, 6, 6);
      ctx.fill();
      ell(ctx, 1.5, -66, 3.2, 3.2);
      ctx.fillStyle = '#ff3860';
      ctx.fill();
      outline(ctx, 2);
    },
    paperbag: function (ctx) {
      rr(ctx, -14.5, -57, 34, 27, 2.5);
      ctx.fillStyle = '#c9a36a';
      ctx.fill();
      outline(ctx, 2.8);
      ctx.strokeStyle = 'rgba(90,60,20,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-5, -57); ctx.lineTo(-6, -30.5);
      ctx.moveTo(8, -57); ctx.lineTo(9, -30.5);
      ctx.stroke();
      // torn fringe at bottom
      ctx.fillStyle = 'rgba(90,60,20,0.25)';
      ctx.beginPath();
      ctx.moveTo(-14.5, -30);
      for (var i = 0; i < 7; i++) {
        var x0 = -14.5 + i * 4.85;
        ctx.lineTo(x0 + 2.4, -33);
        ctx.lineTo(x0 + 4.85, -30);
      }
      ctx.lineTo(-14.5, -30);
      ctx.closePath();
      ctx.fill();
      // eye holes + wobbly mouth
      ctx.fillStyle = '#181420';
      ell(ctx, 3, -45, 2.3, 2.9); ctx.fill();
      ell(ctx, 12.5, -45, 2.3, 2.9); ctx.fill();
      ctx.strokeStyle = '#181420';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(4.5, -37.5);
      ctx.quadraticCurveTo(8, -35.5, 11.5, -37.5);
      ctx.stroke();
    },
    ushanka: function (ctx) {
      ctx.fillStyle = '#8d9099';
      rr(ctx, -17.5, -48, 9, 16, 4.2);
      ctx.fill();
      outline(ctx, 2.4);
      rr(ctx, 12.5, -48, 9, 16, 4.2);
      ctx.fill();
      outline(ctx, 2.4);
      ctx.beginPath();
      ctx.ellipse(1.5, -46, 17.2, 11, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#8d9099';
      ctx.fill();
      outline(ctx, 2.6);
      rr(ctx, -14, -50.5, 31, 7, 3.4);
      ctx.fillStyle = '#b9bcc4';
      ctx.fill();
      outline(ctx, 2.4);
      // fluffy texture dots
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ell(ctx, -8, -47, 1, 1); ctx.fill();
      ell(ctx, 0, -48, 1, 1); ctx.fill();
      ell(ctx, 8, -47, 1, 1); ctx.fill();
      ctx.fillStyle = '#c8102e';
      ell(ctx, 1.5, -47, 2.1, 2.1);
      ctx.fill();
      outline(ctx, 1.6);
    },
    wizard: function (ctx) {
      ctx.fillStyle = '#5a3ea8';
      ctx.beginPath();
      ctx.moveTo(-9, -50);
      ctx.bezierCurveTo(-4, -60, 2, -66, 9, -69);
      ctx.bezierCurveTo(12, -70.5, 15.5, -74, 16.5, -77.5);
      ctx.bezierCurveTo(17.5, -72, 15.5, -67.5, 12, -65);
      ctx.bezierCurveTo(13.5, -59, 14, -54, 14.5, -50);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 2.6);
      ell(ctx, 2.5, -50.5, 16.5, 4.8);
      ctx.fillStyle = '#4a3390';
      ctx.fill();
      outline(ctx, 2.6);
      ctx.fillStyle = '#ffd23e';
      spark(ctx, 2, -58, 2.4); ctx.fill();
      spark(ctx, 8.5, -64, 1.8); ctx.fill();
    },
    pirate: function (ctx) {
      ctx.fillStyle = '#20222c';
      ctx.beginPath();
      ctx.moveTo(-20, -49);
      ctx.quadraticCurveTo(-15, -67.5, 1, -67.5);
      ctx.quadraticCurveTo(17.5, -67.5, 22, -49);
      ctx.quadraticCurveTo(12, -55.5, 1, -55.5);
      ctx.quadraticCurveTo(-10, -55.5, -20, -49);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 2.6);
      // gold trim
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-17.5, -50.5);
      ctx.quadraticCurveTo(-13.5, -65, 1, -65);
      ctx.quadraticCurveTo(15.5, -65, 19.5, -50.5);
      ctx.stroke();
      // jolly little skull
      ctx.fillStyle = '#f2f2f2';
      ell(ctx, 1, -59.5, 2.8, 2.6);
      ctx.fill();
      ctx.fillStyle = '#20222c';
      ell(ctx, 0, -60, 0.7, 0.9); ctx.fill();
      ell(ctx, 2, -60, 0.7, 0.9); ctx.fill();
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-2.6, -57); ctx.lineTo(4.6, -61.5);
      ctx.moveTo(-2.6, -61.5); ctx.lineTo(4.6, -57);
      ctx.stroke();
    },
    sprout: function (ctx, t) {
      ctx.save();
      ctx.translate(1, -51);
      ctx.rotate(Math.sin((t || 0) * 0.003) * 0.1);
      ctx.strokeStyle = '#2f9e44';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.quadraticCurveTo(2, -4, 0.5, -8.5);
      ctx.stroke();
      ctx.fillStyle = '#51cf66';
      ell(ctx, -4.5, -9.5, 4.8, 2.5, -0.55);
      ctx.fill();
      ctx.strokeStyle = '#2f9e44';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ell(ctx, 5.5, -10.5, 4.8, 2.5, 0.55);
      ctx.fillStyle = '#51cf66';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };

  var HAT_DEFS = [
    { id: 'none',       name: 'None' },
    { id: 'tophat',     name: 'Top Hat' },
    { id: 'party',      name: 'Party Cone' },
    { id: 'halo',       name: 'Halo' },
    { id: 'crown',      name: 'Crown' },
    { id: 'beanie',     name: 'Beanie' },
    { id: 'chef',       name: 'Chef Toque' },
    { id: 'cowboy',     name: 'Cowboy' },
    { id: 'viking',     name: 'Viking Horns' },
    { id: 'headphones', name: 'Headphones' },
    { id: 'flower',     name: 'Daisy' },
    { id: 'antenna',    name: 'Antenna' },
    { id: 'paperbag',   name: 'Paper Bag' },
    { id: 'ushanka',    name: 'Ushanka' },
    { id: 'wizard',     name: 'Wizard' },
    { id: 'pirate',     name: 'Pirate' },
    { id: 'sprout',     name: 'Sprout' },
  ];

  /* ------------------------------------------------------------------ */
  /* Core bean renderer. Transform must already be applied:              */
  /* feet at origin, facing +x, unit scale.                              */
  /* ------------------------------------------------------------------ */

  function renderBean(ctx, o) {
    var c = o.c || COLORS[0];
    var t = o.t || 0;
    if (o.ghost) {
      renderGhost(ctx, o, c, t);
      return;
    }
    var moving = !!o.moving;
    var phase = t * 0.0155;
    var bob, sy;
    if (moving) {
      bob = Math.abs(Math.sin(phase)) * 3.2;
      sy = 1 - (1 - Math.abs(Math.sin(phase))) * 0.055; // squash at footfall
    } else {
      bob = 0;
      sy = 1 + Math.sin(t * 0.0021) * 0.013;            // idle breathing
    }
    var sx = 1 + (1 - sy) * 0.8;

    drawLegs(ctx, c, phase, moving);

    ctx.save();
    ctx.translate(0, -bob);
    if (moving) ctx.rotate(0.045); // eager little forward lean
    // squash/stretch pivoting at the body bottom
    ctx.translate(0, -6);
    ctx.scale(sx, sy);
    ctx.translate(0, 6);

    drawBackpack(ctx, c);
    drawTorsoShape(ctx, c, o.skin, t);
    drawVisor(ctx, t, !!o.deadVisor);
    if (o.hat && o.hat !== 'none') {
      var hf = HAT_DRAW[o.hat];
      if (hf) hf(ctx, t, c);
    }
    ctx.restore();
  }

  function renderGhost(ctx, o, c, t) {
    ctx.save();
    ctx.globalAlpha *= 0.62;
    var fy = Math.sin(t * 0.0027) * 3.5 - 7; // gentle hover above the floor
    ctx.translate(0, fy);
    ghostPath(ctx, t);
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.save();
    ghostPath(ctx, t);
    ctx.clip();
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = c.shade;
    ctx.beginPath();
    ctx.moveTo(-20, -16);
    ctx.quadraticCurveTo(1, -22, 22, -16);
    ctx.lineTo(22, 4);
    ctx.lineTo(-20, 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha /= 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ell(ctx, -5.5, -46.5, 9.5, 4.4, 0.35);
    ctx.fill();
    ctx.restore();
    ghostPath(ctx, t);
    outline(ctx);
    drawVisor(ctx, t, false);
    if (o.hat && o.hat !== 'none') {
      var hf = HAT_DRAW[o.hat];
      if (hf) hf(ctx, t, c);
    }
    // trailing wisps
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = c.body;
    ell(ctx, -11, -1 + Math.sin(t * 0.005) * 2, 2.8, 2.2);
    ctx.fill();
    ctx.globalAlpha *= 0.7;
    ell(ctx, 5, 1 + Math.sin(t * 0.005 + 2) * 2, 2, 1.6);
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Pets — local space: feet at (0,0), facing +x                        */
  /* ------------------------------------------------------------------ */

  var PET_DRAW = {
    mini: function (ctx, t, moving, c) {
      ctx.save();
      ctx.scale(0.42, 0.42);
      renderBean(ctx, { c: c, t: t * 1.35, moving: moving });
      ctx.restore();
    },
    blob: function (ctx, t, moving, c) {
      var hop = moving ? Math.abs(Math.sin(t * 0.012)) * 3 : 0;
      var sy = moving ? 1 + Math.sin(t * 0.012 + 1.2) * 0.1
                      : 1 + Math.sin(t * 0.0038) * 0.07;
      var sx = 1 + (1 - sy) * 0.9;
      ctx.save();
      ctx.translate(0, -hop);
      ctx.scale(sx, sy);
      ctx.beginPath();
      ctx.moveTo(-10.5, 0);
      ctx.bezierCurveTo(-11.5, -10, -6.5, -16.5, 0, -16.5);
      ctx.bezierCurveTo(6.5, -16.5, 11.5, -10, 10.5, 0);
      ctx.quadraticCurveTo(5, -2.2, 0, 0);
      ctx.quadraticCurveTo(-5, -2.2, -10.5, 0);
      ctx.closePath();
      ctx.fillStyle = c.body;
      ctx.fill();
      outline(ctx, 2.4);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = c.shade;
      ctx.beginPath();
      ctx.moveTo(-12, -4.5);
      ctx.quadraticCurveTo(0, -7.5, 12, -4.5);
      ctx.lineTo(12, 2);
      ctx.lineTo(-12, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ell(ctx, -3.5, -12.5, 3.4, 1.9, 0.4);
      ctx.fill();
      ctx.restore();
      // face
      ctx.fillStyle = '#ffffff';
      ell(ctx, 3.2, -10, 2.4, 2.6); ctx.fill();
      ell(ctx, 8, -9.4, 2.1, 2.3); ctx.fill();
      var blink = ((t % 3400) < 140) ? 0.25 : 1;
      ctx.fillStyle = '#141420';
      ell(ctx, 3.8, -9.7, 1.1, 1.2 * blink); ctx.fill();
      ell(ctx, 8.5, -9.1, 1, 1.1 * blink); ctx.fill();
      ctx.strokeStyle = '#141420';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4.5, -5.6);
      ctx.quadraticCurveTo(6, -4.4, 7.5, -5.6);
      ctx.stroke();
      ctx.restore();
    },
    robot: function (ctx, t, moving) {
      var bounce = moving ? Math.abs(Math.sin(t * 0.014)) * 2.5
                          : Math.sin(t * 0.0035) * 0.8;
      // treads
      rr(ctx, -9, -6.5, 18, 6.5, 3.2);
      ctx.fillStyle = '#3a4150';
      ctx.fill();
      outline(ctx, 2.2);
      var off = moving ? (t * 0.02) % 6 : 0;
      ctx.fillStyle = '#7c8598';
      for (var i = 0; i < 3; i++) {
        var wx = -6 + ((i * 6 + off) % 15);
        ell(ctx, wx, -3.2, 1.3, 1.3);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(0, -bounce);
      // torso
      rr(ctx, -7.5, -17.5, 15, 11.5, 2.6);
      ctx.fillStyle = '#9fb0c4';
      ctx.fill();
      outline(ctx, 2.2);
      ctx.strokeStyle = 'rgba(60,72,90,0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-7.5, -10.5);
      ctx.lineTo(7.5, -10.5);
      ctx.stroke();
      var beat = 0.5 + 0.5 * Math.sin(t * 0.006);
      ctx.fillStyle = 'rgba(62,224,111,' + (0.4 + beat * 0.6).toFixed(3) + ')';
      ell(ctx, 3.5, -14, 1.7, 1.7);
      ctx.fill();
      // little gripper arm out front
      ctx.strokeStyle = '#6d7d92';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(7.5, -13);
      ctx.lineTo(11, -11 + Math.sin(t * 0.005) * 1.2);
      ctx.stroke();
      // head
      rr(ctx, -5.5, -25.5, 12, 8.4, 2.2);
      ctx.fillStyle = '#b9c7d8';
      ctx.fill();
      outline(ctx, 2.2);
      var glow = 0.55 + 0.45 * Math.sin(t * 0.004 + 1);
      rr(ctx, -3, -23.4, 8.2, 4.2, 1.6);
      ctx.fillStyle = 'rgba(53,224,255,' + (0.5 + glow * 0.5).toFixed(3) + ')';
      ctx.fill();
      ctx.strokeStyle = '#5a6b7e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0.5, -25.5);
      ctx.lineTo(0.5, -29.5);
      ctx.stroke();
      var blink2 = ((t % 1400) < 700) ? 1 : 0.3;
      ctx.fillStyle = 'rgba(255,56,96,' + blink2.toFixed(2) + ')';
      ell(ctx, 0.5, -30.8, 1.6, 1.6);
      ctx.fill();
      ctx.restore();
    },
    cat: function (ctx, t, moving) {
      var hop = moving ? Math.abs(Math.sin(t * 0.013)) * 2.4 : 0;
      var sway = Math.sin(t * (moving ? 0.01 : 0.0028));
      ctx.save();
      ctx.translate(0, -hop);
      // tail
      ctx.strokeStyle = '#e8974f';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8.5, -7);
      ctx.quadraticCurveTo(-15, -12, -13.5, -18 + sway * 2.4);
      ctx.stroke();
      // body
      ell(ctx, 0, -7, 10, 6.6);
      ctx.fillStyle = '#e8974f';
      ctx.fill();
      outline(ctx, 2.4);
      // tabby stripes
      ctx.strokeStyle = '#c5772f';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-4, -12.5); ctx.quadraticCurveTo(-3, -9.5, -4, -7);
      ctx.moveTo(0.5, -13);  ctx.quadraticCurveTo(1.5, -10, 0.5, -7);
      ctx.stroke();
      // head
      var twitch = ((t % 4200) < 160) ? 0.18 : 0;
      ell(ctx, 6.5, -14.5, 5.8, 5.4);
      ctx.fillStyle = '#e8974f';
      ctx.fill();
      outline(ctx, 2.4);
      // ears
      ctx.fillStyle = '#e8974f';
      ctx.beginPath();
      ctx.moveTo(2.2, -18);
      ctx.lineTo(1.6, -23.5); ctx.lineTo(6, -20.2);
      ctx.closePath(); ctx.fill();
      outline(ctx, 2);
      ctx.save();
      ctx.translate(9.8, -19.4);
      ctx.rotate(twitch);
      ctx.beginPath();
      ctx.moveTo(-1.5, 0.6);
      ctx.lineTo(1.4, -4.4); ctx.lineTo(2.8, 1.4);
      ctx.closePath();
      ctx.fillStyle = '#e8974f';
      ctx.fill();
      outline(ctx, 2);
      ctx.restore();
      ctx.fillStyle = '#f2b9c9';
      ctx.beginPath();
      ctx.moveTo(3, -19.6); ctx.lineTo(2.8, -21.6); ctx.lineTo(4.6, -20.4);
      ctx.closePath(); ctx.fill();
      // face
      var blink = ((t % 3000) < 150);
      ctx.fillStyle = '#141420';
      if (blink) {
        ctx.strokeStyle = '#141420';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(3.6, -15.4); ctx.lineTo(5.6, -15.4);
        ctx.moveTo(8.4, -15.4); ctx.lineTo(10.4, -15.4);
        ctx.stroke();
      } else {
        ell(ctx, 4.6, -15.4, 1, 1.3); ctx.fill();
        ell(ctx, 9.4, -15.4, 1, 1.3); ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(6.4, -12.8); ctx.lineTo(7.6, -12.8); ctx.lineTo(7, -11.9);
      ctx.closePath();
      ctx.fillStyle = '#d4708a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10.8, -12.6); ctx.lineTo(14.4, -13.2);
      ctx.moveTo(10.8, -11.4); ctx.lineTo(14.4, -11);
      ctx.stroke();
      ctx.restore();
    },
    ufo: function (ctx, t) {
      var hover = Math.sin(t * 0.0035) * 2.6;
      // tractor beam shimmer
      ctx.fillStyle = 'rgba(122,240,190,0.13)';
      ctx.beginPath();
      ctx.moveTo(-3.5, -13 + hover);
      ctx.lineTo(3.5, -13 + hover);
      ctx.lineTo(8, 0);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(0, -15 + hover);
      // dome + pilot
      ctx.beginPath();
      ctx.arc(0, -2.5, 6.2, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(165,228,255,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,90,120,0.8)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ell(ctx, 0, -4.6, 2.8, 2.6);
      ctx.fillStyle = '#69d95e';
      ctx.fill();
      ctx.fillStyle = '#153618';
      ell(ctx, -1, -5, 0.7, 0.9); ctx.fill();
      ell(ctx, 1, -5, 0.7, 0.9); ctx.fill();
      // saucer
      ell(ctx, 0, 0, 12.5, 4.6);
      ctx.fillStyle = '#aab6cc';
      ctx.fill();
      outline(ctx, 2.4);
      var lights = ['#ff3860', '#ffd23e', '#3ee06f', '#35e0ff'];
      for (var i = 0; i < 4; i++) {
        var lx = -9 + i * 6;
        ctx.fillStyle = lights[(i + Math.floor(t * 0.004)) % 4];
        ell(ctx, lx, 1.4, 1.3, 1.3);
        ctx.fill();
      }
      ctx.restore();
    },
    snail: function (ctx, t, moving, c) {
      var stretch = moving ? 1 + Math.sin(t * 0.008) * 0.07 : 1;
      ctx.save();
      ctx.scale(stretch, 1);
      // slug body
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(-10.5, -5.5, -4, -5.5);
      ctx.lineTo(5, -5.5);
      ctx.quadraticCurveTo(10.5, -5.5, 11, -9);
      ctx.quadraticCurveTo(11.8, -4, 11.8, -1.5);
      ctx.quadraticCurveTo(11.8, 0, 10, 0);
      ctx.closePath();
      ctx.fillStyle = '#e3cf9d';
      ctx.fill();
      outline(ctx, 2.2);
      // eyestalks
      var wig = Math.sin(t * 0.006) * 1.2;
      ctx.strokeStyle = '#e3cf9d';
      ctx.lineWidth = 1.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(10, -8.5);
      ctx.quadraticCurveTo(11.5, -12, 12.5 + wig, -14.5);
      ctx.moveTo(8.5, -9);
      ctx.quadraticCurveTo(8.5, -12.5, 8 - wig, -15);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ell(ctx, 12.5 + wig, -15.2, 1.7, 1.7); ctx.fill();
      ell(ctx, 8 - wig, -15.7, 1.7, 1.7); ctx.fill();
      ctx.fillStyle = '#141420';
      ell(ctx, 13 + wig, -15.2, 0.8, 0.8); ctx.fill();
      ell(ctx, 8.5 - wig, -15.7, 0.8, 0.8); ctx.fill();
      // shell in owner color
      ell(ctx, -2.5, -10, 7.4, 7);
      ctx.fillStyle = c.body;
      ctx.fill();
      outline(ctx, 2.4);
      ctx.strokeStyle = c.shade;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(-2.5, -10, 4.8, -0.6, 2.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-3.5, -10.8, 2.3, 0.4, 3.6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ell(ctx, -5, -13.5, 2.2, 1.3, 0.5);
      ctx.fill();
      ctx.restore();
    },
  };

  var PET_DEFS = [
    { id: 'none',  name: 'None' },
    { id: 'mini',  name: 'Mini Crewmate' },
    { id: 'blob',  name: 'Blob' },
    { id: 'robot', name: 'Robot' },
    { id: 'cat',   name: 'Cat' },
    { id: 'ufo',   name: 'UFO' },
    { id: 'snail', name: 'Snail' },
  ];

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  function setupStroke(ctx) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function draw(ctx, p) {
    if (!ctx || !p) return;
    var alpha = p.alpha != null ? p.alpha : 1;
    if (alpha <= 0) return;
    var t = p.t != null ? p.t : AL.util.now();
    var sc = p.scale || 1;
    var d = p.dir < 0 ? -1 : 1;
    var ghost = !!(p.dead || p.ghost);
    var c = colorOf(p.morphColor != null ? p.morphColor : p.color);

    ctx.save();
    setupStroke(ctx);
    ctx.globalAlpha *= alpha;
    ctx.translate(p.x || 0, p.y || 0);
    ctx.scale(sc, sc);
    if (p.shadow !== false) {
      ctx.fillStyle = ghost ? 'rgba(8,10,20,0.12)' : 'rgba(8,10,20,0.30)';
      ell(ctx, 0, 1.5, ghost ? 14 : 19, ghost ? 3.6 : 5.2);
      ctx.fill();
    }
    ctx.save();
    ctx.scale(d, 1);
    renderBean(ctx, {
      c: c,
      t: t,
      moving: !!p.moving && !ghost,
      ghost: ghost,
      skin: p.skin,
      hat: p.hat,
    });
    ctx.restore();
    ctx.restore();

    // trailing pet, if the game supplied a position
    if (p.pet && p.pet !== 'none' && p.petX != null && p.petY != null) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      drawPet(ctx, {
        x: p.petX, y: p.petY,
        kind: p.pet,
        color: p.color,
        dir: d,
        moving: p.moving,
        t: t,
      });
      ctx.restore();
    }
  }

  function drawPet(ctx, pet) {
    if (!ctx || !pet || !pet.kind || pet.kind === 'none') return;
    var fn = PET_DRAW[pet.kind];
    if (!fn) return;
    var t = pet.t != null ? pet.t : AL.util.now();
    var c = colorOf(pet.color);
    var d = pet.dir < 0 ? -1 : 1;
    ctx.save();
    setupStroke(ctx);
    ctx.translate(pet.x || 0, pet.y || 0);
    ctx.fillStyle = 'rgba(8,10,20,0.22)';
    ell(ctx, 0, 1, 11.5, 3.2);
    ctx.fill();
    ctx.scale(d, 1);
    fn(ctx, t, !!pet.moving, c);
    ctx.restore();
  }

  function drawBody(ctx, b) {
    if (!ctx || !b) return;
    var t = b.t != null ? b.t : AL.util.now();
    var c = colorOf(b.color);
    ctx.save();
    setupStroke(ctx);
    ctx.translate(b.x || 0, b.y || 0);

    // small teal ecto pool, softly breathing
    var pulse = 1 + Math.sin(t * 0.0028) * 0.045;
    ctx.fillStyle = 'rgba(58,240,210,0.22)';
    ell(ctx, -4, 1, 27 * pulse, 8.5 * pulse);
    ctx.fill();
    ctx.fillStyle = 'rgba(58,240,210,0.34)';
    ell(ctx, -2, 1, 17, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(58,240,210,0.4)';
    ell(ctx, 15, 3, 3, 1.6); ctx.fill();
    ell(ctx, -22, 4, 2.3, 1.3); ctx.fill();

    // head-half of the bean, lying on its side (head to the left)
    var half = function () {
      ctx.beginPath();
      ctx.moveTo(6, -1.5);
      ctx.lineTo(-14, -1.5);
      ctx.bezierCurveTo(-22, -1.5, -26.5, -6, -26.5, -11);
      ctx.bezierCurveTo(-26.5, -16.5, -21.5, -20.5, -14, -20.5);
      ctx.lineTo(6, -20.5);
      ctx.bezierCurveTo(9.5, -18, 9.5, -4, 6, -1.5);
      ctx.closePath();
    };
    half();
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.save();
    half();
    ctx.clip();
    // ground-side shading
    ctx.fillStyle = c.shade;
    ctx.beginPath();
    ctx.moveTo(-28, -7.5);
    ctx.quadraticCurveTo(-8, -10.5, 11, -7.5);
    ctx.lineTo(11, 1);
    ctx.lineTo(-28, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ell(ctx, -18, -17, 7, 2.6, 0.15);
    ctx.fill();
    ctx.restore();
    half();
    outline(ctx);

    // the cut plane: dark interior ring + a clean, bone-ish stub (non-gory)
    ell(ctx, 6.5, -11, 4.6, 9.2);
    ctx.fillStyle = c.shade;
    ctx.fill();
    outline(ctx, 2.6);
    ell(ctx, 6.5, -11, 2.9, 6.6);
    ctx.fillStyle = '#2b1f33';
    ctx.fill();
    rr(ctx, 5, -14.6, 8.5, 6.6, 3.2);
    ctx.fillStyle = '#efe9db';
    ctx.fill();
    outline(ctx, 2.2);
    ctx.fillStyle = 'rgba(190,180,160,0.7)';
    ell(ctx, 12, -11.3, 1.5, 2.2);
    ctx.fill();

    // visor facing up, cracked, with X eyes
    ctx.save();
    ctx.translate(-16.5, -14.5);
    ctx.rotate(0.32);
    var g = ctx.createLinearGradient(-8, -6, 7, 6);
    g.addColorStop(0, '#c6e6f4');
    g.addColorStop(1, '#4a7699');
    ell(ctx, 0, 0, 8.8, 6.2);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx, 2.6);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#22323f';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-5, -2.4); ctx.lineTo(-1.4, 1.2);
    ctx.moveTo(-1.4, -2.4); ctx.lineTo(-5, 1.2);
    ctx.moveTo(1.6, -2.4); ctx.lineTo(5.2, 1.2);
    ctx.moveTo(5.2, -2.4); ctx.lineTo(1.6, 1.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(28,45,58,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, 3.4);
    ctx.lineTo(-4.4, 0.8);
    ctx.lineTo(-5.6, -2.2);
    ctx.lineTo(-2.6, -5.4);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawPortrait(ctx, o) {
    if (!ctx || !o) return;
    var size = o.size || 64;
    var t = o.t != null ? o.t : AL.util.now();
    var c = colorOf(o.color);
    var d = o.dir < 0 ? -1 : 1;
    ctx.save();
    setupStroke(ctx);
    rr(ctx, o.x || 0, o.y || 0, size, size, size * 0.14);
    ctx.clip();
    var s = size / 68;
    ctx.translate((o.x || 0) + size * 0.5, (o.y || 0) + size * 1.02);
    // faint grounding shadow inside the card
    ctx.fillStyle = 'rgba(8,10,20,0.18)';
    ell(ctx, 0, 1.5 * s, 20 * s, 4.5 * s);
    ctx.fill();
    ctx.scale(s * d, s);
    ctx.translate(3, 0); // center the bust (body spans roughly -27..21.5)
    if (o.dead) ctx.globalAlpha *= 0.9;
    renderBean(ctx, {
      c: c,
      t: t,
      moving: false,
      ghost: false,
      skin: o.skin,
      hat: o.hat,
      deadVisor: !!o.dead,
    });
    ctx.restore();
  }

  AL.chars = {
    COLORS: COLORS,
    HATS: HAT_DEFS.map(function (h) { return { id: h.id, name: h.name }; }),
    PETS: PET_DEFS.map(function (p) { return { id: p.id, name: p.name }; }),
    SKINS: SKIN_DEFS.map(function (s) { return { id: s.id, name: s.name }; }),
    draw: draw,
    drawBody: drawBody,
    drawPet: drawPet,
    drawPortrait: drawPortrait,
    height: 52,
  };
})();
