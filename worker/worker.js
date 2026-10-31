/* Plate proxy (Cloudflare Worker). Holds your AI keys; the phone never sees them.
   Binding:    DB (a Cloudflare D1 database; see schema.sql)       Cron: every 15 minutes (reminders; the daily backup runs in the 09:00 UTC slot = 12:00 in Qatar)
   Secrets:    GEMINI_API_KEY      (GROQ_API_KEY, TAVILY_API_KEY, FDC_API_KEY optional)   INVITE_CODE (optional: people need it to create an account)
   Variables:  ALLOWED_ORIGIN (optional, lock CORS to your app), AI_DAILY_LIMIT (default 150 per person), BACKUP_DAYS (default 30), PBKDF2_ITER (default 100000)
   Routes:     POST /auth/*  (accounts)   GET|POST /sync/*  (data)   /backups  (daily copies)   /push/*  (reminders)   /hook/*  (steps from an iPhone Shortcut)
               POST /  (AI, needs a signed-in session)

   Request from the app (provider-neutral):
     { task: 'log'|'recipe'|'nutrition'|'test', system, history:[{role:'user'|'model', text}], text, images:[base64 jpeg], json:bool, max_tokens }
   Reply: { text, provider } or { error: { message } } */

const MAX_BODY_BYTES = 2_500_000;
const MAX_TOKENS_CAP = 2048;
const MAX_IMAGES = 2;
const TASKS = new Set(['log', 'recipe', 'nutrition', 'test', 'lookup', 'check', 'ask', 'nutrients', 'coach']);

export default {
  async scheduled(event, env, ctx) {
    const d = new Date(event.scheduledTime || Date.now()), daily = event.cron === '0 9 * * *' || (d.getUTCHours() === 9 && d.getUTCMinutes() < 15);
    ctx.waitUntil((async () => {
      try { await migrate(env); await runReminders(env, d.getTime()); } catch (e) { console.log('reminders failed', e.message); }
      if (daily) await runBackups(env);
    })());
  },
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '';
    const allow = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'access-control-allow-origin': allow === '*' ? '*' : (origin === allow ? origin : allow),
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400', vary: 'origin',
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });
    const fail = (message, status) => reply({ error: { message } }, status);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.DB) return fail('The database is not connected to this Worker yet (binding DB).', 500);
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    if (path.startsWith('/auth/') || path.startsWith('/sync/') || path.startsWith('/backups') || path.startsWith('/push/') || path.startsWith('/hook/')) {
      try { return await accounts(req, env, path, reply, fail); } catch (e) { return fail('Server error: ' + e.message, 500); }
    }
    if (req.method !== 'POST') return fail('POST only', 405);
    const user = await authed(req, env);
    if (!user) return fail('unauthorized', 401);
    const cap = Number(env.AI_DAILY_LIMIT) || 150, today = new Date().toISOString().slice(0, 10);
    const used = user.ai_day === today ? user.ai_count : 0;
    if (used >= cap) return fail('Daily limit reached (' + cap + '). It resets at midnight UTC.', 429);
    await env.DB.prepare('UPDATE users SET ai_day = ?, ai_count = ? WHERE id = ?').bind(today, used + 1, user.id).run();

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail('Request too large', 413);
    let b; try { b = JSON.parse(raw); } catch { return fail('Bad JSON', 400); }
    if (!TASKS.has(b.task)) return fail('Unknown task', 400);
    if (b.task === 'lookup') return lookup(env, b, reply, fail);
    if (b.task === 'ask') return ask(env, b, reply, fail);
    if (b.task === 'nutrients') return nutrients(env, b, reply, fail);

    const job = {
      system: String(b.system || '').slice(0, 12000),
      history: (Array.isArray(b.history) ? b.history : []).slice(-8)
        .map((m) => ({ role: m.role === 'model' ? 'model' : 'user', text: String(m.text || '').slice(0, 6000) })),
      text: String(b.text || '').slice(0, 6000),
      images: (Array.isArray(b.images) ? b.images : []).slice(0, MAX_IMAGES),
      log: b.task === 'log', json: !!b.json, search: !!b.search, searched: false, searchError: '',
      max: Math.min(Number(b.max_tokens) || 800, MAX_TOKENS_CAP),
    };
    if (!job.text && !job.images.length) return fail('Empty request', 400);
    const hasImages = job.images.length > 0;

    // 'check' is the nutrition second opinion: gpt-oss-120b on Groq first (it did best on nutrition estimates), Gemini only as a fallback.
    const G = ['gemini', () => gemini(env, job, b.task)], Q = ['groq', () => groq(env, job)];
    const tries = [];
    if (b.task === 'check') { if (env.GROQ_API_KEY) tries.push(Q); if (env.GEMINI_API_KEY) tries.push(G); }
    else { if (env.GEMINI_API_KEY) tries.push(G); if (env.GROQ_API_KEY && !hasImages) tries.push(Q); }
    if (!tries.length) return fail('No AI key configured on the proxy', 500);

    if (b.task === 'log') {
      // Speed: start the best model, and if it has not answered within a few seconds (or fails) start the next one at the same time. First good answer wins.
      const lanes = hasImages ? [['gemini', () => gemini(env, job, 'log', 0)], ['gemini', () => gemini(env, job, 'log', 1)]]
        : [['groq', () => groq(env, job)], ['gemini', () => gemini(env, job, 'log', 0)], ['gemini', () => gemini(env, job, 'log', 1)]].filter((l) => l[0] === 'groq' ? env.GROQ_API_KEY : env.GEMINI_API_KEY);
      try { const r = await race(lanes, hasImages ? 4000 : 3000); return reply({ text: r.value, provider: r.name, searched: false, searchError: '' }); }
      catch (e) { return fail(e.message, 502); }
    }
    const errs = [];
    for (const [name, run] of tries) {
      try { const text = await run(); return reply({ text, provider: name, searched: job.searched, searchError: job.searchError }); }
      catch (e) { errs.push(name + ': ' + e.message); }
    }
    const last = errs.join('  |  ');
    return fail(last, 502);
  },
};

/* Staggered race: lanes = [[name, thunk]]. Lane i+1 starts when lane i fails or after hedgeMs; the first success wins. */
function race(lanes, hedgeMs) {
  return new Promise((resolve, reject) => {
    const errs = []; let started = 0, failed = 0, done = false, timer = null;
    const next = () => {
      if (done || started >= lanes.length) return;
      const [name, run] = lanes[started++];
      if (started < lanes.length) { clearTimeout(timer); timer = setTimeout(next, hedgeMs); }
      Promise.resolve().then(run).then((value) => { if (!done) { done = true; clearTimeout(timer); resolve({ name, value }); } },
        (e) => { errs.push(name + ': ' + e.message); failed++; if (failed === lanes.length) { done = true; clearTimeout(timer); reject(new Error(errs.join('  |  '))); } else { clearTimeout(timer); next(); } });
    };
    if (!lanes.length) reject(new Error('No AI key configured on the proxy')); else next();
  });
}

async function post(url, headers, body, ms) {
  let res;
  try { res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms || 25000) }); }
  catch (x) { const e = new Error(x && x.name === 'TimeoutError' ? 'Timed out' : String(x && x.message || x)); e.retryable = true; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data.error && data.error.message) || ('HTTP ' + res.status));
    e.retryable = res.status === 429 || res.status >= 500;
    throw e;
  }
  return data;
}

