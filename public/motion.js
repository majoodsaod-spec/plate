/* Plate motion engine: real spring curves for CSS, instant touch feedback on iOS, and a pause while the page is hidden.
   A spring is a damped oscillator. Sampled and handed to CSS linear(), it runs on the compositor like any other easing, but it overshoots and settles like a real object.
   zeta < 1 overshoots (lower = bouncier), zeta = 1 is critically damped (the fastest approach with no overshoot). */
(function (root) {
  'use strict';
  function spring(zeta, n) {
    n = n || 44;
    const w = 12, wd = w * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta)), pts = [];
    const x = (t) => zeta >= 1 ? 1 - Math.exp(-w * t) * (1 + w * t) : 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
    let T = 0.2; while (T < 4) { let ok = true; for (let t = T; t < T + 0.5; t += 0.02) if (Math.abs(1 - x(t)) > 0.004) { ok = false; break; } if (ok) break; T += 0.05; }   // time until it has settled
    for (let i = 0; i <= n; i++) pts.push((i === n ? 1 : x(T * i / n)).toFixed(4));
    return 'linear(' + pts.join(', ') + ')';
  }
  try {
    if (root.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)')) {
      const s = document.documentElement.style;
      s.setProperty('--spring', spring(0.58));         // lively: buttons, tab icons, the water drop buttons
      s.setProperty('--spring-soft', spring(0.78));    // sheets and messages: a hint of overshoot
      s.setProperty('--spring-crit', spring(1));       // no overshoot: anything that should just glide into place
    }
  } catch (e) {}
  /* iOS only shows :active (the press-in) if the page has a touch listener; this makes every button react on touch-down, not on release */
  document.addEventListener('touchstart', function () {}, { passive: true });
  /* nothing runs while the app is in the background or the screen is locked */
  const vis = () => document.documentElement.classList.toggle('docHidden', document.hidden);
  document.addEventListener('visibilitychange', vis); vis();
  root.Motion = { spring };
})(window);
