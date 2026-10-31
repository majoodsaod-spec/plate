/* Plate: more exercise demos, batch F (hinges, deadlifts, glutes, lower back). */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const { PH, H, seat, seatedLegs, dbPair, stand, stdLegs, barProps, tower } = X;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DL_PH = [{ name: 'Lift', dur: 1.7, from: 1, to: 0, e: [0.6, 1] }, { name: 'Lockout', dur: 0.6, from: 0, to: 0, e: [1, 1] }, { name: 'Lower', dur: 2.0, from: 0, to: 1, e: [0.8, 0.5] }, { name: 'Reset', dur: 0.5, from: 1, to: 1, e: [0.5, 0.5] }];
  const HING_PH = [{ name: 'Hinge', dur: 1.9, from: 0, to: 1, e: [0.35, 0.7] }, { name: 'Stretch', dur: 0.4, from: 1, to: 1, e: [0.7, 0.8] }, { name: 'Stand tall', dur: 1.5, from: 1, to: 0, e: [0.85, 1] }, { name: 'Squeeze', dur: 0.4, from: 0, to: 0, e: [1, 0.3] }];

  /* floor pulls: bar straight under the shoulders */
  const pull = (o) => ({
    phases: DL_PH, cam: { S: 2.5, y0: 566 }, theta: o.theta || -90, range: [-110, -10],
    pose(p, e) {
      const by = lerp(88, o.lo || 27, p), a = lerp(2, o.a1 || 48, p), ar = a * D2R, T = [0, by + 53, 3];
      const Hh = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50)), sw = o.wide ? 30 : 17;
      return {
        H: Hh, a, barHands: true, sh: [0, 0],
        leg: (s) => ({ A: [s * sw, ankleY(0), 2], pole: [s * (o.wide ? 0.8 : 0.15), 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * (o.wide ? 11 : 21), by, 3], pole: [0, -0.2, -1] }),
        props: barProps([0, by, 3], { half: 62, R: 15, th: 4.5 }).concat(o.rack ? [-1, 1].map((s) => P.box('eq', s * 70 - 4, s * 70 + 4, 0, o.rackY, -4, 10, 'back')) : []),
        hot: [['glutes', H(0.9, e)], ['hamstrings', H(0.9, e)], ['lowerback', H(0.8, e)], ['quads', H(o.rack ? 0.3 : 0.6, e)], ['traps', H(0.5, e)]],
      };
    },
  });
  S['deadlift'] = pull({});
  S['rack-pull'] = pull({ lo: 52, a1: 34, rack: true, rackY: 46 });
  S['sumo-deadlift'] = pull({ wide: true, a1: 36, theta: -50 });
  S['stiff-leg-deadlift'] = Object.assign({}, S['romanian-deadlift'], { pose: (p, e) => { const r = S['romanian-deadlift'].pose(p, e); r.leg = (s) => ({ A: [s * 13, ankleY(0), 0], pole: [0, 0, 1], pitch: 0 }); r.hot = [['hamstrings', H(1, e)], ['lowerback', H(0.45, e)], ['glutes', H(0.45, e)]]; return r; } });

  /* bar on the back */
  const goodMorning = (seated) => ({
    phases: HING_PH, cam: { S: 2.6, y0: seated ? 548 : 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(3, seated ? 62 : 74, p), ar = a * D2R, Hh = seated ? [0, 50, 0] : [0, lerp(91, 84, p), -lerp(0, 32, p)];
      const bar = add(add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 48)), mul([0, -Math.sin(ar), Math.cos(ar)], -9));
      return {
        H: Hh, a, barHands: true, sh: [0, 0],
        leg: seated ? seatedLegs(40) : (s) => ({ A: [s * 14, ankleY(0), 0], pole: [0, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 38, bar[1] - 1, bar[2] - 1], pole: [0, -1, -0.45] }),
        props: barProps(bar, { half: 62, R: 13, th: 4.5 }).concat(seated ? seat(-20, 16) : []),
        hot: [['hamstrings', H(seated ? 0.5 : 0.9, e)], ['lowerback', H(1, e)], ['glutes', H(0.7, e)]],
      };
    },
  });
  S['good-morning'] = goodMorning(false);
  S['seated-good-morning'] = goodMorning(true);

  S['kettlebell-swing'] = {
    phases: [{ name: 'Hike back', dur: 0.8, from: 0.0, to: 1, e: [0.5, 0.6] }, { name: 'Snap the hips', dur: 0.7, from: 1, to: 0, e: [0.9, 1] }, { name: 'Float', dur: 0.4, from: 0, to: 0, e: [0.7, 0.7] }, { name: 'Fall back', dur: 0.7, from: 0, to: 1, e: [0.6, 0.7] }],
    cam: { S: 2.5, y0: 566, dx: -6 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(2, 62, p), th = lerp(88, -28, p);
      return {
        H: [0, lerp(92, 78, p), -lerp(0, 30, p)], a, sh: [0, 0], leg: (s) => ({ A: [s * 17, ankleY(0), 0], pole: [s * 0.3, 0, 1], pitch: 0 }),
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(th), LEN.UA)); return { E, W: add(E, mul(dirYZ(th), LEN.FA)) }; },
        hot: [['glutes', H(1, e)], ['hamstrings', H(0.8, e)], ['lowerback', H(0.5, e)]],
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W, c = add(W, [0, -1, 7]); return [P.ball('eq2', add(c, [0, -8, 0]), 8.5, 'near'), P.cap('gbar', add(W, [-4, 0, 2]), 1.7, add(c, [-3, -3, 0]), 1.7, 'near'), P.cap('gbar', add(W, [4, 0, 2]), 1.7, add(c, [3, -3, 0]), 1.7, 'near')]; },
  };
  S['cable-pull-through'] = {
    phases: HING_PH, cam: { S: 2.6, y0: 566, dx: 4 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(4, 62, p), th = lerp(10, -36, p);
      return {
        H: [0, lerp(91, 82, p), -lerp(0, 28, p)], a, sh: [0, 0], leg: (s) => ({ A: [s * 17, ankleY(0), 0], pole: [s * 0.3, 0, 1], pitch: 0 }),
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(th), LEN.UA)); return { E, W: add(E, mul(dirYZ(th), LEN.FA)) }; },
        props: [P.box('eq', -24, 24, 0, 6, -92, -76, 'back'), P.box('eq', -22, 22, 6, 150, -88, -80, 'back'), P.ball('eq2', [0, 14, -80], 5, 'back')],
        hot: [['glutes', H(1, e)], ['hamstrings', H(0.7, e)], ['lowerback', H(0.3, e)]],
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W, m = [0, W[1] - 1, W[2] - 1]; return [P.line('cable', [0, 14, -80], m, 'back'), P.ball('gbar', m, 2.8, 'near')]; },
  };

  /* ---------- 45 degree and reverse hyper ---------- */
  const hyper = (o) => ({
    phases: PH('Rise', 'Lower', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.45, y0: 556, dx: 8 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(128, o.top || 46, p), ar = a * D2R, Hh = [0, 84, 0], T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ A: [s * 12, 84 - 60, -60], pole: [0, 1, 0], pitch: -60 }),
        arm: (s) => o.hold ? { W: [s * 6, T[1] - 4, T[2] + 8], pole: [s * 0.4, -1, 0.2] } : { W: [s * 5, T[1] - 6, T[2] + 8], pole: [s * 0.6, -1, 0.3] },
        props: [P.slab('eq', [0, 76, 10], [0, 44, -22], 34, 8, 'back'), P.slab('eq', [0, 44, -48], [0, 20, -72], 24, 7, 'back'), P.cap('eq', [0, 70, 2], 2.4, [0, 0, 20], 2.4, 'back'), P.cap('eq', [0, 30, -50], 2.4, [0, 0, -70], 2.4, 'back'), P.box('eq', -22, 22, 0, 3, -90, 40, 'back')],
        hot: o.hot(e),
      };
    },
    post: o.hold ? (sc, pose, J) => [P.disc('eq2', add(J.T, [0, 3, 9]), 'x', 11, 4, 'near')] : null,
  });
  S['back-extension'] = hyper({ hot: (e) => [['lowerback', H(1, e)], ['glutes', H(0.6, e)], ['hamstrings', H(0.5, e)]], top: 44 });
  S['45-degree-hip-extension'] = hyper({ hot: (e) => [['glutes', H(1, e)], ['hamstrings', H(0.7, e)], ['lowerback', H(0.4, e)]], top: 52 });
  S['hyperextension-weighted'] = hyper({ hot: (e) => [['lowerback', H(1, e)], ['glutes', H(0.6, e)], ['hamstrings', H(0.5, e)]], top: 44, hold: true });
  S['hip-hinge-back-ext'] = S['hyperextension-weighted'];
  S['reverse-hyper'] = {
    phases: PH('Swing up', 'Lower', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.5, y0: 540, dx: -4 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const ph = lerp(6, 84, p);
      return {
        H: [0, 98, 0], a: 90, sh: [0, 0], barHands: false,
        leg: (s, hip) => { const K = add(hip, mul(dirYZ(-ph), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(-ph - 4), LEN.SHIN)), pitch: -20 }; },
        arm: (s) => ({ W: [s * 20, 84, 56], pole: [s * 0.3, -1, 0] }),
        props: [P.box('eq', -17, 17, 82, 90, -6, 74, 'back'), P.box('eq', -3, 3, 0, 82, 60, 66, 'back'), P.box('eq', -3, 3, 0, 82, -2, 4, 'back'), P.box('eq', -22, 22, 0, 3, -12, 80, 'back')],
        hot: [['glutes', H(1, e)], ['hamstrings', H(0.7, e)], ['lowerback', H(0.7, e)]],
      };
    },
  };
  /* ---------- nordic and GHD ---------- */
  const nordic = (o) => ({
    phases: [{ name: 'Lower under control', dur: 2.2, from: 0, to: 1, e: [0.5, 1] }, { name: 'Catch', dur: 0.4, from: 1, to: 1, e: [1, 1] }, { name: 'Pull back up', dur: 1.8, from: 1, to: 0, e: [1, 0.5] }, { name: 'Upright', dur: 0.4, from: 0, to: 0, e: [0.4, 0.4] }],
    cam: { S: 2.15, y0: 566, dx: 22 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(2, 76, p), ar = a * D2R, K = [0, 8, 0], u = [0, Math.cos(ar), Math.sin(ar)], Hh = add(K, mul(u, 42)), T = add(Hh, mul(u, 50)), q = clamp((a - 30) / 40, 0, 1);
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ K: [s * 10, 8, 0], A: [s * 10, 6, -38], pitch: -80 }),
        arm: (s) => ({ W: [s * lerp(8, 20, q), lerp(T[1] - 14, 4, q), lerp(T[2] + 10, T[2] + 14, q)], pole: [s * 0.4, -0.5, 0.3] }),
        props: [P.box('eq', -22, 22, 0, 4, -50, 14, 'back'), P.box('eq', -22, 22, 4, 14, -52, -34, 'back'), P.box('eq', -4, 4, 0, 4, -52, -20, 'back')].concat(o.ghd ? [P.slab('eq', [0, 22, -4], [0, 22, 16], 40, 8, 'back'), P.box('eq', -3, 3, 0, 20, 4, 8, 'back')] : []),
        hot: [['hamstrings', H(1, e)], ['glutes', H(0.4, e)], ['calves', H(0.3, e)]],
      };
    },
  });
  S['nordic-curl'] = nordic({});
  S['glute-ham-raise'] = nordic({ ghd: true });

  /* ---------- glutes on the floor and with cables ---------- */
  S['glute-bridge'] = {
    phases: PH('Drive up', 'Lower', { d: [1.2, 0.7, 1.8, 0.4], hold: 'Squeeze' }), cam: { S: 3.0, y0: 520, dx: -10 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, -10], rx: 60, rz: 90 },
    pose(p, e) {
      const a = lerp(-92, -130, p), ar = a * D2R, T = [0, 11, -56], Hh = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ A: [s * 16, ankleY(0), Hh[2] + 40], pole: [0, 1, 0.2], pitch: 0 }),
        arm: (s, Sh) => ({ W: [s * 30, 3, Sh[2] + 30], pole: [s * 0.3, 0.5, 0] }),
        hot: [['glutes', H(1, e)], ['hamstrings', H(0.4, e)]],
      };
    },
  };
  S['smith-hip-thrust'] = Object.assign({}, S['hip-thrust'], {
    pose: (p, e) => { const r = S['hip-thrust'].pose(p, e); const g = r.props.find((q) => q.cls === 'gbar' && q.t === 'cap'), bar = g ? [0, (g.a[1] + g.b[1]) / 2, (g.a[2] + g.b[2]) / 2] : null; r.props = r.props.concat(R.X.smithFrame ? R.X.smithFrame(bar) : []); return r; },
  });
  S['cable-kickback'] = {
    phases: PH('Kick back', 'Return', { d: [1.2, 0.7, 1.9, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 560, dx: 8 }, theta: -88, range: [-100, -20],
    pose(p, e) {
      const th = lerp(8, -34, p);
      return {
        H: [0, 90, -4], a: 24, sh: [0, 0],
        leg: (s, hip) => s === 1 ? { A: add(hip, mul(dirYZ(th), 83)), pole: [0, 0, 1], pitch: -10 } : { A: [-12, ankleY(0), 4], pole: [0, 0, 1], pitch: 0 },
        arm: (s) => ({ W: [s * 10, 118, 52], pole: [s * 0.3, -1, -0.3] }),
        props: [P.box('eq', -24, 24, 0, 6, 54, 70, 'back'), P.box('eq', -22, 22, 6, 150, 58, 66, 'back'), P.ball('eq2', [0, 14, 56], 5, 'back')],
        hot: [['glutes', H(1, e), 1], ['hamstrings', H(0.3, e)]],
      };
    },
    post: (sc, pose, J) => { const a = J.side[1].ankle; return [P.line('cable', [0, 14, 56], a, 'back'), P.cap('eq2', add(a, [-4, 1, 0]), 3, add(a, [4, 1, 0]), 3, 'near')]; },
  };
  S['bird-dog'] = {
    phases: PH('Reach long', 'Return', { d: [1.4, 1.0, 1.6, 0.4], hold: 'Hold' }), cam: { S: 2.3, y0: 540, dx: -20 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const Hh = [0, 50, -28];
      return {
        H: Hh, a: 88, sh: [0, 0], head: null,
        leg: (s, hip) => s === -1 ? (() => { const K = add(hip, mul(dirYZ(lerp(0, -90, p)), LEN.THIGH)); return { K, A: add(K, [0, -0.5 * (1 - p), -LEN.SHIN]), pitch: -30 }; })() : { K: [10, 8, Hh[2]], A: [10, 6, Hh[2] - 44], pitch: -80 },
        arm: (s, Sh) => s === 1 ? { W: [10, lerp(3, Sh[1], p), lerp(Sh[2], Sh[2] + 56, p)], pole: [0.3, 1, 0] } : { W: [-14, 3, Sh[2]], pole: [-0.3, 0, -1] },
        props: [P.box('eq', -30, 30, 0, 1.5, -100, 90, 'back')],
        hot: [['lowerback', H(0.8, e)], ['glutes', H(0.9, e), -1], ['midback', H(0.4, e)]],
      };
    },
  };
  S['superman'] = {
    phases: PH('Lift', 'Lower', { d: [1.3, 1.0, 1.8, 0.4], hold: 'Hold' }), cam: { S: 2.0, y0: 540, dx: 0 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 50, rz: 100 },
    pose(p, e) {
      const a = lerp(89, 74, p);
      return {
        H: [0, 13, -42], a, sh: [0, 0], head: null,
        leg: (s, hip) => ({ A: add(hip, [0, lerp(-5, 12, p), -83]), pole: [0, 1, 0], pitch: -20 }),
        arm: (s, Sh) => ({ W: [s * 9, Sh[1] + lerp(-6, 2, p), Sh[2] + 54], pole: [s * 0.3, 1, 0] }),
        props: [P.box('eq', -34, 34, 0, 1.5, -110, 100, 'back')],
        hot: [['lowerback', H(1, e)], ['glutes', H(0.7, e)]],
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