/* Web lookup for branded products: Tavily finds pages, Gemini reads them. Gemini may only use numbers that appear in the results. */
const LOOKUP_SYSTEM = `You extract nutrition facts for one product from web search results. Use ONLY numbers that literally appear in the results; never use memory and never guess. You may add up or average numbers that literally appear (for example the listed cuts of a chicken meal), and you must say so in the note. Prefer the manufacturer's or brand's own site and the page for the requested region; accept other reputable sources only if no official one exists. Do not mix different products or sizes.
Return ONLY JSON: {"found":true,"per":"100g","serving_g":null,"kcal":0,"protein":0,"carbs":0,"fat":0,"region_match":true,"source_index":1,"note":"one short sentence"}
"per" says what the numbers refer to: "100g", "100ml", "serving" (one portion or meal as sold; give its weight in serving_g if the results state it), "piece" (ONE single item such as one nugget, wing, cookie or piece of chicken), or "total" (the whole amount the user ate, only when the results list the figures of the exact items they ate and you add them up: use only listed numbers, and say in the note that you added them). Match the amount the user ate: for "6 pieces" prefer "piece" figures or a "total", not a figure for a bigger or smaller set. If calories for this exact product are not clearly stated, return {"found":false}.`;

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

async function tavilySearch(env, q, depth, n) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.TAVILY_API_KEY },
    body: JSON.stringify({ query: q, search_depth: depth, max_results: n, include_answer: false }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error('Search: ' + clip((d.detail && (d.detail.error || d.detail)) || d.error || res.status, 160)); e.status = res.status; throw e; }
  return d.results || [];
}
/* Pages from the brand's own site first, so the reader sees the official figures before anything else. */
function rankResults(list, brand) {
  const toks = String(brand || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length > 2);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').replace(/[^a-z0-9.]/g, ''); } catch { return ''; } };
  const score = (r) => (toks.some((t) => host(r.url).includes(t)) ? 2 : 0) + (/nutrition|menu|allergen|ingredient/i.test(r.url + ' ' + r.title) ? 1 : 0);
  return list.map((r, i) => ({ r, i, s: score(r) })).sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.r);
}
async function readResults(env, b, brand, name, region, results) {
  const job = {
    system: LOOKUP_SYSTEM, history: [], images: [], json: true, search: false, searched: false, searchError: '', max: 400,
    text: `Product: ${brand} ${name}\nRegion wanted: ${region}\nAmount the user ate: ${clip(b.amount, 10)} ${clip(b.unit, 10)}\n\nSEARCH RESULTS:\n` +
      results.map((r, i) => `[${i + 1}] ${r.url}\n${r.title}\n${r.content}`).join('\n\n'),
  };
  const out = await gemini(env, job, 'lookup');
  let p; try { p = JSON.parse(out); } catch { return null; }
  if (!p || !p.found || !(Number(p.kcal) > 0)) return null;
  const hit = results[Number(p.source_index) - 1];
  p.source = hit ? hit.url : '';
  return p;
}
/* Two passes: a quick search first (1 credit); if the figures are not in it, a deeper one with different wording (2 credits).
   "deep" from the app skips straight to the deeper pass, for the "Search again" button. */
async function lookup(env, b, reply, fail) {
  if (!env.TAVILY_API_KEY) return fail('Web lookup is not set up on the proxy (TAVILY_API_KEY missing).', 501);
  const brand = clip(b.brand, 80), name = clip(b.name, 80), region = clip(b.region, 40);
  if (!brand && !name) return fail('Nothing to look up', 400);
  // search for the item itself, not the count ("6 piece Original Recipe Chicken" -> "Original Recipe Chicken"); the reader still gets the full name and amount
  const item = name.replace(/^\s*\d+(\.\d+)?\s*(x|pcs?|pieces?|pc|slices?|servings?)?\s*(of\s+)?/i, '').replace(/\b(\d+\s*(g|ml|kcal))\b/gi, '').replace(/\s+/g, ' ').trim() || name;
  const plan = [];
  if (!b.deep) plan.push([`${brand} ${item} ${region} nutrition facts calories protein carbs fat per serving`, 'basic', 8]);
  plan.push([`${brand} ${item} calories nutrition information per piece`, 'advanced', 8]);
  let tried = 0, lastErr = null;
  const seen = new Set(), all = [];
  for (const [q, depth, n] of plan) {
    tried++;
    let list;
    try { list = await tavilySearch(env, q.replace(/\s+/g, ' ').trim(), depth, n); }
    catch (e) { lastErr = e; if (e.status === 429 || e.status === 432 || e.status === 433) break; continue; }
    const fresh = rankResults(list.filter((r) => r && r.url && !seen.has(r.url)), brand).slice(0, 8).map((r) => ({ url: clip(r.url, 200), title: clip(r.title, 120), content: clip(r.content, depth === 'advanced' ? 1400 : 900) }));
    fresh.forEach((r) => seen.add(r.url));
    if (!fresh.length) continue;
    let p;
    try { p = await readResults(env, b, brand, name, region, depth === 'advanced' ? fresh.concat(all).slice(0, 10) : fresh); } catch (e) { lastErr = e; continue; }
    all.push(...fresh);
    if (p) { p.tried = tried; p.ver = 3; return reply({ lookup: p }); }
  }
  if (lastErr && !all.length) return fail(lastErr.message, 502);
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  return reply({ lookup: { found: false, tried, ver: 3, seen: [...new Set(all.map((r) => hostOf(r.url)).filter(Boolean))].slice(0, 6) } });
}

/* "Ask": answers a nutrition question from a short list of trusted health sources (Tavily, restricted to those domains),
   personalised with the user's profile and food summary. Gemini may only state facts that the sources support. */
const TRUSTED = ['ods.od.nih.gov', 'nih.gov', 'medlineplus.gov', 'ncbi.nlm.nih.gov', 'fdc.nal.usda.gov', 'usda.gov', 'cdc.gov', 'who.int',
  'nhs.uk', 'nice.org.uk', 'efsa.europa.eu', 'moph.gov.qa', 'eatright.org', 'hsph.harvard.edu', 'health.harvard.edu', 'mayoclinic.org',
  'clevelandclinic.org', 'heart.org', 'cochranelibrary.com', 'bda.uk.com', 'fao.org'];
const ASK_SYSTEM = `You are a careful nutrition adviser inside a personal food tracker. Answer the user's question using the SOURCES provided, personalised with the PERSONAL DATA provided.

Rules:
1. Every factual claim about nutrition or health (amounts, recommendations, effects) must be supported by a source. Mark it with its number like [1]. Do not add facts from memory. If the sources do not cover part of the question, say so plainly; you may add clearly general advice, but do not mark it with a number.
2. Use the personal data to tailor the answer (their weight, goal, targets, averages and logged foods). Use only the figures given; do not invent intake numbers. If a calculation is needed, do it in one short line.
3. Local and practical: for the user's region suggest foods easy to buy there (Qatar: sardines, kingfish, hammour, labneh, Baladna and Almarai, eggs, lentils, foul, dates, oats). Respect halal, allergies and dislikes.
4. You are not a doctor. For symptoms, medical conditions, medicines, pregnancy or breastfeeding, children, or anything that looks like disordered eating, give only general information, recommend a doctor or dietitian, and be kind. Never advise eating below 1200 kcal (women) or 1500 kcal (men) a day, fasting to extremes, or high-dose supplements.
5. Be concise: at most about 150 words, short paragraphs or a few bullets, plain words. Lead with the direct answer.
6. "coverage": "sourced" if the key points are backed by sources; "partial" if only some; "general" if no source supports it.
7. Return ONLY this JSON: {"answer":"text with [1] style markers","cited":[1],"coverage":"sourced|partial|general","follow_ups":["up to 2 short follow-up questions"]}`;

