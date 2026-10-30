/* Plate: profile + daily goals. Pure maths, no AI.
   BMR: Mifflin-St Jeor. TDEE = BMR x activity. Goal shifts calories; protein is g per kg of body weight. */
(function () {
  'use strict';
  const { $ } = window.Plate;
  const ACTIVITY = { sedentary: 1.2, light: 1.3, moderate: 1.4, very: 1.5 };    // daily life only: logged workouts are added on top
  const GOAL = {            // kcal change vs maintenance, protein g/kg
    lose:     { delta: -500, protein: 2.0 },
    slow:     { delta: -250, protein: 1.8 },
    maintain: { delta: 0,    protein: 1.6 },
    gain:     { delta: 300,  protein: 1.8 },
  };
  const round = (v, step) => Math.round(v / step) * step;

  function calc(p) {
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
    const tdee = bmr * (ACTIVITY[p.activity] || 1.375);
    const g = GOAL[p.goal] || GOAL.maintain;
    const floor = p.sex === 'male' ? 1500 : 1200;
    const kcal = Math.max(floor, round(tdee + g.delta, 10));
    const protein = round(g.protein * p.weight, 5);
    const fat = round(0.25 * kcal / 9, 5);
    const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4, 5));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, fat, carbs, floored: kcal === floor && tdee + g.delta < floor };
  }

  const dlg = $('#goalsDlg');
  let touched = { kcal: false, protein: false };

  const read = () => ({
    sex: $('#gSex').value, birth: $('#gBirth').value, age: DB.ageFrom($('#gBirth').value), height: parseFloat($('#gHeight').value),
    weight: parseFloat($('#gWeight').value), activity: $('#gActivity').value, goal: $('#gGoal').value,
  });
  const valid = (p) => p.age >= 14 && p.age <= 100 && p.height >= 120 && p.height <= 230 && p.weight >= 30 && p.weight <= 250;

  function preview() {
    const p = read(), box = $('#gPreview'); $('#gAgeNote').textContent = p.age >= 0 ? '· ' + p.age + ' years' : '';
    if (!valid(p)) { box.innerHTML = '<span class="hint">Fill in your details to see your suggested goals.</span>'; $('#saveGoals').disabled = true; return; }
    const c = calc(p);
    if (!touched.kcal) $('#gKcal').value = c.kcal;
    if (!touched.protein) $('#gProtein').value = c.protein;
    box.innerHTML = `<div><b>${c.kcal}</b><span>kcal / day</span></div><div><b>${c.protein} g</b><span>protein</span></div>` +
      `<div><b>${c.carbs} g</b><span>carbs</span></div><div><b>${c.fat} g</b><span>fat</span></div>` +
      `<p class="hint wide">Without workouts you burn about ${c.tdee} kcal a day (resting burn ${c.bmr}). Logged workouts add to your budget for that day.${c.floored ? ' Raised to a safe minimum.' : ''}</p>`;
    $('#saveGoals').disabled = false;
  }
  ['gSex', 'gBirth', 'gHeight', 'gWeight', 'gActivity', 'gGoal'].forEach((id) => $('#' + id).addEventListener('input', preview));
  $('#gKcal').addEventListener('input', () => { touched.kcal = true; });
  $('#gProtein').addEventListener('input', () => { touched.protein = true; });
  $('#resetGoals').addEventListener('click', () => { touched = { kcal: false, protein: false }; preview(); });

  async function open(first) {
    const prof = await DB.get('profile', null), goals = await DB.get('goals', null);
    touched = { kcal: false, protein: false };
    if (prof) {
      $('#gSex').value = prof.sex; $('#gBirth').value = prof.birth || ''; $('#gHeight').value = prof.height;
      $('#gWeight').value = prof.weight; $('#gActivity').value = prof.activity; $('#gGoal').value = prof.goal;
    }
    $('#goalsTitle').textContent = first ? 'Welcome. Set your goals' : 'Profile and goals';
    $('#goalsIntro').hidden = !first;
    preview();
    if (goals && prof) {
      const c = calc(prof);
      if (goals.kcal !== c.kcal) { $('#gKcal').value = goals.kcal; touched.kcal = true; }
      if (goals.protein !== c.protein) { $('#gProtein').value = goals.protein; touched.protein = true; }
    }
    $('#skipGoals').hidden = !first;
    if (!dlg.open) dlg.showModal();
  }

  $('#goalsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = read(); if (!valid(p)) return;
    const c = calc(p);
    const kcal = Math.round(parseFloat($('#gKcal').value)) || c.kcal;
    const protein = Math.round(parseFloat($('#gProtein').value)) || c.protein;
    const fat = round(0.25 * kcal / 9, 5), carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4, 5));
    await DB.set('profile', p);
    await DB.set('goals', { kcal, protein, carbs, fat, bmr: c.bmr, tdee: c.tdee, custom: kcal !== c.kcal || protein !== c.protein, mode: 'inout', basisH: p.height });
    await DB.setWeight(DB.dayKey(), p.weight);
    dlg.close(); window.Plate.refreshToday();
  });
  $('#skipGoals').addEventListener('click', async () => { await DB.set('goalsSkipped', true); dlg.close(); });
  $('#closeGoals').addEventListener('click', () => dlg.close());

  window.Plate.openGoals = () => open(false);
  $('#kcalGoal').addEventListener('click', () => open(false));
  $('#editGoalsBtn').addEventListener('click', () => { $('#settingsDlg').close(); open(false); });

  // first run: ask once
  /* ... but only once you are signed in and your account's data has arrived (it may already hold your profile) */
  (async () => {
    await window.Plate.regionFlow;
    if (!(await Auth.ready)) await new Promise((r) => window.addEventListener('plate-auth', r, { once: true }));
    await new Promise((r) => { const t = setTimeout(r, 4000); window.addEventListener('plate-sync', () => { clearTimeout(t); r(); }, { once: true }); });
    if (!(await DB.get('profile', null)) && !(await DB.get('goalsSkipped', false))) open(true);
  })();

  /* one-time move to calories in/out: the saved goal now means "daily budget before workouts" */
  (async () => {
    const gl = await DB.get('goals', null), pr = await DB.get('profile', null);
    if (!gl || !pr || gl.mode === 'inout') return;
    const c = calc(pr);
    await DB.set('goals', gl.custom ? Object.assign({}, gl, { bmr: c.bmr, tdee: c.tdee, mode: 'inout' }) : { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, bmr: c.bmr, tdee: c.tdee, custom: false, mode: 'inout' });
    if (window.Plate.refreshToday) window.Plate.refreshToday();
  })();

  window.Plate.calcGoals = calc;
  /* a newer weight or height logged anywhere: the profile follows it, and so do the daily targets unless you set your own */
  window.Plate.syncBody = async (kg, cm) => {
    const p = await DB.get('profile', null); if (!p) return false;
    let ch = false;
    if (kg >= 30 && kg <= 250 && p.weight !== kg) { p.weight = kg; ch = true; }
    if (cm >= 120 && cm <= 230 && p.height !== cm) { p.height = cm; ch = true; }
    if (!ch) return false;
    await DB.set('profile', p);
    const gl = await DB.get('goals', null);
    if (gl && !gl.custom && valid(p)) { const c = calc(p); await DB.set('goals', Object.assign({}, gl, { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, bmr: c.bmr, tdee: c.tdee, basisH: p.height })); }
    return true;
  };
})();
