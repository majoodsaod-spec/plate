/* Plate FX: the sound, haptics and celebration layer, shared by every screen.

   Sound design (from what Apple's and other UI sound designers recommend): short, simple sounds for the things you do all the time (a soft tick, a water
   drop), a rising pitch for good news and a falling one for bad, nothing harsh, nothing over about 300 ms except the celebrations. A phone speaker
   has almost no bass, so everything sits in the mid and high range.
   Every sound is generated in code (no files). Small feedback sounds go through Web Audio, which starts instantly and follows the iPhone's silent switch.
   The big ones (water alarm ding, goal and record celebrations, success) use <audio> so they are heard even with the ringer on silent.
   FX.play(name)  names: tap tick toggle off pop drop1 drop2 drop3 blip send receive success undo error ding cheer win
   FX.haptic(ms | [ms, gap, ms...])    FX.tap()    FX.confetti('drops' | 'burst')    FX.prefs    FX.set(key, value) */
(function (root) {
  'use strict';
  const KEY = 'plate.fx', SR = 32000;
  const DEF = { sound: true, volume: 0.8, haptics: true, motion: true, uiTicks: true };
  let prefs = Object.assign({}, DEF);
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} };
  const reduced = () => !prefs.motion || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- building blocks (all add into a Float32Array at time t0 seconds) ---------- */
  const TAU = Math.PI * 2;
  /* a soft sine with a fast attack and an exponential fall; glide = end pitch / start pitch */
  function tone(f, t0, fr, dur, vol, glide, decay, wave) {
    const s = Math.floor(t0 * SR), N = Math.floor(dur * SR); let ph = 0;
    for (let i = 0; i < N && s + i < f.length; i++) {
      const t = i / SR, k = glide ? Math.pow(glide, Math.min(1, t / dur)) : 1;
      ph += TAU * fr * k / SR;
      const x = wave === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
      f[s + i] += x * Math.min(1, t / 0.003) * Math.exp(-t * (decay || 6 / dur)) * vol;
    }
  }
  /* a mallet note (marimba or kalimba like): the pitch plus a bright overtone that dies almost at once */
  function mallet(f, t0, fr, vol, len) {
    len = len || 0.5;
    tone(f, t0, fr, len, vol, 0, 9 / len);
    tone(f, t0, fr * 4, len * 0.25, vol * 0.35, 0, 38 / len);
    tone(f, t0, fr * 9.2, 0.03, vol * 0.12, 0, 160);
  }
  /* a glass bell: the inharmonic overtones of a struck bar, each with its own fall, and a slightly detuned twin for shimmer */
  const BELL = [[1, 1, 1], [2.76, 0.42, 0.55], [5.4, 0.2, 0.32], [8.93, 0.09, 0.2]];
  function bell(f, t0, fr, vol, len) {
    len = len || 1.4;
    BELL.forEach((p) => { tone(f, t0, fr * p[0], len * p[2], vol * p[1], 0, 5.2 / (len * p[2])); if (p[0] === 1) tone(f, t0, fr * 1.004, len * 0.9, vol * 0.4, 0, 5.4 / len); });
  }
  /* a tiny burst of filtered noise: the "tick" of a key or a droplet's click */
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  function click(f, t0, dur, vol, bright) {
    const s = Math.floor(t0 * SR), N = Math.floor(dur * SR); let lp = 0, prev = 0;
    for (let i = 0; i < N && s + i < f.length; i++) { const n = rnd(), k = bright || 0.5; lp += (n - lp) * k; const hp = lp - prev; prev = lp; f[s + i] += hp * Math.exp(-i / (N * 0.28)) * vol * 2.4; }
  }
  /* a water drop: a sine that rises quickly in pitch (the bubble closing), with a soft second droplet after it */
  function drop(f, t0, base, vol, len) {
    tone(f, t0, base, len, vol, 2.3, 22 / len);
    tone(f, t0 + 0.012, base * 2.02, len * 0.5, vol * 0.18, 2.1, 36 / len);
    click(f, t0, 0.006, vol * 0.18, 0.7);
  }
  /* soften everything: a gentle low-pass so nothing is shrill on a small speaker */
  function soften(f, amount) { let y = 0; for (let i = 0; i < f.length; i++) { y += (f[i] - y) * amount; f[i] = y; } }

  /* name -> [seconds, peak level 0..1, loud (plays on silent), fill(f)] */
  const DEFS = {
    tap: [0.05, 0.2, 0, (f) => { tone(f, 0, 1250, 0.03, 1, 0.78, 150); click(f, 0, 0.012, 0.5, 0.45); soften(f, 0.6); }],
    tick: [0.04, 0.16, 0, (f) => { tone(f, 0, 1700, 0.02, 1, 0.8, 220); click(f, 0, 0.008, 0.35, 0.6); }],
    toggle: [0.12, 0.26, 0, (f) => { tone(f, 0, 640, 0.07, 1, 1.45, 40); tone(f, 0.04, 960, 0.07, 0.7, 1.2, 46); soften(f, 0.7); }],
    off: [0.1, 0.22, 0, (f) => { tone(f, 0, 760, 0.07, 1, 0.7, 40); soften(f, 0.7); }],
    pop: [0.12, 0.3, 0, (f) => { tone(f, 0, 380, 0.07, 1, 1.9, 48); click(f, 0, 0.008, 0.2, 0.5); soften(f, 0.75); }],
    drop1: [0.22, 0.4, 0, (f) => { drop(f, 0, 620, 1, 0.12); soften(f, 0.8); }],
    drop2: [0.28, 0.44, 0, (f) => { drop(f, 0, 470, 1, 0.15); drop(f, 0.07, 700, 0.35, 0.09); soften(f, 0.8); }],
    drop3: [0.4, 0.5, 0, (f) => { drop(f, 0, 330, 1, 0.2); drop(f, 0.08, 520, 0.5, 0.13); drop(f, 0.17, 760, 0.25, 0.09); soften(f, 0.8); }],
    send: [0.2, 0.3, 0, (f) => { tone(f, 0, 560, 0.1, 1, 1.6, 26); tone(f, 0.05, 880, 0.12, 0.6, 1.3, 24); click(f, 0, 0.01, 0.1, 0.3); soften(f, 0.7); }],
    receive: [0.42, 0.28, 0, (f) => { mallet(f, 0, 880, 0.8, 0.3); mallet(f, 0.1, 1318, 0.9, 0.34); soften(f, 0.85); }],
    undo: [0.2, 0.26, 0, (f) => { tone(f, 0, 720, 0.12, 1, 0.58, 26, 'tri'); soften(f, 0.6); }],
    error: [0.3, 0.3, 0, (f) => { tone(f, 0, 340, 0.12, 1, 0.9, 22, 'tri'); tone(f, 0.11, 270, 0.17, 1, 0.9, 18, 'tri'); soften(f, 0.4); }],
    success: [1.0, 0.48, 1, (f) => { [1046.5, 1318.5, 1568].forEach((fr, i) => bell(f, i * 0.075, fr, 0.7, 0.55)); bell(f, 0.24, 2093, 0.4, 0.7); soften(f, 0.9); }],
    ding: [2.8, 0.98, 1, (f) => { bell(f, 0, 988, 1, 2.2); bell(f, 0.62, 1319, 0.95, 2.0); bell(f, 1.2, 988, 0.9, 1.6); }],
    cheer: [1.9, 0.7, 1, (f) => { [523, 659, 784, 1046.5, 1318.5].forEach((fr, i) => bell(f, i * 0.1, fr, 0.8, 0.9)); [3136, 3951, 4186, 3520].forEach((fr, i) => tone(f, 0.45 + i * 0.09, fr, 0.2, 0.12, 0, 22)); bell(f, 0.52, 2093, 0.9, 1.3); soften(f, 0.93); }],
    win: [2.4, 0.74, 1, (f) => { [523, 659, 784].forEach((fr) => bell(f, 0, fr, 0.55, 1.2)); [784, 1046.5, 1318.5, 1568].forEach((fr, i) => bell(f, 0.28 + i * 0.1, fr, 0.8, 1.1)); bell(f, 0.7, 2093, 0.8, 1.5); [3136, 3951, 4699, 3520, 4186].forEach((fr, i) => tone(f, 0.7 + i * 0.08, fr, 0.18, 0.1, 0, 24)); soften(f, 0.93); }],
  };
  DEFS.blip = DEFS.drop2;

  /* ---------- rendering and playback ---------- */
  const pcm = {}, urls = {}, bufs = {}, els = {};
  function render(name) {
    if (pcm[name]) return pcm[name];
    const d = DEFS[name], n = Math.floor(SR * d[0]), f = new Float32Array(n); d[3](f);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(f[i]));
    const g = pk ? d[1] / pk : 1; for (let i = 0; i < n; i++) f[i] *= g;
    const fade = Math.min(n, 160); for (let i = 0; i < fade; i++) f[n - 1 - i] *= i / fade;           // no click at the end
    return (pcm[name] = f);
  }
  function wavUrl(name) {
    if (urls[name]) return urls[name];
    const f = render(name), n = f.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const ws = (o, s) => { for (let j = 0; j < s.length; j++) v.setUint8(o + j, s.charCodeAt(j)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f[i])) * 32767, true);
    return (urls[name] = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })));
  }

  /* Web Audio: one context, created on the first touch (browsers require a gesture), buffers made once, each play is a cheap source node */
  let ctx = null, out = null;
  const session = (type) => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {} };
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    try {
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
      session('ambient');                                                         // mixes with music and follows the silent switch
      ctx = new AC({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
      out = ctx.createGain(); out.connect(comp); comp.connect(ctx.destination);
      if (ctx.state === 'suspended') ctx.resume();
      const b = ctx.createBuffer(1, 1, SR), s = ctx.createBufferSource(); s.buffer = b; s.connect(out); s.start(0);   // wakes the audio hardware
    } catch (e) { ctx = null; }
    return ctx;
  }
  function buffer(name) {
    if (bufs[name]) return bufs[name];
    const f = render(name), b = ctx.createBuffer(1, f.length, SR); b.copyToChannel(f, 0); return (bufs[name] = b);
  }
  function viaContext(name, vol, rate) {
    if (!unlock() || ctx.state !== 'running') return false;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buffer(name); if (rate) s.playbackRate.value = rate;
    g.gain.value = vol; s.connect(g); g.connect(out); s.start(); return true;
  }
  function viaElement(name, vol) {
    let a = els[name];
    if (!a) { a = els[name] = new Audio(); a.preload = 'auto'; a.src = wavUrl(name); }
    session('playback');                                                          // lets the big sounds through the silent switch
    a.volume = vol; try { a.currentTime = 0; } catch (e) {}
    const p = a.play(); if (p && p.catch) p.catch(() => { session('ambient'); viaContext(name, vol); });
    a.onended = () => session('ambient');
  }

  let lastTick = 0;
  function play(name, vol, rate) {
    if (!prefs.sound || !DEFS[name]) return;
    const v = Math.max(0, Math.min(1, prefs.volume * (vol == null ? 1 : vol)));
    try {
      if (DEFS[name][2]) viaElement(name, v);
      else if (!viaContext(name, v, rate)) viaElement(name, v);
    } catch (e) {}
  }
  function haptic(p) { if (!prefs.haptics) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

  /* get everything ready while the screen is idle, so the first tap already has its sound */
  const warm = () => { ['tap', 'tick', 'toggle', 'pop', 'drop1', 'drop2', 'drop3', 'send', 'receive', 'undo', 'error'].forEach((n, i) => setTimeout(() => { try { render(n); } catch (e) {} }, i * 40)); };
  (root.requestIdleCallback || ((f) => setTimeout(f, 600)))(warm);
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, () => unlock(), { capture: true, passive: true }));

  /* ---------- celebration ---------- */
  function confetti(kind) {
    if (reduced()) return;
    const host = document.body, n = kind === 'burst' ? 46 : 34, colours = ['#38c6e8', '#ffb23e', '#46e08f', '#ff6f91', '#8b7cff', '#ffd84a'];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('span');
      if (kind === 'burst') {
        d.className = 'fxConf'; const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 220;
        d.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px'); d.style.setProperty('--dy', Math.round(Math.sin(ang) * dist - 120) + 'px'); d.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
        d.style.background = colours[i % colours.length]; d.style.animationDelay = (Math.random() * 0.12) + 's';
      } else {
        d.className = 'fxDrop'; d.style.left = (Math.random() * 100) + 'vw'; d.style.animationDelay = (Math.random() * 0.6) + 's'; d.style.opacity = (0.5 + Math.random() * 0.5).toFixed(2);
      }
      host.appendChild(d); setTimeout(() => d.remove(), 3000);
    }
  }

  /* ---------- the small sounds the controls make ---------- */
  /* one soft tick for tabs, segments and chips; plain buttons stay quiet so the app does not chatter; the pitch varies a touch so it never feels mechanical */
  const TICK = '.chips button, .qr, .qchips button, summary, .rowBtn, .fastPick button, .wChip, .cBtn, .toolsBtn';
  const QUIET = '.primary, [data-silent], .sendBtn, .dock button, [role="tab"], .seg';
  document.addEventListener('pointerdown', (e) => {
    if (!prefs.uiTicks || !prefs.sound) return;
    const t = e.target.closest && e.target.closest(TICK); if (!t || t.disabled || t.closest(QUIET)) return;
    const now = performance.now(); if (now - lastTick < 45) return; lastTick = now;
    play('tap', 0.9, 0.94 + Math.random() * 0.12); haptic(6);
  }, { passive: true });
  /* switches: a little up-chirp when turned on, a soft down-note when turned off */
  document.addEventListener('change', (e) => { const t = e.target; if (t && t.matches && t.matches('input.switch')) { play(t.checked ? 'toggle' : 'off'); haptic(8); } }, true);

  root.FX = {
    play, haptic, confetti, reduced,
    tap() { play('tap', 0.9, 0.94 + Math.random() * 0.12); haptic(6); },
    get prefs() { return Object.assign({}, prefs); },
    set(k, v) { if (k in DEF) { prefs[k] = v; save(); } },
    reset() { prefs = Object.assign({}, DEF); save(); },
    names: Object.keys(DEFS),
  };
})(window);