async function ask(env, b, reply, fail) {
  const question = clip(b.question, 500).trim();
  if (!question) return fail('Empty question', 400);
  if (!env.GEMINI_API_KEY) return fail('No AI key configured on the proxy', 500);
  const context = clip(b.context, 4500), region = clip(b.region, 40);
  const prev = (Array.isArray(b.history) ? b.history : []).slice(-4).map((m) => ({ role: m.role === 'model' ? 'model' : 'user', text: clip(m.text, 700) }));
  let results = [], searchNote = '';
  if (env.TAVILY_API_KEY) {
    const q = clip((question.split(/\s+/).length < 6 && b.prevQuestion ? clip(b.prevQuestion, 150) + ' ' : '') + question + ' ' + region, 300);
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.TAVILY_API_KEY },
        body: JSON.stringify({ query: q, search_depth: 'basic', max_results: 5, chunks_per_source: 2, include_domains: TRUSTED, include_answer: false }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) results = (d.results || []).slice(0, 5).map((r) => ({ url: clip(r.url, 220), title: clip(r.title, 120), content: clip(r.content, 900) }));
      else searchNote = 'Search unavailable (' + res.status + ').';
    } catch (e) { searchNote = 'Search unreachable.'; }
  } else searchNote = 'Search is not set up.';
  const job = {
    system: ASK_SYSTEM, history: prev, images: [], json: true, search: false, searched: false, searchError: '', max: 900,
    text: `PERSONAL DATA:\n${context || 'none given'}\n\nSOURCES (trusted health sites):\n` +
      (results.length ? results.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.content}`).join('\n\n') : 'NONE FOUND. Answer only with clearly general advice and set coverage to "general".') +
      `\n\nQUESTION: ${question}`,
  };
  let out;
  try { out = await gemini(env, job, 'ask'); } catch (e) { return fail('Answering: ' + e.message, 502); }
  let p; try { p = JSON.parse(out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return fail('The answer was not readable. Try again.', 502); }
  const cited = [...new Set((Array.isArray(p.cited) ? p.cited : []).map(Number).filter((n) => n >= 1 && n <= results.length))];
  let coverage = ['sourced', 'partial', 'general'].includes(p.coverage) ? p.coverage : 'general';
  if (!cited.length) coverage = 'general';
  const text = String(p.answer || '').replace(/\s?\[(\d+)\]/g, (m, d) => (cited.includes(Number(d)) ? m : ''));   // drop markers that point at nothing
  return reply({ ask: { answer: clip(text, 1800), coverage, searchNote,
    sources: cited.map((n) => ({ n, title: results[n - 1].title, url: results[n - 1].url })),
    follow_ups: (Array.isArray(p.follow_ups) ? p.follow_ups : []).slice(0, 2).map((s) => clip(s, 100)) } });
}

/* Food composition from USDA FoodData Central (free key, secret FDC_API_KEY). For a list of food names: search the database,
   let Gemini pick the right entry (or none), return per-100 g vitamins and minerals. The app caches every answer on the phone forever. */
const FDC = 'https://api.nal.usda.gov/fdc/v1';
const NUT = {   // our key -> [USDA nutrient numbers in priority order, expected unit]
  kcal: [['208', '957', '958'], 'KCAL'], fiber: [['291'], 'G'], satfat: [['606'], 'G'], sodium: [['307'], 'MG'], potassium: [['306'], 'MG'],
  calcium: [['301'], 'MG'], iron: [['303'], 'MG'], magnesium: [['304'], 'MG'], zinc: [['309'], 'MG'], vitA: [['320'], 'UG'],
  vitC: [['401'], 'MG'], vitD: [['328'], 'UG'], vitE: [['323'], 'MG'], vitK: [['430'], 'UG'], b12: [['418'], 'UG'], folate: [['435'], 'UG'],
};
const NUM2KEY = {}; for (const [k, [nums]] of Object.entries(NUT)) nums.forEach((n, i) => { NUM2KEY[n] = { k, pri: i }; });
function parseFdc(list) {   // handles search entries, abridged detail and full detail shapes
  const out = {}, pri = {};
  for (const e of Array.isArray(list) ? list : []) {
    const num = String(e.nutrientNumber != null ? e.nutrientNumber : e.number != null ? e.number : (e.nutrient && e.nutrient.number) || '');
    const m = NUM2KEY[num]; if (!m) continue;
    const val = Number(e.value != null ? e.value : e.amount);
    const unit = String(e.unitName || (e.nutrient && e.nutrient.unitName) || '').toUpperCase().replace('µ', 'U').replace('Μ', 'U');
    if (!Number.isFinite(val) || val < 0 || unit !== NUT[m.k][1]) continue;
    if (pri[m.k] === undefined || m.pri < pri[m.k]) { out[m.k] = val; pri[m.k] = m.pri; }
  }
  return out;
}
const MATCH_SYSTEM = `You match foods someone logged in a food diary to USDA FoodData Central entries. For each food pick the candidate that is the same food in the form it was most likely eaten: cooked if cooking is implied (grilled chicken means cooked, roasted), plain and unsweetened unless stated, whole food rather than a different product. Prefer Foundation or SR Legacy entries for single ingredients and Survey (FNDDS) entries for prepared dishes. Choose null when no candidate is genuinely the same food (different dish or different main ingredient); never force a match. Local dishes that are not in the list (for example machboos, harees, karak) get null. Return ONLY JSON: {"picks":[{"food":"exact name given","pick":1}]} where pick is the candidate number or null.`;

const DECOMP_SYSTEM = `For each dish or food, list its 2 to 3 main ingredients as they would be found in a USDA food table (include the form, for example "lamb, cooked, roasted", "wheat, cooked", "butter"), each with its share of the finished dish's weight as eaten. Shares are fractions that add up to 1. Use only typical ingredients of that dish. If the text is not a real food, return an empty parts list. Return ONLY JSON: {"dishes":[{"food":"exact name given","parts":[{"q":"ingredient","share":0.5}]}]}`;

async function fdcGet(env, path) {
  const res = await fetch(FDC + path, { headers: { 'x-api-key': env.FDC_API_KEY } });
  if (res.status === 429) { const e = new Error('USDA rate limit reached, try again later'); e.rate = true; throw e; }
  if (!res.ok) throw new Error('USDA database error (' + res.status + ')');
  return res.json();
}
async function fdcSearch(env, name) {
  const q = encodeURIComponent(name), dt = encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS)');
  const d = await fdcGet(env, `/foods/search?query=${q}&dataType=${dt}&pageSize=6`);
  return (d.foods || []).slice(0, 6).map((f) => ({ id: f.fdcId, desc: clip(f.description, 120), type: f.dataType, nutrients: f.foodNutrients || [] }));
}
const parseJ = (out) => JSON.parse(out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
const mkJob = (system, text, max) => ({ system, text, max, history: [], images: [], json: true, search: false, searched: false, searchError: '' });

/* ask Gemini which candidate is the same food; returns { lowercased name: candidate number } */
async function pickAll(env, items) {   // items: [[name, candidates]]
  const picks = {}, askable = items.filter(([, c]) => c.length);
  if (!askable.length) return picks;
  const text = askable.map(([n, c]) => `FOOD: ${n}\n` + c.map((x, i) => { const k = parseFdc(x.nutrients).kcal; return `${i + 1}. ${x.desc} [${x.type}]${k != null ? ' ~' + Math.round(k) + ' kcal/100g' : ''}`; }).join('\n')).join('\n\n');
  const p = parseJ(await gemini(env, mkJob(MATCH_SYSTEM, text, 500), 'match'));
  for (const x of Array.isArray(p.picks) ? p.picks : []) picks[String(x.food).trim().toLowerCase()] = Number(x.pick);
  return picks;
}
async function per100(env, hit) {
  let per = parseFdc(hit.nutrients);
  if (Object.keys(per).filter((x) => x !== 'kcal').length < 6) {          // the search entry was abridged: read the full record
    const d = await fdcGet(env, `/food/${hit.id}?format=abridged`); per = Object.assign(per, parseFdc(d.foodNutrients));
  }
  return per.kcal == null ? null : per;
}
const chosen = (cands, k) => (Number.isInteger(k) && k >= 1 && k <= cands.length ? cands[k - 1] : null);

async function nutrients(env, b, reply, fail) {
  if (!env.FDC_API_KEY) return fail('Food database not set up on the proxy (FDC_API_KEY missing).', 501);
  if (!env.GEMINI_API_KEY) return fail('No AI key configured on the proxy', 500);
  const names = [...new Set((Array.isArray(b.foods) ? b.foods : []).map((s) => clip(s, 60).trim()).filter(Boolean))].slice(0, 6);   // few per call: Workers allow 50 outgoing requests each
  if (!names.length) return fail('No foods given', 400);
  const result = [];
  try {
    const found = await Promise.all(names.map((n) => fdcSearch(env, n)));
    const picks = await pickAll(env, names.map((n, i) => [n, found[i]]));
    const missed = [];
    for (let i = 0; i < names.length; i++) {
      const hit = chosen(found[i], picks[names[i].toLowerCase()]);
      const per = hit ? await per100(env, hit) : null;
      if (per) result.push({ name: names[i], fdcId: hit.id, desc: hit.desc, type: hit.type, per100: per }); else missed.push(names[i]);
    }
    // dishes that are not in the database (harees, machboos...): rebuild them from their main ingredients
    const dishes = missed.slice(0, 3), approx = {};
    if (dishes.length) {
      const dj = parseJ(await gemini(env, mkJob(DECOMP_SYSTEM, dishes.map((d) => 'FOOD: ' + d).join('\n'), 500), 'match'));
      const plan = {};
      for (const x of Array.isArray(dj.dishes) ? dj.dishes : []) {
        const parts = (Array.isArray(x.parts) ? x.parts : []).slice(0, 3).map((p) => ({ q: clip(p.q, 50).trim(), share: Number(p.share) })).filter((p) => p.q && p.share > 0);
        const tot = parts.reduce((a, p) => a + p.share, 0);
        if (parts.length && tot > 0) plan[String(x.food).trim().toLowerCase()] = parts.map((p) => ({ q: p.q, share: p.share / tot }));
      }
      const qs = [...new Set(Object.values(plan).flat().map((p) => p.q))];
      const pf = await Promise.all(qs.map((q) => fdcSearch(env, q)));
      const pp = await pickAll(env, qs.map((q, i) => [q, pf[i]]));
      const pers = {};
      for (let i = 0; i < qs.length; i++) {
        const hit = chosen(pf[i], pp[qs[i].toLowerCase()]);
        pers[qs[i]] = hit ? { per: await per100(env, hit), desc: hit.desc } : null;
      }
      for (const [dish, parts] of Object.entries(plan)) {
        if (parts.some((p) => !pers[p.q] || !pers[p.q].per)) continue;          // every ingredient must be found, or we say nothing
        const per = {};
        for (const key of Object.keys(NUT)) {                                   // a nutrient is only reported if every ingredient has it
          if (parts.every((p) => pers[p.q].per[key] != null)) per[key] = parts.reduce((a, p) => a + p.share * pers[p.q].per[key], 0);
        }
        approx[dish] = { per, desc: 'Approximated from ' + parts.map((p) => `${pers[p.q].desc} (${Math.round(p.share * 100)}%)`).join(', ') };
      }
    }
    for (const n of missed) {
      const a = approx[n.toLowerCase()];
      result.push(a && a.per.kcal != null ? { name: n, fdcId: null, desc: clip(a.desc, 300), type: 'approx', approx: true, per100: a.per } : { name: n, none: true });
    }
  } catch (e) { return fail(e.message, e.rate ? 429 : 502); }
  return reply({ nutrients: result });
}

// When one Gemini model is overloaded or out of quota, try the next (all are free-tier, all read photos).
const GEMINI_CHAIN = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const LOG_CHAIN = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];   // log: accurate first, fast fallback (raced, see race())
async function gemini(env, job, task, pin) {
  if (task === 'log' && pin != null) {
    const m = pin === 0 && env.GEMINI_MODEL ? env.GEMINI_MODEL : LOG_CHAIN[Math.min(pin, LOG_CHAIN.length - 1)];
    return geminiOnce(env, job, task, m);
  }
  const chain = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...GEMINI_CHAIN] : GEMINI_CHAIN;
  let err;
  for (let i = 0; i < chain.length; i++) {
    try { return await geminiOnce(env, job, task, chain[i]); }
    catch (e) {
      err = e;
      if (!e.retryable && !/empty reply/i.test(e.message)) break;   // real errors (bad key, bad request) won't improve on another model
      if (i === 0) await new Promise((r) => setTimeout(r, 600));    // brief pause, then the next model
    }
  }
  throw err;
}

