/* Plate: more exercise demos, batch D (squats, lunges, leg machines, calves). */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const { PH, H, seat, seatedLegs, dbPair, stand, stdLegs, barProps } = X;
  const SQ_PH = [{ name: 'Descend', dur: 1.9, from: 0, to: 1, e: [0.35, 0.55] }, { name: 'Bottom', dur: 0.4, from: 1, to: 1, e: [0.55, 0.7] }, { name: 'Drive up', dur: 1.4, from: 1, to: 0, e: [0.7, 1] }, { name: 'Stand', dur: 0.4, from: 0, to: 0, e: [0.6, 0.3] }];
  const quadHot = (e, k) => [['quads', H(k || 1, e)], ['glutes', H(0.6, e)]];
  const smithRails = [-1, 1].map((s) => P.cap('eq', [s * 74, 0, 3], 2.4, [s * 74, 210, 3], 2.4, 'back')).concat([P.box('eq', -80, 80, 0, 4, -20, 24, 'back')]);
  /* a Smith machine like a gym's: a frame of square posts with a top crossbar, guide rods, and the bar riding on sleeves with hooks to rack it */
  const smithFrame = (bar, zc) => {
    zc = zc != null ? zc : bar ? bar[2] : 3; const Z = (a, b) => [zc + a - 3, zc + b - 3];
    const B = (x0, x1, y0, y1, za, zb) => { const z = Z(za, zb); return P.box('eq', x0, x1, y0, y1, z[0], z[1], 'back'); };
    const o = [B(-84, 84, 0, 4, -26, 30), B(-84, -76, 4, 222, -24, -16), B(76, 84, 4, 222, -24, -16), B(-84, 84, 216, 222, -24, -16),
      B(-84, -78, 216, 222, -16, 24), B(78, 84, 216, 222, -16, 24), B(-84, -78, 4, 216, 18, 24), B(78, 84, 4, 216, 18, 24)];
    [-1, 1].forEach((s) => {
      o.push(P.cap('gbar', [s * 74, 4, zc], 1.4, [s * 74, 216, zc], 1.4, 'back'));
      if (bar) { o.push(P.box('eq2', s * 74 - 3.5, s * 74 + 3.5, bar[1] - 7, bar[1] + 7, bar[2] - 3.5, bar[2] + 3.5, 'back'));
        o.push(P.cap('eq', [s * 66, bar[1], bar[2] - 1], 1.3, [s * 66, bar[1] + 6, bar[2] - 5], 1.3, 'back')); }
      [40, 80, 120, 160].forEach((y) => o.push(P.box('eq2', s * 81 - 2.5, s * 81 + 2.5, y - 1.5, y + 1.5, zc - 16, zc - 13, 'back')));
    });
    o.forEach((q) => { if (q.layer === 'back') q.bg = true; });   // the frame stays behind the lifter, so it never hides the movement
    return o;
  };
  X.smithFrame = smithFrame;

  /* ---------- squats with a bar ---------- */
  const barSquat = (o) => ({
    phases: SQ_PH, cam: { S: 2.7, y0: 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(o.a0 || 6, o.a1 || 42, p), ar = a * D2R, hy = lerp(91, 50, p), fz = o.fz || 3;
      const sg = o.front ? 1 : -1, hz = fz - (48 * Math.sin(ar) + sg * 9 * Math.cos(ar));
      const bar = [0, hy + 48 * Math.cos(ar) - sg * 9 * Math.sin(ar), fz];
      return {
        H: [0, hy, hz], a, barHands: true,
        leg: (s) => ({ A: [s * 17, ankleY(0), o.ank || 3], pole: [s * 0.2, 0, 1], pitch: 0 }),
        arm: (s) => o.front ? { W: [s * 22, bar[1] + 1, bar[2] + 3], pole: [0, 1, 0.4] } : { W: [s * 38, bar[1] - 1, bar[2] - 1], pole: [0, -1, -0.45] },
        props: barProps(bar, { half: o.smith ? 70 : 62, R: 13, th: 4.5 }).concat(o.smith ? smithFrame(bar) : []),
        hot: quadHot(e, 1),
      };
    },
  });
  S['front-squat'] = barSquat({ front: true, a0: 3, a1: 24 });
  S['smith-squat'] = barSquat({ smith: true, a0: 5, a1: 28, ank: 20 });
  S['goblet-squat'] = {
    phases: SQ_PH, cam: { S: 2.7, y0: 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(4, 24, p), ar = a * D2R, hy = lerp(91, 50, p), hz = 3 - 48 * Math.sin(ar) + 4;
      const c = [0, hy + 40 * Math.cos(ar) - 2, hz + 40 * Math.sin(ar) + 12];
      return {
        H: [0, hy, hz], a, leg: (s) => ({ A: [s * 18, ankleY(0), 3], pole: [s * 0.35, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 5, c[1], c[2] + 2], pole: [s * 0.3, -1, 0.4] }),
        props: P.dumbbell(c, 'x', 'near', 7.5), hot: quadHot(e, 1),
      };
    },
  };
  S['sumo-squat'] = {
    phases: SQ_PH, cam: { S: 2.6, y0: 568 }, theta: -30, range: [-100, 20],
    pose(p, e) {
      const hy = lerp(91, 54, p);
      return {
        H: [0, hy, 0], a: 2, leg: (s) => ({ A: [s * 29, ankleY(0), 2], pole: [s * 1, 0, 0.5], pitch: 0 }),
        arm: (s, Sh) => ({ E: add(Sh, mul(norm([s * 0.05, -1, 0.1]), LEN.UA)), W: add(Sh, [s * 3, -52, 6]) }),
        hot: [['adductors', H(0.9, e)], ['quads', H(0.7, e)], ['glutes', H(0.7, e)]],
      };
    },
    post: (sc, pose, J) => { const A = J.side[1].W, B = J.side[-1].W, m = [0, (A[1] + B[1]) / 2 - 2, (A[2] + B[2]) / 2]; return P.dumbbell(m, 'x', 'near', 7.5); },
  };

  /* ---------- machines ---------- */
  const hack = (o) => ({
    phases: SQ_PH, cam: { S: 2.5, y0: 566, dx: 6 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const a = o.a || -33, ar = a * D2R, u = [0, Math.cos(ar), Math.sin(ar)], r = [0, Math.cos(-ar), -Math.sin(-ar)];
      const t = lerp(0, 50, p), H0 = [0, 91, -12], Hh = add(H0, mul(norm([0, -0.8, 0.6]), t));
      const zx = [0, -Math.sin(ar), Math.cos(ar)], pad = P.slab('eq', add(Hh, add(mul(u, -8), mul(zx, -9))), add(Hh, add(mul(u, 66), mul(zx, -9))), 34, 7, 'back');
      return {
        H: Hh, a, sh: [0, 0], barHands: true, leg: (s) => ({ A: [s * 17, ankleY(0), 12], pole: [s * 0.2, 0, 1], pitch: 0 }),
        arm: (s) => ({ W: [s * 24, Hh[1] + 40, Hh[2] + 22 * Math.abs(Math.sin(ar)) + 4], pole: [s * 0.4, -0.3, 0.5] }),
        props: hackMachine(Hh, u, zx, o, (s) => [s * 24, Hh[1] + 40, Hh[2] + 22 * Math.abs(Math.sin(ar)) + 4]).concat([pad]),
        hot: quadHot(e, 1),
      };
    },
  });
  /* the rest of a hack or pendulum squat: square rails on a base frame, a rear upright, the carriage with shoulder pads, handles and
     plate horns loaded with plates, and the angled foot platform. The pendulum hangs its carriage from a pivot arm instead of rails. */
  function hackMachine(Hh, u, zx, o, hand) {
    const out = [P.box('eq', -36, 36, 0, 5, -112, 40, 'back'), P.slab('eq', [0, 2, 4], [0, 9, 40], 34, 4, 'back')];
    const top = o.a ? null : true;
    [-1, 1].forEach((s) => {
      if (top) out.push(P.slab('eq', [s * 28, 4, 30], [s * 28, 172, -102], 2.6, 5, 'back'));
      out.push(P.box('eq', s * 28 - 3, s * 28 + 3, 4, 178, -110, -102, 'back'));
      out.push(P.cap('pad', add(Hh, add(add(mul(u, 58), mul(zx, -8)), [s * 10, 0, 0])), 3.6, add(Hh, add(add(mul(u, 56), mul(zx, 4)), [s * 10, 0, 0])), 3.6, 'back'));
      const hb = add(Hh, add(mul(u, 14), mul(zx, -13)));
      out.push(P.cap('eq2', add(hb, [s * 36, 0, 0]), 1.8, add(hb, [s * 50, 0, 0]), 1.8, 'back'), P.disc('eq2', add(hb, [s * 42, 0, 0]), 'x', 14, 3.2, 'back'), P.disc('eq2', add(hb, [s * 46, 0, 0]), 'x', 11, 3.2, 'back'));
      out.push(P.slab('eq', add(Hh, add(mul(u, -6), mul(zx, -13))), add(Hh, add(mul(u, 50), mul(zx, -13))), 0.1, 3, 'back'));
      const W = hand(s); out.push(P.cap('gbar', add(W, [-s * 4, 0, 0]), 1.6, add(W, [s * 7, 0, 0]), 1.6, s === 1 ? 'near' : 'far'), P.cap('eq', add(W, [s * 7, 0, 0]), 1.6, add(add(Hh, add(mul(u, 40), mul(zx, -12))), [s * 30, 0, 0]), 1.6, 'back'));
    });
    out.push(P.box('eq', -31, 31, 172, 178, -110, -102, 'back'));
    if (!top) {                                    // pendulum: an arm from a pivot at the top rear down to the carriage
      const piv = [0, 160, -96], cb = add(Hh, add(mul(u, 30), mul(zx, -14)));
      [-1, 1].forEach((s) => out.push(P.slab('eq', add(piv, [s * 30, 0, 0]), add(cb, [s * 30, 0, 0]), 2.4, 5, 'back')));
      out.push(P.disc('eq2', [32, 160, -96], 'x', 6, 4, 'back'), P.disc('eq2', [-32, 160, -96], 'x', 6, 4, 'back'), P.box('eq', -34, 34, 156, 164, -100, -92, 'back'));
    }
    return out;
  }
  S['hack-squat'] = hack({});
  S['pendulum-squat'] = hack({ a: -22 });
  /* a 45-degree leg press: square rails on a long base, the seat on its frame, side handles, and the sled behind the foot plate with
     plate horns that ride up and down with it */
  function legPressFrame(Hh, A0, Ae, d, n) {
    const out = [P.box('eq', -42, 42, 0, 5, -96, 60, 'back'), P.box('eq', -18, 18, 5, 24, -70, -24, 'back'), P.slab('eq', [0, 26, -66], [0, 30, -24], 20, 5, 'back')];
    const sled = add(A0, mul(n, 12));
    out.push(P.slab('eq', add(sled, mul(d, -30)), add(sled, mul(d, 30)), 30, 6, 'back'));
    [-1, 1].forEach((s) => {
      out.push(P.slab('eq', [s * 32, 4, -34], add(Ae, [s * 32, 8, 40]), 2.6, 5, 'back'));
      out.push(P.box('eq', s * 32 - 3, s * 32 + 3, 4, Ae[1] + 14, Ae[2] + 36, Ae[2] + 42, 'back'));
      const hb = add(sled, mul(d, -14));
      out.push(P.cap('eq2', add(hb, [s * 30, 0, 0]), 1.8, add(hb, [s * 58, 0, 0]), 1.8, 'back'), P.disc('eq2', add(hb, [s * 46, 0, 0]), 'x', 14, 3.4, 'back'), P.disc('eq2', add(hb, [s * 50, 0, 0]), 'x', 14, 3.4, 'back'), P.disc('eq2', add(hb, [s * 54, 0, 0]), 'x', 10, 3, 'back'));
      out.push(P.cap('gbar', [s * 26, 44, -62], 1.6, [s * 26, 44, -44], 1.6, s === 1 ? 'near' : 'far'), P.box('eq', s * 26 - 2, s * 26 + 2, 24, 43, -64, -60, 'back'));
    });
    return out;
  }
  const legPress = (calf) => ({
    phases: [{ name: 'Lower the sled', dur: 1.9, from: 0, to: 1, e: [0.35, 0.55] }, { name: 'Bottom', dur: 0.4, from: 1, to: 1, e: [0.55, 0.7] }, { name: 'Press', dur: 1.4, from: 1, to: 0, e: [0.7, 1] }, { name: 'Lockout', dur: 0.4, from: 0, to: 0, e: [0.6, 0.3] }],
    cam: { S: 2.0, y0: 520, dx: -30 }, theta: -85, range: [-100, -20], shadow: { c: [0, 0, 10], rx: 70, rz: 100 },
    pose(p, e) {
      const a = -62, ar = a * D2R, Hh = [0, 32, -44], Ae = [0, 88, 22], Af = [0, 64, -10];
      const q = calf ? 0 : p, A0 = [lerp(Ae[0], Af[0], q), lerp(Ae[1], Af[1], q), lerp(Ae[2], Af[2], q)];
      const u = [0, Math.cos(ar), Math.sin(ar)], zx = [0, -Math.sin(ar), Math.cos(ar)];
      const d = norm(sub(Ae, Af)), n = [0, -d[2], d[1]];
      const plate = P.slab('eq', add(A0, add(mul(n, 6), mul(d, -34))), add(A0, add(mul(n, 6), mul(d, 34))), 56, 5, 'back');
      return {
        H: Hh, a, sh: [0, 0], barHands: true,
        leg: (s) => ({ A: add(A0, [s * 17, 0, 0]), pole: [s * 0.15, 1, 0.1], pitch: calf ? 38 - lerp(0, 46, p) : 38 }),
        arm: (s) => ({ W: [s * 26, 44, -52], pole: [s * 0.3, -1, 0] }),
        props: [P.slab('eq', add(Hh, add(mul(u, -10), mul(zx, -8))), add(Hh, add(mul(u, 62), mul(zx, -8))), 38, 8, 'back'), plate].concat(legPressFrame(Hh, A0, Ae, d, n)),
        hot: calf ? [['calves', H(1, e)]] : quadHot(e, 1),
      };
    },
  });
  S['leg-press'] = legPress(false);
  S['leg-press-calf-raise'] = Object.assign(legPress(true), { phases: PH('Press up on toes', 'Lower', { d: [1.2, 0.7, 1.9, 0.5] }) });
  S['leg-extension'] = {
    phases: PH('Extend', 'Lower', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.8, y0: 540 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const th = lerp(4, 96, p);
      return {
        H: [0, 50, -8], a: -8, sh: [0, 0], barHands: false,
        leg: (s, hip) => { const K = add(hip, mul(dirYZ(88), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(th), LEN.SHIN)), pitch: lerp(5, 25, p) }; },
        arm: (s) => ({ W: [s * 21, 54, -12], pole: [s * 0.3, -1, 0] }),
        props: seat(-26, 6).concat([P.box('eq', -17, 17, 44, 118, -34, -26, 'back'), P.box('stk', -10, 10, 6, 50, -46, -38, 'back'), P.box('eq', -14, 14, 50, 120, -48, -36, 'back')]),
        hot: [['quads', H(1, e)]],
      };
    },
    post: (sc, pose, J) => { const B = J.side[1], ank = B.ankle, kn = B.knee, r = add(ank, [0, 2.5, 7]); return [P.cap('pad', add(r, [-17, 0, 0]), 3.6, add(r, [17, 0, 0]), 3.6, 'near'), P.cap('eq', [21, kn[1], kn[2]], 2, add(r, [19, 0, 0]), 2, 'near'), P.disc('eq2', [22, kn[1], kn[2]], 'x', 4.5, 2, 'near')]; },
  };

  /* ---------- lunges and one-leg work ---------- */
  const LUNGE_PH = [{ name: 'Step and lower', dur: 1.8, from: 0, to: 1, e: [0.35, 0.55] }, { name: 'Bottom', dur: 0.4, from: 1, to: 1, e: [0.55, 0.7] }, { name: 'Push back', dur: 1.4, from: 1, to: 0, e: [0.7, 1] }, { name: 'Stand', dur: 0.4, from: 0, to: 0, e: [0.6, 0.3] }];
  const lunge = (o) => ({
    phases: LUNGE_PH, cam: { S: 2.6, y0: 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const hy = lerp(91, 50, p), rev = o.rev;
      const fz = rev ? 4 : lerp(3, 40, p), rz = rev ? lerp(3, -42, p) : -(o.bulg ? 55 : lerp(3, 40, p)) + 3 + (o.bulg ? 0 : 0);
      const rp = o.bulg ? -70 : -lerp(0, 62, p), ry = o.bulg ? 49 : ankleY(rp);
      return {
        H: [0, o.bulg ? lerp(88, 54, p) : hy, rev ? lerp(0, -4, p) : lerp(0, 2, p)], a: o.bulg ? 12 : 2, sh: [0, 0],
        leg: (s) => s === 1 ? { A: [13, ankleY(0), o.bulg ? 26 : fz], pole: [0, 0, 1], pitch: 0 } : { A: [-13, ry, o.bulg ? -52 : (rev ? rz : -(fz - 3) + 3 - 3 * 0)], pole: [0, -0.2, 1], pitch: rp },
        arm: (s, Sh) => ({ E: add(Sh, mul(norm([s * 0.05, -1, 0.05]), LEN.UA)), W: add(Sh, [s * 4, -52, 2]) }),
        props: o.bulg ? [P.box('eq', -17, 17, 40, 47, -78, -34, 'back'), P.box('eq', -3, 3, 0, 40, -76, -70, 'back'), P.box('eq', -3, 3, 0, 40, -42, -36, 'back')] : [],
        hot: quadHot(e, 1),
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  });
  S['reverse-lunge'] = lunge({ rev: true });
  S['walking-lunge'] = lunge({});
  S['bulgarian-split-squat'] = lunge({ bulg: true });
  S['step-up'] = {
    phases: [{ name: 'Step up', dur: 1.5, from: 0, to: 1, e: [0.4, 0.8] }, { name: 'Top', dur: 0.4, from: 1, to: 1, e: [0.8, 0.8] }, { name: 'Step down', dur: 1.6, from: 1, to: 0, e: [0.7, 0.4] }, { name: 'Reset', dur: 0.4, from: 0, to: 0, e: [0.3, 0.3] }],
    cam: { S: 2.45, y0: 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const bx = 45;
      return {
        H: [0, lerp(97, 135, p), lerp(8, 16, p)], a: 3, sh: [0, 0],
        leg: (s) => s === 1 ? { A: [13, bx + ankleY(0), 26], pole: [0, 0, 1], pitch: 0 } : { A: [-13, lerp(ankleY(0), bx + 24, p), lerp(-2, 18, p)], pole: [0, 0, 1], pitch: -lerp(0, 25, p) },
        arm: (s, Sh) => ({ E: add(Sh, mul(norm([s * 0.05, -1, 0.05]), LEN.UA)), W: add(Sh, [s * 4, -52, 2]) }),
        props: [P.box('eq', -26, 26, 0, bx, 14, 60, 'back')],
        hot: [['quads', H(0.8, e)], ['glutes', H(1, e)]],
      };
    },
    post: (sc, pose, J) => dbPair(J, 'z'),
  };
  const sideLunge = (o) => ({
    phases: [{ name: 'Sink right', dur: 1.5, from: 0, to: 1, e: [0.4, 0.7] }, { name: 'Return', dur: 1.2, from: 1, to: 0, e: [0.7, 0.4] }, { name: 'Sink left', dur: 1.5, from: 0, to: -1, e: [0.4, 0.7] }, { name: 'Return', dur: 1.2, from: -1, to: 0, e: [0.7, 0.4] }],
    cam: { S: 2.6, y0: 566, dx: 0 }, theta: -8, range: [-60, 40],
    pose(p, e) {
      const q = Math.abs(p), sd = p >= 0 ? 1 : -1, hy = lerp(90, 54, q), hx = sd * lerp(0, 24, q);
      return {
        H: [hx, hy, 0], a: lerp(2, 14, q), sh: [0, 0],
        leg: (s) => s === sd ? { A: [s * 40, ankleY(0), 2], pole: [s * 1, 0, 0.6], pitch: 0 } : { A: [-sd * (lerp(14, 44, q)), ankleY(o.slide ? 0 : 38), 2], pole: [0, 0, 1], pitch: o.slide ? 0 : lerp(0, 38, q) },
        arm: (s, Sh) => ({ W: [s * 5, Sh[1] - 12, 16], pole: [s * 0.4, -1, 0.5] }),
        hot: [['adductors', H(1, e), -sd], ['quads', H(0.7, e)], ['glutes', H(0.6, e)]],
      };
    },
  });
  S['cossack-squat'] = sideLunge({});
  S['adductor-slide'] = sideLunge({ slide: true });

  /* ---------- sissy squat and reverse nordic ---------- */
  S['sissy-squat'] = {
    phases: SQ_PH, cam: { S: 2.6, y0: 566, dx: 0 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = lerp(2, -30, p), pt = -lerp(0, 40, p), ay = ankleY(pt);
      return {
        H: [0, lerp(90, 58, p), lerp(0, 24, p)], a, sh: [0, 0],
        leg: (s) => ({ A: [s * 12, ay, 0], pole: [0, 0, 1], pitch: pt }),
        arm: (s, Sh) => ({ W: [s * 8, Sh[1] - 12, Sh[2] + 12], pole: [s * 0.5, -1, 0.3] }),
        props: [P.cap('eq', [-40, 0, 14], 2.4, [-40, 150, 14], 2.4, 'back')],
        hot: [['quads', H(1, e)]],
      };
    },
  };
  S['reverse-nordic'] = {
    phases: [{ name: 'Lean back', dur: 1.9, from: 0, to: 1, e: [0.4, 0.9] }, { name: 'Hold', dur: 0.5, from: 1, to: 1, e: [0.9, 0.9] }, { name: 'Come up', dur: 1.5, from: 1, to: 0, e: [0.9, 0.5] }, { name: 'Upright', dur: 0.4, from: 0, to: 0, e: [0.4, 0.4] }],
    cam: { S: 2.8, y0: 566, dx: 6 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const a = -lerp(2, 42, p), ar = a * D2R, K = [0, 8, 4], u = [0, Math.cos(ar), Math.sin(ar)], Hh = add(K, mul(u, 42));
      return {
        H: Hh, a, sh: [0, 0], leg: (s) => ({ K: [s * 10, 8, 4], A: [s * 10, 6, -38], pitch: -80 }),
        arm: (s, Sh) => ({ W: [s * 8, Sh[1] - 10, Sh[2] + 14], pole: [s * 0.4, -1, 0.3] }),
        props: [P.box('eq', -22, 22, 0, 4, -48, 14, 'back')],
        hot: [['quads', H(1, e)]],
      };
    },
  };

  /* ---------- hamstring curls ---------- */
  S['lying-leg-curl'] = {
    phases: PH('Curl', 'Lower', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.45, y0: 540, dx: -26 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const th = lerp(-92, -158, p);
      return {
        H: [0, 54, -8], a: 90, sh: [0, 0], head: [0, 62, 46],
        leg: (s, hip) => { const K = add(hip, [0, 0, -LEN.THIGH]); return { K, A: add(K, mul(dirYZ(th), LEN.SHIN)), pitch: -10 }; },
        arm: (s, Sh) => ({ W: [s * 20, 50, 56], pole: [s * 0.3, -1, 0] }),
        props: [P.box('eq', -17, 17, 36, 44, -64, 54, 'back'), P.box('eq', -3, 3, 0, 36, -60, -54, 'back'), P.box('eq', -3, 3, 0, 36, 44, 50, 'back'), P.box('eq', -22, 22, 0, 3, -70, 60, 'back')],
        hot: [['hamstrings', H(1, e)], ['calves', H(0.2, e)]],
      };
    },
    post: (sc, pose, J) => { const B = J.side[1], a = B.ankle, kn = B.knee, r = add(a, [0, 3, -3]); return [P.cap('pad', add(r, [-17, 0, 0]), 3.6, add(r, [17, 0, 0]), 3.6, 'near'), P.cap('eq', [21, kn[1], kn[2]], 2, add(r, [19, 0, 0]), 2, 'near'), P.disc('eq2', [22, kn[1], kn[2]], 'x', 4.5, 2, 'near')]; },
  };
  S['seated-leg-curl'] = {
    phases: PH('Curl down', 'Return', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.8, y0: 540 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const th = lerp(94, 14, p);
      return {
        H: [0, 50, -8], a: -8, sh: [0, 0],
        leg: (s, hip) => { const K = add(hip, mul(dirYZ(88), LEN.THIGH)); return { K, A: add(K, mul(dirYZ(th), LEN.SHIN)), pitch: 8 }; },
        arm: (s) => ({ W: [s * 21, 56, -12], pole: [s * 0.3, -1, 0] }),
        props: seat(-26, 6).concat([P.box('eq', -17, 17, 44, 118, -34, -26, 'back'), P.box('eq', -18, 18, 54, 60, 6, 40, 'back')]),
        hot: [['hamstrings', H(1, e)]],
      };
    },
    post: (sc, pose, J) => { const B = J.side[1], ank = B.ankle, kn = B.knee, r = add(ank, [0, 5, -6]); return [P.cap('pad', add(r, [-17, 0, 0]), 3.6, add(r, [17, 0, 0]), 3.6, 'near'), P.cap('eq', [21, kn[1], kn[2]], 2, add(r, [19, 0, 0]), 2, 'near'), P.disc('eq2', [22, kn[1], kn[2]], 'x', 4.5, 2, 'near')]; },
  };
  S['cable-leg-curl-standing'] = {
    phases: PH('Curl', 'Lower', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.7, y0: 560, dx: 10 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const th = lerp(-6, -104, p);
      return {
        H: [0, 91, 0], a: 4, sh: [0, 0],
        leg: (s, hip) => s === 1 ? { K: add(hip, mul(dirYZ(-2), LEN.THIGH)), A: add(add(hip, mul(dirYZ(-2), LEN.THIGH)), mul(dirYZ(th), LEN.SHIN)), pitch: -20 } : { A: [-12, ankleY(0), 0], pole: [0, 0, 1], pitch: 0 },
        arm: (s) => ({ W: [s * 7, 116, 46], pole: [s * 0.5, -0.6, -1] }),
        props: [P.box('eq', -24, 24, 0, 6, 62, 78, 'back'), P.box('eq', -22, 22, 6, 150, 66, 76, 'back'), P.ball('eq2', [0, 14, 66], 5, 'back'), P.box('eq', -2, 2, 60, 140, 40, 66, 'back')],
        hot: [['hamstrings', H(1, e)]],
      };
    },
    post: (sc, pose, J) => { const a = J.side[1].ankle; return [P.line('cable', [0, 14, 64], a, 'back'), P.cap('eq2', add(a, [-4, 1, 0]), 3, add(a, [4, 1, 0]), 3, 'near')]; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
