/* Plate Gym: Plan (weekly split, workout generator, training log) and Coach (chat).
   The split and the standard generator are plain code and cost nothing. Only "ask for something specific" and the Coach use the AI,
   and the AI may only pick exercises from the list: every id it returns is checked here, and anything unknown is dropped. */
(function () {
  'use strict';
  const { $, $$, esc } = window.Plate;
  const { GROUPS, EX } = window.GymData, GYM = window.Plate.gym, EXMAP = GYM.EXMAP;
  const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WK3 = WEEK.map((d) => d.slice(0, 3));

  /* ---------- day types: a short list up front, the rest behind "More" ---------- */
  const DAYS = {
    push: { label: 'Push', g: ['chest', 'shoulders', 'triceps'], set: 'common', sub: 'Chest, shoulders, triceps' },
    pull: { label: 'Pull', g: ['back', 'traps', 'biceps', 'forearms'], set: 'common', sub: 'Back, biceps' },
    legs: { label: 'Legs', g: ['quads', 'hamstrings', 'glutes', 'calves'], set: 'common', sub: 'Quads, hamstrings, glutes, calves' },
    upper: { label: 'Upper', g: ['chest', 'back', 'shoulders', 'biceps', 'triceps'], set: 'common', sub: 'Everything above the waist' },
    lower: { label: 'Lower', g: ['quads', 'hamstrings', 'glutes', 'calves'], set: 'common', sub: 'Legs and glutes' },
    full: { label: 'Full body', g: ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'abs'], set: 'common', sub: 'A bit of everything' },
    cardio: { label: 'Cardio', g: ['cardio'], set: 'common', sub: 'Conditioning' },
    rest: { label: 'Rest', g: [], set: 'common', sub: 'Recovery' },
    chest: { label: 'Chest', g: ['chest'], set: 'part' }, back: { label: 'Back', g: ['back', 'traps'], set: 'part' },
    shoulders: { label: 'Shoulders', g: ['shoulders', 'traps'], set: 'part' }, arms: { label: 'Arms', g: ['biceps', 'triceps', 'forearms'], set: 'part' },
    quads: { label: 'Quads', g: ['quads', 'calves'], set: 'part' }, hamglutes: { label: 'Hamstrings and glutes', g: ['hamstrings', 'glutes'], set: 'part' },
    glutes: { label: 'Glutes', g: ['glutes', 'abductors'], set: 'part' }, calves: { label: 'Calves', g: ['calves'], set: 'part' },
    core: { label: 'Core', g: ['abs', 'obliques', 'lowerback'], set: 'part' },
    chest_tri: { label: 'Chest and triceps', g: ['chest', 'triceps'], set: 'combo' }, back_bi: { label: 'Back and biceps', g: ['back', 'biceps'], set: 'combo' },
    shoulders_arms: { label: 'Shoulders and arms', g: ['shoulders', 'biceps', 'triceps'], set: 'combo' }, chest_back: { label: 'Chest and back', g: ['chest', 'back'], set: 'combo' },
    legs_core: { label: 'Legs and core', g: ['quads', 'hamstrings', 'glutes', 'abs'], set: 'combo' },
  };
  const PRESETS = [
    { id: 'ul4', name: 'Upper / Lower', days: ['upper', 'lower', 'rest', 'upper', 'lower', 'rest', 'rest'], note: '4 days' },
    { id: 'ppl6', name: 'Push / Pull / Legs', days: ['push', 'pull', 'legs', 'rest', 'push', 'pull', 'legs'], note: '6 days' },
    { id: 'ppl3', name: 'Push / Pull / Legs, 3 days', days: ['push', 'rest', 'pull', 'rest', 'legs', 'rest', 'rest'], note: '3 days' },
    { id: 'fb3', name: 'Full body', days: ['full', 'rest', 'full', 'rest', 'full', 'rest', 'rest'], note: '3 days' },
    { id: 'bro5', name: 'Body-part split', days: ['chest', 'back', 'shoulders', 'quads', 'arms', 'rest', 'rest'], note: '5 days' },
    { id: 'arn6', name: 'Arnold split', days: ['chest_back', 'shoulders_arms', 'legs', 'rest', 'chest_back', 'shoulders_arms', 'legs'], note: '6 days' },
  ];
  const BY_DAYS = { 2: ['full', 'rest', 'rest', 'full', 'rest', 'rest', 'rest'], 3: PRESETS[3].days, 4: PRESETS[0].days, 5: ['push', 'pull', 'legs', 'rest', 'upper', 'lower', 'rest'], 6: PRESETS[1].days };
  const ALL_MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'traps', 'lowerback', 'glutes', 'abductors', 'quads', 'hamstrings', 'adductors', 'calves', 'cardio'];
  const GOALS = { muscle: 'Build muscle', strength: 'Get stronger', fat: 'Lose fat', fit: 'General fitness' };

  const st = { sec: 'muscles', split: null, prev: null, prefs: { goal: 'muscle', minutes: 60, equip: 'gym' }, log: [], cur: null, seed: 1, busy: false, pick: null, coach: { msgs: [], busy: false }, tmp: null };

  /* ---------- storage ---------- */
  const dayOf = (d) => (typeof d === 'string' ? { t: d } : d);
  async function load() {
    const sp = await DB.get('gymSplit', null);
    st.split = (sp && Array.isArray(sp.days) && sp.days.length === 7 ? sp : { name: 'Upper / Lower', days: PRESETS[0].days.map(dayOf) }).days.map(dayOf);
    st.name = (sp && sp.name) || 'Upper / Lower';
    st.prefs = Object.assign(st.prefs, (await DB.get('gymPrefs', null)) || {});
    st.log = (await DB.get('gymLog', [])) || [];
    try { const pf = await DB.get('profile', null); st.lose = !!(pf && pf.goal === 'lose'); } catch (e) { st.lose = false; }
    const c = await DB.get('gymCurrent', null);
    st.cur = c && c.date === DB.dayKey() ? c.workout : null;
  }
  const saveSplit = () => DB.set('gymSplit', { name: st.name, days: st.split });
  const savePrefs = () => DB.set('gymPrefs', st.prefs);
  const saveCur = () => DB.set('gymCurrent', { date: DB.dayKey(), workout: st.cur });

  const dayGroups = (d) => (d.t === 'custom' ? d.g || [] : (DAYS[d.t] || DAYS.rest).g);
  function dayLabel(d) {
    if (d.t !== 'custom') return (DAYS[d.t] || DAYS.rest).label;
    const n = (d.g || []).map((g) => GROUPS[g].name);
    return n.length ? (n.length <= 2 ? n.join(' + ') : n.slice(0, 2).join(' + ') + ' +' + (n.length - 2)) : 'Custom';
  }

  /* ---------- the standard generator (plain code) ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const WEIGHT = { chest: 1.3, back: 1.3, quads: 1.3, hamstrings: 1.1, glutes: 1.1, shoulders: 1.1, calves: 0.8, forearms: 0.7, abs: 0.8, obliques: 0.7, traps: 0.8, adductors: 0.7, abductors: 0.7, lowerback: 0.8, biceps: 1, triceps: 1 };
  const BIGS = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders']);
  const HOME_EQ = ['bodyweight', 'dumbbell', 'band', 'kettlebell'];
  /* What equipment counts as owned. 'gym' means everything; 'custom' is read from the person's own words. */
  const EQSETS = {
    home: ['bodyweight', 'dumbbell', 'band', 'kettlebell'], dumbbells: ['bodyweight', 'dumbbell'], bodyweight: ['bodyweight'], bands: ['bodyweight', 'band'], kettlebell: ['bodyweight', 'kettlebell'],
    homegym: ['bodyweight', 'dumbbell', 'barbell', 'bar', 'bench', 'band', 'kettlebell'], machines: ['bodyweight', 'machine', 'cable', 'bench'],
  };
  const EQLABEL = { gym: 'Full gym', home: 'Dumbbells, bands, kettlebell and bodyweight', dumbbells: 'Dumbbells only (plus bodyweight)', bodyweight: 'Bodyweight only', bands: 'Resistance bands and bodyweight', kettlebell: 'Kettlebell and bodyweight', homegym: 'Home gym: barbell, rack, bench, dumbbells', machines: 'Machines and cables', custom: 'Custom' };
  const EQWORDS = [[/dumb?bell|\bdbs?\b|adjustable/i, 'dumbbell', 'dumbbells'], [/barbell|olympic|squat rack|power rack|\brack\b|ez.?bar|trap bar/i, 'barbell', 'barbell'], [/pull.?up|chin.?up|\bbar\b|dip station|rings?/i, 'bar', 'pull-up bar'], [/bench/i, 'bench', 'bench'], [/band|resistance|loop/i, 'band', 'bands'], [/kettle|\bkbs?\b/i, 'kettlebell', 'kettlebell'], [/cable|pulley|lat pull|crossover/i, 'cable', 'cables'], [/machine|smith|leg press|hack squat|pec deck/i, 'machine', 'machines'], [/everything|full gym|commercial gym|gym membership/i, 'ALL', 'full gym']];
  function customEq(text) { const tags = new Set(['bodyweight']), names = []; for (const [re, tag, nm] of EQWORDS) if (re.test(text || '')) { tags.add(tag); names.push(nm); } return { tags, names }; }
  /* An exercise is possible if the person owns any one of its listed items, with two corrections to the data's loose tags:
     a bench alone never makes a barbell lift possible, and anything that needs a pull-up or dip bar needs that bar. */
  function canDo(x, own) {
    const eq = x.eq.filter((q) => !(q === 'bar' && x.eq.includes('barbell')));
    if (x.eq.includes('bar') && !x.eq.includes('barbell') && !own.has('bar')) return false;
    const benchOnly = eq.every((q) => q === 'bench' || q === 'bodyweight');
    return eq.some((q) => own.has(q) && (q !== 'bench' || benchOnly));
  }
  function allowed(x, equip) {
    equip = equip || st.prefs.equip;
    if (equip === 'gym') return true;
    if (equip === 'custom') { const c = customEq(st.prefs.eqText); return c.tags.has('ALL') || canDo(x, c.tags); }
    return canDo(x, new Set(EQSETS[equip] || EQSETS.home));
  }
  const eqSentence = () => (st.prefs.equip === 'custom' ? 'what they described: "' + String(st.prefs.eqText || 'nothing').slice(0, 200) + '"' : EQLABEL[st.prefs.equip] || 'full gym');
  const SCHEME = {
    muscle: { c: [3, '6-10', 120], i: [3, '10-15', 75] }, strength: { c: [4, '3-6', 180], i: [3, '8-12', 90] },
    fat: { c: [3, '10-12', 60], i: [3, '12-15', 45] }, fit: { c: [3, '8-12', 90], i: [3, '10-15', 60] },
  };
  const REPS = { plank: '30-45 s', 'side-plank': '20-40 s each side', 'copenhagen-plank': '15-30 s each side', 'dead-hang': '20-40 s', 'farmers-carry': '30-40 m', 'suitcase-carry': '20-40 m each hand', 'nordic-curl': '4-8', 'push-up': 'near failure', 'pull-up': '3-8', 'bulgarian-split-squat': '8-12 each leg', 'walking-lunge': '10-12 each leg', 'reverse-lunge': '8-12 each leg', 'cossack-squat': '8-10 each side', 'bird-dog': '8-10 each side', 'sphinx-push-up': '6-10', 'dead-bug': '8-10 each side', 'pallof-press': '10-12 each side', 'cable-woodchop': '10-12 each side', 'single-leg-bodyweight-calf-raise': '12-20 each leg', 'hanging-oblique-knee-raise': '8-12', 'mountain-climber': '30 s', 'wrist-roller': '2-3 trips' };
  const ISO_HIGH = new Set(['calves', 'abs', 'obliques', 'forearms']);

  function pickFrom(pool, rand, wantType) {
    if (!pool.length) return null;
    const sc = pool.map((x) => ({ x, s: x.stars + rand() * 1.4 - (x.thin ? 0.5 : 0) + (x.demo ? 0.2 : 0) })).sort((a, b) => b.s - a.s);
    if (wantType) { const m = sc.find((q) => q.x.type === wantType && q.s >= sc[0].s - 1); if (m) return m.x; }
    return sc[0].x;
  }
  function itemFor(x, goal, g) {
    const sc = SCHEME[goal] || SCHEME.muscle, comp = x.type === 'compound', base = comp ? sc.c : sc.i;
    let reps = REPS[x.id] || (!comp && ISO_HIGH.has(g) && goal !== 'strength' ? '12-20' : base[1]);
    return { id: x.id, sets: base[0], reps, rest: base[2] };
  }
  const estMinutes = (items) => {
    let m = 5;
    for (const it of items) {
      if (it.dur) { const n = (String(it.dur).match(/\d+/g) || [10]).map(Number); m += n[n.length - 1]; } else m += it.sets * (0.7 + it.rest / 60) + 1;
    }
    return Math.max(10, Math.round(m / 5) * 5);
  };
  function cardioItems(opts, rand, used) {
    const pool = EX.filter((x) => x.g === 'cardio' && allowed(x, opts.equip) && !used.has(x.id) && x.stars >= 3);
    const first = pickFrom(pool.filter((x) => x.id !== 'hiit-sprint-intervals' && x.id !== 'assault-bike'), rand);
    const out = [];
    if (first) { out.push({ id: first.id, dur: opts.minutes >= 60 ? '30-40 min' : '20-30 min' }); used.add(first.id); }
    const second = pickFrom(pool.filter((x) => !used.has(x.id)), rand);
    if (second && opts.minutes >= 45) out.push({ id: second.id, dur: '10-15 min' });
    return out;
  }
  /* Cardio that actually serves fat loss: a steady, sustainable machine or walk for most of the block, plus intervals when there is time. */
  function cardioBlock(o, rand, used, mins, main) {
    const pool = EX.filter((x) => x.g === 'cardio' && allowed(x, o.equip) && !used.has(x.id) && x.stars >= 3 && x.id !== 'hiit-sprint-intervals');
    const PREF = ['incline-treadmill-walk', 'stationary-bike', 'elliptical', 'treadmill-running', 'walking-outdoors', 'cycling-outdoor', 'stair-climber'];
    const steady = pickFrom(pool.filter((x) => PREF.includes(x.id)), rand) || pickFrom(pool.filter((x) => x.id !== 'assault-bike' && x.id !== 'battle-ropes'), rand) || pickFrom(pool, rand);
    const out = [];
    if (steady) { used.add(steady.id); out.push({ id: steady.id, dur: main ? `${mins}-${mins + 5} min` : `${mins} min` }); }
    if (main && o.minutes >= 60) { const hit = pickFrom(pool.filter((x) => !used.has(x.id)), rand); if (hit) out.push({ id: hit.id, dur: '8-10 min' }); }
    if (!out.length) out.push({ id: 'walking-outdoors', dur: `${mins} min` });
    return out;
  }
  function generate(groups, o) {
    const rand = rng(o.seed || 1), used = new Set(), items = [];
    const gs = groups.filter((g) => g !== 'cardio');
    if (!gs.length) return { items: cardioItems(o, rand, used) };
    const fatGoal = o.goal === 'fat', cardioMin = fatGoal ? Math.max(15, Math.min(35, Math.round(o.minutes * 0.35 / 5) * 5)) : (o.lose && o.minutes >= 40 ? 15 : 0);
    const N = Math.max(3, Math.min(9, Math.round((o.minutes - cardioMin) / 10)));
    let chosen = gs.slice();
    if (chosen.length > N) chosen = chosen.slice().sort((a, b) => (WEIGHT[b] || 1) - (WEIGHT[a] || 1)).slice(0, N);
    const alloc = {}; chosen.forEach((g) => { alloc[g] = 1; });
    for (let left = N - chosen.length; left > 0; left--) {
      let best = null, bs = -1;
      for (const g of chosen) { const s = (WEIGHT[g] || 1) / alloc[g]; if (s > bs) { bs = s; best = g; } }
      alloc[best]++;
    }
    const picked = [];
    for (const g of chosen) {
      let firstType = null;
      for (let k = 0; k < alloc[g]; k++) {
        let pool = EX.filter((x) => (x.g === g || (x.gs || []).includes(g)) && allowed(x, o.equip) && !used.has(x.id) && x.stars >= 3);
        if (!pool.length) pool = EX.filter((x) => (x.g === g || (x.gs || []).includes(g)) && allowed(x, o.equip) && !used.has(x.id));
        const want = k === 0 ? (BIGS.has(g) ? 'compound' : null) : (firstType === 'compound' ? 'isolation' : null);
        const x = pickFrom(pool, rand, want); if (!x) break;
        if (k === 0) firstType = x.type;
        used.add(x.id); picked.push({ x, g });
      }
    }
    const rank = (p) => (p.x.type === 'compound' ? 0 : 1) * 10 + (['abs', 'obliques', 'lowerback'].includes(p.g) ? 5 : 0) - (WEIGHT[p.g] || 1);
    picked.sort((a, b) => rank(a) - rank(b));
    picked.forEach((p) => items.push(itemFor(p.x, o.goal, p.g)));
    if (cardioMin) items.push(...cardioBlock(o, rand, used, cardioMin, fatGoal));
    return { items };
  }
  function makeWorkout(groups, label, why) {
    const o = Object.assign({}, st.prefs, { seed: st.seed, lose: st.lose });
    const w = generate(groups, o);
    return { title: label, items: w.items, groups, goal: o.goal, why: why || '', source: 'plan', mins: estMinutes(w.items) };
  }
  function swapItem(w, i) {
    const cur = w.items[i], x = EXMAP[cur.id]; if (!x) return;
    const taken = new Set(w.items.map((q) => q.id));
    const g = x.g, pool = EX.filter((q) => (q.g === g || (q.gs || []).includes(g)) && !taken.has(q.id) && allowed(q, st.prefs.equip) && q.type === x.type && q.stars >= 3);
    const alt = pool.length ? pool : EX.filter((q) => (q.g === g) && !taken.has(q.id) && allowed(q, st.prefs.equip));
    if (!alt.length) return false;
    const r = rng(st.seed++ + i), sc = alt.map((q) => ({ q, s: q.stars + r() * 1.2 })).sort((a, b) => b.s - a.s)[0].q;
    w.items[i] = cur.dur ? { id: sc.id, dur: cur.dur } : itemFor(sc, st.prefs.goal, g);
    w.mins = estMinutes(w.items); return true;
  }

  /* ---------- the week ---------- */
  function suggestSplit(n, focus) {
    const days = (BY_DAYS[n] || BY_DAYS[4]).slice();
    if (focus === 'strength' && n === 5) return { name: 'Upper / Lower + extra', days: ['upper', 'lower', 'rest', 'upper', 'lower', 'full', 'rest'] };
    if (focus === 'fat' && n <= 5) { const free = days.lastIndexOf('rest'); if (free >= 0) days[free] = 'cardio'; }
    const names = { 2: 'Full body, 2 days', 3: 'Full body, 3 days', 4: 'Upper / Lower', 5: 'Push / Pull / Legs + Upper / Lower', 6: 'Push / Pull / Legs' };
    return { name: (names[n] || 'Your split') + (focus === 'fat' ? ' + cardio' : ''), days };
  }
  function coverage() {
    const hit = new Set(); st.split.forEach((d) => dayGroups(d).forEach((g) => hit.add(g)));
    return ALL_MUSCLES.filter((g) => g !== 'cardio' && !hit.has(g));
  }
  const lastDays = (n) => { const out = []; for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() - i); out.push(DB.dayKey(d)); } return out; };
  function trainedRecently(n) {
    const keep = new Set(lastDays(n)), s = new Set();
    st.log.filter((l) => keep.has(l.date)).forEach((l) => (l.groups || []).forEach((g) => s.add(g)));
    return s;
  }

  /* ---------- rendering ---------- */
  const todayIdx = () => new Date().getDay();
  function exItem(it, i) {
    const x = EXMAP[it.id]; if (!x) return '';
    const sub = it.dur ? it.dur : `${it.sets} × ${it.reps} · rest ${it.rest >= 60 ? Math.round(it.rest / 6) / 10 + ' min' : it.rest + ' s'}`;
    return `<details class="ex2" data-i="${i}"><summary><span class="exMain"><b>${esc(x.name)}</b><small>${esc(sub)}</small></span>${GYM.stars(x.stars)}${x.demo ? '<span class="chip high">Demo</span>' : ''}</summary>
      <div class="exBody"><p>${esc(x.how)}</p><p class="hint">${esc(GYM.eqText(x))}</p>
      <div class="row wrap">${x.demo ? `<button type="button" class="primary" data-demo="${x.demo}">Watch the demo</button>` : ''}<button type="button" data-swap="${i}">Swap for another</button></div></div></details>`;
  }
  function workoutCard() {
    const w = st.cur; if (!w) return '';
    return `<div class="card wcard"><div class="sectionHead" style="padding:0"><h2>${esc(w.title)}</h2><span class="hint">${w.items.length} exercises · about ${w.mins} min</span></div>
      ${w.note ? `<p class="hint">${esc(w.note)}</p>` : ''}
      <div class="exList2">${w.items.map(exItem).join('')}</div>
      <p class="hint">${w.source === 'ai' ? 'Built from your exercise list for what you asked.' : 'Picked from the top-rated exercises for these muscles.'} Goal: ${esc(GOALS[w.goal] || GOALS.muscle)}. Choose a weight that leaves 1 to 3 reps in the tank.</p>
      <div class="row wrap">${w.done ? '<span class="chip high">Logged ✓</span>' : '<button type="button" class="primary" data-act="done">Log workout</button>'}
      ${w.source === 'plan' ? '<button type="button" data-act="shuffle">Shuffle</button>' : ''}<button type="button" data-act="browse">Similar workouts</button><button type="button" class="link" data-act="clear">Clear</button></div></div>`;
  }
  const sel = (id, opts, val, label) => `<label class="gsel"><span>${label}</span><select id="${id}">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  function renderPlan() {
    const ti = todayIdx(), td = st.split[ti], g = dayGroups(td), rest = !g.length;
    const doneToday = st.log.some((l) => !l.other && l.date === DB.dayKey());
    const week = st.split.map((d, i) => {
      const date = (() => { const x = new Date(); x.setDate(x.getDate() - ti + i); return DB.dayKey(x); })();
      const done = st.log.some((l) => !l.other && l.date === date);
      return `<div class="wkRow${i === ti ? ' today' : ''}"><span class="wkd">${WK3[i]}</span><button type="button" class="dayBtn${d.t === 'rest' ? ' rest' : ''}" data-day="${i}">${esc(dayLabel(d))}<i aria-hidden="true">▾</i></button><span class="wkDone" title="${done ? 'Workout logged' : ''}">${done ? '✓' : ''}</span></div>`;
    }).join('');
    const miss = coverage(), tr = trainedRecently(7);
    $('#gPlan').innerHTML = `
      <div class="card">
        <div class="sectionHead" style="padding:0"><h2>Today · ${WEEK[ti]}</h2><span class="hint">${esc(dayLabel(td))}</span></div>
        ${rest ? '<p>Rest day in your split. A walk is fine, and recovery is when you grow.</p>' : `<p class="hint">${esc(g.filter((x) => x !== 'cardio').map((x) => GROUPS[x].name).join(', ') || 'Cardio')}${doneToday ? ' · you have already logged a workout today' : ''}</p>`}
        <div class="gopts">${sel('gpGoal', Object.entries(GOALS), st.prefs.goal, 'Goal')}${sel('gpMin', [[30, '30 min'], [45, '45 min'], [60, '60 min'], [75, '75 min'], [90, '90 min']], st.prefs.minutes, 'Time')}${sel('gpEq', Object.keys(EQLABEL).map((k) => [k, EQLABEL[k]]), st.prefs.equip, 'Equipment')}</div>
        ${st.prefs.equip === 'custom' ? `<div class="eqCustom"><textarea id="gpEqText" rows="2" maxlength="200" placeholder="What do you have? e.g. adjustable dumbbells, a bench, a pull-up bar, resistance bands">${esc(st.prefs.eqText || '')}</textarea><p class="hint" id="gpEqSeen">${eqSeen()}</p></div>` : ''}
        <div class="row wrap"><button type="button" class="primary" data-act="gen">${rest ? 'Train anyway' : 'Generate today\'s workout'}</button><button type="button" data-act="browse">Browse similar workouts</button></div>
        <form id="gpAsk" class="composer" autocomplete="off"><textarea id="gpAskIn" rows="1" maxlength="300" aria-label="Ask for a specific workout" placeholder="Or describe a workout…"></textarea><button class="primary" type="submit" id="gpAskGo">Build</button></form>
        <p class="hint" style="margin:0">For example: "30 min chest and arms, dumbbells only" or "legs, my knee is sore".</p>
        <p class="hint" id="gpErr" role="status"></p>
      </div>
      <div id="gpBrowse">${browseHTML()}</div>
      <div id="gpCur">${workoutCard()}</div>
      <div class="card">
        <div class="sectionHead" style="padding:0"><h2>Your week</h2><span class="hint">${esc(st.name)}</span></div>
        <div class="wk7">${week}</div>
        <p class="hint">${miss.length ? 'Not trained in this split: ' + esc(miss.map((m) => GROUPS[m].name.toLowerCase()).join(', ')) + '.' : 'Every muscle group is covered at least once a week.'}</p>
        ${st.prev ? '<button type="button" class="link left" data-act="undo">Undo last change</button>' : ''}
        <h3 class="gh3">Presets</h3>
        <div class="chips">${PRESETS.map((p) => `<button type="button" data-preset="${p.id}">${esc(p.name)} <small>${p.note}</small></button>`).join('')}</div>
        <details class="note"><summary>Build a split for me</summary>
          <div class="gopts">${sel('gpDays', [[2, '2 days'], [3, '3 days'], [4, '4 days'], [5, '5 days'], [6, '6 days']], 4, 'Days a week')}${sel('gpFocus', [['muscle', 'Build muscle'], ['strength', 'Get stronger'], ['fat', 'Lose fat']], 'muscle', 'Focus')}</div>
          <button type="button" data-act="suggest">Suggest a split</button>
          <p class="hint">Or ask the Coach tab for something custom, like "5 days, I want bigger shoulders".</p></details>
      </div>
      <div class="card" id="gpBurn">${burnCard()}</div>
      <div class="card"><div class="sectionHead" style="padding:0"><h2>Last 7 days</h2><span class="hint">${st.log.filter((l) => !l.other && lastDays(7).includes(l.date)).length} workouts</span></div>
        <div class="chips tiny">${ALL_MUSCLES.filter((m) => m !== 'cardio').map((m) => `<span class="mchip${tr.has(m) ? ' on' : ''}">${esc(GROUPS[m].name)}</span>`).join('')}</div>
        <p class="hint">Highlighted muscles were trained in a workout you logged. Log workouts with "Log workout".</p></div>`;
    $('#gpAskIn').style.height = 'auto';
  }
  function burnCard() {
    const rec = st.log.filter((l) => lastDays(7).includes(l.date)).slice().reverse();
    return `<div class="sectionHead" style="padding:0"><h2>Calories burned</h2><span class="hint">Counts toward Today</span></div>
      <form id="gpCar" class="gopts" autocomplete="off">${sel('gpCardio', EX.filter((x) => Burn.FORMS[x.id]).map((x) => [x.id, x.name]), st.cardioPick || 'treadmill-running', 'Cardio machine or session')}</form>
      <div class="row wrap"><button type="button" data-act="logcardio">Log cardio</button><button type="button" data-act="logcustom">Log something else…</button></div>
      <form id="gpAct" class="gopts" autocomplete="off">${sel('gpActType', Burn.ACTIVITIES.map((a) => [a[0], a[1]]), st.actType || 'walk', 'Other activity')}${sel('gpActMin', [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '60 min'], [90, '90 min'], [120, '2 hours']], st.actMin || 30, 'Time')}</form>
      <div class="row wrap"><button type="button" data-act="addact">Log activity</button></div>
      <div class="logs">${rec.length ? rec.map((l) => `<div class="logrow"><span><b>${esc(l.label)}</b><small>${esc(l.date === DB.dayKey() ? 'Today' : l.date)}${l.sub ? ' · ' + esc(l.sub) : l.mins ? ' · ' + l.mins + ' min' : ''}${l.effort && Burn.EFFORT[l.effort] ? ' · ' + esc(Burn.EFFORT[l.effort].label.toLowerCase()) : ''}</small></span><em>${l.kcal != null ? '−' + l.kcal + ' kcal' : 'no weight yet'}</em><button type="button" class="link" data-rm="${l.ts}" aria-label="Remove ${esc(l.label)}">Remove</button></div>`).join('') : '<p class="hint">Nothing logged in the last 7 days.</p>'}</div>
      <p class="hint">Estimates from your weight and what you logged (sets and reps, or speed, incline, level and time), using standard exercise formulas. Typically within 20 to 30 percent; machine levels differ between brands. Only the extra calories above resting are counted.${''}</p>`;
  }
  /* ---------- browse similar workouts (no AI: several ready-made versions to compare, pick one) ---------- */
  const eqSeen = () => { const c = customEq(st.prefs.eqText); return c.names.length ? 'Recognised: ' + esc(c.names.join(', ')) + ' (and bodyweight).' : 'Nothing recognised yet, so this uses bodyweight exercises only.'; };
  function variants(groups) {
    const P = st.prefs, base = Date.now() % 100000, mk = (title, why, o) => {
      const w = generate(groups, Object.assign({}, P, { seed: base, lose: st.lose }, o));
      return { title, items: w.items, groups, goal: (o && o.goal) || P.goal, why, source: 'plan', mins: estMinutes(w.items) };
    };
    const out = [
      mk('Classic', 'The top-rated exercises for these muscles.', { seed: base }),
      mk('Fresh picks', 'Same muscles, different exercises.', { seed: base + 17 }),
      mk('Short and sharp', 'About 30 minutes.', { minutes: 30, seed: base + 31 }),
      mk('Heavy and strong', 'Fewer reps, longer rests.', { goal: 'strength', minutes: Math.max(30, P.minutes - 20), seed: base + 5 }),
      mk('Pump and burn', 'Higher reps, short rests.', { goal: 'fat', seed: base + 9 }),
    ];
    if (P.equip === 'gym' || P.equip === 'machines' || P.equip === 'homegym') out.push(mk('No machines', 'Free weights and bodyweight only.', { equip: 'home', seed: base + 23 }));
    const seen = new Set(), uniq = [];
    for (const w of out) { const k = w.items.map((i) => i.id).sort().join(','); if (w.items.length && !seen.has(k)) { seen.add(k); uniq.push(w); } }
    return uniq;
  }
  function browseHTML() {
    const b = st.browse; if (!b) return '';
    return `<div class="card"><div class="sectionHead" style="padding:0"><h2>Similar workouts</h2><button type="button" class="link" data-act="closebrowse">Close</button></div>
      <p class="hint">${esc(b.label)}. Tap one to see the exercises, then use it.</p>
      ${b.list.map((w, i) => `<details class="ex2 brw"><summary><span class="exMain"><b>${esc(w.title)}</b><small>${w.items.length} exercises · about ${w.mins} min · ${esc(w.why)}</small></span></summary>
        <div class="exBody">${w.items.map((it) => { const x = EXMAP[it.id]; return x ? `<p style="margin:2px 0"><b>${esc(x.name)}</b> <span class="hint">${esc(it.dur ? it.dur : it.sets + ' × ' + it.reps)}</span></p>` : ''; }).join('')}
        <div class="row wrap"><button type="button" class="primary" data-use="${i}">Use this workout</button></div></div></details>`).join('')}
      <div class="row wrap"><button type="button" data-act="browse">Show more</button></div></div>`;
  }
  function openBrowse(fromCur) {
    const td = st.split[todayIdx()], g = dayGroups(td);
    const groups = fromCur && st.cur ? st.cur.groups : (g.length ? g : ['chest', 'back', 'quads']);
    st.browse = { label: fromCur && st.cur ? 'Other versions of ' + st.cur.title : 'Versions of ' + (g.length ? dayLabel(td) : 'a full-body session'), list: variants(groups) };
    const el = $('#gpBrowse'); if (el) { el.innerHTML = browseHTML(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function refreshCur() { const el = $('#gpCur'); if (el) el.innerHTML = workoutCard(); }
  function err(msg) { const e = $('#gpErr'); if (e) e.textContent = msg || ''; }

  /* ---------- day picker (a small sheet: short list first, "More" for the rest) ---------- */
  let pickDlg = null;
  function pickSheet() {
    if (!pickDlg) { pickDlg = document.createElement('dialog'); pickDlg.id = 'gymPick'; pickDlg.innerHTML = '<div class="sheet" id="gymPickSheet"></div>'; document.body.appendChild(pickDlg); pickDlg.addEventListener('click', (e) => { if (e.target === pickDlg) pickDlg.close(); }); pickDlg.firstChild.addEventListener('click', onPick); }
    return pickDlg;
  }
  function openPick(i) {
    st.pick = { i, more: false, custom: false, sel: new Set(dayGroups(st.split[i]).filter((g) => g !== 'cardio')) };
    pickSheet(); renderPick(); pickDlg.showModal();
  }
  function renderPick() {
    const p = st.pick, cur = st.split[p.i], chip = (k) => `<button type="button" class="${cur.t === k ? 'on' : ''}" data-pk="${k}">${esc(DAYS[k].label)}</button>`;
    const keys = (set) => Object.keys(DAYS).filter((k) => DAYS[k].set === set);
    $('#gymPickSheet').innerHTML = `<div class="closeRow"><button type="button" class="link" data-pk="close">Close</button></div>
      <h2 style="margin:0">${WEEK[p.i]}</h2><p class="hint" style="margin:0">What do you train this day?</p>
      <div class="chips pk">${keys('common').map(chip).join('')}</div>
      ${p.more ? `<h3 class="gh3">Body parts</h3><div class="chips pk">${keys('part').map(chip).join('')}</div><h3 class="gh3">Combos</h3><div class="chips pk">${keys('combo').map(chip).join('')}</div>
        <h3 class="gh3">Your own mix</h3>${p.custom ? `<div class="chips pk">${ALL_MUSCLES.map((m) => `<button type="button" class="${p.sel.has(m) ? 'on' : ''}" data-pm="${m}">${esc(GROUPS[m].name)}</button>`).join('')}</div><button type="button" class="primary" data-pk="customdone">Use this mix</button>` : '<button type="button" data-pk="custom">Pick muscles…</button>'}`
        : '<button type="button" class="link left" data-pk="more">More options…</button>'}`;
  }
  function onPick(e) {
    const p = st.pick; if (!p) return;
    const pm = e.target.closest('[data-pm]'); if (pm) { const m = pm.dataset.pm; if (p.sel.has(m)) p.sel.delete(m); else p.sel.add(m); renderPick(); return; }
    const b = e.target.closest('[data-pk]'); if (!b) return;
    const k = b.dataset.pk;
    if (k === 'close') { pickDlg.close(); return; }
    if (k === 'more') { p.more = true; renderPick(); return; }
    if (k === 'custom') { p.custom = true; renderPick(); return; }
    if (k === 'customdone') { if (!p.sel.size) return; setDay(p.i, { t: 'custom', g: [...p.sel] }); pickDlg.close(); return; }
    if (DAYS[k]) { setDay(p.i, { t: k }); pickDlg.close(); }
  }
  function setDay(i, d) { st.prev = { name: st.name, days: st.split.map((x) => ({ ...x })) }; st.split[i] = d; st.name = 'Custom split'; saveSplit(); if (i === todayIdx()) { st.seed = 1; } renderPlan(); }
  function setSplit(name, days) { st.prev = { name: st.name, days: st.split.map((x) => ({ ...x })) }; st.name = name; st.split = days.map(dayOf); saveSplit(); renderPlan(); }

  /* ---------- AI: Coach and "ask for something specific" ---------- */
  const DAY_KEYS = Object.keys(DAYS);
  function catalogue() { return EX.map((x) => `${x.id}|${x.g}|${x.eq.join('+')}|${x.stars}|${x.type[0]}`).join('\n'); }
  const SYSTEM = () => `You are the coach inside a personal gym app. You help one person decide what to train and you build workouts and weekly splits for them.

