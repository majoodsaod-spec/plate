/* Plate: strength progress. Personal records, estimated one-rep max, a chart per lift, and the rest timer used while logging sets. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ASSIST = ['assisted-pull-up', 'machine-dip'];
  const r1 = (n) => Math.round(n * 10) / 10;

  /* Epley, the usual gym formula. Past 12 reps it overestimates, so those sets count as 12 */
  const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? (reps === 1 ? kg : kg * (1 + Math.min(reps, 12) / 30)) : 0);

  /* best numbers per exercise across the log. One point per session for the chart */
  function history(log) {
    const by = {};
    (log || []).forEach((l) => (l.detail || []).forEach((e) => {
      if (!e || !e.id || ASSIST.includes(e.id)) return;
      if (e.kind === 'lift') {
        let best = null;
        (e.sets || []).forEach((s) => { const v = e1rm(+s.kg || 0, +s.reps || 0); if (v > 0 && (!best || v > best.v)) best = { v, kg: +s.kg, reps: +s.reps }; });
        if (!best) return;
        const h = by[e.id] || (by[e.id] = { id: e.id, kind: 'lift', pts: [] });
        h.pts.push({ date: l.date, ts: l.ts, v: r1(best.v), kg: best.kg, reps: best.reps, top: Math.max(...(e.sets || []).map((s) => +s.kg || 0)) });
      } else if (e.kind === 'bw') {
        const reps = Math.max(0, ...(e.sets || []).map((s) => +s.reps || 0)); if (!reps) return;
        const h = by[e.id] || (by[e.id] = { id: e.id, kind: 'bw', pts: [] });
        h.pts.push({ date: l.date, ts: l.ts, v: reps, reps });
      }
    }));
    Object.values(by).forEach((h) => { h.pts.sort((a, b) => a.ts - b.ts); h.best = h.pts.reduce((a, p) => (p.v > a.v ? p : a), h.pts[0]); h.last = h.pts[h.pts.length - 1]; });
    return by;
  }

  /* the records a new session sets, compared with everything logged before it */
  function prs(prevLog, entries, MAP) {
    const H = history(prevLog), out = [];
    (entries || []).forEach((e) => {
      if (ASSIST.includes(e.id)) return;
      const h = H[e.id], name = (MAP && MAP[e.id] && MAP[e.id].name) || e.name || 'Exercise';
      if (e.kind === 'lift') {
        let best = null, top = 0;
        (e.sets || []).forEach((s) => { const v = e1rm(+s.kg || 0, +s.reps || 0); top = Math.max(top, +s.kg || 0); if (v > 0 && (!best || v > best.v)) best = { v, kg: +s.kg, reps: +s.reps }; });
        if (!best || !h) return;                                   // the first time you log a lift is a baseline, not a record
        const prevTop = Math.max(...h.pts.map((p) => p.top || 0));
        if (top > prevTop) out.push(`${name}: heaviest ever, ${top} kg`);
        else if (best.v > h.best.v + 0.05) out.push(`${name}: ${best.kg} kg × ${best.reps}, best estimated max ${Math.round(best.v)} kg`);
      } else if (e.kind === 'bw') {
        const reps = Math.max(0, ...(e.sets || []).map((s) => +s.reps || 0));
        if (h && reps > h.best.v) out.push(`${name}: ${reps} reps, most ever`);
      }
    });
    return out;
  }

  /* a small line chart: one point per session */
  function chart(pts, unit) {
    const W = 320, H = 120, pl = 34, pr = 10, pt = 10, pb = 22;
    if (!pts.length) return '';
    const vs = pts.map((p) => p.v), lo0 = Math.min(...vs), hi0 = Math.max(...vs), pad = Math.max(1, (hi0 - lo0) * 0.15);
    const lo = Math.max(0, Math.floor(lo0 - pad)), hi = Math.ceil(hi0 + pad);
    const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts, span = Math.max(1, t1 - t0);
    const X = (p) => (pts.length === 1 ? (pl + W - pr) / 2 : pl + (W - pl - pr) * (p.ts - t0) / span), Y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / Math.max(1, hi - lo));
    const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('');
    const best = pts.reduce((a, p) => (p.v > a.v ? p : a), pts[0]);
    const d = (ts) => { const x = new Date(ts); return x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
    const grid = [lo, Math.round((lo + hi) / 2), hi].map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="pgGrid"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="pgAx">${v}</text>`).join('');
    const dots = pts.map((p) => `<circle cx="${X(p).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p === best ? 4.5 : 3}" class="pgDot${p === best ? ' best' : ''}"><title>${esc(d(p.ts))}: ${p.kg ? p.kg + ' kg × ' + p.reps + ' · ' : ''}${p.v} ${unit}</title></circle>`).join('');
    return `<svg class="pgChart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress chart">${grid}<path d="${line}" class="pgLine"/>${dots}<text x="${pl}" y="${H - 6}" class="pgAx">${esc(d(t0))}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end" class="pgAx">${esc(d(t1))}</text></svg>`;
  }

  /* the card on the Plan tab */
  let open = null;
  function card(log, MAP) {
    const H = history(log), list = Object.values(H).sort((a, b) => b.last.ts - a.last.ts);
    if (!list.length) return `<div class="sectionHead" style="padding:0"><h2>Strength progress</h2></div><p class="hint">Log a workout with weights and your records and charts show up here.</p>`;
    const month = Date.now() - 30 * 864e5;
    const rows = list.slice(0, 12).map((h) => {
      const x = MAP[h.id], name = x ? x.name : h.id, unit = h.kind === 'lift' ? 'kg' : 'reps';
      const old = h.pts.filter((p) => p.ts < month).pop(), ch = old ? h.last.v - old.v : null;
      const delta = ch == null ? '' : ch > 0 ? `<span class="pgUp">+${r1(ch)} ${unit} in 30 days</span>` : ch < 0 ? `<span class="pgDown">${r1(ch)} ${unit} in 30 days</span>` : '<span class="hint">same as 30 days ago</span>';
      const best = h.kind === 'lift' ? `Best ${h.best.kg} kg × ${h.best.reps} · est. max ${Math.round(h.best.v)} kg` : `Best ${h.best.v} reps`;
      return `<details class="pgRow" data-pg="${esc(h.id)}"${open === h.id ? ' open' : ''}><summary><span class="exMain"><b>${esc(name)}</b><small>${esc(best)}</small></span>${delta}</summary>
        <div class="pgBody">${h.pts.length > 1 ? chart(h.pts.slice(-30), h.kind === 'lift' ? 'kg est. max' : 'reps') : '<p class="hint">One session so far. Log it again to see a trend.</p>'}
        <p class="hint">${h.kind === 'lift' ? 'Estimated one-rep max from your best set each session (weight × reps, Epley formula). Sets over 12 reps count as 12.' : 'Most reps in one set, each session.'}</p></div></details>`;
    }).join('');
    return `<div class="sectionHead" style="padding:0"><h2>Strength progress</h2><span class="hint">${list.length} exercise${list.length > 1 ? 's' : ''}</span></div>${rows}`;
  }
  document.addEventListener('toggle', (e) => { const d = e.target; if (d && d.classList && d.classList.contains('pgRow')) { if (d.open) open = d.dataset.pg; else if (open === d.dataset.pg) open = null; } }, true);

  /* ---------- rest timer ---------- */
  let T = null;
  let actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22, 0.44].forEach((d) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d + 0.18); o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.2); });
    } catch (e) {}
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
  }
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.max(0, s) % 60).padStart(2, '0');
  function host() { const d = [...document.querySelectorAll('dialog[open]')].pop(); return d ? (d.querySelector('.sheet') || d) : document.body; }
  function draw() {
    if (!T) return;
    let el = document.getElementById('restBar');
    const h = host();
    if (!el || el.parentNode !== h) { if (el) el.remove(); el = document.createElement('div'); el.id = 'restBar'; el.setAttribute('role', 'timer'); h.appendChild(el);
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-rest]'); if (!b) return; const a = b.dataset.rest; if (a === 'skip') stop(); else { T.end += (+a) * 1000; T.total += +a; tick(); } }); }
    const left = Math.round((T.end - Date.now()) / 1000), fr = Math.max(0, Math.min(1, left / T.total));
    el.className = left <= 0 ? 'done' : '';
    el.innerHTML = `<div class="rbFill" style="transform:scaleX(${fr.toFixed(3)})"></div><span class="rbTxt">${left > 0 ? 'Rest <b>' + mmss(left) + '</b>' : '<b>Go!</b> Next set'}${T.label ? ' · ' + esc(T.label) : ''}</span><button type="button" data-rest="-15" aria-label="15 seconds less">−15</button><button type="button" data-rest="15" aria-label="15 seconds more">+15</button><button type="button" data-rest="skip">${left > 0 ? 'Skip' : 'Close'}</button>`;
  }
  function tick() {
    if (!T) return;
    const left = Math.round((T.end - Date.now()) / 1000);
    if (left <= 0 && !T.rang) { T.rang = true; beep(); setTimeout(() => { if (T && T.rang) stop(); }, 8000); }
    draw();
  }
  function rest(sec, label) {
    stop(); sec = Math.max(10, Math.min(600, Math.round(+sec || 90)));
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}   // unlock sound on this tap (iPhone needs a tap first)
    T = { end: Date.now() + sec * 1000, total: sec, label, iv: setInterval(tick, 250) }; tick();
  }
  function stop() { if (T) clearInterval(T.iv); T = null; const el = document.getElementById('restBar'); if (el) el.remove(); }
  document.addEventListener('visibilitychange', tick);
  document.addEventListener('close', (e) => { if (e.target && e.target.id === 'gymLog') stop(); }, true);

  window.GymProgress = { e1rm, history, prs, card, chart, rest, stopRest: stop };
})();
