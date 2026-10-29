/* Plate: Recipes tab. Chat generates recipes (Gemini); a second model (gpt-oss-120b on Groq) double-checks the
   nutrition; saved recipes live on the phone with favorites, ratings and a cooked history. All arithmetic is plain code. */
(function () {
  'use strict';
  const { $, $$, esc } = window.Plate;
  const r0 = Math.round;
  const num = (v) => { v = parseFloat(v); return isFinite(v) && v >= 0 ? v : 0; };
  const chat = { id: null, msgs: [], current: null, cons: null, busy: false, edit: null, ctl: null };
  let view = { tab: 'create', filter: 'all', sort: 'new', q: '' };
  let det = null, rateDraft = 0, deleteArmed = false;       // det: the saved recipe open in the sheet {id, sv, mode, draft}
  const sg = (g) => (g <= 0 ? 0 : g >= 50 ? Math.round(g / 5) * 5 : Math.max(1, r0(g)));   // tidy gram amounts after scaling
  const fmtDur = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  /* ---------- cleaning what the AI returns ---------- */
  function fixMacros(m) {
    m = m || {};
    const p = num(m.protein), c = num(m.carbs), f = num(m.fat), mk = 4 * p + 4 * c + 9 * f;
    let k = num(m.kcal);
    if (mk > 0 && (k === 0 || Math.abs(k - mk) / mk > 0.25)) k = mk;       // kcal must agree with the macros
    return { kcal: r0(k), protein: r0(p), carbs: r0(c), fat: r0(f) };
  }
  /* cook-friendly measures: the model gives grams (for the maths) and qty {n,u} (what the cook reads) */
  const QU = { tsp: 12, tbsp: 40, cup: 350, ml: 1e9, l: 1e9, kg: 1e9, pinch: 3, piece: 1e9, clove: 12, slice: 1e9, can: 1e9, bunch: 1e9, sprig: 5, handful: 1e9 };   // unit -> max plausible grams per unit (guards against a wrong measure)
  function cleanQty(i, grams) {
    const q = i.qty || (i.amount != null ? { n: i.amount, u: i.unit } : null); if (!q) return null;
    const n = parseFloat(q.n), u = String(q.u || '').toLowerCase().replace(/s$/, '').replace('teaspoon', 'tsp').replace('tablespoon', 'tbsp');
    if (!(n > 0) || !(u in QU) || n > 5000) return null;
    if (grams > 0 && (u === 'tsp' || u === 'tbsp' || u === 'cup' || u === 'clove' || u === 'pinch' || u === 'sprig') && grams / n > QU[u]) return null;
    return { n: Math.round(n * 100) / 100, u };
  }
  const FR = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
  function fmtN(n) {
    if (n >= 10) return String(Math.round(n));
    const w = Math.floor(n), f = n - w; let best = FR[0], d = 9;
    FR.forEach((x) => { if (Math.abs(x[0] - f) < d) { d = Math.abs(x[0] - f); best = x; } });
    const whole = best[0] === 1 ? w + 1 : w;
    return (whole ? String(whole) : '') + (best[0] > 0 && best[0] < 1 ? best[1] : '') || '0';
  }
  const ULAB = { tsp: ' tsp', tbsp: ' tbsp', ml: ' ml', l: ' L', kg: ' kg', piece: '', pinch: ' pinch', clove: ' clove', slice: ' slice', can: ' can', bunch: ' bunch', sprig: ' sprig', handful: ' handful', cup: ' cup' };
  function qtyText(i, k) {
    const q = i.qty;
    if (q && q.u && q.u !== 'g' && q.n > 0) {
      let n = q.n * k, u = q.u;
      if (u === 'tsp' && n >= 3) { n /= 3; u = 'tbsp'; }
      if (u === 'tbsp' && n >= 4) { n /= 16; u = 'cup'; }
      if (u === 'ml' && n >= 1000) { n /= 1000; u = 'l'; }
      if (u === 'tsp' && n < 0.2) return 'pinch';
      const t = fmtN(n), pl = (u === 'clove' || u === 'slice' || u === 'can' || u === 'bunch' || u === 'sprig' || u === 'handful' || u === 'cup') && t !== '1' && t !== '½' && t !== '¼' && t !== '¾' && t !== '⅓' && t !== '⅔';
      return t + ULAB[u] + (pl ? (u === 'bunch' ? 'es' : 's') : '');
    }
    return i.grams ? sg(i.grams * k) + ' g' : '';
  }
  function cleanRecipe(x) {
    if (!x || typeof x !== 'object') return null;
    const ing = (Array.isArray(x.ingredients) ? x.ingredients : []).slice(0, 16)
      .map((i) => { const g = r0(num(i.grams)); return { item: String(i.item || '').slice(0, 60), grams: g, qty: cleanQty(i, g), note: String(i.note || '').slice(0, 50) }; }).filter((i) => i.item);
    const steps = (Array.isArray(x.steps) ? x.steps : []).slice(0, 12).map((s) => String(s).slice(0, 300)).filter(Boolean);
    if (ing.length < 2 || !steps.length) return null;
    return {
      title: String(x.title || 'Recipe').slice(0, 80), description: String(x.description || '').slice(0, 200),
      servings: Math.min(12, Math.max(1, r0(num(x.servings)) || 2)), time_min: r0(num(x.time_min)),
      tags: (Array.isArray(x.tags) ? x.tags : []).slice(0, 4).map((t) => String(t).slice(0, 24)),
      ingredients: ing, steps, per_serving: fixMacros(x.per_serving), verify: 'none',
    };
  }

  /* the model only looks up per-100 g values; the multiplying and adding is plain code, so the arithmetic cannot be wrong */
  function sumChecker(r, c) {
    const arr = Array.isArray(c && c.items) ? c.items : [];
    if (!arr.length || arr.length !== r.ingredients.length) return null;
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }, parts = [];
    for (let i = 0; i < arr.length; i++) {
      let x = arr[i] || {}, p = num(x.protein), cb = num(x.carbs), f = num(x.fat), mk = 4 * p + 4 * cb + 9 * f;
      if (p + cb + f > 105) return null;                                        // more than 100 g of nutrients in 100 g of food: bad data
      let k = num(x.kcal); if (mk > 0 && (k === 0 || Math.abs(k - mk) / mk > 0.25)) k = mk;
      let q = 1;                                                                // safety net: a cooked grain/pulse can't carry dry-food numbers
      const ing = r.ingredients[i];
      if (/\b(cooked|boiled|steamed|ready to eat)\b/i.test(ing.item + ' ' + (ing.note || '')) && cb > 55 && k > 250) q = 0.36;
      p *= q; cb *= q; f *= q; k *= q;
      const g = (r.ingredients[i].grams || 0) / 100;
      t.kcal += k * g; t.protein += p * g; t.carbs += cb * g; t.fat += f * g; parts.push({ item: ing.item, kcal: r0(k * g / Math.max(1, r.servings)), protein: r0(p * g / Math.max(1, r.servings)), carbs: r0(cb * g / Math.max(1, r.servings)), fat: r0(f * g / Math.max(1, r.servings)) });
    }
    const sv = Math.max(1, r.servings);
    const m = fixMacros({ kcal: t.kcal / sv, protein: t.protein / sv, carbs: t.carbs / sv, fat: t.fat / sv });
    if (m.kcal > 0) m.parts = parts;
    return m.kcal > 0 ? m : null;
  }

  /* ---------- nutrition: calculated from the ingredients (the most accurate method), not guessed ---------- */
  function checkPayload(r) {
    return JSON.stringify({
      recipe: r.title, servings: r.servings,
      cooking_steps: (r.steps || []).join(' ').slice(0, 700),                       // shows which ingredients are cooked first, fried, boiled...
      ingredients: r.ingredients.map((i) => ({ item: i.item, preparation_or_state: i.note || '', as_written: qtyText({ qty: i.qty, grams: i.grams }, 1), grams: i.grams })),
    });
  }
  async function calcNutrition(r) {
    const c = await AI.askJSON({ task: 'check', system: Prompts.CHECK, text: checkPayload(r), max_tokens: 900 });
    return sumChecker(r, c);
  }
  async function verify(r) {
    try {
      const m = await calcNutrition(r);
      if (!m) throw new Error('empty');
      r.draft = r.per_serving; r.check = m; r.parts = m.parts; r.per_serving = { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat }; r.verify = 'calc';
    } catch (e) { r.verify = 'none'; }                                            // lookup unreachable: keep the draft figure, flagged as approximate
  }
  /* targets the user asks for (max calories, min protein, max carbs, max fat) are hard requirements: if the calculated figures break one, the recipe is rewritten and recalculated until it fits */
  function parseCons(t) {
    t = String(t || ''); const c = {}, n = (m) => (m ? +m[1] : 0), ok = (v, lo, hi) => (v >= lo && v <= hi ? v : 0);
    const kcal = ok(n(t.match(/(?:under|below|max(?:imum)?|at most|less than|no more than|up to|limit(?:ed)?(?: to| of)?|within|<)\s*(\d{3,4})\s*(?:k?cal|calories)?(?!\s*g\b)/i) || t.match(/(\d{3,4})\s*(?:k?cal|calories)\b/i)), 100, 3000);
    const prot = ok(n(t.match(/(?:at least|minimum(?: of)?|min|over|more than|no less than|>=?)\s*(\d{2,3})\s*g?\s*(?:of\s*)?protein/i) || t.match(/(\d{2,3})\s*g\s*(?:of\s*)?(?:or more\s*)?protein/i) ), 10, 300);
    const carbs = ok(n(t.match(/(?:under|below|max(?:imum)?|at most|less than|no more than|up to|<)\s*(\d{1,3})\s*g?\s*(?:of\s*)?carbs?/i)), 1, 300);
    const fat = ok(n(t.match(/(?:under|below|max(?:imum)?|at most|less than|no more than|up to|<)\s*(\d{1,3})\s*g?\s*(?:of\s*)?fat/i)), 1, 200);
    if (kcal) c.kcal = kcal; if (prot) c.protein = prot; if (carbs) c.carbs = carbs; if (fat) c.fat = fat;
    return Object.keys(c).length ? c : null;
  }
  const consBroken = (m, c) => {                                                        // how far over/under each requirement (0 = met, small tolerance)
    const v = [];
    if (c.kcal && m.kcal > c.kcal * 1.03) v.push({ k: 'kcal', gap: (m.kcal - c.kcal) / c.kcal, text: 'calories are ' + m.kcal + ' per serving but must be at most ' + c.kcal });
    if (c.protein && m.protein < c.protein * 0.97) v.push({ k: 'protein', gap: (c.protein - m.protein) / c.protein, text: 'protein is ' + m.protein + ' g per serving but must be at least ' + c.protein + ' g' });
    if (c.carbs && m.carbs > c.carbs * 1.05) v.push({ k: 'carbs', gap: (m.carbs - c.carbs) / c.carbs, text: 'carbs are ' + m.carbs + ' g but must be at most ' + c.carbs + ' g' });
    if (c.fat && m.fat > c.fat * 1.05) v.push({ k: 'fat', gap: (m.fat - c.fat) / c.fat, text: 'fat is ' + m.fat + ' g but must be at most ' + c.fat + ' g' });
    return v;
  };
  const consScore = (m, c) => consBroken(m, c).reduce((a, x) => a + x.gap, 0);
  async function fitCons(rec, cons, history, ctx, userText) {
    rec.cons = cons; let best = rec;
    for (let n = 0; n < 3 && consBroken(best.per_serving, cons).length; n++) {
      const broken = consBroken(best.per_serving, cons).map((x) => x.text).join('; ');
      const parts = (best.parts || []).map((p) => p.item + ': ' + p.kcal + ' kcal, ' + p.protein + ' g protein, ' + p.carbs + ' g carbs, ' + p.fat + ' g fat').join(' | ');
      const want = [cons.kcal ? 'at most ' + cons.kcal + ' kcal' : '', cons.protein ? 'at least ' + cons.protein + ' g protein' : '', cons.carbs ? 'at most ' + cons.carbs + ' g carbs' : '', cons.fat ? 'at most ' + cons.fat + ' g fat' : ''].filter(Boolean).join(' AND ');
      const msg = 'This recipe, as calculated, breaks what the user asked for: ' + broken + '. Every requirement must hold together per serving: ' + want + '. Keep any main ingredient the user named (chicken stays chicken). Rewrite the SAME kind of dish so ALL of them are met at once. To raise protein under a calorie limit use more lean protein (chicken or turkey breast, white fish, shrimp, egg whites, tuna, low-fat Greek yogurt, a scoop of protein powder where it suits the dish) and cut the fat and starch that waste calories (oil, cheese, rice, bread, sauces). Per serving now: ' + parts + '. Keep servings at exactly ' + best.servings + ' (do not change the number of servings to hit the numbers). Return the FULL recipe with grams and qty for every ingredient.\n\n' + ctx +
        '\nCurrent recipe: ' + JSON.stringify({ title: best.title, servings: best.servings, ingredients: best.ingredients.map((i) => ({ item: i.item, grams: i.grams, qty: i.qty, note: i.note })), steps: best.steps });
      let cand = null;
      try {
        const resp = await AI.askJSON({ task: 'recipe', system: Prompts.RECIPE, history, text: msg, max_tokens: 1500, timeout: 45000 });
        cand = cleanRecipe(resp.recipe);
        if (cand && userText && missing(cand, userText).length) cand = null;   // the dish must keep the ingredient the user named
        if (cand && cand.servings !== best.servings) cand = null;          // no cheating by changing the number of servings
        if (cand) { await verify(cand); cand.cons = cons; }
      } catch (e) { cand = null; }
      if (!cand || cand.verify !== 'calc') break;
      if (consScore(cand.per_serving, cons) < consScore(best.per_serving, cons)) best = cand; else break;
    }
    best.cons = cons;
    return best;
  }
  function limitLine(r) {
    const c = r.cons || (r.limit ? { kcal: r.limit } : null); if (!c) return '';
    const m = r.per_serving, bad = consBroken(m, c);
    const want = [c.kcal ? 'under ' + c.kcal + ' kcal' : '', c.protein ? 'at least ' + c.protein + ' g protein' : '', c.carbs ? 'under ' + c.carbs + ' g carbs' : '', c.fat ? 'under ' + c.fat + ' g fat' : ''].filter(Boolean).join(', ');
    return bad.length ? `<p class="vchip differ">Closest I could get: ${m.kcal} kcal, ${m.protein} g protein. You asked for ${want}. Try fewer ingredients that conflict, or relax one target.</p>` : `<p class="vchip agree">Meets your targets: ${want}.</p>`;
  }
  function verifyLine(r) {
    if (r.stale) return '<p class="vchip differ">Nutrition was not updated after your edit (could not reach the nutrition service). Tap Recalculate.</p>';
    if (r.cons && r.verify !== 'calc' && r.verify !== 'edited') return '<p class="vchip differ">Could not check this against your targets with real numbers. Treat the figures as approximate.</p>';
    if (r.verify === 'edited') return '<p class="vchip">Recalculated from your ingredient weights.</p>';
    if (r.verify === 'calc') return '<p class="vchip agree">Calculated from your ingredient weights.</p>' + limitLine(r);
    if (r.verify === 'agree') return '<p class="vchip agree">Double-checked: two calculations agree.</p>';
    if (r.verify === 'differ') return `<p class="vchip differ">Estimates differ (${r.draft.kcal} vs ${r.check.kcal} kcal). Showing the figure calculated from the ingredient weights; treat it as approximate.</p>`;
    return '<p class="vchip">Not double-checked. Treat the numbers as approximate.</p>';
  }

  /* ---------- rendering ---------- */
  const timeTxt = (r) => (r.time_min ? `<span class="chip">${r.time_min} min</span>` : '');
  function ratingOf(r) {
    const c = (r.cooks || []).filter((x) => x.rating > 0);
    return c.length ? { avg: c.reduce((a, x) => a + x.rating, 0) / c.length, n: c.length } : null;
  }
  const starsTxt = (n) => '★'.repeat(r0(n)) + '☆'.repeat(5 - r0(n));

  /* opts: { sv: servings shown, scaler: show the +/- control, i: chat message index }. Scaling is plain arithmetic on the grams. */
  function recipeHTML(r, extra, opts) {
    opts = opts || {};
    const p = r.per_serving, sv = opts.sv || r.servings, k = sv / r.servings;
    const scaler = opts.scaler ? `<div class="scaler"><span>Servings</span><button type="button" data-sv="-1"${opts.i != null ? ` data-i="${opts.i}"` : ''} aria-label="Fewer servings"${sv <= 1 ? ' disabled' : ''}>−</button><b>${sv}</b><button type="button" data-sv="1"${opts.i != null ? ` data-i="${opts.i}"` : ''} aria-label="More servings"${sv >= 24 ? ' disabled' : ''}>+</button></div>` : '';
    return `<article class="recipe">
      <h3>${esc(r.title)}</h3>
      ${r.description ? `<p class="hint">${esc(r.description)}</p>` : ''}
      <div class="meta">${timeTxt(r)}${opts.scaler ? '' : `<span class="chip">${r.servings} serving${r.servings > 1 ? 's' : ''}</span>`}${r.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      ${scaler}
      <div class="macroBar"><div><b>${p.kcal}</b><span>kcal</span></div><div><b>${p.protein} g</b><span>protein</span></div><div><b>${p.carbs} g</b><span>carbs</span></div><div><b>${p.fat} g</b><span>fat</span></div></div>
      ${verifyLine(r)}
      <p class="hint">Nutrition is per serving.${sv !== r.servings ? ` Amounts below are scaled for ${sv} servings (written for ${r.servings}).` : ''}</p>
      <h4>Ingredients</h4>
      <ul class="ingr">${r.ingredients.map((i) => `<li><span>${esc(i.item)}${i.note ? ` <small>${esc(i.note)}</small>` : ''}</span><b>${qtyText(i, k)}</b></li>`).join('')}</ul>
      <h4>Method</h4>
      <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>${extra || ''}
    </article>`;
  }

  function addMsg(m) { chat.msgs.push(m); renderChat(); persist(); }
  /* ---------- several chats, kept on this phone ---------- */
  const GREETING = "What are we cooking? Tell me the meal, how much time you have, or what's in your fridge. I'll aim for your calories and protein.";
  let chats = [], chatsLoaded = false;
  const newChatObj = () => ({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), msgs: [{ role: 'ai', text: GREETING }], current: null, cons: null, ts: Date.now() });
  const titleOf = (c) => { const m = c.msgs.find((x) => x.role === 'me'); return m ? String(m.text).slice(0, 30) + (String(m.text).length > 30 ? '…' : '') : 'New chat'; };
  function syncOut() { const c = chats.find((x) => x.id === chat.id); if (c) { c.msgs = chat.msgs.filter((m) => !m.wait); c.current = chat.current; c.cons = chat.cons || null; c.ts = Date.now(); } }
  function persist() { if (!chatsLoaded) return; syncOut(); renderBar(); DB.set('recChats', chats.slice(0, 20).map((c) => Object.assign({}, c, { msgs: c.msgs.slice(-60) }))).catch(() => {}); }
  function renderBar() {
    $('#chatSel').innerHTML = chats.map((c) => `<option value="${esc(c.id)}"${c.id === chat.id ? ' selected' : ''}>${esc(titleOf(c))}</option>`).join('');
    ['#chatSel', '#chatNew', '#chatClearAll', '#chatDel'].forEach((q) => { $(q).disabled = chat.busy; });
  }
  function openChat(id) {
    if (chat.id) syncOut();
    const c = chats.find((x) => x.id === id) || chats[0];
    Object.assign(chat, { id: c.id, msgs: c.msgs.slice(), current: c.current, cons: c.cons || null, fit: null, edit: null });
    $('#editBar').hidden = true; $('#chatInput').value = ''; $('#chatX').hidden = true; autosize();
    renderBar(); renderChat(); renderChips();
  }
  async function loadChats() {
    if (chatsLoaded) return;
    try { chats = (await DB.get('recChats', [])) || []; } catch (e) { chats = []; }
    if (!Array.isArray(chats) || !chats.length) chats = [newChatObj()];
    chatsLoaded = true; openChat(chats[0].id);
  }
  $('#chatSel').addEventListener('change', () => openChat($('#chatSel').value));
  $('#chatNew').addEventListener('click', () => { if (chat.busy) return; syncOut(); const c = newChatObj(); chats.unshift(c); openChat(c.id); persist(); });
  $('#chatClearAll').addEventListener('click', () => {
    if (chat.busy || chat.msgs.length <= 1 || !confirm('Clear this chat? The recipes you saved stay saved.')) return;
    chat.msgs = [{ role: 'ai', text: GREETING }]; chat.current = null; chat.cons = null; chat.edit = null; $('#editBar').hidden = true;
    renderChat(); renderChips(); persist();
  });
  $('#chatDel').addEventListener('click', () => {
    if (chat.busy || !confirm('Delete this chat? The recipes you saved stay saved.')) return;
    chats = chats.filter((x) => x.id !== chat.id); if (!chats.length) chats = [newChatObj()];
    chat.id = null; openChat(chats[0].id); persist();
  });
  function startEdit(i) {
    const m = chat.msgs[i]; if (!m || m.role !== 'me' || chat.busy) return;
    chat.edit = i; $('#chatInput').value = m.text; $('#editBar').hidden = false; autosize(); $('#chatX').hidden = false; $('#chatInput').focus();
  }
  function cancelEdit() { chat.edit = null; $('#editBar').hidden = true; $('#chatInput').value = ''; $('#chatX').hidden = true; autosize(); }
  $('#editCancel').addEventListener('click', cancelEdit);
  $('#chatX').addEventListener('click', () => { if (chat.edit != null) { cancelEdit(); return; } $('#chatInput').value = ''; $('#chatX').hidden = true; autosize(); $('#chatInput').focus(); });
  $('#chatInput').addEventListener('input', () => { $('#chatX').hidden = !$('#chatInput').value; });
  function renderChat() {
    $('#chat').innerHTML = chat.msgs.map((m, i) => {
      if (m.role === 'me') return `<div class="msg me">${esc(m.text)}${chat.busy ? '' : `<button type="button" class="editMsg" data-edit="${i}">Edit</button>`}</div>`;
      if (m.wait) return '<div class="msg ai wait">Cooking something up…</div>';
      const body = m.text ? `<div class="msg ai${m.err ? ' err' : ''}">${esc(m.text)}</div>` : '';
      if (!m.recipe) return body;
      return body + recipeHTML(m.recipe, `<div class="actions">
        <button type="button" class="primary" data-act="save" data-i="${i}" ${m.savedId ? 'disabled' : ''}>${m.savedId ? 'Saved ✓' : 'Save recipe'}</button>
        <button type="button" data-act="cook" data-i="${i}">Cook</button>
        <button type="button" data-act="log" data-i="${i}">Log 1 serving</button></div>`, { sv: m.sv || m.recipe.servings, scaler: true, i });
    }).join('');
    const last = $('#chat').lastElementChild;
    if (last && chat.msgs.length > 1) last.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  /* ---------- chat ---------- */
  const CHIPS = ['High-protein dinner', 'Light lunch under 500 kcal', 'Quick breakfast', 'Use what I have…'];
  function renderChips() {
    const fit = chat.fit ? `<button type="button" class="fitChip" data-fit="1">${esc(chat.fit.label)}</button>` : '';
    $('#chips').innerHTML = chat.msgs.length > 1 ? '' : fit + CHIPS.map((c) => `<button type="button" data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  }
  /* "Fit my day": turn what is left of today's targets into one sensible meal request (plain arithmetic). */
  async function fitPrompt() {
    const goals = await DB.get('goals', null);
    if (!goals || !goals.kcal) return null;
    const meals = await DB.mealsOn(DB.dayKey());
    const eaten = meals.reduce((a, m) => a + (m.kcal || 0), 0), prot = meals.reduce((a, m) => a + (m.protein || 0), 0);
    const remK = goals.kcal - eaten, remP = Math.max(0, (goals.protein || 0) - prot);
    if (remK < 150) return { label: 'Fit my day · light snack', text: "I've almost used my calories today. Suggest a light, high-protein snack under 200 kcal." };
    const h = new Date().getHours(), d = h < 11 ? 3 : h < 16 ? 2 : 1;      // meals left in the day, roughly
    const kc = Math.max(250, Math.round(remK / d / 10) * 10), pr = Math.round(remP / d);
    return { label: `Fit my day · ~${kc} kcal`, text: `Fit my day: one meal of about ${kc} kcal${pr >= 10 ? ` with at least ${pr} g protein` : ''} per serving.` };
  }
  async function greet() {
    await loadChats();
    if (chat.msgs.length <= 1) chat.fit = await fitPrompt();
    renderChips();
  }

  const PROTS = { chicken: /chicken/i, beef: /beef|steak|mince|brisket/i, lamb: /lamb|mutton/i, turkey: /turkey/i, salmon: /salmon/i, tuna: /tuna/i, shrimp: /shrimp|prawn/i, egg: /\begg/i, tofu: /tofu/i, halloumi: /halloumi/i, lentil: /lentil/i, chickpea: /chickpea|hummus/i, cod: /\bcod\b|hammour|tilapia|sea ?bass|white fish/i, fish: /fish|salmon|tuna|cod|hammour|tilapia|bass|sardine|mackerel/i };
  const named = (t) => Object.keys(PROTS).filter((k) => new RegExp('\\b' + k + (k === 'egg' ? 's?' : 's?') + '\\b', 'i').test(t) && !new RegExp('(?:no|without|not|except|instead of|hate|dislike|allergic to)\\s+(?:\\w+\\s+)?' + k, 'i').test(t));
  const missing = (rec, t) => named(t).filter((k) => !(PROTS[k].test(rec.title || '') && rec.ingredients.some((i) => PROTS[k].test(i.item || ''))) && !rec.ingredients.some((i) => PROTS[k].test(i.item || '')));

  async function context(fresh, userText) {
    const goals = await DB.get('goals', null), region = (await DB.get('region', 'Qatar')) || 'Qatar';
    const prefs = ($('#dietPrefs').value || '').trim();
    const lines = [`Region: ${region}.`];
    if (goals && goals.kcal) {
      const meals = await DB.mealsOn(DB.dayKey());
      const eaten = meals.reduce((a, m) => a + (m.kcal || 0), 0), prot = meals.reduce((a, m) => a + (m.protein || 0), 0);
      lines.push(`Daily targets: ${goals.kcal} kcal, ${goals.protein} g protein. Eaten so far today: ${r0(eaten)} kcal, ${r0(prot)} g protein. Remaining: ${Math.max(0, r0(goals.kcal - eaten))} kcal, ${Math.max(0, r0(goals.protein - prot))} g protein.`);
    }
    if (fresh) lines.push('This is a request for a NEW dish.');
    const recent = fresh ? ((await DB.get('recentTitles', [])) || []) : [], saved = (fresh ? (await DB.allRecipes()).slice(0, 15).map((x) => x.title) : []);
    const seen = Array.from(new Set(recent.concat(saved))).slice(-30);
    if (seen.length) lines.push('Already suggested or saved (do not repeat these exact dishes; vary the style, but anything the user named in their request, such as the main ingredient, dish or cuisine, still must be used exactly): ' + seen.join('; ') + '.');
    const PROT = ['chicken', 'fish', 'shrimp', 'lean beef', 'eggs', 'lentils or chickpeas', 'turkey', 'tuna', 'yogurt or labneh', 'tofu or halloumi'], STY = ['a bowl', 'a wrap', 'a salad', 'a skillet', 'a soup or stew', 'a tray bake', 'a stir-fry', 'a one-pot dish', 'a sandwich or toast', 'a grilled plate'];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (fresh && !named(userText || '').length) lines.push('Variety hint for this request (ignore it if the user named ingredients, a dish or a cuisine): lean toward ' + pick(PROT) + ' as ' + pick(STY) + '.');
    if ($('#halalOnly').checked) lines.push('Halal only: no pork and no alcohol.');
    if (prefs) lines.push('Food preferences: ' + prefs);
    return lines.join('\n');
  }

  async function send(text, forceFresh) {
    text = text.trim();
    const nt = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(), repeated = chat.msgs.filter((m) => m.role === 'me').slice(-4).some((m) => String(m.text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim() === nt);
    const fresh = !!forceFresh || !chat.current || repeated || /\b(another|different|new|else|other|again|instead of that)\b/i.test(text) || (/\b(lunch|dinner|breakfast|snack|meal|recipe|dessert|ideas?)\b/i.test(text) && !/\b(it|this|that|these|them)\b/i.test(text));
    if (!text || chat.busy) return;
    if (chat.edit != null && chat.msgs[chat.edit] && chat.msgs[chat.edit].role === 'me') {       // an edited message replaces itself and everything after it
      chat.msgs = chat.msgs.slice(0, chat.edit);
      chat.current = null; chat.cons = null;
      for (const m of chat.msgs) { if (m.recipe) chat.current = m.recipe; if (m.role === 'me') { const c0 = parseCons(m.text); if (c0) chat.cons = Object.assign(chat.cons || {}, c0); } }
    }
    chat.edit = null; $('#editBar').hidden = true; $('#chatX').hidden = true;
    chat.busy = true; chat.ctl = new AbortController(); const sig = chat.ctl.signal; const btnS = $('#chatSend'); btnS.textContent = 'Stop'; renderBar();
    const stopped = () => { if (sig.aborted) throw Object.assign(new Error('Stopped.'), { cancelled: true }); };
    const history = chat.msgs.filter((m) => !m.wait && !m.err).slice(1).slice(-6)
      .map((m) => ({ role: m.role === 'me' ? 'user' : 'model', text: (m.text || '') + (m.recipe ? ` [Recipe given: ${m.recipe.title}]` : '') }));
    addMsg({ role: 'me', text }); renderChips();
    $('#chatInput').value = ''; autosize();
    chat.msgs.push({ role: 'ai', wait: true }); renderChat();
    try {
      let msg = text + '\n\n' + await context(fresh, text);
      if (chat.current && !fresh) msg += '\nCurrent recipe (change it only if asked): ' + JSON.stringify({ title: chat.current.title, servings: chat.current.servings, ingredients: chat.current.ingredients.map((i) => ({ item: i.item, grams: i.grams, qty: i.qty, note: i.note })), steps: chat.current.steps });
      const r = await AI.askJSON({ task: 'recipe', system: Prompts.RECIPE, history, text: msg, max_tokens: 1500, signal: sig }); stopped();
      let recipe = cleanRecipe(r.recipe);
      if (recipe && missing(recipe, text).length) {            // the user named an ingredient and the dish ignored it: ask again, firmly
        const need = missing(recipe, text).join(', ');
        try { const r2 = await AI.askJSON({ task: 'recipe', system: Prompts.RECIPE, history, text: msg + `\n\nIMPORTANT: your last answer ("${recipe.title}") left out what the user asked for. The main ingredient MUST be ${need}, exactly that and no substitute (not turkey for chicken, not beef for lamb). Redo the recipe.`, max_tokens: 1500, signal: sig }); stopped(); const c2 = cleanRecipe(r2.recipe); if (c2 && !missing(c2, text).length) { recipe = c2; r.reply = r2.reply; } } catch (e) {}
      }
      if (r.recipe && !recipe) { chat.msgs.pop(); addMsg({ role: 'ai', text: "I couldn't put that recipe together properly. Try asking again.", err: true }); return; }
      if (recipe) {
        await verify(recipe); stopped();                       // the real numbers, calculated from the ingredients
        const nc = parseCons(text); if (nc) chat.cons = Object.assign(fresh ? {} : (chat.cons || {}), nc); else if (fresh) chat.cons = null;
        if (chat.cons && recipe.verify === 'calc') { recipe = await fitCons(recipe, chat.cons, history, await context(false), text); stopped(); }
        chat.current = recipe;
        try { const rt = ((await DB.get('recentTitles', [])) || []).concat([recipe.title]).slice(-20); await DB.set('recentTitles', rt); } catch (e) {}
      }
      chat.msgs.pop();
      addMsg({ role: 'ai', text: String(r.reply || '').slice(0, 400), recipe });
    } catch (e) {
      chat.msgs.pop();                                                  // the waiting bubble
      if (e.cancelled || sig.aborted) { const lastMe = chat.msgs[chat.msgs.length - 1]; if (lastMe && lastMe.role === 'me') { chat.msgs.pop(); $('#chatInput').value = text; $('#chatX').hidden = false; autosize(); } renderChat(); persist(); }
      else addMsg({ role: 'ai', text: e.message, err: true });
    } finally { chat.busy = false; chat.ctl = null; $('#chatSend').disabled = false; btnS.textContent = 'Send'; renderBar(); renderChat(); }
  }

  function autosize() { const t = $('#chatInput'); t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; }
  $('#chatInput').addEventListener('input', autosize);
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); if (chat.busy) { if (chat.ctl) chat.ctl.abort(); return; } send($('#chatInput').value); });
  $('#chips').addEventListener('click', (e) => {
    if (e.target.closest('[data-fit]')) { if (chat.fit) send(chat.fit.text, true); return; }
    const b = e.target.closest('[data-chip]'); if (!b) return;
    const t = b.dataset.chip;
    if (t.endsWith('…')) { $('#chatInput').value = 'I have '; $('#chatInput').focus(); } else send(t, true);
  });
  $('#dietPrefs').addEventListener('change', () => DB.set('dietPrefs', $('#dietPrefs').value));
  $('#halalOnly').addEventListener('change', () => DB.set('halal', $('#halalOnly').checked));

  /* ---------- saving and logging ---------- */
  async function saveFromChat(i) {
    const m = chat.msgs[i]; if (!m || !m.recipe || m.savedId) return;
    const rec = Object.assign({}, m.recipe, { favorite: false, cooks: [], notes: '', created: Date.now() });
    await DB.saveRecipe(rec); m.savedId = rec.id; renderChat(); refreshCount();
  }
  async function logServing(r) {
    const p = r.per_serving;
    await DB.addMeal({ name: r.title, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, source: 'recipe', confidence: null,
      items: [{ name: r.title, brand: null, kind: 'homemade', portion: '1 serving', basis: 'estimate', amount: 1, unit: 'serving', kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, low: r0(p.kcal * 0.85), high: r0(p.kcal * 1.15) }] });
    window.Plate.refreshToday();
  }
  $('#chat').addEventListener('click', async (e) => {
    const eb = e.target.closest('[data-edit]'); if (eb) { startEdit(+eb.dataset.edit); return; }
    const sb = e.target.closest('[data-sv]');
    if (sb) { const m = chat.msgs[+sb.dataset.i]; if (m && m.recipe) { m.sv = Math.min(24, Math.max(1, (m.sv || m.recipe.servings) + +sb.dataset.sv)); renderChat(); } return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const m = chat.msgs[+b.dataset.i]; if (!m) return;
    if (b.dataset.act === 'save') await saveFromChat(+b.dataset.i);
    if (b.dataset.act === 'cook') openCook(m.recipe, m.sv || m.recipe.servings);
    if (b.dataset.act === 'log') { await logServing(m.recipe); b.textContent = 'Logged ✓'; b.disabled = true; }
  });

  /* ---------- saved menu ---------- */
  async function refreshCount() { const n = (await DB.allRecipes()).length; $('#savedCount').textContent = n ? '(' + n + ')' : ''; }
  async function renderSaved() {
    let list = await DB.allRecipes();
    $('#savedCount').textContent = list.length ? '(' + list.length + ')' : '';
    const q = view.q.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.title + ' ' + r.tags.join(' ') + ' ' + r.ingredients.map((i) => i.item).join(' ')).toLowerCase().includes(q));
    if (view.filter === 'fav') list = list.filter((r) => r.favorite);
    if (view.filter === 'cooked') list = list.filter((r) => (r.cooks || []).length);
    const key = { new: (r) => r.saved, rating: (r) => (ratingOf(r) ? ratingOf(r).avg : -1), cooks: (r) => (r.cooks || []).length }[view.sort];
    list.sort((a, b) => key(b) - key(a) || b.saved - a.saved);
    $('#recGrid').innerHTML = list.map((r) => {
      const rt = ratingOf(r), p = r.per_serving;
      return `<div class="rcard"><button type="button" class="rmain" data-open="${esc(r.id)}"><b>${esc(r.title)}</b>
        <span class="rmeta">${p.kcal} kcal · ${p.protein} g protein${r.time_min ? ' · ' + r.time_min + ' min' : ''}</span>
        <span class="stars">${rt ? starsTxt(rt.avg) + `<small>${rt.avg.toFixed(1)} (${rt.n})</small>` : '<small>Not rated yet</small>'}</span></button>
        <button type="button" class="fav${r.favorite ? ' on' : ''}" data-fav="${esc(r.id)}" aria-pressed="${!!r.favorite}" aria-label="Favorite">${r.favorite ? '♥' : '♡'}</button></div>`;
    }).join('');
    $('#recEmpty').hidden = list.length > 0;
    $('#recEmpty').textContent = (await DB.allRecipes()).length ? 'Nothing matches.' : 'No saved recipes yet. Create one and tap Save.';
  }
  $('#recGrid').addEventListener('click', async (e) => {
    const f = e.target.closest('[data-fav]');
    if (f) { const r = (await DB.allRecipes()).find((x) => x.id === f.dataset.fav); if (r) { r.favorite = !r.favorite; await DB.saveRecipe(r); renderSaved(); } return; }
    const o = e.target.closest('[data-open]'); if (o) openDetail(o.dataset.open);
  });
  $$('[data-rfilter]').forEach((b) => b.addEventListener('click', () => {
    view.filter = b.dataset.rfilter; $$('[data-rfilter]').forEach((x) => x.classList.toggle('on', x === b)); renderSaved();
  }));
  $('#recSort').addEventListener('change', (e) => { view.sort = e.target.value; renderSaved(); });
  $('#recSearch').addEventListener('input', (e) => { view.q = e.target.value; renderSaved(); });

  function showTab(t) {
    view.tab = t;
    $$('[data-rtab]').forEach((b) => b.classList.toggle('on', b.dataset.rtab === t));
    $('#recCreate').hidden = t !== 'create'; $('#recSaved').hidden = t !== 'saved';
    if (t === 'saved') renderSaved(); else greet();
  }
  $$('[data-rtab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.rtab)));

  /* ---------- detail: scale, cook, edit, notes, favorite, "I made it" rating, history ---------- */
  const dlg = $('#recipeDlg');
  const getRecipe = async (id) => (await DB.allRecipes()).find((x) => x.id === id);
  const H4 = 'margin:14px 0 0;font:700 13px var(--font);color:var(--muted);text-transform:uppercase;letter-spacing:.05em';

  async function openDetail(id) {
    const r = await getRecipe(id); if (!r) return;
    det = { id, sv: r.servings, mode: 'view', draft: null }; rateDraft = 0; deleteArmed = false;
    renderDetail(r);
    if (!dlg.open) dlg.showModal();
  }
  function renderDetail(r) {
    if (det.mode === 'edit') return renderEdit(r);
    const rt = ratingOf(r), cooks = (r.cooks || []).slice().reverse();
    const inList = shop.recipes.some((x) => x.id === r.id);
    const actions = `<div class="actions">
        <button type="button" class="primary" data-d="cook">Cook</button>
        <button type="button" data-d="log">Log 1 serving</button>
        <button type="button" data-d="fav" aria-pressed="${!!r.favorite}">${r.favorite ? '♥ Favorited' : '♡ Favorite'}</button></div>
      <div class="actions">
        <button type="button" data-d="shop">${inList ? 'Update shopping list' : 'Add to shopping list'}</button>
        <button type="button" data-d="edit">Edit</button>
        ${r.stale ? '<button type="button" data-d="recalc">Recalculate</button>' : ''}</div>`;
    $('#recipeSheet').innerHTML = `
      <div class="closeRow"><button type="button" class="link" data-d="close">Close</button></div>
      ${recipeHTML(r, actions, { sv: det.sv, scaler: true })}
      <h4 style="${H4}">Change this recipe</h4>
      <div class="chips aiChips">${['Make it spicier', 'Cut calories', 'More protein', 'Dairy-free', 'Faster'].map((t) => `<button type="button" data-aichip="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <form id="aiEditForm" class="composer" autocomplete="off"><textarea id="aiEditIn" rows="1" maxlength="300" aria-label="Tell me what to change" placeholder="What should change?"></textarea><button class="primary" type="submit" id="aiEditGo"${det.aiBusy ? ' disabled' : ''}>${det.aiBusy ? '…' : 'Change'}</button></form>
      <p class="status${det.aiBad ? ' bad' : ''}" id="aiEditStatus" role="status">${esc(det.aiMsg || '')}</p>
      ${det.prev ? '<div class="actions"><button type="button" data-d="undoAi">Undo last change</button></div>' : ''}
      <h4 style="${H4}">Your notes</h4>
      <textarea id="recNotes" rows="2" maxlength="500" placeholder="Tweaks for next time: less salt, add lemon…">${esc(r.notes || '')}</textarea>
      <h4 style="${H4}">Cooked it?</h4>
      <p class="hint">${rt ? `Average ${rt.avg.toFixed(1)} of 5 from ${rt.n} rating${rt.n > 1 ? 's' : ''}.` : 'Rate it after you make it.'}</p>
      <div class="rate" id="rateRow" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
      <input id="cookNote" type="text" placeholder="How did it go? (optional)" maxlength="140">
      <div class="actions"><button type="button" class="primary" data-d="made" id="madeBtn" disabled>I made it</button></div>
      ${cooks.length ? `<ul class="cooks">${cooks.map((c) => `<li><span class="stars">${c.rating ? starsTxt(c.rating) : ''}</span><span class="hint">${new Date(c.date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}${c.note ? ' · ' + esc(c.note) : ''}</span></li>`).join('')}</ul>` : ''}
      <div class="actions"><button type="button" class="danger" data-d="del">Delete recipe</button></div>`;
  }

  /* ----- change it with AI: talk to the recipe, it updates in place ----- */
  async function aiEdit(text) {
    text = String(text || '').trim(); if (!text || !det || det.aiBusy) return;
    const D = det, show = (x) => { if (det === D) renderDetail(x); }, r = await getRecipe(D.id); if (!r) return;
    D.aiBusy = true; D.aiBad = false; D.aiMsg = 'Changing the recipe…'; show(r);
    try {
      const cur = { title: r.title, servings: r.servings, ingredients: r.ingredients.map((i) => ({ item: i.item, grams: i.grams, qty: i.qty, note: i.note })), steps: r.steps };
      const msg = 'Change request: ' + text + '\n\n' + await context() + '\nThis is the saved recipe. Apply ONLY the requested change and return the FULL updated recipe (all ingredients with grams and qty, all steps), keeping everything else the same: ' + JSON.stringify(cur);
      const resp = await AI.askJSON({ task: 'recipe', system: Prompts.RECIPE, history: D.aiHist || [], text: msg, max_tokens: 1500, timeout: 45000 });
      const nr = cleanRecipe(resp.recipe);
      if (!nr) { D.aiMsg = String(resp.reply || 'I could not change it that way. Try rephrasing.').slice(0, 300); return; }
      let fitted = nr; const cons = Object.assign({}, r.cons || {}, parseCons(text) || {});
      if (Object.keys(cons).length) { D.aiMsg = 'Checking it against your targets…'; show(r); await verify(nr); if (nr.verify === 'calc') fitted = await fitCons(nr, cons, D.aiHist || [], await context()); }
      D.prev = JSON.parse(JSON.stringify({ title: r.title, description: r.description, servings: r.servings, time_min: r.time_min, tags: r.tags, ingredients: r.ingredients, steps: r.steps, per_serving: r.per_serving, verify: r.verify, stale: r.stale }));
      Object.assign(r, { title: fitted.title, description: fitted.description, servings: fitted.servings, time_min: fitted.time_min, tags: fitted.tags, ingredients: fitted.ingredients, steps: fitted.steps, per_serving: fitted.per_serving, verify: fitted.verify || 'none', parts: fitted.parts, cons: fitted.cons || null, stale: false });
      delete r.draft; delete r.check; D.sv = r.servings;
      await DB.saveRecipe(r);
      D.aiHist = (D.aiHist || []).concat([{ role: 'user', text }, { role: 'model', text: String(resp.reply || 'Done.').slice(0, 300) }]).slice(-6);
      D.aiMsg = 'Updated. Checking the nutrition…'; D.aiBusy = false; show(r); renderSaved();   // the change shows right away
      if (r.verify !== 'calc') { D.aiBusy = true; await recalc(r); await DB.saveRecipe(r); }
      D.aiMsg = String(resp.reply || 'Updated.').slice(0, 300);
    } catch (e) { D.aiBad = true; D.aiMsg = e.message; }
    finally { D.aiBusy = false; const rr = await getRecipe(D.id); if (rr && det === D) { show(rr); renderSaved(); } }
  }
  $('#recipeSheet').addEventListener('submit', (e) => { if (e.target.id !== 'aiEditForm') return; e.preventDefault(); aiEdit($('#aiEditIn').value); });
  $('#recipeSheet').addEventListener('click', (e) => { const c = e.target.closest('[data-aichip]'); if (c) aiEdit(c.dataset.aichip); });

  /* ----- edit ----- */
  const ingRow = (i) => `<div class="edRow" data-note="${esc(i.note || '')}" data-qty="${esc(i.qty ? JSON.stringify(i.qty) : '')}" data-g0="${i.grams || 0}"><input type="text" class="edItem" value="${esc(i.item)}" maxlength="60" placeholder="Ingredient" aria-label="Ingredient"><input class="edG" inputmode="decimal" value="${i.grams || ''}" placeholder="g" aria-label="Grams"><button type="button" class="rmBtn" data-d="rmIng" aria-label="Remove ingredient">✕</button></div>`;
  function renderEdit(r) {
    const d = det.draft;
    $('#recipeSheet').innerHTML = `
      <div class="closeRow"><button type="button" class="link" data-d="cancel">Cancel</button></div>
      <h3 style="margin:0;font:700 19px var(--font)">Edit recipe</h3>
      <label for="edTitle">Title</label><input id="edTitle" type="text" maxlength="80" value="${esc(d.title)}">
      <div class="grid2">
        <label class="mini"><span>Servings</span><input id="edServ" inputmode="numeric" value="${d.servings}"></label>
        <label class="mini"><span>Minutes</span><input id="edTime" inputmode="numeric" value="${d.time_min || ''}"></label>
      </div>
      <label>Ingredients (grams)</label>
      <div id="edIngr">${d.ingredients.map(ingRow).join('')}</div>
      <button type="button" data-d="addIng">+ Add ingredient</button>
      <label for="edSteps">Method (one step per line)</label>
      <textarea id="edSteps" rows="8">${esc(d.steps.join('\n'))}</textarea>
      <p class="hint">If you change ingredients, grams or servings, nutrition is recalculated with one quick check.</p>
      <p class="status" id="edStatus" role="status"></p>
      <div class="actions"><button type="button" class="primary" data-d="saveEdit" id="edSave">Save changes</button></div>`;
  }
  function readEdit() {
    const d = det.draft;
    d.title = $('#edTitle').value.trim().slice(0, 80);
    d.servings = Math.min(24, Math.max(1, r0(num($('#edServ').value)) || 1));
    d.time_min = r0(num($('#edTime').value));
    d.ingredients = $$('#edIngr .edRow').map((row) => {
      const g = r0(num(row.querySelector('.edG').value)), g0 = +row.dataset.g0 || 0; let qty = null;
      try { qty = row.dataset.qty ? JSON.parse(row.dataset.qty) : null; } catch (e) {}
      if (qty && g0 > 0 && g !== g0) qty = g > 0 ? { n: Math.round(qty.n * g / g0 * 100) / 100, u: qty.u } : null;   // changed the grams: the measure follows
      return { item: row.querySelector('.edItem').value.trim().slice(0, 60), grams: g, qty, note: row.dataset.note || '' };
    });
    d.steps = $('#edSteps').value.split('\n').map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 14);
    return d;
  }
  /* nutrition after an edit: the checker model recomputes from the ingredient grams (plain AI arithmetic, no guessing at what the edit "means") */
  async function recalc(r) {
    try {
      const m = await calcNutrition(r);
      if (!m) throw new Error('empty');
      r.per_serving = m; r.verify = 'edited'; r.stale = false; delete r.draft; delete r.check;
      return true;
    } catch (e) { r.stale = true; return false; }
  }
  const sigOf = (x) => x.servings + '|' + x.ingredients.filter((i) => i.item).map((i) => i.item.toLowerCase() + ':' + i.grams).join(',');

  $('#recipeSheet').addEventListener('change', async (e) => {
    if (e.target.id !== 'recNotes' || !det) return;
    const r = await getRecipe(det.id); if (!r) return;
    r.notes = e.target.value.trim().slice(0, 500); await DB.saveRecipe(r);
  });

  $('#recipeSheet').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !det) return;
    if (det.mode === 'edit' && b.dataset.d !== 'saveEdit') {
      if (b.dataset.d === 'addIng') { readEdit(); det.draft.ingredients.push({ item: '', grams: 0, note: '' }); renderEdit(); $$('#edIngr .edItem').pop().focus(); }
      if (b.dataset.d === 'rmIng') { readEdit(); const idx = $$('#edIngr .rmBtn').indexOf(b); det.draft.ingredients.splice(idx, 1); renderEdit(); }
      if (b.dataset.d === 'cancel') { det.mode = 'view'; const r = await getRecipe(det.id); renderDetail(r); }
      return;
    }
    const r = await getRecipe(det.id); if (!r) return;
    if (b.dataset.sv) { det.sv = Math.min(24, Math.max(1, det.sv + +b.dataset.sv)); renderDetail(r); return; }
    if (b.dataset.star) {
      rateDraft = +b.dataset.star;
      $$('#rateRow button').forEach((x) => x.classList.toggle('on', +x.dataset.star <= rateDraft));
      $('#madeBtn').disabled = false; return;
    }
    const d = b.dataset.d;
    if (d === 'close') { dlg.close(); renderSaved(); }
    if (d === 'cook') openCook(r, det.sv, r.notes);
    if (d === 'fav') { r.favorite = !r.favorite; await DB.saveRecipe(r); renderDetail(r); renderSaved(); }
    if (d === 'log') { await logServing(r); b.textContent = 'Logged ✓'; b.disabled = true; }
    if (d === 'shop') { await addToShop(r, det.sv); renderDetail(r); b.textContent = 'Added ✓'; }
    if (d === 'edit') { det.mode = 'edit'; det.draft = JSON.parse(JSON.stringify({ title: r.title, servings: r.servings, time_min: r.time_min, ingredients: r.ingredients, steps: r.steps })); renderEdit(r); }
    if (d === 'undoAi' && det.prev) { Object.assign(r, det.prev); det.prev = null; det.sv = r.servings; det.aiMsg = 'Change undone.'; det.aiBad = false; await DB.saveRecipe(r); renderDetail(r); renderSaved(); }
    if (d === 'recalc') { b.disabled = true; b.textContent = 'Checking…'; await recalc(r); await DB.saveRecipe(r); renderDetail(r); }
    if (d === 'saveEdit') {
      const x = readEdit(), st = $('#edStatus');
      const ings = x.ingredients.filter((i) => i.item);
      if (!x.title) { st.textContent = 'Give it a title.'; st.className = 'status bad'; return; }
      if (ings.length < 2) { st.textContent = 'Keep at least two ingredients.'; st.className = 'status bad'; return; }
      if (!x.steps.length) { st.textContent = 'Add at least one step.'; st.className = 'status bad'; return; }
      const changed = sigOf({ servings: r.servings, ingredients: r.ingredients }) !== sigOf({ servings: x.servings, ingredients: ings });
      Object.assign(r, { title: x.title, servings: x.servings, time_min: x.time_min, ingredients: ings, steps: x.steps });
      if (changed) {
        b.disabled = true; st.textContent = 'Recalculating nutrition…'; st.className = 'status';
        await recalc(r);
      }
      await DB.saveRecipe(r);
      det.mode = 'view'; det.sv = r.servings; renderDetail(r); renderSaved();
    }
    if (d === 'made' && rateDraft) {
      r.cooks = (r.cooks || []).concat([{ date: Date.now(), rating: rateDraft, note: $('#cookNote').value.trim().slice(0, 140) }]);
      await DB.saveRecipe(r); renderDetail(r); renderSaved();
    }
    if (d === 'del') {
      if (!deleteArmed) { deleteArmed = true; b.textContent = 'Tap again to delete'; return; }
      const gone = JSON.parse(JSON.stringify(r)); await DB.deleteRecipe(det.id); dlg.close(); renderSaved();
      window.Plate.toast('Recipe deleted', 'Undo', async () => { await DB.saveRecipe(gone); renderSaved(); });
    }
  });
  dlg.addEventListener('close', () => { det = null; });

  /* ---------- shopping list: merged from chosen recipes, grams added up (plain code) ---------- */
  let shop = { recipes: [], checked: {} }, shopArmed = false;
  const normKey = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z؀-ۿ ]/g, '').trim().replace(/\s+/g, ' ')
    .replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/([^s])s$/, '$1');
  function merged() {
    const m = new Map();
    for (const rc of shop.recipes) for (const i of rc.ing) {
      const k = normKey(i.item); if (!k) continue;
      const e = m.get(k) || { key: k, name: i.item, grams: 0, cnt: 0, qn: 0, qu: null, same: true };
      e.grams += i.grams; e.cnt++;
      if (i.qty && i.qty.u !== 'g' && (e.qu === null || e.qu === i.qty.u)) { e.qu = i.qty.u; e.qn += i.qty.n; } else e.same = false;
      m.set(k, e);
    }
    m.forEach((e) => { e.text = e.same && e.qu ? qtyText({ qty: { n: e.qn, u: e.qu } }, 1) : e.grams ? sg(e.grams) + ' g' : ''; });
    return [...m.values()].sort((a, b) => (shop.checked[a.key] ? 1 : 0) - (shop.checked[b.key] ? 1 : 0) || a.name.localeCompare(b.name));
  }
  const saveShop = () => DB.set('shopping', shop);
  const updShopCount = () => { const n = shop.recipes.length; $('#shopCount').textContent = n ? '(' + n + ')' : ''; };
  async function addToShop(r, sv) {
    const k = sv / r.servings;
    shop.recipes = shop.recipes.filter((x) => x.id !== r.id).concat([{ id: r.id, title: r.title, servings: sv, ing: r.ingredients.map((i) => ({ item: i.item, grams: i.grams ? sg(i.grams * k) : 0, qty: i.qty ? { n: i.qty.n * k, u: i.qty.u } : null })) }]);
    await saveShop(); updShopCount();
  }
  function renderShop() {
    const items = merged();
    $('#shopSheet').innerHTML = `
      <div class="closeRow"><button type="button" class="link" data-s="close">Close</button></div>
      <h2>Shopping list</h2>
      ${shop.recipes.length ? `<div class="meta">${shop.recipes.map((x) => `<span class="chip rchip">${esc(x.title)} · ${x.servings}<button type="button" data-s="rm" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.title)}">✕</button></span>`).join('')}</div>` : ''}
      ${items.length ? `<div class="shopList">${items.map((i) => `<label class="shopRow${shop.checked[i.key] ? ' got' : ''}"><input type="checkbox" data-key="${esc(i.key)}" ${shop.checked[i.key] ? 'checked' : ''}><span>${esc(i.name)}</span><b>${esc(i.text)}</b></label>`).join('')}</div>
      <p class="hint">Amounts are as listed in the recipes (raw weight). Check your pantry first.</p>
      <div class="actions"><button type="button" data-s="copy">Copy list</button><button type="button" class="danger" data-s="clear">Clear list</button></div>`
      : '<p class="empty">Nothing here yet. Open a saved recipe and tap Add to shopping list.</p>'}`;
  }
  function openShop() { shopArmed = false; renderShop(); if (!$('#shopDlg').open) $('#shopDlg').showModal(); }
  $('#shopBtn').addEventListener('click', openShop);
  $('#shopSheet').addEventListener('change', async (e) => {
    const c = e.target.closest('[data-key]'); if (!c) return;
    if (c.checked) shop.checked[c.dataset.key] = true; else delete shop.checked[c.dataset.key];
    await saveShop(); renderShop();
  });
  $('#shopSheet').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const a = b.dataset.s;
    if (a === 'close') $('#shopDlg').close();
    if (a === 'rm') { shop.recipes = shop.recipes.filter((x) => x.id !== b.dataset.id); await saveShop(); updShopCount(); renderShop(); }
    if (a === 'copy') {
      const t = 'Shopping list\n' + merged().filter((i) => !shop.checked[i.key]).map((i) => `- ${i.name}${i.text ? ' ' + i.text : ''}`).join('\n');
      try { await navigator.clipboard.writeText(t); b.textContent = 'Copied ✓'; } catch (_) { b.textContent = 'Copy not allowed here'; }
    }
    if (a === 'clear') {
      if (!shopArmed) { shopArmed = true; b.textContent = 'Tap again to clear'; return; }
      shop = { recipes: [], checked: {} }; await saveShop(); updShopCount(); renderShop();
    }
  });

  /* ---------- cooking mode: big text, one step at a time, tappable timers, screen kept awake ---------- */
  let cook = null, timers = [], tick = null, wake = null, audio = null;
  const TIME_RE = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
  function timesIn(step) {
    const out = [], seen = new Set();
    for (const m of step.matchAll(TIME_RE)) {
      const u = m[3].toLowerCase(), n = parseFloat(m[1]);      // a range ("8-10 min") starts at the shorter time: safer than overcooking
      const sec = Math.round(n * (u.startsWith('h') ? 3600 : u.startsWith('m') ? 60 : 1));
      if (sec < 5 || sec > 8 * 3600 || seen.has(sec)) continue;
      seen.add(sec); out.push({ sec, label: `${m[1]}${m[2] ? '–' + m[2] : ''} ${u.startsWith('h') ? 'h' : u.startsWith('m') ? 'min' : 'sec'}` });
    }
    return out.slice(0, 3);
  }
  async function keepAwake() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (_) {} }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#cookDlg').open) keepAwake(); });
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      [0, 0.35, 0.7].forEach((t) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.28);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.3); });
    } catch (_) {}
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (_) {}
  }
  function timersHTML() {
    return timers.map((t) => `<div class="tm${t.done ? ' done' : ''}"><b data-tmv="${t.id}">${t.done ? 'Done!' : fmtDur((t.end - Date.now()) / 1000)}</b><span>${esc(t.label)}</span><button type="button" data-c="tx" data-id="${t.id}" aria-label="Remove timer">✕</button></div>`).join('');
  }
  function startTick() {
    if (tick) return;
    tick = setInterval(() => {
      let changed = false;
      for (const t of timers) {
        if (t.done) continue;
        if (Date.now() >= t.end) { t.done = true; changed = true; beep(); }
        else { const el = document.querySelector(`[data-tmv="${t.id}"]`); if (el) el.textContent = fmtDur((t.end - Date.now()) / 1000); }
      }
      if (changed && $('#cookTimers')) $('#cookTimers').innerHTML = timersHTML();
      if (!timers.length || timers.every((t) => t.done)) { clearInterval(tick); tick = null; }
    }, 500);
  }
  function openCook(r, sv, notes) {
    cook = { r, sv: sv || r.servings, i: 0, panel: false, notes: notes || '' };
    timers = []; renderCook(); keepAwake();
    if (!$('#cookDlg').open) $('#cookDlg').showModal();
  }
  function renderCook() {
    const { r, i, sv, panel } = cook, n = r.steps.length, k = sv / r.servings;
    const last = i === n - 1;
    $('#cookSheet').innerHTML = `
      <div class="cookTop"><button type="button" class="link" data-c="exit">Exit</button><span class="hint">${panel ? 'Ingredients' : `Step ${i + 1} of ${n}`}</span>
        <button type="button" class="link" data-c="panel">${panel ? 'Back to steps' : 'Ingredients'}</button></div>
      <div class="prog"><i style="width:${((i + 1) / n) * 100}%"></i></div>
      ${panel ? `<div class="cookBody"><h3>${esc(r.title)} · ${sv} serving${sv > 1 ? 's' : ''}</h3>
          <ul class="ingr big">${r.ingredients.map((x) => `<li><span>${esc(x.item)}${x.note ? ` <small>${esc(x.note)}</small>` : ''}</span><b>${qtyText(x, k)}</b></li>`).join('')}</ul>
          ${cook.notes ? `<p class="hint"><b>Your notes:</b> ${esc(cook.notes)}</p>` : ''}</div>`
      : `<div class="cookBody"><p class="stepBig">${esc(r.steps[i])}</p>
          <div class="tbtns">${timesIn(r.steps[i]).map((t) => `<button type="button" data-c="t" data-sec="${t.sec}" data-label="${esc(t.label)}">▶ ${esc(t.label)} timer</button>`).join('')}</div></div>`}
      <div id="cookTimers" class="timers">${timersHTML()}</div>
      <div class="cookNav"><button type="button" data-c="prev" ${i === 0 ? 'disabled' : ''}>Back</button>
        <button type="button" class="primary" data-c="${last ? 'exit' : 'next'}">${last ? 'Done' : 'Next step'}</button></div>`;
  }
  $('#cookSheet').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]'); if (!b || !cook) return;
    const a = b.dataset.c;
    if (a === 'exit') $('#cookDlg').close();
    if (a === 'next') { cook.i = Math.min(cook.r.steps.length - 1, cook.i + 1); cook.panel = false; renderCook(); }
    if (a === 'prev') { cook.i = Math.max(0, cook.i - 1); cook.panel = false; renderCook(); }
    if (a === 'panel') { cook.panel = !cook.panel; renderCook(); }
    if (a === 't') {
      try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (_) {}   // unlock sound on this tap
      timers.push({ id: 't' + Date.now() + timers.length, label: `${b.dataset.label} · step ${cook.i + 1}`, end: Date.now() + (+b.dataset.sec) * 1000, done: false });
      startTick(); $('#cookTimers').innerHTML = timersHTML();
    }
    if (a === 'tx') { timers = timers.filter((t) => t.id !== b.dataset.id); $('#cookTimers').innerHTML = timersHTML(); }
  });
  $('#cookDlg').addEventListener('close', () => { cook = null; try { if (wake) wake.release(); } catch (_) {} wake = null; });
  $('#cookDlg').addEventListener('cancel', () => {});

  /* ---------- boot ---------- */
  window.Plate.hooks.recipes = async () => {
    $('#dietPrefs').value = await DB.get('dietPrefs', '');
    $('#halalOnly').checked = (await DB.get('halal', true)) !== false;
    const sh = await DB.get('shopping', null); if (sh && sh.recipes) shop = { recipes: sh.recipes, checked: sh.checked || {} };
    updShopCount(); refreshCount();
    showTab(view.tab);
  };
  if (!$('#view-recipes').hidden) window.Plate.hooks.recipes();
})();
