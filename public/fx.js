/* Plate FX: the sound, haptics and celebration layer, shared by every screen.
   Sounds are generated in code (no audio files to download) and played through <audio> elements, which is the only way an iPhone keeps playing
   with the ringer switch on silent; Web Audio is the fallback. Everything respects the Sound, Volume and Haptics switches in Me > Sound & feel,
   and the phone's "reduce motion" setting.
   FX.play(name)  names: tap pop blip send receive success undo error ding cheer win
   FX.haptic(ms | [ms, gap, ms...])    FX.tap()    FX.confetti('drops' | 'burst')    FX.prefs    FX.set(key, value) */
(function (root) {
  'use strict';
  const KEY = 'plate.fx', SR = 32000;
  const DEF = { sound: true, volume: 0.8, haptics: true, motion: true, uiTicks: true };
  let prefs = Object.assign({}, DEF);
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} };
  const reduced = () => !prefs.motion || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- synthesis ---------- */
  const BELL = [[1, 1, 1.9], [2.01, 0.7, 1.4], [2.76, 0.55, 1.0], [4.1, 0.35, 0.6], [5.4, 0.22, 0.4]];   // partial ratio, level, seconds
  function bell(f, t0, fr, vol) {
    BELL.forEach((p) => {
      const start = Math.floor(t0 * SR), N = Math.floor(p[2] * SR), w = 2 * Math.PI * fr * p[0] / SR;
      for (let i = 0; i < N && start + i < f.length; i++) { const t = i / SR; f[start + i] += Math.sin(w * i) * Math.min(1, t / 0.006) * Math.exp(-5.5 * t / p[2]) * vol * p[1]; }
    });
  }
  function tone(f, t0, fr, dur, vol, glide, decay) {                                           // a soft sine with a quick attack; glide = end/start frequency
    const start = Math.floor(t0 * SR), N = Math.floor(dur * SR); let ph = 0;
    for (let i = 0; i < N && start + i < f.length; i++) {
      const t = i / SR, k = glide ? 1 + (glide - 1) * Math.min(1, t / dur) : 1;
      ph += 2 * Math.PI * fr * k / SR;
      f[start + i] += Math.sin(ph) * Math.min(1, t / 0.004) * Math.exp(-t * (decay || 6 / dur)) * vol;
    }
  }
  function wav(len, level, fill) {
    const n = Math.floor(SR * len), f = new Float32Array(n); fill(f);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(f[i]));
    const g = pk ? level / pk : 1, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const ws = (o, s) => { for (let j = 0; j < s.length; j++) v.setUint8(o + j, s.charCodeAt(j)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f[i] * g)) * 32767, true);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }
  const DEFS = {                                                                                // name -> [seconds, peak level, fill]
    tap: [0.06, 0.22, (f) => tone(f, 0, 1500, 0.05, 1, 0.8, 90)],
    pop: [0.16, 0.34, (f) => tone(f, 0, 520, 0.12, 1, 2.2, 28)],
    blip: [0.32, 0.4, (f) => { tone(f, 0.02, 420, 0.14, 1, 2.4, 32); tone(f, 0.13, 540, 0.14, 1, 2.4, 32); }],
    send: [0.2, 0.3, (f) => tone(f, 0, 440, 0.13, 1, 2.1, 26)],
    receive: [0.5, 0.26, (f) => { tone(f, 0, 784, 0.16, 1, 1, 14); tone(f, 0.11, 1175, 0.3, 0.8, 1, 9); }],
    success: [1.1, 0.5, (f) => { bell(f, 0, 784, 0.7); bell(f, 0.12, 1175, 0.7); }],
    undo: [0.3, 0.3, (f) => tone(f, 0, 620, 0.2, 1, 0.55, 18)],
    error: [0.5, 0.36, (f) => { tone(f, 0, 240, 0.16, 1, 0.85, 14); tone(f, 0.17, 190, 0.26, 1, 0.85, 12); }],
    ding: [3.4, 0.98, (f) => { bell(f, 0, 988, 1); bell(f, 0.55, 1319, 1); bell(f, 1.1, 988, 1); }],
    cheer: [2.2, 0.75, (f) => { [523, 659, 784, 1046, 1319].forEach((fr, i) => bell(f, i * 0.13, fr, 1)); }],
    win: [2.6, 0.7, (f) => { [523, 659, 784, 1046].forEach((fr, i) => bell(f, i * 0.1, fr, 0.8)); bell(f, 0.5, 1568, 0.9); bell(f, 0.62, 2093, 0.5); }],
  };
  const urls = {}, pool = [];
  let pi = 0, ctx = null, master = null;

  function url(name) { if (!urls[name]) { const d = DEFS[name]; urls[name] = wav(d[0], d[1], d[2]); } return urls[name]; }

  /* Web Audio fallback, used only when an <audio> element refuses to play */
  function audio() {
    try {
      if (!ctx) { ctx = new (root.AudioContext || root.webkitAudioContext)(); master = ctx.createGain(); const c = ctx.createDynamicsCompressor(); c.threshold.value = -14; c.ratio.value = 10; master.connect(c); c.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
    return ctx;
  }
  function fallback(name) {
    const c = audio(); if (!c) return; master.gain.value = prefs.volume;
    const t = c.currentTime + 0.02, osc = (fr, at, dur, vol, glide) => {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(fr, t + at); if (glide) o.frequency.exponentialRampToValueAtTime(fr * glide, t + at + dur);
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(master); o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    if (name === 'ding' || name === 'cheer' || name === 'win' || name === 'success') [[0, 988], [0.2, 1319], [0.4, 1568]].forEach(([a, fr]) => osc(fr, a, 0.9, 0.35));
    else osc(name === 'error' ? 200 : 600, 0, 0.14, 0.25, name === 'error' ? 0.8 : 1.8);
  }

  function play(name, vol) {
    if (!prefs.sound || !DEFS[name]) return;
    try {
      if (!pool.length) { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {} for (let i = 0; i < 4; i++) { const a = new Audio(); a.preload = 'auto'; pool.push(a); } }
      const a = pool[pi++ % pool.length]; a.src = url(name); a.currentTime = 0; a.volume = Math.max(0, Math.min(1, prefs.volume * (vol == null ? 1 : vol)));
      const p = a.play(); if (p && p.catch) p.catch(() => fallback(name));
    } catch (e) { fallback(name); }
  }
  function haptic(p) { if (!prefs.haptics) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

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

  /* ---------- the small sounds every control makes ---------- */
  const TICK = 'button, [role="tab"], .seg, .chip, summary, .regionRow, .meal, label.photoBtn';
  document.addEventListener('pointerdown', (e) => {
    if (!prefs.uiTicks || !prefs.sound) return;
    const t = e.target.closest && e.target.closest(TICK); if (!t || t.disabled || t.closest('[data-silent]')) return;
    play('tap'); haptic(6);
  }, { passive: true });

  root.FX = {
    play, haptic, confetti, reduced,
    tap() { play('tap'); haptic(6); },
    get prefs() { return Object.assign({}, prefs); },
    set(k, v) { if (k in DEF) { prefs[k] = v; save(); } },
    reset() { prefs = Object.assign({}, DEF); save(); },
    names: Object.keys(DEFS),
  };
})(window);