/* a JSON job must come back as readable JSON: strip fences/prose, and treat truncated or broken replies as a failure so the next model gets a turn */
function cleanJson(out) {
  let t = String(out || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { JSON.parse(t); return t; } catch (e) { return null; }
}
function needJson(job, out) {
  if (!job.json || job.search) return out;
  const c = cleanJson(out);
  if (c === null) { const e = new Error('Invalid JSON'); e.retryable = true; throw e; }
  return c;
}

async function geminiOnce(env, job, task, model) {
  const contents = job.history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const parts = job.images.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data }, ...(task === 'log' ? { mediaResolution: { level: 'MEDIA_RESOLUTION_MEDIUM' } } : {}) }));
  if (job.text) parts.push({ text: job.text });
  contents.push({ role: 'user', parts });
  // thinking tokens count against maxOutputTokens, so keep thinking low and leave headroom
  const cfg = { maxOutputTokens: Math.max(job.max, 512) + 1024, temperature: task === 'log' ? 0 : ['lookup', 'check', 'nutrition', 'ask', 'match'].includes(task) ? 0.2 : task === 'coach' ? 0.4 : task === 'recipe' ? 1 : 0.7 };
  if (task === 'log') cfg.seed = 42;   // same input, same answer
  const body = { contents, generationConfig: cfg };
  if (job.system) body.systemInstruction = { parts: [{ text: job.system }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers = { 'x-goog-api-key': env.GEMINI_API_KEY };
  const attempt = async () => {
    try {
      cfg.thinkingConfig = { thinkingLevel: 'minimal' };
      return await post(url, headers, body, task === 'log' ? 14000 : 25000);
    } catch (e) {
      if (e.retryable) throw e;          // quota / server trouble: let the caller fall back
      delete cfg.thinkingConfig;         // setting not accepted by this model: retry plain
      parts.forEach((p) => { delete p.mediaResolution; }); delete cfg.seed;
      return await post(url, headers, body, task === 'log' ? 14000 : 25000);
    }
  };
  let d;
  if (job.search) {                      // web search is on: JSON mode can't be combined with it, the app parses the JSON itself
    body.tools = [{ google_search: {} }];
    try { d = await attempt(); job.searched = true; }
    catch (e) {                          // search unavailable or over its free allowance: answer without it
      job.searchError = String(e.message || e).slice(0, 200);
      delete body.tools; delete cfg.thinkingConfig;
      if (job.json) cfg.responseMimeType = 'application/json';
      d = await attempt();
    }
  } else {
    if (job.json) cfg.responseMimeType = 'application/json';
    d = await attempt();
  }
  const out = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [])
    .filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  if (!out) {
    const why = (d.candidates && d.candidates[0] && d.candidates[0].finishReason) || (d.promptFeedback && d.promptFeedback.blockReason) || 'unknown';
    throw new Error('Empty reply (' + why + ')');
  }
  return needJson(job, out);
}

