/* Plate: more exercise demos, batch E (calves, hips, abductors and adductors). */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, ankleY, LEN, D2R } = R.U;
  const { PH, H, seat, dbPair, stand, stdLegs, barProps } = X;
  const CALF_PH = PH('Rise', 'Lower', { d: [1.2, 0.7, 1.9, 0.6], hold: 'Squeeze', rest: 'Stretch' });
  const hang = (s, Sh) => ({ E: add(Sh, mul(norm([s * 0.05, -1, 0]), LEN.UA)), W: add(Sh, [s * 3, -53, 1]) });

  /* ---------- seated calves ---------- */
  const seatedCalf = (o) => ({
    phases: CALF_PH, cam: { S: 3.0, y0: 548 }, theta: -85, range: [-100, -20],
    pose(p, e) {
      const pt = -lerp(0, 52, p), ay = ankleY(pt), hy = ay + 45;
      return {
        H: [0, hy, 0], a: 2, sh: [0, 0], barHands: false,
        leg: (s, hip) => { const K = add(hip, [0, -1, 42]); return { K, A: [K[0] + s * 1, ay, K[2] + 1.5], pitch: pt }; },
        arm: (s) => o.db ? { W: [s * 12, hy + 8, 36], pole: [s * 0.3, -1, 0] } : { W: [s * 20, hy - 2, 30], pole: [s * 0.3, -1, 0] },
        props: seat(-20, 16).concat(o.db ? [] : [P.box('eq', -20, 20, hy + 1, hy + 9, 26, 52, 'back'), P.box('eq', -4, 4, hy + 9, hy + 70, 36, 42, 'back')]),
        hot: [['calves', H(1, e)]],
      };
    },
    post: o.db ? (sc, pose, J) => [1, -1].reduce((a, s) => a.concat(P.dumbbell([s * 10, J.side[s].knee[1] + 6, 40], 'x', s === 1 ? 'near' : 'far', 7)), []) : null,
  });
  S['seated-calf-raise'] = seatedCalf({});
  S['seated-calf-bodyweight'] = seatedCalf({ db: true });
  S['single-leg-bodyweight-calf-raise'] = {
    phases: CALF_PH, cam: { S: 3.0, y0: 562 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const pt = -lerp(0, 55, p), ay = 6 + ankleY(pt);
      return {
        H: [0, ay + 84.5, 0], a: 1, sh: [0, 0],
        leg: (s, hip) => s === 1 ? { A: [10, ay, 2], pole: [0, 0, 1], pitch: pt } : { K: add(hip, mul(dirYZ(-8), LEN.THIGH)), A: add(add(hip, mul(dirYZ(-8), LEN.THIGH)), mul(dirYZ(-100), LEN.SHIN)), pitch: -30 },
        arm: (s, Sh) => s === 1 ? { W: [14, Sh[1] - 14, 26], pole: [0.3, -1, 0] } : hang(s, Sh),
        props: [P.box('eq', -24, 24, 0, 6, -10, 14, 'back'), P.box('eq', -30, 30, 0, 150, 30, 36, 'back')],
        hot: [['calves', H(1, e)]],
      };
    },
  };
  S['calf-press-smith'] = {
    phases: CALF_PH, cam: { S: 2.55, y0: 566 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const pt = -lerp(0, 55, p), ay = 6 + ankleY(pt), Hh = [0, ay + 84.5, 0], bar = [0, Hh[1] + 47, 1];
      return {
        H: Hh, a: 2, sh: [0, 0], barHands: true, leg: (s) => ({ A: [s * 14, ay, 2], pole: [0, 0, 1], pitch: pt }),
        arm: (s) => ({ W: [s * 38, bar[1] - 1, bar[2] - 1], pole: [0, -1, -0.45] }),
        props: barProps(bar, { half: 62, R: 13, th: 4.5 }).concat([-1, 1].map((s) => P.cap('eq', [s * 74, 0, 1], 2.4, [s * 74, 215, 1], 2.4, 'back')), [P.box('eq', -26, 26, 0, 6, -10, 16, 'back'), P.box('eq', -80, 80, 0, 3, -20, 24, 'back')]),
        hot: [['calves', H(1, e)]],
      };
    },
  };
  S['donkey-calf-raise'] = {
    phases: CALF_PH, cam: { S: 2.6, y0: 548, dx: -4 }, theta: -90, range: [-100, -20],
    pose(p, e) {
      const pt = -lerp(0, 55, p), ay = 6 + ankleY(pt);
      return {
        H: [0, ay + 84, -4], a: 82, sh: [0, 0], leg: (s) => ({ A: [s * 13, ay, -2], pole: [0, 0, 1], pitch: pt }),
        arm: (s) => ({ W: [s * 20, 88, 52], pole: [s * 0.3, -1, 0] }),
        props: [P.box('eq', -24, 24, 0, 6, -10, 14, 'back'), P.box('eq', -20, 20, 78, 90, 44, 90, 'back'), P.box('eq', -3, 3, 0, 78, 52, 58, 'back'), P.box('eq2', -15, 15, ay + 90, ay + 100, -24, 4, 'near')],
        hot: [['calves', H(1, e)]],
      };
    },
  };

  /* ---------- seated abduction and adduction machines ---------- */
  const hipMachine = (o) => ({
    phases: PH(o.add ? 'Squeeze legs together' : 'Open legs out', 'Return', { d: [1.3, 0.7, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 548 }, theta: -12, range: [-70, 30],
    pose(p, e) {
      const xk = o.add ? lerp(32, 15, p) : lerp(15, 32, p), hy = 53;
      return {
        H: [0, hy, 0], a: 0, sh: [0, 0], barHands: false,
        leg: (s, hip) => { const dx = xk - 9.5, K = add(hip, [s * dx, -1.4, Math.sqrt(42 * 42 - dx * dx - 2)]); return { K, A: [K[0] + s * 2, ankleY(0), K[2] + 1], pitch: 0 }; },
        arm: (s) => ({ W: [s * 22, hy + 8, 6], pole: [s * 0.4, -1, 0] }),
        props: seat(-24, 18).concat([P.box('eq', -17, 17, 44, 118, -30, -24, 'back')]).concat([-1, 1].map((s) => o.add ? P.box('eq', s * (xk - 4) - 2.5, s * (xk - 4) + 2.5, hy - 6, hy + 4, 24, 54, 'back') : P.box('eq', s * (xk + 5) - 2.5, s * (xk + 5) + 2.5, hy - 6, hy + 4, 24, 54, 'back'))),
        hot: o.add ? [['adductors', H(1, e)]] : [['abductors', H(1, e)], ['glutes', H(0.4, e)]],
      };
    },
  });
  S['seated-hip-abduction-machine'] = hipMachine({});
  S['hip-adduction-machine'] = hipMachine({ add: true });
  const cableHip = (o) => ({
    phases: PH(o.add ? 'Sweep across' : 'Sweep out', 'Return', { d: [1.3, 0.6, 2.0, 0.4], hold: 'Squeeze' }), cam: { S: 2.6, y0: 566 }, theta: -12, range: [-70, 30],
    pose(p, e) {
      const x = o.add ? lerp(34, -6, p) : lerp(-4, 36, p), ay = 15;
      return Object.assign({}, stand, {
        a: 0, leg: (s) => s === 1 ? { A: [x, ay, 4], pole: [0, 0, 1], pitch: 0 } : { A: [-13, ankleY(0), 2], pole: [0, 0, 1], pitch: 0 },
        arm: (s, Sh) => s === 1 ? hang(s, Sh) : { W: [-30, Sh[1] - 12, 10], pole: [-0.4, -1, 0] },
        props: [P.box('eq', o.tx - 24, o.tx + 24, 0, 5, -8, 8, 'back'), P.box('eq', o.tx - 3, o.tx + 3, 5, 150, -4, 4, 'back'), P.ball('eq2', [o.tx, 14, 0], 5, 'back')].concat(o.add ? [] : []),
        hot: o.add ? [['adductors', H(1, e), 1]] : [['abductors', H(1, e), 1], ['glutes', H(0.5, e)]],
      });
    },
    post: (sc, pose, J) => { const a = J.side[1].ankle; return [P.line('cable', [o.tx, 14, 0], a, 'back'), P.cap('eq2', add(a, [-4, 1, 0]), 3, add(a, [4, 1, 0]), 3, 'near')]; },
  });
  S['cable-hip-adduction'] = cableHip({ add: true, tx: 80 });
  S['cable-hip-abduction'] = cableHip({ tx: -70 });

  /* banded side steps */
  const bandWalk = (o) => ({
    phases: [{ name: 'Step right, then left', dur: 3.2, from: 0, to: 2, e: [0.7, 0.7], lin: true }, { name: 'Step back', dur: 3.2, from: 2, to: 0, e: [0.7, 0.7], lin: true }],
    cam: { S: 2.8, y0: 566, dx: -4 }, theta: -8, range: [-60, 40],
    pose(p, e) {
      const q = Math.min(2, Math.max(0, p)), s1 = Math.min(1, q), s2 = Math.max(0, q - 1);
      const sm = (v) => 0.5 - 0.5 * Math.cos(Math.PI * v);
      const xr = lerp(13, 36, sm(s1)), xl = lerp(-13, 10, sm(s2)), hx = lerp(0, 22, (sm(s1) + sm(s2)) / 2);
      return {
        H: [hx, 76, 2], a: 8, sh: [0, 0],
        leg: (s) => ({ A: [s === 1 ? xr : xl, ankleY(0), 2], pole: [s * 0.5, 0, 1], pitch: 0 }),
        arm: (s, Sh) => ({ W: [Sh[0] + s * 5, Sh[1] - 20, 14], pole: [s * 0.5, -1, 0.3] }),
        hot: [['abductors', H(1, e)], ['glutes', H(0.7, e)]],
      };
    },
    post: (sc, pose, J) => { const a = J.side[1].knee, b = J.side[-1].knee; return [P.cap('eq2', add(a, [0, o.low ? -22 : 0, 0]), o.low ? 1.4 : 1.1, add(b, [0, o.low ? -22 : 0, 0]), o.low ? 1.4 : 1.1, 'near')]; },
  });
  S['banded-lateral-walk'] = bandWalk({});
  S['lateral-band-walk-heavy'] = bandWalk({ low: true });

  /* side-lying hip abduction */
  S['side-lying-hip-abduction'] = {
    phases: PH('Lift the top leg', 'Lower', { d: [1.3, 0.7, 2.0, 0.4], hold: 'Hold' }), cam: { S: 2.3, y0: 540, dx: 0 }, theta: -80, range: [-120, -40], shadow: { c: [0, 0, -30], rx: 40, rz: 100 },
    pose(p, e) {
      const ab = lerp(2, 38, p) * D2R;
      return {
        H: [0, 12, 0], a: -90, roll: 90, sh: [0, 0], barHands: false,
        leg: (s, hip) => s === -1 ? { A: add(hip, [0, 82 * Math.sin(ab), 82 * Math.cos(ab)]), pole: [0, 1, 0.3], pitch: 0 } : { A: add(hip, [0, 0, 80]), pole: [0, 1, 0], pitch: 0 },
        arm: (s, Sh) => s === 1 ? { W: add(Sh, [14, 4, 14]), pole: [0, 1, 0] } : { W: add(Sh, [20, -8, -4]), pole: [0, 1, 0] },
        props: [P.box('eq', -40, 40, 0, 1.5, -90, 125, 'back')],
        hot: [['abductors', H(1, e), -1], ['glutes', H(0.7, e), -1]],
      };
    },
  };
  S['copenhagen-plank'] = {
    phases: PH('Lift the bottom leg', 'Lower', { d: [1.4, 1.0, 2.0, 0.4], hold: 'Hold' }), cam: { S: 2.3, y0: 540, dx: -30 }, theta: -80, range: [-120, -40], shadow: { c: [0, 0, -30], rx: 40, rz: 100 },
    pose(p, e) {
      const lift = lerp(0, 30, p);
      return {
        H: [0, 40, -4], a: -90, roll: 90, sh: [0, 0],
        leg: (s, hip) => s === -1 ? { A: [hip[0], 47, 88], pole: [0, 1, 0], pitch: 0 } : { A: add(hip, [0, lift, 82]), pole: [0, -1, 0], pitch: 0 },
        arm: (s, Sh) => s === 1 ? { W: [Sh[0] + 4, 3, Sh[2] + 18], pole: [0, 1, 0.6] } : { W: add(Sh, [14, -6, 6]), pole: [0, 1, 0] },
        props: [P.box('eq', -8, 8, 38, 44, 64, 112, 'back'), P.box('eq', -8, 8, 0, 38, 106, 112, 'back'), P.box('eq', -8, 8, 0, 38, 66, 72, 'back'), P.box('eq', -40, 40, 0, 1.5, -90, 125, 'back')],
        hot: [['adductors', H(1, e), 1], ['obliques', H(0.7, e)]],
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
