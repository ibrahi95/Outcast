/* Outcast — main.js: bootstrap + frame loop */
(function () {
  'use strict';
  window.AL = window.AL || {};

  function boot() {
    var canvas = document.getElementById('game-canvas');
    if (!canvas) { console.warn('[main] missing #game-canvas'); return; }

    try { AL.engine.init(canvas); } catch (e) { console.warn('[main] engine init failed', e); }
    try { AL.render.init(canvas); } catch (e) { console.warn('[main] render init failed', e); }
    try { AL.ui.init(); } catch (e) { console.warn('[main] ui init failed', e); }
    try { AL.hud.init(); } catch (e) { console.warn('[main] hud init failed', e); }

    // Audio unlock on first gesture (init is idempotent; ui also calls it)
    var unlock = function () {
      try { AL.audio.init(); } catch (e) {}
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Main loop: game simulates inside getFrame()/its own tick; render+hud pull.
    AL.engine.onFrame(function (dt, t) {
      var frame = null, hud = null;
      try { frame = AL.game.getFrame(); } catch (e) { console.warn('[main] getFrame', e); }
      try { if (frame) AL.render.draw(frame); } catch (e) { console.warn('[main] render.draw', e); }
      try { hud = AL.game.getHud(); } catch (e) { console.warn('[main] getHud', e); }
      try { if (hud) AL.hud.update(hud); } catch (e) { console.warn('[main] hud.update', e); }
    });
    AL.engine.start();

    // Leaving the page while in a room: best-effort goodbye
    window.addEventListener('beforeunload', function () {
      try { if (AL.game && AL.game.state && AL.game.state.phase !== 'menu') AL.game.leave(); } catch (e) {}
    });

    console.info('%cOutcast %cv' + AL.C.VERSION + ' — trust no one.',
      'color:#35e0ff;font-weight:bold', 'color:#8b96c9');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
