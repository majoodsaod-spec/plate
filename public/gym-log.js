/* Plate: the workout log sheet. Strength moves ask for sets (weight x reps); cardio asks what its machine's screen shows. */
(function () {
  'use strict';
  const { esc } = window.Plate, { EX } = window.GymData, MAP = {}; EX.forEach((x) => { MAP[x.id] = x; });
  [['custom-lift', 'Your exercise'], ['custom-time', 'Your activity'], ['custom-walkrun', 'Your walk or run'], ['custom-cycle', 'Your ride']].forEach(([id, name]) => { MAP[id] = { id, name, eq: [], type: 'isolation', stars: 0 }; });
  const CTYPES = [['custom-lift', 'Weights: sets, reps, weight'], ['custom-walkrun', 'Walk or run: distance and time'], ['custom-cycle', 'Cycling: distance and time'], ['custom-time', 'Anything else: time and how hard']];
  let dlg = null, cur = null;
  const q = (s) => dlg.querySelector(s);
  const firstNum = (t) => { const m = String(t || '').match(/\d+/); return m ? +m[0] : 8; };
  const LAST = (log, id) => { for (let i = log.length - 1; i >= 0; i--) { const d = log[i].detail; const e = d && d.find((x) => x.id === id); if (e) return e; } return null; };
  const fmtKg = (n) => (n ? String(n) : '');
  const ASSIST = ['assisted-pull-up', 'machine-dip'];

  function field(id, fd, v) {
    const val = v != null ? v : fd.def;
    if (fd.sel) return `<label class="lf"><span>${esc(fd.label)}</span><select data-f="${fd.k}">${fd.sel.map(([a, b]) => `<option value="${a}"${a === val ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
    return `<label class="lf"><span>${esc(fd.label)}${fd.unit ? ' · ' + fd.unit : ''}${fd.opt ? ' (optional)' : ''}</span><input data-f="${fd.k}" type="number" inputmode="decimal" min="0" step="${fd.step || 1}" value="${val === '' || val == null ? '' : val}" placeholder="${fd.opt ? '—' : ''}"></label>`;
  }
  function setRow(kind, i, s, x) {
    const w = (lab, key, ph, step) => `<input data-s="${key}" type="number" inputmode="decimal" min="0" step="${step || 1}" value="${s[key] == null ? '' : s[key]}" placeholder="${ph}" aria-label="${lab}">`;
    let body;
    if (kind === 'lift') body = `${w(x && /dumbbell/.test((x.eq || []).join()) ? 'kg per dumbbell' : ASSIST.includes(x.id) ? 'assist kg' : 'kg', 'kg', ASSIST.includes(x.id) ? 'assist kg' : 'kg', 0.5)}<i>×</i>${w('reps', 'reps', 'reps')}`;
    else if (kind === 'bw') body = `${w('reps', 'reps', 'reps')}<i>+</i>${w('extra kg', 'kg', '+ kg (opt.)', 0.5)}`;
    else if (kind === 'hold') body = `${w('seconds', 'sec', 'seconds')}<i>+</i>${w('extra kg', 'kg', '+ kg (opt.)', 0.5)}`;
    else body = `${w('kg', 'kg', 'kg', 0.5)}<i>×</i>${w('metres', 'm', 'metres')}`;
    return `<div class="srow" data-r="${i}"><b>${i + 1}</b>${body}<button type="button" class="link" data-rmset="${i}" aria-label="Remove set ${i + 1}">✕</button></div>`;
  }
  function block(e, i) {
    const x = MAP[e.id]; if (!x) return '';
    const last = e.last ? (e.kind === 'cardio' ? '' : `<small class="hint">Last time: ${e.last.sets.filter((s) => s.kg || s.reps || s.sec || s.m).slice(0, 4).map((s) => (e.kind === 'hold' ? s.sec + ' s' : e.kind === 'carry' ? (s.kg || 0) + ' kg · ' + s.m + ' m' : (s.kg ? s.kg + ' kg × ' : '') + s.reps)).join(', ')}</small>`) : '';
    if (e.kind === 'cardio') return `<section class="lblock" data-i="${i}">${cur.entries.length > 1 ? `<h3>${esc(x.name)}</h3>` : ''}<div class="lgrid">${Burn.FORMS[e.id].map((fd) => field(e.id, fd, e.f[fd.k])).join('')}</div></section>`;
    const head = e.kind === 'lift' ? (x.eq.includes('dumbbell') ? 'Weight is per dumbbell.' : '') : e.kind === 'carry' ? 'Total weight and distance for each set.' : e.kind === 'hold' ? 'How long you held each set.' : 'Reps, plus any extra weight (belt, vest, plate).';
    return `<section class="lblock" data-i="${i}">${cur.custom ? '' : `<h3>${esc(x.name)}</h3>`}${head ? `<small class="hint">${esc(head)}</small>` : ''}${last}
      <div class="sets">${e.sets.map((s, k) => setRow(e.kind, k, s, x)).join('')}</div><button type="button" class="link left" data-addset="${i}">+ Add set</button></section>`;
  }
  function render() {
    const ch = cur.custom ? `<label class="lf"><span>What did you do?</span><input id="glName" type="text" maxlength="60" placeholder="e.g. Padel, Zumba, Chest cable crossover" value="${esc(cur.name || '')}"></label><label class="lf"><span>Format</span><select id="glType">${CTYPES.map(([v, t]) => `<option value="${v}"${cur.entries[0].id === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : '';
    q('.lbody').innerHTML = ch + cur.entries.map(block).join('') || '<p class="hint">Nothing to log.</p>';
    q('#glErr').textContent = cur.err || '';
  }
  function read() {
    if (cur.custom) { const n = q('#glName'); if (n) cur.name = n.value; cur.entries.forEach((e) => { e.name = cur.name; }); }
    cur.entries.forEach((e, i) => {
      const b = q(`.lblock[data-i="${i}"]`); if (!b) return;
      if (e.kind === 'cardio') b.querySelectorAll('[data-f]').forEach((el) => { e.f[el.dataset.f] = el.tagName === 'SELECT' ? el.value : el.value; });
      else e.sets = [...b.querySelectorAll('.srow')].map((r) => { const s = {}; r.querySelectorAll('[data-s]').forEach((el) => { s[el.dataset.s] = el.value === '' ? null : +el.value; }); return s; });
    });
  }
  const filled = (e) => e.kind === 'cardio' ? !!(+e.f.min || (+e.f.rounds)) : e.sets.some((s) => (s.reps > 0) || (s.sec > 0) || (s.m > 0));
  function ensure() {
    if (dlg) return;
    dlg = document.createElement('dialog'); dlg.id = 'gymLog';
    dlg.innerHTML = '<div class="sheet gl"><div class="closeRow"><button type="button" class="link" data-gl="close">Cancel</button></div><h2 style="margin:0" id="glTitle"></h2><p class="hint" style="margin:0" id="glSub"></p><div class="lbody"></div><p class="err" id="glErr" role="alert"></p><button type="button" class="primary glSave" data-gl="save">Save</button></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('change', (e) => { if (e.target.id === 'glType') { read(); cur.entries = [customEntry(e.target.value, cur.name)]; render(); } });
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const g = e.target.closest('[data-gl]'), a = e.target.closest('[data-addset]'), r = e.target.closest('[data-rmset]');
      if (a) { read(); const en = cur.entries[+a.dataset.addset], l = en.sets[en.sets.length - 1] || {}; en.sets.push({ ...l }); render(); return; }
      if (r) { read(); const b = r.closest('.lblock'), en = cur.entries[+b.dataset.i]; en.sets.splice(+r.dataset.rmset, 1); render(); return; }
      if (!g) return;
      if (g.dataset.gl === 'close') dlg.close();
      if (g.dataset.gl === 'save') {
        read(); const use = cur.entries.map((en) => en.kind === 'cardio' ? en : { ...en, sets: en.sets.filter((s) => s.reps > 0 || s.sec > 0 || s.m > 0) }).filter(filled);
        if (!use.length) { cur.err = 'Enter at least one set or a time first.'; q('#glErr').textContent = cur.err; return; }
        g.disabled = true; const done = cur.onSave; try { await done(use); dlg.close(); } finally { g.disabled = false; }
      }
    });
  }
  function customEntry(id, name) {
    const kind = Burn.kindOf(MAP[id]);
    if (kind === 'cardio') { const f = {}; Burn.FORMS[id].forEach((fd) => { f[fd.k] = fd.def; }); return { id, kind, f, name }; }
    return { id, kind, name, rest: 75, sets: [{ kg: null, reps: 10 }, { kg: null, reps: 10 }, { kg: null, reps: 10 }] };
  }
  function openCustom(o) {
    ensure(); cur = { custom: true, name: '', entries: [customEntry('custom-lift', '')], onSave: o.onSave, err: '' };
    q('#glTitle').textContent = 'Log something else'; q('#glSub').textContent = 'For anything that is not in the app. Type what it was and pick the format that fits.';
    render(); dlg.showModal();
  }
  /* items: plan items {id, sets, reps, rest, dur}; log: previous log entries (for last-time weights) */
  function open(items, o) {
    ensure(); o = o || {};
    const entries = items.filter((it) => MAP[it.id]).map((it) => {
      const x = MAP[it.id], kind = Burn.kindOf(x), last = LAST(o.log || [], it.id);
      if (kind === 'cardio') { const f = {}; Burn.FORMS[it.id].forEach((fd) => { f[fd.k] = last && last.f && last.f[fd.k] != null ? last.f[fd.k] : fd.def; }); if (it.dur && f.min !== undefined) f.min = firstNum(String(it.dur).split(/[–-]/).pop()) || f.min; return { id: it.id, kind, f, last }; }
      const n = Math.max(1, Math.min(8, +it.sets || 3)), reps = firstNum(it.reps), base = last && last.sets && last.sets[0] ? last.sets[0] : {};
      const mk = () => kind === 'hold' ? { sec: base.sec || 30, kg: base.kg || null } : kind === 'carry' ? { kg: base.kg || null, m: base.m || 30 } : kind === 'bw' ? { reps, kg: base.kg || null } : { kg: base.kg || null, reps };
      return { id: it.id, kind, last, rest: it.rest, sets: Array.from({ length: n }, mk) };
    });
    cur = { entries, onSave: o.onSave, err: '' };
    q('#glTitle').textContent = o.title || 'Log workout';
    q('#glSub').textContent = entries.some((e) => e.kind !== 'cardio') ? 'Enter what you actually did. Remove sets you skipped with ✕.' : 'Enter what your machine or watch shows.';
    render(); dlg.showModal();
  }
  window.GymLog = { open, openCustom, MAP };
})();
