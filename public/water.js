/* Plate Water: the animated bottle on Today.
   The level rises with every drink (waves, bubbles, a splash and a bubble sound), reaching the goal rings a cheer with confetti, and the
   last seven days and the streak sit under it. Storage keeps the same shape as before (a total per day in "water:<day>", which the reminders
   server also reads) plus a small list of drinks per day, so "Undo" takes back exactly the last drink. */
(function () {
  'use strict';
  const { $, esc } = window.Plate;
  const nf = (n) => Math.round(n).toLocaleString();
  const STEP = 250, MIN = 1000, MAX = 6000, FALLBACK = 2500;
  let built = false, shown = null, goal = FALLBACK, first = true;

  /* the path of a wave: period 120, so sliding it 120px loops with no seam */
  function wave(amp, phase) {
    let p = 'M-120 0';
    for (let x = -120; x <= 480; x += 10) p += ' L' + x + ' ' + (amp * Math.sin((x + phase) / 120 * 2 * Math.PI)).toFixed(2);
    return p + ' L480 440 L-120 440 Z';
  }
  const BOTTLE = 'M96 18H144V50C144 66 190 78 190 118V336C190 366 170 384 140 384H100C70 384 50 366 50 336V118C50 78 96 66 96 50Z';

  async function goalMl() {
    const g = await DB.get('waterGoal', null);
    if (g && g.ml >= MIN) return Math.round(g.ml);
    let kg = 0; try { kg = window.Burn ? await Burn.weightKg() : 0; } catch (e) {}
    return kg >= 30 ? Math.max(1500, Math.min(4500, Math.round(kg * 35 / STEP) * STEP)) : FALLBACK;
  }
  const totalOf = async (day) => (await DB.get('water:' + day, 0)) || 0;

  function build() {
    const card = $('#waterCard'); if (!card) return false;
    card.innerHTML = `
      <div class="wHero">
        <div class="bottle" id="wBottle">
          <svg viewBox="0 0 240 400" role="img" aria-label="Water bottle showing today's progress">
            <defs>
              <clipPath id="wClip"><path d="${BOTTLE}"/></clipPath>
              <linearGradient id="wGa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38c6f4"/><stop offset="1" stop-color="#1273d2"/></linearGradient>
              <linearGradient id="wGb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd4ff" stop-opacity=".55"/><stop offset="1" stop-color="#1d8fe8" stop-opacity=".35"/></linearGradient>
              <linearGradient id="wGlass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
            </defs>
            <rect x="92" y="4" width="56" height="16" rx="5" class="wCap"/>
            <path d="${BOTTLE}" class="wBody"/>
            <g clip-path="url(#wClip)">
              <g id="wLevel" style="transform:translateY(392px)">
                <g class="w2"><path d="${wave(9, 45)}" fill="url(#wGb)"/></g>
                <g class="w1"><path d="${wave(7, 0)}" fill="url(#wGa)"/></g>
                <circle class="bub" cx="88" cy="300" r="4" style="animation-delay:0s"/><circle class="bub" cx="130" cy="320" r="3" style="animation-delay:1.7s"/>
                <circle class="bub" cx="160" cy="290" r="5" style="animation-delay:3.1s"/><circle class="bub" cx="110" cy="330" r="2.5" style="animation-delay:4.4s"/>
              </g>
              <rect x="50" y="18" width="140" height="370" fill="url(#wGlass)"/>
            </g>
            <path d="${BOTTLE}" class="wEdge"/><path d="M68 130V320" class="wShine"/>
          </svg>
          <div class="readout"><b id="wPct">0</b><span>%</span></div>
        </div>
        <div class="wSide">
          <div class="wHead"><h2>Water</h2><span class="streak" id="wStreak" title="Days in a row you reached your goal"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.4-2-1-3 3 1 5 4 5 7a7 7 0 0 1-14 0c0-6 6-7 7-13z"/></svg><i id="wStreakN">0</i></span></div>
          <div class="wBig"><b id="wMl">0</b><span id="wOf">/ 2,500 ml</span></div>
          <p class="wTogo" id="wTogo"></p>
          <div class="wChips">
            <button type="button" class="wChip" data-water="100" data-silent><svg viewBox="0 0 24 24"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg>+100<small>sip</small></button>
            <button type="button" class="wChip" data-water="250" data-silent><svg viewBox="0 0 24 24"><path d="M6 4h12l-1.400 15a2 2 0 0 1-2 1.800H9.400a2 2 0 0 1-2-1.800z"/></svg>+250<small>glass</small></button>
            <button type="button" class="wChip" data-water="500" data-silent><svg viewBox="0 0 24 24"><path d="M10 2h4v3c0 1 3 2 3 5v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10c0-3 3-4 3-5z"/></svg>+500<small>bottle</small></button>
            <button type="button" class="wChip" id="wOther" aria-expanded="false" data-silent><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Other<small>amount</small></button>
          </div>
        </div>
      </div>
      <form class="wCustom" id="wCustom" hidden><input id="wCustomMl" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Amount in ml" aria-label="Amount in millilitres"><button type="submit" class="primary">Add</button></form>
      <div class="wFoot"><div class="wWeek" id="wWeek" aria-label="Last 7 days"></div><button type="button" class="link" id="wUndo" data-silent>Undo last</button></div>`;
    card.addEventListener('click', onClick);
    $('#wCustom').addEventListener('submit', (e) => { e.preventDefault(); const v = parseInt($('#wCustomMl').value.replace(/\D/g, ''), 10); if (v >= 10 && v <= 3000) { add(v); $('#wCustomMl').value = ''; $('#wCustom').hidden = true; $('#wOther').setAttribute('aria-expanded', 'false'); } else { FX.play('error'); } });
    return true;
  }

  function onClick(e) {
    const c = e.target.closest('[data-water]'); if (c) { add(parseInt(c.dataset.water, 10)); return; }
    if (e.target.closest('#wOther')) { const f = $('#wCustom'); f.hidden = !f.hidden; $('#wOther').setAttribute('aria-expanded', String(!f.hidden)); FX.tap(); if (!f.hidden) $('#wCustomMl').focus(); return; }
    if (e.target.closest('#wUndo')) undo();
  }

  /* a drink: update the stored total and the day's list, then splash */
  async function add(ml) {
    FX.play(ml <= 150 ? 'drop1' : ml <= 300 ? 'drop2' : 'drop3');                    // instantly, before any saving, so the tap feels immediate
    const day = shown || DB.dayKey(), before = await totalOf(day), after = before + ml;
    await DB.set('water:' + day, after);
    const L = (await DB.get('waterLog:' + day, [])) || []; L.push({ t: Date.now(), ml }); await DB.set('waterLog:' + day, L.slice(-80));
    const hit = before < goal && after >= goal;
    if (hit) FX.play('cheer'); FX.haptic(hit ? [40, 60, 40, 60, 140] : 12);
    if (hit) { FX.confetti('drops'); FX.confetti('burst'); }
    await draw(day); splash(hit);
  }
  async function undo() {
    const day = shown || DB.dayKey(), total = await totalOf(day); if (total <= 0) { FX.play('error'); return; }
    const L = (await DB.get('waterLog:' + day, [])) || [], last = L.pop(), ml = last ? last.ml : Math.min(STEP, total);
    await DB.set('water:' + day, Math.max(0, total - ml)); await DB.set('waterLog:' + day, L);
    FX.play('undo'); FX.haptic(10); await draw(day);
  }
  function splash(big) {
    const b = $('#wBottle'); if (!b || FX.reduced()) return;
    b.classList.remove('splash', 'party'); void b.offsetWidth; b.classList.add(big ? 'party' : 'splash');
  }

  async function streakOf(today) {
    let n = 0; const d = new Date();
    if ((await totalOf(DB.dayKey(d))) < goal) d.setDate(d.getDate() - 1);
    while (n < 400 && (await totalOf(DB.dayKey(d))) >= goal) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  async function draw(day) {
    if (!built) built = build(); if (!built) return;
    shown = day; goal = await goalMl();
    const t = await totalOf(day), f = Math.min(t / goal, 1), lvl = $('#wLevel');
    const apply = () => { lvl.style.transform = 'translateY(' + (f === 0 ? 392 : 384 - f * 322) + 'px)'; };
    if (first) { first = false; requestAnimationFrame(() => requestAnimationFrame(apply)); } else apply();     // the bottle fills up the first time you open the app
    $('#wPct').textContent = Math.round(t / goal * 100);
    $('#wMl').textContent = nf(t); $('#wOf').textContent = '/ ' + nf(goal) + ' ml';
    $('#wBottle').classList.toggle('done', t >= goal);
    const left = goal - t; $('#wTogo').innerHTML = left > 0 ? '<b>' + nf(left) + ' ml</b> to go' : '<b>Goal reached.</b> Nice work.';
    const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const vals = await Promise.all(days.map((d) => totalOf(DB.dayKey(d))));
    $('#wWeek').innerHTML = days.map((d, i) => `<div class="wDay${vals[i] >= goal ? ' hit' : ''}${DB.dayKey(d) === day ? ' on' : ''}" title="${nf(vals[i])} ml"><div class="wBar"><i style="height:${Math.min(100, vals[i] / goal * 100)}%"></i></div><span>${d.toLocaleDateString([], { weekday: 'narrow' })}</span></div>`).join('');
    const n = await streakOf(); $('#wStreakN').textContent = n; $('#wStreak').classList.toggle('on', n > 0);
    $('#wUndo').disabled = t <= 0;
  }

  /* the daily goal row in Settings */
  let known = null;
  async function drawGoalRow() {
    const g = await DB.get('waterGoal', null), ml = await goalMl();
    known = ml; $('#wgVal').textContent = nf(ml); $('#wgNote').textContent = g && g.ml ? 'Your own goal' : 'Suggested from your weight (35 ml per kg)';
  }
  /* the goal buttons answer at once: the number changes on touch, the save and the redraw of the water card happen a moment later (and only once if you tap several times) */
  let cur = null, saveT = 0;
  async function bump(dir) {
    if (cur == null) cur = known != null ? known : await goalMl();
    cur = Math.max(MIN, Math.min(MAX, cur + dir * STEP));
    $('#wgVal').textContent = nf(cur); $('#wgNote').textContent = 'Your own goal'; FX.play('tick'); FX.haptic(6);
    clearTimeout(saveT);
    saveT = setTimeout(async () => { const ml = cur; await DB.set('waterGoal', { ml }); cur = null; requestAnimationFrame(() => { if (shown) draw(shown); }); }, 450);
  }
  const quick = (el, fn) => { let at = 0; el.addEventListener('pointerdown', (e) => { if (e.button > 0 || !e.isPrimary) return; at = performance.now(); fn(); }); el.addEventListener('click', () => { if (performance.now() - at > 800) fn(); }); };
  quick($('#wgMinus'), () => bump(-1)); quick($('#wgPlus'), () => bump(1));

  draw(window.Plate.viewDay ? window.Plate.viewDay() : DB.dayKey()).catch(() => {});
  window.Water = { render: (day) => draw(day || DB.dayKey()), drawGoalRow, total: totalOf, goal: goalMl };
})();
