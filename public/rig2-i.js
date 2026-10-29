/* Plate: cardio, rebuilt. A real gait cycle (stance and swing, feet matched to the belt speed, hips that rise and fall like a walker's or a runner's)
   and proper machines. Loaded after the older scenes so these replace them. */
(function (root) {
  'use strict';
  const R = root.Rig2; if (!R || !R.X) return;
  const S = R.SCENES, P = R.P, X = R.X, { add, sub, mul, norm, lerp, dirYZ, LEN, D2R } = R.U;
  const { H } = X;
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const CYCLE = (name, dur) => [{ name, dur, from: 0, to: 1, e: [0.7, 0.7], lin: true }];
  const wrap = (x) => x - Math.floor(x);
  /* ankle height that puts the sole flat on the floor for a given foot pitch (deg): heel or toe, whichever is lower */
  const ankleG = (deg) => { const t = deg * D2R, c = Math.cos(t), s = Math.sin(t); return Math.max(5 * s + 4 * c + 4, -14 * s + 4.6 * c + 3); };

  /* ---------- the gait ---------- */
  function gait(o) {
    const Lk = 85.4, ds = o.ds, run = !!o.run, gnd = o.ground || (() => 0);
    const stance = (u) => { const hs = o.hs, to = o.to; return u < 0.25 ? lerp(hs, 0, ease(u / 0.25)) : u < 0.55 ? 0 : lerp(0, -to, ease((u - 0.55) / 0.45)); };
    const swing = (u) => (u < 0.4 ? lerp(-o.to, -(run ? 38 : 22), ease(u / 0.4)) : lerp(-(run ? 38 : 22), o.hs, ease((u - 0.4) / 0.6)));
    const legAt = (phi) => {
      phi = wrap(phi);
      if (phi < ds) { const u = phi / ds, z = lerp(o.zf, -o.zb, u), pt = stance(u); return { z, y: gnd(z) + ankleG(pt), pt, st: true, u }; }
      const u = (phi - ds) / (1 - ds), z = lerp(-o.zb, o.zf, ease(u)), pt = swing(u);
      const lift = o.lift * Math.pow(Math.sin(Math.PI * (run ? Math.pow(u, 0.78) : u)), run ? 1.1 : 1);
      return { z, y: gnd(z) + ankleG(pt) + lift, pt, st: false, u };
    };
    const info = (p) => {
      const f = [legAt(p), legAt(p + 0.5)];                         // leg s=1 and s=-1
      let hy = o.hy0 + (run ? -1 : 1) * o.bob * Math.cos(2 * TAU * (p - ds / 2));
      f.forEach((l) => { if (l.st) hy = Math.min(hy, l.y + Math.sqrt(Lk * Lk - l.z * l.z)); });
      return { f, hy };
    };
    const zm = (o.zf - o.zb) / 2, za = (o.zf + o.zb) / 2;
    return {
      phases: CYCLE(o.name, o.dur), cam: { S: 2.55, y0: 566 }, theta: o.theta || -85, range: [-105, -15],
      pose(p, e) {
        const { f, hy } = info(p), L = (s) => f[s === 1 ? 0 : 1];
        return {
          H: [0, hy, 0], a: o.lean, sh: [0, 0],
          leg: (s) => { const l = L(s); return { A: [s * 9, l.y, l.z], pole: [0, 0.12, 1], pitch: l.pt }; },
          arm: (s, Sh) => {
            const k = (L(s).z - zm) / za;                           // the arm on the same side swings against its leg
            const th = -o.swing * k - (o.armBias || 0), fl = o.bend + (o.bendSwing || 0) * k;
            const E = add(Sh, mul(dirYZ(th - 4), LEN.UA));
            return { E, W: add(E, mul(dirYZ(th + fl), LEN.FA)) };
          },
          props: o.props(p, hy), hot: o.hot(e), fist: run || o.fist,
        };
      },
      post: o.post || null,
    };
  }

  /* belt / road marks that run backwards at exactly the speed of the planted foot, so nothing slides */
  const marks = (p, travel, spacing, z0, z1, gndf, cls, w, layer) => {
    const out = [], n = Math.round(travel / spacing), off = (wrap(p * (travel / spacing) / n) * n) * spacing / n * n; // repeats seamlessly each cycle
    const shift = (p * travel) % spacing;
    for (let z = z0 - shift - spacing; z < z1 + spacing; z += spacing) { const a = clamp(z, z0, z1), b = clamp(z + 3, z0, z1); if (b - a < 0.5) continue; out.push(P.slab(cls, [0, gndf(a) + 0.15, a], [0, gndf(b) + 0.15, b], w, 0.7, layer || 'back')); }
    return out;
  };

  /* ---------- machines ---------- */
  const GR = 15;                                                    // belt height
  function treadmill(p, travel, slope, bits) {
    slope = slope || 0;
    const surf = (z) => GR + slope * (z + 92), z0 = -92, z1 = 92, out = [];
    out.push(P.slab('eq', [0, surf(z0) - 9, z0], [0, surf(z1) - 9, z1], 32, 10, 'back'));            // frame
    out.push(P.slab('eqd', [0, surf(z0 + 3) - 1.8, z0 + 3], [0, surf(z1 - 3) - 1.8, z1 - 3], 26, 3.4, 'back'));   // belt
    out.push(...marks(p, travel, travel / 9, z0 + 6, z1 - 6, (z) => surf(z) - 0.1, 'eq', 24.5, 'back'));
    for (const zz of [z0 + 1, z1 - 1]) out.push(P.disc('eq2', [0, surf(zz) - 4.5, zz], 'x', 5.2, 56, 'back'));
    const top = surf(z1);
    for (const s of [1, -1]) {                                       // uprights and handrails
      out.push(P.cap('eq', [s * 30, top - 6, z1 - 10], 3.2, [s * 30, top + 80, z1 - 6], 2.8, 'sort'));
      out.push(P.cap('eq', [s * 30, top + 80, z1 - 6], 2.4, [s * 30, top + 75, z1 - 52], 2.2, 'sort'));
      out.push(P.ball('eq', [s * 30, top + 75, z1 - 52], 2.6, 'sort'));
    }
    const a = [0, top + 84, z1 + 2], b = [0, top + 110, z1 - 14], d = norm(sub(b, a)), nr = [0, -d[2], d[1]];
    out.push(P.slab('eq', a, b, 29, 10, 'sort'));                    // console
    const sh = mul(nr, -5.8);
    out.push(P.slab('scr', add(add(a, mul(sub(b, a), 0.2)), sh), add(add(a, mul(sub(b, a), 0.84)), sh), 21, 1.6, 'sort'));
    out.push(P.slab('acc', add(add(a, mul(sub(b, a), 0.07)), sh), add(add(a, mul(sub(b, a), 0.13)), sh), 21, 1.6, 'sort'));
    /* motor hood over the front roller, side skirts, grip sensors, key clip, feet */
    out.push(P.box('eq', -19, 19, surf(z1 - 30) - 10, surf(z1 - 30) + 11, z1 - 30, z1 + 1, 'sort'));
    out.push(P.slab('eq', [0, surf(z1 - 30) + 11, z1 - 30], [0, surf(z1 - 8) + 17, z1 - 8], 19, 3, 'sort'));
    out.push(P.box('eqd', -19.5, 19.5, surf(z1 - 30) + 5, surf(z1 - 30) + 7, z1 - 30, z1 - 29, 'sort'));
    for (const s of [1, -1]) {
      const L = s === 1 ? 'near' : 'far';
      out.push(P.cap('eqd', [s * 15.2, surf(z0 + 4) - 0.2, z0 + 4], 1.0, [s * 15.2, surf(z1 - 30) - 0.2, z1 - 30], 1.0, L));       // side skirt / rail
      out.push(P.cap('eq2', [s * 30, top + 77.5, z1 - 14], 2.9, [s * 30, top + 76.5, z1 - 30], 2.9, 'sort'));                       // heart-rate grip sleeve
    }
    for (const zz of [z0 + 12, z1 - 24]) for (const s of [1, -1]) out.push(P.box('eqd', s * 15 - 3, s * 15 + 3, 0, 3, zz - 4, zz + 4, 'back'));   // rubber feet
    if (slope > 0.01) for (const s of [1, -1]) out.push(P.cap('eq2', [s * 14, 2, z1 - 14], 3, [s * 14, surf(z1 - 14) - 10, z1 - 14], 3, s === 1 ? 'near' : 'far'));
    out.push(P.cap('acc', [0, top + 98, z1 - 5], 1.7, [0, top + 98.5, z1 - 6], 1.7, 'sort'));
    for (let i = -2; i <= 2; i++) out.push(P.ball('eqd', add(add(a, mul(sub(b, a), 0.93)), [i * 5.4, 0, 0]), 1.5, 'sort'));
    if (bits && bits.cross) out.push(P.cap('eq', [-30, top + 78, z1 - 40], 2.2, [30, top + 78, z1 - 40], 2.2, 'sort'));
    return out;
  }
  const legHot = (e) => [['quads', H(0.7, e)], ['hamstrings', H(0.6, e)], ['glutes', H(0.7, e)], ['calves', H(0.7, e)]];

  /* ---------- walk, run, sprint, incline walk ---------- */
  const WALK = { name: 'Walk', dur: 1.1, ds: 0.62, zf: 36, zb: 36, lift: 8, hs: 18, to: 28, hy0: 90, bob: 1.6, lean: 3, swing: 20, bend: 18, bendSwing: 8, hot: legHot, run: false };
  const RUN = { name: 'Run', dur: 0.72, ds: 0.36, zf: 22, zb: 36, lift: 30, hs: 3, to: 34, hy0: 86.5, bob: 4.2, lean: 13, swing: 55, bend: 90, bendSwing: 0, run: true,
    hot: (e) => [['quads', H(0.8, e)], ['hamstrings', H(0.7, e)], ['glutes', H(0.7, e)], ['calves', H(0.9, e)]] };
  const SPRINT = { name: 'Sprint', dur: 0.56, ds: 0.28, zf: 36, zb: 40, lift: 46, hs: 0, to: 42, hy0: 86.5, bob: 3.2, lean: 15, swing: 52, bend: 88, bendSwing: 20, run: true,
    hot: (e) => [['quads', H(0.9, e)], ['hamstrings', H(0.8, e)], ['glutes', H(0.9, e)], ['calves', H(0.9, e)]] };
  const travelOf = (o) => (o.zf + o.zb) / o.ds;
  const road = (o) => (p) => marks(p, travelOf(o), travelOf(o) / 4, -150, 150, () => 0, 'eq', 22, 'back').concat([P.box('eq2', -34, 34, -1.2, 0, -170, 170, 'back')]);
  S['walking-outdoors'] = gait(Object.assign({}, WALK, { props: road(WALK) }));
  S['treadmill-running'] = gait(Object.assign({}, RUN, { ground: () => GR, hy0: RUN.hy0 + GR, props: (p) => treadmill(p, travelOf(RUN), 0) }));
  S['hiit-sprint-intervals'] = gait(Object.assign({}, SPRINT, { props: road(SPRINT) }));
  const INC = Object.assign({}, WALK, { name: 'Walk uphill', lean: 8, hot: (e) => [['glutes', H(0.9, e)], ['calves', H(0.8, e)], ['hamstrings', H(0.6, e)], ['quads', H(0.5, e)]] });
  const SL = 0.12, surfI = (z) => GR + SL * (z + 92);
  S['incline-treadmill-walk'] = gait(Object.assign({}, INC, { ground: surfI, hy0: INC.hy0 + surfI(0) - 2, props: (p) => treadmill(p, travelOf(INC), SL) }));
  /* the hips stay level over the body while the belt rises: the stance limit uses the foot's real height, so no extra work is needed */

  /* ---------- bikes ---------- */
  const post = (hands) => (sc, pose, J) => [];
  function wheel(c, r, ang, spokes) {
    const out = [P.disc('tire', c, 'x', r, 3.2, 'back'), P.disc('hole', c, 'x', r - 3.4, 3.6, 'back'), P.disc('rim', c, 'x', r - 4.2, 3.6, 'back'), P.disc('eq', c, 'x', 3, 7, 'back')];
    for (let i = 0; i < spokes; i++) { const t = ang + i * TAU / spokes; out.push(P.line('cable', c, [0, c[1] + (r - 4.2) * Math.cos(t), c[2] + (r - 4.2) * Math.sin(t)], 'back')); }
    return out;
  }
  const crankProps = (C, ped) => {
    const out = [P.disc('eq2', C, 'x', 8.5, 2, 'back')];
    for (const s of [1, -1]) {
      const pp = ped(s);
      out.push(P.cap('gbar', [s * 9, C[1], C[2]], 1.7, [s * 11, pp[1], pp[2]], 1.5, s === 1 ? 'near' : 'far'));
      out.push(P.box('eq2', s * 11 - 4.5, s * 11 + 4.5, pp[1] - 1.3, pp[1] + 1.3, pp[2] - 6, pp[2] + 6, s === 1 ? 'near' : 'far'));
    }
    return out;
  };
  const bikeLegs = (C, rr, hipY) => (ped) => (s) => { const pp = ped(s), th = Math.atan2(pp[1] - C[1], pp[2] - C[2]); return { A: [s * 11, pp[1] + 9.3, pp[2] - 7], pole: [0, 0.25, 1], pitch: 14 * Math.sin(th + 0.4) - 6 }; };

  /* upright exercise bike */
  S['stationary-bike'] = {
    phases: CYCLE('Pedal', 1.0), cam: { S: 2.5, y0: 566 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const C = [0, 34, 18], r = 17, ang = -TAU * p, ped = (s) => { const t = ang + (s === 1 ? 0 : Math.PI); return [s * 11, C[1] + r * Math.sin(t), C[2] + r * Math.cos(t)]; };
      return {
        H: [0, 101, -14], a: 24, sh: [0, 0], barHands: true,
        leg: bikeLegs(C, r)(ped),
        arm: (s) => ({ W: [s * 17, 117, 34], pole: [s * 0.3, -0.6, -1] }),
        props: [
          P.box('eq', -30, 30, 0, 4, 26, 62, 'back'), P.box('eq', -30, 30, 0, 4, -46, -14, 'back'),                               // feet of the frame
          P.cap('eq', [0, 3, -30], 3.6, [0, 36, 16], 3.8, 'back'), P.cap('eq', [0, 3, 44], 3.6, [0, 36, 16], 3.8, 'back'),              // frame to the crank
          P.disc('eqd', [0, 36, 46], 'x', 21, 13, 'back'), P.disc('eq2', [0, 36, 46], 'x', 7, 15, 'back'),                       // flywheel guard
          P.cap('eq', [0, 40, 46], 3.8, [0, 114, 38], 3.2, 'back'),                                                              // handlebar post
          P.cap('eq', [0, 40, 6], 2.8, [0, 92, -10], 2.6, 'back'), P.slab('eqd', [0, 93, -17], [0, 92, 5], 8, 5.5, 'back'),            // seat post and saddle
          P.slab('eq', [0, 115, 41], [0, 133, 33], 14, 7, 'back'), P.slab('scr', [0, 118, 36.8], [0, 130, 31.6], 11, 1.2, 'back'),     // console
          P.cap('gbar', [-19, 117, 34], 1.9, [19, 117, 34], 1.9, 'near'), P.cap('eq', [0, 114, 38], 2.6, [0, 117, 34], 2.6, 'back'),
          P.line('cable', [0, 36, 46], [0, 36, 26], 'back'),
        ].concat(crankProps(C, ped)),
        hot: [['quads', H(1, e)], ['glutes', H(0.6, e)], ['hamstrings', H(0.5, e)], ['calves', H(0.5, e)]],
      };
    },
  };

  /* road bike on the street */
  const GEAR = 2.5, WR = 34, TRAVEL = GEAR * TAU * WR;
  S['cycling-outdoor'] = {
    phases: CYCLE('Pedal', 0.8), cam: { S: 2.3, y0: 566, dx: 6 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const C = [0, 28, -8], r = 17.5, ang = -TAU * p, ped = (s) => { const t = ang + (s === 1 ? 0 : Math.PI); return [s * 11, C[1] + r * Math.sin(t), C[2] + r * Math.cos(t)]; };
      const rear = [0, 34, -50], front = [0, 34, 52], sw = -TAU * GEAR * p;
      const seat = [0, 97, -29], head = [0, 89, 36], ht = [0, 78, 40];
      return {
        H: [0, 103, -30], a: 54, sh: [0, 0], barHands: true, head: null,
        leg: bikeLegs(C, r)(ped),
        arm: (s) => ({ W: [s * 20, 97, 47], pole: [s * 0.3, -0.7, -1] }),
        props: [
          ...marks(p, TRAVEL, TRAVEL / 6, -190, 190, () => 0, 'eq', 24, 'back'), P.box('eq2', -34, 34, -1.2, 0, -200, 200, 'back'),
          ...wheel(rear, WR, sw, 14), ...wheel(front, WR, sw, 14),
          P.cap('acc', C, 2.7, [0, 91, -27], 2.5, 'back'),                       // seat tube
          P.cap('acc', [0, 90, -27], 2.4, head, 2.4, 'back'),                      // top tube
          P.cap('acc', C, 3.1, ht, 3.0, 'back'),                                   // down tube
          P.cap('acc', head, 3.0, ht, 3.0, 'back'),                                // head tube
          P.cap('acc', C, 1.7, rear, 1.7, 'back'), P.cap('acc', [0, 90, -27], 1.5, rear, 1.5, 'back'),   // chain and seat stays
          P.cap('eq', ht, 1.7, front, 1.5, 'back'),                                // fork
          P.cap('eq2', [0, 91, -28], 1.5, [0, 98, -29], 1.5, 'back'), P.slab('eqd', [0, 99.5, -38], [0, 99.5, -20], 5, 4.5, 'back'),    // seat post, saddle
          P.cap('eq', head, 2.0, [0, 97, 44], 2.0, 'back'),                        // stem
          P.cap('gbar', [-20, 97, 44], 2.0, [20, 97, 44], 2.0, 'near'),
          P.cap('gbar', [-20, 97, 44], 2.0, [-20, 86, 54], 2.0, 'far'), P.cap('gbar', [20, 97, 44], 2.0, [20, 86, 54], 2.0, 'near'),
        ].concat(crankProps(C, ped)),
        hot: bikeHot(e),
      };
    },
  };
  function bikeHot(e) { return [['quads', H(1, e)], ['glutes', H(0.6, e)], ['hamstrings', H(0.5, e)], ['calves', H(0.5, e)]]; }

  /* assault bike: a fan flywheel and levers that push and pull */
  S['assault-bike'] = {
    phases: CYCLE('Pedal and drive', 0.8), cam: { S: 2.4, y0: 566 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const C = [0, 34, 14], r = 17, ang = -TAU * p, ped = (s) => { const t = ang + (s === 1 ? 0 : Math.PI); return [s * 11, C[1] + r * Math.sin(t), C[2] + r * Math.cos(t)]; };
      const piv = (s) => [s * 16, 50, 22], beta = (s) => 24 * D2R * Math.sin(ang + (s === 1 ? 0 : Math.PI) + 1.57);
      const hand = (s) => { const b = beta(s), q = piv(s); return [q[0], q[1] + 54 * Math.cos(b), q[2] + 54 * Math.sin(b)]; };
      const fan = [0, 40, 52], fa = TAU * 2 * p, blades = [];
      for (let i = 0; i < 10; i++) { const t = fa + i * TAU / 10; blades.push(P.line('cable', fan, [0, fan[1] + 24 * Math.sin(t), fan[2] + 24 * Math.cos(t)], 'back')); }
      return {
        H: [0, 101, -6], a: 28, sh: [0, 0], barHands: true,
        leg: bikeLegs(C, r)(ped),
        arm: (s) => ({ W: hand(s), pole: [s * 0.2, -0.7, -1] }),
        props: [
          P.box('eq', -30, 30, 0, 4, 34, 76, 'back'), P.box('eq', -30, 30, 0, 4, -46, -14, 'back'),
          P.cap('eq', [0, 3, -30], 4, [0, 38, 20], 4.2, 'back'), P.cap('eq', [0, 38, 20], 4.2, [0, 40, 52], 4, 'back'),
          P.disc('eqd', fan, 'x', 29, 14, 'back'), P.disc('tire', fan, 'x', 27, 5, 'back'), ...blades, P.disc('eq2', fan, 'x', 5, 16, 'back'),
          P.cap('eq', [0, 40, 6], 2.8, [0, 92, -8], 2.6, 'back'), P.slab('eqd', [0, 94, -17], [0, 93, 6], 9, 6, 'back'),
          P.cap('eq', [0, 40, 40], 3.6, [0, 62, 28], 3.4, 'back'), P.slab('eq', [0, 62, 28], [0, 84, 28], 16, 7, 'back'), P.slab('scr', [0, 66, 24.3], [0, 80, 24.3], 12, 1.2, 'back'),
        ].concat(crankProps(C, ped)).concat([1, -1].reduce((a2, s) => a2.concat([P.cap('eq', [s * 16, 44, 22], 3.2, [s * 16, hand(s)[1] - 3, hand(s)[2]], 2.6, s === 1 ? 'near' : 'far'), P.cap('gbar', [s * 16, hand(s)[1] - 3, hand(s)[2]], 2.3, [s * 16, hand(s)[1] + 1, hand(s)[2] + 1], 2.4, s === 1 ? 'near' : 'far')]), [])),
        hot: [['quads', H(0.9, e)], ['shoulders', H(0.7, e)], ['triceps', H(0.6, e)], ['lats', H(0.5, e)], ['glutes', H(0.6, e)]],
      };
    },
  };
  /* ---------- rowing machine ---------- */
  S['rowing-machine'] = {
    phases: [{ name: 'Drive: legs, then back, then arms', dur: 0.9, from: 0, to: 1, e: [0.8, 0.8], lin: true }, { name: 'Finish', dur: 0.25, from: 1, to: 1, e: [0.7, 0.7] }, { name: 'Recover: arms, back, then knees', dur: 1.6, from: 1, to: 0, e: [0.4, 0.4] }, { name: 'Catch', dur: 0.2, from: 0, to: 0, e: [0.4, 0.4] }],
    cam: { S: 2.0, y0: 540 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const legK = ease(clamp(p / 0.55, 0, 1)), backK = ease(clamp((p - 0.3) / 0.6, 0, 1)), armK = ease(clamp((p - 0.62) / 0.38, 0, 1));
      const sz = lerp(10, -34, legK), a = lerp(30, -24, backK), ar = a * D2R, Hh = [0, 33, sz], T = add(Hh, mul([0, Math.cos(ar), Math.sin(ar)], 50));
      const hz = lerp(62, T[2] + 14, armK), hy = lerp(34, T[1] - 24, armK);
      const wob = Math.sin(TAU * 4 * p) * 0;
      return {
        H: Hh, a, sh: [0, 0], barHands: true,
        leg: (s) => ({ A: [s * 11, 31, 53], pole: [0, 1, 0.1], pitch: 38 }),
        arm: (s) => ({ W: [s * 8, hy, hz], pole: [s * 0.3, -0.5, -1] }),
        props: [
          P.slab('eq', [0, 15, -80], [0, 15, 78], 6, 7, 'back'),                                        // rail
          P.box('eq', -16, 16, 0, 15, -82, -74, 'back'), P.box('eq', -16, 16, 0, 12, 62, 70, 'back'),     // legs of the frame
          P.slab('eqd', [0, 21.5, sz - 12], [0, 21.5, sz + 12], 8, 5, 'back'),                          // seat
          P.box('eq2', -5, 5, 17, 20, sz - 7, sz + 7, 'back'),                                          // carriage
          P.slab('eq', [0, 22, 42], [0, 46, 58], 16, 3.5, 'back'),                                      // foot plates
          P.cap('eq', [0, 46, 58], 2.4, [0, 17, 58], 2.4, 'back'),
          P.disc('eqd', [0, 36, 88], 'x', 24, 18, 'back'), P.disc('eq', [0, 36, 88], 'x', 9, 20, 'back'),     // fan housing
          P.cap('eq', [0, 55, 90], 3, [0, 76, 82], 2.6, 'back'), P.slab('eq', [0, 76, 82], [0, 92, 78], 14, 6, 'back'), P.slab('scr', [0, 78, 79.5], [0, 90, 76.2], 11, 1.2, 'back'),
          P.line('cable', [0, 38, 88], [0, hy, hz + 2], 'back'),
          P.cap('gbar', [-13, hy, hz], 1.9, [13, hy, hz], 1.9, 'near'),
        ],
        hot: [['quads', H(0.8, e)], ['lats', H(0.8, e)], ['midback', H(0.6, e)], ['biceps', H(0.4, e)], ['hamstrings', H(0.4, e)], ['glutes', H(0.5, e)]],
      };
    },
  };

  /* ---------- stair climber ---------- */
  S['stair-climber'] = stairsScene(1.4);
  S['stair-climber-intervals'] = stairsScene(0.8);
  function stairsScene(dur) {
    return {
      phases: CYCLE('Step', dur), cam: { S: 2.5, y0: 566 }, theta: -85, range: [-105, -15],
      pose(p, e) {
        const st = (s) => 0.5 + 0.5 * Math.sin(TAU * p + (s === 1 ? 0 : Math.PI)), yA = (s) => 6 + 24 * st(s);
        const hy = 100 + 6 * (st(1) + st(-1) - 1) * 0.5 + 6;
        const ped = [];
        for (const s of [1, -1]) ped.push(P.box('eqd', s * 11 - 11, s * 11 + 11, yA(s) - 3, yA(s) + 1, -12, 26, s === 1 ? 'near' : 'far'), P.box('eq', s * 11 - 11, s * 11 + 11, 0, yA(s) - 3, 24, 28, 'back'));
        return {
          H: [0, hy, 0], a: 8, sh: [0, 0], barHands: true,
          leg: (s) => ({ A: [s * 11, yA(s) + 1 + ankleG(0) , 4], pole: [0, 0.15, 1], pitch: -6 * st(-s) }),
          arm: (s) => ({ W: [s * 28, 115, 38], pole: [s * 0.3, -0.6, -1] }),
          props: ped.concat([
            P.box('eq', -34, 34, 0, 3, -34, 70, 'back'),
            P.slab('eq', [0, 3, 30], [0, 50, 56], 34, 6, 'back'), P.slab('eqd', [0, 3, 40], [0, 44, 60], 30, 4, 'back'),   // drive housing with the step chain
            P.cap('eq', [0, 46, 58], 4, [0, 132, 54], 3.6, 'back'),                                                          // column
            P.slab('eq', [0, 126, 56], [0, 146, 46], 24, 8, 'back'), P.slab('scr', [0, 129, 52], [0, 143, 45], 19, 1.2, 'back'),
            P.cap('eq', [-28, 112, 42], 2.2, [28, 112, 42], 2.2, 'back'),
            P.cap('gbar', [-28, 115, 38], 2.1, [-28, 115, 40], 2.1, 'far'), P.cap('gbar', [28, 115, 38], 2.1, [28, 115, 40], 2.1, 'near'),
            P.cap('eq', [28, 100, 56], 2.4, [28, 115, 38], 2.4, 'back'), P.cap('eq', [-28, 100, 56], 2.4, [-28, 115, 38], 2.4, 'back'),
          ]),
          hot: [['glutes', H(1, e)], ['quads', H(0.8, e)], ['calves', H(0.6, e)], ['hamstrings', H(0.5, e)]],
        };
      },
    };
  }

  /* ---------- elliptical ---------- */
  S['elliptical'] = {
    phases: CYCLE('Glide', 1.3), cam: { S: 2.4, y0: 566, dx: 4 }, theta: -85, range: [-105, -15],
    pose(p, e) {
      const ph = (s) => TAU * p + (s === 1 ? 0 : Math.PI);
      const foot = (s) => [s * 10, 17 + 6.5 * Math.sin(ph(s)), -4 + 21 * Math.cos(ph(s))];
      const piv = [0, 132, 40], hand = (s) => { const b = 22 * D2R * Math.cos(ph(s) + Math.PI), q = [s * 18, 0, 0]; return [q[0], piv[1] - 28 * Math.cos(b), piv[2] + 28 * Math.sin(b) + 2]; };
      const ped = [], rods = [];
      for (const s of [1, -1]) {
        const f = foot(s), L = s === 1 ? 'near' : 'far';
        ped.push(P.slab('eqd', [0, f[1] - 2, f[2] - 17], [0, f[1] - 2, f[2] + 15], 9, 4, L));
        rods.push(P.cap('eq', [s * 16, 38 + 14 * Math.sin(ph(s)), -34 + 14 * Math.cos(ph(s))], 2.4, [s * 10, f[1] - 4, f[2] - 14], 2.6, L));        // rear crank link
        rods.push(P.cap('eq', [s * 18, hand(s)[1] + 26, hand(s)[2] - 3], 2.6, [s * 10, f[1] - 1, f[2] + 14], 2.6, L));                                   // front link to the handle
        rods.push(P.cap('gbar', [s * 18, hand(s)[1], hand(s)[2]], 2.2, [s * 18, hand(s)[1] + 2, hand(s)[2] + 1], 2.3, L));
        rods.push(P.cap('eq', [s * 18, piv[1], piv[2]], 2.6, [s * 18, hand(s)[1] + 26, hand(s)[2] - 3], 2.6, L));
      }
      return {
        H: [0, 106, -4], a: 8, sh: [0, 0], barHands: true,
        leg: (s) => { const f = foot(s); return { A: [f[0], f[1] + 8, f[2] - 2], pole: [0, 0.1, 1], pitch: 4 * Math.sin(ph(s)) }; },
        arm: (s) => ({ W: hand(s), pole: [s * 0.3, -0.6, -1] }),
        props: [
          P.box('eq', -34, 34, 0, 4, -52, 62, 'back'), P.cap('eq', [0, 4, -38], 5, [0, 36, -34], 5, 'back'), P.disc('eqd', [0, 36, -34], 'x', 18, 16, 'back'), P.disc('eq2', [0, 36, -34], 'x', 7, 18, 'back'),
          P.cap('eq', [0, 4, 52], 5, [0, 128, 46], 4, 'back'), P.slab('eq', [0, 124, 46], [0, 148, 36], 22, 8, 'back'), P.slab('scr', [0, 127, 42], [0, 144, 35], 17, 1.2, 'back'),
        ].concat(ped).concat(rods),
        hot: legHot(e).concat([['shoulders', H(0.3, e)]]),
      };
    },
  };

  /* ---------- sled push ---------- */
  S['sled-push'] = gait({ name: 'Drive', dur: 1.0, ds: 0.55, zf: 22, zb: 42, lift: 18, hs: 0, to: 36, hy0: 78, bob: 1.5, lean: 48, swing: 0, bend: 0, run: false,
    hot: (e) => [['quads', H(1, e)], ['glutes', H(0.8, e)], ['calves', H(0.6, e)], ['shoulders', H(0.4, e)]],
    props: (p) => {
      const out = marks(p, 64 / 0.55, 64 / 0.55 / 4, -150, 150, () => 0, 'eq', 22, 'back');
      out.push(P.box('eq2', -34, 34, -1.2, 0, -170, 170, 'back'));
      for (const s of [1, -1]) {
        out.push(P.slab('eq', [0, 2.5, 38], [0, 2.5, 126], 0.1, 5, 'back'));
        out.push(P.box('eqd', s * 22 - 3, s * 22 + 3, 0, 5, 40, 126, 'back'));
        out.push(P.cap('eq', [s * 22, 4, 60], 2.8, [s * 22, 104, 58], 2.8, 'back'));
        out.push(P.cap('eq', [s * 22, 28, 112], 2.4, [s * 22, 10, 124], 2.4, 'back'));
      }
      out.push(P.cap('eq', [-22, 56, 59], 2.4, [22, 56, 59], 2.4, 'back'));
      out.push(P.cap('eq2', [0, 4, 92], 2.4, [0, 44, 92], 2.4, 'back'));
      for (let i = 0; i < 4; i++) out.push(P.disc('eq2', [0, 8 + i * 5, 92], 'y', 22, 4.2, 'back'));
      return out;
    },
    post: (sc, pose, J) => [1, -1].map((s) => P.cap('gbar', add(J.side[s].W, [0, -2, 0]), 2.5, add(J.side[s].W, [0, 2, 2]), 2.5, s === 1 ? 'near' : 'far')),
  });
  S['sled-push'].pose = ((f) => (p, e) => { const r = f(p, e); r.arm = (s) => ({ W: [s * 22, 100, 57], pole: [s * 0.4, -0.3, -1] }); r.barHands = true; return r; })(S['sled-push'].pose);
})(window);
