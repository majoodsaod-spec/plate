/* Plate: calories burned by exercise. Plain arithmetic, no AI.
   Net burn = (MET - 1) x body weight (kg) x hours. The "- 1" removes the resting burn that your daily goal already contains, so nothing is counted twice.
   MET values follow the Compendium of Physical Activities; they are averages, so treat every number as an estimate (typically within about 20 to 30 percent). */
(function (root) {
  'use strict';
  const EFFORT = { easy: { met: 3.0, label: 'Easy' }, normal: { met: 4.0, label: 'Normal' }, hard: { met: 5.5, label: 'Hard' } };   // lifting sessions, rests included
  const CARDIO_MET = {
    'incline-treadmill-walk': 8.3, 'stationary-bike': 6.8, 'stair-climber': 9.0, 'rowing-machine': 7.0, 'treadmill-running': 9.8, 'hiit-sprint-intervals': 8.0,
    'jump-rope': 11.8, swimming: 6.0, 'sled-push': 8.0, elliptical: 5.0, 'battle-ropes': 6.0, 'stair-climber-intervals': 9.0, 'walking-outdoors': 4.3, 'cycling-outdoor': 7.5, 'assault-bike': 8.0,
  };
  const ACTIVITIES = [
    ['walk', 'Brisk walk', 4.3], ['run', 'Running', 9.8], ['cycle', 'Cycling', 7.5], ['swim', 'Swimming', 6.0], ['football', 'Football', 7.0], ['padel', 'Padel or tennis', 5.0],
    ['basket', 'Basketball', 6.5], ['martial', 'Martial arts', 7.0], ['yoga', 'Yoga', 2.5], ['hiit', 'HIIT class', 8.0], ['other', 'Other activity (moderate)', 5.0],
  ];
  const mins = (dur) => { const n = (String(dur || '').match(/\d+/g) || [15]).map(Number); return n[n.length - 1]; };
  const net = (met, kg, m) => Math.max(0, (met - 1) * kg * m / 60);

  async function weightKg() {
    const ws = await DB.allWeights(), p = await DB.get('profile', null);
    return (ws.length && ws[ws.length - 1].kg) || (p && p.weight) || null;
  }
  /* a gym workout: lifting minutes at the chosen effort + cardio items by their own MET */
  async function workout(items, effort) {
    const kg = await weightKg(); if (!kg) return null;
    const lift = items.filter((i) => !i.dur), cardio = items.filter((i) => i.dur);
    const est = root.Plate && root.Plate.gymPlan ? root.Plate.gymPlan.estMinutes : (x) => 5 + x.length * 8;
    let k = 0, m = 0;
    if (lift.length) { const lm = est(lift); m += lm; k += net((EFFORT[effort] || EFFORT.normal).met, kg, lm); }
    for (const c of cardio) { const cm = mins(c.dur); m += cm; k += net(CARDIO_MET[c.id] || 6.0, kg, cm); }
    return { kcal: Math.round(k), mins: Math.round(m) };
  }

  /* ---------- per-exercise logging: what you logged -> calories ---------- */
  const HOLDS = ['plank', 'side-plank', 'dead-hang', 'copenhagen-plank', 'plate-pinch'], CARRIES = ['farmers-carry', 'suitcase-carry', 'sled-push'];
  const EFF3 = [['easy', 'Easy'], ['moderate', 'Moderate'], ['hard', 'Hard']];
  const f = (k, label, unit, def, o) => Object.assign({ k, label, unit, def }, o || {});
  /* cardio forms: each machine asks for what its own screen shows */
  const FORMS = {
    'treadmill-running': [f('speed', 'Speed', 'km/h', 9), f('incline', 'Incline', '%', 1), f('min', 'Time', 'min', 30)],
    'incline-treadmill-walk': [f('speed', 'Speed', 'km/h', 5.5), f('incline', 'Incline', '%', 8), f('min', 'Time', 'min', 30)],
    'walking-outdoors': [f('km', 'Distance', 'km', 3, { step: 0.1 }), f('min', 'Time', 'min', 35)],
    'cycling-outdoor': [f('km', 'Distance', 'km', 10, { step: 0.1 }), f('min', 'Time', 'min', 30)],
    'stationary-bike': [f('level', 'Resistance level', '', 8), f('min', 'Time', 'min', 30), f('watts', 'Average watts', 'W', '', { opt: 1 })],
    'assault-bike': [f('min', 'Time', 'min', 15), f('effort', 'How hard', '', 'hard', { sel: EFF3 })],
    'rowing-machine': [f('min', 'Time', 'min', 20), f('m', 'Distance', 'm', '', { opt: 1, step: 10 }), f('effort', 'How hard (if no distance)', '', 'moderate', { sel: EFF3 })],
    'stair-climber': [f('level', 'Level', '', 8), f('min', 'Time', 'min', 20)],
    'stair-climber-intervals': [f('level', 'Hard level', '', 10), f('min', 'Total time', 'min', 20)],
    'elliptical': [f('level', 'Resistance level', '', 8), f('incline', 'Incline', '', 0, { opt: 1 }), f('min', 'Time', 'min', 30)],
    'hiit-sprint-intervals': [f('rounds', 'Rounds', '', 8), f('work', 'Sprint', 'sec', 30), f('rest', 'Rest', 'sec', 60)],
    'battle-ropes': [f('rounds', 'Rounds', '', 8), f('work', 'Work', 'sec', 30), f('rest', 'Rest', 'sec', 30)],
    'jump-rope': [f('min', 'Time', 'min', 10), f('effort', 'Pace', '', 'moderate', { sel: [['easy', 'Slow'], ['moderate', 'Steady'], ['hard', 'Fast']] })],
    swimming: [f('min', 'Time', 'min', 30), f('effort', 'How hard', '', 'moderate', { sel: EFF3 }), f('laps', 'Laps', '', '', { opt: 1 })],
  };
  const BW = ['back-extension', '45-degree-hip-extension', 'hyperextension-weighted', 'glute-ham-raise', 'side-lying-hip-abduction', 'banded-lateral-walk', 'lateral-band-walk-heavy', 'single-leg-bodyweight-calf-raise', 'cossack-squat', 'glute-bridge', 'russian-twist', 'hanging-leg-raise-straight', 'ab-wheel-rollout', 'decline-crunch', 'walking-lunge', 'reverse-lunge', 'side-lying-hip-abduction'];
  HOLDS.push('mountain-climber');
  FORMS['custom-time'] = [f('min', 'Time', 'min', 30), f('effort', 'How hard', '', 'moderate', { sel: EFF3 })];
  FORMS['custom-walkrun'] = [f('km', 'Distance', 'km', 5, { step: 0.1 }), f('min', 'Time', 'min', 30), f('incline', 'Incline', '%', 0, { opt: 1 })];
  FORMS['custom-cycle'] = [f('km', 'Distance', 'km', 15, { step: 0.1 }), f('min', 'Time', 'min', 40)];
  function kindOf(ex) {
    if (!ex) return 'lift';
    if (ex.id === 'custom-lift') return 'lift';
    if (BW.includes(ex.id)) return 'bw';
    if (FORMS[ex.id]) return 'cardio';
    if (CARRIES.includes(ex.id)) return 'carry';
    if (HOLDS.includes(ex.id)) return 'hold';
    const eq = ex.eq || [], heavy = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band'];
    return eq.includes('bodyweight') && !eq.some((q) => heavy.includes(q)) ? 'bw' : 'lift';
  }
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
  const pick = (a, e) => (a.find((x) => x[0] === e) || a[1])[1];
  /* ACSM walking / running equation: oxygen use in ml per kg per minute, net of the resting 3.5 */
  function acsmNet(kmh, grade) { const v = kmh * 1000 / 60, g = grade / 100; return kmh >= 8 ? 0.2 * v + 0.9 * v * g : 0.1 * v + 1.8 * v * g; }
  const kcalFromNetVO2 = (vo2, kg, min) => vo2 * kg * min * 5 / 1000;
  const wattsKcal = (w, min) => w * min * 60 / 4184 / 0.24;     // 24% mechanical efficiency
  function cardio(id, d, kg) {
    const m = num(d.min); let k = 0, mins = m, sub = '';
    const mph = (kmh) => kmh / 1.609, bikeMet = (kmh) => { const v = mph(kmh); return v < 10 ? 4.0 : v < 12 ? 6.8 : v < 14 ? 8.0 : v < 16 ? 10.0 : v < 20 ? 12.0 : 15.8; };
    if (id === 'treadmill-running' || id === 'incline-treadmill-walk') { k = kcalFromNetVO2(acsmNet(num(d.speed), num(d.incline)), kg, m); sub = `${num(d.speed)} km/h · ${num(d.incline)}% incline · ${m} min`; }
    else if (id === 'custom-time') { k = net({ easy: 3.5, moderate: 5.5, hard: 8 }[d.effort] || 5.5, kg, m); sub = `${d.effort} · ${m} min`; }
    else if (id === 'custom-walkrun') { const kmh = m ? num(d.km) / (m / 60) : 0; k = kcalFromNetVO2(acsmNet(kmh, num(d.incline)), kg, m); sub = `${num(d.km)} km · ${m} min`; }
    else if (id === 'custom-cycle') { const kmh = m ? num(d.km) / (m / 60) : 0; k = net(bikeMet(kmh), kg, m); sub = `${num(d.km)} km · ${m} min`; }
    else if (id === 'walking-outdoors') { const kmh = m ? num(d.km) / (m / 60) : 0; k = kcalFromNetVO2(acsmNet(kmh, 0), kg, m); sub = `${num(d.km)} km · ${m} min (${Math.round(kmh * 10) / 10} km/h)`; }
    else if (id === 'cycling-outdoor') { const kmh = m ? num(d.km) / (m / 60) : 0; k = net(bikeMet(kmh), kg, m); sub = `${num(d.km)} km · ${m} min (${Math.round(kmh * 10) / 10} km/h)`; }
    else if (id === 'stationary-bike') { const w = num(d.watts); k = w > 0 ? Math.max(0, wattsKcal(w, m) - kg * m / 60) : net(Math.min(12, 3.5 + 0.5 * num(d.level)), kg, m); sub = `level ${num(d.level)}${w ? ' · ' + w + ' W' : ''} · ${m} min`; }
    else if (id === 'assault-bike') { k = net({ easy: 6.8, moderate: 10, hard: 12 }[d.effort] || 10, kg, m); sub = `${d.effort} · ${m} min`; }
    else if (id === 'rowing-machine') {
      const dist = num(d.m);
      if (dist > 0 && m > 0) { const w = 2.8 / Math.pow(m * 60 / dist, 3); k = Math.max(0, wattsKcal(w, m) - kg * m / 60); sub = `${dist} m · ${m} min`; }
      else { k = net({ easy: 4.8, moderate: 7.0, hard: 10 }[d.effort] || 7, kg, m); sub = `${d.effort} · ${m} min`; }
    }
    else if (id === 'stair-climber' || id === 'stair-climber-intervals') { k = net(Math.min(14, 3.0 + 0.6 * num(d.level)), kg, m); sub = `level ${num(d.level)} · ${m} min`; }
    else if (id === 'elliptical') { k = net(Math.min(11, 3.5 + 0.25 * num(d.level) + 0.15 * num(d.incline)), kg, m); sub = `level ${num(d.level)} · ${m} min`; }
    else if (id === 'hiit-sprint-intervals' || id === 'battle-ropes') {
      const r = num(d.rounds), w = num(d.work), rs = num(d.rest), am = id === 'battle-ropes' ? 10.3 : 12, rm = id === 'battle-ropes' ? 2.0 : 3.5;
      k = net(am, kg, r * w / 60) + net(rm, kg, r * rs / 60); mins = r * (w + rs) / 60; sub = `${r} × ${w}s on / ${rs}s off`;
    }
    else if (id === 'jump-rope') { k = net({ easy: 8.8, moderate: 11.8, hard: 12.3 }[d.effort] || 11.8, kg, m); sub = `${d.effort} · ${m} min`; }
    else if (id === 'swimming') { k = net({ easy: 5.8, moderate: 8.3, hard: 9.8 }[d.effort] || 8.3, kg, m); sub = `${d.effort} · ${m} min${num(d.laps) ? ' · ' + num(d.laps) + ' laps' : ''}`; }
    return { kcal: Math.max(0, k), mins, sub };
  }
  /* strength-type sets: short hard efforts, then a rest where the heart rate stays up. Averages near the Compendium's 3.5 MET for resistance training. */
  function sets(kind, list, rest, kg) {
    let k = 0, mins = 0;
    list.forEach((s) => {
      const act = kind === 'hold' ? num(s.sec) : kind === 'carry' ? Math.max(10, num(s.m)) : Math.max(1, num(s.reps)) * 3;
      const am = kind === 'hold' ? 4.0 : kind === 'carry' ? 6.0 : 6.0;
      k += net(am, kg, act / 60) + net(2.5, kg, rest / 60); mins += (act + rest) / 60;
    });
    return { kcal: k, mins };
  }
  async function session(entries, exMap) {
    const kg = await weightKg(); if (!kg) return null;
    let k = 0, m = 0, nsets = 0; const parts = [];
    entries.forEach((e) => {
      if (e.kind === 'cardio') { const c = cardio(e.id, e.f, kg); k += c.kcal; m += c.mins; parts.push(e.name && e.id.startsWith('custom') ? e.name + ' ' + c.sub : c.sub); }
      else { const x = exMap && exMap[e.id]; const r = sets(e.kind, e.sets, e.rest || (x && x.type === 'compound' ? 120 : 75), kg); k += r.kcal; m += r.mins; nsets += e.sets.length; }
    });
    return { kcal: Math.round(k), mins: Math.round(m), sets: nsets, sub: [nsets ? nsets + ' sets' : '', ...parts].filter(Boolean).join(' · ') };
  }
  async function activity(id, m) {
    const kg = await weightKg(); const a = ACTIVITIES.find((x) => x[0] === id); if (!kg || !a) return null;
    return { kcal: Math.round(net(a[2], kg, m)), mins: m, label: a[1] };
  }
  async function log() { return (await DB.get('gymLog', [])) || []; }
  async function onDay(date) {
    const l = (await log()).filter((x) => x.date === date);
    return { kcal: l.reduce((a, x) => a + (x.kcal || 0), 0), entries: l, unknown: l.some((x) => x.kcal == null) };
  }
  async function between(from, to) {
    const out = {}; (await log()).forEach((x) => { if (x.date >= from && x.date <= to) out[x.date] = (out[x.date] || 0) + (x.kcal || 0); });
    return out;
  }
  root.Burn = { FORMS, kindOf, session, EFFORT, ACTIVITIES, workout, activity, onDay, between, weightKg, CARDIO_MET };
})(window);
