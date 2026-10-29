/* Plate: Insights tab. Everything here is plain arithmetic on your own log: no AI, no quota.
   Weeks run Sunday to Saturday. A day counts toward averages only if it looks fully logged (at least 40% of your calorie goal) and is not today. */
(function () {
  'use strict';
  const { $, $$, esc } = window.Plate;
  const r0 = Math.round, nf = (v) => r0(v).toLocaleString();
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sundayOf = (d) => addDays(d, -d.getDay());
  const short = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const long = (d) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const PREV_WEEKS = 8;
  let armed = '';

  /* ---------- data ---------- */
  async function load() {
    const goals = await DB.get('goals', null), prof = await DB.get('profile', null);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayKey = DB.dayKey(today);
    const firstSun = addDays(sundayOf(today), -7 * PREV_WEEKS);
    const meals = await DB.mealsBetween(DB.dayKey(firstSun), todayKey);
    const burnBy = window.Burn ? await window.Burn.between(DB.dayKey(firstSun), todayKey) : {};
    const by = new Map();
    for (const m of meals) {
      const t = by.get(m.date) || { kcal: 0, protein: 0, n: 0 };
      t.kcal += m.kcal || 0; t.protein += m.protein || 0; t.n++; by.set(m.date, t);
    }
    for (const [k, t] of by) { t.burn = burnBy[k] || 0; t.net = t.kcal - t.burn; }   // net = food in minus workouts out
    const floor = goals && goals.kcal ? 0.4 * goals.kcal : 800;
    const weeks = [];
    for (let i = 0; i <= PREV_WEEKS; i++) {
      const start = addDays(firstSun, 7 * (PREV_WEEKS - i));
      const days = [];
      for (let j = 0; j < 7; j++) {
        const date = addDays(start, j), key = DB.dayKey(date), tot = by.get(key) || null;
        days.push({ key, date, tot, future: date > today, today: key === todayKey, counted: !!tot && key !== todayKey && date < today && tot.kcal >= floor });
      }
      weeks.push({ start, end: addDays(start, 6), days });   // weeks[0] = this week, then older
    }
    return { goals, prof, today, todayKey, weeks, by, floor, weights: await DB.allWeights(), usage: (await DB.get('usage', {})) || {}, lastBackup: await DB.get('lastBackup', 0) };
  }
  function stats(w, goals) {
    const c = w.days.filter((d) => d.counted), n = c.length;
    const avg = n ? c.reduce((a, d) => a + d.tot.net, 0) / n : 0, prot = n ? c.reduce((a, d) => a + d.tot.protein, 0) / n : 0;
    const g = goals && goals.kcal ? goals : null;
    return { n, avg, prot, logged: w.days.filter((d) => d.tot).length,
      onTarget: g ? c.filter((d) => Math.abs(d.tot.net - g.kcal) / g.kcal <= 0.1).length : 0,
      protMet: g && g.protein ? c.filter((d) => d.tot.protein >= 0.9 * g.protein).length : 0 };
  }

  /* ---------- charts ---------- */
  function barChart(w, goals) {
    const g = goals && goals.kcal ? goals.kcal : 0;
    const max = Math.max(g * 1.2, ...w.days.map((d) => (d.tot ? d.tot.net : 0)), 500);
    const cols = w.days.map((d, i) => {
      const k = d.tot ? d.tot.net : 0, pct = Math.max(0, k / max * 100);
      const label = d.future ? `${long(d.date)}: upcoming` : d.tot ? `${long(d.date)}: ${nf(k)} net kcal (ate ${nf(d.tot.kcal)}${d.tot.burn ? ', burned ' + nf(d.tot.burn) : ''}), ${r0(d.tot.protein)} g protein${d.today ? ' so far today' : d.counted ? '' : ' (looks partly logged)'}` : `${long(d.date)}: nothing logged`;
      return `<div class="col"><button type="button" class="dbar${d.today ? ' today' : ''}${d.tot && !d.counted && !d.today ? ' part' : ''}" data-read="${esc(label)}" aria-label="${esc(label)}" ${d.future ? 'disabled' : ''}><i style="height:${pct}%"></i></button><span class="dl${d.today ? ' on' : ''}">${LETTER[i]}</span></div>`;
    }).join('');
    return `<div class="chart" role="group" aria-label="Calories per day"><div class="plot">${g ? `<div class="goalLine" style="bottom:calc(20px + (100% - 20px) * ${(g / max).toFixed(4)})"><span>Goal ${nf(g)}</span></div>` : ''}${cols}</div>
      <p class="readout" aria-live="polite">Tap a bar for details.</p></div>`;
  }
  function statRow(s, goals, current) {
    const g = goals && goals.kcal;
    if (!s.n) return `<p class="hint" style="margin:0">${current ? 'No finished days to average yet this week.' : 'No fully logged days.'}</p>`;
    const diff = g ? (s.avg - g) / g * 100 : null;
    return `<div class="stats4"><div><b>${nf(s.avg)}</b><span>net kcal / day</span></div>
      <div><b>${g ? (diff > 0 ? '+' : '') + r0(diff) + '%' : '–'}</b><span>vs goal</span></div>
      <div><b>${r0(s.prot)} g</b><span>protein / day</span></div>
      <div><b>${g ? s.onTarget + '/' + s.n : '–'}</b><span>days on target</span></div></div>`;
  }

  function weightChart(ws) {
    if (ws.length < 2) return '';
    const W = 320, H = 130, P = 10, t0 = parse(ws[0].date).getTime(), t1 = parse(ws[ws.length - 1].date).getTime() || t0 + 1;
    const kgs = ws.map((x) => x.kg), lo = Math.min(...kgs), hi = Math.max(...kgs), pad = Math.max(0.5, (hi - lo) * 0.2);
    const y = (v) => P + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 2 * P - 14);
    const x = (d) => P + ((parse(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
    const pts = ws.map((p) => [x(p.date), y(p.kg), p]);
    return `<svg viewBox="0 0 ${W} ${H}" class="wchart" role="img" aria-label="Weight over time, from ${ws[0].kg} to ${ws[ws.length - 1].kg} kilograms">
      <polyline points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/><circle class="hit" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="14" fill="transparent" data-read="${esc(long(parse(p[2].date)) + ': ' + p[2].kg + ' kg')}"/>`).join('')}
      <text x="${P}" y="${H - 2}" class="ax">${esc(short(parse(ws[0].date)))}</text><text x="${W - P}" y="${H - 2}" text-anchor="end" class="ax">${esc(short(parse(ws[ws.length - 1].date)))}</text></svg>
      <p class="readout" aria-live="polite">Tap a point for details.</p>`;
  }

  /* weight trend vs logged intake: a rough check of real maintenance calories (needs consistent logging and several weigh-ins) */
  function maintenance(D) {
    const end = D.today, start = addDays(end, -28);
    const ws = D.weights.filter((x) => parse(x.date) >= start);
    if (ws.length < 3 || (parse(ws[ws.length - 1].date) - parse(ws[0].date)) / 864e5 < 14) return null;
    const days = D.weeks.flatMap((w) => w.days).filter((d) => d.counted && d.date >= parse(ws[0].date) && d.date <= parse(ws[ws.length - 1].date));
    if (days.length < 10) return null;
    const xs = ws.map((p) => (parse(p.date) - parse(ws[0].date)) / 864e5), ys = ws.map((p) => p.kg), n = ws.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    const slope = xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0) / xs.reduce((a, v) => a + (v - mx) ** 2, 0);   // kg per day
    const intake = days.reduce((a, d) => a + d.tot.kcal, 0) / days.length;
    const est = intake - slope * 7700;
    return est >= 1000 && est <= 5000 ? { est, intake, perWeek: slope * 7, weighIns: n, days: days.length } : null;
  }

  /* ---------- sections ---------- */
  function weekCard(D) {
    const w = D.weeks[0], s = stats(w, D.goals), prev = stats(D.weeks[1], D.goals);
    const cmp = s.n && prev.n ? s.avg - prev.avg : null;
    const todayTot = D.by.get(D.todayKey);
    return `<div class="card"><div class="sectionHead" style="padding:0 0 8px"><h2>This week</h2><span class="hint">${short(w.start)} – ${short(w.end)}</span></div>
      ${statRow(s, D.goals, true)}${barChart(w, D.goals)}
      <p class="hint" style="margin:8px 0 0">${cmp != null ? `${cmp > 0 ? 'Up' : 'Down'} ${nf(Math.abs(cmp))} net kcal a day from last week. ` : ''}${todayTot ? `Today so far: ${nf(todayTot.net)} net kcal (not in the average until the day is done).` : ''}${!D.goals ? ' Set your goals below to see the goal line.' : ''}</p>
      ${D.goals && D.goals.protein && s.n ? `<p class="hint" style="margin:4px 0 0">Protein goal reached on ${s.protMet} of ${s.n} days (within 10%).</p>` : ''}</div>`;
  }
  function prevCard(D) {
    const rows = D.weeks.slice(1).map((w) => ({ w, s: stats(w, D.goals) }));
    if (!rows.some(({ s }) => s.n || s.logged)) return `<div class="card"><div class="sectionHead" style="padding:0 0 4px"><h2>Previous weeks</h2></div><p class="hint" style="margin:0">Nothing logged in earlier weeks yet. They will show up here as you log.</p></div>`;
    return `<div class="card"><div class="sectionHead" style="padding:0 0 4px"><h2>Previous weeks</h2></div>
      ${rows.map(({ w, s }) => `<details class="wk"><summary><span>${short(w.start)} – ${short(w.end)}</span><b>${s.n ? nf(s.avg) + ' net kcal' : s.logged ? 'partly logged' : '–'}</b></summary>
        <div class="wkBody">${statRow(s, D.goals, false)}${barChart(w, D.goals)}</div></details>`).join('')}</div>`;
  }
  /* Recent weigh-ins, newest first. Tap Edit to load one into the form above, or remove it. */
  function weightList(D) {
    const rows = D.weights.slice(-14).reverse();
    if (!rows.length) return '';
    return `<details class="wlist"><summary>Your entries (${D.weights.length})</summary>${rows.map((x) => `<div class="wrow"><span><b>${esc(short(parse(x.date)))}</b></span><span>${x.kg} kg${x.cm ? ' · ' + x.cm + ' cm' : ''}</span><span><button type="button" class="link" data-wedit="${esc(x.date)}">Edit</button><button type="button" class="link" data-wdel="${esc(x.date)}">Remove</button></span></div>`).join('')}</details>`;
  }
  function weightCard(D) {
    const ws = D.weights.filter((x) => parse(x.date) >= addDays(D.today, -90)), last = D.weights[D.weights.length - 1];
    let delta = '';
    if (ws.length >= 2) {
      const a = ws.find((x) => parse(x.date) >= addDays(D.today, -30)) || ws[0], d = last.kg - a.kg;
      delta = `<div class="stats4" style="grid-template-columns:repeat(3,1fr)"><div><b>${last.kg}</b><span>kg latest</span></div><div><b>${d > 0 ? '+' : ''}${d.toFixed(1)}</b><span>kg since ${esc(short(parse(a.date)))}</span></div><div><b>${Math.min(...ws.map((x) => x.kg))}</b><span>kg lowest (90 d)</span></div></div>`;
    }
    const stale = D.prof && ((last && Math.abs(last.kg - D.prof.weight) >= 1) || (D.goals && D.goals.basisH && D.goals.basisH !== D.prof.height));
    return `<div class="card"><div class="sectionHead" style="padding:0 0 8px"><h2>Weight</h2></div>
      <form class="wform" id="wForm"><label class="wDate"><span>Date</span><input id="wDate" type="date" min="2000-01-01" max="${esc(DB.dayKey())}" value="${esc(DB.dayKey())}"></label><input id="wIn" inputmode="decimal" placeholder="${last ? last.kg + ' kg' : 'Weight (kg)'}" aria-label="Weight in kilograms"><input id="hIn" inputmode="decimal" placeholder="${D.prof ? D.prof.height + ' cm' : 'Height (cm)'}" aria-label="Height in centimetres"><button class="primary" type="submit" id="wSave">Log today</button></form>
      <p class="status" id="wStatus" role="status"></p>
      ${weightList(D)}
      ${delta}${weightChart(ws) || `<p class="hint" style="margin:8px 0 0">${last ? 'Log your weight a few times a week to see the trend.' : 'Log your weight to start a trend line.'}</p>`}
      ${stale ? `<div class="note"><p style="margin:0">Your goals are based on ${D.goals && D.goals.basisH ? D.goals.basisH + ' cm and ' : ''}${D.prof.weight} kg. Your latest numbers are ${D.prof.height} cm and ${last ? last.kg : D.prof.weight} kg.</p><button type="button" id="recalcBtn">Recalculate goals</button></div>` : ''}</div>`;
  }
  function goalsCard(D, m) {
    const g = D.goals, p = D.prof;
    if (!g || !p) return `<div class="card"><div class="sectionHead" style="padding:0 0 8px"><h2>Your goals</h2></div><p class="hint" style="margin:0 0 10px">Tell me your age, height, weight and goal and I'll work out calories and protein.</p><button type="button" class="primary" id="editGoals" style="width:100%;justify-content:center">Set up my goals</button></div>`;
    const sug = window.Plate.calcGoals(p);
    const goalName = { lose: 'Lose weight', slow: 'Lose slowly', maintain: 'Maintain', gain: 'Build muscle' }[p.goal] || p.goal;
    return `<div class="card"><div class="sectionHead" style="padding:0 0 8px"><h2>Your goals</h2>${g.custom ? '<span class="chip">customised</span>' : ''}</div>
      <div class="stats4"><div><b>${nf(g.kcal)}</b><span>kcal / day</span></div><div><b>${g.protein} g</b><span>protein</span></div><div><b>${g.carbs} g</b><span>carbs</span></div><div><b>${g.fat} g</b><span>fat</span></div></div>
      <p class="hint" style="margin:8px 0 0">${esc(goalName)} · ${p.weight} kg · ${p.height} cm · ${p.age} y. Maintenance is about ${nf(sug.tdee)} kcal (formula estimate).</p>
      ${g.custom && (sug.kcal !== g.kcal || sug.protein !== g.protein) ? `<div class="note"><p style="margin:0">Suggested for you: ${nf(sug.kcal)} kcal and ${sug.protein} g protein.</p><button type="button" id="useSug">Use suggested</button></div>` : ''}
      ${m ? `<div class="note"><p style="margin:0"><b>Your real maintenance looks like about ${nf(r0(m.est / 50) * 50)} kcal.</b> Over the last weeks you logged about ${nf(m.intake)} kcal a day and your weight moved ${m.perWeek > 0 ? '+' : ''}${m.perWeek.toFixed(2)} kg a week (${m.weighIns} weigh-ins, ${m.days} logged days). ${Math.abs(m.est - sug.tdee) > 250 ? `That differs from the formula (${nf(sug.tdee)}), so consider adjusting your goal.` : 'That is close to the formula, so your goal looks right.'} Rough guide only: water weight and missed logging move it.</p></div>` : ''}
      <button type="button" id="editGoals" style="margin-top:10px;width:100%;justify-content:center">Edit profile and goals</button></div>`;
  }
  function streakCard(D) {
    const all = D.weeks.slice().reverse().flatMap((w) => w.days).filter((d) => !d.future);        // oldest -> today
    const last30 = all.slice(-30), logged = last30.filter((d) => d.tot).length;
    let streak = 0, i = all.length - 1;
    if (i >= 0 && !all[i].tot) i--;                                                             // today not logged yet doesn't break the streak
    for (; i >= 0 && all[i].tot; i--) streak++;
    return `<div class="card"><div class="sectionHead" style="padding:0 0 8px"><h2>Logging</h2><span class="hint">${logged} of the last ${last30.length} days</span></div>
      <div class="dots" role="img" aria-label="${logged} of the last ${last30.length} days logged">${last30.map((d) => `<i class="${d.tot ? 'on' : ''}"></i>`).join('')}</div>
      <p class="hint" style="margin:8px 0 0">${streak ? `Current streak: ${streak} day${streak > 1 ? 's' : ''}.` : 'No streak yet. Log a meal today to start one.'} The more complete your log, the better your averages and nutrition analysis.</p></div>`;
  }
  function dataCard(D) {
    const month = DB.dayKey().slice(0, 7), sum = (pred) => Object.entries(D.usage).filter(([k]) => k.startsWith(month)).reduce((a, [, t]) => a + Object.entries(t).filter(([k]) => pred(k)).reduce((x, [, n]) => x + n, 0), 0);
    const todayN = Object.values(D.usage[D.todayKey] || {}).reduce((a, b) => a + b, 0);
    const web = sum((k) => k === 'ask' || k === 'lookup');
    const days = D.lastBackup ? Math.floor((Date.now() - D.lastBackup) / 864e5) : null;
    return `<div class="card"><div class="sectionHead" style="padding:0 0 8px"><h2>Backup &amp; usage</h2></div>
      <p class="hint" style="margin:0 0 10px">Your data lives only on this phone. ${D.lastBackup ? `Last backup: ${days === 0 ? 'today' : days + ' day' + (days > 1 ? 's' : '') + ' ago'}.` : 'No backup yet.'}${days === null || days > 14 ? ' Time for a fresh one.' : ''}</p>
      <div class="actions"><button type="button" class="primary" id="expBtn">Back up now</button><button type="button" id="impBtn">Restore from file</button></div>
      <p class="status" id="dStatus" role="status"></p>
      <p class="hint" style="margin:8px 0 0">Requests from this phone: ${todayN} today, ${sum(() => true)} this month. Web searches this month: ${web} of 1,000 free. The backup holds your meals, recipes, weights and settings, but not your passphrase.</p></div>`;
  }

  async function render() {
    const D = await load();
    $('#insBody').innerHTML = weekCard(D) + prevCard(D) + weightCard(D) + goalsCard(D, maintenance(D)) + streakCard(D) + dataCard(D);
  }

  /* ---------- actions ---------- */
  const status = (id, msg, bad) => { const el = $(id); if (el) { el.textContent = msg; el.className = 'status' + (bad ? ' bad' : ' ok'); } };
  $('#insBody').addEventListener('click', async (e) => {
    const rd = e.target.closest('[data-read]');
    if (rd) { const box = rd.closest('.chart') || rd.closest('svg').parentElement; const out = box.querySelector('.readout'); if (out) out.textContent = rd.dataset.read; $$('.dbar', box).forEach((b) => b.classList.toggle('sel', b === rd)); return; }
    const id = (e.target.closest('button') || {}).id;
    if (id === 'editGoals') window.Plate.openGoals();
    if (id === 'useSug') { const p = await DB.get('profile'), c = window.Plate.calcGoals(p); await DB.set('goals', { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, bmr: c.bmr, tdee: c.tdee, custom: false, mode: 'inout', basisH: p.height }); window.Plate.refreshToday(); render(); }
    if (id === 'recalcBtn') {
      const g = await DB.get('goals'), p = await DB.get('profile'), last = (await DB.allWeights()).pop();
      if (g && g.custom && armed !== 'recalc') { armed = 'recalc'; e.target.textContent = 'Tap again: this replaces your customised goals'; return; }
      armed = ''; if (last) p.weight = last.kg; const c = window.Plate.calcGoals(p);
      await DB.set('profile', p); await DB.set('goals', { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, bmr: c.bmr, tdee: c.tdee, custom: false, mode: 'inout', basisH: p.height });
      window.Plate.refreshToday(); render();
    }
    if (id === 'expBtn') exportData();
    if (id === 'impBtn') $('#insFile').click();
  });
  const wDay = () => ($('#wDate') && $('#wDate').value) || DB.dayKey();
  $('#insBody').addEventListener('change', async (e) => {
    if (e.target.id !== 'wDate') return;                      // picking a day shows what is already logged for it
    const day = e.target.value, rows = await DB.allWeights(), hit = rows.find((x) => x.date === day);
    $('#wIn').value = hit ? hit.kg : ''; $('#hIn').value = hit && hit.cm ? hit.cm : '';
    $('#wSave').textContent = day === DB.dayKey() ? 'Log today' : 'Save for this day';
    status('#wStatus', hit ? 'Editing the entry from ' + day + '.' : '');
  });
  $('#insBody').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-wedit]'), del = e.target.closest('[data-wdel]');
    if (ed) {
      const day = ed.dataset.wedit, hit = (await DB.allWeights()).find((x) => x.date === day); if (!hit) return;
      $('#wDate').value = day; $('#wIn').value = hit.kg; $('#hIn').value = hit.cm || '';
      $('#wSave').textContent = day === DB.dayKey() ? 'Log today' : 'Save for this day'; $('#wIn').focus(); status('#wStatus', 'Editing the entry from ' + day + '.');
    }
    if (del) {
      const day = del.dataset.wdel, gone = (await DB.allWeights()).find((x) => x.date === day); if (!gone) return;
      await DB.deleteWeight(day); render(); window.Plate.refreshToday();
      window.Plate.toast('Entry removed', 'Undo', async () => { await DB.setWeight(gone.date, gone.kg, gone.cm); render(); window.Plate.refreshToday(); });
    }
  });
  $('#insBody').addEventListener('submit', async (e) => {
    if (e.target.id !== 'wForm') return;
    e.preventDefault();
    const num = (id) => parseFloat(String($(id).value).replace(',', '.')), v = num('#wIn'), h = num('#hIn'), day = wDay(), today = DB.dayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) { status('#wStatus', 'Pick a day that is today or earlier.', true); return; }
    if (!isNaN(v) && !(v >= 30 && v <= 250)) { status('#wStatus', 'Enter your weight in kg, between 30 and 250.', true); return; }
    if (!isNaN(h) && !(h >= 120 && h <= 230)) { status('#wStatus', 'Enter your height in cm, between 120 and 230.', true); return; }
    if (isNaN(v) && isNaN(h)) { status('#wStatus', 'Enter your weight, your height, or both.', true); return; }
    const rows = await DB.allWeights(), prev = rows.find((x) => x.date === day), latest = rows.length ? rows[rows.length - 1].date : '';
    const kg = !isNaN(v) ? Math.round(v * 10) / 10 : prev ? prev.kg : null, cm = !isNaN(h) ? Math.round(h * 10) / 10 : prev && prev.cm ? prev.cm : 0;
    if (kg == null && day !== today) { status('#wStatus', 'Add a weight for that day too, so there is an entry to attach the height to.', true); return; }
    if (kg != null) await DB.setWeight(day, kg, cm);
    // the profile (and so your goals) follows your newest numbers only; editing an old day changes the history, not today's targets
    if (day >= latest || day === today) {
      const p = await DB.get('profile', null);
      if (p && !isNaN(h)) { p.height = Math.round(h * 10) / 10; await DB.set('profile', p); }
    }
    status('#wStatus', day === today ? 'Saved.' : 'Saved for ' + day + '.');
    render(); window.Plate.refreshToday();
  });

  async function exportData() {
    try {
      const dump = await DB.exportAll();
      dump.kv = (dump.kv || []).filter((r) => r.key !== 'passphrase');                       // never put your passphrase in a file
      const name = `plate-backup-${DB.dayKey()}.json`, file = new File([JSON.stringify(dump)], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Plate backup' }); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      await DB.set('lastBackup', Date.now()); status('#dStatus', 'Backup ready. Save it to Files or iCloud Drive.'); setTimeout(render, 1500);
    } catch (err) { if (err && err.name !== 'AbortError') status('#dStatus', 'Could not create the backup: ' + err.message, true); }
  }
  $('#insFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      if (!dump || dump.app !== 'plate') throw new Error('This is not a Plate backup file.');
      dump.kv = (dump.kv || []).filter((r) => r.key !== 'passphrase');
      await DB.importAll(dump); window.Plate.refreshToday(); await render();
      status('#dStatus', `Restored ${(dump.meals || []).length} meals, ${(dump.recipes || []).length} recipes and ${(dump.weights || []).length} weights. Matching entries were overwritten; nothing was deleted.`);
    } catch (err) { status('#dStatus', err.message, true); }
  });
  $('#goalsDlg').addEventListener('close', () => { if (!$('#view-insights').hidden) render(); });

  window.Plate.hooks.insights = render;
  if (!$('#view-insights').hidden) render();
})();
