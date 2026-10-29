/* Plate app shell: tab routing, settings, and the Today summary. Feature tabs plug in below. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TABS = ['today', 'recipes', 'nutrition', 'gym', 'insights'];
  const hooks = {};                       // tab name -> function called when the tab opens
  /* A small bar at the bottom with one action, used for "Undo". One at a time; it fades after a few seconds. */
  let toastEl = null, toastT = null;
  function toast(msg, label, fn, ms) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    clearTimeout(toastT);
    toastEl.innerHTML = '<span></span>' + (label ? '<button type="button"></button>' : '');
    toastEl.firstChild.textContent = msg;
    if (label) { const b = toastEl.querySelector('button'); b.textContent = label; b.onclick = () => { clearTimeout(toastT); toastEl.classList.remove('on'); try { fn && fn(); } catch (e) {} }; }
    requestAnimationFrame(() => toastEl.classList.add('on'));
    toastT = setTimeout(() => toastEl.classList.remove('on'), ms || 7000);
  }
  window.Plate = { $, $$, esc, hooks, toast, refreshToday: () => renderToday(), refreshAll: () => { renderToday(); const t = TABS.find((x) => !$('#view-' + x).hidden); if (t && hooks[t]) hooks[t](); } };

  /* ---------- tabs ---------- */
  function showTab(name, remember) {
    if (!TABS.includes(name)) name = 'today';
    $$('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    TABS.forEach((t) => { $('#view-' + t).hidden = t !== name; });
    if (remember !== false) { try { localStorage.setItem('plate.tab', name); } catch (e) {} }
    if (hooks[name]) hooks[name]();
    window.scrollTo(0, 0);
  }
  $$('[role="tab"]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('.tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(document.activeElement.dataset && document.activeElement.dataset.tab);
    if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    $('#tab-' + n).focus(); showTab(n);
  });

  /* ---------- today ---------- */
  const CIRC = 314.16, WATER_GOAL = 2500;
  let viewKey = null;                                   // null = follow today
  const curDay = () => viewKey || DB.dayKey();
  window.Plate.viewDay = curDay;
  const pd = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const nfmt = (v) => Math.round(v).toLocaleString();
  function dayLabels(k) {
    const t = DB.dayKey(), y = DB.dayKey(new Date(Date.now() - 864e5));
    const d = pd(k), date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return k === t ? ['Today', date] : k === y ? ['Yesterday', date] : [d.toLocaleDateString([], { weekday: 'long' }), d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })];
  }
  function goDay(k) {
    const t = DB.dayKey(); if (!k || k >= t) k = null;
    viewKey = k; renderToday();
  }
  async function renderToday() {
    const day = curDay(), isToday = day === DB.dayKey();
    const [nm, dt] = dayLabels(day);
    $('#dayName').textContent = nm; $('#dayDate').textContent = dt;
    $('#dayNext').disabled = isToday; $('#pastBar').hidden = isToday;
    $('#dayPick').max = DB.dayKey(); $('#dayPick').value = day;
    $('#todayHead').textContent = isToday ? 'Today' : nm + ' · ' + dt;
    const meals = await DB.mealsOn(day);
    const goals = await DB.get('goals', null);
    const sum = (k) => meals.reduce((a, m) => a + (m[k] || 0), 0);
    const eaten = sum('kcal'), protein = sum('protein'), carbs = sum('carbs'), fat = sum('fat');
    const burn = window.Burn ? await window.Burn.onDay(day) : { kcal: 0, entries: [] };
    const net = eaten - burn.kcal;                       // net calories: food in minus workouts out
    $('#kcalEaten').textContent = nfmt(eaten) + ' kcal';
    $('#kcalBurned').textContent = nfmt(burn.kcal) + ' kcal';
    const mac = (id, bar, v, g) => { $(id).textContent = Math.round(v) + (g ? ' / ' + g : '') + ' g'; $(bar).style.width = g ? Math.min(100, v / g * 100) + '%' : '0%'; };
    mac('#proteinEaten', '#barP', protein, goals && goals.protein); mac('#carbsEaten', '#barC', carbs, goals && goals.carbs); mac('#fatEaten', '#barF', fat, goals && goals.fat);
    $('#kcalLeft').textContent = (net < 0 ? '−' : '') + nfmt(Math.abs(net));
    $('.ring').classList.toggle('over', !!(goals && goals.kcal && net > goals.kcal));
    if (goals && goals.kcal) {
      $('#kcalGoal').textContent = nfmt(goals.kcal) + ' kcal'; $('#kcalGoal').classList.remove('unset');
      const left = goals.kcal - net;
      $('#kcalRemain').textContent = nfmt(Math.abs(left)) + (left >= 0 ? ' left' : ' over');
      $('#ringFill').style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, net / goals.kcal))));
    } else {
      $('#kcalGoal').textContent = 'Set a goal ›'; $('#kcalGoal').classList.add('unset');
      $('#kcalRemain').textContent = '–';
      $('#ringFill').style.strokeDashoffset = String(CIRC);
    }
    const wml = (await DB.get('water:' + day, 0)) || 0;
    $('#waterTxt').textContent = nfmt(wml) + ' / ' + nfmt(WATER_GOAL) + ' ml';
    $('#waterBar').style.width = Math.min(100, wml / WATER_GOAL * 100) + '%';
    const list = $('#historyList');
    list.innerHTML = meals.map((m) =>
      `<li><button type="button" class="meal" data-id="${esc(m.id)}"><div class="name"><b>${esc(m.name)}</b><span>${new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${m.protein ? ' · ' + Math.round(m.protein) + ' g protein' : ''}</span></div><span class="kcal">${Math.round(m.kcal)}</span></button></li>`
    ).join('');
    $('#historyEmpty').hidden = meals.length > 0;
  }

  $('#historyList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b && window.Plate.editMeal) window.Plate.editMeal(b.dataset.id);
  });
  $('#mealPhoto').addEventListener('change', (e) => {
    const f = e.target.files[0];
    $('#fileName').textContent = f ? f.name : '';
  });
  // The estimate flow (official lookup, then picture maths) is wired in the next step.
  $('#logForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (typeof window.Plate.estimate === 'function') window.Plate.estimate();
  });

  $('#dayPrev').addEventListener('click', () => goDay(DB.dayKey(new Date(pd(curDay()).getTime() - 864e5 + 36e5))));
  $('#dayNext').addEventListener('click', () => goDay(DB.dayKey(new Date(pd(curDay()).getTime() + 864e5 + 36e5))));
  $('#dayToday').addEventListener('click', () => goDay(null));
  $('#dayLabel').addEventListener('click', () => { const i = $('#dayPick'); try { i.showPicker(); } catch (e) { i.focus(); i.click(); } });
  $('#dayPick').addEventListener('change', (e) => goDay(e.target.value));
  document.querySelector('[data-water]') && $('#view-today').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-water]'); if (!b) return;
    const k = 'water:' + curDay(), v = Math.max(0, ((await DB.get(k, 0)) || 0) + parseInt(b.dataset.water, 10));
    await DB.set(k, v); renderToday();
  });
  /* ---------- settings: account, sync, backups ---------- */
  const dlg = $('#settingsDlg');
  const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  function syncLine() {
    const s = Sync.status();
    $('#syncStatus').className = 'status' + (s.err ? ' bad' : '');
    $('#syncStatus').textContent = s.err || (s.last ? 'Synced ' + when(s.last) + (s.pending ? ' · ' + s.pending + ' waiting' : '') : 'Not synced yet.');
  }
  window.addEventListener('plate-sync', () => { if (dlg.open) syncLine(); });
  async function listBackups() {
    const box = $('#backupList'); box.innerHTML = '<p class="hint">Loading…</p>';
    try {
      const r = await Auth.call('/backups'), L = { manual: 'Manual copy', 'before-restore': 'Saved before your last restore' };
      box.innerHTML = r.backups.length ? r.backups.slice(0, 14).map((b) => `<div class="logrow"><span><b>${esc(L[b.day] || b.day)}</b><small>${esc(when(b.created))}${b.bytes ? ' · ' + Math.max(1, Math.round(b.bytes / 1024)) + ' KB' : ''}</small></span><button type="button" class="link" data-restore="${esc(b.day)}">Restore</button></div>`).join('') : '<p class="hint">No backups yet. The first one is made at 12:00, or tap "Back up now".</p>';
    } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
  }
  async function openSettings() {
    const u = Auth.user(); $('#acctEmail').textContent = u ? 'Signed in as ' + u.email : '';
    setRegion(await DB.get('region', 'Qatar'));
    $('#testStatus').textContent = ''; $('#acctStatus').textContent = ''; syncLine(); dlg.showModal(); if (u) listBackups();
  }
  function setStatus(msg, kind) { const s = $('#testStatus'); s.textContent = msg; s.className = 'status' + (kind ? ' ' + kind : ''); }
  const acct = (msg, kind) => { const s = $('#acctStatus'); s.textContent = msg; s.className = 'status' + (kind ? ' ' + kind : ''); };
  async function saveConn() { await DB.set('region', region || 'Qatar'); }
  /* region picker: a button showing the flag in a circle plus the name; tapping opens a searchable list */
  let region = 'Qatar';
  const flagDot = (c) => `<span class="flagDot" aria-hidden="true">${c ? `<img src="flags/${c.code.toLowerCase()}.svg" alt="" width="28" height="28" loading="lazy">` : '🌍'}</span>`;
  function setRegion(name) {
    region = name || 'Qatar'; const c = Countries.byName(region);
    $('#regionBtn').innerHTML = `${flagDot(c)}<span class="rName">${esc(c ? c.name : region)}</span><i aria-hidden="true">▾</i>`;
  }
  function drawRegions() {
    const L = Countries.search($('#regionSearch').value);
    $('#regionList').innerHTML = L.length ? L.map((c) => `<button type="button" role="option" class="regionRow${c.name === region ? ' on' : ''}" data-c="${esc(c.name)}" aria-selected="${c.name === region}">${flagDot(c)}<span>${esc(c.name)}</span>${c.name === region ? '<b aria-hidden="true">✓</b>' : ''}</button>`).join('') : '<p class="hint">No country matches that.</p>';
  }
  /* first launch: ask where you are, so food advice and brand lookups use your country (nothing is assumed) */
  let firstRegion = false;
  $('#regionDlg').addEventListener('cancel', (e) => { if (firstRegion) e.preventDefault(); });
  window.Plate.regionFlow = (async () => {
    if (!(await Auth.ready)) await new Promise((r) => window.addEventListener('plate-auth', r, { once: true }));
    await new Promise((r) => { const t = setTimeout(r, 4000); window.addEventListener('plate-sync', () => { clearTimeout(t); r(); }, { once: true }); });
    if (Auth.user() && (await DB.get('region', null)) === null) {
      $('#regionTitle').textContent = 'Where are you?'; $('#regionSub').hidden = false; $('#regionClose').hidden = true; firstRegion = true; openRegion();
      await new Promise((r) => $('#regionDlg').addEventListener('close', r, { once: true }));
      $('#regionTitle').textContent = 'Region'; $('#regionSub').hidden = true; $('#regionClose').hidden = false; firstRegion = false;
    }
  })();
  function openRegion() { $('#regionSearch').value = ''; drawRegions(); $('#regionDlg').showModal(); const on = $('#regionList .on'); if (on) on.scrollIntoView({ block: 'center' }); }
  $('#regionBtn').addEventListener('click', openRegion);
  $('#regionSearch').addEventListener('input', drawRegions);
  $('#regionClose').addEventListener('click', () => $('#regionDlg').close());
  $('#regionDlg').addEventListener('click', (e) => { if (e.target === $('#regionDlg') && !firstRegion) $('#regionDlg').close(); });
  $('#regionList').addEventListener('click', async (e) => { const b = e.target.closest('[data-c]'); if (!b) return; setRegion(b.dataset.c); await DB.set('region', region); $('#regionDlg').close(); });
  $('#openSettings').addEventListener('click', openSettings);
  $('#closeSettings').addEventListener('click', () => dlg.close());
  $('#settingsForm').addEventListener('submit', async (e) => { e.preventDefault(); await saveConn(); dlg.close(); });
  $('#testConn').addEventListener('click', async () => {
    setStatus('Testing…');
    try { await saveConn(); await AI.test(); setStatus('Connected. Everything is working.', 'ok'); }
    catch (err) { setStatus(err.message, 'bad'); }
  });
  $('#syncNow').addEventListener('click', async () => { $('#syncStatus').textContent = 'Syncing…'; await Sync.sync(); syncLine(); });
  $('#signOutBtn').addEventListener('click', async () => { try { await Auth.signOut(); dlg.close(); } catch (e) { $('#syncStatus').className = 'status bad'; $('#syncStatus').textContent = e.message; } });
  $('#backupNow').addEventListener('click', async () => { try { await Sync.flush(); await Auth.call('/backups/now', { body: {} }); await listBackups(); } catch (e) { $('#backupList').insertAdjacentHTML('afterbegin', `<p class="hint">${esc(e.message)}</p>`); } });
  $('#backupList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-restore]'); if (!b) return;
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to restore'; return; }
    b.disabled = true; b.textContent = 'Restoring…';
    try { await Sync.flush(); await Auth.call('/backups/restore', { body: { day: b.dataset.restore } }); await DB.set('syncCursor', 0); await Sync.sync(); dlg.close(); showTab(last, false); renderToday(); listBackups(); }
    catch (err) { b.textContent = err.message; }
  });
  $('#pwGo').addEventListener('click', async () => {
    try { await Auth.call('/auth/password', { body: { old: $('#pwOld').value, password: $('#pwNew').value } }); $('#pwOld').value = $('#pwNew').value = ''; acct('Password changed. Your other devices are signed out.', 'ok'); }
    catch (e) { acct(e.message, 'bad'); }
  });
  $('#delAcct').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Enter your current password above, then tap again to delete everything'; return; }
    try { await Auth.call('/auth/delete', { body: { password: $('#pwOld').value } }); await DB.wipe(); await DB.set('outbox', {}); await DB.set('syncCursor', 0); await DB.set('localUser', null); location.reload(); }
    catch (err) { acct(err.message, 'bad'); }
  });
  /* Android and desktop Chrome can install the app from a button; iPhone uses Share > Add to Home Screen */
  let installEv = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEv = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (installEv) { installEv.prompt(); installEv = null; $('#installBtn').hidden = true; } });
  if (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone) { const h = $('#installHint'); h.hidden = false; h.textContent = 'To install on iPhone: tap Share in Safari, then Add to Home Screen. Sign in inside the installed app.'; }

  /* ---------- boot ---------- */
  let last = 'today';
  try { last = localStorage.getItem('plate.tab') || 'today'; } catch (e) {}
  showTab(last, false);
  renderToday();
  Auth.init();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();

/* The day rolls over at local midnight. If the app is left open (or comes back from the background) after midnight, redraw so "Today" is the new day. */
(function () {
  let shown = window.DB.dayKey();
  const roll = () => { const k = window.DB.dayKey(); if (k !== shown) { shown = k; try { window.Plate.refreshAll(); } catch (e) {} } };
  const arm = () => { const n = new Date(), ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2) - n; setTimeout(() => { roll(); arm(); }, Math.max(1000, ms)); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) roll(); });
  window.addEventListener('focus', roll);
  arm();
})();