async function groq(env, job) {
  const model = env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const messages = [];
  if (job.system) messages.push({ role: 'system', content: job.system });
  for (const m of job.history) messages.push({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text });
  messages.push({ role: 'user', content: job.text });
  const body = { model, messages, temperature: job.log ? 0 : 0.3, max_completion_tokens: job.max + 1500 };
  if (job.log) body.seed = 42;   // reasoning models spend tokens thinking
  const reasoning = model.startsWith('openai/gpt-oss');
  if (reasoning) body.reasoning_effort = 'low';
  if (job.json) body.response_format = { type: 'json_object' };
  const url = 'https://api.groq.com/openai/v1/chat/completions', h = { authorization: 'Bearer ' + env.GROQ_API_KEY };
  let d;
  try { d = await post(url, h, body, 12000); }
  catch (e) {
    if (e.retryable) throw e;
    delete body.reasoning_effort; delete body.response_format;        // an option this model rejects: retry plain
    d = await post(url, h, body, 12000);
  }
  const out = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
  if (!out) { const e = new Error('Empty reply'); e.retryable = true; throw e; }
  return needJson(job, out);
}


/* ================= accounts, sync, backups ================= */
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
async function sha(text) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))); }
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256)));
}
const same = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return d === 0; };
const DAY = 86400000, SESSION_MS = 400 * DAY;
const iterOf = (env) => Math.min(100000, Math.max(1000, Number(env.PBKDF2_ITER) || 100000));
const normEmail = (e) => String(e || '').trim().toLowerCase();
const emailOk = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const newRecovery = () => { const t = b64(rnd(10)).replace(/[-_]/g, 'x').toUpperCase().slice(0, 12); return t.match(/.{4}/g).join('-'); };

async function authed(req, env) {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S{20,200})$/.exec(h); if (!m) return null;
  const th = await sha(m[1]), now = Date.now();
  const row = await env.DB.prepare('SELECT u.id, u.email, u.ai_day, u.ai_count, s.last_used, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(th).first();
  if (!row || row.expires < now) return null;
  if (now - row.last_used > DAY) await env.DB.prepare('UPDATE sessions SET last_used = ?, expires = ? WHERE token_hash = ?').bind(now, now + SESSION_MS, th).run();   // rolling: stays signed in while you use it
  row.th = th; return row;
}
async function makeSession(env, userId, device) {
  const token = b64(rnd(32)), now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, last_used, expires, device) VALUES (?,?,?,?,?,?)').bind(await sha(token), userId, now, now, now + SESSION_MS, String(device || '').slice(0, 80)).run();
  return token;
}
/* crude brute-force guard: 10 failed sign-ins per email or per address in 15 minutes */
async function throttle(env, key, add) {
  const now = Date.now(), win = 15 * 60000;
  const r = await env.DB.prepare('SELECT n, t FROM attempts WHERE k = ?').bind(key).first();
  const n = r && now - r.t < win ? r.n : 0;
  if (add) await env.DB.prepare('INSERT INTO attempts (k, n, t) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET n = ?, t = ?').bind(key, n + 1, r && now - r.t < win ? r.t : now, n + 1, r && now - r.t < win ? r.t : now).run();
  return n;
}
const CLEAR = (env, key) => env.DB.prepare('DELETE FROM attempts WHERE k = ?').bind(key).run();

async function checkOtp(env, email, purpose, code) {
  const k = purpose + ':' + email, r = await env.DB.prepare('SELECT * FROM otps WHERE k = ?').bind(k).first();
  if (!r || r.exp < Date.now()) return 'That code has expired. Ask for a new one.';
  if (r.tries >= 5) return 'Too many wrong codes. Ask for a new one.';
  if (!same(await sha(String(code || '').replace(/\D/g, '') + ':' + email), r.code_hash)) { await env.DB.prepare('UPDATE otps SET tries = tries + 1 WHERE k = ?').bind(k).run(); return 'That code is not right.'; }
  await env.DB.prepare('DELETE FROM otps WHERE k = ?').bind(k).run();
  return '';
}

