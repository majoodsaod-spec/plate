/* Plate actions: lets the two chats (nutrition and coach) change your data.
   The AI never touches storage. It proposes a list of small, named operations; this file checks every one of them (ids must exist,
   numbers must be sane, nothing unknown is accepted), applies the good ones, skips the bad ones and says which, and keeps one
   undo for the whole batch.
   Actions.run(list, domain) -> { done: [text], skipped: [text], undo() }   (domain: 'nutrition' | 'coach') */
(function (root) {
  'use strict';
  const MAX_OPS = 12;

  /* ---------- small helpers ---------- */
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const fin = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const rng = (v, lo, hi) => { const n = fin(v); return n != null && n >= lo && n <= hi ? n : null; };
  const r1 = (n) => Math.round(n * 10) / 10;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const realDate = (s) => { if (!DATE.test(s)) return false; const [y, m, d] = s.split('-').map(Number), t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
  const today = () => DB.dayKey();
  const tsFor = (date) => { if (date === today()) return Date.now(); const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, 12, 0).getTime() + Math.floor(Math.random() * 3000); };
  /* a date the AI gave: must be real and within a sane window (a year back, a week ahead) */
  function day(v, fallback) {
    if (v == null || v === '') return fallback || today();
    const s = String(v).trim();
    if (!realDate(s)) throw new Error('"' + s + '" is not a real date');
    const t = new Date(s + 'T12:00:00').getTime(), now = Date.now();
    if (t < now - 400 * 864e5 || t > now + 8 * 864e5) throw new Error(s + ' is too far from today');
    return s;
  }
  const fail = (m) => { throw new Error(m); };

  /* ---------- nutrition ---------- */
  async function getMeal(id) { id = str(id, 60); if (!id) fail('no meal id'); const m = await DB.getMeal(id); if (!m) fail('no meal with id ' + id); return m; }
  const MACROS = ['protein', 'carbs', 'fat'];
  function cleanNut(a, base) {
    const out = {};
    if ('name' in a) { const n = str(a.name, 90); if (!n) fail('empty name'); out.name = n; }
    if ('kcal' in a) { const v = rng(a.kcal, 0, 5000); if (v == null) fail('calories must be 0 to 5000'); out.kcal = Math.round(v); }
    MACROS.forEach((k) => { if (k in a) { const v = rng(a[k], 0, 500); if (v == null) fail(k + ' must be 0 to 500 g'); out[k] = r1(v); } });
    ['fiber', 'sugar'].forEach((k) => { if (k in a && a[k] != null) { const v = rng(a[k], 0, 300); if (v == null) fail(k + ' is out of range'); out[k] = r1(v); } });
    if ('sodium' in a && a.sodium != null) { const v = rng(a.sodium, 0, 20000); if (v == null) fail('sodium is out of range'); out.sodium = Math.round(v); }
    if ('note' in a) out.note = str(a.note, 200);
    return out;
  }
  const ops = { nutrition: {}, coach: {} };
  const both = (name, fn) => { ops.nutrition[name] = fn; ops.coach[name] = fn; };

  ops.nutrition.add_meal = async (a, log) => {
    const date = day(a.date), f = cleanNut(a);
    if (!f.name || f.kcal == null) fail('a meal needs a name and calories');
    const p = f.protein || 0, c = f.carbs || 0, fa = f.fat || 0;
    const meal = await DB.addMeal(Object.assign({ date, ts: tsFor(date), source: 'chat', confidence: 'low', protein: p, carbs: c, fat: fa,
      items: [{ name: f.name, brand: null, kind: 'homemade', portion: '1 serving', basis: 'estimate', amount: 1, unit: 'serving', kcal: f.kcal, protein: p, carbs: c, fat: fa, low: Math.round(f.kcal * 0.85), high: Math.round(f.kcal * 1.15) }] }, f));
    log.undo(() => DB.deleteMeal(meal.id));
    return `Added "${f.name}" (${f.kcal} kcal) to ${date === today() ? 'today' : date}`;
  };
  ops.nutrition.update_meal = async (a, log) => {
    const m = await getMeal(a.id), f = cleanNut(a), n = Object.assign({}, m);
    let date = m.date; if ('date' in a) date = day(a.date);
    if (!Object.keys(f).length && date === m.date) fail('nothing to change');
    /* totals changed: scale the ingredient rows with them, so editing the meal later still adds up */
    if (Array.isArray(m.items) && m.items.length) {
      const ratio = (nw, old) => (nw != null && old > 0 ? nw / old : null);
      const rk = ratio(f.kcal, m.kcal), rp = ratio(f.protein, m.protein), rc = ratio(f.carbs, m.carbs), rf = ratio(f.fat, m.fat);
      n.items = m.items.map((it) => {
        const x = Object.assign({}, it);
        if (rk != null) { x.kcal = Math.round((it.kcal || 0) * rk); if (it.amount != null) x.amount = r1(it.amount * rk); if (it.low != null) x.low = Math.round(it.low * rk); if (it.high != null) x.high = Math.round(it.high * rk); }
        if (rp != null) x.protein = r1((it.protein || 0) * rp);
        if (rc != null) x.carbs = r1((it.carbs || 0) * rc);
        if (rf != null) x.fat = r1((it.fat || 0) * rf);
        if (f.name && m.items.length === 1) x.name = f.name;
        return x;
      });
    }
    Object.assign(n, f);
    if (date !== m.date) { n.date = date; n.ts = tsFor(date); }
    await DB.updateMeal(n); log.undo(() => DB.updateMeal(m));
    return `Updated "${n.name}"`;
  };
  ops.nutrition.delete_meal = async (a, log) => { const m = await getMeal(a.id); await DB.deleteMeal(m.id); log.undo(() => DB.updateMeal(m)); return `Deleted "${m.name}" (${m.date === today() ? 'today' : m.date})`; };

  both('set_weight', async (a, log) => {
    const date = day(a.date), kg = rng(a.kg, 25, 350), cm = a.cm == null || a.cm === '' ? null : rng(a.cm, 40, 200);
    if (kg == null) fail('weight must be 25 to 350 kg');
    const old = (await DB.allWeights()).find((w) => w.date === date);
    await DB.setWeight(date, r1(kg), cm || (old && old.cm) || undefined);
    const ws = await DB.allWeights(), newest = ws.length ? ws[ws.length - 1].date : date;
    if (date >= newest && root.Plate && root.Plate.syncBody) {                       // the newest entry: the profile and targets follow it
      const oldP = await DB.get('profile', null), oldG = await DB.get('goals', null);
      if (await root.Plate.syncBody(r1(kg), cm)) log.undo(async () => { await DB.set('profile', oldP); await DB.set('goals', oldG); });
    }
    log.undo(() => (old ? DB.setWeight(old.date, old.kg, old.cm) : DB.deleteWeight(date)));
    return `Weight ${r1(kg)} kg on ${date === today() ? 'today' : date}`;
  });
  ops.nutrition.delete_weight = async (a, log) => {
    const date = day(a.date), old = (await DB.allWeights()).find((w) => w.date === date); if (!old) fail('no weight logged on ' + date);
    await DB.deleteWeight(date); log.undo(() => DB.setWeight(old.date, old.kg, old.cm)); return `Removed the weight on ${date}`;
  };
  ops.nutrition.set_water = async (a, log) => {
    const date = day(a.date), ml = rng(a.ml, 0, 10000); if (ml == null) fail('water must be 0 to 10000 ml');
    const k = 'water:' + date, old = await DB.get(k, undefined); await DB.set(k, Math.round(ml)); log.undo(() => DB.set(k, old === undefined ? 0 : old));
    return `Water ${Math.round(ml)} ml for ${date === today() ? 'today' : date}`;
  };
  ops.nutrition.set_goals = async (a, log) => {
    const prof = await DB.get('profile', null), old = await DB.get('goals', null), cur = old || {};
    const floor = prof && prof.sex === 'male' ? 1500 : 1200;
    let kcal = a.kcal == null ? cur.kcal : rng(a.kcal, 500, 8000), protein = a.protein == null ? cur.protein : rng(a.protein, 10, 500);
    if (kcal == null || protein == null) fail('give calories and protein as real numbers');
    let note = ''; if (kcal < floor) { kcal = floor; note = ` (raised to the safe minimum of ${floor})`; }
    kcal = Math.round(kcal); protein = Math.round(protein);
    const r5 = (v) => Math.round(v / 5) * 5;
    let fat = a.fat == null ? r5(0.25 * kcal / 9) : rng(a.fat, 5, 400), carbs = a.carbs == null ? Math.max(0, r5((kcal - protein * 4 - (fat || 0) * 9) / 4)) : rng(a.carbs, 0, 1000);
    if (fat == null || carbs == null) fail('fat or carbs out of range');
    await DB.set('goals', Object.assign({}, cur, { kcal, protein, carbs: Math.round(carbs), fat: Math.round(fat), custom: true, mode: 'inout' }));
    log.undo(() => DB.set('goals', old));
    return `Daily goal ${kcal} kcal, ${protein} g protein, ${Math.round(carbs)} g carbs, ${Math.round(fat)} g fat${note}`;
  };
  ops.nutrition.set_profile = async (a, log) => {
    const oldP = await DB.get('profile', null), oldG = await DB.get('goals', null);
    if (!oldP) fail('set up your profile in Goals first');
    const p = Object.assign({}, oldP);
    if ('weight' in a) { const v = rng(a.weight, 30, 250); if (v == null) fail('weight must be 30 to 250 kg'); p.weight = r1(v); }
    if ('height' in a) { const v = rng(a.height, 120, 230); if (v == null) fail('height must be 120 to 230 cm'); p.height = Math.round(v); }
    if ('sex' in a) { if (!['male', 'female'].includes(a.sex)) fail('sex must be male or female'); p.sex = a.sex; }
    if ('activity' in a) { if (!['sedentary', 'light', 'moderate', 'very'].includes(a.activity)) fail('unknown activity level'); p.activity = a.activity; }
    if ('goal' in a) { if (!['lose', 'slow', 'maintain', 'gain'].includes(a.goal)) fail('unknown goal'); p.goal = a.goal; }
    if ('birth' in a) { const s = str(a.birth, 10); if (!realDate(s) || DB.ageFrom(s) < 14 || DB.ageFrom(s) > 100) fail('birthday is not valid'); p.birth = s; p.age = DB.ageFrom(s); }
    await DB.set('profile', p);
    let tail = '';
    if (oldG && !oldG.custom && root.Plate && root.Plate.calcGoals) {         // their targets follow the profile unless they set their own
      const c = root.Plate.calcGoals(Object.assign({}, p, { age: DB.ageFrom(p.birth) >= 0 ? DB.ageFrom(p.birth) : p.age }));
      await DB.set('goals', Object.assign({}, oldG, { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, bmr: c.bmr, tdee: c.tdee })); tail = `, targets now ${c.kcal} kcal and ${c.protein} g protein`;
    }
    log.undo(async () => { await DB.set('profile', oldP); await DB.set('goals', oldG); });
    return 'Profile updated' + tail;
  };
  ops.nutrition.set_diet_prefs = async (a, log) => {
    const old = await DB.get('dietPrefs', ''), t = str(a.text, 300); await DB.set('dietPrefs', t); log.undo(() => DB.set('dietPrefs', old));
    return t ? 'Food preferences saved' : 'Food preferences cleared';
  };
  ops.nutrition.delete_recipe = async (a, log) => {
    const id = str(a.id, 60), r = (await DB.allRecipes()).find((x) => x.id === id); if (!r) fail('no saved recipe with id ' + id);
    await DB.deleteRecipe(id); log.undo(() => DB.saveRecipe(r)); return `Deleted the recipe "${r.title}"`;
  };

  /* ---------- gym ---------- */
  const GP = () => (root.Plate && root.Plate.gymPlan) || fail('the gym tab is not ready yet');
  const exMap = () => root.GymLog.MAP;
  async function gymLog() { return ((await DB.get('gymLog', [])) || []).slice(); }
  const saveLog = (l) => DB.set('gymLog', l.slice(-600));
  const num0 = (v, lo, hi, what) => { if (v == null || v === '') return null; const n = rng(v, lo, hi); if (n == null) fail(what + ' must be ' + lo + ' to ' + hi); return n; };

  /* one logged exercise, checked against what that exercise measures (same shapes the log sheet saves) */
  function entry(e) {
    if (!isObj(e)) fail('bad exercise entry');
    const id = str(e.id, 60), x = exMap()[id]; if (!x) fail('"' + id + '" is not an exercise in the list');
    const kind = Burn.kindOf(x);
    if (kind === 'cardio') {
      if (!Burn.FORMS[id]) fail('cannot log ' + id);
      const f = {}, given = isObj(e.f) ? e.f : {};
      Burn.FORMS[id].forEach((fd) => {
        let v = given[fd.k];
        if (fd.sel) { v = fd.sel.some(([k]) => k === v) ? v : fd.def; }
        else { const n = v == null || v === '' ? null : rng(v, 0, 100000); v = n != null ? n : fd.def; }
        f[fd.k] = v;
      });
      if (f.min != null && !(+f.min > 0 && +f.min <= 600)) fail('time must be 1 to 600 minutes');
      const out = { id, kind, f }; if (id.startsWith('custom')) out.name = str(e.name, 60) || x.name; return out;
    }
    const raw = Array.isArray(e.sets) ? e.sets.slice(0, 12) : []; if (!raw.length) fail('no sets for ' + x.name);
    const sets = raw.map((s) => {
      s = isObj(s) ? s : {};
      const kg = num0(s.kg, 0, 1000, 'weight'), reps = num0(s.reps, 0, 1000, 'reps'), sec = num0(s.sec, 0, 7200, 'seconds'), m = num0(s.m, 0, 5000, 'metres');
      return kind === 'hold' ? { sec, kg } : kind === 'carry' ? { kg, m } : { kg, reps };
    }).filter((s) => (s.reps > 0) || (s.sec > 0) || (s.m > 0));
    if (!sets.length) fail('no valid sets for ' + x.name);
    const out = { id, kind, rest: rng(e.rest, 10, 600) || (x.type === 'compound' ? 120 : 75), sets };
    if (id.startsWith('custom')) out.name = str(e.name, 60) || x.name;
    return out;
  }
  async function buildSession(a, label) {
    const list = Array.isArray(a.entries) ? a.entries.slice(0, 15) : []; if (!list.length) fail('no exercises given');
    const entries = list.map(entry), b = await Burn.session(entries, exMap());
    const groups = [...new Set(entries.map((e) => (e.kind === 'cardio' ? 'cardio' : (exMap()[e.id] && exMap()[e.id].g) || null)).filter((g) => g && !String(g).startsWith('custom')))];
    return { entries, b, groups, ids: entries.map((e) => e.id), label: str(label, 60) || 'Workout' };
  }
  ops.coach.log_workout = async (a, log) => {
    const date = day(a.date), s = await buildSession(a, a.title), l = await gymLog(), before = l.slice();
    l.push({ date, ts: tsFor(date), label: s.label, groups: s.groups, ids: s.ids, mins: s.b ? s.b.mins : null, kcal: s.b ? s.b.kcal : null, sub: s.b ? s.b.sub : '', detail: s.entries });
    await saveLog(l); log.undo(() => saveLog(before));
    return `Logged "${s.label}" (${s.entries.length} exercise${s.entries.length > 1 ? 's' : ''}) on ${date === today() ? 'today' : date}`;
  };
  ops.coach.log_activity = async (a, log) => {
    const date = day(a.date), t = Burn.ACTIVITIES.find((x) => x[0] === a.type); if (!t) fail('unknown activity "' + str(a.type, 20) + '"');
    const m = rng(a.min, 1, 600); if (m == null) fail('minutes must be 1 to 600');
    const b = await Burn.activity(t[0], Math.round(m)), l = await gymLog(), before = l.slice();
    l.push({ date, ts: tsFor(date), label: t[1], groups: [], ids: [], other: true, mins: Math.round(m), kcal: b ? b.kcal : null });
    await saveLog(l); log.undo(() => saveLog(before)); return `Logged ${t[1]}, ${Math.round(m)} min`;
  };
  const findLog = (l, ts) => { const i = l.findIndex((x) => x.ts === Number(ts)); if (i < 0) fail('no logged workout with that id'); return i; };
  ops.coach.update_log = async (a, log) => {
    const l = await gymLog(), before = l.slice(), i = findLog(l, a.ts), o = l[i], n = Object.assign({}, o);
    let changed = false;
    if ('date' in a) { n.date = day(a.date); changed = true; }
    if ('title' in a) { n.label = str(a.title, 60) || o.label; changed = true; }
    if (Array.isArray(a.entries)) {
      if (o.other) fail('that entry is a plain activity; change its minutes by deleting and logging it again');
      const s = await buildSession(a, n.label); Object.assign(n, { detail: s.entries, groups: s.groups, ids: s.ids, mins: s.b ? s.b.mins : null, kcal: s.b ? s.b.kcal : null, sub: s.b ? s.b.sub : '' }); changed = true;
    } else if (o.other && 'min' in a) {
      const m = rng(a.min, 1, 600); if (m == null) fail('minutes must be 1 to 600');
      const t = Burn.ACTIVITIES.find((x) => x[1] === o.label), b = t ? await Burn.activity(t[0], Math.round(m)) : null; n.mins = Math.round(m); n.kcal = b ? b.kcal : n.kcal; changed = true;
    }
    if (!changed) fail('nothing to change');
    l[i] = n; await saveLog(l.sort((x, y) => x.ts - y.ts)); log.undo(() => saveLog(before)); return `Updated "${n.label}" (${n.date === today() ? 'today' : n.date})`;
  };
  ops.coach.delete_log = async (a, log) => {
    const l = await gymLog(), before = l.slice(), i = findLog(l, a.ts), gone = l[i]; l.splice(i, 1); await saveLog(l); log.undo(() => saveLog(before));
    return `Deleted "${gone.label}" (${gone.date === today() ? 'today' : gone.date})`;
  };

  const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'traps', 'lowerback', 'glutes', 'abductors', 'quads', 'hamstrings', 'adductors', 'calves', 'cardio'];
  const DAYNAME = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
  const dayIdx = (v) => { if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6) return v; const k = DAYNAME[String(v || '').toLowerCase().trim()]; if (k == null) fail('unknown weekday "' + str(v, 20) + '"'); return k; };
  async function splitNow() {
    const sp = await DB.get('gymSplit', null), cur = GP().state;
    const days = sp && Array.isArray(sp.days) && sp.days.length === 7 ? sp.days : (cur.split || []);
    return { name: (sp && sp.name) || cur.name || 'My split', days: days.map((d) => (typeof d === 'string' ? { t: d } : d)) };
  }
  function dayCell(v) {
    if (typeof v === 'string') { if (!GP().DAYS[v]) fail('unknown day type "' + str(v, 30) + '"'); return { t: v }; }
    if (isObj(v) && Array.isArray(v.groups)) { const G = [...new Set(v.groups.map((g) => str(g, 20)))]; if (!G.length || G.some((g) => !MUSCLES.includes(g))) fail('unknown muscle in a custom day'); return { t: 'custom', g: G }; }
    fail('bad day entry');
  }
  ops.coach.set_split = async (a, log) => {
    const old = await DB.get('gymSplit', null);
    if (!Array.isArray(a.days) || a.days.length !== 7) fail('a split needs exactly 7 days, Sunday first');
    const days = a.days.map(dayCell); if (days.every((d) => d.t === 'rest')) fail('a split needs at least one training day');
    const name = str(a.name, 50) || 'Coach split';
    await DB.set('gymSplit', { name, days }); log.undo(() => DB.set('gymSplit', old)); const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], lab = (d) => (d.t === 'custom' ? d.g.join('+') : GP().DAYS[d.t].label);
    return `Weekly split "${name}": ` + days.map((d, i) => W[i] + ' ' + lab(d)).join(', ');
  };
  ops.coach.set_split_day = async (a, log) => {
    const sp = await splitNow(), old = await DB.get('gymSplit', null), i = dayIdx(a.day);
    const d = sp.days.slice(); d[i] = dayCell('groups' in a ? { groups: a.groups } : a.type);
    await DB.set('gymSplit', { name: sp.name, days: d }); log.undo(() => DB.set('gymSplit', old));
    return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]} is now ${d[i].t === 'custom' ? d[i].g.join(' + ') : GP().DAYS[d[i].t].label}`;
  };
  ops.coach.set_workout = async (a, log) => {
    const w = GP().cleanWorkout({ title: a.title, items: a.items }, 'ai'); if (!w) fail('that workout has fewer than 2 valid exercises');
    const old = await DB.get('gymCurrent', null); await DB.set('gymCurrent', { date: today(), workout: w }); log.undo(() => DB.set('gymCurrent', old));
    return `Today's workout set: "${w.title}" (${w.items.length} exercises)`;
  };
  ops.coach.clear_workout = async (a, log) => { const old = await DB.get('gymCurrent', null); await DB.set('gymCurrent', null); log.undo(() => DB.set('gymCurrent', old)); return "Today's workout cleared"; };
  ops.coach.set_gym_prefs = async (a, log) => {
    const old = await DB.get('gymPrefs', null), p = Object.assign({ goal: 'muscle', minutes: 60, equip: 'gym' }, old || {}), ch = [];
    if ('goal' in a) { if (!['muscle', 'strength', 'fat', 'fit'].includes(a.goal)) fail('unknown training goal'); p.goal = a.goal; ch.push('goal'); }
    if ('minutes' in a) { const m = rng(a.minutes, 15, 180); if (m == null) fail('session length must be 15 to 180 minutes'); p.minutes = Math.round(m); ch.push('session length'); }
    if ('equip' in a) {
      const EQ = ['gym', 'home', 'dumbbells', 'bodyweight', 'bands', 'kettlebell', 'homegym', 'machines', 'custom']; if (!EQ.includes(a.equip)) fail('unknown equipment set');
      p.equip = a.equip; if (a.equip === 'custom') p.eqText = str(a.eq_text, 200); ch.push('equipment');
    }
    if (!ch.length) fail('nothing to change');
    await DB.set('gymPrefs', p); log.undo(() => DB.set('gymPrefs', old)); return 'Training ' + ch.join(', ') + ' updated';
  };

  /* ---------- the runner ---------- */
  async function run(list, domain) {
    const table = ops[domain] || {}, done = [], skipped = [], undos = [];
    const logger = { undo: (fn) => undos.push(fn) };
    const items = Array.isArray(list) ? list.slice(0, MAX_OPS) : [];
    if (Array.isArray(list) && list.length > MAX_OPS) skipped.push('More than ' + MAX_OPS + ' changes in one go: the rest were left out.');
    for (const a of items) {
      const name = isObj(a) ? str(a.op, 40) : '';
      try {
        if (!isObj(a) || !Object.prototype.hasOwnProperty.call(table, name)) throw new Error('I cannot do "' + (name || '?') + '" here');
        done.push(await table[name](a, logger));
      } catch (e) { skipped.push((name || 'change') + ': ' + (e && e.message ? e.message : 'failed')); }
    }
    let undone = false;
    return {
      done, skipped, count: undos.length,
      async undo() { if (undone) return; undone = true; for (let i = undos.length - 1; i >= 0; i--) { try { await undos[i](); } catch (e) {} } },
    };
  }

  /* "Mon 2026-10-26, Tue ..." for the last 8 days and tomorrow, so "yesterday" or "last Monday" resolve to a real date */
  function dateTable() {
    const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], out = [];
    for (let i = -8; i <= 1; i++) { const d = new Date(); d.setDate(d.getDate() + i); out.push((i === 0 ? 'TODAY ' : i === -1 ? 'yesterday ' : '') + W[d.getDay()] + ' ' + DB.dayKey(d)); }
    return out.join(', ');
  }
  /* the card shown under a chat reply: what changed, what was skipped, and one Undo for the whole batch */
  function html(act, i, esc) {
    if (!act) return '';
    const li = (a, cls) => a.map((t) => `<li${cls ? ' class="' + cls + '"' : ''}>${esc(t)}</li>`).join('');
    return `<div class="acts${act.undone ? ' undone' : ''}">${act.done.length ? `<b>${act.undone ? 'Undone' : 'Changed'}</b><ul>${li(act.done)}</ul>` : ''}${act.skipped.length ? `<b class="skip">Not done</b><ul>${li(act.skipped, 'skip')}</ul>` : ''}${act.count && !act.undone ? `<button type="button" class="link" data-undo="${i}">Undo</button>` : ''}</div>`;
  }
  root.Actions = { dateTable, html, run, OPS: { nutrition: Object.keys(ops.nutrition), coach: Object.keys(ops.coach) } };
})(window);
