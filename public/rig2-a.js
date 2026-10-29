/* Plate: more exercise demos, batch A (standing arms, shoulders, cable work).
   Every scene follows the rig2.js scene format and registers into Rig2.SCENES. */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R) return;
  const S = R.SCENES, P = R.P, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const stand = { H: [0, 92, 0], a: 2 };
  const stdLegs = (z0, sp) => (s) => ({ A: [s * (sp || 12), ankleY(0), z0 || 2], pole: [0, 0, 1], pitch: 0 });
  const PH = (a, c, o) => {
    o = o || {}; const d = o.d || [1.5, 0.5, 2.1, 0.4];
    return [{ name: a, dur: d[0], from: o.from || 0, to: o.to == null ? 1 : o.to, e: [0.35, 1] }, { name: o.hold || 'Hold', dur: d[1], from: o.to == null ? 1 : o.to, to: o.to == null ? 1 : o.to, e: [1, 1] },
      { name: c, dur: d[2], from: o.to == null ? 1 : o.to, to: o.from || 0, e: [0.8, 0.3] }, { name: o.rest || 'Reset', dur: d[3], from: o.from || 0, to: o.from || 0, e: [0.3, 0.3] }];
  };
  const H = (k, e, lo) => (lo == null ? 0.12 : lo) + (0.94 - (lo == null ? 0.12 : lo)) * e * k;
  const barProps = (c, o) => P.barbell(c, o);
  /* a cable tower in front of (z>0) or behind (z<0) the lifter, with the pulley at height py */
  const tower = (z, py, front) => [P.box('eq', -24, 24, 0, 6, z - 8, z + 8, 'back'), P.box('eq', -22, 22, 6, 232, z - 5, z + 5, 'back'), P.ball('eq2', [0, py, z - (front ? 2 : -2)], 5, 'back')];
  const seat = (z0, z1) => [P.box('eq', -17, 17, 38, 44, z0, z1, 'back'), P.box('eq', -4, 4, 0, 38, z0 + 8, z0 + 14, 'back'), P.box('eq', -22, 22, 0, 4, z0 - 6, z1 + 10, 'back')];
  const backPad = (z, y0, y1) => P.box('eq', -17, 17, y0, y1, z - 6, z, 'back');
  const seatedLegs = (z0) => (s) => ({ A: [s * 16, ankleY(0), z0 || 40], pole: [0, 1, 0.1], pitch: 0 });
  const dbPair = (J, axis) => [1, -1].reduce((a, s) => a.concat(P.dumbbell(J.side[s].W, axis, s === 1 ? 'near' : 'far')), []);
  const stdCam = { S: 3.0, y0: 562 };
  R.X = { PH, H, tower, seat, backPad, seatedLegs, dbPair, stand, stdLegs, stdCam, barProps };

  /* ---------- curls ---------- */
  function curl(o) {
    return {
      phases: o.phases || PH('Curl', 'Lower'), cam: o.cam || stdCam, theta: -90, range: [-100, -10],
      pose(p, e) {
        const ua = o.ua ? o.ua(p) : -4;
        return Object.assign({}, stand, {
          a: 2, barHands: o.grip !== 'db', leg: stdLegs(2),
          arm: (s, Sh) => { const E = add(Sh, mul(dirYZ(ua), LEN.UA)); return { E, W: add(E, mul(dirYZ(ua + lerp(8, 142, p)), LEN.FA)) }; },
          props: o.grip === 'cable' ? tower(60, 12, true) : [],
          hot: [['biceps', H(o.bi || 1, e)], ['forearms', o.fo ? 0.2 + o.fo * e : 0.12 + 0.2 * e]],
        });
      },
      post: (sc, pose, J) => {
        const W = J.side[1].W;
        if (o.grip === 'bar') return barProps([0, W[1], W[2]], { half: 44, R: 8.5, th: 3.6 });
        if (o.grip === 'cable') return [P.cap('gbar', [-9, W[1], W[2]], 1.5, [9, W[1], W[2]], 1.5, 'near'), P.line('cable', [0, 12, 58], [0, W[1], W[2]], 'back')];
        return dbPair(J, 'z');
      },
    };
  }
  S['ez-bar-curl'] = curl({ grip: 'bar' });
  S['cable-curl'] = curl({ grip: 'cable' });
  S['reverse-curl'] = curl({ grip: 'bar', bi: 0.55, fo: 0.8 });
  S['bayesian-cable-curl'] = Object.assign(curl({ grip: 'cable', ua: (p) => lerp(-42, -22, p) }), { theta: -70 });
  S['bayesian-cable-curl'].pose = ((base) => (p, e) => {
    const r = base(p, e); r.props = tower(-50, 12, false); r.a = 4; return r;
  })(S['bayesian-cable-curl'].pose);
  S['bayesian-cable-curl'].post = (sc, pose, J) => { const W = J.side[1].W; return [P.cap('gbar', [-5, W[1], W[2]], 1.5, [5, W[1], W[2]], 1.5, 'near'), P.line('cable', [0, 12, -52], [0, W[1], W[2]], 'back')]; };
  S['twenty-ones-curl'] = curl({
    grip: 'bar', phases: [{ name: 'Bottom half', dur: 1.5, from: 0, to: 0.5, e: [0.5, 0.8] }, { name: 'Top half', dur: 1.5, from: 0.5, to: 1, e: [0.8, 1] }, { name: 'Full curl', dur: 1.4, from: 0, to: 1, e: [0.5, 1] }, { name: 'Lower', dur: 2.0, from: 1, to: 0, e: [0.9, 0.4] }],
  });

  /* ---------- shoulders, standing ---------- */
  S['cable-lateral-raise'] = {
    phases: PH('Raise', 'Lower'), cam: stdCam, theta: -25, range: [-100, 10],
    pose(p, e) {
      return Object.assign({}, stand, {
        leg: stdLegs(2), props: [P.box('eq', -78, -46, 0, 6, -10, 10, 'back'), P.box('eq', -64, -58, 6, 232, -4, 4, 'back'), P.ball('eq2', [-61, 14, 0], 5, 'back')],
        arm: (s, Sh) => {
          const b = (s === 1 ? lerp(10, 84, p) : 6) * D2R, bend = 12 * D2R;
          const E = add(Sh, [s * Math.sin(b) * LEN.UA, -Math.cos(b) * LEN.UA, 1]);
          return { E, W: add(E, [s * Math.sin(b - bend) * LEN.FA, -Math.cos(b - bend) * LEN.FA, 4]) };
        },
        hot: [['shoulders', H(1, e)]],
      });
    },
    post: (sc, pose, J) => { const W = J.side[1].W; return [P.ball('gbar', add(W, [0, 0, 0]), 2.6, 'near'), P.line('cable', [-61, 14, 0], W, 'back')]; },
  };
  S['upright-row'] = {
    phases: PH('Pull up', 'Lower'), cam: { S: 2.6, y0: 566 }, theta: -60, range: [-100, -10],
    pose(p, e) {
      const y = lerp(92, 126, p), z = lerp(10, 12, p);
      return Object.assign({}, stand, {
        barHands: true, leg: stdLegs(2), a: 2,
        arm: (s) => ({ W: [s * 11, y, z], pole: [s * 1, lerp(-0.2, 0.6, p), -0.2] }),
        props: barProps([0, y, z], { half: 44, R: 8.5, th: 3.6 }),
        hot: [['shoulders', H(1, e)], ['traps', H(0.9, e)]],
      });
    },
  };
  S['face-pull'] = {
    phases: PH('Pull to face', 'Return', { hold: 'Squeeze' }), cam: { S: 2.6, y0: 566 }, theta: -50, range: [-110, -10],
    pose(p, e) {
      const y = lerp(150, 154, p), z = lerp(40, 7, p), x = lerp(5, 13, p);
      return Object.assign({}, stand, {
        a: 0, leg: stdLegs(2), barHands: true,
        arm: (s) => ({ W: [s * x, y, z], pole: [s * lerp(0.3, 1, p), 0.2, -0.2] }),
        props: tower(75, 150, true).concat([P.box('eq', -22, 22, 0, 6, 67, 83, 'back')]),
        hot: [['shoulders', H(1, e)], ['traps', H(0.6, e)], ['midback', H(0.6, e)]],
      });
    },
    post: (sc, pose, J) => { const A = J.side[1].W, B = J.side[-1].W, m = [0, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2 + 1]; return [P.line('cable', [0, 150, 73], m, 'back'), P.cap('gbar', m, 1.4, A, 1.4, 'near'), P.cap('gbar', m, 1.4, B, 1.4, 'far')]; },
  };
  S['landmine-press'] = {
    phases: PH('Press', 'Lower', { d: [1.5, 0.5, 2.0, 0.4] }), cam: { S: 2.45, y0: 570 }, theta: -50, range: [-100, -10],
    pose(p, e) {
      const y = lerp(142, 186, p), z = lerp(20, 34, p);
      return Object.assign({}, stand, {
        a: lerp(2, 6, p), leg: (s) => ({ A: [s * 14, ankleY(0), s === 1 ? 14 : -8], pole: [0, 0, 1], pitch: 0 }),
        arm: (s, Sh) => s === 1 ? { W: [3, y, z], pole: [0.4, -1, 0] } : { E: add(Sh, mul(norm([-0.05, -1, 0]), LEN.UA)), W: add(Sh, [-3, -52, 2]) },
        hot: [['shoulders', H(1, e)], ['chest', H(0.45, e)], ['triceps', H(0.4, e)]],
        props: [P.ball('eq2', [0, 5, 104], 6, 'back')],
      });
    },
    post: (sc, pose, J) => { const W = J.side[1].W, d = norm(sub(W, [0, 5, 104])); const tip = add(W, mul(d, -12)); return [P.cap('gbar', [0, 5, 104], 1.8, tip, 1.8, 'near'), P.disc('eq2', add(tip, mul(d, 0)), 'z', 8, 3.6, 'near'), P.disc('eq2', add(tip, mul(d, 4)), 'z', 7.4, 3.6, 'near')]; },
  };
  const dbPress = (o) => ({
    phases: PH('Press', 'Lower'), cam: { S: 2.35, y0: 566 }, theta: -65, range: [-100, -10],
    pose(p, e) {
      const y = lerp(140, 158, p), z = lerp(8, 2, p), xw = lerp(27, 17, p);
      const arn = o.arnold;
      return {
        H: [0, 56, 0], a: o.lean || -4, leg: seatedLegs(40), sh: [lerp(0, 2.5, p), 0],
        arm: (s) => ({ W: [s * xw, y, arn ? lerp(26, 2, p) : z], pole: [s * (arn ? lerp(0.1, 1, p) : 0.7), -1, arn ? lerp(-0.6, -0.1, p) : -0.1] }),
        props: seat(-24, 22).concat([backPad(-18, 44, 118)]),
        hot: [['shoulders', H(1, e)], ['triceps', H(0.45, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'x'),
  });
  S['dumbbell-shoulder-press'] = dbPress({});
  S['arnold-press'] = dbPress({ arnold: true });
  S['machine-shoulder-press'] = {
    phases: PH('Press', 'Lower'), cam: { S: 2.35, y0: 566 }, theta: -65, range: [-100, -10],
    pose(p, e) {
      const y = lerp(140, 158, p);
      return {
        H: [0, 56, 0], a: -4, leg: seatedLegs(40), sh: [lerp(0, 2.5, p), 0], barHands: true,
        arm: (s) => ({ W: [s * 24, y, 6], pole: [s * 0.7, -1, -0.1] }),
        props: seat(-24, 22).concat([backPad(-18, 44, 120), P.box('eq', -4, 4, 44, y + 12, -40, -34, 'back'), P.box('eq', -34, 34, y + 6, y + 12, -40, 16, 'back')]),
        hot: [['shoulders', H(1, e)], ['triceps', H(0.45, e)]],
      };
    },
    post: (sc, pose, J) => [1, -1].map((s) => P.cap('gbar', add(J.side[s].W, [-s * 4, 0, 0]), 1.8, add(J.side[s].W, [s * 4, 0, 0]), 1.8, s === 1 ? 'near' : 'far')),
  };

  /* ---------- bent-over and seated rear-delt work ---------- */
  const rearFly = (o) => ({
    phases: PH('Raise out', 'Lower'), cam: { S: 2.5, y0: 540 }, theta: -145, range: [-190, -60],
    pose(p, e) {
      const a = o.seated ? 62 : 72, ar = a * D2R;
      return {
        H: o.seated ? [0, 50, 0] : [0, 84, -26], a, leg: o.seated ? seatedLegs(38) : (s) => ({ A: [s * 14, ankleY(0), 0], pole: [0, 0.2, 1], pitch: 0 }),
        sh: [0, 0], props: o.seated ? seat(-22, 22) : [],
        arm: (s, Sh) => {
          const b = lerp(4, 82, p) * D2R, bend = 12 * D2R;
          const E = add(Sh, [s * Math.sin(b) * LEN.UA, -Math.cos(b) * LEN.UA, 0]);
          return { E, W: add(E, [s * Math.sin(b - bend) * LEN.FA, -Math.cos(b - bend) * LEN.FA, 1]) };
        },
        hot: [['shoulders', H(1, e)], ['traps', H(o.trap ? 0.9 : 0.5, e)], ['midback', H(0.5, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  });
  S['rear-delt-fly'] = rearFly({});
  S['seated-reverse-fly-trap'] = rearFly({ seated: true, trap: true });
  S['reverse-pec-deck'] = {
    phases: PH('Sweep back', 'Return'), cam: { S: 2.45, y0: 568 }, theta: -80, range: [-120, -10],
    pose(p, e) {
      const ph = lerp(2, 96, p) * D2R;
      return {
        H: [0, 56, 0], a: 2, leg: seatedLegs(38), sh: [0, 0], barHands: true,
        arm: (s, Sh) => { const d = [s * Math.sin(ph), 0, Math.cos(ph)], E = add(Sh, mul(d, LEN.UA)), W = add(E, mul([s * Math.sin(ph - 0.12), 0, Math.cos(ph - 0.12)], LEN.FA)); return { E, W }; },
        props: seat(-22, 22).concat([P.box('eq', -17, 17, 90, 160, 22, 30, 'back'), P.box('eq', -4, 4, 44, 90, 22, 30, 'back')]),
        hot: [['shoulders', H(1, e)], ['traps', H(0.5, e)], ['midback', H(0.55, e)]],
      };
    },
    post: (sc, pose, J) => [1, -1].map((s) => P.ball('gbar', J.side[s].W, 2.8, s === 1 ? 'near' : 'far')),
  };

  /* ---------- triceps, standing cable and overhead ---------- */
  const pushdown = (o) => ({
    phases: PH('Press down', 'Return', { d: [1.2, 0.5, 1.9, 0.4] }), cam: { S: 2.35, y0: 572, dx: 10 }, theta: o.theta || -90, range: [-100, -20],
    pose(p, e) {
      const f = lerp(100, 2, p);
      return Object.assign({}, stand, {
        a: 8, barHands: true, leg: stdLegs(2),
        arm: (s, Sh) => {
          if (o.single && s === -1) return { E: add(Sh, mul(norm([-0.1, -1, 0.1]), LEN.UA)), W: add(Sh, [-10, -54, 9]) };
          const E = add(Sh, mul(dirYZ(-6), LEN.UA)); return { E, W: add(E, mul(dirYZ(-6 + f), LEN.FA)) };
        },
        props: tower(30, 218, true).concat([]),
        hot: [['triceps', H(1, e)]],
      });
    },
    post: (sc, pose, J, p) => {
      const W = J.side[1].W, hnd = [o.single ? 0 : 0, W[1] - 1, W[2] + 1];
      if (o.rope) { const sp = lerp(1.5, 8, p); return [P.line('cable', [0, 218, 28], hnd, 'back'), P.ball('gbar', add(hnd, [-sp, -2, 3]), 2.2, 'near'), P.ball('gbar', add(hnd, [sp, -2, 3]), 2.2, 'near'), P.cap('gbar', hnd, 1, add(hnd, [sp, -2, 3]), 1, 'near'), P.cap('gbar', hnd, 1, add(hnd, [-sp, -2, 3]), 1, 'near')]; }
      return [P.ball('gbar', hnd, 2.8, 'near'), P.line('cable', [0, 218, 28], hnd, 'back')];
    },
  });
  S['rope-pushdown'] = pushdown({ rope: true });
  S['single-arm-cable-pushdown'] = pushdown({ single: true });
  const overhead = (o) => ({
    phases: PH('Extend', 'Lower', { d: [1.4, 0.5, 2.1, 0.5] }), cam: { S: 2.35, y0: 566 }, theta: -70, range: [-100, -10],
    pose(p, e) {
      const ua = 172, fa = lerp(318, 174, p);
      return Object.assign({}, stand, {
        a: o.cable ? 14 : 0, leg: o.cable ? (s) => ({ A: [s * 14, ankleY(0), s === 1 ? 14 : -8], pole: [0, 0, 1], pitch: 0 }) : stdLegs(2), barHands: true,
        arm: (s, Sh) => { const E = add(Sh, add(mul(dirYZ(ua), LEN.UA), [s * -2, 0, 0])); return { E, W: add(E, add(mul(dirYZ(fa), LEN.FA), [s * -4, 0, 0])) }; },
        props: o.cable ? tower(-52, 40, false) : [],
        hot: [['triceps', H(1, e)]],
      });
    },
    post: (sc, pose, J) => {
      const W = J.side[1].W;
      if (o.cable) return [P.line('cable', [0, 40, -50], add(W, [-3, 0, 0]), 'back'), P.ball('gbar', add(W, [-3, 0, 0]), 3, 'near')];
      return P.dumbbell(add(W, [-3, 2, 0]), 'x', 'near', 6.5);
    },
  });
  S['overhead-cable-triceps-extension'] = overhead({ cable: true });
  S['overhead-dumbbell-extension'] = overhead({});

  /* ---------- traps ---------- */
  const shrug = (o) => ({
    phases: PH('Shrug', 'Lower', { d: [1.0, 0.7, 1.6, 0.4] }), cam: stdCam, theta: -150, range: [-180, -60],
    pose(p, e) {
      return Object.assign({}, stand, {
        leg: stdLegs(2), sh: [lerp(-0.5, 5.5, p), 0], barHands: o.bar,
        arm: (s, Sh) => ({ E: add(Sh, mul(norm([s * 0.04, -1, 0]), LEN.UA)), W: add(Sh, [s * (o.bar ? 12 : 4), -53.5, o.bar ? 7 : 1]) }),
        props: o.cable ? [P.box('eq', -24, 24, 0, 5, -12, 14, 'back')] : [],
        hot: [['traps', H(1, e)]],
      });
    },
    post: (sc, pose, J) => {
      const W = J.side[1].W;
      if (o.bar) return barProps([0, W[1], W[2] + 3], { half: 50, R: 12, th: 4.2 });
      if (o.trapbar) return dbPair(J, 'z');
      return dbPair(J, 'z');
    },
  });
  S['barbell-shrug'] = shrug({ bar: true });
  S['trap-bar-shrug'] = shrug({ trapbar: true });
  S['cable-shrug'] = Object.assign(shrug({ cable: true }), {
    post: (sc, pose, J) => { const W = J.side[1].W; return [P.cap('gbar', [-14, W[1], W[2]], 1.5, [14, W[1], W[2]], 1.5, 'near'), P.line('cable', [0, 6, 2], [0, W[1], W[2]], 'back')]; },
  });
})(typeof window !== 'undefined' ? window : globalThis);