async function accounts(req, env, path, reply, fail) {
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  let body = {};
  if (req.method === 'POST') { const raw = await req.text(); if (raw.length > 4_000_000) return fail('Too large', 413); try { body = JSON.parse(raw || '{}'); } catch { return fail('Bad JSON', 400); } }
  const url = new URL(req.url);

  if (path === '/auth/config') return reply({ invite: !!env.INVITE_CODE, google: env.GOOGLE_CLIENT_ID || '', otp: !!env.RESEND_API_KEY });

  if (path === '/auth/register' && req.method === 'POST') {
    const email = normEmail(body.email), pw = String(body.password || '');
    if (!emailOk(email)) return fail('Enter a valid email address.', 400);
    if (pw.length < 8) return fail('Use at least 8 characters for the password.', 400);
    if (env.INVITE_CODE && !same(String(body.invite || ''), env.INVITE_CODE)) return fail('That invite code is not right.', 403);
    if ((await throttle(env, 'reg:' + ip, true)) >= 20) return fail('Too many attempts. Try again later.', 429);
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return fail('There is already an account with that email. Sign in instead.', 409);
    if (env.RESEND_API_KEY) { const bad = await checkOtp(env, email, 'register', body.otp); if (bad) return fail(bad, 400); }
    const id = b64(rnd(12)), salt = rnd(16), iter = iterOf(env), rec = newRecovery(), rsalt = rnd(16);
    await env.DB.prepare('INSERT INTO users (id, email, pw_hash, pw_salt, iter, rec_hash, rec_salt, created, ai_day, ai_count) VALUES (?,?,?,?,?,?,?,?,?,0)')
      .bind(id, email, await pbkdf2(pw, salt, iter), b64(salt), iter, await pbkdf2(rec, rsalt, 20000), b64(rsalt), Date.now(), '').run();
    return reply({ token: await makeSession(env, id, body.device), user: { id, email }, recovery: rec });
  }
  if (path === '/auth/login' && req.method === 'POST') {
    const email = normEmail(body.email), pw = String(body.password || '');
    const k1 = 'login:' + email, k2 = 'ip:' + ip;
    if ((await throttle(env, k1)) >= 10 || (await throttle(env, k2)) >= 30) return fail('Too many attempts. Wait 15 minutes and try again.', 429);
    const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    const ok = u ? same(await pbkdf2(pw, unb64(u.pw_salt), u.iter), u.pw_hash) : (await pbkdf2(pw, rnd(16), iterOf(env)), false);
    if (!ok) { await throttle(env, k1, true); await throttle(env, k2, true); return fail('Wrong email or password.', 401); }
    await CLEAR(env, k1);
    return reply({ token: await makeSession(env, u.id, body.device), user: { id: u.id, email: u.email } });
  }
  if (path === '/auth/reset' && req.method === 'POST') {
    const email = normEmail(body.email), pw = String(body.password || ''), k1 = 'reset:' + email;
    if (pw.length < 8) return fail('Use at least 8 characters for the new password.', 400);
    if ((await throttle(env, k1)) >= 5) return fail('Too many attempts. Wait 15 minutes and try again.', 429);
    const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    const code = String(body.recovery || '').trim().toUpperCase();
    if (body.otp) {
      const bad = u ? await checkOtp(env, email, 'reset', body.otp) : 'That code is not right.';
      if (bad) { await throttle(env, k1, true); return fail(bad, 400); }
    } else if (!u || !same(await pbkdf2(code, unb64(u.rec_salt), 20000), u.rec_hash)) { await throttle(env, k1, true); return fail('That email and recovery code do not match.', 401); }
    const salt = rnd(16), iter = iterOf(env), rec = newRecovery(), rsalt = rnd(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, iter = ?, rec_hash = ?, rec_salt = ? WHERE id = ?').bind(await pbkdf2(pw, salt, iter), b64(salt), iter, await pbkdf2(rec, rsalt, 20000), b64(rsalt), u.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id)]);
    await CLEAR(env, k1);
    return reply({ token: await makeSession(env, u.id, body.device), user: { id: u.id, email: u.email }, recovery: rec });
  }

  if (path === '/auth/otp/send' && req.method === 'POST') {
    if (!env.RESEND_API_KEY) return fail('Email codes are not set up on this server.', 400);
    const email = normEmail(body.email), purpose = body.purpose === 'reset' ? 'reset' : 'register';
    if (!emailOk(email)) return fail('Enter a valid email address.', 400);
    if ((await throttle(env, 'otpip:' + ip, true)) >= 15) return fail('Too many codes requested. Try again later.', 429);
    const exists = !!(await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first());
    if (purpose === 'register' && exists) return fail('There is already an account with that email. Sign in instead.', 409);
    const prev = await env.DB.prepare('SELECT created FROM otps WHERE k = ?').bind(purpose + ':' + email).first();
    if (prev && Date.now() - prev.created < 45000) return fail('Wait a few seconds before asking for another code.', 429);
    if (purpose === 'register' || exists) {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
      await env.DB.prepare('INSERT INTO otps (k, code_hash, exp, tries, created) VALUES (?,?,?,0,?) ON CONFLICT(k) DO UPDATE SET code_hash = ?, exp = ?, tries = 0, created = ?')
        .bind(purpose + ':' + email, await sha(code + ':' + email), Date.now() + 10 * 60000, Date.now(), await sha(code + ':' + email), Date.now() + 10 * 60000, Date.now()).run();
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env.MAIL_FROM || 'Plate <onboarding@resend.dev>', to: [email], subject: 'Your Plate code: ' + code,
          html: '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:420px;margin:auto;padding:24px"><h2 style="margin:0 0 8px">Plate</h2><p style="color:#555">Your ' + (purpose === 'reset' ? 'password reset' : 'verification') + ' code is</p><p style="font-size:34px;font-weight:700;letter-spacing:.2em;margin:8px 0">' + code + '</p><p style="color:#777;font-size:13px">It works for 10 minutes. If you did not ask for it, ignore this email.</p></div>',
          text: 'Your Plate code is ' + code + '. It works for 10 minutes.' }) });
      if (!r.ok) { const t = await r.text().catch(() => ''); return fail('Could not send the email' + (r.status === 403 || r.status === 422 ? ' (the email service only allows sending to its owner until a domain is verified)' : '') + '. ' + t.slice(0, 120), 502); }
    }
    return reply({ ok: true });
  }
  if (path === '/auth/google' && req.method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) return fail('Google sign-in is not set up on this server.', 400);
    if ((await throttle(env, 'g:' + ip, true)) >= 40) return fail('Too many attempts. Try again later.', 429);
    const tr = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(body.credential || '')));
    const t = await tr.json().catch(() => ({}));
    if (!tr.ok || t.aud !== env.GOOGLE_CLIENT_ID || !(t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com') || String(t.email_verified) !== 'true' || Number(t.exp) * 1000 < Date.now()) return fail('Google could not confirm your sign-in. Try again.', 401);
    const email = normEmail(t.email), sub = String(t.sub);
    if (!emailOk(email)) return fail('Google did not give an email address.', 400);
    let link = await env.DB.prepare('SELECT user_id FROM ident WHERE sub = ?').bind(sub).first(), u = null;
    if (link) u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(link.user_id).first();
    if (!u) u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    let isNew = false;
    if (!u) {
      if (env.INVITE_CODE && !same(String(body.invite || ''), env.INVITE_CODE)) return fail('invite-needed', 403);
      const id = b64(rnd(12)), rsalt = rnd(16);
      await env.DB.prepare('INSERT INTO users (id, email, pw_hash, pw_salt, iter, rec_hash, rec_salt, created, ai_day, ai_count) VALUES (?,?,?,?,?,?,?,?,?,0)')
        .bind(id, email, '!', '', 1, await pbkdf2(newRecovery(), rsalt, 20000), b64(rsalt), Date.now(), '').run();
      u = { id, email }; isNew = true;
    }
    await env.DB.prepare('INSERT OR IGNORE INTO ident (sub, user_id) VALUES (?,?)').bind(sub, u.id).run();
    return reply({ token: await makeSession(env, u.id, body.device), user: { id: u.id, email: u.email }, isNew });
  }

  /* steps from the iPhone Shortcut: no session, just the private link's key */
  if (path === '/hook/steps') {
    await migrate(env);
    const k = url.searchParams.get('k') || body.k || '';
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(k)) return fail('Missing or bad link. Copy it again from Plate.', 400);
    const h = await env.DB.prepare('SELECT user_id, tz FROM hooks WHERE key_hash = ?').bind(await sha(k)).first();
    if (!h) return fail('This link is no longer valid. Make a new one in Plate.', 403);
    const raw = body.steps != null ? body.steps : url.searchParams.get('steps');
    const n = Math.round(parseFloat(String(raw == null ? '' : raw).replace(/[^\d.]/g, '')));
    if (!(n >= 0) || n > 150000) return fail('No step count found. In the Shortcut, the JSON field must be called steps.', 400);
    const now = Date.now(), date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : localDay(now, h.tz), key = 'steps:' + date;
    await env.DB.prepare('INSERT INTO rows (user_id, store, key, value, deleted, updated) VALUES (?,?,?,?,0,?) ON CONFLICT(user_id, store, key) DO UPDATE SET value = excluded.value, deleted = 0, updated = excluded.updated')
      .bind(h.user_id, 'kv', key, JSON.stringify({ key, value: { steps: n, src: 'shortcut', ts: now } }), now).run();
    return reply({ ok: true, steps: n, date });
  }

  const user = await authed(req, env);
  if (!user) return fail('unauthorized', 401);

  if (path.startsWith('/push/') || path.startsWith('/hook/')) {
    await migrate(env);
    if (path === '/hook/new' && req.method === 'POST') {
      const k = b64(rnd(24)), tzm = clampTz(body.tz);
      await env.DB.batch([env.DB.prepare('DELETE FROM hooks WHERE user_id = ?').bind(user.id),
        env.DB.prepare('INSERT INTO hooks (key_hash, user_id, tz, created) VALUES (?,?,?,?)').bind(await sha(k), user.id, tzm, Date.now())]);
      return reply({ url: url.origin + '/hook/steps?k=' + k });
    }
    if (path === '/push/key') return reply({ key: (await vapid(env)).pub });
    if (path === '/push/sub' && req.method === 'POST') {
      const s = body.sub || {}, ep = String(s.endpoint || ''), keys = s.keys || {};
      if (!/^https:\/\//.test(ep) || ep.length > 1000 || !keys.p256dh || !keys.auth) return fail('Bad subscription', 400);
      const prefs = JSON.stringify(body.prefs || {}).slice(0, 4000);
      await env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, prefs, tz, sent, created) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs, tz = excluded.tz')
        .bind(ep, user.id, String(keys.p256dh), String(keys.auth), prefs, clampTz(body.tz), '{}', Date.now()).run();
      await env.DB.prepare('UPDATE hooks SET tz = ? WHERE user_id = ?').bind(clampTz(body.tz), user.id).run();
      return reply({ ok: true });
    }
    if (path === '/push/unsub' && req.method === 'POST') { await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(body.endpoint || ''), user.id).run(); return reply({ ok: true }); }
    if (path === '/push/test' && req.method === 'POST') {
      const r = await env.DB.prepare('SELECT * FROM push_subs WHERE user_id = ?').bind(user.id).all(); let sent = 0;
      for (const s of r.results || []) { const st = await webPush(env, s, { title: 'Plate', body: 'Reminders are working. 👍', tag: 'test', tab: 'today' }); if (st >= 200 && st < 300) sent++; else if (st === 404 || st === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run(); }
      return reply({ ok: true, sent });
    }
    return fail('Not found', 404);
  }

  if (path === '/auth/me') return reply({ user: { id: user.id, email: user.email } });
  if (path === '/auth/logout' && req.method === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.th).run(); return reply({ ok: true }); }
  if (path === '/auth/password' && req.method === 'POST') {
    const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first(), pw = String(body.password || '');
    if (u.pw_hash !== '!' && !same(await pbkdf2(String(body.old || ''), unb64(u.pw_salt), u.iter), u.pw_hash)) return fail('Your current password is not right.', 403);
    if (pw.length < 8) return fail('Use at least 8 characters for the new password.', 400);
    const salt = rnd(16), iter = iterOf(env);
    await env.DB.batch([env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, iter = ? WHERE id = ?').bind(await pbkdf2(pw, salt, iter), b64(salt), iter, user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, user.th)]);
    return reply({ ok: true });
  }
  if (path === '/auth/delete' && req.method === 'POST') {
    const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    if (u.pw_hash === '!' ? normEmail(body.password) !== u.email : !same(await pbkdf2(String(body.password || ''), unb64(u.pw_salt), u.iter), u.pw_hash)) return fail(u.pw_hash === '!' ? 'Type your account email to confirm.' : 'That password is not right.', 403);
    await env.DB.batch(['rows', 'backups', 'sessions', 'ident'].map((t) => env.DB.prepare('DELETE FROM ' + t + ' WHERE user_id = ?').bind(user.id)).concat([env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id)]));
    return reply({ ok: true });
  }

  /* sync: rows are (store, key) -> JSON text. Newest write wins. Deleted rows stay as tombstones so other devices learn about them. */
  if (path === '/sync/push' && req.method === 'POST') {
    const ch = (Array.isArray(body.changes) ? body.changes : []).slice(0, 400), now = Date.now(), st = new Set(['meals', 'recipes', 'weights', 'kv']);
    const q = [];
    for (const c of ch) {
      if (!st.has(c.s) || typeof c.k !== 'string' || c.k.length > 200) continue;
      const v = c.d ? '' : JSON.stringify(c.v === undefined ? null : c.v);
      if (v.length > 1_500_000) continue;
      q.push(env.DB.prepare('INSERT INTO rows (user_id, store, key, value, deleted, updated) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id, store, key) DO UPDATE SET value = excluded.value, deleted = excluded.deleted, updated = excluded.updated')
        .bind(user.id, c.s, c.k, v, c.d ? 1 : 0, now));
    }
    for (let i = 0; i < q.length; i += 50) await env.DB.batch(q.slice(i, i + 50));
    return reply({ ok: true, saved: q.length, now });
  }
  if (path === '/sync/pull') {
    const since = Number(url.searchParams.get('since')) || 0;
    const r = await env.DB.prepare('SELECT store AS s, key AS k, value AS v, deleted AS d, updated AS u FROM rows WHERE user_id = ? AND updated > ? ORDER BY updated LIMIT 300').bind(user.id, since).all();
    const rows = (r.results || []).map((x) => ({ s: x.s, k: x.k, d: !!x.d, u: x.u, v: x.d ? null : JSON.parse(x.v) }));
    return reply({ rows, more: rows.length === 300, now: Date.now() });
  }

  if (path === '/backups' && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT day, MAX(created) AS created, SUM(LENGTH(data)) AS bytes FROM backups WHERE user_id = ? GROUP BY day ORDER BY day DESC LIMIT 60').bind(user.id).all();
    return reply({ backups: r.results || [] });
  }
  if (path === '/backups/now' && req.method === 'POST') { await backupUser(env, user.id, 'manual'); return reply({ ok: true }); }
  if (path === '/backups/restore' && req.method === 'POST') {
    const day = String(body.day || ''), r = await env.DB.prepare('SELECT store, data FROM backups WHERE user_id = ? AND day = ? ORDER BY store').bind(user.id, day).all();
    if (!(r.results || []).length) return fail('No backup for that day.', 404);
    await backupUser(env, user.id, 'before-restore');                   // safety copy of what you have right now
    const parts = {}; for (const x of r.results) { const s = x.store.split('#')[0]; parts[s] = (parts[s] || []).concat(JSON.parse(x.data)); }
    const now = Date.now(), q = [env.DB.prepare("UPDATE rows SET value = '', deleted = 1, updated = ? WHERE user_id = ?").bind(now, user.id)];
    for (const s of Object.keys(parts)) for (const row of parts[s])
      q.push(env.DB.prepare('INSERT INTO rows (user_id, store, key, value, deleted, updated) VALUES (?,?,?,?,0,?) ON CONFLICT(user_id, store, key) DO UPDATE SET value = excluded.value, deleted = 0, updated = excluded.updated').bind(user.id, s, row.k, row.v, now));
    for (let i = 0; i < q.length; i += 50) await env.DB.batch(q.slice(i, i + 50));
    return reply({ ok: true, restored: q.length - 1 });
  }
  return fail('Not found', 404);
}

