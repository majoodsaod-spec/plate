/* Plate exercise animations (generic rig).
   Same figure and look as the lat pulldown demo (rig-lat.js): a jointed 3D body projected to flat shapes, the working muscle glowing red.
   Each move is a small "scene" function: progress p (0..1) and effort e (0..1) in, joints and props out.
   Rig2.make(key) -> { frame(p, theta, e), timeline(t), PHASES, CYCLE }. Units are cm: y up, z forward (the figure faces +z), x sideways. */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const fx = (p) => (Math.round(p[0] * 10) / 10) + ' ' + (Math.round(p[1] * 10) / 10);
  const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
  const LEN = { UA: 29, FA: 26, THIGH: 42, SHIN: 44, TORSO: 50 };

  function ik(S, target, a, b, pole) {
    let d = sub(target, S), L = Math.hypot(d[0], d[1], d[2]);
    const maxL = a + b - 0.01; let miss = 0;
    if (L > maxL) { miss = L - maxL; target = add(S, mul(norm(d), maxL)); d = sub(target, S); L = maxL; }
    const dn = norm(d), along = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(a * a - along * along, 0));
    const p = norm(sub(pole, mul(dn, dot(pole, dn))));
    return { E: add(add(S, mul(dn, along)), mul(p, h)), W: target, miss };
  }
  /* direction in the front-back plane: ang 0 = straight down, +90 = straight forward, 180 = straight up */
  const dirYZ = (ang) => [0, -Math.cos(ang * D2R), Math.sin(ang * D2R)];
  /* ankle height that keeps the toes on the floor at a given foot pitch (negative pitch = heel raised) */
  const ankleY = (pitch) => 3.4 + 4.6 * Math.cos(pitch * D2R) - 14 * Math.sin(pitch * D2R);

  /* ---------- camera ---------- */
  function camera(thetaDeg, c) {
    const th = thetaDeg * D2R, ph = 6 * D2R, S = c.S, cx0 = 260 - (c.dx || 0) * S, y0 = c.y0;
    const R = [Math.cos(th), 0, -Math.sin(th)], C = [Math.sin(th), 0, Math.cos(th)];
    const cp = Math.cos(ph), sp = Math.sin(ph);
    return { R, C, S, cx0, y0, cp, sp, proj: (P) => [cx0 + dot(P, R) * S, y0 - (P[1] * cp - dot(P, C) * sp) * S] };
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
  const circlePath = (c, r) => `M${Math.round((c[0] - r) * 10) / 10} ${Math.round(c[1] * 10) / 10}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  function capsulePath(p1, r1, p2, r2) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy);
    if (L < Math.abs(r1 - r2) + 0.01) return r1 >= r2 ? circlePath(p1, r1) : circlePath(p2, r2);
    const a = Math.atan2(dy, dx), b = Math.acos((r1 - r2) / L);
    const n1 = [Math.cos(a + b), Math.sin(a + b)], n2 = [Math.cos(a - b), Math.sin(a - b)];
    const A = [p1[0] + r1 * n1[0], p1[1] + r1 * n1[1]], B = [p2[0] + r2 * n1[0], p2[1] + r2 * n1[1]];
    const Cc = [p2[0] + r2 * n2[0], p2[1] + r2 * n2[1]], Dd = [p1[0] + r1 * n2[0], p1[1] + r1 * n2[1]];
    const l2 = b > Math.PI / 2 ? 1 : 0, l1 = b < Math.PI / 2 ? 1 : 0;
    return `M${fx(A)}L${fx(B)}A${r2} ${r2} 0 ${l2} 0 ${fx(Cc)}L${fx(Dd)}A${r1} ${r1} 0 ${l1} 0 ${fx(A)}Z`;
  }

  /* two bodies, same style: 'female' is a slimmer frame (narrower shoulders and waist, fuller hips, finer limbs, a smaller head) with hair and a ponytail */
  const BODIES = {
    male: { sect: [[-0.1, 15.0, 9.0], [0.08, 16.2, 9.6], [0.2, 15.4, 9.8], [0.4, 13.0, 9.0], [0.62, 17.0, 10.6], [0.82, 19.8, 11.2], [0.96, 18.4, 9.2], [1.07, 11.0, 6.6]], shW: 20, arm: 1, leg: 1, neck: 5.1, head: [8.2, 11.0, 9.8], foot: [1, 1], hair: false },
    female: { sect: [[-0.1, 15.4, 8.8], [0.08, 16.6, 9.3], [0.2, 16.0, 9.4], [0.4, 11.4, 7.8], [0.62, 14.2, 9.4], [0.82, 16.0, 10.2], [0.96, 14.8, 8.2], [1.07, 9.2, 5.8]], shW: 17.6, arm: 0.86, leg: 0.92, neck: 4.0, head: [7.5, 10.4, 9.2], foot: [0.94, 0.88], hair: true },
  };
  let BODY = BODIES.male, SECT = BODY.sect;
  const setBody = (k) => { BODY = BODIES[k] || BODIES.male; SECT = BODY.sect; };
  function sectDim(s, idx) {
    for (let i = 0; i < SECT.length - 1; i++) if (s <= SECT[i + 1][0]) return lerp(SECT[i][idx], SECT[i + 1][idx], Math.min(1, Math.max(0, (s - SECT[i][0]) / (SECT[i + 1][0] - SECT[i][0]))));
    return SECT[SECT.length - 1][idx];
  }
  /* where on the torso each muscle sits: s = height along the torso (0 hips .. 1 shoulders), psi = angle around it (0 front, pi back) */
  const PATCH = {
    lats:      { s: [0.26, 0.92], psi: (u) => [1.12, 1.8 + 0.8 * u] },
    chest:     { s: [0.56, 0.88], psi: () => [0.15, 1.05] },
    abs:       { s: [0.06, 0.52], psi: () => [0.0, 0.85] },
    obliques:  { s: [0.1, 0.46], psi: () => [0.85, 1.7] },
    lowerback: { s: [0.04, 0.4], psi: () => [2.45, 3.14] },
    midback:   { s: [0.5, 0.84], psi: () => [2.3, 3.14] },
    traps:     { s: [0.78, 1.04], psi: () => [2.2, 3.14] },
  };

  /* ---------- limb shapes: stations along each bone with a radius and a sideways shift, so limbs have real muscle contours
     (deltoid cap, biceps, forearm swell, quad sweep, a calf that bulges at the back) instead of plain tubes. [t, radius, forward, outward] ---------- */
  const PROF = {
    th: [[0, 8.6, 0, 0.3], [0.18, 8.7, 0.6, 0.6], [0.4, 8.0, 0.8, 0.7], [0.6, 7.1, 0.8, 0.5], [0.8, 6.2, 0.4, 0.1], [0.93, 5.8, 0.3, -0.2], [1, 5.6, 0.2, 0]],   // the mass sits to the outside (a gap between the thighs), tapering into the knee
    sh: [[0, 5.6, 0.2, 0], [0.12, 5.6, -0.8, 0], [0.27, 6.0, -1.9, 0.1], [0.43, 5.2, -1.5, 0], [0.62, 4.1, -0.7, 0], [0.84, 3.4, -0.2, 0], [1, 3.2, 0, 0]],
    ua: [[0, 6.0, 0, 0.8], [0.14, 6.2, 0.2, 1.0], [0.32, 5.0, 0.1, 0.4], [0.55, 5.0, 0.4, 0.1], [0.8, 4.4, 0.2, 0], [1, 4.1, 0, 0]],
    fa: [[0, 4.1, 0, 0], [0.18, 4.7, 0.3, 0.5], [0.42, 4.1, 0.2, 0.2], [0.72, 3.3, 0, 0], [1, 2.9, 0, 0]],
  };

  /* ---------- props (declarative, so they follow the camera) ---------- */
  const P = {
    cap: (cls, a, ra, b, rb, layer) => ({ t: 'cap', cls, a, ra, b, rb: rb || ra, layer: layer || 'near' }),
    box: (cls, x0, x1, y0, y1, z0, z1, layer) => ({ t: 'box', cls, b: [x0, x1, y0, y1, z0, z1], layer: layer || 'back' }),
    disc: (cls, c, axis, r, th, layer) => ({ t: 'disc', cls, c, axis, r, th, layer: layer || 'near' }),
    slab: (cls, a, b, w, th, layer) => ({ t: 'slab', cls, a, b, w, th, layer: layer || 'back' }),
    line: (cls, a, b, layer) => ({ t: 'line', cls, a, b, layer: layer || 'back' }),
    ball: (cls, c, r, layer) => ({ t: 'ball', cls, c, r, layer: layer || 'back' }),
    /* a barbell along x: handle, collars, a plate on each end */
    barbell: (c, o) => {
      o = o || {}; const half = o.half || 62, R = o.R || 13, th = o.th || 4.5, layer = o.layer || 'near', out = [];
      out.push(P.cap('gbar', add(c, [-half, 0, 0]), 1.6, add(c, [half, 0, 0]), 1.6, layer));
      for (const s of [-1, 1]) { out.push(P.disc('eq2', add(c, [s * (half - 10), 0, 0]), 'x', R, th, layer)); out.push(P.disc('eq2', add(c, [s * (half - 16), 0, 0]), 'x', R * 0.92, th, layer)); }
      return out;
    },
    /* a dumbbell, handle along x or z */
    dumbbell: (c, axis, layer, R) => {
      const v = Array.isArray(axis) ? axis : axis === 'x' ? [1, 0, 0] : [0, 0, 1], out = [], g = ++P.gid;
      out.push(P.cap('gbar', sub(c, mul(v, 6)), 1.5, add(c, mul(v, 6)), 1.5, layer));
      for (const s of [-1, 1]) out.push(P.disc('eq2', add(c, mul(v, s * 8)), Array.isArray(axis) ? axis : axis, R || 5.6, 3.4, layer));
      out.forEach((q) => { q._g = g; });
      out[0]._db = { axis: v, R: R || 5.6, layer };
      return out;
    },
    gid: 0,
  };

  /* ---------- the figure ---------- */
  function solveBody(sc) {
    const a = sc.a * D2R, H = sc.H, r = (sc.roll || 0) * D2R;
    const u = [0, Math.cos(a), Math.sin(a)];
    const L = [Math.cos(r), Math.sin(r) * Math.sin(a), -Math.sin(r) * Math.cos(a)];            // sideways axis of the body (rolled for side-lying moves)
    const zax = [Math.sin(r), -Math.sin(a) * Math.cos(r), Math.cos(a) * Math.cos(r)];          // front-facing axis
    const T = add(H, mul(u, LEN.TORSO));
    const sh = sc.sh || [0, 0];                      // shoulder shrug up (cm), forward (cm)
    const shW = sc.shW || BODY.shW;
    const J = { H, u, zax, L, T, side: {}, head: sc.head || add(add(T, mul(u, 19)), mul(zax, 3.5)) };
    for (const s of [1, -1]) {
      const S = add(add(T, mul(L, s * shW)), [0, sh[0], sh[1]]);
      const A = sc.arm(s, S, J) || {};
      let E, W, aMiss = 0;
      if (A.E) { E = A.E; W = A.W; } else { const r = ik(S, A.W, LEN.UA, LEN.FA, A.pole || [0, -1, 0]); E = r.E; W = r.W; aMiss = r.miss; }
      const hip = add(H, mul(L, s * 9.5));
      const LG = sc.leg(s, hip, J) || {};
      let knee, ankle, lMiss = 0;
      const pitch = (LG.pitch || 0) * D2R, ff = [0, Math.sin(pitch), Math.cos(pitch)], dn = [0, -Math.cos(pitch), Math.sin(pitch)];
      if (LG.K) { knee = LG.K; ankle = LG.A; } else {
        let pole = LG.pole || [0, 0, 1], r = ik(hip, LG.A, LEN.THIGH, LEN.SHIN, pole);
        /* a knee only bends toward the way the toes point; if the pole put it the other way (a hyperextended, kinked leg), bend it the natural way */
        if (!(sc.noKneeFix)) {
          const ax = norm(sub(r.W, hip)), mid = add(hip, mul(ax, dot(sub(r.E, hip), ax))), off = sub(r.E, mid), ol = Math.hypot(off[0], off[1], off[2]);
          const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
          const w = sm(((-0.2 - dot(off, ff) / (ol || 1)) / 0.5)) * sm((ol - 0.8) / 2.2);       // how far the knee has wandered to the wrong side (smooth, so the leg never snaps)
          if (w > 0.001) { const th = Math.PI * w, c = Math.cos(th), sn = Math.sin(th), pp = norm(sub(pole, mul(ax, dot(pole, ax)))), kx = [ax[1] * pp[2] - ax[2] * pp[1], ax[2] * pp[0] - ax[0] * pp[2], ax[0] * pp[1] - ax[1] * pp[0]]; r = ik(hip, LG.A, LEN.THIGH, LEN.SHIN, add(mul(pp, c), mul(kx, sn))); }   // turn the knee round the leg axis rather than flipping it
        }
        knee = r.E; ankle = r.W; lMiss = r.miss;
      }
      J.side[s] = { dn, ff, aMiss, lMiss, S, E, W, Hd: A.Hd || null, hip, knee, ankle, heel: add(add(ankle, mul(ff, -5)), mul(dn, 4)), toe: add(add(ankle, mul(ff, 14)), mul(dn, 4.6)) };
    }
    return J;
  }

  function frame(sc, p, e, theta, ex) {
    const sx = sc.pose(p, e), J = solveBody(sx);
    const cam = camera(theta, sc.cam), S = cam.S, C = cam.C, px = (q) => cam.proj(q);
    const cap = (a, ra, b, rb) => capsulePath(px(a), ra * S, px(b), rb * S);
    const near = dot(J.L, C) >= 0 ? 1 : -1, far = -near;
    const farDark = Math.abs(dot(J.L, C)) > 0.35;              // the far side is shaded darker only when it really is farther (not when facing the camera head-on)
    const hot = sx.hot || [];
    let asst = false;   // the muscle asked for last is a helper (not the first one listed), so it glows yellow
    const hv = (m, sd) => (asst = hot.length > 0 && hot[0][0] !== m, hot).reduce((mx, h) => (h[0] === m && (h[2] == null || h[2] === sd || sd == null) ? Math.max(mx, h[1]) : mx), 0);
    const along = (A, B, t) => add(A, mul(sub(B, A), t));
    let clipN = 0; const off = (0.55 * S).toFixed(1);
    /* each body part: dark base, then a lighter copy shifted toward the light and clipped to the part, which leaves a soft shadow crescent on the far edge (reads as volume) */
    const group = (items, extra) => {
      let defs = '', lit = '';
      items.forEach((i) => { const id = 'k' + (++clipN); defs += `<clipPath id="${id}"><path d="${i.d}"/></clipPath>`; lit += i.nolit ? '' : `<g clip-path="url(#${id})"><path class="${i.cls} lit" transform="translate(-${off} -${off})" d="${i.d}"/></g>`; });
      return '<g>' + defs + items.map((i) => (i.noOl ? '' : `<path class="ol" d="${i.d}"/>`)).join('') + items.map((i) => `<path class="${i.cls} dk" d="${i.d}"/>`).join('') + lit + (extra || '') + '</g>';
    };
    /* the torso and both legs are drawn as ONE body: every outline first, then every fill in depth order, so there is no seam where the pelvis meets the thighs */
    /* the torso and legs (and each arm) are drawn as ONE body: every outline first, then the parts in depth order in their plain colour with their
       muscles, and last one soft shadow along the outer edge of the whole body, so there is no line or crescent where the thigh meets the hip */
    const groupSeq = (parts) => {
      let ol = '', body = '', all = '';
      parts.forEach((pt) => pt.items.forEach((i) => { ol += `<path class="ol" d="${i.d}"/>`; all += `<path d="${i.d}"/>`; }));
      parts.forEach((pt) => { body += pt.items.map((i) => `<path class="${i.cls}" d="${i.d}"/>`).join('') + (pt.hl || ''); });
      const id = 'k' + (++clipN), sh = parts.map((pt) => pt.items.map((i) => `<path class="${i.cls} dk" d="${i.d}"/>`).join('')).join('');
      const defs = `<mask id="${id}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="5000" height="5000"><g fill="#fff">${all}</g><g fill="#000" transform="translate(-${off} -${off})">${all}</g></mask>`;
      return '<g>' + defs + ol + body + `<g mask="url(#${id})" style="opacity:.9">${sh}</g>` + '</g>';
    };
    const chain = (pts, radii, cls) => pts.slice(0, -1).map((q, i) => ({ d: cap(q, radii[i], pts[i + 1], radii[i + 1]), cls }));
    const glow = (d, v) => { const c = asst ? ' as' : ''; return `<path class="halo${c}" style="opacity:${(0.15 + 0.75 * v).toFixed(2)}" d="${d}"/><path class="h1${c}" style="opacity:${(0.1 + 0.78 * v).toFixed(2)}" d="${d}"/>`; };
    const limbHL = (a, b, t0, t1, r0, r1, v) => v > 0.001 ? glow(cap(along(a, b, t0), r0, along(a, b, t1), r1), v) : '';
    const ballHL = (c, r, v) => v > 0.001 ? glow(circlePath(px(c), r * S), v) : '';
    /* muscle bellies: a tapered shape sitting on one side of the limb, so biceps/triceps and quads/hamstrings read as different muscles; faded when that side faces away */
    const perp = (v, ax) => { const q = sub(v, mul(ax, dot(v, ax))); const n = Math.hypot(...q); return n > 1e-4 ? mul(q, 1 / n) : null; };
    const sideDir = (A, B, F) => { const ax = norm(sub(B, A)); let f = perp(F, ax); if (!f) f = perp(J.zax, ax) || [0, 0, 1]; return f; };
    const belly = (A, B, t0, t1, rmax, off, side, v) => {
      if (v < 0.001) return '';
      rmax *= BODY.leg; off *= BODY.leg;
      const vis = dot(side, C), fade = 0.35 + 0.65 * Math.max(0, Math.min(1, (vis + 0.25) / 0.7)), prof = [0.5, 0.88, 1, 0.86, 0.45];
      const pts = prof.map((_, i) => add(along(A, B, lerp(t0, t1, i / 4)), mul(side, off)));
      let d = ''; for (let i = 0; i < 4; i++) d += cap(pts[i], prof[i] * rmax, pts[i + 1], prof[i + 1] * rmax);
      return glow(d, v * fade);
    };

    /* ----- the muscle map on the 3D body: the same artwork as the Muscles tab, each muscle outline wrapped onto the surface of its limb or of the
       torso (front view on the front half, back view on the back half), so it turns, bends and foreshortens with the figure. A muscle
       outline that runs round the side stops at the silhouette edge. The glow for a worked muscle uses the same outlines. ----- */
    const SK = root.Rig2Detail !== false && root.RigSkin ? root.RigSkin[BODY === BODIES.female ? 'female' : 'male'] : null;
    const clampN = (x) => Math.max(-1, Math.min(1, x));
    /* the male artwork starts its thigh muscles a little below the groin crease; pull the top of the front of the thigh up to meet it, as the female artwork already does */
    if (SK && BODY !== BODIES.female && !SK.__thUp) { SK.__thUp = 1; SK.forEach((r) => { if (r.b === 'th' && r.v === 'f') r.p = r.p.map(([t, x]) => [t < 0.6 ? t - 0.2 * (1 - t / 0.6) : t, x]); }); }
    /* across the artwork (-1..1, edge to edge) -> angle round the body. Half way between a true orthographic unwrap (exact from the front)
       and an even spread (so the sides, seen side-on, still show their muscles instead of thin slivers) */
    const wrapA = (x) => { x = clampN(x); return 0.3 * Math.asin(x) + 0.7 * x * Math.PI / 2; };
    const radAt = (rs, ts, t) => { if (t <= ts[0]) return rs[0]; for (let i = 0; i < ts.length - 1; i++) if (t <= ts[i + 1]) return lerp(rs[i], rs[i + 1], (t - ts[i]) / (ts[i + 1] - ts[i])); return rs[rs.length - 1]; };
    const smoothPath = (p) => { const n = p.length; if (n < 3) return poly(p); const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let d = 'M' + fx(m(p[n - 1], p[0])); for (let i = 0; i < n; i++) d += 'Q' + fx(p[i]) + ' ' + fx(m(p[i], p[(i + 1) % n])); return d + 'Z'; };
    const angNear = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
    const GROUPHOT = { back: ['lats', 'midback'] };
    const hotOf = (g, sd) => {
      if (!g) return 0;
      const names = GROUPHOT[g] || [g]; let best = names[0], bv = -1;
      names.forEach((n) => { const v = hv(n, sd); if (v > bv) { bv = v; best = n; } });
      return hv(best, sd);                                     // called last for the winner, so the yellow/red choice follows it
    };
    const skinDraw = (rec, pts, vs, farSide, strict) => {
      let nv = 0; vs.forEach((v) => { if (v > (strict ? 0.15 : 0.06)) nv++; }); if (nv < Math.max(3, vs.length * (strict ? 0.5 : 0.3))) return '';      // mostly round the back: skip it rather than leave a sliver on the edge
      let sum = 0; vs.forEach((v) => { sum += Math.max(0, v); }); const o = Math.max(0, Math.min(1, (sum / vs.length) / 0.45));
      const d = smoothPath(pts), cls = rec.g ? 'skm' : 'ski';
      let svg = `<path class="${cls}${farSide ? ' f' : ''}" style="opacity:${(0.55 + 0.45 * o).toFixed(2)}" d="${d}"/>`;
      const v = hotOf(rec.g, rec.s); if (v > 0.001) svg += glow(d, v * (0.45 + 0.55 * o));
      return svg;
    };
    const limbFrame = (b, k) => {
      const L = BODY.leg, A = BODY.arm;
      const sc = b === 'th' || b === 'sh' ? L : A, pr = PROF[b];
      const f = b === 'th' ? { A: k.hip, B: k.knee, F: mul(sub(k.ankle, k.knee), -1) } : b === 'sh' ? { A: k.knee, B: k.ankle, F: k.ff || J.zax } : b === 'ua' ? { A: k.S, B: k.E, F: sub(k.W, k.E) } : { A: k.E, B: k.W, F: sub(k.S, k.E) };
      f.ts = pr.map((q) => q[0]); f.rs = pr.map((q) => q[1] * sc);
      f.ax = norm(sub(f.B, f.A)); f.len = Math.hypot(...sub(f.B, f.A)); f.u = sideDir(f.A, f.B, f.F); let w = norm(cross3(f.ax, f.u)); if (dot(w, J.L) < 0) w = mul(w, -1); f.w = w;
      f.cu = dot(f.u, C); f.cl = dot(f.w, C); f.ph0 = Math.atan2(-f.cu, f.cl);
      return f;
    };
    const skinLimb = (bones, s) => {
      if (!SK) return '';
      const k = J.side[s], fr = {}; bones.forEach((b) => { fr[b] = limbFrame(b, k); });
      let out = '';
      for (const rec of SK) {
        if (rec.s !== s || !fr[rec.b]) continue;
        const f = fr[rec.b], pts = [], vs = [];
        for (const [t, xn] of rec.p) {
          const a = wrapA(xn); let ph = rec.v === 'f' ? a : Math.PI + a;
          /* past either end of the bone the artwork wraps over the rounded joint (knee, elbow, shoulder) instead of running on in a straight line */
          let beta = 0, end = null, tt = t;
          if (t > 1) { end = 1; tt = 1; beta = Math.min(Math.PI / 2, (t - 1) * f.len / f.rs[f.rs.length - 1]); }
          else if (t < 0) { end = 0; tt = 0; beta = Math.min(Math.PI / 2, -t * f.len / f.rs[0]); }
          const nAt = (p2) => add(mul(f.u, Math.cos(p2)), mul(f.w, Math.sin(p2)));
          const tip = end === 1 ? f.ax : mul(f.ax, -1);
          const nrm = (p2) => (end == null ? nAt(p2) : add(mul(nAt(p2), Math.cos(beta)), mul(tip, Math.sin(beta))));
          let v = dot(nrm(ph), C); vs.push(v);
          if (v < 0) { ph = angNear(ph, f.ph0) < angNear(ph, f.ph0 + Math.PI) ? f.ph0 : f.ph0 + Math.PI; }   // round the side: stop at the silhouette
          const r = radAt(f.rs, f.ts, tt) * 1.01;
          pts.push(px(add(along(f.A, f.B, tt), mul(nrm(ph), r))));
        }
        const svg = skinDraw(rec, pts, vs, s === far && farDark);
        out += svg;
      }
      return out;
    };
    const skinTorso = () => {
      if (!SK) return '';
      const cL = dot(J.L, C), cz = dot(J.zax, C);
      let out = '';
      for (const rec of SK) {
        if (rec.b !== 'to') continue;
        const pts = [], vs = [];
        if (rec.g === 'glutes') {                 // the glutes are laid on the back of the pelvis volume, seen straight from behind
          for (const [s0, xn] of rec.p) {
            let lx = xn * sectDim(Math.max(-0.1, Math.min(1.07, s0)), 1) * (rec.v === 'b' ? -1 : 1), ly = LEN.TORSO * s0 + 3;
            let qx = lx / PELV.r[0], qy = (ly - 2.5) / PELV.r[1]; const qq = qx * qx + qy * qy; if (qq > 0.8) { const k = Math.sqrt(0.8 / qq); qx *= k; qy *= k; }   // stay on the back of the pelvis
            const qz = -Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
            const P = add(PELV.c, add(add(mul(J.L, qx * PELV.r[0] * 1.015), mul(J.u, qy * PELV.r[1] * 1.015)), mul(J.zax, qz * PELV.r[2] * 1.015)));
            const n = norm(add(add(mul(J.L, qx / PELV.r[0]), mul(J.u, qy / PELV.r[1])), mul(J.zax, qz / PELV.r[2])));
            vs.push(dot(n, C)); pts.push(px(P));
          }
          out += skinDraw(rec, pts, vs, false, true); continue;
        }
        for (const [s0, xn] of rec.p) {
          const s = Math.max(-0.45, Math.min(1.25, s0)), sc = Math.max(-0.1, Math.min(1.07, s));
          let wx = sectDim(sc, 1), wz = sectDim(sc, 2);
          if (s > 1.04) { const k = Math.min(1, (s - 1.04) / 0.14); wx = lerp(wx, BODY.neck * 1.25, k); wz = lerp(wz, BODY.neck * 1.1, k); }
          wx *= 1.02; wz *= 1.02;
          let ph = rec.v === 'f' ? Math.PI / 2 - wrapA(xn) : -Math.PI / 2 - wrapA(xn);
          const a = cL / wx, b = cz / wz, v = (Math.cos(ph) * a + Math.sin(ph) * b) / Math.hypot(a, b); vs.push(v);
          if (v < 0) { const p0 = Math.atan2(-a, b); ph = angNear(ph, p0) < angNear(ph, p0 + Math.PI) ? p0 : p0 + Math.PI; }
          const c = add(J.H, mul(J.u, LEN.TORSO * s));
          pts.push(px(add(c, add(mul(J.L, wx * Math.cos(ph)), mul(J.zax, wz * Math.sin(ph))))));
        }
        const svg = skinDraw(rec, pts, vs, false);
        out += svg;
      }
      return out;
    };
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    /* ----- props ----- */
    /* ----- solid kit (frames, uprights, pads, plates): a box drawn with its visible faces lit differently (top lightest, the side away from the light darkest)
       so machines read as solid objects. Thin flat boxes off the floor are upholstered pads: dark, with rounded corners. ----- */
    const LIGHT = norm(add(add(mul(cam.R, -0.55), [0, 0.8, 0]), mul(C, 0.35)));
    const matOf = (q) => {
      if (q.cls !== 'eq' && q.cls !== 'eqd') return q.cls;
      let lo, hi;
      if (q.t === 'box') { lo = [q.b[0], q.b[2], q.b[4]]; hi = [q.b[1], q.b[3], q.b[5]]; }
      else { const dims = [2 * q.w, Math.hypot(...sub(q.b, q.a)), q.th].sort((a, b) => a - b); return dims[0] <= 9 && dims[1] >= 14 && Math.min(q.a[1], q.b[1]) > 8 && Math.max(q.a[1], q.b[1]) < 150 ? 'pad' : q.cls; }
      const dm = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].sort((a, b) => a - b);
      return dm[0] <= 9 && dm[1] >= 14 && lo[1] > 8 && hi[1] < 150 ? 'pad' : q.cls;      // (high crossbars are steel, not upholstery)
    };
    /* corners in bit order (x, y, z: 0/1 as in the loops above); faces as corner lists */
    const FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    const solid = (P8, cls) => {
      const ctr = P8.reduce((a, p) => add(a, mul(p, 1 / 8)), [0, 0, 0]), vdir = add(mul(C, cam.cp), mul([0, 1, 0], cam.sp));
      const pad = cls === 'pad';
      let o = `<path class="${cls}${pad ? ' padb' : ''}" d="${poly(hull(P8.map(px)))}"/>`;
      for (const f of FACES) {
        const fc = f.reduce((a, i) => add(a, mul(P8[i], 0.25)), [0, 0, 0]); let n = sub(fc, ctr); const nl = Math.hypot(...n); if (nl < 1e-6) continue; n = mul(n, 1 / nl);
        const vis = dot(n, vdir); if (vis < 0.04) continue;
        const pts = f.map((i) => px(P8[i])), lit = dot(n, LIGHT);
        const sh = lit > 0.35 ? `<path class="hlf" style="opacity:${Math.min(0.9, (lit - 0.2) * (pad ? 0.6 : 0.9)).toFixed(2)}" d="${poly(pts)}"/>` : lit < 0 ? `<path class="hlr" style="opacity:${Math.min(1, -lit * 1.6 + 0.3).toFixed(2)}" d="${poly(pts)}"/>` : '';
        o += sh + (pad ? '' : `<path class="edge" d="${poly(pts)}"/>`);
        if (cls === 'stk' && Math.abs(n[1]) < 0.5) {                     // a weight stack: a line between every plate
          const ed = []; for (const i of f) if (!(i & 2)) ed.push([P8[i], P8[i | 2]]);
          if (ed.length === 2) { const nPl = Math.max(4, Math.round(Math.abs(ed[0][1][1] - ed[0][0][1]) / 3.4)); let dl = ''; for (let k = 1; k < nPl; k++) { const u = k / nPl; dl += 'M' + fx(px(along(ed[0][0], ed[0][1], u))) + 'L' + fx(px(along(ed[1][0], ed[1][1], u))); } o += `<path class="stkl" d="${dl}"/>`; }
        }
      }
      return o;
    };
    /* a cable tower built inside a column's footprint: two uprights, a top bar, a base, and a weight stack on guide rods between the uprights */
    const boxSvg = (b, cls) => { const P8 = []; for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) P8.push([x, y, z]); return solid(P8, cls); };
    const towerOf = (b) => {
      const [x0, x1, y0, y1, z0, z1] = b, wideX = x1 - x0 >= z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = wideX ? (x1 - x0) / 2 : (z1 - z0) / 2, th = Math.min(4, (wideX ? z1 - z0 : x1 - x0) / 2);
      const bx = (a0, a1, yA, yB, t) => (wideX ? [cx + a0, cx + a1, yA, yB, cz - t, cz + t] : [cx - t, cx + t, yA, yB, cz + a0, cz + a1]);
      const pt = (a, y) => (wideX ? [cx + a, y, cz] : [cx, y, cz + a]);
      const up = Math.min(5, half * 0.28), sw = Math.max(5, half - up - 4), sh = Math.min(52, (y1 - y0) * 0.26);
      let o = boxSvg(bx(-half - 2, half + 2, 0, Math.min(4, y0 + 4), th + 6), 'eq');
      o += boxSvg(bx(-half, -half + up, y0, y1, th), 'eq') + boxSvg(bx(half - up, half, y0, y1, th), 'eq');
      for (const a of [-sw * 0.7, sw * 0.7]) { const A = px(pt(a, y0 + 2)), B = px(pt(a, y1 - 6)); o += `<path class="cable" style="stroke-width:1.2" d="M${fx(A)}L${fx(B)}"/>`; }
      o += boxSvg(bx(-sw, sw, y0 + 2, y0 + 2 + sh, th * 0.8), 'stk') + boxSvg(bx(-sw, sw, y0 + 2 + sh, y0 + 6 + sh, th * 0.8), 'eq2');
      { const A = px(pt(0, y0 + 6 + sh)), B = px(pt(0, y0 + sh + 70)); o += `<path class="cable" style="stroke-width:1.8" d="M${fx(A)}L${fx(B)}"/>`; }
      o += boxSvg(bx(-half, half, y1 - 6, y1, th + 1), 'eq');
      return o;
    };
    const drawProp = (q) => {
      if (q.t === 'cap') {
        const base = `<path class="${q.cls}" d="${cap(q.a, q.ra, q.b, q.rb)}"/>`;
        const p1 = px(q.a), p2 = px(q.b), dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy), r = Math.min(q.ra, q.rb) * S;
        if (L < 3 * r || r < 2.2 || q.cls === 'cable') return base;                 // too short or thin to need a highlight
        let nx = -dy / L, ny = dx / L; if (nx + ny > 0) { nx = -nx; ny = -ny; }       // the side facing the light (up and left)
        const k = 0.42 * r, e1 = r * 0.7 / L, a1 = [p1[0] + dx * e1 + nx * k, p1[1] + dy * e1 + ny * k], b1 = [p2[0] - dx * e1 + nx * k, p2[1] - dy * e1 + ny * k];
        return base + `<path class="hl" style="stroke-width:${(0.36 * r).toFixed(1)}px" d="M${fx(a1)}L${fx(b1)}"/>`;
      }
      if (q.t === 'box') {
        const [x0, x1, y0, y1, z0, z1] = q.b, dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
        if ((q.cls === 'eq' || q.cls === 'eqd') && dy >= 110 && Math.min(dx, dz) >= 6 && Math.max(dx, dz) >= 14 && Math.max(dx, dz) <= 60 && y0 < 20) return towerOf(q.b);   // a solid column is drawn as a real cable tower
        const P8 = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) P8.push([x, y, z]); return solid(P8, matOf(q));
      }
      if (q.t === 'disc') {
        const pts = [], ax = Array.isArray(q.axis) ? norm(q.axis) : q.axis === 'x' ? [1, 0, 0] : q.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
        let e1 = q.axis === 'x' ? [0, 1, 0] : [1, 0, 0], e2 = q.axis === 'z' ? [0, 1, 0] : [0, 0, 1];
        if (Array.isArray(q.axis)) { const up0 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; e1 = norm([ax[1] * up0[2] - ax[2] * up0[1], ax[2] * up0[0] - ax[0] * up0[2], ax[0] * up0[1] - ax[1] * up0[0]]); e2 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]]; }
        for (const sgn of [-1, 1]) for (let i = 0; i < 24; i++) { const g = 2 * Math.PI * i / 24; pts.push(px(add(add(q.c, mul(ax, sgn * q.th / 2)), add(mul(e1, q.r * Math.cos(g)), mul(e2, q.r * Math.sin(g)))))); }
        let face = '';
        if (q.r * S > 9 && q.cls !== 'tire' && q.cls !== 'hole' && q.cls !== 'rim') {      // a recessed face on plates, wheels and housings
          const pf = [];
          for (let i = 0; i < 24; i++) { const g = 2 * Math.PI * i / 24; pf.push(px(add(add(q.c, mul(ax, (q.th / 2 + 0.05))), add(mul(e1, q.r * 0.72 * Math.cos(g)), mul(e2, q.r * 0.72 * Math.sin(g)))))); }
          face = `<path class="hlr" d="${poly(hull(pf))}"/>`;
        }
        return `<path class="${q.cls}" d="${poly(hull(pts))}"/>` + face;
      }
      if (q.t === 'slab') {
        const d = norm(sub(q.b, q.a)), nr = [0, -d[2], d[1]], P8 = [];
        for (const x of [-q.w, q.w]) for (const e2 of [q.a, q.b]) for (const sg of [-1, 1]) P8.push(add(add(e2, mul(nr, sg * q.th / 2)), [x, 0, 0]));
        return solid(P8, matOf(q));
      }
      if (q.t === 'line') return `<path class="cable" d="M${fx(px(q.a))}L${fx(px(q.b))}"/>`;
      if (q.t === 'ball') {
        const c = px(q.c), r = q.r * S, base = `<path class="${q.cls}" d="${circlePath(c, r)}"/>`;
        return r < 4 ? base : base + `<path class="hlf" d="${circlePath([c[0] - r * 0.3, c[1] - r * 0.32], r * 0.42)}"/>`;
      }
      return '';
    };
    const isImpl = (q) => (q.cls === 'gbar' || q.cls === 'eq2') && (q.t === 'cap' || q.t === 'disc' || q.t === 'ball') && q.layer !== 'back';
    /* machine parts that can stand between the camera and the figure (uprights, panels, consoles, posts, housings) are depth-sorted automatically;
       floors, benches, decks and long horizontal slabs stay behind the figure */
    const bboxOf = (q) => {
      let lo, hi;
      if (q.t === 'box') { lo = [q.b[0], q.b[2], q.b[4]]; hi = [q.b[1], q.b[3], q.b[5]]; }
      else if (q.t === 'cap') { const r = Math.max(q.ra, q.rb); lo = [Math.min(q.a[0], q.b[0]) - r, Math.min(q.a[1], q.b[1]) - r, Math.min(q.a[2], q.b[2]) - r]; hi = [Math.max(q.a[0], q.b[0]) + r, Math.max(q.a[1], q.b[1]) + r, Math.max(q.a[2], q.b[2]) + r]; }
      else if (q.t === 'ball' || q.t === 'disc') { const r = q.r; lo = [q.c[0] - r, q.c[1] - r, q.c[2] - r]; hi = [q.c[0] + r, q.c[1] + r, q.c[2] + r]; }
      else if (q.t === 'slab') { lo = [Math.min(q.a[0], q.b[0]) - q.w, Math.min(q.a[1], q.b[1]) - q.th / 2, Math.min(q.a[2], q.b[2]) - q.th / 2]; hi = [Math.max(q.a[0], q.b[0]) + q.w, Math.max(q.a[1], q.b[1]) + q.th / 2, Math.max(q.a[2], q.b[2]) + q.th / 2]; }
      else return null;
      return { lo, hi };
    };
    const autoSort = (q) => {
      if (sx.noSort || root.__nosortTest || q.bg || q.layer !== 'back' || q.t === 'line' || q.cls === 'shadow') return null;
      const bb = bboxOf(q); if (!bb) return null;
      const dx = bb.hi[0] - bb.lo[0], dy = bb.hi[1] - bb.lo[1], dz = bb.hi[2] - bb.lo[2];
      if (bb.hi[1] < 14) return null;                                       // on the floor
      if (dy < 14 && dy <= Math.min(dx, dz)) return null;                   // a horizontal plate: floor, pad, bench top, belt
      if (!(Math.min(dx, dz) <= 12 || Math.max(dx, dy, dz) < 45)) return null; // chunky long things stay behind
      let dmin = 1e9;                                                        // only a part that lies wholly in front of the figure (nearer the camera than the body) is moved forward
      dmin = dep([(bb.lo[0] + bb.hi[0]) / 2, (bb.lo[1] + bb.hi[1]) / 2, (bb.lo[2] + bb.hi[2]) / 2]);
      if (dmin < dep(add(J.H, mul(J.u, 22))) + 11) return null;
      return [(bb.lo[0] + bb.hi[0]) / 2, (bb.lo[1] + bb.hi[1]) / 2, (bb.lo[2] + bb.hi[2]) / 2];
    };
    const props = (layer) => (sx.props || []).filter((q) => q.layer === layer && !isImpl(q) && !(layer === 'back' && autoSort(q))).map(drawProp).join('');

    /* ----- body parts ----- */
    const limbItems = (b, A, B, F, s, scl, c) => {
      const ax = norm(sub(B, A)), fw = sideDir(A, B, F); let ow = norm(cross3(ax, fw)); if (dot(ow, mul(J.L, s)) < 0) ow = mul(ow, -1);
      const pts = PROF[b].map(([t, , f, o]) => add(along(A, B, t), add(mul(fw, f * scl), mul(ow, o * scl))));
      const out = chain(pts, PROF[b].map((q) => q[1] * scl), c);
      if (b === 'th') {
        /* the root of the thigh: no ball on top. Real legs start at the groin crease, flat across the inside and the front, and the hip
           joint is buried in the pelvis; only the outside rounds over the top of the femur. So the first piece is the thigh's own cross
           sections from the joint down, plus a rounded quarter on the outer side only. */
        const r0 = PROF.th[0][1] * scl, r1 = PROF.th[1][1] * scl, P3 = [];
        const ring = (c, r, n) => { for (let i = 0; i < n; i++) { const g = 2 * Math.PI * i / n; P3.push(add(c, add(mul(fw, r * Math.cos(g)), mul(ow, r * Math.sin(g))))); } };
        /* the groin crease runs diagonally: high on the outside of the hip, low on the inside, where the thigh meets the crotch */
        const D = 0.2 * LEN.THIGH * scl;
        for (let i = 0; i < 32; i++) { const g = 2 * Math.PI * i / 32, so = Math.sin(g), co = Math.cos(g), dd = D * 0.5 * (1 - so) * (co < 0 ? 0.55 : 1);
          P3.push(add(add(pts[0], mul(ax, dd)), add(mul(fw, r0 * co), mul(ow, r0 * so)))); }
        ring(pts[1], r1, 24);
        for (let i = 1; i <= 4; i++) { const a = (Math.PI / 2) * i / 5; for (let j = -6; j <= 6; j++) { const g = Math.PI / 2 + (Math.PI / 2.4) * j / 6;
          const dir = add(mul(ax, -Math.sin(a)), mul(add(mul(fw, Math.cos(g)), mul(ow, Math.sin(g))), Math.cos(a)));
          if (Math.sin(g) > 0.35) P3.push(add(pts[0], add(mul(ax, -r0 * 0.12 * Math.sin(a)), mul(add(mul(fw, Math.cos(g)), mul(ow, Math.sin(g))), r0 * Math.cos(a))))); } }
        out[0] = { d: poly(hull(P3.map(px))), cls: c };
      }
      return out;
    };
    const legParts = (s) => {
      const k = J.side[s], c = s === far && farDark ? 'm f' : 'm';
      const thI = limbItems('th', k.hip, k.knee, mul(sub(k.ankle, k.knee), -1), s, BODY.leg, c), shI = limbItems('sh', k.knee, k.ankle, k.ff || J.zax, s, BODY.leg, c);
      const items = thI.concat(shI), nTh = thI.length;
      const fs = BODY.foot, sp = (x, y, w) => px(add(add(add(k.ankle, mul(k.ff, x * fs[0])), mul(k.dn, y)), mul(J.L, w * fs[1])));
      /* a sneaker: stations from heel to toe give the height of the upper, the width, and the toe spring of the sole */
      const SX = [-8.6, -8.0, -6.2, -3.0, 0.5, 4.5, 8.0, 11.5, 14.5, 17.0, 18.7, 19.5];
      const TOP = [-2.0, -3.6, -4.0, -2.6, -4.2, -2.6, -0.4, 1.4, 2.6, 3.9, 5.2, 6.2];
      const WID = [2.3, 3.0, 3.3, 3.5, 3.9, 4.2, 4.4, 4.5, 4.3, 3.7, 2.8, 1.6];
      const MID = [5.4, 5.4, 5.3, 5.2, 5.2, 5.2, 5.2, 5.3, 5.2, 4.8, 4.2, 3.6];             // underside of the upper = top of the midsole
      const BOT = [7.4, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 7.9, 7.3, 6.6, 6.0];             // underside of the sole (lifts at the toe)
      const orient = (h) => { let a = 0; for (let i = 0; i < h.length; i++) { const p = h[i], q = h[(i + 1) % h.length]; a += p[0] * q[1] - q[0] * p[1]; } return a < 0 ? h.slice().reverse() : h; };      // one winding for every piece, so overlaps merge instead of cancelling
      const seg = (f) => { const r = []; for (let i = 0; i < SX.length - 1; i++) r.push({ d: poly(orient(hull(f(i).concat(f(i + 1))))), cls: '' }); return r; };
      const stUp = (i) => { const o = []; for (const w of [-WID[i], WID[i]]) { o.push(sp(SX[i], TOP[i], w * 0.82)); o.push(sp(SX[i], (TOP[i] + MID[i]) / 2, w * 1.02)); o.push(sp(SX[i], MID[i], w)); } return o; };
      const stMid = (i) => { const o = []; for (const w of [-WID[i] - 0.4, WID[i] + 0.4]) { o.push(sp(SX[i], MID[i] - 0.3, w)); o.push(sp(SX[i], BOT[i] - 0.6, w)); } return o; };
      const stOut = (i) => { const o = []; for (const w of [-WID[i] - 0.35, WID[i] + 0.35]) { o.push(sp(SX[i], BOT[i] - 0.65, w)); o.push(sp(SX[i], BOT[i], w * 0.94)); } return o; };
      if (sx.barefoot) {
        /* no shoe in the water: a bare foot, slim, with the toes pointed */
        const bf = (x, y, w) => sp(x, y, w), pts = [];
        for (const [x, y, w] of [[-3, -1, 2.6], [0, 0.5, 3.0], [5, 2, 2.8], [11, 3.4, 2.4], [16, 4.2, 1.7], [19, 4.8, 0.9]]) for (const sg of [-1, 1]) { pts.push(bf(x, y - 1.6, sg * w * 0.8)); pts.push(bf(x, y + 1.0, sg * w)); }
        items.push({ d: poly(hull(pts)), cls: c });
      } else {
      const uni = (f) => seg(f).map((q) => q.d).join('');            // one path made of overlapping pieces (same winding), so each part is lit and outlined as a single shape
      items.push({ d: uni(stMid), cls: 'm mid' });
      const stLace = (i) => { const o = []; if (SX[i] < 0.5 || SX[i] > 10.2) return [sp(SX[i], TOP[i] + 0.4, 0)]; for (const w of [-1.4, 1.4]) { o.push(sp(SX[i], TOP[i] - 0.3, w)); o.push(sp(SX[i], TOP[i] + 1.2, w * 1.5)); } return o; };
      items.push({ d: uni(stUp), cls: 'm shoe' });
      items.push({ d: poly(orient(hull([4, 5, 6, 7].flatMap((i) => stLace(i))))), cls: 'm lace' });
      items.push({ d: uni(stOut), cls: 'm sole' });
      }
      let hl = '';
      if (SK) return { split: true, thigh: { items: items.slice(0, nTh), hl: skinLimb(['th'], s) }, shin: { items: items.slice(nTh), hl: skinLimb(['sh'], s) } };   // two parts, so a thigh pointing at the camera is layered by its own depth
      const thF = sideDir(k.hip, k.knee, mul(sub(k.ankle, k.knee), -1)), thB = mul(thF, -1);
      hl += belly(k.hip, k.knee, 0.1, 0.9, 5.6, 2.4, thF, hv('quads', s));
      hl += belly(k.hip, k.knee, 0.1, 0.9, 5.2, 2.4, thB, hv('hamstrings', s));
      hl += belly(k.hip, k.knee, 0.12, 0.85, 4.2, 3.0, mul(J.L, -s), hv('adductors', s));
      hl += belly(k.knee, k.ankle, 0.06, 0.62, 3.9, 1.5, mul(sideDir(k.knee, k.ankle, J.zax), -1), hv('calves', s));
      const gc = add(add(add(J.H, mul(J.zax, -4.6)), mul(J.u, -5.4)), mul(J.L, s * 4.6));
      { const vis = dot(mul(J.zax, -1), C), fd = 0.35 + 0.65 * Math.max(0, Math.min(1, (vis + 0.25) / 0.7)); hl += ballHL(gc, 6.2, hv('glutes', s) * fd); }
      hl += ballHL(add(add(add(J.H, mul(J.zax, -3)), mul(J.u, 2)), mul(J.L, s * 8)), 5.2, hv('abductors', s));
      const hlS = belly(k.knee, k.ankle, 0.06, 0.62, 3.9, 1.5, mul(sideDir(k.knee, k.ankle, J.zax), -1), hv('calves', s));
      return { split: true, thigh: { items: items.slice(0, nTh), hl: hl.replace(hlS, '') }, shin: { items: items.slice(nTh), hl: hlS } };
    };
    const arm = (s) => {
      const k = J.side[s], c = s === far && farDark ? 'm f' : 'm';
      const uaI = limbItems('ua', k.S, k.E, sub(k.W, k.E), s, BODY.arm, c), faI = limbItems('fa', k.E, k.W, sub(k.S, k.E), s, BODY.arm, c);
      let hu = '', hf = '';
      if (SK) { hu = skinLimb(['ua'], s); hf = skinLimb(['fa'], s); }
      else {
        const bi = sideDir(k.S, k.E, sub(k.W, k.E)), tri = mul(bi, -1);
        hu += belly(k.S, k.E, 0.16, 0.9, 3.5, 1.9, bi, hv('biceps', s));
        hu += belly(k.S, k.E, 0.16, 0.9, 3.5, 1.9, tri, hv('triceps', s));
        hu += ballHL(add(add(k.S, mul(J.u, 1)), mul(J.L, s * 1.2)), 5.0, hv('shoulders', s));
        hf += belly(k.E, k.W, 0.1, 0.78, 2.7, 0.9, sideDir(k.E, k.W, sub(k.S, k.E)), hv('forearms', s));
      }
      return { ua: { items: uaI, hl: hu }, fa: { items: faI, hl: hf } };
    };
    /* ----- hands: a palm, four fingers and a thumb. They close around the bar or handle when gripping, lie flat on the floor when pressing, and hang relaxed otherwise ----- */
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const hOff = (0.32 * S).toFixed(1);
    const handGroup = (items) => {
      let defs = '', lit = '';
      items.forEach((i) => { const id = 'h' + (++clipN); defs += `<clipPath id="${id}"><path d="${i.d}"/></clipPath>`; lit += `<g clip-path="url(#${id})"><path class="${i.cls} lit" transform="translate(-${hOff} -${hOff})" d="${i.d}"/></g>`; });
      return '<g>' + defs + items.map((i) => `<path class="ol thin" d="${i.d}"/>`).join('') + items.map((i) => `<path class="${i.cls} dk" d="${i.d}"/>`).join('') + lit + '</g>';
    };
    const grabbed = (W) => {
      let best = null;
      for (const q of sx.props || []) {
        if (q.t !== 'cap' || q.ra > 2.4) continue;
        const ab = sub(q.b, q.a), t = Math.max(0, Math.min(1, dot(sub(W, q.a), ab) / (dot(ab, ab) || 1))), c = add(q.a, mul(ab, t)), dd = d3(c, W);
        if (dd < 3.2 && (!best || dd < best.dd)) best = { dd, c, ax: norm(ab), r: q.ra };
      }
      return best;
    };
    const hand = (s) => {
      const k = J.side[s], c = s === far && farDark ? 'm f' : 'm';
      let d = norm(sub(k.Hd || k.W, k.Hd ? k.W : k.E));
      const g = grabbed(k.W), up = [0, 1, 0];
      let O, a, m, mode;
      if (g) {
        mode = 'grip'; O = g.c;
        const zl = Math.abs(dot(g.ax, J.L)) < 0.7;                  // a handle not running side to side (dumbbell, neutral grip)
        a = g.ax;
        m = zl ? mul(J.L, -s) : cross(J.L, d);                      // palm side: palms face back / forward / down as in a normal overhand grip
        if (sx.grip === 'sup' && !zl) m = mul(m, -1);              // curls and chin-ups: underhand
      } else if (k.W[1] < 7 && !k.Hd) {
        mode = 'flat'; O = [k.W[0], Math.max(k.W[1], 1.8), k.W[2]];
        const dh = norm([d[0], 0, d[2]]); d = Math.hypot(d[0], d[2]) > 0.5 ? dh : norm([J.u[0], 0, J.u[2]]);
        a = J.L; m = [0, -1, 0];
      } else {
        mode = 'rest'; O = k.W; a = J.L; m = cross(J.L, d);
      }
      a = sub(a, mul(d, dot(a, d))); a = norm(a);
      m = sub(m, add(mul(d, dot(m, d)), mul(a, dot(m, a)))); if (Math.hypot(...m) < 0.2) m = cross(a, d); m = norm(m);
      const P3 = (x, y, z) => add(add(add(O, mul(d, x)), mul(m, y)), mul(a, z));
      const tz = dot(mul(J.L, -s), a) >= 0 ? 1 : -1;               // the thumb sits on the inner (medial) side
      const items = [];                                              // {d, cls, depth, layer: 'palm' | 'fing'}
      const part = (p1, r1, p2, r2, layer) => items.push({ d: cap(p1, r1, p2, r2), cls: c, depth: dot(add(p1, p2), C), layer });
      const zf = [2.55, 0.85, -0.85, -2.5].map((z) => z * tz), fr = [1.0, 1.0, 0.97, 0.88], fl = [1, 1.08, 1.0, 0.8];
      const F = [];                                                  // finger centre lines (3D) - drawn as one smooth block with seams between them
      let palm;
      if (mode === 'grip') {
        const R = (g.r || 1.5) + 0.95;
        palm = [P3(-3.8, -3.4, -3), P3(-3.8, -3.4, 3), P3(-3.8, -1.2, -3), P3(-3.8, -1.2, 3), P3(R * 0.9, -3.4, -4.1), P3(R * 0.9, -3.4, 4.1), P3(R * 0.9, -1.0, -4.1), P3(R * 0.9, -1.0, 4.1)];
        for (let i = 0; i < 4; i++) { const k2 = i === 3 ? 0.93 : 1; F.push([-35, 20, 75, 125, 160].map((deg) => { const t = deg * D2R; return P3(R * Math.cos(t) * k2, R * Math.sin(t) * k2, zf[i]); })); }
        const th = [-10, 45, 100].map((deg) => { const t = deg * D2R; return P3((R + 0.25) * Math.cos(t), (R + 0.25) * Math.sin(t), tz * 3.7); });
        part(P3(-1.6, -2.4, tz * 3.2), 1.3, th[0], 1.2, 'fing'); part(th[0], 1.2, th[1], 1.15, 'fing'); part(th[1], 1.15, th[2], 1.0, 'fing');
      } else if (mode === 'flat') {
        palm = [P3(-1.8, -1.0, -3), P3(-1.8, 1.0, -3), P3(-1.8, -1.0, 3), P3(-1.8, 1.0, 3), P3(8, -0.9, -4), P3(8, 0.9, -4), P3(8, -0.9, 4), P3(8, 0.9, 4)];
        for (let i = 0; i < 4; i++) { const len = 9.5 * fl[i], sp = (i - 1.5) * 0.045; F.push([0, 0.45, 0.74, 1].map((u) => P3(8 + len * u, -0.1, zf[i] * (1 + sp * u * 6)))); }
        part(P3(1.5, -0.2, tz * 3.6), 1.2, P3(5.2, -0.2, tz * 6.6), 1.1, 'fing'); part(P3(5.2, -0.2, tz * 6.6), 1.1, P3(8, -0.2, tz * 8.2), 1.0, 'fing');
      } else {
        palm = [P3(-1.8, -1.2, -2.8), P3(-1.8, 1.2, -2.8), P3(-1.8, -1.2, 2.8), P3(-1.8, 1.2, 2.8), P3(7.2, -1.0, -3.9), P3(7.2, 1.0, -3.9), P3(7.2, -1.0, 3.9), P3(7.2, 1.0, 3.9)];
        for (let i = 0; i < 4; i++) {                                 // relaxed, fingers curling a little toward the palm
          const len = 9.2 * fl[i], cur = sx.fist ? [60, 88, 92] : [14, 34, 52], pts = [P3(7.2, 0, zf[i] * 0.9)]; let ang = 0, px0 = 7.2, py0 = 0;
          [0.5, 0.3, 0.2].forEach((u, j) => { ang += cur[j] * D2R * (sx.fist ? 0.95 : 0.6); px0 += Math.cos(ang) * len * u; py0 += Math.sin(ang) * len * u; pts.push(P3(px0, py0, zf[i] * (1 + 0.03 * j))); });
          F.push(pts);
        }
        part(P3(0.5, 0.4, tz * 3.2), 1.25, P3(4.2, 1.6, tz * 4.6), 1.15, 'fing'); part(P3(4.2, 1.6, tz * 4.6), 1.15, P3(7.0, 2.8, tz * 4.8), 1.0, 'fing');
      }
      const bp = [];
      F.forEach((pts, i) => pts.forEach((q) => { for (const v of [d, m, a]) for (const sg of [-1, 1]) bp.push(px(add(q, mul(v, sg * fr[i])))); }));
      const block = { d: poly(hull(bp)), cls: c, depth: dot(F[1][2], C), layer: 'fing' };
      let seams = '';
      if (mode !== 'flat') for (let i = 0; i < 3; i++) seams += `<path class="fseam" d="M${F[i].map((q, j) => fx(px(mul(add(q, F[i + 1][j]), 0.5)))).join('L')}"/>`;
      items.push(block);
      const rp = [];
      for (const q of palm) for (const v of [d, m, a]) for (const sg of [-0.9, 0.9]) rp.push(px(add(q, mul(v, sg))));
      const palmItem = { d: poly(hull(rp)), cls: c, depth: 0, layer: 'palm' };
      const fing = items.sort((p, q) => (p === block ? 0 : q === block ? 0 : p.depth - q.depth));
      const palmFirst = mode !== 'grip' || dot(m, C) > 0;            // seen from the knuckle side the fingers wrap in front of the bar, from the back of the hand the palm covers it
      const fg = handGroup(fing) + seams, pg = handGroup([palmItem]);
      if (mode === 'grip') return [{ k: dot(add(O, mul(m, -2.2)), C), svg: pg }, { k: dot(add(O, mul(m, 2.2)), C), svg: fg }];
      return [{ k: dot(add(O, mul(d, 4)), C) + 0.3, svg: pg + fg }];
    };

    /* ----- torso with muscle patches ----- */
    const surf = (s, psi, sd) => {
      const wx = sectDim(s, 1), wz = sectDim(s, 2), phi = Math.PI / 2 - sd * psi;
      const c = add(J.H, mul(J.u, LEN.TORSO * s));
      const q = add(c, add(mul(J.L, wx * Math.cos(phi)), mul(J.zax, wz * Math.sin(phi))));
      return { p: px(q), vis: dot(norm(add(mul(J.L, Math.cos(phi) / wx), mul(J.zax, Math.sin(phi) / wz))), C) };
    };
    const visible = (s, psi, sd) => surf(s, psi, sd).vis > 0.03;
    const clipRow = (s, a, b, sd) => {
      if (!visible(s, a, sd)) {
        if (!visible(s, b, sd)) return null;
        let lo = a, hi = b; for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (visible(s, m, sd)) hi = m; else lo = m; } a = hi;
      }
      if (!visible(s, b, sd)) { let lo = a, hi = b; for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (visible(s, m, sd)) lo = m; else hi = m; } b = lo; }
      return b - a > 0.02 ? [a, b] : null;
    };
    const patch = (name, sd, v) => {
      const spec = PATCH[name], Ls = [], Rs = [];
      for (let k = 0; k <= 6; k++) {
        const u = k / 6, s = lerp(spec.s[0], spec.s[1], u), pr = spec.psi(u), r = clipRow(s, pr[0], pr[1], sd);
        if (!r) continue; Ls.push(surf(s, r[0], sd).p); Rs.push(surf(s, r[1], sd).p);
      }
      return Ls.length < 3 ? '' : glow(poly(Ls.concat(Rs.reverse())), v);
    };
    const PELV = { c: add(add(J.H, mul(J.u, -0.5)), mul(J.zax, -4)), r: [sectDim(0.2, 1) * 0.92, 7.8, sectDim(0.2, 2) * 0.88] };   // sits behind the hip joints: it is the seat and the back of the hips, not a block between the legs
    const torsoHL = SK ? skinTorso() : Object.keys(PATCH).map((n) => (hv(n) > 0.001 ? patch(n, far, hv(n)) + patch(n, near, hv(n)) : '')).join('');
    const secPts = (s, wx, wz) => {
      const c = add(J.H, mul(J.u, LEN.TORSO * s)), pts = [];
      for (let i = 0; i < 18; i++) { const g = 2 * Math.PI * i / 18; pts.push(px(add(c, add(mul(J.L, wx * Math.cos(g)), mul(J.zax, wz * Math.sin(g)))))); }
      return pts;
    };
    const secs = SECT.map((q) => secPts(q[0], q[1], q[2]));
    const torsoItems = [];
    for (let i = 0; i < secs.length - 1; i++) torsoItems.push({ d: poly(hull(secs[i].concat(secs[i + 1]))), cls: 'm' });
    /* the pelvis and buttocks: one rounded volume that turns with the torso, so the hips stay round when the thighs fold up (squats, sitting, lunges) */
    { const pts = []; for (let i = 0; i <= 8; i++) { const al = Math.PI * i / 8; for (let j = 0; j < 16; j++) { const be = 2 * Math.PI * j / 16; pts.push(px(add(PELV.c, add(add(mul(J.L, PELV.r[0] * Math.sin(al) * Math.cos(be)), mul(J.u, PELV.r[1] * Math.cos(al))), mul(J.zax, PELV.r[2] * Math.sin(al) * Math.sin(be)))))); } }
      torsoItems.push({ d: poly(hull(pts)), cls: 'm' }); }
    { /* the groin: the bottom of the trunk between the thighs, a V down to the crotch (the thighs cover its sides) */
      const pts = [], hl = J.side[-1].hip, hr = J.side[1].hip, cr = add(J.H, mul(J.u, -0.2 * LEN.THIGH * BODY.leg - 1.5));
      for (const zz of [-5.5, 0, 5.5]) { pts.push(px(add(add(hl, mul(J.u, 3)), mul(J.zax, zz))), px(add(add(hr, mul(J.u, 3)), mul(J.zax, zz))), px(add(cr, mul(J.zax, zz * 0.6)))); }
      torsoItems.push({ d: poly(hull(pts)), cls: 'm' }); }
    const neckTop = sub(J.head, add(mul(J.u, 5), mul(J.zax, 1)));
    torsoItems.push({ d: cap(add(add(J.T, mul(J.u, 1)), mul(J.zax, 1.5)), 5.0, neckTop, BODY.neck), cls: 'm' });
    { /* the trapezius: the slope from the neck down to each shoulder */
      const ring = (c, r) => { const o = []; for (let i = 0; i < 12; i++) { const g = i * Math.PI / 6; o.push(px(add(c, add(mul(J.L, r * Math.cos(g)), mul(J.u, r * Math.sin(g)))))); o.push(px(add(c, add(mul(J.zax, r * Math.cos(g)), mul(J.u, r * Math.sin(g)))))); } return o; };
      const nb = add(add(J.T, mul(J.u, 2.5)), mul(J.zax, -0.5));
      for (const sd of [-1, 1]) { const k = J.side[sd]; torsoItems.push({ d: poly(hull(ring(nb, BODY.neck * 1.05).concat(ring(add(add(k.S, mul(J.u, 2.2)), mul(J.zax, -1.2)), 3.4 * BODY.arm)))), cls: 'm' }); }
    }
    const torsoParts = { items: torsoItems, hl: torsoHL };

    /* ----- head: faceless ----- */
    const Hc = J.head, hu = J.u, hz = J.zax;
    const ell = (c, ax, filt) => {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const al = Math.PI * i / 10; for (let j = 0; j < 20; j++) { const be = 2 * Math.PI * j / 20; const q = [ax[0] * Math.sin(al) * Math.cos(be), ax[1] * Math.cos(al), ax[2] * Math.sin(al) * Math.sin(be)]; if (!filt || filt(q)) pts.push(px(add(c, add(add(mul(J.L, q[0]), mul(hu, q[1])), mul(hz, q[2]))))); } }
      return pts;
    };
    const HX = BODY.head;
    let head;
    if (!BODY.hair) head = group([{ d: poly(hull(ell(Hc, HX))), cls: 'm' }]);
    else {
      /* hair over the back and top of the skull, the face a skin patch on the front (only the part turned toward the camera) */
      const hc = add(add(Hc, mul(hu, 0.3)), mul(hz, -0.3)), hx = [HX[0] + 0.45, HX[1] + 0.45, HX[2] + 0.5];
      const facePts = [];
      for (let i = 1; i <= 14; i++) {
        const al = Math.PI * i / 14;
        for (let j = 0; j < 28; j++) {
          const be = 2 * Math.PI * j / 28, n0 = Math.sin(al) * Math.cos(be), n1 = Math.cos(al), n2 = Math.sin(al) * Math.sin(be);
          if (!(n2 > 0.12 && (n0 / 0.82) ** 2 + ((n1 + 0.2) / 0.86) ** 2 < 1)) continue;
          const nw = add(add(mul(J.L, n0 / HX[0]), mul(hu, n1 / HX[1])), mul(hz, n2 / HX[2]));
          if (dot(norm(nw), C) < 0.04) continue;
          facePts.push(px(add(Hc, add(add(mul(J.L, HX[0] * n0), mul(hu, HX[1] * n1)), mul(hz, HX[2] * n2)))));
        }
      }
      const hairPts = [];
      for (let i = 0; i <= 14; i++) {
        const al = Math.PI * i / 14;
        for (let j = 0; j < 28; j++) {
          const be = 2 * Math.PI * j / 28, n0 = Math.sin(al) * Math.cos(be), n1 = Math.cos(al), n2 = Math.sin(al) * Math.sin(be);
          if (!(n1 > -0.02 + 0.38 * n2)) continue;             // the hairline slopes from high on the forehead down to the nape
          hairPts.push(px(add(hc, add(add(mul(J.L, hx[0] * n0), mul(hu, hx[1] * n1)), mul(hz, hx[2] * n2)))));
        }
      }
      head = group([{ d: poly(hull(ell(Hc, HX))), cls: 'm' }]) + `<path class="m hair" d="${poly(hull(hairPts))}"/>` + (facePts.length > 5 ? `<path class="m lit" style="stroke:none" d="${poly(hull(facePts))}"/>` : '');
    }
    /* ----- ponytail: a chain that leaves the back of the head, is pulled down by gravity, lags behind the head's own motion, and is kept out of the head, neck, body, floor and boxes ----- */
    let tail = '', tailDep = 0, tailBack = false; const dep3 = (p) => dot(p, C);
    if (BODY.hair) {
      const NS = 8, seg = [2.4, 3.2, 3.3, 3.3, 3.3, 3.3, 3.1, 2.9], rad = [1.8, 3.0, 3.7, 3.8, 3.5, 2.9, 2.1, 1.3, 0.7], G = [0.2, 0.4, 0.58, 0.72, 0.82, 0.9, 0.95, 0.98];
      const neckA = add(add(J.T, mul(J.u, 1)), mul(J.zax, 1.5));
      const collide = (q) => {
        for (let it = 0; it < 2; it++) {
          let rel = sub(q, Hc), x = dot(rel, J.L), y = dot(rel, hu), z = dot(rel, hz);
          const m = (x / (HX[0] + 1.3)) ** 2 + (y / (HX[1] + 1.3)) ** 2 + (z / (HX[2] + 1.3)) ** 2;
          if (m < 1 && m > 1e-6) { const k = 1 / Math.sqrt(m); q = add(Hc, add(add(mul(J.L, x * k), mul(hu, y * k)), mul(hz, z * k))); }
          const ss = dot(sub(q, J.H), J.u) / LEN.TORSO;
          if (ss > -0.1 && ss < 1.07) {
            const c0 = add(J.H, mul(J.u, LEN.TORSO * ss)), r = sub(q, c0), xx = dot(r, J.L), zz = dot(r, J.zax), wx = sectDim(ss, 1) + 1.5, wz = sectDim(ss, 2) + 1.5, mm = (xx / wx) ** 2 + (zz / wz) ** 2;
            if (mm < 1) { const k = mm < 1e-6 ? 1 : 1 / Math.sqrt(mm), x2 = mm < 1e-6 ? 0 : xx * k, z2 = mm < 1e-6 ? -wz : zz * k; q = add(c0, add(mul(J.L, x2), mul(J.zax, z2))); }
          }
          { const ab = sub(neckTop, neckA), t = Math.max(0, Math.min(1, dot(sub(q, neckA), ab) / (dot(ab, ab) || 1))), c0 = add(neckA, mul(ab, t)), r = sub(q, c0), rl = Math.hypot(...r); if (rl < BODY.neck + 1.4 && rl > 1e-6) q = add(c0, mul(r, (BODY.neck + 1.4) / rl)); }
          if (q[1] < 1.6) q = [q[0], 1.6, q[2]];
          for (const cp of sx.props || []) {
            if (cp.t !== 'cap' || cp.cls === 'cable' || cp.cls === 'shadow') continue;
            const ab = sub(cp.b, cp.a), t = Math.max(0, Math.min(1, dot(sub(q, cp.a), ab) / (dot(ab, ab) || 1))), c0 = add(cp.a, mul(ab, t)), r = sub(q, c0), rl = Math.hypot(...r), R = Math.max(cp.ra, cp.rb) + 1.3;
            if (rl < R) q = add(c0, mul(rl > 1e-6 ? mul(r, 1 / rl) : [0, 1, 0], R));
          }
          for (const bx of sx.props || []) {
            if (bx.t !== 'box') continue;
            const [x0, x1, y0, y1, z0, z1] = bx.b, g = 1.5;
            if (q[0] > x0 - g && q[0] < x1 + g && q[1] > y0 - g && q[1] < y1 + g && q[2] > z0 - g && q[2] < z1 + g) {
              const c = [[q[0] - (x0 - g), 0], [(x1 + g) - q[0], 1], [q[1] - (y0 - g), 2], [(y1 + g) - q[1], 3], [q[2] - (z0 - g), 4], [(z1 + g) - q[2], 5]].sort((u, v) => u[0] - v[0])[0];
              q = q.slice(); const ix = c[1] >> 1; q[ix] = c[1] % 2 === 0 ? [x0, y0, z0][ix] - g : [x1, y1, z1][ix] + g;
            }
          }
        }
        return q;
      };
      const base = add(add(Hc, mul(hu, 3.6)), mul(hz, -HX[2] * 0.84));
      /* the ponytail is simulated, not posed: it keeps its position and speed from frame to frame (ex.t is the animation clock), so it swings, settles and can never snap to a new direction */
      const TS = sc._ts || (sc._ts = {});
      const rootDir = norm(add(mul(hz, -0.92), mul(hu, -0.15)));
      const lens = seg, N = lens.length;
      const fresh = !TS.p || TS.body !== BODY || !ex || ex.t == null || TS.t == null || ex.t < TS.t - 1e-6 || ex.t - TS.t > 0.3;
      let P, V, steps; const dt = 1 / 120;
      if (fresh) { P = [base]; V = [[0, 0, 0]]; let c = base; for (let i = 0; i < N; i++) { c = add(c, mul(rootDir, lens[i])); P.push(c); V.push([0, 0, 0]); } steps = 110; }
      else { P = TS.p.map((q) => q.slice()); V = TS.v.map((q) => q.slice()); steps = Math.min(10, Math.max(0, Math.round((ex.t - TS.t) / dt))); }
      for (let st = 0; st < steps; st++) {
        const old = P.map((q) => q.slice()); P[0] = base;
        for (let i = 1; i <= N; i++) { V[i] = add(mul(V[i], Math.exp(-9 * dt)), add([0, -900 * dt, 0], mul(J.u, -260 * dt))); P[i] = add(P[i], mul(V[i], dt)); }
        for (let it = 0; it < 10; it++) {
          P[1] = add(P[1], mul(sub(add(base, mul(rootDir, lens[0])), P[1]), 0.03));
          for (let i = 2; i <= N; i++) { const dprev = norm(sub(P[i - 1], P[i - 2])); P[i] = add(P[i], mul(sub(add(P[i - 1], mul(dprev, lens[i - 1])), P[i]), 0.006 * (1 - (i - 2) / N))); }
          for (let i = 1; i <= N; i++) { P[i] = collide(P[i]); const dv = sub(P[i], P[i - 1]), l = Math.hypot(...dv) || 1; P[i] = add(P[i - 1], mul(dv, lens[i - 1] / l)); }
        }
        for (let i = 1; i <= N; i++) { const q = collide(P[i]), moved = Math.hypot(...sub(q, P[i])); P[i] = q; V[i] = mul(sub(P[i], old[i]), (moved > 1e-3 ? 0.25 : 0.92) / dt); }   // the last word goes to the collisions, and a part that is touching something loses its speed, so resting hair does not buzz
      }
      TS.p = P.map((q) => q.slice()); TS.v = V.map((q) => q.slice()); TS.body = BODY; TS.t = ex && ex.t != null ? ex.t : null;
      const keep = fresh ? 0 : Math.exp(-Math.max(steps, 1) * dt / 0.045);   // smoothing by time, so 30 and 60 frames a second look alike
      let pts = P.map((q, i) => (TS.d && TS.d[i] && !fresh ? add(mul(TS.d[i], keep), mul(q, 1 - keep)) : q)); TS.d = pts.map((q) => q.slice());
      for (let pass = 0; pass < 3; pass++) pts = pts.map((q, i) => (i === 0 || i === pts.length - 1 ? q : add(mul(q, 0.5), mul(add(pts[i - 1], pts[i + 1]), 0.25))));   // draw it as one smooth curve, not a chain of kinks
      const ti = [{ d: cap(add(pts[0], mul(sub(pts[1], pts[0]), -0.1)), 2.5, add(pts[0], mul(sub(pts[1], pts[0]), 0.28)), 2.7), cls: 'm tie' }];
      tail = group(chain(pts, rad, 'm hair').concat(ti));
      tailDep = dep3(pts[3]); tailBack = dot(hz, C) < 0;
    }

    /* ----- joint blends: a plain fill (no outline) laid over the places where parts meet, so the pelvis flows into the thighs and the neck into the head ----- */
    const ringPts = (c, r) => { const q0 = px(c), out = []; for (let i = 0; i < 14; i++) { const g = i * Math.PI / 7; out.push([q0[0] + r * S * Math.cos(g), q0[1] + r * S * Math.sin(g)]); } return out; };

    /* ----- shadow and assembly, back to front ----- */
    const sh = [];
    const sc0 = sx.shadow || { c: [0, 0, 4], rx: 52, rz: 56 };
    for (let i = 0; i < 28; i++) { const g = 2 * Math.PI * i / 28; sh.push(px([sc0.c[0] + sc0.rx * Math.cos(g), 0, sc0.c[2] + sc0.rz * Math.sin(g)])); }
    /* ----- painter's order: everything held (bars, plates, dumbbells, fists) and every body part is sorted by its distance from the camera, so the layering is right from any angle ----- */
    const dep = (p) => dot(p, C), mid2 = (p, q) => mul(add(p, q), 0.5), kF = J.side[far], kN = J.side[near];
    const items = [], put = (k, svg, u) => items.push({ k, i: items.length, svg, u });
    const anchorOf = (q) => (q.t === 'box' ? [(q.b[0] + q.b[1]) / 2, (q.b[2] + q.b[3]) / 2, (q.b[4] + q.b[5]) / 2] : (q.a && q.b) ? mid2(q.a, q.b) : q.c);
    (sx.props || []).forEach((q, qi) => { if (q.layer === 'sort' && !isImpl(q)) put(dep(anchorOf(q)), drawProp(q), { id: 'ps' + qi }); });
    (sx.props || []).forEach((q, qi) => { if (isImpl(q)) return; const an = autoSort(q); if (an) put(dep(an) - 11, drawProp(q), { id: 'ps' + qi }); });   // machine parts that can stand in front of the figure: sorted by their own distance from the camera
    put(-1e9, `<path class="shadow" d="${poly(hull(sh))}"/>` + props('back'));
    const kTorso = dep(add(J.H, mul(J.u, 25)));
    /* ----- what is in front of what: every body part also gets a simple 3D stand-in (capsules for limbs, ellipsoids for the torso and head).
       For each pair of parts that overlap on screen, rays are cast through the overlap and the part that is really nearer the camera wins.
       Those wins give a drawing order (a part is drawn after everything it covers); where they say nothing, the old distance rule stands. ----- */
    const PRIM = {}, pc = (u, a, b, r) => (PRIM[u] = PRIM[u] || []).push({ t: 0, a, b, r }), pe = (u, c, e, r) => (PRIM[u] = PRIM[u] || []).push({ t: 1, c, e, r });
    {
      const Lg = BODY.leg, Ar = BODY.arm;
      for (const sd of [far, near]) {
        const x = sd === far ? 'F' : 'N', k = J.side[sd];
        pc('th' + x, along(k.hip, k.knee, 0.16), along(k.hip, k.knee, 0.4), 8.4 * Lg);   // the top of the thigh is inside the pelvis: the hips cover it unless the thigh comes up toward the camera pc('th' + x, along(k.hip, k.knee, 0.4), k.knee, 7.3 * Lg);
        pc('sh' + x, k.knee, along(k.knee, k.ankle, 0.3), 5.85 * Lg); pc('sh' + x, along(k.knee, k.ankle, 0.3), k.ankle, 4.45 * Lg);
        if (k.ff) pc('sh' + x, add(k.ankle, add(mul(k.ff, -5), mul(k.dn || [0, -1, 0], 3))), add(k.ankle, add(mul(k.ff, 16 * BODY.foot[0]), mul(k.dn || [0, -1, 0], 5))), 3.4);
        pc('ua' + x, k.S, along(k.S, k.E, 0.35), 5.95 * Ar); pc('ua' + x, along(k.S, k.E, 0.35), k.E, 5.05 * Ar);
        pc('fa' + x, k.E, along(k.E, k.W, 0.25), 4.55 * Ar); pc('fa' + x, along(k.E, k.W, 0.25), k.W, 3.85 * Ar);
      }
      for (let i = 0; i < SECT.length - 1; i++) {
        const a0 = SECT[i], a1 = SECT[i + 1], sm = (a0[0] + a1[0]) / 2;
        if (sm < 0.05) continue;   // the bottom of the trunk is the hips: in the stand-ins the thighs and the pelvis volume carry it, so a thigh coming forward is never voted behind the belly
        pe('to', add(J.H, mul(J.u, LEN.TORSO * sm)), [J.L, J.u, J.zax], [Math.min((a0[1] + a1[1]) / 2, sm < 0.2 ? 13 : 99), LEN.TORSO * (a1[0] - a0[0]) * 0.62 + 1.5, (a0[2] + a1[2]) / 2]);
      }
      pc('to', add(add(J.T, mul(J.u, 1)), mul(J.zax, 1.5)), sub(J.head, add(mul(J.u, 5), mul(J.zax, 1))), BODY.neck);
      pe('to', PELV.c, [J.L, J.u, J.zax], PELV.r);
      pe('hd', J.head, [J.L, J.u, J.zax], BODY.head);
    }
    const Yup = [0, 1, 0], vray = add(C, mul(Yup, cam.sp / cam.cp)), vv = dot(vray, vray);
    const rayO = (X, Y) => add(mul(cam.R, (X - cam.cx0) / S), mul(Yup, (cam.y0 - Y) / (S * cam.cp)));
    const sphereHit = (O, c, r) => { const m = sub(O, c), B = 2 * dot(vray, m), Cc = dot(m, m) - r * r, D = B * B - 4 * vv * Cc; return D < 0 ? -Infinity : (-B + Math.sqrt(D)) / (2 * vv); };
    const capHit = (O, p) => {
      const w = sub(p.b, p.a), ww = dot(w, w) || 1e-9, m = sub(O, p.a);
      const v2 = sub(vray, mul(w, dot(vray, w) / ww)), m2 = sub(m, mul(w, dot(m, w) / ww));
      const A = dot(v2, v2), B = 2 * dot(v2, m2), Cc = dot(m2, m2) - p.r * p.r; let best = -Infinity;
      if (A > 1e-9) { const D = B * B - 4 * A * Cc; if (D >= 0) { const t = (-B + Math.sqrt(D)) / (2 * A), u = dot(add(m, mul(vray, t)), w) / ww; if (u >= 0 && u <= 1) best = t; } }
      return Math.max(best, sphereHit(O, p.a, p.r), sphereHit(O, p.b, p.r));
    };
    const ellHit = (O, p) => {
      const m = sub(O, p.c), o = p.e.map((e, i) => dot(m, e) / p.r[i]), v = p.e.map((e, i) => dot(vray, e) / p.r[i]);
      const A = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], B = 2 * (o[0] * v[0] + o[1] * v[1] + o[2] * v[2]), Cc = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1, D = B * B - 4 * A * Cc;
      return D < 0 ? -Infinity : (-B + Math.sqrt(D)) / (2 * A);
    };
    const unitHit = (u, X, Y) => { const O = rayO(X, Y); let b = -Infinity; for (const p of PRIM[u]) { const h = p.t === 0 ? capHit(O, p) : ellHit(O, p); if (h > b) b = h; } return b; };
    const ubox = (u) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of PRIM[u]) {
        const pts = p.t === 0 ? [[p.a, p.r], [p.b, p.r]] : [[p.c, Math.max(...p.r)]];
        for (const [q, r] of pts) { const z = px(q), rr = r * S; x0 = Math.min(x0, z[0] - rr); x1 = Math.max(x1, z[0] + rr); y0 = Math.min(y0, z[1] - rr); y1 = Math.max(y1, z[1] + rr); }
      }
      return [x0, y0, x1, y1];
    };
    /* which of two parts is nearer where they overlap on screen: +1 the first, -1 the second, 0 no overlap */
    const vote = (ia, ib) => {
      const A = ubox(ia), B = ubox(ib), x0 = Math.max(A[0], B[0]), x1 = Math.min(A[2], B[2]), y0 = Math.max(A[1], B[1]), y1 = Math.min(A[3], B[3]);
      if (x1 - x0 < 1 || y1 - y0 < 1) return 0;
      let va = 0, vb = 0; const G = 6;
      for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) {
        const X = x0 + (x1 - x0) * (a + 0.5) / G, Y = y0 + (y1 - y0) * (b + 0.5) / G, da = unitHit(ia, X, Y); if (da === -Infinity) continue;
        const db = unitHit(ib, X, Y); if (db === -Infinity) continue;
        if (da > db + 0.25) va++; else if (db > da + 0.25) vb++;
      }
      return va > vb ? 1 : vb > va ? -1 : 0;
    };
    /* the order: a part is drawn after every part it covers. Ties and silence fall back to the distance keys */
    const order = (units) => {
      const n = units.length, box = units.map((u) => ubox(u.id)), W = units.map(() => new Map());   // W[i].get(j) = how strongly j must be drawn before i
      const dz = units.map((u) => { let lo = Infinity, hi = -Infinity; for (const p of PRIM[u.id]) { const r = p.t === 0 ? p.r : Math.max(...p.r); for (const q of p.t === 0 ? [p.a, p.b] : [p.c]) { const d = dep(q); lo = Math.min(lo, d - r); hi = Math.max(hi, d + r); } } return [lo, hi]; });
      const joined = (a, b) => { const t = [a, b].sort().join(','); return /^(hd|th.),to$/.test(t) || /^to,ua.$/.test(t) || /^sh(.),th\1$/.test(t) || /^fa(.),ua\1$/.test(t) || /^fa(.),hn\1$/.test(t); };
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (units[i].impl && units[j].impl) continue;                              // pieces of the same kit keep their own order
        const A = box[i], B = box[j], x0 = Math.max(A[0], B[0]), x1 = Math.min(A[2], B[2]), y0 = Math.max(A[1], B[1]), y1 = Math.min(A[3], B[3]);
        if (x1 - x0 < 1 || y1 - y0 < 1) continue;
        const ii0 = units[i].id, jj0 = units[j].id;
        if (!(ii0 === 'hd' && jj0 === 'to') && !(ii0 === 'to' && jj0 === 'hd')) {        // wholly nearer or farther: no rays needed
          if (dz[i][0] > dz[j][1] + 0.5) { W[i].set(j, 3); continue; }
          if (dz[j][0] > dz[i][1] + 0.5) { W[j].set(i, 3); continue; }
        }
        let vi = 0, vj = 0; const G = 6;
        for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) {
          const X = x0 + (x1 - x0) * (a + 0.5) / G, Y = y0 + (y1 - y0) * (b + 0.5) / G;
          let di = unitHit(units[i].id, X, Y); if (di === -Infinity) continue;
          let dj = unitHit(units[j].id, X, Y); if (dj === -Infinity) continue;
          if (units[i].impl) di += 1.2; if (units[j].impl) dj += 1.2;           // kit resting on the body (a bar on the back, a dumbbell on the chest) shows on top of it
          if (di > dj + 0.25) vi++; else if (dj > di + 0.25) vj++;
        }
        const ii = units[i].id, jj = units[j].id;
        if ((ii === 'hd' && jj === 'to') || (ii === 'to' && jj === 'hd')) {   // the head sits over the neck unless the rays clearly say otherwise
          const h = ii === 'hd' ? i : j, t = h === i ? j : i, vh = h === i ? vi : vj, vt = h === i ? vj : vi;
          if (vt < 3 || vt <= vh) { W[h].set(t, 2); continue; }
        }
        const k = joined(ii, jj) ? 0.5 : 1;                                       // where two parts are joined their stand-ins overlap, so those votes count for less
        if (vi > vj) W[i].set(j, (vi - vj) * k); else if (vj > vi) W[j].set(i, (vj - vi) * k);
      }
      const done = new Array(n).fill(false), out = [];
      for (let step = 0; step < n; step++) {
        let pick = -1;
        for (let i = 0; i < n; i++) if (!done[i] && [...W[i].keys()].every((j) => done[j]) && (pick < 0 || units[i].k < units[pick].k)) pick = i;
        if (pick < 0) {                                                            // a loop: drop its weakest link and carry on
          let bi = -1, bj = -1, bw = Infinity;
          for (let i = 0; i < n; i++) if (!done[i]) for (const [j, w] of W[i]) if (!done[j] && w < bw) { bw = w; bi = i; bj = j; }
          if (bi >= 0) { W[bi].delete(bj); step--; continue; }
          for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || units[i].k < units[pick].k)) pick = i;
        }
        done[pick] = true; out.push(units[pick]);
      }
      /* the two halves of an arm or leg drawn one right after the other where nothing has to come between them, so the joint has no seam */
      const idx = (id) => out.findIndex((u) => u.id === id), need = (a, b) => { const ia = units.indexOf(a), ib = units.indexOf(b); return W[ia].has(ib) || W[ib].has(ia); };
      for (const [p, q] of [['uaF', 'faF'], ['uaN', 'faN'], ['thF', 'shF'], ['thN', 'shN']]) {
        let a = idx(p), b = idx(q); if (a < 0 || b < 0) continue; if (a > b) [a, b] = [b, a];
        if (b - a < 2) continue;
        const later = out[b], between = out.slice(a + 1, b);
        if (between.every((m) => !need(later, m))) { out.splice(b, 1); out.splice(a + 1, 0, later); }
        else { const first = out[a]; if (between.every((m) => !need(first, m))) { out.splice(a, 1); out.splice(b - 1, 0, first); } }
      }
      /* new keys in that order, as close to the true distances as possible (pool-adjacent-violators), so held things and hands still slot in by distance */
      const blocks = [];
      for (const u of out) { const w = u.w || 1; blocks.push({ s: u.k * w, n: w, us: [u] }); while (blocks.length > 1 && blocks[blocks.length - 2].s / blocks[blocks.length - 2].n > blocks[blocks.length - 1].s / blocks[blocks.length - 1].n) { const b2 = blocks.pop(), b1 = blocks[blocks.length - 1]; b1.s += b2.s; b1.n += b2.n; b1.us = b1.us.concat(b2.us); } }
      for (const b of blocks) b.us.forEach((u, q) => { u.k2 = b.s / b.n + q * 0.004; });
      for (let i = 1; i < out.length; i++) if (out[i].k2 <= out[i - 1].k2) out[i].k2 = out[i - 1].k2 + 1e-4;   // strictly in order, even where blocks sit at the same distance
      return out;
    };
    const kd = (a, b) => dep(mid2(a, b));
    const LP = { F: legParts(far), N: legParts(near) }, AP = { F: arm(far), N: arm(near) };
    const units = [{ id: 'to', k: kTorso, part: torsoParts, run: 'body' }, { id: 'hd', k: Math.abs(kTorso - dep(J.head)) < 7 ? Math.max(dep(J.head) + 0.5, kTorso + 0.002) : dep(J.head) + 0.5, svg: head }];
    for (const x of ['F', 'N']) {
      const k = J.side[x === 'F' ? far : near], bias = x === 'F' ? -1.5 : 1.5;
      units.push({ id: 'th' + x, k: kd(k.hip, k.knee) + bias, part: LP[x].thigh, run: 'body' }, { id: 'sh' + x, k: kd(k.knee, k.ankle) + bias, part: LP[x].shin, run: 'body' });
      units.push({ id: 'ua' + x, k: kd(k.S, k.E) + bias, part: AP[x].ua, run: 'arm' + x }, { id: 'fa' + x, k: kd(k.E, k.W) + bias, part: AP[x].fa, run: 'arm' + x });
    }
    /* things held or lifted (bars, plates, dumbbells, balls) join in. A long bar is cut into short pieces so it can pass in front of one part and behind another.
       They keep their true distance (heavy weight below), so the hands that grip them still wrap round them; the body parts move to suit. */
    (sx.props || []).forEach((q, qi) => {
      if (!isImpl(q)) return;
      if (q.t === 'cap') {
        const L = Math.hypot(...sub(q.b, q.a)), n = Math.max(1, Math.min(8, Math.round(L / 14)));
        for (let i = 0; i < n; i++) {
          const a = along(q.a, q.b, i / n), b = along(q.a, q.b, (i + 1) / n), id = 'pi' + qi + '_' + i;
          pc(id, a, b, Math.max(q.ra, q.rb));
          units.push({ id, k: dep(mid2(a, b)), svg: drawProp(Object.assign({}, q, { a, b, ra: lerp(q.ra, q.rb, i / n), rb: lerp(q.ra, q.rb, (i + 1) / n) })), w: 1e6, impl: true });
        }
      } else {
        const id = 'pi' + qi;
        if (q.t === 'ball') pc(id, q.c, q.c, q.r);
        else { const ax = Array.isArray(q.axis) ? norm(q.axis) : q.axis === 'x' ? [1, 0, 0] : q.axis === 'y' ? [0, 1, 0] : [0, 0, 1]; const t0 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; const e1 = norm(cross(ax, t0)); pe(id, q.c, [ax, e1, cross(ax, e1)], [Math.max(q.th / 2, 0.6), q.r, q.r]); }
        units.push({ id, k: dep(q.c), svg: drawProp(q), w: 1e6, impl: true });
      }
    });
    /* the hands join too, as fixed points like the kit they hold; their fingers keep their own order round the handle */
    const HS = {};
    for (const sd of [far, near]) {
      const x = sd === far ? 'F' : 'N', k = J.side[sd], hs = hand(sd), c = add(k.W, mul(norm(sub(k.W, k.E)), 3));
      pc('hn' + x, k.W, add(k.W, mul(norm(sub(k.W, k.E)), 6)), 3.6);
      HS[x] = hs; units.push({ id: 'hn' + x, k: dep(c), w: 1e6, impl: true, hand: hs });
    }
    const ord = order(units), U = {}; ord.forEach((u) => { U[u.id] = u; });
    ord.forEach((u, oi) => {
      if (!u.hand) { put(u.k2, u.svg || null, u); return; }
      let lo = -Infinity, hi = Infinity;                                   // the fingers spread round the handle, but never past the body parts drawn just before and after the hand
      for (let i = oi - 1; i >= 0; i--) if (!ord[i].impl) { lo = ord[i].k2; break; }
      for (let i = oi + 1; i < ord.length; i++) if (!ord[i].impl) { hi = ord[i].k2; break; }
      u.hand.forEach((h) => put(Math.max(lo + 1e-5, Math.min(hi - 1e-5, u.k2 + (h.k - u.k))), h.svg, { id: u.id }));
    });
    put(Math.max(U.uaF.k2, U.faF.k2) + 0.001, props('far')); put(Math.max(U.thN.k2, U.shN.k2) + 0.001, props('mid')); put(Math.max(U.uaN.k2, U.faN.k2) + 0.001, props('near'));
    if (tail) { const hk = U.hd.k2; put(tailBack ? Math.max(tailDep, hk + 0.3) : Math.min(tailDep, hk - 0.3), tail); }   // the ponytail keeps to its side of the head

    put(1e9, props('top'));
    if (root.__rigProbeOn) {
      (sx.props || []).forEach((q, qi) => {
        if (isImpl(q)) return; const id = 'ps' + qi;
        if (q.t === 'cap') pc(id, q.a, q.b, Math.max(q.ra, q.rb));
        else if (q.t === 'ball') pc(id, q.c, q.c, q.r);
        else if (q.t === 'disc') { const ax = Array.isArray(q.axis) ? norm(q.axis) : q.axis === 'x' ? [1, 0, 0] : q.axis === 'y' ? [0, 1, 0] : [0, 0, 1]; const t0 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; const e1 = norm(cross(ax, t0)), e2 = cross(ax, e1); pe(id, q.c, [ax, e1, e2], [Math.max(q.th / 2, 0.5), q.r, q.r]); }
        else if (q.t === 'box') { const b = q.b; pe(id, [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [(b[1] - b[0]) / 2 * 1.1, (b[3] - b[2]) / 2 * 1.1, (b[5] - b[4]) / 2 * 1.1]); }
      });
    }
    if (root.__rigProbeOn) root.__rigProbe = { PRIM, order: ord.map((u) => u.id), unitHit, ubox };
    items.sort((p, q) => p.k - q.k || p.i - q.i);
    /* parts of one body drawn back to back share their outlines (no seam where the thigh meets the hips, or the forearm the upper arm) */
    const out = []; let run = null;
    const flush = () => { if (run) { out.push(groupSeq(run.parts)); run = null; } };
    const tagOn = root.__rigTag;
    for (const t of items) {
      if (t.u && (t.u.part || t.u.parts)) {
        const ps = t.u.parts || [t.u.part];
        if (run && run.name === t.u.run && !tagOn) run.parts.push(...ps);
        else { flush(); run = { name: t.u.run, parts: ps.slice() }; if (tagOn) { out.push(`<g data-u="${t.u.id}">`); flush(); out.push('</g>'); } }
      } else { flush(); out.push(tagOn && t.u ? `<g data-u="${t.u.id}">${t.svg}</g>` : t.svg); }
    }
    flush();
    return out.join('');
  }

  /* ---------- timeline ---------- */
  function makeTimeline(phases) {
    const CYCLE = phases.reduce((s, q) => s + q.dur, 0);
    return {
      CYCLE,
      timeline(t) {
        t = ((t % CYCLE) + CYCLE) % CYCLE;
        let acc = 0;
        for (let i = 0; i < phases.length; i++) {
          const q = phases[i];
          if (t < acc + q.dur || i === phases.length - 1) {
            const k = Math.min(1, (t - acc) / q.dur), w = q.lin ? k : ease(k), e = q.e || [0.4, 0.4];
            return { pull: lerp(q.from, q.to, w), eff: lerp(e[0], e[1], w), phase: i, k, t };
          }
          acc += q.dur;
        }
      },
    };
  }

  /* ========== the moves ========== */
  const SCENES = {};
  const stdLegs = (z0, sp) => (s, hip) => ({ A: [s * (sp || 12), ankleY(0), z0 || 2], pole: [0, 0, 1], pitch: 0 });
  const stand = { H: [0, 92, 0], a: 2 };
  const hang = (s, S, dx, drop) => ({ E: add(S, mul(norm([s * 0.05, -1, 0.03]), LEN.UA)), W: add(S, [s * (dx || 2), -(LEN.UA + LEN.FA) + (drop || 0), 2]) });

  /* barbell curl */
  SCENES['barbell-curl'] = {
    phases: [{ name: 'Curl', dur: 1.5, from: 0, to: 1, e: [0.35, 1] }, { name: 'Squeeze', dur: 0.5, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 2.1, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Stretch', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 3.0, y0: 562 }, theta: -90, range: [-100, -10],
    pose(p, e) {
      const wob = 0;
      return Object.assign({}, stand, {
        a: 2 + 0 * wob, barHands: true,
        leg: stdLegs(2),
        arm: (s, S) => {
          const E = add(S, mul(dirYZ(-4), LEN.UA)), W = add(E, mul(dirYZ(-4 + lerp(8, 142, p)), LEN.FA));
          return { E, W };
        },
        props: [],
        hot: [['biceps', 0.12 + 0.82 * e]],
      });
    },
  };
  // the bar is placed after the arms are known, so it lives in a post-step
  SCENES['barbell-curl'].post = (sc, pose, J) => P.barbell([0, J.side[1].W[1], J.side[1].W[2]], { half: 46, R: 10, th: 4 });

  /* hammer curl (dumbbells, neutral grip) */
  SCENES['hammer-curl'] = {
    phases: SCENES['barbell-curl'].phases, cam: { S: 3.0, y0: 562 }, theta: -90, range: [-100, -10],
    pose(p, e) {
      return Object.assign({}, stand, { leg: stdLegs(2), arm: (s, S) => { const E = add(S, mul(dirYZ(-4), LEN.UA)); return { E, W: add(E, mul(dirYZ(-4 + lerp(8, 142, p)), LEN.FA)) }; }, hot: [['biceps', 0.12 + 0.82 * e], ['forearms', 0.2 + 0.4 * e]] });
    },
    postHand: 'dbz',
  };

  /* dumbbell lateral raise (best seen from the front) */
  SCENES['dumbbell-lateral-raise'] = {
    phases: [{ name: 'Raise', dur: 1.5, from: 0, to: 1, e: [0.35, 1] }, { name: 'Top', dur: 0.4, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 2.2, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Rest', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 3.0, y0: 562 }, theta: -25, range: [-100, 10],
    pose(p, e) {
      return Object.assign({}, stand, {
        leg: stdLegs(2),
        arm: (s, S) => {
          const b = lerp(7, 84, p) * D2R, bend = 14 * D2R;
          const E = add(S, [s * Math.sin(b) * LEN.UA, -Math.cos(b) * LEN.UA, 1]);
          const W = add(E, [s * Math.sin(b - bend) * LEN.FA * 0.99, -Math.cos(b - bend) * LEN.FA, 5]);
          return { E, W };
        },
        hot: [['shoulders', 0.12 + 0.84 * e]],
      });
    },
    postHand: 'dbz',
  };

  /* standing overhead press */
  SCENES['overhead-press'] = {
    phases: [{ name: 'Press', dur: 1.5, from: 0, to: 1, e: [0.4, 1] }, { name: 'Lockout', dur: 0.5, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 2.0, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Rack', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.35, y0: 570 }, theta: -70, range: [-100, -10],
    pose(p, e) {
      const barY = lerp(143 + 4, 143 + 56, p), barZ = lerp(9, 1, p);
      return Object.assign({}, stand, {
        a: lerp(2, -3, p), barHands: true, leg: stdLegs(2),
        sh: [lerp(0, 3, p), 0],
        arm: (s) => ({ W: [s * 21, barY, barZ], pole: [0, -1, lerp(0.6, -0.2, p)] }),
        props: P.barbell([0, barY, barZ], { half: 62, R: 12, th: 4 }),
        hot: [['shoulders', 0.12 + 0.82 * e], ['triceps', 0.1 + 0.45 * e]],
      });
    },
  };

  /* barbell bench press */
  SCENES['barbell-bench-press'] = {
    phases: [{ name: 'Lower', dur: 1.9, from: 0, to: 1, e: [0.35, 0.5] }, { name: 'Pause', dur: 0.4, from: 1, to: 1, e: [0.5, 0.6] }, { name: 'Press', dur: 1.2, from: 1, to: 0, e: [0.6, 1] }, { name: 'Lockout', dur: 0.4, from: 0, to: 0, e: [1, 0.4] }],
    cam: { S: 3.1, y0: 500, dx: -20 }, theta: -70, range: [-100, -20],
    shadow: { c: [0, 0, -5], rx: 70, rz: 95 },
    pose(p, e) {
      const barY = lerp(113, 72, p), barZ = lerp(-48, -40, p);
      return {
        H: [0, 56, 0], a: -90, barHands: true,
        sh: [0, 0],
        leg: (s) => ({ A: [s * 21, ankleY(0), 40], pole: [0, 1, 0.1], pitch: 0 }),
        arm: (s) => ({ W: [s * 38, barY, barZ], pole: [s * 0.35, -1, 0.0] }),
        props: [].concat(
          [P.box('eq', -17, 17, 38, 44, -88, 22, 'back'), P.box('eq', -3, 3, 0, 38, -78, -72, 'back'), P.box('eq', -3, 3, 0, 38, 8, 14, 'back'),
            P.box('eq', -3, 3, 0, 4, -92, -60, 'back'), P.box('eq', -3, 3, 0, 4, -4, 28, 'back'),
            P.cap('eq', [-62, 0, -66], 2.4, [-62, 128, -66], 2.4, 'back'), P.cap('eq', [62, 0, -66], 2.4, [62, 128, -66], 2.4, 'back')],
          P.barbell([0, barY, barZ], { half: 62, R: 13, th: 4.5 })),
        hot: [['chest', 0.12 + 0.82 * e], ['triceps', 0.1 + 0.35 * e], ['shoulders', 0.1 + 0.3 * e]],
      };
    },
  };

  /* push-up */
  SCENES['push-up'] = {
    phases: [{ name: 'Lower', dur: 1.6, from: 0, to: 1, e: [0.4, 0.5] }, { name: 'Pause', dur: 0.3, from: 1, to: 1, e: [0.5, 0.6] }, { name: 'Push', dur: 1.1, from: 1, to: 0, e: [0.6, 1] }, { name: 'Top', dur: 0.4, from: 0, to: 0, e: [1, 0.4] }],
    cam: { S: 2.75, y0: 420, dx: -48 }, theta: -90, range: [-100, -30],
    shadow: { c: [0, 0, -50], rx: 40, rz: 105 },
    pose(p, e) {
      const al = lerp(21, 5.5, p) * D2R, d = [0, Math.sin(al), Math.cos(al)], L = 86;
      const O = [0, 7.6, -126], A0 = O;                       // ankles
      const H = add(A0, mul(d, L - 0.5));
      return {
        H, a: 90 - al / D2R, leg: (s) => ({ A: [s * 10, A0[1] + 0, A0[2]], pole: [0, 0.3, -1], pitch: -76 }),
        arm: (s) => ({ W: [s * 23, 3, 2], pole: [s * 0.6, 0.2, -1] }),
        sh: [0, 0], head: null,
        hot: [['chest', 0.12 + 0.84 * e], ['triceps', 0.1 + 0.4 * e], ['shoulders', 0.1 + 0.3 * e]],
      };
    },
  };

  /* barbell back squat */
  SCENES['barbell-back-squat'] = {
    phases: [{ name: 'Descend', dur: 1.9, from: 0, to: 1, e: [0.35, 0.55] }, { name: 'Bottom', dur: 0.4, from: 1, to: 1, e: [0.55, 0.7] }, { name: 'Drive', dur: 1.4, from: 1, to: 0, e: [0.7, 1] }, { name: 'Stand', dur: 0.4, from: 0, to: 0, e: [0.6, 0.3] }],
    cam: { S: 2.7, y0: 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(8, 46, p), ar = a * D2R, hy = lerp(91, 48, p);
      const hz = 3 - (48 * Math.sin(ar) - 9 * Math.cos(ar));
      const bar = [0, hy + 48 * Math.cos(ar) + 9 * Math.sin(ar), 3];
      return {
        H: [0, hy, hz], a, barHands: true,
        leg: (s) => ({ A: [s * 17, ankleY(0), 3], pole: [s * 0.2, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 38, bar[1] - 1, bar[2] - 1], pole: [0, -1, -0.45] }),
        props: P.barbell(bar, { half: 62, R: 13, th: 4.5 }).concat([]),
        hot: [['quads', 0.1 + 0.85 * e], ['glutes', 0.1 + 0.6 * e]],
      };
    },
  };

  /* Romanian deadlift */
  SCENES['romanian-deadlift'] = {
    phases: [{ name: 'Hinge', dur: 1.9, from: 0, to: 1, e: [0.35, 0.7] }, { name: 'Stretch', dur: 0.4, from: 1, to: 1, e: [0.7, 0.8] }, { name: 'Stand', dur: 1.5, from: 1, to: 0, e: [0.85, 1] }, { name: 'Squeeze', dur: 0.4, from: 0, to: 0, e: [1, 0.3] }],
    cam: { S: 2.7, y0: 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(5, 76, p), ar = a * D2R, hz = -lerp(0, 30, p), hy = lerp(91, 86, p);
      const Sy = hy + 50 * Math.cos(ar), Sz = hz + 50 * Math.sin(ar), bz = 10;
      const by = Sy - Math.sqrt(Math.max(1, 53 * 53 - (Sz - bz) * (Sz - bz)));
      return {
        H: [0, hy, hz], a, barHands: true,
        leg: (s) => ({ A: [s * 13, ankleY(0), 0], pole: [0, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 24, by, bz], pole: [0, -0.4, -1] }),
        props: P.barbell([0, by, bz], { half: 62, R: 13, th: 4.5 }),
        hot: [['hamstrings', 0.12 + 0.82 * e], ['glutes', 0.1 + 0.55 * e], ['lowerback', 0.1 + 0.3 * e]],
      };
    },
  };

  /* cable triceps pushdown */
  SCENES['cable-triceps-pushdown'] = {
    phases: [{ name: 'Press down', dur: 1.2, from: 0, to: 1, e: [0.4, 1] }, { name: 'Lockout', dur: 0.5, from: 1, to: 1, e: [1, 1] }, { name: 'Return', dur: 1.9, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Top', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.35, y0: 572, dx: 10 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const f = lerp(100, 2, p);
      return Object.assign({}, stand, {
        a: 8, barHands: true, leg: stdLegs(2),
        arm: (s, S) => { const E = add(S, mul(dirYZ(-6), LEN.UA)); return { E, W: add(E, mul(dirYZ(-6 + f), LEN.FA)) }; },
        props: [P.box('eq', -24, 24, 0, 6, 24, 40, 'back'), P.box('eq', -22, 22, 6, 232, 30, 40, 'back'), P.ball('eq2', [0, 218, 22], 5, 'back')],
        hot: [['triceps', 0.12 + 0.84 * e]],
      });
    },
    post: (sc, pose, J) => {
      const W = J.side[1].W, hnd = [0, W[1] - 1, W[2] + 1];
      return [P.cap('gbar', [-9, hnd[1], hnd[2]], 1.5, [9, hnd[1], hnd[2]], 1.5, 'near'), P.line('cable', [0, 218, 22], hnd, 'back')];
    },
  };

  /* pull-up */
  SCENES['pull-up'] = {
    phases: [{ name: 'Pull', dur: 1.7, from: 0, to: 1, e: [0.4, 1] }, { name: 'Top', dur: 0.4, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 2.1, from: 1, to: 0, e: [0.8, 0.35] }, { name: 'Hang', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.38, y0: 578, dx: 0 }, theta: -75, range: [-100, -20],
    shadow: { c: [0, 0, 0], rx: 60, rz: 44 },
    pose(p, e) {
      const Sy = lerp(169, 205, p), a = lerp(-6, -14, p), ar = a * D2R;
      const T = [0, Sy, 1.5], H = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H, a, barHands: true, sh: [0, 0],
        arm: (s) => ({ W: [s * 36, 222, 2], pole: [s * 0.2, -0.6, lerp(-0.2, -0.9, p)] }),
        leg: (s) => ({ A: [s * 7, H[1] - 60, H[2] - 28], pole: [0, 0, 1], pitch: -55 }),
        props: [P.cap('gbar', [-52, 222, 2], 2.0, [52, 222, 2], 2.0, 'near'), P.cap('eq', [-60, 0, 2], 2.6, [-60, 222, 2], 2.6, 'back'), P.cap('eq', [60, 0, 2], 2.6, [60, 222, 2], 2.6, 'back')],
        hot: [['lats', 0.12 + 0.84 * e], ['biceps', 0.1 + 0.35 * e]],
      };
    },
  };

  /* seated cable row */
  SCENES['seated-cable-row'] = {
    phases: [{ name: 'Pull', dur: 1.4, from: 0, to: 1, e: [0.4, 1] }, { name: 'Squeeze', dur: 0.6, from: 1, to: 1, e: [1, 1] }, { name: 'Return', dur: 2.0, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Stretch', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.6, y0: 500, dx: 52 }, theta: -90, range: [-100, -20],
    shadow: { c: [0, 0, 40], rx: 50, rz: 96 },
    pose(p, e) {
      const a = lerp(14, -3, p), ar = a * D2R, H = [0, 47, 0];
      const Sy = H[1] + 50 * Math.cos(ar), Sz = 50 * Math.sin(ar);
      const W = [0, lerp(Sy - 22, Sy - 36, p), lerp(Sz + 48, Sz + 8, p)];
      return {
        H, a, barHands: true, sh: [0, lerp(-1, 1.5, p)],
        leg: (s) => ({ A: [s * 12, 34, 82], pole: [0, 1, 0.1], pitch: -8 }),
        arm: (s) => ({ W: [s * 9, W[1], W[2]], pole: [s * 0.4, -0.2, -1] }),
        props: [P.box('eq', -17, 17, 36, 41, -20, 16, 'back'), P.box('eq', -5, 5, 0, 36, -10, 6, 'back'), P.box('eq', -22, 22, 14, 50, 88, 94, 'back'), P.box('eq', -22, 22, 0, 6, -30, 110, 'back'),
          P.box('eq', -24, -19, 6, 150, 120, 128, 'back'), P.box('eq', 19, 24, 6, 150, 120, 128, 'back'), P.box('eq', -24, 24, 144, 150, 120, 128, 'back'), P.box('stk', -12, 12, 6, 54, 121, 127, 'back'), P.box('eq2', -12, 12, 54, 58, 121, 127, 'back'), P.cap('gbar', [-8, 58, 124], 0.8, [-8, 144, 124], 0.8, 'back'), P.cap('gbar', [8, 58, 124], 0.8, [8, 144, 124], 0.8, 'back'), P.disc('eq2', [0, 52, 118], 'x', 5, 2.4, 'back'),
          P.line('cable', [0, 52, 118], [0, W[1], W[2]], 'back'), P.cap('gbar', [-9, W[1], W[2]], 1.5, [9, W[1], W[2]], 1.5, 'near')],
        hot: [['lats', 0.12 + 0.8 * e], ['midback', 0.1 + 0.75 * e], ['biceps', 0.08 + 0.3 * e]],
      };
    },
  };

  /* hip thrust */
  SCENES['hip-thrust'] = {
    phases: [{ name: 'Drive up', dur: 1.3, from: 0, to: 1, e: [0.4, 1] }, { name: 'Squeeze', dur: 0.6, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 1.8, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Reset', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.85, y0: 480, dx: -20 }, theta: -90, range: [-100, -20],
    shadow: { c: [0, 0, -10], rx: 60, rz: 90 },
    pose(p, e) {
      const a = lerp(-50, -88, p) , ar = a * D2R, T = [0, 60, -56];
      const u = [0, Math.cos(ar), Math.sin(ar)], zx = [0, -Math.sin(ar), Math.cos(ar)], H = sub(T, mul(u, 50));
      const bar = add(H, mul(zx, 12));
      return {
        H, a, barHands: true, sh: [0, 0],
        leg: (s) => ({ A: [s * 17, ankleY(0), 38], pole: [0, 1, 0.2], pitch: 0 }),
        arm: (s) => ({ W: [s * 30, bar[1] + 1, bar[2]], pole: [s * 0.4, -0.2, -0.6] }),
        props: [P.box('eq', -17, 17, 30, 44, -90, -42, 'back'), P.box('eq', -17, 17, 0, 30, -80, -58, 'back')].concat(P.barbell(bar, { half: 60, R: 13, th: 4.5 })),
        hot: [['glutes', 0.12 + 0.86 * e], ['hamstrings', 0.1 + 0.25 * e]],
      };
    },
  };

  /* standing calf raise */
  SCENES['standing-calf-raise'] = {
    phases: [{ name: 'Rise', dur: 1.2, from: 0, to: 1, e: [0.4, 1] }, { name: 'Squeeze', dur: 0.7, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 1.9, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Stretch', dur: 0.6, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 3.0, y0: 562 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const pitch = -lerp(0, 58, p), ay = ankleY(pitch);
      return {
        H: [0, ay + 84.5, 0], a: 1,
        leg: (s) => ({ A: [s * 12, ay, 2], pole: [0, 0, 1], pitch }),
        arm: (s, S) => ({ E: add(S, mul(norm([s * 0.05, -1, 0]), LEN.UA)), W: add(S, [s * 3, -53, 1]) }),
        hot: [['calves', 0.12 + 0.86 * e]],
      };
    },
    postHand: 'dbz',
  };

  /* dumbbell shrug */
  SCENES['dumbbell-shrug'] = {
    phases: [{ name: 'Shrug', dur: 1.0, from: 0, to: 1, e: [0.4, 1] }, { name: 'Hold', dur: 0.7, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 1.6, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Rest', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 3.0, y0: 562 }, theta: -150, range: [-180, -60],
    pose(p, e) {
      return Object.assign({}, stand, {
        leg: stdLegs(2), sh: [lerp(-0.5, 5.5, p), 0],
        arm: (s, S) => ({ E: add(S, mul(norm([s * 0.04, -1, 0]), LEN.UA)), W: add(S, [s * 4, -53.5, 1]) }),
        hot: [['traps', 0.12 + 0.86 * e]],
      });
    },
    postHand: 'dbz',
  };

  /* hanging knee raise */
  SCENES['hanging-knee-raise'] = {
    phases: [{ name: 'Raise', dur: 1.3, from: 0, to: 1, e: [0.4, 1] }, { name: 'Squeeze', dur: 0.5, from: 1, to: 1, e: [1, 1] }, { name: 'Lower', dur: 1.9, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Hang', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.38, y0: 578 }, theta: -80, range: [-100, -20],
    shadow: { c: [0, 0, 0], rx: 60, rz: 44 },
    pose(p, e) {
      const a = lerp(-4, -16, p), ar = a * D2R, T = [0, 168, 0], H = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      const t = lerp(6, 108, p), k = lerp(22, 98, p);
      return {
        H, a, barHands: true,
        arm: (s) => ({ W: [s * 36, 222, 2], pole: [s * 0.2, -0.5, -0.3] }),
        leg: (s, hip) => { const K = add(hip, mul(dirYZ(t), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(t - k), LEN.SHIN)), pitch: -50 }; },
        props: [P.cap('gbar', [-52, 222, 2], 2.0, [52, 222, 2], 2.0, 'near'), P.cap('eq', [-60, 0, 2], 2.6, [-60, 222, 2], 2.6, 'back'), P.cap('eq', [60, 0, 2], 2.6, [60, 222, 2], 2.6, 'back')],
        hot: [['abs', 0.12 + 0.84 * e]],
      };
    },
  };

  /* ========== public ========== */
  /* Dumbbell exercises place a dumbbell in each hand after the arms are solved. */
  const SUP = /^(barbell-curl|ez-bar-curl|cable-curl|bayesian-cable-curl|twenty-ones-curl|spider-curl|preacher-curl|incline-dumbbell-curl|concentration-curl|wrist-curl|chin)/;
  function make(key) {
    const sc = SCENES[key]; if (!sc) return null;
    const tl = makeTimeline(sc.phases);
    const full = {
      _ts: {},
      cam: sc.cam, shadow: sc.shadow,
      pose(p, e) {
        const pose = sc.pose(p, e);
        pose.shadow = sc.shadow; pose.barefoot = true; pose.grip = SUP.test(key) ? 'sup' : 'pro';
        const arm = pose.arm, leg = pose.leg;
        // post-step props need the solved joints: solve once without them
        const post = sc.post, dbz = sc.postHand;
        if (post || dbz) {
          const J = solveBody(pose);
          pose.props = (pose.props || []).concat(post ? post(sc, pose, J, p, e) : []);
          if (dbz) for (const s of [1, -1]) pose.props = pose.props.concat(P.dumbbell(J.side[s].W, 'z', s === 1 ? 'near' : 'far'));
        }
        /* every dumbbell sits in a hand and tilts with the forearm: handle square to the forearm, centred in the fist */
        if ((pose.props || []).some((q) => q._db)) {
          const J = solveBody(pose), drop = new Set(), add2 = [];
          for (const q of pose.props) {
            if (!q._db) continue;
            const c = add(q.a, mul(sub(q.b, q.a), 0.5));
            let best = null;
            for (const s of [1, -1]) { const k = J.side[s], dd = d3(c, k.W); if (dd < 7 && (!best || dd < best.dd)) best = { dd, k, s }; }
            if (!best) continue;
            const d = norm(sub(best.k.Hd || best.k.W, best.k.Hd ? best.k.W : best.k.E)), v0 = q._db.axis;
            let v = sub(v0, mul(d, dot(v0, d)));
            if (Math.hypot(...v) < 0.35) continue;
            drop.add(q._g); add2.push(...P.dumbbell(best.k.W, norm(v), q._db.layer, q._db.R));
          }
          if (drop.size) pose.props = pose.props.filter((q) => !drop.has(q._g)).concat(add2);
        }
        return pose;
      },
    };
    /* ----- auto-framing: the figure and its equipment always fill the screen, at every angle, with nothing cropped ----- */
    const N = 40, samples = [];
    for (let i = 0; i < N; i++) { const q = tl.timeline(tl.CYCLE * i / N), pose = full.pose(q.pull, q.eff); samples.push({ pose, J: solveBody(pose) }); }
    const cloud = samples.map(({ pose, J }) => {
      const P3 = [J.H, J.T, add(J.head, mul(J.u, 11)), sub(J.head, mul(J.u, 1))];
      for (const s of [1, -1]) { const k = J.side[s]; P3.push(k.S, k.E, k.W, k.hip, k.knee, k.ankle, k.heel, k.toe); if (k.Hd) P3.push(k.Hd); }
      for (const q of pose.props || []) {
        if (q.t === 'cap') { P3.push(add(q.a, [q.ra, 0, 0]), sub(q.a, [q.ra, 0, 0]), add(q.b, [q.ra, 0, 0]), sub(q.b, [q.ra, 0, 0])); }
        else if (q.t === 'box') { const [x0, x1, y0, y1, z0, z1] = q.b; if (y1 - y0 < 1.6) continue;      // thin ground markers and water lines don't count toward the framing
         for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) P3.push([x, y, z]); }
        else if (q.t === 'disc' || q.t === 'ball') { const r = q.r; for (const d of [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]]) P3.push(add(q.c, d)); }
        else if (q.t === 'slab') { if (q.th >= 1) P3.push(q.a, q.b); }
      }
      return P3;
    });
    const view = (th) => {
      const cam = camera(th, { S: 1, y0: 0 }), ph = 6 * D2R, cp = Math.cos(ph), sp = Math.sin(ph);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const P3 of cloud) for (const q of P3) { const x = dot(q, cam.R), y = q[1] * cp - dot(q, cam.C) * sp; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      y0 = Math.min(y0, 0);                                           // the floor is always in view
      return { x0, x1, y0, y1 };
    };
    const lo = sc.range ? sc.range[0] : sc.theta - 60, hi = sc.range ? sc.range[1] : sc.theta + 60;
    let FS = 99; for (let th = lo; th <= hi + 0.1; th += 10) { const v = view(th); FS = Math.min(FS, 440 / Math.max(1, v.x1 - v.x0), 500 / Math.max(1, v.y1 - v.y0)); }
    FS = Math.max(1.2, Math.min(4.4, FS));
    const camCache = {};
    const fit = (th) => {
      const k = Math.round(th); if (camCache[k]) return camCache[k];
      const v = view(k); return (camCache[k] = { S: FS, dx: (v.x0 + v.x1) / 2, y0: 300 + ((v.y0 + v.y1) / 2) * FS });
    };
    /* ----- path trail: the point that travels the most (the bar, a hand or a foot) drawn as a dotted line ----- */
    const NOTRAIL = new Set(['walking-outdoors', 'treadmill-running', 'hiit-sprint-intervals', 'incline-treadmill-walk', 'sled-push', 'farmers-carry', 'suitcase-carry', 'stationary-bike', 'cycling-outdoor', 'assault-bike', 'rowing-machine', 'stair-climber', 'stair-climber-intervals', 'elliptical', 'jump-rope', 'battle-ropes', 'swimming', 'mountain-climber', 'bicycle-crunch', 'bicycle-crunch-slow']);
    let track = null;
    if (!NOTRAIL.has(key)) {
      const cands = { wrist: samples.map(({ J }) => J.side[1].W), ankle: samples.map(({ J }) => J.side[1].ankle),
        bar: samples.map(({ pose }) => { const b = (pose.props || []).find((q) => q.t === 'cap' && q.cls === 'gbar' && Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1], q.b[2] - q.a[2]) > 60); return b ? mul(add(b.a, b.b), 0.5) : null; }) };
      let best = 0;
      for (const [n, pts] of Object.entries(cands)) {
        if (pts.some((q) => !q)) continue;
        let len = 0; for (let i = 1; i < pts.length; i++) len += d3(pts[i], pts[i - 1]);
        const w = n === 'bar' ? 1.4 : n === 'wrist' ? 1.1 : 1;
        if (len * w > best && len / 2 > 18) { best = len * w; track = pts; }
      }
    }
    const trailCache = {};
    const trailPath = (th) => {
      if (!track) return '';
      const k = Math.round(th); if (trailCache[k] != null) return trailCache[k];
      const cam = camera(k, fit(k)); return (trailCache[k] = `<path class="trail" d="M${track.map((q) => fx(cam.proj(q))).join('L')}"/>`);
    };
    return {
      _ts: full._ts, PHASES: sc.phases, CYCLE: tl.CYCLE, timeline: tl.timeline, theta: sc.theta, range: sc.range, framing: FS,
      frame: (p, theta, e, opts) => frame(Object.assign({}, full, { cam: fit(theta) }), p, e == null ? 0.6 : e, theta, opts) + (opts && opts.trail ? trailPath(theta) : ''),
      solveAt(t) { const q = tl.timeline(t), pose = full.pose(q.pull, q.eff); return { s: q, pose, J: solveBody(pose) }; },
    };
  }
  root.Rig2 = { make, setBody, SCENES, P, U: { add, sub, mul, norm, lerp, dirYZ, ankleY, ik, LEN, D2R, dot } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Rig2;
})(typeof window !== 'undefined' ? window : globalThis);
