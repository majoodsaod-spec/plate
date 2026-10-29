/* Plate accounts. Sign in with email and password. The login is a long random token kept on this device and renewed every time you use the app,
   so you are not signed out unless you choose Sign out (or change your password somewhere else). Going offline never signs you out. */
(function (root) {
  'use strict';
  const LS = 'plate.auth', API = 'plate.api';
  let me = null, resolveReady; const ready = new Promise((r) => { resolveReady = r; });

  /* the token is kept in two places (localStorage and IndexedDB) so that if the phone clears one, the other restores it */
  const idb = () => new Promise((res, rej) => { const rq = indexedDB.open('plate-auth', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('a'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  async function idbGet() { try { const db = await idb(); return await new Promise((res) => { const r = db.transaction('a').objectStore('a').get('auth'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } }
  async function idbSet(v) { try { const db = await idb(); await new Promise((res) => { const tx = db.transaction('a', 'readwrite'); if (v) tx.objectStore('a').put(v, 'auth'); else tx.objectStore('a').delete('auth'); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} }
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } };
  async function save(v) { try { if (v) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS); } catch (e) {} await idbSet(v); me = v; }

  const config = () => { let a = ''; try { a = localStorage.getItem(API) || ''; } catch (e) {} return (a || root.PLATE_API || '').trim().replace(/\/+$/, ''); };
  const device = () => { const u = navigator.userAgent; return (/iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : 'Browser'); };

  /* every server call goes through here */
  async function call(path, o) {
    o = o || {}; const base = config(); if (!base) throw new Error('Add your server address first.');
    const h = { 'content-type': 'application/json' }; if (me && me.token && !o.anon) h.authorization = 'Bearer ' + me.token;
    let res;
    try { res = await fetch(base + path, { method: o.method || (o.body ? 'POST' : 'GET'), headers: h, body: o.body ? JSON.stringify(o.body) : undefined, signal: o.signal }); }
    catch (e) { if (e.name === 'AbortError') throw e; const er = new Error('Could not reach the server. Check your connection.'); er.offline = true; throw er; }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && me && !o.anon) { await expired(); const er = new Error('Your session ended. Please sign in again.'); er.status = 401; throw er; }
    if (!res.ok) { const er = new Error((data.error && data.error.message) || ('Request failed (' + res.status + ')')); er.status = res.status; throw er; }
    return data;
  }
  async function expired() { await save(null); show('signin'); }

  /* ---------- the sign-in sheet ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let dlg = null, pane = 'signin', pending = null, cfg = null, cfgTried = false, gReady = false, tick = null;
  const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYEOFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function build() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.id = 'authDlg'; dlg.setAttribute('aria-label', 'Sign in');
    dlg.innerHTML = '<div class="sheet auth" id="authBox"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('cancel', (e) => e.preventDefault());       // cannot be dismissed without signing in
    dlg.addEventListener('click', onClick); dlg.addEventListener('submit', onSubmit); dlg.addEventListener('input', onInput);
    return dlg;
  }
  const fld = (id, label, type, extra) => `<div class="af"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${extra || ''}></div>`;
  const pwFld = (id, label, extra) => `<div class="af"><label for="${id}">${label}</label><div class="pw"><input id="${id}" type="password" ${extra || ''}><button type="button" class="eye" data-au="eye" aria-label="Show password" aria-pressed="false">${EYE}</button></div></div>`;
  const brand = (title, sub) => `<div class="authHead"><img class="authLogo" src="icons/icon-192.png" alt="" width="52" height="52"><h2>${title}</h2><p class="hint">${sub}</p></div>`;
  const GBTN = () => (cfg && cfg.google ? '<div class="gWrap"><div id="auG"></div></div><div class="or"><span>or</span></div>' : '');
  const emailHint = 'autocomplete="email" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" required';
  function render(msg) {
    const box = $('#authBox'), needServer = !config();
    const keep = {}; box.querySelectorAll('input').forEach((x) => { if (x.id && x.type !== 'checkbox') keep[x.id] = x.value; });
    const server = needServer ? fld('auServer', 'Server address', 'url', 'inputmode="url" placeholder="https://plate-proxy.yourname.workers.dev" autocapitalize="off" autocorrect="off" spellcheck="false"') : '';
    const err = msg ? `<p class="status bad" role="alert">${esc(msg)}</p>` : '<p class="status" id="auMsg" aria-live="polite"></p>';
    const inv = cfg && cfg.invite ? fld('auInvite', 'Invite code', 'text', 'autocomplete="off" autocapitalize="off" spellcheck="false" required') : '';
    const otp = !!(cfg && cfg.otp);
    if (pane === 'recovery') {
      box.innerHTML = `${brand('Save your recovery code', 'If you ever lose access, this code gets you back in.')}
        <div class="recCode" id="auRec">${esc(pending.recovery)}</div><button type="button" id="auCopy" data-au="copy">Copy code</button>
        <label class="chk"><input type="checkbox" id="auSaved"> I saved my recovery code</label><button type="button" class="primary big" data-au="recdone" disabled id="auRecGo">Continue</button>`;
      return;
    }
    if (pane === 'adopt') {
      box.innerHTML = `${brand('Keep the data on this phone?', 'This phone already holds Plate data from before accounts existed (meals, recipes, weights, goals).')}<p class="hint c">Add it to <b>${esc(pending.user.email)}</b>?</p>
        <button type="button" class="primary big" data-au="adopt-yes">Yes, add it to my account</button><button type="button" class="big" data-au="adopt-no">No, start with this account's own data</button>`;
      return;
    }
    if (pane === 'invite') {
      box.innerHTML = `${brand('Invite code needed', 'This Plate server is invite-only. Enter your code to finish signing in with Google.')}
        <form id="auForm">${fld('auInvite', 'Invite code', 'text', 'autocomplete="off" autocapitalize="off" spellcheck="false" required')}${err}<button type="submit" class="primary big">Continue</button><button type="button" class="link" data-au="tab-signin">Cancel</button></form>`;
      return;
    }
    if (pane === 'verify') {
      box.innerHTML = `${brand('Check your email', `We sent a 6-digit code to <b>${esc(pending.email)}</b>. It works for 10 minutes.`)}
        <form id="auForm"><div class="af"><label for="auOtp">Verification code</label><input id="auOtp" class="otpIn" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="••••••" required></div>
        ${err}<button type="submit" class="primary big">Verify and continue</button>
        <div class="authLinks"><button type="button" class="link" data-au="resend" id="auResend">Resend code</button><button type="button" class="link" data-au="tab-${pending.flow === 'reset' ? 'reset' : 'register'}">Change email</button></div></form>`;
      startTick(); const o = $('#auOtp'); if (o) o.focus();
      return;
    }
    if (pane === 'reset') {
      const stage = otp && pending && pending.otpSent;
      box.innerHTML = `${brand('Reset password', otp ? (stage ? 'Enter the code we emailed and choose a new password.' : 'We will email you a code to confirm it is you.') : 'Use the recovery code you saved when you created the account.')}
        <form id="auForm">${server}${fld('auEmail', 'Email', 'email', emailHint)}
        ${otp ? (stage ? fld('auOtp', 'Code from your email', 'text', 'class="otpIn" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required') : '') : fld('auCode', 'Recovery code', 'text', 'autocapitalize="characters" autocomplete="off" required placeholder="XXXX-XXXX-XXXX"')}
        ${!otp || stage ? pwFld('auPass', 'New password', 'autocomplete="new-password" minlength="8" required') + '<div class="meter" id="auMeter"><i></i><span></span></div>' + pwFld('auPass2', 'Confirm new password', 'autocomplete="new-password" required') : ''}
        ${err}<button type="submit" class="primary big">${otp && !stage ? 'Send code' : 'Set new password'}</button>${stage ? '<button type="button" class="link" data-au="resend" id="auResend">Resend code</button>' : ''}<button type="button" class="link" data-au="tab-signin">Back to sign in</button></form>`;
    } else {
      const reg = pane === 'register';
      box.innerHTML = `${brand(reg ? 'Create your account' : 'Welcome back', reg ? 'Your meals, recipes and workouts are saved to it and backed up every day.' : 'Sign in to pick up where you left off.')}
        ${GBTN()}
        <form id="auForm">${server}${fld('auEmail', 'Email', 'email', emailHint)}
        ${pwFld('auPass', 'Password', `autocomplete="${reg ? 'new-password' : 'current-password'}" ${reg ? 'minlength="8" placeholder="At least 8 characters"' : ''} required`)}
        ${reg ? '<div class="meter" id="auMeter"><i></i><span></span></div>' + pwFld('auPass2', 'Confirm password', 'autocomplete="new-password" required') + inv : ''}
        ${err}<button type="submit" class="primary big" id="auGo">${reg ? (otp ? 'Continue' : 'Create account') : 'Sign in'}</button>
        ${reg ? '' : '<button type="button" class="link" data-au="tab-reset">Forgot password?</button>'}</form>
        <p class="swap">${reg ? 'Already have an account? <button type="button" class="link" data-au="tab-signin">Sign in</button>' : 'New to Plate? <button type="button" class="link" data-au="tab-register">Create an account</button>'}</p>`;
    }
    Object.keys(keep).forEach((id) => { const x = document.getElementById(id); if (x && keep[id]) x.value = keep[id]; });
    mountGoogle();
  }
  function startTick() {
    clearInterval(tick); let n = Math.max(0, Math.ceil(((pending && pending.nextAt) || 0) - Date.now() / 1000));
    const upd = () => { const b = $('#auResend'); if (!b) { clearInterval(tick); return; } b.disabled = n > 0; b.textContent = n > 0 ? 'Resend code in ' + n + 's' : 'Resend code'; n--; if (n < -1) clearInterval(tick); };
    upd(); tick = setInterval(upd, 1000);
  }
  /* Google button (Google's own, so it follows their branding rules) */
  function loadGsi() {
    return new Promise((res, rej) => {
      if (root.google && root.google.accounts) return res();
      const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = () => res(); sc.onerror = () => rej(new Error('offline')); document.head.appendChild(sc);
    });
  }
  async function mountGoogle() {
    const el = $('#auG'); if (!el || !cfg || !cfg.google) return;
    try {
      await loadGsi(); if (!gReady) { root.google.accounts.id.initialize({ client_id: cfg.google, callback: onGoogle, ux_mode: 'popup', auto_select: false }); gReady = true; }
      const el2 = $('#auG'); if (!el2) return;
      root.google.accounts.id.renderButton(el2, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: pane === 'register' ? 'signup_with' : 'signin_with', logo_alignment: 'left', width: Math.max(200, Math.min(400, el2.parentElement.clientWidth || 300)) });
    } catch (e) { const w = el.closest('.gWrap'); if (w) { w.innerHTML = '<p class="hint c">Google sign-in needs an internet connection.</p>'; } }
  }
  async function onGoogle(resp) {
    try {
      pending = Object.assign(pending || {}, { gcred: resp.credential });
      const inv = $('#auInvite') ? $('#auInvite').value : '';
      const r = await call('/auth/google', { anon: true, body: { credential: resp.credential, device: device(), invite: inv || pending.ginvite || '' } });
      await afterAuth(r.token, r.user, !!r.isNew);
    } catch (err) {
      if (err.message === 'invite-needed') { pane = 'invite'; render(); return; }
      render(err.message);
    }
  }
  async function loadCfg() {
    if (cfg || cfgTried || !config()) return; cfgTried = true;
    try { cfg = await call('/auth/config', { anon: true }); if (dlg && dlg.open && ['signin', 'register', 'reset'].includes(pane)) render(); } catch (e) { cfgTried = false; }
  }
  async function show(p, msg) {
    build(); pane = p; if (p !== 'verify' && p !== 'reset') clearInterval(tick); render(msg); if (!dlg.open) dlg.showModal(); mountGoogle(); loadCfg();
  }
  function score(pw) {
    let n = 0; if (pw.length >= 8) n++; if (pw.length >= 12) n++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++; if (/\d/.test(pw)) n++; if (/[^A-Za-z0-9]/.test(pw)) n++;
    if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyui|11111111)/i.test(pw)) n = Math.min(n, 1);
    return pw ? Math.max(1, Math.min(4, n)) : 0;
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'auPass') { const m = $('#auMeter'); if (m && pane !== 'signin') { const sc = score(t.value); m.dataset.s = sc; m.querySelector('span').textContent = ['', 'Weak', 'Fair', 'Good', 'Strong'][sc]; } }
    if (t.id === 'auPass' || t.id === 'auPass2') { const a = $('#auPass'), b = $('#auPass2'); if (b) { const bad = b.value && a.value !== b.value; b.classList.toggle('bad', !!bad); const mm = $('#auMsg'); if (mm) mm.textContent = bad ? 'Passwords do not match yet.' : ''; } }
    if (t.id === 'auOtp') { t.value = t.value.replace(/\D/g, '').slice(0, 6); }
  }
  async function sendOtp(email, purpose) {
    const r = await call('/auth/otp/send', { anon: true, body: { email, purpose } });
    pending = Object.assign(pending || {}, { email, flow: purpose, nextAt: Date.now() / 1000 + 45 }); return r;
  }
  function onClick(e) {
    const b = e.target.closest('[data-au]'); if (!b) return;
    const a = b.dataset.au;
    if (a.startsWith('tab-')) { if (a !== 'tab-reset' || pane !== 'reset') pending = null; show(a.slice(4)); }
    if (a === 'eye') { const i = b.parentElement.querySelector('input'), on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.innerHTML = on ? EYEOFF : EYE; b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Hide password' : 'Show password'); }
    if (a === 'copy') { try { navigator.clipboard.writeText(pending.recovery); b.textContent = 'Copied'; } catch (x) {} }
    if (a === 'recdone') afterAuth(pending.token, pending.user, true, pending.recoveryDone);
    if (a === 'adopt-yes') finish(true); if (a === 'adopt-no') finish(false);
    if (a === 'resend') { b.disabled = true; sendOtp(pending.email, pending.flow).then(() => { startTick(); const m = $('#authBox .status'); if (m) { m.className = 'status ok'; m.textContent = 'New code sent.'; } }).catch((er) => render(er.message)); }
  }
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'auSaved') { const g = $('#auRecGo'); if (g) g.disabled = !e.target.checked; } });
  async function onSubmit(e) {
    e.preventDefault(); const f = e.target; if (f.id !== 'auForm') return;
    const sv = $('#auServer'); if (sv && sv.value.trim()) { try { localStorage.setItem(API, sv.value.trim().replace(/\/+$/, '')); } catch (x) {} loadCfg(); }
    const val = (id) => ($(id) ? $(id).value : ''), btn = f.querySelector('button[type=submit]');
    const email = pane === 'verify' ? pending.email : val('#auEmail').trim(), pw = val('#auPass'), otp = !!(cfg && cfg.otp);
    const bad = (m) => { const s = $('#authBox .status'); if (s) { s.className = 'status bad'; s.textContent = m; } };
    if (!config()) return bad('Add your server address first.');
    btn.disabled = true;
    try {
      if (pane === 'invite') {
        pending.ginvite = val('#auInvite'); const r = await call('/auth/google', { anon: true, body: { credential: pending.gcred, device: device(), invite: pending.ginvite } });
        await afterAuth(r.token, r.user, !!r.isNew);
      } else if (pane === 'register') {
        if (pw.length < 8) { btn.disabled = false; return bad('Use at least 8 characters.'); }
        if (pw !== val('#auPass2')) { btn.disabled = false; return bad('The two passwords do not match.'); }
        if (otp) { pending = { password: pw, invite: val('#auInvite') }; await sendOtp(email, 'register'); pane = 'verify'; render(); return; }
        const r = await call('/auth/register', { anon: true, body: { email, password: pw, invite: val('#auInvite'), device: device() } });
        pending = Object.assign(pending || {}, { token: r.token, user: r.user, recovery: r.recovery, isNew: true }); pane = 'recovery'; render();
      } else if (pane === 'verify' && pending.flow === 'register') {
        const r = await call('/auth/register', { anon: true, body: { email, password: pending.password, invite: pending.invite, otp: val('#auOtp'), device: device() } });
        pending = Object.assign(pending, { token: r.token, user: r.user, recovery: r.recovery, isNew: true }); pane = 'recovery'; render();
      } else if (pane === 'reset') {
        if (otp && !(pending && pending.otpSent)) { await sendOtp(email, 'reset'); pending.otpSent = true; render(); startTick(); return; }
        if (pw.length < 8) { btn.disabled = false; return bad('Use at least 8 characters.'); }
        if (pw !== val('#auPass2')) { btn.disabled = false; return bad('The two passwords do not match.'); }
        const r = await call('/auth/reset', { anon: true, body: { email, recovery: val('#auCode'), otp: otp ? val('#auOtp') : '', password: pw, device: device() } });
        pending = { token: r.token, user: r.user, recovery: r.recovery, recoveryDone: true, isNew: false }; pane = 'recovery'; render();
      } else {
        const r = await call('/auth/login', { anon: true, body: { email, password: pw, device: device() } });
        await afterAuth(r.token, r.user, false);
      }
    } catch (err) { const keepPending = pending; render(err.message); pending = keepPending; btn.disabled = false; }
  }
  /* once a token exists: decide what to do with data already on this phone */
  async function afterAuth(token, user, isNew) {
    await save({ token, uid: user.id, email: user.email });
    const owner = await DB.get('localUser', null);
    pending = { user };
    if (owner && owner !== user.id) { await DB.wipe(); await DB.set('outbox', {}); await DB.set('syncCursor', 0); await DB.set('localUser', user.id); return done(true); }
    if (!owner && await DB.hasData()) { pane = 'adopt'; render(); return; }
    await DB.set('localUser', user.id); done(false);
  }
  async function finish(adopt) {
    if (!adopt) { await DB.wipe(); await DB.set('outbox', {}); await DB.set('syncCursor', 0); }
    await DB.set('localUser', pending.user.id);
    if (adopt) await root.Sync.queueAll();
    done(!adopt);
  }
  function done(reload) { pending = null; if (dlg && dlg.open) dlg.close(); if (reload) { location.reload(); return; } root.Sync.start(); root.dispatchEvent(new Event('plate-auth')); }

  /* ---------- startup ---------- */
  async function init() {
    let a = lsGet(); if (!a) { a = await idbGet(); if (a) await save(a); } else { me = a; idbSet(a); }
    if (!a || !a.token) { me = null; await show('signin'); resolveReady(false); return; }
    me = a;
    try { await call('/auth/me'); } catch (e) { /* offline or server hiccup: stay signed in. A real 401 already opened the sign-in sheet. */ }
    if (me) { root.Sync.start(); }
    resolveReady(!!me);
  }
  const Auth = {
    ready, init, call, api: config, token: () => (me && me.token) || '', user: () => (me ? { id: me.uid, email: me.email } : null), expired,
    async signOut() {
      try { await root.Sync.flush(); } catch (e) {}
      if (await root.Sync.pending()) throw new Error('Some changes have not reached your account yet. Connect to the internet and try again.');
      try { await call('/auth/logout', { method: 'POST', body: {} }); } catch (e) { if (!e.offline && e.status !== 401) throw e; }
      root.Sync.stop(); await save(null); show('signin');
    },
  };
  root.Auth = Auth;
})(window);
