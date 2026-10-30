/* Plate: more exercise demos, batch C (pulls, rows, chest-supported work). */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const { PH, H, tower, seat, seatedLegs, dbPair, stand, stdLegs, barProps } = X;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- seated pulldowns ---------- */
  const pulldown = (o) => ({
    phases: PH('Pull down', 'Return', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.35, y0: 566, dx: 4 }, theta: -80, range: [-100, -10],
    pose(p, e) {
      const y = lerp(152, 90, p), a = lerp(0, -14, p);
      return {
        H: [0, 50, 0], a, barHands: true, sh: [0, lerp(0, -1, p)], leg: (s) => ({ A: [s * 16, ankleY(0), 42], pole: [0, 1, 0.1], pitch: 0 }),
        arm: (s) => ({ W: [s * (o.gx || 26), y, lerp(8, 5, p)], pole: [s * 0.4, -0.8, -1] }),
        props: [P.box('eq', -17, 17, 38, 44, -22, 16, 'back'), P.box('eq', -4, 4, 0, 38, -10, 2, 'back'), P.box('eq', -22, 22, 0, 4, -30, 70, 'back'), P.box('eq', -20, 20, 56, 66, 22, 40, 'back'),
          P.box('eq', -22, 22, 6, 240, -30, -22, 'back'), P.box('eq', -22, 22, 236, 244, -30, 14, 'back'), P.ball('eq2', [0, 232, 10], 5, 'back'), P.line('cable', [0, 232, 10], [0, y, 14], 'back')],
        hot: o.hot(e),
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return [P.cap('gbar', [-(o.gx || 26) - 2, W[1], W[2]], 1.5, [(o.gx || 26) + 2, W[1], W[2]], 1.5, 'near')]; },
  });
  S['lat-pulldown'] = Object.assign(pulldown({ gx: 27, hot: (e) => [['lats', H(1, e)], ['biceps', H(0.45, e)], ['midback', H(0.4, e)], ['shoulders', H(0.25, e)]] }), { theta: -120, range: [-135, -10] });   // from behind and to the side, so the lats show
  S['close-grip-pulldown'] = pulldown({ gx: 9, hot: (e) => [['lats', H(1, e)], ['biceps', H(0.5, e)], ['midback', H(0.3, e)]] });
  S['straight-arm-pulldown'] = {
    phases: PH('Sweep down', 'Return', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.45, y0: 568, dx: 4 }, theta: -80, range: [-100, -10],
    pose(p, e) {
      const th = lerp(142, 12, p);
      return Object.assign({}, stand, {
        a: 26, barHands: true, leg: (s) => ({ A: [s * 13, ankleY(0), s === 1 ? 14 : -8], pole: [0, 0, 1], pitch: 0 }),
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(th), LEN.UA)); return { E, W: add(E, mul(dirYZ(th - 2), LEN.FA)) }; },
        props: tower(52, 222, true),
        hot: [['lats', H(1, e)], ['triceps', H(0.3, e)]],
      });
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return [P.cap('gbar', [-8, W[1], W[2]], 1.5, [8, W[1], W[2]], 1.5, 'near'), P.line('cable', [0, 222, 50], [0, W[1], W[2]], 'back')]; },
  };

  /* ---------- pull-up family ---------- */
  const bars = [P.cap('gbar', [-52, 222, 2], 2.0, [52, 222, 2], 2.0, 'near'), P.cap('eq', [-60, 0, 2], 2.6, [-60, 222, 2], 2.6, 'back'), P.cap('eq', [60, 0, 2], 2.6, [60, 222, 2], 2.6, 'back')];
  const hangPose = (Sy, a, o) => {
    const ar = a * D2R, T = [0, Sy, 1.5], Hh = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50));
    return { H: Hh, a, T };
  };
  S['assisted-pull-up'] = {
    phases: PH('Pull', 'Lower', { d: [1.7, 0.4, 2.1, 0.4] }), cam: { S: 2.38, y0: 578 }, theta: -75, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 60, rz: 44 },
    pose(p, e) {
      const Sy = lerp(169, 203, p), a = lerp(-6, -12, p), h = hangPose(Sy, a), ky = h.H[1] - 42;
      return {
        H: h.H, a, barHands: true, sh: [0, 0],
        arm: (s) => ({ W: [s * 36, 222, 2], pole: [s * 0.2, -0.6, lerp(-0.2, -0.9, p)] }),
        leg: (s, hip) => { const K = add(hip, mul(dirYZ(8), LEN.THIGH * 0.98)); return { K, A: add(K, mul(dirYZ(-96), LEN.SHIN)), pitch: -50 }; },
        props: bars.concat([P.box('eq', -22, 22, ky - 6, ky, -4, 20, 'back'), P.box('eq', -5, 5, 0, ky - 6, 8, 16, 'back'), P.box('eq', -26, 26, 0, 3, -6, 30, 'back')]),
        hot: [['lats', H(1, e)], ['biceps', H(0.35, e)]],
      };
    },
  };
  S['scapular-pull-up'] = {
    phases: [{ name: 'Pull shoulders down', dur: 1.2, from: 0, to: 1, e: [0.4, 1] }, { name: 'Hold', dur: 0.6, from: 1, to: 1, e: [1, 1] }, { name: 'Relax up', dur: 1.5, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Dead hang', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.38, y0: 578 }, theta: -75, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 60, rz: 44 },
    pose(p, e) {
      const Sy = lerp(169, 178, p), h = hangPose(Sy, -4);
      return {
        H: h.H, a: -4, barHands: true, sh: [lerp(2.2, -1.2, p), 0],
        arm: (s) => ({ W: [s * 36, 222, 2], pole: [s * 0.2, -0.6, -0.2] }),
        leg: (s) => ({ A: [s * 7, h.H[1] - 60, h.H[2] - 22], pole: [0, 0, 1], pitch: -55 }),
        props: bars, hot: [['lats', H(0.9, e)], ['traps', H(0.7, e)]],
      };
    },
  };
  S['dead-hang'] = {
    phases: [{ name: 'Grip and hang', dur: 2.0, from: 0, to: 1, e: [0.5, 0.8] }, { name: 'Hold', dur: 1.5, from: 1, to: 1, e: [0.8, 0.9] }, { name: 'Release', dur: 1.5, from: 1, to: 0, e: [0.9, 0.4] }, { name: 'Rest', dur: 0.5, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.38, y0: 578 }, theta: -75, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 60, rz: 44 },
    pose(p, e) {
      const h = hangPose(lerp(171, 169, p), -3);
      return {
        H: h.H, a: -3, barHands: true, sh: [lerp(-1, 1.8, p), 0],
        arm: (s) => ({ W: [s * 36, 222, 2], pole: [s * 0.2, -0.6, -0.2] }),
        leg: (s) => ({ A: [s * 7, h.H[1] - 62, h.H[2] - 6], pole: [0, 0, 1], pitch: -40 }),
        props: bars, hot: [['forearms', H(1, e)], ['lats', H(0.5, e)]],
      };
    },
  };

  /* ---------- bent-over rows ---------- */
  const bentLegs = (s) => ({ A: [s * 14, ankleY(0), 2], pole: [0, 0.1, 1], pitch: 0 });
  const bentRow = (o) => ({
    phases: PH('Row', 'Lower', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.5, y0: 556 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = o.a || 62, ar = a * D2R, Hh = [0, 88, -26], T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      const y = lerp(T[1] - 56, T[1] - 18, p), z = lerp(T[2] + 4, T[2] - 12, p);
      return {
        H: Hh, a, barHands: !o.db, sh: [0, lerp(0, -1.5, p)], leg: bentLegs,
        arm: (s) => ({ W: [s * (o.db ? 24 : 22), y, z], pole: [s * 0.3, 0.1, -1] }),
        props: o.bar ? barProps([0, y, z], { half: 58, R: 12, th: 4.2 }) : [],
        hot: [['lats', H(1, e)], ['midback', H(0.75, e)], ['biceps', H(0.3, e)], ['lowerback', H(0.2, e)]],
      };
    },
    post: o.db ? (sc, pose, J) => dbPair(J, 'z') : null,
  });
  S['barbell-row'] = bentRow({ bar: true });
  S['t-bar-row'] = Object.assign(bentRow({ a: 56 }), {
    post: (sc, pose, J) => { const W = J.side[1].W, hnd = [0, W[1] - 3, W[2]], anchor = [0, 4, -96], d = norm(sub(hnd, anchor));
      return [P.cap('gbar', anchor, 1.8, add(hnd, mul(d, 8)), 1.8, 'near'), P.cap('gbar', add(hnd, [-9, -2, 4]), 1.5, add(hnd, [9, -2, 4]), 1.5, 'near'), P.disc('eq2', add(anchor, mul(d, 14)), 'x', 9, 3.4, 'near'), P.disc('eq2', add(anchor, mul(d, 20)), 'x', 9, 3.4, 'near')]; },
  });
  S['t-bar-row'].pose = ((f) => (p, e) => { const r = f(p, e); r.props = [P.ball('eq2', [0, 4, -96], 4, 'back')]; return r; })(S['t-bar-row'].pose);

  S['one-arm-dumbbell-row'] = {
    phases: PH('Row', 'Lower', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 556, dx: 6 }, theta: -80, range: [-100, -20],
    pose(p, e) {
      const a = 76, ar = a * D2R, Hh = [0, 66, -14], T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H: Hh, a, sh: [0, 0],
        leg: (s) => s === -1 ? { K: [-12, 52, -2], A: [-12, 47, -42], pitch: -80 } : { A: [14, ankleY(0), -30], pole: [0, 0.2, 1], pitch: 0 },
        arm: (s) => s === -1 ? { W: [-12, 46, 26], pole: [0, 0, -1] } : { W: [s * 6, lerp(T[1] - 54, T[1] - 24, p), lerp(T[2] + 2, T[2] - 14, p)], pole: [0.2, 0, -1] },
        props: [P.box('eq', -17, 17, 38, 44, -22, 40, 'back'), P.box('eq', -3, 3, 0, 38, -16, -10, 'back'), P.box('eq', -3, 3, 0, 38, 30, 36, 'back')],
        hot: [['lats', H(1, e)], ['midback', H(0.6, e)], ['biceps', H(0.3, e)]],
      };
    },
    post: (sc, pose, J) => P.dumbbell(J.side[1].W, 'z', 'near'),
  };
  S['machine-row'] = {
    phases: PH('Pull back', 'Return', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 560, dx: 6 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const z = lerp(52, 26, p), y = lerp(104, 96, p);
      return {
        H: [0, 50, 0], a: lerp(4, 1, p), barHands: true, sh: [0, lerp(0, 1.5, p)], leg: (s) => ({ A: [s * 16, ankleY(0), 40], pole: [0, 1, 0.1], pitch: 0 }),
        arm: (s) => ({ W: [s * 18, y, z], pole: [s * 0.6, -0.1, -1] }),
        props: seat(-14, 14).concat([P.box('eq', -16, 16, 70, 124, 15, 23, 'back'), P.box('eq', -4, 4, 44, 70, 15, 23, 'back'), P.box('eq', -2, 2, y - 8, y + 4, z + 2, 72, 'back')]),
        hot: [['lats', H(0.9, e)], ['midback', H(0.9, e)], ['biceps', H(0.3, e)]],
      };
    },
    post: (sc, pose, J) => [1, -1].map((s) => P.cap('gbar', add(J.side[s].W, [-s * 3, 0, 0]), 1.6, add(J.side[s].W, [s * 3, 0, 0]), 1.6, s === 1 ? 'near' : 'far')),
  };

  /* prone on an incline bench */
  function proneBase(inc) {
    const a = 90 - inc, ar = a * D2R, Hh = [0, 62, -26];
    const u = [0, Math.cos(ar), Math.sin(ar)], zx = [0, -Math.sin(ar), Math.cos(ar)], T = add(Hh, mul(u, 50));
    const pad = P.slab('eq', add(Hh, add(mul(u, -16), mul(zx, 11))), add(Hh, add(mul(u, 64), mul(zx, 11))), 34, 7, 'back');
    const frame = [P.cap('eq', add(Hh, mul(zx, 4)), 2.4, [0, 4, -36], 2.4, 'back'), P.cap('eq', add(Hh, add(mul(u, 56), mul(zx, 4))), 2.4, [0, 4, 30], 2.4, 'back'), P.box('eq', -20, 20, 0, 4, -50, 40, 'back')];
    return { a, H: Hh, T, u, zx, props: [pad].concat(frame), leg: (s) => ({ A: [s * 14, ankleY(0), -92], pole: [0, -1, 0.15], pitch: 0 }) };
  }
  S['chest-supported-row'] = {
    phases: PH('Row', 'Lower', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 530, dx: -10 }, theta: -80, range: [-100, -20],
    pose(p, e) {
      const b = proneBase(45);
      return {
        H: b.H, a: b.a, sh: [0, 0], leg: b.leg, props: b.props,
        arm: (s) => ({ W: [s * 20, lerp(b.T[1] - 54, b.T[1] - 22, p), lerp(b.T[2] + 8, b.T[2] - 4, p)], pole: [s * 0.4, 0.2, -1] }),
        hot: [['midback', H(1, e)], ['lats', H(0.8, e)], ['biceps', H(0.3, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };
  S['chest-supported-y-raise'] = {
    phases: PH('Raise into a Y', 'Lower', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Hold' }), cam: { S: 2.6, y0: 530, dx: -10 }, theta: -145, range: [-190, -50],
    pose(p, e) {
      const b = proneBase(45);
      return {
        H: b.H, a: b.a, sh: [0, 0], leg: b.leg, props: b.props,
        arm: (s, Sh) => { const ph = lerp(4, 150, p) * D2R, d = norm([s * Math.sin(ph) * 0.55, -Math.cos(ph), Math.sin(ph) * 0.8 + 0.1]), E = add(Sh, mul(d, LEN.UA)); return { E, W: add(E, mul(d, LEN.FA)) }; },
        hot: [['traps', H(1, e)], ['shoulders', H(0.5, e)], ['midback', H(0.5, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };
  S['spider-curl'] = {
    phases: PH('Curl', 'Lower'), cam: { S: 2.6, y0: 530, dx: -10 }, theta: -80, range: [-100, -20],
    pose(p, e) {
      const b = proneBase(45);
      return {
        H: b.H, a: b.a, sh: [0, 0], leg: b.leg, props: b.props,
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(-4), LEN.UA)); return { E, W: add(E, mul(dirYZ(-4 + lerp(8, 138, p)), LEN.FA)) }; },
        hot: [['biceps', H(1, e)], ['forearms', H(0.3, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };

  /* renegade row: plank with dumbbells, rowing one arm at a time */
  S['renegade-row'] = {
    phases: [{ name: 'Row right', dur: 1.1, from: 0, to: 1, e: [0.4, 1] }, { name: 'Lower', dur: 1.2, from: 1, to: 0, e: [0.8, 0.3] }, { name: 'Row left', dur: 1.1, from: 2, to: 3, e: [0.4, 1] }, { name: 'Lower', dur: 1.2, from: 3, to: 2, e: [0.8, 0.3] }],
    cam: { S: 2.45, y0: 420, dx: -62 }, theta: -90, range: [-100, -30], shadow: { c: [0, 0, -50], rx: 40, rz: 105 },
    pose(p, e) {
      const al = 8 * D2R, d = [0, Math.sin(al), Math.cos(al)], O = [0, 7.6, -126], Hh = add(O, mul(d, 85.5));
      const rr = p <= 1.5 ? clamp(p, 0, 1) : 0, rl = p >= 2 ? clamp(p - 2, 0, 1) : 0;
      return {
        H: Hh, a: 90 - 8, sh: [0, 0], head: null, leg: (s) => ({ A: [s * 14, O[1], O[2]], pole: [0, 0.3, -1], pitch: -76 }),
        arm: (s) => { const r = s === 1 ? rr : rl; return { W: [s * 22, lerp(9, 30, r), lerp(2, -22, r)], pole: [s * 0.6, 0.4, -1] }; },
        hot: [['lats', H(1, e)], ['abs', H(0.5, e)], ['obliques', H(0.5, e)], ['midback', H(0.6, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };
})(typeof window !== 'undefined' ? window : globalThis);
