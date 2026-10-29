/* Plate: Today tab. Photo/text -> AI estimate -> editable result sheet -> save.
   AI does the looking; all arithmetic (totals, scaling, sanity checks) is plain code. */
(function () {
  'use strict';
  const { $, esc } = window.Plate;
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const num = (v) => { v = parseFloat(v); return isFinite(v) && v >= 0 ? v : 0; };
  const r0 = (v) => Math.round(v);
  const SCALES = [0.5, 0.75, 1, 1.5, 2];
  const UNITS = ['g', 'ml', 'piece', 'serving'];
  const UNIT_LABEL = { g: 'grams', ml: 'ml', piece: 'pieces', serving: 'servings' };

  let state = null;   // { items, scale, confidence, note, source, existing, text, photoName }

  /* ---------- sanity checks on what the AI returned ---------- */
  function cleanItem(it) {
    const p = num(it.protein), c = num(it.carbs), f = num(it.fat);
    let kcal = num(it.kcal);
    const fromMacros = 4 * p + 4 * c + 9 * f;
    if (fromMacros > 0 && (kcal === 0 || Math.abs(kcal - fromMacros) / fromMacros > 0.25)) kcal = fromMacros;
    kcal = r0(kcal);
    let low = r0(kcal * 0.75), high = r0(kcal * 1.25);   // never trust the AI's own range: unverified figures get the wide one
    let amount = parseFloat(it.amount), unit = String(it.unit || '').toLowerCase();
    if (!UNITS.includes(unit)) unit = 'serving';
    if (!(amount > 0)) { amount = 1; unit = 'serving'; }
    return { name: String(it.name || 'Food').slice(0, 60), brand: it.brand || null, kind: ['packaged', 'restaurant', 'homemade'].includes(it.kind) ? it.kind : null, portion: String(it.portion || ''),
      basis: it.basis === 'brand' ? 'brand' : 'estimate', std: it.std ? String(it.std).slice(0, 60) : '', delta: isFinite(parseFloat(it.delta_kcal)) ? Math.max(-1500, Math.min(1500, parseFloat(it.delta_kcal))) : 0, amount: Math.round(amount * 10) / 10, unit,
      kcal, protein: r0(p), carbs: r0(c), fat: r0(f), low, high };
  }

  /* ---------- consistency: same food = same numbers, however it was worded ---------- */
  const STOP = new Set(['the','a','an','of','with','and','in','on','my','some','plain','classic','original','normal','fresh','large','small','medium','big','regular','glass','cup','bottle','can','pack','piece','pieces','serving','servings','slice','slices','ml','l','g','kg','litre','liter','litres','liters','gram','grams','x']);
  function canon(brand, name) {
    let t = (String(brand || '') + ' ' + String(name || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/coca[\s-]*cola|\bcoke\b/g, 'cocacola').replace(/mcdonald'?s/g, 'mcdonalds');
    const w = t.split(/[^a-z0-9]+/).filter((x) => x && !/^\d/.test(x) && !STOP.has(x));
    return Array.from(new Set(w)).sort().join(' ');
  }
  async function applyCache(items) {
    const cache = await DB.get('itemCache', {}) || {};
    items.forEach((it) => {
      const hit = cache[canon(it.brand, it.name)];
      if (it.labelHit || !hit || hit.u !== it.unit || !(it.amount > 0)) return;
      ['kcal', 'protein', 'carbs', 'fat'].forEach((k) => { it[k] = r0(hit.per[k] * it.amount); });
      it.low = r0(it.kcal * 0.85); it.high = r0(it.kcal * 1.15); it.cached = true;
    });
  }
  /* Real label figures, saved the first time they are found so the same product never needs another lookup. */
  async function applyLabels(items) {
    const cache = (await DB.get('labelCache', {})) || {};
    items.forEach((it) => {
      if (!it.brand || !(it.amount > 0)) return;
      const hit = cache[canon(it.brand, it.name)];
      if (!hit || hit.u !== it.unit) return;
      ['kcal', 'protein', 'carbs', 'fat'].forEach((k) => { it[k] = r0(hit.per[k] * it.amount); });
      const solid = hit.basis === 'brand';
      it.low = r0(it.kcal * (solid ? 0.92 : 0.85)); it.high = r0(it.kcal * (solid ? 1.08 : 1.15)); it.basis = hit.basis;
      it.portion = it.amount + ' ' + (it.unit === 'serving' ? 'serving' : it.unit) + ' · ' + hit.label + ' · saved';
      it.labelHit = true;
    });
  }
  async function saveLabels(items) {
    const cache = (await DB.get('labelCache', {})) || {};
    items.forEach((it) => {
      if (!it.brand || !(it.amount > 0) || !(it.kcal > 0) || (it.basis !== 'brand' && it.basis !== 'web')) return;
      const lab = String(it.portion || '').split(' · ')[1] || 'label';
      cache[canon(it.brand, it.name)] = { u: it.unit, basis: it.basis, label: lab, per: { kcal: it.kcal / it.amount, protein: it.protein / it.amount, carbs: it.carbs / it.amount, fat: it.fat / it.amount } };
    });
    const ks = Object.keys(cache); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach((k) => delete cache[k]);
    await DB.set('labelCache', cache);
  }
  async function rememberItems(items) {
    const cache = (await DB.get('itemCache', {})) || {};
    items.forEach((it) => {
      if (!(it.amount > 0) || !(it.kcal > 0) || !canon(it.brand, it.name)) return;
      cache[canon(it.brand, it.name)] = { u: it.unit, per: { kcal: it.kcal / it.amount, protein: it.protein / it.amount, carbs: it.carbs / it.amount, fat: it.fat / it.amount } };
    });
    const ks = Object.keys(cache); if (ks.length > 400) ks.slice(0, ks.length - 400).forEach((k) => delete cache[k]);
    await DB.set('itemCache', cache);
  }

  /* ---------- result sheet ---------- */
  const dlg = () => $('#mealDlg');
  function field(i, key, label, cls) {
    if (state.items[i].loading) return `<label class="mini ${cls || ''}"><span>${label}</span><div class="ldv" aria-label="Looking up the real figures"><i></i><i></i><i></i></div></label>`;
    return `<label class="mini ${cls || ''}"><span>${label}</span><input inputmode="decimal" data-i="${i}" data-k="${key}" value="${state.items[i][key]}"></label>`;
  }
  function renderSheet() {
    $('#mealTitle').textContent = state.existing ? 'Edit meal' : 'Check and save';
    const conf = state.confidence ? `<span class="chip ${esc(state.confidence)}">${esc(state.confidence)} confidence</span>` : '';
    $('#mealNote').innerHTML = (state.note ? esc(state.note) + ' ' : '') + conf;
    $('#mealItems').innerHTML = state.items.map((it, i) => `
      <div class="item">
        <input class="nameIn" data-i="${i}" data-k="name" value="${esc(it.name)}" aria-label="Food name">
        ${it.portion ? `<div class="portion">${esc(it.portion)}${it.basis === 'brand' ? ' · brand data' : it.basis === 'web' ? ' · web figures, approximate' : ''}</div>` : ''}
        <div class="amt"><label class="mini"><span>Amount (${UNIT_LABEL[it.unit] || 'servings'})</span><input inputmode="decimal" data-i="${i}" data-k="amount" value="${it.amount}"></label><small>Calories and macros follow the amount.</small></div>
        <div class="grid4">${field(i, 'kcal', 'kcal')}${field(i, 'protein', 'Protein g')}${field(i, 'carbs', 'Carbs g')}${field(i, 'fat', 'Fat g')}</div>
        ${it.brand && !it.loading && state.source === 'ai' && it.basis !== 'brand' && it.basis !== 'web' ? `<button type="button" class="link rm" data-retry="${i}">Search again for real figures</button>` : ''}
        ${state.items.length > 1 ? `<button type="button" class="link rm" data-rm="${i}">Remove</button>` : ''}
      </div>`).join('');
    $('#scaleRow').innerHTML = SCALES.map((s) => `<button type="button" class="seg${s === state.scale ? ' on' : ''}" data-scale="${s}">${s === 1 ? '1×' : s + '×'}</button>`).join('');
    $('#scaleRow').hidden = !!state.existing;
    $('#deleteMeal').hidden = !state.existing;
    $('#editDesc').hidden = !state.fromForm;
    totals();
  }
  function totals() {
    const t = state.items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, p: a.p + it.protein, c: a.c + it.carbs, f: a.f + it.fat, low: a.low + it.low, high: a.high + it.high }),
      { kcal: 0, p: 0, c: 0, f: 0, low: 0, high: 0 });
    const busy = state.items.some((it) => it.loading), sv = $('#mealForm button[type="submit"]'); if (sv) sv.disabled = busy;
    if (busy) { $('#mealTotal').innerHTML = '<b>… kcal</b><span>Looking up the real label for the brand…</span>'; return t; }
    $('#mealTotal').innerHTML = `<b>${r0(t.kcal)} kcal</b><span>${t.p} g protein · ${t.c} g carbs · ${t.f} g fat</span>` +
      (t.kcal && state.source === 'ai' ? `<small>Likely range ${t.low}–${t.high} kcal</small>` : '');
    return t;
  }
  /* The logic step. Each item keeps a base (values at a base amount). Everything shown is
     base x (amount / baseAmount), so less food can never give more calories. */
  const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'low', 'high'];
  const snap = (it) => { it._b = { amount: it.amount }; KEYS.forEach((k) => { it._b[k] = it[k]; }); };
  const ratio = (it) => (it._b.amount > 0 ? it.amount / it._b.amount : 1);
  function recompute(it) { const f = ratio(it); KEYS.forEach((k) => { it[k] = r0(it._b[k] * f); }); }
  function rebase(it, keys) { const f = ratio(it); if (f <= 0) return; keys.forEach((k) => { it._b[k] = it[k] / f; }); }
  function syncInputs(i, skip) {
    const row = $('#mealItems').children[i]; if (!row) return;
    row.querySelectorAll('input[data-k]').forEach((el) => {
      if (el === skip || el.dataset.k === 'name') return;
      el.value = state.items[i][el.dataset.k];
    });
  }
  function openSheet(s) { state = s; state.items.forEach(snap); renderSheet(); dlg().showModal(); }

  let lastTyped = 0;
  $('#mealItems').addEventListener('input', (e) => {
    lastTyped = Date.now();
    const el = e.target, i = +el.dataset.i, k = el.dataset.k;
    if (isNaN(i)) return;
    const it = state.items[i];
    if (k === 'name') { it.name = el.value; return; }
    if (k === 'amount') {                                   // proportional: base x amount / baseAmount
      it.amount = Math.round(num(el.value) * 10) / 10;
      recompute(it);
      state.scale = null; $('#scaleRow').querySelectorAll('.seg').forEach((b) => b.classList.remove('on'));
    } else if (k === 'kcal') {                              // you set the calories for this amount: rebase
      const old = it.kcal, v = r0(num(el.value));
      if (old > 0) { const f = v / old; it.low = r0(it.low * f); it.high = r0(it.high * f); } else { it.low = v; it.high = v; }
      it.kcal = v; rebase(it, ['kcal', 'low', 'high']);
    } else {                                                // a macro changed: calories move by the same energy
      const old = it[k], v = r0(num(el.value)), kc = k === 'fat' ? 9 : 4;
      it[k] = v;
      const nk = Math.max(0, it.kcal + kc * (v - old));
      if (it.kcal > 0) { const f = nk / it.kcal; it.low = r0(it.low * f); it.high = r0(it.high * f); }
      it.kcal = r0(nk);
      rebase(it, [k, 'kcal', 'low', 'high']);
    }
    syncInputs(i, el); totals();
  });
  $('#mealItems').addEventListener('click', async (e) => {
    const rt = e.target.closest('[data-retry]');
    if (rt) {
      const it = state.items[+rt.dataset.retry], st0 = state; if (!it) return;
      it.loading = true; renderSheet();
      const region = (await DB.get('region', 'Qatar')) || 'Qatar';
      verifyBrands(st0, [it], region, true, { confidence: st0.confidence }, true).catch(() => { it.loading = false; if (state === st0) { st0.note = 'The search did not work. Check your connection and try again.'; renderSheet(); } });
      return;
    }
    const b = e.target.closest('[data-rm]'); if (!b) return;
    state.items.splice(+b.dataset.rm, 1); renderSheet();
  });
  $('#scaleRow').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scale]'); if (!b) return;
    const ns = parseFloat(b.dataset.scale);
    state.items.forEach((it) => { it.amount = Math.round(it._b.amount * ns * 10) / 10; recompute(it); });
    state.scale = ns; renderSheet();
  });
  $('#addItem').addEventListener('click', () => {
    state.items.push({ name: 'Extra item', brand: null, portion: '', basis: 'estimate', amount: 1, unit: 'serving', kcal: 0, protein: 0, carbs: 0, fat: 0, low: 0, high: 0 });
    snap(state.items[state.items.length - 1]); renderSheet();
  });
  $('#cancelMeal').addEventListener('click', () => dlg().close());
  $('#editDesc').addEventListener('click', () => { dlg().close(); const m = $('#mealText'); m.focus(); m.setSelectionRange(m.value.length, m.value.length); say('Change the description and tap Estimate again.'); });
  const syncClear = () => { $('#mealClear').hidden = !($('#mealText').value || $('#mealPhoto').files[0]); };
  $('#mealText').addEventListener('input', syncClear); $('#mealPhoto').addEventListener('change', syncClear); $('#photoX').addEventListener('click', () => setTimeout(syncClear, 0));
  $('#mealClear').addEventListener('click', () => { $('#mealText').value = ''; clearPhoto(); syncClear(); say(''); $('#mealText').focus(); });

  /* ---------- history cache: foods you already logged cost nothing to log again ---------- */
  async function remember(meal, key) {
    if (!key) return;
    const cache = await DB.get('foodCache', {});
    cache[key] = { name: meal.name, items: meal.items, confidence: 'high' };
    const keys = Object.keys(cache);
    if (keys.length > 300) delete cache[keys[0]];
    await DB.set('foodCache', cache);
  }

  $('#mealForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = state.items.filter((it) => it.name.trim() || it.kcal);
    if (!items.length) { dlg().close(); return; }
    const t = totals();
    const data = {
      name: items.map((i) => i.name.trim() || 'Food').join(' + ').slice(0, 90),
      kcal: r0(t.kcal), protein: t.p, carbs: t.c, fat: t.f, low: t.low, high: t.high,
      items: items.map(({ _b, ...rest }) => rest), source: state.source, confidence: state.confidence || null,
    };
    if (state.existing) await DB.updateMeal(Object.assign({}, state.existing, data));
    else {
      const vd = window.Plate.viewDay ? window.Plate.viewDay() : DB.dayKey();
      if (vd !== DB.dayKey()) { const n = new Date(), [y, mo, d] = vd.split('-').map(Number); data.date = vd; data.ts = new Date(y, mo - 1, d, n.getHours(), n.getMinutes()).getTime(); }
      const meal = await DB.addMeal(data);
      await remember(meal, state.cacheKey);
      await remember(meal, norm(data.name));
      $('#mealText').value = ''; clearPhoto(); $('#mealClear').hidden = true;
    }
    await rememberItems(items); await saveLabels(items);
    dlg().close();
    window.Plate.refreshToday();
  });

  $('#deleteMeal').addEventListener('click', async () => {
    if (!state.existing) return;
    const gone = Object.assign({}, state.existing);
    await DB.deleteMeal(gone.id);
    dlg().close(); window.Plate.refreshToday();
    window.Plate.toast('Meal deleted', 'Undo', async () => { await DB.updateMeal(gone); window.Plate.refreshToday(); });
  });

  /* ---------- photo preview ---------- */
  let previewUrl = null;
  function clearPhoto() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('#mealPhoto').value = ''; $('#fileName').textContent = '';
    $('#photoPrev').hidden = true; $('#photoImg').removeAttribute('src');
  }
  $('#mealPhoto').addEventListener('change', () => {
    const f = $('#mealPhoto').files[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) { clearPhoto(); return; }
    previewUrl = URL.createObjectURL(f);
    $('#photoImg').src = previewUrl; $('#photoPrev').hidden = false; $('#fileName').textContent = '';
  });
  $('#photoX').addEventListener('click', clearPhoto);

  /* ---------- web facts (cached, so a repeat costs no search credit) ---------- */
  async function webFacts(it, region, deep) {
    const key = norm([it.brand, it.name, region].join(' '));
    const cache = await DB.get('lookupCache', {});
    if (cache[key] && !deep) return cache[key];
    const w = await AI.lookup({ brand: it.brand, name: it.name, amount: it.amount, unit: it.unit, region, deep: !!deep });
    if (w && w.kcal > 0) {
      cache[key] = w;
      const keys = Object.keys(cache); if (keys.length > 200) delete cache[keys[0]];
      await DB.set('lookupCache', cache);
    }
    return w && w.kcal > 0 ? w : null;
  }
  function fromWeb(it, w) {
    let f;
    if (w.per === '100g' || w.per === '100ml') f = it.amount / 100;
    else if (w.per === 'total') f = 1;                                             // already added up for everything eaten
    else if (w.per === 'piece') f = (it.unit === 'g' || it.unit === 'ml') ? 1 : Math.max(0.1, it.amount);   // one item: times how many were eaten
    else if (w.serving_g > 0 && (it.unit === 'g' || it.unit === 'ml')) f = it.amount / w.serving_g;
    else f = (it.unit === 'serving') ? Math.max(0.1, it.amount) : 1;               // one portion as sold: times the servings eaten
    let host = ''; try { host = new URL(w.source).hostname.replace(/^www\./, ''); } catch (e) {}
    const bt = String(it.brand || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length > 2);
    const official = !!host && bt.some((t) => host.replace(/[^a-z0-9.]/g, '').includes(t));
    return { kcal: num(w.kcal) * f, protein: num(w.protein) * f, carbs: num(w.carbs) * f, fat: num(w.fat) * f,
      label: (official ? 'label: ' : 'web: ') + (host || 'web'), via: host || 'web', web: true, official, regionOk: w.region_match !== false };
  }

  /* ---------- the estimate flow ---------- */
  function say(msg, kind) { const s = $('#logStatus'); s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : ''); }

  const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
  /* checks every branded item at the same time (Open Food Facts first, then a web lookup), then updates the open sheet */
  async function verifyBrands(st, items, region, webOn, r, deep) {
    const verified = [], looser = [], webNotes = [];
    await Promise.all(items.map(async (it) => {
      if (!it.brand || !(it.amount > 0) || it.labelHit) return;
      let got = null;
      try {
        if (!deep && (it.unit === 'g' || it.unit === 'ml') && it.kind !== 'restaurant') {
          const m = await withTimeout(Lookup.off(Object.assign({}, it, { name: it.std || it.name }), region), 4000);
          if (m && m.per100.kcal <= 900) { const f = it.amount / 100; got = { kcal: m.per100.kcal * f, protein: m.per100.protein * f, carbs: m.per100.carbs * f, fat: m.per100.fat * f, label: 'label: ' + m.product, via: 'Open Food Facts' }; }
        }
        if (!got && webOn) {
          AI.lastLookup = null;
          const w = await withTimeout(webFacts(Object.assign({}, it, { name: it.std || it.name }), region, deep), deep ? 30000 : 18000);
          if (w) got = fromWeb(it, w);
          else {                                                // say why nothing was found, so it is not a mystery
            const L = AI.lastLookup;
            if (!L) webNotes.push('the search took too long');
            else if (!L.ver) webNotes.push('your server code is out of date: redeploy worker.js for the better search');
            else if (L.seen && L.seen.length) webNotes.push('searched ' + (L.tried || 1) + ' time(s) and read ' + L.seen.join(', ') + ' but none gave clear figures for this item');
            else webNotes.push('the search returned no pages for this item');
          }
        }
      } catch (e) { webNotes.push('web lookup failed (' + String(e.message).slice(0, 70) + ')'); }
      // Sanity gate: a label that is wildly off from the AI's own estimate is probably the wrong product, so ignore it.
      const wide = got && got.web;                                              // a web page read by the search is trusted over the AI's memory (which can be badly off for multi-piece meals), within reason
      if (got && it.kcal > 0 && (got.kcal > it.kcal * (wide ? 4 : 2) || got.kcal < it.kcal * (wide ? 0.25 : 0.5))) {
        webNotes.push(it.name + ': found ' + r0(got.kcal) + ' kcal on ' + got.via + ' but it is too far from the estimate (' + r0(it.kcal) + ') to trust, so it was ignored');
        got = null;
      }
      if (!got) return;
      if (it.std && it.delta && got.kcal + it.delta > 0) {     // label is for the standard item: apply the change (e.g. no cheese = -50 kcal) proportionally
        const f = (got.kcal + it.delta) / got.kcal; got.kcal *= f; got.protein *= f; got.carbs *= f; got.fat *= f; got.label += ' (adjusted ' + (it.delta > 0 ? '+' : '') + r0(it.delta) + ' kcal)';
      }
      it.kcal = r0(got.kcal); it.protein = r0(got.protein); it.carbs = r0(got.carbs); it.fat = r0(got.fat);
      const solid = !got.web || (got.official && got.regionOk);
      it.low = r0(it.kcal * (solid ? 0.92 : 0.85)); it.high = r0(it.kcal * (solid ? 1.08 : 1.15)); it.basis = solid ? 'brand' : 'web';
      it.portion = it.amount + ' ' + (it.unit === 'serving' ? 'serving' : it.unit) + ' · ' + got.label;
      (solid ? verified : looser).push(it.name + ' (' + got.via + ')');
    }));
    if (state !== st) return;                                   // the sheet was closed or replaced meanwhile
    items.forEach((it) => { it.loading = false; });
    saveLabels(items).catch(() => {});                          // keep what was found, so this product is instant next time
    let conf = st.confidence, note;
    const unverified = st.items.filter((it) => it.basis !== 'brand' && it.basis !== 'web').length;
    if (verified.length || looser.length) {
      note = (verified.length ? 'Real label data: ' + verified.join(', ') + '. ' : '') +
        (looser.length ? 'Found online, but not an official ' + region + ' source: ' + looser.join(', ') + '. Treat as approximate. ' : '') + (unverified ? 'The rest is estimated.' : '');
      if (verified.length && String(r.confidence) === 'high') conf = 'high';
    } else {
      const names = items.filter((i) => i.brand && i.amount > 0).map((i) => i.name).slice(0, 2).join(', ');
      note = names ? `Couldn't find real figures online for ${names}, so these are estimates. You can tap "Search again" below to dig deeper.` : 'Estimated.';
    }
    if (webNotes.length) note += ' ' + webNotes.join('; ') + '.';
    st.confidence = conf; st.note = note.trim(); st.items.forEach(snap);
    const apply = (n) => {
      if (state !== st) return;
      if (Date.now() - lastTyped < 2500 && n < 8) { setTimeout(() => apply(n + 1), 1200); return; }   // don't pull the box away while they are actually typing
      renderSheet();
    };
    apply(0);
  }

  let estCtl = null;
  window.Plate.estimate = async function () {
    if (estCtl) { estCtl.abort(); return; }                    // the button is a Stop button while an estimate is running
    const text = $('#mealText').value.trim();
    const file = $('#mealPhoto').files[0];
    const ref = $('#refObj').value;
    if (!text && !file) { say('Add a photo or describe the meal first.', 'bad'); $('#mealText').focus(); return; }
    say('');

    // 1. already logged this exact description before? reuse it, no AI call
    if (text && !file) {
      const hit = (await DB.get('foodCache', {}))[norm(text)];
      if (hit) {
        openSheet({ items: hit.items.map((i) => Object.assign({}, i)), scale: 1, confidence: null,
          note: 'From your history.', source: 'history', cacheKey: norm(text), fromForm: true });
        return;
      }
    }

    // 2. ask the AI
    const btn = $('#estimateBtn'); estCtl = new AbortController(); const sig = estCtl.signal; btn.classList.add('stop'); btn.textContent = 'Stop';
    const t0 = Date.now(), tick = setInterval(() => { btn.textContent = 'Stop · ' + Math.round((Date.now() - t0) / 1000) + 's'; }, 1000);
    try {
      const images = file ? [await AI.imageToBase64(file, 768, 0.7)] : [];
      const refTxt = file && ref ? `Object in the photo for scale: ${ref}.\n` : '';
      const region = (await DB.get('region', 'Qatar')) || 'Qatar';
      const r = await AI.askJSON({
        task: 'log', system: Prompts.LOG, images, max_tokens: 450, timeout: 28000, signal: sig,
        text: refTxt + (text ? `User description: ${text}` : 'No description given; judge from the photo.') + '\n' + Prompts.region(region),
      });
      if (sig.aborted) return;
      const items = (Array.isArray(r.items) ? r.items : []).slice(0, 8).map(cleanItem);
      // Nothing counts as "brand data" until a real source backs it; until then it is the AI's memory.
      items.forEach((it) => { it.basis = 'estimate'; });
      await applyLabels(items); await applyCache(items);
      if (!items.length) { say(r.note || 'I could not find any food. Try a clearer photo or describe it.', 'bad'); return; }

      // Show the estimate right away; branded items are checked against real labels in the background and upgrade in place.
      let conf = ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'medium';
      const webOn = true, hasBrand = items.some((it) => it.brand && it.amount > 0 && !it.labelHit);
      if (conf === 'high') conf = 'medium';
      const st = { items, scale: 1, confidence: conf, note: hasBrand ? 'Estimated. Checking brand labels…' : items.some((i) => i.labelHit) ? 'Real label figures, saved from when you looked this up before.' : items.some((i) => i.cached) ? 'Uses the numbers from when you logged this food before.' : 'Estimated.', source: 'ai', cacheKey: text ? norm(text) : '', fromForm: true };
      items.forEach((it) => { if (it.brand && it.amount > 0 && !it.labelHit) it.loading = true; });      // brand items show a loading mark until the real label is found
      st.note = hasBrand ? 'Looking up the real label for the brand…' : st.note;
      openSheet(st);
      if (hasBrand) verifyBrands(st, items, region, webOn, r).catch(() => { items.forEach((it) => { it.loading = false; }); if (state === st) { st.note = 'Could not check the label, so these are estimates.'; renderSheet(); } });
    } catch (err) {
      if (err.cancelled || sig.aborted) say('Stopped. Your text is still there.'); else say(err.message, 'bad');
    } finally { clearInterval(tick); estCtl = null; btn.classList.remove('stop'); btn.disabled = false; btn.textContent = 'Estimate'; }
  };

  $('#manualBtn').addEventListener('click', () => {
    const text = $('#mealText').value.trim();
    openSheet({ items: [{ name: text || '', brand: null, portion: '', basis: 'estimate', amount: 1, unit: 'serving', kcal: 0, protein: 0, carbs: 0, fat: 0, low: 0, high: 0 }],
      scale: 1, confidence: null, note: 'Enter the numbers yourself.', source: 'manual', cacheKey: norm(text) });
  });

  window.Plate.editMeal = async function (id) {
    const meals = await DB.mealsOn(window.Plate.viewDay ? window.Plate.viewDay() : DB.dayKey());
    const m = meals.find((x) => x.id === id); if (!m) return;
    const items = (m.items && m.items.length ? m.items : [{ name: m.name, kcal: m.kcal, protein: m.protein || 0, carbs: m.carbs || 0, fat: m.fat || 0, low: m.low || m.kcal, high: m.high || m.kcal }])
      .map((i) => Object.assign({ brand: null, portion: '', basis: 'estimate', amount: 1, unit: 'serving' }, i));
    openSheet({ items, scale: 1, confidence: m.confidence, note: '', source: m.source || 'manual', existing: m });
  };
})();