/* one backup = every live row of one person, split into chunks that fit a D1 row. 'day' is YYYY-MM-DD (UTC, same date as Qatar at 12:00). */
async function backupUser(env, userId, day) {
  const r = await env.DB.prepare('SELECT store, key, value FROM rows WHERE user_id = ? AND deleted = 0').bind(userId).all();
  const by = {}; (r.results || []).forEach((x) => { (by[x.store] = by[x.store] || []).push({ k: x.key, v: x.value }); });
  const q = [env.DB.prepare('DELETE FROM backups WHERE user_id = ? AND day = ?').bind(userId, day)], now = Date.now();
  for (const s of Object.keys(by)) {
    let chunk = [], size = 0, n = 0;
    const flush = () => { if (chunk.length) q.push(env.DB.prepare('INSERT INTO backups (user_id, day, store, data, created) VALUES (?,?,?,?,?)').bind(userId, day, s + '#' + String(n++).padStart(3, '0'), JSON.stringify(chunk), now)); chunk = []; size = 0; };
    for (const row of by[s]) { if (size + row.v.length > 900_000) flush(); chunk.push(row); size += row.v.length + 20; }
    flush();
  }
  for (let i = 0; i < q.length; i += 50) await env.DB.batch(q.slice(i, i + 50));
}
async function runBackups(env) {
  const day = new Date().toISOString().slice(0, 10), keep = Number(env.BACKUP_DAYS) || 30;
  const us = await env.DB.prepare('SELECT id FROM users').all();
  for (const u of us.results || []) { try { await backupUser(env, u.id, day); } catch (e) { console.log('backup failed', u.id, e.message); } }
  await env.DB.prepare("DELETE FROM backups WHERE day GLOB '[0-9]*' AND day < ?").bind(new Date(Date.now() - keep * DAY).toISOString().slice(0, 10)).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()).run();
  await env.DB.prepare('DELETE FROM attempts WHERE t < ?').bind(Date.now() - 86400000).run();
}


