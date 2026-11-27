/* Plate Coach: a chat with a personal trainer that remembers you, logs and edits your training, and plans workouts.

   What makes it dependable (the problems the first coach had):
   - MEMORY. The whole chat is saved and synced. Facts you tell it (injuries, equipment, schedule, goals) are saved as notes you can read and delete,
     older conversation is folded into a short summary, and every request carries your notes, summary, current lifts and recent log.
   - EXERCISES ARE MATCHED IN CODE. The model writes the exercise the way you said it ("pull-up"); resolve() finds it in the exercise list. An ambiguous
     name ("row") gets a question; an unknown one is logged under your own name. An exercise is never swapped for a different one.
   - NOTHING IS GUESSED. A loaded exercise with no weight is not logged: the coach asks, with your last weight as a one-tap answer.
   - EDITS ARE PRECISE. Change the sets of one logged exercise, add or remove one, swap one in today's plan: each is a small operation that is checked
     by code (actions.js) and has an Undo. */
(function () {
  'use strict';
  const { $, esc } = window.Plate;
  const { EX } = window.GymData, MAP = window.GymLog.MAP, GP = () => window.Plate.gymPlan;
  const S = { msgs: [], sum: '', facts: [], pending: null, loaded: false, busy: false, showAll: false, undo: {}, lastUser: '' };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const MAX_MSGS = 200, SHOW = 60, MAX_FACTS = 60, CTX = 5900;

  /* ============================== exercises: names to ids ============================== */
  const norm = (s) => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const stem = (w) => (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  const toks = (s) => norm(s).split(' ').filter(Boolean).map(stem);
  const key = (s) => toks(s).join(' ');
  const IDX = EX.map((x) => ({ x, k: key(x.name), t: toks(x.name + ' ' + x.id.replace(/-/g, ' ')).filter((v, i, a) => a.indexOf(v) === i) }));
  const ALIAS = {
    'pull up': 'pull-up', pullup: 'pull-up', 'chin up': 'pull-up', chinup: 'pull-up', pulldown: 'lat-pulldown', 'lat pull down': 'lat-pulldown', 'lat pull': 'lat-pulldown',
    bench: 'barbell-bench-press', 'bench press': 'barbell-bench-press', 'flat bench': 'barbell-bench-press', 'flat bench press': 'barbell-bench-press',
    squat: 'barbell-back-squat', 'back squat': 'barbell-back-squat', ohp: 'overhead-press', 'military press': 'overhead-press', rdl: 'romanian-deadlift', dl: 'deadlift', 'dead lift': 'deadlift',
    dip: 'parallel-bar-dip', pushdown: 'cable-triceps-pushdown', 'tricep pushdown': 'cable-triceps-pushdown', 'triceps pushdown': 'cable-triceps-pushdown', 'tricep extension': 'overhead-cable-triceps-extension',
    'push up': 'push-up', pushup: 'push-up', 'leg raise': 'hanging-leg-raise', 'calf raise': 'standing-calf-raise', 'lateral raise': 'dumbbell-lateral-raise', 'side raise': 'dumbbell-lateral-raise',
    skullcrusher: 'skull-crusher', 'bike': 'stationary-bike', 'exercise bike': 'stationary-bike', treadmill: 'treadmill-running', 'lat raise': 'dumbbell-lateral-raise', 'hammer curls': 'hammer-curl',
  };
  /* -> { x } found | { ambiguous: [x...] } more than one fits | { custom, name } not in the list: keep the person's own name */
  function resolve(name) {
    const q = key(name); if (!q) return { custom: true, name: 'Exercise' };
    const exact = IDX.filter((e) => e.k === q); if (exact.length === 1) return { x: exact[0].x };
    if (ALIAS[q]) return { x: MAP[ALIAS[q]] };
    const qt0 = toks(name), qt = qt0.length > 1 ? qt0.filter((t) => t !== 'bicep') : qt0, sub = IDX.filter((e) => qt.every((t) => e.t.includes(t)));
    if (sub.length === 1) return { x: sub[0].x };
    if (sub.length > 1) return { ambiguous: sub.slice(0, 6).map((e) => e.x) };
    const sup = IDX.filter((e) => e.k.split(' ').length >= 2 && e.k.split(' ').every((t) => qt.includes(t))).sort((a, b) => b.k.length - a.k.length);
    if (sup.length === 1 || (sup.length > 1 && sup[0].k.length > sup[1].k.length)) return { x: sup[0].x };
    if (sup.length > 1) return { ambiguous: sup.slice(0, 6).map((e) => e.x) };
    return { custom: true, name: String(name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60) || 'Exercise' };
  }
  const nameOf = (e) => (e.name && /^custom/.test(e.id) ? e.name : (MAP[e.id] ? MAP[e.id].name : e.id));
  const needsWeight = (x) => !!x && window.Burn.kindOf(x) === 'lift';
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) && v !== '' && v != null ? n : null; };
  const fmtKg = (n) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '') + ' kg';
  const fmtSets = (e) => (e.kind === 'cardio' ? ((e.f && e.f.min) || '?') + ' min' : (e.sets || []).map((s) => (s.kg != null ? s.kg + ' x ' : '') + (s.sec ? s.sec + ' s' : s.m ? s.m + ' m' : s.reps)).join(', '));

  /* ============================== storage ============================== */
  let saveT = null;
  const strip = (m) => { const o = Object.assign({}, m); delete o.wait; if (o.act) o.act = { done: o.act.done, skipped: o.act.skipped, count: o.act.count, undone: !!o.act.undone }; return o; };
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { DB.set('coachChat', { v: 1, msgs: S.msgs.filter((m) => !m.wait).slice(-MAX_MSGS).map(strip), sum: S.sum, pending: S.pending }); }, 250); }
  const saveFacts = () => DB.set('coachMem', { v: 1, facts: S.facts });
  async function load() {
    if (S.busy) return;
    const c = await DB.get('coachChat', null), m = await DB.get('coachMem', null);
    S.msgs = c && Array.isArray(c.msgs) ? c.msgs : []; S.sum = (c && c.sum) || ''; S.pending = (c && c.pending) || null;
    S.facts = m && Array.isArray(m.facts) ? m.facts : []; S.loaded = true;
  }

  /* ============================== memory ============================== */
  const CATS = { injury: 'Injury or pain', equipment: 'Equipment', schedule: 'Schedule', goal: 'Goal', preference: 'Preference', body: 'Body', lift: 'Lifts', other: 'Note' };
  const sameFact = (a, b) => { const x = new Set(toks(a)), y = toks(b); if (!x.size || !y.length) return false; const hit = y.filter((t) => x.has(t)).length; return hit / Math.max(x.size, y.length) >= 0.8; };
  function remember(list, forget) {
    let n = 0;
    (Array.isArray(forget) ? forget : []).forEach((id) => { const i = S.facts.findIndex((f) => f.id === id); if (i >= 0) { S.facts.splice(i, 1); n++; } });
    (Array.isArray(list) ? list : []).slice(0, 4).forEach((f) => {
      const text = String((f && f.text) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140), cat = CATS[f && f.cat] ? f.cat : 'other';
      if (text.length < 4) return;
      const dup = S.facts.findIndex((x) => sameFact(x.text, text));
      if (dup >= 0) { S.facts[dup].text = text; S.facts[dup].ts = Date.now(); return; }
      S.facts.push({ id: 'f' + uid(), cat, text, ts: Date.now() }); n++;
    });
    if (S.facts.length > MAX_FACTS) S.facts = S.facts.sort((a, b) => (a.cat === 'injury' ? -1 : 0) - (b.cat === 'injury' ? -1 : 0) || b.ts - a.ts).slice(0, MAX_FACTS);
    if (n || (list && list.length)) saveFacts();
    return n;
  }

  /* ============================== what the model is told ============================== */
  const NAMES = () => { const by = {}; EX.forEach((x) => { (by[x.g] = by[x.g] || []).push(x.name); }); return Object.keys(by).map((g) => g + ': ' + by[g].join('; ')).join('\n'); };
  const SYSTEM = () => `You are Plate Coach, a sharp, warm personal trainer inside a gym app, chatting with ONE person you know well. Write like a good coach texting: short, specific, human. Plain sentences, no headings, no markdown lists unless they ask for a plan. About 60 words unless they want detail.

YOU HAVE MEMORY. Every turn you get MEMORY (notes you saved), SUMMARY (older chat), PROFILE and PLAN, LIFTS (what they lifted recently) and LOGGED workouts. Use them. Never ask for something already in them. "Same as last time" means use LIFTS.

YOU CHANGE THEIR DATA ONLY THROUGH "actions". The app checks each one and the person can undo it. For exercises write the NAME exactly as the person said it ("pull-up", "lat pulldown", "cable fly"); the app matches it to the exercise list. NEVER swap an exercise for another, never add exercises they did not mention, never change numbers they gave you, never invent weights.
Reading numbers: "3 pull-ups" = ONE set of 3 reps. "3x10" or "3 sets of 10" = three sets of 10. "10, 8, 6 at 60" = three sets with those reps, all 60 kg. Weights are kg unless they say lb (convert: lb x 0.4536). Pull-ups, push-ups, dips, planks and other bodyweight moves need no weight (add "bw":true only if they added weight, then give kg).
MISSING INFO: if a loaded exercise has no weight and LIFTS has none for it, do not log it; ask ONE short question and leave actions empty. If sets or reps are unclear, ask. If you cannot tell which logged workout or exercise they mean, ask. One question at a time; once they answer, do it.
Only do what they asked. Confirm in the past tense ("Logged ..."). If they just chat or ask a question, answer it and leave actions empty.

ACTIONS (all fields shown; dates are YYYY-MM-DD from DATES; "ts" values are copied from LOGGED, never invented):
{"op":"log_workout","date":"","title":"","entries":[{"name":"lat pulldown","sets":[{"kg":60,"reps":10}]},{"name":"treadmill","min":20}]}   (holds: {"sec"}, carries: {"kg","m"}, cardio: "min" and optional "km")
{"op":"log_activity","date":"","type":"walk|run|cycle|swim|football|padel|basket|martial|yoga|hiit|other","min":45}
{"op":"edit_log_sets","ts":0,"name":"lat pulldown","sets":[{"kg":60,"reps":10}]}   replace all sets of one exercise in a logged workout
{"op":"add_to_log","ts":0,"entry":{"name":"","sets":[{"kg":0,"reps":0}]}}   {"op":"remove_from_log","ts":0,"name":""}
{"op":"update_log","ts":0,"date":"","title":""}   (rename or move a workout)   {"op":"delete_log","ts":0}
{"op":"plan_add","name":"","sets":3,"reps":"8-12"}  {"op":"plan_remove","name":""}  {"op":"plan_swap","old":"","new":""}  {"op":"plan_sets","name":"","sets":4,"reps":"6-8"}   (today's planned workout)
{"op":"set_workout","title":"","items":[{"name":"","sets":3,"reps":"8-12","rest_s":90}]}  {"op":"clear_workout"}
{"op":"set_split","name":"","days":[7 keys, Sunday first: ${Object.keys(GP().DAYS).join(', ')}]}  {"op":"set_split_day","day":"thursday","type":"upper"}
{"op":"set_gym_prefs","goal":"muscle|strength|fat|fit","minutes":60,"equip":"gym|home|dumbbells|bodyweight|bands|kettlebell|homegym|machines|custom","eq_text":""}  {"op":"set_weight","date":"","kg":80}
If they pin a day ("Thursday upper body, build around it"), the split must put exactly that on that day.

PLANNING a workout ("workout" field): 3 to 9 exercises, about 10 minutes each at 3 sets, so match the time they have. Compounds first, isolation after, abs and cardio last. Each: name from the EXERCISE LIST, sets 2-5, reps as text ("8-12", "30-45 s"), rest_s 30-180. Use their equipment, injuries and pain (avoid loading a sore area; if pain is mentioned, one line suggesting a physio or doctor, never diagnose), what they trained lately and what they have neglected. If they want to lose fat the workout includes 1-2 cardio items (reps like "25-30 min"). For loads say "pick a weight that leaves 1 to 3 reps in reserve" or use LIFTS to suggest a number. Mainstream, honest advice; not medical advice.

MEMORY ("remember"): save only durable facts the person told you: injuries, equipment, schedule, goals, strong preferences, body facts, lifting targets. One short sentence each, max 3 per turn, never chit-chat. If a saved fact stops being true, put its id in "forget". Do not re-save what is already in MEMORY.

Reply with ONLY JSON:
{"say":"your chat message","actions":[],"remember":[],"forget":[],"workout":null,"split":null,"quick":[]}
"remember" items: {"cat":"injury|equipment|schedule|goal|preference|body|lift|other","text":""}. "workout": {"title":"","items":[{"name":"","sets":3,"reps":"8-12","rest_s":90}]} only when a workout is asked for or you recommend today's. "split": {"name":"","days":[7 keys]} only for split requests. "quick": up to 3 very short tap-replies that make sense next (for a question: the likely answers), else [].

EXAMPLES
"I did 3 pull-ups" -> {"say":"Logged 3 pull-ups. Any more sets or other exercises?","actions":[{"op":"log_workout","title":"Pull-ups","entries":[{"name":"pull-up","sets":[{"reps":3}]}]}],"remember":[],"forget":[],"workout":null,"split":null,"quick":[]}
"lat pulldown 3x10" (no weight in LIFTS) -> {"say":"Nice. What weight on the lat pulldown?","actions":[],"remember":[],"forget":[],"workout":null,"split":null,"quick":[]}
"my left shoulder hurts on overhead press" -> say a short supportive line, avoid loading it, suggest a physio if it persists, and remember {"cat":"injury","text":"Left shoulder hurts on overhead pressing"}.

EXERCISE LIST (use these names for plans; for logging use what they said):
${NAMES()}`;

  /* ---- context: assembled in priority order and trimmed to the proxy's limit ---- */
  const lastDays = (n) => { const out = []; for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() - i); out.push(DB.dayKey(d)); } return out; };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sumEntry = (e) => `${nameOf(e)} ${fmtSets(e)}`;
  function liftsBlock(log) {
    const seen = new Set(), out = [];
    for (const l of log.slice().sort((a, b) => b.ts - a.ts)) {
      for (const e of l.detail || []) {
        if (e.kind === 'cardio' || seen.has(e.id + (e.name || ''))) continue; seen.add(e.id + (e.name || ''));
        out.push(`${nameOf(e)}: ${fmtSets(e)} (${l.date.slice(5)})`); if (out.length >= 14) break;
      }
      if (out.length >= 14) break;
    }
    return out.length ? 'LIFTS (latest session per exercise, kg x reps):\n' + out.join('\n') : '';
  }
  function logBlock(log, n) {
    const rows = log.filter((l) => lastDays(21).includes(l.date)).sort((a, b) => b.ts - a.ts).slice(0, n);
    return rows.length ? 'LOGGED (newest first: ts | date | label | exercises):\n' + rows.map((l) => `${l.ts} | ${l.date} | ${l.label}${l.other ? ' (activity ' + l.mins + ' min)' : ''} | ${(l.detail || []).map(sumEntry).join('; ')}`.slice(0, 260)).join('\n') : 'LOGGED: nothing in the last 21 days.';
  }
  async function context(text) {
    const st = GP().state, today = new Date(), ti = today.getDay(), prof = await DB.get('profile', null);
    const dateTable = Actions.dateTable();
    const dayLabel = (d) => (d.t === 'custom' ? (d.g || []).join('+') : (GP().DAYS[d.t] || GP().DAYS.rest).label);
    const pend = S.pending ? 'PENDING: you were logging "' + (S.pending.title || 'a workout') + '" (' + S.pending.entries.map(sumEntry).join('; ') + '). Waiting for: ' + S.pending.ask + '. When they answer, output the complete log_workout with it filled in.' : '';
    const mem = S.facts.length ? 'MEMORY (notes about them; ids for forget):\n' + S.facts.slice().sort((a, b) => (a.cat === 'injury' ? -1 : 0) - (b.cat === 'injury' ? -1 : 0) || b.ts - a.ts).map((f) => `[${f.id}] ${f.cat}: ${f.text}`).join('\n') : 'MEMORY: nothing saved yet.';
    const plan = [
      `Today: ${WD[ti]} ${DB.dayKey()}. Their week (Sun first): ${st.split.map((d, i) => WD[i] + ' ' + dayLabel(d)).join(', ')}. Today's slot: ${dayLabel(st.split[ti])}.`,
      `Goal: ${GP().GOALS[st.prefs.goal]}. Usual session: ${st.prefs.minutes} min. Equipment: ${st.prefs.equip === 'custom' ? st.prefs.eqText || 'custom' : st.prefs.equip}.${prof && prof.weight ? ' Body weight: ' + prof.weight + ' kg.' : ''}${prof && prof.goal ? ' Body goal: ' + prof.goal + '.' : ''}`,
      st.cur ? `Today's planned workout: ${st.cur.title}${st.cur.done ? ' (done)' : ''}: ${st.cur.items.map((i) => (MAP[i.id] ? MAP[i.id].name : i.id) + ' ' + (i.dur || i.sets + 'x' + i.reps)).join('; ')}.` : "No workout planned for today.",
    ].join('\n');
    const msg = 'THE PERSON SAYS: ' + text.slice(0, 700);
    const parts = [['DATES: ' + dateTable, 1], [pend, 1], [mem, 1], [plan, 1], [S.sum ? 'SUMMARY OF OLDER CHAT: ' + S.sum : '', 2], [liftsBlock(st.log), 2], [logBlock(st.log, 8), 2], [logBlock(st.log, 4), 0]];
    let budget = CTX - msg.length - 20, out = [];
    const take = (txt, cap) => { if (!txt) return; const t = txt.length > cap ? txt.slice(0, Math.max(0, cap - 1)) + '…' : txt; if (t.length <= budget) { out.push(t); budget -= t.length + 1; } };
    take(parts[0][0], 400); take(parts[1][0], 500); take(plan, 900); take(mem, 1700); take(parts[4][0], 700); take(parts[5][0], 1100); take(logBlock(st.log, 8), Math.max(300, budget));
    return out.join('\n') + '\n\n' + msg;
  }
  const history = () => S.msgs.filter((m) => !m.wait && !m.err && m.text).slice(-8).map((m) => ({ role: m.role === 'me' ? 'user' : 'model', text: String(m.text).slice(0, 700) }));

  /* ============================== from the model's words to checked operations ============================== */
  const CARDIO_DEF = { min: 30 };
  /* a list of entries written with names -> entries with ids, plus what is missing or unclear */
  function convert(list, log) {
    const entries = [], asks = [];
    (Array.isArray(list) ? list : []).slice(0, 15).forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const r = resolve(raw.name);
      if (r.ambiguous) { asks.push({ type: 'which', name: raw.name, options: r.ambiguous.map((x) => x.name) }); return; }
      const x = r.x, custom = !!r.custom, id = custom ? 'custom-lift' : x.id, nm = custom ? r.name : x.name;
      if (!custom && window.Burn.kindOf(x) === 'cardio') {
        const m = num(raw.min); if (!(m > 0)) { asks.push({ type: 'cardio', name: nm }); return; }
        const f = { min: m }; if (num(raw.km) > 0) f.km = num(raw.km); entries.push({ id, kind: 'cardio', f }); return;
      }
      const sets = (Array.isArray(raw.sets) ? raw.sets : []).slice(0, 12).map((s) => ({ kg: num(s && s.kg), reps: num(s && s.reps), sec: num(s && s.sec), m: num(s && s.m) }));
      if (!sets.length || sets.every((s) => !(s.reps > 0) && !(s.sec > 0) && !(s.m > 0))) { asks.push({ type: 'sets', name: nm }); return; }
      const kind = custom ? 'lift' : window.Burn.kindOf(x), e = { id, kind };
      if (custom) e.name = nm;
      e.sets = sets.map((s) => (kind === 'hold' ? { sec: s.sec, kg: s.kg } : kind === 'carry' ? { kg: s.kg, m: s.m } : { kg: s.kg, reps: s.reps }));
      e.bw = !!raw.bw;
      if (kind === 'lift') { const must = custom ? !raw.bw && !/\b(push|pull|chin|dip|plank|sit|crunch|burpee|lunge)/i.test(nm) : true; if (must && e.sets.some((s) => s.kg == null)) e.needKg = true; }
      entries.push(e);
    });
    return { entries, asks };
  }
  const lastKg = (id, name, log) => {
    for (const l of log.slice().sort((a, b) => b.ts - a.ts)) for (const e of l.detail || []) if (e.id === id && (!name || e.name === name)) { const k = (e.sets || []).map((s) => s.kg).filter((v) => v > 0).pop(); if (k) return k; }
    return null;
  };
  const cleanEntry = (e) => { const o = { id: e.id, kind: e.kind }; if (e.kind === 'cardio') o.f = e.f; else o.sets = e.sets; if (e.name) o.name = e.name; if (e.rest) o.rest = e.rest; return o; };

  /* turn the model's actions into operations actions.js can run; anything unclear becomes a question instead */
  async function prepare(actions, userText) {
    const ops = [], asks = [], st = GP().state, log = ((await DB.get('gymLog', [])) || []).slice();
    const findTs = (ts) => { const l = log.find((x) => x.ts === Number(ts)); return l || null; };
    const planNow = () => (st.cur ? { title: st.cur.title, items: st.cur.items.map((i) => Object.assign({}, i)) } : null);
    const plan = (fn) => { const p = planNow(); if (!p) { asks.push({ type: 'text', q: 'There is no workout planned for today yet. Want me to build one?', quick: ['Build one', 'No thanks'] }); return; } const r = fn(p); if (r) ops.push({ op: 'set_workout', title: p.title, items: p.items.map((i) => ({ id: i.id, sets: i.sets, reps: i.reps || i.dur, rest_s: i.rest })) }); };
    const idOf = (nm) => { const r = resolve(nm); return r.x ? r.x : null; };
    for (const a of Array.isArray(actions) ? actions.slice(0, 12) : []) {
      if (!a || typeof a !== 'object') continue;
      const op = String(a.op || '');
      if (op === 'log_workout' || (op === 'update_log' && Array.isArray(a.entries))) {
        const c = convert(a.entries, log);
        if (c.asks.length) { asks.push(c.asks[0]); continue; }
        const miss = c.entries.findIndex((e) => e.needKg);
        if (miss >= 0) {
          const e = c.entries[miss], nm = nameOf(e), prev = lastKg(e.id, e.name, log);
          S.pending = { op, ts: a.ts, date: a.date, title: String(a.title || '').slice(0, 60), entries: c.entries.map((x) => Object.assign(cleanEntry(x), x.needKg ? { needKg: 1 } : {})), ask: 'the weight used for ' + nm, ei: miss };
          asks.push({ type: 'weight', name: nm, prev }); continue;
        }
        ops.push(Object.assign({}, a, { op, entries: c.entries.map(cleanEntry) })); continue;
      }
      if (op === 'edit_log_sets' || op === 'add_to_log' || op === 'remove_from_log') {
        const l = findTs(a.ts) || log.filter((x) => x.date === DB.dayKey() && !x.other).sort((x, y) => y.ts - x.ts)[0];
        if (!l || l.other) { asks.push({ type: 'text', q: 'Which logged workout do you mean? I could not find it.' }); continue; }
        const detail = (l.detail || []).map((e) => Object.assign({}, e));
        if (op === 'add_to_log') {
          const c = convert([a.entry], log); if (c.asks.length) { asks.push(c.asks[0]); continue; }
          if (c.entries[0] && c.entries[0].needKg) { const e = c.entries[0]; S.pending = { op: 'update_log', ts: l.ts, title: l.label, entries: detail.concat([cleanEntry(e)]).map((x) => Object.assign({}, x, x === e ? {} : {})), ask: 'the weight used for ' + nameOf(e), ei: detail.length, addOnly: true }; S.pending.entries[S.pending.ei].needKg = 1; asks.push({ type: 'weight', name: nameOf(e), prev: lastKg(e.id, e.name, log) }); continue; }
          if (c.entries[0]) detail.push(cleanEntry(c.entries[0]));
        } else {
          const nm = String(a.name || ''), r = resolve(nm);
          const at = detail.findIndex((e) => (r.x && e.id === r.x.id) || (r.custom && e.name && norm(e.name) === norm(r.name)) || norm(nameOf(e)) === norm(nm));
          if (at < 0) { asks.push({ type: 'text', q: `I cannot see ${nm || 'that exercise'} in that workout. Which one do you mean?`, quick: detail.slice(0, 4).map(nameOf) }); continue; }
          if (op === 'remove_from_log') detail.splice(at, 1);
          else {
            const c = convert([{ name: nameOf(detail[at]), sets: a.sets, bw: true }], log); if (c.asks.length) { asks.push(c.asks[0]); continue; }
            const ne = cleanEntry(c.entries[0]); ne.id = detail[at].id; if (detail[at].name) ne.name = detail[at].name; detail[at] = ne;
            if (needsWeight(MAP[ne.id]) && ne.sets.some((s) => s.kg == null)) { S.pending = { op: 'update_log', ts: l.ts, title: l.label, entries: detail.map((x, i) => (i === at ? Object.assign({}, x, { needKg: 1 }) : x)), ask: 'the weight used for ' + nameOf(ne), ei: at }; asks.push({ type: 'weight', name: nameOf(ne), prev: lastKg(ne.id, ne.name, log) }); continue; }
          }
        }
        if (!detail.length) { ops.push({ op: 'delete_log', ts: l.ts }); continue; }
        ops.push({ op: 'update_log', ts: l.ts, entries: detail.map(cleanEntry) }); continue;
      }
      if (op === 'set_workout') {
        const items = []; (Array.isArray(a.items) ? a.items : []).forEach((it) => { const x = it && idOf(it.name || it.id); if (x) items.push({ id: x.id, sets: it.sets, reps: it.reps, rest_s: it.rest_s }); });
        ops.push({ op, title: a.title, items }); continue;
      }
      if (op === 'plan_add') plan((p) => { const x = idOf(a.name); if (!x) { asks.push({ type: 'text', q: `I do not have "${a.name}" in the exercise list. Pick one from the list or tell me another.` }); return false; } p.items.push({ id: x.id, sets: a.sets || 3, reps: a.reps || '8-12', rest: 90 }); return true; });
      else if (op === 'plan_remove') plan((p) => { const x = idOf(a.name); const i = p.items.findIndex((it) => x && it.id === x.id); if (i < 0) { asks.push({ type: 'text', q: `I cannot find "${a.name}" in today's workout.` }); return false; } p.items.splice(i, 1); return true; });
      else if (op === 'plan_swap') plan((p) => { const o = idOf(a.old), n = idOf(a.new), i = p.items.findIndex((it) => o && it.id === o.id); if (i < 0 || !n) { asks.push({ type: 'text', q: i < 0 ? `I cannot find "${a.old}" in today's workout.` : `I do not have "${a.new}" in the exercise list.` }); return false; } p.items[i] = Object.assign({}, p.items[i], { id: n.id }); return true; });
      else if (op === 'plan_sets') plan((p) => { const x = idOf(a.name); const it = p.items.find((q) => x && q.id === x.id); if (!it) { asks.push({ type: 'text', q: `I cannot find "${a.name}" in today's workout.` }); return false; } if (a.sets) it.sets = a.sets; if (a.reps) it.reps = a.reps; return true; });
      else ops.push(a);
    }
    return { ops, asks };
  }

  function askText(a, log) {
    if (a.type === 'weight') return { text: `What weight did you use for ${a.name}?`, quick: a.prev ? [fmtKg(a.prev) + ' (same as last time)', 'Bodyweight'] : ['Bodyweight'] };
    if (a.type === 'which') return { text: `Which one do you mean by "${a.name}"?`, quick: a.options.slice(0, 4) };
    if (a.type === 'cardio') return { text: `How many minutes of ${a.name}?`, quick: ['15', '20', '30'] };
    if (a.type === 'sets') return { text: `How many sets and reps of ${a.name}?`, quick: [] };
    return { text: a.q, quick: a.quick || [] };
  }

  /* an answer to a weight question can be handled without the model */
  function quickAnswer(text) {
    const p = S.pending; if (!p) return null;
    const t = text.trim().toLowerCase();
    if (/^(bodyweight|body weight|bw|no weight|none|just bodyweight)\.?$/.test(t)) return { kg: 0 };
    const m = /^(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|kilograms?|lbs?|pounds?)?(?:\s*\(same as last time\))?\.?$/.exec(t) || /^(\d+(?:[.,]\d+)?)\s*(kg|lbs?)\b/.exec(t);
    if (!m) return null;
    let v = parseFloat(m[1].replace(',', '.')); if (/^(lb|pound)/.test(m[2] || '')) v = Math.round(v * 0.45359 * 2) / 2;
    return v > 0 && v <= 600 ? { kg: v } : null;
  }

  /* ============================== running a turn ============================== */
  const strongest = (r) => r && r.say && String(r.say).trim();
  async function applyOps(ops, userText) {
    if (!ops.length) return null;
    const log0 = (await DB.get('gymLog', [])) || [];
    let records = [];
    try { const lw = ops.find((o) => o.op === 'log_workout'); if (lw && window.GymProgress) records = GymProgress.prs(log0, lw.entries, MAP) || []; } catch (e) {}
    const act = await Actions.run(window.Plate.gymPlan.pinDays(ops, userText), 'coach');
    await GP().reload(); window.Plate.refreshToday();
    return { act, records };
  }
  function push(m) { m.id = uid(); m.ts = Date.now(); S.msgs.push(m); return m; }

  async function send(text) {
    text = String(text || '').trim(); if (!text || S.busy) return;
    S.busy = true; S.lastUser = text; FX.play('send'); FX.haptic(8);
    push({ role: 'me', text }); const wait = { role: 'ai', wait: true, text: 'Thinking…' }; S.msgs.push(wait); draw(true);
    const finish = (m) => { S.msgs = S.msgs.filter((x) => x !== wait); if (m) push(m); S.busy = false; save(); draw(true); if (m) { FX.play(m.err ? 'error' : 'receive'); } };
    try {
      await GP().load();
      /* a one-word answer to "what weight?" never needs the model */
      const qa = quickAnswer(text);
      if (qa && S.pending) {
        const p = S.pending, i = p.ei, e = p.entries[i];
        e.sets = e.sets.map((s) => (s.kg == null ? Object.assign({}, s, { kg: qa.kg > 0 ? qa.kg : null }) : s)); delete e.needKg;
        const next = p.entries.findIndex((x) => x.needKg);
        if (next >= 0) { p.ei = next; p.ask = 'the weight used for ' + nameOf(p.entries[next]); const a = askText({ type: 'weight', name: nameOf(p.entries[next]), prev: lastKg(p.entries[next].id, p.entries[next].name, (await DB.get('gymLog', [])) || []) }); S.pending = p; return finish({ role: 'ai', text: 'Got it. ' + a.text, quick: a.quick }); }
        S.pending = null;
        const op = { op: p.op, ts: p.ts, date: p.date, title: p.title, entries: p.entries.map(cleanEntry) };
        const res = await applyOps([op], text), m = { role: 'ai', text: res.act.count ? 'Logged it.' : "I couldn't log that.", act: res.act };
        push(m); S.undo[m.id] = res.act; if (res.records.length) celebrate(res.records);
        S.msgs = S.msgs.filter((x) => x !== wait); S.busy = false; save(); draw(true); FX.play(res.act.count ? 'success' : 'error'); return;
      }
      const r = await AI.askJSON({ task: 'coach', system: SYSTEM(), history: history().slice(0, -1), text: await context(text), max_tokens: 1100 });
      remember(r.remember, r.forget);
      const hadPending = !!S.pending; if (Array.isArray(r.actions) && r.actions.length) S.pending = null;
      const prev = S.pending;
      const { ops, asks } = Array.isArray(r.actions) && r.actions.length ? await prepare(r.actions, text) : { ops: [], asks: [] };
      if (!asks.some((a) => a.type === 'weight') && Array.isArray(r.actions) && r.actions.length) S.pending = null;
      let say = strongest(r) || 'Done.', act = null, records = [], quick = (Array.isArray(r.quick) ? r.quick : []).map((q) => String(q).slice(0, 40)).slice(0, 3);
      if (ops.length) { const res = await applyOps(ops, text); act = res.act; records = res.records; if (!act.count) say = "I couldn't apply that, so nothing changed."; }
      if (asks.length) { const a = askText(asks[0]); say = (ops.length ? say + '\n\n' : '') + a.text; quick = a.quick; }
      let workout = null, split = null;
      if (r.workout && Array.isArray(r.workout.items)) { workout = GP().ensureCardio(GP().cleanWorkout({ title: r.workout.title, items: r.workout.items.map((it) => { const x = resolve(it.name || it.id).x; return x ? { id: x.id, sets: it.sets, reps: it.reps, rest_s: it.rest_s } : null; }).filter(Boolean) }, 'ai'), text); if (!workout) say += '\n\n(I could not build a valid workout from the exercise list. Try rephrasing.)'; }
      if (r.split) split = GP().cleanSplit(r.split);
      const m = { role: 'ai', text: say, act: act || undefined, workout, split, quick };
      push(m); if (act) S.undo[m.id] = act;
      S.msgs = S.msgs.filter((x) => x !== wait); S.busy = false; save(); draw(true);
      FX.play(act && act.count ? 'success' : 'receive'); if (act && act.count) FX.haptic([14, 40, 14]);
      if (records.length && act && act.count) celebrate(records);
      compact();
    } catch (e) { S.pending = S.pending; finish({ role: 'ai', text: e.message || 'Something went wrong.', err: true, retry: text }); }
  }
  function celebrate(records) { FX.play('win'); FX.confetti('burst'); FX.haptic([30, 50, 30, 50, 120]); window.Plate.toast('New record' + (records.length > 1 ? 's' : '') + ': ' + records.join(' · ')); }

  /* fold the oldest messages into the summary so the coach keeps the thread without sending the whole chat every time */
  async function compact() {
    const real = S.msgs.filter((m) => !m.wait);
    if (real.length <= 70 || S.compacting) return;
    S.compacting = true;
    try {
      const old = real.slice(0, 35), transcript = old.map((m) => (m.role === 'me' ? 'Person: ' : 'Coach: ') + String(m.text || '').slice(0, 300)).join('\n').slice(0, 5000);
      const r = await AI.askJSON({ task: 'coach', system: 'You keep a personal trainer\'s long-term notes. Merge the PREVIOUS SUMMARY with the CONVERSATION into one updated summary of at most 130 words: what they trained and how it went, decisions made, what the coach recommended, open threads and anything they care about. Facts only, no filler. Reply ONLY JSON: {"summary":""}', text: 'PREVIOUS SUMMARY: ' + (S.sum || 'none') + '\n\nCONVERSATION:\n' + transcript, max_tokens: 400 });
      if (r && r.summary) { S.sum = String(r.summary).slice(0, 900); const ids = new Set(old.map((m) => m.id)); S.msgs = S.msgs.filter((m) => !ids.has(m.id)); save(); }
    } catch (e) { /* try again after a later message */ }
    S.compacting = false;
  }

  /* the Plan tab's "ask for something specific" */
  async function buildWorkout(request) {
    await GP().load();
    const r = await AI.askJSON({ task: 'coach', system: SYSTEM(), history: [], text: await context('Build me a workout for this request: ' + request), max_tokens: 1100 });
    remember(r.remember, r.forget);
    const w = r.workout && Array.isArray(r.workout.items) ? GP().ensureCardio(GP().cleanWorkout({ title: r.workout.title, items: r.workout.items.map((it) => { const x = resolve(it.name || it.id).x; return x ? { id: x.id, sets: it.sets, reps: it.reps, rest_s: it.rest_s } : null; }).filter(Boolean) }, 'ai'), request) : null;
    return { reply: String(r.say || '').slice(0, 600), workout: w };
  }

  /* ============================== the screen ============================== */
  const STARTERS = ['What should I train today?', 'Log today\'s workout', 'I did 3 pull-ups', 'What have I been neglecting?', 'I only have 30 minutes'];
  const ARROW = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
  function msgHTML(m, i) {
    if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
    if (m.wait) return '<div class="msg ai wait">Thinking…</div>';
    if (m.err) return `<div class="msg ai err">${esc(m.text)}${m.retry ? `<div class="qrRow"><button type="button" class="qr" data-retry="${esc(m.retry)}">Try again</button></div>` : ''}</div>`;
    const act = m.act ? Actions.html(Object.assign({}, m.act, { count: S.undo[m.id] && !m.act.undone ? m.act.count : 0 }), i, esc) : '';
    const w = m.workout ? `<div class="miniw"><b>${esc(m.workout.title)}</b><small>${m.workout.items.length} exercises, about ${m.workout.mins} min</small><ol>${m.workout.items.map((it) => `<li>${esc(MAP[it.id].name)} <small>${esc(it.dur || it.sets + ' x ' + it.reps)}</small></li>`).join('')}</ol><button type="button" class="primary" data-cw="${i}">Use this workout</button></div>` : '';
    const sp = m.split ? `<div class="miniw"><b>${esc(m.split.name)}</b><small>${m.split.days.map((k, j) => GP().WK3[j] + ' ' + GP().DAYS[k].label).join(' · ')}</small><button type="button" class="primary" data-cs="${i}">Use this split</button></div>` : '';
    return `<div class="msg ai ans">${window.Plate.md(m.text)}${act}${w}${sp}</div>`;
  }
  function draw(scroll) {
    const root = $('#gCoach'); if (!root) return;
    const old = $('#gcIn'), keep = old ? { v: old.value, f: document.activeElement === old, s: old.selectionStart, e: old.selectionEnd } : null;
    const real = S.msgs, from = S.showAll ? 0 : Math.max(0, real.length - SHOW), last = real[real.length - 1];
    const quick = !S.busy && last && last.role === 'ai' && last.quick && last.quick.length ? last.quick : (!real.length ? STARTERS : []);
    root.innerHTML = `<div class="cTop"><div class="cWho"><span class="cDot"></span><div><b>Your coach</b><small>${S.facts.length ? S.facts.length + ' thing' + (S.facts.length === 1 ? '' : 's') + ' remembered' : 'Learns as you chat'}</small></div></div>
        <div class="cBtns"><button type="button" id="cMem" class="cBtn">Memory</button><button type="button" id="cNew" class="cBtn" ${real.length ? '' : 'disabled'}>New chat</button></div></div>
      <div class="chat" id="gcChat" aria-live="polite">${from > 0 ? '<button type="button" class="link" id="cEarlier">Show earlier messages</button>' : ''}${real.length ? real.slice(from).map((m, k) => msgHTML(m, from + k)).join('') : '<div class="cHello"><div class="cOrb"></div><h2>Hi, I\'m your coach.</h2><p class="hint">Tell me what you did and I\'ll log it, ask what to train, or have me change a workout. I remember your injuries, gear and goals, and I\'ll ask when something is missing instead of guessing.</p></div>'}</div>
      <div class="chips" id="gcChips">${quick.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="composer" id="gcForm" autocomplete="off"><div class="taWrap" style="flex:1;min-width:0"><textarea id="gcIn" rows="1" maxlength="700" placeholder="Message your coach…" aria-label="Message"></textarea></div><button class="primary sendBtn" type="submit" id="gcGo" aria-label="Send">${ARROW}</button></form>
      <p class="hint nfoot">General fitness guidance, not medical advice. If something hurts, stop and see a doctor or physio.</p>`;
    if (scroll) { const l = $('#gcChat').lastElementChild; if (l && real.length > 1) l.scrollIntoView({ block: 'end', behavior: 'smooth' }); }
    const nw = $('#gcIn'); if (keep && nw && keep.v) { nw.value = keep.v; if (keep.f) { nw.focus({ preventScroll: true }); try { nw.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
  }

  /* memory sheet */
  let mdlg = null;
  function memSheet() {
    if (!mdlg) {
      mdlg = document.createElement('dialog'); mdlg.id = 'coachMemDlg'; mdlg.setAttribute('aria-label', 'What your coach remembers'); document.body.appendChild(mdlg);
      mdlg.addEventListener('click', (e) => {
        if (e.target === mdlg || e.target.closest('[data-mem="close"]')) { mdlg.close(); draw(false); return; }
        const d = e.target.closest('[data-mem-del]'); if (d) { S.facts = S.facts.filter((f) => f.id !== d.dataset.memDel); saveFacts(); FX.play('undo'); memDraw(); }
        if (e.target.closest('[data-mem="sum"]')) { S.sum = ''; save(); FX.play('undo'); memDraw(); }
      });
      mdlg.addEventListener('submit', (e) => { e.preventDefault(); const i = mdlg.querySelector('#memIn'); const t = i.value.trim(); if (t) { remember([{ cat: 'other', text: t }]); i.value = ''; FX.play('success'); memDraw(); } });
    }
    memDraw(); mdlg.showModal();
  }
  function memDraw() {
    const groups = {}; S.facts.forEach((f) => { (groups[f.cat] = groups[f.cat] || []).push(f); });
    mdlg.innerHTML = `<div class="sheet"><div class="closeRow"><button type="button" class="link" data-mem="close">Done</button></div><h2 style="margin:0">What your coach remembers</h2>
      <p class="hint" style="margin:0">Your coach adds notes as you chat and uses them every time. Remove anything that is wrong or out of date.</p>
      ${S.facts.length ? Object.keys(CATS).filter((c) => groups[c]).map((c) => `<h3 class="gh3">${CATS[c]}</h3>` + groups[c].map((f) => `<div class="logrow"><span>${esc(f.text)}</span><button type="button" class="link" data-mem-del="${esc(f.id)}" aria-label="Forget this">Forget</button></div>`).join('')).join('') : '<p class="empty">Nothing yet. Tell your coach about injuries, your gear or your goals.</p>'}
      ${S.sum ? `<h3 class="gh3">Older conversation</h3><div class="logrow"><span>${esc(S.sum)}</span><button type="button" class="link" data-mem="sum">Clear</button></div>` : ''}
      <form class="row" autocomplete="off"><input id="memIn" type="text" maxlength="140" placeholder="Add a note, e.g. I train at home with dumbbells up to 24 kg" aria-label="Add a note"><button type="submit" class="primary">Add</button></form></div>`;
  }

  /* events */
  const root = () => $('#gCoach');
  document.addEventListener('submit', (e) => { if (e.target.id !== 'gcForm') return; e.preventDefault(); const i = $('#gcIn'), t = i.value; i.value = ''; i.style.height = 'auto'; send(t); });
  document.addEventListener('click', async (e) => {
    const r = e.target.closest('#gCoach'); if (!r) return;
    const q = e.target.closest('[data-q]'); if (q) { send(q.dataset.q); return; }
    const rt = e.target.closest('[data-retry]'); if (rt) { S.msgs = S.msgs.filter((m) => !m.err); send(rt.dataset.retry); return; }
    if (e.target.closest('#cMem')) { memSheet(); return; }
    if (e.target.closest('#cEarlier')) { S.showAll = true; draw(false); return; }
    if (e.target.closest('#cNew')) { if (!S.pending && S.msgs.length) { await foldAll(); } S.msgs = []; S.pending = null; S.showAll = false; save(); draw(false); FX.play('pop'); return; }
    const un = e.target.closest('[data-undo]'); if (un) { const m = S.msgs[+un.dataset.undo], a = m && S.undo[m.id]; if (m && a && !m.act.undone) { m.act.undone = true; await a.undo(); delete S.undo[m.id]; await GP().reload(); window.Plate.refreshToday(); FX.play('undo'); save(); draw(false); } return; }
    const cw = e.target.closest('[data-cw]'); if (cw) { const m = S.msgs[+cw.dataset.cw]; if (m && m.workout) { const res = await Actions.run([{ op: 'set_workout', title: m.workout.title, items: m.workout.items.map((it) => ({ id: it.id, sets: it.sets, reps: it.reps || it.dur, rest_s: it.rest })) }], 'coach'); await GP().reload(); window.Plate.refreshToday(); S.undo[m.id] = res; m.act = { done: res.done, skipped: res.skipped, count: res.count }; m.workout = null; FX.play('success'); save(); draw(false); } return; }
    const cs = e.target.closest('[data-cs]'); if (cs) { const m = S.msgs[+cs.dataset.cs]; if (m && m.split) { const res = await Actions.run([{ op: 'set_split', name: m.split.name, days: m.split.days }], 'coach'); await GP().reload(); S.undo[m.id] = res; m.act = { done: res.done, skipped: res.skipped, count: res.count }; m.split = null; FX.play('success'); save(); draw(false); } }
  });
  /* starting a new chat folds what was said into the summary first, so nothing is forgotten */
  async function foldAll() {
    try {
      const transcript = S.msgs.filter((m) => !m.wait && !m.err).map((m) => (m.role === 'me' ? 'Person: ' : 'Coach: ') + String(m.text || '').slice(0, 260)).join('\n').slice(-5000);
      const r = await AI.askJSON({ task: 'coach', system: 'You keep a personal trainer\'s long-term notes. Merge the PREVIOUS SUMMARY with the CONVERSATION into one updated summary of at most 130 words (what they trained, decisions, recommendations, open threads). Facts only. Reply ONLY JSON: {"summary":""}', text: 'PREVIOUS SUMMARY: ' + (S.sum || 'none') + '\n\nCONVERSATION:\n' + transcript, max_tokens: 400 });
      if (r && r.summary) S.sum = String(r.summary).slice(0, 900);
    } catch (e) {}
  }

  window.Plate.hooks.coach = async () => { await load(); try { await GP().load(); } catch (e) {} draw(false); const l = $('#gcChat') && $('#gcChat').lastElementChild; if (l) setTimeout(() => l.scrollIntoView({ block: 'end' }), 30); };
  window.Coach = { buildWorkout, resolve, prepare, convert, remember, state: S, send, load, draw };
})();
