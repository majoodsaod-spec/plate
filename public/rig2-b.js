/* Plate: more exercise demos, batch B (chest, dips, triceps on a bench). */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const { PH, H, tower, seat, backPad, seatedLegs, dbPair, stand, stdLegs, barProps } = X;
  const BENCH_PH = [{ name: 'Lower', dur: 1.9, from: 0, to: 1, e: [0.35, 0.5] }, { name: 'Pause', dur: 0.4, from: 1, to: 1, e: [0.5, 0.6] }, { name: 'Press', dur: 1.2, from: 1, to: 0, e: [0.6, 1] }, { name: 'Lockout', dur: 0.4, from: 0, to: 0, e: [1, 0.4] }];

  /* lying or inclined press: inc = bench angle in degrees (negative = decline) */
  function benchPress(o) {
    const inc = o.inc || 0, a = -90 + inc, ar = a * D2R;
    return {
      phases: BENCH_PH, cam: { S: 3.1, y0: inc > 10 ? 520 : 500, dx: -20 }, theta: -70, range: [-100, -20],
      shadow: { c: [0, 0, -5], rx: 70, rz: 95 },
      pose(p, e) {
        const Hh = [0, 56 + (inc < 0 ? 8 : 0), inc > 10 ? -6 : 0];
        const u = [0, Math.cos(ar), Math.sin(ar)], zx = [0, -Math.sin(ar), Math.cos(ar)], T = add(Hh, mul(u, 50));
        const low = add(add(T, add(mul(zx, 16), [0, 0, 2])), inc > 10 ? mul(u, -12) : [0, 0, 0]), high = [0, T[1] + 57, T[2] + 10 + inc * 0.25];
        const c = [0, lerp(high[1], low[1], p), lerp(high[2], low[2], p)], gx = o.gx || 38;
        const legs = (s) => ({ A: [s * 21, ankleY(0), 40], pole: [0, 1, 0.1], pitch: 0 });
        const pad = (() => { const b0 = add(Hh, add(mul(u, -12), mul(zx, -7))), b1 = add(b0, mul(u, 86)); return P.slab('eq', b0, b1, 34, 8, 'back'); })();
        return {
          H: Hh, a, barHands: !o.db, sh: [0, 0], leg: legs,
          arm: (s) => ({ W: [s * (o.db ? lerp(24, 31, p) : gx), c[1], c[2]], pole: [s * 0.35, -1, 0] }),
          props: [pad, P.box('eq', -17, 17, 38, 44, -10, 22, 'back'), P.box('eq', -3, 3, 0, 38, 8, 14, 'back'), P.box('eq', -3, 3, 0, 4, -4, 28, 'back'),
            P.box('eq', -3, 3, 0, 40, -62, -56, 'back'), P.box('eq', -3, 3, 0, 4, -92, -30, 'back')]
            .concat(o.db ? [] : [P.cap('eq', [-62, 0, c[2] - 10], 2.4, [-62, 128, c[2] - 10], 2.4, 'back'), P.cap('eq', [62, 0, c[2] - 10], 2.4, [62, 128, c[2] - 10], 2.4, 'back')])
            .concat(o.db ? [] : barProps(c, { half: 62, R: 13, th: 4.5 })),
          hot: o.hot(e),
        };
      },
      post: o.db ? (sc, pose, J) => dbPair(J, o.neutral ? 'z' : 'x') : null,
    };
  }
  const chestHot = (k) => (e) => [['chest', H(k, e)], ['triceps', H(0.35, e)], ['shoulders', H(0.3, e)]];
  S['dumbbell-bench-press'] = benchPress({ db: true, hot: chestHot(1) });
  S['incline-barbell-press'] = benchPress({ inc: 30, hot: (e) => [['chest', H(0.9, e)], ['shoulders', H(0.55, e)], ['triceps', H(0.35, e)]] });
  S['incline-dumbbell-press'] = benchPress({ inc: 30, db: true, hot: (e) => [['chest', H(0.9, e)], ['shoulders', H(0.55, e)], ['triceps', H(0.35, e)]] });
  S['decline-bench-press'] = benchPress({ inc: -14, hot: chestHot(1) });
  S['hex-press'] = benchPress({ db: true, neutral: true, hot: chestHot(1) });
  S['close-grip-bench-press'] = benchPress({ gx: 14, hot: (e) => [['triceps', H(1, e)], ['chest', H(0.55, e)], ['shoulders', H(0.3, e)]] });
  S['hex-press'].pose = ((f) => (p, e) => { const r = f(p, e), a1 = r.arm(1); r.arm = (s) => ({ W: [s * 9, a1.W[1], a1.W[2]], pole: [s * 0.3, -1, 0] }); return r; })(S['hex-press'].pose);

  S['machine-chest-press'] = {
    phases: PH('Press', 'Return', { d: [1.2, 0.5, 2.0, 0.4] }), cam: { S: 2.6, y0: 568 }, theta: -80, range: [-100, -10],
    pose(p, e) {
      const z = lerp(6, 50, p);
      return {
        H: [0, 56, 0], a: -4, leg: seatedLegs(40), sh: [0, lerp(0, 3, p)], barHands: true,
        arm: (s) => ({ W: [s * 24, 118, z], pole: [s * 0.7, -0.2, -1] }),
        props: X.seat(-24, 22).concat([X.backPad(-18, 44, 124), P.box('eq', -24, -19, 4, 170, -46, -38, 'back'), P.box('eq', 19, 24, 4, 170, -46, -38, 'back'), P.box('eq', -26, 26, 164, 170, -48, -36, 'back'), P.box('stk', -12, 12, 6, 52, -45, -39, 'back'), P.box('eq', -26, 26, 0, 4, -52, -30, 'back')]),
        hot: [['chest', H(1, e)], ['triceps', H(0.4, e)], ['shoulders', H(0.3, e)]],
      };
    },
    post: (sc, pose, J) => [1, -1].reduce((o, s) => { const W = J.side[s].W, L = s === 1 ? 'near' : 'far'; return o.concat([P.cap('eq2', add(W, [0, -6, 0]), 1.9, add(W, [0, 6, 0]), 1.9, L), P.cap('eq', add(W, [s * 2, 6, -2]), 2, [s * 24, 166, -40], 2, L)]); }, []),   // upright grips on levers hanging from the top of the frame
  };

  /* arm sweep in a plane: fly family */
  const sweep = (S0, d0, a0, a1, p, s, bend) => {
    const ph = lerp(a0, a1, p) * D2R, d = [s * Math.sin(ph), d0, Math.cos(ph)], E = add(S0, mul(norm(d), LEN.UA)), ph2 = ph - (bend || 0.15);
    return { E, W: add(E, mul(norm([s * Math.sin(ph2), d0, Math.cos(ph2)]), LEN.FA)) };
  };
  S['cable-fly'] = {
    phases: PH('Bring together', 'Open', { hold: 'Squeeze', d: [1.3, 0.6, 2.0, 0.4] }), cam: { S: 2.5, y0: 566 }, theta: -35, range: [-100, 20],
    pose(p, e) {
      return Object.assign({}, stand, {
        a: 12, leg: (s) => ({ A: [s * 12, ankleY(0), s === 1 ? 16 : -6], pole: [0, 0, 1], pitch: 0 }), barHands: false,
        arm: (s, Sh) => sweep(Sh, -0.08, 92, 6, p, s, 0.18),
        props: [-1, 1].reduce((a, s) => a.concat([P.box('eq', s * 76 - 4, s * 76 + 4, 0, 215, -6, 6, 'back'), P.ball('eq2', [s * 72, 205, 0], 5, 'back')]), []),
        hot: [['chest', H(1, e)], ['shoulders', H(0.3, e)]],
      });
    },
    post: (sc, pose, J) => [1, -1].reduce((a, s) => a.concat([P.ball('gbar', J.side[s].W, 2.6, s === 1 ? 'near' : 'far'), P.line('cable', [s * 72, 205, 0], J.side[s].W, 'back')]), []),
  };
  S['low-to-high-cable-fly'] = {
    phases: PH('Sweep up', 'Lower', { hold: 'Squeeze', d: [1.3, 0.6, 2.0, 0.4] }), cam: { S: 2.5, y0: 566 }, theta: -35, range: [-100, 20],
    pose(p, e) {
      return Object.assign({}, stand, {
        a: 10, leg: (s) => ({ A: [s * 12, ankleY(0), s === 1 ? 16 : -6], pole: [0, 0, 1], pitch: 0 }),
        arm: (s, Sh) => ({ W: [s * lerp(34, 7, p), lerp(92, 140, p), lerp(8, 44, p)], pole: [s * 0.6, -0.4, -0.6] }),
        props: [-1, 1].reduce((a, s) => a.concat([P.box('eq', s * 76 - 4, s * 76 + 4, 0, 215, -6, 6, 'back'), P.ball('eq2', [s * 72, 14, 0], 5, 'back')]), []),
        hot: [['chest', H(1, e)], ['shoulders', H(0.45, e)]],
      });
    },
    post: (sc, pose, J) => [1, -1].reduce((a, s) => a.concat([P.ball('gbar', J.side[s].W, 2.6, s === 1 ? 'near' : 'far'), P.line('cable', [s * 72, 14, 0], J.side[s].W, 'back')]), []),
  };
  S['pec-deck'] = {
    phases: PH('Bring together', 'Open', { hold: 'Squeeze', d: [1.3, 0.6, 2.0, 0.4] }), cam: { S: 2.45, y0: 568 }, theta: -50, range: [-110, 10],
    pose(p, e) {
      return {
        H: [0, 56, 0], a: -2, leg: seatedLegs(38), sh: [0, 0],
        arm: (s, Sh) => sweep(Sh, -0.02, 88, 8, p, s, 0.1),
        props: X.seat(-22, 22).concat([X.backPad(-18, 44, 124), P.box('eq', -4, 4, 4, 150, -30, -22, 'back'), P.box('eq', -26, 26, 146, 152, -34, -18, 'back'), P.box('stk', -12, 12, 6, 50, -46, -38, 'back'), P.box('eq', -16, 16, 0, 4, -50, -16, 'back')]),
        hot: [['chest', H(1, e)], ['shoulders', H(0.25, e)]],
      };
    },
    post: (sc, pose, J) => [1, -1].reduce((o, s) => { const W = J.side[s].W, L = s === 1 ? 'near' : 'far'; return o.concat([P.cap('pad', add(W, [0, -14, -2]), 3.4, add(W, [0, 8, -2]), 3.4, L), P.cap('eq', add(W, [0, 8, -2]), 1.8, [s * 20, 148, -24], 1.8, L)]); }, []),   // vertical arm pads on levers that swing from above the shoulders
  };

  /* ---------- dips ---------- */
  const dipLegs = (s, hip) => { const K = add(hip, mul(dirYZ(-6), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(-96), LEN.SHIN)), pitch: -40 }; };
  const dip = (o) => ({
    phases: [{ name: 'Lower', dur: 1.7, from: 0, to: 1, e: [0.4, 0.6] }, { name: 'Bottom', dur: 0.3, from: 1, to: 1, e: [0.6, 0.7] }, { name: 'Press up', dur: 1.2, from: 1, to: 0, e: [0.7, 1] }, { name: 'Lockout', dur: 0.4, from: 0, to: 0, e: [1, 0.4] }],
    cam: { S: 2.4, y0: 566 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 50, rz: 50 },
    pose(p, e) {
      const a = o.lean, ar = a * D2R, Ty = lerp(172, 138, p), T = [0, Ty, 1];
      const Hh = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H: Hh, a, barHands: true, sh: [0, 0], leg: dipLegs,
        arm: (s) => ({ W: [s * 23, 118, 2], pole: [s * 0.3, -0.5, -1] }),
        props: [-1, 1].reduce((a2, s) => a2.concat([P.cap('eq', [s * 23, 118, -26], 2.2, [s * 23, 118, 30], 2.2, 'back'), P.cap('eq', [s * 23, 0, -26], 2.4, [s * 23, 118, -26], 2.4, 'back'), P.cap('eq', [s * 23, 0, 30], 2.4, [s * 23, 118, 30], 2.4, 'back')]), []),
        hot: o.hot(e),
      };
    },
  });
  S['chest-dip'] = dip({ lean: 24, hot: (e) => [['chest', H(1, e)], ['triceps', H(0.6, e)], ['shoulders', H(0.35, e)]] });
  S['parallel-bar-dip'] = dip({ lean: 4, hot: (e) => [['triceps', H(1, e)], ['chest', H(0.6, e)], ['shoulders', H(0.35, e)]] });
  S['machine-dip'] = {
    phases: PH('Press down', 'Return', { d: [1.2, 0.5, 2.0, 0.4] }), cam: { S: 2.6, y0: 568 }, theta: -85, range: [-100, -10],
    pose(p, e) {
      return {
        H: [0, 56, 0], a: 0, leg: seatedLegs(40), barHands: true, sh: [0, 0],
        arm: (s) => ({ W: [s * 22, lerp(106, 66, p), 12], pole: [s * 0.4, -0.2, -1] }),
        props: X.seat(-24, 22).concat([X.backPad(-18, 44, 124), P.box('eq', -3, 3, 60, 110, 8, 16, 'back')]),
        hot: [['triceps', H(1, e)], ['chest', H(0.35, e)]],
      };
    },
    post: (sc, pose, J) => [1, -1].map((s) => P.cap('gbar', add(J.side[s].W, [0, 0, -4]), 1.8, add(J.side[s].W, [0, 0, 4]), 1.8, s === 1 ? 'near' : 'far')),
  };
  S['bench-dip'] = {
    phases: [{ name: 'Lower', dur: 1.6, from: 0, to: 1, e: [0.4, 0.6] }, { name: 'Bottom', dur: 0.3, from: 1, to: 1, e: [0.6, 0.7] }, { name: 'Press up', dur: 1.2, from: 1, to: 0, e: [0.7, 1] }, { name: 'Lockout', dur: 0.4, from: 0, to: 0, e: [1, 0.4] }],
    cam: { S: 2.8, y0: 540, dx: 10 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, 20], rx: 60, rz: 90 },
    pose(p, e) {
      const a = -14, ar = a * D2R, Ty = lerp(96, 72, p), T = [0, Ty, -20], Hh = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H: Hh, a, barHands: false, sh: [0, 0], leg: (s) => ({ A: [s * 10, ankleY(0), 62], pole: [0, 1, 0], pitch: 0 }),
        arm: (s) => ({ W: [s * 17, 46, -27], pole: [s * 0.2, 0, 1] }),
        props: [P.box('eq', -22, 22, 38, 44, -62, -22, 'back'), P.box('eq', -18, 18, 0, 38, -58, -52, 'back'), P.box('eq', -18, 18, 0, 38, -32, -26, 'back')],
        hot: [['triceps', H(1, e)], ['chest', H(0.3, e)], ['shoulders', H(0.3, e)]],
      };
    },
  };

  /* ---------- triceps on a bench / bent over ---------- */
  S['skull-crusher'] = {
    phases: [{ name: 'Lower to head', dur: 1.8, from: 0, to: 1, e: [0.35, 0.8] }, { name: 'Pause', dur: 0.4, from: 1, to: 1, e: [0.8, 0.8] }, { name: 'Extend', dur: 1.3, from: 1, to: 0, e: [0.8, 1] }, { name: 'Lockout', dur: 0.4, from: 0, to: 0, e: [1, 0.4] }],
    cam: { S: 3.1, y0: 500, dx: -20 }, theta: -70, range: [-100, -20], shadow: { c: [0, 0, -5], rx: 70, rz: 95 },
    pose(p, e) {
      const T = [0, 56, -50];
      return {
        H: [0, 56, 0], a: -90, barHands: true, sh: [0, 0], leg: (s) => ({ A: [s * 21, ankleY(0), 40], pole: [0, 1, 0.1], pitch: 0 }),
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(lerp(181, 196, p)), LEN.UA)); return { E, W: add(E, mul(dirYZ(lerp(181, 252, p)), LEN.FA)) }; },
        props: [P.box('eq', -17, 17, 38, 44, -88, 22, 'back'), P.box('eq', -3, 3, 0, 38, -78, -72, 'back'), P.box('eq', -3, 3, 0, 38, 8, 14, 'back'), P.box('eq', -3, 3, 0, 4, -92, -60, 'back'), P.box('eq', -3, 3, 0, 4, -4, 28, 'back')],
        hot: [['triceps', H(1, e)]],
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return barProps([0, W[1], W[2]], { half: 34, R: 8.5, th: 3.6 }); },
  };
  S['dumbbell-triceps-kickback'] = {
    phases: PH('Extend back', 'Return', { d: [1.2, 0.6, 2.0, 0.4] }), cam: { S: 2.6, y0: 548 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = 66;
      return {
        H: [0, 82, -22], a, sh: [0, 0], leg: (s) => ({ A: [s * 14, ankleY(0), s === 1 ? 6 : -10], pole: [0, 0.3, 1], pitch: 0 }),
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(-84), LEN.UA)); return { E, W: add(E, mul(dirYZ(lerp(-2, -86, p)), LEN.FA)) }; },
        hot: [['triceps', H(1, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };
})(typeof window !== 'undefined' ? window : globalThis);