HARD RULES
1. Exercises: use ONLY exercises from the CATALOGUE below, by their exact id. Never invent, rename or alter an id. If the request needs something the catalogue lacks, say so in the reply and use the closest listed exercises.
2. Respect the request: muscles, time available, equipment (an exercise is possible if the person has any of its listed equipment, the catalogue lists alternatives joined with +), and injuries or pain (avoid exercises that load the sore area; if pain is mentioned add one short line suggesting a physio or doctor; never diagnose).
3. A workout has 3 to 9 exercises, about 10 minutes each at 3 sets, so match the time asked. Big compound lifts first, isolation after, abs and cardio last. For each exercise give sets 2-5, reps as a short string such as "8-12" or "30-45 s", and rest_s between 30 and 180.
4. Use the person's data: today's slot in their split, what they trained in the last 14 days, muscles not trained in the last 7 days, and their goal. Avoid hammering the same muscles on consecutive days unless asked.
5. The star numbers are a rough community rating from coach articles, not science. Prefer higher stars but choose for the person's needs. Never call the ratings scientific.
6. Never give weights in kg. For "how heavy", say to pick a load that leaves 1 to 3 reps in reserve.
7. Keep advice mainstream and honest about uncertainty. This is not medical advice.
8. If the person wants to lose weight or fat (their words, their Training goal, or their Body goal), the workout MUST include cardio: pick 1 or 2 cardio exercises from the catalogue (g=cardio) with a duration in the reps field such as "25-30 min", about a third of the session, steady and sustainable rather than only intervals. Strength work stays, but fewer sets.
9. A split has exactly 7 entries, Sunday first, each one of these DAY KEYS: ${DAY_KEYS.join(', ')}.

