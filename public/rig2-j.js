/* Plate: cardio machines, third pass. Every contact is solved, not eyeballed: the foot sits on the pedal / plate / belt, the hands close on the grips, the hips sit on the saddle or seat. */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, LEN, D2R } = R.U;
  const { H } = X;
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const CYCLE = (name, dur) => [{ name, dur, from: 0, to: 1, e: [0.7, 0.7], lin: true }];
  /* ankle target for a shoe whose ball of the foot rests at point B (the top of the pedal) with the sole pitched `pitch` degrees (toes up is positive) */
  const footOn = (B, pitch) => { const t = pitch * D2R, ff = [0, Math.sin(t), Math.cos(t)], dn = [0, -Math.cos(t), Math.sin(t)]; return add(B, add(mul(ff, -11), mul(dn, -7.8))); };
  const pedalAt = (C, r, ang, s) => { const t = ang + (s === 1 ? 0 : Math.PI); return [s * 11, C[1] + r * Math.sin(t), C[2] + r * Math.cos(t)]; };
  const legs = (C, r, ang, shoeK) => (s) => {
    const pp = pedalAt(C, r, ang, s), th = ang + (s === 1 ? 0 : Math.PI), pitch = (shoeK || 9) * Math.sin(th + 1.0) - 3;
    return { A: footOn([pp[0], pp[1] + 1.4, pp[2]], pitch), pole: [0, 0.2, 1], pitch };
  };
  const pedalProps = (C, r, ang, extra) => {
    const out = [P.disc('eq2', C, 'x', 8.2, 2.2, 'back'), P.disc('eqd', C, 'x', 3.6, 3, 'back')];
    for (const s of [1, -1]) {
      const pp = pedalAt(C, r, ang, s), L = s === 1 ? 'near' : 'far';
      out.push(P.cap('eq', [s * 9.5, C[1], C[2]], 2.0, [s * 11.5, pp[1], pp[2]], 1.8, L));
      out.push(P.box('eqd', s * 11 - 4.6, s * 11 + 4.6, pp[1] - 0.6, pp[1] + 1.4, pp[2] - 6.5, pp[2] + 6.5, L));
    }
    return out;
  };
  const bikeHot = (e) => [['quads', H(1, e)], ['glutes', H(0.6, e)], ['hamstrings', H(0.5, e)], ['calves', H(0.5, e)]];

  /* ---------- upright exercise bike ---------- */
  S['stationary-bike'] = {
    phases: CYCLE('Pedal', 1.0), cam: { S: 2.5, y0: 566 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const C = [0, 38, 16], r = 17, ang = -TAU * p, F = [0, 33, 46], grip = [0, 117, 35];
      const Hp = [0, 112, -7];
      return {
        H: Hp, a: 30, sh: [0, 0], barHands: true,
        leg: legs(C, r, ang, 8),
        arm: (s) => ({ W: [s * 17, grip[1], grip[2]], pole: [s * 0.35, -0.7, -1] }),
        props: [
          P.box('eqd', -31, 31, 0, 3, 34, 70, 'back'), P.box('eqd', -31, 31, 0, 3, -42, -8, 'back'),                       // stabiliser feet
          P.box('eq', -29, 29, 3, 5.5, 36, 68, 'back'), P.box('eq', -29, 29, 3, 5.5, -40, -10, 'back'),
          P.cap('eq', [0, 5, 54], 4.4, [0, 108, 46], 3.6, 'back'),                                                        // front column
          P.cap('eq', [0, 5, -26], 3.8, [0, 40, 14], 4.2, 'back'),                                                        // rear support up to the crank housing
          P.cap('eq', [0, 40, 14], 4.4, [0, 33, 46], 4.4, 'back'),                                                        // main beam to the flywheel
          P.disc('eqd', F, 'x', 22, 12, 'back'), P.disc('eq', F, 'x', 20, 13.5, 'back'), P.disc('eq2', F, 'x', 6, 15, 'back'),   // flywheel housing
          P.cap('eq', [0, 44, 14], 3.1, [0, 92, -9], 3.0, 'back'), P.cap('eq2', [0, 90, -8.5], 2.2, [0, 99, -9.5], 2.2, 'back'),   // seat post
          P.slab('eqd', [0, 99.5, -18], [0, 100.5, 5], 10, 5.2, 'back'),                                                   // saddle
          P.slab('eq', [0, 108, 47], [0, 119, 38.5], 6, 6, 'back'),                                                        // handlebar stem
          P.slab('eq', [0, 121, 46], [0, 142, 36], 17, 8, 'back'), P.slab('scr', [0, 124, 41.4], [0, 139, 34], 13.5, 1.2, 'back'), // console
          P.cap('gbar', [-19, grip[1], grip[2]], 2.0, [19, grip[1], grip[2]], 2.0, 'near'),
          P.cap('gbar', [-19, grip[1], grip[2]], 2.0, [-21, grip[1] - 10, grip[2] - 7], 1.9, 'far'), P.cap('gbar', [19, grip[1], grip[2]], 2.0, [21, grip[1] - 10, grip[2] - 7], 1.9, 'near'),
          P.cap('eq', [0, 117, 40], 2.4, [0, 117, 35], 2.4, 'back'),
        ].concat(pedalProps(C, r, ang)),
        hot: bikeHot(e),
      };
    },
  };

  /* ---------- road bike: same bike as before, with the feet now sitting on the pedals ---------- */
  {
    const o = S['cycling-outdoor'], f = o.pose, C = [0, 28, -8], r = 17.5;
    o.pose = (p, e) => { const q = f(p, e); q.leg = legs(C, r, -TAU * p, 7); return q; };
  }

  /* ---------- assault bike: fan flywheel, long levers that push and pull against the legs ---------- */
  S['assault-bike'] = {
    phases: CYCLE('Pedal and drive', 0.8), cam: { S: 2.3, y0: 566 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const C = [0, 36, 16], r = 17, ang = -TAU * p, fan = [0, 36, 58];
      const sw = Math.sin(ang + 0.6);                                   // levers swing against the opposite leg
      const lever = (s) => { const b = 10 * D2R * sw * (s === 1 ? 1 : -1), piv = [s * 17, 48, 28]; return { piv, b, hand: [s * 17, piv[1] + 62 * Math.cos(b), piv[2] + 62 * Math.sin(b)] }; };
      const blades = [], fa = TAU * 2 * p;
      for (let i = 0; i < 12; i++) { const t = fa + i * TAU / 12; blades.push(P.line('cable', fan, [0, fan[1] + 27 * Math.sin(t), fan[2] + 27 * Math.cos(t)], 'back')); }
      const lv = [lever(1), lever(-1)], sway = 4 * sw;
      const ps = [];
      for (const s of [1, -1]) { const L = lever(s), n = s === 1 ? 'near' : 'far'; ps.push(
        P.cap('eq', [s * 17, 48, 28], 3.3, [s * 17, L.hand[1] - 4, L.hand[2]], 2.7, n),
        P.cap('gbar', [s * 17, L.hand[1] - 5, L.hand[2] - 3], 2.4, [s * 17, L.hand[1] + 1, L.hand[2] + 2], 2.5, n)); }
      return {
        H: [0, 108, -14 + sway * 0.4], a: 18 + 4 * sw, sh: [0, 0], barHands: true,
        leg: legs(C, r, ang, 8),
        arm: (s) => ({ W: lever(s).hand, pole: [s * 0.25, -0.7, -1] }),
        props: [
          P.box('eqd', -33, 33, 0, 3, 46, 86, 'back'), P.box('eqd', -33, 33, 0, 3, -44, -10, 'back'),
          P.box('eq', -30, 30, 3, 5.5, 48, 84, 'back'), P.box('eq', -30, 30, 3, 5.5, -42, -12, 'back'),
          P.cap('eq', [0, 5, -26], 4.2, [0, 42, 16], 4.4, 'back'), P.cap('eq', [0, 42, 16], 4.6, [0, 38, 58], 4.6, 'back'),     // frame
          P.cap('eq', [0, 5, 70], 4.4, [0, 38, 58], 4.4, 'back'),
          P.disc('eqd', fan, 'x', 32, 16, 'back'), P.disc('eq', fan, 'x', 30.5, 17.5, 'back'), P.disc('tire', fan, 'x', 28, 8, 'back'), ...blades, P.disc('eq2', fan, 'x', 5.5, 20, 'back'),   // fan cage
          P.cap('eq', [0, 44, 14], 3.1, [0, 96, -12], 3.0, 'back'), P.slab('eqd', [0, 103.5, -23], [0, 104.5, 1], 11, 5.4, 'back'), P.cap('eq2', [0, 94, -11.5], 2.2, [0, 103, -12.5], 2.2, 'back'),   // seat
          P.cap('eq', [0, 44, 64], 4, [0, 100, 56], 3.6, 'back'), P.slab('eq', [0, 100, 56], [0, 120, 50], 17, 7.5, 'back'), P.slab('scr', [0, 103, 52], [0, 117, 47.2], 13, 1.2, 'back'),   // console
        ].concat(pedalProps(C, r, ang)).concat(ps),
        hot: [['quads', H(0.9, e)], ['shoulders', H(0.7, e)], ['triceps', H(0.6, e)], ['lats', H(0.5, e)], ['glutes', H(0.6, e)]],
      };
    },
  };

  /* ---------- rowing machine ---------- */
  {
    const railY = (z) => 12 + (z + 88) * (14 / 144), NOSE = [0, 38, 80], BALL = [0, 28.8, 58];
    const stroke = (c) => {
      const seg = (a, b, x) => ease((x - a) / (b - a));
      if (c < 0.36) return { leg: seg(0, 0.25, c), back: seg(0.12, 0.34, c), arm: seg(0.24, 0.36, c) };
      if (c < 0.42) return { leg: 1, back: 1, arm: 1 };
      if (c < 0.95) return { leg: 1 - seg(0.62, 0.95, c), back: 1 - seg(0.5, 0.68, c), arm: 1 - seg(0.42, 0.52, c) };
      return { leg: 0, back: 0, arm: 0 };
    };
    S['rowing-machine'] = {
      phases: [{ name: 'Drive: legs, then back, then arms', dur: 0.9, from: 0, to: 0.36, e: [0.85, 0.85], lin: true }, { name: 'Finish', dur: 0.25, from: 0.36, to: 0.42, e: [0.7, 0.7], lin: true },
        { name: 'Recover: arms, back, then knees', dur: 1.6, from: 0.42, to: 0.95, e: [0.4, 0.4], lin: true }, { name: 'Catch', dur: 0.2, from: 0.95, to: 1, e: [0.4, 0.4], lin: true }],
      cam: { S: 2.0, y0: 540 }, theta: -85, range: [-105, -15],
      pose(c, e) {
        const k = stroke(c), sz = lerp(12, -38, k.leg), a = lerp(36, -26, k.back), ar = a * D2R;
        const seatTop = railY(sz) + 10, Hh = [0, seatTop + 12.5, sz - 1];
        const u = [0, Math.cos(ar), Math.sin(ar)], zax = [0, -Math.sin(ar), Math.cos(ar)], T = add(Hh, mul(u, 50));
        const hand = (s) => {
          const Sh = add(T, [s * 20, 0, 0]), straight = add(Sh, mul(norm(sub(NOSE, Sh)), 51));
          const chest = add(add(add(T, mul(u, -20)), mul(zax, 14)), [s * 9, 0, 0]);
          return [lerp(straight[0], chest[0], k.arm), lerp(straight[1], chest[1], k.arm), lerp(straight[2], chest[2], k.arm)];
        };
        const hm = hand(1), hand0 = [0, hm[1], hm[2]];
        return {
          H: Hh, a, sh: [0, 0], barHands: true,
          leg: (s) => ({ A: footOn([s * 11, BALL[1], BALL[2]], 37), pole: [0, 1, 0.25], pitch: 37 }),
          arm: (s) => ({ W: hand(s), pole: [s * 0.3, -0.6, -1] }),
          props: [
            P.cap('eq', [0, railY(-88), -88], 3.4, [0, railY(62), 62], 3.4, 'back'), P.cap('eq', [-7, railY(-88) + 1, -88], 1.1, [-7, railY(62) + 1, 62], 1.1, 'back'),   // rail
            P.box('eqd', -22, 22, 0, 4, -97, -80, 'back'), P.cap('eq', [0, 4, -88], 3.0, [0, railY(-88) - 1, -88], 3.0, 'back'),   // rear foot
            P.box('eqd', -20, 20, 0, 4, 34, 52, 'back'), P.cap('eq', [0, 4, 43], 3.2, [0, railY(43) - 1, 43], 3.2, 'back'),       // front stand
            P.box('eq2', -8, 8, railY(sz) + 1.5, railY(sz) + 4.6, sz - 7, sz + 7, 'back'), P.disc('eqd', [0, railY(sz) + 2.5, sz - 5], 'x', 2.2, 17, 'back'), P.disc('eqd', [0, railY(sz) + 2.5, sz + 5], 'x', 2.2, 17, 'back'),   // carriage and wheels
            P.slab('eqd', [0, seatTop - 1.2, sz - 15], [0, seatTop - 1.2, sz + 13], 15, 4.4, 'back'),                               // seat
            P.slab('eq', [0, 18, 46], [0, 40, 70], 17, 3.6, 'back'), P.slab('eqd', [0, 18, 46], [0, 22, 52], 17, 5, 'back'),      // foot stretcher and heel cups
            P.cap('eq', [-9, 26, 56], 1.2, [9, 26, 56], 1.2, 'back'),
            P.disc('eqd', [0, 40, 98], 'x', 27, 20, 'back'), P.disc('eq', [0, 40, 98], 'x', 24, 21.5, 'back'), P.disc('eq2', [0, 40, 98], 'x', 8, 23, 'back'),   // flywheel cage
            P.cap('eq', [0, 62, 98], 3.2, [0, 90, 88], 2.8, 'back'), P.slab('eq', [0, 90, 88], [0, 108, 83], 15, 6.5, 'back'), P.slab('scr', [0, 92, 84.5], [0, 105.5, 80], 11.5, 1.2, 'back'),   // monitor
            P.line('cable', NOSE, [0, hand0[1], hand0[2]], 'back'), P.ball('eq2', NOSE, 2.4, 'back'),
            P.cap('gbar', [-13, hm[1], hm[2]], 1.9, [13, hm[1], hm[2]], 1.9, 'near'),
          ],
          hot: [['quads', H(0.8, e)], ['lats', H(0.8, e)], ['midback', H(0.6, e)], ['biceps', H(0.4, e)], ['hamstrings', H(0.4, e)], ['glutes', H(0.5, e)]],
        };
      },
    };
  }

  /* ---------- elliptical: the handles are driven by the pedals, so they swing exactly with the opposite leg ---------- */
  S['elliptical'] = {
    phases: CYCLE('Glide', 1.3), cam: { S: 2.3, y0: 566, dx: 4 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const ph = (s) => TAU * p + (s === 1 ? 0 : Math.PI), HUB = [0, 38, -36], PIV = [0, 150, 40], ARM = 126, GRIP = 32;
      const F = (s) => [s * 11, 24 + 6.5 * Math.sin(ph(s)), 1 + 21 * Math.cos(ph(s))];                 // centre of each foot platform
      const dirOf = (s) => { const f = F(s), front = [0, f[1] - 2, f[2] + 15]; return norm(sub(front, PIV)); };
      const hand = (s) => { const d = dirOf(s); return [s * 17, PIV[1] + d[1] * GRIP, PIV[2] + d[2] * GRIP]; };
      const ped = [];
      for (const s of [1, -1]) {
        const f = F(s), L = s === 1 ? 'near' : 'far', d = dirOf(s), Lb = add(PIV, mul(d, ARM)), front = [s * 11, f[1] - 2, f[2] + 15];
        ped.push(
          P.slab('eqd', [0, f[1] - 1.8, f[2] - 16], [0, f[1] - 1.8, f[2] + 16], 12, 3.4, L),                    // foot platform
          P.cap('eq', [s * 11, f[1] - 3, f[2] - 15], 2.4, [s * 8, HUB[1] + 4, HUB[2] + 4], 2.9, L),                    // rod back to the drive
          P.cap('eq', [s * 17, PIV[1], PIV[2]], 2.9, [s * 17, Lb[1], Lb[2]], 2.5, L),                                 // swing arm
          P.cap('eq', [s * 17, Lb[1], Lb[2]], 2.3, front, 2.3, L),                                                    // link to the platform
          P.cap('gbar', [s * 17, hand(s)[1] + 4, hand(s)[2] - 1], 2.3, [s * 17, hand(s)[1] - 5, hand(s)[2] + 1], 2.3, L));
      }
      const hy = 110.5 + 1.2 * Math.cos(2 * TAU * p);
      return {
        H: [0, hy, -3], a: 7, sh: [0, 0], barHands: true,
        leg: (s) => { const f = F(s), pitch = -3 + 5 * Math.cos(ph(s)); return { A: footOn([f[0], f[1] + 1.8 + 0.4, f[2] + 4], pitch), pole: [0, 0.1, 1], pitch }; },
        arm: (s) => ({ W: hand(s), pole: [s * 0.3, -0.6, -1] }),
        props: [
          P.box('eqd', -35, 35, 0, 3, -60, -14, 'back'), P.box('eqd', -35, 35, 0, 3, 28, 68, 'back'), P.box('eq', -32, 32, 3, 5.5, -58, -16, 'back'), P.box('eq', -32, 32, 3, 5.5, 30, 66, 'back'),
          P.cap('eq', [-25, 4, -30], 3.6, [-25, 4, 50], 3.6, 'back'), P.cap('eq', [25, 4, -30], 3.6, [25, 4, 50], 3.6, 'back'),                           // side rails of the base
          P.disc('eqd', HUB, 'x', 24, 26, 'back'), P.disc('eq', HUB, 'x', 21, 27.5, 'back'), P.disc('eq2', HUB, 'x', 8, 29, 'back'),                       // drive housing
          P.cap('eq', [0, 5, 54], 5, [0, 146, 41], 4, 'back'),                                                                                              // front column
          P.slab('eq', [0, 146, 41], [0, 168, 31], 20, 9, 'back'), P.slab('scr', [0, 149, 36.5], [0, 165, 29], 15, 1.2, 'back'),                            // console
          P.cap('eq', [-17, PIV[1], PIV[2]], 3.4, [17, PIV[1], PIV[2]], 3.4, 'back'),                                                                       // pivot axle
        ].concat(ped),
        hot: [['quads', H(0.7, e)], ['glutes', H(0.7, e)], ['hamstrings', H(0.5, e)], ['calves', H(0.5, e)], ['shoulders', H(0.3, e)]],
      };
    },
  };

  /* ---------- stair climber: two independent pedals on hydraulic posts ---------- */
  function stairs(dur) {
    return {
      phases: CYCLE('Step', dur), cam: { S: 2.45, y0: 566 }, theta: -85, range: [-105, -15],
      pose(p, e) {
        const st = (s) => 0.5 + 0.5 * Math.sin(TAU * p + (s === 1 ? 0 : Math.PI)), yP = (s) => 16 + 26 * st(s);          // platform height
        const pz = 0, ankles = [1, -1].map((s) => footOn([s * 11, yP(s) + 1.2, pz + 6], 0));
        const hy = Math.min(...ankles.map((A) => A[1] + Math.sqrt(84 * 84 - (A[2] - 0) * (A[2] - 0)))) - 1;
        const rail = [0, 117, 38];
        const ps = [];
        for (const s of [1, -1]) {
          const L = s === 1 ? 'near' : 'far', y = yP(s);
          ps.push(P.box('eqd', s * 11 - 11.5, s * 11 + 11.5, y - 2.2, y + 1.2, pz - 14, pz + 20, L),
            P.cap('eq2', [s * 11, 8, pz + 3], 3.4, [s * 11, y - 3, pz + 3], 3.0, L),                                      // hydraulic post
            P.cap('eq', [s * 11, 5, pz + 3], 4.4, [s * 11, 16, pz + 3], 4.4, L),                                           // its sleeve
            P.cap('eq', [s * 11, 12, -26], 2.6, [s * 11, y - 1, pz - 12], 2.2, L));                                        // rear link arm
        }
        return {
          H: [0, hy, -1], a: 8, sh: [0, 0], barHands: true,
          leg: (s) => ({ A: ankles[s === 1 ? 0 : 1], pole: [0, 0.2, 1], pitch: 0 }),
          arm: (s) => ({ W: [s * 27, rail[1], rail[2]], pole: [s * 0.3, -0.6, -1] }),
          props: ps.concat([
            P.box('eqd', -34, 34, 0, 3.4, -38, 54, 'back'), P.box('eq', -31, 31, 3.4, 6, -34, 50, 'back'),
            P.cap('eq', [-27, 6, 52], 3.8, [-27, 100, 50], 3.4, 'back'), P.cap('eq', [27, 6, 52], 3.8, [27, 100, 50], 3.4, 'back'),            // front posts
            P.cap('eq', [-27, 100, 50], 3.0, [-27, 119, 40], 3.0, 'back'), P.cap('eq', [27, 100, 50], 3.0, [27, 119, 40], 3.0, 'back'),         // arms up to the rails
            P.cap('eq', [0, 100, 50], 5, [0, 128, 48], 5, 'back'), P.slab('eq', [0, 126, 49], [0, 148, 38], 26, 9, 'back'), P.slab('scr', [0, 129, 44.5], [0, 144, 37], 20, 1.2, 'back'),
            P.cap('gbar', [-27, 117, 38], 2.3, [-27, 123, 36], 2.3, 'far'), P.cap('gbar', [27, 117, 38], 2.3, [27, 123, 36], 2.3, 'near'),
            P.cap('gbar', [-27, 110, 40], 2.0, [27, 110, 40], 2.0, 'back'),
          ]),
          hot: [['glutes', H(1, e)], ['quads', H(0.8, e)], ['calves', H(0.6, e)], ['hamstrings', H(0.5, e)]],
        };
      },
    };
  }
  S['stair-climber'] = stairs(1.4);
  S['stair-climber-intervals'] = stairs(0.8);

  /* ---------- swimming: front crawl with body roll, an arm pulling under water while the other recovers over it, and a flutter kick ---------- */
  S['swimming'] = {
    phases: CYCLE('Stroke', 2.2), cam: { S: 2.15, y0: 480 }, theta: -85, range: [-120, -50],
    shadow: { c: [0, 0, 0], rx: 1, rz: 1 },
    pose(p, e) {
      const WL = 46, roll = 24 * Math.sin(TAU * p), Hh = [0, WL - 9, -10];
      const arm = (s, Sh) => {
        const f = TAU * (p + (s === 1 ? 0 : 0.5)), sn = Math.sin(f), g = f - 0.35 * Math.sin(2 * f);   // g slows the hand at both ends of the stroke, so it turns by dipping at the front and lifting at the hip instead of reversing on the spot
        return { W: [Sh[0] + s * (5 - 4 * sn), Sh[1] - 5 - 19 * sn, Sh[2] + 6 + 46 * Math.cos(g)], pole: [s * 0.9, 0.5, -0.25] };
      };
      const hl = Math.sin(TAU * p), turn = Math.max(0, Math.abs(hl) - 0.55) / 0.45;
      return {
        H: Hh, a: 90, roll, sh: [0, 0],
        head: [0, Hh[1] + 4 + 3 * turn, Hh[2] + 70],
        arm,
        leg: (s, hip) => {                                   // straight trailing leg, thigh and shin swing together with the shin lagging a little
          const ph = TAU * 2 * p + (s === 1 ? 0 : Math.PI), t = (3 * Math.sin(ph) - 1) * D2R, c = (5 * Math.sin(ph - 0.9) - 7) * D2R;
          const K = [hip[0], hip[1] + 42 * Math.sin(t), hip[2] - 42 * Math.cos(t)];
          return { K, A: [K[0], K[1] + 44 * Math.sin(c), K[2] - 44 * Math.cos(c)], pitch: 200 };
        },
        props: [
          P.box('water', -42, 42, 14, WL, -105, 100, 'back'),
          P.box('wline', -42, 42, WL, WL + 0.6, -105, 100, 'top'),
        ],
        hot: [['lats', H(0.8, e)], ['shoulders', H(0.7, e)], ['triceps', H(0.5, e)], ['quads', H(0.4, e)], ['glutes', H(0.4, e)], ['chest', H(0.4, e)]],
      };
    },
  };

  /* ---------- mountain climber: the feet are placed, not swung, so the driving foot lifts off the floor and the planted toes stay on it ---------- */
  {
    const base = S['mountain-climber'], plank = (al) => { const r = al * D2R, d = [0, Math.sin(r), Math.cos(r)], O = [0, 14.6, -126]; return { O, H: add(O, mul(d, 85.5)), a: 90 - al }; };
    S['mountain-climber'] = Object.assign({}, base, {
      pose(p, e) {
        const b = plank(20), m = Math.cos(Math.PI * p), floor = P.box('eq', -27, 27, 0, 1.5, -150, 70, 'back');
        return {
          H: b.H, a: b.a, sh: [0, 0], head: null,
          leg: (s) => {
            const f = ease(s === 1 ? (1 + m) / 2 : (1 - m) / 2), z = lerp(-126, -52, f);
            return { A: [s * 10, 14.6 + 14 * Math.sin(Math.PI * f) + 4 * f, z], pole: [s * 0.12, 0.4, 1], pitch: lerp(-72, -55, f) };
          },
          arm: (s) => ({ W: [s * 23, 3, 2], pole: [s * 0.6, 0.2, -1] }),
          props: [floor], hot: [['abs', H(1, e)], ['obliques', H(0.6, e)], ['shoulders', H(0.5, e)], ['quads', H(0.4, e)]],
        };
      },
    });
  }

  /* ---------- jump rope: a tall bounce on the toes; the rope is a true circle around the hands that passes under the feet at the top of each hop ---------- */
  S['jump-rope'] = {
    phases: CYCLE('Jump', 0.75), cam: { S: 2.2, y0: 566 }, theta: -38, range: [-80, 10],
    pose(p, e) {
      const j = 9 * Math.max(0, Math.sin(TAU * (p - 0.25))), ar = TAU * p;
      return {
        H: [0, 99.5 + j, 0], a: 1, sh: [0, 0],
        leg: (s) => ({ A: [s * 7.5, 14.5 + j, 0], pole: [0, 0, 1], pitch: -30 + 25 * (j / 9) }),
        arm: (s) => ({ W: [s * 27, 103 + 2 * Math.sin(ar), 7 + 4 * Math.cos(ar)], pole: [s * 1, -0.5, -0.3] }),
        props: [P.box('eq', -34, 34, 0, 1, -40, 40, 'back')], hot: [['calves', H(1, e)], ['quads', H(0.4, e)], ['shoulders', H(0.3, e)], ['forearms', H(0.5, e)]],
      };
    },
    post: (sc, pose, J, p) => {
      const A = J.side[1].W, B = J.side[-1].W, th = TAU * p, c = [0, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], R = c[1] - 0.8, out = [], n = 18;
      let prev = A;
      for (let i = 1; i <= n; i++) {
        const f = i / n, w = Math.sin(Math.PI * f), q = [lerp(A[0], B[0], f), c[1] + R * w * Math.cos(th), c[2] + R * w * Math.sin(th) * 0.9];
        q[1] = Math.max(0.8, q[1]); out.push(P.cap('rope', prev, 0.8, q, 0.8, 'near')); prev = q;
      }
      return out;
    },
  };

  /* battle ropes: the same waves, drawn as real rope rather than a hairline */
  if (S['battle-ropes']) {
    S['battle-ropes'].post = (sc, pose, J, p) => {
      const out = [];
      for (const s of [1, -1]) {
        const W = J.side[s].W, ph = TAU * p + (s === 1 ? 0 : Math.PI); let prev = add(W, [0, 0, 2]);
        for (let i = 1; i <= 14; i++) { const f = i / 14, q = [s * 11, lerp(W[1], 40, f) + 16 * Math.sin(ph - f * 5.5) * (1 - f * 0.4), lerp(W[2], 130, f)]; out.push(P.cap('rope', prev, 1.6, q, 1.6, s === 1 ? 'near' : 'far')); prev = q; }
      }
      return out;
    };
  }
})(window);
