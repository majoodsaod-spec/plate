/* Plate: Nutrition tab. Plain code computes the averages from your log; one AI call (on demand, cached) reads the list of foods
   and points out likely gaps, easy local food fixes and optional supplements. Guardrails on supplements are enforced in code. */
(function () {
  'use strict';
  const { $, $$, esc } = window.Plate;
  const r0 = Math.round;
  let period = 14, busy = false, cur = null;      // cur: the numbers shown for the selected period

  /* ---------- the numbers (no AI) ---------- */
  const dayStr = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return DB.dayKey(d); };

  async function gather(n) {
    const goals = await DB.get('goals', null), prof = await DB.get('profile', null);
    const from = dayStr(n - 1), to = DB.dayKey();
    const meals = await DB.mealsBetween(from, to);
    const byDay = new Map();
    for (const m of meals) { if (!byDay.has(m.date)) byDay.set(m.date, []); byDay.get(m.date).push(m); }
    const floor = goals && goals.kcal ? 0.4 * goals.kcal : 800;           // below this a day was probably only partly logged
    const counted = [], partial = [];
    for (const [d, ms] of byDay) {
      if (d === to) continue;                                              // today isn't finished
      const k = ms.reduce((a, m) => a + (m.kcal || 0), 0);
      (k >= floor ? counted : partial).push(d);
    }
    const sum = (key) => counted.reduce((a, d) => a + byDay.get(d).reduce((x, m) => x + (m[key] || 0), 0), 0);
    const N = counted.length || 1;
    const avg = { kcal: sum('kcal') / N, protein: sum('protein') / N, carbs: sum('carbs') / N, fat: sum('fat') / N };
    // foods: how many counted days each appeared on, and the typical amount
    const foods = new Map(), entries = [];
    for (const d of counted) for (const m of byDay.get(d)) {
      const items = (m.items && m.items.length) ? m.items : [{ name: m.name, amount: 0, unit: '' }];
      for (const it of items) {
        const k = String(it.name || '').toLowerCase().trim().slice(0, 40); if (!k) continue;
        entries.push({ name: k, amount: +it.amount || 0, unit: String(it.unit || '').toLowerCase(), kcal: +it.kcal || 0 });
        const f = foods.get(k) || { name: k, days: new Set(), amt: 0, n: 0, unit: it.unit || '' };
        f.days.add(d); if (it.amount) { f.amt += it.amount; f.n++; }
        foods.set(k, f);
      }
    }
    const list = [...foods.values()].sort((a, b) => b.days.size - a.days.size || a.name.localeCompare(b.name));
    const weights = await DB.allWeights(), kg = weights.length ? weights[weights.length - 1].kg : (prof && prof.weight) || 0;
    const lastTs = meals.reduce((a, m) => Math.max(a, m.ts || 0), 0);
    return { n, goals, prof, kg, counted: counted.length, partial: partial.length, avg, list, entries, total: list.length, sig: [n, meals.length, lastTs, goals && goals.kcal].join('|') };
  }

  function bar(label, val, goal, unit) {
    const pct = goal ? val / goal : 0;
    return `<div class="nrow"><div class="ntop"><span>${label}</span><b>${r0(val)}${goal ? ' / ' + goal : ''} ${unit}</b></div>
      ${goal ? `<div class="nbar" role="img" aria-label="${r0(pct * 100)}% of goal"><i class="${pct > 1.15 ? 'over' : ''}" style="width:${Math.min(100, pct * 100)}%"></i></div>` : ''}</div>`;
  }
  function statsHTML(c) {
    const g = c.goals || {};
    if (!c.counted) return `<p class="empty" style="padding:8px 0">Nothing to analyse yet. Log your meals on the Today tab; complete days from the last ${c.n} days show up here.</p>`;
    const pk = c.kg ? c.avg.protein / c.kg : 0;
    return `<div class="sectionHead" style="padding:0 0 4px"><h2>Daily average</h2><span class="hint">${c.counted} day${c.counted > 1 ? 's' : ''} counted</span></div>
      ${bar('Calories', c.avg.kcal, g.kcal, 'kcal')}${bar('Protein', c.avg.protein, g.protein, 'g')}${bar('Carbs', c.avg.carbs, g.carbs, 'g')}${bar('Fat', c.avg.fat, g.fat, 'g')}
      ${pk ? `<p class="hint" style="margin:6px 0 0">Protein: ${pk.toFixed(1)} g per kg body weight.</p>` : ''}
      ${c.partial ? `<p class="hint" style="margin:6px 0 0">${c.partial} day${c.partial > 1 ? 's' : ''} left out because they look partly logged (under 40% of your calorie goal).</p>` : ''}`;
  }

  /* ---------- vitamins and minerals from USDA food data (maths in code; AI only picks which database entry matches a food) ---------- */
  const NK = [   // key, label, unit, decimals
    ['iron', 'Iron', 'mg', 1], ['calcium', 'Calcium', 'mg', 0], ['magnesium', 'Magnesium', 'mg', 0], ['zinc', 'Zinc', 'mg', 1], ['potassium', 'Potassium', 'mg', 0],
    ['fiber', 'Fibre', 'g', 0], ['vitA', 'Vitamin A', 'µg', 0], ['vitC', 'Vitamin C', 'mg', 0], ['vitD', 'Vitamin D', 'µg', 1], ['vitE', 'Vitamin E', 'mg', 1],
    ['vitK', 'Vitamin K', 'µg', 0], ['b12', 'Vitamin B12', 'µg', 1], ['folate', 'Folate', 'µg', 0], ['sodium', 'Sodium', 'mg', 0], ['satfat', 'Saturated fat', 'g', 0],
  ];
  /* adult reference intakes: US NASEM/NIH RDA or AI values; sodium limit from WHO (2 g); saturated fat under 10% of calories (WHO) */
  function refFor(p, kcal) {
    const m = p.sex === 'male', a = p.age;
    return {
      iron: m ? 8 : a > 50 ? 8 : 18, calcium: m ? (a > 70 ? 1200 : 1000) : (a > 50 ? 1200 : 1000), magnesium: m ? (a > 30 ? 420 : 400) : (a > 30 ? 320 : 310),
      zinc: m ? 11 : 8, potassium: m ? 3400 : 2600, fiber: m ? (a > 50 ? 30 : 38) : (a > 50 ? 21 : 25), vitA: m ? 900 : 700, vitC: m ? 90 : 75,
      vitD: a > 70 ? 20 : 15, vitE: 15, vitK: m ? 120 : 90, b12: 2.4, folate: 400, sodium: 2000, satfat: Math.round(0.1 * kcal / 9),
    };
  }
  const MAXKEYS = new Set(['sodium', 'satfat']);
  const getMap = async () => (await DB.get('foodMap', {})) || {};

  /* look up foods we haven't seen before, 8 per call, most frequent first; every answer is saved on the phone for good */
  async function matchFoods(c, onProgress) {
    const map = await getMap();
    const todo = c.list.map((f) => f.name).filter((n) => map[n] === undefined).slice(0, 36);
    for (let i = 0; i < todo.length; i += 6) {
      onProgress && onProgress(Math.min(i + 6, todo.length), todo.length);
      const res = await AI.nutrients(todo.slice(i, i + 6));
      for (const x of res) map[String(x.name).toLowerCase().trim()] = x.none ? null : { id: x.fdcId, desc: x.desc, per: x.per100, approx: !!x.approx };
      for (const n of todo.slice(i, i + 6)) if (map[n] === undefined) map[n] = null;      // asked, nothing usable came back
      await DB.set('foodMap', map);
    }
    return { asked: todo.length, left: Math.max(0, c.list.filter((f) => map[f.name] === undefined).length) };
  }

  /* average daily intake per nutrient from the matched foods. Returns null if the profile is missing or too young for the adult table. */
  async function intake(c) {
    if (!c.prof || !(c.prof.age >= 19) || c.counted < 3) return null;
    const map = await getMap();
    const totKcal = c.entries.reduce((a, e) => a + e.kcal, 0) || 1;
    const sum = {}, covK = {}; NK.forEach(([k]) => { sum[k] = 0; covK[k] = 0; });
    const unmatched = new Map(); let matchedKcal = 0;
    const matchedNames = new Set();
    for (const e of c.entries) {
      const f = map[e.name];
      let grams = 0;
      if (f && f.per && f.per.kcal >= 5) {
        if ((e.unit === 'g' || e.unit === 'ml') && e.amount > 0) {
          grams = e.amount;
          const ratio = e.kcal / (grams * f.per.kcal / 100);                    // a bad match shows up as a calorie mismatch: do not use it
          if (e.kcal > 0 && (ratio < 0.4 || ratio > 2.5)) grams = 0;
        } else if (e.kcal > 0) grams = e.kcal / (f.per.kcal / 100);              // pieces, cups etc.: size the portion from its calories
      }
      if (!grams) { unmatched.set(e.name, (unmatched.get(e.name) || 0) + e.kcal); continue; }
      matchedKcal += e.kcal; matchedNames.add(e.name);
      for (const [k] of NK) if (f.per[k] != null) { sum[k] += grams * f.per[k] / 100; covK[k] += e.kcal; }
    }
    const ref = refFor(c.prof, c.avg.kcal), N = c.counted;
    const rows = NK.map(([k, label, unit, dec]) => {
      const avg = sum[k] / N, cov = covK[k] / totKcal, pct = avg / ref[k];
      let status = 'unknown';
      if (cov >= 0.6) status = MAXKEYS.has(k) ? (pct > 1 ? 'over' : 'ok') : (pct < 0.67 ? 'low' : pct < 0.9 ? 'mid' : 'ok');
      return { k, label, unit, dec, avg, ref: ref[k], pct, cov, status, max: MAXKEYS.has(k) };
    });
    return { rows, coverage: matchedKcal / totKcal, unmatched: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]), matched: [...matchedNames], map };
  }
  const fmt = (v, d) => (d ? v.toFixed(d) : String(r0(v)));
  function intakeHTML(c, it, pending) {
    const rank = { low: 0, over: 1, mid: 2, ok: 3, unknown: 4 };
    let body = '';
    if (it && it.coverage > 0) {
      const rows = it.rows.filter((r) => r.status !== 'unknown').sort((a, b) => rank[a.status] - rank[b.status] || a.pct - b.pct);
      const unk = it.rows.filter((r) => r.status === 'unknown').map((r) => r.label);
      body = rows.map((r) => `<div class="nrow"><div class="ntop"><span>${r.label}</span><b>${fmt(r.avg, r.dec)} / ${r.max ? '≤ ' : ''}${fmt(r.ref, r.dec)} ${r.unit}</b></div>
        <div class="nbar" role="img" aria-label="${r0(r.pct * 100)}% of reference"><i class="${r.status}" style="width:${Math.min(100, r.pct * 100)}%"></i></div></div>`).join('') +
        (unk.length ? `<p class="hint" style="margin:8px 0 0"><b>Can't tell from your foods:</b> ${esc(unk.join(', '))}. The database has no values for these in the foods you eat (common for vitamin D and B12), so they aren't counted as gaps. A blood test is the way to check.</p>` : '') +
        `<p class="hint" style="margin:8px 0 0">Estimate from ${it.matched.length} matched food${it.matched.length === 1 ? '' : 's'}${it.matched.some((x) => (it.map[x] || {}).approx) ? ' (some approximated from their ingredients)' : ''}, covering ${r0(it.coverage * 100)}% of your calories. Reference intakes are US NIH/NASEM adult values (sodium: WHO limit). Salt added in cooking and in restaurant food isn't in the database, so real sodium is likely higher.</p>
        ${it.unmatched.length ? `<p class="hint" style="margin:6px 0 0">Not matched, so not counted: ${esc(it.unmatched.slice(0, 8).join(', '))}${it.unmatched.length > 8 ? '…' : ''}</p>` : ''}
        <details class="mlist"><summary>Which foods were matched</summary><ul>${it.matched.map((n) => `<li><b>${esc(n)}</b>${(it.map[n] || {}).approx ? ' <span class="chip">approximated</span>' : ''} <small>${esc((it.map[n] || {}).desc || '')}</small></li>`).join('')}</ul></details>`;
    } else body = '<p class="hint" style="margin:0 0 8px">Turn your logged foods into real vitamin and mineral numbers using USDA food data.</p>';
    return `<div class="sectionHead" style="padding:0 0 4px"><h2>Vitamins &amp; minerals</h2></div>${body}
      ${pending ? `<button type="button" id="nMatch" style="margin-top:10px;justify-content:center;width:100%">${it && it.coverage > 0 ? `Match ${pending} new food${pending > 1 ? 's' : ''}` : 'Calculate from my foods'}</button><p class="status" id="nMStatus" role="status"></p>` : ''}`;
  }
  const intakeLines = (it) => {
    if (!it) return '';
    const ok = it.rows.filter((r) => r.status !== 'unknown');
    return `INTAKE (average per day, computed by the program from USDA data for the matched foods, covering ${r0(it.coverage * 100)}% of calories):\n` +
      ok.map((r) => `${r.label}: ${fmt(r.avg, r.dec)} ${r.unit} vs ${r.max ? 'limit' : 'reference'} ${fmt(r.ref, r.dec)} (${r0(r.pct * 100)}%)`).join('\n') +
      `\nUnknown (not enough data): ${it.rows.filter((r) => r.status === 'unknown').map((r) => r.label).join(', ') || 'none'}.` +
      (it.unmatched.length ? `\nFoods not matched to the database, so missing from the figures: ${it.unmatched.slice(0, 10).join(', ')}.` : '');
  };

  /* ---------- the AI part ---------- */
  function buildMessage(c, region, prefs, it) {
    const p = c.prof, g = c.goals || {};
    const L = [];
    L.push(`Region: ${region}.`);
    L.push(p ? `Profile: ${p.sex}, ${p.age} years, ${p.height} cm, ${c.kg || p.weight} kg, goal: ${p.goal}.` : 'Profile: not given.');
    if (g.kcal) L.push(`Daily targets: ${g.kcal} kcal, protein ${g.protein} g, carbs ${g.carbs} g, fat ${g.fat} g.`);
    if (prefs) L.push('Preferences and allergies: ' + prefs);
    L.push(`Period: last ${c.n} days. Counted ${c.counted} fully logged days (${c.partial} partly logged days left out).`);
    L.push(`Averages per counted day: ${r0(c.avg.kcal)} kcal, protein ${r0(c.avg.protein)} g${c.kg ? ' (' + (c.avg.protein / c.kg).toFixed(1) + ' g/kg)' : ''}, carbs ${r0(c.avg.carbs)} g, fat ${r0(c.avg.fat)} g.`);
    const top = c.list.slice(0, 80);
    L.push(`Logged foods (${top.length < c.total ? 'only the ' + top.length + ' most frequent of ' + c.total : 'complete list'}), format: name | days eaten of ${c.counted} | typical amount:`);
    L.push(top.map((f) => `${f.name} | ${f.days.size} | ${f.n ? r0(f.amt / f.n) + ' ' + (f.unit || 'g') : '?'}`).join('\n'));
    if (it && it.coverage > 0.3) L.push(intakeLines(it));
    return L.join('\n');
  }

  /* compact personal summary for questions: profile, targets, figures worked out here in code, and the most frequent foods */
  async function askContext() {
    const c = await gather(14), p = c.prof, g = c.goals || {}, it = await intake(c);
    const L = [];
    if (p) {
      const kg = c.kg || p.weight, bmi = kg / Math.pow(p.height / 100, 2);
      L.push(`Profile: ${p.sex}, ${p.age} years, ${p.height} cm, ${kg} kg (BMI ${bmi.toFixed(1)}), goal: ${p.goal}, activity: ${p.activity}.`);
    } else L.push('Profile: not set.');
    if (g.kcal) L.push(`Daily targets: ${g.kcal} kcal, protein ${g.protein} g, carbs ${g.carbs} g, fat ${g.fat} g.${g.tdee ? ` Estimated maintenance: ${r0(g.tdee)} kcal.` : ''}`);
    const prefs = ((await DB.get('dietPrefs', '')) || '').trim(); if (prefs) L.push('Preferences and allergies: ' + prefs);
    if (c.counted >= 3) {
      L.push(`Last 14 days, ${c.counted} fully logged days. Average per day: ${r0(c.avg.kcal)} kcal, protein ${r0(c.avg.protein)} g${c.kg ? ' (' + (c.avg.protein / c.kg).toFixed(1) + ' g/kg)' : ''}, carbs ${r0(c.avg.carbs)} g, fat ${r0(c.avg.fat)} g.`);
      L.push('Most frequent logged foods (name | days of ' + c.counted + '): ' + c.list.slice(0, 40).map((f) => `${f.name} | ${f.days.size}`).join('; '));
    } else L.push('Food log: fewer than 3 fully logged days, so no reliable intake data.');
    if (it && it.coverage > 0.3) L.push(intakeLines(it));
    return L.join('\n');
  }

  const SUPP_OK = /vitamin d|omega|epa|dha|fish oil|b12|cobalamin|magnesium|calcium|fib(?:re|er)|protein|whey/i;   // anything else: food only
  const LEVELS = ['likely', 'possible', 'check'];
  const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
  function clean(x) {
    if (!x || typeof x !== 'object') return null;
    const gaps = (Array.isArray(x.gaps) ? x.gaps : []).slice(0, 4).map((g) => {
      const nutrient = cut(g.nutrient, 40); if (!nutrient) return null;
      let supp = null;
      const s = g.supplement;
      if (s && s.worth_considering && s.form && SUPP_OK.test(nutrient + ' ' + s.form) && !/iron|ferr/i.test(nutrient + ' ' + s.form))   // never iron without a blood test
        supp = { form: cut(s.form, 70), dose: cut(s.typical_dose, 70), note: cut(s.note, 160) };
      return { nutrient, level: LEVELS.includes(g.level) ? g.level : 'possible', evidence: cut(g.evidence, 300),
        fixes: (Array.isArray(g.food_fixes) ? g.food_fixes : []).slice(0, 4).map((f) => cut(f, 140)).filter(Boolean), supp };
    }).filter(Boolean);
    return { headline: cut(x.headline, 240), well: (Array.isArray(x.doing_well) ? x.doing_well : []).slice(0, 3).map((f) => cut(f, 120)).filter(Boolean),
      gaps, test: x.test_suggestion ? cut(x.test_suggestion, 200) : '' };
  }

  function resultHTML(res, at, stale) {
    const when = new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' });
    return `<div class="card"><p style="margin:0;font-weight:600">${esc(res.headline)}</p>
        <p class="hint" style="margin:6px 0 0">Analysed ${when}${stale ? '. Your log has changed since, so this may be out of date.' : '.'}</p></div>
      ${res.well.length ? `<div class="card nwell"><h4 style="margin:0;font:700 12px var(--font);color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Going well</h4>${res.well.map((w) => `<p style="margin:0">✓ ${esc(w)}</p>`).join('')}</div>` : ''}
      ${res.gaps.map((g) => `<article class="ngap"><h3>${esc(g.nutrient)} <span class="chip lvl ${g.level}">${{ likely: 'Likely low', possible: 'Possibly low', check: 'Worth testing' }[g.level]}</span></h3>
        ${g.evidence ? `<p>${esc(g.evidence)}</p>` : ''}
        ${g.fixes.length ? `<h4>Easy food fixes</h4><ul>${g.fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${g.supp ? `<h4>Optional supplement</h4><div class="supp"><b>${esc(g.supp.form)}</b>${g.supp.dose ? `<span>Typical label strength: ${esc(g.supp.dose)}</span>` : ''}${g.supp.note ? `<span>${esc(g.supp.note)}</span>` : ''}<small>Ask a pharmacist before starting. Food first.</small></div>` : ''}</article>`).join('')}
      ${res.test ? `<div class="card"><p style="margin:0"><b>Worth a blood test:</b> ${esc(res.test)}</p></div>` : ''}
      ${!res.gaps.length ? '<div class="card"><p style="margin:0">No clear gaps from what you logged. Keep logging to sharpen this.</p></div>' : ''}`;
  }

  async function cacheGet() { return (await DB.get('nutriCache', {}))[period] || null; }
  async function cachePut(v) { const all = await DB.get('nutriCache', {}); all[period] = v; await DB.set('nutriCache', all); }

  async function render() {
    $$('[data-nper]').forEach((b) => b.classList.toggle('on', +b.dataset.nper === period));
    const c = cur = await gather(period);
    $('#nStats').innerHTML = statsHTML(c);
    const box = $('#nResult');
    const it = c.it = await intake(c);
    c.sig += '|' + (it ? it.matched.length + ':' + r0(it.coverage * 100) : 0);          // a new food match makes an old analysis out of date
    const pending = it ? c.list.filter((f) => it.map[f.name] === undefined).length : 0;
    const underage = c.prof && !(c.prof.age >= 19);
    $('#nIntake').hidden = c.counted < 3 || !!underage || !c.prof;
    if (!$('#nIntake').hidden) $('#nIntake').innerHTML = intakeHTML(c, it, pending);
    if (c.counted < 3) {
      box.innerHTML = `<div class="card"><p style="margin:0">${c.counted ? 'I need at least 3 fully logged days to say anything useful.' : 'Start logging and come back.'} You have ${c.counted} so far.</p></div>`;
      return;
    }
    const hit = await cacheGet();
    const fresh = hit && hit.sig === c.sig;
    box.innerHTML = (hit ? resultHTML(hit.res, hit.at, !fresh) : '') +
      `<button type="button" class="primary" id="nGo" style="justify-content:center">${hit ? (fresh ? 'Analyse again' : 'Update analysis') : 'Analyse my diet'}</button>
       <p class="status" id="nStatus" role="status"></p>`;
  }

  async function analyse() {
    if (busy || !cur) return;
    busy = true;
    const btn = $('#nGo'), st = $('#nStatus'); btn.disabled = true; st.className = 'status'; st.textContent = 'Reading your food log…';
    const c = cur, per = period;
    try {
      const region = (await DB.get('region', 'Qatar')) || 'Qatar', prefs = ((await DB.get('dietPrefs', '')) || '').trim();
      const raw = await AI.askJSON({ task: 'nutrition', system: Prompts.NUTRITION, text: buildMessage(c, region, prefs, c.it), max_tokens: 1500 });
      const res = clean(raw); if (!res || !res.headline) throw new Error('The analysis came back incomplete. Try again.');
      const saved = period; period = per; await cachePut({ sig: c.sig, at: Date.now(), res }); period = saved;
    } catch (e) { busy = false; if ($('#nStatus')) { $('#nStatus').textContent = e.message; $('#nStatus').className = 'status bad'; } if ($('#nGo')) $('#nGo').disabled = false; return; }
    busy = false; render();
  }

  /* ---------- Ask ---------- */
  const qa = { msgs: [], busy: false };
  let regionName = '';
  const qchips = () => ['Log 2 eggs and toast for breakfast', 'I weigh 79.5 kg today', 'Am I eating enough protein for my goal?', regionName ? 'How can I get more iron from food in ' + regionName + '?' : 'How can I get more iron from food?', 'What should I eat before and after a workout?', 'Do I need a vitamin D supplement?'];
  function linkify(text) {
    return esc(text).replace(/\[(\d+)\]/g, (m, d) => `<sup class="cite">${d}</sup>`).replace(/\n/g, '<br>');
  }
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  function renderQA() {
    $('#nChat').innerHTML = qa.msgs.map((m, i) => {
      if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
      if (m.wait) return '<div class="msg ai wait">Checking trusted sources…</div>';
      if (m.err) return `<div class="msg ai err">${esc(m.text)}</div>`;
      if (m.plain) return `<div class="msg ai ans"><div>${esc(m.text)}</div>${m.act ? Actions.html(m.act, i, esc) : ''}</div>`;
      const cov = { sourced: ['From trusted sources', 'ok'], partial: ['Partly sourced', 'mid'], general: ['General advice, no source found', 'low'] }[m.coverage] || ['', ''];
      return `<div class="msg ai ans"><div>${linkify(m.text)}</div>
        <span class="chip cov ${cov[1]}">${cov[0]}</span>
        ${m.sources && m.sources.length ? `<ol class="srcs">${m.sources.map((s) => /^https?:\/\//.test(s.url) ? `<li value="${s.n}"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || host(s.url))}</a> <small>${esc(host(s.url))}</small></li>` : '').join('')}</ol>` : ''}
        ${m.searchNote ? `<small class="hint">${esc(m.searchNote)}</small>` : ''}</div>`;
    }).join('');
    const last = $('#nChat').lastElementChild; if (last && qa.msgs.length > 1) last.scrollIntoView({ block: 'end', behavior: 'smooth' });
    $('#nChips').innerHTML = qa.msgs.length ? (qa.msgs[qa.msgs.length - 1].follow ? qa.msgs[qa.msgs.length - 1].follow.map((f) => `<button type="button" data-q="${esc(f)}">${esc(f)}</button>`).join('') : '') : qchips().map((f) => `<button type="button" data-q="${esc(f)}">${esc(f)}</button>`).join('');
  }
  /* ----- edits by chat: the AI proposes changes, Actions checks and applies them, and one Undo reverts the batch ----- */
  const EDITISH = /\b(log|add|ate|eaten|eat|had|have i|drank|drink|delete|remove|undo|change|set|update|edit|fix|correct|move|rename|weigh|weight|goal|target|water|profile|height|forget|clear|replace|swap|instead|actually|only|just|scrap|cancel|cheat|skip|bigger|smaller|double|half|kg|kilos?|calories to|allerg|diet|halal|vegan|vegetarian)\b/i;
  const NUT_ACT = `You are the assistant inside a personal food and body-weight tracker. The person can ask you to change their data. Decide what they want.

If they ask you to log, add, change, fix, move, rename or delete something, set or change their weight, water, daily goals, profile or food preferences, or delete a saved recipe, put the changes in "actions" and say what you did in "reply" in the past tense. Do only what they asked, nothing more. If it is unclear which entry they mean or a number is missing and cannot be sensibly estimated, ask ONE short question and leave actions empty. Copy ids exactly from the lists given; never invent an id. Dates are YYYY-MM-DD (see DATES). When you add a meal from a description, estimate calories and macros sensibly for the amount (they are estimates; say so briefly). Never set calories below 1200 (women) or 1500 (men). No medical advice.

If they are only asking a nutrition QUESTION (no change wanted), return "answer_needed": true and no actions.

Ops (use only these):
{"op":"add_meal","date":"","name":"","kcal":0,"protein":0,"carbs":0,"fat":0}
{"op":"update_meal","id":"","name":"","kcal":0,"protein":0,"carbs":0,"fat":0,"date":""} (include only the fields that change)
{"op":"delete_meal","id":""}
{"op":"set_weight","date":"","kg":0,"cm":0}  {"op":"delete_weight","date":""}
{"op":"set_water","date":"","ml":0}
{"op":"set_goals","kcal":0,"protein":0,"carbs":0,"fat":0} (carbs and fat optional)
{"op":"set_profile","weight":0,"height":0,"sex":"male|female","activity":"sedentary|light|moderate|very","goal":"lose|slow|maintain|gain","birth":"YYYY-MM-DD"} (only the fields that change)
{"op":"set_diet_prefs","text":"allergies, dislikes, halal etc"}  {"op":"delete_recipe","id":""}

Return ONLY this JSON: {"reply":"one or two plain sentences","actions":[],"answer_needed":false}`;
  async function editContext() {
    const prof = await DB.get('profile', null), goals = await DB.get('goals', null), prefs = ((await DB.get('dietPrefs', '')) || '').trim();
    const to = DB.dayKey(), d0 = new Date(); d0.setDate(d0.getDate() - 7); const meals = (await DB.mealsBetween(DB.dayKey(d0), to)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts)).slice(0, 40);
    const ws = (await DB.allWeights()).slice(-10), rec = (await DB.allRecipes()).slice(0, 12), water = (await DB.get('water:' + to, 0)) || 0;
    const L = ['DATES: ' + Actions.dateTable()];
    L.push(prof ? `Profile: ${prof.sex}, ${prof.age} y, ${prof.height} cm, ${prof.weight} kg, goal ${prof.goal}, activity ${prof.activity}.` : 'Profile: not set.');
    L.push(goals && goals.kcal ? `Daily goals: ${goals.kcal} kcal, protein ${goals.protein} g, carbs ${goals.carbs} g, fat ${goals.fat} g.` : 'Daily goals: not set.');
    L.push('Food preferences: ' + (prefs || 'none') + '. Water today: ' + water + ' ml.');
    L.push('WEIGHTS: ' + (ws.length ? ws.map((w) => w.date + ' ' + w.kg).join('; ') : 'none'));
    const head = L.join('\n'); let rows = meals.map((m) => `${m.id} | ${m.date} | ${String(m.name || '').slice(0, 40)} | ${Math.round(m.kcal || 0)} | ${Math.round(m.protein || 0)}/${Math.round(m.carbs || 0)}/${Math.round(m.fat || 0)}`);
    const tail = rec.length ? '\nRECIPES (id | title): ' + rec.map((r) => r.id + ' | ' + String(r.title || '').slice(0, 40)).join('; ') : '';
    while (rows.length && (head + rows.join('\n') + tail).length > 5000) rows.pop();     // the request must stay under the proxy's size limit
    return head + '\nMEALS, newest first (id | date | name | kcal | protein/carbs/fat g), last 7 days only:\n' + (rows.length ? rows.join('\n') : 'none') + tail;
  }
  async function tryEdit(text, hist) {
    const r = await AI.askJSON({ task: 'coach', system: NUT_ACT, history: hist, text: (await editContext()) + '\n\nTHE PERSON SAYS: ' + text.slice(0, 500), max_tokens: 900 });
    return { reply: String(r.reply || '').slice(0, 700), actions: Array.isArray(r.actions) ? r.actions : [], answer: !!r.answer_needed };
  }
  async function afterEdit() { try { window.Plate.refreshAll(); } catch (e) {} }
  async function askQ(text) {
    text = (text || '').trim(); if (!text || qa.busy) return;
    qa.busy = true; $('#nSend').disabled = true;
    const hist = qa.msgs.filter((m) => !m.wait && !m.err).slice(-4).map((m) => ({ role: m.role === 'me' ? 'user' : 'model', text: m.text }));
    const prevQ = [...qa.msgs].reverse().find((m) => m.role === 'me');
    qa.msgs.push({ role: 'me', text }, { role: 'ai', wait: true }); renderQA();
    $('#nInput').value = ''; autosizeQ();
    try {
      const region = (await DB.get('region', 'Qatar')) || 'Qatar';
      if (EDITISH.test(text)) {
        const e = await tryEdit(text, hist);
        if (e.actions.length) {
          const act = await Actions.run(e.actions, 'nutrition'); await afterEdit();
          qa.msgs.pop(); qa.msgs.push({ role: 'ai', text: act.count ? (e.reply || 'Done.') : "I couldn't apply that, so nothing was changed.", act, plain: true });
          qa.busy = false; $('#nSend').disabled = false; renderQA(); return;
        }
        if (!e.answer && e.reply) { qa.msgs.pop(); qa.msgs.push({ role: 'ai', text: e.reply, plain: true }); qa.busy = false; $('#nSend').disabled = false; renderQA(); return; }
      }
      const r = await AI.answer({ question: text, context: await askContext(), region, history: hist, prevQuestion: prevQ ? prevQ.text : '' });
      qa.msgs.pop();
      qa.msgs.push({ role: 'ai', text: r.answer, coverage: r.coverage, sources: r.sources, searchNote: r.searchNote, follow: r.follow_ups });
    } catch (e) { qa.msgs.pop(); qa.msgs.push({ role: 'ai', text: e.message, err: true }); }
    qa.busy = false; $('#nSend').disabled = false; renderQA();
  }
  function autosizeQ() { const t = $('#nInput'); t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; }
  $('#nInput').addEventListener('input', autosizeQ);
  $('#nForm').addEventListener('submit', (e) => { e.preventDefault(); askQ($('#nInput').value); });
  $('#nChat').addEventListener('click', (e) => {
    const un = e.target.closest('[data-undo]'); if (!un) return; const m = qa.msgs[+un.dataset.undo];
    if (m && m.act && !m.act.undone) { m.act.undone = true; m.act.undo().then(async () => { await afterEdit(); renderQA(); }); }
  });
  $('#nChips').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) askQ(b.dataset.q); });
  function showNTab(t) {
    $$('[data-ntab]').forEach((b) => b.classList.toggle('on', b.dataset.ntab === t));
    $('#nOver').hidden = t !== 'over'; $('#nAsk').hidden = t !== 'ask';
    if (t === 'ask') renderQA(); else render();
  }
  $$('[data-ntab]').forEach((b) => b.addEventListener('click', () => showNTab(b.dataset.ntab)));

  $('#nIntake').addEventListener('click', async (e) => {
    if (!e.target.closest('#nMatch') || busy || !cur) return;
    busy = true; const btn = $('#nMatch'), st = $('#nMStatus'); btn.disabled = true; st.className = 'status';
    try {
      const r = await matchFoods(cur, (a, b) => { st.textContent = `Matching foods ${a} of ${b}…`; });
      busy = false; await render();
      if (r.left && $('#nMStatus')) $('#nMStatus').textContent = `${r.left} more foods to match. Tap again to continue.`;
    } catch (err) { busy = false; if ($('#nMStatus')) { $('#nMStatus').textContent = err.message; $('#nMStatus').className = 'status bad'; } if ($('#nMatch')) $('#nMatch').disabled = false; }
  });
  $('#nResult').addEventListener('click', (e) => { if (e.target.closest('#nGo')) analyse(); });
  $$('[data-nper]').forEach((b) => b.addEventListener('click', () => { if (busy) return; period = +b.dataset.nper; render(); }));
  window.Plate.hooks.nutrition = async () => { regionName = (await DB.get('region', '')) || ''; showNTab($('#nAsk').hidden ? 'over' : 'ask'); };
  if (!$('#view-nutrition').hidden) render();
})();