ACTIONS: you can change the person's data. When they ask you to log, change, fix, move or delete something, or to set up their plan, put the changes in "actions" and say in "reply" what you did, in the past tense. Do only what they asked. If it is unclear which entry they mean, or a number is missing, ask one short question and leave actions empty. Dates are YYYY-MM-DD (see DATES). Exercise ids come only from the CATALOGUE. Copy "ts" values from LOGGED, never invent them. Ops:
{"op":"log_workout","date":"","title":"","entries":[{"id":"","sets":[{"kg":60,"reps":8}]}]} (cardio entry {"id":"","f":{"min":30}}; holds use "sec", carries "kg" and "m")
{"op":"log_activity","date":"","type":"walk|run|cycle|swim|football|padel|basket|martial|yoga|hiit|other","min":45}
{"op":"update_log","ts":0,"date":"","title":"","entries":[the full new list]}  {"op":"delete_log","ts":0}
{"op":"set_split","name":"","days":[7 day keys]}  {"op":"set_split_day","day":"thursday","type":"upper"} (or "groups":["chest","triceps"])
{"op":"set_workout","title":"","items":[{"id":"","sets":3,"reps":"8-12","rest_s":90}]} (today's planned workout)  {"op":"clear_workout"}
{"op":"set_gym_prefs","goal":"muscle|strength|fat|fit","minutes":60,"equip":"gym|home|dumbbells|bodyweight|bands|kettlebell|homegym|machines|custom","eq_text":""}  {"op":"set_weight","date":"","kg":80}
If they pin a day ("I want Thursday to be upper body, build a plan around it"), the split must put exactly that on that day and build the other six days around it with rest between hard days.

Reply with ONLY JSON, nothing else:
{"reply":"at most 90 words, plain and friendly, no markdown","workout":null,"split":null,"actions":[]}
"workout" is {"title":"...","items":[{"id":"...","sets":3,"reps":"8-12","rest_s":90}]}. Include it only when a workout is asked for or when you recommend what to train today. "split" is {"name":"...","days":[7 day keys]} and is only for split requests. Otherwise both stay null.

CATALOGUE (id|main muscle|equipment|stars|c=compound i=isolation m=...):
${catalogue()}`;

  /* the recent log with the ids the coach needs to point at an entry (ts) and what was lifted, kept short */
  function loggedLines(n) {
    const rows = st.log.filter((l) => lastDays(21).includes(l.date)).sort((x, y) => y.ts - x.ts).slice(0, n == null ? 12 : n);
    if (!rows.length) return 'LOGGED: nothing in the last 21 days.';
    const sum = (l) => (l.detail || []).map((e) => e.kind === 'cardio' ? `${e.id}:${(e.f && e.f.min) || '?'}min` : `${e.id}:${(e.sets || []).map((s) => (s.kg != null ? s.kg : '') + (s.sec ? 's' + s.sec : s.m ? 'm' + s.m : 'x' + s.reps)).join(',')}`).join('; ');
    return 'LOGGED (newest first, format ts | date | label | exercises id:kg x reps):\n' + rows.map((l) => `${l.ts} | ${l.date} | ${l.label}${l.other ? ' (activity ' + l.mins + 'min)' : ''} | ${sum(l)}`.slice(0, 230)).join('\n');
  }
  async function context(n) {
    const ti = todayIdx(), log = st.log.filter((l) => lastDays(14).includes(l.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const prof = await DB.get('profile', null), tr = trainedRecently(7);
    const lines = [
      `Today: ${WEEK[ti]} ${DB.dayKey()}. Today's slot in their split: ${dayLabel(st.split[ti])}.`,
      `Their week (Sunday first): ${st.split.map((d, i) => WK3[i] + ' ' + dayLabel(d)).join(', ')}.`,
      `Training goal: ${GOALS[st.prefs.goal]}. Usual session length: ${st.prefs.minutes} min. Equipment they have: ${eqSentence()}. Only use exercises they can do with it.`,
      prof ? `Body goal: ${prof.goal === 'lose' ? 'lose weight' : prof.goal === 'gain' ? 'gain weight' : 'maintain weight'}.` : '',
      log.length ? 'Workouts logged in the last 14 days: ' + log.map((l) => `${l.date} ${l.label} (${(l.groups || []).filter((g) => g !== 'cardio').map((g) => GROUPS[g] ? GROUPS[g].name : g).join(', ') || 'cardio'})`).join('; ') + '.' : 'No workouts logged in the last 14 days.',
      'Muscles not trained in the last 7 days: ' + (ALL_MUSCLES.filter((m) => m !== 'cardio' && !tr.has(m)).map((m) => GROUPS[m].name).join(', ') || 'none') + '.',
      'DATES: ' + Actions.dateTable(),
      st.cur ? `Today's planned workout: ${st.cur.title}${st.cur.done ? ' (already done)' : ''}.` : "No workout is planned for today.",
      loggedLines(n),
    ];
    return lines.filter(Boolean).join('\n');
  }
  function cleanWorkout(w, source) {
    if (!w || !Array.isArray(w.items)) return null;
    const seen = new Set(), items = [];
    for (const it of w.items) {
      const x = it && EXMAP[String(it.id || '')]; if (!x || seen.has(x.id)) continue; seen.add(x.id);
      const sets = Math.max(1, Math.min(6, Math.round(Number(it.sets) || 3)));
      const reps = String(it.reps || '8-12').replace(/[^0-9a-zA-Z \-–.,/]/g, '').slice(0, 24) || '8-12';
      const rest = Math.max(20, Math.min(240, Math.round(Number(it.rest_s || it.rest) || 75)));
      items.push(x.type === 'cardio' ? { id: x.id, dur: reps.length > 2 && /min/i.test(reps) ? reps : '15-20 min' } : { id: x.id, sets, reps, rest });
    }
    if (items.length < 2) return null;
    const gs = [...new Set(items.map((i) => EXMAP[i.id].g))];
    return { title: String(w.title || 'Workout').slice(0, 60), items: items.slice(0, 10), groups: gs, goal: st.prefs.goal, source, mins: estMinutes(items.slice(0, 10)) };
  }
  function cleanSplit(s) {
    if (!s || !Array.isArray(s.days) || s.days.length !== 7) return null;
    const days = s.days.map((k) => (DAYS[k] ? k : null)); if (days.some((k) => !k)) return null;
    if (days.every((k) => k === 'rest')) return null;
    return { name: String(s.name || 'Coach split').slice(0, 50), days };
  }
  /* Weight loss means cardio. If the request, the training goal or the body goal says so and the reply has none, add it in code. */
  const LOSS_RE = /\b(lose|losing|loss|drop|cut|cutting|burn|shed)\b.{0,20}\b(weight|fat|belly|kg|kilos|pounds)\b|\b(weight|fat) ?loss\b|\bget lean\b|\bslim|\bshred|\bfat burn/i;
  function ensureCardio(w, message) {
    if (!w) return w;
    const wantsMuscleOnly = /\b(no cardio|without cardio|only (lift|weights|strength))\b/i.test(message || '');
    const loss = LOSS_RE.test(message || '') || st.prefs.goal === 'fat' || (st.lose && /\b(workout|train|session|today)\b/i.test(message || '') && !/\b(muscle|strength|bulk|build)\b/i.test(message || ''));
    if (!loss || wantsMuscleOnly || w.items.some((i) => i.dur)) return w;
    const used = new Set(w.items.map((i) => i.id)), mins = Math.max(15, Math.min(35, Math.round(st.prefs.minutes * 0.35 / 5) * 5));
    const add = cardioBlock(Object.assign({}, st.prefs), rng(Date.now() % 99991), used, mins, true);
    w.items = w.items.slice(0, 7).concat(add); w.mins = estMinutes(w.items); w.note = ((w.note || '') + ' Cardio added because you are aiming to lose weight.').trim();
    return w;
  }
  async function coachCall(message, history) {
    let ctx = '';
    for (const n of [12, 8, 5, 3, 0]) { ctx = await context(n); if (ctx.length + message.length + 30 <= 5900) break; }     // the proxy cuts requests at 6000 characters, and the person's message is at the end
    const r = await AI.askJSON({ task: 'coach', system: SYSTEM(), history, text: ctx + '\n\nTHE PERSON SAYS: ' + message, max_tokens: 1000 });
    const reply = String(r.reply || '').slice(0, 900);
    return { reply, workout: ensureCardio(cleanWorkout(r.workout, 'ai'), message), split: cleanSplit(r.split), askedWorkout: !!r.workout, askedSplit: !!r.split, actions: Array.isArray(r.actions) ? r.actions : [] };
  }

  /* ---------- Coach chat ---------- */
  const CHIPS = ['I want Thursday to be upper body. Build a plan around that', 'What should I train today?', 'What have I been neglecting?', 'I only have 30 minutes', 'Build me a 4-day split', 'Chest and arms with dumbbells only'];
  function renderCoach() {
    const c = st.coach;
    $('#gCoach').innerHTML = `<div class="chat" id="gcChat" aria-live="polite">${c.msgs.length ? c.msgs.map((m, i) => {
      if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
      if (m.wait) return '<div class="msg ai wait">Thinking…</div>';
      if (m.err) return `<div class="msg ai err">${esc(m.text)}</div>`;
      return `<div class="msg ai ans"><div>${esc(m.text)}</div>${m.act ? Actions.html(m.act, i, esc) : ''}${m.workout ? `<div class="miniw"><b>${esc(m.workout.title)}</b><small>${m.workout.items.length} exercises · about ${m.workout.mins} min</small><ol>${m.workout.items.map((it) => `<li>${esc(EXMAP[it.id].name)} <small>${esc(it.dur || it.sets + ' × ' + it.reps)}</small></li>`).join('')}</ol><button type="button" class="primary" data-cw="${i}">Use this workout</button></div>` : ''}${m.split ? `<div class="miniw"><b>${esc(m.split.name)}</b><small>${m.split.days.map((k, j) => WK3[j] + ' ' + DAYS[k].label).join(' · ')}</small><button type="button" class="primary" data-cs="${i}">Use this split</button></div>` : ''}</div>`;
    }).join('') : '<p class="hint">Ask what to train, or tell me to change something: log a workout, fix a logged set, move a day in your split, set the workout for today. I only use exercises from the Plate list, and every change has an Undo.</p>'}</div>
      <div class="chips" id="gcChips">${(c.msgs.length ? [] : CHIPS).map((f) => `<button type="button" data-q="${esc(f)}">${esc(f)}</button>`).join('')}</div>
      <form class="composer" id="gcForm" autocomplete="off"><textarea id="gcIn" rows="1" maxlength="400" placeholder="Ask your coach…" aria-label="Message"></textarea><button class="primary" type="submit" id="gcGo">Send</button></form>
      <p class="hint nfoot">General fitness guidance, not medical advice. If something hurts, stop and see a doctor or physio.</p>`;
    const last = $('#gcChat').lastElementChild; if (last && c.msgs.length > 1) last.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }
  /* "I want Thursday to be upper body": whatever the AI built, a day the person pinned in their own words stays exactly as they said */
  const TYPE_WORDS = [[/\bupper\b/, 'upper'], [/\blower\b/, 'lower'], [/\bpush\b/, 'push'], [/\bpull\b/, 'pull'], [/\blegs?\b/, 'legs'], [/\bfull[ -]?body\b/, 'full'], [/\b(rest|off)\b/, 'rest'], [/\bcardio\b/, 'cardio']];
  const WD_RE = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thurs?|fri|sat)\b/g;
  const WD_IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  function pinsOf(msg) {
    const out = {};
    String(msg || '').toLowerCase().split(/[.;!?\n,]| but | and then /).forEach((clause) => {
      if (!/\b(want|make|should|set|put|needs?|have|keep|be|is|as|on)\b/.test(clause)) return;
      const days = [...new Set([...clause.matchAll(WD_RE)].map((m) => WD_IDX[m[1].slice(0, 3)]))], types = TYPE_WORDS.filter(([re]) => re.test(clause)).map((x) => x[1]);
      if (days.length === 1 && types.length === 1) out[days[0]] = types[0];
    });
    return out;
  }
  function pinDays(actions, msg) {
    const pins = pinsOf(msg); if (!Object.keys(pins).length) return actions;
    return actions.map((a) => {
      if (!a || typeof a !== 'object') return a;
      if (a.op === 'set_split' && Array.isArray(a.days) && a.days.length === 7) return Object.assign({}, a, { days: a.days.map((d, i) => (pins[i] ? pins[i] : d)) });
      if (a.op === 'set_split_day') { try { const i = typeof a.day === 'number' ? a.day : WD_IDX[String(a.day).toLowerCase().slice(0, 3)]; if (pins[i]) return { op: 'set_split_day', day: i, type: pins[i] }; } catch (e) {} }
      return a;
    });
  }
  async function coachAsk(text) {
    text = (text || '').trim(); const c = st.coach; if (!text || c.busy) return;
    c.busy = true;
    const hist = c.msgs.filter((m) => !m.wait && !m.err).slice(-4).map((m) => ({ role: m.role === 'me' ? 'user' : 'model', text: m.text }));
    c.msgs.push({ role: 'me', text }, { role: 'ai', wait: true }); renderCoach();
    try {
      const r = await coachCall(text, hist);
      c.msgs.pop();
      let t = r.reply || 'Here you go.', act = null;
      if (r.actions.length) {
        act = await Actions.run(pinDays(r.actions, text), 'coach');
        await reload(); refreshToday();
        if (!act.count) t = "I couldn't apply that, so nothing was changed.";
      }
      if (r.askedWorkout && !r.workout) t += '\n\n(I could not build a valid workout from the exercise list this time. Try rephrasing.)';
      if (r.askedSplit && !r.split) t += '\n\n(I could not build a valid split this time. Try rephrasing.)';
      c.msgs.push({ role: 'ai', text: t, workout: r.workout, split: r.split, act });
    } catch (e) { c.msgs.pop(); c.msgs.push({ role: 'ai', text: e.message, err: true }); }
    c.busy = false; renderCoach();
  }

  /* ---------- events ---------- */
  function useWorkout(w) { st.cur = w; saveCur(); }
  async function saveSession(entries, label, groups, ids) {
    const b = await Burn.session(entries, GymLog.MAP);
    st.log.push({ date: DB.dayKey(), ts: Date.now(), label, groups, ids, mins: b ? b.mins : null, kcal: b ? b.kcal : null, sub: b ? b.sub : '', detail: entries });
    st.log = st.log.slice(-150); await DB.set('gymLog', st.log); renderPlan(); refreshToday();
    if (!b) err('Add your weight in Today > Goals to see calories burned.'); else err('');
  }
  function logDone() {
    const w = st.cur; if (!w || w.done) return;
    GymLog.open(w.items, { title: w.title, log: st.log, onSave: async (entries) => {
      await saveSession(entries, w.title, w.groups || [], entries.map((e) => e.id)); w.done = true; saveCur(); refreshCur();
    } });
  }
  function logCustom() {
    GymLog.openCustom({ onSave: async (entries) => { const e = entries[0]; await saveSession(entries, (e.name || '').trim() || 'Workout', e.kind === 'cardio' ? ['cardio'] : [], [e.id]); } });
  }
  function logCardio() {
    const id = $('#gpCardio').value; st.cardioPick = id;
    GymLog.open([{ id }], { title: GymLog.MAP[id].name, log: st.log, onSave: async (entries) => { await saveSession(entries, GymLog.MAP[id].name, ['cardio'], [id]); } });
  }
  function refreshToday() { try { window.Plate.refreshToday && window.Plate.refreshToday(); } catch (e) {} }
  async function addActivity() {
    const t = $('#gpActType').value, m = +$('#gpActMin').value; st.actType = t; st.actMin = m;
    const b = await Burn.activity(t, m);
    st.log.push({ date: DB.dayKey(), ts: Date.now(), label: Burn.ACTIVITIES.find((a) => a[0] === t)[1], groups: [], ids: [], other: true, mins: m, kcal: b ? b.kcal : null });
    st.log = st.log.slice(-150); await DB.set('gymLog', st.log); renderPlan(); refreshToday();
  }
  async function removeLog(ts) {
    const gone = st.log.find((l) => l.ts === ts);
    st.log = st.log.filter((l) => l.ts !== ts); await DB.set('gymLog', st.log);
    if (gone) window.Plate.toast('Entry removed', 'Undo', async () => { st.log = st.log.concat([gone]).sort((a, b) => a.ts - b.ts); await DB.set('gymLog', st.log); renderPlan(); refreshToday(); });
    if (st.cur && st.cur.done && !st.log.some((l) => !l.other && l.date === DB.dayKey())) { st.cur.done = false; saveCur(); }
    renderPlan(); refreshToday();
  }
  $('#gPlan').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-day]'); if (d) { openPick(+d.dataset.day); return; }
    const pr = e.target.closest('[data-preset]'); if (pr) { const p = PRESETS.find((q) => q.id === pr.dataset.preset); setSplit(p.name, p.days); return; }
    const dm = e.target.closest('[data-demo]'); if (dm) { GYM.openDemo(dm.dataset.demo); return; }
    const sw = e.target.closest('[data-swap]'); if (sw) { const open = sw.closest('details'); if (swapItem(st.cur, +sw.dataset.swap)) { st.cur.done = false; saveCur(); refreshCur(); } else err('No other option for that exercise with your equipment.'); return; }
    const us = e.target.closest('[data-use]'); if (us && st.browse) { const w = st.browse.list[+us.dataset.use]; if (w) { useWorkout(Object.assign({}, w)); st.browse = null; $('#gpBrowse').innerHTML = ''; err(''); refreshCur(); const c = $('#gpCur'); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { removeLog(+rm.dataset.rm); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, td = st.split[todayIdx()];
    if (act === 'gen') {
      st.seed = Date.now() % 100000; const g = dayGroups(td);
      const groups = g.length ? g : ['chest', 'back', 'quads'];
      useWorkout(makeWorkout(groups, g.length ? dayLabel(td) : 'Bonus session')); err(''); refreshCur();
      const c = $('#gpCur'); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (act === 'shuffle' && st.cur) { st.seed++; const w = makeWorkout(st.cur.groups, st.cur.title); useWorkout(w); refreshCur(); }
    if (act === 'browse') openBrowse(a.closest('#gpCur') != null);
    if (act === 'closebrowse') { st.browse = null; $('#gpBrowse').innerHTML = ''; }
    if (act === 'done') logDone();
    if (act === 'addact') addActivity();
    if (act === 'logcardio') logCardio();
    if (act === 'logcustom') logCustom();
    if (act === 'clear') { st.cur = null; DB.set('gymCurrent', null); refreshCur(); }
    if (act === 'undo' && st.prev) { st.name = st.prev.name; st.split = st.prev.days; st.prev = null; saveSplit(); renderPlan(); }
    if (act === 'suggest') { const s = suggestSplit(+$('#gpDays').value, $('#gpFocus').value); setSplit(s.name, s.days); }
  });
  $('#gPlan').addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'gpGoal') st.prefs.goal = e.target.value; else if (id === 'gpMin') st.prefs.minutes = +e.target.value; else if (id === 'gpEq') st.prefs.equip = e.target.value; else if (id === 'gpEqText') { st.prefs.eqText = e.target.value.trim().slice(0, 200); const sn = $('#gpEqSeen'); if (sn) sn.innerHTML = eqSeen(); } else return;
    savePrefs(); if (id === 'gpEq') { st.browse = null; renderPlan(); if (e.target.value === 'custom') { const t = $('#gpEqText'); if (t) t.focus(); } }
  });
  $('#gPlan').addEventListener('submit', async (e) => {
    if (e.target.id !== 'gpAsk') return; e.preventDefault();
    const t = $('#gpAskIn').value.trim(); if (!t || st.busy) return;
    st.busy = true; $('#gpAskGo').disabled = true; err('Building…');
    try {
      const r = await coachCall('Build me a workout for this request: ' + t, []);
      if (r.workout) { r.workout.note = r.reply; useWorkout(r.workout); err(''); refreshCur(); $('#gpAskIn').value = ''; }
      else err(r.reply || 'I could not build a workout from the exercise list for that. Try rephrasing.');
    } catch (x) { err(x.message); }
    st.busy = false; const g = $('#gpAskGo'); if (g) g.disabled = false;
  });
  $('#gCoach').addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]'); if (q) { coachAsk(q.dataset.q); return; }
    const un = e.target.closest('[data-undo]'); if (un) { const m = st.coach.msgs[+un.dataset.undo]; if (m && m.act && !m.act.undone) { m.act.undone = true; m.act.undo().then(async () => { await reload(); refreshToday(); renderCoach(); }); } return; }
        const cw = e.target.closest('[data-cw]'); if (cw) { const m = st.coach.msgs[+cw.dataset.cw]; if (m && m.workout) { useWorkout(m.workout); showSec('plan'); } return; }
    const cs = e.target.closest('[data-cs]'); if (cs) { const m = st.coach.msgs[+cs.dataset.cs]; if (m && m.split) { setSplit(m.split.name, m.split.days); showSec('plan'); } }
  });
  $('#gCoach').addEventListener('submit', (e) => { if (e.target.id !== 'gcForm') return; e.preventDefault(); const t = $('#gcIn').value; $('#gcIn').value = ''; coachAsk(t); });

  /* ---------- sections ---------- */
  async function showSec(s) {
    st.sec = s;
    try { localStorage.setItem('gym-sec', s); } catch (_) {}
    $$('[data-gsec]').forEach((b) => b.classList.toggle('on', b.dataset.gsec === s));
    $('#gMuscles').hidden = s !== 'muscles'; $('#gPlan').hidden = s !== 'plan'; $('#gCoach').hidden = s !== 'coach';
    if (s === 'muscles' && window.Plate.hooks.gymMap) window.Plate.hooks.gymMap();
    if (s === 'plan') { if (!st.split) await load(); renderPlan(); }
    if (s === 'coach') { if (!st.split) await load(); renderCoach(); }
  }
  $$('[data-gsec]').forEach((b) => b.addEventListener('click', () => showSec(b.dataset.gsec)));
  const prevHook = window.Plate.hooks.gym;
  window.Plate.hooks.gymMap = prevHook;
  window.Plate.hooks.gym = async () => {
    if (!st.split) await load();
    let s = 'muscles'; try { s = localStorage.getItem('gym-sec') || 'muscles'; } catch (_) {}
    if (!['muscles', 'plan', 'coach'].includes(s)) s = 'muscles';
    showSec(s);
  };
  /* after the coach changes stored data: reload it and redraw whatever is showing */
  async function reload() { await load(); if (st.sec === 'plan') renderPlan(); refreshToday(); }
  window.Plate.gymPlan = { generate, DAYS, suggestSplit, cleanWorkout, cleanSplit, state: st, estMinutes, reload, pinDays, pinsOf };
  if (!$('#view-gym').hidden) window.Plate.hooks.gym();
})();
