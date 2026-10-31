/* Plate: steps (typed in, or sent every evening by an iPhone Shortcut) and reminders (push notifications from the server). */
(function () {
  'use strict';
  const { $, esc } = window.Plate;
  const nf = (n) => Math.round(n).toLocaleString();
  const day = () => (window.Plate.viewDay ? window.Plate.viewDay() : DB.dayKey());
  const tz = () => -new Date().getTimezoneOffset();
  const oldServer = (e) => e && (e.status === 404 || e.status === 405 || /POST only|Unknown/.test(e.message || ''));
  const SERVER_MSG = 'Your server needs the new version first. Paste the new worker.js into Cloudflare (see the steps I gave you), then try again.';

  /* ---------- steps on the Today tab ---------- */
  const ACT_NAME = { sedentary: 'mostly sitting', light: 'light', moderate: 'moderate', very: 'very active' };
  async function renderSteps() {
    const d = day(), v = await Burn.stepsOn(d), kg = await Burn.weightKg(), prof = await DB.get('profile', null);
    const st = await Burn.stepsKcal(d, kg, prof), base = Burn.STEP_BASE[(prof && prof.activity) || 'light'] || 6500;
    const inp = $('#stepsIn');
    if (document.activeElement !== inp) inp.value = v ? v.steps : '';
    $('#stepsTxt').textContent = v ? nf(v.steps) + ' steps' + (st.kcal ? ' · −' + nf(st.kcal) + ' kcal' : '') : 'Not added';
    const src = v && v.src === 'shortcut' ? `From your iPhone${v.ts ? ' at ' + new Date(v.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}. ` : '';
    $('#stepsNote').textContent = v
      ? src + (st.kcal ? `Steps above your usual ${nf(base)} a day count as burned.` : `Your goal already includes about ${nf(base)} steps a day (${ACT_NAME[(prof && prof.activity) || 'light']} activity), so only steps above that add calories.`)
      : `Only steps above your usual ${nf(base)} a day count, because your calorie goal already includes normal walking.`;
  }
  $('#stepsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = $('#stepsIn').value.replace(/[^\d]/g, ''), n = parseInt(raw, 10);
    if (raw === '') { await DB.set('steps:' + day(), null); $('#stepsIn').blur(); window.Plate.refreshToday(); return; }
    if (!(n >= 0) || n > 100000) { $('#stepsNote').textContent = 'Enter a number of steps between 0 and 100,000.'; return; }
    await DB.set('steps:' + day(), { steps: n, src: 'manual', ts: Date.now() }); $('#stepsIn').blur();
    window.Plate.refreshToday();
  });
  const rt = window.Plate.refreshToday;
  window.Plate.refreshToday = function () { const r = rt.apply(this, arguments); renderSteps().catch(() => {}); return r; };
  const ra = window.Plate.refreshAll;
  window.Plate.refreshAll = function () { const r = ra.apply(this, arguments); renderSteps().catch(() => {}); return r; };
  ['dayPrev', 'dayNext', 'dayToday'].forEach((id) => { const b = $('#' + id); if (b) b.addEventListener('click', () => setTimeout(() => renderSteps().catch(() => {}), 60)); });
  const dp = $('#dayPick'); if (dp) dp.addEventListener('change', () => setTimeout(() => renderSteps().catch(() => {}), 60));
  setTimeout(() => renderSteps().catch(() => {}), 300);

  /* ---------- the iPhone Shortcut that sends steps ---------- */
  let sdlg = null;
  function stepsSheet() {
    if (!sdlg) {
      sdlg = document.createElement('dialog'); sdlg.id = 'stepsDlg';
      sdlg.innerHTML = '<div class="sheet"><div class="closeRow"><button type="button" class="link" data-sx="close">Close</button></div><h2 style="margin:0">Steps from your iPhone</h2><div id="sxBody"></div></div>';
      document.body.appendChild(sdlg);
      sdlg.addEventListener('click', async (e) => {
        if (e.target === sdlg) { sdlg.close(); return; }
        const b = e.target.closest('[data-sx]'); if (!b) return;
        const a = b.dataset.sx;
        if (a === 'close') sdlg.close();
        if (a === 'make' || a === 'remake') {
          b.disabled = true; $('#sxErr').textContent = '';
          try { const r = await Auth.call('/hook/new', { body: { tz: tz() } }); await DB.set('stepsHook', { url: r.url, made: Date.now() }); drawSheet(); }
          catch (er) { $('#sxErr').textContent = oldServer(er) ? SERVER_MSG : er.message; b.disabled = false; }
        }
        if (a === 'copy') {
          const h = await DB.get('stepsHook', null); if (!h) return;
          try { await navigator.clipboard.writeText(h.url); b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy link'; }, 1800); }
          catch (er) { const i = $('#sxUrl'); i.select(); $('#sxErr').textContent = 'Press and hold the link above, then Copy.'; }
        }
      });
    }
    drawSheet(); sdlg.showModal();
  }
  async function drawSheet() {
    const h = await DB.get('stepsHook', null);
    if (!Auth.token()) { $('#sxBody').innerHTML = '<p class="hint">Sign in first. The Shortcut sends your steps to your account.</p>'; return; }
    $('#sxBody').innerHTML = !h
      ? `<p class="hint">A Shortcut on your iPhone reads today's steps from the Health app and sends them to Plate, automatically every evening. It takes about 3 minutes to set up, once.</p>
         <p class="hint">First, make your private link. Anyone with this link can send steps to your account (nothing else), so keep it to yourself.</p>
         <button type="button" class="primary" data-sx="make">Make my link</button><p class="err" id="sxErr" role="alert"></p>`
      : `<p class="hint" style="margin-bottom:6px">Your private link (keep it to yourself):</p>
         <input id="sxUrl" type="text" readonly value="${esc(h.url)}" aria-label="Your private steps link">
         <div class="row wrap"><button type="button" class="primary" data-sx="copy">Copy link</button><button type="button" class="link" data-sx="remake">Make a new link</button></div>
         <p class="err" id="sxErr" role="alert"></p>
         <h3 class="gh3">Set up the Shortcut</h3>
         <ol class="sxSteps">
           <li>Open the <b>Shortcuts</b> app → <b>Automation</b> tab → <b>+</b> (top right) → <b>Time of Day</b>.</li>
           <li>Pick <b>9:00 PM</b>, <b>Daily</b>, and choose <b>Run Immediately</b> (not "Run After Confirmation"). Tap <b>Next</b> → <b>New Blank Automation</b>.</li>
           <li>Tap <b>Add Action</b>, search <b>Find Health Samples</b>, add it. Tap <b>Type</b> and pick <b>Steps</b>. Tap <b>Add Filter</b>: <b>Start Date</b> · <b>is today</b>.</li>
           <li>Add the action <b>Calculate Statistics</b>. Set it to <b>Sum</b> of <b>Health Samples</b>.</li>
           <li>Add the action <b>Get Contents of URL</b>. Tap <b>URL</b> and paste your link.</li>
           <li>In that action tap the arrow ▸ to show more: <b>Method</b> → <b>POST</b>. <b>Request Body</b> → <b>JSON</b>. Tap <b>Add new field</b> → <b>Number</b>. Key: <b>steps</b>. Value: tap the box and pick <b>Statistics</b> from the bar above the keyboard.</li>
           <li>Tap <b>Done</b>. To check it now: open the automation and tap ▶︎ (bottom right). Then come back here: today's steps appear on the Today tab within a minute.</li>
         </ol>
         <p class="hint">Want them more often? Make the same automation again for 2:00 PM. Each send replaces that day's number, so nothing counts twice. If you also log walks in the Gym tab, those minutes are already in your steps, so log only one of the two.</p>`;
  }
  $('#stepsAuto').addEventListener('click', stepsSheet);

  /* ---------- reminders ---------- */
  const DEF = {
    meals: { on: true, times: ['08:30', '13:30', '20:00'] },
    water: { on: true, times: ['11:00', '15:00', '18:30'] },
    weight: { on: true, time: '07:30', days: [0, 3] },
    workout: { on: true, time: '17:00' },
    steps: { on: false, time: '21:30' },
  };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64u = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  async function prefs() { const p = (await DB.get('reminders', null)) || {}; const o = {}; Object.keys(DEF).forEach((k) => { o[k] = Object.assign({}, DEF[k], p[k] || {}); }); return o; }
  async function sub() { if (!canPush()) return null; const r = await navigator.serviceWorker.ready; return r.pushManager.getSubscription(); }
  async function sendSub(s, p) { await Auth.call('/push/sub', { body: { sub: s.toJSON(), prefs: p, tz: tz() } }); }

  async function turnOn() {
    if (!canPush()) throw new Error(standalone() ? 'This phone does not support notifications for web apps. iPhone needs iOS 16.4 or newer.' : 'On iPhone, reminders only work in the installed app: Safari → Share → Add to Home Screen, then open Plate from your Home Screen and turn them on there.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications are blocked. iPhone: Settings → Notifications → Plate → Allow Notifications.');
    let key; try { key = (await Auth.call('/push/key')).key; } catch (e) { throw new Error(oldServer(e) ? SERVER_MSG : e.message); }
    const reg = await navigator.serviceWorker.ready;
    let s = await reg.pushManager.getSubscription();
    if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
    await sendSub(s, await prefs());
  }
  async function turnOff() { const s = await sub(); if (s) { try { await Auth.call('/push/unsub', { body: { endpoint: s.endpoint } }); } catch (e) {} await s.unsubscribe(); } }

  function timeIn(id, v) { return `<input type="time" id="${id}" value="${esc(v)}" class="rmTime">`; }
  async function drawRem() {
    const box = $('#remBox'); if (!box) return;
    const p = await prefs(), s = await sub().catch(() => null), on = !!s && Notification.permission === 'granted';
    box.innerHTML = `
      <p class="hint" style="margin:0">A nudge on your phone, only when it helps: a meal reminder is skipped if you already logged a meal, water if you are on track, and so on.</p>
      <p class="status" id="remStatus" role="status">${on ? 'Reminders are on for this phone.' : 'Reminders are off on this phone.'}</p>
      <div class="row wrap">${on ? '<button type="button" data-rm="test">Send a test</button><button type="button" class="link" data-rm="off">Turn off</button>' : '<button type="button" class="primary" data-rm="on">Turn on reminders</button>'}</div>
      <div class="rmList">
        <label class="rmRow"><input type="checkbox" data-k="meals" ${p.meals.on ? 'checked' : ''}><span><b>Log your meals</b><small>If nothing is logged since the last reminder</small></span></label>
        <div class="rmTimes">${p.meals.times.map((t, i) => timeIn('rmMeal' + i, t)).join('')}</div>
        <label class="rmRow"><input type="checkbox" data-k="water" ${p.water.on ? 'checked' : ''}><span><b>Drink water</b><small>Only if you are behind for the time of day</small></span></label>
        <div class="rmTimes">${p.water.times.map((t, i) => timeIn('rmWater' + i, t)).join('')}</div>
        <label class="rmRow"><input type="checkbox" data-k="weight" ${p.weight.on ? 'checked' : ''}><span><b>Weigh in</b><small>Mornings, on the days you pick</small></span></label>
        <div class="rmTimes">${timeIn('rmWeight', p.weight.time)}<span class="rmDays">${WD.map((d, i) => `<button type="button" class="seg${p.weight.days.includes(i) ? ' on' : ''}" data-wd="${i}" aria-pressed="${p.weight.days.includes(i)}">${d[0]}</button>`).join('')}</span></div>
        <label class="rmRow"><input type="checkbox" data-k="workout" ${p.workout.on ? 'checked' : ''}><span><b>Workout</b><small>On training days in your split, if you haven't logged one</small></span></label>
        <div class="rmTimes">${timeIn('rmWorkout', p.workout.time)}</div>
        <label class="rmRow"><input type="checkbox" data-k="steps" ${p.steps.on ? 'checked' : ''}><span><b>Add your steps</b><small>If no steps are in for today</small></span></label>
        <div class="rmTimes">${timeIn('rmSteps', p.steps.time)}</div>
      </div>`;
  }
  async function readRem() {
    const p = await prefs(), box = $('#remBox'); if (!box) return p;
    box.querySelectorAll('input[type=checkbox][data-k]').forEach((c) => { p[c.dataset.k].on = c.checked; });
    p.meals.times = [0, 1, 2].map((i) => ($('#rmMeal' + i) || {}).value || DEF.meals.times[i]);
    p.water.times = [0, 1, 2].map((i) => ($('#rmWater' + i) || {}).value || DEF.water.times[i]);
    p.weight.time = $('#rmWeight').value || DEF.weight.time; p.workout.time = $('#rmWorkout').value || DEF.workout.time; p.steps.time = $('#rmSteps').value || DEF.steps.time;
    p.weight.days = [...box.querySelectorAll('[data-wd].on')].map((b) => +b.dataset.wd);
    return p;
  }
  let saveT = null;
  async function saveRem() {
    const p = await readRem(); await DB.set('reminders', p);
    clearTimeout(saveT); saveT = setTimeout(async () => { try { const s = await sub(); if (s) await sendSub(s, p); } catch (e) {} }, 600);
  }
  function mountRem() {
    const form = $('#settingsForm'); if (!form || $('#remBox')) return;
    const anchor = form.querySelector('.acctMore');
    const sec = document.createElement('div');
    sec.innerHTML = '<hr class="setHr"><h2 class="h2s">Reminders</h2><div id="remBox"></div>';
    form.insertBefore(sec, anchor);
    sec.addEventListener('change', () => saveRem());
    sec.addEventListener('click', async (e) => {
      const wd = e.target.closest('[data-wd]'); if (wd) { wd.classList.toggle('on'); wd.setAttribute('aria-pressed', wd.classList.contains('on')); saveRem(); return; }
      const b = e.target.closest('[data-rm]'); if (!b) return;
      const msg = (t) => { const s = $('#remStatus'); if (s) s.textContent = t; };
      b.disabled = true;
      try {
        if (b.dataset.rm === 'on') { msg('Turning on…'); await saveRem(); await turnOn(); await drawRem(); msg('Reminders are on for this phone.'); }
        else if (b.dataset.rm === 'off') { await turnOff(); await drawRem(); }
        else if (b.dataset.rm === 'test') { const r = await Auth.call('/push/test', { body: {} }); msg(r.sent ? 'Sent. It should appear in a few seconds.' : 'Could not deliver to this phone. Turn reminders off and on again.'); }
      } catch (er) { msg(oldServer(er) ? SERVER_MSG : er.message); }
      b.disabled = false;
    });
  }
  document.addEventListener('click', (e) => { if (e.target.closest('#settingsBtn, [aria-label="Settings"], .gear, #openSettings')) setTimeout(() => { mountRem(); drawRem(); }, 30); }, true);
  mountRem(); drawRem().catch(() => {});

  /* keep the server's copy of this phone's time zone and reminder choices fresh (travel, daylight saving) */
  window.addEventListener('plate-auth', () => setTimeout(async () => { try { const s = await sub(); if (s && Notification.permission === 'granted') await sendSub(s, await prefs()); } catch (e) {} }, 2000));
  setTimeout(async () => { try { if (!Auth.token()) return; const s = await sub(); if (s && Notification.permission === 'granted') await sendSub(s, await prefs()); } catch (e) {} }, 4000);

  /* a tapped notification opens its tab */
  const goTab = (t) => { const b = document.querySelector(`[role="tab"][data-tab="${t}"]`); if (b) b.click(); };
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.plateTab) goTab(e.data.plateTab); });
  const h = (location.hash || '').slice(1); if (['today', 'recipes', 'nutrition', 'gym', 'insights'].includes(h)) { setTimeout(() => goTab(h), 50); history.replaceState(null, '', location.pathname + location.search); }

  window.Remind = { renderSteps, stepsSheet, prefs };
})();
