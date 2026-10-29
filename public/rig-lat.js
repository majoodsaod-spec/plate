/* Lat pulldown rig: a jointed 3D figure projected to flat vector shapes.
   frame(pull, theta) -> SVG markup. pull: 0 = arms stretched, 1 = bar at chest.
   theta: camera angle in degrees (-90 = pure side view, -30 = front 3/4). */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const fx = (p) => (Math.round(p[0] * 10) / 10) + ' ' + (Math.round(p[1] * 10) / 10);

  /* ---------- tempo ---------- */
  const PHASES = [
    { name: 'Pull', dur: 1.6 },
    { name: 'Squeeze', dur: 0.5 },
    { name: 'Return', dur: 2.2 },
    { name: 'Stretch', dur: 0.4 },
  ];
  const CYCLE = PHASES.reduce((s, p) => s + p.dur, 0);
  const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
  function timeline(t) {
    t = ((t % CYCLE) + CYCLE) % CYCLE;
    let acc = 0;
    for (let i = 0; i < PHASES.length; i++) {
      const d = PHASES[i].dur;
      if (t < acc + d || i === PHASES.length - 1) {
        const k = (t - acc) / d;
        const pull = i === 0 ? ease(k) : i === 1 ? 1 : i === 2 ? 1 - ease(k) : 0;
        return { pull, phase: i, k, t };
      }
      acc += d;
    }
  }

  /* ---------- skeleton (cm) ---------- */
  const LEN = { UA: 29, FA: 26, THIGH: 42, SHIN: 44 };
  const BAR_X = [-62, -44, -26, 26, 44, 62];
  const BAR_DY = [-9, -3.2, 0, 0, -3.2, -9];
  const GRIP_X = 38;
  const GRIP_DY = -2.1;

  function ik(S, target, a, b, pole) {
    let d = sub(target, S);
    let L = Math.hypot(d[0], d[1], d[2]);
    const maxL = a + b - 0.01;
    if (L > maxL) { target = add(S, mul(norm(d), maxL)); d = sub(target, S); L = maxL; }
    const dn = norm(d);
    const along = (a * a - b * b + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(a * a - along * along, 0));
    const p = norm(sub(pole, mul(dn, dot(pole, dn))));
    return { E: add(add(S, mul(dn, along)), mul(p, h)), W: target };
  }

  function solve(pull) {
    const lean = (8 + 3 * pull) * D2R;
    const H = [0, 47, 0];
    const u = [0, Math.cos(lean), -Math.sin(lean)];
    const zax = [0, Math.sin(lean), Math.cos(lean)];
    const T = add(H, mul(u, 50));
    const scapUp = 2.5 * (1 - pull) - 1.5 * pull;
    const scapBack = 1.5 * pull;
    const shW = 20 - 1.2 * pull;
    const barY = T[1] + lerp(46, -4, pull);
    const barZ = lerp(12, 7, pull);
    const J = { pull, H, u, zax, T, barY, barZ, side: {} };
    for (const s of [1, -1]) {
      const S = [s * shW, T[1] + scapUp, T[2] - scapBack];
      const target = [s * GRIP_X, barY + GRIP_DY, barZ];
      const pole = [0.05 * s, -1, -0.2];
      const { E, W } = ik(S, target, LEN.UA, LEN.FA, pole);
      const hip = [s * 9.5, 49, 2];
      const knee = add(hip, mul(norm([s * 0.1, 0.07, 1]), LEN.THIGH));
      const ankle = [knee[0] + s * 0.5, knee[1] - LEN.SHIN, knee[2] + 2];
      J.side[s] = { S, E, W, hip, knee, ankle, heel: [ankle[0], 4.2, ankle[2] - 5], toe: [ankle[0] + s * 0.5, 3.4, ankle[2] + 15] };
    }
    J.head = [0, T[1] + 19, T[2] + 4];
    return J;
  }

  /* ---------- camera ---------- */
  function camera(thetaDeg) {
    const th = thetaDeg * D2R, ph = 6 * D2R, S = 3.3, cx0 = 260 - 8 * S, y0 = 572;
    const R = [Math.cos(th), 0, -Math.sin(th)];
    const C = [Math.sin(th), 0, Math.cos(th)];
    const cp = Math.cos(ph), sp = Math.sin(ph);
    return { R, C, S, proj: (P) => { const u = dot(P, R), d = dot(P, C); return [cx0 + u * S, y0 - (P[1] * cp - d * sp) * S]; } };
  }

  /* ---------- 2D shape helpers ---------- */
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const up = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  const poly = (pts) => 'M' + pts.map(fx).join('L') + 'Z';
  function circlePath(c, r) {
    return `M${Math.round((c[0] - r) * 10) / 10} ${Math.round(c[1] * 10) / 10}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  function capsulePath(p1, r1, p2, r2) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy);
    if (L < Math.abs(r1 - r2) + 0.01) return r1 >= r2 ? circlePath(p1, r1) : circlePath(p2, r2);
    const a = Math.atan2(dy, dx), b = Math.acos((r1 - r2) / L);
    const n1 = [Math.cos(a + b), Math.sin(a + b)], n2 = [Math.cos(a - b), Math.sin(a - b)];
    const A = [p1[0] + r1 * n1[0], p1[1] + r1 * n1[1]], B = [p2[0] + r2 * n1[0], p2[1] + r2 * n1[1]];
    const C = [p2[0] + r2 * n2[0], p2[1] + r2 * n2[1]], D = [p1[0] + r1 * n2[0], p1[1] + r1 * n2[1]];
    const l2 = b > Math.PI / 2 ? 1 : 0, l1 = b < Math.PI / 2 ? 1 : 0;
    return `M${fx(A)}L${fx(B)}A${r2} ${r2} 0 ${l2} 0 ${fx(C)}L${fx(D)}A${r1} ${r1} 0 ${l1} 0 ${fx(A)}Z`;
  }

  const SECT = [
    [-0.1, 14.5, 10.0], [0.2, 14.8, 9.8], [0.4, 13.0, 9.0],
    [0.62, 17.0, 10.6], [0.82, 19.8, 11.2], [0.96, 18.4, 9.2], [1.07, 11.0, 6.6],
  ];
  function sectDim(s, idx) {
    for (let i = 0; i < SECT.length - 1; i++) {
      if (s <= SECT[i + 1][0]) { const k = (s - SECT[i][0]) / (SECT[i + 1][0] - SECT[i][0]); return lerp(SECT[i][idx], SECT[i + 1][idx], Math.min(1, Math.max(0, k))); }
    }
    return SECT[SECT.length - 1][idx];
  }

  /* ---------- the picture ---------- */
  function frame(pull, theta) {
    const J = solve(pull), cam = camera(theta), S = cam.S, C = cam.C;
    const px = (p) => cam.proj(p);
    const cap = (a, ra, b, rb) => capsulePath(px(a), ra * S, px(b), rb * S);
    const circ = (a, r) => circlePath(px(a), r * S);
    const near = C[0] >= 0 ? 1 : -1, far = -near;
    const hot = (0.1 + 0.78 * pull).toFixed(2);
    const out = [];

    // One body part. Every shape is outlined first in the gap colour, then filled,
    // so the part reads as one smooth silhouette with a thin gap against its neighbours.
    const group = (items, extra) =>
      '<g>' + items.map((i) => `<path class="ol" d="${i.d}"/>`).join('') +
      items.map((i) => `<path class="${i.cls}" d="${i.d}"/>`).join('') + (extra || '') + '</g>';
    // a smooth limb: capsules chained through points with changing radius
    const chain = (pts, radii, cls) => {
      const items = [];
      for (let i = 0; i < pts.length - 1; i++) items.push({ d: cap(pts[i], radii[i], pts[i + 1], radii[i + 1]), cls });
      return items;
    };
    const along = (A, B, t) => add(A, mul(sub(B, A), t));

    /* ----- equipment ----- */
    const boxHull = (x0, x1, y0, y1, z0, z1) => {
      const pts = [];
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(px([x, y, z]));
      return poly(hull(pts));
    };
    const shadow = [];
    for (let i = 0; i < 28; i++) { const a = 2 * Math.PI * i / 28; shadow.push(px([52 * Math.cos(a), 0, 6 + 54 * Math.sin(a)])); }
    out.push(`<path class="shadow" d="${poly(hull(shadow))}"/>`);
    out.push(`<path class="eq" d="${boxHull(-22, 22, 0, 3, -20, 30)}"/>`);
    out.push(`<path class="eq" d="${cap([0, 38, 3], 3.0, [0, 3, 3], 3.0)}"/>`);
    out.push(`<path class="eq" d="${boxHull(-17, 17, 36, 41, -14, 20)}"/>`);

    /* ----- legs ----- */
    const leg = (s) => {
      const k = J.side[s], c = s === far ? 'm f' : 'm';
      const items = chain([k.hip, along(k.hip, k.knee, 0.4), k.knee, along(k.knee, k.ankle, 0.3), k.ankle], [9.0, 8.4, 6.2, 5.5, 3.4], c);
      items.push({ d: cap(k.heel, 4.0, k.toe, 3.0), cls: c });
      return group(items);
    };

    /* ----- arms and hands ----- */
    const arm = (s) => {
      const k = J.side[s], c = s === far ? 'm f' : 'm';
      return group(chain([k.S, along(k.S, k.E, 0.35), k.E, along(k.E, k.W, 0.25), k.W], [6.2, 5.7, 4.4, 4.7, 3.0], c));
    };
    const hand = (s) => {
      const k = J.side[s], W = k.W, c = s === far ? 'm f' : 'm';
      const items = [{ d: cap(add(W, [-3.4, 0.6, -0.4]), 2.9, add(W, [3.4, 0.6, -0.4]), 2.9), cls: c }];
      for (const dx of [-3.0, -1.0, 1.0, 3.0]) items.push({ d: cap(add(W, [dx, 2.0, 2.4]), 1.1, add(W, [dx, -2.8, 2.6]), 1.0), cls: c });
      let lines = '';
      for (const dx of [-2.0, 0, 2.0]) lines += `<path class="seam" d="M${fx(px(add(W, [dx, 2.4, 3.5])))}L${fx(px(add(W, [dx, -2.6, 3.6])))}"/>`;
      return group(items, lines);
    };

    /* ----- torso with the lats as the one highlighted muscle ----- */
    const surf = (s, psi, side) => {
      const wx = sectDim(s, 1), wz = sectDim(s, 2);
      const phi = Math.PI / 2 - side * psi;
      const c = add(J.H, mul(J.u, 50 * s));
      const p = add(c, add([wx * Math.cos(phi), 0, 0], mul(J.zax, wz * Math.sin(phi))));
      const nrm = norm([Math.cos(phi) / wx, 0, Math.sin(phi) / wz]);
      return { p: px(p), vis: dot(nrm, C) };
    };
    const visible = (s, psi, side) => surf(s, psi, side).vis > 0.03;
    const clipRow = (s, a, b, side) => {          // keep the part of [a, b] that faces the camera
      if (!visible(s, a, side)) {
        if (!visible(s, b, side)) return null;
        let lo = a, hi = b;
        for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (visible(s, m, side)) hi = m; else lo = m; }
        a = hi;
      }
      if (!visible(s, b, side)) {
        let lo = a, hi = b;
        for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (visible(s, m, side)) lo = m; else hi = m; }
        b = lo;
      }
      return b - a > 0.02 ? [a, b] : null;
    };
    const latPatch = (side) => {
      const L = [], R = [];
      for (let k = 0; k <= 6; k++) {
        const u = k / 6, s = lerp(0.26, 0.92, u);
        const r = clipRow(s, 1.12, 1.8 + 0.8 * u, side);
        if (!r) continue;
        L.push(surf(s, r[0], side).p); R.push(surf(s, r[1], side).p);
      }
      if (L.length < 3) return '';
      const d = poly(L.concat(R.reverse()));
      return `<path class="halo" style="opacity:${(0.15 + 0.75 * pull).toFixed(2)}" d="${d}"/><path class="h1" style="opacity:${hot}" d="${d}"/>`;
    };
    const secPts = (s, wx, wz) => {
      const c = add(J.H, mul(J.u, 50 * s)), pts = [];
      for (let i = 0; i < 18; i++) { const a = 2 * Math.PI * i / 18; pts.push(px(add(c, add([wx * Math.cos(a), 0, 0], mul(J.zax, wz * Math.sin(a)))))); }
      return pts;
    };
    const secs = SECT.map((q) => secPts(q[0], q[1], q[2]));
    const Hc = J.head;
    const torsoItems = [];
    for (let i = 0; i < secs.length - 1; i++) torsoItems.push({ d: poly(hull(secs[i].concat(secs[i + 1]))), cls: 'm' });
    torsoItems.push({ d: cap([0, J.T[1] + 1, J.T[2] + 1.5], 5.0, [0, Hc[1] - 5, Hc[2] - 1], 4.8), cls: 'm' });
    const torso = group(torsoItems, latPatch(far) + latPatch(near));

    /* ----- head: faceless, with hair and an ear ----- */
    const ell = (c, ax, filt) => {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * i / 10;
        for (let j = 0; j < 20; j++) {
          const b = 2 * Math.PI * j / 20;
          const q = [ax[0] * Math.sin(a) * Math.cos(b), ax[1] * Math.cos(a), ax[2] * Math.sin(a) * Math.sin(b)];
          if (!filt || filt(q)) pts.push(px(add(c, q)));
        }
      }
      return pts;
    };
    const head = group([
      { d: poly(hull(ell(Hc, [8.2, 11.0, 9.8]))), cls: 'm' },
      { d: poly(hull(ell(add(Hc, [0, 1.6, -1.6]), [8.7, 11.5, 10.3], (q) => q[1] - 0.6 * q[2] > 2.2))), cls: 'm hair' },
      { d: circ(add(Hc, [near * 8.2, -1.4, -2.0]), 2.2), cls: 'm' },
    ]);

    /* ----- put it together, back to front ----- */
    out.push(leg(far));
    out.push(arm(far));
    out.push(torso);
    out.push(head);
    out.push(leg(near));
    out.push(`<path class="eq2" d="${cap([-26, 63, 30], 4.5, [26, 63, 30], 4.5)}"/>`);
    out.push(arm(near));

    // bar, hook, cable
    const bar = BAR_X.map((x, i) => [x, J.barY + BAR_DY[i], J.barZ]);
    let barSvg = '';
    for (let i = 0; i < bar.length - 1; i++) barSvg += `<path class="gbar" d="${cap(bar[i], 2.0, bar[i + 1], 2.0)}"/>`;
    barSvg += `<path class="gbar" d="${cap([0, J.barY + 3.5, J.barZ], 1.5, [0, J.barY + 10, J.barZ], 1.5)}"/>`;
    out.push(`<path class="cable" d="M${fx(px([0, 330, J.barZ]))}L${fx(px([0, J.barY + 10, J.barZ]))}"/>`);
    out.push(barSvg);

    out.push(hand(far));
    out.push(hand(near));
    return out.join('');
  }

  const api = { frame, timeline, PHASES, CYCLE, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LatRig = api;
})(typeof window !== 'undefined' ? window : globalThis);
