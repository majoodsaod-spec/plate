/* Plate: reminders (push notifications from the server). */
(function () {
  'use strict';
  const { $, esc } = window.Plate;
  const day = () => (window.Plate.viewDay ? window.Plate.viewDay() : DB.dayKey());
  const tz = () => -new Date().getTimezoneOffset();
  const oldServer = (e) => e && (e.status === 404 || e.status === 405 || /POST only|Unknown/.test(e.message || ''));
  const SERVER_MSG = 'Your server needs the new version first. Paste the new worker.js into Cloudflare (see the steps I gave you), then try again.';

  /* ---------- reminders ---------- */
  const DEF = {
    meals: { on: true, times: ['08:30', '13:30', '20:00'] },
    water: { on: true, times: ['11:00', '15:00', '18:30'] },
    weight: { on: true, time: '07:30', days: [0, 3] },
    workout: { on: true, time: '17:00' },
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
      </div>`;
  }
  async function readRem() {
    const p = await prefs(), box = $('#remBox'); if (!box) return p;
    box.querySelectorAll('input[type=checkbox][data-k]').forEach((c) => { p[c.dataset.k].on = c.checked; });
    p.meals.times = [0, 1, 2].map((i) => ($('#rmMeal' + i) || {}).value || DEF.meals.times[i]);
    p.water.times = [0, 1, 2].map((i) => ($('#rmWater' + i) || {}).value || DEF.water.times[i]);
    p.weight.time = $('#rmWeight').value || DEF.weight.time; p.workout.time = $('#rmWorkout').value || DEF.workout.time;
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

  window.Remind = { prefs };
})();
