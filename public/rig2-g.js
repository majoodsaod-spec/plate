/* Plate: more exercise demos, batch G (core, seated curls, hanging work). */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const { PH, H, seat, seatedLegs, dbPair, stand, stdLegs, barProps, tower } = X;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hangBars = [P.cap('gbar', [-52, 222, 2], 2.0, [52, 222, 2], 2.0, 'near'), P.cap('eq', [-60, 0, 2], 2.6, [-60, 222, 2], 2.6, 'back'), P.cap('eq', [60, 0, 2], 2.6, [60, 222, 2], 2.6, 'back')];
  const floor = (z0, z1, w) => P.box('eq', -(w || 40), w || 40, 0, 1.5, z0, z1, 'back');

  /* ---------- seated curls ---------- */
  S['preacher-curl'] = {
    phases: PH('Curl', 'Lower'), cam: { S: 2.8, y0: 556, dx: 6 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      return {
        H: [0, 52, -6], a: 8, sh: [0, 0], leg: seatedLegs(36), barHands: true,
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(36), LEN.UA)); return { E, W: add(E, mul(dirYZ(lerp(40, 168, p)), LEN.FA)) }; },
        props: seat(-26, 10).concat([P.slab('eq', [0, 108, 8], [0, 62, 38], 40, 8, 'back'), P.box('eq', -4, 4, 0, 62, 34, 40, 'back')]),
        hot: [['biceps', H(1, e)], ['forearms', H(0.25, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };
  S['incline-dumbbell-curl'] = {
    phases: PH('Curl', 'Lower'), cam: { S: 2.7, y0: 540, dx: -4 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const a = -36, ar = a * D2R, Hh = [0, 54, -10], u = [0, Math.cos(ar), Math.sin(ar)], zx = [0, -Math.sin(ar), Math.cos(ar)];
      return {
        H: Hh, a, sh: [0, -2], leg: seatedLegs(32),
        arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(-8), LEN.UA)); return { E, W: add(E, mul(dirYZ(-8 + lerp(6, 140, p)), LEN.FA)) }; },
        props: seat(-24, 12).concat([P.slab('eq', add(Hh, add(mul(u, -8), mul(zx, -8))), add(Hh, add(mul(u, 72), mul(zx, -8))), 34, 8, 'back')]),
        hot: [['biceps', H(1, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };
  S['concentration-curl'] = {
    phases: PH('Curl', 'Lower'), cam: { S: 2.75, y0: 540, dx: 0 }, theta: -50, range: [-100, -10],
    pose(p, e) {
      const a = 48, Hh = [0, 52, -4];
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ A: [s * 26, ankleY(0), 34], pole: [s * 0.8, 1, 0.3], pitch: 0 }),
        arm: (s, Sh) => s === 1 ? { E: add(Sh, mul(dirYZ(4), LEN.UA)), W: null } : { W: [-20, 64, 24], pole: [-0.3, -1, 0] },
        props: seat(-24, 12), hot: [['biceps', H(1, e)]],
      };
    },
  };
  S['concentration-curl'].pose = ((f) => (p, e) => {
    const r = f(p, e); const arm = r.arm;
    r.arm = (s, Sh) => { if (s !== 1) return arm(s, Sh); const E = add(Sh, mul(dirYZ(8), LEN.UA)); return { E, W: add(E, mul(dirYZ(8 + lerp(6, 138, p)), LEN.FA)) }; };
    return r;
  })(S['concentration-curl'].pose);
  S['concentration-curl'].post = (sc, pose, J) => P.dumbbell(J.side[1].W, 'z', 'near');

  /* ---------- hanging core ---------- */
  const hangLeg = (o) => ({
    phases: PH('Raise', 'Lower', { d: [1.4, 0.5, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.38, y0: 578 }, theta: -80, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 60, rz: 44 },
    pose(p, e) {
      const a = lerp(-4, -16, p), ar = a * D2R, T = [0, 168, 0], Hh = sub(T, mul([0, Math.cos(ar), Math.sin(ar)], 50)), t = lerp(6, o.top || 92, p), k = o.straight ? lerp(3, 6, p) : lerp(22, 98, p), lat = o.side ? lerp(0, 16, p) : 0;
      return {
        H: Hh, a, barHands: true, roll: o.side ? lerp(0, 14, p) : 0,
        arm: (s) => ({ W: [s * 36, 222, 2], pole: [s * 0.2, -0.5, -0.3] }),
        leg: (s, hip) => { const K = add(hip, add(mul(dirYZ(t), LEN.THIGH), [-lat, 0, 0])); return { K, A: add(K, mul(dirYZ(t - k), LEN.SHIN)), pitch: -50 }; },
        props: hangBars, hot: o.side ? [['obliques', H(1, e)], ['abs', H(0.6, e)]] : [['abs', H(1, e)]],
      };
    },
  });
  S['hanging-leg-raise'] = hangLeg({ straight: true, top: 84 });
  S['hanging-leg-raise-straight'] = hangLeg({ straight: true, top: 92 });
  S['hanging-oblique-knee-raise'] = hangLeg({ side: true, top: 100 });

  /* ---------- floor core ---------- */
  const plankBase = (al) => { const r = al * D2R, d = [0, Math.sin(r), Math.cos(r)], O = [0, 14.6, -126], Hh = add(O, mul(d, 85.5)); return { O, H: Hh, a: 90 - al }; };
  S['plank'] = {
    phases: [{ name: 'Set the plank', dur: 1.4, from: 0, to: 1, e: [0.5, 0.9] }, { name: 'Brace and breathe', dur: 3.0, from: 1, to: 1, e: [0.9, 1] }, { name: 'Release', dur: 1.2, from: 1, to: 0, e: [0.8, 0.4] }, { name: 'Rest', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.3, y0: 440, dx: -42 }, theta: -90, range: [-100, -30], shadow: { c: [0, 0, -50], rx: 40, rz: 105 },
    pose(p, e) {
      const b = plankBase(lerp(9, 7.5, p));
      return {
        H: b.H, a: b.a, sh: [0, 0], head: null, leg: (s) => ({ A: [s * 10, b.O[1], b.O[2]], pole: [0, 0.3, -1], pitch: -76 }),
        arm: (s, Sh) => ({ E: [s * 18, 4, Sh[2]], W: [s * 11, 3, Sh[2] + 27] }),
        props: [floor(-140, 60, 40)], hot: [['abs', H(1, e)], ['obliques', H(0.6, e)], ['lowerback', H(0.4, e)]],
      };
    },
  };
  S['sphinx-push-up'] = {
    phases: PH('Press up to the hands', 'Lower to the elbows', { d: [1.6, 0.4, 1.8, 0.4] }), cam: { S: 2.3, y0: 440, dx: -42 }, theta: -90, range: [-100, -30], shadow: { c: [0, 0, -50], rx: 40, rz: 105 },
    pose(p, e) {
      const b = plankBase(lerp(9, 18, p));
      return {
        H: b.H, a: b.a, sh: [0, 0], head: null, leg: (s) => ({ A: [s * 10, b.O[1], b.O[2]], pole: [0, 0.3, -1], pitch: -76 }),
        arm: (s, Sh) => ({ W: [s * 14, 3, Sh[2] + lerp(27, 2, p)], pole: [s * 0.2, 0.3, -1] }),
        props: [floor(-140, 60, 40)], hot: [['triceps', H(1, e)], ['chest', H(0.4, e)], ['abs', H(0.5, e)]],
      };
    },
  };
  S['side-plank'] = {
    phases: [{ name: 'Set the side plank', dur: 1.4, from: 0, to: 1, e: [0.5, 0.9] }, { name: 'Hold the line', dur: 3.0, from: 1, to: 1, e: [0.9, 1] }, { name: 'Release', dur: 1.2, from: 1, to: 0, e: [0.8, 0.4] }, { name: 'Rest', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.3, y0: 540, dx: -4 }, theta: -80, range: [-120, -40], shadow: { c: [0, 0, 0], rx: 40, rz: 100 },
    pose(p, e) {
      const hy = lerp(14, 36, p);
      return {
        H: [0, hy, 0], a: lerp(-90, -74, p), roll: 90, sh: [0, 0],
        leg: (s, hip) => s === 1 ? { A: [hip[0], 7.6, 80], pole: [0, 1, 0], pitch: 0 } : { A: [hip[0], 18, 82], pole: [0, 1, 0], pitch: 0 },
        arm: (s, Sh) => s === 1 ? { W: [Sh[0] + 12, 3, Sh[2] - 22], pole: [0, -1, 0.2] } : { W: add(Sh, [4, 52, 0]), pole: [0, 1, 0] },
        props: [floor(-90, 125, 40)], hot: [['obliques', H(1, e)], ['abs', H(0.4, e)], ['abductors', H(0.4, e), -1]],
      };
    },
  };
  S['mountain-climber'] = {
    phases: [{ name: 'Drive right knee', dur: 0.8, from: 0, to: 1, e: [0.8, 0.9], lin: true }, { name: 'Drive left knee', dur: 0.8, from: 1, to: 2, e: [0.8, 0.9], lin: true }, { name: 'Drive right knee', dur: 0.8, from: 2, to: 3, e: [0.8, 0.9], lin: true }, { name: 'Drive left knee', dur: 0.8, from: 3, to: 4, e: [0.8, 0.9], lin: true }],
    cam: { S: 2.3, y0: 440, dx: -42 }, theta: -90, range: [-100, -30], shadow: { c: [0, 0, -50], rx: 40, rz: 105 },
    pose(p, e) {
      const b = plankBase(22), m = Math.cos(Math.PI * p);
      return {
        H: b.H, a: b.a, sh: [0, 0], head: null,
        leg: (s, hip) => { const f = s === 1 ? (1 + m) / 2 : (1 - m) / 2; const K = add(hip, mul(dirYZ(lerp(-74, 78, f)), LEN.THIGH)); return { K, A: s === 1 && f < 0.02 ? [10, b.O[1], b.O[2]] : add(K, mul(dirYZ(lerp(-74, -8, f)), LEN.SHIN)), pitch: -70 }; },
        arm: (s) => ({ W: [s * 23, 3, 2], pole: [s * 0.6, 0.2, -1] }),
        props: [floor(-140, 60, 40)], hot: [['abs', H(1, e)], ['obliques', H(0.6, e)], ['shoulders', H(0.4, e)]],
      };
    },
  };
  S['ab-wheel-rollout'] = {
    phases: PH('Roll out', 'Pull back in', { d: [1.9, 0.5, 1.8, 0.4], hold: 'Hold' }), cam: { S: 1.95, y0: 540, dx: 48 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const th = lerp(6, 78, p), thr = th * D2R, K = [0, 8, 0], Hh = add(K, mul([0, Math.cos(thr), Math.sin(thr)], 42)), a = lerp(64, 86, p), ar = a * D2R;
      const T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ K: [s * 10, 8, 0], A: [s * 10, 6, -38], pitch: -80 }),
        arm: (s) => ({ W: [s * 9, 7, T[2] + 6], pole: [s * 0.3, 0.5, -1] }),
        props: [floor(-60, 140, 30)], hot: [['abs', H(1, e)], ['lats', H(0.4, e)], ['obliques', H(0.4, e)]],
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return [P.cap('gbar', [-9, 8, W[2]], 1.6, [9, 8, W[2]], 1.6, 'near'), P.disc('eq2', [0, 8, W[2]], 'x', 8, 5, 'near')]; },
  };
  S['cable-crunch'] = {
    phases: PH('Crunch down', 'Return', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.4, y0: 566, dx: 6 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const a = lerp(8, 66, p), ar = a * D2R, Hh = [0, 50, -8], T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50)), c = add(T, [0, 10, 8]);
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ K: [s * 10, 8, Hh[2] + 2], A: [s * 10, 6, Hh[2] - 38], pitch: -80 }),
        arm: (s) => ({ W: [s * 7, c[1], c[2]], pole: [s * 0.6, 1, 0.2] }),
        props: [P.box('eq', -24, 24, 0, 6, 56, 72, 'back'), P.box('eq', -22, 22, 6, 240, 60, 68, 'back'), P.ball('eq2', [0, 222, 62], 5, 'back'), floor(-60, 60, 30)],
        hot: [['abs', H(1, e)]],
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W, m = [0, W[1] + 1, W[2] + 1]; return [P.line('cable', [0, 222, 60], m, 'back'), P.cap('gbar', add(m, [-9, 0, 0]), 1.3, add(m, [9, 0, 0]), 1.3, 'near')]; },
  };
  S['ab-machine-crunch'] = {
    phases: PH('Crunch', 'Return', { d: [1.4, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 548 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const a = lerp(-4, 32, p), ar = a * D2R, Hh = [0, 52, 0], T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      return {
        H: Hh, a, sh: [0, 0], leg: seatedLegs(38), barHands: false,
        arm: (s) => ({ W: [s * 14, T[1] + 4, T[2] + 12], pole: [s * 0.6, 1, 0.2] }),
        props: seat(-22, 14).concat([P.box('eq', -17, 17, 52, 130, -28, -22, 'back'), P.box('eq', -17, 17, T[1] - 4, T[1] + 6, T[2] + 8, T[2] + 16, 'back'), P.box('eq', -3, 3, 90, 150, 24, 30, 'back')]),
        hot: [['abs', H(1, e)], ['obliques', H(0.3, e)]],
      };
    },
  };
  /* lying on the floor */
  const legsTable = (s, hip, t) => { const K = add(hip, mul(dirYZ(t), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(t - 100), LEN.SHIN)), pitch: 10 }; };
  S['reverse-crunch'] = {
    phases: PH('Curl hips up', 'Lower', { d: [1.4, 0.5, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 3.0, y0: 520, dx: -10 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 50, rz: 90 },
    pose(p, e) {
      return {
        H: [0, lerp(11, 22, p), 0], a: lerp(-90, -104, p), sh: [0, 0],
        leg: (s, hip) => legsTable(s, hip, lerp(128, 196, p)),
        arm: (s, Sh) => ({ W: [s * 22, 3, Sh[2] + 34], pole: [s * 0.3, 0.5, 0] }),
        props: [floor(-90, 100, 40)], hot: [['abs', H(1, e)]],
      };
    },
  };
  S['dead-bug'] = {
    phases: [{ name: 'Extend opposite arm and leg', dur: 1.5, from: 0, to: 1, e: [0.5, 0.9] }, { name: 'Return', dur: 1.4, from: 1, to: 0, e: [0.9, 0.5] }, { name: 'Switch sides', dur: 1.5, from: 0, to: -1, e: [0.5, 0.9] }, { name: 'Return', dur: 1.4, from: -1, to: 0, e: [0.9, 0.5] }],
    cam: { S: 3.0, y0: 520, dx: -10 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 50, rz: 90 },
    pose(p, e) {
      const ex = (side) => (p * side > 0 ? Math.abs(p) : 0);
      return {
        H: [0, 11, 0], a: -90, sh: [0, 0],
        leg: (s, hip) => { const f = ex(-s), t = lerp(180, 98, f), K = add(hip, mul(dirYZ(t), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(lerp(90, 98, f)), LEN.SHIN)), pitch: 5 }; },
        arm: (s, Sh) => { const f = ex(s), an = lerp(180, 262, f), E = add(Sh, mul(dirYZ(an), LEN.UA)); return { E, W: add(E, mul(dirYZ(an), LEN.FA)) }; },
        props: [floor(-90, 100, 40)], hot: [['abs', H(1, e)], ['obliques', H(0.4, e)]],
      };
    },
  };
  const bicycle = (slow) => ({
    phases: [{ name: 'Right elbow to left knee', dur: slow ? 2.4 : 1.1, from: 0, to: 1, e: [0.7, 0.8] }, { name: 'Left elbow to right knee', dur: slow ? 2.4 : 1.1, from: 1, to: 0, e: [0.7, 0.8] }],
    cam: { S: 3.0, y0: 520, dx: -10 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, 0], rx: 50, rz: 90 },
    pose(p, e) {
      const m = Math.cos(Math.PI * p);
      return {
        H: [0, 11, 0], a: -76, roll: 22 * m, sh: [0, 0],
        leg: (s, hip) => { const f = s === 1 ? (1 + m) / 2 : (1 - m) / 2, t = lerp(152, 98, f), K = add(hip, mul(dirYZ(t), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(lerp(t - 105, t, f)), LEN.SHIN)), pitch: 5 }; },
        arm: (s, Sh, J) => ({ W: add(add(J.T, mul(J.u, 18)), [s * 6, 3, 0]), pole: [s * 1, 0.3, 0] }),
        props: [floor(-90, 100, 40)], hot: [['abs', H(1, e)], ['obliques', H(0.9, e)]],
      };
    },
  });
  S['bicycle-crunch'] = bicycle(false);
  S['bicycle-crunch-slow'] = bicycle(true);
  const declineSit = (o) => ({
    phases: PH(o.full ? 'Sit all the way up' : 'Curl up', 'Lower', { d: [1.5, 0.5, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 540, dx: 4 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const a = lerp(-112, o.full ? 6 : -62, p), ar = a * D2R, Hh = [0, 50, 0], u = [0, Math.cos(ar), Math.sin(ar)], u0 = [0, Math.cos(-112 * D2R), Math.sin(-112 * D2R)];
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ A: [s * 12, 30, 40], pole: [0, 1, 0.1], pitch: 0 }),
        arm: (s, Sh, J) => ({ W: o.plate ? add(add(J.T, mul(J.zax, 10)), [s * 6, -6, 0]) : add(add(J.T, mul(J.u, 16)), [s * 8, 4, 0]), pole: [s * 1, 0.4, 0] }),
        props: [P.slab('eq', add(Hh, mul(u0, -10)), add(Hh, mul(u0, 88)), 34, 8, 'back'), P.box('eq', -3, 3, 0, 44, 22, 28, 'back'), P.box('eq', -14, 14, 24, 40, 36, 46, 'back'), P.box('eq', -3, 3, 0, 52, -16, -10, 'back')],
        hot: [['abs', H(1, e)]],
      };
    },
    post: o.plate ? (sc, pose, J) => [P.disc('eq2', add(J.T, add(mul(J.zax, 12), [0, -2, 0])), 'x', 10, 4, 'near')] : null,
  });
  S['decline-sit-up'] = declineSit({ full: true });
  S['decline-crunch'] = declineSit({ plate: true });
  S['russian-twist'] = {
    phases: [{ name: 'Twist left', dur: 1.0, from: 0, to: 1, e: [0.7, 0.8] }, { name: 'Twist right', dur: 1.6, from: 1, to: -1, e: [0.8, 0.8] }, { name: 'Twist left', dur: 1.6, from: -1, to: 1, e: [0.8, 0.8] }, { name: 'Centre', dur: 0.8, from: 1, to: 0, e: [0.7, 0.8] }],
    cam: { S: 2.8, y0: 540, dx: 0 }, theta: -35, range: [-100, 20], shadow: { c: [0, 0, 0], rx: 50, rz: 60 },
    pose(p, e) {
      return {
        H: [0, 11, 0], a: -34, roll: 38 * p, sh: [0, 0],
        leg: (s, hip) => { const K = add(hip, mul(dirYZ(124), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(40), LEN.SHIN)), pitch: 20 }; },
        arm: (s, Sh, J) => ({ W: add(add(J.T, mul(J.zax, 22)), [0, -20, 0]), pole: [s * 0.6, -1, 0.3] }),
        props: [floor(-60, 90, 40)], hot: [['obliques', H(1, e)], ['abs', H(0.7, e)]],
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return P.dumbbell(add(W, [-6, 0, 0]), 'x', 'near', 6.5); },
  };
  S['landmine-rotation'] = {
    phases: [{ name: 'Swing to the left', dur: 1.4, from: 0, to: 1, e: [0.6, 0.9] }, { name: 'Swing to the right', dur: 2.4, from: 1, to: -1, e: [0.9, 0.9] }, { name: 'Swing to the left', dur: 2.4, from: -1, to: 1, e: [0.9, 0.9] }, { name: 'Centre', dur: 1.0, from: 1, to: 0, e: [0.7, 0.8] }],
    cam: { S: 2.55, y0: 566 }, theta: -35, range: [-100, 20],
    pose(p, e) {
      return Object.assign({}, stand, {
        a: 4, roll: 34 * p, leg: (s) => ({ A: [s * 20, ankleY(0), 2], pole: [s * 0.4, 0, 1], pitch: 0 }),
        arm: (s, Sh, J) => ({ W: [p * 18 * 0 + J.T[0] + p * 20, 124 - Math.abs(p) * 6, 38], pole: [s * 0.5, -1, 0.3] }),
        props: [P.ball('eq2', [0, 5, 110], 6, 'back')], hot: [['obliques', H(1, e)], ['shoulders', H(0.3, e)]],
      });
    },
    post: (sc, pose, J) => { const W = J.side[1].W, W2 = J.side[-1].W, m = [(W[0] + W2[0]) / 2, W[1], W[2]]; return [P.cap('gbar', [0, 5, 110], 1.8, add(m, [0, 0, 10]), 1.8, 'near')]; },
  };
  S['pallof-press'] = {
    phases: PH('Press out', 'Bring in', { d: [1.4, 1.2, 1.8, 0.4], hold: 'Resist the pull' }), cam: { S: 2.6, y0: 566 }, theta: -50, range: [-110, 10],
    pose(p, e) {
      return Object.assign({}, stand, {
        a: 0, leg: (s) => ({ A: [s * 17, ankleY(0), 2], pole: [s * 0.2, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [3, 126, lerp(8, 50, p)], pole: [s * 0.8, -0.3, -0.4] }),
        props: [P.box('eq', 56, 104, 0, 5, -8, 8, 'back'), P.box('eq', 77, 83, 5, 232, -4, 4, 'back'), P.ball('eq2', [80, 126, 0], 5, 'back')],
        hot: [['obliques', H(1, e)], ['abs', H(0.7, e)]],
      });
    },
    post: (sc, pose, J) => { const W = J.side[1].W, m = [W[0] - 1, W[1], W[2] + 1]; return [P.line('cable', [80, 126, 0], m, 'back'), P.ball('gbar', m, 2.8, 'near')]; },
  };
  S['cable-woodchop'] = {
    phases: PH('Chop down and across', 'Return', { d: [1.2, 0.5, 2.0, 0.4], hold: 'Hold' }), cam: { S: 2.45, y0: 566 }, theta: -25, range: [-100, 20],
    pose(p, e) {
      return Object.assign({}, stand, {
        a: lerp(2, 18, p), roll: lerp(22, -22, p), leg: (s) => ({ A: [s * 20, ankleY(0), 2], pole: [s * 0.5, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [lerp(26, -22, p), lerp(176, 94, p), lerp(14, 24, p)], pole: [s * 0.5, -0.6, 0.4] }),
        props: [P.box('eq', 56, 104, 0, 5, -8, 8, 'back'), P.box('eq', 77, 83, 5, 232, -4, 4, 'back'), P.ball('eq2', [80, 200, 0], 5, 'back')],
        hot: [['obliques', H(1, e)], ['abs', H(0.5, e)], ['shoulders', H(0.3, e)]],
      });
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return [P.line('cable', [80, 200, 0], add(W, [0, 1, 0]), 'back'), P.ball('gbar', add(W, [0, 0, 2]), 2.8, 'near')]; },
  };
  S['cable-side-bend'] = {
    phases: PH('Bend sideways', 'Stand tall', { d: [1.4, 0.5, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.8, y0: 566 }, theta: -8, range: [-60, 20],
    pose(p, e) {
      const b = lerp(0, 18, p) * D2R;
      return {
        H: [lerp(0, -7, p), 92, 0], a: 2, roll: 0, sh: [0, 0], leg: (s) => ({ A: [s * 14, ankleY(0), 2], pole: [0, 0, 1], pitch: 0 }),
        arm: (s, Sh) => s === 1 ? { E: add(Sh, mul(norm([0.06, -1, 0]), LEN.UA)), W: add(Sh, [4, lerp(-53, -56, p), 1]) } : { W: add(Sh, [-3, 8, 6]), pole: [-1, 0.5, 0] },
        props: [P.box('eq', 20, 68, 0, 5, -8, 8, 'back'), P.box('eq', 41, 47, 5, 120, -4, 4, 'back'), P.ball('eq2', [44, 14, 0], 5, 'back')],
        hot: [['obliques', H(1, e)]],
      };
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return [P.line('cable', [44, 14, 0], W, 'back'), P.ball('gbar', W, 3, 'near')]; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
