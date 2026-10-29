/* Plate: more exercise demos, batch H (cardio machines, carries, forearms). */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const { PH, H, seat, seatedLegs, dbPair, stand, stdLegs, barProps } = X;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const TAU = Math.PI * 2;
  const CYCLE = (name, dur) => [{ name, dur: dur || 1.2, from: 0, to: 1, e: [0.7, 0.7], lin: true }];
  /* ground marks that slide backwards so a walking figure reads as moving */
  const ticks = (p, speed, tilt) => { const out = []; for (let i = -4; i <= 4; i++) { let z = ((i * 36 - p * speed) % 288 + 288) % 288 - 144; out.push(P.box('eq', -34, 34, 0, 0.8 + (tilt ? Math.max(0, (z + 60) * tilt) : 0), z, z + 5, 'back')); } return out; };

  /* ---------- gait: walk, run ---------- */
  function gait(o) {
    return {
      phases: CYCLE(o.name || 'Stride', o.dur || 1.3), cam: { S: 2.55, y0: 566, dx: o.dx || 0 }, theta: o.theta || -85, range: [-100, -20],
      pose(p, e) {
        const ph = (s) => TAU * p + (s === 1 ? 0 : Math.PI), Z = o.Z, tiltR = (o.incline || 0);
        const hy = 94 - (o.bob || 2) * (0.5 + 0.5 * Math.cos(2 * TAU * p));
        const footY = (s, zz) => ankleY(0) + (o.incline ? (zz + 40) * o.incline : 0) + o.lift * Math.max(0, Math.cos(ph(s)));
        return {
          H: [0, hy, 0], a: o.lean || 3, sh: [0, 0],
          leg: (s) => { const zz = Z * Math.sin(ph(s)); return { A: [s * 9, footY(s, zz), zz + 2], pole: [0, 0.1, 1], pitch: -18 * Math.max(0, Math.cos(ph(s))) }; },
          arm: (s, Sh) => { const th = o.swing * Math.sin(ph(-s)), E = add(Sh, mul(dirYZ(th - 6), LEN.UA)); return { E, W: add(E, mul(dirYZ(th + o.bend), LEN.FA)) }; },
          props: o.props ? o.props(p) : ticks(p, o.speed || 140, o.incline),
          hot: o.hot(e),
        };
      },
      post: o.post || null,
    };
  }
  const legHot = (e) => [['quads', H(0.7, e)], ['hamstrings', H(0.6, e)], ['glutes', H(0.7, e)], ['calves', H(0.6, e)]];
  S['walking-outdoors'] = gait({ name: 'Walk', dur: 1.4, Z: 20, lift: 6, swing: 26, bend: 12, hot: legHot });
  S['treadmill-running'] = gait({ name: 'Run', dur: 0.85, Z: 32, lift: 20, swing: 42, bend: 88, lean: 9, bob: 4, speed: 260, dx: 0, hot: (e) => [['quads', H(0.8, e)], ['hamstrings', H(0.7, e)], ['glutes', H(0.7, e)], ['calves', H(0.9, e)]],
    props: (p) => ticks(p, 260).concat([P.box('eq', -26, 26, 0, 6, -80, 80, 'back'), P.box('eq', -3, 3, 0, 120, 70, 76, 'back'), P.box('eq', -22, 22, 112, 126, 66, 80, 'back')]) });
  S['hiit-sprint-intervals'] = gait({ name: 'Sprint', dur: 0.62, Z: 38, lift: 28, swing: 54, bend: 92, lean: 16, bob: 5, speed: 340, hot: (e) => [['quads', H(0.9, e)], ['hamstrings', H(0.8, e)], ['glutes', H(0.9, e)], ['calves', H(0.9, e)]] });
  S['incline-treadmill-walk'] = gait({ name: 'Walk uphill', dur: 1.4, Z: 20, lift: 6, swing: 24, bend: 14, lean: 7, incline: 0.14, speed: 120, hot: (e) => [['glutes', H(0.9, e)], ['calves', H(0.8, e)], ['hamstrings', H(0.6, e)], ['quads', H(0.5, e)]],
    props: (p) => [P.slab('eq', [0, 0, -90], [0, 28, 94], 52, 5, 'back'), P.box('eq', -3, 3, 0, 120, 90, 96, 'back'), P.box('eq', -22, 22, 112, 126, 86, 100, 'back')] });
  S['sled-push'] = gait({ name: 'Drive', dur: 1.1, Z: 22, lift: 8, swing: 0, bend: 0, lean: 52, bob: 1, speed: 100, theta: -85,
    hot: (e) => [['quads', H(1, e)], ['glutes', H(0.8, e)], ['calves', H(0.6, e)], ['shoulders', H(0.4, e)]],
    props: (p) => ticks(p, 100).concat([P.box('eq', -24, 24, 0, 14, 40, 110, 'back'), P.box('eq', -3, 3, 14, 100, 52, 58, 'back'), P.box('eq', -3, 3, 14, 100, 96, 102, 'back'), P.cap('eq', [-22, 96, 55], 2.2, [22, 96, 55], 2.2, 'back'), P.disc('eq2', [0, 22, 80], 'x', 14, 8, 'near')]) });
  S['sled-push'].pose = ((f) => (p, e) => { const r = f(p, e); r.arm = (s) => ({ W: [s * 20, 96, 56], pole: [s * 0.4, -0.2, -1] }); return r; })(S['sled-push'].pose);

  /* ---------- carries ---------- */
  const carry = (o) => {
    const g = gait({ name: 'Walk', dur: 1.5, Z: 18, lift: 5, swing: 0, bend: 0, bob: 1, speed: 120, hot: o.hot });
    const base = g.pose;
    g.pose = (p, e) => { const r = base(p, e); r.arm = (s, Sh) => s === 1 || !o.single ? { E: add(Sh, mul(norm([s * 0.04, -1, 0]), LEN.UA)), W: add(Sh, [s * 4, -53, 1]) } : { E: add(Sh, mul(norm([s * 0.2, -1, 0]), LEN.UA)), W: add(Sh, [s * 11, -50, 0]) }; return r; };
    g.post = (sc, pose, J) => (o.single ? P.dumbbell(J.side[1].W, 'z', 'near', 7.5) : dbPair(J, 'z'));
    return g;
  };
  S['farmers-carry'] = carry({ hot: (e) => [['forearms', H(1, e)], ['traps', H(0.7, e)], ['abs', H(0.4, e)], ['glutes', H(0.3, e)]] });
  S['suitcase-carry'] = carry({ single: true, hot: (e) => [['obliques', H(1, e)], ['forearms', H(0.8, e)], ['traps', H(0.5, e)]] });

  /* ---------- bikes ---------- */
  const bike = (o) => ({
    phases: CYCLE('Pedal', o.dur || 1.2), cam: { S: 2.5, y0: 566, dx: 4 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const C = [0, 34, 22], ang = -TAU * p, r = 17, a = o.lean || 18;
      const ped = (s) => { const t = ang + (s === 1 ? 0 : Math.PI); return [s * 11, C[1] + r * Math.sin(t), C[2] + r * Math.cos(t)]; };
      const Hh = [0, 90, -16];
      return {
        H: Hh, a, sh: [0, 0], barHands: true,
        leg: (s) => ({ A: add(ped(s), [0, 8, -3]), pole: [0, 0.2, 1], pitch: 8 }),
        arm: (s) => o.fan ? { W: [s * 20, 106, 36 + 12 * Math.sin(-ang * (s === 1 ? 1 : -1))], pole: [s * 0.3, -0.5, -1] } : { W: [s * 20, o.hy || 108, 38], pole: [s * 0.3, -0.5, -1] },
        props: [P.cap('eq', [0, 86, -20], 2.6, [0, 30, 6], 2.6, 'back'), P.box('eq', -10, 10, 84, 90, -34, -4, 'back'), P.cap('eq', C, 2.6, [0, o.hy ? o.hy - 8 : 100, 40], 2.6, 'back'), P.cap('eq', [0, 104, 40], 2.2, [0, 108, 40], 2.2, 'back'),
          P.cap('eq', [0, 6, -12], 2.4, [0, 34, 6], 2.4, 'back'), P.cap('eq', [0, 6, 52], 2.4, [0, 34, 36], 2.4, 'back'), P.box('eq', -16, 16, 0, 3, -30, 70, 'back'), P.disc('eq2', [0, o.fan ? 40 : 26, 52], 'x', o.fan ? 20 : 14, 4, 'back')].concat(o.road ? [P.disc('eq2', [0, 40, 78], 'x', 34, 3, 'back'), P.disc('eq2', [0, 40, -48], 'x', 34, 3, 'back')] : []).concat(o.road ? ticks(p, 300) : []),
        hot: o.hot(e),
      };
    },
    post: (sc, pose, J) => [1, -1].map((s) => P.cap('gbar', [s * 11, 34, 22], 1.6, add(J.side[s].ankle, [0, -8, 3]), 1.6, s === 1 ? 'near' : 'far')),
  });
  const bikeHot = (e) => [['quads', H(1, e)], ['glutes', H(0.6, e)], ['hamstrings', H(0.5, e)], ['calves', H(0.5, e)]];
  S['stationary-bike'] = bike({ hot: bikeHot });
  S['cycling-outdoor'] = bike({ hot: bikeHot, road: true, lean: 38, hy: 98, dur: 1.0 });
  S['assault-bike'] = bike({ hot: (e) => [['quads', H(0.9, e)], ['shoulders', H(0.7, e)], ['triceps', H(0.6, e)], ['lats', H(0.5, e)], ['glutes', H(0.6, e)]], fan: true, lean: 10, dur: 0.8 });

  /* ---------- rowing machine ---------- */
  S['rowing-machine'] = {
    phases: [{ name: 'Drive: legs, then back, then arms', dur: 1.0, from: 0, to: 1, e: [0.8, 0.8], lin: true }, { name: 'Finish', dur: 0.3, from: 1, to: 1, e: [0.7, 0.7] }, { name: 'Recover: arms, back, then knees', dur: 1.7, from: 1, to: 0, e: [0.4, 0.4] }, { name: 'Catch', dur: 0.2, from: 0, to: 0, e: [0.4, 0.4] }],
    cam: { S: 2.0, y0: 540, dx: 16 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const legK = clamp(p / 0.5, 0, 1), backK = clamp((p - 0.25) / 0.5, 0, 1), armK = clamp((p - 0.55) / 0.45, 0, 1);
      const sz = lerp(8, -34, legK), a = lerp(26, -22, backK), ar = a * D2R, Hh = [0, 28, sz], T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      const hand = [0, lerp(T[1] - 6, T[1] - 14, armK), lerp(T[2] + 52, T[2] + 8, armK)];
      return {
        H: Hh, a, sh: [0, 0], barHands: true, leg: (s) => ({ A: [s * 11, 17, 50], pole: [0, 1, 0.1], pitch: 40 }),
        arm: (s) => ({ W: [s * 9, hand[1], hand[2]], pole: [s * 0.3, -0.4, -1] }),
        props: [P.box('eq', -4, 4, 14, 20, -70, 120, 'back'), P.box('eq', -7, 7, 20, 29, sz - 10, sz + 9, 'back'), P.slab('eq', [0, 14, 44], [0, 32, 60], 30, 4, 'back'), P.disc('eq2', [0, 38, 110], 'x', 22, 8, 'back'), P.line('cable', [0, 38, 108], [0, hand[1], hand[2] + 2], 'back'), P.box('eq', -3, 3, 0, 14, -66, -60, 'back'), P.box('eq', -3, 3, 0, 14, 104, 110, 'back')],
        hot: [['quads', H(0.8, e)], ['lats', H(0.8, e)], ['midback', H(0.6, e)], ['biceps', H(0.4, e)], ['hamstrings', H(0.4, e)]],
      };
    },
    post: (sc, pose, J) => [1, -1].map((s) => P.ball('gbar', J.side[s].W, 2.6, s === 1 ? 'near' : 'far')),
  };

  /* ---------- stairs, elliptical, rope, ropes, swim ---------- */
  const stairs = (o) => ({
    phases: CYCLE('Step', o.dur || 1.4), cam: { S: 2.5, y0: 566 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const yA = (s) => 4 + 20 * (0.5 + 0.5 * Math.sin(TAU * p + (s === 1 ? 0 : Math.PI)));
      return {
        H: [0, 98, 0], a: 8, sh: [0, 0], leg: (s) => ({ A: [s * 11, yA(s) + 6, 4], pole: [0, 0.2, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 26, 112, 30], pole: [s * 0.3, -0.5, -1] }),
        props: [-1, 1].reduce((a2, s) => a2.concat([P.box('eq', s * 11 - 9, s * 11 + 9, yA(s), yA(s) + 5, -14, 24, 'back')]), []).concat([P.box('eq', -30, 30, 0, 3, -30, 60, 'back'), P.box('eq', -4, 4, 3, 130, 40, 48, 'back'), P.cap('eq', [-26, 106, 30], 2.4, [-26, 106, 30], 2.4, 'back')]).concat([-1, 1].map((s) => P.cap('eq', [s * 26, 104, 28], 2.2, [s * 26, 104, 46], 2.2, 'back'))),
        hot: [['glutes', H(1, e)], ['quads', H(0.8, e)], ['calves', H(0.6, e)], ['hamstrings', H(0.5, e)]],
      };
    },
  });
  S['stair-climber'] = stairs({});
  S['stair-climber-intervals'] = stairs({ dur: 0.8 });
  S['elliptical'] = {
    phases: CYCLE('Glide', 1.4), cam: { S: 2.5, y0: 566, dx: 6 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const ph = (s) => TAU * p + (s === 1 ? 0 : Math.PI), foot = (s) => [s * 10, 12 + 7 * Math.max(0, Math.cos(ph(s))) + 3, 22 * Math.sin(ph(s)) - 8];
      return {
        H: [0, 95, -6], a: 6, sh: [0, 0], leg: (s) => ({ A: add(foot(s), [0, 7, 0]), pole: [0, 0.1, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 24, 112, 24 * Math.sin(ph(-s)) + 22], pole: [s * 0.3, -0.5, -1] }),
        props: [P.box('eq', -30, 30, 0, 4, -50, 60, 'back'), P.box('eq', -4, 4, 4, 140, 52, 60, 'back'), P.disc('eq2', [0, 36, -40], 'x', 14, 4, 'back')].concat([1, -1].map((s) => P.box('eq', s * 10 - 7, s * 10 + 7, foot(s)[1] - 3, foot(s)[1] + 1, foot(s)[2] - 14, foot(s)[2] + 14, 'back'))),
        hot: legHot(e).concat([['shoulders', H(0.3, e)]]),
      };
    },
  };
  S['jump-rope'] = {
    phases: CYCLE('Jump', 0.9), cam: { S: 2.45, y0: 566 }, theta: -80, range: [-100, -20],
    pose(p, e) {
      const j = Math.max(0, Math.sin(TAU * p * 1)) * 9, ar = TAU * p;
      return {
        H: [0, 91 + j, 0], a: 2, sh: [0, 0], leg: (s) => ({ A: [s * 8, ankleY(-30) + j + 1, 2], pole: [0, 0, 1], pitch: -30 }),
        arm: (s, Sh) => ({ W: [s * 30, 98 + 3 * Math.sin(ar), 6 + 4 * Math.cos(ar)], pole: [s * 1, 0, -0.2] }),
        props: [floor0()], hot: [['calves', H(1, e)], ['quads', H(0.4, e)], ['shoulders', H(0.3, e)], ['forearms', H(0.4, e)]],
      };
    },
    post: (sc, pose, J) => {
      const A = J.side[1].W, B = J.side[-1].W, out = [], prog = 0.0;
      return out;
    },
  };
  function floor0() { return P.box('eq', -34, 34, 0, 1, -40, 40, 'back'); }
  S['jump-rope'].post = (sc, pose, J, p) => {
    const A = J.side[1].W, B = J.side[-1].W, th0 = -TAU * p, pts = [], n = 16;
    for (let i = 0; i <= n; i++) { const t = th0 + (i / n) * Math.PI * 1; const f = i / n, y = 96 + 90 * Math.sin(th0 + 0) * 0; const ang = th0 + Math.PI * f; const yy = 100 + 98 * Math.cos(ang) * 0.0 + 0; pts.push(null); }
    const segs = [], R0 = 96, c = [0, 96, 6];
    let prev = A;
    for (let i = 1; i <= 14; i++) { const f = i / 14, ang = th0 + Math.PI * f, q = [lerp(A[0], B[0], f), c[1] + R0 * Math.sin(ang) * (1 - 0.05 * 0) * Math.sin(Math.PI * f) * 1 * Math.sign(Math.sin(th0 + 0.0001) || 1) * 0 + (R0 * Math.sin(Math.PI * f)) * Math.cos(th0), c[2] + 70 * Math.sin(Math.PI * f) * Math.sin(th0)]; q[1] = Math.max(1, q[1]); segs.push(P.line('cable', prev, q, 'near')); prev = q; }
    return segs;
  };
  S['battle-ropes'] = {
    phases: CYCLE('Alternate waves', 0.7), cam: { S: 2.45, y0: 566 }, theta: -80, range: [-100, -20],
    pose(p, e) {
      const ph = (s) => TAU * p + (s === 1 ? 0 : Math.PI);
      return {
        H: [0, 70, -10], a: 12, sh: [0, 0], leg: (s) => ({ A: [s * 20, ankleY(0), 2], pole: [s * 0.5, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 11, 86 + 16 * Math.sin(ph(s)), 38], pole: [s * 0.5, -0.5, -0.6] }),
        props: [floor0(), P.ball('eq2', [0, 40, 130], 7, 'back')],
        hot: [['shoulders', H(1, e)], ['biceps', H(0.4, e)], ['abs', H(0.4, e)], ['forearms', H(0.6, e)]],
      };
    },
    post: (sc, pose, J, p) => {
      const out = []; for (const s of [1, -1]) { const W = J.side[s].W, ph = TAU * p + (s === 1 ? 0 : Math.PI); let prev = add(W, [0, 0, 2]); for (let i = 1; i <= 12; i++) { const f = i / 12, q = [s * 11, lerp(W[1], 40, f) + 16 * Math.sin(ph - f * 5.5) * (1 - f * 0.4), lerp(W[2], 130, f)]; out.push(P.line('cable', prev, q, 'near')); prev = q; } }
      return out;
    },
  };
  S['swimming'] = {
    phases: CYCLE('Freestyle stroke', 1.6), cam: { S: 1.95, y0: 540, dx: -44 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const ph = (s) => TAU * p + (s === 1 ? 0 : Math.PI);
      return {
        H: [0, 34, -38], a: 88, sh: [0, 0], head: null, roll: 12 * Math.sin(TAU * p),
        leg: (s, hip) => ({ A: add(hip, [0, 5 * Math.sin(2 * ph(s)), -82]), pole: [0, 1, 0], pitch: -30 }),
        arm: (s, Sh) => { const R2 = 52, f = ph(s); return { W: [Sh[0], Sh[1] + R2 * Math.sin(f) * 0.85 - 4, Sh[2] + R2 * Math.cos(f)], pole: [s * 0.3, 1, 0] }; },
        props: [P.box('eq', -30, 30, 38, 39.5, -150, 130, 'back')],
        hot: [['lats', H(0.9, e)], ['shoulders', H(0.7, e)], ['triceps', H(0.4, e)], ['abs', H(0.4, e)], ['quads', H(0.3, e)]],
      };
    },
  };

  /* ---------- forearms ---------- */
  const wrist = (rev) => ({
    phases: PH(rev ? 'Extend the wrist' : 'Curl the wrist', 'Lower', { d: [1.0, 0.6, 1.8, 0.4], hold: 'Squeeze' }), cam: { S: 3.2, y0: 540 }, theta: -80, range: [-100, -20],
    pose(p, e) {
      return {
        H: [0, 52, -4], a: 22, sh: [0, 0], leg: seatedLegs(38),
        arm: (s, Sh) => s === 1 ? { E: [10, 66, 18], W: [10, rev ? lerp(60, 74, p) : lerp(70, 58, 1 - p), 40] } : { E: [-10, 66, 18], W: [-10, 62, 40] },
        props: seat(-20, 16), hot: [['forearms', H(1, e)]],
      };
    },
    post: (sc, pose, J) => P.dumbbell(add(J.side[1].W, [0, 1, 4]), 'x', 'near', 5.6),
  });
  S['wrist-curl'] = wrist(false);
  S['reverse-wrist-curl'] = wrist(true);
  S['wrist-roller'] = {
    phases: PH('Roll the weight up', 'Lower', { d: [2.2, 0.4, 2.0, 0.4], hold: 'Top' }), cam: { S: 2.45, y0: 566 }, theta: -80, range: [-100, -20],
    pose(p, e) {
      return Object.assign({}, stand, {
        a: 2, leg: stdLegs(2), arm: (s) => ({ W: [s * 13, 140, 36], pole: [s * 0.3, -1, -0.2] }),
        props: [P.line('cable', [0, 140, 36], [0, lerp(40, 138, p), 36], 'back'), P.disc('eq2', [0, lerp(40, 138, p) - 2, 36], 'z', 9, 4, 'near'), floor0()],
        hot: [['forearms', H(1, e)], ['shoulders', H(0.4, e)]],
      });
    },
    post: (sc, pose, J) => [P.cap('gbar', add(J.side[1].W, [-4, 0, 0]), 2.2, add(J.side[-1].W, [4, 0, 0]), 2.2, 'near')],
  };
  S['plate-pinch'] = {
    phases: [{ name: 'Pinch the plates', dur: 0.8, from: 0, to: 1, e: [0.6, 1] }, { name: 'Hold', dur: 3.0, from: 1, to: 1, e: [1, 1] }, { name: 'Release', dur: 0.8, from: 1, to: 0, e: [1, 0.4] }, { name: 'Rest', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 3.0, y0: 562 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      return Object.assign({}, stand, {
        leg: stdLegs(2), arm: (s, Sh) => ({ E: add(Sh, mul(norm([s * 0.04, -1, 0]), LEN.UA)), W: add(Sh, [s * 4, -53, 3]) }),
        hot: [['forearms', H(1, e)], ['traps', H(0.3, e)]],
      });
    },
    post: (sc, pose, J) => [1, -1].reduce((a, s) => a.concat([P.disc('eq2', add(J.side[s].W, [s * 0, -3, 2]), 'x', 11, 2.2, s === 1 ? 'near' : 'far'), P.disc('eq2', add(J.side[s].W, [s * 0, -3, -2]), 'x', 10.5, 2.2, s === 1 ? 'near' : 'far')]), []),
  };
})(typeof window !== 'undefined' ? window : globalThis);
