/* Plate extras, taken from what the best trackers do and this app lacked:
   1. Log again: one tap to re-log a meal you eat often (speed is what makes people keep logging).
   2. Smart target: your real maintenance calories worked out from what you ate and how your weight moved (the idea behind MacroFactor).
   3. Gym tools: a plate calculator and a warm-up ramp (Strong and Hevy lock these behind paid plans).
   4. Fasting timer: optional, switched on in Settings.
   Everything here is plain arithmetic on data already on the phone. */
(function () {
  'use strict';
  const { $, esc } = window.Plate;
  const FXp = (n, h) => { try { window.FX && FX.play(n); if (h) FX.haptic(h); } catch (e) {} };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const dkey = (daysAgo) => DB.dayKey(new Date(Date.now() - daysAgo * 864e5));
  const r0 = Math.round;

  /* ============================== 1. Log again ============================== */
  function mountQuick() {
    const form = $('#waterCard'); if (!form || $('#quickCard')) return;
    const s = document.createElement('section'); s.id = 'quickCard'; s.className = 'quick'; s.hidden = true;
    s.innerHTML = '<div class="sectionHead" style="padding:0 2px"><h2>Log again</h2><span class="hint">One tap</span></div><div class="qchips" id="qChips"></div>';
    form.parentNode.insertBefore(s, form);
    s.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-qm]'); if (!b) return;
      const m = quickList[+b.dataset.qm]; if (!m) return;
      const vd = window.Plate.viewDay ? window.Plate.viewDay() : DB.dayKey(), c = Object.assign({}, m);
      delete c.id; c.date = vd; c.ts = Date.now();
      if (vd !== DB.dayKey()) { const n = new Date(), [y, mo, d] = vd.split('-').map(Number); c.ts = new Date(y, mo - 1, d, n.getHours(), n.getMinutes()).getTime(); }
      const meal = await DB.addMeal(c);
      FXp('success', 10); window.Plate.refreshToday();
      window.Plate.toast('Added ' + String(meal.name).slice(0, 40), 'Undo', async () => { await DB.deleteMeal(meal.id); window.Plate.refreshToday(); FXp('undo'); });
    });
  }
  let quickList = [];
  async function drawQuick() {
    const el = $('#quickCard'); if (!el) return;
    const meals = await DB.mealsBetween(dkey(30), DB.dayKey()), by = {};
    meals.forEach((m) => { if (!(m.kcal > 0)) return; const k = norm(m.name); if (!k) return; const e = by[k] || (by[k] = { n: 0, last: m, ts: 0 }); e.n++; if (m.ts >= e.ts) { e.ts = m.ts; e.last = m; } });
    const today = DB.dayKey(), have = new Set(meals.filter((m) => m.date === today).map((m) => norm(m.name)));
    quickList = Object.keys(by).filter((k) => !have.has(k)).map((k) => ({ m: by[k].last, s: by[k].n * 3 + by[k].ts / 864e5 / 30 })).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.m);
    el.hidden = quickList.length === 0;
    $('#qChips').innerHTML = quickList.map((m, i) => `<button type="button" data-qm="${i}"><b>${esc(String(m.name).slice(0, 28))}</b><small>${r0(m.kcal)} kcal</small></button>`).join('');
  }

  /* ============================== 2. Smart target ============================== */
  async function smart() {
    const view = $('#view-insights'); if (!view) return;
    let card = $('#smartCard');
    if (!card) { card = document.createElement('div'); card.id = 'smartCard'; card.className = 'card smart'; view.insertBefore(card, view.firstChild); }
    card.hidden = true;
    const goals = await DB.get('goals', null); if (!goals || !goals.kcal) return;
    const hide = await DB.get('smartHide', ''); if (hide && hide > dkey(7)) return;
    const from = dkey(28), to = dkey(1), meals = await DB.mealsBetween(from, to), per = {};
    meals.forEach((m) => { per[m.date] = (per[m.date] || 0) + (m.kcal || 0); });
    const days = Object.keys(per).filter((d) => per[d] >= 800).sort();
    const ws = (await DB.allWeights()).filter((w) => w.date >= dkey(35) && w.kg > 0);
    if (days.length < 10 || ws.length < 3) return;
    const t0 = new Date(ws[0].date + 'T12:00:00').getTime(), pts = ws.map((w) => [(new Date(w.date + 'T12:00:00').getTime() - t0) / 864e5, w.kg]);
    const span = pts[pts.length - 1][0] - pts[0][0]; if (span < 10) return;
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    if (!sxx) return; const slope = sxy / sxx;                                   // kg per day
    const intake = days.reduce((a, d) => a + per[d], 0) / days.length;
    let burn = 0; for (const d of days) { try { burn += (await window.Burn.onDay(d)).kcal || 0; } catch (e) {} } burn /= days.length;
    const total = intake - slope * 7700, base = Math.max(1200, Math.min(5000, total - burn));
    const prof = await DB.get('profile', null), floor = prof && prof.sex === 'female' ? 1200 : 1500, off = goals.tdee ? goals.kcal - goals.tdee : null;
    /* change slowly (at most 300 kcal a step) and never go below a safe minimum */
    let sug = off == null ? null : Math.round((base + off) / 10) * 10;
    if (sug != null) { sug = Math.max(goals.kcal - 300, Math.min(goals.kcal + 300, sug)); sug = Math.max(Math.min(floor, goals.kcal), sug); }
    const wk = Math.round(slope * 7 * 10) / 10, dir = wk > 0.05 ? 'up' : wk < -0.05 ? 'down' : 'steady';
    const diff = sug == null ? 0 : sug - goals.kcal;
    const facts = `Over your last ${days.length} logged days you ate about <b>${r0(intake)} kcal</b> a day and your weight went ${dir}${dir === 'steady' ? '' : ' about <b>' + Math.abs(wk) + ' kg a week</b>'}. That points to a real maintenance of about <b>${r0(base)} kcal</b> a day before workouts${goals.tdee ? ` (the formula says ${r0(goals.tdee)})` : ''}.`;
    card.hidden = false;
    if (sug != null && Math.abs(diff) >= 100) {
      card.innerHTML = `<div class="sectionHead" style="padding:0 0 6px"><h2>Smart target</h2><span class="pill">Suggestion</span></div><p style="margin:0">${facts}</p>
        <p style="margin:8px 0 0">Your goal is ${goals.kcal.toLocaleString()} kcal. Based on this, <b>${sug.toLocaleString()} kcal</b> keeps the same pace you chose.</p>
        <div class="row" style="margin-top:12px"><button type="button" class="primary" id="smartUse">Use ${sug.toLocaleString()} kcal</button><button type="button" class="link" id="smartKeep">Keep mine</button></div>
        <p class="hint" style="margin:8px 0 0">An estimate from what you logged, so it works best with regular weigh-ins and honest logging.</p>`;
      card.querySelector('#smartUse').onclick = async () => { const old = goals; await DB.set('goals', Object.assign({}, goals, { kcal: sug, tdee: Math.round(base) })); FXp('success', 12); window.Plate.refreshAll(); window.Plate.toast('Goal set to ' + sug.toLocaleString() + ' kcal', 'Undo', async () => { await DB.set('goals', old); window.Plate.refreshAll(); }); };
      card.querySelector('#smartKeep').onclick = async () => { await DB.set('smartHide', DB.dayKey()); card.hidden = true; };
    } else {
      card.innerHTML = `<div class="sectionHead" style="padding:0 0 6px"><h2>Smart target</h2><span class="pill ok">On track</span></div><p style="margin:0">${facts}</p><p class="hint" style="margin:8px 0 0">Your goal already matches how your body is responding. Nothing to change.</p>`;
    }
  }
  const oldIns = window.Plate.hooks.insights;
  window.Plate.hooks.insights = async () => { if (oldIns) await oldIns(); try { await smart(); } catch (e) {} };

  /* ============================== 3. Gym tools ============================== */
  const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
  function plates(target, bar) {
    const per = (target - bar) / 2; if (per < 0) return { load: bar, left: [], short: true };
    let rem = Math.round(per * 100) / 100; const out = [];
    PLATES.forEach((p) => { while (rem + 1e-6 >= p) { out.push(p); rem = Math.round((rem - p) * 100) / 100; } });
    return { load: Math.round((target - rem * 2) * 100) / 100, left: out, extra: rem > 0.001 ? rem * 2 : 0 };
  }
  const round25 = (x) => Math.round(x / 2.5) * 2.5;
  function ramp(work, bar, reps) {
    const steps = [[bar, 10], [work * 0.5, 5], [work * 0.7, 3], [work * 0.85, 1]].map(([w, r]) => [Math.max(bar, round25(w)), r]);
    const seen = new Set(); return steps.filter(([w]) => w < work && !seen.has(w) && seen.add(w));
  }
  let tdlg = null;
  function toolsSheet() {
    if (!tdlg) {
      tdlg = document.createElement('dialog'); tdlg.id = 'gymTools'; tdlg.setAttribute('aria-label', 'Gym tools'); document.body.appendChild(tdlg);
      tdlg.innerHTML = `<div class="sheet"><div class="closeRow"><button type="button" class="link" data-t="close">Done</button></div><h2 style="margin:0">Barbell tools</h2>
        <div class="row" style="gap:10px"><label style="flex:1" class="fld"><span class="label">Target weight (kg)</span><input id="tgW" type="text" inputmode="decimal" placeholder="100"></label>
        <label style="flex:1" class="fld"><span class="label">Bar</span><select id="tgBar"><option value="20">20 kg</option><option value="15">15 kg</option><option value="10">10 kg</option></select></label></div>
        <div id="tgOut" class="toolOut"><p class="hint">Enter the weight you want on the bar.</p></div></div>`;
      const go = () => {
        const w = parseFloat(String($('#tgW').value).replace(',', '.')), bar = +$('#tgBar').value, out = $('#tgOut');
        if (!(w > 0)) { out.innerHTML = '<p class="hint">Enter the weight you want on the bar.</p>'; return; }
        if (w < bar) { out.innerHTML = `<p class="hint">That is lighter than the ${bar} kg bar.</p>`; return; }
        const p = plates(w, bar), rp = ramp(w, bar);
        const chips = p.left.length ? p.left.map((x) => `<span class="plateChip p${String(x).replace('.', '_')}">${x}</span>`).join('') : '<span class="hint">Just the bar</span>';
        out.innerHTML = `<h3 class="gh3" style="margin-top:4px">Each side</h3><div class="plates">${chips}</div>
          ${p.extra ? `<p class="hint">The smallest plate is 1.25 kg, so the closest you can load is <b>${p.load} kg</b>.</p>` : `<p class="hint">${p.load} kg total with the ${bar} kg bar.</p>`}
          <h3 class="gh3">Warm-up before ${w} kg</h3>${rp.length ? rp.map(([x, r]) => `<div class="logrow"><span>${x} kg</span><b>${r} rep${r > 1 ? 's' : ''}</b></div>`).join('') : '<p class="hint">Light enough to go straight in.</p>'}
          <p class="hint">A simple ramp: light sets that get you ready without tiring you out. Rest 1 to 2 minutes between them.</p>`;
      };
      tdlg.addEventListener('input', go);
      tdlg.addEventListener('click', (e) => { if (e.target === tdlg || e.target.closest('[data-t="close"]')) tdlg.close(); });
    }
    tdlg.showModal(); setTimeout(() => $('#tgW').focus(), 250);
  }
  function mountTools() {
    const v = $('#view-gym'); if (!v || $('#toolsBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'toolsBtn'; b.className = 'toolsBtn';
    b.innerHTML = '<span class="ri" style="--c:#8b7cff"><svg viewBox="0 0 24 24"><path d="M6.500 6.500v11M17.500 6.500v11M3 9v6M21 9v6M6.500 12h11"/></svg></span><span class="rl"><b>Plate calculator</b><small>What to load on the bar, plus a warm-up ramp</small></span>';
    const segs = v.querySelector('.segs'); segs.insertAdjacentElement('afterend', b); b.addEventListener('click', toolsSheet);
  }

  /* ============================== 4. Fasting timer (optional) ============================== */
  const FAST_ON = () => { try { return localStorage.getItem('plate.fast') === '1'; } catch (e) { return false; } };
  let fastT = 0, fastDone = false;
  const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 6e4)); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
  async function drawFast() {
    let c = $('#fastCard');
    if (!FAST_ON()) { if (c) c.hidden = true; clearInterval(fastT); return; }
    if (!c) { c = document.createElement('div'); c.id = 'fastCard'; c.className = 'card fast'; const w = $('#waterCard'); w.insertAdjacentElement('afterend', c); c.addEventListener('click', onFast); }
    c.hidden = false;
    const f = await DB.get('fast', null), log = ((await DB.get('fastLog', [])) || []);
    if (!f) {
      clearInterval(fastT);
      const last = log[log.length - 1];
      c.innerHTML = `<div class="sectionHead" style="padding:0 0 8px"><h2>Fasting</h2>${last ? `<span class="hint">Last: ${hm(last.end - last.start)}</span>` : ''}</div>
        <div class="fastPick">${[12, 14, 16, 18, 20].map((h) => `<button type="button" data-fh="${h}" class="${h === 16 ? 'on' : ''}">${h}h</button>`).join('')}</div>
        <button type="button" class="primary" data-fstart style="width:100%;margin-top:10px">Start fast</button>`;
      return;
    }
    const tick = () => {
      const el = Date.now() - f.start, goal = f.hours * 36e5, pct = Math.min(1, el / goal), done = el >= goal;
      const t = $('#fastTime'); if (!t) return;
      t.textContent = hm(el); $('#fastFill').style.width = pct * 100 + '%';
      $('#fastSub').textContent = done ? 'Goal reached. You can eat whenever you like.' : hm(goal - el) + ' to go · ends ' + new Date(f.start + goal).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (done && !fastDone) { fastDone = true; FXp('cheer', [20, 40, 20]); try { FX.confetti('burst'); } catch (e) {} }
    };
    fastDone = Date.now() - f.start >= f.hours * 36e5;
    c.innerHTML = `<div class="sectionHead" style="padding:0 0 4px"><h2>Fasting</h2><span class="pill">${f.hours}h fast</span></div>
      <div class="fastBig" id="fastTime">0h 00m</div><div class="fastBar"><i id="fastFill"></i></div><p class="hint" id="fastSub" style="margin:6px 0 10px"></p>
      <button type="button" class="primary" data-fend style="width:100%">End fast</button>`;
    tick(); clearInterval(fastT); fastT = setInterval(tick, 30000);
  }
  let fastHours = 16;
  async function onFast(e) {
    const h = e.target.closest('[data-fh]');
    if (h) { fastHours = +h.dataset.fh; e.currentTarget.querySelectorAll('[data-fh]').forEach((b) => b.classList.toggle('on', b === h)); FXp('tap'); return; }
    if (e.target.closest('[data-fstart]')) { await DB.set('fast', { start: Date.now(), hours: fastHours }); FXp('success', 12); drawFast(); return; }
    if (e.target.closest('[data-fend]')) {
      const f = await DB.get('fast', null); if (!f) return;
      const log = ((await DB.get('fastLog', [])) || []).concat([{ start: f.start, end: Date.now(), hours: f.hours }]).slice(-60);
      await DB.set('fastLog', log); await DB.set('fast', null); FXp('pop', 8); drawFast();
      window.Plate.toast('Fast ended: ' + hm(Date.now() - f.start));
    }
  }
  function mountFastSetting() {
    const f = $('#settingsForm'); if (!f || $('#fastSw')) return;
    const anchor = Array.from(f.querySelectorAll('h2.h2s')).find((h) => /^Data/.test(h.textContent)); if (!anchor) return;
    const h = document.createElement('h2'); h.className = 'h2s'; h.textContent = 'Features';
    const g = document.createElement('div'); g.className = 'group';
    g.innerHTML = '<label class="rowBtn static"><span class="ri" style="--c:#ffb23e"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg></span><span class="rl"><b>Fasting timer</b><small>Adds a fasting card to Today</small></span><input type="checkbox" class="switch" id="fastSw"></label>';
    anchor.parentNode.insertBefore(h, anchor); anchor.parentNode.insertBefore(g, anchor);
    const sw = g.querySelector('#fastSw'); sw.checked = FAST_ON();
    sw.addEventListener('change', () => { try { localStorage.setItem('plate.fast', sw.checked ? '1' : '0'); } catch (e) {} FXp('tap', 6); drawFast(); });
  }

  /* ============================== wiring ============================== */
  function boot() {
    mountQuick(); mountTools(); mountFastSetting();
    drawQuick(); drawFast();
    const hl = $('#historyList'); if (hl) new MutationObserver(() => drawQuick()).observe(hl, { childList: true });
    document.addEventListener('click', (e) => { if (e.target.closest('.dock, #dayPrev, #dayNext')) setTimeout(() => { drawQuick(); drawFast(); }, 150); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) drawFast(); });
  }
  boot();
  window.Extras = { plates, ramp, drawQuick, smart, drawFast };
})();
