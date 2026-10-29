/* Plate AI client. Talks only to your own proxy; no AI key ever touches the phone.
   AI.ask({ task, system, history, text, images, json, max_tokens }) -> text
   AI.askJSON(...) -> parsed object
   AI.imageToBase64(file) -> resized JPEG as base64 (small = fast, and counts less against free limits) */
(function (root) {
  'use strict';

  async function conn() {
    const url = Auth.api(), pass = Auth.token();
    if (!url || !pass) throw new Error('Sign in first.');
    return { url, pass };
  }

  /* tiny usage counter (this phone only): requests per day per task, kept for ~2 months, shown on the Insights tab */
  async function bump(task) {
    try {
      const u = (await DB.get('usage', {})) || {}, day = DB.dayKey();
      u[day] = u[day] || {}; u[day][task] = (u[day][task] || 0) + 1;
      const keep = Object.keys(u).sort().slice(-62), out = {}; keep.forEach((k) => { out[k] = u[k]; });
      await DB.set('usage', out);
    } catch (e) {}
  }

  async function send(body, signal) {
    const { url, pass } = await conn();
    let res;
    try {
      res = await fetch(url, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + pass },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('Could not reach your proxy. Check the address and your connection.');
    }
    if (res.ok) bump(body.task);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { Auth.expired(); throw new Error('Your session ended. Please sign in again.'); }
    if (!res.ok) throw new Error((data.error && data.error.message) || ('Request failed (' + res.status + ')'));
    return data;
  }

  async function ask(o) {
    let sig = o.signal;
    if (o.timeout && window.AbortSignal && AbortSignal.timeout) sig = sig ? (AbortSignal.any ? AbortSignal.any([sig, AbortSignal.timeout(o.timeout)]) : sig) : AbortSignal.timeout(o.timeout);
    let data;
    try {
      data = await send({
        task: o.task, system: o.system, history: o.history, text: o.text,
        images: o.images, json: !!o.json, max_tokens: o.max_tokens,
      }, sig);
    } catch (e) { if (o.signal && o.signal.aborted) throw Object.assign(new Error('Stopped.'), { cancelled: true }); if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('That took too long. Tap Estimate to try again.'); throw e; }
    root.AI.lastProvider = data.provider || '';
    return data.text;
  }

  /* web lookup of a branded product's real nutrition (proxy: search + read). Returns the parsed facts or null. */
  async function lookup(o) {
    const data = await send({ task: 'lookup', brand: o.brand, name: o.name, amount: o.amount, unit: o.unit, region: o.region, deep: !!o.deep });
    root.AI.lastLookup = data.lookup || null;
    return data.lookup && data.lookup.found ? data.lookup : null;
  }

  /* grounded nutrition Q&A (proxy: trusted-source search + answer). Returns { answer, coverage, sources, follow_ups } */
  async function answer(o) {
    const data = await send({ task: 'ask', question: o.question, context: o.context, region: o.region, history: o.history, prevQuestion: o.prevQuestion });
    return data.ask;
  }

  /* USDA food composition for up to 8 food names (proxy: search + AI pick). Returns [{name, fdcId, desc, per100} | {name, none:true}] */
  async function nutrients(foods) { const data = await send({ task: 'nutrients', foods }); return data.nutrients || []; }

  function parseJSON(text) {
    let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    return JSON.parse(t);
  }
  async function askJSON(o) {
    for (let n = 0; n < 2; n++) {                                    // a garbled reply: quietly ask once more before giving up
      const text = await ask(Object.assign({}, o, { json: true }));
      try { return parseJSON(text); } catch (e) { if (n) throw new Error('Something went wrong reading the reply. Try again.'); }
    }
  }

  /* downscale to <= maxSide px and re-encode as JPEG */
  function imageToBase64(file, maxSide, quality) {
    maxSide = maxSide || 1000; quality = quality || 0.8;
    return new Promise((resolve, reject) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('Could not read that photo.')); };
      img.src = u;
    });
  }

  const test = () => ask({ task: 'test', text: 'Reply with the single word: ok', max_tokens: 10 });

  root.AI = { ask, answer, nutrients, lookup, askJSON, imageToBase64, test };
})(window);
