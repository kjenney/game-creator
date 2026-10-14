// td-audio.js — fixed game audio (T4): NOT an Option (spec: "fixed audio"),
// just content the game plays. Web Audio only (no Babylon): decode the WAV
// bytes from GC_ASSETS (file:// rule D4) into AudioBuffers and play them.
//
// Headless/autoplay-safe: the AudioContext is created lazily and resumed on
// the first user gesture; every call is guarded so an audio problem can never
// throw into the page or break the game.
(function () {
  "use strict";
  var ctx = null;
  var buffers = {};
  var decoding = false;

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  }

  // decode every assets/audio/*.wav entry of GC_ASSETS (once)
  function ensureLoaded() {
    if (decoding) return;
    var c = getCtx();
    if (!c) return;
    decoding = true;
    var assets = window.GC_ASSETS || {};
    Object.keys(assets).forEach(function (p) {
      if (p.indexOf("assets/audio/") !== 0) return;
      var name = p.slice("assets/audio/".length).replace(/\.wav$/, "");
      try {
        var bytes = GameGC.fromBase64(assets[p]);
        // decodeAudioData detaches the buffer — decode each sound exactly once
        c.decodeAudioData(bytes.buffer, function (buf) { buffers[name] = buf; }, function () { /* unsupported sample: skip */ });
      } catch (e) { /* keep going: audio is best-effort */ }
    });
  }

  function unlock() {
    ensureLoaded();
    var c = getCtx();
    if (c && c.state === "suspended") {
      var r = c.resume();
      if (r && r.catch) r.catch(function () { /* not yet allowed to start */ });
    }
  }

  function play(name, volume) {
    try {
      var c = getCtx();
      if (!c) return;
      ensureLoaded();
      var buf = buffers[name];
      if (!buf) return;
      if (c.state === "suspended") {
        var r = c.resume();
        if (r && r.catch) r.catch(function () {});
      }
      var src = c.createBufferSource();
      src.buffer = buf;
      var gain = c.createGain();
      gain.gain.value = typeof volume === "number" ? volume : 0.5;
      src.connect(gain);
      gain.connect(c.destination);
      src.start(0);
    } catch (e) { /* audio must never break the game */ }
  }

  // first gesture unlocks audio (autoplay policy) — pointer or key
  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
  }

  window.GCAudio = { play: play, unlock: unlock };
})();