/* ===================== reminders (Web Push) and steps ===================== */
let migrated = false;
async function migrate(env) {
  if (migrated) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, prefs TEXT NOT NULL, tz INTEGER NOT NULL DEFAULT 180, sent TEXT NOT NULL DEFAULT \'{}\', created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS push_user ON push_subs (user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hooks (key_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, tz INTEGER NOT NULL DEFAULT 180, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
  ]);
  migrated = true;
}
const clampTz = (t) => { t = Math.round(Number(t)); return isFinite(t) && Math.abs(t) <= 14 * 60 ? t : 180; };
/* the user's calendar day and clock, from their UTC offset in minutes */
const localDate = (ms, tz) => new Date(ms + tz * 60000);
const localDay = (ms, tz) => localDate(ms, tz).toISOString().slice(0, 10);

/* the server's own VAPID key pair: made once, kept in the database (nothing to set up) */
let VAPID = null;
async function vapid(env) {
  if (VAPID) return VAPID;
  await migrate(env);
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'vapid'").first();
  if (r) { const j = JSON.parse(r.v); VAPID = { pub: j.pub, key: await crypto.subtle.importKey('jwk', j.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) }; return VAPID; }
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = b64(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
  await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ jwk, pub })).run();
  VAPID = null; return vapid(env);            // re-read, in case two requests raced
}
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach((x) => { o.set(x, i); i += x.length; }); return o; };
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }
/* RFC 8291 (aes128gcm) encryption of the message for one browser */
async function encryptPush(p256dh, authSecret, payload) {
  const ua = unb64(p256dh), auth = unb64(authSecret);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hmac(await hmac(auth, shared), cat(enc.encode('WebPush: info\0'), ua, asPub, new Uint8Array([1])));
  const salt = rnd(16), prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  return cat(head, asPub, ct);
}
async function webPush(env, sub, msg) {
  const v = await vapid(env), aud = new URL(sub.endpoint).origin, now = Math.floor(Date.now() / 1000);
  const part = (o) => b64(enc.encode(JSON.stringify(o)));
  const unsigned = part({ typ: 'JWT', alg: 'ES256' }) + '.' + part({ aud, exp: now + 12 * 3600, sub: 'mailto:plate-reminders@example.com' });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, enc.encode(unsigned)));
  const body = await encryptPush(sub.p256dh, sub.auth, JSON.stringify(msg));
  try {
    const r = await fetch(sub.endpoint, { method: 'POST', body, headers: { authorization: `vapid t=${unsigned}.${b64(sig)}, k=${v.pub}`, 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '3600', urgency: 'normal' } });
    return r.status;
  } catch (e) { return 0; }
}

/* every 15 minutes: for each phone, any reminder whose time has come (in the last hour, not yet sent today) is checked against what was logged */
const hm = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : -1; };
async function kvGet(env, uid, key) { const r = await env.DB.prepare("SELECT value FROM rows WHERE user_id = ? AND store = 'kv' AND key = ? AND deleted = 0").bind(uid, key).first(); try { return r ? JSON.parse(r.value).value : null; } catch (e) { return null; } }
async function runReminders(env, nowMs) {
  const r = await env.DB.prepare('SELECT * FROM push_subs').all();
  for (const s of r.results || []) {
    try {
      let p = {}, sent = {}; try { p = JSON.parse(s.prefs || '{}'); } catch (e) {} try { sent = JSON.parse(s.sent || '{}'); } catch (e) {}
      const L = localDate(nowMs, s.tz), today = L.toISOString().slice(0, 10), mins = L.getUTCHours() * 60 + L.getUTCMinutes(), dow = L.getUTCDay();
      const startOfDay = nowMs - mins * 60000 - L.getUTCSeconds() * 1000;
      const due = (t) => { const m = hm(t); return m >= 0 && mins >= m && mins < m + 60; };
      const slots = [];
      if (p.meals && p.meals.on) (p.meals.times || []).forEach((t, i) => slots.push({ id: 'meal' + i, t, kind: 'meal', i }));
      if (p.water && p.water.on) (p.water.times || []).forEach((t, i) => slots.push({ id: 'water' + i, t, kind: 'water' }));
      if (p.weight && p.weight.on && (p.weight.days || []).includes(dow)) slots.push({ id: 'weight', t: p.weight.time, kind: 'weight' });
      if (p.workout && p.workout.on) slots.push({ id: 'workout', t: p.workout.time, kind: 'workout' });
      if (p.steps && p.steps.on) slots.push({ id: 'steps', t: p.steps.time, kind: 'steps' });
      let changed = false;
      for (const sl of slots) {
        if (!due(sl.t) || sent[sl.id] === today) continue;
        sent[sl.id] = today; changed = true;
        const msg = await reminderFor(env, s.user_id, sl, p, { today, mins, dow, startOfDay, nowMs });
        if (!msg) continue;
        const st = await webPush(env, s, msg);
        if (st === 404 || st === 410) { await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run(); changed = false; break; }
      }
      if (changed) await env.DB.prepare('UPDATE push_subs SET sent = ? WHERE endpoint = ?').bind(JSON.stringify(sent), s.endpoint).run();
    } catch (e) { console.log('reminder failed', e.message); }
  }
}
async function reminderFor(env, uid, sl, p, c) {
  if (sl.kind === 'meal') {
    const prev = sl.i > 0 ? hm((p.meals.times || [])[sl.i - 1]) : -1, since = c.startOfDay + Math.max(0, prev >= 0 ? prev : hm(sl.t) - 180) * 60000;
    const m = await env.DB.prepare("SELECT COUNT(*) AS n FROM rows WHERE user_id = ? AND store = 'meals' AND deleted = 0 AND json_extract(value, '$.date') = ? AND json_extract(value, '$.ts') >= ?").bind(uid, c.today, since).first();
    if (m && m.n > 0) return null;
    const what = sl.i === 0 ? 'breakfast' : sl.i === 1 ? 'lunch' : 'dinner';
    return { title: 'Log your ' + what, body: 'A quick photo or a few words is enough. It keeps today\'s numbers right.', tag: 'meal', tab: 'today' };
  }
  if (sl.kind === 'water') {
    const ml = Number(await kvGet(env, uid, 'water:' + c.today)) || 0, goal = 2500, want = Math.round(goal * Math.min(1, Math.max(0, (c.mins - 7 * 60) / (15 * 60))));
    if (ml >= want - 250) return null;
    return { title: 'Time for some water', body: `${ml.toLocaleString()} of ${goal.toLocaleString()} ml so far today.`, tag: 'water', tab: 'today' };
  }
  if (sl.kind === 'weight') {
    const w = await env.DB.prepare("SELECT 1 AS x FROM rows WHERE user_id = ? AND store = 'weights' AND key = ? AND deleted = 0").bind(uid, c.today).first();
    if (w) return null;
    return { title: 'Weigh in', body: 'Before breakfast, after the bathroom, is the most consistent time.', tag: 'weight', tab: 'insights' };
  }
  if (sl.kind === 'workout') {
    const split = await kvGet(env, uid, 'gymSplit'), d = split && Array.isArray(split.days) ? split.days[c.dow] : null;
    if (!d || d.t === 'rest') return null;
    const log = (await kvGet(env, uid, 'gymLog')) || [];
    if (Array.isArray(log) && log.some((l) => l && l.date === c.today && !l.other)) return null;
    return { title: 'Training day', body: 'Your workout for today is ready in the Gym tab.', tag: 'workout', tab: 'gym' };
  }
  if (sl.kind === 'steps') {
    const s = await kvGet(env, uid, 'steps:' + c.today);
    if (s && s.steps > 0) return null;
    return { title: 'Add your steps', body: 'Type today\'s steps on the Today tab.', tag: 'steps', tab: 'today' };
  }
  return null;
}
